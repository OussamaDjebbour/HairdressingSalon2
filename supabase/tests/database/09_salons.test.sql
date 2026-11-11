begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('rival', 'nadia', 'rival-cut');

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rival@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into private.staff (user_id, salon_id) values ('44444444-4444-4444-4444-444444444444', 'rival');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

select has_table('public', 'salons', 'salons exists');
select is((select name from public.salons where id = 'elegance'), 'Élégance', 'Élégance salon exists');
select is((select count(*)::int from public.services where salon_id <> 'elegance' and id <> 'rival-cut'), 0, 'existing services backfilled to elegance');
select is((select count(*)::int from private.staff where salon_id is null), 0, 'staff have a salon');

select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
  values ('elegance', 'rival-cut', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 1000, 'Cross', '0555000001', 'fr') $$,
  '23503', null, 'booking cannot use another salon''s service');
select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
  values ('elegance', 'coupe-femme', 'nadia', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Cross', '0555000001', 'fr') $$,
  '23503', null, 'booking cannot use another salon''s stylist');
select throws_ok($$ insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'amina', 'rival-cut') $$,
  '23503', null, 'stylist_services cannot cross salons');
select lives_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
  values ('rival', 'rival-cut', 'nadia', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 1000, 'Own', '0555000002', 'fr') $$,
  'booking within its own salon works');

set local role anon;
select throws_ok($$ select public.admin_my_salon() $$, '42501', null, 'anon cannot call admin_my_salon');
reset role;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_my_salon(), 'elegance', 'Élégance staff sees elegance');
reset role;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
set local role authenticated;
select is(public.admin_my_salon(), 'rival', 'Rival staff sees rival');
reset role;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_my_salon() $$, 'P0001', 'not_authorized', 'non-staff refused');
reset role;

select ok((select relrowsecurity from pg_class where oid = 'private.bookings'::regclass), 'RLS on private.bookings');
select ok((select relrowsecurity from pg_class where oid = 'private.staff'::regclass)
      and (select relrowsecurity from pg_class where oid = 'private.push_subscriptions'::regclass), 'RLS on private.staff and push_subscriptions');

select * from finish();
rollback;
