# Several services in one visit — design

Date: 2026-11-16. Status: requested by the user, who chose to skip the design questions. Everything not stated
by the user below is **my call** (marked), to be checked by the user when the work is handed over.

## Why
Clients can book only one service at a time. Real visits combine services (a cut and a colour, a manicure and a
facial), so a client has to book twice, and the two bookings aren't connected for the owner.

## What the user said
- A client can select **several services** in one booking.
- They happen **one after the other**.
- **Each service can be with a different staff member.**

## Goals
1. In the public booking wizard the client ticks 1–4 services, chooses a staff member (or "no preference") for each,
   picks **one start time**, and books them all in one go.
2. The services are placed back to back from that start time, in the order below, each with its own staff member.
3. The owner sees each part in the right staff member's column as today, sees that the parts belong together, and
   confirms or cancels **the whole visit at once**; she gets **one** notification and sends **one** WhatsApp message.
4. Nothing else gets worse: single-service booking works exactly as before (it is a visit of one); salon isolation,
   abuse limits, hours, closed dates, days off and the no-overlap rule all still hold.

## Non-goals
- The owner creating a multi-service visit from her agenda (she adds parts one by one, as today).
- Gaps between services, parallel services (two staff at the same time), or a client-chosen order.
- Packages / discounts for combinations.

## What the user said about unavailable parts (2026-11-16)
"The client should know that this service or stylist is not available and can book the rest." So a part that
can't be booked never blocks the others: the client is told **which** service (or which staff member) is the
problem and **chooses** to book the rest or to change her choice.

## Anti-goals
- A visit half-booked behind the client's back: the client always sees what will be booked before it is booked;
  each `create_visit` call is all-or-nothing for the parts it is given, and on failure says which part failed.
- One visit counting as several bookings against the client's abuse limits.
- The owner confirming one part and forgetting the others.

## Decisions (my calls unless noted)
- **Data model:** each service stays its own row in `private.bookings` (so the agenda, columns, overlap
  constraint, editing and statuses keep working). A new column `visit_id uuid not null default gen_random_uuid()`
  links the rows of one visit; existing rows and single bookings get their own id (a visit of one). Index
  `(salon_id, visit_id)`. Never edit pushed migrations: one new migration.
- **Order of services:** the salon's service order (`services.sort_order`, then name) — the owner controls it, and
  it usually matches how a salon chains services (e.g. colour before brushing). Not the order the client ticks.
