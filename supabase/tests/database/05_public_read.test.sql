begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Logged-in users (e.g. staff on the salon tablet) browse the public site too:
-- services, stylists and stylist_services must be readable by both API roles.
insert into public.salon_categories (id, salon_id, name) values ('el-test-cat', 'elegance', '{"fr":"T","ar":"T"}');

set local role anon;
select ok((select count(*) from public.services) > 0 and (select count(*) from public.stylists) > 0,
          'anon reads services and stylists');
select ok((select count(*) from public.salon_categories) > 0, 'anon reads salon_categories');

set local role authenticated;
select ok((select count(*) from public.services) > 0, 'authenticated reads services');
select ok((select count(*) from public.stylists) > 0, 'authenticated reads stylists');
select ok((select count(*) from public.stylist_services) > 0, 'authenticated reads stylist_services');
select ok((select count(*) from public.salon_categories) > 0, 'authenticated reads salon_categories');

reset role;
select * from finish();
rollback;
