begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', ''),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local',
   extensions.crypt('demo-pw', extensions.gen_salt('bf'))),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rival@test.local', '');
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
insert into public.salons (id, name) values ('rival', 'Rival');
insert into private.staff (user_id, salon_id) values ('44444444-4444-4444-4444-444444444444', 'rival');
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'demo-pw');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Algiers')::date $$;
create function pg_temp.local_day(t timestamptz) returns date language sql as $$ select (t at time zone 'Africa/Algiers')::date $$;
create function pg_temp.local_min(t timestamptz) returns int language sql as $$
  select (extract(hour from t at time zone 'Africa/Algiers') * 60 + extract(minute from t at time zone 'Africa/Algiers'))::int $$;
-- a fingerprint of elegance's bookings, to compare two runs
create function pg_temp.fingerprint() returns text language sql as $$
  select string_agg(stylist_id || service_id || starts_at || client_name || client_phone || status || source || lang, ',' order by starts_at, stylist_id)
  from private.bookings where salon_id = 'elegance' $$;

-- push is configured: every new online booking would post to the owner's devices
select vault.create_secret('http://example.invalid/notify', 'notify_booking_url');
select vault.create_secret('s3cret', 'notify_booking_secret');
insert into private.push_subscriptions (endpoint, p256dh, auth, lang, user_id, salon_id) values
  ('https://push/owner', 'k', 'a', 'fr', '11111111-1111-1111-1111-111111111111', 'elegance'),
  ('https://push/demo', 'k', 'a', 'fr', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'elegance');

-- a prospect plays with the demo
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('x-new', 'elegance', 'coiffure', '{"fr":"Nouveau","ar":"جديد"}', '{"fr":"","ar":""}', 1000, 30, '', 'scissors');
insert into public.stylists (id, salon_id, name, role, image) values ('x-stylist', 'elegance', 'Xenia', '{"fr":"","ar":""}', '');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'x-stylist', 'x-new'), ('elegance', 'amina', 'x-new');
insert into public.stylist_workdays (salon_id, stylist_id, weekday) values ('elegance', 'x-stylist', 3);
delete from public.stylist_services where stylist_id = 'leila' and service_id = 'soin-visage';
update public.services set active = false where id = 'manucure';
update public.services set name = '{"fr":"Renommé","ar":"Renommé"}', price = 1 where id = 'coupe-femme';
update public.salon_hours set opens = null, closes = null where salon_id = 'elegance';
insert into public.salon_closed_dates (salon_id, starts_on, ends_on, label) values ('elegance', pg_temp.today(), pg_temp.today() + 30, 'Vacances');
insert into public.stylist_days_off (salon_id, stylist_id, starts_on, ends_on) values ('elegance', 'amina', pg_temp.today(), pg_temp.today() + 30);
update public.salons set whatsapp = '0770000000' where id = 'elegance';
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('elegance', 'x-new', 'amina', now() + interval '2 days', now() + interval '2 days 30 minutes', 1000, 'Prospect', '0661234567', 'fr', 'staff');
-- ... and changes the shared account's login
update auth.users set email = 'hijacked@test.local', encrypted_password = extensions.crypt('mine', extensions.gen_salt('bf')),
  email_change = 'other@test.local', email_change_token_new = 'tok', email_change_sent_at = now()
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- rival's state (must survive)
insert into public.salon_hours (salon_id, weekday, opens, closes)
  select 'rival', d, case when d between 2 and 6 then time '10:00' end, case when d between 2 and 6 then time '16:00' end from generate_series(1, 7) d;
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image) values ('nadia', 'rival', 'Nadia', '{"fr":"x","ar":"x"}', 'x');
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('rival', 'rival-cut', 'nadia', now() + interval '2 days', now() + interval '2 days 1 hour', 1000, 'Rival Client', '0555999999', 'fr', 'staff');

create temp table queue_before as select count(*) as n from net.http_request_queue;

-- functions and access
select has_function('private', 'demo_reset', array['text'], 'private.demo_reset exists');
select has_function('private', 'demo_reset_all', '{}'::text[], 'private.demo_reset_all exists');
select has_function('private', 'demo_fake_bookings', array['text', 'date', 'integer'], 'private.demo_fake_bookings exists');
select ok(not has_function_privilege('anon', 'private.demo_reset(text)', 'execute')
          and not has_function_privilege('authenticated', 'private.demo_reset(text)', 'execute'), 'demo_reset is not callable by the API roles');
select ok(not has_function_privilege('anon', 'private.demo_reset_all()', 'execute')
          and not has_function_privilege('authenticated', 'private.demo_reset_all()', 'execute'), 'demo_reset_all is not callable by the API roles');
