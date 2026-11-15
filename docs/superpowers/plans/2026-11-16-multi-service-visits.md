# Several Services in One Visit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client books 1–4 services in one visit, placed back to back from one start time, each part with its own staff member. If a part can't be placed she is told which one and decides whether to book the rest. The owner sees, confirms or cancels the visit as one, gets one push and sends one WhatsApp message.

**Architecture:** Each part stays its own row in `private.bookings`, linked by a new `visit_id`. Two new public RPCs (`get_visit_slots`, `create_visit`) place the parts in the order the client sends, which is the salon's service order. `get_visit_slots` reports the parts it can't place at each start time (`missing`). `create_visit` is all-or-nothing and reports the failing part (`detail = 'item:<n>'`). Owner RPCs work on the whole visit (`admin_set_booking_status`) or return the link (`admin_list_bookings.visit_id`). The frontend groups rows by `visitId`.

**Tech Stack:** Postgres/Supabase (plpgsql, pgTAP), Deno edge function shared code (Vitest), Vite + React 18 + TypeScript + Tailwind + React Query + react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-16-multi-service-visits-design.md` (the version from commit `dcf3749`, with unavailable parts)

## Global Constraints

- Never edit an already-pushed migration. New migrations: `supabase/migrations/20261118100000_visits.sql` (Task 1) and `20261118100100_visit_owner.sql` (Task 2). Both sort after the latest existing one, `20261117100000_spa_category.sql`.
- Verification uses the local stack only: `supabase db reset`, `supabase test db`, `supabase db lint --level warning`. Never `--linked` or `db push`.
- `bookings.visit_id uuid not null default gen_random_uuid()`, index on `(salon_id, visit_id)`.
- Maximum **4** services per visit. A 5th gives `too_many_services`. An empty, null or malformed list, or a duplicate service, gives `unknown_service`.
- Placement: start T on the 30-minute grid from opening. Part k starts at T plus the durations of parts 0..k-1. The whole visit ends by closing. T is in the future and the date is at most today + 13.
- Abuse limits count **distinct `visit_id`** among `source = 'online'` rows of the salon, in `create_visit` **and** `create_booking`. Per phone: ≥ 3 future non-cancelled visits → `too_many_bookings`. Per IP: ≥ 5 visits in 1 hour → `rate_limited`. Site-wide: ≥ 20 visits in 10 minutes → `rate_limited`.
- `get_slots` / `create_booking` stay (a visit of one). The new frontend calls only `get_visit_slots` / `create_visit`.
- One push per visit. Single bookings get the same message as before.
- Every new public function takes `p_salon_id`, is `security definer` with explicit salon scoping, has isolation tests in `10_isolation.test.sql` **and** is registered in `11_guard.test.sql`. Revoke specific private functions, never `all functions in schema private`.
- Every user-facing string goes through `t()` with keys in **both** `fr` and `ar`. Use logical CSS (`ms-/me-/ps-/pe-/text-start`). Icons are lucide-react only. Use palette tokens, no raw hex.
- Owner-side editing/moving (`admin_update_booking`) stays per part. The owner can't create a multi-part visit (non-goal).
- Demo: fake bookings stay visits of one. Demo phone masking in `admin_list_bookings` must survive the redefinition.
- Removing a part is always the client's explicit tap. The confirm step lists exactly what will be booked.

## Review Focus

1. **The same staff member for two consecutive parts** (e.g. Amina for Coupe then Coloration): the ranges touch (`[10:00,11:00)` and `[11:00,13:00)`). The exclusion constraint and `stylist_free` must not treat them as overlapping. Test: Task 1 `create_visit: same stylist back to back`.
2. **Today, with the morning already past:** past slots miss every part. That must not raise a false "not available this day" message. Test: Task 4 `missingAllDay ignores slots where everything is missing`.
3. **"Réserver les autres prestations" re-places the rest, and the kept time is no longer available:** the time must be cleared and Continuer disabled, never a silent booking at a different time. Test: Task 6 `bookOthers clears a time that is not available after re-placement`.
4. **`p_items` in an order different from the salon's** (an old or crafted client): the server places parts in the order given and indexes `missing` / `item:<n>` into that order. The plan the client saw is what gets booked. Test: Task 1 `get_visit_slots: placement and indexes follow p_items order`.
5. **The owner moved one part of a waiting visit to another day:** the badge and the waiting list must still count it as one visit, and confirming it from either card confirms every part. Test: Task 8 `pending badge counts a visit split across days once`.

---

### Task 1: Visits in the database: column, slots, create, limits, one push

**Files:**
- Create: `supabase/migrations/20261118100000_visits.sql`
- Create: `supabase/tests/database/20_visits.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (new assertions + `plan(N)`)
- Modify: `supabase/tests/database/11_guard.test.sql:35-41` (register `get_visit_slots`, `create_visit`)
- Modify: `CLAUDE.md` ("Salons": public functions list; "Booking flow": the SQL rules paragraph; "Booking notifications": one push per visit)

**Interfaces:**
- Consumes (existing, latest definitions): `private.day_hours(text, date)` and `private.stylist_works(text, date)` (`20261113100100_settings_rules.sql`), `private.stylist_free(text, timestamptz, timestamptz)`, `private.slot_start(date, time)`, `private.normalize_phone(text)`, `private.client_ip()`, `private.post_push(text, jsonb, text, uuid)` (`20261112100300_salon_push.sql`), `private.notify_new_booking()` (latest in `20261115100100_demo_reset.sql`), `public.create_booking` (latest in `20261113100100_settings_rules.sql`).
- Produces:
  - `private.bookings.visit_id uuid not null default gen_random_uuid()`; index `bookings_visit_idx on private.bookings (salon_id, visit_id)`.
  - `private.visit_items(p_salon_id text, p_items jsonb) returns table (idx integer, service_id text, stylist_id text, price integer, duration integer)`: validated parts in `p_items` order (`idx` is 0-based). Raises `unknown_service` / `too_many_services`.
  - `private.visit_candidates(p_salon_id text, p_service_id text, p_stylist_id text, p_date date) returns setof text`: the chosen stylist, or the offering stylists, who work that day (`stylist_works`), `order by st.sort_order, st.id`.
  - `public.get_visit_slots(p_salon_id text, p_date date, p_items jsonb) returns table (slot text, available boolean, missing integer[])`
  - `public.create_visit(p_salon_id text, p_items jsonb, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns table (booking_id uuid, service_id text, stylist_id text, starts_at timestamptz)`, rows in `p_items` order. On failure: `slot_taken` with `detail = 'item:<idx>'`.
  - Push payload (`kind = 'new_booking'`): the existing booking fields of the **first** part (`id`, `client_name`, `starts_at`, `service_name`, `stylist_name`, `salon_name`), plus `parts: [{ "service_name": {fr, ar}, "stylist_name": text, "starts_at": timestamptz }, …]` in visit order.
  - Transaction-local setting `app.visit_insert = 'on'` suppresses `bookings_notify_online` while `create_visit` inserts.

