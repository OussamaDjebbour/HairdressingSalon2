begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');

select has_table('public', 'salon_hours', 'salon_hours exists');
select has_table('public', 'salon_closed_dates', 'salon_closed_dates exists');
select has_table('public', 'stylist_workdays', 'stylist_workdays exists');
select has_table('public', 'stylist_days_off', 'stylist_days_off exists');

select is((select count(*)::int from public.salon_hours where salon_id = 'elegance'), 7, 'elegance has 7 hours rows');
select is((select opens::text || '-' || closes::text from public.salon_hours where salon_id = 'elegance' and weekday = 2), '09:00:00-18:00:00', 'Tuesday 09:00-18:00');
select is((select count(*)::int from public.salon_hours where salon_id = 'elegance' and weekday in (1, 7) and opens is null and closes is null), 2, 'Sunday and Monday closed');
select is((select count(*)::int from public.stylists s where s.salon_id = 'elegance' and (not exists (select 1 from public.stylist_workdays w where w.stylist_id = s.id) or (select count(*) from public.stylist_workdays w where w.stylist_id = s.id) <> 5)), 0, 'every seeded stylist has 5 workdays');
select is((select city->>'fr' || '/' || whatsapp from public.salons where id = 'elegance'), 'Alger/0561234567', 'elegance city and whatsapp');

select throws_ok($$ update public.salon_hours set opens = '09:10' where salon_id = 'elegance' and weekday = 2 $$, '23514', null, 'opens off the 15-minute grid');
select throws_ok($$ update public.salon_hours set opens = '19:00' where salon_id = 'elegance' and weekday = 2 $$, '23514', null, 'opens after closes');
select throws_ok($$ insert into public.salon_closed_dates (salon_id, starts_on, ends_on) values ('elegance', '2027-01-02', '2027-01-01') $$, '23514', null, 'ends_on before starts_on');
select throws_ok($$ update public.salons set whatsapp = '021234567' where id = 'elegance' $$, '23514', null, 'bad whatsapp');
select throws_ok($$ update public.salons set instagram_url = 'http://x' where id = 'elegance' $$, '23514', null, 'non-https url');

set local role anon;
select is((select count(*)::int from public.salon_hours), 7, 'anon reads salon_hours');
select is((select count(*)::int from public.stylist_days_off), 0, 'anon sees no days off');
select throws_ok($$ insert into public.salon_hours (salon_id, weekday) values ('elegance', 1) $$, '42501', null, 'anon cannot insert hours');
reset role;

select throws_ok($$ insert into public.stylist_workdays (salon_id, stylist_id, weekday) values ('elegance', 'nadia', 2) $$, '23503', null, 'cross-salon stylist workday rejected');

select * from finish();
rollback;
