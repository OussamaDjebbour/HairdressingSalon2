# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page marketing + booking site for a women's hairdressing/beauty salon ("Élégance") in Algiers. Vite + React 18 + TypeScript + Tailwind, originally scaffolded by Bolt (see `.bolt/`). Backend is Supabase (Postgres + Auth), managed by CLI migrations in `supabase/`. Customers book through RPCs (`get_slots`, `create_booking`); bookings live in the non-exposed `private` schema. Staff log in at `/admin` (sign-ups disabled; access requires a row in `private.staff`). Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (in `.env`).

## Commands

```bash
pnpm dev           # Vite dev server (talks to the Supabase project in .env)
pnpm build         # tsc typecheck, then vite build
pnpm preview       # serve the production build
pnpm test          # Vitest (supabase client is mocked)

supabase start -x logflare,vector,studio   # local stack (Docker)
supabase db reset                           # re-apply migrations + seed.sql locally
supabase test db                            # pgTAP tests in supabase/tests/database
supabase db lint --level warning            # security/schema lint
```

- To run the app against the local stack without editing `.env`: `VITE_SUPABASE_URL=<API_URL> VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> pnpm dev` (values from `supabase status -o env`).
- Changes to the live database go through new migration files + `supabase db push`; never edit an already-pushed migration.
- **No `lint` script.** `eslint.config.js` exists, but the ESLint packages it imports are *not* in `package.json` and are *not* installed. To lint you must first install them (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `eslint`), then `npx eslint .`.
- Typecheck alone: `npx tsc -b` (the `build` runs `tsc` first, so a broken build usually means a type error).

## Architecture

`src/App.tsx` wraps everything in `LanguageProvider` + React Query's `QueryClientProvider` and has two routes: `/` → `HomePage` (a vertical stack of sections: `Navbar → Hero → TrustBadges → Services → Philosophy → Booking → Footer`, linked by anchor `id`s like `#booking` — in-page scrolling) and `/admin` → `AdminPage` (staff login + schedule).

Two cross-cutting systems drive almost everything:

### 1. Bilingual FR/AR with RTL (custom, no i18n library)

`src/context/LanguageContext.tsx` is the single source of truth for language. It holds a flat `translations` dictionary keyed `Record<Lang, Record<string, string>>` with dotted string keys (`'booking.step.service'`). Consume it via the `useLang()` hook, which exposes `t(key)`, `lang` (`'fr' | 'ar'`), `dir`, and `toggleLang()`. The provider writes `document.documentElement.lang`/`dir` on change, so switching language flips the whole page to RTL.

Conventions that must be respected when touching UI or copy:
- **Every user-facing string goes through `t()`** — add the key to *both* `fr` and `ar` maps. `t()` falls back to French, then the raw key.
- **Domain data carries its own translations** inline as `Record<Lang, string>` (see `Service.name`, `Stylist.role` in `src/data/types.ts`), read as `service.name[lang]` — these are *not* in the `translations` dict.
- **Use logical CSS properties** for RTL correctness: `text-start`/`text-end`, `ms-`/`me-`, `ps-`/`pe-`, and `gap-` — not `text-left` / `ml-` / `pl-`. Default direction is LTR (French).
- Default language is `'fr'`; there is no persistence (resets on reload).

### 2. The design system lives in CSS + Tailwind config, not in components

Component styling is centralized as `@layer components` classes in `src/index.css` — `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-whatsapp` (+ `btn-sm`/`btn-lg`), `card` / `card-hover` / `card-selected`, `input`, `label`, `img-placeholder`, `no-scrollbar`. Prefer these classes over rebuilding styles inline. `src/components/Button.tsx` is just a typed wrapper mapping variant/size props onto those CSS classes.

`tailwind.config.js` defines the visual language and **must be the palette source**: custom color scales `cream / rose / gold / sage / amber / rust` (rose is the primary brand color; e.g. `rose-800` for headings, `cream-50` backgrounds), fonts `font-display` (Fraunces), `font-sans` (Inter), `font-arabic` (Cairo), custom shadows (`shadow-soft/card/lift/glow`), and the signature `ease-silk` easing + `animate-fadeIn`/`animate-shimmer`. Do not introduce raw hex colors or arbitrary values when a token exists.

