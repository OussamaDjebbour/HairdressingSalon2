begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;

insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('rival', 'nadia', 'rival-cut');

select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'rival-cut') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s service');
select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme', 'nadia') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s stylist');
select throws_ok($$ select * from public.create_booking('elegance', 'rival-cut', null, pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s service');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'nadia', pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s stylist');
select is((select count(*)::int from private.bookings where client_name = 'Amel'), 0, 'nothing inserted');

-- 20 recent online bookings at rival (cancelled, so no overlap constraint) trip rival's circuit breaker, not elegance's
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
select 'rival', 'rival-cut', 'nadia', now() + interval '3 days' + i * interval '1 hour', now() + interval '3 days' + i * interval '1 hour' + interval '1 hour',
       1000, 'Flood', '0555000001', 'fr', 'cancelled', 'online'
from generate_series(1, 20) i;
select throws_ok($$ select * from public.create_booking('rival', 'rival-cut', 'nadia', pg_temp.open_day(2), '10:00', 'Zed', '0555888888', 'fr') $$, 'P0001', 'rate_limited', 'rival is rate limited by its own traffic');
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(2), '10:00', 'Lina', '0555777777', 'fr') $$, 'rival''s traffic does not rate-limit elegance');
select is((select salon_id from private.bookings where client_name = 'Lina'), 'elegance', 'booking stored in the right salon');

-- per-phone limit is per salon: 3 future bookings at rival don't block that phone at elegance
delete from private.bookings where client_name = 'Flood';
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
select 'rival', 'rival-cut', 'nadia', now() + interval '3 days' + i * interval '2 hours', now() + interval '3 days' + i * interval '2 hours' + interval '1 hour',
       1000, 'Phone', '0666123123', 'fr', 'online'
from generate_series(1, 3) i;
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(3), '10:00', 'Phoebe', '0666123123', 'fr') $$, 'rival''s bookings for a phone do not count at elegance');

-- staff functions: staff of one salon never see or change another salon's bookings
insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rival@test.local');
insert into private.staff (user_id) values ('11111111-1111-1111-1111-111111111111');
insert into private.staff (user_id, salon_id) values ('44444444-4444-4444-4444-444444444444', 'rival');

insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'rival', 'rival-cut', 'nadia',
   '2030-01-08 10:00+01', '2030-01-08 11:00+01', 1000, 'Rival Client', '0555999999', 'fr', 'pending'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina',
   '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Own', '0555000000', 'fr', 'pending');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select count(*)::int from public.admin_list_bookings('2030-01-01', '2030-01-31') where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'list: never shows another salon''s booking');
select throws_ok($$ select public.admin_set_booking_status('bbbbbbbb-0000-0000-0000-000000000001', 'cancelled') $$, 'P0001', 'not_found', 'status: other salon''s booking is not_found');
select throws_ok($$ select public.admin_update_booking('bbbbbbbb-0000-0000-0000-000000000001', 'coupe-femme', 'amina', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'not_found', 'update: other salon''s booking is not_found');
select lives_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-09', '10:00', 'Walkin', '0555000000', 'fr') $$, 'create: own salon works');
select throws_ok($$ select public.admin_create_booking('rival-cut', 'amina', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'create: other salon''s service');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'nadia', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'create: other salon''s stylist');
-- own booking moved onto the other salon's stylist/service:
select throws_ok($$ select public.admin_update_booking('aaaaaaaa-0000-0000-0000-000000000001', 'rival-cut', 'nadia', '2030-01-08', '10:00', 'Own', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'update: cannot move to other salon''s service/stylist');
select is((select salon_id from private.bookings where client_name = 'Walkin'), 'elegance', 'create stores my salon');
-- row-level security on the table itself
select is((select count(*)::int from private.bookings where salon_id <> 'elegance'), 0, 'RLS: staff read only their salon''s rows');
select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('rival', 'rival-cut', 'nadia', '2030-01-10 10:00+01', '2030-01-10 11:00+01', 1000, 'Hack', '0555000000', 'fr', 'staff') $$,
  '42501', null, 'RLS: staff cannot insert into another salon');
select is((select count(*)::int from private.staff), 1, 'RLS: staff see only their own staff row');
reset role;

select is((select status || ' ' || client_name || ' ' || stylist_id from private.bookings where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
          'pending Rival Client nadia', 'other salon''s booking unchanged');
select is((select service_id || ' ' || stylist_id from private.bookings where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          'coupe-femme amina', 'own booking not moved to the other salon');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
set local role authenticated;
select is(array(select id from public.admin_list_bookings('2030-01-01', '2030-01-31')),
          array['bbbbbbbb-0000-0000-0000-000000000001'::uuid], 'list: rival staff see only their own booking');
reset role;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select is((select count(*)::int from private.bookings), 0, 'RLS: non-staff read no bookings');
reset role;

set local role anon;
select throws_ok($$ select count(*) from private.bookings $$, '42501', null, 'anon has no access to private');
reset role;

select * from finish();
rollback;
