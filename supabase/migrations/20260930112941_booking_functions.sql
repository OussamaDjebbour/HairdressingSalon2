-- Local wall-clock (Algiers) date + time → absolute timestamp
create or replace function private.slot_start(p_date date, p_time time)
returns timestamptz language sql immutable set search_path = ''
as $$ select (p_date + p_time) at time zone 'Africa/Algiers' $$;

-- Open day inside the booking window (today .. today+13, closed Sun/Mon)
create or replace function private.is_open_day(p_date date)
returns boolean language sql stable set search_path = ''
as $$
  select p_date between (now() at time zone 'Africa/Algiers')::date
                    and (now() at time zone 'Africa/Algiers')::date + 13
     and extract(isodow from p_date) not in (1, 7)
$$;

create or replace function private.stylist_free(p_stylist_id text, p_start timestamptz, p_end timestamptz)
returns boolean language sql stable set search_path = ''
as $$
  select not exists (
    select 1 from private.bookings b
    where b.stylist_id = p_stylist_id
      and b.status <> 'cancelled'
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)
  )
$$;

create or replace function public.get_slots(p_date date, p_service_id text, p_stylist_id text default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_duration integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  select s.duration into v_duration from public.services s where s.id = p_service_id;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    where ss.stylist_id = p_stylist_id and ss.service_id = p_service_id
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if not private.is_open_day(p_date) then
    return;
  end if;

  -- minutes since midnight: 540 = 09:00, 1080 = 18:00
  for v_min in 540 .. 1080 - v_duration by 30 loop
    v_start := private.slot_start(p_date, make_time(v_min / 60, v_min % 60, 0));
    v_end := v_start + make_interval(mins => v_duration);
    slot := to_char(make_time(v_min / 60, v_min % 60, 0), 'HH24:MI');
    available := v_start > now() and exists (
      select 1 from public.stylist_services ss
      where ss.service_id = p_service_id
        and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
        and private.stylist_free(ss.stylist_id, v_start, v_end)
    );
    return next;
  end loop;
end;
$$;

create or replace function private.normalize_phone(p text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when v like '+213%'  then '0' || substr(v, 5)
    when v like '00213%' then '0' || substr(v, 6)
    else v
  end
  from (select regexp_replace(coalesce(p, ''), '[[:space:].()-]', '', 'g') as v) x
$$;

-- Client IP from Cloudflare's cf-connecting-ip (spike 2026-11-05: clients cannot forge it). Null when unavailable.
create or replace function private.client_ip()
returns inet language plpgsql stable set search_path = ''
as $$
declare
  v_headers json := current_setting('request.headers', true)::json;
  v text;
begin
  v := v_headers ->> 'cf-connecting-ip';
  return nullif(btrim(v), '')::inet;
exception when others then
  return null;
end;
$$;

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
  if (select count(*) from private.bookings b where b.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(*) from private.bookings b
    where b.client_ip = v_ip and b.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from private.bookings b
    where b.client_phone = v_phone and b.status <> 'cancelled' and b.starts_at > now()
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

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_slots(date, text, text) from public, anon, authenticated;
grant execute on function public.get_slots(date, text, text) to anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_booking(text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, text, date, text, text, text, text) to anon, authenticated;
