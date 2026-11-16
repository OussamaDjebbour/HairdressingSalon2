-- Packs and promotions.
-- A pack is a service of category 'pack' with a list of included services (display only, this salon's
-- non-pack services) and one person responsible (pack_stylist_id, an active stylist of the salon). The
-- pack's save mirrors her into stylist_services as the pack's only row, so availability
-- (private.visit_candidates) works unchanged; stylist saves never touch pack rows. A pack stays a pack:
-- a service can't become one and a pack's category can't change.
-- A promotion is a promo price (below the price) on Algiers days promo_from..promo_to (inclusive). The
-- effective price (private.service_price) is the promo price when today (Algiers) is in those days, else
-- the price; every booking path records it. create_visit takes the total the page showed and refuses a
-- different one (price_changed).

-- 1. Columns and table checks.
alter table public.services
  add column includes text[] not null default '{}',
  add column pack_stylist_id text,
  add column promo_price integer,
  add column promo_from date,
  add column promo_to date,
  add constraint services_pack_stylist_fkey foreign key (salon_id, pack_stylist_id) references public.stylists (salon_id, id),
  add constraint services_promo_all_or_none check (
    (promo_price is null and promo_from is null and promo_to is null)
    or (promo_price is not null and promo_from is not null and promo_to is not null)),
  add constraint services_promo_dates check (promo_from <= promo_to),
  add constraint services_promo_price check (promo_price >= 0 and promo_price < price),
  add constraint services_pack_stylist check ((category = 'pack') = (pack_stylist_id is not null));

-- 2. Category icon: a pack's default icon is gift.
create or replace function private.category_icon(p_category text)
returns text
language sql immutable
as $$
  select case p_category when 'coiffure' then 'scissors' when 'beaute' then 'sparkles' when 'spa' then 'flower'
                         when 'pack' then 'gift' end
$$;

-- 3. The effective price of a service now (null if the salon has no such service).
create function private.service_price(p_salon_id text, p_service_id text)
returns integer
language sql stable set search_path = ''
as $$
  select case when s.promo_price is not null
                   and (now() at time zone 'Africa/Algiers')::date between s.promo_from and s.promo_to
              then s.promo_price else s.price end
  from public.services s
  where s.salon_id = p_salon_id and s.id = p_service_id
$$;

-- 4. visit_items: latest body (20261118100000_visits.sql), pricing each part at its effective price.
create or replace function private.visit_items(p_salon_id text, p_items jsonb)
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
    select private.service_price(s.salon_id, s.id), s.duration into v_price, v_duration from public.services s
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

-- 5. create_booking: latest body (20261118100000_visits.sql), recording the effective price.
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

  select private.service_price(s.salon_id, s.id), s.duration into v_price, v_duration from public.services s
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

-- 6. create_visit: latest body (20261118100000_visits.sql), recording each part's effective price (via
-- visit_items). New last parameter p_expected_total: the total the page showed; when given and not the sum
-- of the parts' effective prices, price_changed and nothing is inserted. Optional, so older pages keep
-- working. A signature change, so drop and recreate (same grants).
drop function public.create_visit(text, jsonb, date, text, text, text, text);
create function public.create_visit(
  p_salon_id text, p_items jsonb, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text, p_expected_total integer default null)
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
  if p_expected_total is not null
     and p_expected_total is distinct from (select sum(p)::integer from unnest(v_prices) p) then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

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

-- 7. admin_create_booking: latest body (20261113100100_settings_rules.sql), recording the effective price.
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
  select private.service_price(s.salon_id, s.id), s.duration into v_price, v_duration
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

