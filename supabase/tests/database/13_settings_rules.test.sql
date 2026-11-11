begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Each scenario uses its own weekday so settings changed for one don't leak into another.
-- Next date with ISO weekday p_dow strictly after today (Algiers): always inside the 14-day window.
create function pg_temp.next_dow(p_dow int) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 7, interval '1 day') d
  where extract(isodow from d) = p_dow limit 1 $$;
create function pg_temp.available(p_date date, p_service text, p_stylist text default null) returns int language sql as $$
  select count(*)::int from public.get_slots('elegance', p_date, p_service, p_stylist) where available $$;

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- Thursday 09:00–13:00
update public.salon_hours set closes = '13:00' where salon_id = 'elegance' and weekday = 4;
select is((select max(slot) from public.get_slots('elegance', pg_temp.next_dow(4), 'coupe-femme')), '12:00', 'short Thursday: last 60-min slot 12:00');
select is((select count(*)::int from public.get_slots('elegance', pg_temp.next_dow(4), 'coupe-femme')), 7, 'short Thursday: 09:00..12:00');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '12:30', 'Amel', '0555100000', 'fr') $$, pg_temp.next_dow(4)),
                 'P0001', 'outside_hours', 'short Thursday: online booking past closing');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok(format($$ select public.admin_create_booking('coupe-femme', 'amina', %L, '12:15', 'Amel', '0555100000', 'fr') $$, pg_temp.next_dow(4)),
                 'P0001', 'outside_hours', 'short Thursday: owner booking past closing');
reset role;

-- a closed date on the next Tuesday
insert into public.salon_closed_dates (salon_id, starts_on, ends_on, label) values ('elegance', pg_temp.next_dow(2), pg_temp.next_dow(2), 'Fête');
select is((select count(*)::int from public.get_slots('elegance', pg_temp.next_dow(2), 'coupe-femme')), 0, 'closed date: no slots');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '10:00', 'Amel', '0555100001', 'fr') $$, pg_temp.next_dow(2)),
                 'P0001', 'outside_hours', 'closed date: online booking refused');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok(format($$ select public.admin_create_booking('coupe-femme', 'amina', %L, '10:00', 'Amel', '0555100001', 'fr') $$, pg_temp.next_dow(2)),
                 'P0001', 'outside_hours', 'closed date: owner booking refused');
reset role;

-- Friday opens at 09:15: the online grid starts at the opening time
update public.salon_hours set opens = '09:15' where salon_id = 'elegance' and weekday = 5;
select is(array(select slot from public.get_slots('elegance', pg_temp.next_dow(5), 'coupe-femme') order by slot limit 3),
          array['09:15', '09:45', '10:15'], '09:15 opening: grid starts at 09:15');
select is((select max(slot) from public.get_slots('elegance', pg_temp.next_dow(5), 'coupe-femme')), '16:45', '09:15 opening: last 60-min slot 16:45');
select lives_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '09:15', 'Amel', '0555100002', 'fr') $$, pg_temp.next_dow(5)),
                '09:15 opening: online booking at 09:15');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '09:30', 'Amel', '0555100003', 'fr') $$, pg_temp.next_dow(5)),
                 'P0001', 'outside_hours', '09:15 opening: 09:30 is off the online grid');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '09:00', 'Amel', '0555100004', 'fr') $$, pg_temp.next_dow(5)),
                 'P0001', 'outside_hours', '09:15 opening: 09:00 is before opening');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok(format($$ select public.admin_create_booking('coupe-femme', 'leila', %L, '09:00', 'Amel', '0555100004', 'fr') $$, pg_temp.next_dow(5)),
                 'P0001', 'outside_hours', '09:15 opening: owner booking before opening');
select lives_ok(format($$ select public.admin_create_booking('coupe-femme', 'leila', %L, '09:30', 'Amel', '0555100004', 'fr') $$, pg_temp.next_dow(5)),
                '09:15 opening: owner keeps 15-minute steps');
reset role;

-- Sunday opened 10:00–14:00
update public.salon_hours set opens = '10:00', closes = '14:00' where salon_id = 'elegance' and weekday = 7;
select is(array(select slot from public.get_slots('elegance', pg_temp.next_dow(7), 'coupe-femme') order by slot),
          array['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'], 'open Sunday has slots');
select is(pg_temp.available(pg_temp.next_dow(7), 'coupe-femme'), 0, 'open Sunday: nobody works Sundays yet');
insert into public.stylist_workdays (salon_id, stylist_id, weekday) values ('elegance', 'amina', 7);
select is(pg_temp.available(pg_temp.next_dow(7), 'coupe-femme'), 7, 'open Sunday: bookable once a stylist works Sundays');

