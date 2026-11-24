# Subscription due dates and pausing online booking

## Why

Salons pay by hand (BaridiMob, CCP, cash), monthly or yearly. Nothing in the product knows whether a salon
has paid, so the only lever against a salon that stops paying is turning it off by hand. We want a gentle,
automatic lever that gets the salon to pay without hurting her clients or her reputation.

## Goals

- The product owner records, per salon, the date its subscription is paid until.
- The owner (salon) sees the due date coming in her `/admin`, and a stronger notice once it has passed.
- After a short grace period, **online booking pauses**: the site stays up, clients are pointed to the
  salon's WhatsApp, the owner's agenda keeps working.
- Paying again (the product owner extends the date) reopens online booking at once.

## Non-goals

- Collecting money in the app (no card payments, no BaridiMob integration).
- Automatic reminders by WhatsApp or e-mail (later, if wanted).
- Ending a contract / removing a salon (stays a manual decision, as today).

## Anti-goals (a failure even if it "works")

- Cancelling, hiding or changing any booking already made, at any stage.
- Blocking the owner's agenda, Réglages or Statistiques.
- Clients seeing anything about payment ("abonnement", "retard"): they only see that online booking is
  unavailable and how to reach the salon.
- Pausing the demo, or a salon that was never given a due date.
- A salon's payment status readable by anyone but its own staff and the product owner.

## Timeline (the user asked for a shorter grace than first proposed)

`paid_until` is the last day covered (Algiers date). With D = days past `paid_until`:

| When | Owner's `/admin` | Client page |
|---|---|---|
| D ≤ −6 | nothing | normal |
| −5 ≤ D ≤ 0 | quiet notice: "Votre abonnement est réglé jusqu'au 31 janvier." | normal |
| 1 ≤ D ≤ 3 (grace) | warning: "Votre abonnement a expiré le 31 janvier. Sans règlement, la réservation en ligne sera suspendue le 4 février." | normal |
| D ≥ 4 | alert: "La réservation en ligne est suspendue depuis le 4 février. Votre agenda fonctionne normalement. Réglez votre abonnement pour la rétablir." | booking section replaced by: "La réservation en ligne est momentanément indisponible. Contactez-nous sur WhatsApp." + the WhatsApp button (or the address/phone line when there is no WhatsApp) |

So the grace is 3 days (was 7, with the pause from day 15). The constants live in one SQL function so they
can be changed with one migration.

## Approach (chosen in the conversation)

Keep the money outside the app; the app only knows a due date and pauses online booking after the grace.

### Data

- `private.salon_billing (salon_id text primary key references salons, paid_until date not null,
  updated_at timestamptz)`, RLS on, no policies, no grants: the status is not on the public `salons`
  table, so visitors can't read who is late. A salon with no row is **not billed** (never paused): the
  demo, and every salon that exists today until the product owner gives it a date.
- `private.booking_paused(p_salon_id) returns boolean`: true when the salon has a row, is not a demo, and
  today (Algiers) > `paid_until` + 3 days. The single place the grace length is written.

### Enforcement (database)

- A `before insert` trigger on `private.bookings` for `source = 'online'` raises `booking_paused` when
  `private.booking_paused(new.salon_id)`. It covers `create_visit`, the older `create_booking` and any
  future online path without re-creating their long bodies (all-or-nothing: `create_visit` rolls back).
- `get_visit_slots` and `get_slots` raise `booking_paused` as their first statement (re-created from their
  latest bodies with that one check added), so a page left open learns about the pause when it asks for
  times.
- Owner functions (`admin_*`) are untouched: she can still add, move, confirm and cancel bookings.

### What the pages read

- Public `salon_booking_open(p_salon_id) returns boolean` (anon + authenticated): `not booking_paused`.
  Reveals nothing more than the page itself shows (the form is gone).
- Staff `admin_billing() returns jsonb` (`my_salon()`-scoped, `not_authorized` for non-staff):
  `{ paid_until, paused_from, state }` with `state` in `none | ok | soon | grace | paused`, or
  `{ state: 'none' }` without a row or for a demo salon. Computed in SQL so the browser's clock never
  decides.

### Client page

- `useBookingOpen()` (new, `src/data/queries.ts`) calls `salon_booking_open`. While it loads the wizard
  shows as today; when false the booking section (`#booking`) shows the paused message with the WhatsApp
  link from `useSalonInfo()`. Every "Réserver" on the page still scrolls there. If the call fails the
  wizard shows normally (the server still refuses, so failing open costs nothing).
- If `create_visit` / `get_visit_slots` answer `booking_paused` (the pause started while the page was
  open), the wizard swaps to the same message (`toBookingError` gets the code).
- Texts in `LanguageContext.tsx` (client page), FR + AR. No word about payment.

### Admin

- A notice at the top of the agenda (`Schedule`) and of Réglages, from `admin_billing()`, styles by state
  (quiet / warning / alert, with an icon + text, not colour alone). Not shown for `none` or for the `demo`
  role. Texts in `src/i18n/adminTranslations.ts`, FR + AR. Dates through the existing formatters.

### For the product owner: `pnpm salon-paid`

- `pnpm salon-paid` — lists every salon: name, paid until, state (not billed / ok / soon / grace / paused).
- `pnpm salon-paid <salon-id> --until 2027-01-31` — sets the date.
- `pnpm salon-paid <salon-id> --months 1` (or `--months 12`) — extends from the later of today and the
  current date, so paying late doesn't shorten the next period and paying early doesn't lose days.
- `pnpm salon-paid <salon-id> --stop` — removes the row (back to "not billed").
- Uses `.env.admin` (service role) like `new-salon`; prints the state before and after; refuses a demo
  salon. Writes through a `private.set_salon_paid_until` function callable only by the service role.
- `new-salon` doesn't set a date; its summary and `docs/new-salon-checklist.md` remind to run
  `salon-paid` once the first payment (or the free months) is settled.

## Tests

- pgTAP: each public booking function refuses a paused salon and accepts it on the last grace day; a
  salon without a row and a demo salon are never paused; `salon_booking_open`; `admin_billing` states and
  dates, scoped to the caller's salon; `set_salon_paid_until` not callable by anon/authenticated. New
  public functions registered in `10_isolation` and `11_guard`.
- Vitest: the booking section's paused message (FR/AR, with and without WhatsApp), the wizard swapping on
  `booking_paused`, the admin notice per state (and hidden for demo / none), the script's date maths.

## Left to the builder

File and component names, the notice's exact look within the admin's design system, the script's output
format.
