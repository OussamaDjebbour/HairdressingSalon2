# SP3 Owner Schedule (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a phone-first schedule (one column per stylist, week strip) where she can add, edit, move, confirm and cancel bookings herself, and reply to clients on WhatsApp, so she can retire the paper agenda.

**Architecture:** A new `source` column (`online` / `staff`) on `private.bookings`, plus two staff-only SECURITY DEFINER RPCs (`admin_create_booking`, `admin_update_booking`) with the owner's relaxed rules. The online `create_booking` limits ignore staff bookings. On the frontend, `Schedule.tsx` is rebuilt from small pieces: pure helpers (`week.ts`, `whatsapp.ts`), `WeekStrip`, `DayColumns`, and a `BookingSheet` add/edit form. The client success screen stops asking clients to send their own WhatsApp message.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind, TanStack Query, Supabase (Postgres RPCs, pgTAP), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-06-owner-schedule-design.md`

**Scope (ruling at plan time):** This plan covers spec goals 1, 2, 3 and 5, the pending count from goal 4, and the code-side go-live items (`vercel.json`, a single place for the WhatsApp number). Phone notifications (the rest of goal 4: PWA, service worker, web push, Edge Function) are a separate subsystem. They get their own plan once this one ships, as the spec's suggested phase order says.

## Global Constraints

- Before Task 1, rebase this branch on the latest `origin/main`. If PR #4 has been merged, `src/data/timeline.ts` (`layoutLanes`) exists, and Task 7 deletes it together with its test: within one stylist's column bookings cannot overlap.
- Every user-facing string goes through `t()`, with the key in **both** `fr` and `ar` in `src/context/LanguageContext.tsx`. Use logical CSS only (`start-`/`end-`, `ms-`/`me-`, `ps-`/`pe-`, `text-start`). Use colours and fonts from `tailwind.config.js` and the component classes in `src/index.css` (`btn-*`, `card`, `input`, `label`). Icons come from lucide-react only. No new npm dependencies.
- Business rules live in SQL. Staff RPCs are `security definer set search_path = ''`, raise `not_authorized` (P0001) for non-staff via `private.is_staff()`, and are granted to `authenticated` only (revoked from `public, anon`).
- Never edit a pushed migration. New migrations: `20261106130000_booking_source.sql` (Task 1) and `20261106130100_admin_write_bookings.sql` (Task 2). The user runs `supabase db push`.
- Salon time is `Africa/Algiers`. Times sent to RPCs are `"HH:MM"` salon wall-clock strings, never derived from the device timezone.
- Owner rules (spec goal 2):
  - any stylist can do any service (`stylist_services` is not checked);
  - 15-minute steps (`HH:00/15/30/45`);
  - past dates and times are allowed;
  - no 14-day window;
  - opening hours 09:00–18:00 (the service must end by 18:00) and closed Sunday/Monday still apply;
  - per-stylist no-overlap still applies;
  - name 2–80 characters after trimming;
  - phone normalised by `private.normalize_phone` and matching `^0[5-7][0-9]{8}$`;
  - language `fr`/`ar`;
  - her new bookings start `confirmed` with `source = 'staff'`.
- Editing a booking never changes its status (spec goal 3).
- Online `create_booking` limits (site-wide breaker, per-IP, per-phone) count only `source = 'online'` bookings.
- Error codes the UI maps: `not_authorized`, `invalid_name`, `invalid_phone`, `unknown_service`, `outside_hours`, `slot_taken`, `not_found`.

## Review Focus

1. **Device timezone ≠ Algiers** (a laptop set to Paris, or a CI box in UTC): tapping the 10:00 row of a column must send `p_time: '10:00'`, and an existing 10:00 booking must sit in the 10:00 row. → Task 5 test `slot tap sends salon wall-clock time`, run with `TZ=UTC`.
2. **Saving an edit that doesn't move the booking** (fixing a typo in the name): it must not fail with `slot_taken` against itself. → Task 2 pgTAP `edit name only keeps slot`.
3. **Changing the service to a longer one**, so the booking would run past 18:00 or into the next booking: she gets the "outside hours" or "time taken" message and the booking is unchanged. → Task 2 pgTAP `longer service past closing`, and Task 6 test `shows slot_taken message and keeps the sheet open`.
4. **Phone typed the way people type it** (`0555 12 34 56`, `+213 555…`): it's accepted, stored normalised, and the WhatsApp link uses `213555123456`. → Task 2 pgTAP `staff phone normalised`, and Task 4 test `toWaNumber`.
5. **Double tap on Save / Confirm**: no duplicate booking. Buttons are disabled while the mutation is pending. → Task 6 test `save disabled while pending`.

