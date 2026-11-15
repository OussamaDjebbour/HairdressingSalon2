begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

-- Items shorthand in the descriptions: C = coupe-femme with Amina (60 min, 2500), K = coloration with Amina
-- (120 min, 6000), M = manucure, no preference (45 min, Sara only). Élégance opens Tue–Sat 09:00–18:00.

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

-- A direct online booking (plpgsql so the file loads before visit_id exists).
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_phone text default '0550000000',
                             p_status text default 'pending', p_visit uuid default null, p_ip inet default null,
                             p_minutes int default 60)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into private.bookings (salon_id, visit_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang, status)
  values ('elegance', coalesce(p_visit, gen_random_uuid()), 'coupe-femme', p_stylist,
          (p_day + p_time) at time zone 'Africa/Algiers',
          ((p_day + p_time) at time zone 'Africa/Algiers') + make_interval(mins => p_minutes),
          2500, 'Seed Client', p_phone, p_ip, 'fr', p_status)
  returning id into v_id;
  return v_id;
end $$;

-- n online visits of 2 rows each for a phone, created now (cancelled ones stay out of the overlap rule).
create function pg_temp.visits(p_n int, p_day date, p_phone text, p_status text default 'pending', p_ip inet default null)
returns void language plpgsql as $$
declare v_visit uuid;
begin
  for i in 0 .. p_n - 1 loop
    v_visit := gen_random_uuid();
    perform pg_temp.book('amina', p_day, make_time(9 + (i * 2) % 8, 0, 0), p_phone, p_status, v_visit, p_ip);
    perform pg_temp.book('amina', p_day, make_time(10 + (i * 2) % 8, 0, 0), p_phone, p_status, v_visit, p_ip);
  end loop;
end $$;

create function pg_temp.local(p timestamptz) returns text language sql as $$
  select to_char(p at time zone 'Africa/Algiers', 'HH24:MI') $$;

-- ---------------------------------------------------------------- schema
select has_column('private', 'bookings', 'visit_id', 'bookings.visit_id exists');
select col_not_null('private', 'bookings', 'visit_id', 'bookings.visit_id is not null');
select col_has_default('private', 'bookings', 'visit_id', 'bookings.visit_id has a default');
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
values ('elegance', 'maquillage', 'leila', '2030-01-08 09:00+01', '2030-01-08 10:30+01', 5000, 'Default A', '0550000001', 'fr', 'staff'),
       ('elegance', 'maquillage', 'leila', '2030-01-08 11:00+01', '2030-01-08 12:30+01', 5000, 'Default B', '0550000002', 'fr', 'staff');
select is((select count(distinct visit_id)::int from private.bookings where client_name in ('Default A', 'Default B')), 2,
          'each booking is its own visit by default');
select has_index('private', 'bookings', 'bookings_visit_idx', array['salon_id', 'visit_id'], 'visit index');

-- ---------------------------------------------------------------- get_visit_slots: validation
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), '[]') $$, 'P0001', 'unknown_service', 'empty list');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), '{}') $$, 'P0001', 'unknown_service', 'not an array');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), null) $$, 'P0001', 'unknown_service', 'null list');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"stylist_id":"amina"}]') $$, 'P0001', 'unknown_service', 'item without service');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(),
  '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"coupe-femme","stylist_id":"amina"}]') $$, 'P0001', 'unknown_service', 'duplicate service');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(),
  '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"coloration","stylist_id":null},{"service_id":"soin-keratine","stylist_id":null},{"service_id":"manucure","stylist_id":null},{"service_id":"maquillage","stylist_id":null}]') $$,
  'P0001', 'too_many_services', 'more than four services');
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"service_id":"coupe-femme","stylist_id":"sara"}]') $$, 'P0001', 'unknown_service', 'stylist not offering');

