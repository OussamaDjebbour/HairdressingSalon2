# SP2 — Booking Persistence, Real Availability & Minimal Staff Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save customer bookings in Supabase with real, conflict-free availability, and give salon staff a login-protected `/admin` to see, confirm and cancel them.

**Architecture:** All booking rules live in Postgres: a `private.bookings` table (not exposed by the Data API) with an exclusion constraint that makes overlapping bookings per stylist impossible, and four `security definer` RPCs (`get_slots`, `create_booking`, `admin_list_bookings`, `admin_set_booking_status`). The React app calls those RPCs through TanStack Query hooks; staff authenticate with Supabase Auth (sign-ups disabled) and must also be listed in `private.staff`.

**Tech Stack:** Supabase (Postgres 17, PostgREST RPC, Auth, CLI migrations, pgTAP via `supabase test db`), Vite + React 18 + TypeScript, TanStack Query v5, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-sp2-bookings-and-staff-admin-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, `pnpm test`, `pnpm build`). Never npm.
- Timezone `Africa/Algiers`; opening hours 09:00–18:00 and a service must **end** by 18:00; closed Sunday and Monday; 30-minute slot grid; booking window = today (future times only) through today + 13 days.
- Phone rule: normalised to `^0[5-7][0-9]{8}$` (strip spaces, dots, dashes, parentheses; `+213` / `00213` prefix → `0`). Name: trimmed, 2–80 chars.
- Limits: max 3 upcoming non-cancelled bookings per phone (`too_many_bookings`); max 5 bookings per IP per rolling hour (`rate_limited`, conditional on Task 1); circuit breaker rejects when ≥ 20 bookings were created site-wide in the last 10 minutes (`rate_limited`).
- Customer data lives only in schema `private`; every function is `security definer set search_path = ''` with fully qualified names; `execute` revoked from `public`/`anon`/`authenticated` and granted per function. Errors are raised as `raise exception '<code>' using errcode = 'P0001'`.
- Error codes (exact strings): `slot_taken`, `rate_limited`, `too_many_bookings`, `invalid_phone`, `invalid_name`, `outside_hours`, `unknown_service`, `not_authorized`, `invalid_range`, `invalid_status`, `not_found`.
- Every user-facing string goes through `t(key)` with the key in **both** `fr` and `ar` maps of `src/context/LanguageContext.tsx`. Logical CSS (`text-start`, `ms-`/`me-`, `ps-`/`pe-`, `gap-`); design-system classes (`btn-*`, `card`, `input`, `label`, `img-placeholder`) and Tailwind tokens only — no raw hex; icons from `lucide-react` only.
- Do **not** touch: the booking→WhatsApp message text builder (other than the stylist name source), `Services.tsx`, business-hours configurability, customer accounts, Turnstile/SMS.
- Local database work needs Docker and the local stack: `supabase start` (once), `supabase db reset` after changing migrations/seed, `supabase test db` to run pgTAP. **Never** run `supabase db push` except in Task 12, and only by the user.
- After each task: `pnpm build` and `pnpm test` pass; tasks that touch SQL also need `supabase test db` green.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/<ts>_create_bookings.sql` | `stylist_services`, `private` schema, `private.bookings`, `private.staff`, grants | 2 |
| `supabase/migrations/<ts>_booking_functions.sql` | helpers, `get_slots`, `create_booking` | 3, 4 |
| `supabase/migrations/<ts>_admin_functions.sql` | `private.is_staff`, `admin_list_bookings`, `admin_set_booking_status` | 9 |
| `supabase/seed.sql` | idempotent seed + stylist_services pairs | 2 |
| `supabase/config.toml` | `[auth] enable_signup = false` | 2 |
| `supabase/tests/database/*.test.sql` | pgTAP tests | 2, 3, 4, 9 |
| `src/data/types.ts`, `src/data/queries.ts` | `Stylist.serviceIds` | 5 |
| `src/data/bookings.ts` (+ test) | slots/booking RPC hooks, phone utils, error mapping, `toYmd` | 6 |
| `src/components/Booking.tsx` | wizard wiring, errors, success screen | 7, 8 |
| `src/data/services.ts` | deleted (stubs gone) | 7 |
| `src/lib/auth.ts` (+ test) | `useSession`, `signIn`, `signOut` | 10 |
| `src/components/LoginForm.tsx` (+ test) | staff login form | 10 |
| `src/pages/AdminPage.tsx` | session gating, logout | 10 |
| `src/data/admin.ts` (+ test) | admin RPC hooks, `formatAlgiersTime` | 11 |
| `src/components/Schedule.tsx` | real-data day view + actions | 11 |
| `src/data/hours.ts` | `OPENING_HOUR`/`CLOSING_HOUR` | 11 |
| `src/data/appointments.ts` | deleted (mock) | 11 |
| `src/components/Badge.tsx`, `src/index.css` | `cancelled` badge | 11 |
| `src/context/LanguageContext.tsx` | new i18n keys | 7, 8, 10, 11 |

---

# Phase A — Public bookings

### Task 1: Spike — which client-IP header can be trusted

Throwaway investigation; no code is kept. Output is a decision recorded in the spec.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-sp2-bookings-and-staff-admin-design.md` (Testing → Spike: record the result)

**Interfaces:**
- Produces: decision `IP_SOURCE` = one of `cf-connecting-ip`, `x-forwarded-for:last`, `x-forwarded-for:first`, or `none` — consumed by Task 4 (`private.client_ip()`).

- [ ] **Step 1: Ask the user to create a temporary debug function on the remote project**

This is a change to the live database, so the **user** runs it in the Supabase dashboard → SQL Editor (HairSalon project):

```sql
create or replace function public.debug_headers() returns json
language sql stable as $$ select current_setting('request.headers', true)::json $$;
grant execute on function public.debug_headers() to anon;
```

- [ ] **Step 2: Call it with forged headers**

```bash
set -a; . ./.env; set +a
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/debug_headers" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 1.2.3.4" -H "CF-Connecting-IP: 5.6.7.8" -H "X-Real-IP: 9.9.9.9" \
  -d '{}' | python3 -m json.tool | grep -iE "forwarded|connecting|real-ip"
curl -s https://api.ipify.org; echo   # your real public IP, for comparison
```

- [ ] **Step 3: Decide**

- If `cf-connecting-ip` shows your **real** IP (not `5.6.7.8`) → `IP_SOURCE = cf-connecting-ip`.
- Else if `x-forwarded-for` is `1.2.3.4, <real ip>, …` → the forged value is first; the real IP is the entry appended by Supabase's proxy. Use `x-forwarded-for:last` only if the **last** entry equals your real IP; otherwise pick the position that equals your real IP counting from the end, and note it.
- If no header reliably carries your real IP → `IP_SOURCE = none` (the per-IP limit becomes a no-op; the `client_ip` column stays but is always null).

- [ ] **Step 4: Ask the user to drop the debug function**

```sql
drop function public.debug_headers();
```

- [ ] **Step 5: Record the decision in the spec and commit**

Under "Testing → Spike", append: `**Result (YYYY-MM-DD):** IP_SOURCE = <value> — <one-line evidence>.` If `none`, also change the Business rules row "Per-IP limit" to `disabled (no trustworthy header, see Spike)`.

```bash
git add docs/superpowers/specs/2026-09-30-sp2-bookings-and-staff-admin-design.md
git commit -m "docs(sp2): record client-IP header spike result"
```

---

### Task 2: Schema — stylist_services, private bookings/staff, idempotent seed, sign-ups off

**Files:**
- Create: `supabase/migrations/<timestamp>_create_bookings.sql` (via CLI)
- Modify: `supabase/seed.sql`
- Modify: `supabase/config.toml:138` (`[auth] enable_signup`)
- Test: `supabase/tests/database/01_schema.test.sql`

**Interfaces:**
- Produces: tables `public.stylist_services(stylist_id, service_id)`, `private.bookings(id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang, status, created_at)` with constraint `bookings_no_overlap`, `private.staff(user_id)`.

- [ ] **Step 1: Start the local stack**

Run: `supabase start` (first run pulls images; takes a few minutes). Expected: prints local API URL and keys. Then `supabase db reset` → applies SP1 migration + seed cleanly.

- [ ] **Step 2: Write the failing pgTAP test**

Create `supabase/tests/database/01_schema.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('public', 'stylist_services', 'stylist_services exists');
select has_table('private', 'bookings', 'private.bookings exists');
select has_table('private', 'staff', 'private.staff exists');
select is((select count(*)::int from public.stylist_services), 6, 'seed has 6 stylist/service pairs');

-- exclusion constraint: same stylist, overlapping time
insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('coupe-femme', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Test A', '0555000001', 'fr');
select throws_ok(
  $$ insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
     values ('coupe-femme', 'amina', '2030-01-08 09:30+01', '2030-01-08 10:30+01', 2500, 'Test B', '0555000002', 'fr') $$,
  '23P01', null, 'overlapping booking for same stylist is rejected');
select lives_ok(
  $$ insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
     values ('coupe-femme', 'amina', '2030-01-08 09:30+01', '2030-01-08 10:30+01', 2500, 'Test C', '0555000003', 'fr', 'cancelled') $$,
  'cancelled bookings do not block');
select throws_ok(
  $$ insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
     values ('coupe-femme', 'leila', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Test D', '12345', 'fr') $$,
  '23514', null, 'phone check constraint');

-- anon cannot touch private, can read stylist_services
set local role anon;
select throws_ok($$ select * from private.bookings $$, '42501', null, 'anon cannot read private.bookings');
select is((select count(*)::int from public.stylist_services), 6, 'anon can read stylist_services');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 3: Run it to verify it fails**

Run: `supabase test db`
Expected: FAIL (`stylist_services` / `private.bookings` do not exist).

- [ ] **Step 4: Create the migration**

Run: `supabase migration new create_bookings` → creates `supabase/migrations/<timestamp>_create_bookings.sql`. Write into it:

```sql
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
```

- [ ] **Step 5: Make the seed idempotent and add the pairs**

`supabase db push --include-seed` re-runs a changed `seed.sql` in full, so every insert must tolerate existing rows. In `supabase/seed.sql`, append `on conflict (id) do nothing` to the end of the `insert into services …` statement and of the `insert into stylists …` statement (replace each final `;` with `\non conflict (id) do nothing;`). Then append:

```sql
insert into stylist_services (stylist_id, service_id) values
  ('amina', 'coupe-femme'),
  ('amina', 'coloration'),
  ('amina', 'soin-keratine'),
  ('leila', 'maquillage'),
  ('leila', 'soin-visage'),
  ('sara',  'manucure')
on conflict do nothing;
```

- [ ] **Step 6: Disable public sign-ups locally**

In `supabase/config.toml`, under `[auth]` (line 138), change `enable_signup = true` to `enable_signup = false`. Leave the `[auth.email]` and `[auth.sms]` entries as they are.

- [ ] **Step 7: Reset and run tests**

Run: `supabase stop && supabase start` (picks up config) then `supabase db reset` and `supabase test db`.
Expected: `01_schema.test.sql .. ok`, all 9 pass.

- [ ] **Step 8: Build + unit tests, then commit**

Run: `pnpm build && pnpm test` → green (no frontend change yet).

```bash
git add supabase/migrations/*_create_bookings.sql supabase/seed.sql supabase/config.toml supabase/tests/database/01_schema.test.sql
git commit -m "feat(sp2): bookings schema, stylist_services, staff table; sign-ups off"
```

---

### Task 3: Helpers + `get_slots`

**Files:**
- Create: `supabase/migrations/<timestamp>_booking_functions.sql` (via CLI)
- Test: `supabase/tests/database/02_get_slots.test.sql`

**Interfaces:**
- Consumes: tables from Task 2.
- Produces: `private.slot_start(p_date date, p_time time) returns timestamptz`, `private.is_open_day(p_date date) returns boolean`, `private.stylist_free(p_stylist_id text, p_start timestamptz, p_end timestamptz) returns boolean`, and `public.get_slots(p_date date, p_service_id text, p_stylist_id text default null) returns table(slot text, available boolean)`, executable by `anon`, `authenticated`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/02_get_slots.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- nth open day (Tue–Sat) strictly after today, Algiers time
create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
create function pg_temp.next_sunday() returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 7, interval '1 day') d
  where extract(isodow from d) = 7 limit 1 $$;
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_minutes int, p_status text default 'pending')
returns void language sql as $$
  insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang, status)
  values ('coupe-femme', p_stylist,
          (p_day + p_time) at time zone 'Africa/Algiers',
          ((p_day + p_time) at time zone 'Africa/Algiers') + make_interval(mins => p_minutes),
          2500, 'Seed Client', '0555999999', 'fr', p_status) $$;

-- grid depends on duration (coupe-femme 60 min, soin-keratine 150 min)
select is((select count(*)::int from public.get_slots(pg_temp.open_day(), 'coupe-femme')), 17, '60-min service: 09:00..17:00');
select is((select max(slot) from public.get_slots(pg_temp.open_day(), 'coupe-femme')), '17:00', '60-min last slot 17:00');
select is((select max(slot) from public.get_slots(pg_temp.open_day(), 'soin-keratine')), '15:30', '150-min last slot 15:30');
select is((select min(slot) from public.get_slots(pg_temp.open_day(), 'coupe-femme')), '09:00', 'first slot 09:00');

-- closed / out of window
select is((select count(*)::int from public.get_slots(pg_temp.next_sunday(), 'coupe-femme')), 0, 'Sunday is closed');
select is((select count(*)::int from public.get_slots((now() at time zone 'Africa/Algiers')::date - 1, 'coupe-femme')), 0, 'yesterday is out of window');
select is((select count(*)::int from public.get_slots((now() at time zone 'Africa/Algiers')::date + 14, 'coupe-femme')), 0, 'today+14 is out of window');

-- a booking blocks overlapping slots; cancellation frees them
select pg_temp.book('amina', pg_temp.open_day(), '10:00', 60);
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '10:00'), false, 'booked slot unavailable');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '09:30'), false, 'overlapping slot unavailable');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme', 'amina') where slot = '11:00'), true, 'adjacent slot available');

-- "no preference": free while any offering stylist is free
insert into public.stylist_services values ('leila', 'coupe-femme');
select is((select available from public.get_slots(pg_temp.open_day(), 'coupe-femme') where slot = '10:00'), true, 'no preference: another offering stylist is free');

-- validation
select throws_ok($$ select * from public.get_slots(current_date + 1, 'coupe-femme', 'sara') $$, 'P0001', 'unknown_service', 'stylist not offering service');

-- anon may call it
set local role anon;
select lives_ok($$ select * from public.get_slots(current_date + 1, 'coupe-femme') $$, 'anon can execute get_slots');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db`
Expected: FAIL — `function public.get_slots(...) does not exist`.

- [ ] **Step 3: Create the migration with helpers and `get_slots`**

Run: `supabase migration new booking_functions`. Write:

```sql
-- Local wall-clock (Algiers) date + time → absolute timestamp
create or replace function private.slot_start(p_date date, p_time time)
returns timestamptz language sql immutable set search_path = ''
as $$ select (p_date + p_time) at time zone 'Africa/Algiers' $$;

-- Open day inside the booking window (today .. today+13, closed Sun/Mon)
create or replace function private.is_open_day(p_date date)
returns boolean language sql stable set search_path = ''
as $$
  select p_date between (now() at time zone 'Africa/Algiers')::date
                    and (now() at time zone 'Africa/Algiers')::date + 13
     and extract(isodow from p_date) not in (1, 7)
$$;

create or replace function private.stylist_free(p_stylist_id text, p_start timestamptz, p_end timestamptz)
returns boolean language sql stable set search_path = ''
as $$
  select not exists (
    select 1 from private.bookings b
    where b.stylist_id = p_stylist_id
      and b.status <> 'cancelled'
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)
  )
$$;

create or replace function public.get_slots(p_date date, p_service_id text, p_stylist_id text default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_duration integer;
  v_min integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  select s.duration into v_duration from public.services s where s.id = p_service_id;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    where ss.stylist_id = p_stylist_id and ss.service_id = p_service_id
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if not private.is_open_day(p_date) then
    return;
  end if;

  -- minutes since midnight: 540 = 09:00, 1080 = 18:00
  for v_min in 540 .. 1080 - v_duration by 30 loop
    v_start := private.slot_start(p_date, make_time(v_min / 60, v_min % 60, 0));
    v_end := v_start + make_interval(mins => v_duration);
    slot := to_char(make_time(v_min / 60, v_min % 60, 0), 'HH24:MI');
    available := v_start > now() and exists (
      select 1 from public.stylist_services ss
      where ss.service_id = p_service_id
        and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
        and private.stylist_free(ss.stylist_id, v_start, v_end)
    );
    return next;
  end loop;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_slots(date, text, text) from public, anon, authenticated;
grant execute on function public.get_slots(date, text, text) to anon, authenticated;
```

- [ ] **Step 4: Reset and run tests**

Run: `supabase db reset && supabase test db`
Expected: `01_schema` and `02_get_slots` ok (13 new passing).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_booking_functions.sql supabase/tests/database/02_get_slots.test.sql
git commit -m "feat(sp2): get_slots RPC with DB-computed availability"
```

---

### Task 4: `create_booking` with auto-assign and abuse limits

**Files:**
- Modify: `supabase/migrations/<timestamp>_booking_functions.sql` (append; not yet pushed anywhere, so editing is fine)
- Test: `supabase/tests/database/03_create_booking.test.sql`

**Interfaces:**
- Consumes: helpers from Task 3; `IP_SOURCE` from Task 1.
- Produces: `private.normalize_phone(p text) returns text`, `private.client_ip() returns inet`, `public.create_booking(p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns table(booking_id uuid, stylist_id text)`, executable by `anon`, `authenticated`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/03_create_booking.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.open_day(n int default 1) returns date language sql as $$
  select d::date
  from generate_series((now() at time zone 'Africa/Algiers')::date + 1,
                       (now() at time zone 'Africa/Algiers')::date + 13, interval '1 day') d
  where extract(isodow from d) not in (1, 7)
  order by d offset n - 1 limit 1 $$;
create function pg_temp.book(p_stylist text, p_day date, p_time time, p_phone text,
                             p_status text default 'pending', p_ip inet default null)
returns void language sql as $$
  insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang, status)
  values ('coupe-femme', p_stylist,
          (p_day + p_time) at time zone 'Africa/Algiers',
          ((p_day + p_time) at time zone 'Africa/Algiers') + interval '60 minutes',
          2500, 'Seed Client', p_phone, p_ip, 'fr', p_status) $$;

-- happy path + DB-sourced price/duration + normalised phone
select is((select stylist_id from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '09:00', '  Yasmine  ', '0555 12 34 56', 'fr')),
          'amina', 'books the chosen stylist');
select is((select client_phone from private.bookings where client_name = 'Yasmine'), '0555123456', 'phone normalised, name trimmed');
select is((select price from private.bookings where client_name = 'Yasmine'), 2500, 'price from services');
select is((select extract(epoch from ends_at - starts_at)::int / 60 from private.bookings where client_name = 'Yasmine'), 60, 'duration from services');
select lives_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '10:00', 'Nadia', '+213 661 22 33 44', 'ar') $$, '+213 prefix accepted');
select lives_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '11:00', 'Salma', '00213 771-22-33-44', 'fr') $$, '00213 prefix accepted');

-- validation
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '12:00', 'A', '0555123456', 'fr') $$, 'P0001', 'invalid_name', 'name too short');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '12:00', 'Amel', '021 12 34 56', 'fr') $$, 'P0001', 'invalid_phone', 'landline rejected');
select throws_ok($$ select * from public.create_booking('nope', null, pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'unknown service');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'sara', pg_temp.open_day(), '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'stylist not offering service');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '17:30', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'would end after 18:00');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '12:15', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'off the 30-min grid');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', (now() at time zone 'Africa/Algiers')::date - 1, '12:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'outside_hours', 'past date');

-- conflicts and auto-assign
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(), '09:30', 'Amel', '0555123456', 'fr') $$, 'P0001', 'slot_taken', 'overlap with existing booking');
insert into public.stylist_services values ('leila', 'coupe-femme');
select is((select stylist_id from public.create_booking('coupe-femme', null, pg_temp.open_day(), '09:00', 'Rym', '0666123456', 'fr')),
          'leila', 'no preference skips busy stylist');
select throws_ok($$ select * from public.create_booking('coupe-femme', null, pg_temp.open_day(), '09:00', 'Lina', '0666999999', 'fr') $$, 'P0001', 'slot_taken', 'no offering stylist free (sara never considered)');

-- per-phone limit: 3 upcoming non-cancelled
select pg_temp.book('amina', pg_temp.open_day(2), '09:00', '0770000001');
select pg_temp.book('amina', pg_temp.open_day(2), '10:00', '0770000001');
select pg_temp.book('amina', pg_temp.open_day(2), '11:00', '0770000001');
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(2), '14:00', 'Hana', '0770000001', 'fr') $$, 'P0001', 'too_many_bookings', 'fourth upcoming booking for a phone');

-- per-IP limit (only meaningful when IP_SOURCE <> none; see Task 1)
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "203.0.113.9"}', true);
select pg_temp.book('amina', pg_temp.open_day(3), (t || ':00')::time, '05500000' || lpad(t::text, 2, '0'), 'cancelled', '203.0.113.9')
from generate_series(10, 14) t;
select throws_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(3), '09:00', 'Ines', '0551234567', 'fr') $$, 'P0001', 'rate_limited', 'sixth booking from one IP within an hour');
select set_config('request.headers', '{}', true);

-- circuit breaker: >= 20 created in the last 10 minutes (existing rows above count too)
select pg_temp.book('sara', pg_temp.open_day(4), '09:00', '0552000000', 'cancelled') from generate_series(1, 20);
select throws_ok($$ select * from public.create_booking('manucure', 'sara', pg_temp.open_day(4), '10:00', 'Dounia', '0553123456', 'fr') $$, 'P0001', 'rate_limited', 'circuit breaker');

select * from finish();
rollback;
```

> If Task 1 decided `IP_SOURCE = none`, replace the per-IP `throws_ok` with `select lives_ok($$ select * from public.create_booking('coupe-femme', 'amina', pg_temp.open_day(3), '09:00', 'Ines', '0551234567', 'fr') $$, 'per-IP limit disabled');`.

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db`
Expected: FAIL — `function public.create_booking(...) does not exist`.

- [ ] **Step 3: Append phone/IP helpers and `create_booking` to the booking_functions migration**

Append to `supabase/migrations/<timestamp>_booking_functions.sql` **above** the final `revoke execute on all functions in schema private …` line:

```sql
create or replace function private.normalize_phone(p text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when v like '+213%'  then '0' || substr(v, 5)
    when v like '00213%' then '0' || substr(v, 6)
    else v
  end
  from (select regexp_replace(coalesce(p, ''), '[[:space:].()-]', '', 'g') as v) x
$$;

-- Client IP from the header chosen in Task 1 (IP_SOURCE). Null when unavailable.
create or replace function private.client_ip()
returns inet language plpgsql stable set search_path = ''
as $$
declare
  v_headers json := current_setting('request.headers', true)::json;
  v text;
begin
  -- IP_SOURCE = cf-connecting-ip:
  v := v_headers ->> 'cf-connecting-ip';
  -- IP_SOURCE = x-forwarded-for:last → instead use:
  --   v := btrim(reverse(split_part(reverse(v_headers ->> 'x-forwarded-for'), ',', 1)));
  -- IP_SOURCE = none → instead use:
  --   return null;
  return nullif(btrim(v), '')::inet;
exception when others then
  return null;
end;
$$;
```

Keep exactly one of the three variants active, matching Task 1's decision, and delete the other commented lines.

Then append (still above the final revoke line):

```sql
create or replace function public.create_booking(
  p_service_id text, p_stylist_id text, p_date date, p_time text,
  p_client_name text, p_client_phone text, p_lang text)
returns table (booking_id uuid, stylist_id text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_name     text := btrim(coalesce(p_client_name, ''));
  v_phone    text := private.normalize_phone(p_client_phone);
  v_lang     text := case when p_lang in ('fr', 'ar') then p_lang else 'fr' end;
  v_ip       inet := private.client_ip();
  v_price    integer;
  v_duration integer;
  v_min      integer;
  v_start    timestamptz;
  v_end      timestamptz;
  v_candidate text;
  v_id       uuid;
begin
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  select s.price, s.duration into v_price, v_duration from public.services s where s.id = p_service_id;
  if v_duration is null then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylist_services ss
    where ss.stylist_id = p_stylist_id and ss.service_id = p_service_id
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):(00|30)$' then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;
  v_min := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  v_start := private.slot_start(p_date, p_time::time);
  v_end := v_start + make_interval(mins => v_duration);
  if not private.is_open_day(p_date) or v_min < 540 or v_min + v_duration > 1080 or v_start <= now() then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  -- abuse limits
  if (select count(*) from private.bookings b where b.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if v_ip is not null and (
    select count(*) from private.bookings b
    where b.client_ip = v_ip and b.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from private.bookings b
    where b.client_phone = v_phone and b.status <> 'cancelled' and b.starts_at > now()
  ) >= 3 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;

  -- chosen stylist, or offering stylists in sort order ("no preference")
  for v_candidate in
    select ss.stylist_id
    from public.stylist_services ss
    join public.stylists st on st.id = ss.stylist_id
    where ss.service_id = p_service_id
      and (p_stylist_id is null or ss.stylist_id = p_stylist_id)
    order by st.sort_order, st.id
  loop
    begin
      insert into private.bookings
        (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, client_ip, lang)
      values
        (p_service_id, v_candidate, v_start, v_end, v_price, v_name, v_phone, v_ip, v_lang)
      returning id into v_id;
      booking_id := v_id;
      stylist_id := v_candidate;
      return next;
      return;
    exception when exclusion_violation then
      -- this stylist is busy (or lost a race): try the next one
    end;
  end loop;

  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;
```

Finally, append at the very end of the file (after the existing revoke/grant lines):

```sql
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_booking(text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, text, date, text, text, text, text) to anon, authenticated;
```

- [ ] **Step 4: Reset and run tests**

Run: `supabase db reset && supabase test db`
Expected: all three test files ok (19 new passing).

- [ ] **Step 5: Security lint**

Run: `supabase db lint --level warning`
Expected: no errors/warnings for the new objects. Fix any reported issue before committing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_booking_functions.sql supabase/tests/database/03_create_booking.test.sql
git commit -m "feat(sp2): create_booking RPC with auto-assign and abuse limits"
```

---

### Task 5: Stylists carry the services they offer

**Files:**
- Modify: `src/data/types.ts` (`Stylist`)
- Modify: `src/data/queries.ts` (`StylistRow`, `fetchStylists`)
- Test: `src/data/queries.test.tsx`

**Interfaces:**
- Produces: `Stylist.serviceIds: string[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/data/queries.test.tsx` (and add `useStylists` to the existing `import { useServices } from './queries';` line):

```tsx
describe('useStylists', () => {
  it('maps offered services to serviceIds', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              {
                id: 'amina',
                name: 'Amina',
                role: { fr: 'Coiffeuse', ar: 'خبيرة' },
                specialties: [],
                image: 'img',
                sort_order: 0,
                stylist_services: [{ service_id: 'coupe-femme' }, { service_id: 'coloration' }],
              },
            ],
            error: null,
          }),
      }),
    });

    const { result } = renderHook(() => useStylists(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].serviceIds).toEqual(['coupe-femme', 'coloration']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — `serviceIds` is `undefined`.

- [ ] **Step 3: Implement**

In `src/data/types.ts`, add to `Stylist`:

```ts
  serviceIds: string[];
```

In `src/data/queries.ts`, add to `StylistRow`:

```ts
  stylist_services: { service_id: string }[] | null;
```

and change `fetchStylists` to:

```ts
export async function fetchStylists(): Promise<Stylist[]> {
  const { data, error } = await supabase
    .from('stylists')
    .select('id, name, role, specialties, image, sort_order, stylist_services(service_id)')
    .order('sort_order');
  if (error) throw error;
  return (data as StylistRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    specialties: r.specialties,
    image: r.image,
    serviceIds: (r.stylist_services ?? []).map((s) => s.service_id),
  }));
}
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/queries.ts src/data/queries.test.tsx
git commit -m "feat(sp2): stylists expose the services they offer"
```

---

### Task 6: Booking data module (`src/data/bookings.ts`)

**Files:**
- Create: `src/data/bookings.ts`
- Test: `src/data/bookings.test.tsx`

**Interfaces:**
- Produces:
  - `interface Slot { slot: string; available: boolean }`
  - `type BookingErrorCode = 'slot_taken' | 'rate_limited' | 'too_many_bookings' | 'invalid_phone' | 'invalid_name' | 'outside_hours' | 'unknown_service' | 'unknown'`
  - `toBookingError(err: unknown): BookingErrorCode`
  - `toYmd(date: Date): string` — local calendar day `YYYY-MM-DD`
  - `normalizePhone(input: string): string`, `isValidPhone(input: string): boolean`
  - `useSlots(date: Date | null, serviceId: string | null, stylistId: string | null)` — `UseQueryResult<Slot[]>`
  - `interface CreateBookingInput { serviceId: string; stylistId: string | null; date: Date; time: string; clientName: string; clientPhone: string; lang: Lang }`
  - `interface CreatedBooking { bookingId: string; stylistId: string }`
  - `useCreateBooking()` — `UseMutationResult<CreatedBooking, unknown, CreateBookingInput>`; invalidates `['slots']` on settle.

- [ ] **Step 1: Write the failing tests**

Create `src/data/bookings.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import {
  isValidPhone,
  normalizePhone,
  toBookingError,
  toYmd,
  useCreateBooking,
  useSlots,
} from './bookings';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phone rules (mirror of the DB)', () => {
  it.each([
    ['0555 12 34 56', '0555123456', true],
    ['+213 661 22 33 44', '0661223344', true],
    ['00213 771-22-33-44', '0771223344', true],
    ['(0555).12.34.56', '0555123456', true],
    ['021 12 34 56', '021123456', false],
    ['0855123456', '0855123456', false],
    ['', '', false],
  ])('%s → %s (valid: %s)', (input, normalized, valid) => {
    expect(normalizePhone(input)).toBe(normalized);
    expect(isValidPhone(input)).toBe(valid);
  });
});

describe('toBookingError', () => {
  it('maps known RPC error messages', () => {
    expect(toBookingError({ message: 'slot_taken', code: 'P0001' })).toBe('slot_taken');
    expect(toBookingError({ message: 'too_many_bookings' })).toBe('too_many_bookings');
    expect(toBookingError({ message: 'rate_limited' })).toBe('rate_limited');
  });
  it('falls back to unknown', () => {
    expect(toBookingError(new Error('Failed to fetch'))).toBe('unknown');
    expect(toBookingError(null)).toBe('unknown');
  });
});

describe('toYmd', () => {
  it('formats the local calendar day', () => {
    expect(toYmd(new Date(2030, 0, 8, 23, 30))).toBe('2030-01-08');
  });
});

describe('useSlots', () => {
  it('calls get_slots with the picked day, service and stylist', async () => {
    rpc.mockResolvedValue({ data: [{ slot: '09:00', available: true }], error: null });

    const { result } = renderHook(() => useSlots(new Date(2030, 0, 8), 'coupe-femme', null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('get_slots', {
      p_date: '2030-01-08',
      p_service_id: 'coupe-femme',
      p_stylist_id: null,
    });
    expect(result.current.data).toEqual([{ slot: '09:00', available: true }]);
  });

  it('does not fetch until a date is picked', () => {
    renderHook(() => useSlots(null, 'coupe-femme', null), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useCreateBooking', () => {
  it('calls create_booking and returns the assigned stylist', async () => {
    rpc.mockResolvedValue({ data: [{ booking_id: 'b1', stylist_id: 'amina' }], error: null });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        serviceId: 'coupe-femme',
        stylistId: null,
        date: new Date(2030, 0, 8),
        time: '09:00',
        clientName: 'Yasmine',
        clientPhone: '0555 12 34 56',
        lang: 'fr',
      });
    });

    expect(rpc).toHaveBeenCalledWith('create_booking', {
      p_service_id: 'coupe-femme',
      p_stylist_id: null,
      p_date: '2030-01-08',
      p_time: '09:00',
      p_client_name: 'Yasmine',
      p_client_phone: '0555 12 34 56',
      p_lang: 'fr',
    });
    expect(created).toEqual({ bookingId: 'b1', stylistId: 'amina' });
  });

  it('rejects with the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'slot_taken', code: 'P0001' } });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          serviceId: 'coupe-femme', stylistId: 'amina', date: new Date(2030, 0, 8),
          time: '09:00', clientName: 'Yasmine', clientPhone: '0555123456', lang: 'fr',
        })
      ).rejects.toMatchObject({ message: 'slot_taken' });
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./bookings`.

- [ ] **Step 3: Implement `src/data/bookings.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';

export interface Slot {
  slot: string;
  available: boolean;
}

export type BookingErrorCode =
  | 'slot_taken'
  | 'rate_limited'
  | 'too_many_bookings'
  | 'invalid_phone'
  | 'invalid_name'
  | 'outside_hours'
  | 'unknown_service'
  | 'unknown';

const KNOWN_ERRORS: BookingErrorCode[] = [
  'slot_taken',
  'rate_limited',
  'too_many_bookings',
  'invalid_phone',
  'invalid_name',
  'outside_hours',
  'unknown_service',
];

export function toBookingError(err: unknown): BookingErrorCode {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  return (KNOWN_ERRORS as string[]).includes(message) ? (message as BookingErrorCode) : 'unknown';
}

/** Local calendar day as YYYY-MM-DD (the day the customer picked). */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Client mirror of private.normalize_phone — for instant feedback only; the DB is authoritative. */
export function normalizePhone(input: string): string {
  const v = input.replace(/[\s.()-]/g, '');
  if (v.startsWith('+213')) return '0' + v.slice(4);
  if (v.startsWith('00213')) return '0' + v.slice(5);
  return v;
}

