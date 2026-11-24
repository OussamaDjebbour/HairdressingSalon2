# Subscription due dates and pausing online booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The product owner records each salon's "paid until" date; the salon owner is warned in `/admin`; 3 days after the date online booking pauses (site and agenda keep working) until the date is extended.

**Architecture:** A private `salon_billing` table and one SQL status function own the rules (Algiers dates, 5-day notice, 3-day grace). An insert trigger blocks new online bookings and the two slot functions refuse a paused salon. The client page asks a public yes/no function; the admin asks a `my_salon()`-scoped status function; the product owner uses a `pnpm salon-paid` script through service-role-only functions.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), React 18 + TS + React Query + Tailwind, Vitest, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-11-24-billing-pause-design.md`

## Global Constraints

- Days past due D = Algiers today − `paid_until`. States: `none` (no row, or `salons.demo`), `ok` (D ≤ −6), `soon` (−5 ≤ D ≤ 0), `grace` (1 ≤ D ≤ 3), `paused` (D ≥ 4). `paused_from` = `paid_until + 4`. Written once, in `private.billing_status`.
- Algiers today in SQL: `(now() at time zone 'Africa/Algiers')::date`.
- Error code: `booking_paused` (`errcode 'P0001'`), same style as the other booking errors.
- Never touch existing bookings; owner (`admin_*`) functions unchanged; demo never paused.
- Payment state is never readable by anon; clients never see payment words.
- New public functions callable by anon/authenticated go in `11_guard.test.sql` `registered_api()` AND get isolation assertions in `10_isolation.test.sql`. Service-role-only functions: `revoke … from public, anon, authenticated; grant … to service_role`.
- Never edit a pushed migration; new file `supabase/migrations/20261124100000_billing.sql`. Don't use `revoke execute on all functions in schema private`.
- Client-page texts in `src/context/LanguageContext.tsx` (fr + ar); admin texts in `src/i18n/adminTranslations.ts` under `admin.billing.*` (fr + ar). Placeholders use `{date}` / `{pause}` with `.replace`.
- Public code must not import `src/data/admin.ts`; `pnpm check:bundle` must stay OK.
- RTL: logical CSS only (`ms-`/`ps-`/`text-start`); icons lucide-react only; admin feedback via existing components (no `alert`).

## Review Focus

1. A salon with no billing row (every salon today, Élégance included) must keep booking normally — test it in Task 1 and Task 2.
2. The last grace day (D = 3) still books; D = 4 refuses — boundary test in Task 1.
3. A `create_visit` refused for `booking_paused` leaves no rows (all-or-nothing) — Task 1.
4. The client page with the `salon_booking_open` call failing still shows the wizard — Task 2.
5. `pnpm salon-paid <id> --months 1` on a salon already paid into the future extends from that date, and from today when it's in the past; month ends clamp (31 Jan + 1 month = 28/29 Feb) — Task 4.

---

### Task 1: Database — billing table, status, enforcement, functions

**Files:**
- Create: `supabase/migrations/20261124100000_billing.sql`
- Create: `supabase/tests/database/30_billing.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (plan count + assertions), `supabase/tests/database/11_guard.test.sql` (`registered_api()`)

**Interfaces (produces):**
- `private.salon_billing (salon_id text primary key references public.salons(id) on delete cascade, paid_until date not null, updated_at timestamptz not null default now())`, RLS enabled, no policies, no grants.
- `private.billing_status(p_salon_id text) returns jsonb` → `{"state": "none"}` or `{"state": "ok|soon|grace|paused", "paid_until": "YYYY-MM-DD", "paused_from": "YYYY-MM-DD"}`. `stable security definer set search_path = ''`; revoked from public/anon/authenticated.
- `private.booking_paused(p_salon_id text) returns boolean` = `billing_status(...)->>'state' = 'paused'`; revoked likewise.
- Trigger `bookings_paused_guard` `before insert on private.bookings for each row when (new.source = 'online')` → raises `booking_paused` when paused. Function `private.refuse_paused_booking()`.
- `get_visit_slots(text, date, jsonb)` and `get_slots(text, date, text, text)`: re-created with `create or replace` from their latest bodies (`20261118100000_visits.sql` and `20261113100100_settings_rules.sql` respectively — copy the body verbatim) with `if private.booking_paused(p_salon_id) then raise exception 'booking_paused' using errcode = 'P0001'; end if;` as the first statement. Same signatures and grants.
- `public.salon_booking_open(p_salon_id text) returns boolean` (anon + authenticated): `not private.booking_paused(p_salon_id)`; unknown salon → true.
- `public.admin_billing() returns jsonb` (authenticated): `private.billing_status(private.my_salon())`; `not_authorized` when `my_salon()` is null.
- `public.billing_list() returns table (salon_id text, name jsonb, demo boolean, paid_until date, state text, paused_from date)` ordered by salon id; service_role only.
- `public.billing_set(p_salon_id text, p_until date) returns jsonb` (the new `billing_status`); `p_until` null deletes the row; raises `not_found` (unknown salon) or `demo_salon`; upsert sets `updated_at = now()`; service_role only.

