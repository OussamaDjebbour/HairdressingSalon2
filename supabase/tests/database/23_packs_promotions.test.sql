begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Élégance (seed): coupe-femme 2500/60 (Amina), coloration 6000/120 (Amina), soin-keratine 8000/150 (Amina),
-- manucure 2000/45 (Sara), maquillage 5000/90 (Leila), soin-visage 3500/75 (Leila); open Tue–Sat 09:00–18:00.

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');
-- a hidden Élégance stylist
insert into public.stylists (id, salon_id, name, role, image, active)
  values ('hidden-st', 'elegance', 'Hanane', '{"fr":"Coiffeuse","ar":"مصففة"}', '', false);

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Algiers')::date $$;

-- nth open day (Tue–Sat) strictly after today, Algiers time
create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;

-- The message and detail of the error a statement raises (throws_ok can't see the detail).
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' ' || nullif(v_detail, ''), '');
end $$;

-- The pack saved below, found by its name.
create function pg_temp.pack_id() returns text language sql as $$
  select s.id from public.services s where s.salon_id = 'elegance' and s.name ->> 'fr' = 'Pack Mariée' $$;

create function pg_temp.pack_stylists() returns text[] language sql as $$
  select coalesce(array(select ss.stylist_id from public.stylist_services ss where ss.service_id = pg_temp.pack_id()
                        order by 1), '{}') $$;

-- A client's rows as 'stylist HH:MI-HH:MI price', in start order.
create function pg_temp.rows_of(p_client text) returns text language sql as $$
  select string_agg(b.stylist_id || ' ' || to_char(b.starts_at at time zone 'Africa/Algiers', 'HH24:MI') || '-' ||
                    to_char(b.ends_at at time zone 'Africa/Algiers', 'HH24:MI') || ' ' || b.price, ', ' order by b.starts_at)
  from private.bookings b where b.client_name = p_client $$;

-- ---------------------------------------------------------------- schema
select is(array(select c.column_name::text from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = 'services'
                  and c.column_name in ('includes', 'pack_stylist_id', 'promo_price', 'promo_from', 'promo_to')
                order by 1),
  array['includes', 'pack_stylist_id', 'promo_from', 'promo_price', 'promo_to'], 'services has the pack and promotion columns');
select is((select includes::text from public.services where id = 'coupe-femme'), '{}', 'includes defaults to an empty list');
select throws_ok($$ update public.services set promo_price = 2500, promo_from = current_date, promo_to = current_date where id = 'coupe-femme' $$,
  '23514', null, 'the table refuses a promo not below the price');
select throws_ok($$ update public.services set promo_price = 100 where id = 'coupe-femme' $$,
  '23514', null, 'the table refuses a partial promo');
select throws_ok($$ update public.services set promo_price = 100, promo_from = current_date + 1, promo_to = current_date where id = 'coupe-femme' $$,
  '23514', null, 'the table refuses a promo ending before it starts');
select throws_ok($$ update public.services set category = 'pack' where id = 'coupe-femme' $$,
  '23514', null, 'the table refuses a pack without a person responsible');
select throws_ok($$ update public.services set pack_stylist_id = 'amina' where id = 'coupe-femme' $$,
  '23514', null, 'the table refuses a person responsible on a regular service');
select throws_ok($$ update public.services set category = 'pack', pack_stylist_id = 'nadia' where id = 'coupe-femme' $$,
  '23503', null, 'the table refuses another salon''s stylist as a pack''s person responsible');
select is(private.category_icon('pack'), 'gift', 'a pack''s icon is gift');

-- ---------------------------------------------------------------- effective price
update public.services set promo_price = 1500, promo_from = pg_temp.today() - 1, promo_to = pg_temp.today() + 30 where id = 'manucure';
update public.services set promo_price = 7000, promo_from = pg_temp.today(), promo_to = pg_temp.today() where id = 'soin-keratine';
update public.services set promo_price = 3000, promo_from = pg_temp.today() + 1, promo_to = pg_temp.today() + 30 where id = 'soin-visage';
update public.services set promo_price = 4000, promo_from = pg_temp.today() - 10, promo_to = pg_temp.today() - 1 where id = 'maquillage';

select is(array[private.service_price('elegance', 'manucure'), private.service_price('elegance', 'soin-keratine'),
                private.service_price('elegance', 'soin-visage'), private.service_price('elegance', 'maquillage'),
                private.service_price('elegance', 'coupe-femme')],
  array[1500, 7000, 3500, 5000, 2500], 'effective price is the promo inside its days, the price outside');