---

### Task 1: `source` column, online limits ignore staff bookings, list returns source

**Files:**
- Create: `supabase/migrations/20261106130000_booking_source.sql`
- Test: `supabase/tests/database/06_booking_source.test.sql`

**Interfaces:**
- Produces:
  - `private.bookings.source text not null default 'online' check (source in ('online','staff'))`;
  - `public.admin_list_bookings(p_from date, p_to date)`, which returns the existing columns plus `source text` (appended last);
  - `public.create_booking(...)` with an unchanged signature.

- [ ] **Step 1: Write the failing test** `06_booking_source.test.sql`. Reuse the `pg_temp.open_day` / `pg_temp.book` helper style from `03_create_booking.test.sql`, with a `p_source` parameter (default `'online'`) on `book`. Use `select plan(6)`. Assertions:
  - `has_column('private', 'bookings', 'source', 'bookings.source exists')`
  - `is((select source from private.bookings where client_name = 'Yasmine'), 'online', 'online bookings default to online')`, after `create_booking('coupe-femme','amina',open_day(),'09:00','Yasmine','0555123456','fr')`
  - **per-phone ignores staff:** 3 staff bookings in the future for `0777000001`, then `lives_ok(create_booking(... '0777000001' ...))`
  - **per-phone still counts online:** 3 online bookings for `0777000002`, then `throws_ok(..., 'P0001', 'too_many_bookings')`
  - **breaker ignores staff:** 20 staff bookings with `created_at = now()` on distinct stylist/time pairs (spread over `open_day(2)`…`open_day(4)`), then `lives_ok(create_booking(...))`
  - **list returns source:** as staff (`act_as` from `04_admin.test.sql`), `is((select source from admin_list_bookings(d, d) where client_name = 'Yasmine'), 'online', ...)`

- [ ] **Step 2: Run it.** `supabase test db`. Expected: `06_booking_source` FAILs (no `source` column).

- [ ] **Step 3: Write the migration.**
  - `alter table private.bookings add column source ...` (as in Interfaces).
  - `create or replace function public.create_booking`: copy it from `20260930112941_booking_functions.sql` exactly, adding `and b.source = 'online'` to the three limit queries (breaker, per-IP, per-phone). The insert still relies on the column default.
  - `drop function public.admin_list_bookings(date, date);`, then recreate it from `20260930120642_admin_functions.sql` with `source text` appended to the return table and `b.source` to the select.
  - Re-apply the revoke/grant lines for both functions, exactly as in the originals.

- [ ] **Step 4: Run it.** Run `supabase test db` and `supabase db lint --level warning`. Expected: all files pass (01–06), and lint has no new warnings.

- [ ] **Step 5: Commit** — `feat(db): booking source; online limits ignore staff bookings`

---

### Task 2: Staff create/update RPCs

**Files:**
- Create: `supabase/migrations/20261106130100_admin_write_bookings.sql`
- Test: `supabase/tests/database/07_admin_write.test.sql`

**Interfaces:**
- Consumes: `private.bookings.source` (Task 1), `private.is_staff()`, `private.normalize_phone(text)`, `private.slot_start(date, time)`.
- Produces:
  - `private.staff_slot(p_date date, p_time text, p_duration integer) returns timestamptz` — returns the start time, or raises `outside_hours` if `p_time` is off the `^([01][0-9]|2[0-3]):(00|15|30|45)$` grid, the date is a Sunday or Monday (`isodow in (1,7)`), the start is before 09:00, or the end is after 18:00. It does **not** check past times or the 14-day window.
  - `public.admin_create_booking(p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns uuid`
  - `public.admin_update_booking(p_id uuid, p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns void` — replaces every editable field. `ends_at` and `price` are recomputed from the service. `status` and `source` are untouched.
  - Errors: `not_authorized`, `invalid_name`, `invalid_phone`, `unknown_service` (an unknown service **or** stylist id), `outside_hours`, `slot_taken` (from `exclusion_violation`), `not_found` (update only). `p_lang` outside `fr`/`ar` falls back to `fr`.

