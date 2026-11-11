begin;
select plan(5);

-- 1. every table in public/private has salon_id (allow-list: salons)
select is(array(
  select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and c.relname <> 'salons'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'salon_id' and a.attnotnull and not a.attisdropped)
  order by 1), '{}'::text[], 'every salon-owned table has a NOT NULL salon_id');

-- 2. no salon_id default (a default would silently put rows in the wrong salon)
select is(array(select table_schema || '.' || table_name from information_schema.columns
  where table_schema in ('public', 'private') and column_name = 'salon_id' and column_default is not null order by 1),
  '{}'::text[], 'no salon_id has a default');

-- 3. RLS enabled on every table in public/private
select is(array(select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity order by 1),
  '{}'::text[], 'row-level security is on everywhere');

-- 4. every function anon/authenticated can call in public is covered by 10_isolation.test.sql
select is(array(
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  except select unnest(array[
    'get_slots', 'create_booking', 'admin_my_salon', 'admin_list_bookings', 'admin_set_booking_status',
    'admin_create_booking', 'admin_update_booking', 'admin_save_push_subscription',
    'admin_delete_push_subscription', 'admin_send_test_push'])
  order by 1), '{}'::text[], 'every API function has isolation tests (register new ones here AND in 10_isolation)');

-- 5. self-check: the guard query in (1) detects a table without salon_id
create table public.guard_probe (id int);
select ok(exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'guard_probe' and c.relkind = 'r'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'salon_id' and a.attnotnull and not a.attisdropped)),
  'guard detects a missing salon_id');

select * from finish();
rollback;