export function isValidPhone(input: string): boolean {
  return /^0[5-7][0-9]{8}$/.test(normalizePhone(input));
}

export async function fetchSlots(date: Date, serviceId: string, stylistId: string | null): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('get_slots', {
    p_date: toYmd(date),
    p_service_id: serviceId,
    p_stylist_id: stylistId,
  });
  if (error) throw error;
  return (data ?? []) as Slot[];
}

export function useSlots(date: Date | null, serviceId: string | null, stylistId: string | null) {
  return useQuery({
    queryKey: ['slots', date ? toYmd(date) : null, serviceId, stylistId],
    queryFn: () => fetchSlots(date as Date, serviceId as string, stylistId),
    enabled: date !== null && serviceId !== null,
    staleTime: 0,
  });
}

export interface CreateBookingInput {
  serviceId: string;
  stylistId: string | null;
  date: Date;
  time: string;
  clientName: string;
  clientPhone: string;
  lang: Lang;
}

export interface CreatedBooking {
  bookingId: string;
  stylistId: string;
}

export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_service_id: input.serviceId,
    p_stylist_id: input.stylistId,
    p_date: toYmd(input.date),
    p_time: input.time,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_lang: input.lang,
  });
  if (error) throw error;
  const row = (data as { booking_id: string; stylist_id: string }[])[0];
  return { bookingId: row.booking_id, stylistId: row.stylist_id };
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots'] }),
  });
}
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/data/bookings.ts src/data/bookings.test.tsx
git commit -m "feat(sp2): booking data module (slots, create, phone rules, errors)"
```

---

### Task 7: Wizard — stylists filtered by service, real slots

**Files:**
- Modify: `src/components/Booking.tsx`
- Delete: `src/data/services.ts`

**Interfaces:**
- Consumes: `Stylist.serviceIds` (Task 5); `useSlots`, `Slot` (Task 6); `DataError`.

- [ ] **Step 1: Swap imports**

In `src/components/Booking.tsx`, delete the line `import { generateTimeSlots, getBookedSlots } from '../data/services';` and add:

```tsx
import { useSlots } from '../data/bookings';
```

Delete the file `src/data/services.ts` (only the stubs and a type re-export remain; nothing else imports it — verify with `grep -rn "data/services'" src`, expected no output).

- [ ] **Step 2: Replace the stub availability with `useSlots`**

Remove the `allSlots`, `bookedSlots` and `isAvailable` declarations. In their place add:

```tsx
  const slotsQuery = useSlots(selectedDate, selectedService?.id ?? null, selectedStylist);
  const slots = slotsQuery.data ?? [];

  const offeringStylists = useMemo(
    () => (selectedService ? stylists.filter((s) => s.serviceIds.includes(selectedService.id)) : stylists),
    [stylists, selectedService]
  );

  const selectService = (service: Service) => {
    setSelectedService(service);
    setSelectedTime(null);
    const current = stylists.find((s) => s.id === selectedStylist);
    if (current && !current.serviceIds.includes(service.id)) setSelectedStylist(null);
  };

  const selectStylist = (id: string | null) => {
    setSelectedStylist(id);
    setSelectedTime(null);
  };
