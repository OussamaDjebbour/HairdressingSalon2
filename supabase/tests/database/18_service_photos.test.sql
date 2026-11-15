begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rival@test.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local');
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 'scissors');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into private.staff (user_id, salon_id) values ('44444444-4444-4444-4444-444444444444', 'rival');
insert into private.staff (user_id, salon_id, role) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'elegance', 'demo');

-- uploaded files, seeded as superuser (the storage API would insert these rows)
insert into storage.buckets (id, name, public) values ('other', 'other', true);
insert into storage.objects (bucket_id, name) values
  ('salon-photos', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'),
  ('salon-photos', 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp'),
  ('salon-photos', 'elegance/uploads/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg'),
  ('salon-photos', 'elegance/coupe.jpg'),
  ('salon-photos', 'rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg'),
  ('other', 'elegance/uploads/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.image(p_id text) returns text language sql as $$
  select image from public.services where id = p_id $$;

-- the bucket takes only these images (no SVG), 20 MB max
select is((select allowed_mime_types::text || ' ' || file_size_limit from storage.buckets where id = 'salon-photos'),
  '{image/jpeg,image/png,image/webp,image/avif,image/gif} 20971520', 'salon-photos accepts jpeg/png/webp/avif/gif (no svg) up to 20 MB');

-- grants
select ok(has_function_privilege('authenticated', 'public.admin_set_service_photo(text, text)', 'execute'), 'authenticated can call admin_set_service_photo');
select ok(not has_function_privilege('anon', 'public.admin_set_service_photo(text, text)', 'execute'), 'anon cannot call admin_set_service_photo');

-- the owner sets, replaces and removes a photo
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_set_service_photo('coupe-femme', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'), null,
  'replacing a web address returns nothing to delete');
select is(pg_temp.image('coupe-femme'), 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'the path is stored as is');
select is(public.admin_set_service_photo('coupe-femme', 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp'),
  'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'replacing an upload returns the old upload (deletable)');
select is(pg_temp.image('coupe-femme'), 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp', 'a webp upload is stored');
select is(public.admin_set_service_photo('coupe-femme', 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp'), null,
  'setting the same upload again returns nothing (the file is still in use)');
select is(public.admin_set_service_photo('coupe-femme', null),
  'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp', 'removing returns the old upload');
select is(pg_temp.image('coupe-femme'), '', 'removing stores an empty image');
select is(public.admin_set_service_photo('coupe-femme', ''), null, 'removing again ('''') returns nothing');
select is(pg_temp.image('coupe-femme'), '', 'still no image');
reset role;

-- files the script set up (web address or <salon>/<file>) are never handed back for deletion
update public.services set image = 'https://images.pexels.com/x.jpg' where id = 'coloration';
update public.services set image = 'elegance/coupe.jpg' where id = 'manucure';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_set_service_photo('coloration', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'), null,
  'replacing a pexels address returns nothing');
select is(public.admin_set_service_photo('manucure', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'), null,
  'replacing a script file returns nothing');
select is(pg_temp.image('manucure'), 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'the script file is replaced');

-- an upload still used by another service of the salon is not handed back
select is(public.admin_set_service_photo('coloration', 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp'), null,
  'replacing an upload another service still uses returns nothing');
select is(pg_temp.image('manucure'), 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'the other service still points at it');

-- only an existing file of the caller's own uploads folder is accepted
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg') $$,
  'P0001', 'invalid_photo', 'another salon''s upload is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'elegance/coupe.jpg') $$,
  'P0001', 'invalid_photo', 'a file outside uploads/ is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'elegance/uploads/../x.jpg') $$,
  'P0001', 'invalid_photo', 'a path with .. is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'elegance/uploads/99999999-9999-9999-9999-999999999999.jpg') $$,
  'P0001', 'invalid_photo', 'a well-formed path that was never uploaded is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'elegance/uploads/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg') $$,
  'P0001', 'invalid_photo', 'a file of another bucket is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'https://evil.example/x.jpg') $$,
  'P0001', 'invalid_photo', 'a web address is invalid_photo');
select throws_ok($$ select public.admin_set_service_photo('rival-cut', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg') $$,
  'P0001', 'not_found', 'another salon''s service is not_found');
reset role;
select is(pg_temp.image('maquillage'), 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=600',
  'refused calls change nothing');
select is(pg_temp.image('rival-cut'), 'rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 'the rival service is unchanged');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_set_service_photo('coupe-femme', null) $$, 'P0001', 'not_authorized', 'non-staff refused');
reset role;

-- the demo account cannot change photos
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select throws_ok($$ select public.admin_set_service_photo('manucure', null) $$, 'P0001', 'demo_disabled', 'demo cannot remove a photo');
select throws_ok($$ select public.admin_set_service_photo('maquillage', 'elegance/uploads/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg') $$,
  'P0001', 'demo_disabled', 'demo cannot set a photo');
reset role;
select is(pg_temp.image('manucure') || ' ' || pg_temp.image('maquillage'),
  'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=600',
  'demo calls change nothing');

-- storage policies: the owner writes only her own salon's uploads folder
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/12345678-1234-1234-1234-123456789012.jpg') $$,
  'owner uploads into her uploads folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'rival/uploads/12345678-1234-1234-1234-123456789012.jpg') $$,
  '42501', null, 'owner cannot upload into another salon''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/x.jpg') $$,
  '42501', null, 'owner cannot upload outside uploads/ (the script''s files)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('other', 'elegance/uploads/12345678-1234-1234-1234-123456789012.jpg') $$,
  '42501', null, 'owner cannot upload into another bucket');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/../x.jpg') $$,
  '42501', null, 'owner cannot upload a name with ..');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/12345678-1234-1234-1234-123456789012.html') $$,
  '42501', null, 'owner cannot upload a non-image name (.html)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/photo.jpg') $$,
  '42501', null, 'owner cannot upload a name that is not a uuid');
select is((select count(*)::int from storage.objects where bucket_id = 'salon-photos'), 4, 'owner sees only her own uploads (3 seeded + 1 new)');
with u as (update storage.objects set name = 'elegance/uploads/eeeeeeee-eeee-eeee-eeee-000000000000.jpg' where name = 'elegance/uploads/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg' returning 1)
  select is(count(*)::int, 0, 'owner cannot update (overwrite or rename) a file') from u;
select set_config('storage.allow_delete_query', 'true', true);
with d as (delete from storage.objects where name = 'rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg' returning 1)
  select is(count(*)::int, 0, 'owner cannot delete another salon''s upload') from d;
with d as (delete from storage.objects where name = 'elegance/coupe.jpg' returning 1)
  select is(count(*)::int, 0, 'owner cannot delete the script''s files') from d;
with d as (delete from storage.objects where name = 'elegance/uploads/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg' returning 1)
  select is(count(*)::int, 1, 'owner deletes her own upload') from d;
reset role;
select is((select count(*)::int from storage.objects where name in ('rival/uploads/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 'elegance/coupe.jpg')), 2,
  'the protected files are still there');

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/22222222-1234-1234-1234-123456789012.jpg') $$,
  '42501', null, 'the demo account cannot upload, even into its salon''s folder');
reset role;

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
set local role authenticated;
select is((select count(*)::int from storage.objects where name like 'elegance/uploads/%'), 0, 'rival staff see none of elegance''s uploads');
reset role;

set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/33333333-1234-1234-1234-123456789012.jpg') $$,
  '42501', null, 'anon cannot upload');
reset role;

-- on a demo salon, old uploads are kept (the reset snapshot may point at them)
update public.salons set demo = true where id = 'elegance';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is(public.admin_set_service_photo('manucure', 'elegance/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp'), null,
  'demo salon: replacing an upload returns nothing to delete');
reset role;

select * from finish();
rollback;