-- 8. admin_update_booking: latest body (20261115100050_demo_restrictions.sql); a changed service is priced
-- at its effective price (an unchanged one keeps the stored price, as before).
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
  v_role     text := private.my_role();
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_old      private.bookings%rowtype;
  v_price    integer;
  v_duration integer;
  v_service_changed boolean;
  v_slot_changed    boolean;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  select * into v_old from private.bookings b where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- the demo account sees masked phones; sending the mask back means "unchanged"
  if v_role = 'demo' and p_client_phone is not distinct from private.mask_phone(v_old.client_phone) then
    v_phone := v_old.client_phone;
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  v_service_changed := p_service_id is distinct from v_old.service_id;
  v_slot_changed := v_service_changed
    or p_stylist_id is distinct from v_old.stylist_id
    or p_date is distinct from (v_old.starts_at at time zone 'Africa/Algiers')::date
    or p_time is distinct from to_char(v_old.starts_at at time zone 'Africa/Algiers', 'HH24:MI');

  if v_service_changed then
    select private.service_price(s.salon_id, s.id), s.duration into v_price, v_duration
    from public.services s where s.id = p_service_id and s.salon_id = v_salon and s.active;
    if v_duration is null then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
  else
    v_price := v_old.price;
    v_duration := (extract(epoch from v_old.ends_at - v_old.starts_at) / 60)::int;
  end if;

  if p_stylist_id is distinct from v_old.stylist_id and not exists (
    select 1 from public.stylists st
    where st.id = p_stylist_id and st.salon_id = v_salon and st.active
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if v_slot_changed then
    v_start := private.staff_slot(v_salon, p_date, p_time, v_duration);
  else
    v_start := v_old.starts_at;
  end if;
  v_end := v_start + make_interval(mins => v_duration);

  update private.bookings b
  set service_id = p_service_id, stylist_id = p_stylist_id,
      starts_at = v_start, ends_at = v_end, price = v_price,
      client_name = v_name, client_phone = v_phone, lang = v_lang
  where b.id = p_id and b.salon_id = v_salon;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

-- 9. admin_save_service: latest body (20261117100000_spa_category.sql) plus packs and promotions. New
-- trailing parameters (all optional, so a 7-argument call still works and saves no promotion):
--   p_includes, p_pack_stylist_id: a pack's included services (this salon's non-pack services; duplicates
--   dropped, order kept) and its person responsible (an active stylist of this salon), else invalid_pack.
--   Ignored for a regular service (stored as {} / null). A new service may be a pack; an existing one
--   can't change to or from pack (invalid_pack). The pack's save makes her its only stylist_services row.
--   p_promo_price, p_promo_from, p_promo_to: all three or none, 0 <= promo < price, from <= to, else
--   invalid_promo. Each save replaces the promotion (none given = no promotion).
-- A signature change, so drop and recreate (same grants).
drop function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer);
create function public.admin_save_service(
  p_id text, p_name jsonb, p_description jsonb, p_category text,
  p_price integer, p_duration integer, p_sort_order integer,
  p_includes text[] default '{}', p_pack_stylist_id text default null,
  p_promo_price integer default null, p_promo_from date default null, p_promo_to date default null)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_id    text := p_id;
  v_name_fr text := btrim(coalesce(p_name ->> 'fr', ''));
  v_desc_fr text := btrim(coalesce(p_description ->> 'fr', ''));
  -- An empty Arabic text falls back to the French one.
  v_name  jsonb := jsonb_build_object('fr', v_name_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_name ->> 'ar', '')), ''), v_name_fr));
  v_desc  jsonb := case when p_description is not null then jsonb_build_object('fr', v_desc_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_description ->> 'ar', '')), ''), v_desc_fr)) end;
  v_pack     boolean := p_category = 'pack';
  v_old_cat  text;
  v_includes text[] := '{}'::text[];
  v_stylist  text;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name_fr) not between 2 and 80
     or p_category is null or p_category not in ('coiffure', 'beaute', 'spa', 'pack') then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_price is null or p_price not between 0 and 1000000 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  if p_duration is null or p_duration not between 15 and 600 or p_duration % 15 <> 0 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if num_nonnulls(p_promo_price, p_promo_from, p_promo_to) not in (0, 3)
     or p_promo_price < 0 or p_promo_price >= p_price or p_promo_from > p_promo_to then
    raise exception 'invalid_promo' using errcode = 'P0001';
  end if;

  if p_id is not null then
    select s.category into v_old_cat from public.services s where s.id = p_id and s.salon_id = v_salon;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if (v_old_cat = 'pack') <> v_pack then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
  end if;

  if v_pack then
    if not exists (
      select 1 from public.stylists st where st.id = p_pack_stylist_id and st.salon_id = v_salon and st.active
    ) then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_includes, '{}'::text[])) sid
      where sid is null or not exists (
        select 1 from public.services s where s.id = sid and s.salon_id = v_salon and s.category <> 'pack')
    ) then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
    v_includes := array(select u.sid from unnest(coalesce(p_includes, '{}'::text[])) with ordinality u(sid, n)
                        group by u.sid order by min(u.n));
    v_stylist := p_pack_stylist_id;
  end if;

  if p_id is null then
    v_id := gen_random_uuid()::text;
    insert into public.services (id, salon_id, category, name, description, price, duration, image, icon, sort_order,
                                 includes, pack_stylist_id, promo_price, promo_from, promo_to)
    values (v_id, v_salon, p_category,
            v_name, coalesce(v_desc, '{"fr":"","ar":""}'::jsonb), p_price, p_duration, '',
            private.category_icon(p_category),
            coalesce(p_sort_order, 0),
            v_includes, v_stylist, p_promo_price, p_promo_from, p_promo_to);
  else
    update public.services s
    set name = v_name,
        description = coalesce(v_desc, s.description),
        category = p_category, price = p_price, duration = p_duration,
        -- A category change moves the icon along only while it is still the old category's default.
        icon = case when s.category <> p_category and s.icon = private.category_icon(s.category)
                    then private.category_icon(p_category) else s.icon end,
        sort_order = coalesce(p_sort_order, s.sort_order),
        includes = v_includes, pack_stylist_id = v_stylist,
        promo_price = p_promo_price, promo_from = p_promo_from, promo_to = p_promo_to
    where s.id = p_id and s.salon_id = v_salon;
  end if;

  -- A pack's person responsible is its only stylist_services row (who can be booked for it).
  if v_pack then
    delete from public.stylist_services ss where ss.salon_id = v_salon and ss.service_id = v_id;
    insert into public.stylist_services (salon_id, stylist_id, service_id) values (v_salon, v_stylist, v_id);
  end if;
  return v_id;