```

These use `stylists` and `selectedStylist`, so place them after the `servicesQuery`/`stylistsQuery` block and the `useState` declarations.

- [ ] **Step 3: Use the new handlers**

- Step 0 service button: `onClick={() => setSelectedService(service)}` → `onClick={() => selectService(service)}`.
- Step 1 "no preference" button: `onClick={() => setSelectedStylist(null)}` → `onClick={() => selectStylist(null)}`.
- Step 1 stylist list: `{stylists.map((stylist) => {` → `{offeringStylists.map((stylist) => {`, and its `onClick={() => setSelectedStylist(stylist.id)}` → `onClick={() => selectStylist(stylist.id)}`.

- [ ] **Step 4: Render slots from the query**

Replace the whole `{selectedDate && ( … )}` block inside Step 2 with:

```tsx
              {selectedDate && (
                <div>
                  <h3 className="font-display text-xl font-semibold text-rose-800 mb-4">{t('booking.selectTime')}</h3>
                  {slotsQuery.isLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="img-placeholder h-11 rounded-xl" />
                      ))}
                    </div>
                  ) : slotsQuery.isError ? (
                    <DataError onRetry={() => slotsQuery.refetch()} />
                  ) : slots.some((s) => s.available) ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {slots.map(({ slot, available }) => (
                        <TimeSlotChip
                          key={slot}
                          state={selectedTime === slot ? 'selected' : available ? 'available' : 'disabled'}
                          disabled={!available}
                          onClick={() => available && setSelectedTime(slot)}
                        >
                          {slot}
                        </TimeSlotChip>
                      ))}
                    </div>
                  ) : (
                    <p className="text-rose-600 text-sm py-8 text-center">{t('booking.noSlots')}</p>
                  )}
                </div>
              )}
```

- [ ] **Step 5: Build and test**

Run: `pnpm build && pnpm test`
Expected: green; no references to `generateTimeSlots`/`getBookedSlots` remain.

- [ ] **Step 6: Run against the local stack**

Point the dev server at local Supabase for this check only (do not edit `.env`):

```bash
supabase status -o env | grep -E "^(API_URL|ANON_KEY)="   # note the values
VITE_SUPABASE_URL=<API_URL> VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> pnpm dev
```

Check: picking "Soin Kératine" shows only Amina (+ no preference); a date shows slots ending at 15:30; Sunday/Monday are not in the date strip. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/Booking.tsx src/data/services.ts
git commit -m "feat(sp2): wizard uses real slots; stylists filtered by service"
```

---

### Task 8: Wizard — save the booking, errors, new success screen

**Files:**
- Modify: `src/components/Booking.tsx`
- Modify: `src/context/LanguageContext.tsx` (fr + ar)

**Interfaces:**
- Consumes: `useCreateBooking`, `toBookingError`, `isValidPhone`, `BookingErrorCode` (Task 6).

- [ ] **Step 1: Add i18n keys**

In `src/context/LanguageContext.tsx`, **replace** the existing `booking.successTitle`, `booking.successText` and `booking.whatsappHint` values and **add** the new keys, in both maps.

`fr`:

```ts
    'booking.successTitle': 'Créneau réservé !',
    'booking.successText': 'Votre rendez-vous est enregistré. Envoyez la confirmation au salon sur WhatsApp.',
    'booking.whatsappHint': 'Votre réservation n’est finalisée qu’une fois le message envoyé au salon.',
    'booking.submitting': 'Enregistrement…',
    'booking.slotTaken': 'Ce créneau vient d’être pris. Merci d’en choisir un autre.',
    'booking.error.invalidPhone': 'Numéro invalide. Exemple : 0555 12 34 56',
    'booking.error.invalidName': 'Merci d’indiquer votre nom (2 à 80 caractères).',
    'booking.error.tooMany': 'Vous avez déjà 3 rendez-vous à venir. Contactez le salon pour en ajouter.',
    'booking.error.rateLimited': 'Trop de réservations en ce moment. Contactez-nous directement sur WhatsApp.',
    'booking.error.generic': 'La réservation n’a pas pu être enregistrée. Veuillez réessayer.',
    'booking.contactWhatsapp': 'Nous contacter sur WhatsApp',
```

`ar`:

```ts
    'booking.successTitle': 'تم حجز الموعد!',
    'booking.successText': 'تم تسجيل موعدكِ. أرسلي التأكيد إلى الصالون عبر واتساب.',
    'booking.whatsappHint': 'لا يكتمل حجزكِ إلا بعد إرسال الرسالة إلى الصالون.',
    'booking.submitting': 'جارٍ التسجيل…',
    'booking.slotTaken': 'تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.',
    'booking.error.invalidPhone': 'رقم غير صالح. مثال: 0555 12 34 56',
    'booking.error.invalidName': 'يرجى إدخال اسمكِ (من 2 إلى 80 حرفًا).',
    'booking.error.tooMany': 'لديكِ بالفعل 3 مواعيد قادمة. تواصلي مع الصالون لإضافة المزيد.',
    'booking.error.rateLimited': 'عدد كبير من الحجوزات حاليًا. تواصلي معنا مباشرة عبر واتساب.',
    'booking.error.generic': 'تعذّر تسجيل الحجز. يرجى المحاولة مرة أخرى.',
    'booking.contactWhatsapp': 'تواصلي معنا عبر واتساب',
```

- [ ] **Step 2: Imports and state**

Change the bookings import to:

```tsx
import { useSlots, useCreateBooking, toBookingError, isValidPhone, type BookingErrorCode } from '../data/bookings';
```

Add `AlertCircle` to the lucide import list. After the existing `useState` declarations add:

```tsx
  const createBookingMutation = useCreateBooking();
  const [assignedStylistId, setAssignedStylistId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<Exclude<BookingErrorCode, 'slot_taken'> | null>(null);
  const [slotNotice, setSlotNotice] = useState(false);

  const trimmedName = clientName.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 80;
  const phoneValid = isValidPhone(clientPhone);
```

- [ ] **Step 3: Validation, stylist name, submit handler**

Change the step-3 line of `canProceed` to:

```tsx
    if (step === 3) return nameValid && phoneValid;
```

Replace the `stylistName` declaration with:

```tsx
  const effectiveStylistId = assignedStylistId ?? selectedStylist;
  const stylistName = effectiveStylistId
    ? stylists.find((s) => s.id === effectiveStylistId)?.name ?? ''
    : t('booking.noPreference');
```

Replace `handleWhatsAppSend` with:

```tsx
  const handleWhatsAppSend = () => {
    const msg = encodeURIComponent(buildWhatsAppMessage());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  };

  const handleConfirm = () => {
    if (!selectedService || !selectedDate || !selectedTime) return;
    setSubmitError(null);
    createBookingMutation.mutate(
      {
        serviceId: selectedService.id,
        stylistId: selectedStylist,
        date: selectedDate,
        time: selectedTime,
        clientName: trimmedName,
        clientPhone,
        lang,
      },
      {
        onSuccess: (created) => {
          setAssignedStylistId(created.stylistId);
          setSubmitted(true);
        },
        onError: (err) => {
          const code = toBookingError(err);
          if (code === 'slot_taken') {
            setSelectedTime(null);
            setSlotNotice(true);
            setStep(2);
            return;
          }
          setSubmitError(code);
        },
      }
    );
  };

  const errorMessages: Record<Exclude<BookingErrorCode, 'slot_taken'>, string> = {
    invalid_phone: t('booking.error.invalidPhone'),
    invalid_name: t('booking.error.invalidName'),
    too_many_bookings: t('booking.error.tooMany'),
    rate_limited: t('booking.error.rateLimited'),
    outside_hours: t('booking.error.generic'),
    unknown_service: t('booking.error.generic'),
    unknown: t('booking.error.generic'),
  };
```

In `resetBooking`, add before `setSubmitted(false);`:

```tsx
    setAssignedStylistId(null);
    setSubmitError(null);
    setSlotNotice(false);
    createBookingMutation.reset();
```

- [ ] **Step 4: Slot-taken notice on Step 2**

Directly under the Step 2 time heading `<h3 …>{t('booking.selectTime')}</h3>`, add:

```tsx
                  {slotNotice && (
                    <p role="alert" className="flex items-center gap-2 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                      {t('booking.slotTaken')}
                    </p>
                  )}
```

and change the chip `onClick` to clear the notice:

```tsx
                          onClick={() => {
                            if (!available) return;
                            setSelectedTime(slot);
                            setSlotNotice(false);
                          }}
```

- [ ] **Step 5: Step 3 — field errors, drop the preview, error banner**

- Under the name `<input id="booking-name" …/>`, add:

```tsx
                  {clientName !== '' && !nameValid && (
                    <p className="text-xs text-rust-700 mt-1">{t('booking.error.invalidName')}</p>
                  )}
```

- Under the phone `<input id="booking-phone" …/>`, add:

```tsx
                  {clientPhone !== '' && !phoneValid && (
                    <p className="text-xs text-rust-700 mt-1">{t('booking.error.invalidPhone')}</p>
                  )}
```

- Delete the WhatsApp preview block in Step 3 (the `<div>` containing `booking.whatsappPreview`, the `<pre>` and `booking.whatsappHint`). The message is shown on the success screen instead, where the assigned stylist is known.

- After the Step 3 fields grid (still inside the Step 3 block), add:

```tsx
              {submitError && (
                <div role="alert" className="rounded-2xl border border-rust-200 bg-rust-50 p-4 text-sm text-rust-700">
                  <p className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                    {errorMessages[submitError]}
                  </p>
                  {(submitError === 'rate_limited' || submitError === 'too_many_bookings') && (
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-whatsapp btn-sm mt-3"
                    >
                      <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
                      {t('booking.contactWhatsapp')}
                    </a>
                  )}
                </div>
              )}
```

- [ ] **Step 6: Confirm button**

Replace the final navigation button (the `btn-whatsapp` one calling `handleWhatsAppSend`) with:

```tsx
              <button
                onClick={handleConfirm}
                disabled={!canProceed() || createBookingMutation.isPending}
                className="btn-primary"
              >
                {createBookingMutation.isPending ? (
                  <span className="w-4 h-4 rounded-full border-2 border-cream-200 border-t-cream-50 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" strokeWidth={2} />
                )}
                {createBookingMutation.isPending ? t('booking.submitting') : t('booking.confirm')}
              </button>
```

- [ ] **Step 7: New success screen**

Replace the whole `if (submitted) { return ( … ); }` block with:

```tsx
  if (submitted) {
    return (
      <section id="booking" className="relative py-20 lg:py-28 bg-cream-100/50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-sage-100 mb-6 animate-fadeIn">
            <Check className="w-10 h-10 text-sage-600" strokeWidth={2} />
            <div className="absolute inset-0 rounded-full bg-sage-200/40 animate-ping" />
          </div>
          <h2 className="font-display text-3xl font-semibold text-rose-800 mb-3">{t('booking.successTitle')}</h2>
          <p className="text-rose-600 text-lg mb-6">{t('booking.successText')}</p>

          <div className="rounded-2xl bg-white border border-cream-200 p-5 space-y-3 text-start mb-6">
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm text-rose-600">{t('booking.summary.service')}</span>
              <span className="text-sm font-medium text-rose-800">{selectedService?.name[lang]}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm text-rose-600">{t('booking.summary.stylist')}</span>
              <span className="text-sm font-medium text-rose-800">{stylistName}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm text-rose-600">{t('booking.summary.date')}</span>
              <span className="text-sm font-medium text-rose-800">{selectedDate ? formatLongDate(selectedDate, lang) : '—'}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-sm text-rose-600">{t('booking.summary.time')}</span>
              <span className="text-sm font-medium text-rose-800">{selectedTime ?? '—'}</span>
            </div>
            <div className="border-t border-cream-200 pt-3 flex justify-between items-center gap-4">
              <span className="text-sm font-semibold text-rose-700">{t('booking.summary.price')}</span>
              <span className="text-lg font-display font-semibold text-rose-800">
                {selectedService ? formatPrice(selectedService.price, lang) : '—'}
              </span>
            </div>
          </div>

          <button onClick={handleWhatsAppSend} className="btn-whatsapp btn-lg w-full mb-3">
            <MessageCircle className="w-5 h-5" strokeWidth={1.8} />
            {t('booking.whatsappSend')}
          </button>
          <p className="text-xs text-rose-600 mb-6">{t('booking.whatsappHint')}</p>
          <button onClick={resetBooking} className="btn-ghost">{t('booking.newBooking')}</button>
        </div>
      </section>
    );
  }
```

Note: the `if (submitted)` early return must stay **after** all hooks (`useCreateBooking`, `useSlots`, `useMemo`) so hook order is stable.

- [ ] **Step 8: Build and test**

Run: `pnpm build && pnpm test`
Expected: green. `grep -n "whatsappPreview" src/components/Booking.tsx` → no output (the key may remain in the dictionary).

- [ ] **Step 9: Run against the local stack**

Same env override as Task 7 Step 6. Check:
1. Book Coupe & Brushing / Amina / first open day / 09:00 with `0555 12 34 56` → success screen shows Amina; WhatsApp button opens the message.
2. New booking → same day: 09:00 and 09:30 are now disabled.
3. Open a second tab at the Confirm step for 10:00 in both; confirm in tab 1, then tab 2 → tab 2 returns to the time step with the "just taken" notice.
4. Type `021 12 34 56` → inline phone error; Confirm stays disabled.
5. Switch to AR → success/error texts are Arabic, layout RTL.

Stop the server.

- [ ] **Step 10: Commit**

```bash
git add src/components/Booking.tsx src/context/LanguageContext.tsx
git commit -m "feat(sp2): save bookings, handle conflicts/errors, WhatsApp on success screen"
```

---

# Phase B — Staff admin

### Task 9: Staff check + admin RPCs

**Files:**
- Create: `supabase/migrations/<timestamp>_admin_functions.sql` (via CLI)
- Test: `supabase/tests/database/04_admin.test.sql`

**Interfaces:**
- Consumes: `private.staff`, `private.bookings`, `private.slot_start`.
- Produces: `private.is_staff() returns boolean`; `public.admin_list_bookings(p_from date, p_to date) returns table(id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer, client_name text, client_phone text, lang text, service_id text, service_name jsonb, stylist_id text, stylist_name text, created_at timestamptz)`; `public.admin_set_booking_status(p_id uuid, p_status text) returns void` — both executable by `authenticated` only.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/04_admin.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@test.local'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'random@test.local');
insert into private.staff (user_id) values ('11111111-1111-1111-1111-111111111111');

insert into private.bookings (id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'coupe-femme', 'amina',
        '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Yasmine', '0555123456', 'fr');

create function pg_temp.act_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;

-- anon: no execute at all
set local role anon;
select throws_ok($$ select * from public.admin_list_bookings('2030-01-08', '2030-01-08') $$, '42501', null, 'anon cannot call admin_list_bookings');
reset role;

-- authenticated but not staff
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select * from public.admin_list_bookings('2030-01-08', '2030-01-08') $$, 'P0001', 'not_authorized', 'non-staff user refused (list)');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$, 'P0001', 'not_authorized', 'non-staff user refused (status)');
reset role;

