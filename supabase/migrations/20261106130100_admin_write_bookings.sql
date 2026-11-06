-- SP3: the owner adds and edits bookings herself (WhatsApp, phone, walk-ins).
-- Her rules differ from online clients': any stylist can do any service, 15-minute steps,
-- past dates allowed, no 14-day window. Opening hours, closed days and no-overlap still apply.

-- Start of a staff booking, or outside_hours. Does not check past times or the booking window.
create or replace function private.staff_slot(p_date date, p_time text, p_duration integer)
returns timestamptz language plpgsql stable set search_path = ''
as $$
declare
  v_min integer;
begin
  if p_date is null or coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  if extract(isodow from p_date) in (1, 7) or v_min < 540 or v_min + p_duration > 1080 then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  return private.slot_start(p_date, p_time::time);
end;
$$;

create or replace function public.admin_create_booking(
  p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_price    integer;
  v_duration integer;
  v_start    timestamptz;
  v_id       uuid;
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  select s.price, s.duration into v_price, v_duration from public.services s where s.id = p_service_id;
  if v_duration is null or not exists (select 1 from public.stylists st where st.id = p_stylist_id) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  v_start := private.staff_slot(p_date, p_time, v_duration);

  insert into private.bookings
    (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
  values
    (p_service_id, p_stylist_id, v_start, v_start + make_interval(mins => v_duration), v_price,
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
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_price    integer;
  v_duration integer;
  v_start    timestamptz;
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  select s.price, s.duration into v_price, v_duration from public.services s where s.id = p_service_id;
  if v_duration is null or not exists (select 1 from public.stylists st where st.id = p_stylist_id) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  v_start := private.staff_slot(p_date, p_time, v_duration);

  update private.bookings b
  set service_id = p_service_id, stylist_id = p_stylist_id,
      starts_at = v_start, ends_at = v_start + make_interval(mins => v_duration), price = v_price,
      client_name = v_name, client_phone = v_phone, lang = v_lang
  where b.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_create_booking(text, text, date, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_booking(uuid, text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_booking(text, text, date, text, text, text, text) to authenticated;
grant execute on function public.admin_update_booking(uuid, text, text, date, text, text, text, text) to authenticated;
