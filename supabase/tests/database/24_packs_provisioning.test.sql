begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Packs and promotions through provision_salon: the launch script (a file never lists packs or
-- promotions) and the demo snapshot (which carries them).

insert into auth.users (id, instance_id, aud, role, email)
values ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sara@test.local');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Algiers')::date $$;

-- What the launch script sends with --reapply-settings (and when creating the salon).
create function pg_temp.sara() returns jsonb language sql as $$ select '{
  "id": "sara", "name": "Sara Beauty",
  "hours": [
    {"weekday": 1, "opens": null, "closes": null}, {"weekday": 2, "opens": "09:00", "closes": "18:00"},
    {"weekday": 3, "opens": "09:00", "closes": "18:00"}, {"weekday": 4, "opens": "09:00", "closes": "18:00"},
    {"weekday": 5, "opens": "09:00", "closes": "18:00"}, {"weekday": 6, "opens": "10:00", "closes": "16:00"},
    {"weekday": 7, "opens": null, "closes": null}],
  "services": [
    {"id": "sara-coupe", "category": "coiffure", "name": {"fr": "Coupe", "ar": "قص"}, "price": 2000, "duration": 45},
    {"id": "sara-ongles", "category": "beaute", "name": {"fr": "Ongles", "ar": "أظافر"}, "price": 1500, "duration": 30}],
  "stylists": [
    {"id": "sara-yasmine", "name": "Yasmine", "services": ["sara-coupe", "sara-ongles"]},
    {"id": "sara-nour", "name": "Nour", "services": ["sara-ongles"]}],
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

-- sara's services and links, to compare before / after a re-run
create function pg_temp.catalogue() returns text language sql as $$
  select (select string_agg(row_to_json(s)::text, '|' order by s.id) from public.services s where s.salon_id = 'sara')
      || '#' || (select string_agg(ss.stylist_id || '>' || ss.service_id, ',' order by ss.stylist_id, ss.service_id)
                 from public.stylist_services ss where ss.salon_id = 'sara') $$;

create function pg_temp.pack_id() returns text language sql as $$
  select s.id from public.services s where s.salon_id = 'sara' and s.category = 'pack' $$;
create function pg_temp.pack_links() returns text language sql as $$
  select string_agg(ss.stylist_id, ',' order by ss.stylist_id) from public.stylist_services ss where ss.service_id = pg_temp.pack_id() $$;

select is(pg_temp.provision(pg_temp.sara()), 'ok', 'sara is created from her file');

-- the owner makes a pack and promotions in Réglages
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
set local role authenticated;
select lives_ok(format($$ select public.admin_save_service(null, '{"fr":"Pack Éclat"}', '{"fr":""}', 'pack', 3000, 75, 5,
                         '{sara-coupe,sara-ongles}', 'sara-nour', 2500, %L, %L) $$, pg_temp.today(), pg_temp.today() + 7),
  'the owner makes a pack with a promotion');
select lives_ok(format($$ select public.admin_save_service('sara-ongles', '{"fr":"Ongles","ar":"أظافر"}', null, 'beaute', 1500, 30, null,
                         '{}', null, 1200, %L, %L) $$, pg_temp.today(), pg_temp.today() + 3),
  'the owner puts a promotion on a service of the file');
reset role;
create temp table before as select pg_temp.catalogue() as v;
select is(pg_temp.pack_links(), 'sara-nour', 'the pack''s person is its only link');

-- ---------------------------------------------------------------- re-running the launch script
select is(pg_temp.provision(pg_temp.sara()), 'ok', 're-provisioning from a file without packs runs');
select is(pg_temp.catalogue(), (select v from before),
  're-provisioning from a file without packs keeps the owner''s packs and promos');
select is((select promo_price || ' ' || promo_from || ' ' || promo_to from public.services where id = 'sara-ongles'),
  1200 || ' ' || pg_temp.today() || ' ' || (pg_temp.today() + 3), 'a file service keeps the owner''s promotion (no promo keys in the file)');