-- staff
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((select client_name from public.admin_list_bookings('2030-01-08', '2030-01-08')), 'Yasmine', 'staff sees bookings with client data');
select is((select stylist_name from public.admin_list_bookings('2030-01-08', '2030-01-08')), 'Amina', 'joined stylist name');
select throws_ok($$ select * from public.admin_list_bookings('2030-01-01', '2030-03-01') $$, 'P0001', 'invalid_range', 'range capped at 31 days');
select lives_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$, 'staff can cancel');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'pending') $$, 'P0001', 'invalid_status', 'only confirmed/cancelled');
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-00000000ffff', 'confirmed') $$, 'P0001', 'not_found', 'unknown id');
reset role;

-- re-confirming a cancelled booking whose slot was taken meanwhile
insert into private.bookings (service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
values ('coupe-femme', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Other', '0666123456', 'fr');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.admin_set_booking_status('aaaaaaaa-0000-0000-0000-000000000001', 'confirmed') $$, 'P0001', 'slot_taken', 're-confirm conflict');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db`
Expected: FAIL — `function public.admin_list_bookings(...) does not exist`.

- [ ] **Step 3: Create the migration**

Run: `supabase migration new admin_functions`. Write:

```sql
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.staff s where s.user_id = auth.uid()) $$;

create or replace function public.admin_list_bookings(p_from date, p_to date)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer,
  client_name text, client_phone text, lang text, service_id text, service_name jsonb,
  stylist_id text, stylist_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.price,
           b.client_name, b.client_phone, b.lang, b.service_id, s.name,
           b.stylist_id, st.name, b.created_at
    from private.bookings b
    join public.services s on s.id = b.service_id
    join public.stylists st on st.id = b.stylist_id
    where b.starts_at >= private.slot_start(p_from, time '00:00')
      and b.starts_at < private.slot_start(p_to + 1, time '00:00')
    order by b.starts_at;
end;
$$;

create or replace function public.admin_set_booking_status(p_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update private.bookings b set status = p_status where b.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_list_bookings(date, date) from public, anon, authenticated;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(date, date) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
```

- [ ] **Step 4: Reset, test, lint**

Run: `supabase db reset && supabase test db && supabase db lint --level warning`
Expected: all four test files ok; lint clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_admin_functions.sql supabase/tests/database/04_admin.test.sql
git commit -m "feat(sp2): staff allow-list and admin booking RPCs"
```

---

### Task 10: Auth helpers, login form, gated `/admin`

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth.test.tsx`
- Create: `src/components/LoginForm.tsx`, `src/components/LoginForm.test.tsx`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/context/LanguageContext.tsx` (fr + ar)

**Interfaces:**
- Produces: `useSession(): { session: Session | null; loading: boolean }`, `signIn(email: string, password: string): Promise<void>` (throws on failure), `signOut(): Promise<void>`; `<LoginForm />`.

- [ ] **Step 1: Add i18n keys**

`fr`:

```ts
    'admin.login.title': 'Connexion',
    'admin.login.email': 'E-mail',
    'admin.login.password': 'Mot de passe',
    'admin.login.submit': 'Se connecter',
    'admin.login.error': 'E-mail ou mot de passe incorrect.',
    'admin.logout': 'Se déconnecter',
```

`ar`:

```ts
    'admin.login.title': 'تسجيل الدخول',
    'admin.login.email': 'البريد الإلكتروني',
    'admin.login.password': 'كلمة المرور',
    'admin.login.submit': 'دخول',
    'admin.login.error': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'admin.logout': 'تسجيل الخروج',
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/auth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { unsubscribe } = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { supabase } from './supabase';
import { signIn, useSession } from './auth';

beforeEach(() => vi.clearAllMocks());

describe('useSession', () => {
  it('loads the current session and unsubscribes on unmount', async () => {
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });

    const { result, unmount } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ user: { id: 'u1' } });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('throws when Supabase returns an error', async () => {
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: new Error('Invalid login credentials'),
    });
    await expect(signIn('a@b.c', 'x')).rejects.toThrow('Invalid login credentials');
  });
});
```

Create `src/components/LoginForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/auth', () => ({ signIn: vi.fn() }));

