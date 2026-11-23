begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- The shared demo login can't be taken over: its email and password only ever change to the stored demo login
-- (what demo_reset and pnpm setup-demo write). Other accounts are untouched.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local',
   extensions.crypt('owner-pw', extensions.gen_salt('bf'))),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo@test.local',
   extensions.crypt('demo-pw', extensions.gen_salt('bf')));
insert into private.staff (user_id, salon_id) values ('11111111-1111-1111-1111-111111111111', 'elegance');
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'demo-pw');

create function pg_temp.demo_pw_is(p text) returns boolean language sql as $$
  select u.encrypted_password = extensions.crypt(p, u.encrypted_password)
  from auth.users u where u.id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$;

-- a visitor logged in as the demo tries to take the account over
select throws_ok($$ update auth.users set email = 'me@evil.test' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'P0001', 'demo_login_locked', 'the demo login''s email can''t change');
select throws_ok($$ update auth.users set email_change = 'me@evil.test' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'P0001', 'demo_login_locked', 'no email change can be started either');
select throws_ok($$ update auth.users set encrypted_password = extensions.crypt('mine', extensions.gen_salt('bf')) where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'P0001', 'demo_login_locked', 'the demo login''s password can''t change');
select ok(pg_temp.demo_pw_is('demo-pw'), 'the shared password still works');

-- what keeps working
select lives_ok($$ update auth.users set encrypted_password = extensions.crypt('demo-pw', extensions.gen_salt('bf', 10)) where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'the same password hashed again (a re-hash on sign-in) is fine');
select lives_ok($$ update auth.users set last_sign_in_at = now(), email_change = '' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'signing in and clearing a pending change are fine');
select lives_ok($$ update auth.users set email = 'DEMO@test.local' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'the stored login email in another case is fine');
select lives_ok($$ select private.demo_reset('elegance') $$, 'the demo reset still restores the login');
select ok(pg_temp.demo_pw_is('demo-pw'), 'after the reset the shared password works');

-- pnpm setup-demo: stores a new password, then sets it on the account
select public.setup_demo('elegance', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'demo@test.local', 'new-pw');
select lives_ok($$ update auth.users set encrypted_password = extensions.crypt('new-pw', extensions.gen_salt('bf')) where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'setup-demo can rotate the password it just stored');
select throws_ok($$ update auth.users set encrypted_password = extensions.crypt('demo-pw', extensions.gen_salt('bf')) where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'P0001', 'demo_login_locked', 'the old password is no longer accepted');

-- other accounts are never affected
select lives_ok($$ update auth.users set email = 'boss@test.local', encrypted_password = extensions.crypt('x', extensions.gen_salt('bf')) where id = '11111111-1111-1111-1111-111111111111' $$,
  'the owner changes her own login freely');
select is((select email from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'boss@test.local', 'the owner''s change is saved');

select * from finish();
rollback;