### Booking flow (the core interaction) — `src/components/Booking.tsx`

A 4-step wizard (`Service → Stylist → Date & time → Confirm`) driven by local `useState` (`step: 0|1|2|3`). The Stylist step lists only stylists who offer the chosen service (`stylist_services`) plus "no preference". Time slots come from the `get_slots` RPC (`useSlots`). Confirming calls `create_booking` (`useCreateBooking`), which validates, enforces abuse limits and the per-stylist no-overlap constraint, and auto-assigns a stylist for "no preference". Errors map to codes via `toBookingError` (`slot_taken` sends the user back to the time step). Online bookings start `pending`; on success a summary screen tells the client the salon will confirm on WhatsApp, with a "questions?" link to the salon's WhatsApp. `SALON_WHATSAPP_NUMBER` lives in `src/data/whatsapp.ts` and is still a **placeholder** until the owner's real number is known.

The SQL functions own the business rules (Algiers time, 09:00–18:00, closed Sunday/Monday, 30-min grid, 14-day window, Algerian mobile numbers, per-phone / per-IP (`cf-connecting-ip`) / site-wide limits). The date strip in `Booking.tsx` duplicates the 14-day / closed-days rule deliberately.

### Staff admin — `/admin`

`AdminPage` uses `useSession()` from `src/lib/auth.ts` (Supabase Auth, email + password). The owner is the main user, mostly on her phone. Logged in, `Schedule.tsx` shows a week strip (`admin/WeekStrip.tsx`), a pending-count badge, and the day as one column per stylist (`admin/DayColumns.tsx`), loading a week at a time via `admin_list_bookings` (`useAdminBookings(from, to)`, `src/data/admin.ts`). Tapping free time or **+** opens `admin/BookingSheet.tsx` to add a booking (`admin_create_booking`); tapping a booking opens it to edit/move (`admin_update_booking`) or confirm/cancel (`admin_set_booking_status`), after which the sheet offers a pre-written WhatsApp message to the client in their language (`src/data/whatsapp.ts`). Owner rules differ from online ones: any stylist can do any service, 15-minute steps, past dates allowed, no 14-day window; hours, closed days and no-overlap still apply. `private.bookings.source` is `online` or `staff`, and online abuse limits only count `online` bookings. All admin RPCs raise `not_authorized` for non-staff. Staff accounts are created in the Supabase dashboard, then `insert into private.staff (user_id) …`.

### Booking notifications (Web Push)

New **online** bookings notify the owner's devices: trigger `bookings_notify_online` → `private.post_push` → async `pg_net` POST (auth header `x-notify-secret`) → Edge Function `supabase/functions/notify-booking` (message text and send/prune logic in `supabase/functions/_shared/notify.ts`, tested by Vitest) → Web Push (VAPID, `npm:web-push`). Nothing is sent until the Vault secrets `notify_booking_url` / `notify_booking_secret` exist, and a failure can never block a booking. The admin is installable (`public/manifest.webmanifest`, `public/sw.js`); the owner enables it on her device from `NotificationsCard` (`src/lib/push.ts`, env `VITE_VAPID_PUBLIC_KEY`). Tapping a notification opens `/admin?day=YYYY-MM-DD&booking=<id>`, which `Schedule` turns into that day + that booking's sheet. Live/local setup: `docs/notifications-setup.md`.

### Data & formatting

`src/data/` holds the data layer: `types.ts`, `queries.ts` (services/stylists), `bookings.ts` (slots, create, phone rules, error codes), `admin.ts` (staff hooks, Algiers-time helpers, `toAdminError`), `week.ts` (week days, occupancy, salon-time helpers, owner time options), `whatsapp.ts` (salon number, `wa.me` links, client messages), `hours.ts` (`OPENING_HOUR`/`CLOSING_HOUR` for the schedule grid), `formatters.ts`. Money is Algerian Dinar formatted via `formatPrice()` (`fr-FR` grouping + ` DA` suffix) — always format prices/durations/dates through these helpers so the AR/FR output stays consistent.

### Icons & images

Icons are **lucide-react only** (per `.bolt/prompt`; do not add other icon or UI-theme packages). Images are remote Pexels URLs rendered through `src/components/SmartImage.tsx`, which handles lazy-loading + a shimmer placeholder — use it instead of bare `<img>` for content images.