- [ ] **Step 1: Write the failing test** `07_admin_write.test.sql`. Set up staff and non-staff users and `pg_temp.act_as` as in `04_admin.test.sql`. Fixed dates: `2030-01-08` (Tuesday), `2030-01-06` (Sunday), and `2020-01-07` (a past Tuesday). Assertions:
  - anon `throws_ok(... '42501')` for both functions; non-staff `throws_ok(... 'P0001', 'not_authorized')` for both functions.
  - **staff create:** `admin_create_booking('soin-visage','amina','2030-01-08','10:15','  Rania ','0555 12 34 56','ar')`. Then:
    - `is(status,'confirmed')`
    - `is(source,'staff')`
    - `is(client_phone,'0555123456')` *(staff phone normalised)*
    - `is(client_name,'Rania')`
    - `is(lang,'ar')`
    - price and duration come from `services`
    - Amina doesn't offer `soin-visage` in the seed, which proves any stylist can do any service.
  - **past date allowed:** `lives_ok(admin_create_booking('coupe-femme','leila','2020-01-07','09:00', …))`.
  - **closed day:** `throws_ok(... '2030-01-06' ..., 'P0001', 'outside_hours')`. **Off grid:** `'10:10'` → `outside_hours`. **Longer service past closing:** `'coupe-femme'` at `'17:30'` → `outside_hours`. **Unknown stylist:** `'nobody'` → `unknown_service`.
  - **overlap:** a second `amina` booking at `'10:30'` → `slot_taken`.
  - **edit name only keeps slot:** `lives_ok(admin_update_booking(<Rania id>, 'soin-visage','amina','2030-01-08','10:15','Rania B','0555123456','ar'))`, and the status is still `confirmed`.
  - **edit keeps pending:** on a pending online booking (inserted directly), update the time → `is(status,'pending')`.
  - **move onto a taken time** → `slot_taken`, and the row is unchanged (`starts_at` is the same as before).
  - **unknown id** → `not_found`.

