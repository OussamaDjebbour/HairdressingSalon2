-- Part 2: online slots, online bookings and owner bookings follow each salon's settings
-- (opening hours, closed dates, stylists' working days and days off, active services/stylists)
-- instead of the hard-coded 09:00–18:00 / closed Sunday–Monday rules.

-- That day's opening hours in minutes since midnight, or no row when the salon is closed
-- (closed weekday, or the date falls in a closed-dates range).
create function private.day_hours(p_salon_id text, p_date date)
returns table (opens_min integer, closes_min integer)
language sql stable security definer set search_path = ''
as $$
  select (extract(hour from h.opens) * 60 + extract(minute from h.opens))::int,
         (extract(hour from h.closes) * 60 + extract(minute from h.closes))::int
  from public.salon_hours h
  where h.salon_id = p_salon_id
    and h.weekday = extract(isodow from p_date)
    and h.opens is not null
    and not exists (
      select 1 from public.salon_closed_dates c
      where c.salon_id = p_salon_id and p_date between c.starts_on and c.ends_on)
$$;

-- The stylist is active, works that weekday and has no day off covering the date.
create function private.stylist_works(p_stylist_id text, p_date date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.stylists st
      join public.stylist_workdays w on w.salon_id = st.salon_id and w.stylist_id = st.id
      where st.id = p_stylist_id and st.active and w.weekday = extract(isodow from p_date))
    and not exists (
      select 1 from public.stylist_days_off o
      where o.stylist_id = p_stylist_id and p_date between o.starts_on and o.ends_on)
$$;

-- Start of a staff booking, or outside_hours: 15-minute steps inside that day's hours.
-- Does not check past times or the booking window.
create function private.staff_slot(p_salon_id text, p_date date, p_time text, p_duration integer)
returns timestamptz language plpgsql stable set search_path = ''
as $$
declare
  v_min    integer;
  v_opens  integer;
  v_closes integer;
begin
  if p_date is null or coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, p_date) h;
  if not found or v_min < v_opens or v_min + p_duration > v_closes then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  return private.slot_start(p_date, p_time::time);
end;
$$;

create or replace function public.get_slots(p_salon_id text, p_date date, p_service_id text, p_stylist_id text default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today    date := (now() at time zone 'Africa/Algiers')::date;
  v_duration integer;
  v_opens    integer;
  v_closes   integer;
  v_stylists text[];
  v_start    timestamptz;
  v_end      timestamptz;
begin
  select s.duration into v_duration from public.services s
  where s.id = p_service_id and s.salon_id = p_salon_id and s.active;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    join public.stylists st on st.salon_id = ss.salon_id and st.id = ss.stylist_id
    where ss.salon_id = p_salon_id and ss.stylist_id = p_stylist_id and ss.service_id = p_service_id and st.active
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 13 then
    return;
  end if;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, p_date) h;
  if not found then
    return;
  end if;

  -- offering stylists (or the chosen one) who work that day
  v_stylists := array(
    select ss.stylist_id from public.stylist_services ss
    where ss.salon_id = p_salon_id
      and ss.service_id = p_service_id
      and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
      and private.stylist_works(ss.stylist_id, p_date));

  -- minutes since midnight, every 30 min from opening
  for v_min in v_opens .. v_closes - v_duration by 30 loop
    v_start := private.slot_start(p_date, make_time(v_min / 60, v_min % 60, 0));
    v_end := v_start + make_interval(mins => v_duration);
    slot := to_char(make_time(v_min / 60, v_min % 60, 0), 'HH24:MI');
    available := v_start > now() and exists (
      select 1 from unnest(v_stylists) c(stylist_id)
      where private.stylist_free(c.stylist_id, v_start, v_end)
    );
    return next;
  end loop;
end;
$$;

