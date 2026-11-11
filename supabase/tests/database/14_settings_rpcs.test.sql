begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create table pg_temp.ids (k text primary key, v text);
grant all on pg_temp.ids to authenticated;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;

-- services
insert into pg_temp.ids select 'svc', public.admin_save_service(null, '{"fr":"Soin test","ar":""}', '{"fr":"d","ar":"d"}', 'beaute', 3000, 45, 9);
insert into pg_temp.ids select 'svc2', public.admin_save_service(null, '{"fr":"Coupe test","ar":"قص"}', '{"fr":"d","ar":"d"}', 'coiffure', 2000, 30, 10);
reset role;
select is((select salon_id || ' ' || active || ' ' || icon || ' ' || image from public.services where id = (select v from pg_temp.ids where k = 'svc')),
          'elegance true sparkles ', 'create service: own salon, active, beaute icon');
select is((select icon from public.services where id = (select v from pg_temp.ids where k = 'svc2')), 'scissors', 'create service: coiffure icon');
set local role authenticated;
select lives_ok(format($$ select public.admin_save_service(%L, '{"fr":"Soin test 2","ar":"x"}', '{"fr":"d","ar":"d"}', 'beaute', 3500, 60, 9) $$, (select v from pg_temp.ids where k = 'svc')), 'update service');
reset role;
select is((select price || ' ' || duration || ' ' || (name ->> 'fr') from public.services where id = (select v from pg_temp.ids where k = 'svc')), '3500 60 Soin test 2', 'update changes the row');
set local role authenticated;
select throws_ok($$ select public.admin_save_service(null, '{"fr":"A","ar":""}', '{}', 'beaute', 1000, 30, 0) $$, 'P0001', 'invalid_name', 'name too short');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'autre', 1000, 30, 0) $$, 'P0001', 'invalid_name', 'unknown category');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', -1, 30, 0) $$, 'P0001', 'invalid_price', 'negative price');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000001, 30, 0) $$, 'P0001', 'invalid_price', 'price too high');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000, 20, 0) $$, 'P0001', 'invalid_duration', 'duration not a multiple of 15');
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000, 615, 0) $$, 'P0001', 'invalid_duration', 'duration too long');
select throws_ok($$ select public.admin_save_service('nope', '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000, 30, 0) $$, 'P0001', 'not_found', 'update unknown service');
select lives_ok(format($$ select public.admin_set_service_active(%L, false) $$, (select v from pg_temp.ids where k = 'svc')), 'hide service');
reset role;
select is((select active from public.services where id = (select v from pg_temp.ids where k = 'svc')), false, 'service hidden');
set local role authenticated;
select public.admin_set_service_active((select v from pg_temp.ids where k = 'svc'), true);
reset role;
select is((select active from public.services where id = (select v from pg_temp.ids where k = 'svc')), true, 'service shown again');

-- stylists
set local role authenticated;
insert into pg_temp.ids select 'sty', public.admin_save_stylist(null, 'Lina', '{"fr":"Coloriste","ar":"x"}', array[(select v from pg_temp.ids where k = 'svc'), (select v from pg_temp.ids where k = 'svc2')], array[2, 3]::smallint[]);
reset role;
select is((select count(*)::int from public.stylist_workdays where stylist_id = (select v from pg_temp.ids where k = 'sty')), 2, 'new stylist: 2 workdays');
select is((select count(*)::int from public.stylist_services where stylist_id = (select v from pg_temp.ids where k = 'sty') and salon_id = 'elegance'), 2, 'new stylist: 2 services');
select is((select salon_id || ' ' || active from public.stylists where id = (select v from pg_temp.ids where k = 'sty')), 'elegance true', 'new stylist in own salon, active');
set local role authenticated;
select public.admin_save_stylist((select v from pg_temp.ids where k = 'sty'), 'Lina B', '{"fr":"Coloriste","ar":"x"}', array[(select v from pg_temp.ids where k = 'svc')], array[4, 5, 6]::smallint[]);
reset role;
select is((select array_agg(weekday order by weekday) from public.stylist_workdays where stylist_id = (select v from pg_temp.ids where k = 'sty')), array[4, 5, 6]::smallint[], 'update replaces workdays');
select is((select count(*)::int from public.stylist_services where stylist_id = (select v from pg_temp.ids where k = 'sty')), 1, 'update replaces services');
select is((select name from public.stylists where id = (select v from pg_temp.ids where k = 'sty')), 'Lina B', 'update renames');
set local role authenticated;
select throws_ok($$ select public.admin_save_stylist(null, 'Zoé', '{"fr":"x","ar":"x"}', '{}', array[8]::smallint[]) $$, 'P0001', 'invalid_weekday', 'weekday 8');
select throws_ok($$ select public.admin_save_stylist(null, 'Z', '{"fr":"x","ar":"x"}', '{}', '{}') $$, 'P0001', 'invalid_name', 'stylist name too short');
select lives_ok(format($$ select public.admin_set_stylist_active(%L, false) $$, (select v from pg_temp.ids where k = 'sty')), 'hide stylist');

-- days off
insert into pg_temp.ids select 'off', public.admin_add_stylist_days_off((select v from pg_temp.ids where k = 'sty'), '2030-03-01', '2030-03-05');
select throws_ok(format($$ select public.admin_add_stylist_days_off(%L, '2030-03-05', '2030-03-01') $$, (select v from pg_temp.ids where k = 'sty')), 'P0001', 'invalid_dates', 'to before from');
select throws_ok(format($$ select public.admin_add_stylist_days_off(%L, '2030-01-01', '2031-01-03') $$, (select v from pg_temp.ids where k = 'sty')), 'P0001', 'invalid_dates', 'span over 366 days');
select is((select count(*)::int from public.stylist_days_off), 1, 'days off added and visible to owner');
select lives_ok(format($$ select public.admin_delete_stylist_days_off(%L) $$, (select v from pg_temp.ids where k = 'off')), 'delete days off');

-- no write policy
with u as (update public.services set price = 1 returning 1) select is((select count(*)::int from u), 0, 'direct update of services changes nothing');
reset role;

-- non-staff and anon
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000, 30, 0) $$, 'P0001', 'not_authorized', 'non-staff refused');
reset role;
set local role anon;
select throws_ok($$ select public.admin_save_service(null, '{"fr":"Valide","ar":""}', '{}', 'beaute', 1000, 30, 0) $$, '42501', null, 'anon refused');
reset role;