- [ ] **Step 2: Run it.** `supabase test db`. Expected: `07_admin_write` FAILs (the functions don't exist).

- [ ] **Step 3: Write the migration.** Validate in this order: staff → name → phone → service/stylist exist → `staff_slot` → insert/update. Catch `exclusion_violation` and raise `slot_taken`. Revoke from `public, anon, authenticated` (and `revoke execute on all functions in schema private ...` again), then grant the two public functions to `authenticated`.

- [ ] **Step 4: Run it.** Run `supabase test db` and `supabase db lint --level warning`. Expected: 01–07 pass, with no new lint warnings.

- [ ] **Step 5: Commit** — `feat(db): staff create/update booking RPCs`

---

### Task 3: Admin data layer — ranges, source, write hooks, error codes

**Files:**
- Modify: `src/data/admin.ts`
- Test: `src/data/admin.test.tsx`

**Interfaces:**
- Consumes: the RPCs from Tasks 1–2.
- Produces:
  - `AdminBooking` gains `source: 'online' | 'staff'`.
  - `fetchAdminBookings(from: Date, to: Date): Promise<AdminBooking[]>` and `useAdminBookings(from: Date, to: Date)`, with query key `['admin','bookings', toYmd(from), toYmd(to)]`.
  - `interface StaffBookingInput { serviceId: string; stylistId: string; date: Date; time: string; clientName: string; clientPhone: string; lang: Lang }`
  - `useCreateStaffBooking()` is a mutation of `StaffBookingInput` and resolves to the new id (`string`).
  - `useUpdateStaffBooking()` is a mutation of `StaffBookingInput & { id: string }`.
  - Both write hooks invalidate `['admin']` and `['slots']` on settle, like `useSetBookingStatus`.
  - `type AdminErrorCode = 'not_authorized' | 'invalid_name' | 'invalid_phone' | 'unknown_service' | 'outside_hours' | 'slot_taken' | 'not_found' | 'unknown'`
  - `toAdminError(err: unknown): AdminErrorCode`

- [ ] **Step 1: Write failing tests** in `admin.test.tsx`:
  - `useAdminBookings requests a range and maps source`: called with `(2030-01-06, 2030-01-12)`, expect rpc `admin_list_bookings` with `{ p_from: '2030-01-06', p_to: '2030-01-12' }`, and `data[0].source === 'staff'`.
  - `useCreateStaffBooking sends salon date and time`: expect rpc `admin_create_booking` with `{ p_service_id, p_stylist_id, p_date: '2030-01-08', p_time: '10:15', p_client_name, p_client_phone, p_lang }`, and the mutation resolves to the returned id.
  - `useUpdateStaffBooking sends p_id`: expect rpc `admin_update_booking` with `p_id` plus the same fields.
  - `toAdminError`: `{message:'slot_taken'}` → `'slot_taken'`, `{message:'boom'}` → `'unknown'`, `null` → `'unknown'`.
  - Update the existing one-day test to the new `(from, to)` signature.

- [ ] **Step 2: Run** `pnpm vitest run src/data/admin.test.tsx`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** these in `src/data/admin.ts`, keeping `toYmd` for dates. In `Schedule.tsx`, change the one call to `useAdminBookings(day, day)` so the build stays green until Task 7 replaces it.

- [ ] **Step 4: Run** `pnpm vitest run src/data/admin.test.tsx`, then `pnpm build`. Expected: PASS, and the build is clean.

- [ ] **Step 5: Commit** — `feat(admin): range bookings, source, staff write hooks`

---

### Task 4: Pure helpers — week and WhatsApp

**Files:**
- Create: `src/data/week.ts`, `src/data/whatsapp.ts`
- Modify: `src/components/Booking.tsx` (import the salon number from `whatsapp.ts`; drop the local constant)
- Test: `src/data/week.test.ts`, `src/data/whatsapp.test.ts`

**Interfaces:**
- Produces (`week.ts`):
  - `weekDays(day: Date): Date[]` — the 7 local-midnight dates from the Sunday on or before `day` to Saturday.
  - `isClosedDay(day: Date): boolean` — Sunday or Monday.
  - `dayOccupancy(bookings: AdminBooking[], day: Date, stylistCount: number): number` — booked minutes of non-cancelled bookings starting on `day` (salon date), divided by `(CLOSING_HOUR - OPENING_HOUR) * 60 * stylistCount`, clamped to 0..1; 0 when `stylistCount` is 0.
  - `staffTimeOptions(durationMin: number): string[]` — `"HH:MM"` from 09:00 in 15-minute steps, while start + duration ≤ 18:00.
  - `minutesToTime(min: number): string` and `salonMinutes(d: Date): number` (minutes since midnight in Algiers, via `formatAlgiersTime`).
- Produces (`whatsapp.ts`):
  - `SALON_WHATSAPP_NUMBER = '213561234567'` — the **placeholder** stays until the owner gives her number (spec, go-live step 4), with a comment saying so.
  - `toWaNumber(phone: string): string` — `'0555123456'` → `'213555123456'`.
  - `waLink(number: string, text?: string): string` — `https://wa.me/<number>`, plus `?text=<encodeURIComponent(text)>` when `text` is given.
  - `type ClientMessageKind = 'confirmed' | 'cancelled' | 'moved'`
  - `clientMessage(kind: ClientMessageKind, b: Pick<AdminBooking, 'clientName' | 'startsAt' | 'serviceName' | 'lang'>): string` — written in `b.lang`. Date via `formatLongDate(b.startsAt, b.lang)`, time via `formatAlgiersTime(b.startsAt)`, service `b.serviceName[b.lang]`. Exact copy, with `{name} {date} {time} {service}` substituted:
    - fr confirmed: `Bonjour {name}, votre rendez-vous du {date} à {time} ({service}) chez Élégance est confirmé. À bientôt !`
    - fr cancelled: `Bonjour {name}, nous sommes désolés : votre rendez-vous du {date} à {time} ({service}) chez Élégance est annulé. Répondez à ce message pour choisir un autre créneau.`
    - fr moved: `Bonjour {name}, votre rendez-vous chez Élégance a été déplacé au {date} à {time} ({service}). À bientôt !`
    - ar confirmed: `مرحباً {name}، تم تأكيد موعدكِ يوم {date} على الساعة {time} ({service}) في صالون Élégance. نراكِ قريباً!`
    - ar cancelled: `مرحباً {name}، نعتذر منكِ: تم إلغاء موعدكِ يوم {date} على الساعة {time} ({service}) في صالون Élégance. ردّي على هذه الرسالة لاختيار موعد آخر.`
    - ar moved: `مرحباً {name}، تم تغيير موعدكِ في صالون Élégance إلى يوم {date} على الساعة {time} ({service}). نراكِ قريباً!`

- [ ] **Step 1: Write failing tests:**
  - `weekDays(new Date(2030,0,8))` → 7 dates, first `2030-01-06` (Sun), last `2030-01-12`.
  - `isClosedDay` → true for 2030-01-06 and 2030-01-07, false for 2030-01-08.
  - `dayOccupancy`: two 60-minute bookings and one cancelled one on a day with 3 stylists → `120 / 1620`; 0 stylists → 0.
  - `staffTimeOptions(60)` starts `'09:00','09:15'`, ends `'17:00'`, length 33.
  - `toWaNumber('0555123456') === '213555123456'`.
  - `waLink('213555123456', 'a b')` === `'https://wa.me/213555123456?text=a%20b'`.
  - `clientMessage('confirmed', { clientName:'Yasmine', startsAt:<2030-01-08 10:00 Algiers>, serviceName:{fr:'Coupe & Brushing',ar:'قص'}, lang:'fr' })` === `'Bonjour Yasmine, votre rendez-vous du Mardi 8 janvier à 10:00 (Coupe & Brushing) chez Élégance est confirmé. À bientôt !'`.
  - The `ar` variant contains `'تم تأكيد موعدكِ'` and `'10:00'`.

- [ ] **Step 2: Run** `pnpm vitest run src/data/week.test.ts src/data/whatsapp.test.ts`. Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement both modules.** Swap `Booking.tsx` over to `SALON_WHATSAPP_NUMBER` / `waLink`.

- [ ] **Step 4: Run** the two files, then `pnpm vitest run src/components/Booking.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(admin): week and WhatsApp helpers`

---

### Task 5: `WeekStrip` and `DayColumns`

**Files:**
- Create: `src/components/admin/WeekStrip.tsx`, `src/components/admin/DayColumns.tsx`
- Modify: `src/context/LanguageContext.tsx` (keys below)
- Test: `src/components/admin/WeekStrip.test.tsx`, `src/components/admin/DayColumns.test.tsx`

**Interfaces:**
- Consumes: the `week.ts` helpers (Task 4), `AdminBooking` (Task 3), `Stylist` (`useStylists`), `OPENING_HOUR`/`CLOSING_HOUR`.
- Produces:
  - `WeekStrip({ day, bookings, stylistCount, onSelect }: { day: Date; bookings: AdminBooking[]; stylistCount: number; onSelect(d: Date): void })` — 7 day buttons with short day name and number. The selected day uses `aria-pressed="true"`. Closed days are disabled and dimmed. Each open day has a fill bar sized by `dayOccupancy`, with `aria-label` `"{dayName} {n} — {pct}%"`.
  - `DayColumns({ day, stylists, bookings, onSlotTap, onBookingTap }: { day: Date; stylists: Stylist[]; bookings: AdminBooking[]; onSlotTap(stylistId: string, time: string): void; onBookingTap(b: AdminBooking): void })`
    - one column per stylist (header = stylist name), with the hour gutter on the start side;
    - non-cancelled bookings drawn as buttons in their stylist's column, positioned by `salonMinutes`;
    - each booking shows the client name, service, a status style (confirmed rose / pending amber, as in the current `AppointmentBlock`), and a small source label (`t('schedule.source.online')` / `t('schedule.source.staff')`);
    - empty space is tappable in 30-minute cells. Each cell is a button with `aria-label` `"{stylist} {HH:MM}"` that calls `onSlotTap(stylistId, 'HH:MM')` (the sheet then offers 15-minute steps);
    - when the day is today, the now-line uses logical `start-`/`end-` positioning;
    - phone-first: 3 columns fit 320px. Hour height is the builder's choice.
- New i18n keys (fr / ar):
  - `schedule.source.online` = `via le site` / `عبر الموقع`
  - `schedule.source.staff` = `ajouté par vous` / `أضفتِه أنتِ`
  - `schedule.closed` = `Fermé` / `مغلق`

- [ ] **Step 1: Write failing tests:**
  - **WeekStrip:** renders 7 buttons. 2030-01-06 and 2030-01-07 are disabled. Clicking 2030-01-09 calls `onSelect` with that date. The selected day has `aria-pressed="true"`.
  - **DayColumns:** with 3 stylists, `getByText('Amina')`, `getByText('Leila')` and `getByText('Sara')` are present. A cancelled booking is not rendered. Clicking a booking calls `onBookingTap` with it.
  - **`slot tap sends salon wall-clock time`:** click the `"Sara 10:00"` cell → `onSlotTap('sara', '10:00')`. Run with `TZ=UTC`, using a booking whose `startsAt` is `2030-01-08T09:00:00Z` (= 10:00 Algiers): its button sits in the same row as the `"Sara 10:00"` cell (compare `style.top`).

- [ ] **Step 2: Run** `TZ=UTC pnpm vitest run src/components/admin`. Expected: FAIL.

- [ ] **Step 3: Implement both components.**

- [ ] **Step 4: Run** `TZ=UTC pnpm vitest run src/components/admin`, then the same without `TZ`. Expected: PASS both times.

- [ ] **Step 5: Commit** — `feat(admin): week strip and per-stylist day columns`

---

### Task 6: `BookingSheet` — add, edit, move, confirm, cancel, WhatsApp reply

**Files:**
- Create: `src/components/admin/BookingSheet.tsx`
- Modify: `src/context/LanguageContext.tsx`
- Test: `src/components/admin/BookingSheet.test.tsx`

**Interfaces:**
- Consumes: `useCreateStaffBooking`, `useUpdateStaffBooking`, `useSetBookingStatus`, `toAdminError` (Task 3); `staffTimeOptions` (Task 4); `toWaNumber`, `waLink`, `clientMessage` (Task 4); `useServices`, `useStylists`; `isValidPhone` (`src/data/bookings.ts`).
- Produces:
  - `type SheetState = { mode: 'add'; stylistId: string; date: Date; time: string } | { mode: 'edit'; booking: AdminBooking }`
  - `BookingSheet({ state, onClose }: { state: SheetState; onClose(): void })` — a modal sheet (`role="dialog"`, labelled by its title). It's bottom-anchored on phones and centred on wider screens.
- Behaviour:
  - **Form fields:** name, phone (with `dir="ltr"`), service (**all** services), stylist (all stylists), date (`<input type="date">`), time (`<select>` from `staffTimeOptions(service.duration)`), and client language (FR/AR toggle).
  - **Defaults in add mode:** stylist, date and time come from `state`, and the language is the current admin `lang`. In edit mode, every field comes from the booking.
  - **Client-side checks** (shown inline, nothing sent): name 2–80 characters after trimming; `isValidPhone`.
  - **Save** calls create or update. It's disabled while pending (to prevent a double submit).
  - **Errors** go through `toAdminError` → `t('admin.error.<code>')`, shown in a `role="alert"` inside the sheet. The sheet stays open with the fields kept.
  - **After a successful save:** in add mode the sheet closes. In edit mode, if the date, time or stylist changed, the sheet shows a "Prévenir la cliente" step with a WhatsApp link (`clientMessage('moved', updated)`). Otherwise it closes.
  - **Edit mode also shows:**
    - status badge and source label;
    - a phone tap-to-call link;
    - **Confirmer** when status ≠ confirmed;
    - **Annuler** when status ≠ cancelled (keeping the existing `window.confirm(t('admin.cancelConfirm'))`).
    - After either succeeds, the sheet shows the "Prévenir la cliente" step with `waLink(toWaNumber(phone), clientMessage('confirmed' | 'cancelled', booking))`, an `<a target="_blank" rel="noopener">`, and a "Fermer" button.
- New i18n keys (fr / ar):
  - `admin.sheet.addTitle` = `Nouveau rendez-vous` / `موعد جديد`
  - `admin.sheet.editTitle` = `Rendez-vous` / `الموعد`
  - `admin.sheet.name` = `Nom de la cliente` / `اسم الزبونة`
  - `admin.sheet.phone` = `Téléphone` / `الهاتف`
  - `admin.sheet.service` = `Prestation` / `الخدمة`
  - `admin.sheet.stylist` = `Styliste` / `الخبيرة`
  - `admin.sheet.date` = `Date` / `التاريخ`
  - `admin.sheet.time` = `Heure` / `الوقت`
  - `admin.sheet.lang` = `Langue de la cliente` / `لغة الزبونة`
  - `admin.sheet.save` = `Enregistrer` / `حفظ`
  - `admin.sheet.close` = `Fermer` / `إغلاق`
  - `admin.sheet.notifyTitle` = `Prévenir la cliente` / `إعلام الزبونة`
  - `admin.sheet.notifyWhatsapp` = `Envoyer sur WhatsApp` / `إرسال عبر واتساب`
  - `admin.error.invalid_name` = `Le nom doit contenir 2 à 80 caractères.` / `يجب أن يحتوي الاسم على 2 إلى 80 حرفًا.`
  - `admin.error.invalid_phone` = `Numéro de mobile algérien invalide.` / `رقم هاتف جزائري غير صالح.`
  - `admin.error.outside_hours` = `En dehors des horaires (9h–18h, fermé dimanche et lundi).` / `خارج أوقات العمل (9:00–18:00، مغلق الأحد والاثنين).`
  - `admin.error.slot_taken` = `Cette styliste a déjà un rendez-vous à cette heure.` / `هذه الخبيرة لديها موعد في هذا الوقت.`
  - `admin.error.unknown_service` = `Prestation ou styliste introuvable.` / `الخدمة أو الخبيرة غير موجودة.`
  - `admin.error.not_found` = `Ce rendez-vous n’existe plus.` / `هذا الموعد لم يعد موجودًا.`
  - `admin.error.unknown` = reuse the copy of `admin.actionError`.

- [ ] **Step 1: Write failing tests.** Mock `../../data/admin` with `importOriginal`, like `Schedule.test.tsx`, and mock `useServices` / `useStylists`:
  - **`add prefills stylist, date and time`:** state `{mode:'add', stylistId:'sara', date:2030-01-08, time:'10:00'}` → the stylist select value is `sara`, the time select value is `10:00`, and the service select lists every service (including `coupe-femme`, which Sara doesn't usually offer).
  - **`add sends a staff booking`:** fill in the name and `0555 12 34 56`, then Save → the create mutate is called with `{ serviceId, stylistId:'sara', time:'10:00', clientName:'Rania', clientPhone:'0555 12 34 56', lang:'fr', date }`.
  - **`invalid phone blocks save`:** phone `021 12 34 56` → inline error, mutate not called.
  - **`shows slot_taken message and keeps the sheet open`:** the mutate's `onError` gets `{message:'slot_taken'}` → an alert with the `admin.error.slot_taken` copy, the dialog is still present, and the name field still holds `Rania`.
  - **`save disabled while pending`:** with `isPending: true`, the Save button is disabled.
  - **`confirm offers WhatsApp reply in the client's language`:** edit mode, pending booking with `lang:'ar'`, phone `0555123456`. Click Confirmer and let the status mutation succeed. The link's href starts with `https://wa.me/213555123456?text=` and its decoded text contains `تم تأكيد موعدكِ`.
  - **`moving offers the moved message`:** edit mode, change the time, Save succeeds → the link's text contains `a été déplacé`.

- [ ] **Step 2: Run** `pnpm vitest run src/components/admin/BookingSheet.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** `BookingSheet.tsx` and the i18n keys.

- [ ] **Step 4: Run** the file. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(admin): booking sheet to add, edit and reply on WhatsApp`

---

### Task 7: Rebuild `Schedule` around week strip, columns, sheet and pending count

**Files:**
- Modify: `src/components/Schedule.tsx`, `src/components/Schedule.test.tsx`, `src/context/LanguageContext.tsx`
- Delete (only if present after the rebase): `src/data/timeline.ts`, `src/data/timeline.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces the `Schedule()` screen (no props, as today):
  - **Data:** one `useAdminBookings(weekDays(day)[0], weekDays(day)[6])` for the week. The day view filters it to `day`.
  - **Pending:** a second `useAdminBookings(algiersToday(), algiersToday() + 13 days)`. The count is the number of `status === 'pending'` bookings starting from now. It shows as a badge button `t('schedule.pendingCount')` (`{n} en attente` / `{n} في الانتظار`, with `{n}` substituted). Tapping the badge jumps `day` to the earliest pending booking's date. It's hidden when the count is 0.
  - **Layout:** day picker (keep prev/next/today) → `WeekStrip` → stats row (keep the four cards; occupancy now from `dayOccupancy` with the stylist count) → `DayColumns` → a floating **+** button (`aria-label` `t('admin.sheet.addTitle')`), which opens add mode at the selected day with the first stylist and the next free half-hour (or 09:00).
  - **Wider screens:** the existing sidebar list stays, but each row is a button that opens the sheet in edit mode. The inline Confirmer/Annuler buttons move into the sheet.
  - **`BookingSheet`** is rendered when `sheet !== null`.
  - Keep the `not_authorized` handling and the loading/error states as they are.

- [ ] **Step 1: Rewrite `Schedule.test.tsx`** for the new structure. Mock `useAdminBookings` by arguments: the week call returns the bookings, the pending call returns the pending ones. Mock `useStylists` with 3 stylists. Tests:
  - `renders one column per stylist`.
  - `tapping a booking opens the sheet in edit mode`: click Yasmine → a dialog with the `admin.sheet.editTitle` copy.
  - `a cancelled booking can still be restored from the sheet`: a cancelled booking in the sidebar list → open it → Confirmer → `mutate({id:'b1', status:'confirmed'}, …)`. This keeps the SP2 behaviour.
  - `+ opens the add sheet`.
  - `pending badge shows the count and jumps to that day`: 2 pending bookings, the earliest on 2030-01-10 → the badge text is `2 en attente`, and clicking it shows `Jeudi 10 janvier` in the day picker.

- [ ] **Step 2: Run** `pnpm vitest run src/components/Schedule.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Delete `timeline.ts` and its test if they are present.

- [ ] **Step 4: Run** `pnpm test` and `pnpm build`. Expected: the whole suite passes and the build is clean.

- [ ] **Step 5: Commit** — `feat(admin): phone-first schedule with week strip, columns and booking sheet`

---

### Task 8: Client success screen, Vercel config, docs

**Files:**
- Modify: `src/components/Booking.tsx`, `src/components/Booking.test.tsx`, `src/context/LanguageContext.tsx`, `CLAUDE.md`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `SALON_WHATSAPP_NUMBER`, `waLink` (Task 4).

- [ ] **Step 1: Write the failing test** in `Booking.test.tsx`, `success screen promises a WhatsApp confirmation from the salon`. After a successful booking:
  - the text `Le salon vous confirmera votre rendez-vous sur WhatsApp.` is shown;
  - there is **no** button named `t('booking.whatsappSend')`;
  - a link named `Une question ? Écrivez-nous sur WhatsApp` points to `https://wa.me/213561234567`.

- [ ] **Step 2: Run** `pnpm vitest run src/components/Booking.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `Booking.tsx`, remove the "send on WhatsApp" button and `buildWhatsAppMessage`, and add the contact link (`btn-ghost`, `MessageCircle` icon).
  - Copy:
    - `booking.successTitle` = `Demande envoyée !` / `تم إرسال طلبكِ!`
    - `booking.successText` = `Le salon vous confirmera votre rendez-vous sur WhatsApp.` / `سيؤكد لكِ الصالون موعدكِ عبر واتساب.`
    - new `booking.questionsWhatsapp` = `Une question ? Écrivez-nous sur WhatsApp` / `لديكِ سؤال؟ راسلينا عبر واتساب`
    - delete `booking.whatsappHint` and `booking.whatsappSend` if nothing else uses them.
  - `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
  - `CLAUDE.md`:
    - "Staff admin": owner schedule, sheet, staff RPCs, `source`;
    - "Booking flow": the success screen;
    - note that `SALON_WHATSAPP_NUMBER` in `src/data/whatsapp.ts` is a placeholder until the real number is known.

- [ ] **Step 4: Run** `pnpm test` and `pnpm build`. Expected: everything passes. `node -e "require('./vercel.json')"` exits 0.

- [ ] **Step 5: Commit** — `feat(booking): success screen promises WhatsApp confirmation; vercel rewrites`

---

### Task 9: End-to-end check on the local stack

**Files:** none (verification only; fixes go back to the owning task's files)

- [ ] **Step 1:** Run `supabase start -x logflare,vector,studio`, then `supabase db reset`, `supabase test db` and `supabase db lint --level warning`. Expected: 01–07 pass, with no new warnings.

- [ ] **Step 2:** Create a **local-only** staff user (auth admin API with the local service-role key, then `insert into private.staff`). Run the app with `VITE_SUPABASE_URL=<API_URL> VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> pnpm dev`. Book one service online from `/` (it shows as pending in `/admin`).

- [ ] **Step 3:** At a 390×844 viewport, in FR and AR, check these in `/admin`:
  1. three columns, and the week strip greys out Sunday and Monday;
  2. tap an empty Sara 11:00 cell, add a coupe-femme for Sara (any service for any stylist), and it appears in her column marked "ajouté par vous";
  3. try to add an overlapping booking → the "time taken" message, and the sheet stays open;
  4. confirm the online booking → the WhatsApp link opens `wa.me/213…` with the client-language message;
  5. move a booking → "Prévenir la cliente" appears;
  6. the pending badge counts and jumps;
  7. in AR the hour gutter sits on the right and nothing covers it.

  Expected: all seven hold.

- [ ] **Step 4:** Clean up: `supabase db reset` (removes the local user and bookings) and stop the dev server.

- [ ] **Step 5: Rollout (the user runs it):** `supabase db push --dry-run`, then `supabase db push`. These are the two new migrations. Note for the PR: the live database must be pushed before the frontend deploys, because the new UI calls `admin_create_booking` and reads `source`.