end;
$$;

-- 10. admin_save_stylist: latest body (20261113100300_settings_catalog_rpcs.sql); a stylist's service list
-- never includes packs: pack ids sent are ignored, and her pack rows (written by the pack's save) are kept.
create or replace function public.admin_save_stylist(
  p_id text, p_name text, p_role jsonb, p_service_ids text[], p_weekdays smallint[])
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_id    text := p_id;
  v_name  text := btrim(coalesce(p_name, ''));
  v_role_fr text := btrim(coalesce(p_role ->> 'fr', ''));
  -- An empty Arabic role falls back to the French one.
  v_role  jsonb := jsonb_build_object('fr', v_role_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_role ->> 'ar', '')), ''), v_role_fr));
  v_services text[] := coalesce(p_service_ids, '{}'::text[]);
  v_days  smallint[] := coalesce(p_weekdays, '{}'::smallint[]);
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_days) d where d is null or d not between 1 and 7) then
    raise exception 'invalid_weekday' using errcode = 'P0001';
  end if;
  if p_id is not null and not exists (select 1 from public.stylists st where st.id = p_id and st.salon_id = v_salon) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_services) sid
    where sid is null or not exists (select 1 from public.services s where s.id = sid and s.salon_id = v_salon)
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if p_id is null then
    v_id := gen_random_uuid()::text;
    insert into public.stylists (id, salon_id, name, role, specialties, image)
    values (v_id, v_salon, v_name, v_role, '[]', '');
  else
    update public.stylists st set name = v_name, role = v_role where st.id = p_id and st.salon_id = v_salon;
  end if;

  delete from public.stylist_services ss
  where ss.stylist_id = v_id and ss.salon_id = v_salon
    and not exists (select 1 from public.services s
                    where s.salon_id = ss.salon_id and s.id = ss.service_id and s.category = 'pack');
  insert into public.stylist_services (salon_id, stylist_id, service_id)
  select distinct v_salon, v_id, sid from unnest(v_services) sid
  where not exists (select 1 from public.services s where s.salon_id = v_salon and s.id = sid and s.category = 'pack');

  delete from public.stylist_workdays w where w.stylist_id = v_id and w.salon_id = v_salon;
  insert into public.stylist_workdays (salon_id, stylist_id, weekday)
  select distinct v_salon, v_id, d from unnest(v_days) d;
  return v_id;
end;
$$;

-- 11. Grants. service_price runs inside the definer functions and inside admin_create_booking /
-- admin_update_booking, which run as the signed-in staff member (security invoker); prices are public.
revoke execute on function private.service_price(text, text) from public, anon, authenticated;
grant execute on function private.service_price(text, text) to authenticated;
revoke execute on function public.create_visit(text, jsonb, date, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_visit(text, jsonb, date, text, text, text, text, integer) to anon, authenticated;
revoke execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer, text[], text, integer, date, date)
  from public, anon, authenticated;
grant execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer, text[], text, integer, date, date)
  to authenticated;
