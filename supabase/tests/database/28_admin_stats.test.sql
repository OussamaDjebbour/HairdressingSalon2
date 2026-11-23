begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Élégance (seed): Amina, Leila, Sara work Tue–Sat; the salon opens Tue–Sat 09:00–18:00 (540 min).
-- The week 2030-01-07 (Mon) .. 2030-01-13 (Sun) has 5 open days: capacity 3 × 5 × 540 = 8100 min.

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
       ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local'),
       ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rival@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into public.salons (id, name) values ('rival', 'Rival');
insert into private.staff (user_id, salon_id) values ('44444444-4444-4444-4444-444444444444', 'rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image) values ('nadia', 'rival', 'Nadia', '{"fr":"x","ar":"x"}', 'x');

create function pg_temp.book(p_salon text, p_service text, p_stylist text, p_start text, p_min int, p_price int,
                             p_phone text, p_source text, p_status text, p_visit uuid default gen_random_uuid())
returns void language sql as $$
  insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source, status, visit_id)
  values (p_salon, p_service, p_stylist, (p_start || '+01')::timestamptz, (p_start || '+01')::timestamptz + make_interval(mins => p_min),
          p_price, 'Cliente', p_phone, 'fr', p_source, p_status, p_visit) $$;

-- this week
select pg_temp.book('elegance', 'coupe-femme', 'amina', '2030-01-08 10:00', 60, 2500, '0555000001', 'online', 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.book('elegance', 'coloration', 'amina', '2030-01-08 11:00', 120, 6000, '0555000001', 'online', 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.book('elegance', 'maquillage', 'leila', '2030-01-09 09:00', 90, 5000, '0555000002', 'staff', 'confirmed');
select pg_temp.book('elegance', 'manucure', 'sara', '2030-01-10 09:00', 45, 2000, '0555000003', 'online', 'pending');
select pg_temp.book('elegance', 'coupe-femme', 'amina', '2030-01-11 09:00', 60, 2500, '0555000004', 'online', 'cancelled');
-- the week before, and a returning client's old visit
select pg_temp.book('elegance', 'coupe-femme', 'amina', '2030-01-02 09:00', 60, 2500, '0555000005', 'staff', 'confirmed');
select pg_temp.book('elegance', 'coupe-femme', 'amina', '2029-12-11 09:00', 60, 2500, '0555000002', 'staff', 'confirmed');
-- a website request for two services whose second part the owner removed (detached into its own visit, cancelled)
select pg_temp.book('elegance', 'coupe-femme', 'amina', '2030-02-05 10:00', 60, 2500, '0555000006', 'online', 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000006');
select pg_temp.book('elegance', 'manucure', 'sara', '2030-02-05 11:00', 45, 2000, '0555000006', 'online', 'cancelled');
-- another salon, same week: never counted
select pg_temp.book('rival', 'rival-cut', 'nadia', '2030-01-08 10:00', 60, 99999, '0555000001', 'online', 'confirmed');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
create temp table s as select public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') as r;
reset role;

-- the period
select is((select (r->'current'->>'revenue')::int from s), 13500, 'income: confirmed bookings only, at their recorded price');
select is((select (r->'current'->>'visits')::int from s), 2, 'a visit of two parts counts once');
select is((select (r->'current'->>'pending')::int from s), 1, 'pending requests are counted apart');
select is((select (r->'current'->>'booked_min')::int from s), 270, 'booked minutes of confirmed bookings');
select is((select (r->'current'->>'capacity_min')::int from s), 8100, 'capacity: each working coiffeuse over each open day');
select is((select (r->'current'->>'clients')::int from s), 2, 'distinct clients with a confirmed visit');
select is((select (r->'current'->>'new_clients')::int from s), 1, 'new: no earlier booking at the salon');

-- the comparison period (here the week before)
select is((select (r->'previous'->>'revenue')::int from s), 2500, 'previous week income');
select is((select (r->'previous'->>'visits')::int from s), 1, 'previous week visits');
select is((select (r->'previous'->>'capacity_min')::int from s), 8100, 'previous week capacity');

-- per coiffeuse (busiest first), all active ones listed
select is((select jsonb_array_length(r->'stylists') from s), 3, 'every active coiffeuse is listed');
select is((select r->'stylists'->0->>'id' from s), 'amina', 'the highest income first');
select is((select (r->'stylists'->0->>'visits')::int from s), 1, 'Amina: one visit (of two parts), like the headline');
select is((select (r->'stylists'->0->>'revenue')::int from s), 8500, 'Amina: her income');
select is((select (r->'stylists'->0->>'booked_min')::int from s), 180, 'Amina: her booked minutes');
select is((select (r->'stylists'->0->>'capacity_min')::int from s), 2700, 'Amina: her capacity');
select is((select (x->>'revenue')::int from s, jsonb_array_elements(r->'stylists') x where x->>'id' = 'sara'), 0, 'a pending request earns Sara nothing yet');

-- services: most booked first (then income)
select is((select r->'services'->0->>'id' from s), 'coloration', 'ties broken by income');
select is((select jsonb_array_length(r->'services') from s), 3, 'only services with confirmed bookings');
select is((select r->'services'->0->'name'->>'fr' from s), 'Coloration & Balayage', 'with their names');

-- online requests
select is((select (r->'online'->>'requests')::int from s), 3, 'online requests, whatever became of them');
select is((select (r->'online'->>'confirmed')::int from s), 1, 'online requests confirmed');
select is((select (r->'online'->>'cancelled')::int from s), 1, 'online requests cancelled');
select is((select (r->'online'->>'pending')::int from s), 1, 'online requests still waiting');

-- a removed part doesn't make a second request
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select public.admin_stats('2030-02-04', '2030-02-10', '2030-01-28', '2030-02-03') -> 'online'),
          '{"requests": 1, "confirmed": 1, "pending": 0, "cancelled": 0}'::jsonb, 'a request with a removed part is one confirmed request');
reset role;

-- a coiffeuse hidden since still counts for the period she worked
update public.stylists set active = false where id = 'leila';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select (public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') -> 'current' ->> 'capacity_min')::int), 8100,
          'her capacity stays with her bookings, so occupancy stays consistent');
select ok((select exists (select 1 from jsonb_array_elements(public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') -> 'stylists') x where x ->> 'id' = 'leila')),
          'she is still listed for that period');
reset role;
update public.stylists set active = true where id = 'leila';

-- no client data in the answer
select ok((select r::text !~ '055500000' from s), 'no phone number in the answer');
select ok((select r::text !~ 'Cliente' from s), 'no client name in the answer');

-- access
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') $$, 'P0001', 'not_authorized', 'no staff session: not_authorized');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') $$, 'P0001', 'not_authorized', 'a signed-in non-staff user is refused');
reset role;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_stats('2030-01-13', '2030-01-07', '2029-12-31', '2030-01-06') $$, 'P0001', 'invalid_range', 'from after to');
select throws_ok($$ select public.admin_stats('2030-01-07', '2030-01-13', '2030-01-06', '2029-12-31') $$, 'P0001', 'invalid_range', 'comparison from after to');
select lives_ok($$ select public.admin_stats('2030-01-01', '2030-12-31', '2029-01-01', '2029-12-31') $$, 'a whole year is fine');
select throws_ok($$ select public.admin_stats('2030-01-01', '2031-01-02', '2029-01-01', '2029-12-31') $$, 'P0001', 'invalid_range', 'more than a year');
reset role;
set local role anon;
select throws_ok($$ select public.admin_stats('2030-01-07', '2030-01-13', '2029-12-31', '2030-01-06') $$, '42501', null, 'anon cannot call it');
reset role;

select * from finish();
rollback;
