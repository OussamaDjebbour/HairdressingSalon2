begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- Visit V: Amina coupe 10:00-11:00, then Sara manucure 11:00-11:45, same visit id
insert into private.bookings (id, visit_id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
values
  ('a1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'elegance', 'coupe-femme', 'amina', '2030-01-08 10:00+01', '2030-01-08 11:00+01', 2500, 'Visiteuse', '0555123456', 'fr', 'online'),
  ('a1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-00000000000f', 'elegance', 'manucure', 'sara', '2030-01-08 11:00+01', '2030-01-08 11:45+01', 2000, 'Visiteuse', '0555123456', 'fr', 'online');
-- a lone booking (its own visit)
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
values ('a2000000-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina', '2030-01-08 14:00+01', '2030-01-08 15:00+01', 2500, 'Seule', '0555000002', 'fr', 'online'),
       ('a2000000-0000-0000-0000-000000000002', 'elegance', 'coupe-femme', 'amina', '2030-01-08 15:00+01', '2030-01-08 16:00+01', 2500, 'Autre', '0555000003', 'fr', 'online');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is((select count(distinct visit_id)::int from public.admin_list_bookings('2030-01-08', '2030-01-08') where id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002')),
  1, 'list returns the visit link');

select lives_ok($$ select public.admin_set_booking_status('a1000000-0000-0000-0000-000000000002', 'confirmed') $$, 'confirm the second part');
select is((select string_agg(status, ',') from private.bookings where visit_id = 'f0000000-0000-0000-0000-00000000000f'), 'confirmed,confirmed', 'confirm applies to the whole visit');

select lives_ok($$ select public.admin_set_booking_status('a1000000-0000-0000-0000-000000000001', 'cancelled') $$, 'cancel the first part');
select is((select string_agg(status, ',') from private.bookings where visit_id = 'f0000000-0000-0000-0000-00000000000f'), 'cancelled,cancelled', 'cancel applies to the whole visit');

reset role;
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
values ('elegance', 'coupe-femme', 'amina', '2030-01-08 10:00+01', '2030-01-08 11:00+01', 2500, 'Occupe', '0555000004', 'fr', 'confirmed', 'staff');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_set_booking_status('a1000000-0000-0000-0000-000000000002', 'confirmed') $$, 'P0001', 'slot_taken', 'a conflicting confirm raises slot_taken');
select is((select string_agg(status, ',') from private.bookings where visit_id = 'f0000000-0000-0000-0000-00000000000f'), 'cancelled,cancelled', 'a conflicting confirm changes no part');

select public.admin_set_booking_status('a2000000-0000-0000-0000-000000000001', 'confirmed');
select is((select status from private.bookings where id = 'a2000000-0000-0000-0000-000000000001') || ',' || (select status from private.bookings where id = 'a2000000-0000-0000-0000-000000000002'),
  'confirmed,pending', 'a visit of one changes only that row');

-- demo masking survives
reset role;
update public.salons set demo = true where id = 'elegance';
update private.staff set role = 'demo' where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select client_phone from public.admin_list_bookings('2030-01-08', '2030-01-08') where id = 'a1000000-0000-0000-0000-000000000001'),
  '05•• •• •• 56', 'demo phone masking survives');

select * from finish();
rollback;
