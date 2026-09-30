create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Public, non-sensitive: which stylist offers which service
create table public.stylist_services (
  stylist_id text not null references public.stylists(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  primary key (stylist_id, service_id)
);
alter table public.stylist_services enable row level security;
create policy "public read stylist_services" on public.stylist_services
  for select to anon, authenticated using (true);
grant select on public.stylist_services to anon, authenticated;

create table private.bookings (
  id           uuid primary key default gen_random_uuid(),
  service_id   text not null references public.services(id),
  stylist_id   text not null references public.stylists(id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  price        integer not null,
  client_name  text not null check (length(client_name) between 2 and 80),
  client_phone text not null check (client_phone ~ '^0[5-7][0-9]{8}$'),
  client_ip    inet,
  lang         text not null check (lang in ('fr', 'ar')),
  status       text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint bookings_no_overlap exclude using gist
    (stylist_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'cancelled')
);
create index bookings_starts_at_idx on private.bookings (starts_at);
create index bookings_phone_idx on private.bookings (client_phone, starts_at);
create index bookings_created_at_idx on private.bookings (created_at);

create table private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

revoke all on all tables in schema private from public, anon, authenticated;
