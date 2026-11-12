# Room finder: jump to a date and find room for a client — design

Approved mockup: `docs/superpowers/specs/assets/2026-11-12-room-finder-mockup.html` (screens A, B, C).

## Why

A client calls or writes on WhatsApp: "a coloration with Amina, maybe next week or the one after?" Today the owner has to tap the day arrow once per day (about 21 taps for three weeks ahead) and read each day's columns to see whether Amina has two free hours. The owner said that **going to a date further ahead** is what's hard, and that she does it to **check whether a day has room for a particular service with a particular coiffeuse**.

Success: from the agenda, in a few taps, she sees which days in the coming weeks have room for that service with that coiffeuse (or with anyone), picks a time, and lands in the "Nouveau rendez-vous" form already filled in, typing only the client's name and phone.

## Goals

1. **Jump to any date:** tapping the date in the sticky day bar opens a month calendar (a sliding sheet, like the others). Tapping a day closes it and moves the agenda to that day.
2. **See how full each day is (no filter):** each day shows a fill bar like the week strip (`dayOccupancy`). Closed days are greyed and not tappable. Today is ringed. Days with online requests still waiting show a small amber dot.
3. **Find room for a service and a coiffeuse (filter):** two pickers at the top of the sheet, "Prestation" and "Coiffeuse" (both default to "Toutes"). When a service is chosen, each open day shows how many start times fit:
   - green when there are 4 or more, amber for 1–3;
   - otherwise the reason: "complet" when nothing fits, or "absente" when the chosen coiffeuse doesn't work that day.
   With coiffeuse "Toutes", a start time counts if **any** coiffeuse is free for the whole service.
