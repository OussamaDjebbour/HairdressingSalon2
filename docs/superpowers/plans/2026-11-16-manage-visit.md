# Owner Manages a Visit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the booking sheet, the owner removes one part of a multi-part visit (the others keep their times), or moves the whole visit to a new day/start time, all or nothing.

**Architecture:** Two new `security invoker` owner RPCs scoped by `private.my_salon()`: `admin_remove_visit_part` (cancel + detach one row) and `admin_move_visit` (shift every non-cancelled part, pre-checking clashes per part, with the overlap constraint made deferrable so the visit can't collide with its own old slots). The frontend adds a Retirer button per part and a Déplacer view in `BookingSheet`, then the usual MessageReady screen.

**Tech Stack:** Postgres/Supabase (plpgsql, pgTAP), Vite + React 18 + TypeScript + Tailwind + React Query + react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-16-manage-visit-design.md`

## Global Constraints

- Never edit a pushed migration. One new migration: `supabase/migrations/20261119100000_manage_visit.sql` (sorts after `20261118100200_visit_parts.sql`).
- Verification uses the local stack only: `supabase start -x logflare,vector,studio`, `supabase db reset`, `supabase test db`, `supabase db lint --level warning`. Never `--linked` or `db push`.
- Both functions: `security invoker`, `set search_path = ''`, `not_authorized` when `my_salon()` is null, never take a salon id; another salon's booking id behaves exactly like a missing one (`not_found`). Revoke from `public, anon, authenticated`, grant to `authenticated` — specific functions only, never `all functions in schema private`.
- `bookings_no_overlap` keeps the same definition (`exclude using gist (stylist_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')`), now `deferrable initially immediate`.
- Removed part: `status = 'cancelled'`, `visit_id = gen_random_uuid()`. Other parts unchanged (times, status).
- Move: owner rules (15-min grid for the chosen start via `private.staff_slot`, past dates allowed, no 14-day window, hours/closed dates and no-overlap apply, a stylist's day off only warns in the UI). Every non-cancelled part shifts by the same amount; price and duration kept; status kept.
- Error codes (exact): `not_found`, `last_part`, `not_movable`, `visit_spans_days`, `outside_hours`, `unknown_service`, `slot_taken` with `detail = 'item:<n>'` (0-based, start order of the non-cancelled parts).
- Retirer and Déplacer only on visits with **2+ non-cancelled parts**; Déplacer only when those are `pending`/`confirmed` and on one Algiers date.
- After either action: toast, MessageReady, sheet closes on Send/Later (as today).
- Every user-facing string through `t()` with keys in **both** `fr` and `ar`; logical CSS; lucide-react icons only; palette tokens; no `window.confirm` (use `useConfirm`, `danger: true` for Retirer).
- The demo role may use both actions (no extra rule).

## Review Focus

1. **Same stylist on consecutive parts, small shift** (Amina 10:00 Coupe + 11:00 Coloration, moved to 10:30): the new Coupe overlaps the old Coloration slot; the move must succeed. Test: Task 1 `move: same stylist back to back shifts 30 min later`.
2. **Moving so the last part ends after closing** (18:00): `outside_hours`, nothing moves; the form says so before submit. Tests: Task 1 `move: last part past closing is outside_hours, nothing moved`; Task 4 `warns when the visit would end after closing`.
3. **A stale sheet removes a part twice** (other tab/phone already removed it): second call → `not_found`, no other row touched. Test: Task 1 `remove: an already-cancelled part is not_found`.
4. **`p_stylists` naming a booking outside the visit** (crafted or stale): that booking is never touched. Test: Task 1 `move: p_stylists keys outside the visit are ignored`.
5. **Confirmer after a Retirer** must not revive the removed part. Test: Task 1 `remove: confirming the visit afterwards leaves the removed part cancelled`.

---

### Task 1: Database — deferrable overlap rule, `admin_remove_visit_part`, `admin_move_visit`

**Files:**
- Create: `supabase/migrations/20261119100000_manage_visit.sql`
- Create: `supabase/tests/database/22_manage_visit.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (new assertions + `plan(N)`)
- Modify: `supabase/tests/database/11_guard.test.sql:35-41` (add `'admin_remove_visit_part', 'admin_move_visit'`)
- Modify: `CLAUDE.md` ("Staff admin" paragraph: the two functions, detach rule, deferrable constraint)

**Interfaces:**
- Consumes: `private.my_salon()`, `private.staff_slot(text, date, text, integer)` (`20261113100100_settings_rules.sql`), `private.day_hours(text, date)`, `private.bookings.visit_id`.
- Produces:
  - `public.admin_remove_visit_part(p_id uuid) returns void`
  - `public.admin_move_visit(p_id uuid, p_date date, p_time text, p_stylists jsonb) returns void` — `p_stylists` is `{"<booking uuid>": "<stylist id>", …}`, `'{}'` or null = keep all.

- [ ] **Step 1: Write the failing pgTAP file `22_manage_visit.test.sql`**

Same setup style as `21_visit_owner.test.sql` (owner `1111…` in `elegance`, `pg_temp.act_as`, `set local role authenticated`; insert fixtures as superuser before `set local role`, `reset role` to add more). Date `2030-01-08` (Tuesday, 09:00–18:00); `2030-01-07` is Monday (closed). Fixtures: visit V = Amina `coupe-femme` 10:00–11:00 + Amina `coloration` 11:00–13:00 (same `visit_id`, `pending`); visit W = Amina coupe 14:00–15:00 + Sara `manucure` 15:00–15:45; visit X = Sara coupe 09:00–10:00 + Sara manucure 16:00–16:45 (a gap); visit Y = two parts on different dates (08 and 09); a lone booking L; a blocker B (Sara, 2030-01-10 11:00–12:00, confirmed). Assertions (names exact):

- `remove: cancels the part and detaches it` — after `admin_remove_visit_part(<V coloration>)`: that row `cancelled` with `visit_id <> V`; V's coupe still `pending`, same `starts_at`.
- `remove: confirming the visit afterwards leaves the removed part cancelled` — `admin_set_booking_status(<V coupe>, 'confirmed')` then the removed row is still `cancelled`.
- `remove: an already-cancelled part is not_found` — calling it again → `throws_ok(…, 'P0001', 'not_found', …)`.
- `remove: the last non-cancelled part is last_part` — on V's coupe (now alone) → `last_part`; on L → `last_part`.
- `remove: unknown id is not_found`.
- `move: shifts every part, keeps gaps` — `admin_move_visit(<X part>, '2030-01-10', '10:00', '{}')`: X parts now 10:00–11:00 and 17:00–17:45 on the 10th; prices unchanged.
- `move: same stylist back to back shifts 30 min later` — W-like fixture with Amina on both parts moved by +30 min lives; new ranges 10:30–11:30, 11:30–13:30.
- `move: keeps status and stored duration` — a `confirmed` visit stays `confirmed`; a part whose `ends_at - starts_at` differs from the service's current duration keeps its own length.
- `move: changes a stylist` — `p_stylists = {"<W manucure>": "amina"}` moves W and the manucure is now Amina's.
- `move: clash names the part` — moving W to 2030-01-10 so its Sara part lands on B → `slot_taken` with detail `item:1`, nothing moved. pgTAP can't read the detail directly: call it in a `do` block that catches `others`, saves `PG_EXCEPTION_DETAIL` (via `get stacked diagnostics`) into a temp table, then `is(<saved detail>, 'item:1', …)`.
- `move: two parts given the same stylist overlap is slot_taken` — a visit whose two parts overlap in time with different stylists (insert as fixture), `p_stylists` gives both Amina → `slot_taken`, detail `item:1`.
- `move: last part past closing is outside_hours, nothing moved` — V-like visit (3 h total) to `'16:00'` → `outside_hours`; rows unchanged.
- `move: closed day is outside_hours` — to `'2030-01-07'`.
- `move: off-grid start is outside_hours` — `'10:10'`.
- `move: parts on different days is visit_spans_days` — Y.
- `move: a cancelled or single visit is not_movable` — L, and a fully cancelled visit.
- `move: unknown stylist is unknown_service` — `{"<id>": "nobody"}`; also another salon's stylist id if one exists in seed (else skip).
- `move: p_stylists keys outside the visit are ignored` — include L's id → `"sara"`; L unchanged.
- `move: cancelled parts of the visit stay put`.
- `move: the overlap rule is immediate again afterwards` — after a successful move, a direct conflicting `insert` (as superuser) in the same transaction raises `exclusion_violation` immediately (`throws_ok(…, '23P01')`).

- [ ] **Step 2: Run to verify it fails**

Run: `supabase db reset && supabase test db`
Expected: `22_manage_visit` fails (functions don't exist); other files pass.

- [ ] **Step 3: Write the migration**

1. `alter table private.bookings drop constraint bookings_no_overlap;` then re-add it identically plus `deferrable initially immediate`.
2. `admin_remove_visit_part(p_id uuid)`: lock the row (`for update`) where `id = p_id and salon_id = my_salon() and status <> 'cancelled'` → else `not_found`; if no **other** non-cancelled row shares its `visit_id` in the salon → `last_part`; update that row only.
3. `admin_move_visit(...)`:
   - Load the visit's non-cancelled rows in the caller's salon (via the row `p_id`, any status; `not_found` if `p_id` isn't in the salon), `for update`, ordered by `starts_at` → index `n`.
   - Fewer than 2 rows, or any row not `pending`/`confirmed` → `not_movable`. Distinct `(starts_at at time zone 'Africa/Algiers')::date` > 1 → `visit_spans_days`.
   - New first start: `private.staff_slot(my_salon, p_date, p_time, <first part's minutes>)`. Delta = new first start − old first start. Each part: new range = old range + delta, stylist = `p_stylists ->> id::text` if present else current; a present stylist id not in `public.stylists` for the salon → `unknown_service`. Each new range must sit inside `private.day_hours(salon, p_date)` (`outside_hours`).
   - Pre-check in index order: first part `n` whose new range overlaps (same stylist, `&&`) a non-cancelled booking of the salon **not in this visit**, or the new range of an earlier part of this visit → `raise exception 'slot_taken' using errcode = 'P0001', detail = 'item:' || n`.
   - `set constraints private.bookings_no_overlap deferred;` update all parts; `set constraints private.bookings_no_overlap immediate;` (forces the check now). Wrap in `exception when exclusion_violation then raise exception 'slot_taken' using errcode = 'P0001';`.
4. Revoke/grant as in Global Constraints.

- [ ] **Step 4: Register in isolation and guard tests**

`10_isolation.test.sql`: as elegance staff, `admin_remove_visit_part(<rival booking id>)` → `not_found`; `admin_move_visit(<rival booking id>, …)` → `not_found`; `admin_move_visit(<own visit>, …, '{"<own part>": "<rival stylist id>"}')` → `unknown_service`; rival rows unchanged. Update `plan(N)`. `11_guard.test.sql`: add both names.

- [ ] **Step 5: Run to verify it passes**

Run: `supabase db reset && supabase test db && supabase db lint --level warning`
Expected: all files pass; lint reports no new warnings.

- [ ] **Step 6: Update CLAUDE.md and commit**

In "Staff admin": `admin_remove_visit_part` (cancels + detaches one part; others keep times; `last_part`), `admin_move_visit` (moves every non-cancelled part of a one-day visit by the same amount; `slot_taken` + `item:<n>`; `visit_spans_days`, `not_movable`), and that `bookings_no_overlap` is `deferrable initially immediate` (only `admin_move_visit` defers it).

```bash
git add supabase/migrations/20261119100000_manage_visit.sql supabase/tests/database/ CLAUDE.md
git commit -m "feat(db): owner removes one part of a visit or moves the whole visit"
```

---

### Task 2: Data layer — hooks, error codes, "visit changed" message, strings

**Files:**
- Modify: `src/data/admin.ts` (hooks, `AdminErrorCode`, `ADMIN_ERROR_CODES`, `liveParts`, `canManageVisit`)
- Modify: `src/data/whatsapp.ts` (`ClientMessageKind` gains `'changed'`)
- Modify: `src/context/LanguageContext.tsx` (all keys below, `fr` + `ar`)
- Test: `src/data/admin.test.tsx`, `src/data/whatsapp.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs; `failedItem(err)` from `src/data/bookings.ts` (reuse it; do not duplicate).
- Produces:
  - `removeVisitPart(id: string): Promise<void>`, `useRemoveVisitPart()` (via `useAdminWrite`)
  - `interface MoveVisitInput { id: string; date: Date; time: string; stylists: Record<string, string> }`, `moveVisit(input): Promise<void>` (sends `p_date: toYmd(date)`), `useMoveVisit()`
  - `liveParts(v: AdminVisit): AdminBooking[]` — non-cancelled parts, by start.
  - `canManageVisit(v: AdminVisit): { remove: boolean; move: boolean }` — `remove`: ≥2 live parts; `move`: `remove` and every live part `pending`/`confirmed` and all on one `salonDate`.
  - `AdminErrorCode` adds `'last_part' | 'not_movable' | 'visit_spans_days'`.
  - `clientMessage('changed', …)`.

- [ ] **Step 1: Write failing tests**

- `liveParts drops cancelled parts`; `canManageVisit: two live parts → remove and move`; `… one live part + one cancelled → neither`; `… parts on two dates → remove only`; `… a cancelled visit → neither`.
- `toAdminError maps last_part, not_movable, visit_spans_days`.
- `moveVisit sends p_id, p_date as YYYY-MM-DD, p_time, p_stylists` (mocked `supabase.rpc`, as existing admin tests do).
- `clientMessage changed (fr)` equals `Bonjour Nadia, votre rendez-vous chez Élégance est maintenant : Coupe & Brushing, le mardi 18 novembre à 10:00. À bientôt !` (match the date format `formatLongDate` produces in the existing `moved` test); `(ar)` contains the service and time.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/data`
Expected: FAIL (missing exports / kind).

- [ ] **Step 3: Implement**

Templates (exact copy):
- fr `changed`: `Bonjour ${v.name}, votre rendez-vous chez ${v.salon} est maintenant : ${v.service}, le ${v.date} à ${v.time}. À bientôt !`
- ar `changed`: `مرحباً ${v.name}، أصبح موعدكِ في صالون ${v.salon}: ${v.service}، يوم ${v.date} على الساعة ${v.time}. نراكِ قريباً!`

Translation keys (fr / ar):
- `admin.error.last_part`: `C’est la dernière prestation de la visite : utilisez Annuler.` / `هذه آخر خدمة في الزيارة: استعملي «إلغاء».`
- `admin.error.not_movable`: `Cette visite ne peut pas être déplacée.` / `لا يمكن تغيير موعد هذه الزيارة.`
- `admin.error.visit_spans_days`: `Les prestations de cette visite sont sur plusieurs jours : déplacez-les une par une.` / `خدمات هذه الزيارة موزعة على عدة أيام: غيّري موعد كل واحدة على حدة.`
- `admin.summary.removePart`: `Retirer` / `إزالة`; `admin.summary.removePartLabel`: `Retirer {service}` / `إزالة {service}`
- `admin.removePart.title`: `Retirer cette prestation ?` / `إزالة هذه الخدمة؟`; `admin.removePart.text`: `{service} sera retirée de la visite de {name}. Les autres prestations gardent leur heure.` / `ستُزال {service} من زيارة {name}. تبقى الخدمات الأخرى في وقتها.`; `admin.removePart.confirm`: `Retirer` / `إزالة`; `admin.removePart.keep`: `Garder` / `إبقاء`
- `admin.summary.moveVisit`: `Déplacer la visite` / `تغيير موعد الزيارة`
- `admin.move.title`: `Déplacer la visite` / `تغيير موعد الزيارة`; `admin.move.submit`: `Déplacer` / `تغيير الموعد`; `admin.move.partTaken`: `{service} : {stylist} est déjà prise à {time}.` / `{service}: {stylist} لديها موعد على الساعة {time}.`
- `admin.ready.changed`: `Visite modifiée` / `تم تعديل الزيارة`
- `admin.toast.partRemoved`: `Prestation retirée` / `تمت إزالة الخدمة`; `admin.toast.visitMoved`: `Visite déplacée` / `تم تغيير موعد الزيارة`

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/data && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/data src/context/LanguageContext.tsx
git commit -m "feat(admin): data hooks and messages for removing a part and moving a visit"
```

---

### Task 3: Retirer in the booking sheet

**Files:**
- Modify: `src/components/admin/BookingSummary.tsx` (Retirer per live part; list shows live parts only; total of live parts)
- Modify: `src/components/admin/BookingSheet.tsx` (wire the action, notice)
- Test: `src/components/admin/BookingSheet.test.tsx` (wrap in `FeedbackProvider`, as existing tests do)

**Interfaces:**
- Consumes: Task 2 `useRemoveVisitPart`, `liveParts`, `canManageVisit`, `clientMessage` kind `'changed'`, `Notice` from `useBookingActions.ts`.
- Produces: `BookingSummary` prop `onRemovePart(part: AdminBooking): void`.

- [ ] **Step 1: Write failing tests**

- `shows Retirer on each part of a two-part visit` (buttons with accessible names `Retirer Coupe & Brushing`, `Retirer Coloration`).
- `no Retirer on a visit of one` and `no Retirer when the other part is cancelled`.
- `Retirer asks first, then calls admin_remove_visit_part with that part's id` (confirm dialog title `Retirer cette prestation ?`, text names service and client; Cancel → no RPC).
- `after Retirer: toast "Prestation retirée" and the changed message names the remaining service and its start` (MessageReady title `Visite modifiée`).
- `Retirer error shows inline` (`last_part` → its message in the alert).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/components/admin/BookingSheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`BookingSummary`: render `liveParts(visit)` (keep `aria-current` on the opened part); when `canManageVisit(visit).remove`, each row ends with a `btn-ghost btn-sm` Retirer (`text-rust-700`, `aria-label` = `removePartLabel`). `BookingSheet`: `onRemovePart` → `useConfirm({ title, text, confirmLabel: t('admin.removePart.confirm'), cancelLabel: t('admin.removePart.keep'), danger: true })` → `useRemoveVisitPart().mutate(part.id)` → on success `toast`, then `setNotice({ kind: 'changed', booking: { first remaining part's startsAt, client fields from editing, serviceName joined from remaining live parts } })`; on error show `t('admin.error.<code>')` inline like `actions.error`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/components/admin && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin
git commit -m "feat(admin): remove one service from a visit"
```

---

### Task 4: Déplacer la visite

**Files:**
- Create: `src/components/admin/MoveVisitForm.tsx`
- Create: `src/components/admin/MoveVisitForm.test.tsx`
- Modify: `src/components/admin/BookingSummary.tsx` (Déplacer button, prop `onMove(): void`)
- Modify: `src/components/admin/BookingSheet.tsx` (`view` adds `'move'`; title `admin.move.title`; back-to-summary link like the edit form)

**Interfaces:**
- Consumes: Task 2 `useMoveVisit`, `MoveVisitInput`, `liveParts`, `canManageVisit`, `failedItem` (`src/data/bookings.ts`); existing `DateField`, `SelectField`, `staffTimeOptions`, `salonMinutes`, `salonDate`, `dayHours`, `stylistWorks`, `useSalonHours`, `useClosedDates`, `useStylistDaysOff`, `useStylists`.
- Produces: `MoveVisitForm({ visit: AdminVisit; onMoved(newStart: Date, stylists: Record<string, string>): void; onBack(): void })`.

- [ ] **Step 1: Write failing tests (`MoveVisitForm.test.tsx`)**

- `prefills the visit's date, first start time and each part's stylist`.
- `shows each part's new time as the start changes` (start 14:00 → rows `14:00 Coupe…`, `15:00 Coloration…`; a gap in the visit is kept).
- `time options fit the whole visit` (no option where the last part would end after closing; uses the visit span = last end − first start).
- `warns when the visit would end after closing` on a day with shorter hours than the current start allows (text `admin.error.outside_hours`), submit disabled.
- `warns when a chosen stylist is off that day` (`schedule.stylistOff` text), submit still enabled.
- `submits id, date, time and only changed stylists` (`p_stylists` contains only parts whose stylist changed).
- `slot_taken with item:1 names that part` → `Coloration : Sara est déjà prise à 15:00.`
- In `BookingSheet.test.tsx`: `Déplacer shows only for a movable visit` (hidden for a visit of one, a cancelled visit, a visit over two days) and `after a move: toast "Visite déplacée" and the moved message with all services and the new start`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/components/admin`
Expected: FAIL.

- [ ] **Step 3: Implement**

`MoveVisitForm`: react-hook-form like the edit form; fields: `DateField` (date), `SelectField` (start, options `staffTimeOptions(spanMinutes, dayHours(...))` where `spanMinutes` = last live part end − first start in minutes; keep the current time selectable), then one row per live part: computed new time (`dir="ltr"`) + service name + `SelectField` stylist (active stylists plus the part's current one). Submit: `useMoveVisit().mutate({ id: visit.first.id, date, time, stylists: changed only })`; on `slot_taken` with `failedItem(err) = n` show `admin.move.partTaken` filled from live part `n` (its service, the chosen stylist's name, its new time); other errors `admin.error.<code>`. Errors inline (`role="alert"`). `BookingSheet`: `onMoved` → toast `visitMoved` → `setNotice({ kind: 'moved', booking: { startsAt: newStart, client fields from editing, serviceName: visit.serviceName (live parts) } })`. Discard-changes prompt on close works like the edit view.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test && npx tsc -b && pnpm build && pnpm check:bundle`
Expected: all Vitest pass; build ok; public bundle check passes (admin code stays out).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin
git commit -m "feat(admin): move a whole visit to a new day and time"
```

---

## Final check (after Task 4)

- [ ] `supabase db reset && supabase test db && supabase db lint --level warning` all green; `pnpm test`, `pnpm build`, `pnpm check:bundle` green.
- [ ] Manual check on the local stack at 360 px, FR and AR: remove a part from a two-part visit; move a visit with Amina on two back-to-back parts by +30 min; move into a clash and read the message.
- [ ] New Arabic strings listed in the PR description for the native-speaker check.
- [ ] PR description notes the rollout order: push the 5 pending migrations + `20261119100000_manage_visit.sql` **before** publishing the front end.
