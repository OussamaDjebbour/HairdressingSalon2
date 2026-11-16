# Owner manages a visit: remove one part, move the whole visit — design

Date: 2026-11-16. Status: discussed with the user; approach chosen by the user. Points the user did not state are
marked **(my call)**.

## Why
Multi-service visits (PR #24, spec `2026-11-16-multi-service-visits-design.md`) left owner-side editing per part.
In practice, when a client calls to change a visit, the owner has to rebuild it:
- "Drop the colouring, keep the cut": impossible. Annuler / Refuser act on the **whole** visit
  (`admin_set_booking_status` updates every row sharing `visit_id`).
- "Move my visit to 14:00": she moves each part separately with `admin_update_booking`, working out each time
  herself. A move can even fail against the visit's own next part: the overlap rule is checked row by row, so if
  Amina does 10:00 Cut + 11:00 Colouring and the cut moves 30 min later, it collides with the colouring's *old*
  slot. The client's visit can be left half-moved.

## Goals
1. **Retirer (remove one part):** from the booking sheet, the owner cancels one part of a multi-part visit; the other
   parts stay as they are.
2. **Déplacer la visite (move the visit):** the owner picks a new day and start time; every part moves together,
   all or nothing.
3. After either action, the owner is offered the usual pre-written WhatsApp message to the client.

## Non-goals
- Adding a part to an existing visit; the owner creating a multi-part visit from the agenda (later, items 3 and 4).
- Reordering parts, closing gaps automatically, changing a part's service during a move (per-part edit still does
  that).
- Any change to the public booking wizard.

## Anti-goals
- A visit left half-moved, or a removed part coming back.
- A move refused because the visit collides with itself.
- Any cross-salon effect: an id from another salon behaves exactly like one that doesn't exist.

## What the user decided
- **After removing a part, the other parts keep their times** (option A). E.g. Cut 10:00 + Colouring 11:00, cut
  removed → the client now comes at 11:00. If the owner wants it earlier she uses Déplacer.
- The sketch below (Retirer per part, Déplacer for the visit, behaviours listed) was approved ("looks good").
- **Approach A:** two dedicated database functions (below), not browser-side orchestration and not a general
  "edit the whole visit" function.

## The booking sheet (approved sketch)

```
 10:00–11:00  ·  mar. 18 nov.
 Visite
 10:00  Coupe & Brushing · Amina      [Retirer]
 11:00  Coloration · Sara             [Retirer]
 Total                          8 500 DA
 [ Confirmer ]  Refuser
 [ Déplacer la visite ]   Modifier cette partie
```

`BookingSummary.tsx` already lists the parts when `visit.parts.length > 1`; Retirer goes on each row and Déplacer
under the actions. "Modifier" (existing per-part edit) stays.

### Retirer
- Shown only on visits with **2+ non-cancelled parts** (one part left = the normal Annuler/Refuser).
- Asks first with `useConfirm({ danger: true })`: "Retirer Coloration de la visite de Nadia ?".
- The part becomes `cancelled` **and is detached from the visit** (gets its own new `visit_id`). Reason: today
  Confirmer updates every row of the visit, cancelled ones included, so a removed part left in the visit would be
  revived by the next Confirmer.
- The rest keep their status (a confirmed visit stays confirmed) and their times.
- Then: toast + the MessageReady screen with a "visit changed" message naming what remains and its start
  ("Votre rendez-vous est maintenant : Coupe & Brushing, mar. 18 à 10:00").
- After the MessageReady screen the sheet closes, as it does today after every action (both buttons close it)
  **(my call)**. The message is built from the remaining parts, whichever part the sheet was opened on.