-- failure mode: rewriting a stylist's services from the file dropped her pack row
select is(pg_temp.pack_links(), 'sara-nour', 'a stylist''s service list from the file keeps her pack row');
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{stylists,0,services}', to_jsonb(array['sara-coupe', pg_temp.pack_id()]))), 'ok',
  'a pack id in a stylist''s list is accepted');
select is(pg_temp.pack_links(), 'sara-nour', '... and ignored (a pack''s person is its pack_stylist_id)');
select is(pg_temp.provision(pg_temp.sara()), 'ok', 'back to the file');
-- a price at or under the owner's promotion: refused rather than silently dropping her promotion
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{services,1,price}', '1200')), 'invalid_promo',
  'a file price at or under the owner''s promotion is refused');
select is(pg_temp.catalogue(), (select v from before), '... and changes nothing');

-- ---------------------------------------------------------------- the snapshot
create temp table snap as select private.salon_snapshot('sara') as v;
select is((select jsonb_build_object('category', x -> 'category', 'includes', x -> 'includes', 'pack_stylist_id', x -> 'pack_stylist_id',
                                     'promo_price', x -> 'promo_price', 'promo_from', x -> 'promo_from', 'promo_to', x -> 'promo_to')
           from snap, jsonb_array_elements(snap.v -> 'services') x where x ->> 'id' = pg_temp.pack_id()),
  jsonb_build_object('category', 'pack', 'includes', jsonb_build_array('sara-coupe', 'sara-ongles'), 'pack_stylist_id', 'sara-nour',
                     'promo_price', 2500, 'promo_from', pg_temp.today(), 'promo_to', pg_temp.today() + 7),
  'the snapshot carries a pack (included services, person) and its promotion');
select is((select jsonb_build_object('includes', x -> 'includes', 'pack_stylist_id', x -> 'pack_stylist_id', 'promo_price', x -> 'promo_price',
                                     'promo_from', x -> 'promo_from', 'promo_to', x -> 'promo_to')
           from snap, jsonb_array_elements(snap.v -> 'services') x where x ->> 'id' = 'sara-coupe'),
  '{"includes": [], "pack_stylist_id": null, "promo_price": null, "promo_from": null, "promo_to": null}'::jsonb,
  'a service without promotion carries explicit empty pack and promo keys');
select is((select x -> 'services' from snap, jsonb_array_elements(snap.v -> 'stylists') x where x ->> 'id' = 'sara-nour'),
  '["sara-ongles"]'::jsonb, 'a stylist''s services in the snapshot leave out packs');

-- re-applying it creates the pack's person before the pack
delete from public.services where id = pg_temp.pack_id();
delete from public.stylists where id = 'sara-nour';
update public.services set promo_price = null, promo_from = null, promo_to = null where id = 'sara-ongles';
select is(pg_temp.provision((select v from snap)), 'ok', 'the snapshot re-creates a pack and its person in one run');
select is(pg_temp.catalogue(), (select v from before), 'pack, person, links and promotions are back');

-- a payload's promotion replaces the current one; null clears it
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{services,1}',
                            (pg_temp.sara() #> '{services,1}') || '{"promo_price": null, "promo_from": null, "promo_to": null}')), 'ok',
  'a payload can clear a promotion');
select is((select promo_price from public.services where id = 'sara-ongles'), null, '... cleared');
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{services,1}',
                            (pg_temp.sara() #> '{services,1}') || '{"promo_price": 900, "promo_from": "2030-01-01", "promo_to": "2030-01-31"}')), 'ok',
  'a payload can set a promotion');
select is((select promo_price || ' ' || promo_from || ' ' || promo_to from public.services where id = 'sara-ongles'), '900 2030-01-01 2030-01-31',
  '... set');

