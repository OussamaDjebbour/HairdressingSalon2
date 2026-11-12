begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Each guard check is a function returning the violating names; the same function is
-- used on the real schema (must be empty) and on probes (must be reported).
-- Scope: tables ('r') and partitioned tables ('p') in public/private; views are out of scope.

create function pg_temp.tables_without_salon_id() returns text[] language sql as $$
  select coalesce(array(
    select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and c.relname <> 'salons'
      and not exists (
        select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'salon_id' and a.attnotnull and not a.attisdropped
          and exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
                      and k.confrelid = 'public.salons'::regclass and k.conkey = array[a.attnum]))
    order by 1), '{}'::text[]) $$;

create function pg_temp.salon_id_defaults() returns text[] language sql as $$
  select coalesce(array(
    select n.nspname || '.' || c.relname from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and a.attname = 'salon_id' and not a.attisdropped
    order by 1), '{}'::text[]) $$;

create function pg_temp.tables_without_rls() returns text[] language sql as $$
  select coalesce(array(
    select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by 1), '{}'::text[]) $$;

-- Registered API functions: also register them in 10_isolation.test.sql.
create function pg_temp.registered_api() returns text[] language sql as $$
  select array['get_slots', 'create_booking', 'admin_my_salon', 'admin_list_bookings', 'admin_set_booking_status',
    'admin_create_booking', 'admin_update_booking', 'admin_save_push_subscription',
    'admin_delete_push_subscription', 'admin_send_test_push',
    'admin_save_service', 'admin_set_service_active', 'admin_save_stylist', 'admin_set_stylist_active',
    'admin_add_stylist_days_off', 'admin_delete_stylist_days_off',
    'admin_set_hours', 'admin_add_closed_dates', 'admin_delete_closed_dates', 'admin_save_salon_info',
    'admin_affected_bookings'] $$;

-- Only inspects the public API schema.
create function pg_temp.unregistered_api_functions() returns text[] language sql as $$
  select coalesce(array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
      and p.proname <> all (pg_temp.registered_api())
    order by 1), '{}'::text[]) $$;

-- real schema
select is(pg_temp.tables_without_salon_id(), '{}'::text[], 'every salon-owned table has a NOT NULL salon_id referencing salons');
select is(pg_temp.salon_id_defaults(), '{}'::text[], 'no salon_id has a default');
select is(pg_temp.tables_without_rls(), '{}'::text[], 'row-level security is on everywhere');
select is(pg_temp.unregistered_api_functions(), '{}'::text[], 'every API function has isolation tests (register new ones here AND in 10_isolation)');
select is(array(select r from unnest(pg_temp.registered_api()) r
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = r)),
  '{}'::text[], 'every registered function exists in public (no stale entries)');

-- probes: each check must report its violation
create table public.guard_no_salon (id int);
create table public.guard_default (id int, salon_id text not null default 'x');
create table public.guard_no_rls (id int, salon_id text not null references public.salons (id));
create table public.guard_no_fk (id int, salon_id text not null);
create table public.guard_rls_ok (id int, salon_id text not null references public.salons (id));
alter table public.guard_rls_ok enable row level security;
create table public.guard_part (id int) partition by list (id);
create function public.guard_unregistered() returns int language sql as $$ select 1 $$;
grant execute on function public.guard_unregistered() to authenticated;

select ok(pg_temp.tables_without_salon_id() @> array['public.guard_no_salon'], 'guard detects a table without salon_id');
select ok(pg_temp.tables_without_salon_id() @> array['public.guard_no_fk'], 'guard detects a salon_id without a foreign key to salons');
select ok(not (pg_temp.tables_without_salon_id() @> array['public.guard_no_rls']), 'guard does not flag a salon_id with a foreign key');
select ok(pg_temp.tables_without_salon_id() @> array['public.guard_part'], 'guard detects a partitioned table without salon_id');
select ok(pg_temp.salon_id_defaults() @> array['public.guard_default'], 'guard detects a salon_id default');
select ok(pg_temp.tables_without_rls() @> array['public.guard_no_rls'], 'guard detects a table without RLS');
select ok(not (pg_temp.tables_without_rls() @> array['public.guard_rls_ok']), 'guard does not flag a table with RLS');
select ok(pg_temp.unregistered_api_functions() @> array['guard_unregistered'], 'guard detects an unregistered API function');
select ok(not (pg_temp.tables_without_salon_id() @> array['public.guard_rls_ok']), 'guard does not flag a table with salon_id');
select ok(not (pg_temp.salon_id_defaults() @> array['public.guard_rls_ok']), 'guard does not flag a salon_id without default');

select * from finish();
rollback;