select is(array[private.service_price('elegance', 'nope'), private.service_price('elegance', 'rival-cut')], array[null, null]::integer[],
  'effective price is the promo inside its days, the price outside (unknown or another salon''s service: null)');

-- ---------------------------------------------------------------- create_visit
select lives_ok($$ select * from public.create_visit('elegance', '[{"service_id":"manucure","stylist_id":null}]',
  pg_temp.open_day(1), '10:00', 'Promo Uno', '0555100001', 'fr') $$, 'create_visit records the promo price');
select is(pg_temp.rows_of('Promo Uno'), 'sara 10:00-10:45 1500', 'create_visit records the promo price (row)');
-- soin-visage's promo covers the visit's day but not today: the booking day decides
select lives_ok($$ select * from public.create_visit('elegance', '[{"service_id":"soin-visage","stylist_id":null}]',
  pg_temp.open_day(1), '10:00', 'Promo Later', '0555100002', 'fr') $$, 'create_visit records the promo price (promo not started)');
select is(pg_temp.rows_of('Promo Later'), 'leila 10:00-11:15 3500', 'create_visit records the promo price (by the booking day, not the visit day)');

select is(pg_temp.error_of($$ select * from public.create_visit('elegance',
  '[{"service_id":"manucure","stylist_id":null},{"service_id":"coupe-femme","stylist_id":null}]',
  pg_temp.open_day(2), '10:00', 'Stale', '0555100003', 'fr', 4500) $$),
  'price_changed total:4000', 'create_visit refuses a stale total with price_changed, carrying the server total');
select is((select count(*)::int from private.bookings where client_name = 'Stale'), 0,
  'create_visit refuses a stale total with price_changed (no row)');

select lives_ok($$ select * from public.create_visit('elegance',
  '[{"service_id":"manucure","stylist_id":null},{"service_id":"coupe-femme","stylist_id":null}]',
  pg_temp.open_day(2), '10:00', 'Fresh', '0555100004', 'fr', 4000) $$, 'create_visit accepts the right total and no total');
select is(pg_temp.rows_of('Fresh'), 'sara 10:00-10:45 1500, amina 10:45-11:45 2500', 'create_visit accepts the right total and no total (rows)');
select lives_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":null}]',
  pg_temp.open_day(3), '10:00', 'No Total', '0555100005', 'fr', null) $$, 'create_visit accepts the right total and no total (null total)');
select is(pg_temp.rows_of('No Total'), 'amina 10:00-11:00 2500', 'create_visit accepts the right total and no total (null total row)');

-- ---------------------------------------------------------------- create_booking, admin_create_booking
select lives_ok($$ select * from public.create_booking('elegance', 'manucure', null, pg_temp.open_day(3), '14:00',
  'Old Path', '0555100006', 'fr') $$, 'create_booking and admin_create_booking record the promo price (create_booking)');
select is(pg_temp.rows_of('Old Path'), 'sara 14:00-14:45 1500', 'create_booking and admin_create_booking record the promo price (create_booking row)');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_create_booking('manucure', 'sara', pg_temp.open_day(4), '15:00', 'Owner Made', '0555100007', 'fr') $$,
  'create_booking and admin_create_booking record the promo price (admin_create_booking)');
reset role;
select is(pg_temp.rows_of('Owner Made'), 'sara 15:00-15:45 1500', 'create_booking and admin_create_booking record the promo price (admin_create_booking row)');

-- ---------------------------------------------------------------- admin_update_booking
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
values ('f1000000-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina',
        (pg_temp.open_day(5) + time '10:00') at time zone 'Africa/Algiers',
        (pg_temp.open_day(5) + time '11:00') at time zone 'Africa/Algiers', 2400, 'Kept', '0555100008', 'fr', 'confirmed', 'staff');
set local role authenticated;
select lives_ok($$ select public.admin_update_booking('f1000000-0000-0000-0000-000000000001', 'coupe-femme', 'amina',
  pg_temp.open_day(5), '11:00', 'Kept', '0555100008', 'fr') $$, 'admin_update_booking keeps the price unless the service changes (time)');
reset role;
select is(pg_temp.rows_of('Kept'), 'amina 11:00-12:00 2400', 'admin_update_booking keeps the price unless the service changes (price kept)');
set local role authenticated;
select lives_ok($$ select public.admin_update_booking('f1000000-0000-0000-0000-000000000001', 'manucure', 'amina',
  pg_temp.open_day(5), '11:00', 'Kept', '0555100008', 'fr') $$, 'admin_update_booking keeps the price unless the service changes (service)');