- [ ] **Step 1: Write the failing pgTAP file `20_visits.test.sql`**

Use the same `pg_temp.open_day(n)` helper as `03_create_booking.test.sql`. Add a helper that returns the message and detail of an error, because `throws_ok` can't see `detail`:

```sql
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' ' || nullif(v_detail, ''), '');
end $$;
```

Items literal shorthand used below: `C` = `{"service_id":"coupe-femme","stylist_id":"amina"}` (60 min, 2500), `K` = `{"service_id":"coloration","stylist_id":"amina"}` (120 min, 6000), `M` = `{"service_id":"manucure","stylist_id":null}` (45 min, Sara only).

Assertions (one line each, exact descriptions):

- schema
  - `has_column('private','bookings','visit_id', 'bookings.visit_id exists')`, plus `col_not_null` and `col_has_default`.
  - Two rows inserted without `visit_id` get distinct ids: `'each booking is its own visit by default'`.
  - `has_index('private','bookings','bookings_visit_idx', array['salon_id','visit_id'], 'visit index')`.
- `get_visit_slots` validation (all `throws_ok … 'P0001'`):
  - `'[]'` → `unknown_service` (`'empty list'`)
  - `'{}'` → `unknown_service` (`'not an array'`)
  - `null` → `unknown_service` (`'null list'`)
  - `'[{"stylist_id":"amina"}]'` → `unknown_service` (`'item without service'`)
  - `'[C, C]'` → `unknown_service` (`'duplicate service'`)
  - five items (`coupe-femme, coloration, soin-keratine, manucure, maquillage`, null stylists) → `too_many_services`
  - `'[{"service_id":"coupe-femme","stylist_id":"sara"}]'` → `unknown_service` (`'stylist not offering'`)