4. **Pick a time:** when a service is chosen, tapping a day lists its free start times as buttons under the calendar (screen B). Tapping a time closes the calendar, moves the agenda to that day, and opens "Nouveau rendez-vous" pre-filled with the service, the coiffeuse (the chosen one, or the first free one in the salon's order when "Toutes"), the date and the time (screen C). Everything stays editable.
5. Arrows move month by month, with no limit on how far ahead.

## Non-goals

- No change to the public booking site or its rules (`get_slots`, the 14-day window, the 30-minute online grid, `stylist_services`).
- No new database function or migration. Everything is computed in the browser from data the admin already loads.
- No search for a client by name or phone (a possible later feature).
- No drag gestures (swipe between months, swipe to close).

## Anti-goals (would make it a failure even if it "works")

- Showing a time as free when saving it would be refused (`slot_taken` / `outside_hours`), or hiding a time the owner could actually book.
- Making the plain "jump to a date" use slower: without a filter the calendar must work as a simple date picker, with one tap to a day.
- A calendar that breaks in Arabic (right to left) or on a 360 px phone.

## Rules for "a time fits"

These follow the **owner's** rules (as `admin_create_booking` enforces them), not the website's:
- The salon's hours that weekday (`salon_hours`) and its closed dates (`salon_closed_dates`), via `dayHours`.
- A 15-minute grid from opening time (`staffTimeOptions`); the service must **end** by closing time.
- No overlap with that coiffeuse's existing non-cancelled bookings (pending and confirmed both block), using each booking's stored start and length.
- Only **active** coiffeuses who **work** that day (`stylistWorks`: workdays and days off). A coiffeuse on her day off counts as "absente" here, even though the form lets the owner force a booking on a day off with a warning.
- Any coiffeuse can do any service (owner rule).
- Today: only start times after "now" (salon time). Past days show no counts and stay tappable to jump there.
- Duration: the chosen service's `duration`.

**Which times to show:** the free starts on the 15-minute grid, thinned out for the buttons. Show every free start on :00 or :30. Show a :15 or :45 start only if neither of its neighbours (15 minutes before and after) is free, i.e. when the quarter is the only way the service fits in that gap. The day's count is the number of times shown.

## Data

- Bookings: one `admin_list_bookings` query per visible month (`useAdminBookings(first day, last day)`, at most 31 days, within the RPC's range cap). The month the agenda already shows reuses React Query's cache where the keys match.
- Hours, closed dates, days off, services and stylists: the hooks Schedule already uses (`useSalonHours`, `useClosedDates`, `useStylistDaysOff`, `useAllServices`, `useAllStylists`).
- Waiting requests (amber dot): bookings in the month with `status === 'pending'`, `source === 'online'` and `startsAt > now`.
- The availability rules live in a pure, tested function in `src/data/` (next to `hours.ts` / `week.ts`), not inside the component.

## Interaction details

- Entry point: the date text in the day bar becomes a button (accessible name "Choisir un jour"). It keeps a tap area of at least 44 px and stays on one line.
- The calendar opens on the month of the day the agenda shows, with that day selected.
- Picking a service or coiffeuse updates the counts immediately; while the month's bookings load, days show a neutral placeholder rather than "complet".
- The chosen service and coiffeuse are remembered until the page is reloaded (state in Schedule), so reopening the calendar for the same client keeps them.
- Uses the shared `Sheet` frame and `useSheetMotion` (slides like the other sheets) and the existing `tap` class, palette tokens and `t()` for every string, in FR and AR.
- Accessibility: the grid is buttons with full labels (for example "Jeudi 19 novembre — 7 créneaux" / "— complet" / "— fermé"); closed days are disabled.

## Calls I made (owner can overrule)

- **The week starts on Sunday**, to match the week strip under the agenda (`weekDays`). The mockup used Monday first.
- **Green from 4 start times, amber from 1 to 3.**
- **"Toutes" pre-fills the first free coiffeuse** in the salon's usual order.
- **A coiffeuse's day off shows as "absente"** and offers no times. The owner can still book her from the form, with the existing warning.
- **The filter is remembered until reload**, not saved anywhere.

## Details settled after the builder check (my calls)

- **Neighbouring-month days** in the grid show a greyed date with no bar, count or dot, and stay tappable (they jump there). Only the visible month's own days are fetched (at most 31 days, within the `admin_list_bookings` cap of 30 days between first and last date).
- **"Toutes":** a start time counts if at least one coiffeuse is free for the whole service, and the quarter-hour thinning is applied to that combined set. Tapping a time pre-fills the first coiffeuse who is free at that time, in the order `useAllStylists` returns (the salon's order).
- **Pickers** list only active services and active coiffeuses. A booking's hidden service or coiffeuse is irrelevant here.
- **"Now":** the availability function takes `now` as an argument (for tests). Today's start times are compared to the current salon time, and the calendar recomputes on every render.
- **Labels with "Toutes":** a day where no coiffeuse works, or where the salon has no active coiffeuse, shows "complet". "absente" is only used when one specific coiffeuse is chosen.
- **Tapping a day:** without a service filter, it closes the calendar and jumps at once. With a service filter, it shows that day's times under the grid, plus a "Voir la journée" link to jump without picking a time.
- **Amber dot:** shown in both modes, small, in the corner of the cell, so it never competes with the bar or the count.
- **Pre-fill:** the coiffeuse chosen in the finder must survive the form's service-dependent defaults (`BookingSheet` picks the stylist's usual service only when no service is given).
- **Switching sheets:** the calendar slides away first, then the agenda moves, then "Nouveau rendez-vous" slides up, as when a waiting-list card opens a booking.

## Left to the builder

- Component split, names and file layout (inside `src/components/admin/`), and the exact visual details within the mockup.
- How the pre-filled service reaches the booking form. `SheetState`'s add mode currently has no service field, so an optional `serviceId` is the obvious route.
- Loading and error states, which should follow the existing `DataError` / spinner patterns.

## Verification

- Unit tests for the availability function: hours, closed date, day off, overlap with pending and confirmed bookings, a cancelled booking not blocking, end-by-closing, today after "now", the "Toutes" union, the quarter-hour thinning rule, and counts.
- Component tests: opening from the day bar, jumping to a day, filter counts and labels, tapping a time opens a pre-filled "Nouveau rendez-vous", closed days disabled.
- Browser check at 360 px in FR and AR, and on desktop.
