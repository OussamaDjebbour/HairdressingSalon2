begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

-- Élégance before any provisioning: compared at the end.
create table pg_temp.before as
  select (select md5(row_to_json(s)::text) from public.salons s where s.id = 'elegance') as salon,
         (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.services x where x.salon_id = 'elegance') as services,
         (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.stylists x where x.salon_id = 'elegance') as stylists,
         (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.stylist_id, x.service_id), '')) from public.stylist_services x where x.salon_id = 'elegance') as stylist_services,
         (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.stylist_id, x.weekday), '')) from public.stylist_workdays x where x.salon_id = 'elegance') as workdays,
         (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.weekday), '')) from public.salon_hours x where x.salon_id = 'elegance') as hours,
         (select md5(coalesce(string_agg(x.domain, '|' order by x.domain), '')) from public.salon_domains x where x.salon_id = 'elegance') as domains;

-- Élégance's branding is today's site
select is((select palette ->> '600' from public.salons where id = 'elegance'), '#9D4B5F', 'elegance palette 600');
select is((select palette ->> '900' from public.salons where id = 'elegance'), '#421F28', 'elegance palette 900');
select is((select palette from public.salons where id = 'elegance'),
  '{"50":"#FBF1F3","100":"#F7E0E5","200":"#EFC1CC","300":"#E29FB1","400":"#D17D93","500":"#B85F76","600":"#9D4B5F","700":"#7E3B4C","800":"#5F2D3A","900":"#421F28"}'::jsonb,
  'elegance palette is the tailwind rose scale');
select is((select rating from public.salons where id = 'elegance'), 4.9, 'elegance rating');
select is((select review_count from public.salons where id = 'elegance'), 240, 'elegance review count');
select is((select years_open || ' ' || client_count from public.salons where id = 'elegance'), '15 2500', 'elegance years and clients');
select is((select founder_name from public.salons where id = 'elegance'), '{"fr":"Amina","ar":"أمينة"}'::jsonb, 'elegance founder');
select is((select story_intro from public.salons where id = 'elegance'),
  '{"fr":"Depuis quinze ans au cœur d’Alger, nous recevons chaque cliente comme une invitée : un moment suspendu, des gestes précis, et le soin d’un métier transmis.","ar":"منذ خمسة عشر عامًا في قلب الجزائر العاصمة، نستقبل كل عميلة كضيفة عزيزة: لحظة من الهدوء، لمسات دقيقة، وعناية حرفةٍ متوارثة."}'::jsonb,
  'elegance story intro is today''s philosophy body');
select is((select founder_role from public.salons where id = 'elegance'),
  '{"fr":"Fondatrice & coiffeuse","ar":"المؤسِّسة وخبيرة التصفيف"}'::jsonb, 'elegance founder role');
select is((select story from public.salons where id = 'elegance'),
  '{"fr":"« La beauté n’est pas un luxe. C’est un rituel. »","ar":"«الجمالُ ليس رفاهية، بل طقسٌ يومي.»"}'::jsonb, 'elegance story is today''s quote');
select is((select hero_image from public.salons where id = 'elegance'),
  'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=900', 'elegance hero image');
select is((select name_ar from public.salons where id = 'elegance'), null, 'elegance has no separate Arabic name');

-- column checks
select throws_ok($$ update public.salons set palette = '{"50":"#FBF1F3"}' where id = 'elegance' $$, '23514', null, 'palette needs 10 shades');
select throws_ok($$ update public.salons set palette = palette || '{"600":"red"}' where id = 'elegance' $$, '23514', null, 'palette values are #RRGGBB');
select throws_ok($$ update public.salons set palette = (palette - '900') || '{"950":"#000000"}' where id = 'elegance' $$, '23514', null, 'palette keys are 50..900');
select throws_ok($$ update public.salons set rating = 5.5 where id = 'elegance' $$, '23514', null, 'rating at most 5');
select throws_ok($$ update public.salons set years_open = 0 where id = 'elegance' $$, '23514', null, 'years_open positive');