-- ---------------------------------------------------------------- get_visit_slots: results
-- Amina is booked 11:00–12:00 on the first open day.
select pg_temp.book('amina', pg_temp.open_day(), '11:00');
create temp table ck as
  select * from public.get_visit_slots('elegance', pg_temp.open_day(),
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"coloration","stylist_id":"amina"}]');
select is((select count(*)::int from ck), 17, '[C, K]: 17 start times');
select is((select min(slot) from ck), '09:00', '[C, K]: the grid starts at opening');
select is((select max(slot) from ck), '17:00', '[C, K]: the grid stops at closing minus the first part');
select is((select missing from ck where slot = '09:00'), '{1}'::int[], '09:00: K overlaps Amina''s booking');
select is((select missing from ck where slot = '10:00'), '{1}'::int[], '10:00: K overlaps Amina''s booking');
select is((select missing from ck where slot = '10:30'), '{0,1}'::int[], '10:30: both parts overlap');
select is((select missing::text || ' ' || available from ck where slot = '12:00'), '{} true', '12:00: the whole visit fits');
select is((select missing from ck where slot = '16:00'), '{1}'::int[], '16:00: K would end past closing');
select ok((select bool_and(available = (missing = '{}'::int[])) from ck), 'available exactly where nothing is missing');

select results_eq(
  $$ select slot, available from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"service_id":"coupe-femme","stylist_id":"amina"}]') $$,
  $$ select slot, available from public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme', 'amina') $$,
  'a visit of one has the same slots as get_slots');
select ok((select bool_and(missing in ('{}'::int[], '{0}'::int[]))
           from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"service_id":"coupe-femme","stylist_id":"amina"}]')),
          'a visit of one only ever misses part 0');

-- Sara (the only manucure stylist) is off on the second open day.
insert into public.stylist_days_off (salon_id, stylist_id, starts_on, ends_on) values ('elegance', 'sara', pg_temp.open_day(2), pg_temp.open_day(2));
create temp table cm_off as
  select * from public.get_visit_slots('elegance', pg_temp.open_day(2),
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]');
select ok((select bool_and(1 = any(missing)) from cm_off), 'a part impossible all day is missing at every slot');
select ok((select bool_or(missing = '{1}'::int[]) from cm_off), 'the other part still fits where only that part is missing');
create temp table mc_off as
  select * from public.get_visit_slots('elegance', pg_temp.open_day(2),
    '[{"service_id":"manucure","stylist_id":null},{"service_id":"coupe-femme","stylist_id":"amina"}]');
select ok((select missing from mc_off where slot = '09:00') = '{0}'::int[]
          and (select bool_and(missing @> '{0}'::int[]) from mc_off where cardinality(missing) > 0),
          'get_visit_slots: placement and indexes follow p_items order');
-- Amina is booked 10:00–11:00 on the seventh open day: [M, C] at 09:00 puts C at 09:45–10:45 (salon order would fit).
select pg_temp.book('amina', pg_temp.open_day(7), '10:00');
select is((select missing from public.get_visit_slots('elegance', pg_temp.open_day(7),
             '[{"service_id":"manucure","stylist_id":null},{"service_id":"coupe-femme","stylist_id":"amina"}]') where slot = '09:00'),
          '{1}'::int[], 'get_visit_slots: the second part starts when the first ends');

select is((select count(*)::int from public.get_visit_slots('elegance', (now() at time zone 'Africa/Algiers')::date - 1,
             '[{"service_id":"coupe-femme","stylist_id":"amina"}]')), 0, 'yesterday: no slots');
select is((select count(*)::int from public.get_visit_slots('elegance', (now() at time zone 'Africa/Algiers')::date + 14,
             '[{"service_id":"coupe-femme","stylist_id":"amina"}]')), 0, 'today + 14: no slots');

-- ---------------------------------------------------------------- create_visit
create temp table happy as
  select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]',
    pg_temp.open_day(3), '09:00', '  Lina  ', '0555 11 22 33', 'fr')
  with ordinality as r(booking_id, service_id, stylist_id, starts_at, n);
select is((select count(*)::int from happy), 2, 'create_visit returns one row per part');
select is(array(select service_id from happy order by n), array['coupe-femme', 'manucure'], 'create_visit: services in p_items order');
select is(array(select stylist_id from happy order by n), array['amina', 'sara'], 'create_visit: each part''s stylist');
select is(array(select pg_temp.local(starts_at) from happy order by n), array['09:00', '10:00'], 'create_visit: parts back to back');
select is((select count(distinct b.visit_id)::int from private.bookings b join happy h on h.booking_id = b.id), 1, 'the parts share one visit_id');
select is((select string_agg(distinct b.status || ' ' || b.source, ',') from private.bookings b join happy h on h.booking_id = b.id),
          'pending online', 'the parts are pending online bookings');
