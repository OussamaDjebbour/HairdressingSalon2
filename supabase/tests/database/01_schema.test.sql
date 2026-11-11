begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('public', 'stylist_services', 'stylist_services exists');
select has_table('private', 'bookings', 'private.bookings exists');
select has_table('private', 'staff', 'private.staff exists');
select is((select count(*)::int from public.stylist_services), 6, 'seed has 6 stylist/service pairs');

-- exclusion constraint: same stylist, overlapping time
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('elegance', 'coupe-femme', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Test A', '0555000001', 'fr');
select throws_ok(
  $$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
     values ('elegance', 'coupe-femme', 'amina', '2030-01-08 09:30+01', '2030-01-08 10:30+01', 2500, 'Test B', '0555000002', 'fr') $$,
  '23P01', null, 'overlapping booking for same stylist is rejected');
select lives_ok(
  $$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
     values ('elegance', 'coupe-femme', 'amina', '2030-01-08 09:30+01', '2030-01-08 10:30+01', 2500, 'Test C', '0555000003', 'fr', 'cancelled') $$,
  'cancelled bookings do not block');
select throws_ok(
  $$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
     values ('elegance', 'coupe-femme', 'leila', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Test D', '12345', 'fr') $$,
  '23514', null, 'phone check constraint');

-- anon cannot touch private, can read stylist_services
set local role anon;
select throws_ok($$ select * from private.bookings $$, '42501', null, 'anon cannot read private.bookings');
select is((select count(*)::int from public.stylist_services), 6, 'anon can read stylist_services');
reset role;

select * from finish();
rollback;