-- domains
select throws_ok($$ insert into public.salon_domains values ('WWW.x.com', 'elegance') $$, '23514', null, 'domain: uppercase / www rejected');
select throws_ok($$ insert into public.salon_domains values ('www.x.com', 'elegance') $$, '23514', null, 'domain: leading www rejected');
select throws_ok($$ insert into public.salon_domains values ('x.com:443', 'elegance') $$, '23514', null, 'domain: port rejected');
select throws_ok($$ insert into public.salon_domains values ('x.com.', 'elegance') $$, '23514', null, 'domain: trailing dot rejected');
select is(private.normalize_host('WWW.Sara-Salon.com.:443'), 'sara-salon.com', 'normalize_host');
select is(private.normalize_host('  localhost:5173 '), 'localhost', 'normalize_host: dev host');
select is(private.normalize_host('127.0.0.1'), '127.0.0.1', 'normalize_host: ip');

set local role anon;
select is((select salon_id from public.salon_domains where domain = 'localhost'), 'elegance', 'anon reads salon_domains (seeded localhost)');
select throws_ok($$ insert into public.salon_domains values ('evil.com', 'elegance') $$, '42501', null, 'anon cannot insert a domain');
select throws_ok($$ update public.salons set palette = palette where id = 'elegance' $$, '42501', null, 'anon cannot write salons');
reset role;
set local role authenticated;
select throws_ok($$ delete from public.salon_domains $$, '42501', null, 'authenticated cannot delete domains');
select throws_ok($$ update public.salons set rating = 1 where id = 'elegance' $$, '42501', null, 'authenticated cannot write salons');
reset role;

-- photo bucket: public read, nobody but the service role writes
select is((select public from storage.buckets where id = 'salon-photos'), true, 'salon-photos bucket is public');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             and (roles && array['anon', 'authenticated', 'public']::name[])), 0, 'no storage write policies for anon/authenticated');

-- provision_salon: service role only
select ok(not has_function_privilege('anon', 'public.provision_salon(jsonb)', 'execute'), 'anon cannot provision');
select ok(not has_function_privilege('authenticated', 'public.provision_salon(jsonb)', 'execute'), 'authenticated cannot provision');
select ok(has_function_privilege('service_role', 'public.provision_salon(jsonb)', 'execute'), 'service_role can provision');

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sara@test.local'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second@test.local'),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

create function pg_temp.sara() returns jsonb language sql as $$ select '{
  "id": "sara",
  "name": "Sara Beauty",
  "name_ar": "سارة بيوتي",
  "palette": {"50":"#f0f7ff","100":"#E0EFFE","200":"#BAE0FD","300":"#7DC8FC","400":"#38ACF8","500":"#0E92E9","600":"#0274C7","700":"#035DA1","800":"#074F85","900":"#0C426E"},
  "hero_image": "https://example.com/sara.jpg",
  "founder_name": {"fr": "Sara"},
  "founder_role": {"fr": "Fondatrice", "ar": ""},
  "story": {"fr": "Une histoire.", "ar": "قصة."},
  "story_intro": {"fr": "Depuis trois ans.", "ar": "منذ ثلاث سنوات."},
  "years_open": 3, "client_count": 400, "rating": 4.7, "review_count": 52,
  "address": {"fr": "1 Rue X", "ar": ""}, "city": {"fr": "Oran", "ar": "وهران"},
  "whatsapp": "0555 12 34 56", "instagram_url": "https://instagram.com/sara", "facebook_url": "",
  "domains": ["WWW.Sara-Salon.com", "sara-salon.com"],
  "hours": [
    {"weekday": 1, "opens": null, "closes": null}, {"weekday": 2, "opens": "09:00", "closes": "18:00"},
    {"weekday": 3, "opens": "09:00", "closes": "18:00"}, {"weekday": 4, "opens": "09:00", "closes": "18:00"},
    {"weekday": 5, "opens": "09:00", "closes": "18:00"}, {"weekday": 6, "opens": "10:00", "closes": "16:00"},
    {"weekday": 7, "opens": null, "closes": null}],
  "services": [
    {"id": "sara-coupe", "category": "coiffure", "name": {"fr": "Coupe", "ar": "قص"}, "description": {"fr": "Une coupe", "ar": ""},
     "price": 2000, "duration": 45, "image": "https://example.com/c.jpg", "icon": "scissors"},
    {"id": "sara-ongles", "category": "beaute", "name": {"fr": "Ongles", "ar": "أظافر"}, "price": 1500, "duration": 30}],
  "stylists": [
    {"id": "sara-yasmine", "name": "Yasmine", "role": {"fr": "Coiffeuse", "ar": "مصففة"},
     "specialties": [{"fr": "Coupe", "ar": "قص"}], "image": "https://example.com/y.jpg",
     "services": ["sara-coupe", "sara-ongles"], "weekdays": [2, 3, 4, 5, 6]}],
  "owner_user_id": "55555555-5555-5555-5555-555555555555"
}'::jsonb $$;