- [ ] **Step 1: Write `30_billing.test.sql`** (pgTAP, `begin; … select * from finish(); rollback;`). Use a helper `pg_temp.pay(salon, days_from_today int)` that upserts `private.salon_billing` with `paid_until = algiers_today + days`. Assertions (each with the exact expectation):
  - no row → `billing_status('elegance')->>'state' = 'none'`, `salon_booking_open('elegance')` true, `get_visit_slots('elegance', open_day, '[{"service_id":"coupe-femme","stylist_id":null}]')` returns rows.
  - pay(+6) → `ok`; pay(+5) → `soon`; pay(0) → `soon`; pay(−1) → `grace`; pay(−3) → `grace` and `create_visit` for an open day succeeds; pay(−4) → `paused`, `paused_from = paid_until + 4`.
  - paused: `get_visit_slots` and `get_slots` throw `P0001 booking_paused`; `create_visit` and `create_booking` throw `booking_paused`; no `private.bookings` row was added for that client name.
  - paused: `admin_create_booking` as elegance staff still succeeds (source `staff`).
  - demo: set `salons.demo = true` on a salon with pay(−30) → `none`, booking open.
  - `salon_booking_open` executable by anon; `admin_billing()` as elegance staff returns the paused state; as a non-staff user throws `not_authorized`.
  - `billing_set('elegance', algiers_today + 30)` returns state `ok`; `billing_set('elegance', null)` → `none` and no row; `billing_set('nope', …)` throws `not_found`; on a demo salon throws `demo_salon`; `billing_list()` includes `elegance`.
  - anon and authenticated: `has_function_privilege(…, 'public.billing_set(text, date)', 'execute')` false, same for `billing_list()`; anon `select` on `private.salon_billing` throws `42501`.

- [ ] **Step 2: Run** `supabase db reset && supabase test db` — expect `30_billing` to fail (functions missing).

- [ ] **Step 3: Write the migration** per the Interfaces block (header comment stating the timeline and that money stays outside the app).

- [ ] **Step 4: Register and isolate.** Add `'salon_booking_open', 'admin_billing'` to `registered_api()` in `11_guard`. In `10_isolation`: with `rival` paused (pay −10) and `elegance` unbilled, `salon_booking_open('elegance')` true and `('rival')` false; rival staff's `admin_billing()` shows rival's state, elegance staff's shows `none`. Update the `plan(n)` counts.

- [ ] **Step 5: Run** `supabase db reset && supabase test db && supabase db lint --level warning` — all pass, lint clean.

- [ ] **Step 6: Commit** `feat(db): subscription due dates pause online booking after a 3-day grace`.

### Task 2: Client page — paused booking section

**Files:**
- Modify: `src/data/bookings.ts` (`BookingErrorCode` + `KNOWN_ERRORS` gain `'booking_paused'`)
- Modify: `src/data/queries.ts` (add `fetchBookingOpen`, `useBookingOpen`)
- Create: `src/components/booking/BookingPaused.tsx`
- Modify: `src/components/Booking.tsx`
- Modify: `src/context/LanguageContext.tsx`
- Test: `src/components/Booking.test.tsx`, `src/data/bookings.test.ts` (if it exists for `toBookingError`)

**Interfaces:**
- Consumes: `public.salon_booking_open(p_salon_id)` (Task 1); `currentSalonId()`; `useSalonInfo()` (`whatsapp`); `toWaNumber`, `waLink` from `src/data/whatsapp.ts`.
- Produces: `useBookingOpen(): UseQueryResult<boolean>` (`queryKey: ['salon', 'bookingOpen']`, `staleTime: 60_000`); `<BookingPaused />` (renders `<section id="booking">` itself).

