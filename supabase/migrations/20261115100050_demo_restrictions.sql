-- The shared demo account (role 'demo') sees client phones masked, can still edit bookings
-- (sending the mask back keeps the stored phone) and can never subscribe to push.

-- '0555123456' -> '05•• •• •• 56': first two and last two digits, bullets between.
create function private.mask_phone(p text)
returns text language sql immutable set search_path = ''
as $$
  select case when p ~ '^[0-9]{10}$'
    then substr(p, 1, 2) || '•• •• •• ' || substr(p, 9, 2)
    else p end
$$;
revoke execute on function private.mask_phone(text) from public, anon, authenticated;
grant execute on function private.mask_phone(text) to authenticated;

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
  v_mask  boolean := private.my_role() = 'demo';
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.price,
           b.client_name,
           case when v_mask then private.mask_phone(b.client_phone) else b.client_phone end,
           b.lang, b.service_id, s.name,
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

create or replace function public.admin_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_existed boolean;
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if private.my_role() = 'demo' then
    raise exception 'demo_disabled' using errcode = 'P0001';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription' using errcode = 'P0001';
  end if;
  select exists (select 1 from private.push_subscriptions s where s.endpoint = p_endpoint) into v_existed;
  insert into private.push_subscriptions (endpoint, user_id, salon_id, p256dh, auth, lang)
  values (p_endpoint, auth.uid(), private.my_salon(), p_p256dh, p_auth, case when p_lang in ('fr', 'ar') then p_lang else 'fr' end)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, salon_id = excluded.salon_id, p256dh = excluded.p256dh, auth = excluded.auth,
        lang = case when p_lang in ('fr', 'ar') then p_lang else private.push_subscriptions.lang end;
  return v_existed;
end;
$$;

create or replace function public.admin_send_test_push()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if private.my_role() = 'demo' then
    return 0;
  end if;
  return private.post_push('test', null, private.my_salon(), auth.uid());
end;
$$;

-- The demo account cannot change the salon's WhatsApp: in the demo, "message to the client" opens
-- WhatsApp to that number (the product owner's). The passed value is ignored (the current one is
-- kept, even if the passed one is empty or invalid); everything else is saved as for the owner.
create or replace function public.admin_save_salon_info(
  p_address jsonb, p_city jsonb, p_whatsapp text, p_instagram_url text, p_facebook_url text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon    text := private.my_salon();
  v_whatsapp text := p_whatsapp;
  v_info     record;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if private.my_role() = 'demo' then
    select s.whatsapp into v_whatsapp from public.salons s where s.id = v_salon;
  end if;
  select * into v_info from private.clean_salon_info(p_address, p_city, v_whatsapp, p_instagram_url, p_facebook_url);
  update public.salons s
  set address = v_info.address, city = v_info.city, whatsapp = v_info.whatsapp,
      instagram_url = v_info.instagram_url, facebook_url = v_info.facebook_url
  where s.id = v_salon;
end;
$$;
