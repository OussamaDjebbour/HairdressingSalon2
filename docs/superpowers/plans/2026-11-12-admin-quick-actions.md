# Admin Quick Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the owner's daily job on her phone fast: approve a website booking in two taps (Confirmer → WhatsApp) from a waiting list or from the agenda, open bookings as a summary instead of an edit form, and give the screen back to the agenda.

**Architecture:** Front-end only — no database change. `BookingSheet` gains a summary step (shown first for existing bookings) and a clearer "message ready" step; a new `PendingSheet` lists bookings waiting for approval and reuses the same confirm/refuse/notify logic. `Schedule` loses its page title and the cards below the agenda in favour of one summary line, gets a sticky day bar holding the add button, and `DayColumns` scrolls sideways when columns get too narrow. `AdminShell`'s header keeps only the language switch and the settings gear.

**Tech Stack:** React 18 + TypeScript + React Query + Tailwind (project design tokens), Vitest + Testing Library.

**Spec:** The approved mockup `docs/superpowers/specs/assets/2026-11-12-admin-quick-actions-mockup.html` (open it in a browser: screens A, B, C with captions) plus the decisions below. Existing rules in `CLAUDE.md` (FR/AR via `t()`, logical CSS, lucide only, design classes) and the demo rules from Part 4 (role `demo`: no call shortcut, WhatsApp goes to the salon's number, masked phone).

## Global Constraints

- Branch `feat/admin-quick-actions`, stacked on `feat/part4-demo` (PR #12). No database migrations in this plan.
- **Approving = two taps:** "Confirmer", then "Envoyer sur WhatsApp". Same in the waiting list and in the booking summary.
- **Exact FR copy** (add AR translations for each): `À confirmer` · `via le site` · `il y a {n} min` / `il y a {n} h` / `il y a {n} j` · `Appeler` · `WhatsApp` · `Prestation` · `Coiffeuse` · `Prix` · `Confirmer` · `Refuser` · `Modifier ou déplacer` · `Message WhatsApp` · `Annuler le rendez-vous` · `{n} réservation à confirmer` / `{n} réservations à confirmer` · `Faite depuis le site. La cliente attend votre réponse.` / `Faites depuis le site. Les clientes attendent votre réponse.` · `{name} confirmée` · `Tout est confirmé.` · `Rendez-vous confirmé` · `Rendez-vous annulé` · `Prévenez {name} sur WhatsApp. Le message est prêt, vous pouvez le modifier avant l'envoi.` · `Envoyer sur WhatsApp` · `Plus tard` · summary line `{n} rendez-vous · {revenue} · {rate} % occupé` and `Prochain : {time}` / `Prochain : {weekday} {day} à {time}` / `Aucun rendez-vous à venir`.
- **Refuser** = cancel the booking (existing `admin_set_booking_status(…, 'cancelled')`), after the existing `admin.cancelConfirm` confirmation, then show the cancellation WhatsApp message (existing `clientMessage('cancelled', …)`).
- **Demo role (Part 4) keeps its rules everywhere:** no `Appeler`/tel shortcut; every WhatsApp link goes to the salon's number (`toWaNumber(salonInfo.whatsapp)`), not the client's; masked phone shown as is.
- Status colours/badges and the week strip stay as today. Logical CSS only; must work at 360 px; visible keyboard focus; respect reduced motion.
- Verify with `pnpm test && npx tsc -b` (and `pnpm build` for the last task).

## Review Focus

1. **Confirming fails** (slot taken since the client booked, network error) → the card/summary stays on the waiting state with the error message; it never shows "confirmée" or offers WhatsApp. (Tasks 1, 2.)
2. **The last waiting booking is confirmed in the list** → the confirmed row with its WhatsApp button stays visible; the heading becomes `Tout est confirmé.`; the pill disappears from the agenda after the sheet closes. (Task 2.)
3. **A waiting booking whose start time has passed** → not shown in the list or the pill count (same rule as today: `startsAt > now`). (Task 2.)
4. **Opening a booking from a notification deep link (`/admin?day=…&booking=…`)** → opens on the summary, not the form. (Tasks 1, 3.)
5. **Five active stylists on a 360 px phone** → each column stays readable (names not truncated to one letter) and the time labels stay visible while scrolling sideways. (Task 4.)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/admin.ts` | `AdminBooking.createdAt` |
| `src/data/formatters.ts` (+ test) | `formatAgo(date, now, lang)` |
| `src/components/admin/BookingSummary.tsx` (+ test) | summary view of one booking (screen B) |
| `src/components/admin/MessageReady.tsx` (+ test) | "message ready" step (screen C) |
| `src/components/admin/BookingSheet.tsx` (+ test) | steps: summary → edit form; status changes → MessageReady |
| `src/components/admin/useBookingActions.ts` | shared confirm/refuse + notice logic used by BookingSheet and PendingSheet |
| `src/components/admin/PendingSheet.tsx` (+ test) | waiting list (screen A) |
| `src/components/Schedule.tsx` (+ test) | no page title, sticky day bar with add button, summary line, waiting pill opens PendingSheet |
| `src/components/admin/DayColumns.tsx` (+ test) | horizontal scroll with sticky time gutter when narrow |
| `src/components/admin/AdminShell.tsx` (+ AdminPage test) | header: language + gear only; gear hidden on settings routes |
| `src/context/LanguageContext.tsx` | new keys fr + ar |

---

### Task 1: Booking summary and "message ready" in the booking sheet

**Files:** Modify `src/data/admin.ts` (map `created_at` → `createdAt: Date` on `AdminBooking`), `src/data/formatters.ts` (+ test), `src/components/admin/BookingSheet.tsx` (+ test); create `src/components/admin/BookingSummary.tsx`, `src/components/admin/MessageReady.tsx`, `src/components/admin/useBookingActions.ts` (+ tests); `src/context/LanguageContext.tsx`

**Interfaces:**
- `formatAgo(date: Date, now: Date, lang: Lang): string` — `< 60 min` → `il y a {n} min`, `< 24 h` → `il y a {n} h`, else `il y a {n} j` (AR equivalents).
- `useBookingActions()` → `{ confirm(b: AdminBooking): void; refuse(b: AdminBooking): void; pendingId: string | null; error: string | null; notice: Notice | null; clearNotice(): void }` — wraps `useSetBookingStatus`; `refuse` asks `window.confirm(t('admin.cancelConfirm'))` first; on success sets `notice = { kind: 'confirmed' | 'cancelled', booking }`; on error maps via `toAdminError` and keeps no notice. `Notice` is the existing type in BookingSheet (move it here and export it).
- `BookingSummary({ booking, onConfirm, onRefuse, onMessage, onCancel, onEdit, busy, error })` — screen B: status chip (`À confirmer` for pending; existing badge styles for confirmed/cancelled), source + `formatAgo(createdAt)` for online bookings, time range large (Fraunces) and long date, client card with name, phone (`formatPhone`), quick buttons `Appeler` (tel:) and `WhatsApp` (opens a chat without prefilled text), rows Prestation / Coiffeuse / Prix, then actions:
  - pending → primary `Confirmer`, secondary `Refuser`;
  - confirmed → primary `Message WhatsApp` (opens `MessageReady` with the confirmed message), secondary `Annuler le rendez-vous`;
  - cancelled → primary `Confirmer` (re-confirm, as today), no secondary;
  - always a text link `Modifier ou déplacer` → `onEdit`.
  - demo role: no `Appeler`; `WhatsApp` targets the salon's number.
- `MessageReady({ notice, onSend, onLater })` — screen C: check badge + `Rendez-vous confirmé` / `Rendez-vous annulé`, the lead sentence with the client's name, the prepared `clientMessage(kind, booking)` in a box, primary `Envoyer sur WhatsApp` (opens `waLink(number, message)`; demo → salon number), text link `Plus tard` (closes).
- `BookingSheet` for an existing booking opens on `BookingSummary`; `Modifier ou déplacer` switches to today's form (unchanged, with its own save → existing "moved" notice now rendered by `MessageReady`); add mode opens the form directly as today. The deep link (`?booking=`) therefore opens the summary.

- [ ] **Step 1: Failing tests:** `formatAgo` (5 min → `il y a 5 min`, 3 h, 2 j); summary for a pending online booking shows `À confirmer`, `via le site`, `14:00 – 16:00`, `Confirmer` and `Refuser`, and no form inputs; confirmed booking shows `Message WhatsApp` and `Annuler le rendez-vous`; tapping `Confirmer` calls `admin_set_booking_status(id, 'confirmed')` and then shows `Rendez-vous confirmé` with the prepared message and a link `href` starting `https://wa.me/213661223344?text=`; a failed confirm (mock rejects with `slot_taken`) shows the slot-taken error and **no** `Rendez-vous confirmé`; `Modifier ou déplacer` shows the existing form; demo role: no `Appeler`, WhatsApp href targets the salon number.
- [ ] **Step 2–4:** RED → implement → `pnpm test && npx tsc -b` GREEN (existing BookingSheet tests updated only where the summary now comes first — tap `Modifier ou déplacer` before form interactions).
- [ ] **Step 5: Commit** — `feat(admin): open bookings as a summary with confirm, WhatsApp and call`

---

### Task 2: Waiting list sheet

**Files:** Create `src/components/admin/PendingSheet.tsx` (+ test); modify `src/components/Schedule.tsx` (pill opens it), `src/context/LanguageContext.tsx`

**Interfaces:**
- `PendingSheet({ bookings, onClose })` — `bookings` = the waiting bookings Schedule already computes (`status === 'pending' && startsAt > now`), shown **oldest request first** (`createdAt` ascending). Heading `{n} réservation(s) à confirmer` with `n` = still-pending count; lead sentence singular/plural. Each card (screen A): start time large + short date (`ven. 13 nov.`), `formatAgo(createdAt)`, client name, `service · stylist · duration · price`, `Confirmer` / `Refuser` (via `useBookingActions`). After a successful confirm/refuse the card turns into a compact green (confirmed) or neutral (cancelled) row `{name} confirmée` / `{name} annulée` with its date/service and a `WhatsApp` button opening the prepared message directly (`waLink`, demo → salon number) — it stays until the sheet closes. When none are left pending, heading `Tout est confirmé.`. Tapping the card body (not a button) opens that booking's summary (`BookingSheet`) instead.
- Schedule: the `{n} en attente` pill opens `PendingSheet` (no longer jumps to the first day).

- [ ] **Step 1: Failing tests:** two pending bookings → heading `2 réservations à confirmer`, oldest request first; confirm the first → it shows `Nour K. confirmée` with a WhatsApp link and the heading becomes `1 réservation à confirmer`; confirm the second → `Tout est confirmé.`; refuse asks for confirmation and, if declined, calls nothing; a failed confirm keeps the card with the error; a pending booking in the past is not listed; Schedule: tapping the pill opens the sheet.
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5: Commit** — `feat(admin): waiting list to confirm website bookings in two taps`

---

### Task 3: The agenda gets the screen

**Files:** Modify `src/components/Schedule.tsx` (+ test), `src/context/LanguageContext.tsx` (remove unused keys `schedule.kicker`, `schedule.title` if unused elsewhere)

**Decisions:**
- Remove the page heading (`schedule.kicker` eyebrow + `schedule.title`).
- A **sticky day bar** at the top of the agenda (sticks under the header while scrolling): previous / long date / next, `Aujourd'hui` when not today, the waiting pill, and an add button (`Plus` icon + `Rendez-vous`, `aria-label` `Nouveau rendez-vous`) that calls the existing `openAdd`. **Remove the floating + button** (it covered the right-hand column).
- Under the grid, **one summary line** replaces the four stat cards and the "Prochain rendez-vous" card: `{n} rendez-vous · {revenue} · {rate} % occupé` then on the next line `Prochain : …`:
  - viewing today: the next non-cancelled booking after now today → `Prochain : 10:00`; if none today, the next one in the loaded window (`pendingQuery` data, non-cancelled, `startsAt > now`) → `Prochain : ven. 13 à 10:00`; none → `Aucun rendez-vous à venir`;
  - viewing another day: the first booking of that day → `Prochain : 10:00`, or nothing if the day is empty.
- The day list (bookings with phones) stays **only on large screens** (`lg:` sidebar), not on phones.

- [ ] **Step 1: Failing tests:** no `Le carnet du jour` / `Planning du jour` text; the summary line shows `4 rendez-vous`, `15 500 DA`, `19 % occupé` for the fixture day; viewing today with no bookings today but one tomorrow at 10:00 → `Prochain : ven. 13 à 10:00` (the bug in today's version); the add button in the day bar opens the add sheet; no element with the old floating-button class.
- [ ] **Step 2–4:** RED → implement → GREEN; check at 360 px in the browser that the date, pill and add button fit on one or two lines without overlap.
- [ ] **Step 5: Commit** — `feat(admin): agenda first — sticky day bar, one summary line`

---

### Task 4: Readable columns with many stylists

**Files:** Modify `src/components/admin/DayColumns.tsx` (+ test)

**Decisions:** each stylist column has a minimum width of `7rem` (112 px); when the columns don't fit, the grid scrolls sideways inside its card while the time gutter stays fixed on the start side (`position: sticky; inset-inline-start: 0`, with the card background so bookings pass under it). Booking blocks show the client name on one line and the service on the next, truncated with an ellipsis only inside the block.

- [ ] **Step 1: Failing tests:** with 5 stylists the scroll container has `overflow-x: auto` (class) and each column has the min-width class; the time gutter has the sticky class; with 3 stylists nothing changes (no forced scroll class needed — layout fills the width).
- [ ] **Step 2–4:** RED → implement → GREEN; browser check at 360 px with 5 stylists (local seed + test data) in FR and AR (RTL: gutter sticks on the right).
- [ ] **Step 5: Commit** — `feat(admin): day columns scroll sideways when there are many stylists`

---

### Task 5: Lighter header

**Files:** Modify `src/components/admin/AdminShell.tsx`, `src/pages/AdminPage.test.tsx` (+ SettingsPage test if needed)

**Decisions:** when logged in, the header shows the salon name, the language switch and the settings gear only. Logout is removed from the header (it is in Réglages → Compte). On `/admin/settings*` routes the gear is hidden (the page has its own back arrow).

- [ ] **Step 1: Failing tests:** logged in on `/admin`: no logout button in the header, gear link present; on `/admin/settings`: no gear in the header; logout still reachable from Réglages (existing SettingsPage test passes).
- [ ] **Step 2–4:** RED → implement → `pnpm test && npx tsc -b && pnpm build` GREEN.
- [ ] **Step 5: Commit** — `feat(admin): header keeps only language and settings`