- [ ] **Step 1: Tests first** in `Booking.test.tsx` (follow the file's existing rpc mock):
  - `salon_booking_open` → `false`: the section shows "La réservation en ligne est momentanément indisponible." and a WhatsApp link to the salon's number; no service list.
  - salon without WhatsApp: shows "Contactez directement le salon pour prendre rendez-vous." and no link.
  - `salon_booking_open` errors: the wizard shows as usual.
  - `get_visit_slots` answers `{ message: 'booking_paused' }` after a date is picked: the paused section replaces the wizard.
  - `create_visit` answers `booking_paused`: the paused section replaces the wizard.
  - Arabic: the paused title reads "الحجز عبر الموقع غير متاح مؤقتًا.".
- [ ] **Step 2: Run** `pnpm test src/components/Booking.test.tsx` — new tests fail.
- [ ] **Step 3: Implement.** Translations (fr / ar):
  - `booking.paused.title`: "La réservation en ligne est momentanément indisponible." / "الحجز عبر الموقع غير متاح مؤقتًا."
  - `booking.paused.whatsapp`: "Écrivez-nous sur WhatsApp pour prendre rendez-vous." / "راسلينا عبر واتساب لحجز موعد."
  - `booking.paused.noWhatsapp`: "Contactez directement le salon pour prendre rendez-vous." / "تواصلي مع الصالون مباشرة لحجز موعد."
  - `booking.error.booking_paused` (or whatever the `errorMessages` record needs): same as `booking.paused.title`.
  `BookingPaused` reuses the booking section's heading and the `btn-whatsapp` button with `booking.contactWhatsapp`. In `Booking`, after every hook: paused when `useBookingOpen().data === false`, or the slots query error / a submit error maps to `booking_paused` (keep a `pausedByServer` state set in the submit error handler). The success screen still wins over the paused section.
- [ ] **Step 4: Run** `pnpm test` and `npx tsc -b` — all pass.
- [ ] **Step 5: Commit** `feat(site): online booking shows a WhatsApp message while the salon is paused`.

### Task 3: Admin — billing notice

**Files:**
- Create: `src/data/billing.ts`, `src/components/admin/BillingNotice.tsx`, `src/components/admin/BillingNotice.test.tsx`
- Modify: `src/components/admin/SalonGate.tsx`, `src/i18n/adminTranslations.ts`

**Interfaces:**
- Consumes: `public.admin_billing()` (Task 1).
- Produces: `type BillingState = 'none' | 'ok' | 'soon' | 'grace' | 'paused'`; `interface AdminBilling { state: BillingState; paid_until?: string; paused_from?: string }`; `useAdminBilling()` (`queryKey: ['admin', 'billing']`, `staleTime: 5 * 60_000`, `retry: false`); `<BillingNotice />`.

- [ ] **Step 1: Tests first** (`BillingNotice.test.tsx`, rpc mocked, wrap in `FeedbackProvider` if needed, French unless stated; dates rendered with `formatLongDate`):
  - `soon`, paid_until `2030-01-31` → status text "Votre abonnement est réglé jusqu'au jeudi 31 janvier." (match whatever `formatLongDate` produces; quiet style).
  - `grace` → "Votre abonnement a expiré le jeudi 31 janvier. Sans règlement, la réservation en ligne sera suspendue le lundi 4 février." in a `role="status"` element.
  - `paused` → "La réservation en ligne est suspendue depuis le lundi 4 février. Votre agenda fonctionne normalement. Réglez votre abonnement pour la rétablir." in a `role="alert"` element.
  - `ok`, `none`, rpc error → renders nothing.
  - Arabic `paused` text renders.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement.** Translations (fr / ar):
  - `admin.billing.soon`: "Votre abonnement est réglé jusqu'au {date}." / "اشتراكك مدفوع حتى {date}."
  - `admin.billing.grace`: "Votre abonnement a expiré le {date}. Sans règlement, la réservation en ligne sera suspendue le {pause}." / "انتهى اشتراكك في {date}. بدون تسديد، سيتوقف الحجز عبر الموقع في {pause}."
  - `admin.billing.paused`: "La réservation en ligne est suspendue depuis le {pause}. Votre agenda fonctionne normalement. Réglez votre abonnement pour la rétablir." / "الحجز عبر الموقع متوقف منذ {pause}. أجندتك تعمل بشكل عادي. سدّدي اشتراكك لإعادة تفعيله."
  Parse `YYYY-MM-DD` as a local date (`new Date(y, m - 1, d)`). Styles: soon = quiet (cream/`text-rose-900/70`, `Info` icon); grace = amber (`AlertTriangle`); paused = rust (`AlertOctagon`); each with icon + text. `SalonGate` renders `<BillingNotice />` above `children` only once the salon is verified (inside a `max-w-7xl mx-auto px-4` wrapper so it lines up with the agenda and settings).
- [ ] **Step 4: Run** `pnpm test` (existing admin tests must still pass — the notice renders nothing when the mocked rpc has no `admin_billing` answer), `npx tsc -b`, `pnpm build && pnpm check:bundle`.
- [ ] **Step 5: Commit** `feat(admin): the owner sees when her subscription is due, late or paused`.

### Task 4: `pnpm salon-paid` and docs

**Files:**
- Create: `scripts/salon-paid.ts`, `scripts/lib/billing.ts`, `scripts/lib/billing.test.ts`
- Modify: `package.json` (`"salon-paid": "tsx scripts/salon-paid.ts"`), `scripts/new-salon.ts` (one summary line), `salons/README.md`, `docs/new-salon-checklist.md`, `docs/deploy.md` (§ 6 hand-over), `CLAUDE.md` (Salons section: billing paragraph)

**Interfaces:**
- Consumes: `public.billing_list()`, `public.billing_set(p_salon_id, p_until)` (Task 1); `loadEnv`, `env`, `supabaseClient`, `ok`, `warn`, `info`, `fail`, `StepFailed` from `scripts/lib/admin.ts` (as `setup-demo.ts` uses them).
- Produces (`scripts/lib/billing.ts`):
  - `algiersToday(now?: Date): string` — `YYYY-MM-DD` in Africa/Algiers.
  - `addMonths(ymd: string, months: number): string` — calendar months, day clamped to the month's end.
  - `nextPaidUntil(current: string | null, today: string, months: number): string` — `addMonths(max(current, today), months)`.
  - `parseArgs(argv: string[]): { kind: 'list' } | { kind: 'set'; salonId: string; until: string } | { kind: 'extend'; salonId: string; months: number } | { kind: 'stop'; salonId: string }` — throws `Error` with a usage line on anything else (bad date, months not an integer 1–24, two actions, missing id).

- [ ] **Step 1: Tests first** (`billing.test.ts`, `// @vitest-environment node`):
  - `addMonths('2027-01-31', 1) === '2027-02-28'`, `addMonths('2028-01-31', 1) === '2028-02-29'`, `addMonths('2027-11-15', 2) === '2028-01-15'`, `addMonths('2027-03-31', 12) === '2028-03-31'`.
  - `nextPaidUntil('2027-03-10', '2027-02-01', 1) === '2027-04-10'` (paid ahead); `nextPaidUntil('2027-01-20', '2027-02-01', 1) === '2027-03-01'` (late); `nextPaidUntil(null, '2027-02-01', 12) === '2028-02-01'`.
  - `algiersToday(new Date('2027-01-31T23:30:00Z')) === '2027-02-01'`.
  - `parseArgs([])` → list; `['sara', '--until', '2027-01-31']` → set; `['sara', '--months', '12']` → extend 12; `['sara', '--stop']` → stop; `['sara', '--months', '0']`, `['sara', '--until', '31/01/2027']`, `['sara']`, `['sara', '--stop', '--months', '1']` throw.
- [ ] **Step 2: Run** `pnpm test scripts/lib/billing.test.ts` — fail.
- [ ] **Step 3: Implement** the lib, then `salon-paid.ts`: `loadEnv(true)`; list prints one line per salon `id · name.fr · paid until · state` (demo shown as "demo — never paused", no row as "not billed"); set/extend/stop read the current row from `billing_list()`, print before → after, call `billing_set`, map `not_found` / `demo_salon` to clear `fail` messages; exit code 1 on `StepFailed`. `new-salon` summary adds: "Billing: not set — run `pnpm salon-paid <id> --until …` once the first payment or free months are settled." Docs: README section "Billing: `pnpm salon-paid`", checklist hand-over line, CLAUDE.md paragraph (table, states, trigger, functions, script).
- [ ] **Step 4: Run** `pnpm test`, `npx tsc -b`, `npx tsc -p scripts` (if `scripts/tsconfig.json` is what CI checks — follow `package.json`/CI).
- [ ] **Step 5: Commit** `feat(scripts): pnpm salon-paid records and extends a salon's paid-until date`.