reset role;
select is(pg_temp.rows_of('Kept'), 'amina 11:00-11:45 1500', 'admin_update_booking keeps the price unless the service changes (new service, promo price)');

-- ---------------------------------------------------------------- packs
set local role authenticated;
select lives_ok($$ select public.admin_save_service(null, '{"fr":"Pack Mariée","ar":""}', '{"fr":"Le grand jour","ar":""}',
  'pack', 25000, 180, 0, array['coupe-femme', 'maquillage', 'coupe-femme'], 'amina') $$,
  'a pack is saved with its person responsible as its only stylist_services row');
reset role;
select is((select category || ' ' || icon || ' ' || pack_stylist_id || ' ' || includes::text from public.services where id = pg_temp.pack_id()),
  'pack gift amina {coupe-femme,maquillage}', 'a pack is saved with its person responsible as its only stylist_services row (pack row)');
select is(pg_temp.pack_stylists(), array['amina'], 'a pack is saved with its person responsible as its only stylist_services row (amina)');
set local role authenticated;
select lives_ok($$ select public.admin_save_service(pg_temp.pack_id(), '{"fr":"Pack Mariée","ar":""}', null,
  'pack', 25000, 180, null, array['coupe-femme', 'maquillage', 'soin-visage'], 'leila') $$,
  'a pack is saved with its person responsible as its only stylist_services row (re-saved)');
reset role;
select is(pg_temp.pack_stylists(), array['leila'], 'a pack is saved with its person responsible as its only stylist_services row (now leila only)');

set local role authenticated;
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, '{}', null) $$,
  'P0001', 'invalid_pack', 'a pack needs an active person responsible of the salon (none)');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, '{}', 'ghost') $$,
  'P0001', 'invalid_pack', 'a pack needs an active person responsible of the salon (unknown)');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, '{}', 'hidden-st') $$,
  'P0001', 'invalid_pack', 'a pack needs an active person responsible of the salon (hidden)');
select throws_ok($$ select public.admin_save_service(pg_temp.pack_id(), '{"fr":"Pack Mariée","ar":""}', null, 'pack', 25000, 180, null, '{}', null) $$,
  'P0001', 'invalid_pack', 'a pack needs an active person responsible of the salon (existing pack)');

select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, array[pg_temp.pack_id()], 'leila') $$,
  'P0001', 'invalid_pack', 'a pack''s includes must be this salon''s services, not packs (a pack)');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, array['nope'], 'leila') $$,
  'P0001', 'invalid_pack', 'a pack''s includes must be this salon''s services, not packs (unknown)');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Pack Sans","ar":""}', null, 'pack', 1000, 60, 0, array[null::text], 'leila') $$,
  'P0001', 'invalid_pack', 'a pack''s includes must be this salon''s services, not packs (null)');
reset role;
select is((select count(*)::int from public.services where name ->> 'fr' = 'Pack Sans'), 0, 'a pack''s includes must be this salon''s services, not packs (nothing saved)');
update public.services set active = false where id = 'soin-keratine';
set local role authenticated;
select lives_ok($$ select public.admin_save_service(null, '{"fr":"Pack Soin","ar":""}', null, 'pack', 9000, 120, 0, array['soin-keratine'], 'leila') $$,
  'a pack''s includes must be this salon''s services, not packs (a hidden service is fine)');

select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe","ar":""}', null, 'pack', 2500, 60, null, '{}', 'amina') $$,
  'P0001', 'invalid_pack', 'a service can''t become a pack and a pack can''t change category (to pack)');
select throws_ok($$ select public.admin_save_service(pg_temp.pack_id(), '{"fr":"Pack Mariée","ar":""}', null, 'coiffure', 25000, 180, null) $$,
  'P0001', 'invalid_pack', 'a service can''t become a pack and a pack can''t change category (from pack)');
reset role;
select is((select string_agg(category, ' ' order by id = 'coupe-femme' desc) from public.services where id in ('coupe-femme', pg_temp.pack_id())),
  'coiffure pack', 'a service can''t become a pack and a pack can''t change category (unchanged)');

set local role authenticated;
select lives_ok($$ select public.admin_save_service(null, '{"fr":"Brushing","ar":""}', null, 'coiffure', 1500, 30, 9, array['coupe-femme'], 'amina') $$,
  'a regular service ignores the pack fields');
reset role;
select is((select includes::text || ' ' || coalesce(pack_stylist_id, '-') from public.services where name ->> 'fr' = 'Brushing'), '{} -',
  'a regular service ignores the pack fields (stored empty)');