import { signIn } from '../lib/auth';
import { LanguageProvider } from '../context/LanguageContext';
import { LoginForm } from './LoginForm';

const signInMock = signIn as ReturnType<typeof vi.fn>;

function setup() {
  render(
    <LanguageProvider>
      <LoginForm />
    </LanguageProvider>
  );
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' staff@salon.dz ' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

beforeEach(() => vi.clearAllMocks());

describe('LoginForm', () => {
  it('signs in with the trimmed email', async () => {
    signInMock.mockResolvedValue(undefined);
    setup();
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('staff@salon.dz', 'secret'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when sign-in fails', async () => {
    signInMock.mockRejectedValue(new Error('Invalid login credentials'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./auth` / `./LoginForm`.

- [ ] **Step 4: Implement `src/lib/auth.ts`**

```ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
```

- [ ] **Step 5: Implement `src/components/LoginForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useLang } from '../context/LanguageContext';
import { signIn } from '../lib/auth';

export function LoginForm() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(false);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <form onSubmit={onSubmit} className="card p-8 space-y-5">
        <h1 className="font-display text-2xl font-semibold text-rose-900">{t('admin.login.title')}</h1>
        <div>
          <label htmlFor="admin-email" className="label">{t('admin.login.email')}</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="label">{t('admin.login.password')}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-rust-700">{t('admin.login.error')}</p>
        )}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {t('admin.login.submit')}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Gate `AdminPage`**

In `src/pages/AdminPage.tsx`:

- Imports: add `LogOut` to the lucide import; add
  ```tsx
  import { useQueryClient } from '@tanstack/react-query';
  import { useSession, signOut } from '../lib/auth';
  import { LoginForm } from '../components/LoginForm';
  ```
- At the top of the component body:
  ```tsx
  const { session, loading } = useSession();
  const queryClient = useQueryClient();
  const handleLogout = async () => {
    await signOut();
    queryClient.removeQueries({ queryKey: ['admin'] });
  };
  ```
- In the header's right-hand `div`, before the "back to site" `<Link>`, add:
  ```tsx
  {session && (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-cream-100 bg-cream-50/10 border border-cream-50/15 transition-colors duration-200 ease-silk hover:bg-cream-50/20"
    >
      <LogOut className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
      <span className="hidden sm:inline">{t('admin.logout')}</span>
    </button>
  )}
  ```
- Replace `<main className="flex-1"><Schedule /></main>` with:
  ```tsx
  <main className="flex-1">
    {loading ? (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
      </div>
    ) : session ? (
      <Schedule />
    ) : (
      <LoginForm />
    )}
  </main>
  ```

- [ ] **Step 7: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.tsx src/components/LoginForm.tsx src/components/LoginForm.test.tsx src/pages/AdminPage.tsx src/context/LanguageContext.tsx
git commit -m "feat(sp2): staff login and session-gated /admin"
```

---

### Task 11: Admin data hooks + Schedule on real bookings

**Files:**
- Create: `src/data/admin.ts`, `src/data/admin.test.tsx`
- Create: `src/data/hours.ts`
- Delete: `src/data/appointments.ts`
- Modify (rewrite): `src/components/Schedule.tsx`
- Modify: `src/components/Badge.tsx`, `src/index.css` (`badge-cancelled`)
- Modify: `src/context/LanguageContext.tsx` (fr + ar)

**Interfaces:**
- Consumes: `toYmd` (Task 6); RPCs from Task 9.
- Produces:
  - `type BookingStatus = 'pending' | 'confirmed' | 'cancelled'`
  - `interface AdminBooking { id: string; startsAt: Date; endsAt: Date; status: BookingStatus; price: number; clientName: string; clientPhone: string; lang: Lang; serviceId: string; serviceName: Record<Lang, string>; stylistId: string; stylistName: string }`
  - `useAdminBookings(day: Date)` — `UseQueryResult<AdminBooking[]>`, key `['admin', 'bookings', ymd]`
  - `useSetBookingStatus()` — mutation `{ id: string; status: 'confirmed' | 'cancelled' }`, invalidates `['admin']` and `['slots']`
  - `isNotAuthorized(err: unknown): boolean`, `formatAlgiersTime(d: Date): string` (`"HH:MM"`)

- [ ] **Step 1: Add i18n keys**

`fr`:

```ts
    'admin.notAuthorized': 'Ce compte n’a pas accès à l’espace salon.',
    'admin.confirm': 'Confirmer',
    'admin.cancel': 'Annuler',
    'admin.cancelConfirm': 'Annuler ce rendez-vous ? Le créneau sera libéré.',
    'admin.prevDay': 'Jour précédent',
    'admin.nextDay': 'Jour suivant',
    'admin.actionError': 'Action impossible. Veuillez réessayer.',
    'admin.slotTaken': 'Ce créneau a été repris entre-temps.',
    'schedule.cancelled': 'Annulé',
```

`ar`:

```ts
    'admin.notAuthorized': 'هذا الحساب لا يملك صلاحية الدخول إلى مساحة الصالون.',
    'admin.confirm': 'تأكيد',
    'admin.cancel': 'إلغاء',
    'admin.cancelConfirm': 'إلغاء هذا الموعد؟ سيصبح الوقت متاحًا من جديد.',
    'admin.prevDay': 'اليوم السابق',
    'admin.nextDay': 'اليوم التالي',
    'admin.actionError': 'تعذّر تنفيذ الإجراء. يرجى المحاولة مرة أخرى.',
    'admin.slotTaken': 'تم حجز هذا الوقت في الأثناء.',
    'schedule.cancelled': 'ملغى',
```

- [ ] **Step 2: Write the failing tests**

Create `src/data/admin.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { formatAlgiersTime, isNotAuthorized, useAdminBookings, useSetBookingStatus } from './admin';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useAdminBookings', () => {
  it('requests one day and maps rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'b1', starts_at: '2030-01-08T08:00:00+00:00', ends_at: '2030-01-08T09:00:00+00:00',
          status: 'pending', price: 2500, client_name: 'Yasmine', client_phone: '0555123456', lang: 'fr',
          service_id: 'coupe-femme', service_name: { fr: 'Coupe & Brushing', ar: 'قص' },
          stylist_id: 'amina', stylist_name: 'Amina', created_at: '2030-01-01T00:00:00+00:00',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useAdminBookings(new Date(2030, 0, 8)), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_list_bookings', { p_from: '2030-01-08', p_to: '2030-01-08' });
    const b = result.current.data![0];
    expect(b.clientName).toBe('Yasmine');
    expect(b.startsAt).toBeInstanceOf(Date);
    expect(formatAlgiersTime(b.startsAt)).toBe('09:00');
  });
});

describe('useSetBookingStatus', () => {
  it('calls admin_set_booking_status', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSetBookingStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', status: 'cancelled' });
    });
    expect(rpc).toHaveBeenCalledWith('admin_set_booking_status', { p_id: 'b1', p_status: 'cancelled' });
  });
});

