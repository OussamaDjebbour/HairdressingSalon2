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
  v_min integer;
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

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_slots(date, text, text) from public, anon, authenticated;
grant execute on function public.get_slots(date, text, text) to anon, authenticated;
