begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- 2030-01-08 is a Tuesday, 2030-01-06 a Sunday, 2020-01-07 a past Tuesday.

-- anon: no execute at all
set local role anon;
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-08', '09:00', 'Rania', '0555123456', 'fr') $$,
                 '42501', null, 'anon cannot call admin_create_booking');
select throws_ok($$ select public.admin_update_booking(gen_random_uuid(), 'coupe-femme', 'amina', '2030-01-08', '09:00', 'Rania', '0555123456', 'fr') $$,
                 '42501', null, 'anon cannot call admin_update_booking');
reset role;

-- authenticated but not staff
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-08', '09:00', 'Rania', '0555123456', 'fr') $$,
                 'P0001', 'not_authorized', 'non-staff refused (create)');
select throws_ok($$ select public.admin_update_booking(gen_random_uuid(), 'coupe-femme', 'amina', '2030-01-08', '09:00', 'Rania', '0555123456', 'fr') $$,
                 'P0001', 'not_authorized', 'non-staff refused (update)');
reset role;

-- staff create: Amina does not offer soin-visage in the seed, so this also proves any stylist can do any service
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select public.admin_create_booking('soin-visage', 'amina', '2030-01-08', '10:15', '  Rania ', '0555 12 34 56', 'ar');
reset role;
select is((select status from private.bookings where client_name = 'Rania'), 'confirmed', 'owner bookings start confirmed');
select is((select source from private.bookings where client_name = 'Rania'), 'staff', 'owner bookings have source staff');
select is((select client_phone from private.bookings where client_name = 'Rania'), '0555123456', 'staff phone normalised');
select is((select count(*)::int from private.bookings where client_name = 'Rania'), 1, 'name trimmed');
select is((select lang from private.bookings where client_name = 'Rania'), 'ar', 'client language stored');
select is((select price from private.bookings where client_name = 'Rania'), 3500, 'price from services');
select is((select extract(epoch from ends_at - starts_at)::int / 60 from private.bookings where client_name = 'Rania'), 75, 'duration from services');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_create_booking('coupe-femme', 'leila', '2020-01-07', '09:00', 'Past Client', '0555123457', 'fr') $$,
                'past date allowed for the owner');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-06', '10:00', 'Amel', '0555123456', 'fr') $$,
                 'P0001', 'outside_hours', 'closed day');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-08', '10:10', 'Amel', '0555123456', 'fr') $$,
                 'P0001', 'outside_hours', 'off the 15-min grid');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-08', '17:30', 'Amel', '0555123456', 'fr') $$,
                 'P0001', 'outside_hours', 'longer service past closing');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'nobody', '2030-01-08', '12:00', 'Amel', '0555123456', 'fr') $$,
                 'P0001', 'unknown_service', 'unknown stylist');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-08', '10:30', 'Amel', '0555123456', 'fr') $$,
                 'P0001', 'slot_taken', 'overlap with the same stylist');

-- edit name only keeps slot (must not conflict with itself) and status
select lives_ok(format($$ select public.admin_update_booking(%L, 'soin-visage', 'amina', '2030-01-08', '10:15', 'Rania B', '0555123456', 'ar') $$,
                       (select id from public.admin_list_bookings('2030-01-08', '2030-01-08') where client_name = 'Rania')),
                'edit name only keeps slot');
reset role;
select is((select status from private.bookings where client_name = 'Rania B'), 'confirmed', 'edit keeps confirmed status');

-- edit keeps pending: an online booking moved by the owner stays waiting for her confirmation
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'elegance', 'manucure', 'sara',
        '2030-01-08 14:00+01', '2030-01-08 15:00+01', 1500, 'Nour', '0661000000', 'fr');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select public.admin_update_booking('aaaaaaaa-0000-0000-0000-000000000001', 'manucure', 'sara', '2030-01-08', '15:00', 'Nour', '0661000000', 'fr');
reset role;
select is((select status from private.bookings where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'pending', 'edit keeps pending status');

-- move onto a taken time: refused, row unchanged
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_update_booking('aaaaaaaa-0000-0000-0000-000000000001', 'manucure', 'amina', '2030-01-08', '10:30', 'Nour', '0661000000', 'fr') $$,
                 'P0001', 'slot_taken', 'move onto a taken time');
reset role;
select is((select stylist_id || ' ' || starts_at::text from private.bookings where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          'sara ' || '2030-01-08 15:00+01'::timestamptz::text, 'row unchanged after refused move');

-- changing to a longer service: past closing, or into the next booking, is refused and nothing changes
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_update_booking('aaaaaaaa-0000-0000-0000-000000000001', 'coloration', 'sara', '2030-01-08', '17:00', 'Nour', '0661000000', 'fr') $$,
                 'P0001', 'outside_hours', 'longer service past closing (update)');
select throws_ok($$ select public.admin_update_booking((select id from public.admin_list_bookings('2030-01-08', '2030-01-08') where client_name = 'Rania B'), 'coloration', 'sara', '2030-01-08', '14:00', 'Rania B', '0555123456', 'ar') $$,
                 'P0001', 'slot_taken', 'longer service into the next booking (update)'); -- Nour is with Sara at 15:00
reset role;
select is((select service_id || ' ' || starts_at::text from private.bookings where client_name = 'Rania B'),
          'soin-visage ' || '2030-01-08 10:15+01'::timestamptz::text, 'row unchanged after refused service change');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_update_booking('aaaaaaaa-0000-0000-0000-00000000ffff', 'manucure', 'sara', '2030-01-08', '16:00', 'Nour', '0661000000', 'fr') $$,
                 'P0001', 'not_found', 'unknown id');
reset role;

select * from finish();
rollback;