create function pg_temp.sara_counts() returns text language sql as $$
  select concat_ws(' ',
    (select count(*) from public.salons where id = 'sara'),
    (select count(*) from public.salon_domains where salon_id = 'sara'),
    (select count(*) from public.salon_hours where salon_id = 'sara'),
    (select count(*) from public.services where salon_id = 'sara'),
    (select count(*) from public.stylists where salon_id = 'sara'),
    (select count(*) from public.stylist_services where salon_id = 'sara'),
    (select count(*) from public.stylist_workdays where salon_id = 'sara'),
    (select count(*) from private.staff where salon_id = 'sara')) $$;

set local role anon;
select throws_ok($$ select public.provision_salon(pg_temp.sara()) $$, '42501', null, 'anon cannot call provision_salon');
reset role;
set local role authenticated;
select throws_ok($$ select public.provision_salon(pg_temp.sara()) $$, '42501', null, 'authenticated cannot call provision_salon');
reset role;

set local role service_role;
select is(public.provision_salon(pg_temp.sara()), 'sara', 'provision returns the salon id');
reset role;
select is(pg_temp.sara_counts(), '1 1 7 2 1 2 5 1', 'provision creates salon, domain, hours, services, stylist, links, workdays, staff');
select is((select domain from public.salon_domains where salon_id = 'sara'), 'sara-salon.com', 'domain normalised');
select is((select palette ->> '50' || ' ' || name_ar || ' ' || rating || ' ' || whatsapp from public.salons where id = 'sara'),
  '#F0F7FF سارة بيوتي 4.7 0555123456', 'salon row written (palette upper-cased, phone normalised)');
select is((select founder_role ->> 'ar' || '|' || (address ->> 'ar') || '|' || (founder_name ->> 'ar') from public.salons where id = 'sara'),
  'Fondatrice|1 Rue X|Sara', 'empty Arabic falls back to French');
select is((select story_intro ->> 'ar' from public.salons where id = 'sara'), 'منذ ثلاث سنوات.', 'story intro written');
select is((select facebook_url from public.salons where id = 'sara'), null, 'empty url stored as null');
select is((select opens || '-' || closes from public.salon_hours where salon_id = 'sara' and weekday = 6), '10:00:00-16:00:00', 'hours written');
select is((select icon || ' ' || image || ' ' || active from public.services where id = 'sara-ongles'), 'sparkles  true', 'service defaults');

set local role service_role;
select is(public.provision_salon(pg_temp.sara()), 'sara', 'provision again');
reset role;
select is(pg_temp.sara_counts(), '1 1 7 2 1 2 5 1', 're-running leaves the same rows');

-- update through a re-run: changed values replace the old ones
set local role service_role;
select lives_ok($$ select public.provision_salon(pg_temp.sara() || '{"rating": 4.8, "domains": ["sara.dz.example"]}') $$, 'provision with changes');
reset role;
select is((select rating from public.salons where id = 'sara'), 4.8, 're-run updates the salon row');
select is((select string_agg(domain, ',') from public.salon_domains where salon_id = 'sara'), 'sara.dz.example', 're-run replaces the domain list');

set local role service_role;
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"domains": ["localhost"]}') $$, 'P0001', 'domain_taken', 'another salon''s domain');
select throws_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{services,0,id}', '"coupe-femme"')) $$, 'P0001', 'id_taken', 'another salon''s service id');
select throws_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{stylists,0,id}', '"amina"')) $$, 'P0001', 'id_taken', 'another salon''s stylist id');
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"owner_user_id": "11111111-1111-1111-1111-111111111111"}') $$, 'P0001', 'staff_taken', 'another salon''s staff');
-- A salon id that collides with an existing salon never adds a stranger to its staff (bookings would leak).
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"owner_user_id": "66666666-6666-6666-6666-666666666666"}') $$,
  'P0001', 'owner_conflict', 'existing salon with other staff: a new owner is refused');
select throws_ok($$ select public.provision_salon('{"id": "elegance", "name": "Mon salon", "owner_user_id": "77777777-7777-7777-7777-777777777777"}') $$,
  'P0001', 'owner_conflict', 'colliding with elegance''s id is refused');
select lives_ok($$ select public.provision_salon(pg_temp.sara() || '{"owner_user_id": "66666666-6666-6666-6666-666666666666", "add_owner": true}') $$,
  'add_owner: true adds a second staff login');