- `get_visit_slots` results, on `open_day()` with Amina booked 11:00–12:00 (direct insert):
  - `[C, K]` has 17 rows, `min(slot) = '09:00'`, `max(slot) = '17:00'` (the grid stops at closing minus the first part's duration).
  - `missing` at `'09:00'` = `'{1}'`, `'10:00'` = `'{1}'`, `'10:30'` = `'{0,1}'`, `'12:00'` = `'{}'` with `available` true, `'16:00'` = `'{1}'` (past closing).
  - `available` is true exactly where `missing = '{}'`.
  - Single item: `results_eq` between `select slot, available from get_visit_slots('elegance', d, '[C]')` and `select slot, available from get_slots('elegance', d, 'coupe-femme', 'amina')`, with description `'a visit of one has the same slots as get_slots'`.
  - Single item: every row has `missing` in (`'{}'`, `'{0}'`).
  - A day off for Sara on `open_day(2)` (insert into `stylist_days_off`): `[C, M]` gives `bool_and(1 = any(missing))` true and `bool_or(missing = '{1}')` true (`'a part impossible all day is missing at every slot'`).
  - **(Review Focus 4)** On `open_day(2)` with Sara off, `[M, C]` gives `missing = '{0}'` at `'09:00'`, and `'{0}'` is in every non-empty row (`'get_visit_slots: placement and indexes follow p_items order'`).
  - Yesterday, and today + 14: zero rows.
- `create_visit`
  - Happy path, `[C, M]` on `open_day(3)` at `'09:00'`, `'  Lina  '`, `'0555 11 22 33'`, `'fr'`: returns 2 rows in order. Assert `service_id` order `coupe-femme, manucure`, `stylist_id` order `amina, sara`, local times `09:00, 10:00`. The stored rows share one `visit_id`, are `pending` and `online`, prices `2500, 2000`, name trimmed, phone normalised.
  - **(Review Focus 1)** `create_visit: same stylist back to back`: `[C, K]` on `open_day(4)` at `'09:00'` lives, giving Amina 09:00–10:00 and 10:00–12:00.
  - Auto-assign per part: insert `stylist_services ('elegance','leila','coupe-femme')`, book Amina at 09:00 on `open_day(5)`. Then `[{"service_id":"coupe-femme","stylist_id":null}, M]` at `'09:00'` assigns `leila, sara`.
  - Validation: `'A'` → `invalid_name`; `'021 12 34 56'` → `invalid_phone`; `'09:15'` → `outside_hours`; `[C, K]` at `'15:30'` → `outside_hours` (ends 18:30); yesterday → `outside_hours`; `'[]'` → `unknown_service`; five items → `too_many_services`.
  - Atomic failure: book Sara at 10:00 on `open_day(6)`. Then `pg_temp.error_of($$ select * from public.create_visit('elegance', '[C, M]', …'09:00', 'Atomic', …) $$)` is `'slot_taken item:1'`, and `count(*) where client_name = 'Atomic'` is `0` (`'nothing inserted when one part is taken'`).
  - Limits count visits. Run `delete from private.bookings` before **each** limit block below (inside the test transaction), so earlier rows don't count:
    - per phone: insert 2 future online visits × 2 rows (explicit shared `visit_id`s) for `0770000009`. Then `create_booking(... '0770000009' …)` lives (`'create_booking counts visits, not rows'`). Then `create_visit(... '0770000009' …)` → `too_many_bookings`.
    - per phone: with 2 such visits, a 4-part `create_visit` lives (`'a 4-part visit counts once'`). (Use a fresh phone and another day.)
    - per IP (`request.headers` with `cf-connecting-ip` `203.0.113.77`): 4 cancelled online visits × 2 rows from that IP, then `create_visit` lives and the next `create_visit` → `rate_limited`.
    - site-wide: 19 cancelled online visits × 2 rows created now, then `create_visit` lives and the next → `rate_limited`.
  - One push per visit: create vault secrets `notify_booking_url` / `notify_booking_secret` (as in `08_push.test.sql`) and an elegance staff push subscription. Then:
    - `[C, M]` `create_visit` adds exactly **1** row to `net.http_request_queue` (`'one push per visit'`).
    - Last body `booking -> 'parts'` has length 2, `parts -> 0 -> 'service_name' ->> 'fr' = 'Coupe & Brushing'`, `parts -> 1 ->> 'stylist_name' = 'Sara'`, and `booking ->> 'id'` = the first part's id.
    - `create_booking` still adds exactly 1 (`'single booking push unchanged'`).
    - After `create_visit`, a direct online `insert` still queues a push (`'the suppression does not outlive create_visit'`).

Isolation (`10_isolation.test.sql`, after the existing `create_booking` checks; bump `plan`):
- `get_visit_slots('elegance', …, '[{"service_id":"rival-cut","stylist_id":null}]')` → `unknown_service`
- `get_visit_slots('elegance', …, '[{"service_id":"coupe-femme","stylist_id":"nadia"}]')` → `unknown_service`
- `create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":null},{"service_id":"rival-cut","stylist_id":null}]', …, 'Mixed', …)` → `unknown_service`, and no `'Mixed'` row
- `create_visit('elegance', '[{"service_id":"coupe-femme","stylist_id":"nadia"}]', …)` → `unknown_service`
- In the rival flood section: `create_visit('rival', …)` → `rate_limited`, and `create_visit('elegance', …)` lives (`'rival''s traffic does not rate-limit elegance visits'`).

Guard: append `'get_visit_slots', 'create_visit'` to `pg_temp.registered_api()`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `supabase db reset && supabase test db`
Expected: FAIL. `20_visits` fails on the missing column and functions, and `10_isolation` fails on the unknown functions.

- [ ] **Step 3: Write `20261118100000_visits.sql`**

In this order:
1. `alter table private.bookings add column visit_id uuid not null default gen_random_uuid();` (volatile default, so existing rows each get their own id). Then the index.
2. `private.visit_items`: `language plpgsql stable set search_path = ''`.
   - Not a JSON array, null, or empty → `unknown_service`.
   - More than 4 → `too_many_services`.
   - Any element not an object, `service_id` not a string, `stylist_id` neither string nor null, duplicate `service_id`, inactive service or one of another salon, or a chosen stylist who doesn't offer it or isn't active → `unknown_service`. Use the same `exists` shape as `create_booking`.
   - Returns rows ordered by `idx`.
3. `private.visit_candidates`: `language sql stable`. Lift the candidate query from `create_booking`'s loop.
4. `public.get_visit_slots`: `plpgsql stable security definer set search_path = ''`.
   - Validate first (errors even for out-of-window dates).
   - Out-of-window or closed day → no rows.
   - Loop `v_min` from `opens` to `closes - duration(idx 0)` by 30.
   - Part k occupies `[T + offset_k, + duration_k)`. It is missing if T ≤ now(), if its end is past closing, or if no candidate passes `private.stylist_free`.
   - `missing` is ascending (`'{}'::int[]` when none), `available := cardinality(missing) = 0`.
5. `public.create_booking`: copy the latest definition verbatim. Only change the three limit queries to `count(distinct b.visit_id)`.
6. `public.create_visit`: `plpgsql volatile security definer`, `#variable_conflict use_column`.
   - Validate name, phone and items (`visit_items`).
   - Time regex and `day_hours` as in `create_booking`. Off-grid, before opening, `v_min + total > closes`, start ≤ now() or date > today + 13 → `outside_hours`.
   - Run the three visit-counted limits.
   - `v_visit := gen_random_uuid()`. Save `current_setting('app.visit_insert', true)` and `set_config('app.visit_insert', 'on', true)`.
   - For each part in `idx` order, loop `visit_candidates` with an `insert … returning id` inside `begin … exception when exclusion_violation then end`. Insert `visit_id = v_visit`, `source` defaults to `online`, and set `client_ip` and `lang`.
   - If no candidate fits: `raise exception 'slot_taken' using errcode = 'P0001', detail = 'item:' || idx`. Raising rolls back every insert and the setting.
   - Restore the setting. Then, in its own `begin … exception when others then raise warning … end`, `perform private.post_push('new_booking', <payload>, p_salon_id)`.
   - `return query` the inserted rows ordered by `starts_at`.
7. `private.notify_new_booking()`: the latest body. Change only the early return to `if current_setting('app.demo_fake_bookings', true) = 'on' or current_setting('app.visit_insert', true) = 'on' then return new; end if;`.
8. Grants:
   - `revoke execute on function private.visit_items(text, jsonb), private.visit_candidates(text, text, text, date) from public, anon, authenticated;`
   - For `get_visit_slots(text, date, jsonb)` and `create_visit(text, jsonb, date, text, text, text, text)`: revoke from `public, anon, authenticated`, then grant to `anon, authenticated`.

- [ ] **Step 4: Run the tests and lint**

Run: `supabase db reset && supabase test db && supabase db lint --level warning`
Expected: all files PASS (01–20), and lint reports no new warnings.

- [ ] **Step 5: Update CLAUDE.md**

- "Salons": the public function list becomes `get_slots`, `create_booking`, `get_visit_slots`, `create_visit`.
- "Booking flow": add that the wizard books a **visit** (1–4 services back to back, rows linked by `private.bookings.visit_id`). Add that abuse limits count distinct visits, and that `get_visit_slots.missing` / `create_visit`'s `slot_taken` detail `item:<n>` name the failing part.
- "Booking notifications": `create_visit` suppresses the per-row trigger (`app.visit_insert`) and posts one push with `parts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261118100000_visits.sql supabase/tests/database/20_visits.test.sql supabase/tests/database/10_isolation.test.sql supabase/tests/database/11_guard.test.sql CLAUDE.md
git commit -m "feat(db): book several services as one visit (get_visit_slots, create_visit)"
```

---

### Task 2: The owner acts on the whole visit (status, list)

**Files:**
- Create: `supabase/migrations/20261118100100_visit_owner.sql`
- Create: `supabase/tests/database/21_visit_owner.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (shared-visit-id attack, bump `plan`)
- Modify: `CLAUDE.md` ("Staff admin": status acts on the visit; `admin_list_bookings` returns `visit_id`)

**Interfaces:**
- Consumes: `private.bookings.visit_id` (Task 1). `admin_list_bookings` latest in `20261115100050_demo_restrictions.sql`. `admin_set_booking_status` latest in `20261112100200_salon_staff_invoker.sql`.
- Produces:
  - `public.admin_list_bookings(p_from date, p_to date)` returns the same columns plus a trailing **`visit_id uuid`**.
  - `public.admin_set_booking_status(p_id uuid, p_status text) returns void` updates every row of `p_id`'s visit within `my_salon()`. An overlap gives `slot_taken` and nothing changes.

- [ ] **Step 1: Write the failing `21_visit_owner.test.sql`**

Staff user `1111…` on `elegance`, `act_as` helper as in `10_isolation`. Visit `V` = two pending online rows with the same explicit `visit_id`: Amina 2030-01-08 10:00–11:00 (`coupe-femme`) and Sara 11:00–11:45 (`manucure`). Assertions:
- `admin_list_bookings('2030-01-08','2030-01-08')` returns the same `visit_id` for both rows (`'list returns the visit link'`).
- Confirming the **second** row's id makes both rows `confirmed` (`'confirm applies to the whole visit'`).
- Cancelling the first makes both `cancelled`.
- Insert (as postgres) a confirmed staff booking for Amina at 10:00–11:00. Then confirming `V` → `slot_taken`, and both rows are still `cancelled` (`'a conflicting confirm changes no part'`).
- A visit of one behaves as before: `admin_set_booking_status` on a lone row changes only that row.
- Demo masking survives: make the caller's role `demo` (as in `16_demo.test.sql`, mark `elegance` demo). `client_phone` from `admin_list_bookings` is `'05•• •• •• 56'` for `0555123456`.

Isolation addition: insert a rival row and an elegance row with the **same** `visit_id` (as postgres). Elegance staff confirming the elegance row leaves the rival row `pending` (`'a shared visit id never reaches another salon'`).

- [ ] **Step 2: Run to verify it fails**

Run: `supabase db reset && supabase test db`
Expected: FAIL. `visit_id` is not a column of `admin_list_bookings`, and the status updates only one row.

- [ ] **Step 3: Write the migration**

- `drop function public.admin_list_bookings(date, date);` and recreate it from the `demo_restrictions` body, adding `b.visit_id` as the last select column and `visit_id uuid` to the return table.
- `admin_set_booking_status`: stays `security invoker`. Select the `visit_id` of `p_id` where `salon_id = v_salon` (none → `not_found`), then `update … where b.salon_id = v_salon and b.visit_id = v_visit`. Keep `exception when exclusion_violation then raise 'slot_taken'`.
- Revoke/grant execute for both, as `20261112100200_salon_staff_invoker.sql:178-183` does (to `authenticated` only).

- [ ] **Step 4: Run tests and lint**

Run: `supabase db reset && supabase test db && supabase db lint --level warning`
Expected: PASS, including `04_admin`, `06_booking_source`, `07_admin_write` and `16_demo`, which are unchanged.

- [ ] **Step 5: Update CLAUDE.md "Staff admin"** (confirm/cancel act on the whole visit; `admin_list_bookings` returns `visit_id`; editing stays per part).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261118100100_visit_owner.sql supabase/tests/database/21_visit_owner.test.sql supabase/tests/database/10_isolation.test.sql CLAUDE.md
git commit -m "feat(db): owner confirms or cancels a whole visit; list returns visit_id"
```

---

### Task 3: One push message for a visit

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Test: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Consumes: the payload's `parts` (Task 1).
- Produces: `BookingPayload.parts?: { service_name: Record<Lang, string>; stylist_name: string; starts_at: string }[]`. `buildPushMessage` keeps its signature.

- [ ] **Step 1: Write the failing tests** in `describe('buildPushMessage')`:

```ts
it('names every service of a visit, in order, with the first start time', () => {
  const visit = { ...booking, client_name: 'Lina', parts: [
    { service_name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف الشعر' }, stylist_name: 'Amina', starts_at: '2026-11-07T09:00:00+00:00' },
    { service_name: { fr: 'Coloration', ar: 'صبغة' }, stylist_name: 'Sara', starts_at: '2026-11-07T10:00:00+00:00' },
  ] };
  expect(buildPushMessage('new_booking', visit, 'fr').body).toBe('Lina · Samedi 7 novembre à 10:00\nCoupe & Brushing + Coloration · Amina, Sara');
  expect(buildPushMessage('new_booking', visit, 'ar').body).toContain('قص وتصفيف الشعر + صبغة');
  expect(buildPushMessage('new_booking', visit, 'fr').url).toBe('/admin?day=2026-11-07&booking=b1');
});
it('lists a staff member once when she does two parts', () => { /* both parts Amina → body ends with '· Amina' */ });
it('a one-part list reads exactly like a single booking', () => { /* parts of length 1 → toEqual the existing single-booking message */ });
```

- [ ] **Step 2: Run** `pnpm test supabase/functions/_shared/notify.test.ts`. Expected: FAIL (the body still names only `service_name`).

- [ ] **Step 3: Implement.** In `buildPushMessage`, when `booking.parts` has more than one entry, the second line is the services joined with `' + '`, then `' · '`, then the unique staff names joined with `', '` in order. Otherwise the message is unchanged.

- [ ] **Step 4: Run** `pnpm test supabase/functions/_shared/notify.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(push): one message per visit naming every service"` (notify.ts and its test).

---

### Task 4: Public data layer for visits

**Files:**
- Modify: `src/data/bookings.ts`
- Create: `src/data/visit.ts`
- Test: `src/data/bookings.test.tsx`, create `src/data/visit.test.ts`

**Interfaces:**
- Consumes: `get_visit_slots`, `create_visit` (Task 1). `Service` (`src/data/types.ts`).
- Produces (in `bookings.ts`):
  - `export interface VisitItem { serviceId: string; stylistId: string | null }`
  - `export interface VisitSlot extends Slot { missing: number[] }`
  - `fetchVisitSlots(date: Date, items: VisitItem[]): Promise<VisitSlot[]>` calls `get_visit_slots` with `{ p_salon_id, p_date: toYmd(date), p_items: [{ service_id, stylist_id }] }`.
  - `useVisitSlots(date: Date | null, items: VisitItem[])`: queryKey `['slots', 'visit', ymd, items]`, `enabled: date !== null && items.length > 0`, `staleTime: 0`. The `'slots'` prefix keeps the existing invalidations working.
  - `export interface CreateVisitInput { items: VisitItem[]; date: Date; time: string; clientName: string; clientPhone: string; lang: Lang }`
  - `export interface CreatedPart { bookingId: string; serviceId: string; stylistId: string; startsAt: Date }`
  - `createVisit(input): Promise<CreatedPart[]>` and `useCreateVisit()` (invalidates `['slots']` on settle).
  - `BookingErrorCode` gains `'too_many_services'` (also in `KNOWN_ERRORS`).
  - `failedItem(err: unknown): number | null` parses `details` matching `/^item:(\d+)$/`.
  - `useSlots`, `fetchSlots`, `useCreateBooking`, `createBooking` and `CreateBookingInput` stay until Task 5 removes them.
- Produces (in `visit.ts`):
  - `export const MAX_VISIT_SERVICES = 4`
  - `visitOrder<T extends Pick<Service, 'id' | 'sortOrder' | 'name'>>(services: T[]): T[]` sorts by `sortOrder`, then `name.fr` (`localeCompare(…, 'fr')`), then `id`.
  - `visitTotals(services: Pick<Service, 'price' | 'duration'>[]): { price: number; duration: number }`
  - `export interface PlannedPart { service: Service; time: string }` and `planVisit(services: Service[], start: string): PlannedPart[]` (`'HH:MM'` times back to back).
  - `export type SlotState = 'available' | 'partial' | 'full'` and `slotState(slot: VisitSlot, parts: number): SlotState`. It is `available` if `slot.available`, `full` if `missing.length === 0 || missing.length >= parts`, otherwise `partial`.
  - `missingAllDay(slots: VisitSlot[], parts: number): number[]` returns the indexes missing from **every** slot, but only when at least one slot misses fewer than `parts` parts. Otherwise it returns `[]`.
  - `joinNames(names: string[]): string` joins with `' + '`.

- [ ] **Step 1: Write the failing tests**

`visit.test.ts`:
- `visitOrder sorts by the salon's order, not the tick order`: `[manucure(3), coupe(0), coloration(1)]` → ids `['coupe-femme','coloration','manucure']`. Ties break on the French name.
- `planVisit places parts back to back`: Coupe (60) + Coloration (120) from `'10:00'` → times `['10:00','11:00']`. From `'09:30'` with 45 + 60 → `['09:30','10:15']`.
- `visitTotals sums price and duration`: 2500+6000 → `{ price: 8500, duration: 180 }`.
- `slotState`: `{available:true, missing:[]}` → `available`; `missing:[1]`, parts 2 → `partial`; `missing:[0,1]`, parts 2 → `full`; `missing:[0]`, parts 1 → `full`; `missing:[]`, `available:false` → `full`.
- **(Review Focus 2)** `missingAllDay ignores slots where everything is missing`: slots `[{09:00, missing:[0,1]}, {10:00, missing:[0,1]}, {14:00, missing:[1]}, {15:00, missing:[1]}]` → `[1]`. Every slot `missing:[0,1]` → `[]`. With one available slot → `[]`. Parts 1 with every slot `missing:[0]` → `[]`.

`bookings.test.tsx`:
- `useVisitSlots calls get_visit_slots with the items`: asserts `rpc` called with `('get_visit_slots', { p_salon_id: 'elegance', p_date: '2030-01-08', p_items: [{ service_id: 'coupe-femme', stylist_id: 'amina' }, { service_id: 'coloration', stylist_id: null }] })`, and the data keeps `missing`.
- `useVisitSlots does not fetch without items`.
- `useCreateVisit returns each part`: rpc data `[{ booking_id: 'b1', service_id: 'coupe-femme', stylist_id: 'amina', starts_at: '2030-01-08T09:00:00+00:00' }, …]` → `[{ bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date('2030-01-08T09:00:00Z') }, …]`. Params are `p_salon_id, p_items, p_date, p_time, p_client_name, p_client_phone, p_lang`.
- `failedItem reads the part from the error detail`: `{ message: 'slot_taken', details: 'item:1' }` → `1`; `{ message: 'slot_taken' }` → `null`; `{ details: 'nope' }` → `null`.
- `toBookingError knows too_many_services`.

- [ ] **Step 2: Run** `pnpm test src/data/visit.test.ts src/data/bookings.test.tsx`. Expected: FAIL (module and exports missing).

- [ ] **Step 3: Implement** the two files per the Interfaces above.

- [ ] **Step 4: Run** the same command, then `npx tsc -b`. Expected: PASS, and no type errors.

- [ ] **Step 5: Commit** `git commit -m "feat(data): visit slots, create_visit and visit helpers"`.

---

### Task 5: The wizard books a visit (selection, staff per part, plan, summary)

**Files:**
- Modify: `src/components/Booking.tsx`
- Create: `src/components/booking/VisitStylists.tsx` (one row per part: service name + offering staff chips + "Sans préférence")
- Create: `src/components/booking/VisitParts.tsx` (a list of parts: time · service · staff, plus a total row; used by the plan, the confirm step and the success screen)
- Modify: `src/data/bookings.ts` (remove `useSlots`, `fetchSlots`, `useCreateBooking`, `createBooking`, `CreateBookingInput`, `CreatedBooking` and their tests)
- Modify: `src/context/LanguageContext.tsx` (new keys, fr + ar)
- Test: `src/components/Booking.test.tsx`

**Interfaces:**
- Consumes: Task 4's `useVisitSlots`, `useCreateVisit`, `VisitItem`, `CreatedPart`, `visitOrder`, `visitTotals`, `planVisit`, `MAX_VISIT_SERVICES`, `joinNames`.
- Produces:
  - Wizard state: `selectedIds: string[]`, `stylistFor: Record<string, string | null>`, `assigned: CreatedPart[] | null`.
  - Derived: `visit = visitOrder(services.filter(s => selectedIds.includes(s.id)))` and `items: VisitItem[]` (in visit order, which Task 6 indexes `missing` against).
  - `VisitStylists` props: `{ visit: Service[]; stylists: Stylist[]; value: Record<string, string | null>; onChange(serviceId: string, stylistId: string | null): void }`.
  - `VisitParts` props: `{ parts: { time: string; service: Service; stylistName: string }[]; total?: number }`.

New translation keys (fr / ar):

| key | fr | ar |
|---|---|---|
| `booking.selectServiceHint` | Vous pouvez en choisir plusieurs : elles s’enchaînent. | يمكنكِ اختيار عدة خدمات: تتمّ الواحدة تلو الأخرى. |
| `booking.visit.count.one` / `.other` | 1 prestation / {n} prestations | ar: `.one` خدمة واحدة, `.two` خدمتان, `.few` {n} خدمات, `.many` {n} خدمة, `.other` {n} خدمة |
| `booking.visit.max` | 4 prestations maximum par rendez-vous | أربع خدمات كحد أقصى في الموعد الواحد |
| `booking.visit.anyStylist` | sans préférence | بدون تفضيل |
| `booking.visit.plan` | Déroulé | ترتيب الخدمات |
| `booking.summary.services` | Prestations | الخدمات |
| `booking.summary.total` | Total | المجموع |

- [ ] **Step 1: Update the test mocks and write the failing tests**

Mock `useVisitSlots` (returns `[{ slot: '10:00', available: true, missing: [] }]`) and `useCreateVisit` instead of the old hooks. Add `coloration` (`sortOrder: 1`, 6000, 120 min) and `manucure` (`sortOrder: 3`, 2000, 45) to a `threeServices` list, and stylists `amina` (`serviceIds: ['coupe-femme','coloration']`) and `sara` (`['manucure']`). Existing tests that use one service keep passing unchanged, except two:
- `sends the trimmed name and the phone as typed` now asserts `mutate.mock.calls[0][0]` `toMatchObject({ items: [{ serviceId: 'coupe-femme', stylistId: null }], time: '10:00', clientName: 'Yasmine', clientPhone: '0555 12 34 56', lang: 'fr' })`.
- The success mock calls `onSuccess([{ bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date() }])`.

New tests (`describe('Booking several services')`):
- `ticks several services and sums them in the summary bar`: click Coloration, then Coupe & Brushing. Both buttons have `aria-pressed="true"`, and the text `'2 prestations · 8 500 DA · 180 min'` is visible. There is exactly one `Continuer` button.
- `un-ticking a service removes it`: tick, then tick again. `aria-pressed="false"`, and Continuer is disabled with nothing ticked.
- `stops at 4 services`: with 5 services in the list, after 4 ticks the 5th has `aria-disabled="true"` and is not added, and `'4 prestations maximum par rendez-vous'` is shown.
- `one row per service, in the salon's order, on the staff step`: tick Manucure then Coupe and continue. The rows' headings read `['Coupe & Brushing', 'Manucure & Vernis']`. The Coupe row offers `Amina` and `Sans préférence` but not `Sara`.
- `a single service keeps today's staff grid`: with one service ticked, no row headings are shown and the existing grid is.
- `the recap names every service`: on the staff step, `'Coupe & Brushing + Coloration & Balayage · 8 500 DA · 180 min'`.
- `sends the items in visit order with each chosen staff member`: tick Manucure, then Coupe, choose Amina for Coupe, pick 10:00 and confirm. `items` equals `[{ serviceId: 'coupe-femme', stylistId: 'amina' }, { serviceId: 'manucure', stylistId: null }]`.
- `shows the plan after a time is chosen`: Coupe (Amina) + Manucure (no preference) at 10:00. The `Déroulé` region reads `10:00 Coupe & Brushing · Amina` and then `11:00 Manucure & Vernis · sans préférence`.
- `the confirm step and success screen list each part and the total`: the confirm step shows both parts and `Total` `4 500 DA`. After `onSuccess` with Sara assigned to Manucure, the success screen shows `Manucure & Vernis · Sara`.
- `a tile tap selects that one service and opens the staff step` (existing intent test). The new assertion: going back to the service step shows it ticked, and another can be added.

- [ ] **Step 2: Run** `pnpm test src/components/Booking.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Step 0: service buttons become toggles (`aria-pressed`). At 4, unselected ones get `aria-disabled="true"` and a no-op click. Show the hint line.
  - On step 0 the navigation bar is `sticky bottom-0` (with the card's background) and shows `countText(t, lang, 'booking.visit.count', n) · formatPrice · formatDuration` when `n > 0`. There is still a single Continuer button.
  - Step 1: `visit.length === 1` keeps the existing grid (writing `stylistFor[visit[0].id]`). Otherwise render `VisitStylists`.
  - Step 2: `useVisitSlots(selectedDate, items)`. For now, a chip that isn't `available` is disabled. When `visit.length > 1` and a time is chosen, show `VisitParts` from `planVisit` in a region labelled `booking.visit.plan`.
  - Step 3 and success: one part keeps today's rows. Several parts use `VisitParts` plus date and total. On success, staff names come from `assigned` (matched by `serviceId`).
  - The recap uses `joinNames(visit.map(s => s.name[lang]))` and the totals.
  - Changing services or a staff choice clears `selectedTime`.
  - The tile intent (`useBookingIntent`) sets `selectedIds = [id]` and keeps today's restart/focus behaviour.
  - `errorMessages` gains `too_many_services: t('booking.error.generic')`.
  - Remove the old hooks from `bookings.ts` and their tests.

- [ ] **Step 4: Run** `pnpm test && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(booking): choose several services, a staff member for each, one start time"`.

---

### Task 6: The wizard explains unavailable parts and books the rest on request

**Files:**
- Modify: `src/components/Booking.tsx`
- Create: `src/components/booking/MissingParts.tsx` (the day-level messages, and the "at this time" notice with its two buttons)
- Modify: `src/components/TimeSlotChip.tsx` (add `state: 'partial'`), `src/index.css` (`.chip-partial`: `chip` + amber tokens, dashed border, not struck through)
- Modify: `src/context/LanguageContext.tsx`
- Modify: `CLAUDE.md` ("Booking flow": the wizard part)
- Test: `src/components/Booking.test.tsx`

**Interfaces:**
- Consumes: `slotState`, `missingAllDay` (Task 4), `failedItem` (Task 4), `items`/`visit` (Task 5).
- Produces:
  - `MissingParts` exports `DayMissing({ parts: { service: Service; stylistName: string | null }[]; onRemove(index: number): void; onChangeStylist(): void })` and `TimeMissing({ names: string[]; time: string; kind: 'unavailable' | 'taken'; onBookOthers(): void; onOtherTime(): void })`.
  - Wizard handlers: `removeParts(indexes: number[])` (removes `visit[i]` from `selectedIds` and `stylistFor`), `bookOthers(time: string, indexes: number[])` (`removeParts`, keeps `time`, clears the notice, goes to step 2), state `partial: { time: string; missing: number[] } | null` and `race: number | null`.
  - An effect clears `selectedTime` when the current `useVisitSlots` data has it but not as `available`.

New translation keys:

| key | fr | ar |
|---|---|---|
| `booking.visit.without` | sans {services} | بدون {services} |
| `booking.visit.missingDay` | {service} n’est pas disponible ce jour-là | {service} غير متاحة في هذا اليوم |
| `booking.visit.missingDayWith` | {service} n’est pas disponible avec {stylist} ce jour-là | {service} غير متاحة مع {stylist} في هذا اليوم |
| `booking.visit.remove` | Retirer cette prestation | إزالة هذه الخدمة |
| `booking.visit.changeStylist` | Changer de coiffeuse | تغيير الخبيرة |
| `booking.visit.missingAt` | {services} n’est pas disponible à {time} | {services} غير متاحة على الساعة {time} |
| `booking.visit.missingAtMany` | {services} ne sont pas disponibles à {time} | {services} غير متاحة على الساعة {time} |
| `booking.visit.bookOthers` | Réserver les autres prestations | حجز الخدمات الأخرى |
| `booking.visit.otherTime` | Choisir une autre heure | اختيار وقت آخر |
| `booking.visit.justTaken` | {service} vient d’être réservée à cette heure | تمّ حجز {service} للتوّ في هذا الوقت |

- [ ] **Step 1: Write the failing tests** (`describe('Booking unavailable parts')`). Make `useVisitSlots` read a mutable `visitSlots` the test sets per items (key it on `items.length` for simplicity).
- `a part missing all day gets a message with Retirer and Changer de coiffeuse`: Coupe (Amina chosen) + Manucure, slots `[{09:00,false,[0,1]}, {10:00,false,[1]}, {11:00,false,[1]}]`. Then `'Manucure & Vernis n’est pas disponible ce jour-là'` is shown with only `Retirer cette prestation` (no staff chosen for it).
  - With Amina chosen for a missing Coupe: the text is `'… avec Amina ce jour-là'` and `Changer de coiffeuse` returns to the staff step with its heading focused.
- `Retirer removes the part and re-fetches for the rest`: after the click, the recap names only Coupe, and the next `useVisitSlots` call has 1 item.
- `a time with some parts missing is a third state, not full`: `{10:00,false,[1]}` renders a chip whose accessible name contains `10:00` and `sans Manucure & Vernis`, with class `chip-partial`, enabled. `{11:00,false,[0,1]}` stays disabled (`chip-disabled`).
- `tapping it explains and offers both choices`: the notice reads `'Manucure & Vernis n’est pas disponible à 10:00'` with the two buttons. Continuer stays disabled. `Choisir une autre heure` closes the notice and selects nothing.
- `Réserver les autres prestations keeps the time when it is still free`: the next slots (1 item) are `{10:00,true,[]}`. After the click the recap names only Coupe, `10:00` is `selected`, and Continuer is enabled.
- **(Review Focus 3)** `bookOthers clears a time that is not available after re-placement`: the next slots are `{10:00,false,[0]}`. No time is selected and Continuer is disabled.
- `a confirm race names the part and offers the same choice`: `mutate` calls `onError({ message: 'slot_taken', details: 'item:1' })` on a 2-part visit. The alert reads `'Manucure & Vernis vient d’être réservée à cette heure'`. `Réserver les autres prestations` lands on the time step with 1 item. `Choisir une autre heure` lands on the time step with no time.
- `a single service still behaves as today on slot_taken` (keep the existing `slot_taken returns to the time step with a notice`, now with `details: 'item:0'`).
- `in Arabic the notices are Arabic and use logical alignment`: toggle to AR. The partial chip reads `بدون`, and the day message reads `غير متاحة في هذا اليوم`.

- [ ] **Step 2: Run** `pnpm test src/components/Booking.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Chips use `slotState(slot, items.length)`. A partial chip shows the time and, in a second small line, `t('booking.visit.without')` with `joinNames` of the missing services. Tapping it sets `partial`.
  - Above the chips, `DayMissing` lists `missingAllDay(slots, items.length)`.
  - On step 3, `slot_taken`: if `items.length > 1` and `failedItem(err) !== null`, set `race` and show `TimeMissing kind="taken"`. Otherwise keep today's path.
  - The re-validation effect clears `selectedTime` only from fetched data (`slotsQuery.data` for the current key, not while it is `undefined`).
  - `removeParts` never runs without a click.

- [ ] **Step 4: Run** `pnpm test && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Update CLAUDE.md "Booking flow"**: 4-step wizard over a visit of 1–4 services. Slots come from `get_visit_slots`, the missing-part messages ("sans X", day message, confirm race) and the client-only removal of parts.

- [ ] **Step 6: Commit** `git commit -m "feat(booking): say which service is unavailable and book the rest on request"`.

---

### Task 7: The owner's sheet shows the visit and confirms it as one

**Files:**
- Modify: `src/data/admin.ts`, `src/data/admin.test.tsx`
- Modify: `src/components/admin/fixtures.ts` (`visitId` defaults to the booking's `id`)
- Modify: `src/data/whatsapp.test.ts` (visit message)
- Modify: `src/components/admin/useBookingActions.ts`, `BookingSheet.tsx`, `BookingSummary.tsx`
- Modify: `src/components/Schedule.tsx` (pass the visit to `BookingSheet`), `src/components/admin/PendingSheet.tsx` (minimal adaptation to the new `useBookingActions`)
- Modify: `src/context/LanguageContext.tsx`
- Test: `src/components/admin/BookingSheet.test.tsx`

**Interfaces:**
- Consumes: `admin_list_bookings.visit_id` and visit-wide `admin_set_booking_status` (Task 2).
- Produces (in `admin.ts`):
  - `AdminBooking.visitId: string` (mapped from `visit_id`).
  - `export interface AdminVisit { id: string; parts: AdminBooking[]; first: AdminBooking; price: number; serviceName: Record<Lang, string> }`. `parts` is sorted by `startsAt`, `price` is the sum, and `serviceName` holds each language's names joined with `' + '`.
  - `groupVisits(bookings: AdminBooking[]): AdminVisit[]`: one per `visitId`, ordered by `first.startsAt`.
  - `visitOf(booking: AdminBooking, pool: AdminBooking[]): AdminVisit`: the booking's visit from `pool` (by `visitId`, de-duplicated by `id`, always including `booking`).
- `useBookingActions(onDone?: (visit: AdminVisit, status: 'confirmed' | 'cancelled') => void)`:
  - `confirm(v: AdminVisit)` and `refuse(v: AdminVisit)` call `setStatus` with `{ id: v.first.id, status }`.
  - `pendingId` and `errorId` are **visit ids**.
  - `notice.booking` is `{ ...v.first, serviceName: v.serviceName }`, so `clientMessage` names every service with the first start time.
- `BookingSheet` gets a new optional prop `visit?: AdminVisit` (default `visitOf(booking, [booking])`). `BookingSummary` gets a new prop `visit: AdminVisit`.

New keys: `admin.summary.visit` (fr `Toute la visite`, ar `كامل الزيارة`), `admin.summary.total` (`Total` / `المجموع`).

- [ ] **Step 1: Write the failing tests**
  - `admin.test.tsx`:
    - `maps visit_id`.
    - `groupVisits joins the parts of a visit`: two rows `visitId 'v1'` (10:00 Coupe 2500, 11:00 Coloration 6000) and one `'v2'` → 2 visits. `v1.price === 8500`, `v1.serviceName.fr === 'Coupe & Brushing + Coloration'`, and `v1.first` is the 10:00 row.
    - `visitOf finds the other parts in the pool and always keeps the booking`.
  - `whatsapp.test.ts`: `names every service of a visit`. `clientMessage('confirmed', { …booking, serviceName: { fr: 'Coupe & Brushing + Coloration', ar: '…' }, lang: 'fr' })` contains `'(Coupe & Brushing + Coloration)'` and `'à 10:00'`.
  - `BookingSheet.test.tsx`:
    - `a part of a visit shows the whole visit`: a `visit` prop with 2 parts. The `Toute la visite` list shows `10:00 Coupe & Brushing · Amina` and `11:00 Coloration · Sara`, `Total` `8 500 DA`, and the opened part has `aria-current="true"`.
    - `confirming a visit confirms it once and the message names every service`: `setStatus` called once with `{ id: <first part id>, status: 'confirmed' }`. The WhatsApp text contains `Coupe & Brushing + Coloration` and the first start time.
    - `a visit of one looks as before`: no `Toute la visite` list.
    - Existing tests stay green.

- [ ] **Step 2: Run** `pnpm test src/data src/components/admin/BookingSheet.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** So the build stays green before Task 8, `PendingSheet` adapts minimally: it calls `actions.confirm(visitOf(b, [b]))` / `actions.refuse(visitOf(b, [b]))` and maps `onDone(visit, kind)` to `onAnswered({ booking: visit.first, kind })`. Task 8 replaces this. `Schedule` passes `visit={visitOf(latest(b), [...(weekQuery.data ?? []), ...(pendingQuery.data ?? [])])}`. `BookingSummary` renders the parts list and total only when `visit.parts.length > 1`, and calls `onConfirm`/`onRefuse`/`onCancel` with the visit. `busy` is `actions.pendingId === visit.id`.

- [ ] **Step 4: Run** `pnpm test && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(admin): the booking sheet shows and confirms the whole visit"`.

---

### Task 8: Waiting list and badge count visits; agenda marks visit parts

**Files:**
- Modify: `src/components/admin/PendingSheet.tsx`, `src/components/Schedule.tsx`, `src/components/admin/DayColumns.tsx`
- Modify: `src/context/LanguageContext.tsx`
- Modify: `CLAUDE.md` ("Staff admin": the waiting list and badge count visits)
- Test: `src/components/admin/PendingSheet.test.tsx`, `src/components/Schedule.test.tsx`, `src/components/admin/DayColumns.test.tsx`

**Interfaces:**
- Consumes: `AdminVisit`, `groupVisits`, `useBookingActions` (Task 7).
- Produces:
  - `PendingSheet` props: `visits: AdminVisit[]` (replaces `bookings`), `answered: Answered[]` with `export type Answered = { visit: AdminVisit; kind: 'confirmed' | 'cancelled' }`, `onOpen(booking: AdminBooking)` (called with `visit.first`), `onClose()`.
  - `Schedule`: `waitingVisits = groupVisits(future pending rows)`. The badge shows `waitingVisits.length`.
  - `DayColumns`: a block whose `visitId` is shared by other rows in `bookings` shows a lucide `Link2` icon and the sr-only text `schedule.visitPart`.

New key: `schedule.visitPart` (fr `Partie {i} sur {n} d’une visite`, ar `الجزء {i} من {n} من الزيارة`).

- [ ] **Step 1: Write the failing tests**
  - `PendingSheet.test.tsx`: the harness now passes `visits={groupVisits(bookings)}`. Existing tests keep their assertions.
    - `one card per visit, listing its parts and the total`: 2 rows of `v1` give 1 card showing both service names, both staff and `8 500 DA`, with exactly one `Confirmer`.
    - `confirming a visit card turns the whole visit green`: `setStatus` called once, and one green row.
  - `Schedule.test.tsx`:
    - `pending badge counts visits, not rows`: 2 pending rows of one visit + 1 lone → button `'2 en attente'`.
    - **(Review Focus 5)** `pending badge counts a visit split across days once`: the two parts of `v1` on 2030-01-10 and 2030-01-12 → `'1 en attente'`. Opening the card and confirming calls `setStatus` once.
  - `DayColumns.test.tsx`: `marks the parts of a visit`: two rows sharing `visitId` show `Partie 1 sur 2 d’une visite` and `Partie 2 sur 2 d’une visite`. A lone booking shows no marker.

- [ ] **Step 2: Run** `pnpm test src/components`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - The card shows the first start, date and "ago" line as today. For more than one part, it lists `time · service · staff` per part, then `formatDuration(total) · formatPrice(visit.price)`. For one part, the line stays as today.
  - `done` and keys use `visit.id`. Sorting stays oldest request first (`first.createdAt`).
  - The `messageLink` notice uses `{ ...visit.first, serviceName: visit.serviceName }`.

- [ ] **Step 4: Run** `pnpm test && npx tsc -b && pnpm build`. Expected: PASS, and the build succeeds.

- [ ] **Step 5: Update CLAUDE.md "Staff admin"** (the waiting list and pending badge count visits, with one card per visit).

- [ ] **Step 6: Commit** `git commit -m "feat(admin): waiting list and badge count visits; agenda marks visit parts"`.

---

## Self-review notes (decisions the spec left open)

- **Server order:** the spec says `p_items` arrives "already in visit order". The server does **not** re-sort, so `missing` and `item:<n>` index straight into `p_items`, and the booked times are exactly the plan the client saw. The client sorts with `visitOrder`.
- **Grid end:** the start grid runs to `closes - duration(first part)`. A visit of one then gets exactly `get_slots`' rows (tested), and later parts that would end past closing show as missing ("sans X").
- **Past start times** report every part as missing, so they render "full" and never trigger the day-level message.
- **Duplicates in `p_items`** are rejected as `unknown_service`. The UI can't produce them.
- **Duration display:** the spec's example "3 h" isn't what the existing `formatDuration` (`src/data/formatters.ts:15`) produces, which is `180 min`. The plan uses the existing helper for consistency.
- **Tile tap** keeps today's landing on the staff step with that one service ticked. More are added from the recap's "Changer" (the spec's "pre-selects that one service, more can be added").
