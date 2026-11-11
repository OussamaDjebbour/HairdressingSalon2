-- SP3 phase 2: phone notifications for new online bookings.
-- Flow: online booking inserted → trigger → private.post_push → async pg_net POST → Edge Function notify-booking
-- → Web Push to the owner's devices. pg_net is asynchronous and every step swallows its own errors,
-- so a broken or unconfigured notification can never fail or slow down a client's booking.

create extension if not exists pg_net with schema extensions;

create table private.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  lang       text not null check (lang in ('fr', 'ar')),
  created_at timestamptz not null default now()
);
revoke all on private.push_subscriptions from public, anon, authenticated;

-- Sends one notification request (fire-and-forget). Needs two Vault secrets, set once per environment:
--   notify_booking_url    → https://<ref>.supabase.co/functions/v1/notify-booking
--   notify_booking_secret → the Edge Function's NOTIFY_SECRET
-- Missing secrets or no subscriptions → does nothing. Returns how many devices the request targets (0 if none).
create or replace function private.post_push(p_kind text, p_booking jsonb, p_user uuid default null)
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
  where p_user is null or s.user_id = p_user;
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
      'service_name', s.name, 'stylist_name', st.name)
    from public.services s, public.stylists st
    where s.id = new.service_id and st.id = new.stylist_id
  ));
  return new;
exception when others then
  raise warning 'notify_new_booking failed: %', sqlerrm;
  return new;
end;
$$;

create trigger bookings_notify_online
  after insert on private.bookings
  for each row when (new.source = 'online')
  execute function private.notify_new_booking();

-- Saves this device's subscription. Returns whether it was already known: the app's background sync
-- re-saves on every admin open, and a missing row means the push service declared it dead, so the app
-- re-subscribes. A null p_lang keeps the stored language (new rows default to 'fr').
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
  insert into private.push_subscriptions (endpoint, user_id, p256dh, auth, lang)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, case when p_lang in ('fr', 'ar') then p_lang else 'fr' end)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
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
  delete from private.push_subscriptions s where s.endpoint = p_endpoint and s.user_id = auth.uid();
end;
$$;

-- Returns how many of the caller's devices the test went to (0: device unknown or notifications not configured).
create or replace function public.admin_send_test_push()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return private.post_push('test', null, auth.uid());
end;
$$;

-- Called by the Edge Function (service_role) for endpoints the push service reports as gone (404/410).
create or replace function public.push_prune_subscriptions(p_endpoints text[])
returns void language sql volatile security definer set search_path = ''
as $$ delete from private.push_subscriptions s where s.endpoint = any (p_endpoints) $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_save_push_subscription(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_delete_push_subscription(text) from public, anon, authenticated;
revoke execute on function public.admin_send_test_push() from public, anon, authenticated;
revoke execute on function public.push_prune_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.admin_save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.admin_delete_push_subscription(text) to authenticated;
grant execute on function public.admin_send_test_push() to authenticated;
grant execute on function public.push_prune_subscriptions(text[]) to service_role;
