begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.salon_categories (id, salon_id, name, sort_order) values
  ('rival-cat', 'rival', '{"fr":"R","ar":"R"}', 0),
  ('el-mariee', 'elegance', '{"fr":"Mariée","ar":"عروس"}', 0);

create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' ' || nullif(v_detail, ''), '');
end $$;
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

-- owner category RPCs
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
insert into ids select 'catA', public.admin_save_category(null, '{"fr":"  Soins mains ","ar":""}');
insert into ids select 'catB', public.admin_save_category(null, '{"fr":"Mariage","ar":"زواج"}');
select is((select c.sort_order from public.salon_categories c where c.id = (select v from ids where k = 'catA')), 1, 'first new category has sort_order 1');
select is((select c.sort_order from public.salon_categories c where c.id = (select v from ids where k = 'catB')), 2, 'second has sort_order 2');
select is((select c.name from public.salon_categories c where c.id = (select v from ids where k = 'catA')), '{"fr":"Soins mains","ar":"Soins mains"}'::jsonb, 'empty AR stored as trimmed FR');
select throws_ok($$ select public.admin_save_category(null, '{"fr":"A","ar":""}') $$, 'P0001', 'invalid_name', 'one-char name');
select throws_ok($$ select public.admin_save_category(null, '{"fr":"A","ar":"x"}'::jsonb || jsonb_build_object('fr', repeat('x', 61))) $$, 'P0001', 'invalid_name', '61-char name');
select public.admin_save_category((select v from ids where k = 'catA'), '{"fr":"Mains","ar":"أيدي"}');
select is((select c.sort_order || '/' || (c.name ->> 'fr') from public.salon_categories c where c.id = (select v from ids where k = 'catA')), '1/Mains', 'rename keeps sort_order');
select throws_ok($$ select public.admin_save_category('rival-cat', '{"fr":"Hack","ar":""}') $$, 'P0001', 'not_found', 'rename other salon category is not_found');
select is((select name ->> 'fr' from public.salon_categories where id = 'rival-cat'), 'R', 'rival category untouched by rename');

select public.admin_reorder_categories(array[(select v from ids where k = 'catB'), (select v from ids where k = 'catA'), 'el-mariee']);
select is((select array_agg(id order by sort_order) from public.salon_categories where salon_id = 'elegance'),
  array[(select v from ids where k = 'catB'), (select v from ids where k = 'catA'), 'el-mariee'], 'reorder sets 1-based positions');
select throws_ok($$ select public.admin_reorder_categories(array[(select v from ids where k = 'catA')]) $$, 'P0001', 'invalid_category', 'reorder with missing ids');
select throws_ok($$ select public.admin_reorder_categories(array[(select v from ids where k = 'catA'), (select v from ids where k = 'catA'), (select v from ids where k = 'catB'), 'el-mariee']) $$, 'P0001', 'invalid_category', 'reorder with duplicate');
select throws_ok($$ select public.admin_reorder_categories(array[(select v from ids where k = 'catA'), (select v from ids where k = 'catB'), 'el-mariee', 'rival-cat']) $$, 'P0001', 'invalid_category', 'reorder with foreign id');
select is((select array_agg(id order by sort_order) from public.salon_categories where salon_id = 'elegance'),
  array[(select v from ids where k = 'catB'), (select v from ids where k = 'catA'), 'el-mariee'], 'order unchanged after rejected reorders');
select is((select sort_order from public.salon_categories where id = 'rival-cat'), 0, 'rival sort_order untouched');

select public.admin_delete_category((select v from ids where k = 'catA'));
select is((select count(*)::int from public.salon_categories where id = (select v from ids where k = 'catA')), 0, 'empty category deleted');
select throws_ok($$ select public.admin_delete_category('rival-cat') $$, 'P0001', 'not_found', 'delete other salon category is not_found');

-- a category whose only service is hidden is still in use
reset role;
update public.services set category = 'custom', custom_category_id = 'el-mariee', active = false
  where id = (select v from ids where k = 'bride');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(pg_temp.error_of($$ select public.admin_delete_category('el-mariee') $$), 'category_in_use 1', 'hidden service keeps the category in use');
select is((select count(*)::int from public.salon_categories where id = 'el-mariee'), 1, 'category kept');
reset role;

-- non-staff
select pg_temp.act_as('99999999-9999-9999-9999-999999999999');
set local role authenticated;
select throws_ok($$ select public.admin_save_category(null, '{"fr":"Zz","ar":""}') $$, 'P0001', 'not_authorized', 'save_category: non-staff');
select throws_ok($$ select public.admin_reorder_categories('{}') $$, 'P0001', 'not_authorized', 'reorder_categories: non-staff');
select throws_ok($$ select public.admin_delete_category('el-mariee') $$, 'P0001', 'not_authorized', 'delete_category: non-staff');
reset role;

select * from finish();
rollback;
