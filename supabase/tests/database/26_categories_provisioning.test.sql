begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- The owner's own categories through provision_salon (launch files), the snapshot and the demo reset.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tina@test.local', ''),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local',
   extensions.crypt('demo-pw', extensions.gen_salt('bf')));
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.salon_categories (id, salon_id, name, sort_order) values ('rival-cat', 'rival', '{"fr":"R","ar":"R"}', 0);

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

create function pg_temp.tina() returns jsonb language sql as $$ select '{
  "id": "tina", "name": "Tina Beauty",
  "hours": [
    {"weekday": 1, "opens": null, "closes": null}, {"weekday": 2, "opens": "09:00", "closes": "18:00"},
    {"weekday": 3, "opens": "09:00", "closes": "18:00"}, {"weekday": 4, "opens": "09:00", "closes": "18:00"},
    {"weekday": 5, "opens": "09:00", "closes": "18:00"}, {"weekday": 6, "opens": "10:00", "closes": "16:00"},
    {"weekday": 7, "opens": null, "closes": null}],
  "categories": [
    {"id": "t-mariee", "name": {"fr": "Soins mariée", "ar": ""}},
    {"id": "t-homme", "name": {"fr": "Homme", "ar": "رجال"}, "sort_order": 7}],
  "services": [
    {"id": "t-coupe", "category": "coiffure", "name": {"fr": "Coupe", "ar": "قص"}, "price": 2000, "duration": 45},
    {"id": "t-chignon", "category": "custom:t-mariee", "name": {"fr": "Chignon"}, "price": 5000, "duration": 60},
    {"id": "t-gel", "category": "ongles", "name": {"fr": "Pose gel"}, "price": 3000, "duration": 60}],
  "stylists": [{"id": "t-yasmine", "name": "Yasmine", "services": ["t-coupe", "t-chignon", "t-gel"]}],
  "owner_user_id": "55555555-5555-5555-5555-555555555555"
}'::jsonb $$;

create function pg_temp.provision(p jsonb) returns text language plpgsql as $$
begin
  set local role service_role;
  perform public.provision_salon(p);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlerrm;
end $$;

create function pg_temp.cats(p_salon text) returns text language sql as $$
  select string_agg(c.id || ':' || (c.name ->> 'fr') || ':' || (c.name ->> 'ar') || ':' || c.sort_order, ',' order by c.sort_order, c.id)
  from public.salon_categories c where c.salon_id = p_salon $$;
create function pg_temp.cat_of(p_service text) returns text language sql as $$
  select s.category || coalesce('/' || s.custom_category_id, '') from public.services s where s.id = p_service $$;
-- tina's categories and services, to compare before / after
create function pg_temp.catalogue() returns text language sql as $$
  select coalesce(pg_temp.cats('tina'), '') || '#'
      || (select string_agg(row_to_json(s)::text, '|' order by s.id) from public.services s where s.salon_id = 'tina') $$;
create function pg_temp.with_service(p_cat text) returns jsonb language sql as $$
  select jsonb_set(pg_temp.tina(), '{services,1,category}', to_jsonb(p_cat)) $$;
create function pg_temp.with_cats(p_cats jsonb) returns jsonb language sql as $$
  select jsonb_set(pg_temp.tina(), '{categories}', p_cats) $$;

-- ---------------------------------------------------------------- launch files
select is(pg_temp.provision(pg_temp.tina()), 'ok', 'tina is created with her categories');
select is(pg_temp.cats('tina'), 't-mariee:Soins mariée:Soins mariée:0,t-homme:Homme:رجال:7',
  'categories are written: list position as default sort_order, an empty Arabic name falls back to the French');
select is(pg_temp.cat_of('t-chignon'), 'custom/t-mariee', 'a "custom:<id>" service is linked to its category');
select is((select icon from public.services where id = 't-chignon'), 'sparkles', '... with the custom default icon');
select is(pg_temp.cat_of('t-gel'), 'ongles', 'a new ready-made key is accepted');

create temp table before as select pg_temp.catalogue() as v;
select is(pg_temp.provision(pg_temp.tina()), 'ok', 're-running the same file runs');
select is(pg_temp.catalogue(), (select v from before), '... and changes nothing');
select is(pg_temp.provision(pg_temp.tina() - 'categories'), 'ok', 're-provisioning without categories runs');
select is(pg_temp.cats('tina'), 't-mariee:Soins mariée:Soins mariée:0,t-homme:Homme:رجال:7', '... and keeps them');
select is(pg_temp.provision(pg_temp.with_cats('[{"id": "t-mariee", "name": {"fr": "Mariée", "ar": "عروس"}}]')), 'ok',
  'a file listing one category runs');
select is(pg_temp.cats('tina'), 't-mariee:Mariée:عروس:0,t-homme:Homme:رجال:7', '... renames it and keeps the one it leaves out');

-- moving a service to and from her own category (the check: custom <=> custom_category_id)
select is(pg_temp.provision(pg_temp.with_service('coiffure')), 'ok', 'a file can move a custom service to a ready-made category');
select is(pg_temp.cat_of('t-chignon'), 'coiffure', '... which drops its custom category');
select is(pg_temp.provision(pg_temp.with_service('custom:t-homme')), 'ok', 'a file can move a service into a custom category');
select is(pg_temp.cat_of('t-chignon'), 'custom/t-homme', '... linked');
select is(pg_temp.provision(pg_temp.tina()), 'ok', 'back to the file');