select is(array(select b.price from private.bookings b join happy h on h.booking_id = b.id order by h.n), array[2500, 2000], 'prices from services');
select is(array(select (extract(epoch from b.ends_at - b.starts_at) / 60)::int from private.bookings b join happy h on h.booking_id = b.id order by h.n),
          array[60, 45], 'durations from services');
select is((select string_agg(distinct b.client_name || ' ' || b.client_phone, ',') from private.bookings b join happy h on h.booking_id = b.id),
          'Lina 0555112233', 'name trimmed, phone normalised');

select lives_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"coloration","stylist_id":"amina"}]',
    pg_temp.open_day(4), '09:00', 'Back', '0555 11 22 44', 'fr') $$, 'create_visit: same stylist back to back');
select is(array(select pg_temp.local(b.starts_at) || '-' || pg_temp.local(b.ends_at) from private.bookings b
                where b.client_name = 'Back' and b.stylist_id = 'amina' order by b.starts_at),
          array['09:00-10:00', '10:00-12:00'], 'Amina has both parts, touching');

insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'leila', 'coupe-femme');
select pg_temp.book('amina', pg_temp.open_day(5), '09:00');
select is(array(select stylist_id from public.create_visit('elegance',
            '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"manucure","stylist_id":null}]',
            pg_temp.open_day(5), '09:00', 'Auto', '0555 11 22 55', 'fr')),
          array['leila', 'sara'], 'no preference is assigned per part');

select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":"amina"}]', pg_temp.open_day(), '12:00', 'A', '0555123456', 'fr') $$,
  'P0001', 'invalid_name', 'create_visit: name too short');
select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":"amina"}]', pg_temp.open_day(), '12:00', 'Amel', '021 12 34 56', 'fr') $$,
  'P0001', 'invalid_phone', 'create_visit: landline rejected');
select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":"amina"}]', pg_temp.open_day(), '09:15', 'Amel', '0555123456', 'fr') $$,
  'P0001', 'outside_hours', 'create_visit: off the 30-min grid');
select throws_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"coloration","stylist_id":"amina"}]', pg_temp.open_day(), '15:30', 'Amel', '0555123456', 'fr') $$,
  'P0001', 'outside_hours', 'create_visit: the whole visit must end by closing');
select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":"amina"}]', (now() at time zone 'Africa/Algiers')::date - 1, '12:00', 'Amel', '0555123456', 'fr') $$,
  'P0001', 'outside_hours', 'create_visit: past date');
select throws_ok($$ select * from public.create_visit('elegance', '[]', pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$,
  'P0001', 'unknown_service', 'create_visit: empty list');
select throws_ok($$ select * from public.create_visit('elegance',
  '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"coloration","stylist_id":null},{"service_id":"soin-keratine","stylist_id":null},{"service_id":"manucure","stylist_id":null},{"service_id":"maquillage","stylist_id":null}]',
  pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'too_many_services', 'create_visit: more than four services');

-- all or nothing: Sara is busy at 10:00, so M can't follow C
select pg_temp.book('sara', pg_temp.open_day(6), '10:00');
select is(pg_temp.error_of($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]',
    pg_temp.open_day(6), '09:00', 'Atomic', '0555 11 22 66', 'fr') $$), 'slot_taken item:1', 'the error names the part that failed');
select is((select count(*)::int from private.bookings where client_name = 'Atomic'), 0, 'nothing inserted when one part is taken');
-- [M, C] on the seventh open day: C (index 1) at 09:45 overlaps Amina's 10:00
select is(pg_temp.error_of($$ select * from public.create_visit('elegance',
    '[{"service_id":"manucure","stylist_id":null},{"service_id":"coupe-femme","stylist_id":"amina"}]',
    pg_temp.open_day(7), '09:00', 'Order', '0555 11 22 77', 'fr') $$), 'slot_taken item:1', 'create_visit: places and indexes in p_items order');

-- ---------------------------------------------------------------- limits count visits
delete from private.bookings;
select pg_temp.visits(2, pg_temp.open_day(), '0770000009');
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '14:00', 'Hana', '0770000009', 'fr') $$,
  'create_booking counts visits, not rows');
select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"manucure","stylist_id":null}]', pg_temp.open_day(), '16:00', 'Hana', '0770000009', 'fr') $$,
  'P0001', 'too_many_bookings', 'create_visit: a fourth upcoming visit for a phone');