- **Maximum 4 services** per visit (`too_many_services` error otherwise).
- **Placement:** start time T on the existing 30-minute online grid from that day's opening; part k starts at
  T + the durations of the parts before it; the whole visit must end by closing time; T must be in the future and
  within the 14-day window. A part with "no preference" is auto-assigned like today (offering, active staff who
  work that day, in staff sort order, first one free for that part's time range). Different parts may get the same
  or different staff. A part with a chosen staff member requires that member to offer the service and be active.
- **New public functions** (take `p_salon_id`, `security definer`, salon-scoped like the others):
  - `get_visit_slots(p_salon_id text, p_date date, p_items jsonb) returns table (slot text, available boolean,
    missing integer[])` — `p_items` = `[{"service_id": "...", "stylist_id": "..." | null}, ...]` (1–4), already in
    visit order. For each start time on the grid: `missing` = the 0-based indexes of the parts that can't be placed
    at their time in the full sequence (no free, working, offering staff, or past closing); `available` = `missing`
    is empty (and the start is in the future). A part that can't be done that day at all appears in `missing` for
    every slot — the frontend turns that into a day-level message. Same errors as `get_slots` (`unknown_service`)
    plus `too_many_services`; an empty or malformed list → `unknown_service`.
  - `create_visit(p_salon_id text, p_items jsonb, p_date date, p_time text, p_client_name text,
    p_client_phone text, p_lang text) returns table (booking_id uuid, service_id text, stylist_id text,
    starts_at timestamptz)` — validates like `create_booking`, inserts all parts in one transaction with the same
    `visit_id` and `source = 'online'`, status `pending`; any part impossible → `slot_taken` and **nothing** is
    inserted; the error says which part: `raise exception 'slot_taken' using detail = 'item:<index>'` (0-based
    index into `p_items`), surfaced to the frontend through the Supabase error's `details`.
  - Isolation tests for both in `10_isolation.test.sql` and registration in `11_guard.test.sql`.
- **Abuse limits count visits, not rows** (distinct `visit_id`), in `create_visit` **and** in the existing
  `create_booking`: per phone ≥ 3 future online visits, per IP ≥ 5 online visits in an hour, site-wide ≥ 20 online
  visits in 10 minutes (same numbers as today).
- **`get_slots` / `create_booking` stay** (a visit of one), so an open old page keeps working during a deploy; the
  new frontend uses only the new functions.
- **Notification:** one push per visit. `create_visit` suppresses the per-row trigger (a transaction-local
  setting, like the demo's `app.demo_fake_bookings`) and posts one push whose payload adds the list of parts
  (service names in order, staff names); `supabase/functions/_shared/notify.ts` writes e.g. "Lina — Coupe &
  Brushing + Coloration, mar. 12 à 10:00" (with its Vitest). Single bookings unchanged.
- **Owner side:**
  - `admin_list_bookings` also returns `visit_id` (drop + recreate from its **latest** definition in
    `20261115100050_demo_restrictions.sql`, keeping the demo phone masking).
  - `admin_set_booking_status(p_id, p_status)` applies to **every row of that booking's visit** (same salon);
    a confirm that would overlap → `slot_taken`, nothing changed.
  - Agenda blocks stay per part. The booking sheet of a part that belongs to a multi-part visit shows the whole visit
    (each part: time, service, staff; total price); Confirmer / Refuser / Annuler act on the visit; the WhatsApp
    message names all services ("Coupe & Brushing + Coloration") with the first start time.
  - Waiting list (PendingSheet) and the pending badge count **visits**: one card per visit listing its parts and the
    total.
  - Editing / moving (`admin_update_booking`) stays per part.
- **Client wizard** (`src/components/Booking.tsx`):
  - Step 1 (service): services become toggles; a sticky summary shows "2 prestations · 8 500 DA · 3 h" and
    Continuer. A photo tile tap pre-selects that one service (more can be added).
  - Step 2 (staff): with one service, unchanged. With several, one row per service (in visit order) with that
    service's offering staff + "Sans préférence".
  - Step 3 (date & time): slots from `get_visit_slots`; after choosing a time, the plan is shown
    ("10:00 Coupe & Brushing · Amina → 11:00 Coloration · sans préférence").
    - **Unavailable parts (user's rule):** a part missing from every slot that day → a message above the times
      ("Coloration n'est pas disponible ce jour-là"; with a chosen staff member: "… avec Amina ce jour-là") with
      **Retirer cette prestation** and, if a staff member was chosen, **Changer de coiffeuse**. A time where some
      parts are missing is shown as a third state (not "full") labelled "sans Coloration"; tapping it shows
      "Coloration n'est pas disponible à 10:00" with **Réserver les autres prestations** (removes the missing parts
      from the selection; the rest are re-placed back to back from that time and the slots re-fetched; the chosen
      time stays selected if it is still available) and **Choisir une autre heure**. A time where every part is
      missing stays "full" as today.
    - **Race at confirm:** `slot_taken` with `item:<n>` → "Coloration vient d'être réservée à cette heure" with
      **Réserver les autres prestations** (same as above) and **Choisir une autre heure** (back to the times).
      With a single service it behaves as today.
  - Step 4 (confirm) and the success screen list each part with its time and staff (assigned staff after booking)
    and the total price.
  - The recap line on steps 2–3 shows "Coupe & Brushing + Coloration · 8 500 DA · 3 h".
  - FR + AR for every new string; RTL.
- **Demo:** fake bookings stay visits of one; demo masking and restrictions unchanged.

- **Nothing is booked that the client didn't see:** removing a part is always her explicit choice; the confirm
  step always lists exactly what will be booked.

## Left to the builder
Exact markup and wording within the existing design system; how the payload for the single push is shaped; query
keys; test structure.