-- validation
delete from before;
insert into before select pg_temp.catalogue();
select is(pg_temp.provision(pg_temp.with_service('custom:missing')), 'invalid_service', 'a custom category that doesn''t exist');
select is(pg_temp.provision(pg_temp.with_service('custom:rival-cat')), 'invalid_service', 'another salon''s category is as good as none');
select is(pg_temp.provision(pg_temp.with_service('custom')), 'invalid_service', '"custom" needs an id');
select is(pg_temp.provision(pg_temp.with_service('custom:')), 'invalid_service', '"custom:" needs an id');
select is(pg_temp.provision(pg_temp.with_service('nails')), 'invalid_service', 'an unknown category key');
select is(pg_temp.provision(pg_temp.with_cats('[{"id": "Bad Id", "name": {"fr": "Mariée"}}]')), 'invalid_category', 'a category id is a slug');
select is(pg_temp.provision(pg_temp.with_cats('[{"id": "t-x", "name": {"fr": "M"}}]')), 'invalid_category', 'a French name of 2..60 chars');
select is(pg_temp.provision(pg_temp.with_cats(jsonb_build_array(jsonb_build_object('id', 't-x', 'name', jsonb_build_object('fr', repeat('a', 61)))))),
  'invalid_category', '... not longer');
select is(pg_temp.provision(pg_temp.with_cats('[{"id": "t-x", "name": {"fr": "Mariée"}, "sort_order": "first"}]')), 'invalid_category',
  'a sort_order is an integer');
select is(pg_temp.provision(pg_temp.with_cats('{"id": "t-x"}')), 'invalid_category', 'categories is a list');
select is(pg_temp.provision(pg_temp.with_cats('["t-x"]')), 'invalid_category', '... of objects');
select is(pg_temp.provision(pg_temp.with_cats('[{"id": "rival-cat", "name": {"fr": "Volée"}}]')), 'id_taken',
  'another salon''s category id is id_taken');
select is(pg_temp.catalogue(), (select v from before), 'refused payloads change nothing');
select is((select name ->> 'fr' from public.salon_categories where id = 'rival-cat'), 'R', 'the rival''s category is untouched');

-- ---------------------------------------------------------------- the snapshot
create temp table snap as select private.salon_snapshot('tina') as v;
select is((select v -> 'categories' from snap),
  '[{"id": "t-mariee", "name": {"fr": "Soins mariée", "ar": "Soins mariée"}, "sort_order": 0},
    {"id": "t-homme", "name": {"fr": "Homme", "ar": "رجال"}, "sort_order": 7}]'::jsonb,
  'the snapshot carries the categories in order');
select is((select x ->> 'category' from snap, jsonb_array_elements(snap.v -> 'services') x where x ->> 'id' = 't-chignon'), 'custom:t-mariee',
  'the snapshot names a custom service''s category as "custom:<id>"');
select is(pg_temp.provision((select v from snap)), 'ok', 'the snapshot is a valid payload');
select is(pg_temp.catalogue(), (select v from before), '... and re-applying it changes nothing');

-- ---------------------------------------------------------------- the demo reset
-- the demo, captured with one category of its own
insert into public.salon_categories (id, salon_id, name, sort_order) values ('el-mariee', 'elegance', '{"fr":"Mariée","ar":"عروس"}', 0);
update public.services set category = 'custom', custom_category_id = 'el-mariee' where id = 'maquillage';
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'demo-pw');

-- a prospect makes categories, moves a snapshot service into one and adds a service to another
create temp table ids (k text, v text);
grant all on ids to authenticated;
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
insert into ids select 'p-cat', public.admin_save_category(null, '{"fr":"P Cat"}');
insert into ids select 'p-cat2', public.admin_save_category(null, '{"fr":"Autre"}');
select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing"}', null, 'custom', 2500, 60, null,
                                 '{}', null, null, null, null, (select v from ids where k = 'p-cat'));
insert into ids select 'p-svc', public.admin_save_service(null, '{"fr":"Neuf"}', null, 'custom', 1000, 30, 9,
                                                          '{}', null, null, null, null, (select v from ids where k = 'p-cat2'));
select public.admin_save_category('el-mariee', '{"fr":"Renommée"}');
select public.admin_save_service('maquillage', '{"fr":"Maquillage Professionnel"}', null, 'visage', 5000, 90, null);
reset role;
select is(pg_temp.cat_of('coupe-femme'), 'custom/' || (select v from ids where k = 'p-cat'), 'the prospect moved a snapshot service into her category');

select lives_ok($$ select private.demo_reset('elegance') $$, 'demo_reset runs with a snapshot service in a prospect''s category');
select is(pg_temp.cat_of('coupe-femme'), 'coiffure', 'the service is back in its snapshot category');
select is(pg_temp.cat_of('maquillage'), 'custom/el-mariee', 'a snapshot custom service is back in its category');
select is(pg_temp.cats('elegance'), 'el-mariee:Mariée:عروس:0', 'the snapshot category is back as captured; the prospect''s are gone');
select is((select count(*)::int from public.services where id = (select v from ids where k = 'p-svc')), 0, 'the prospect''s service is gone');
select is(pg_temp.cats('rival'), 'rival-cat:R:R:0', 'another salon''s categories are untouched');

-- a snapshot taken before categories existed: every category goes
update private.demo_settings set snapshot = jsonb_set(snapshot - 'categories', '{services}', (
  select jsonb_agg(case when x ->> 'id' = 'maquillage' then x || '{"category": "beaute"}' else x end order by n)
  from jsonb_array_elements(snapshot -> 'services') with ordinality t(x, n)))
where salon_id = 'elegance';
select lives_ok($$ select private.demo_reset('elegance') $$, 'demo_reset runs with a snapshot without categories');
select is((select count(*)::int from public.salon_categories where salon_id = 'elegance'), 0, '... and leaves no category');

select * from finish();
rollback;
