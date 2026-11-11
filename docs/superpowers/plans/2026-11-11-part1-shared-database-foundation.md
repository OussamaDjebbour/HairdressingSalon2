# Part 1 — Shared-Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the one Supabase database safe to share between many salons — every salon-owned row carries a `salon_id`, the database enforces the separation, and tests prove no salon can see or touch another's data — while the live site keeps behaving exactly as today with Élégance as the only salon.

**Architecture:** A `salons` table plus a required `salon_id` on every salon-owned table, with composite foreign keys so cross-salon links are impossible. Staff belong to one salon; `private.my_salon()` derives it from the login and owner functions never take a salon id from the browser. Staff booking functions become `security invoker` under row-level security; public booking functions and push plumbing stay `security definer` with explicit salon scoping. A catalogue-reading guard test fails the build when a table or API function escapes the rules.

**Tech Stack:** Supabase Postgres (migrations, pgTAP via `supabase test db`), Supabase Edge Function (Deno) for push, React 18 + TypeScript + Vitest frontend, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-multi-salon-design.md` — section "Part 1 — Shared-database foundation". Read it before starting.

## Global Constraints

- Never edit an already-pushed migration (everything up to `20261107120000_push_notifications.sql` is pushed). Each task adds a new migration file under `supabase/migrations/`.
- Error codes stay as today: `not_authorized`, `not_found`, `unknown_service`, `outside_hours`, `slot_taken`, `rate_limited`, `too_many_bookings`, `invalid_name`, `invalid_phone`, `invalid_status`, `invalid_range`, `invalid_subscription` (all `errcode = 'P0001'`).
- Owner (staff) functions **never accept a salon id** from the caller; they use `private.my_salon()`. An id belonging to another salon behaves exactly like an id that doesn't exist (`not_found` / `unknown_service` / no rows) — never a different error.
- Public functions (`get_slots`, `create_booking`) take `p_salon_id text` and verify that the service and stylist belong to it.
- Online abuse limits (20 per 10 min site-wide, 5 per IP per hour, 3 future per phone) are counted **within the salon**.
- The Élégance salon id is the text `'elegance'`; its name is `'Élégance'`.
- Service and stylist ids stay **globally unique** text primary keys (a second salon can't reuse `'coupe-femme'`; Part 3's script generates ids). Composite keys `(salon_id, id)` exist only to back the composite foreign keys.
- Every UI string goes through `t()` with both `fr` and `ar` keys (see `CLAUDE.md`).
- After Part 1 the public site and `/admin` behave exactly as before for Élégance.
- Running the DB tests: `supabase start -x logflare,vector,studio` once, then `supabase db reset && supabase test db`. Frontend: `pnpm test` and `npx tsc -b`.

## Review Focus

1. **A staff member of salon A passes salon B's booking/service/stylist ids to every owner function** → must get `not_found` / `unknown_service` / empty results, and B's rows must be unchanged. (Task 3 and Task 4 isolation tests.)
2. **An online client books at salon A using salon B's service or stylist id** (crafted request) → `unknown_service`, nothing inserted. (Task 2.)
3. **Salon B's online traffic fills its abuse limits** → salon A's clients can still book. (Task 2.)
4. **A new online booking at salon B** → no push request contains salon A's subscriptions, and A's staff never receive B's client names. (Task 4.)
5. **A future migration adds a table without `salon_id`/RLS, or a public function without isolation coverage** → the guard test fails. (Task 5, including a self-check that the guard really detects a violation.)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261112100000_salons.sql` | `salons` table, `salon_id` columns (temporary default), backfill, composite keys, RLS switched on, `my_salon()`, `admin_my_salon()` |
| `supabase/migrations/20261112100100_salon_public_booking.sql` | salon-aware `get_slots` / `create_booking`, per-salon limits |
| `supabase/migrations/20261112100200_salon_staff_invoker.sql` | staff booking functions → `security invoker`, grants + RLS policies |
| `supabase/migrations/20261112100300_salon_push.sql` | push subscriptions and notifications scoped to the salon |
| `supabase/migrations/20261112100400_salon_finalize.sql` | drop temporary `salon_id` defaults |
| `supabase/tests/database/09_salons.test.sql` | schema: salons, composite FKs, `my_salon`, `admin_my_salon` |
| `supabase/tests/database/10_isolation.test.sql` | two-salon isolation tests for **every** API function |
| `supabase/tests/database/11_guard.test.sql` | catalogue guard |
| `supabase/seed.sql` | explicit `salon_id` on every insert |
| `src/data/salon.ts` | `SALON_ID` for this build (Élégance until Part 3) |
| `src/data/queries.ts`, `src/data/bookings.ts` | filter/pass the salon |
| `src/data/admin.ts`, `src/components/Schedule.tsx`, `src/context/LanguageContext.tsx` | "account belongs to another salon" gate |
| `supabase/functions/_shared/notify.ts` (+ test) | salon name in the new-booking title |
| `.github/workflows/ci.yml` | tests + lint on every push / PR |

