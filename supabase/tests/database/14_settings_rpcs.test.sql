begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

select * from finish();
rollback;
