begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- nth open day (Tue–Sat) strictly after today, Algiers time
create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
create function pg_temp.next_sunday() returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 7, interval '1 day') d
  where extract(isodow from d) = 7 limit 1 $$;
create function pg_temp.next_monday() returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 7, interval '1 day') d
  where extract(isodow from d) = 1 limit 1 $$;
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_minutes int, p_status text default 'pending')
returns void language sql as $$
  insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
  values ('coupe-femme', p_stylist,
          (p_day + p_time) at time zone 'Africa/Algiers',
          ((p_day + p_time) at time zone 'Africa/Algiers') + make_interval(mins => p_minutes),
          2500, 'Seed Client', '0555999999', 'fr', p_status) $$;

-- grid depends on duration (coupe-femme 60 min, soin-keratine 150 min)
select is((select count(*)::int from public.get_slots(pg_temp.open_day(), 'coupe-femme')), 17, '60-min service: 09:00..17:00');
select is((select max(slot) from public.get_slots(pg_temp.open_day(), 'coupe-femme')), '17:00', '60-min last slot 17:00');
select is((select max(slot) from public.get_slots(pg_temp.open_day(), 'soin-keratine')), '15:30', '150-min last slot 15:30');
select is((select min(slot) from public.get_slots(pg_temp.open_day(), 'coupe-femme')), '09:00', 'first slot 09:00');

-- closed / out of window
select is((select count(*)::int from public.get_slots(pg_temp.next_sunday(), 'coupe-femme')), 0, 'Sunday is closed');
select is((select count(*)::int from public.get_slots(pg_temp.next_monday(), 'coupe-femme')), 0, 'Monday is closed');
select is((select count(*)::int from public.get_slots((now() at time zone 'Africa/Algiers')::date - 1, 'coupe-femme')), 0, 'yesterday is out of window');
select is((select count(*)::int from public.get_slots((now() at time zone 'Africa/Algiers')::date + 14, 'coupe-femme')), 0, 'today+14 is out of window');

-- today: past slots are never available (holds regardless of current time, including when today's set is empty)
select is((select count(*)::int from public.get_slots((now() at time zone 'Africa/Algiers')::date, 'coupe-femme') where available and private.slot_start((now() at time zone 'Africa/Algiers')::date, slot::time) <= now()), 0, 'today: no past slot is available');

-- a booking blocks overlapping slots; cancellation frees them
select pg_temp.book('amina', pg_temp.open_day(), '10:00', 60);
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '10:00'), false, 'booked slot unavailable');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '09:30'), false, 'overlapping slot unavailable');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '11:00'), true, 'adjacent slot available');

-- "no preference": free while any offering stylist is free
insert into public.stylist_services values ('leila', 'coupe-femme');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme') where slot = '10:00'), true, 'no preference: another offering stylist is free');

-- validation
select throws_ok($$ select * from public.get_slots(current_date + 1, 'nope') $$, 'P0001', 'unknown_service', 'unknown service');
select throws_ok($$ select * from public.get_slots(current_date + 1, 'coupe-femme', 'sara') $$, 'P0001', 'unknown_service', 'stylist not offering service');

-- anon may call it
set local role anon;
select lives_ok($$ select * from public.get_slots(current_date + 1, 'coupe-femme') $$, 'anon can execute get_slots');
reset role;

select * from finish();
rollback;
