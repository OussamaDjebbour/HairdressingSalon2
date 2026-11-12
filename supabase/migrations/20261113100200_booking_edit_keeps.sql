-- Editing a booking keeps what it was booked with: price and length stay unless the service
-- changes, and the slot (start/end) stays, without hour checks, unless the service, stylist,
-- date or time change. A hidden service or stylist is fine as long as it is not newly chosen.
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
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  select * into v_old from private.bookings b where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_service_changed := p_service_id is distinct from v_old.service_id;
  v_slot_changed := v_service_changed
    or p_stylist_id is distinct from v_old.stylist_id
    or p_date is distinct from (v_old.starts_at at time zone 'Africa/Algiers')::date
    or p_time is distinct from to_char(v_old.starts_at at time zone 'Africa/Algiers', 'HH24:MI');

  if v_service_changed then
    select s.price, s.duration into v_price, v_duration
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
