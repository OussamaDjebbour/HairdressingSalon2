begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff2@test.local');
insert into private.staff (user_id) values ('11111111-1111-1111-1111-111111111111'), ('33333333-3333-3333-3333-333333333333');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.queued() returns int language sql as $$ select count(*)::int from net.http_request_queue $$;
create function pg_temp.last_body() returns jsonb language sql as $$
  select convert_from(body, 'utf8')::jsonb from net.http_request_queue order by id desc limit 1 $$;
create function pg_temp.online_booking(p_name text, p_time text, p_source text default 'online') returns void language sql as $$
  insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('manucure', 'sara', ('2030-01-08 ' || p_time || '+01')::timestamptz, ('2030-01-08 ' || p_time || '+01')::timestamptz + interval '45 minutes',
          2000, p_name, '0661000000', 'fr', p_source) $$;

-- anon: no execute at all
set local role anon;
select throws_ok($$ select public.admin_save_push_subscription('e', 'k', 'a', 'fr') $$, '42501', null, 'anon cannot save subscriptions');
select throws_ok($$ select public.admin_delete_push_subscription('e') $$, '42501', null, 'anon cannot delete subscriptions');
select throws_ok($$ select public.admin_send_test_push() $$, '42501', null, 'anon cannot send a test push');
select throws_ok($$ select public.push_prune_subscriptions(array['e']) $$, '42501', null, 'anon cannot prune');
reset role;

-- authenticated but not staff
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_save_push_subscription('e', 'k', 'a', 'fr') $$, 'P0001', 'not_authorized', 'non-staff refused (save)');
select throws_ok($$ select public.admin_delete_push_subscription('e') $$, 'P0001', 'not_authorized', 'non-staff refused (delete)');
select throws_ok($$ select public.admin_send_test_push() $$, 'P0001', 'not_authorized', 'non-staff refused (test)');
reset role;

-- staff
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.push_prune_subscriptions(array['e']) $$, '42501', null, 'only service_role can prune');
select is(public.admin_save_push_subscription('https://push.example/e1', 'key-old', 'auth1', 'fr'), false, 'first save reports a new device');
select is(public.admin_save_push_subscription('https://push.example/e1', 'key-new', 'auth1', 'ar'), true, 'second save reports it already existed');
reset role;
select is((select count(*)::int from private.push_subscriptions where endpoint = 'https://push.example/e1'), 1, 'same endpoint upserts');
select is((select p256dh || ' ' || lang from private.push_subscriptions where endpoint = 'https://push.example/e1'), 'key-new ar', 'upsert keeps the latest keys and language');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select public.admin_save_push_subscription('https://push.example/e2', 'key2', 'auth2', 'fr');
reset role;
select is((select count(*)::int from private.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111'), 2, 'two endpoints for one user');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_save_push_subscription('https://push.example/e9', 'key', '', 'fr') $$, 'P0001', 'invalid_subscription', 'empty key refused');
reset role;

-- a re-save without a language (the app's background sync) keeps the stored one
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select public.admin_save_push_subscription('https://push.example/e1', 'key-new', 'auth1', null);
reset role;
select is((select lang from private.push_subscriptions where endpoint = 'https://push.example/e1'), 'ar', 'null language keeps the stored one');

-- delete only removes the caller's own row
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
set local role authenticated;
select public.admin_save_push_subscription('https://push.example/e3', 'key3', 'auth3', null);
reset role;
select is((select lang from private.push_subscriptions where endpoint = 'https://push.example/e3'), 'fr', 'new device without a language defaults to fr');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select public.admin_delete_push_subscription('https://push.example/e2');
select public.admin_delete_push_subscription('https://push.example/e3');
reset role;
select is((select count(*)::int from private.push_subscriptions where endpoint = 'https://push.example/e2'), 0, 'delete removes own subscription');
select is((select count(*)::int from private.push_subscriptions where endpoint = 'https://push.example/e3'), 1, 'delete leaves other users alone');

-- the test button reports 0 when nothing can be sent (no vault secrets yet)
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_send_test_push(), 0, 'test push reports 0 when notifications are not configured');
reset role;

-- no vault secrets: bookings still work, nothing is sent
select lives_ok($$ select pg_temp.online_booking('Nour', '10:00') $$, 'online insert works with no vault secrets');
select is(pg_temp.queued(), 0, 'nothing queued without vault secrets');

-- configured: one async request per online booking
select vault.create_secret('http://example.invalid/notify', 'notify_booking_url');
select vault.create_secret('s3cret', 'notify_booking_secret');
select pg_temp.online_booking('Imane', '12:00');
select is(pg_temp.queued(), 1, 'online insert queues one async request');
select is(pg_temp.last_body() ->> 'kind', 'new_booking', 'kind is new_booking');
select is(pg_temp.last_body() -> 'booking' ->> 'client_name', 'Imane', 'booking details travel with the request');
select is(jsonb_array_length(pg_temp.last_body() -> 'subscriptions'), (select count(*)::int from private.push_subscriptions),
          'every subscription is included');
select is((select headers ->> 'x-notify-secret' from net.http_request_queue order by id desc limit 1), 's3cret', 'secret header from vault');

-- removed from staff: no more notifications for their devices
delete from private.staff where user_id = '33333333-3333-3333-3333-333333333333';
select pg_temp.online_booking('Lina', '13:00');
select is(jsonb_array_length(pg_temp.last_body() -> 'subscriptions'), 1, 'removed staff no longer notified');

select pg_temp.online_booking('Rania', '14:00', 'staff');
select is(pg_temp.queued(), 2, 'staff booking does not notify');

-- test push: only the caller's own devices
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_send_test_push(), 1, 'test push reports how many devices it was sent to');
reset role;
select is(jsonb_array_length(pg_temp.last_body() -> 'subscriptions'), 1, 'test push targets only the caller');
select is(pg_temp.last_body() ->> 'kind', 'test', 'kind is test');

select * from finish();
rollback;