### Déplacer la visite
- Shown on visits with 2+ non-cancelled parts that are `pending` or `confirmed` **(my call;** a single booking is
  moved with the existing edit form; a cancelled visit isn't moved).
- **Only for one-day visits (user's decision):** if the per-part edit has put the visit's non-cancelled parts on
  different days (Algiers dates), Déplacer is hidden and the server refuses with `visit_spans_days`; the owner moves
  those parts one by one, as today.
- A form in the sheet: day picker (existing `DayPicker`) + start time (owner's 15-min options) + one stylist select
  per part, prefilled with the current stylist. Owner rules: any stylist can do any service, past dates allowed,
  no 14-day window; salon hours/closed dates and the no-overlap rule still apply; a stylist's day off only warns
  (`schedule.stylistOff`, as in the per-part form).
- Every part shifts by the same amount: new start = new time + (part's old start − first part's old start). Gaps
  (e.g. from a removed part) are kept.
- Each part keeps its stored price and duration (same rule as per-part edit: move ≠ re-price).
- Status kept. On success: toast + MessageReady with the existing `moved` message, built from the visit
  (all service names, first start time).
- On a clash: nothing moves, and the error names the part: "Coloration : Sara est déjà prise à 14:00".
  Outside hours / closed day: the existing `outside_hours` message.

## Database (approach A)

Two new public functions, `security invoker` like the other staff booking functions, scoped by
`private.my_salon()`, `not_authorized` for non-staff, never taking a salon id from the browser:

1. **`admin_remove_visit_part(p_id uuid) returns void`**
   - `not_found` if the booking isn't in the caller's salon (or doesn't exist).
   - `last_part` if it is the visit's only non-cancelled part **(my call;** the UI never offers it then).
   - Sets `status = 'cancelled'`, `visit_id = gen_random_uuid()` on that row only.

2. **`admin_move_visit(p_id uuid, p_date date, p_time text, p_stylists jsonb) returns void`**
   - `p_id` is any part of the visit. `p_stylists` maps booking id → stylist id for the visit's non-cancelled parts
     (missing entry = keep current stylist). A stylist id not in the caller's salon → `unknown_service`
     (existing code used by the per-part edit for unknown stylist).
   - `p_time` follows the owner grid (`staff_slot` rules: 15-min step, inside that day's hours). Every part's new
     range must lie inside the day's hours (`outside_hours` otherwise); later parts aren't grid-checked (their
     offsets come from the existing visit).
   - Before writing, check each moved part against **other** bookings of the salon (excluding the visit's own rows,
     ignoring cancelled): the first clash raises `slot_taken` with `detail = 'item:<n>'`, `n` = 0-based index of
     the part in start order — same convention as `create_visit`. The pre-check also compares the moved parts
     **with each other** (new ranges, same stylist): if a stylist change makes two parts of the visit overlap on
     one stylist, that is a real double-booking and is refused the same way, naming the later part **(my call)**.
     Only collisions with the visit's own *old* slots are ignored.
   - Writes all parts in one transaction. The self-collision problem is solved by making the overlap constraint
     deferrable (see below), deferring it inside the function, and forcing the check before returning so an
     `exclusion_violation` (a race with another booking) still maps to `slot_taken`.
   - Moves only non-cancelled parts; cancelled rows of the visit stay where they are.
   - `visit_spans_days` if those parts are not all on the same Algiers date; `not_movable` if the visit is cancelled
     or has fewer than 2 non-cancelled parts **(my call;** the UI never offers it then).

**Overlap constraint:** `bookings_no_overlap` (exclude using gist on `(stylist_id, tstzrange)` where not cancelled)
is currently not deferrable. One new migration recreates it as `deferrable initially immediate` — same columns,
same predicate, so every existing function behaves exactly as before; only `admin_move_visit` defers it. Never
edit the pushed migration.

**Tests (pgTAP):** behaviour tests for both functions (remove: status/detach/last_part/not revived by Confirmer;
move: shift with gaps kept, self-collision case passes, clash names `item:<n>` (incl. two parts given the same stylist), outside hours, stylist change, `visit_spans_days`, `not_movable`,
cancelled parts untouched, demo role allowed); cross-salon tests in `10_isolation.test.sql` and both names
registered in `11_guard.test.sql`.

## Front end
- `src/data/admin.ts`: `useRemoveVisitPart`, `useMoveVisit` (invalidate the admin bookings and visit-parts queries
  like the existing mutations); `toAdminError` maps `last_part`, `visit_spans_days`, `not_movable` and `slot_taken` + `item:<n>`.
- `BookingSummary.tsx`: Retirer per part, Déplacer button. New move form (a view of `BookingSheet`, like the
  existing `summary` / `form` views) **(my call)**.
- `whatsapp.ts`: a new message kind for "visit changed" (removal); `moved` reused for the move, filled with all
  service names.
- Every new string in `fr` and `ar`; logical CSS properties; no `window.confirm`.
- The demo role can use both actions (it can already edit bookings; phones stay masked; its WhatsApp goes to the
  salon's number as today).
- Vitest for the summary buttons, the move form (prefill, offsets shown, error naming the part), message texts.

## Known effect, accepted (my call)
Online abuse limits count distinct `visit_id`s created in a window, cancelled ones included. Detaching a removed
part of a recent online visit makes it count as one more visit for that client's IP / site-wide counters for the
rest of that window. The effect is small and short-lived; not worth extra logic.

## Left to the builder
- Exact SQL for the per-part pre-check and how the 0-based index is computed.
- Form layout details within the existing sheet style; which existing components to reuse.
- Query invalidation details; test fixtures.

## Rollout
Requires `supabase db push` before publishing the front end (the five migrations of PR #24 + service photos + spa
are also still unpushed as of 2026-11-16, and must go first).
