# SP2 — Booking Persistence, Real Availability & Minimal Staff Admin

- **Date:** 2026-09-30
- **Status:** Approved (design) — pending spec review
- **Part of:** "Make it a real product" (SP2 of 3). SP1 (read path for services/stylists) is merged. SP3 = full admin (create/edit bookings, staff management, business hours, customer accounts).
- **Branch:** `feat/sp2-bookings-staff-admin`
- **Delivery:** one spec, one plan in two phases (A: public bookings, B: staff admin), one PR. A must not ship without B — otherwise saved bookings are invisible to the salon.

## Context

After SP1, `services` and `stylists` are read live from Supabase via `useServices`/`useStylists` (`src/data/queries.ts`). The booking wizard (`src/components/Booking.tsx`, steps Service → Stylist → Date & time → Confirm) still:

- uses stub availability: `generateTimeSlots()` (09:00–17:30 every 30 min) and `getBookedSlots()` (hardcoded `10:00, 10:30, 14:00, 15:30`) in `src/data/services.ts`;
- persists nothing — the final step opens a `wa.me` link with a localized message;
- lets any stylist be chosen for any service; "no preference" is left to the salon.

The `/admin` page (`src/pages/AdminPage.tsx`) renders `Schedule.tsx` from mock `todayAppointments` in `src/data/appointments.ts`. There is no authentication.

## Goal & success criteria

Customers' bookings are saved in Supabase, the time picker shows real availability, double-booking is impossible, and salon staff can log in to see, confirm and cancel bookings.

Done when:

1. `supabase db push` applies the new migrations cleanly on top of SP1; `supabase test db` passes; `supabase db lint` reports no issues.
2. The Stylist step shows only stylists who offer the chosen service (plus "no preference").
3. The time picker shows slots from the database; booked slots are disabled; cancelling a booking frees its slot.
4. Confirming saves the booking, then shows a success screen with a WhatsApp button that sends the message (naming the actual assigned stylist).
5. Two simultaneous bookings for the same stylist and overlapping time cannot both succeed; the loser sees a "slot just taken" message and is returned to the time step.
6. A staff member can log in at `/admin`, see bookings for a chosen day, confirm and cancel them, and log out. A logged-in non-staff user and an anonymous visitor cannot read any booking data.
7. FR/AR and RTL work throughout, including the admin login and the new messages.

## Scope

**IN**

- `stylist_services` table (which stylist offers which service) + seed.
- `private.bookings` table with DB-enforced no-overlap per stylist.
- Public RPCs `get_slots` and `create_booking` (with auto-assign for "no preference" and abuse limits).
- Supabase Auth (email + password), public sign-ups disabled, `private.staff` allow-list.
- Staff RPCs `admin_list_bookings` and `admin_set_booking_status`.
- Booking wizard wired to the new RPCs; new success screen with WhatsApp button.
- `/admin`: login form, real-data schedule for a chosen day, confirm/cancel, logout.
- pgTAP tests, Vitest tests, spike on client-IP header.

**OUT (SP3 or later)**

- Creating/editing bookings from the admin; staff management UI; in-app password reset (use the Supabase dashboard).
- Configurable business hours / closed days (`business_hours` table) — hours stay constants.
- Customer accounts, customer self-cancellation, SMS/OTP verification, CAPTCHA/Turnstile, automatic notifications to the salon.
- Buffer time between appointments.

## Business rules (constants)

| Rule | Value |
|---|---|
| Timezone | `Africa/Algiers` (no DST) |
| Opening hours | 09:00–18:00; a service must **end** by 18:00 |
| Closed days | Sunday, Monday |
| Slot granularity | 30 minutes |
| Booking window | today (future times only) through today + 13 days (14 calendar days, matching the date picker) |
| Phone | Algerian mobile, normalised to `^0[5-7][0-9]{8}$` (landlines/foreign numbers rejected — accepted trade-off) |
| Name | trimmed, 2–80 characters |
| Per-phone limit | max 3 upcoming non-cancelled bookings |
| Per-IP limit | max 5 bookings per IP per rolling hour (**conditional on the spike, see Testing**) |
| Circuit breaker | if > 20 bookings were created site-wide in the last 10 minutes, reject new ones |

