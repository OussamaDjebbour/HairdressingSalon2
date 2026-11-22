begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.salon_categories (id, salon_id, name, sort_order) values
  ('rival-cat', 'rival', '{"fr":"R","ar":"R"}', 0),
  ('el-mariee', 'elegance', '{"fr":"Mariée","ar":"عروس"}', 0);

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

select has_table('public', 'salon_categories', 'salon_categories exists');
select col_not_null('public', 'salon_categories', 'salon_id', 'salon_id not null');
select ok((select relrowsecurity from pg_class where oid = 'public.salon_categories'::regclass), 'RLS on');

set local role anon;
select is((select count(*)::int from public.salon_categories where salon_id = 'elegance'), 1, 'anon reads Élégance categories');
reset role;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ insert into public.salon_categories (id, salon_id, name) values ('x', 'elegance', '{}') $$, '42501', null, 'no insert grant');
reset role;

select throws_ok($$ insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('t1', 'elegance', 'custom', '{}', '{}', 1, 30, '', 'sparkles') $$, '23514', null, 'custom needs a category');
select throws_ok($$ insert into public.services (id, salon_id, category, name, description, price, duration, image, icon, custom_category_id)
  values ('t2', 'elegance', 'ongles', '{}', '{}', 1, 30, '', 'hand', 'el-mariee') $$, '23514', null, 'ready-made forbids custom id');
select throws_ok($$ insert into public.services (id, salon_id, category, name, description, price, duration, image, icon, custom_category_id)
  values ('t3', 'elegance', 'custom', '{}', '{}', 1, 30, '', 'sparkles', 'rival-cat') $$, '23503', null, 'other salon category is an FK violation');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
create temp table ids (k text, v text);
grant all on ids to authenticated;
insert into ids select 'nails', public.admin_save_service(null, '{"fr":"Pose gel","ar":""}', '{}', 'ongles', 3000, 60, 0);
select is((select s.category || '/' || s.icon from public.services s where s.id = (select v from ids where k = 'nails')),
  'ongles/hand', 'ready-made category and icon');
insert into ids select 'bride', public.admin_save_service(null, '{"fr":"Chignon","ar":""}', '{}', 'custom', 5000, 60, 0, '{}', null, null, null, null, 'el-mariee');
select is((select s.category || '/' || s.custom_category_id from public.services s where s.id = (select v from ids where k = 'bride')),
  'custom/el-mariee', 'custom category saved');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Chignon","ar":""}', '{}', 'custom', 5000, 60, 0) $$, 'P0001', 'invalid_category', 'custom without id');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Chignon","ar":""}', '{}', 'custom', 5000, 60, 0, '{}', null, null, null, null, 'rival-cat') $$, 'P0001', 'invalid_category', 'custom with other salon id');
insert into ids select 'ong2', public.admin_save_service(null, '{"fr":"Vernis","ar":""}', '{}', 'ongles', 2000, 30, 0, '{}', null, null, null, null, 'el-mariee');
select is((select s.custom_category_id from public.services s where s.id = (select v from ids where k = 'ong2')), null, 'ready-made ignores custom id');
select public.admin_save_service((select v from ids where k = 'bride'), '{"fr":"Chignon","ar":""}', '{}', 'visage', 5000, 60, 0);
select is((select s.custom_category_id from public.services s where s.id = (select v from ids where k = 'bride')), null, 'moving off custom clears the id');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"X y","ar":""}', '{}', 'nails', 1, 30, 0) $$, 'P0001', 'invalid_name', 'unknown category');
reset role;

select * from finish();
rollback;