-- Amina stops working Wednesdays
delete from public.stylist_workdays where stylist_id = 'amina' and weekday = 3;
select is(pg_temp.available(pg_temp.next_dow(3), 'coupe-femme', 'amina'), 0, 'Amina off on Wednesday: no available slot with her');
select is(private.stylist_works('amina', pg_temp.next_dow(3)), false, 'stylist_works: not a workday');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', %L, '10:00', 'Amel', '0555100005', 'fr') $$, pg_temp.next_dow(3)),
                 'P0001', 'slot_taken', 'Amina off on Wednesday: online booking with her refused');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'leila', 'coupe-femme');
select ok(pg_temp.available(pg_temp.next_dow(3), 'coupe-femme') > 0, 'Amina off on Wednesday: no preference still available');
select is((select stylist_id from public.create_booking('elegance', 'coupe-femme', null, pg_temp.next_dow(3), '10:00', 'Rym', '0555100006', 'fr')),
          'leila', 'Amina off on Wednesday: no preference assigns Leila');

-- Amina's day off covering Saturday (range starting the day before)
insert into public.stylist_days_off (salon_id, stylist_id, starts_on, ends_on) values ('elegance', 'amina', pg_temp.next_dow(6) - 1, pg_temp.next_dow(6));
select is(pg_temp.available(pg_temp.next_dow(6), 'coupe-femme', 'amina'), 0, 'Amina day off: no available slot with her');
select is(private.stylist_works('amina', pg_temp.next_dow(6)), false, 'stylist_works: day off');
select is(private.stylist_works('amina', pg_temp.next_dow(6) + 7), true, 'stylist_works: works again after the day off');
select ok(pg_temp.available(pg_temp.next_dow(6), 'coupe-femme') > 0, 'Amina day off: no preference still available');
select is((select stylist_id from public.create_booking('elegance', 'coupe-femme', null, pg_temp.next_dow(6), '10:00', 'Lina', '0555100007', 'fr')),
          'leila', 'Amina day off: no preference assigns Leila');

-- the owner may still book Amina on her non-working Wednesday
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok(format($$ select public.admin_create_booking('coupe-femme', 'amina', %L, '15:00', 'Walkin', '0555100008', 'fr') $$, pg_temp.next_dow(3)),
                'owner books Amina on her non-working Wednesday');
reset role;

-- removed (inactive) service
update public.services set active = false where id = 'manucure';
select throws_ok(format($$ select * from public.get_slots('elegance', %L, 'manucure') $$, pg_temp.next_dow(5)),
                 'P0001', 'unknown_service', 'inactive service: get_slots');
select throws_ok(format($$ select * from public.create_booking('elegance', 'manucure', 'sara', %L, '11:15', 'Amel', '0555100009', 'fr') $$, pg_temp.next_dow(5)),
                 'P0001', 'unknown_service', 'inactive service: create_booking');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok(format($$ select public.admin_create_booking('manucure', 'sara', %L, '11:00', 'Amel', '0555100009', 'fr') $$, pg_temp.next_dow(5)),
                 'P0001', 'unknown_service', 'inactive service: admin_create_booking');
reset role;

-- removed (inactive) stylist
update public.stylists set active = false where id = 'leila';
select throws_ok(format($$ select * from public.get_slots('elegance', %L, 'coupe-femme', 'leila') $$, pg_temp.next_dow(3)),
                 'P0001', 'unknown_service', 'inactive stylist: get_slots');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', 'leila', %L, '11:00', 'Amel', '0555100010', 'fr') $$, pg_temp.next_dow(3)),
                 'P0001', 'unknown_service', 'inactive stylist: create_booking');
select is(pg_temp.available(pg_temp.next_dow(3), 'coupe-femme'), 0, 'inactive stylist: never a no-preference candidate');
select is(private.stylist_works('leila', pg_temp.next_dow(4)), false, 'stylist_works: inactive stylist');
select throws_ok(format($$ select * from public.create_booking('elegance', 'coupe-femme', null, %L, '11:00', 'Amel', '0555100010', 'fr') $$, pg_temp.next_dow(3)),
                 'P0001', 'slot_taken', 'inactive stylist: no preference finds nobody');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok(format($$ select public.admin_create_booking('coupe-femme', 'leila', %L, '10:00', 'Amel', '0555100010', 'fr') $$, pg_temp.next_dow(4)),
                 'P0001', 'unknown_service', 'inactive stylist: admin_create_booking');
reset role;

-- day_hours itself
select is((select count(*)::int from private.day_hours('elegance', pg_temp.next_dow(1))), 0, 'day_hours: closed weekday has no row');
select is((select opens_min || '-' || closes_min from private.day_hours('elegance', pg_temp.next_dow(4))), '540-780', 'day_hours: minutes since midnight');

select * from finish();
rollback;
