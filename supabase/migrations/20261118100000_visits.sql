-- Several services in one visit. Each service stays its own row in private.bookings (agenda, columns,
-- overlap rule, editing and statuses keep working); visit_id links the rows of one visit. A single booking
-- is a visit of one. New public RPCs get_visit_slots / create_visit place 1–4 parts back to back, in the
-- order the client sends, each with its own stylist (chosen or auto-assigned). Abuse limits count visits,
-- not rows, and a visit sends one push.

-- 1. The link. The default is volatile, so every existing row gets its own id (a visit of one).
alter table private.bookings add column visit_id uuid not null default gen_random_uuid();
create index bookings_visit_idx on private.bookings (salon_id, visit_id);

-- 2. The parts of a visit, validated, in p_items order (idx is 0-based).
-- p_items = [{"service_id": "...", "stylist_id": "..." | null}, ...]. Not a non-empty array, an element
-- that isn't an object, a service_id that isn't a string, a stylist_id that is neither a string nor null,
-- a duplicate service, an inactive service or one of another salon, or a chosen stylist who doesn't offer
-- it or isn't active → unknown_service. More than 4 parts → too_many_services.
create function private.visit_items(p_salon_id text, p_items jsonb)
returns table (idx integer, service_id text, stylist_id text, price integer, duration integer)
language plpgsql stable set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item     jsonb;
  v_service  text;
  v_stylist  text;
  v_price    integer;
  v_duration integer;
  v_seen     text[] := '{}'::text[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 4 then
    raise exception 'too_many_services' using errcode = 'P0001';
  end if;

  for v_n in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_n;
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'service_id') is distinct from 'string'
       or coalesce(jsonb_typeof(v_item -> 'stylist_id'), 'null') not in ('string', 'null') then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
    v_service := v_item ->> 'service_id';
    v_stylist := v_item ->> 'stylist_id'; -- JSON null or a missing key: no preference
    if v_service = any (v_seen) then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_service;

    v_price := null;
    v_duration := null;
    select s.price, s.duration into v_price, v_duration from public.services s
    where s.id = v_service and s.salon_id = p_salon_id and s.active;
    if v_duration is null then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
    if v_stylist is not null and not exists (
      select 1 from public.stylist_services ss
      join public.stylists st on st.salon_id = ss.salon_id and st.id = ss.stylist_id
      where ss.salon_id = p_salon_id and ss.stylist_id = v_stylist and ss.service_id = v_service and st.active
    ) then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;

    idx := v_n;
    service_id := v_service;
    stylist_id := v_stylist;
    price := v_price;
    duration := v_duration;
    return next;
  end loop;
end;
$$;