reset role;
select is((select string_agg(user_id::text, ',' order by user_id) from private.staff where salon_id = 'sara'),
  '55555555-5555-5555-5555-555555555555,66666666-6666-6666-6666-666666666666', 'both staff of sara');
set local role service_role;
select lives_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{id}', '"solo"') - 'domains' - 'services' - 'stylists' - 'owner_user_id') $$,
  'a salon created without an owner');
select lives_ok($$ select public.provision_salon('{"id": "solo", "name": "Solo", "owner_user_id": "77777777-7777-7777-7777-777777777777"}') $$,
  'an existing salon with no staff takes an owner without add_owner');
select throws_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{palette,600}', '"blue"')) $$, 'P0001', 'invalid_palette', 'bad palette');
select throws_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{id}', '"nouveau"') - 'hours' - 'domains' - 'services' - 'stylists' - 'owner_user_id') $$,
  'P0001', 'invalid_hours', 'hours required for a new salon');
select throws_ok($$ select public.provision_salon(jsonb_set(pg_temp.sara(), '{hours,0,opens}', '"09:10"')) $$, 'P0001', 'invalid_hours', 'bad hours');
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"whatsapp": "0123"}') $$, 'P0001', 'invalid_phone', 'bad whatsapp');
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"instagram_url": "http://instagram.com/x"}') $$, 'P0001', 'invalid_url', 'bad instagram url');
select throws_ok($$ select public.provision_salon(pg_temp.sara() || '{"facebook_url": "facebook.com/x"}') $$, 'P0001', 'invalid_url', 'bad facebook url');
select throws_ok(format($$ select public.provision_salon(pg_temp.sara() || jsonb_build_object('address', jsonb_build_object('fr', %L))) $$, repeat('a', 201)),
  'P0001', 'invalid_name', 'address too long');
select throws_ok(format($$ select public.provision_salon(pg_temp.sara() || jsonb_build_object('city', jsonb_build_object('fr', 'Oran', 'ar', %L))) $$, repeat('a', 201)),
  'P0001', 'invalid_name', 'city too long');
reset role;

-- Re-provisioning keeps the owner's Réglages edits for keys the payload leaves out.
update public.services set active = false, sort_order = 7 where id = 'sara-ongles';
delete from public.stylist_workdays where stylist_id = 'sara-yasmine' and weekday > 3;
set local role service_role;
select lives_ok($$ select public.provision_salon(pg_temp.sara() #- '{stylists,0,weekdays}') $$, 're-run without weekdays');
reset role;
select is((select active || ' ' || sort_order from public.services where id = 'sara-ongles'), 'false 7', 'deactivated service stays inactive, order kept');
select is((select string_agg(weekday::text, ',' order by weekday) from public.stylist_workdays where stylist_id = 'sara-yasmine'), '2,3',
  'custom workdays survive a re-run without weekdays');
update public.salon_hours set opens = '11:00', closes = '15:00' where salon_id = 'sara' and weekday = 6;
set local role service_role;
select lives_ok($$ select public.provision_salon(pg_temp.sara() - 'hours') $$, 're-run without hours');
reset role;
select is((select opens || '-' || closes from public.salon_hours where salon_id = 'sara' and weekday = 6), '11:00:00-15:00:00', 'hours untouched when omitted');
select is((select price from public.services where id = 'sara-ongles'), 1500, 'listed fields still written');

-- Élégance untouched by all of the above
select is((select row(salon, services, stylists, stylist_services, workdays, hours, domains)::text from pg_temp.before),
  (select row(
     (select md5(row_to_json(s)::text) from public.salons s where s.id = 'elegance'),
     (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.services x where x.salon_id = 'elegance'),
     (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.id), '')) from public.stylists x where x.salon_id = 'elegance'),
     (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.stylist_id, x.service_id), '')) from public.stylist_services x where x.salon_id = 'elegance'),
     (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.stylist_id, x.weekday), '')) from public.stylist_workdays x where x.salon_id = 'elegance'),
     (select md5(coalesce(string_agg(row_to_json(x)::text, '|' order by x.weekday), '')) from public.salon_hours x where x.salon_id = 'elegance'),
     (select md5(coalesce(string_agg(x.domain, '|' order by x.domain), '')) from public.salon_domains x where x.salon_id = 'elegance'))::text),
  'elegance rows unchanged');

select * from finish();
rollback;
