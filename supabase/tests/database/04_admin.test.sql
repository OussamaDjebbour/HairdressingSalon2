begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina',
        '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Yasmine', '0555123456', 'fr');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- anon: no execute at all
set local role anon;
select throws_ok($$ select * from public.admin_list_bookings('2030-01-08', '2030-01-08') $$, '42501', null, 'anon cannot call admin_list_bookings');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$, '42501', null, 'anon cannot call admin_set_booking_status');
reset role;

-- authenticated but not staff
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_bookings('2030-01-08', '2030-01-08') $$, 'P0001', 'not_authorized', 'non-staff user refused (list)');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$, 'P0001', 'not_authorized', 'non-staff user refused (status)');
reset role;

-- staff
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select client_name from public.admin_list_bookings('2030-01-08', '2030-01-08')), 'Yasmine', 'staff sees bookings with client data');
select is((select stylist_name from public.admin_list_bookings('2030-01-08', '2030-01-08')), 'Amina', 'joined stylist name');
select throws_ok($$ select * from public.admin_list_bookings('2030-01-01', '2030-03-01') $$, 'P0001', 'invalid_range', 'range capped at 31 days');
select lives_ok($$ select * from public.admin_list_bookings('2030-01-01', '2030-01-31') $$, '31-day range allowed');
select lives_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$, 'staff can cancel');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'pending') $$, 'P0001', 'invalid_status', 'only confirmed/cancelled');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-00000000ffff', 'confirmed') $$, 'P0001', 'not_found', 'unknown id');
reset role;

-- re-confirming a cancelled booking whose slot was taken meanwhile
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('elegance', 'coupe-femme', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Other', '0666123456', 'fr');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'confirmed') $$, 'P0001', 'slot_taken', 're-confirm conflict');
reset role;

select * from finish();
rollback;
