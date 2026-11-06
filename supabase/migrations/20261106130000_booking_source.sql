-- SP3: where a booking came from. 'online' = the public booking form, 'staff' = added by the owner in /admin.
alter table private.bookings
  add column source text not null default 'online' check (source in ('online', 'staff'));

-- Online abuse limits only count online bookings: the owner entering a regular's future visits
-- or copying the paper agenda in must not block clients from booking online.
create or replace function public.create_booking(
  p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns table (booking_id uuid, stylist_id text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_ip       inet := private.client_ip();
  v_price    integer;
  v_duration integer;
  v_min      integer;
  v_start    timestamptz;
  v_end      timestamptz;
  v_candidate text;
  v_id       uuid;
begin
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  select s.price, s.duration into v_price, v_duration from public.services s where s.id = p_service_id;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    where ss.stylist_id = p_stylist_id and ss.service_id = p_service_id
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|30)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  v_start := private.slot_start(p_date, p_time::time);
  v_end := v_start + make_interval(mins => v_duration);
  if not private.is_open_day(p_date) or v_min < 540 or v_min + v_duration > 1080 or v_start <= now() then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  -- abuse limits
  if (select count(*) from private.bookings b where b.created_at > now() - interval '10 minutes' and b.source = 'online') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(*) from private.bookings b
    where b.client_ip = v_ip and b.created_at > now() - interval '1 hour' and b.source = 'online'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from private.bookings b
    where b.client_phone = v_phone and b.status <> 'cancelled' and b.starts_at > now() and b.source = 'online'
  ) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  -- chosen stylist, or offering stylists in sort order ("no preference")
  for v_candidate in
    select ss.stylist_id
    from public.stylist_services ss
    join public.stylists st on st.id = ss.stylist_id
    where ss.service_id = p_service_id
      and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
    order by st.sort_order, st.id
  loop
    begin
      insert into private.bookings
        (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang)
      values
        (p_service_id, v_candidate, v_start, v_end, v_price, v_name, v_phone, v_ip, v_lang)
      returning id into v_id;
      booking_id := v_id;
      stylist_id := v_candidate;
      return next;
      return;
    exception when exclusion_violation then
      -- this stylist is busy (or lost a race): try the next one
    end;
  end loop;

  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

-- admin_list_bookings also returns source (return type change: drop + recreate).
drop function public.admin_list_bookings(date, date);
create or replace function public.admin_list_bookings(p_from date, p_to date)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer,
  client_name text, client_phone text, lang text, service_id text, service_name jsonb,
  stylist_id text, stylist_name text, created_at timestamptz, source text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.price,
           b.client_name, b.client_phone, b.lang, b.service_id, s.name,
           b.stylist_id, st.name, b.created_at, b.source
    from private.bookings b
    join public.services s on s.id = b.service_id
    join public.stylists st on st.id = b.stylist_id
    where b.starts_at >= private.slot_start(p_from, time '00:00')
      and b.starts_at < private.slot_start(p_to + 1, time '00:00')
    order by b.starts_at;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_booking(text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, text, date, text, text, text, text) to anon, authenticated;
revoke execute on function public.admin_list_bookings(date, date) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(date, date) to authenticated;