select ok(not has_function_privilege('anon', 'private.demo_fake_bookings(text, date, integer)', 'execute')
          and not has_function_privilege('authenticated', 'private.demo_fake_bookings(text, date, integer)', 'execute'), 'demo_fake_bookings is not callable by the API roles');

select throws_ok($$ select private.demo_reset('rival') $$, 'P0001', 'not_demo', 'a salon that is not a demo is never reset');
select throws_ok($$ select private.demo_reset('nope') $$, 'P0001', 'not_demo', 'an unknown salon is not_demo');

select lives_ok($$ select private.demo_reset('elegance') $$, 'demo_reset runs');

-- the catalogue and settings are back
select is((select count(*)::int from public.services where id = 'x-new'), 0, 'a service the prospect added is gone');
select is((select count(*)::int from public.stylists where id = 'x-stylist'), 0, 'a stylist the prospect added is gone');
select is((select active from public.services where id = 'manucure'), true, 'a hidden service is visible again');
select is((select (name ->> 'fr') || ' ' || price from public.services where id = 'coupe-femme'), 'Coupe & Brushing 2500', 'a renamed service has its name and price back');
select is((select count(*)::int from public.stylist_services where stylist_id = 'leila' and service_id = 'soin-visage'), 1, 'a removed stylist link is back');
select is((select count(*)::int from public.stylist_services where salon_id = 'elegance'), 6, 'only the original links remain');
select is((select string_agg(weekday || '=' || coalesce(to_char(opens, 'HH24:MI') || '-' || to_char(closes, 'HH24:MI'), 'closed'), ' ' order by weekday)
           from public.salon_hours where salon_id = 'elegance'),
          '1=closed 2=09:00-18:00 3=09:00-18:00 4=09:00-18:00 5=09:00-18:00 6=09:00-18:00 7=closed', 'hours back to Tue–Sat 09:00–18:00');
select is((select count(*)::int from public.salon_closed_dates where salon_id = 'elegance'), 0, 'closed dates are gone');
select is((select count(*)::int from public.stylist_days_off where salon_id = 'elegance'), 0, 'days off are gone');
select is((select whatsapp from public.salons where id = 'elegance'), '0561234567', 'WhatsApp number is back');
select is((select demo from public.salons where id = 'elegance'), true, 'still the demo salon');

