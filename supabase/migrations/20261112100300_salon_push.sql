-- Push notifications are scoped to the salon: a booking at one salon only ever notifies that salon's staff devices.
-- These functions stay security definer (the table is not readable by clients) with explicit salon scoping.

drop function private.post_push(text, jsonb, uuid);

create or replace function private.post_push(p_kind text, p_booking jsonb, p_salon_id text, p_user uuid default null)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_subs   jsonb;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'notify_booking_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'notify_booking_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang))
    into v_subs
  from private.push_subscriptions s
  join private.staff st on st.user_id = s.user_id -- removed staff stop receiving client details
  where s.salon_id = p_salon_id
    and st.salon_id = p_salon_id
    and (p_user is null or s.user_id = p_user);
  if v_subs is null then
    return 0;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', p_kind, 'booking', p_booking, 'subscriptions', v_subs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return jsonb_array_length(v_subs);
exception when others then
  raise warning 'post_push failed: %', sqlerrm;
  return 0;
end;
$$;

create or replace function private.notify_new_booking()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
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

create or replace function public.admin_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_existed boolean;
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
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

create or replace function public.admin_delete_push_subscription(p_endpoint text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from private.push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid() and s.salon_id = private.my_salon();
end;
$$;

create or replace function public.admin_send_test_push()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return private.post_push('test', null, private.my_salon(), auth.uid());
end;
$$;

revoke execute on function private.post_push(text, jsonb, text, uuid) from public, anon, authenticated;
