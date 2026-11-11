-- Part 1: one shared database for many salons.

create table public.salons (
  id         text primary key,
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
alter table public.salons enable row level security;
create policy "public read salons" on public.salons
  for select to anon, authenticated using (true);
grant select on public.salons to anon, authenticated;

insert into public.salons (id, name) values ('elegance', 'Élégance');

-- salon_id everywhere (default is temporary; removed once functions are salon-aware)
alter table public.services           add column salon_id text not null default 'elegance' references public.salons(id);
alter table public.stylists           add column salon_id text not null default 'elegance' references public.salons(id);
alter table public.stylist_services   add column salon_id text not null default 'elegance' references public.salons(id);
alter table private.bookings          add column salon_id text not null default 'elegance' references public.salons(id);
alter table private.staff             add column salon_id text not null default 'elegance' references public.salons(id);
alter table private.push_subscriptions add column salon_id text not null default 'elegance' references public.salons(id);

-- composite keys back the composite foreign keys (ids stay globally unique)
alter table public.services add constraint services_salon_id_id_key unique (salon_id, id);
alter table public.stylists add constraint stylists_salon_id_id_key unique (salon_id, id);

alter table private.bookings drop constraint bookings_service_id_fkey;
alter table private.bookings drop constraint bookings_stylist_id_fkey;
alter table public.stylist_services drop constraint stylist_services_stylist_id_fkey;
alter table public.stylist_services drop constraint stylist_services_service_id_fkey;

alter table private.bookings
  add constraint bookings_salon_service_fkey foreign key (salon_id, service_id) references public.services (salon_id, id),
  add constraint bookings_salon_stylist_fkey foreign key (salon_id, stylist_id) references public.stylists (salon_id, id);
alter table public.stylist_services
  add constraint stylist_services_salon_stylist_fkey foreign key (salon_id, stylist_id) references public.stylists (salon_id, id) on delete cascade,
  add constraint stylist_services_salon_service_fkey foreign key (salon_id, service_id) references public.services (salon_id, id) on delete cascade;

-- defence in depth: no policies; only postgres-owned security definer functions touch these
alter table private.bookings enable row level security;
alter table private.staff enable row level security;
alter table private.push_subscriptions enable row level security;

create or replace function private.my_salon()
returns text language sql stable security definer set search_path = ''
as $$ select s.salon_id from private.staff s where s.user_id = auth.uid() $$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.my_salon() is not null $$;

create or replace function public.admin_my_salon()
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return private.my_salon();
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_my_salon() from public, anon, authenticated;
grant execute on function public.admin_my_salon() to authenticated;
