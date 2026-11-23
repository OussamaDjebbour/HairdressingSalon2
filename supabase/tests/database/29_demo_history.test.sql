begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- After a demo reset the salon has a past: the last 90 days are filled like history.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', ''),
       ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local',
        extensions.crypt('demo-pw', extensions.gen_salt('bf')));
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'demo-pw');

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Algiers')::date $$;
create function pg_temp.day(t timestamptz) returns date language sql as $$ select (t at time zone 'Africa/Algiers')::date $$;
create function pg_temp.past() returns setof private.bookings language sql as $$
  select * from private.bookings where salon_id = 'elegance' and pg_temp.day(starts_at) < pg_temp.today() $$;
create function pg_temp.fingerprint() returns text language sql as $$
  select string_agg(stylist_id || service_id || starts_at || client_phone || status || source, ',' order by starts_at, stylist_id)
  from pg_temp.past() $$;

select private.demo_reset('elegance');
create temp table first_run as select pg_temp.fingerprint() as f;

select ok((select count(*) from pg_temp.past()) > 100, 'the last 90 days are filled');
select is((select count(*)::int from (select distinct pg_temp.day(starts_at) d from pg_temp.past()) x
           where not exists (select 1 from private.day_hours('elegance', x.d))), 0, 'only on open days');
select is((select count(*)::int from pg_temp.past() where status = 'pending'), 0, 'nothing in the past is still waiting');
select ok((select count(*) from pg_temp.past() where status = 'confirmed') > 0, 'the past is mostly confirmed');
select is((select count(*)::int from pg_temp.past() where status = 'cancelled' and source <> 'online'), 0, 'only website requests are cancelled');
select is((select count(*)::int from pg_temp.past() where created_at >= starts_at), 0, 'each was made before its date');
select ok((select count(*) from pg_temp.past() where pg_temp.day(starts_at) < pg_temp.today() - 90) = 0, 'nothing older than 90 days');
select ok((select count(*) - count(distinct client_phone) from pg_temp.past()) > 50, 'regular clients come back');
select is((select count(*)::int from (select client_phone from pg_temp.past() group by client_phone having count(distinct client_name) > 1) x), 0,
          'a regular keeps her name');

select private.demo_reset('elegance');
select is(pg_temp.fingerprint(), (select f from first_run), 'the same history after another reset');

-- a real salon never gets fake bookings
insert into public.salons (id, name) values ('rival', 'Rival');
select throws_ok($$ select private.demo_fake_history('rival', 90) $$, 'P0001', 'not_demo', 'not_demo for a real salon');

-- the owner's Statistiques now show something for last month
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select ok((public.admin_stats(pg_temp.today() - 30, pg_temp.today() - 1, pg_temp.today() - 60, pg_temp.today() - 31) -> 'current' ->> 'revenue')::int > 0,
          'Statistiques: income over the last 30 days');
reset role;

select * from finish();
rollback;
