-- Owner RPCs for opening hours, closed dates, salon contact info and the list of future
-- bookings a settings change has affected. Security definer (the tables have no write
-- policies); every read/write is filtered by private.my_salon().

create function public.admin_set_hours(p_hours jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_item  jsonb;
  v_days  integer[] := array[]::integer[];
  v_wd    integer;
  v_opens text;
  v_closes text;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'invalid_hours' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'weekday', '') !~ '^[1-7]$' then
      raise exception 'invalid_hours' using errcode = 'P0001';
    end if;
    v_wd := (v_item ->> 'weekday')::int;
    v_opens := nullif(v_item ->> 'opens', '');
    v_closes := nullif(v_item ->> 'closes', '');
    if v_wd = any (v_days) or (v_opens is null) <> (v_closes is null) then
      raise exception 'invalid_hours' using errcode = 'P0001';
    end if;
    if v_opens is not null then
      if v_opens !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' or v_closes !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
         or v_opens::time >= v_closes::time then
        raise exception 'invalid_hours' using errcode = 'P0001';
      end if;
    end if;
    v_days := v_days || v_wd;
  end loop;

  delete from public.salon_hours h where h.salon_id = v_salon;
  insert into public.salon_hours (salon_id, weekday, opens, closes)
  select v_salon, (e ->> 'weekday')::smallint, nullif(e ->> 'opens', '')::time, nullif(e ->> 'closes', '')::time
  from jsonb_array_elements(p_hours) e;
end;
$$;

create function public.admin_add_closed_dates(p_from date, p_to date, p_label text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_id    uuid;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366
     or length(v_label) > 60 then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  insert into public.salon_closed_dates (salon_id, starts_on, ends_on, label)
  values (v_salon, p_from, p_to, v_label) returning id into v_id;
  return v_id;
end;
$$;

create function public.admin_delete_closed_dates(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.salon_closed_dates d where d.id = p_id and d.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.admin_save_salon_info(
  p_address jsonb, p_city jsonb, p_whatsapp text, p_instagram_url text, p_facebook_url text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_wa    text := nullif(private.normalize_phone(p_whatsapp), '');
  v_ig    text := nullif(btrim(coalesce(p_instagram_url, '')), '');
  v_fb    text := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_addr  jsonb;
  v_city  jsonb;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if v_wa is not null and v_wa !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if (v_ig is not null and v_ig !~ '^https://') or (v_fb is not null and v_fb !~ '^https://') then
    raise exception 'invalid_url' using errcode = 'P0001';
  end if;
  v_addr := jsonb_build_object('fr', btrim(coalesce(p_address ->> 'fr', '')), 'ar', btrim(coalesce(p_address ->> 'ar', '')));
  v_city := jsonb_build_object('fr', btrim(coalesce(p_city ->> 'fr', '')), 'ar', btrim(coalesce(p_city ->> 'ar', '')));
  if length(v_addr ->> 'fr') > 200 or length(v_addr ->> 'ar') > 200
     or length(v_city ->> 'fr') > 200 or length(v_city ->> 'ar') > 200 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  update public.salons s
  set address = v_addr, city = v_city, whatsapp = v_wa, instagram_url = v_ig, facebook_url = v_fb
  where s.id = v_salon;
end;
$$;

create function public.admin_affected_bookings()
returns table (id uuid, starts_at timestamptz, client_name text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return query
  select x.id, x.starts_at, x.client_name, x.reason
  from (
    select b.id, b.starts_at, b.client_name,
      case
        when h.opens_min is null then 'closed'
        when l.start_min < h.opens_min or l.start_min + extract(epoch from b.ends_at - b.starts_at)::int / 60 > h.closes_min then 'outside_hours'
        when not s.active then 'service_hidden'
        when not st.active then 'stylist_hidden'
        when not private.stylist_works(b.stylist_id, l.d) then 'stylist_off'
      end as reason
    from private.bookings b
    join public.services s on s.id = b.service_id and s.salon_id = b.salon_id
    join public.stylists st on st.id = b.stylist_id and st.salon_id = b.salon_id
    cross join lateral (
      select (b.starts_at at time zone 'Africa/Algiers')::date as d,
             (extract(hour from b.starts_at at time zone 'Africa/Algiers') * 60
              + extract(minute from b.starts_at at time zone 'Africa/Algiers'))::int as start_min) l
    left join lateral private.day_hours(b.salon_id, l.d) h on true
    where b.salon_id = v_salon and b.status <> 'cancelled' and b.starts_at > now()
  ) x
  where x.reason is not null
  order by x.starts_at;
end;
$$;

revoke execute on function public.admin_set_hours(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_add_closed_dates(date, date, text) from public, anon, authenticated;
revoke execute on function public.admin_delete_closed_dates(uuid) from public, anon, authenticated;
revoke execute on function public.admin_save_salon_info(jsonb, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_affected_bookings() from public, anon, authenticated;
grant execute on function public.admin_set_hours(jsonb) to authenticated;
grant execute on function public.admin_add_closed_dates(date, date, text) to authenticated;
grant execute on function public.admin_delete_closed_dates(uuid) to authenticated;
grant execute on function public.admin_save_salon_info(jsonb, jsonb, text, text, text) to authenticated;
grant execute on function public.admin_affected_bookings() to authenticated;
