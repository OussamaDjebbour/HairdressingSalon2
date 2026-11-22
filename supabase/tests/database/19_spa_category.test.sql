begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create table pg_temp.ids (k text primary key, v text);
grant all on pg_temp.ids to authenticated;

-- another salon's service, to prove an id from elsewhere stays not_found
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');

select is(private.category_icon('spa'), 'flower', 'spa default icon');
select is(private.category_icon('nope'), null, 'unknown category has no icon');
select ok(not has_function_privilege('authenticated', 'private.category_icon(text)', 'execute'), 'authenticated cannot call category_icon');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;

insert into pg_temp.ids select 'spa', public.admin_save_service(null, '{"fr":"Hammam","ar":""}', '{}', 'spa', 5000, 60, 1);
insert into pg_temp.ids select 'hair', public.admin_save_service(null, '{"fr":"Coupe spa","ar":""}', '{}', 'coiffure', 2000, 30, 2);
insert into pg_temp.ids select 'custom', public.admin_save_service(null, '{"fr":"Couleur","ar":""}', '{}', 'coiffure', 4000, 60, 3);
reset role;
update public.services set icon = 'palette' where id = (select v from pg_temp.ids where k = 'custom');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;

select is((select category || ' ' || icon from public.services where id = (select v from pg_temp.ids where k = 'spa')), 'spa flower', 'new spa service gets the flower icon');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'nails', 1000, 30, 0) $$, 'P0001', 'invalid_name', 'unknown category still invalid');

select public.admin_save_service((select v from pg_temp.ids where k = 'hair'), '{"fr":"Coupe spa","ar":""}', '{}', 'spa', 2000, 30, 2);
select public.admin_save_service((select v from pg_temp.ids where k = 'custom'), '{"fr":"Couleur","ar":""}', '{}', 'spa', 4000, 60, 3);
select is((select icon from public.services where id = (select v from pg_temp.ids where k = 'hair')), 'flower', 'default icon follows the category change');
select is((select icon from public.services where id = (select v from pg_temp.ids where k = 'custom')), 'palette', 'a custom icon is kept');
select throws_ok($$ select public.admin_save_service('rival-cut', '{"fr":"Valide","ar":""}', '{}', 'spa', 1000, 30, 0) $$, 'P0001', 'not_found', 'another salon''s service is not found');
reset role;

create function pg_temp.spa_salon(p_cat text) returns jsonb language sql as $$ select jsonb_build_object(
  'id', 'spa-test', 'name', 'Spa Test',
  'hours', (select jsonb_agg(jsonb_build_object('weekday', d, 'opens', '09:00', 'closes', '18:00')) from generate_series(1, 7) d),
  'services', jsonb_build_array(jsonb_build_object('id', 'spa-test-hammam', 'category', p_cat,
    'name', jsonb_build_object('fr', 'Hammam', 'ar', 'حمام'), 'price', 3000, 'duration', 60))) $$;
set local role service_role;
select public.provision_salon(pg_temp.spa_salon('spa'));
select throws_ok($$ select public.provision_salon(pg_temp.spa_salon('massage')) $$, 'P0001', 'invalid_service', 'provision rejects an unknown category');
reset role;
select is((select category || ' ' || icon from public.services where id = 'spa-test-hammam'), 'spa flower', 'provisioned spa service gets the flower icon');

select * from finish();
rollback;
