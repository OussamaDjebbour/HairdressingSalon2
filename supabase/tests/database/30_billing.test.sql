begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Élégance (seed) opens Tue–Sat 09:00–18:00; coupe-femme (60 min) is done by amina.
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Algiers')::date $$;
create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series(pg_temp.today() + 1, pg_temp.today() + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
-- paid until today + p_days (negative: already past)
create function pg_temp.pay(p_salon text, p_days int) returns void language sql as $$
  insert into private.salon_billing (salon_id, paid_until) values (p_salon, pg_temp.today() + p_days)
  on conflict (salon_id) do update set paid_until = excluded.paid_until $$;
create function pg_temp.state(p_salon text) returns text language sql as $$
  select private.billing_status(p_salon) ->> 'state' $$;
create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
       ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into public.salons (id, name, demo) values ('showroom', 'Showroom', true);

-- not billed: never paused
select is(pg_temp.state('elegance'), 'none', 'no billing row: not billed');
select ok(public.salon_booking_open('elegance'), 'no billing row: booking open');
select ok(exists (select 1 from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"service_id":"coupe-femme","stylist_id":null}]')),
          'no billing row: times are offered');

-- the timeline
select pg_temp.pay('elegance', 6);
select is(pg_temp.state('elegance'), 'ok', '6 days ahead: ok');
select pg_temp.pay('elegance', 5);
select is(pg_temp.state('elegance'), 'soon', '5 days ahead: soon');
select pg_temp.pay('elegance', 0);
select is(pg_temp.state('elegance'), 'soon', 'due today: soon');
select pg_temp.pay('elegance', -1);
select is(pg_temp.state('elegance'), 'grace', '1 day late: grace');
select pg_temp.pay('elegance', -3);
select is(pg_temp.state('elegance'), 'grace', '3 days late: still grace');
select ok(public.salon_booking_open('elegance'), 'last grace day: booking open');
select lives_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":null}]',
                   pg_temp.open_day(), '10:00', 'Grace Client', '0555100001', 'fr') $$, 'last grace day: a client can book');
select pg_temp.pay('elegance', -4);
select is(pg_temp.state('elegance'), 'paused', '4 days late: paused');
select is((private.billing_status('elegance') ->> 'paused_from')::date, pg_temp.today() - 4 + 4, 'paused_from is paid_until + 4');
select is((private.billing_status('elegance') ->> 'paid_until')::date, pg_temp.today() - 4, 'status carries paid_until');
select ok(not public.salon_booking_open('elegance'), 'paused: booking closed');

-- paused: every public booking path refuses, nothing is written
select throws_ok($$ select * from public.get_visit_slots('elegance', pg_temp.open_day(), '[{"service_id":"coupe-femme","stylist_id":null}]') $$,
                 'P0001', 'booking_paused', 'paused: get_visit_slots refuses');
select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme') $$,
                 'P0001', 'booking_paused', 'paused: get_slots refuses');
select throws_ok($$ select * from public.create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"manucure","stylist_id":null}]',
                   pg_temp.open_day(2), '10:00', 'Paused Client', '0555100002', 'fr') $$,
                 'P0001', 'booking_paused', 'paused: create_visit refuses');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', null, pg_temp.open_day(2), '14:00', 'Paused Client', '0555100003', 'fr') $$,
                 'P0001', 'booking_paused', 'paused: create_booking refuses');
select is((select count(*)::int from private.bookings where client_name = 'Paused Client'), 0, 'paused: no booking row written');
select is((select count(*)::int from private.bookings where client_name = 'Grace Client'), 1, 'paused: earlier bookings are untouched');

-- the owner keeps her agenda
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_create_booking('coupe-femme', 'amina', pg_temp.open_day(3), '11:00', 'Walkin', '0555100004', 'fr') $$,
                'paused: the owner can still add a booking');
select is(public.admin_billing() ->> 'state', 'paused', 'admin_billing: the owner sees the paused state');
select is((public.admin_billing() ->> 'paused_from')::date, pg_temp.today(), 'admin_billing: with the pause date');
reset role;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_billing() $$, 'P0001', 'not_authorized', 'admin_billing: non-staff refused');
reset role;
select set_config('request.jwt.claims', '', true);

-- the demo is never paused
insert into private.salon_billing (salon_id, paid_until) values ('showroom', pg_temp.today() - 30);
select is(pg_temp.state('showroom'), 'none', 'demo: never billed, even with an old date');
select ok(public.salon_booking_open('showroom'), 'demo: booking open');
select ok(public.salon_booking_open('nope'), 'unknown salon: not paused (the booking functions say unknown_service)');

-- visitors
set local role anon;
select ok(public.salon_booking_open('elegance') is not null, 'anon can ask whether booking is open');
select throws_ok($$ select count(*) from private.salon_billing $$, '42501', null, 'anon can''t read billing');
reset role;
select ok(not has_function_privilege('anon', 'public.admin_billing()', 'execute'), 'anon can''t call admin_billing');

-- the product owner's functions (service role only)
select is(public.billing_set('elegance', pg_temp.today() + 30) ->> 'state', 'ok', 'billing_set: extends to ok');
select ok(public.salon_booking_open('elegance'), 'billing_set: booking reopens at once');
select is((select paid_until from public.billing_list() where salon_id = 'elegance'), pg_temp.today() + 30, 'billing_list: shows the date');
select is((select state from public.billing_list() where salon_id = 'showroom'), 'none', 'billing_list: a demo is none');
select is(public.billing_set('elegance', null) ->> 'state', 'none', 'billing_set null: back to not billed');
select is((select count(*)::int from private.salon_billing where salon_id = 'elegance'), 0, 'billing_set null: row removed');
select throws_ok($$ select public.billing_set('nope', current_date) $$, 'P0001', 'not_found', 'billing_set: unknown salon');
select throws_ok($$ select public.billing_set('showroom', current_date) $$, 'P0001', 'demo_salon', 'billing_set: demo refused');
select ok(not has_function_privilege('authenticated', 'public.billing_set(text, date)', 'execute')
          and not has_function_privilege('anon', 'public.billing_set(text, date)', 'execute')
          and not has_function_privilege('authenticated', 'public.billing_list()', 'execute')
          and not has_function_privilege('anon', 'public.billing_list()', 'execute'), 'billing_set/list: service role only');

select * from finish();
rollback;
