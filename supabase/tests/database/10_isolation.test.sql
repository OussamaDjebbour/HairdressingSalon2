begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;

insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('rival', 'nadia', 'rival-cut');

select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'rival-cut') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s service');
select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme', 'nadia') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s stylist');
select throws_ok($$ select * from public.create_booking('elegance', 'rival-cut', null, pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s service');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'nadia', pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s stylist');
select is((select count(*)::int from private.bookings where client_name = 'Amel'), 0, 'nothing inserted');

-- 20 recent online bookings at rival (cancelled, so no overlap constraint) trip rival's circuit breaker, not elegance's
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status, source)
select 'rival', 'rival-cut', 'nadia', now() + interval '3 days' + i * interval '1 hour', now() + interval '3 days' + i * interval '1 hour' + interval '1 hour',
       1000, 'Flood', '0555000001', 'fr', 'cancelled', 'online'
from generate_series(1, 20) i;
select throws_ok($$ select * from public.create_booking('rival', 'rival-cut', 'nadia', pg_temp.open_day(2), '10:00', 'Zed', '0555888888', 'fr') $$, 'P0001', 'rate_limited', 'rival is rate limited by its own traffic');
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(2), '10:00', 'Lina', '0555777777', 'fr') $$, 'rival''s traffic does not rate-limit elegance');
select is((select salon_id from private.bookings where client_name = 'Lina'), 'elegance', 'booking stored in the right salon');

-- per-phone limit is per salon: 3 future bookings at rival don't block that phone at elegance
delete from private.bookings where client_name = 'Flood';
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
select 'rival', 'rival-cut', 'nadia', now() + interval '3 days' + i * interval '2 hours', now() + interval '3 days' + i * interval '2 hours' + interval '1 hour',
       1000, 'Phone', '0666123123', 'fr', 'online'
from generate_series(1, 3) i;
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(3), '10:00', 'Phoebe', '0666123123', 'fr') $$, 'rival''s bookings for a phone do not count at elegance');

select * from finish();
rollback;