The SQL functions own these rules. The date picker in `Booking.tsx` keeps its own 14-day / closed-days generation (duplicated deliberately; small, documented drift risk — `get_slots` returns no slots for a day the DB considers closed, so a drift is visible, not dangerous).

## Data model

Migration `create_bookings` (new; SP1's migration is untouched).

```sql
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;          -- not exposed by the Data API
revoke all on schema private from anon, authenticated;

-- Public, non-sensitive: which stylist offers which service
create table public.stylist_services (
  stylist_id text not null references public.stylists(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  primary key (stylist_id, service_id)
);
alter table public.stylist_services enable row level security;
create policy "public read stylist_services" on public.stylist_services for select to anon, authenticated using (true);

create table private.bookings (
  id           uuid primary key default gen_random_uuid(),
  service_id   text not null references public.services(id),
  stylist_id   text not null references public.stylists(id),   -- always set (auto-assigned for "no preference")
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  price        integer not null,                                -- snapshot from services at booking time
  client_name  text not null check (length(client_name) between 2 and 80),
  client_phone text not null check (client_phone ~ '^0[5-7][0-9]{8}$'),
  client_ip    inet,                                            -- for the per-IP limit; null if unavailable
  lang         text not null check (lang in ('fr','ar')),
  status       text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint bookings_no_overlap exclude using gist
    (stylist_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'cancelled')
);
create index on private.bookings (starts_at);
create index on private.bookings (client_phone, starts_at);
create index on private.bookings (created_at);

create table private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

revoke all on all tables in schema private from anon, authenticated;
```

Seed (`supabase/seed.sql`, appended):

| Stylist | Services |
|---|---|
| amina | coupe-femme, coloration, soin-keratine |
| leila | maquillage, soin-visage |
| sara | manucure |

(Ids match the SP1 seed.) With this seed each service has exactly one stylist, so "no preference" resolves deterministically today; it becomes meaningful when more pairs are added.

## Database functions

All functions: `language plpgsql`, `security definer`, `set search_path = ''`, every object fully qualified. After creation: `revoke execute ... from public`, then grant only as listed. Errors are raised as `raise exception '<code>' using errcode = 'P0001'` so the client can map the message to a code.

### `private.is_staff() returns boolean`

`exists (select 1 from private.staff where user_id = auth.uid())`. Not granted to anyone directly; used by the admin functions.

### `public.get_slots(p_date date, p_service_id text, p_stylist_id text default null) returns table(slot text, available boolean)` — granted to `anon`, `authenticated`

- Unknown service → `unknown_service`. `p_stylist_id` given but not offering the service → `unknown_service`.
- Closed day or outside the booking window → empty set.
- Otherwise, every `HH:MM` from 09:00 in 30-min steps where `start + duration <= 18:00`.
- `available` is true when the slot is in the future (Algiers time) and: for a given stylist, that stylist has no overlapping non-cancelled booking; for `null`, **any** stylist in `stylist_services` for that service is free.
- Returns no customer data.

### `public.create_booking(p_service_id text, p_stylist_id text, p_date date, p_time text, p_client_name text, p_client_phone text, p_lang text) returns table(booking_id uuid, stylist_id text)` — granted to `anon`, `authenticated`

1. Normalise: trim name; phone → strip spaces/dots/dashes/parentheses, `+213`/`00213` prefix → `0`.
2. Validate: `invalid_name`, `invalid_phone`, `unknown_service` (incl. stylist not offering the service), `outside_hours` (closed day, outside window, past time, not on the 30-min grid, or would end after 18:00). `p_lang` not in (fr, ar) → treated as `fr`.
3. Abuse limits, in order: circuit breaker → `rate_limited`; per-IP (if IP available and the spike confirmed the header) → `rate_limited`; per-phone → `too_many_bookings`.
4. Insert with `price`/`duration` from `services`, `starts_at` = `(p_date + p_time) at time zone 'Africa/Algiers'`.
   - Given stylist: insert; on `exclusion_violation` → `slot_taken`.
   - `null`: loop over stylists offering the service in `stylists.sort_order`; skip ones with an overlapping booking; insert the first; on `exclusion_violation` (race) continue to the next; none left → `slot_taken`.
5. Return the booking id and assigned stylist id.

### `public.admin_list_bookings(p_from date, p_to date) returns table(id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer, client_name text, client_phone text, lang text, service_id text, service_name jsonb, stylist_id text, stylist_name text, created_at timestamptz)` — granted to `authenticated` only

`not is_staff()` → `not_authorized`. Returns bookings with `starts_at` in `[p_from, p_to + 1 day)` (Algiers days), all statuses, ordered by `starts_at`. Range capped at 31 days (`invalid_range`).

### `public.admin_set_booking_status(p_id uuid, p_status text) returns void` — granted to `authenticated` only

`not is_staff()` → `not_authorized`. `p_status` must be `confirmed` or `cancelled` (`invalid_status`); unknown id → `not_found`. Re-confirming a cancelled booking re-checks the overlap constraint → `slot_taken` if it was taken in the meantime.

## Security

- **Customer data:** `bookings` and `staff` live in the `private` schema, which the Data API does not expose; explicit revokes on schema, tables and functions; access only through the functions above.
- **Function hardening:** `security definer` + `set search_path = ''` + fully qualified names; `execute` revoked from `public` and granted per function.
- **Staff ≠ authenticated:** public sign-ups disabled (`[auth] enable_signup = false` in `supabase/config.toml` **and** in the HairSalon project's Auth settings — the latter must be verified before pushing). Admin functions additionally require a row in `private.staff`; staff users are created in the Supabase dashboard and inserted into `private.staff` by SQL (documented in the PR).
- **Abuse:** per-phone limit, per-IP limit (conditional), circuit breaker. Operational backstop: bookings without a matching WhatsApp message can be cancelled by staff, freeing the slot. Turnstile (via an Edge Function) is the upgrade path if spam appears.
- **Keys:** the site only uses the publishable key; the service-role key is never in the frontend.
- **Output:** all customer-supplied text is rendered via React (escaped).
- `get_slots` reveals busy/free times per stylist but no customer data — accepted.

## Frontend

### Data layer

- `src/data/queries.ts`: `fetchStylists` also selects `stylist_services(service_id)`; `Stylist` gains `serviceIds: string[]` (`src/data/types.ts`).
- New `src/data/bookings.ts`:
  - `useSlots(date: Date | null, serviceId: string | null, stylistId: string | null)` — TanStack query on `rpc('get_slots')`, key `['slots', ymd, serviceId, stylistId]`, enabled when date and service are set. `ymd` is the picked calendar day as `YYYY-MM-DD`.
  - `useCreateBooking()` — mutation on `rpc('create_booking')`; on success invalidates `['slots']`.
  - `toBookingError(err): BookingErrorCode` — maps `slot_taken | rate_limited | too_many_bookings | invalid_phone | invalid_name | outside_hours | unknown_service`, anything else → `unknown`.
  - `normalizePhone` / `isValidPhone` — client mirror of the DB rule (instant feedback only; the DB is authoritative).
- New `src/data/admin.ts`: `useAdminBookings(day: Date)`, `useSetBookingStatus()`; new `src/lib/auth.ts` exporting a `useSession()` hook (subscribes to `supabase.auth.onAuthStateChange`, returns `{ session, loading }`) plus `signIn(email, password)` and `signOut()`.
- `src/data/services.ts`: stubs removed; the file is deleted if nothing remains (type re-export callers switch to `src/data/types.ts`).
- `src/data/appointments.ts`: mock data removed; `OPENING_HOUR`/`CLOSING_HOUR` kept (moved to `src/data/hours.ts`) for `Schedule.tsx`'s grid.

### Booking wizard (`Booking.tsx`)

- **Stylist step:** lists only stylists whose `serviceIds` include the selected service, plus "no preference". Changing the service resets a now-invalid stylist choice.
- **Date & time step:** chips from `useSlots`; shimmer while loading; `DataError` with Retry on failure; "no slots" message when empty or all unavailable.
- **Confirm step:** phone validated as typed; button "Confirmer la réservation" / Arabic equivalent; spinner + disabled while pending (no double submit).
- **Errors:** `slot_taken` → back to the time step, slots refetched, time cleared, inline notice; `invalid_phone`/`invalid_name` → field error; `too_many_bookings` → message suggesting contacting the salon; `rate_limited` → "too many bookings right now" + plain WhatsApp contact link; `outside_hours`/`unknown_service`/`unknown`/network → generic error with Retry, form state kept.
- **Success screen:** replaces the current one: reserved slot summary (service, **assigned** stylist, date, time, price), clear text that the booking should be confirmed on WhatsApp, prominent WhatsApp button (a direct tap, so no popup blocking) that opens the existing localized message, and "new booking".

### Admin (`/admin`)

- No session → login form (email, password, submit, error "invalid credentials"), FR/AR.
- Session → header gains a logout button; `Schedule.tsx` reads `useAdminBookings(selectedDay)` instead of mock data; day picker (prev/next/today); each booking shows time, client, phone (tap-to-call), service, stylist, status badge; actions **Confirmer** / **Annuler** (cancel asks for confirmation). A logged-in user without a staff row sees a "not authorised" message and the logout button.
- All new strings go through `t()` with FR and AR entries; logical CSS properties; design-system classes and tokens only; lucide icons only.

## Testing

- **Spike (first plan step):** determine which header carries the client IP in Supabase RPC requests (`request.headers` → e.g. `x-forwarded-for` / `cf-connecting-ip`) and whether a client can forge it. If it cannot be trusted, drop the per-IP limit and the `client_ip` column, and update this spec.
- **pgTAP** (`supabase/tests/*.sql`, `supabase test db`, local Docker stack):
  - `get_slots`: duration-dependent last slot; closed days and out-of-window dates empty; past slots unavailable; only offering stylists considered; booking makes slot unavailable; cancellation frees it; "no preference" available while any offering stylist is free.
  - `create_booking`: happy path; phone normalisation (`0555 12 34 56`, `+213 555 12 34 56`, `00213…`); invalid name/phone; `outside_hours` cases; `slot_taken`; auto-assign skips busy and non-offering stylists; price/duration from DB; per-phone limit; circuit breaker; per-IP limit (if kept).
  - Security: `anon` cannot select/insert `private.bookings` or `private.staff`; `admin_*` raise for `anon` and for an authenticated non-staff user; succeed for staff; `admin_set_booking_status` re-confirm conflict → `slot_taken`.
- **Vitest** (mocked supabase, like `queries.test.tsx`): `useSlots`/`useCreateBooking` call the right RPC with the right args; `toBookingError` mapping; `normalizePhone`/`isValidPhone` agree with the DB cases; `fetchStylists` maps `serviceIds`.
- **Manual, before merge:** FR and AR bookings end-to-end; two tabs racing for one slot; staff login/confirm/cancel and the freed slot reappearing on the public site; non-staff login refused; `supabase db lint` clean; sign-ups disabled on the remote project.

## Decisions log

- Approach: Postgres RPCs + exclusion constraint (over direct-insert RLS or an Edge Function).
- Finish step: save first, then WhatsApp via a button on the success screen (auto-open after an async save is popup-blocked on mobile).
- "No preference": auto-assign the first free offering stylist by `sort_order`.
- Security level: hardening + per-phone + per-IP (conditional) + circuit breaker; Turnstile deferred.
- Minimal staff admin pulled forward from SP3 so saved bookings are never invisible to the salon.
