begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_phone text,
                             p_status text default 'pending', p_ip inet default null)
returns void language sql as $$
  insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang, status)
  values ('elegance', 'coupe-femme', p_stylist,
          (p_day + p_time) at time zone 'Africa/Algiers',
          ((p_day + p_time) at time zone 'Africa/Algiers') + interval '60 minutes',
          2500, 'Seed Client', p_phone, p_ip, 'fr', p_status) $$;

-- happy path + DB-sourced price/duration + normalised phone
select is((select stylist_id from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '09:00', '  Yasmine  ', '0555 12 34 56', 'fr')),
          'amina', 'books the chosen stylist');
select is((select client_phone from private.bookings where client_name = 'Yasmine'), '0555123456', 'phone normalised, name trimmed');
select is((select price from private.bookings where client_name = 'Yasmine'), 2500, 'price from services');
select is((select extract(epoch from ends_at - starts_at)::int / 60 from private.bookings where client_name = 'Yasmine'), 60, 'duration from services');
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '10:00', 'Nadia', '+213 661 22 33 44', 'ar') $$, '+213 prefix accepted');
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '11:00', 'Salma', '00213 771-22-33-44', 'fr') $$, '00213 prefix accepted');

-- validation
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '12:00', 'A', '0555123456', 'fr') $$, 'P0001', 'invalid_name', 'name too short');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '12:00', 'Amel', '021 12 34 56', 'fr') $$, 'P0001', 'invalid_phone', 'landline rejected');
select throws_ok($$ select * from public.create_booking('elegance', 'nope', null, pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'unknown service');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'sara', pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'stylist not offering service');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '17:30', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'would end after 18:00');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '12:15', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'off the 30-min grid');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', (now() at time zone 'Africa/Algiers')::date - 1, '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'past date');

-- conflicts and auto-assign
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '09:30', 'Amel', '0555123456', 'fr') $$, 'P0001', 'slot_taken', 'overlap with existing booking');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'leila', 'coupe-femme');
select is((select stylist_id from public.create_booking('elegance', 'coupe-femme', null, pg_temp.open_day(), '09:00', 'Rym', '0666123456', 'fr')),
          'leila', 'no preference skips busy stylist');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', null, pg_temp.open_day(), '09:00', 'Lina', '0666999999', 'fr') $$, 'P0001', 'slot_taken', 'no offering stylist free (sara never considered)');

-- per-phone limit: 3 upcoming non-cancelled
select pg_temp.book('amina', pg_temp.open_day(2), '09:00', '0770000001');
select pg_temp.book('amina', pg_temp.open_day(2), '10:00', '0770000001');
select pg_temp.book('amina', pg_temp.open_day(2), '11:00', '0770000001');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(2), '14:00', 'Hana', '0770000001', 'fr') $$, 'P0001', 'too_many_bookings', 'fourth upcoming booking for a phone');

-- per-IP limit (only meaningful when IP_SOURCE <> none; see Task 1)
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "203.0.113.9"}', true);
select pg_temp.book('amina', pg_temp.open_day(3), (t || ':00')::time, '05500000' || lpad(t::text, 2, '0'), 'cancelled', '203.0.113.9')
from generate_series(10, 14) t;
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(3), '09:00', 'Ines', '0551234567', 'fr') $$, 'P0001', 'rate_limited', 'sixth booking from one IP within an hour');
select set_config('request.headers', '{}', true);

-- circuit breaker: >= 20 created in the last 10 minutes (existing rows above count too)
select pg_temp.book('sara', pg_temp.open_day(4), '09:00', '0552000000', 'cancelled') from generate_series(1, 20);
select throws_ok($$ select * from public.create_booking('elegance', 'manucure', 'sara', pg_temp.open_day(4), '10:00', 'Dounia', '0553123456', 'fr') $$, 'P0001', 'rate_limited', 'circuit breaker');

select * from finish();
rollback;