-- hours, closed dates, salon info, affected bookings
create function pg_temp.hours_with(p jsonb) returns jsonb language sql as $$
  select jsonb_agg(case when d = 4 then p || '{"weekday":4}'::jsonb
    when d between 2 and 6 then jsonb_build_object('weekday', d, 'opens', '09:00', 'closes', '18:00')
    else jsonb_build_object('weekday', d, 'opens', null, 'closes', null) end order by d)
  from generate_series(1, 7) d $$;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_set_hours(pg_temp.hours_with('{"opens":"09:00","closes":"13:00"}')) $$, 'set hours');
reset role;
select is((select opens || ' ' || closes from public.salon_hours where salon_id = 'elegance' and weekday = 4), '09:00:00 13:00:00', 'hours read back');
set local role authenticated;
select throws_ok($$ select public.admin_set_hours((pg_temp.hours_with('{"opens":"09:00","closes":"13:00"}') - 6)) $$, 'P0001', 'invalid_hours', 'only 6 entries');
select throws_ok($$ select public.admin_set_hours(pg_temp.hours_with('{"opens":"09:00","closes":"13:00"}') || '[{"weekday":4,"opens":null,"closes":null}]'::jsonb - 6) $$, 'P0001', 'invalid_hours', 'duplicated weekday');
select throws_ok($$ select public.admin_set_hours(pg_temp.hours_with('{"opens":"09:10","closes":"13:00"}')) $$, 'P0001', 'invalid_hours', 'not on a 15-minute step');
select throws_ok($$ select public.admin_set_hours(pg_temp.hours_with('{"opens":"13:00","closes":"13:00"}')) $$, 'P0001', 'invalid_hours', 'opens not before closes');
select throws_ok($$ select public.admin_set_hours(pg_temp.hours_with('{"opens":"09:00","closes":null}')) $$, 'P0001', 'invalid_hours', 'only one of opens/closes null');

