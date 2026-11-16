begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- A visit's parts as 'date HH:MI-HH:MI stylist status price', in start order (all rows, cancelled included).
create function pg_temp.parts(p_visit uuid) returns text language sql as $$
  select string_agg(to_char(b.starts_at at time zone 'Africa/Algiers', 'YYYY-MM-DD HH24:MI') || '-' ||
                    to_char(b.ends_at at time zone 'Africa/Algiers', 'HH24:MI') || ' ' || b.stylist_id || ' ' || b.status || ' ' || b.price,
                    ', ' order by b.starts_at, b.id)
  from private.bookings b where b.visit_id = p_visit $$;

-- Calls p_sql and saves the error's message and detail (pgTAP can't read the detail).
create temp table err (k text, msg text, detail text);
grant all on err to authenticated;
create function pg_temp.capture(p_key text, p_sql text) returns void language plpgsql as $$
declare
  v_msg text;
  v_detail text;
begin
  execute p_sql;
  insert into pg_temp.err values (p_key, 'no error', null);
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  insert into pg_temp.err values (p_key, v_msg, v_detail);
end $$;

-- Tue–Sat 2030-01-08..12 are open 09:00–18:00; Monday 2030-01-07 is closed.
insert into private.bookings (id, visit_id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
values
  -- V (remove): Amina coupe 10:00-11:00 + Amina coloration 11:00-13:00 on the 8th
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina', '2030-01-08 10:00+01', '2030-01-08 11:00+01', 2500, 'Vera', '0555000101', 'fr', 'pending', 'online'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'elegance', 'coloration', 'amina', '2030-01-08 11:00+01', '2030-01-08 13:00+01', 6000, 'Vera', '0555000101', 'fr', 'pending', 'online'),
  -- L: a lone booking (its own visit), Leila on the 8th
  ('e2000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'elegance', 'maquillage', 'leila', '2030-01-08 10:00+01', '2030-01-08 11:30+01', 5000, 'Lina', '0555000102', 'fr', 'pending', 'online'),
  -- X: Sara coupe 09:00-10:00 + Sara manucure 16:00-16:45 on the 9th (a gap)
  ('e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'elegance', 'coupe-femme', 'sara', '2030-01-09 09:00+01', '2030-01-09 10:00+01', 2500, 'Xena', '0555000103', 'fr', 'pending', 'online'),
  ('e3000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'elegance', 'manucure', 'sara', '2030-01-09 16:00+01', '2030-01-09 16:45+01', 2000, 'Xena', '0555000103', 'fr', 'pending', 'online'),
  -- S: Amina coupe 10:00-11:00 + Amina coloration 11:00-13:00 on the 9th (same stylist back to back)
  ('e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'elegance', 'coupe-femme', 'amina', '2030-01-09 10:00+01', '2030-01-09 11:00+01', 2500, 'Sana', '0555000104', 'fr', 'pending', 'online'),
  ('e4000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'elegance', 'coloration', 'amina', '2030-01-09 11:00+01', '2030-01-09 13:00+01', 6000, 'Sana', '0555000104', 'fr', 'pending', 'online'),
  -- K: confirmed, Leila maquillage stored as 60 min (service is 90) + soin-visage 11:00-12:15 on the 9th
  ('e5000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 'elegance', 'maquillage', 'leila', '2030-01-09 10:00+01', '2030-01-09 11:00+01', 4500, 'Kenza', '0555000105', 'fr', 'confirmed', 'staff'),
  ('e5000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005', 'elegance', 'soin-visage', 'leila', '2030-01-09 11:00+01', '2030-01-09 12:15+01', 3500, 'Kenza', '0555000105', 'fr', 'confirmed', 'staff'),
  -- W: Amina coupe 14:00-15:00 + Sara manucure 15:00-15:45 on the 12th
  ('e6000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000006', 'elegance', 'coupe-femme', 'amina', '2030-01-12 14:00+01', '2030-01-12 15:00+01', 2500, 'Wafa', '0555000106', 'fr', 'pending', 'online'),
  ('e6000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000006', 'elegance', 'manucure', 'sara', '2030-01-12 15:00+01', '2030-01-12 15:45+01', 2000, 'Wafa', '0555000106', 'fr', 'pending', 'online'),
  -- C: Amina coupe 10:00-11:00 + Sara manucure 11:00-11:45 on the 12th
  ('e7000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000007', 'elegance', 'coupe-femme', 'amina', '2030-01-12 10:00+01', '2030-01-12 11:00+01', 2500, 'Chahra', '0555000107', 'fr', 'pending', 'online'),
  ('e7000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000007', 'elegance', 'manucure', 'sara', '2030-01-12 11:00+01', '2030-01-12 11:45+01', 2000, 'Chahra', '0555000107', 'fr', 'pending', 'online'),
  -- B: a blocker, Sara 11:00-12:00 on the 10th
  ('e8000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000008', 'elegance', 'manucure', 'sara', '2030-01-10 11:00+01', '2030-01-10 12:00+01', 2000, 'Bouchra', '0555000108', 'fr', 'confirmed', 'staff'),
  -- O: two parts overlapping in time with different stylists, on the 12th
  ('e9000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000009', 'elegance', 'soin-visage', 'leila', '2030-01-12 12:00+01', '2030-01-12 13:15+01', 3500, 'Ouarda', '0555000109', 'fr', 'pending', 'staff'),
  ('e9000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000009', 'elegance', 'manucure', 'sara', '2030-01-12 12:30+01', '2030-01-12 13:15+01', 2000, 'Ouarda', '0555000109', 'fr', 'pending', 'staff'),
  -- H: Amina coupe 14:00-15:00 + Amina coloration 15:00-17:00 on the 11th (3 h total)
  ('ea000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'elegance', 'coupe-femme', 'amina', '2030-01-11 14:00+01', '2030-01-11 15:00+01', 2500, 'Hiba', '0555000110', 'fr', 'pending', 'online'),
  ('ea000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'elegance', 'coloration', 'amina', '2030-01-11 15:00+01', '2030-01-11 17:00+01', 6000, 'Hiba', '0555000110', 'fr', 'pending', 'online'),
  -- Y: parts on two different days, Leila on the 8th and the 9th
  ('eb000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000b', 'elegance', 'maquillage', 'leila', '2030-01-08 14:00+01', '2030-01-08 15:30+01', 5000, 'Yasmine', '0555000111', 'fr', 'pending', 'online'),
  ('eb000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000b', 'elegance', 'soin-visage', 'leila', '2030-01-09 14:00+01', '2030-01-09 15:15+01', 3500, 'Yasmine', '0555000111', 'fr', 'pending', 'online'),
  -- Z: a fully cancelled visit, Leila on the 10th
  ('ec000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000c', 'elegance', 'maquillage', 'leila', '2030-01-10 09:00+01', '2030-01-10 10:00+01', 5000, 'Zohra', '0555000112', 'fr', 'cancelled', 'online'),
  ('ec000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000c', 'elegance', 'soin-visage', 'leila', '2030-01-10 10:00+01', '2030-01-10 11:00+01', 3500, 'Zohra', '0555000112', 'fr', 'cancelled', 'online'),
  -- Q: Sara 13:00-13:45 + 13:45-14:30, and a cancelled Sara part 15:00-15:45, on the 10th
  ('ed000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000d', 'elegance', 'manucure', 'sara', '2030-01-10 13:00+01', '2030-01-10 13:45+01', 2000, 'Qamar', '0555000113', 'fr', 'pending', 'online'),
  ('ed000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000d', 'elegance', 'manucure', 'sara', '2030-01-10 13:45+01', '2030-01-10 14:30+01', 2000, 'Qamar', '0555000113', 'fr', 'pending', 'online'),
  ('ed000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000d', 'elegance', 'manucure', 'sara', '2030-01-10 15:00+01', '2030-01-10 15:45+01', 2000, 'Qamar', '0555000113', 'fr', 'cancelled', 'online');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;

-- ---------- remove one part ----------
select public.admin_remove_visit_part('e1000000-0000-0000-0000-000000000002');
select is((select status || ' ' || (visit_id <> 'e0000000-0000-0000-0000-000000000001') from private.bookings where id = 'e1000000-0000-0000-0000-000000000002')
          || ' | ' || pg_temp.parts('e0000000-0000-0000-0000-000000000001'),
  'cancelled true | 2030-01-08 10:00-11:00 amina pending 2500', 'remove: cancels the part and detaches it');

select public.admin_set_booking_status('e1000000-0000-0000-0000-000000000001', 'confirmed');
select is((select status from private.bookings where id = 'e1000000-0000-0000-0000-000000000002') || ' ' ||
          (select status from private.bookings where id = 'e1000000-0000-0000-0000-000000000001'),
  'cancelled confirmed', 'remove: confirming the visit afterwards leaves the removed part cancelled');

select throws_ok($$ select public.admin_remove_visit_part('e1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'not_found', 'remove: an already-cancelled part is not_found');
select throws_ok($$ select public.admin_remove_visit_part('e1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'last_part', 'remove: the last non-cancelled part is last_part');
select throws_ok($$ select public.admin_remove_visit_part('e2000000-0000-0000-0000-000000000001') $$,
  'P0001', 'last_part', 'remove: the last non-cancelled part is last_part (lone booking)');
select is((select status from private.bookings where id = 'e1000000-0000-0000-0000-000000000001') || ' ' ||
          (select status from private.bookings where id = 'e2000000-0000-0000-0000-000000000001'),
  'confirmed pending', 'remove: the last non-cancelled part is last_part (rows unchanged)');
select throws_ok($$ select public.admin_remove_visit_part('00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'not_found', 'remove: unknown id is not_found');

-- ---------- move the whole visit ----------
select lives_ok($$ select public.admin_move_visit('e3000000-0000-0000-0000-000000000002', '2030-01-11', '10:00', '{}') $$,
  'move: shifts every part, keeps gaps');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000003'),
  '2030-01-11 10:00-11:00 sara pending 2500, 2030-01-11 17:00-17:45 sara pending 2000', 'move: shifts every part, keeps gaps (new ranges, prices)');

select lives_ok($$ select public.admin_move_visit('e4000000-0000-0000-0000-000000000001', '2030-01-09', '10:30', null) $$,
  'move: same stylist back to back shifts 30 min later');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000004'),
  '2030-01-09 10:30-11:30 amina pending 2500, 2030-01-09 11:30-13:30 amina pending 6000', 'move: same stylist back to back shifts 30 min later (new ranges)');

select lives_ok($$ select public.admin_move_visit('e5000000-0000-0000-0000-000000000001', '2030-01-10', '14:00', '{}') $$,
  'move: keeps status and stored duration');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000005'),
  '2030-01-10 14:00-15:00 leila confirmed 4500, 2030-01-10 15:00-16:15 leila confirmed 3500', 'move: keeps status and stored duration (rows)');

select lives_ok($$ select public.admin_move_visit('e6000000-0000-0000-0000-000000000001', '2030-01-12', '16:00', '{"e6000000-0000-0000-0000-000000000002": "amina"}') $$,
  'move: changes a stylist');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000006'),
  '2030-01-12 16:00-17:00 amina pending 2500, 2030-01-12 17:00-17:45 amina pending 2000', 'move: changes a stylist (rows)');

select pg_temp.capture('clash', $$ select public.admin_move_visit('e7000000-0000-0000-0000-000000000001', '2030-01-10', '10:00', '{}') $$);
select is((select msg || ' ' || coalesce(detail, '-') from pg_temp.err where k = 'clash'), 'slot_taken item:1', 'move: clash names the part');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000007'),
  '2030-01-12 10:00-11:00 amina pending 2500, 2030-01-12 11:00-11:45 sara pending 2000', 'move: clash names the part (nothing moved)');

select pg_temp.capture('self', $$ select public.admin_move_visit('e9000000-0000-0000-0000-000000000001', '2030-01-12', '12:00',
  '{"e9000000-0000-0000-0000-000000000001": "amina", "e9000000-0000-0000-0000-000000000002": "amina"}') $$);
select is((select msg || ' ' || coalesce(detail, '-') from pg_temp.err where k = 'self'), 'slot_taken item:1', 'move: two parts given the same stylist overlap is slot_taken');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000009'),
  '2030-01-12 12:00-13:15 leila pending 3500, 2030-01-12 12:30-13:15 sara pending 2000', 'move: two parts given the same stylist overlap is slot_taken (nothing moved)');

select throws_ok($$ select public.admin_move_visit('ea000000-0000-0000-0000-000000000001', '2030-01-11', '16:00', '{}') $$,
  'P0001', 'outside_hours', 'move: last part past closing is outside_hours, nothing moved');
select is(pg_temp.parts('e0000000-0000-0000-0000-00000000000a'),
  '2030-01-11 14:00-15:00 amina pending 2500, 2030-01-11 15:00-17:00 amina pending 6000', 'move: last part past closing is outside_hours, nothing moved (rows)');
select throws_ok($$ select public.admin_move_visit('ea000000-0000-0000-0000-000000000001', '2030-01-07', '10:00', '{}') $$,
  'P0001', 'outside_hours', 'move: closed day is outside_hours');
select throws_ok($$ select public.admin_move_visit('ea000000-0000-0000-0000-000000000001', '2030-01-11', '10:10', '{}') $$,
  'P0001', 'outside_hours', 'move: off-grid start is outside_hours');

select throws_ok($$ select public.admin_move_visit('eb000000-0000-0000-0000-000000000002', '2030-01-09', '10:00', '{}') $$,
  'P0001', 'visit_spans_days', 'move: parts on different days is visit_spans_days');

select throws_ok($$ select public.admin_move_visit('e2000000-0000-0000-0000-000000000001', '2030-01-09', '10:00', '{}') $$,
  'P0001', 'not_movable', 'move: a cancelled or single visit is not_movable');
select throws_ok($$ select public.admin_move_visit('ec000000-0000-0000-0000-000000000001', '2030-01-10', '14:00', '{}') $$,
  'P0001', 'not_movable', 'move: a cancelled or single visit is not_movable (fully cancelled)');
select throws_ok($$ select public.admin_move_visit('00000000-0000-0000-0000-000000000000', '2030-01-10', '14:00', '{}') $$,
  'P0001', 'not_found', 'move: unknown id is not_found');

select throws_ok($$ select public.admin_move_visit('ea000000-0000-0000-0000-000000000001', '2030-01-11', '09:00', '{"ea000000-0000-0000-0000-000000000002": "nobody"}') $$,
  'P0001', 'unknown_service', 'move: unknown stylist is unknown_service');
select is(pg_temp.parts('e0000000-0000-0000-0000-00000000000a'),
  '2030-01-11 14:00-15:00 amina pending 2500, 2030-01-11 15:00-17:00 amina pending 6000', 'move: refused moves leave the visit unchanged');

select lives_ok($$ select public.admin_move_visit('ea000000-0000-0000-0000-000000000001', '2030-01-11', '09:00', '{"e2000000-0000-0000-0000-000000000001": "sara"}') $$,
  'move: p_stylists keys outside the visit are ignored');
select is(pg_temp.parts('e0000000-0000-0000-0000-000000000002') || ' | ' || pg_temp.parts('e0000000-0000-0000-0000-00000000000a'),
  '2030-01-08 10:00-11:30 leila pending 5000 | 2030-01-11 09:00-10:00 amina pending 2500, 2030-01-11 10:00-12:00 amina pending 6000',
  'move: p_stylists keys outside the visit are ignored (L unchanged, visit moved)');

select lives_ok($$ select public.admin_move_visit('ed000000-0000-0000-0000-000000000003', '2030-01-10', '15:00', '{}') $$,
  'move: cancelled parts of the visit stay put');
select is(pg_temp.parts('e0000000-0000-0000-0000-00000000000d'),
  '2030-01-10 15:00-15:45 sara pending 2000, 2030-01-10 15:00-15:45 sara cancelled 2000, 2030-01-10 15:45-16:30 sara pending 2000',
  'move: cancelled parts of the visit stay put (rows)');

reset role;
select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('elegance', 'manucure', 'sara', '2030-01-10 15:00+01', '2030-01-10 15:45+01', 2000, 'Direct', '0555000199', 'fr', 'staff') $$,
  '23P01', null, 'move: the overlap rule is immediate again afterwards');

-- the constraint keeps its definition, now deferrable initially immediate
select is((select pg_get_constraintdef(oid) || ' ' || condeferrable || ' ' || condeferred from pg_constraint
           where conrelid = 'private.bookings'::regclass and conname = 'bookings_no_overlap'),
  'EXCLUDE USING gist (stylist_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE ((status <> ''cancelled''::text)) DEFERRABLE true false',
  'bookings_no_overlap is deferrable initially immediate, same definition');

-- non-staff are refused
insert into auth.users (id, instance_id, aud, role, email)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_remove_visit_part('e3000000-0000-0000-0000-000000000001') $$, 'P0001', 'not_authorized', 'remove: non-staff is not_authorized');
select throws_ok($$ select public.admin_move_visit('e3000000-0000-0000-0000-000000000001', '2030-01-11', '10:00', '{}') $$, 'P0001', 'not_authorized', 'move: non-staff is not_authorized');
reset role;
set local role anon;
select throws_ok($$ select public.admin_move_visit('e3000000-0000-0000-0000-000000000001', '2030-01-11', '10:00', '{}') $$, '42501', null, 'move: anon cannot call it');
select throws_ok($$ select public.admin_remove_visit_part('e3000000-0000-0000-0000-000000000001') $$, '42501', null, 'remove: anon cannot call it');
reset role;

select * from finish();
rollback;
