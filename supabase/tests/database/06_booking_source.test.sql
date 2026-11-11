begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_phone text, p_source text default 'online')
returns void language plpgsql as $$
begin
  execute format(
    'insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
     values (%L, %L, %L, %L, %L, 2500, %L, %L, %L, %L)',
    'elegance', 'coupe-femme', p_stylist,
    (p_day + p_time) at time zone 'Africa/Algiers',
    ((p_day + p_time) at time zone 'Africa/Algiers') + interval '60 minutes',
    'Seed Client', p_phone, 'fr', p_source);
end $$;
create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');

select has_column('private', 'bookings', 'source', 'bookings.source exists');

select create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '09:00', 'Yasmine', '0555123456', 'fr');
select is((select source from private.bookings where client_name = 'Yasmine'), 'online', 'online bookings default to online');

-- per-phone limit ignores bookings the owner added
select pg_temp.book('amina', pg_temp.open_day(2), t::time, '0777000001', 'staff') from unnest(array['09:00', '10:00', '11:00']) t;
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '10:00', 'Nadia', '0777000001', 'fr') $$,
                'per-phone limit ignores staff bookings');

-- ...but still counts online ones
select pg_temp.book('leila', pg_temp.open_day(2), t::time, '0777000002') from unnest(array['09:00', '10:00', '11:00']) t;
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '11:00', 'Salma', '0777000002', 'fr') $$,
                 'P0001', 'too_many_bookings', 'per-phone limit still counts online bookings');

-- site-wide breaker ignores bookings the owner added (copying the paper agenda in)
select pg_temp.book(s, pg_temp.open_day(3), make_time(h, 0, 0), '0666000000', 'staff')
from (select s, h from unnest(array['amina', 'leila', 'sara']) s, generate_series(9, 15) h limit 20) x;
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(), '12:00', 'Imane', '0777000003', 'fr') $$,
                'site-wide breaker ignores staff bookings');

-- staff list returns source
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select source from public.admin_list_bookings(pg_temp.open_day(), pg_temp.open_day()) where client_name = 'Yasmine'),
          'online', 'admin_list_bookings returns source');
reset role;

select * from finish();
rollback;
