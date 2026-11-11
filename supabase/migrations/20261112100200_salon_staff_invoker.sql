-- Part 1: staff booking functions run as the caller (security invoker), so row-level security
-- on private.bookings decides which rows they can see or change: only their own salon's.
-- Each function also filters on private.my_salon() explicitly (belt and braces on top of RLS),
-- and never takes a salon id from the caller. Another salon's ids behave like unknown ids.

-- What `authenticated` needs to run these bodies as itself. `private` stays out of the API's
-- exposed schemas (supabase/config.toml [api] schemas), so none of this is reachable over REST.
grant usage on schema private to authenticated;
grant select, insert, update on private.bookings to authenticated;
grant select on private.staff to authenticated;

create policy "staff read own salon bookings" on private.bookings
  for select to authenticated using (salon_id = (select private.my_salon()));
create policy "staff add own salon bookings" on private.bookings
  for insert to authenticated with check (salon_id = (select private.my_salon()));
create policy "staff edit own salon bookings" on private.bookings
  for update to authenticated
  using (salon_id = (select private.my_salon()))
  with check (salon_id = (select private.my_salon()));
create policy "staff read own staff row" on private.staff
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.admin_list_bookings(p_from date, p_to date)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer,
  client_name text, client_phone text, lang text, service_id text, service_name jsonb,
  stylist_id text, stylist_name text, created_at timestamptz, source text)
language plpgsql stable security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  v_salon text := private.my_salon();
begin
  if v_salon is null then
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
    where b.salon_id = v_salon
      and b.starts_at >= private.slot_start(p_from, time '00:00')
      and b.starts_at < private.slot_start(p_to + 1, time '00:00')
    order by b.starts_at;
end;
$$;

create or replace function public.admin_set_booking_status(p_id uuid, p_status text)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update private.bookings b set status = p_status where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

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
  from public.services s where s.id = p_service_id and s.salon_id = v_salon;
  if v_duration is null or not exists (
    select 1 from public.stylists st where st.id = p_stylist_id and st.salon_id = v_salon
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  v_start := private.staff_slot(p_date, p_time, v_duration);

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

-- Replaces every editable field; ends_at and price follow the service. Status and source are untouched.
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
  v_start := private.staff_slot(p_date, p_time, v_duration);

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

-- Private helpers these bodies and the policies call as `authenticated`. Everything else in
-- `private` stays revoked (my_salon/is_staff are security definer and only reveal the caller's own salon).
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_salon() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.normalize_phone(text) to authenticated;
grant execute on function private.staff_slot(date, text, integer) to authenticated;
grant execute on function private.slot_start(date, time) to authenticated;

revoke execute on function public.admin_list_bookings(date, date) from public, anon, authenticated;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_create_booking(text, text, date, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_booking(uuid, text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(date, date) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
grant execute on function public.admin_create_booking(text, text, date, text, text, text, text) to authenticated;
grant execute on function public.admin_update_booking(uuid, text, text, date, text, text, text, text) to authenticated;
