begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local');
-- the product owner's account, inserted the way it was before roles existed
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- schema
select has_column('public', 'salons', 'demo', 'salons.demo exists');
select is((select demo from public.salons where id = 'elegance'), false, 'salons are not demos by default');
select is(array(select distinct role from private.staff), array['owner'], 'existing staff rows are owners');
select throws_ok($$ update private.staff set role = 'boss' $$, '23514', null, 'role is owner or demo');
select has_table('private', 'demo_settings', 'private.demo_settings exists');

-- before setup: no public login
set local role anon;
select is((select count(*)::int from public.demo_login('elegance')), 0, 'no demo login before setup');
reset role;

-- setup_demo is service_role only
set local role anon;
select throws_ok($$ select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'pw') $$,
  '42501', null, 'anon cannot call setup_demo');
reset role;
set local role authenticated;
select throws_ok($$ select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'pw') $$,
  '42501', null, 'authenticated cannot call setup_demo');
reset role;
select ok(has_function_privilege('service_role', 'public.setup_demo(text, uuid, text, text)', 'execute'), 'service_role can call setup_demo');

-- setup_demo never turns an owner into the demo account, and the login must be the account's email
set local role service_role;
select throws_ok($$ select public.setup_demo('elegance', '11111111-1111-1111-1111-111111111111', 'owner@test.local', 'pw') $$,
  'P0001', 'owner_account', 'the product owner''s account cannot become the demo account');
select throws_ok($$ select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'other@test.local', 'pw') $$,
  'P0001', 'email_mismatch', 'the login email must be the demo account''s email');
reset role;
select is((select string_agg(user_id || ' ' || role, ',' order by user_id) from private.staff), '11111111-1111-1111-1111-111111111111 owner',
  'refused setups leave the staff unchanged (owner stays owner, no demo row)');
select is((select demo from public.salons where id = 'elegance')::text || ' ' || (select count(*) from private.demo_settings),
  'false 0', 'refused setups change nothing else');

