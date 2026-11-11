# Part 2 — Owner Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each salon owner manage her own services, prices, stylists (services, working days, days off), weekly hours, closed dates and salon info from a **Réglages** page in `/admin`, with every booking rule (online and owner) reading those settings from her salon's data instead of hard-coded constants.

**Architecture:** New per-salon settings tables (hours, closed dates, stylist workdays, stylist days off) plus salon-info columns on `salons` and an `active` flag on services/stylists, all under the Part 1 isolation rules. Writes go through staff-only `security definer` RPCs scoped by `private.my_salon()` (no write policies on the tables, so the REST API can't bypass validation). Two SQL helpers (`private.day_hours`, `private.stylist_works`) become the single source of truth for get_slots / create_booking / staff_slot; the frontend mirrors them in `src/data/hours.ts` for display only. The Réglages UI is a set of nested `/admin/settings/*` routes opened from a gear icon in the admin header.

**Tech Stack:** Supabase Postgres (migrations, pgTAP), React 18 + TypeScript + React Query + react-router, Vitest + Testing Library, Tailwind (project design tokens).

**Spec:** `docs/superpowers/specs/2026-11-11-multi-salon-design.md` — section "Part 2 — Owner settings" (and the Part 1 rules it must keep). Read both before starting. `CLAUDE.md` § "Salons" lists the isolation rules every new table/function must follow.

## Global Constraints

- Never edit a pushed migration (everything up to `20261112100400_salon_finalize.sql` is live). New migrations only.
- **Isolation (Part 1):** every new table has `salon_id text not null` + FK to `public.salons`, no default, RLS on. Every new function callable by `anon`/`authenticated` gets isolation tests in `supabase/tests/database/10_isolation.test.sql` **and** its name in the registered list of `11_guard.test.sql`. Owner functions never take a salon id from the caller; they use `private.my_salon()` and treat another salon's ids exactly like nonexistent ids. Do **not** end migrations with `revoke execute on all functions in schema private …` (strips needed grants) — revoke specific functions.
- Error codes are plain messages with `errcode = 'P0001'`. Existing: `not_authorized`, `not_found`, `unknown_service`, `outside_hours`, `slot_taken`, `invalid_name`, `invalid_phone`. New in this part: `invalid_price`, `invalid_duration`, `invalid_hours`, `invalid_dates`, `invalid_url`, `invalid_weekday`.
- Weekdays are ISO (`1` = Monday … `7` = Sunday) in SQL and in TypeScript types; convert from JS `getDay()` with `((d.getDay() + 6) % 7) + 1`.
- Times are minutes since midnight in TS and `time` in SQL; all hours and service durations are multiples of 15.
- Online booking keeps: 30-minute grid **starting from that day's opening time**, 14-day window, future times only, per-salon abuse limits. Owner side keeps: 15-minute steps, past dates allowed, no window, any stylist can do any service.
- **No setting change cancels or moves a booking.** Removing a service or stylist only sets `active = false`.
- Settings changes must reach the public site within about a minute: every settings query uses `staleTime: 30_000` (the app default is 5 minutes).
- Every UI string through `t()` with both `fr` and `ar` keys; logical CSS properties (`ms-/me-/ps-/pe-/text-start`); lucide-react icons only; design-system classes from `src/index.css` (`card`, `input`, `label`, `btn-*`); the owner uses `/admin` on her phone — every screen must work at 360 px width.
- Section names (FR, exact): **Prestations & prix**, **Coiffeuses**, **Horaires**, **Jours fermés**, **Infos du salon**, group **Compte** with **Notifications** and **Se déconnecter**; page title **Réglages**. Stylist-off warning (FR, exact): `{name} ne travaille pas ce jour-là`.
- Run DB tests with `supabase db reset && supabase test db`; lint with `supabase db lint --level warning --fail-on warning`; frontend with `pnpm test && npx tsc -b`. CI (`.github/workflows/ci.yml`) runs all of these.

## Review Focus

1. **A setting change leaves future bookings outside the new rules** (Thursday shortened, date closed, stylist made inactive or given a day off) → the bookings stay untouched, the owner sees them listed, and each opens in the booking sheet. (Tasks 3, 4, 10.)
2. **Editing an old booking after its service's price/duration changed** → price and duration stay as stored unless the service itself is changed. (Task 3.)
3. **A salon opening at a quarter hour (e.g. 09:15)** → online slots 09:15, 09:45 … and `create_booking` accepts exactly those. (Task 2.)
4. **Staff of salon A calling any new settings RPC with salon B's ids** → `not_found` / `unknown_service`, B unchanged. (Tasks 4, 5.)
5. **A day that is closed by date but open by weekday (Eid on a Tuesday)** → no online slots, owner can't add bookings that day, week strip shows it closed, footer is unaffected. (Tasks 2, 6, 8.)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261113100000_settings_schema.sql` | settings tables, salon-info columns, `active` flags, read policies, backfill for existing salons/stylists |
| `supabase/migrations/20261113100100_settings_rules.sql` | `private.day_hours`, `private.stylist_works`, rewritten `get_slots` / `create_booking` / `staff_slot` / `admin_create_booking` |
| `supabase/migrations/20261113100200_booking_edit_keeps.sql` | `admin_update_booking` keeps price/duration and skips checks when unchanged |
| `supabase/migrations/20261113100300_settings_catalog_rpcs.sql` | service + stylist + days-off RPCs |
| `supabase/migrations/20261113100400_settings_salon_rpcs.sql` | hours, closed dates, salon info RPCs, `admin_affected_bookings` |
| `supabase/tests/database/12_settings_schema.test.sql`, `13_settings_rules.test.sql`, `14_settings_rpcs.test.sql` | behaviour tests; isolation cases go in `10_isolation`, names in `11_guard` |
| `supabase/seed.sql` | local seed: workdays for seeded stylists |
| `src/data/types.ts` | `Weekday`, `SalonHours`, `ClosedDates`, `SalonInfo`, `active`/`workdays` on `Service`/`Stylist` |
| `src/data/salonSettings.ts` (new) | fetch + hooks for salon info, hours, closed dates, admin lists; settings mutations |
| `src/data/hours.ts` | replaces the constants with pure rule helpers mirroring SQL |
| `src/data/week.ts` | occupancy / staff time options take a day's hours |
| `src/components/Footer.tsx`, `Navbar.tsx`, `Booking.tsx` | public site reads hours, city, address, WhatsApp, socials |
| `src/components/Schedule.tsx`, `admin/WeekStrip.tsx`, `admin/DayColumns.tsx`, `admin/BookingSheet.tsx`, `pages/AdminPage.tsx` | agenda uses data hours; gear icon |
| `src/pages/SettingsPage.tsx` (new) + `src/components/settings/*.tsx` (new) | Réglages list + one screen per section + `AffectedBookings` |
| `src/App.tsx` | `/admin/settings/*` routes |
| `src/context/LanguageContext.tsx` | new `settings.*` keys (fr + ar) |

---

### Task 1: Settings schema

**Files:**
- Create: `supabase/migrations/20261113100000_settings_schema.sql`, `supabase/tests/database/12_settings_schema.test.sql`
- Modify: `supabase/seed.sql`, `supabase/tests/database/11_guard.test.sql` (only if a probe needs adjusting — new tables must pass the existing checks unchanged)

**Interfaces:**
- Produces:
  - `public.salon_hours (salon_id text not null references public.salons, weekday smallint not null check (weekday between 1 and 7), opens time, closes time, primary key (salon_id, weekday), check ((opens is null and closes is null) or (opens < closes and extract(minute from opens)::int % 15 = 0 and extract(minute from closes)::int % 15 = 0)))`. Null `opens` = closed that weekday.
  - `public.salon_closed_dates (id uuid primary key default gen_random_uuid(), salon_id text not null references public.salons, starts_on date not null, ends_on date not null, label text check (length(label) <= 60), check (ends_on >= starts_on))`.
  - `public.stylist_workdays (salon_id text not null, stylist_id text not null, weekday smallint not null check (weekday between 1 and 7), primary key (stylist_id, weekday), foreign key (salon_id, stylist_id) references public.stylists (salon_id, id) on delete cascade)` plus `salon_id references public.salons`.
  - `public.stylist_days_off (id uuid primary key default gen_random_uuid(), salon_id text not null references public.salons, stylist_id text not null, starts_on date not null, ends_on date not null, check (ends_on >= starts_on), foreign key (salon_id, stylist_id) references public.stylists (salon_id, id) on delete cascade)`.
  - `public.salons` gains `address jsonb not null default '{"fr":"","ar":""}'`, `city jsonb not null default '{"fr":"","ar":""}'`, `whatsapp text check (whatsapp ~ '^0[5-7][0-9]{8}$')`, `instagram_url text`, `facebook_url text` (both `check (… ~ '^https://')` when not null).
  - `public.services.active boolean not null default true`, `public.stylists.active boolean not null default true`.
  - RLS on all four new tables. Read policies `to anon, authenticated using (true)` on `salon_hours`, `salon_closed_dates`, `stylist_workdays`; on `stylist_days_off` only `to authenticated using (salon_id = (select private.my_salon()))`. **No insert/update/delete policies** on any of them (writes only through Task 4/5 RPCs). `grant select` accordingly.
  - Backfill in the migration, for every existing salon: hours isodow 2–6 → 09:00–18:00, 1 and 7 → closed; every existing stylist works isodow 2–6. For `'elegance'`: `address = {"fr":"12 Rue Didouche Mourad\nAlger Centre 16000\nAlgérie","ar":"12 شارع ديدوش مراد\nالجزائر الوسطى 16000\nالجزائر"}`, `city = {"fr":"Alger","ar":"الجزائر"}`, `whatsapp = '0561234567'`.
  - `seed.sql`: add `stylist_workdays` rows (2–6) for `amina`, `leila`, `sara` (`on conflict do nothing`) — locally migrations run before the seed, so the backfill sees no stylists.

- [ ] **Step 1: Write failing `12_settings_schema.test.sql`**: tables exist; Élégance has 7 hours rows with Tuesday `09:00–18:00` and Sunday/Monday closed; every seeded stylist has 5 workdays; `salons.city->>'fr' = 'Alger'` and `whatsapp = '0561234567'` for `elegance`; check constraints reject `opens = '09:10'`, `opens > closes`, `ends_on < starts_on`, `whatsapp = '021234567'`, `instagram_url = 'http://x'`; anon reads `salon_hours` but gets 0 rows from `stylist_days_off`; anon `insert into public.salon_hours …` → `42501`; a `stylist_workdays` row pairing `'elegance'` with rival's stylist `'nadia'` → `23503` (fixture salon `rival` as in `10_isolation`).
- [ ] **Step 2: Run** `supabase db reset && supabase test db` — Expected: `12_settings_schema` FAILS; guard (`11_guard`) still passes.
- [ ] **Step 3: Write the migration and seed changes** per Interfaces.
- [ ] **Step 4: Run** `supabase db reset && supabase test db && supabase db lint --level warning --fail-on warning` — Expected: all PASS (the guard's `tables_without_salon_id` / RLS checks accept the new tables).
- [ ] **Step 5: Commit** — `feat(db): per-salon settings tables (hours, closed dates, stylist days)`

---

### Task 2: Booking rules read the settings

**Files:**
- Create: `supabase/migrations/20261113100100_settings_rules.sql`, `supabase/tests/database/13_settings_rules.test.sql`
- Modify: `supabase/tests/database/02_get_slots.test.sql`, `03_create_booking.test.sql`, `07_admin_write.test.sql` only where they assume fixed Sun/Mon or a fixed stylist set (they must keep passing on the seeded Élégance data, which is unchanged)

**Interfaces:**
- Consumes: Task 1 tables and `active` flags.
- Produces:
  - `private.day_hours(p_salon_id text, p_date date) returns table (opens_min integer, closes_min integer)` — one row with the salon's hours for that ISO weekday, **no row** if the weekday is closed or `p_date` falls in a `salon_closed_dates` range. `stable`, `security definer`, `set search_path = ''`.
  - `private.stylist_works(p_stylist_id text, p_date date) returns boolean` — stylist active, has a workday for that weekday, and no `stylist_days_off` range covers the date.
  - `public.get_slots(p_salon_id, p_date, p_service_id, p_stylist_id default null)` (same signature): `unknown_service` also when the service or the chosen stylist is inactive; returns nothing when `day_hours` is empty or the date is outside the 14-day window; grid every 30 min from `opens_min` while `slot + duration <= closes_min`; a slot is available if it's in the future and some active stylist offering the service (or the chosen one) `stylist_works` that date and is free.
  - `public.create_booking(…)` (same signature): time format `^([01][0-9]|2[0-3]):(00|15|30|45)$`, then `outside_hours` unless `(min - opens_min) % 30 = 0`, `min >= opens_min`, `min + duration <= closes_min`, future, inside window; candidates as in get_slots.
  - `private.staff_slot(p_salon_id text, p_date date, p_time text, p_duration integer) returns timestamptz` — replaces the 3-arg version (drop it): 15-minute steps, inside that day's `day_hours`, else `outside_hours`. Grant execute to `authenticated` (staff functions are invoker).
  - `public.admin_create_booking` (same signature): service and stylist must be **active** (else `unknown_service`); uses the new `staff_slot(private.my_salon(), …)`. Stylist working days are **not** enforced for the owner.
  - `private.is_open_day` is no longer used by these functions; drop it if nothing references it.

- [ ] **Step 1: Write failing `13_settings_rules.test.sql`** (Élégance data; change settings with direct `update`/`insert` inside the test transaction):
  - Thursday set to `09:00–13:00` → `get_slots` on the next Thursday for `coupe-femme` (60 min) returns last slot `'12:00'`.
  - Next open Tuesday added to `salon_closed_dates` → `get_slots` returns 0 rows and `create_booking` there → `outside_hours`; `admin_create_booking` there → `outside_hours`.
  - Opening moved to `09:15` → slots are `'09:15','09:45',…`; `create_booking` at `'09:15'` lives, at `'09:30'` → `outside_hours`.
  - Sunday opened `10:00–14:00` → Sunday now has slots.
  - Amina's workdays without Wednesday → `get_slots(…, 'coupe-femme', 'amina')` on Wednesday has no available slot; with `leila` also offering `coupe-femme`, no-preference is still available and `create_booking(…, null, …)` assigns `leila`.
  - Amina day off covering a date → same as above for that date.
  - `services.active = false` for `manucure` → `get_slots` and `create_booking` → `unknown_service`; `admin_create_booking` with it → `unknown_service`.
  - Owner may book Amina on her non-working Wednesday (`admin_create_booking` lives).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write the migration** per Interfaces (start from the current bodies in `20261112100100_salon_public_booking.sql` and `20261112100200_salon_staff_invoker.sql`; keep every other rule, the per-salon limits and the exclusion-violation retry).
- [ ] **Step 4: Run** full DB suite + lint — Expected: PASS, including the unchanged `02`/`03`/`07` expectations on default Élégance hours.
- [ ] **Step 5: Commit** — `feat(booking): slots and owner bookings follow each salon's hours and stylists`

---

### Task 3: Editing a booking keeps what it was booked with

**Files:**
- Create: `supabase/migrations/20261113100200_booking_edit_keeps.sql`
- Modify: `supabase/tests/database/07_admin_write.test.sql` (append)

**Interfaces:**
- Consumes: `private.staff_slot(text, date, text, integer)` (Task 2).
- Produces: `public.admin_update_booking(p_id uuid, p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text)` (same signature, still `security invoker`):
  - Load the booking (own salon, else `not_found`).
  - `v_service_changed := p_service_id <> booking.service_id`; `v_slot_changed := v_service_changed or p_stylist_id <> booking.stylist_id or (p_date, p_time) differ from the booking's salon-local start`.
  - If `v_service_changed`: service must be active and in my salon (`unknown_service`), new price and duration from the service. Else: keep stored `price` and duration `ends_at - starts_at`; a hidden current service is fine.
  - Stylist: if changed it must be active and in my salon (`unknown_service`); unchanged hidden stylist is fine.
  - If `v_slot_changed`: start via `staff_slot(my_salon(), p_date, p_time, duration)` (hours + closed dates enforced). Else: keep `starts_at`/`ends_at` exactly, no hour checks.
  - Name/phone/lang validation as today. `exclusion_violation` → `slot_taken`.

- [ ] **Step 1: Append failing tests** to `07_admin_write.test.sql` (as Élégance staff): a booking created at 2500 DA; then `update public.services set price = 3000, duration = 90 where id = 'coupe-femme'`; `admin_update_booking` changing only the client name → price stays `2500`, duration stays 60 min; moving it to another time (same service) → still `2500` and 60 min; changing its service to `coloration` → price `6000`, 120 min. Then make Thursday close at 13:00 with a 16:00 booking on Thursday: renaming the client lives; moving it to 16:30 → `outside_hours`. Hide its stylist (`active = false`): renaming lives; moving it to another hidden stylist → `unknown_service`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write the migration** per Interfaces.
- [ ] **Step 4: Run** full DB suite — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(admin): edits keep a booking's price, length and slot unless changed`

---

### Task 4: Owner RPCs for services, stylists and days off

**Files:**
- Create: `supabase/migrations/20261113100300_settings_catalog_rpcs.sql`, `supabase/tests/database/14_settings_rpcs.test.sql`
- Modify: `10_isolation.test.sql` (append), `11_guard.test.sql` (register names)

**Interfaces:** all `security definer`, `set search_path = ''`, `not_authorized` when `private.my_salon()` is null, execute granted to `authenticated` only, ids from another salon → `not_found` (or `unknown_service` for service/stylist ids passed as references).
- `public.admin_save_service(p_id text, p_name jsonb, p_description jsonb, p_category text, p_price integer, p_duration integer, p_sort_order integer) returns text` — `p_id` null creates (id `gen_random_uuid()::text`, `image = ''`, `icon = case p_category when 'beaute' then 'sparkles' else 'scissors' end`), else updates name/description/category/price/duration/sort_order. Validation: `trim(p_name->>'fr')` 2–80 chars → else `invalid_name`; `p_name->>'ar'` may be empty; `p_category in ('coiffure','beaute')` → else `invalid_name`; `p_price between 0 and 1000000` → `invalid_price`; `p_duration between 15 and 600 and p_duration % 15 = 0` → `invalid_duration`. Returns the id.
- `public.admin_set_service_active(p_id text, p_active boolean) returns void`.
- `public.admin_save_stylist(p_id text, p_name text, p_role jsonb, p_service_ids text[], p_weekdays smallint[]) returns text` — create (id `gen_random_uuid()::text`, `image = ''`, `specialties = '[]'`) or update; replaces the stylist's `stylist_services` with `p_service_ids` (each must be an active-or-inactive service of my salon, else `unknown_service`) and `stylist_workdays` with `p_weekdays` (each 1–7, else `invalid_weekday`). Name 2–80 → `invalid_name`.
- `public.admin_set_stylist_active(p_id text, p_active boolean) returns void`.
- `public.admin_add_stylist_days_off(p_stylist_id text, p_from date, p_to date) returns uuid` — `p_to >= p_from` and span ≤ 366 days, else `invalid_dates`.
- `public.admin_delete_stylist_days_off(p_id uuid) returns void` — `not_found` if not in my salon.

- [ ] **Step 1: Failing tests** in `14_settings_rpcs.test.sql` (as Élégance staff): create a service → row exists with `salon_id = 'elegance'`, `active`, icon by category; update price; each validation code above with a boundary value (`p_duration = 20` → `invalid_duration`, `p_price = -1` → `invalid_price`, name `'A'` → `invalid_name`); hide/show; create a stylist with services and weekdays `{2,3}` → `stylist_workdays` has exactly 2 rows; update replaces them; weekday `8` → `invalid_weekday`; days off add/delete; `p_to < p_from` → `invalid_dates`. Non-staff → `not_authorized`; anon → `42501`. Direct `update public.services …` as authenticated staff changes 0 rows (no write policy).
- [ ] **Step 2: Isolation** (append to `10_isolation`): as Élégance staff, `admin_save_service('rival-cut', …)` → `not_found`; `admin_set_service_active('rival-cut', false)` → `not_found`; `admin_save_stylist('nadia', …)` → `not_found`; `admin_save_stylist(null, 'X', …, array['rival-cut'], …)` → `unknown_service`; `admin_set_stylist_active('nadia', false)` → `not_found`; `admin_add_stylist_days_off('nadia', …)` → `not_found`; deleting a rival days-off id → `not_found`; rival rows unchanged afterwards. Register the six names in `11_guard`.
- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Write the migration.**
- [ ] **Step 5: Run** full DB suite + lint — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(admin): owner RPCs for services, stylists and days off`

---

### Task 5: Owner RPCs for hours, closed dates, salon info, affected bookings

**Files:**
- Create: `supabase/migrations/20261113100400_settings_salon_rpcs.sql`
- Modify: `14_settings_rpcs.test.sql`, `10_isolation.test.sql`, `11_guard.test.sql`

**Interfaces:** same conventions as Task 4.
- `public.admin_set_hours(p_hours jsonb) returns void` — `p_hours` is an array of exactly 7 objects `{"weekday":1..7,"opens":"HH:MM"|null,"closes":"HH:MM"|null}` covering each weekday once; anything else (missing weekday, opens ≥ closes, not on a 15-minute step, only one of opens/closes null) → `invalid_hours`. Replaces the salon's 7 rows.
- `public.admin_add_closed_dates(p_from date, p_to date, p_label text) returns uuid` — `invalid_dates` if `p_to < p_from` or span > 366 days; label trimmed, ≤ 60 chars, empty → null.
- `public.admin_delete_closed_dates(p_id uuid) returns void` — `not_found` outside my salon.
- `public.admin_save_salon_info(p_address jsonb, p_city jsonb, p_whatsapp text, p_instagram_url text, p_facebook_url text) returns void` — WhatsApp through `private.normalize_phone`, must match `^0[5-7][0-9]{8}$` → else `invalid_phone`; URLs empty → null, else must start with `https://` → else `invalid_url`; address/city each `{fr, ar}` strings ≤ 200 chars.
- `public.admin_affected_bookings() returns table (id uuid, starts_at timestamptz, client_name text, reason text)` — future, non-cancelled bookings of my salon where `reason` is the first that applies, in this order: `'closed'` (no `day_hours` that date), `'outside_hours'` (start/end outside the day's hours), `'service_hidden'`, `'stylist_hidden'`, `'stylist_off'` (`not stylist_works`). Ordered by `starts_at`.

- [ ] **Step 1: Failing tests** in `14_settings_rpcs.test.sql`: set hours with Thursday `09:00–13:00` and read them back; each `invalid_hours` case (6 entries; duplicated weekday; `09:10`; opens ≥ closes; only `opens` null); add/delete closed dates with label; `invalid_dates`; salon info round-trip with `'+213 661 22 33 44'` stored as `'0661223344'`; `'021123456'` → `invalid_phone`; `'http://x'` → `invalid_url`; empty instagram stored as null. `admin_affected_bookings`: with a future 16:00 Thursday booking and Thursday closing at 13:00 → one row reason `'outside_hours'`; with that date also closed → `'closed'`; a booking whose stylist has a day off → `'stylist_off'`; cancelled bookings never listed.
- [ ] **Step 2: Isolation** (append): as Élégance staff, `admin_delete_closed_dates(<rival id>)` → `not_found`; Élégance `admin_set_hours` leaves rival hours unchanged; `admin_save_salon_info` leaves rival's row unchanged; `admin_affected_bookings()` never returns rival bookings (insert a rival booking that violates rival's hours). Register the five names in `11_guard`.
- [ ] **Step 3: Run** — FAIL. **Step 4:** migration. **Step 5: Run** full suite + lint — PASS.
- [ ] **Step 6: Commit** — `feat(admin): owner RPCs for hours, closed dates, salon info and affected bookings`

---

### Task 6: Frontend data layer for settings

**Files:**
- Create: `src/data/salonSettings.ts`, `src/data/salonSettings.test.ts`, `src/data/hours.test.ts`
- Modify: `src/data/types.ts`, `src/data/hours.ts`, `src/data/week.ts`, `src/data/week.test.ts`, `src/data/queries.ts`, `src/data/queries.test.tsx`, `src/data/whatsapp.ts`

**Interfaces:**
- Consumes: Task 1 tables (read via `supabase.from(...)` filtered `.eq('salon_id', SALON_ID)`), Tasks 4–5 RPCs.
- Produces (types in `types.ts`):
  - `type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7`; `interface DayHours { opens: number; closes: number }` (minutes); `type SalonHours = Record<Weekday, DayHours | null>`; `interface ClosedDates { id: string; from: string; to: string; label: string | null }` (YYYY-MM-DD); `interface SalonInfo { address: Record<Lang,string>; city: Record<Lang,string>; whatsapp: string | null; instagramUrl: string | null; facebookUrl: string | null }`; `Service.active: boolean`; `Stylist.active: boolean`, `Stylist.workdays: Weekday[]`; `interface StylistDayOff { id: string; stylistId: string; from: string; to: string }`; `type AffectedReason = 'closed' | 'outside_hours' | 'service_hidden' | 'stylist_hidden' | 'stylist_off'`; `interface AffectedBooking { id: string; startsAt: Date; clientName: string; reason: AffectedReason }`.
  - `src/data/hours.ts` (pure, mirrors SQL; constants `OPENING_HOUR`/`CLOSING_HOUR` removed): `isoWeekday(date: Date): Weekday`; `dayHours(hours: SalonHours, closed: ClosedDates[], date: Date): DayHours | null`; `stylistWorks(stylist: Stylist, daysOff: StylistDayOff[], date: Date): boolean`; `groupHours(hours: SalonHours): { from: Weekday; to: Weekday; hours: DayHours | null }[]` — consecutive weekdays **in display order Monday→Sunday** with identical hours merged (Élégance → `[{1,1,null},{2,6,09:00–18:00},{7,7,null}]`).
  - `src/data/week.ts`: `dayOccupancy(bookings, day, stylistCount, hours: DayHours | null)` (0 when null); `staffTimeOptions(durationMin, hours: DayHours)`.
  - `src/data/salonSettings.ts`: `useSalonInfo()`, `useSalonHours()`, `useClosedDates()` (only ranges ending today or later), `useStylistDaysOff()` (admin, RLS-scoped), `useAffectedBookings(enabled: boolean)`; mutations `useSaveService`, `useSetServiceActive`, `useSaveStylist`, `useSetStylistActive`, `useAddStylistDaysOff`, `useDeleteStylistDaysOff`, `useSetHours`, `useAddClosedDates`, `useDeleteClosedDates`, `useSaveSalonInfo` — each invalidates the related query keys (`['salon', …]`, `['services']`, `['stylists']`, `['admin', …]`) on success. Query keys start with `'salon'` (public) or `'admin'` (staff). All settings queries `staleTime: 30_000`.
  - `src/data/queries.ts`: `useServices()`/`useStylists()` (public) return **active only** and stylists include `workdays` (embed `stylist_workdays(weekday)`); new `useAllServices()`/`useAllStylists()` (admin pickers and settings) include inactive; all four `staleTime: 30_000`.
  - `src/data/whatsapp.ts`: drop `SALON_WHATSAPP_NUMBER`; callers use `toWaNumber(info.whatsapp)`.
  - `toSettingsError(err): SettingsErrorCode` mapping the new error codes (fallback `'unknown'`).

- [ ] **Step 1: Failing tests** — `hours.test.ts`: `isoWeekday` for a Sunday = 7, Monday = 1; `dayHours` returns null for a closed weekday, null inside a closed range (inclusive both ends), hours otherwise; `stylistWorks` false on a non-workday, false inside a day-off range, false when inactive; `groupHours` on Élégance's hours gives the three groups above, and on all-different hours gives 7 groups. `week.test.ts`: `staffTimeOptions(60, {opens: 555, closes: 780})` starts `'09:15'` and ends `'12:00'`; `dayOccupancy` with `null` hours = 0. `salonSettings.test.ts` / `queries.test.tsx`: mocked supabase — public services query filters `active = true` and `salon_id`; `useSalonHours` maps rows (`opens '09:00:00'` → 540) into `SalonHours` with missing/closed weekdays as null; a mutation calls the right RPC with the right param names and invalidates.
- [ ] **Step 2: Run** `pnpm test` — FAIL.
- [ ] **Step 3: Implement**; fix every compile error from the removed constants by passing data hours (callers are updated properly in Tasks 7–8; in this task a caller may temporarily pass `dayHours(...)` from the new hooks).
- [ ] **Step 4: Run** `pnpm test && npx tsc -b` — PASS.
- [ ] **Step 5: Commit** — `feat(data): salon settings hooks and hour rules in the frontend`

---

### Task 7: Public site reads the salon's settings

**Files:**
- Modify: `src/components/Footer.tsx`, `src/components/Navbar.tsx`, `src/components/Booking.tsx`, `src/context/LanguageContext.tsx`, their tests (`Booking.test.tsx`; create `Footer.test.tsx`)

**Interfaces:** Consumes Task 6 hooks and `groupHours`, `dayHours`.

- Footer: the hours list comes from `groupHours(useSalonHours())`, one line per group: day range (`formatDayName` of `from` – `to`, or a single day) and `HH:MM – HH:MM` or `t('common.closed')`; address lines from `info.address[lang]` split on `\n`; the city label (where "Alger" is hard-coded today) from `info.city[lang]`; the phone shows `info.whatsapp` formatted `0561 23 45 67`-style with `tel:+213…`; Instagram/Facebook icons link to the URLs and are **hidden when null**. While loading, render the section headings without values (no layout jump beyond text).
- Navbar: the "Alger" label from `info.city[lang]`.
- Booking: the date strip lists the next 14 days where `dayHours(hours, closed, d) !== null` (replace the `getDay() !== 0 && !== 1` rule); WhatsApp links use `toWaNumber(info.whatsapp)` and are hidden when it's null.
- Out of scope here (Part 3, salon story): city inside `hero.subtitle` / philosophy copy.

- [ ] **Step 1: Failing tests**: Footer with mocked hooks renders, in Monday→Sunday order, `Lundi`/closed, `Mardi – Samedi`/`09:00 – 18:00`, `Dimanche`/closed (one line per `groupHours` group), the address lines, `Alger`, and no Instagram link when `instagramUrl` is null; with a Thursday override, Thursday gets its own line. Booking: with a closed date on the next Tuesday, that date is not in the strip; with Sunday opened, the next Sunday is in the strip; the "questions?" WhatsApp link uses `https://wa.me/213561234567`.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement (add `fr`/`ar` keys as needed). **Step 4: Run** `pnpm test && npx tsc -b` — PASS.
- [ ] **Step 5: Commit** — `feat(site): footer, navbar and booking dates follow the salon's settings`

---

### Task 8: Agenda follows each day's hours; gear icon

**Files:**
- Modify: `src/components/Schedule.tsx`, `src/components/admin/WeekStrip.tsx`, `src/components/admin/DayColumns.tsx`, `src/components/admin/BookingSheet.tsx`, `src/pages/AdminPage.tsx`, `src/context/LanguageContext.tsx`, and their tests

**Interfaces:** Consumes Task 6 (`dayHours`, `stylistWorks`, `useSalonHours`, `useClosedDates`, `useStylistDaysOff`, `useAllServices`, `useAllStylists`, `staffTimeOptions(duration, hours)`, `dayOccupancy(…, hours)`).

- WeekStrip: a day is closed (disabled, "Fermé") when `dayHours` is null — weekday or closed date.
- Schedule: "start on next open day" uses `dayHours`; occupancy uses that day's hours; columns list **active** stylists plus any inactive stylist who has a booking that day.
- DayColumns: the grid spans `min(opens, earliest booking start)` to `max(closes, latest booking end)` (rounded out to whole hours); bookings outside `[opens, closes]` get a visible "hors horaires" marker (`t('schedule.outsideHours')`); a stylist for whom `stylistWorks` is false that day has a greyed column header + body (`opacity-60`) and stays tappable. A closed day with bookings still renders the grid (with the closed notice above it) so those bookings can be found; a closed day without bookings shows the existing closed message.
- BookingSheet: time options from `staffTimeOptions(duration, dayHours ?? fallback)` where fallback is the booking's own span when the day is closed; `pastClosing` uses the day's `closes`; service and stylist pickers list **active** items plus the booking's current one even if hidden; when the chosen stylist doesn't work the chosen date, show `t('schedule.stylistOff').replace('{name}', stylist.name)` (key value FR `"{name} ne travaille pas ce jour-là"`; `t()` has no interpolation) as a non-blocking warning.
- AdminPage header: a gear button (`Settings` icon from lucide-react, `aria-label={t('settings.title')}`) linking to `/admin/settings`, visible when logged in.

- [ ] **Step 1: Failing tests**: WeekStrip marks a closed date disabled; DayColumns with Thursday `09:00–13:00` and a 16:00 booking renders that booking with the outside-hours marker; a non-working stylist's column has the greyed class; BookingSheet shows the stylist-off warning for Amina on her non-working day and still saves; BookingSheet keeps a hidden current service in the picker; AdminPage shows the gear link to `/admin/settings` when logged in.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement. **Step 4: Run** `pnpm test && npx tsc -b` — PASS.
- [ ] **Step 5: Commit** — `feat(admin): agenda follows each day's hours and stylists; settings gear`

---

### Task 9: Réglages page shell

**Files:**
- Create: `src/pages/SettingsPage.tsx`, `src/pages/SettingsPage.test.tsx`, `src/components/settings/SettingsLayout.tsx`
- Modify: `src/App.tsx`, `src/components/Schedule.tsx` (remove `NotificationsCard`), `src/pages/AdminPage.tsx` (share the logged-in guard + header), `src/context/LanguageContext.tsx`

**Interfaces:**
- Produces: routes `/admin/settings` (list), `/admin/settings/services`, `/stylists`, `/hours`, `/closed-dates`, `/info` — the five sub-screens are placeholders here, filled by Tasks 10–13. `SettingsLayout({ title, backTo, children })` renders the admin header bar with a back arrow (`ArrowLeft`, `rtl:rotate-180`) to `backTo` and the title. Not logged in → the existing login form; staff of another salon → the existing `admin.otherSalon` message (reuse Part 1's gate).
- The list page (title **Réglages**, back to `/admin`) shows rows in this order with one-line summaries from the Task 6 hooks: **Prestations & prix** ("12 prestations"), **Coiffeuses** ("4 coiffeuses"), **Horaires** (e.g. "09:00–18:00 · fermé dim., lun." — first open group's hours + closed days), **Jours fermés** ("Prochain : 16 mars" or "Aucun"), **Infos du salon** ("Adresse · WhatsApp"); then group **Compte** with **Notifications** (renders the existing `NotificationsCard` inline) and **Se déconnecter** (same logout handler as AdminPage, including `disablePush`).

- [ ] **Step 1: Failing tests**: the list shows the five rows in order with summaries computed from mocked hooks (Élégance data → "09:00–18:00 · fermé dim., lun."); each row links to its route; "Se déconnecter" calls signOut and disablePush; another salon's staff sees `admin.otherSalon`; `/admin` no longer renders `NotificationsCard`.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement. **Step 4: Run** `pnpm test && npx tsc -b` — PASS.
- [ ] **Step 5: Commit** — `feat(settings): Réglages page and routes`

---

### Task 10: Services screen and the affected-bookings warning

**Files:**
- Create: `src/components/settings/ServicesSettings.tsx`, `src/components/settings/AffectedBookings.tsx`, tests for both
- Modify: `src/App.tsx` (route element), `src/context/LanguageContext.tsx`

**Interfaces:**
- `AffectedBookings()` — after any settings save, the screen renders it; it loads `useAffectedBookings(true)` and, if non-empty, shows a warning card: `t('settings.affected.title')` (FR: "Ces rendez-vous ne respectent plus les nouveaux réglages. Ils sont conservés : prévenez les clientes si besoin.") and one row per booking (date + time via `formatLongDate`/`formatAlgiersTime`, client name, reason via `t('settings.affected.<reason>')`) linking to `/admin?day=YYYY-MM-DD&booking=<id>` (the Part 1 deep link). Renders nothing when the list is empty.
- `ServicesSettings` — list of all services (active first, hidden ones marked "Masquée"); tap opens an edit form (name FR/AR, description FR/AR, category select coiffure/beauté, price DA, duration select 15…600 step 15, display order as a number field → `p_sort_order`); "Ajouter" opens an empty form; "Masquer"/"Afficher" toggles active. Errors map via `toSettingsError` to messages. After a successful save or hide, render `AffectedBookings`.

- [ ] **Step 1: Failing tests**: list renders active then hidden; saving calls `admin_save_service` with the typed values (price as integer, duration from the select); `invalid_price` shows the price error; hiding calls `admin_set_service_active(id, false)` then shows the affected bookings card when the mocked RPC returns rows, with a link `href="/admin?day=2030-01-08&booking=b1"`; no card when it returns `[]`.
- [ ] **Step 2–4:** run (FAIL) → implement → `pnpm test && npx tsc -b` (PASS).
- [ ] **Step 5: Commit** — `feat(settings): services and prices screen`

---

### Task 11: Stylists screen

**Files:**
- Create: `src/components/settings/StylistsSettings.tsx` + test
- Modify: `src/App.tsx`, `src/context/LanguageContext.tsx`

**Interfaces:** Consumes `useAllStylists`, `useAllServices`, `useStylistDaysOff`, `useSaveStylist`, `useSetStylistActive`, `useAddStylistDaysOff`, `useDeleteStylistDaysOff`, `AffectedBookings`.

- List of stylists (hidden ones marked). Edit form: name, role FR/AR, **services offered online** (checkbox per service, active services + already-linked hidden ones), **working days** (7 toggles Monday→Sunday, ISO numbers), **days off** (list of upcoming ranges with delete, plus a from/to date pair to add). "Masquer"/"Afficher". After save/hide/day-off add, render `AffectedBookings`.

- [ ] **Step 1: Failing tests**: saving sends `p_service_ids` and `p_weekdays` (`[2,3,4,5,6]` for Élégance's Amina after unticking nothing); unticking Wednesday sends `[2,4,5,6]`; adding a day off calls `admin_add_stylist_days_off` with YYYY-MM-DD strings; `invalid_dates` shows its message; hiding shows `AffectedBookings`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `feat(settings): stylists screen (services, working days, days off)`

---

### Task 12: Hours and closed-dates screens

**Files:**
- Create: `src/components/settings/HoursSettings.tsx`, `src/components/settings/ClosedDatesSettings.tsx` + tests
- Modify: `src/App.tsx`, `src/context/LanguageContext.tsx`

**Interfaces:** Consumes `useSalonHours`, `useSetHours`, `useClosedDates`, `useAddClosedDates`, `useDeleteClosedDates`, `AffectedBookings`.

- Hours: 7 rows Monday→Sunday, each with an open/closed switch and opens/closes selects (15-minute steps 06:00–23:00); "Enregistrer" sends all 7 as the `p_hours` array (`"HH:MM"` strings, null when closed); client-side guard blocks opens ≥ closes with the same message as `invalid_hours`. After save, `AffectedBookings`.
- Closed dates: upcoming ranges (label, `formatLongDate` from–to) with delete; add form with from/to (to defaults to from) and optional label ("Aïd" placeholder). After add, `AffectedBookings`.

- [ ] **Step 1: Failing tests**: Hours saves 7 entries with Thursday `{"weekday":4,"opens":"09:00","closes":"13:00"}` after editing; closing Sunday sends `opens: null, closes: null`; opens ≥ closes shows the error and doesn't call the RPC. Closed dates: adding `2030-03-16`→`2030-03-17` "Aïd" calls `admin_add_closed_dates('2030-03-16','2030-03-17','Aïd')`; delete calls `admin_delete_closed_dates(id)`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `feat(settings): opening hours and closed dates screens`

---

### Task 13: Salon info screen

**Files:**
- Create: `src/components/settings/SalonInfoSettings.tsx` + test
- Modify: `src/App.tsx`, `src/context/LanguageContext.tsx`

**Interfaces:** Consumes `useSalonInfo`, `useSaveSalonInfo`.

- Fields: address FR / AR (textareas, multi-line), city FR / AR, WhatsApp (tel input, `dir="ltr"`, validated client-side with `isValidPhone`), Instagram URL, Facebook URL (optional, `https://` required when filled). Save sends exactly the five RPC params; errors `invalid_phone` / `invalid_url` shown on their fields.

- [ ] **Step 1: Failing tests**: save sends `p_whatsapp: '0661 22 33 44'` as typed (server normalises) and empty Instagram as `''`; `invalid_url` from the RPC marks the Instagram field; an invalid phone blocks the call client-side.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `feat(settings): salon info screen`

---

### Task 14: Apply to the live database (needs the product owner's go-ahead)

**Files:** none (plus a one-line `CLAUDE.md` update in Step 4).

- [ ] **Step 1:** Ask the product owner. Confirm the live project is awake (`curl -s -o /dev/null -w "%{http_code}" "$VITE_SUPABASE_URL/rest/v1/"` → `401`).
- [ ] **Step 2:** The product owner runs `supabase db push --dry-run` — Expected: exactly the five `202611131000xx_*` migrations — then `supabase db push`.
- [ ] **Step 3: Verify live** with the publishable key: `salon_hours?salon_id=eq.elegance` returns 7 rows (Tue–Sat 09:00–18:00); `get_slots('elegance', <next open day>, 'coupe-femme')` still returns 17 slots; `salons?select=city,whatsapp` shows `Alger` / `0561234567`; anon `admin_set_hours` → `42501`; anon `insert` into `salon_hours` → `42501`.
- [ ] **Step 4:** Add to `CLAUDE.md` § Salons: "Hours, closed dates, stylist workdays/days off and salon info are per-salon data (Part 2); rules live in `private.day_hours` / `private.stylist_works`, mirrored for display in `src/data/hours.ts`." Commit via a PR.
