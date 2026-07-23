create table services (
  id          text primary key,
  category    text not null,
  name        jsonb not null,
  description jsonb not null,
  price       integer not null,
  duration    integer not null,
  image       text not null,
  icon        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table stylists (
  id          text primary key,
  name        text not null,
  role        jsonb not null,
  specialties jsonb not null default '[]',
  image       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table services enable row level security;
alter table stylists enable row level security;

create policy "public read services" on services for select to anon using (true);
create policy "public read stylists" on stylists for select to anon using (true);