describe('isNotAuthorized', () => {
  it('detects the not_authorized RPC error', () => {
    expect(isNotAuthorized({ message: 'not_authorized' })).toBe(true);
    expect(isNotAuthorized(new Error('boom'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./admin`.

- [ ] **Step 4: Implement `src/data/admin.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface AdminBooking {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  price: number;
  clientName: string;
  clientPhone: string;
  lang: Lang;
  serviceId: string;
  serviceName: Record<Lang, string>;
  stylistId: string;
  stylistName: string;
}

interface AdminBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  price: number;
  client_name: string;
  client_phone: string;
  lang: Lang;
  service_id: string;
  service_name: Record<Lang, string>;
  stylist_id: string;
  stylist_name: string;
  created_at: string;
}

const algiersTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Algiers',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "HH:MM" in salon time, whatever the viewer's timezone. */
export function formatAlgiersTime(d: Date): string {
  return algiersTime.format(d);
}

export function isNotAuthorized(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { message?: unknown }).message === 'not_authorized';
}

export async function fetchAdminBookings(day: Date): Promise<AdminBooking[]> {
  const ymd = toYmd(day);
  const { data, error } = await supabase.rpc('admin_list_bookings', { p_from: ymd, p_to: ymd });
  if (error) throw error;
  return ((data ?? []) as AdminBookingRow[]).map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    status: r.status,
    price: r.price,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    lang: r.lang,
    serviceId: r.service_id,
    serviceName: r.service_name,
    stylistId: r.stylist_id,
    stylistName: r.stylist_name,
  }));
}

export function useAdminBookings(day: Date) {
  return useQuery({
    queryKey: ['admin', 'bookings', toYmd(day)],
    queryFn: () => fetchAdminBookings(day),
    staleTime: 0,
    retry: false,
  });
}

export async function setBookingStatus(input: { id: string; status: 'confirmed' | 'cancelled' }): Promise<void> {
  const { error } = await supabase.rpc('admin_set_booking_status', { p_id: input.id, p_status: input.status });
  if (error) throw error;
}

export function useSetBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setBookingStatus,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}
```

- [ ] **Step 5: Hours constants, delete mock, cancelled badge**

Create `src/data/hours.ts`:

```ts
/** Salon opening hours (Africa/Algiers). Mirrors the constants in the SQL booking functions. */
export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 18;
```

Delete `src/data/appointments.ts`.

In `src/index.css`, after `.badge-available { … }` add:

```css
  .badge-cancelled {
    @apply badge bg-cream-100 text-cream-600 border border-cream-200;
  }
```

In `src/components/Badge.tsx`, widen `variant` to `'confirmed' | 'pending' | 'available' | 'cancelled'` and map `'cancelled'` → `'badge-cancelled'`:

```tsx
  const variantClass =
    variant === 'confirmed'
      ? 'badge-confirmed'
      : variant === 'pending'
      ? 'badge-pending'
      : variant === 'cancelled'
      ? 'badge-cancelled'
      : 'badge-available';
```

- [ ] **Step 6: Rewrite `src/components/Schedule.tsx`**

Replace the file with:

```tsx
import { useMemo, useState } from 'react';
import {
  Clock, Check, X, User, Phone, TrendingUp, CalendarDays, Activity, ArrowRight,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { OPENING_HOUR, CLOSING_HOUR } from '../data/hours';
import { toYmd } from '../data/bookings';
import {
  formatAlgiersTime, isNotAuthorized, useAdminBookings, useSetBookingStatus,
  type AdminBooking, type BookingStatus,
} from '../data/admin';
import { formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { DataError } from './DataError';
import { Thread } from './Thread';
import { Badge } from './Badge';

const HOUR_HEIGHT = 64; // px per hour in timeline

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function startMinutes(b: AdminBooking): number {
  return timeToMinutes(formatAlgiersTime(b.startsAt));
}

function durationMinutes(b: AdminBooking): number {
  return Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function StatusBadge({ status, compact = false }: { status: BookingStatus; compact?: boolean }) {
  const { t } = useLang();
  if (status === 'confirmed') {
    return (
      <Badge variant="confirmed" className="flex-shrink-0">
        <Check className="w-3 h-3" strokeWidth={2.5} />
        {!compact && t('schedule.confirmed')}
      </Badge>
    );
  }
  if (status === 'cancelled') {
    return (
      <Badge variant="cancelled" className="flex-shrink-0">
        <X className="w-3 h-3" strokeWidth={2.5} />
        {!compact && t('schedule.cancelled')}
      </Badge>
    );
  }
  return (
    <Badge variant="pending" className="flex-shrink-0">
      <Clock className="w-3 h-3" strokeWidth={2} />
      {!compact && t('schedule.pending')}
    </Badge>
  );
}

function AppointmentBlock({ booking }: { booking: AdminBooking }) {
  const { lang } = useLang();
  const top = ((startMinutes(booking) - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = (durationMinutes(booking) / 60) * HOUR_HEIGHT - 4;

  return (
    <div
      className={`absolute left-2 right-2 rounded-xl border p-2.5 overflow-hidden transition-all duration-200 ease-silk hover:shadow-soft hover:z-10 ${
        booking.status === 'confirmed' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
      }`}
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold text-rose-800 truncate">{booking.clientName}</span>
        <StatusBadge status={booking.status} />
      </div>
      <p className="text-[11px] text-rose-600 truncate mt-0.5">{booking.serviceName[lang]}</p>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-rose-600">
        <span className="flex items-center gap-0.5">
          <User className="w-2.5 h-2.5" strokeWidth={2} />
          {booking.stylistName}
        </span>
        <span>·</span>
        <span>{formatPrice(booking.price, lang)}</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-cream-200 shadow-soft">
      <div className="flex items-center justify-center w-11 h-11 rounded-full bg-cream-100 border border-gold-200/70 flex-shrink-0">
        <Icon className="w-5 h-5 text-gold-600" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-semibold text-rose-900 leading-none">{value}</p>
        <p className="text-xs text-rose-600 mt-1">{label}</p>
      </div>
    </div>
  );
}

export function Schedule() {
  const { lang, t } = useLang();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const bookingsQuery = useAdminBookings(day);
  const setStatus = useSetBookingStatus();
  const [actionError, setActionError] = useState<string | null>(null);

  const now = new Date();
  const isToday = toYmd(day) === toYmd(now);

  const all = useMemo(
    () => [...(bookingsQuery.data ?? [])].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [bookingsQuery.data]
  );
  const active = all.filter((b) => b.status !== 'cancelled');

  const totalRevenue = active.reduce((sum, b) => sum + b.price, 0);
  const totalMinutes = active.reduce((sum, b) => sum + durationMinutes(b), 0);
  const operatingMinutes = (CLOSING_HOUR - OPENING_HOUR) * 60;
  const occupationRate = Math.round((totalMinutes / operatingMinutes) * 100);

  const nowMinutes = timeToMinutes(formatAlgiersTime(now));
  const upcoming = isToday ? active.find((b) => startMinutes(b) >= nowMinutes) : active[0];

  const hours = Array.from({ length: CLOSING_HOUR - OPENING_HOUR + 1 }, (_, i) => OPENING_HOUR + i);

  const shiftDay = (delta: number) => {
    setDay((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + delta);
      return next;
    });
  };

  const changeStatus = (booking: AdminBooking, status: 'confirmed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm(t('admin.cancelConfirm'))) return;
    setActionError(null);
    setStatus.mutate(
      { id: booking.id, status },
      {
        onError: (err) => {
          const message = (err as { message?: unknown })?.message;
          setActionError(message === 'slot_taken' ? t('admin.slotTaken') : t('admin.actionError'));
        },
      }
    );
  };

  if (bookingsQuery.isError && isNotAuthorized(bookingsQuery.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }

  return (
    <section id="schedule" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow eyebrow-center justify-center mx-auto mb-4">{t('schedule.kicker')}</p>
          <h2 className="font-display font-semibold text-rose-900 mb-2 text-[clamp(2rem,4vw,3rem)]">
            {t('schedule.title')}
          </h2>
          <p className="text-rose-600 text-lg">{t('schedule.subtitle')}</p>
        </div>

        {/* Day picker */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button onClick={() => shiftDay(-1)} className="btn-ghost btn-sm" aria-label={t('admin.prevDay')}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          <span className="font-display text-lg font-semibold text-rose-800 min-w-[12rem] text-center">
            {formatLongDate(day, lang)}
          </span>
          <button onClick={() => shiftDay(1)} className="btn-ghost btn-sm" aria-label={t('admin.nextDay')}>
            <ChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          {!isToday && (
            <button onClick={() => setDay(startOfDay(new Date()))} className="btn-secondary btn-sm">
              {t('schedule.today')}
            </button>
          )}
        </div>

        {actionError && (
          <p role="alert" className="max-w-xl mx-auto mb-6 rounded-xl border border-rust-200 bg-rust-50 px-4 py-3 text-sm text-rust-700 text-center">
            {actionError}
          </p>
        )}

        {bookingsQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : bookingsQuery.isError ? (
          <DataError onRetry={() => bookingsQuery.refetch()} />
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={CalendarDays} label={t('schedule.appointments')} value={String(active.length)} />
              <StatCard icon={TrendingUp} label={t('schedule.revenue')} value={formatPrice(totalRevenue, lang)} />
              <StatCard icon={Activity} label={t('schedule.occupation')} value={`${occupationRate}%`} />
              <StatCard
                icon={Clock}
                label={t('schedule.nextAppt')}
                value={upcoming ? formatAlgiersTime(upcoming.startsAt) : '—'}
              />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Timeline */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-lg font-semibold text-rose-800">{formatLongDate(day, lang)}</h3>
                    <span className="text-sm text-rose-600">
                      {active.length} {t('schedule.appointments')}
                    </span>
                  </div>

                  <div className="relative" style={{ height: `${(CLOSING_HOUR - OPENING_HOUR) * HOUR_HEIGHT}px` }}>
                    {hours.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: `${i * HOUR_HEIGHT}px` }}>
                        <span className="text-xs text-rose-600 w-12 flex-shrink-0 -mt-1.5">
                          {String(h).padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 border-t border-cream-200" />
                      </div>
                    ))}

                    {isToday && nowMinutes >= OPENING_HOUR * 60 && nowMinutes < CLOSING_HOUR * 60 && (
                      <div
                        className="absolute left-12 right-0 flex items-center z-20 pointer-events-none"
                        style={{ top: `${((nowMinutes - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                        <div className="flex-1 border-t-2 border-rose-500/60" />
                      </div>
                    )}

                    <div className="absolute left-12 right-0 top-0 bottom-0">
                      {active.map((b) => (
                        <AppointmentBlock key={b.id} booking={b} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar — next appointment + list with actions */}
              <div className="space-y-6">
                <div className="relative bg-gradient-to-br from-rose-800 to-rose-900 rounded-3xl p-6 text-cream-50 shadow-lift overflow-hidden">
                  <div className="absolute top-0 inset-x-0 hairline opacity-50" />
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-gold-300 mb-3">{t('schedule.nextAppt')}</p>
                  {upcoming ? (
                    <>
                      <p className="font-display text-3xl font-semibold mb-1">{formatAlgiersTime(upcoming.startsAt)}</p>
                      <p className="text-sm text-cream-200/90 mb-4">
                        {upcoming.clientName} · {upcoming.serviceName[lang]}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-cream-200/70">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" strokeWidth={1.8} />
                          {upcoming.stylistName}
                        </span>
                        <span>·</span>
                        <span>{formatDuration(durationMinutes(upcoming), lang)}</span>
                        <span>·</span>
                        <span>{formatPrice(upcoming.price, lang)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-cream-200/70">{t('schedule.noUpcoming')}</p>
                  )}
                </div>

                <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-5">
                  <h3 className="font-display text-base font-semibold text-rose-800 mb-4">{formatLongDate(day, lang)}</h3>
                  {all.length === 0 ? (
                    <p className="text-sm text-rose-600 py-6 text-center">{t('schedule.empty')}</p>
                  ) : (
                    <div className="space-y-2.5">
                      {all.map((b) => (
                        <div key={b.id} className="p-2.5 rounded-xl hover:bg-cream-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                              <span className="text-sm font-semibold text-rose-700">{formatAlgiersTime(b.startsAt)}</span>
                              <span className="text-[10px] text-rose-600">{formatDuration(durationMinutes(b), lang)}</span>
                            </div>
                            <Thread variant="connector" className="h-10 text-rose-300" />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${b.status === 'cancelled' ? 'text-cream-500 line-through' : 'text-rose-800'}`}>
                                {b.clientName}
                              </p>
                              <p className="text-xs text-rose-600 truncate">
                                {b.serviceName[lang]} · {b.stylistName}
                              </p>
                              <a href={`tel:${b.clientPhone}`} dir="ltr" className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800">
                                <Phone className="w-3 h-3" strokeWidth={1.8} />
                                {b.clientPhone}
                              </a>
                            </div>
                            <StatusBadge status={b.status} compact />
                          </div>
                          {b.status !== 'cancelled' && (
                            <div className="flex justify-end gap-2 mt-2">
                              {b.status === 'pending' && (
                                <button
                                  onClick={() => changeStatus(b, 'confirmed')}
                                  disabled={setStatus.isPending}
                                  className="btn-secondary btn-sm"
                                >
                                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                                  {t('admin.confirm')}
                                </button>
                              )}
                              <button
                                onClick={() => changeStatus(b, 'cancelled')}
                                disabled={setStatus.isPending}
                                className="btn-ghost btn-sm"
                              >
                                <X className="w-3.5 h-3.5" strokeWidth={2} />
                                {t('admin.cancel')}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <a
                    href="/#booking"
                    className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-cream-200 text-sm font-medium text-rose-600 hover:text-rose-800 transition-colors"
                  >
                    {t('nav.booking')}
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
                  </a>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Verify no stale imports, run tests and build**

Run: `grep -rn "data/appointments\|todayAppointments" src` → no output.
Run: `pnpm test && pnpm build` → green.

- [ ] **Step 8: Run against the local stack**

Create a local staff user: open Studio (`supabase status` prints the URL, usually http://127.0.0.1:54323) → Authentication → Add user (email + password, auto-confirm). Then in Studio → SQL editor:

```sql
insert into private.staff (user_id) select id from auth.users where email = '<that email>';
```

Start the dev server with the local env override (Task 7 Step 6). Check:
1. `/admin` shows the login form; wrong password → error message.
2. Correct login → today's schedule; navigate to the day booked in Task 8 → bookings appear with phone links.
3. Confirm one → badge turns "Confirmé". Cancel another (accept the prompt) → struck through; on the public site that slot is available again.
4. Add a second user in Studio **without** a staff row → logging in shows "Ce compte n'a pas accès…".
5. Log out → back to the login form. AR toggle works on all of the above.

Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A src/data/admin.ts src/data/admin.test.tsx src/data/hours.ts src/data/appointments.ts src/components/Schedule.tsx src/components/Badge.tsx src/index.css src/context/LanguageContext.tsx
git commit -m "feat(sp2): admin schedule on real bookings with confirm/cancel"
```

---

### Task 12: Rollout, verification, docs

**Files:**
- Modify: `CLAUDE.md` (architecture notes that are now false)

- [ ] **Step 1: Full local verification**

Run: `supabase db reset && supabase test db && supabase db lint --level warning && pnpm build && pnpm test`
Expected: everything green.

- [ ] **Step 2: Update `CLAUDE.md`**

Replace the "no backend and no database" sentence in "What this is" with: `Backend is Supabase (Postgres + Auth), managed by CLI migrations in supabase/. Customers book through RPCs (get_slots, create_booking); bookings live in the non-exposed private schema. Staff log in at /admin (sign-ups disabled; access requires a row in private.staff).` In "Commands" add `supabase start`, `supabase db reset`, `supabase test db` (pgTAP, needs Docker) and the test command `pnpm test` (Vitest). Replace the "Booking flow" paragraph's statements about stubs and WhatsApp-only with the SP2 behaviour (save via `create_booking`, WhatsApp button on the success screen). Remove the "Availability is faked" paragraph.

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Supabase bookings and staff admin"
```

- [ ] **Step 3: Remote pre-flight (user)**

Ask the user to confirm in the Supabase dashboard → HairSalon → Authentication → Sign In / Providers that **"Allow new users to sign up" is OFF**. Do not continue until confirmed.

- [ ] **Step 4: Push to the remote database (user)**

Show `supabase db push --include-seed --dry-run` output (expected: the three SP2 migrations + seed). Then ask the user to run:

```
! supabase db push --include-seed
```

Then verify the pairs reached the live DB (anon read is allowed):

```bash
set -a; . ./.env; set +a
curl -s "$VITE_SUPABASE_URL/rest/v1/stylist_services?select=stylist_id,service_id" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```

Expected: 6 rows. If empty (the CLI did not re-run the changed `seed.sql`), ask the user to run the `insert into stylist_services … on conflict do nothing;` statement from `supabase/seed.sql` in the SQL Editor, then re-check.

- [ ] **Step 5: Create the real staff account (user)**

The user creates the staff login in dashboard → Authentication → Add user, then runs in the SQL Editor:

```sql
insert into private.staff (user_id) select id from auth.users where email = '<staff email>';
```

- [ ] **Step 6: Manual end-to-end against the live project**

With plain `pnpm dev` (real `.env`): FR booking and AR booking end-to-end; two-tab race → one gets "just taken"; staff login → confirm and cancel; the cancelled slot reappears on the public site; a non-staff account (if one exists) is refused; no console errors. Record the results for the PR description.

- [ ] **Step 7: Push branch and open the PR**

```bash
git push -u origin feat/sp2-bookings-staff-admin
gh pr create --base main --title "SP2: booking persistence, real availability, minimal staff admin" --body "<summary, setup (sign-ups off, staff insert SQL), test plan with results>"
```