-- ---------------------------------------------------------------- stylist saves skip packs
set local role authenticated;
select lives_ok($$ select public.admin_save_stylist('leila', 'Leila', '{"fr":"Esthéticienne","ar":""}', array['maquillage', 'soin-visage'], array[2, 3, 4, 5, 6]::smallint[]) $$,
  'saving the person responsible keeps her pack');
reset role;
select is(pg_temp.pack_stylists(), array['leila'], 'saving the person responsible keeps her pack (row kept)');
set local role authenticated;
select lives_ok($$ select public.admin_save_stylist('amina', 'Amina', '{"fr":"Coiffeuse","ar":""}',
  array['coupe-femme', 'coloration', 'soin-keratine', pg_temp.pack_id()], array[2, 3, 4, 5, 6]::smallint[]) $$,
  'saving the person responsible keeps her pack (another stylist sends the pack)');
reset role;
select is(pg_temp.pack_stylists(), array['leila'], 'saving the person responsible keeps her pack (pack ids sent to another stylist are ignored)');
select is(array(select service_id from public.stylist_services where stylist_id = 'amina' order by 1),
  array['coloration', 'coupe-femme', 'soin-keratine'], 'saving the person responsible keeps her pack (amina''s own list)');

-- ---------------------------------------------------------------- a pack in a visit
select lives_ok(format($$ select * from public.create_visit('elegance',
  '[{"service_id":"%s","stylist_id":null},{"service_id":"maquillage","stylist_id":"leila"}]',
  pg_temp.open_day(4), '09:00', 'Mariee', '0555100009', 'fr', 30000) $$, pg_temp.pack_id()),
  'a pack and a service by the same person are placed back to back');
select is(pg_temp.rows_of('Mariee'), 'leila 09:00-12:00 25000, leila 12:00-13:30 5000',
  'a pack and a service by the same person are placed back to back (rows)');
select is(pg_temp.error_of(format($$ select * from public.create_visit('elegance', '[{"service_id":"%s","stylist_id":"amina"}]',
  pg_temp.open_day(5), '14:00', 'Wrong', '0555100010', 'fr') $$, pg_temp.pack_id())),
  'unknown_service', 'a pack is booked only with its person responsible');

-- ---------------------------------------------------------------- promotions in the owner form
set local role authenticated;
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2000, 60, null,
  '{}', null, 2000, pg_temp.today(), pg_temp.today() + 7) $$,
  'P0001', 'invalid_promo', 'a promo must stay below the price (equal)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 1800, 60, null,
  '{}', null, 2000, pg_temp.today(), pg_temp.today() + 7) $$,
  'P0001', 'invalid_promo', 'a promo must stay below the price (above)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, -1, pg_temp.today(), pg_temp.today() + 7) $$,
  'P0001', 'invalid_promo', 'a promo must stay below the price (negative)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, 2000, null, null) $$,
  'P0001', 'invalid_promo', 'promo needs all three fields and from <= to (price only)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, 2000, pg_temp.today(), null) $$,
  'P0001', 'invalid_promo', 'promo needs all three fields and from <= to (no last day)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, null, pg_temp.today(), pg_temp.today()) $$,
  'P0001', 'invalid_promo', 'promo needs all three fields and from <= to (no price)');
select throws_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, 2000, pg_temp.today() + 5, pg_temp.today()) $$,
  'P0001', 'invalid_promo', 'promo needs all three fields and from <= to (from after to)');
select lives_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null,
  '{}', null, 2000, pg_temp.today(), pg_temp.today() + 7) $$,
  'promo needs all three fields and from <= to (a valid promo)');
reset role;
select is((select promo_price || ' ' || (promo_from = pg_temp.today()) || ' ' || (promo_to = pg_temp.today() + 7) || ' ' ||
                  private.service_price('elegance', 'coupe-femme') from public.services where id = 'coupe-femme'),
  '2000 true true 2000', 'promo needs all three fields and from <= to (stored, and it is the effective price)');
set local role authenticated;
select lives_ok($$ select public.admin_save_service('coupe-femme', '{"fr":"Coupe & Brushing","ar":""}', null, 'coiffure', 2500, 60, null) $$,
  'promo needs all three fields and from <= to (saving without one clears it)');
reset role;
select is((select coalesce(promo_price::text, '-') || ' ' || coalesce(promo_from::text, '-') || ' ' || coalesce(promo_to::text, '-')
           from public.services where id = 'coupe-femme'),
  '- - -', 'promo needs all three fields and from <= to (cleared)');

select * from finish();
rollback;
