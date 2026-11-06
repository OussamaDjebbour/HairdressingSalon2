begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Logged-in users (e.g. staff on the salon tablet) browse the public site too:
-- services, stylists and stylist_services must be readable by both API roles.
set local role anon;
select ok((select count(*) from public.services) > 0 and (select count(*) from public.stylists) > 0,
          'anon reads services and stylists');

set local role authenticated;
select ok((select count(*) from public.services) > 0, 'authenticated reads services');
select ok((select count(*) from public.stylists) > 0, 'authenticated reads stylists');
select ok((select count(*) from public.stylist_services) > 0, 'authenticated reads stylist_services');

reset role;
select * from finish();
rollback;