set local role service_role;
select lives_ok($$ select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Demo@Test.local ', 'pw') $$, 'setup_demo runs (email compared case-insensitively)');
reset role;

select is((select demo from public.salons where id = 'elegance'), true, 'elegance is now the demo salon');
select is((select salon_id || ' ' || role from private.staff where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 'elegance demo', 'demo account is demo staff of elegance');
select is((select role from private.staff where user_id = '11111111-1111-1111-1111-111111111111'), 'owner', 'the product owner stays owner');
select is((select login_email || ' ' || login_password from private.demo_settings where salon_id = 'elegance'), 'demo@test.local pw', 'login stored');

-- the snapshot is a provision_salon payload of the salon's current state
create function pg_temp.snap() returns jsonb language sql as $$
  select snapshot from private.demo_settings where salon_id = 'elegance' $$;
select is(pg_temp.snap() ->> 'id', 'elegance', 'snapshot id');
select is(jsonb_array_length(pg_temp.snap() -> 'services'), 6, 'snapshot has elegance''s 6 services');
select is((select count(*)::int from jsonb_array_elements(pg_temp.snap() -> 'services') x
           where x ?& array['id', 'category', 'name', 'price', 'duration', 'description', 'image', 'icon', 'sort_order', 'active']), 6,
  'every service carries explicit active, sort_order, icon and image');
select is((select count(*)::int from jsonb_array_elements(pg_temp.snap() -> 'stylists') x
           where x ?& array['id', 'name', 'role', 'specialties', 'image', 'sort_order', 'active', 'services', 'weekdays']), 3,
  'every stylist carries explicit active, sort_order, image, services and weekdays');
select is(jsonb_array_length(pg_temp.snap() -> 'hours'), 7, 'snapshot has 7 days of hours');
select is((select x from jsonb_array_elements(pg_temp.snap() -> 'hours') x where x ->> 'weekday' = '2'),
  '{"weekday": 2, "opens": "09:00", "closes": "18:00"}'::jsonb, 'open day as HH:MM');
select is((select x from jsonb_array_elements(pg_temp.snap() -> 'hours') x where x ->> 'weekday' = '1'),
  '{"weekday": 1, "opens": null, "closes": null}'::jsonb, 'closed day as nulls');
select ok(pg_temp.snap() ?& array['address', 'city', 'whatsapp', 'instagram_url', 'facebook_url'], 'snapshot has the contact info');
select is(pg_temp.snap() ->> 'whatsapp', '0561234567', 'snapshot whatsapp');

-- the snapshot restores the salon through provision_salon
select set_config('test.snap', pg_temp.snap()::text, true);
update public.services set name = '{"fr":"Changé","ar":"Changé"}', active = false, sort_order = 9 where id = 'coupe-femme';
delete from public.stylist_workdays where stylist_id = 'amina';
update public.salons set whatsapp = '0770000000' where id = 'elegance';
set local role service_role;
select lives_ok($$ select public.provision_salon(current_setting('test.snap')::jsonb) $$, 'the snapshot is a valid provision_salon payload');
reset role;
select is((select (name ->> 'fr') || ' ' || active || ' ' || sort_order from public.services where id = 'coupe-femme'), 'Coupe & Brushing true 0',
  're-applying restores a service');
select is((select count(*)::int from public.stylist_workdays where stylist_id = 'amina'), 5, 're-applying restores working days');
select is((select whatsapp from public.salons where id = 'elegance'), '0561234567', 're-applying restores salon info');

-- the public demo login
set local role anon;
select results_eq($$ select email, password from public.demo_login('elegance') $$,
  $$ values ('demo@test.local', 'pw') $$, 'anon gets the demo login');
select is((select count(*)::int from public.demo_login('rival')), 0, 'no login for a salon that is not a demo');
reset role;

-- re-running replaces login and snapshot
update public.services set price = 9999 where id = 'coupe-femme';
update auth.users set email = 'demo2@test.local' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role service_role;
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo2@test.local', 'pw2');
reset role;
select is((select login_email || ' ' || login_password from private.demo_settings where salon_id = 'elegance'), 'demo2@test.local pw2', 're-run replaces the login');
select is((select x ->> 'price' from jsonb_array_elements(pg_temp.snap() -> 'services') x where x ->> 'id' = 'coupe-femme'), '9999', 're-run replaces the snapshot');
select is((select count(*)::int from private.demo_settings), 1, 'one settings row per salon');

-- admin_me
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select results_eq($$ select salon_id, role from public.admin_me() $$, $$ values ('elegance', 'demo') $$, 'demo user: elegance / demo');
select is(private.my_role(), 'demo', 'my_role for the demo user');
reset role;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select results_eq($$ select salon_id, role from public.admin_me() $$, $$ values ('elegance', 'owner') $$, 'product owner: elegance / owner');
reset role;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select * from public.admin_me() $$, 'P0001', 'not_authorized', 'non-staff refused');
reset role;
set local role anon;
select throws_ok($$ select * from public.admin_me() $$, '42501', null, 'anon cannot call admin_me');
reset role;

-- what the demo account cannot do
select is(private.mask_phone('0555123456'), '05•• •• •• 56', 'mask_phone keeps the first and last two digits');
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'elegance', 'coupe-femme', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Client Reel', '0555123456', 'fr');

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select is((select client_phone from public.admin_list_bookings('2030-01-08', '2030-01-08') where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '05•• •• •• 56', 'demo sees the phone masked');
select lives_ok($$ select public.admin_update_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'coupe-femme', 'amina', '2030-01-08', '09:00', 'Renommée', '05•• •• •• 56', 'fr') $$,
  'demo can edit a booking passing the masked phone');
select throws_ok($$ select public.admin_save_push_subscription('https://push.example/demo', 'p', 'a', 'fr') $$, 'P0001', 'demo_disabled', 'demo cannot subscribe to push');
select is(public.admin_send_test_push(), 0, 'demo test push sends nothing');
reset role;
select results_eq($$ select client_name, client_phone from private.bookings where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  $$ values ('Renommée', '0555123456') $$, 'masked phone keeps the stored phone');

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select lives_ok($$ select public.admin_update_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'coupe-femme', 'amina', '2030-01-08', '09:00', 'Renommée', '0661223344', 'fr') $$,
  'demo can set a real new phone');
