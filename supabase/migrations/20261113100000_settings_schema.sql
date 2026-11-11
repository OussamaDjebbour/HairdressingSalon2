-- Part 2: per-salon settings tables. Writes go only through owner RPCs (later migrations).

alter table public.salons
  add column address jsonb not null default '{"fr":"","ar":""}',
  add column city jsonb not null default '{"fr":"","ar":""}',
  add column whatsapp text check (whatsapp ~ '^0[5-7][0-9]{8}$'),
  add column instagram_url text check (instagram_url ~ '^https://'),
  add column facebook_url text check (facebook_url ~ '^https://');

alter table public.services add column active boolean not null default true;
alter table public.stylists add column active boolean not null default true;

create table public.salon_hours (
  salon_id text not null references public.salons,
  weekday smallint not null check (weekday between 1 and 7),
  opens time,
  closes time,
  primary key (salon_id, weekday),
  check ((opens is null and closes is null)
    or (opens < closes and extract(minute from opens)::int % 15 = 0 and extract(minute from closes)::int % 15 = 0))
);

create table public.salon_closed_dates (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null references public.salons,
  starts_on date not null,
  ends_on date not null,
  label text check (length(label) <= 60),
  check (ends_on >= starts_on)
);

create table public.stylist_workdays (
  salon_id text not null references public.salons,
  stylist_id text not null,
  weekday smallint not null check (weekday between 1 and 7),
  primary key (stylist_id, weekday),
  foreign key (salon_id, stylist_id) references public.stylists (salon_id, id) on delete cascade
);

create table public.stylist_days_off (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null references public.salons,
  stylist_id text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on),
  foreign key (salon_id, stylist_id) references public.stylists (salon_id, id) on delete cascade
);

alter table public.salon_hours enable row level security;
alter table public.salon_closed_dates enable row level security;
alter table public.stylist_workdays enable row level security;
alter table public.stylist_days_off enable row level security;

create policy salon_hours_read on public.salon_hours for select to anon, authenticated using (true);
create policy salon_closed_dates_read on public.salon_closed_dates for select to anon, authenticated using (true);
create policy stylist_workdays_read on public.stylist_workdays for select to anon, authenticated using (true);
create policy stylist_days_off_read on public.stylist_days_off for select to authenticated
  using (salon_id = (select private.my_salon()));

grant select on public.salon_hours, public.salon_closed_dates, public.stylist_workdays to anon, authenticated;
grant select on public.stylist_days_off to authenticated;

-- Backfill existing salons
insert into public.salon_hours (salon_id, weekday, opens, closes)
select s.id, d, case when d between 2 and 6 then time '09:00' end, case when d between 2 and 6 then time '18:00' end
from public.salons s cross join generate_series(1, 7) d;

insert into public.stylist_workdays (salon_id, stylist_id, weekday)
select s.salon_id, s.id, d from public.stylists s cross join generate_series(2, 6) d;

update public.salons set
  address = '{"fr":"12 Rue Didouche Mourad\nAlger Centre 16000\nAlgérie","ar":"12 شارع ديدوش مراد\nالجزائر الوسطى 16000\nالجزائر"}',
  city = '{"fr":"Alger","ar":"الجزائر"}',
  whatsapp = '0561234567'
where id = 'elegance';