delete from private.bookings;
select pg_temp.visits(2, pg_temp.open_day(4), '0770000010');
select lives_ok($$ select * from public.create_visit('elegance',
  '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"coloration","stylist_id":null},{"service_id":"soin-keratine","stylist_id":null},{"service_id":"manucure","stylist_id":null}]',
  pg_temp.open_day(3), '09:00', 'Quatre', '0770000010', 'fr') $$, 'a 4-part visit counts once');

delete from private.bookings;
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.77"}', true);
select pg_temp.visits(4, pg_temp.open_day(), '0550000077', 'cancelled', '203.0.113.77');
select lives_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]', pg_temp.open_day(), '09:00', 'Ipa', '0551000001', 'fr') $$,
  'create_visit: a fifth visit from one IP within an hour');
select throws_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]', pg_temp.open_day(), '13:00', 'Ipb', '0551000002', 'fr') $$,
  'P0001', 'rate_limited', 'create_visit: a sixth visit from one IP within an hour');
select set_config('request.headers', '{}', true);

delete from private.bookings;
select pg_temp.visits(19, pg_temp.open_day(), '0550000088', 'cancelled');
select lives_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]', pg_temp.open_day(), '09:00', 'Swa', '0551000003', 'fr') $$,
  'create_visit: the twentieth visit in ten minutes');
select throws_ok($$ select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]', pg_temp.open_day(), '13:00', 'Swb', '0551000004', 'fr') $$,
  'P0001', 'rate_limited', 'create_visit: circuit breaker counts visits');

-- ---------------------------------------------------------------- one push per visit
delete from private.bookings;
select vault.create_secret('http://example.invalid/notify', 'notify_booking_url');
select vault.create_secret('s3cret', 'notify_booking_secret');
insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into private.push_subscriptions (endpoint, user_id, salon_id, p256dh, auth, lang)
values ('https://push.example/visit', '11111111-1111-1111-1111-111111111111', 'elegance', 'k', 'a', 'fr');
create function pg_temp.queued() returns int language sql as $$ select count(*)::int from net.http_request_queue $$;
create function pg_temp.last_body() returns jsonb language sql as $$
  select convert_from(body, 'utf8')::jsonb from net.http_request_queue order by id desc limit 1 $$;

create temp table q0 as select pg_temp.queued() as n;
create temp table pushed as
  select * from public.create_visit('elegance',
    '[{"service_id":"coupe-femme","stylist_id":"amina"},{"service_id":"manucure","stylist_id":null}]',
    pg_temp.open_day(5), '14:00', 'Pushy', '0551000005', 'fr')
  with ordinality as r(booking_id, service_id, stylist_id, starts_at, n);
select is(pg_temp.queued() - (select n from q0), 1, 'one push per visit');
select is(jsonb_array_length(pg_temp.last_body() -> 'booking' -> 'parts'), 2, 'the push lists both parts');
select is(pg_temp.last_body() -> 'booking' -> 'parts' -> 0 -> 'service_name' ->> 'fr', 'Coupe & Brushing', 'parts carry the service names in visit order');
select is(pg_temp.last_body() -> 'booking' -> 'parts' -> 1 ->> 'stylist_name', 'Sara', 'parts carry the stylist names');
select is(pg_temp.last_body() -> 'booking' ->> 'id', (select booking_id::text from pushed where n = 1), 'the push opens the first part');
select is((pg_temp.last_body() -> 'booking' ->> 'client_name') || ' ' || (pg_temp.last_body() -> 'booking' ->> 'stylist_name') || ' '
          || (pg_temp.last_body() -> 'booking' -> 'service_name' ->> 'fr') || ' ' || (pg_temp.last_body() -> 'booking' ->> 'salon_name'),
          'Pushy Amina Coupe & Brushing Élégance', 'the first part''s fields travel as for a single booking');

delete from q0;
insert into q0 select pg_temp.queued();
select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(5), '16:00', 'Single', '0551000006', 'fr');
select is(pg_temp.queued() - (select n from q0), 1, 'single booking push unchanged');

delete from q0;
insert into q0 select pg_temp.queued();
select pg_temp.book('leila', pg_temp.open_day(5), '09:00', '0551000007');
select is(pg_temp.queued() - (select n from q0), 1, 'the suppression does not outlive create_visit');

select * from finish();
rollback;