-- ---------------------------------------------------------------- validation (the owner function's rules)
create function pg_temp.with_service(p_extra jsonb) returns jsonb language sql as $$
  select jsonb_set(pg_temp.sara(), '{services}', (pg_temp.sara() -> 'services') || jsonb_build_array(
    '{"id": "sara-pack", "category": "pack", "name": {"fr": "Pack"}, "price": 3000, "duration": 60}'::jsonb || p_extra)) $$;
create function pg_temp.with_promo(p_promo jsonb) returns jsonb language sql as $$
  select jsonb_set(pg_temp.sara(), '{services,1}', (pg_temp.sara() #> '{services,1}') || p_promo) $$;

select is(pg_temp.provision(pg_temp.with_service('{"includes": ["sara-coupe"]}')), 'invalid_pack', 'a pack needs a person');
select is(pg_temp.provision(pg_temp.with_service('{"pack_stylist_id": "amina"}')), 'invalid_pack', 'a pack''s person is a stylist of the salon');
select is(pg_temp.provision(pg_temp.with_service('{"pack_stylist_id": "sara-yasmine", "includes": ["coupe-femme"]}')), 'invalid_pack',
  'a pack includes only the salon''s services');
select is(pg_temp.provision(pg_temp.with_service(jsonb_build_object('pack_stylist_id', 'sara-yasmine', 'includes', jsonb_build_array(pg_temp.pack_id())))),
  'invalid_pack', 'a pack includes no pack');
select is(pg_temp.provision(pg_temp.with_service('{"pack_stylist_id": "sara-yasmine", "includes": "sara-coupe"}')), 'invalid_pack',
  'includes is a list');
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{services,0,pack_stylist_id}', '"sara-yasmine"')), 'invalid_pack',
  'a regular service has no person responsible');
select is(pg_temp.provision(jsonb_set(pg_temp.sara(), '{services,0}',
                            (pg_temp.sara() #> '{services,0}') || '{"category": "pack", "pack_stylist_id": "sara-yasmine"}')),
  'invalid_pack', 'a service can''t become a pack');
select is(pg_temp.provision(jsonb_build_object('id', 'sara', 'name', 'Sara Beauty', 'services', jsonb_build_array(jsonb_build_object(
                              'id', pg_temp.pack_id(), 'category', 'coiffure', 'name', '{"fr": "Pack"}'::jsonb, 'price', 3000, 'duration', 75)))),
  'invalid_pack', 'a pack can''t stop being one');
select is(pg_temp.provision(pg_temp.with_promo('{"promo_price": 1500, "promo_from": "2030-01-01", "promo_to": "2030-01-31"}')), 'invalid_promo',
  'a promotion is below the price');
select is(pg_temp.provision(pg_temp.with_promo('{"promo_price": 900}')), 'invalid_promo', 'a promotion has a price and both dates');
select is(pg_temp.provision(pg_temp.with_promo('{"promo_price": 900, "promo_from": "2030-02-01", "promo_to": "2030-01-31"}')), 'invalid_promo',
  'a promotion starts before it ends');
select is(pg_temp.provision(pg_temp.with_promo('{"promo_price": 900, "promo_from": "2030-02-30", "promo_to": "2030-03-31"}')), 'invalid_promo',
  'a promotion''s dates are real days');
select is(pg_temp.provision(pg_temp.with_promo('{"promo_price": 900, "promo_from": "today", "promo_to": "2030-03-31"}')), 'invalid_promo',
  'a promotion''s dates are YYYY-MM-DD');
select is(pg_temp.provision(pg_temp.with_service('{"pack_stylist_id": "sara-yasmine", "includes": ["sara-ongles", "sara-coupe", "sara-ongles"]}')),
  'ok', 'a valid pack from a payload');
select is((select array[category, array_to_string(includes, ','), pack_stylist_id, icon] from public.services where id = 'sara-pack'),
  array['pack', 'sara-ongles,sara-coupe', 'sara-yasmine', 'gift'], '... saved with its included services in order, once each');
select is((select string_agg(stylist_id, ',') from public.stylist_services where service_id = 'sara-pack'), 'sara-yasmine',
  '... and its person as its only link');

select * from finish();
rollback;