Two fixture salons used across the new DB tests (create them at the top of each test file that needs them; pgTAP files run in separate transactions):

```sql
-- salon B: 'rival' with its own service, stylist, staff user and a booking
insert into public.salons (id, name) values ('rival', 'Rival');
insert into public.services (id, salon_id, category, name, description, price, duration, image, icon)
  values ('rival-cut', 'rival', 'coiffure', '{"fr":"Coupe R","ar":"قص"}', '{"fr":"x","ar":"x"}', 1000, 60, 'x', 'scissors');
insert into public.stylists (id, salon_id, name, role, image)
  values ('nadia', 'rival', 'Nadia', '{"fr":"Coiffeuse","ar":"مصففة"}', 'x');
insert into public.stylist_services (salon_id, stylist_id, service_id) values ('rival', 'nadia', 'rival-cut');
-- users: 1111… = Élégance staff, 4444… = Rival staff, 2222… = not staff
```

---

### Task 1: Salons table, `salon_id` everywhere, staff → salon

**Files:**
- Create: `supabase/migrations/20261112100000_salons.sql`
- Test: `supabase/tests/database/09_salons.test.sql`

**Interfaces:**
- Produces:
  - `public.salons (id text primary key, name text not null, status text not null default 'active' check (status in ('active','inactive')), created_at timestamptz not null default now())`, RLS on, policy "public read salons" `for select to anon, authenticated using (true)`, `grant select … to anon, authenticated`. Row `('elegance', 'Élégance')` inserted by the migration.
  - `salon_id text not null default 'elegance' references public.salons(id)` on `public.services`, `public.stylists`, `public.stylist_services`, `private.bookings`, `private.staff`, `private.push_subscriptions` (default is **temporary**, removed in Task 5).
  - `unique (salon_id, id)` on `services` and `stylists`; composite FKs replacing the single-column ones: `private.bookings (salon_id, service_id) → services (salon_id, id)`, `(salon_id, stylist_id) → stylists (salon_id, id)`; `stylist_services (salon_id, stylist_id) → stylists`, `(salon_id, service_id) → services`, both `on delete cascade`. Drop `bookings_service_id_fkey`, `bookings_stylist_id_fkey`, `stylist_services_stylist_id_fkey`, `stylist_services_service_id_fkey`.
  - Row-level security enabled on `private.bookings`, `private.staff`, `private.push_subscriptions` (no policies yet — only `security definer` functions owned by `postgres` touch them, and the owner bypasses RLS).
  - `private.my_salon() returns text` — `security definer`, `stable`, `set search_path = ''`: the caller's `private.staff.salon_id`, or null.
  - `private.is_staff()` redefined as `select private.my_salon() is not null`.
  - `public.admin_my_salon() returns text` — raises `not_authorized` for non-staff, else returns `my_salon()`. Execute granted to `authenticated` only.

- [ ] **Step 1: Write the failing test `09_salons.test.sql`** (`select plan(N)` matching the assertions)