-- the shared account
select is((select email from auth.users where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 'demo@test.local', 'the demo account''s email is restored');
select ok((select encrypted_password = extensions.crypt('demo-pw', encrypted_password) from auth.users where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
          'the demo account''s password is restored');
select is((select coalesce(email_change, '') || '|' || coalesce(email_change_token_new, '') from auth.users where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
          '|', 'a pending email change is cleared');
select is((select email from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'owner@test.local', 'the owner''s account is untouched');
select is((select string_agg(endpoint, ',' order by endpoint) from private.push_subscriptions where salon_id = 'elegance'), 'https://push/owner',
          'the demo account''s push subscriptions are gone, the owner''s stay');

-- bookings: the prospect's are gone; fake ones fill the next 7 days
select is((select count(*)::int from private.bookings where client_name = 'Prospect'), 0, 'the prospect''s booking is gone');
select ok((select count(*) from private.bookings where salon_id = 'elegance') > 0, 'fake bookings exist');
select is((select count(*)::int from private.bookings where salon_id = 'elegance'
           and pg_temp.local_day(starts_at) not between pg_temp.today() and pg_temp.today() + 6), 0, 'fake bookings are within the next 7 days');
select is((select count(*)::int from private.bookings b where b.salon_id = 'elegance'
           and not exists (select 1 from private.day_hours('elegance', pg_temp.local_day(b.starts_at)))), 0, 'fake bookings are only on open days');
select is((select count(*)::int from private.bookings b join private.day_hours('elegance', pg_temp.local_day(b.starts_at)) h on true
           where b.salon_id = 'elegance'
             and (pg_temp.local_min(b.starts_at) < h.opens_min or pg_temp.local_min(b.ends_at) > h.closes_min
                  or pg_temp.local_day(b.ends_at) <> pg_temp.local_day(b.starts_at))), 0, 'fake bookings are inside opening hours');
select is((select count(*)::int from generate_series(pg_temp.today(), pg_temp.today() + 6, interval '1 day') d
           where exists (select 1 from private.day_hours('elegance', d::date))
             and (select count(*) from private.bookings b where b.salon_id = 'elegance' and pg_temp.local_day(b.starts_at) = d::date) not between 3 and 5),
          0, 'every open day has 3 to 5 fake bookings');
select ok((select count(*) from private.bookings where salon_id = 'elegance' and status = 'pending') >= 2, 'at least two pending in the week');
select ok((select count(*) from private.bookings where salon_id = 'elegance' and status = 'confirmed') >= 1, 'some confirmed');
select is((select string_agg(distinct source, ',') from private.bookings where salon_id = 'elegance'), 'online,staff', 'a mix of online and staff sources');
select is((select count(*)::int from private.bookings a join private.bookings b on a.stylist_id = b.stylist_id and a.id < b.id
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
           where a.salon_id = 'elegance'), 0, 'no overlap per stylist');
select is((select count(*)::int from private.bookings where salon_id = 'elegance' and client_phone !~ '^0550000[0-9]{3}$'), 0,
          'phones are in the reserved fake range 0550000000–0550000999');
select is((select count(*)::int from private.bookings b join public.services s on s.id = b.service_id
           where b.salon_id = 'elegance' and (b.price <> s.price or b.ends_at - b.starts_at <> make_interval(mins => s.duration))), 0,
          'price and duration come from the service');
select is((select count(*)::int from private.bookings b where b.salon_id = 'elegance'
           and not exists (select 1 from public.stylist_services ss join public.stylists st on st.id = ss.stylist_id join public.services s on s.id = ss.service_id
                           where ss.stylist_id = b.stylist_id and ss.service_id = b.service_id and st.active and s.active
                             and private.stylist_works(b.stylist_id, pg_temp.local_day(b.starts_at)))), 0,
          'each fake booking is an active service its working stylist offers');
select is((select count(*)::int from private.bookings where salon_id = 'elegance' and created_at > now() - interval '1 hour'), 0,
          'fake bookings look booked earlier (they never count toward the online abuse limits)');
select is((select n from queue_before), (select count(*) from net.http_request_queue), 'the reset sends no push notification');

-- deterministic per date
create temp table fp as select pg_temp.fingerprint() as v;
select private.demo_reset('elegance');
select is(pg_temp.fingerprint(), (select v from fp), 'the same day gives the same fake bookings');
create temp table later as select private.demo_fake_bookings('elegance', pg_temp.today() + 30, 7) as n;
select is((select n from later),
          (select count(*)::int from private.bookings where salon_id = 'elegance' and pg_temp.local_day(starts_at) >= pg_temp.today() + 30),
          'demo_fake_bookings returns how many it inserted');
select throws_ok($$ select private.demo_fake_bookings('rival', pg_temp.today(), 7) $$, 'P0001', 'not_demo', 'no fake bookings in a salon that is not a demo');

-- a real online booking still notifies after a reset in the same transaction
insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, source)
  values ('elegance', 'coupe-femme', 'amina', '2031-01-07 09:00+01', '2031-01-07 10:00+01', 2500, 'Real Client', '0661234567', 'fr', 'online');
select is((select count(*) from net.http_request_queue), (select n from queue_before) + 1, 'a real online booking still notifies');

-- rival is untouched
select is((select (name ->> 'fr') || ' ' || price from public.services where id = 'rival-cut') || ' ' || (select name from public.stylists where id = 'nadia'),
          'Coupe R 1000 Nadia', 'rival catalogue unchanged');
select is((select string_agg(client_name, ',') from private.bookings where salon_id = 'rival'), 'Rival Client', 'rival bookings unchanged');
select is((select count(*)::int from public.salon_hours where salon_id = 'rival' and opens = '10:00'), 5, 'rival hours unchanged');

-- demo_reset_all resets every demo salon
update public.salons set whatsapp = '0770000000' where id = 'elegance';
select private.demo_reset_all();
select is((select whatsapp from public.salons where id = 'elegance'), '0561234567', 'demo_reset_all resets the demo salon');
select is((select string_agg(client_name, ',') from private.bookings where salon_id = 'rival'), 'Rival Client', 'demo_reset_all leaves other salons alone');

-- the on-demand reset: only the product owner's account in the demo salon
update public.salons set whatsapp = '0770000000' where id = 'elegance';
select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select throws_ok($$ select public.admin_reset_demo() $$, 'P0001', 'not_authorized', 'the demo account cannot reset');
reset role;
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
set local role authenticated;
select throws_ok($$ select public.admin_reset_demo() $$, 'P0001', 'not_authorized', 'the owner of a salon that is not a demo cannot reset');
reset role;
set local role anon;
select throws_ok($$ select public.admin_reset_demo() $$, '42501', null, 'anon cannot call admin_reset_demo');
reset role;
select is((select whatsapp from public.salons where id = 'elegance'), '0770000000', 'refused resets change nothing');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.admin_reset_demo() $$, 'the owner of the demo salon can reset');
reset role;
select is((select whatsapp from public.salons where id = 'elegance'), '0561234567', 'the owner''s reset restored the demo');

-- nightly at ~03:00 Algiers
select is((select schedule || ' ' || command from cron.job where jobname = 'demo-nightly-reset'), '0 2 * * * select private.demo_reset_all()',
          'the nightly reset is scheduled at 02:00 UTC');

select * from finish();
rollback;