insert into pg_temp.ids select 'c1', public.admin_add_closed_dates('2030-08-01', '2030-08-10', '  Vacances  ');
insert into pg_temp.ids select 'c2', public.admin_add_closed_dates('2030-09-01', '2030-09-01', '   ');
select is((select label from public.salon_closed_dates where id = (select v::uuid from pg_temp.ids where k = 'c1')), 'Vacances', 'closed dates: label trimmed');
select is((select label from public.salon_closed_dates where id = (select v::uuid from pg_temp.ids where k = 'c2')), null, 'closed dates: empty label stored as null');
select throws_ok($$ select public.admin_add_closed_dates('2030-03-05', '2030-03-01', null) $$, 'P0001', 'invalid_dates', 'closed dates: to before from');
select throws_ok($$ select public.admin_add_closed_dates('2030-01-01', '2031-01-03', null) $$, 'P0001', 'invalid_dates', 'closed dates: span over 366 days');
select lives_ok(format($$ select public.admin_delete_closed_dates(%L) $$, (select v from pg_temp.ids where k = 'c1')), 'delete closed dates');
select is((select count(*)::int from public.salon_closed_dates), 1, 'one closed range left');

select lives_ok($$ select public.admin_save_salon_info('{"fr":"12 rue X","ar":"س"}', '{"fr":"Alger","ar":"الجزائر"}', '+213 661 22 33 44', '', 'https://facebook.com/x') $$, 'save salon info');
reset role;
select is((select whatsapp || ' ' || (address ->> 'fr') || ' ' || (city ->> 'ar') || ' ' || facebook_url from public.salons where id = 'elegance'),
          '0661223344 12 rue X الجزائر https://facebook.com/x', 'salon info round-trip, phone normalised');
set local role authenticated;
select throws_ok($$ select public.admin_save_salon_info('{}', '{}', '021123456', null, null) $$, 'P0001', 'invalid_phone', 'invalid whatsapp');
select throws_ok($$ select public.admin_save_salon_info('{}', '{}', null, 'http://x', null) $$, 'P0001', 'invalid_url', 'non-https url');
reset role;
select is((select instagram_url from public.salons where id = 'elegance'), null, 'empty instagram stored as null');

-- affected bookings (Thursday 2030-01-10 closes at 13:00)
insert into private.bookings (id, salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
values
  ('dddddddd-0000-0000-0000-000000000001', 'elegance', 'coupe-femme', 'amina', '2030-01-10 16:00+01', '2030-01-10 17:00+01', 2500, 'Late', '0555000000', 'fr', 'pending'),
  ('dddddddd-0000-0000-0000-000000000002', 'elegance', 'coupe-femme', 'amina', '2030-01-17 10:00+01', '2030-01-17 11:00+01', 2500, 'Off', '0555000000', 'fr', 'pending'),
  ('dddddddd-0000-0000-0000-000000000003', 'elegance', 'coupe-femme', 'amina', '2030-01-10 17:00+01', '2030-01-10 18:00+01', 2500, 'Gone', '0555000000', 'fr', 'cancelled');
set local role authenticated;
select is((select reason from public.admin_affected_bookings() where id = 'dddddddd-0000-0000-0000-000000000001'), 'outside_hours', 'affected: after closing time');
insert into pg_temp.ids select 'c3', public.admin_add_closed_dates('2030-01-10', '2030-01-10', null);
select is((select reason from public.admin_affected_bookings() where id = 'dddddddd-0000-0000-0000-000000000001'), 'closed', 'affected: closed date wins over outside_hours');
select public.admin_add_stylist_days_off('amina', '2030-01-17', '2030-01-17');
select is((select reason from public.admin_affected_bookings() where id = 'dddddddd-0000-0000-0000-000000000002'), 'stylist_off', 'affected: stylist day off');
select is((select count(*)::int from public.admin_affected_bookings() where id = 'dddddddd-0000-0000-0000-000000000003'), 0, 'affected: cancelled bookings never listed');
reset role;

select * from finish();
rollback;