```sql
select has_table('public', 'salons', 'salons exists');
select is((select name from public.salons where id = 'elegance'), 'Élégance', 'Élégance salon exists');
select is((select count(*)::int from public.services where salon_id <> 'elegance'), 0, 'existing services backfilled to elegance');
select is((select count(*)::int from private.staff where salon_id is null), 0, 'staff have a salon');
-- fixture salon 'rival' (see File Structure), then:
select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
  values ('elegance', 'rival-cut', 'amina', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 1000, 'Cross', '0555000001', 'fr') $$,
  '23503', null, 'booking cannot use another salon''s service');
select throws_ok($$ insert into private.bookings (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang)
  values ('elegance', 'coupe-femme', 'nadia', '2030-01-08 09:00+01', '2030-01-08 10:00+01', 2500, 'Cross', '0555000001', 'fr') $$,
  '23503', null, 'booking cannot use another salon''s stylist');
select throws_ok($$ insert into public.stylist_services (salon_id, stylist_id, service_id) values ('elegance', 'amina', 'rival-cut') $$,
  '23503', null, 'stylist_services cannot cross salons');
-- staff 1111… in elegance, 4444… in rival, 2222… not staff (act_as helper as in 04_admin.test.sql)
-- as 1111…: admin_my_salon() = 'elegance'; as 4444…: 'rival'; as 2222…: throws not_authorized; anon: throws 42501
select ok((select relrowsecurity from pg_class where oid = 'private.bookings'::regclass), 'RLS on private.bookings');
```

- [ ] **Step 2: Run** `supabase db reset && supabase test db` — Expected: `09_salons` FAILS (no `salons` table); all other files still pass.

- [ ] **Step 3: Write migration `20261112100000_salons.sql`** per the Interfaces block. Backfill `private.push_subscriptions.salon_id` and `private.staff.salon_id` to `'elegance'` (the column default does it). End with the usual `revoke execute on all functions in schema private from public, anon, authenticated;` and explicit grants for `admin_my_salon`.