-- 3. Who can do a part on a date: the chosen stylist, or the offering stylists ("no preference"), among
-- those who work that day, in staff sort order. (create_booking's candidate query.)
create function private.visit_candidates(p_salon_id text, p_service_id text, p_stylist_id text, p_date date)
returns setof text
language sql stable set search_path = ''
as $$
  select ss.stylist_id
  from public.stylist_services ss
  join public.stylists st on st.salon_id = ss.salon_id and st.id = ss.stylist_id
  where ss.salon_id = p_salon_id
    and ss.service_id = p_service_id
    and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
    and private.stylist_works(ss.stylist_id, p_date)
  order by st.sort_order, st.id
$$;

-- 4. Start times for a visit. For each start T on the 30-minute grid from opening (up to closing minus the
-- first part), part k occupies [T + the durations of parts 0..k-1, + its duration). missing lists (ascending,
-- 0-based into p_items) the parts that can't be placed: T is not in the future, the part ends past closing,
-- or no candidate stylist is free for its range. available = nothing missing. Validates the items first, so
-- a bad list errors even for a date outside the window; an out-of-window or closed day has no rows.
create function public.get_visit_slots(p_salon_id text, p_date date, p_items jsonb)
returns table (slot text, available boolean, missing integer[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today     date := (now() at time zone 'Africa/Algiers')::date;
  v_services  text[];
  v_stylists  text[];
  v_durations integer[];
  v_opens     integer;
  v_closes    integer;
  v_t         timestamptz;
  v_offset    integer;
  v_start     timestamptz;
  v_end       timestamptz;
begin
  select array_agg(i.service_id order by i.idx), array_agg(i.stylist_id order by i.idx),
         array_agg(i.duration order by i.idx)
    into v_services, v_stylists, v_durations
  from private.visit_items(p_salon_id, p_items) i;

  if p_date is null or p_date < v_today or p_date > v_today + 13 then
    return;
  end if;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, p_date) h;
  if not found then
    return;
  end if;

  for v_min in v_opens .. v_closes - v_durations[1] by 30 loop
    v_t := private.slot_start(p_date, make_time(v_min / 60, v_min % 60, 0));
    v_offset := 0;
    missing := '{}'::integer[];
    for k in 1 .. cardinality(v_services) loop
      v_start := v_t + make_interval(mins => v_offset);
      v_end := v_start + make_interval(mins => v_durations[k]);
      if v_t <= now()
         or v_min + v_offset + v_durations[k] > v_closes
         or not exists (
           select 1 from private.visit_candidates(p_salon_id, v_services[k], v_stylists[k], p_date) c(stylist_id)
           where private.stylist_free(c.stylist_id, v_start, v_end)) then
        missing := missing || (k - 1);
      end if;
      v_offset := v_offset + v_durations[k];
    end loop;
    slot := to_char(make_time(v_min / 60, v_min % 60, 0), 'HH24:MI');
    available := cardinality(missing) = 0;
    return next;
  end loop;
end;
$$;

-- 5. create_booking: latest body (20261113100100_settings_rules.sql); the three abuse limits now count
-- distinct visits, so a single booking and a visit of several parts each count once.
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

  -- abuse limits (online visits only, within this salon)
  if (select count(distinct b.visit_id) from private.bookings b
      where b.salon_id = p_salon_id and b.created_at > now() - interval '10 minutes' and b.source = 'online') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(distinct b.visit_id) from private.bookings b
    where b.salon_id = p_salon_id and b.client_ip = v_ip and b.created_at > now() - interval '1 hour' and b.source = 'online'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(distinct b.visit_id) from private.bookings b
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

-- 6. Books a visit: every part in p_items order, back to back from p_date p_time, all with one visit_id,
-- pending online bookings. All or nothing: a part with no free candidate raises slot_taken with
-- detail 'item:<idx>' (0-based into p_items) and nothing is inserted. Sends one push for the visit.
create function public.create_visit(
  p_salon_id text, p_items jsonb, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns table (booking_id uuid, service_id text, stylist_id text, starts_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today     date := (now() at time zone 'Africa/Algiers')::date;
  v_name      text := btrim(coalesce(p_client_name, ''));
  v_phone     text := private.normalize_phone(p_client_phone);
  v_lang      text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_ip        inet := private.client_ip();
  v_services  text[];
  v_stylists  text[];
  v_prices    integer[];
  v_durations integer[];
  v_total     integer;
  v_min       integer;
  v_opens     integer;
  v_closes    integer;
  v_t         timestamptz;
  v_start     timestamptz;
  v_end       timestamptz;
  v_candidate text;
  v_id        uuid;
  v_visit     uuid := gen_random_uuid();
  v_prev      text;
begin
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  select array_agg(i.service_id order by i.idx), array_agg(i.stylist_id order by i.idx),
         array_agg(i.price order by i.idx), array_agg(i.duration order by i.idx), sum(i.duration)
    into v_services, v_stylists, v_prices, v_durations, v_total
  from private.visit_items(p_salon_id, p_items) i;

  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, p_date) h;
  if not found then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  v_t := private.slot_start(p_date, p_time::time);
  if (v_min - v_opens) % 30 <> 0 or v_min < v_opens or v_min + v_total > v_closes
     or v_t <= now() or p_date > v_today + 13 then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  -- abuse limits (online visits only, within this salon), as in create_booking
  if (select count(distinct b.visit_id) from private.bookings b
      where b.salon_id = p_salon_id and b.created_at > now() - interval '10 minutes' and b.source = 'online') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(distinct b.visit_id) from private.bookings b
    where b.salon_id = p_salon_id and b.client_ip = v_ip and b.created_at > now() - interval '1 hour' and b.source = 'online'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(distinct b.visit_id) from private.bookings b
    where b.salon_id = p_salon_id and b.client_phone = v_phone and b.status <> 'cancelled'
      and b.starts_at > now() and b.source = 'online'
  ) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  -- One push for the whole visit (below), not one per row: the trigger skips rows while this is on.
  -- Transaction-local, and rolled back with the inserts if a part fails.
  v_prev := current_setting('app.visit_insert', true);
  perform set_config('app.visit_insert', 'on', true);

  v_start := v_t;
  for k in 1 .. cardinality(v_services) loop
    v_end := v_start + make_interval(mins => v_durations[k]);
    v_id := null;
    for v_candidate in
      select c.stylist_id from private.visit_candidates(p_salon_id, v_services[k], v_stylists[k], p_date) c(stylist_id)
    loop
      begin
        insert into private.bookings
          (salon_id, visit_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang)
        values
          (p_salon_id, v_visit, v_services[k], v_candidate, v_start, v_end, v_prices[k], v_name, v_phone, v_ip, v_lang)
        returning id into v_id;
        exit;
      exception when exclusion_violation then
        -- this stylist is busy (or lost a race): try the next one
      end;
    end loop;
    if v_id is null then
      raise exception 'slot_taken' using errcode = 'P0001', detail = 'item:' || (k - 1);
    end if;
    v_start := v_end;
  end loop;

  perform set_config('app.visit_insert', coalesce(v_prev, ''), true);

  -- The first part's fields, as for a single booking, plus every part in visit order.
  begin
    perform private.post_push('new_booking', (
      with parts as (
        select b.id, b.client_name, b.starts_at, s.name as service_name, st.name as stylist_name
        from private.bookings b
        join public.services s on s.salon_id = b.salon_id and s.id = b.service_id
        join public.stylists st on st.salon_id = b.salon_id and st.id = b.stylist_id
        where b.salon_id = p_salon_id and b.visit_id = v_visit)
      select jsonb_build_object(
        'id', f.id, 'client_name', f.client_name, 'starts_at', f.starts_at,
        'service_name', f.service_name, 'stylist_name', f.stylist_name,
        'salon_name', (select sl.name from public.salons sl where sl.id = p_salon_id),
        'parts', (select jsonb_agg(jsonb_build_object(
                    'service_name', p.service_name, 'stylist_name', p.stylist_name, 'starts_at', p.starts_at)
                    order by p.starts_at) from parts p))
      from parts f
      order by f.starts_at
      limit 1
    ), p_salon_id);
  exception when others then
    raise warning 'create_visit push failed: %', sqlerrm;
  end;

  return query
    select b.id, b.service_id, b.stylist_id, b.starts_at
    from private.bookings b
    where b.salon_id = p_salon_id and b.visit_id = v_visit
    order by b.starts_at;
end;
$$;

-- 7. The trigger: latest body (20261115100100_demo_reset.sql), also skipping rows create_visit inserts
-- (it sends one push for the visit itself). The API roles cannot set settings, so this can't be abused.
create or replace function private.notify_new_booking()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('app.demo_fake_bookings', true) = 'on' or current_setting('app.visit_insert', true) = 'on' then
    return new;
  end if;
  perform private.post_push('new_booking', (
    select jsonb_build_object(
      'id', new.id, 'client_name', new.client_name, 'starts_at', new.starts_at,
      'service_name', s.name, 'stylist_name', st.name,
      'salon_name', (select sl.name from public.salons sl where sl.id = new.salon_id))
    from public.services s, public.stylists st
    where s.id = new.service_id and st.id = new.stylist_id
  ), new.salon_id);
  return new;
exception when others then
  raise warning 'notify_new_booking failed: %', sqlerrm;
  return new;
end;
$$;

-- 8. Grants: the private helpers run only inside the security definer functions.
revoke execute on function private.visit_items(text, jsonb), private.visit_candidates(text, text, text, date)
  from public, anon, authenticated;
revoke execute on function public.get_visit_slots(text, date, jsonb) from public, anon, authenticated;
grant execute on function public.get_visit_slots(text, date, jsonb) to anon, authenticated;
revoke execute on function public.create_visit(text, jsonb, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_visit(text, jsonb, date, text, text, text, text) to anon, authenticated;