reset role;
select is((select client_phone from private.bookings where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), '0661223344', 'the new phone is stored');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select client_phone from public.admin_list_bookings('2030-01-08', '2030-01-08') where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '0661223344', 'owner sees the real phone');
select lives_ok($$ select public.admin_save_push_subscription('https://push.example/owner', 'p', 'a', 'fr') $$, 'owner can still subscribe');
reset role;

-- admin_save_salon_info: the demo account cannot change the salon's WhatsApp (the number the demo's
-- "message to the client" opens); it still edits the rest. The owner's behaviour is unchanged.
update public.salons set whatsapp = '0555001122', address = '{"fr": "", "ar": ""}' where id = 'elegance';
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select lives_ok($$ select public.admin_save_salon_info('{"fr": "Rue Démo"}', '{"fr": "Alger"}', '0699999999', 'https://instagram.com/demo', null) $$,
  'demo can save the salon info');
reset role;
select results_eq($$ select whatsapp, address ->> 'fr', city ->> 'fr', instagram_url from public.salons where id = 'elegance' $$,
  $$ values ('0555001122'::text, 'Rue Démo'::text, 'Alger'::text, 'https://instagram.com/demo'::text) $$,
  'demo: whatsapp kept, everything else saved');
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select lives_ok($$ select public.admin_save_salon_info('{"fr": "Rue Démo"}', '{"fr": "Alger"}', 'not a phone', null, null) $$,
  'demo: the passed whatsapp is ignored, even an invalid one');
select lives_ok($$ select public.admin_save_salon_info('{"fr": "Rue Démo"}', '{"fr": "Alger"}', '', null, null) $$,
  'demo: an emptied whatsapp is ignored too');
reset role;
select is((select whatsapp from public.salons where id = 'elegance'), '0555001122', 'demo never changes or clears the whatsapp');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_save_salon_info('{"fr": "Rue Réelle"}', '{"fr": "Alger"}', '0699 99 99 99', null, null) $$,
  'owner saves the salon info');
select throws_ok($$ select public.admin_save_salon_info('{"fr": "Rue Réelle"}', '{"fr": "Alger"}', 'not a phone', null, null) $$,
  'P0001', 'invalid_phone', 'owner: an invalid whatsapp is still refused');
reset role;
select is((select whatsapp from public.salons where id = 'elegance'), '0699999999', 'owner changes the whatsapp');

-- demo_preflight: what setup-demo shows before writing. Service role only.
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'elegance', 'coupe-femme', 'amina', '2030-01-09 09:00+01', '2030-01-09 10:00+01', 2500, 'Client Staff', '0555123457', 'fr', 'staff'),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'elegance', 'coupe-femme', 'amina', '2020-01-07 09:00+01', '2020-01-07 10:00+01', 2500, 'Client Passée', '0555123458', 'fr', 'online');
set local role anon;
select throws_ok($$ select * from public.demo_preflight('elegance') $$, '42501', null, 'anon cannot call demo_preflight');
reset role;
set local role authenticated;
select throws_ok($$ select * from public.demo_preflight('elegance') $$, '42501', null, 'authenticated cannot call demo_preflight');
reset role;
select ok(has_function_privilege('service_role', 'public.demo_preflight(text)', 'execute'), 'service_role can call demo_preflight');
set local role service_role;
select results_eq($$ select name, future_bookings, future_online_bookings, owner_staff, demo from public.demo_preflight('elegance') $$,
  $$ values ('Élégance'::text, 2, 1, 1, true) $$, 'preflight counts future bookings (online ones apart), owners and the demo flag');
select is((select count(*)::int from public.demo_preflight('nope')), 0, 'preflight returns no row for an unknown salon');
reset role;
update public.salons set demo = false where id = 'elegance';
update private.staff set role = 'owner' where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role service_role;
select results_eq($$ select future_bookings, future_online_bookings, owner_staff, demo from public.demo_preflight('elegance') $$,
  $$ values (2, 1, 2, false) $$, 'preflight reports a non-demo salon and every owner');
reset role;

select * from finish();
rollback;