- [ ] **Step 4: Run** `supabase db reset && supabase test db` — Expected: all files PASS (existing tests unchanged thanks to the temporary default; positional `insert into public.stylist_services values (…)` in old tests still works because `salon_id` is appended last).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261112100000_salons.sql supabase/tests/database/09_salons.test.sql
git commit -m "feat(db): salons table and salon_id on every salon-owned table"
```

---

### Task 2: Salon-aware public booking (DB + frontend)

**Files:**
- Create: `supabase/migrations/20261112100100_salon_public_booking.sql`, `src/data/salon.ts`
- Modify: `src/data/bookings.ts:58-66,92-104`, `src/data/queries.ts:27-58`, `src/vite-env.d.ts`, `.env.example`, `supabase/tests/database/02_get_slots.test.sql`, `03_create_booking.test.sql`, `06_booking_source.test.sql` (call sites only), relevant Vitest files that assert RPC params
- Test: `supabase/tests/database/10_isolation.test.sql` (created here; later tasks append)

**Interfaces:**
- Consumes: Task 1 schema.
- Produces:
  - `public.get_slots(p_salon_id text, p_date date, p_service_id text, p_stylist_id text default null) returns table (slot text, available boolean)` — same rules as today; `unknown_service` if the service isn't in `p_salon_id`, or the stylist isn't in `p_salon_id` / doesn't offer it. Old `get_slots(date, text, text)` dropped.
  - `public.create_booking(p_salon_id text, p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns table (booking_id uuid, stylist_id text)` — inserts with `salon_id = p_salon_id`; candidates only from that salon; the three limits count only `b.salon_id = p_salon_id`. Old 7-arg version dropped. Both stay `security definer`, granted to `anon, authenticated`.
  - `src/data/salon.ts`: `export const SALON_ID: string = import.meta.env.VITE_SALON_ID || 'elegance';`
  - `fetchServices()` / `fetchStylists()` add `.eq('salon_id', SALON_ID)`; `fetchSlots` / `createBooking` send `p_salon_id: SALON_ID`. Hook signatures unchanged.

- [ ] **Step 1: Write the failing isolation tests** in new `10_isolation.test.sql` (fixture salon `rival`; one open day helper as in `02_get_slots.test.sql`):

```sql
select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'rival-cut') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s service');
select throws_ok($$ select * from public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme', 'nadia') $$, 'P0001', 'unknown_service', 'get_slots: other salon''s stylist');
select throws_ok($$ select * from public.create_booking('elegance', 'rival-cut', null, pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s service');
select throws_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'nadia', pg_temp.open_day(), '10:00', 'Amel', '0555123456', 'fr') $$, 'P0001', 'unknown_service', 'create_booking: other salon''s stylist');
select is((select count(*)::int from private.bookings where client_name = 'Amel'), 0, 'nothing inserted');
-- limits are per salon: insert 20 online bookings for 'rival' created now (direct insert, source 'online'),
-- then create_booking('elegance', 'coupe-femme', 'amina', …) lives_ok
select lives_ok($$ select * from public.create_booking('elegance', 'coupe-femme', 'amina', pg_temp.open_day(2), '10:00', 'Lina', '0555777777', 'fr') $$, 'rival''s traffic does not rate-limit elegance');
select is((select salon_id from private.bookings where client_name = 'Lina'), 'elegance', 'booking stored in the right salon');
-- same phone: 3 future online bookings at 'rival' don't count at 'elegance'
```

- [ ] **Step 2: Update existing call sites** in `02`, `03`, `06` test files to pass `'elegance'` as the first argument (e.g. `public.get_slots('elegance', pg_temp.open_day(), 'coupe-femme')`). Run `supabase db reset && supabase test db` — Expected: FAIL (`function public.get_slots(unknown, date, unknown) does not exist`).

- [ ] **Step 3: Write migration `20261112100100_salon_public_booking.sql`** per Interfaces (drop old signatures first, recreate with the body of the current `create_booking` from `20261106130000_booking_source.sql` plus salon filters; insert `salon_id` explicitly). Revoke/grant exactly as the previous migrations did, with the new signatures.

- [ ] **Step 4: Run** `supabase db reset && supabase test db` — Expected: PASS.

- [ ] **Step 5: Frontend** — add `src/data/salon.ts`, `VITE_SALON_ID?: string` to `src/vite-env.d.ts`, `VITE_SALON_ID=elegance` (commented as optional) to `.env.example`; update `queries.ts` and `bookings.ts` per Interfaces. Update any Vitest assertion on the RPC params / query builder mock (search `get_slots`, `create_booking`, `from('services')` in `src/**/*.test.*`) to expect `p_salon_id: 'elegance'` and the `.eq('salon_id', 'elegance')` call.

- [ ] **Step 6: Run** `pnpm test && npx tsc -b` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261112100100_salon_public_booking.sql supabase/tests/database src/data src/vite-env.d.ts .env.example
git commit -m "feat(booking): public booking is scoped to a salon"
```

---

### Task 3: Staff booking functions run as the caller, under RLS

**Files:**
- Create: `supabase/migrations/20261112100200_salon_staff_invoker.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (append), and `04_admin.test.sql` / `07_admin_write.test.sql` only if a fixture needs `salon_id`
- Test: `10_isolation.test.sql`

**Interfaces:**
- Consumes: `private.my_salon()`, `private.is_staff()` (Task 1).
- Produces (signatures unchanged, so `src/data/admin.ts` needs no change):
  - `public.admin_list_bookings(date, date)`, `public.admin_set_booking_status(uuid, text)`, `public.admin_create_booking(text, text, date, text, text, text, text)`, `public.admin_update_booking(uuid, text, text, date, text, text, text, text)` — all `security invoker`. Each: `not_authorized` if `my_salon()` is null; service and stylist looked up with `salon_id = my_salon()` (else `unknown_service`); inserts set `salon_id = my_salon()`; list/update/status also filter `b.salon_id = my_salon()` explicitly (belt and braces on top of RLS).
  - Grants: `usage on schema private to authenticated`; `select, insert, update on private.bookings to authenticated`; `select on private.staff to authenticated`; `execute` on `private.my_salon()`, `private.is_staff()`, `private.normalize_phone(text)`, `private.staff_slot(date, text, integer)`, `private.slot_start(date, time)` to `authenticated`.
  - Policies on `private.bookings` for `authenticated`: select `using (salon_id = (select private.my_salon()))`; insert `with check (same)`; update `using (same) with check (same)`. On `private.staff`: select `using (user_id = auth.uid())`.
  - `private` stays out of the API's exposed schemas (check `supabase/config.toml` `[api] schemas` does not list it).

- [ ] **Step 1: Append failing isolation tests** to `10_isolation.test.sql`: a `rival` booking `'bbbbbbbb-0000-0000-0000-000000000001'` (nadia, rival-cut, client `'Rival Client'`, status `pending`), an Élégance booking `'aaaaaaaa-0000-0000-0000-000000000001'` (amina, coupe-femme, client `'Own'`), and staff users as in Task 1. Acting as Élégance staff (1111…):

```sql
select is((select count(*)::int from public.admin_list_bookings('2030-01-01', '2030-01-31') where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'list: never shows another salon''s booking');
select throws_ok($$ select public.admin_set_booking_status('bbbbbbbb-0000-0000-0000-000000000001', 'cancelled') $$, 'P0001', 'not_found', 'status: other salon''s booking is not_found');
select throws_ok($$ select public.admin_update_booking('bbbbbbbb-0000-0000-0000-000000000001', 'coupe-femme', 'amina', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'not_found', 'update: other salon''s booking is not_found');
select lives_ok($$ select public.admin_create_booking('coupe-femme', 'amina', '2030-01-09', '10:00', 'Walkin', '0555000000', 'fr') $$, 'create: own salon works');
select throws_ok($$ select public.admin_create_booking('rival-cut', 'amina', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'create: other salon''s service');
select throws_ok($$ select public.admin_create_booking('coupe-femme', 'nadia', '2030-01-08', '10:00', 'Hack', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'create: other salon''s stylist');
-- own booking moved onto the other salon's stylist/service:
select throws_ok($$ select public.admin_update_booking('aaaaaaaa-0000-0000-0000-000000000001', 'rival-cut', 'nadia', '2030-01-08', '10:00', 'Own', '0555000000', 'fr') $$, 'P0001', 'unknown_service', 'update: cannot move to other salon''s service/stylist');
select is((select salon_id from private.bookings where client_name = 'Walkin'), 'elegance', 'create stores my salon');
```

Then `reset role` and assert the rival booking is unchanged (status `pending`, client name, stylist `nadia`). Repeat the list assertion acting as Rival staff (4444…) to show it sees only its own booking.

- [ ] **Step 2: Run** `supabase db reset && supabase test db` — Expected: FAIL (e.g. status on the rival booking succeeds today).

- [ ] **Step 3: Write migration `20261112100200_salon_staff_invoker.sql`** per Interfaces. Bodies are today's (`20261106130100_admin_write_bookings.sql`, `20261106130000_booking_source.sql` for the list) with `security invoker` and the salon filters added. Keep `exception when exclusion_violation → slot_taken`.

- [ ] **Step 4: Run** `supabase db reset && supabase test db` — Expected: PASS, including unchanged `04_admin` and `07_admin_write`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261112100200_salon_staff_invoker.sql supabase/tests/database
git commit -m "feat(admin): staff booking functions run under row-level security"
```

---

### Task 4: Push notifications scoped to the salon

**Files:**
- Create: `supabase/migrations/20261112100300_salon_push.sql`
- Modify: `supabase/functions/_shared/notify.ts` (`BookingPayload`, `buildPushMessage`), `supabase/functions/_shared/notify.test.ts`, `supabase/tests/database/08_push.test.sql` (only where `post_push` is called directly), `10_isolation.test.sql` (append)

**Interfaces:**
- Consumes: `private.my_salon()`.
- Produces:
  - `private.post_push(p_kind text, p_booking jsonb, p_salon_id text, p_user uuid default null) returns integer` — subscriptions limited to `s.salon_id = p_salon_id` **and** `staff.salon_id = p_salon_id`. Old 3-arg version dropped.
  - `private.notify_new_booking()` passes `new.salon_id` and adds `'salon_name', (select name from public.salons where id = new.salon_id)` to the payload.
  - `admin_save_push_subscription` stores `salon_id = my_salon()` (on insert and on conflict update). `admin_delete_push_subscription` also requires `s.salon_id = my_salon()`. `admin_send_test_push` calls `post_push('test', null, private.my_salon(), auth.uid())`. These stay `security definer`.
  - `BookingPayload.salon_name?: string`; new-booking title becomes `` `${c.newTitle} · ${booking.salon_name}` `` when `salon_name` is present, unchanged otherwise.

- [ ] **Step 1: Failing tests.**
  - `10_isolation.test.sql`: Élégance staff (1111…) and Rival staff (4444…) each save a subscription (`'https://push/elegance'`, `'https://push/rival'`). With the Vault secrets created as in `08_push.test.sql`, insert an **online** booking for `rival`; assert the last queued request body's `subscriptions` contains `'https://push/rival'` and not `'https://push/elegance'`, and its `booking.salon_name` is `'Rival'`. Acting as Élégance staff, `admin_delete_push_subscription('https://push/rival')` leaves the rival row in place.
  - `notify.test.ts`: `buildPushMessage('new_booking', {...booking, salon_name: 'Rival'}, 'fr').title` equals `'<current newTitle fr> · Rival'`; without `salon_name` the title is unchanged.
- [ ] **Step 2: Run** `supabase db reset && supabase test db && pnpm test` — Expected: FAIL.
- [ ] **Step 3: Write migration `20261112100300_salon_push.sql`** and update `notify.ts` per Interfaces.
- [ ] **Step 4: Run** `supabase db reset && supabase test db && pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261112100300_salon_push.sql supabase/functions/_shared supabase/tests/database
git commit -m "feat(push): notifications go only to the booking's salon"
```

---

### Task 5: No defaults left, and the guard test

**Files:**
- Create: `supabase/migrations/20261112100400_salon_finalize.sql`, `supabase/tests/database/11_guard.test.sql`
- Modify: `supabase/seed.sql`, every existing test that inserts into a salon-owned table (`01`…`08`: add `salon_id`; switch positional `insert into public.stylist_services values (…)` to named columns)

**Interfaces:**
- Produces: `salon_id` has **no default** on the six tables. The guard's covered-functions list (below) is the single place a new API function must be registered.

- [ ] **Step 1: Write `11_guard.test.sql`** (plan 5):

```sql
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
  where n.nspname = 'public' and c.relname = 'guard_probe'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'salon_id')), 'guard detects a missing salon_id');
```

Add `admin_my_salon` isolation coverage to `10_isolation.test.sql` if Task 1's `09_salons` assertions aren't already there (copy them; the guard's list means "covered in 10").

- [ ] **Step 2: Run** `supabase db reset && supabase test db` — Expected: `11_guard` FAILS on assertion 2 (temporary defaults).
- [ ] **Step 3: Write `20261112100400_salon_finalize.sql`** (`alter table … alter column salon_id drop default` × 6). Update `seed.sql` (`salon_id` = `'elegance'` on services, stylists, stylist_services) and every direct insert in test files.
- [ ] **Step 4: Run** `supabase db reset && supabase test db && supabase db lint --level warning` — Expected: all PASS, lint reports no warnings.
- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): enforce explicit salon_id and add the isolation guard test"
```

---

### Task 6: "This account belongs to another salon" in `/admin`

**Files:**
- Modify: `src/data/admin.ts` (add hook), `src/components/Schedule.tsx:134-136`, `src/context/LanguageContext.tsx` (fr + ar), `src/components/Schedule.test.tsx`

**Interfaces:**
- Consumes: `public.admin_my_salon()` (Task 1), `SALON_ID` (Task 2).
- Produces: `fetchMySalon(): Promise<string>` and `useMySalon()` (React Query key `['admin', 'my-salon']`, `staleTime: Infinity`) in `src/data/admin.ts`. Translation key `admin.otherSalon` — fr: `'Ce compte appartient à un autre salon.'`, ar: `'هذا الحساب تابع لصالون آخر.'`.

- [ ] **Step 1: Failing test** in `Schedule.test.tsx`: with the supabase mock returning `'rival'` for `admin_my_salon`, Schedule renders `admin.otherSalon`'s French text and does **not** render the week strip; with `'elegance'` it renders as today; with a `not_authorized` error it renders `admin.notAuthorized` as today.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL.
- [ ] **Step 3: Implement** — Schedule checks `useMySalon()` before rendering the schedule: loading → existing loading state; `not_authorized` → existing message; value `!== SALON_ID` → `t('admin.otherSalon')`.
- [ ] **Step 4: Run** `pnpm test && npx tsc -b` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(admin): refuse staff of another salon"
```

---

### Task 7: CI runs every test before anything ships

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none (no secrets needed).

- [ ] **Step 1: Write the workflow**: on `push` and `pull_request` to any branch; job on `ubuntu-latest`: checkout → `pnpm/action-setup` + `actions/setup-node` (Node 20, pnpm cache) → `pnpm install --frozen-lockfile` → `npx tsc -b` → `pnpm test` → `supabase/setup-cli` → `supabase start -x logflare,vector,studio,imgproxy,edge-runtime` → `supabase test db` → `supabase db lint --level warning --fail-on warning`. Pin every action to a released major version.
- [ ] **Step 2: Verify locally** that each command in the workflow passes in this order (`supabase stop && supabase start …` then the rest). Expected: all green.
- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, unit, database and lint checks on every push"
```

- [ ] **Step 4:** After the branch is pushed (only when the product owner asks), confirm the workflow run is green on GitHub (`gh run list --branch <branch>`).

---

### Task 8: Apply to the live database (needs the product owner's go-ahead)

**Files:** none.

- [ ] **Step 1:** Ask the product owner before touching the live project. Confirm the live project isn't paused (`curl -s -o /dev/null -w "%{http_code}" "$VITE_SUPABASE_URL/rest/v1/"` → `401`, not `521`).
- [ ] **Step 1b:** Pre-push checks on the LIVE project (the product owner runs them in the SQL editor / dashboard):
  - a. `select relname, relowner::regrole, relforcerowsecurity from pg_class where relnamespace = 'private'::regnamespace and relkind = 'r';` → owner `postgres`, `relforcerowsecurity` false for `bookings`, `staff`, `push_subscriptions`; and `select rolbypassrls from pg_roles where rolname = 'postgres';` → `true`. (If not, `create_booking`/`post_push` would hit RLS and every online booking would fail.)
  - b. Dashboard → Data API → exposed schemas = `public, graphql_public` only, and pg_graphql does not reflect `private` (the branch grants `authenticated` usage on schema `private` + select/insert/update on `private.bookings`).
  - c. Optional, after the push: `supabase functions deploy notify-booking` so the push title shows the salon name.
- [ ] **Step 2:** `supabase db push --dry-run` — Expected: lists exactly the five `202611121000xx_*` migrations. (The product owner runs `supabase db push` from their own shell; it hangs when run non-interactively here.)
- [ ] **Step 3: Verify live** with the publishable key: `get_slots` with `p_salon_id: 'elegance'` returns slots for the next open day; the old 3-arg call returns an error; `admin_my_salon` as anon returns `42501`; in the SQL editor, `select count(*) from private.staff where salon_id = 'elegance'` equals the number of staff rows.
- [ ] **Step 4:** Note in `docs/notifications-setup.md` that subscriptions and notifications are per salon (one VAPID pair for the whole product). Commit.

The frontend from this branch must be deployed together with (or after) the migrations; no deployed frontend uses the RPCs today, so there is no window where a live site breaks.