create or replace function public.create_booking(
  p_salon_id text, p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns table (booking_id uuid, stylist_id text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today    date := (now() at time zone 'Africa/Algiers')::date;
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_ip       inet := private.client_ip();
  v_price    integer;
  v_duration integer;
  v_min      integer;
  v_opens    integer;
  v_closes   integer;
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

  select s.price, s.duration into v_price, v_duration from public.services s
  where s.id = p_service_id and s.salon_id = p_salon_id and s.active;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    join public.stylists st on st.salon_id = ss.salon_id and st.id = ss.stylist_id
    where ss.salon_id = p_salon_id and ss.stylist_id = p_stylist_id and ss.service_id = p_service_id and st.active
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, p_date) h;
  if not found then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  v_start := private.slot_start(p_date, p_time::time);
  v_end := v_start + make_interval(mins => v_duration);
  if (v_min - v_opens) % 30 <> 0 or v_min < v_opens or v_min + v_duration > v_closes
     or v_start <= now() or p_date > v_today + 13 then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  -- abuse limits (online bookings only, within this salon)
  if (select count(*) from private.bookings b
      where b.salon_id = p_salon_id and b.created_at > now() - interval '10 minutes' and b.source = 'online') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(*) from private.bookings b
    where b.salon_id = p_salon_id and b.client_ip = v_ip and b.created_at > now() - interval '1 hour' and b.source = 'online'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from private.bookings b
    where b.salon_id = p_salon_id and b.client_phone = v_phone and b.status <> 'cancelled'
      and b.starts_at > now() and b.source = 'online'
  ) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  -- chosen stylist, or offering stylists in sort order ("no preference"), among those who work that day
  for v_candidate in
    select ss.stylist_id
    from public.stylist_services ss
    join public.stylists st on st.id = ss.stylist_id
    where ss.salon_id = p_salon_id
      and ss.service_id = p_service_id
      and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
      and private.stylist_works(ss.stylist_id, p_date)
    order by st.sort_order, st.id
  loop
    begin
      insert into private.bookings
        (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang)
      values
        (p_salon_id, p_service_id, v_candidate, v_start, v_end, v_price, v_name, v_phone, v_ip, v_lang)
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

-- Owner bookings: service and stylist must be active; stylists' working days are not enforced.
create or replace function public.admin_create_booking(
  p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns uuid
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_salon    text := private.my_salon();
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_price    integer;
  v_duration integer;
  v_start    timestamptz;
  v_id       uuid;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  select s.price, s.duration into v_price, v_duration
  from public.services s where s.id = p_service_id and s.salon_id = v_salon and s.active;
  if v_duration is null or not exists (
    select 1 from public.stylists st where st.id = p_stylist_id and st.salon_id = v_salon and st.active
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  v_start := private.staff_slot(v_salon, p_date, p_time, v_duration);

  insert into private.bookings
    (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
  values
    (v_salon, p_service_id, p_stylist_id, v_start, v_start + make_interval(mins => v_duration), v_price,
     v_name, v_phone, v_lang, 'confirmed', 'staff')
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

-- Unchanged except for the new staff_slot signature (rewritten in a later migration).
create or replace function public.admin_update_booking(
  p_id uuid, p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_salon    text := private.my_salon();
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_price    integer;
  v_duration integer;
  v_start    timestamptz;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  select s.price, s.duration into v_price, v_duration
  from public.services s where s.id = p_service_id and s.salon_id = v_salon;
  if v_duration is null or not exists (
    select 1 from public.stylists st where st.id = p_stylist_id and st.salon_id = v_salon
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  v_start := private.staff_slot(v_salon, p_date, p_time, v_duration);

  update private.bookings b
  set service_id = p_service_id, stylist_id = p_stylist_id,
      starts_at = v_start, ends_at = v_start + make_interval(mins => v_duration), price = v_price,
      client_name = v_name, client_phone = v_phone, lang = v_lang
  where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

drop function private.staff_slot(date, text, integer);
drop function private.is_open_day(date);

-- New private helpers: nobody by default; the invoker staff functions run staff_slot (and,
-- through it, day_hours) as `authenticated`. get_slots/create_booking are security definer.
revoke execute on function private.day_hours(text, date) from public, anon, authenticated;
revoke execute on function private.stylist_works(text, date) from public, anon, authenticated;
revoke execute on function private.staff_slot(text, date, text, integer) from public, anon, authenticated;
grant execute on function private.day_hours(text, date) to authenticated;
grant execute on function private.staff_slot(text, date, text, integer) to authenticated;
