# Owner schedule: replace the WhatsApp + paper agenda — design

- **Date:** 2026-11-06
- **Part of:** "Make it a real product", SP3. SP1 (read path) and SP2 (online bookings + minimal `/admin`) are merged. This document replaces the SP2 spec's loose SP3 bullet list with what the salon actually needs first.
- **Status:** draft for approval.

## Intent: why this exists

Today the salon has no system. Every booking arrives as a WhatsApp message. The **owner** reads it, replies, and writes the appointment in a **paper agenda**. The project succeeds when:

- clients book through the site instead of messaging;
- the owner trusts the site's schedule as *the* agenda, which shows her the day and lets her manage her time better;
- booking is smooth for clients, with no friction.

The real competitor is the paper agenda. It's instant to write in, she can see the whole week, and changes are easy. The new schedule must beat it at those things, then add what paper can't: online bookings arrive in her schedule automatically, and she's told when they do.

The owner is the user of `/admin`, and probably the only one. She'll mostly use it **on her phone**, between clients.

## Prerequisite: go live (tracked separately, not part of this build)

None of this matters until the site with SP2 is deployed. Today the live site still runs the old WhatsApp-only booking.

1. Merge PR #3 (Arabic prices) and PR #4 (timeline overlap) into `main`.
2. Deploy `main` on **Vercel** (decided 2026-11-06) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in the Vercel project.
3. Add a `vercel.json` rewrite so that every path serves `index.html`, which makes `/admin` work when loaded or refreshed directly. Vercel serves real files (such as a service worker or manifest) before applying rewrites.
4. Replace the placeholder `WHATSAPP_NUMBER` (`'213561234567'` in `Booking.tsx`) with the salon's real number before clients see the site.

**Open:**
- Who controls the Vercel account and project. The repo belongs to a teammate, and the Vercel CLI on this machine isn't logged in.
- The salon's real WhatsApp number, and whether it's the owner's own. Her confirmations (goal 5) come from her WhatsApp, so the site's contact link should match it.

## Goals

### 1. A phone-first schedule, one column per stylist (owner chose layout A)

- A **week strip** on top shows how full each day is (filled-bar indicator). Sunday and Monday are greyed out as closed. Tapping a day opens it.
- The day view has **one column per active stylist** (currently Amina, Leila, Sara), with time running 09:00–18:00. Free time is visible at a glance, so she can answer "can I come Friday around 11?" without working it out.
- Each booking shows the client's name and service, its **status** (confirmed / waiting for her / cancelled hidden from the grid), and its **source** (site / added by her).
- The day header shows the number of bookings and the occupancy.
- On a wide screen the same columns get more room. The current desktop sidebar list (with phone numbers and actions) may stay; its layout is left to the builder.

Mockup chosen: `.superpowers/brainstorm/34623-1793990605/content/schedule-layout.html`, option A. It's local only and not committed. The mockup's colors and type are indicative. The real UI uses the project's design tokens.

### 2. The owner adds bookings herself (WhatsApp, phone, walk-in)

This is what lets her retire the paper agenda. If WhatsApp bookings can't go in quickly, she'll keep two systems.

- Tap an empty spot in a stylist's column, or the **+** button.
- A short form: **client name, phone, service**. The **stylist, date and time** are pre-filled from where she tapped and can be changed.
- It must be about as fast as writing in the agenda: one screen, few taps, no extra steps.
- Bookings she adds are **confirmed immediately** and marked as added by her (source).
- **Any stylist can do any service** when she adds or moves a booking. The owner said the salon is flexible: stylists sometimes do things outside their usual services. So the form lists every service in every column, and `stylist_services` is not enforced for her. Online clients still only see each stylist's usual services (`stylist_services`, as today). *Keeping the online side as it is is my call.*
- Rules that still apply: opening hours, closed days, 30-minute grid, the service must end by 18:00, and **no overlap per stylist** (the existing database constraint). If she picks a taken time, she gets a clear message, not a generic error.
- Rules that do **not** apply to her: the per-phone, per-IP and site-wide anti-abuse limits, and the 14-day window (she can book further ahead, like in a paper agenda). Her bookings also **don't count toward** a client's online limits: entering three future visits for a regular must not stop that client booking online, and copying the paper agenda in on day one must not trip the site-wide limit. *My call.*
- **Times:** she can use any **15-minute** step (a walk-in at 10:10 goes in at 10:15, not 10:30), and she can enter or edit bookings at times that have **already passed** today or earlier (writing one in after the fact, fixing a service). Opening hours and closed days still apply. Online clients keep the 30-minute grid and future times only. *My call.*
- **Language:** the form has a small FR/AR choice for the client's language, defaulting to the admin's current language. It's used for the WhatsApp messages in goal 5. *My call.*
- The phone number is required and uses the same Algerian mobile format as online bookings. *My call:* WhatsApp and phone bookings always come with a number, and the reply in goal 5 needs it.

### 3. The owner edits, moves and cancels bookings

- Tap a booking to see its details (name, phone as a tap-to-call link, service, stylist, time, source, status).
- She can **change the time, date, stylist or service** (any combination, see above), **confirm**, or **cancel**. Moving follows the same rules and gives the same clear "time taken" message as adding.
- She can restore a cancelled booking, as today; it may fail if the time has been taken since.
- Editing a booking **doesn't change its status**: a waiting online booking stays waiting until she taps Confirm. *My call.*

### 4. She is notified of every new online booking (phone notification)

- The owner chose **an app notification on her phone**. She adds the admin to her home screen like an app, and new online bookings trigger a notification such as "New booking: Yasmine, Friday 10:00, Coupe, Amina." Tapping it opens that booking.
- Only bookings made **on the site** notify her. Ones she adds herself don't.
- It must be free and need no outside account for her (no WhatsApp Business API, no SMS).
- A pending (waiting) count is visible in the admin so nothing gets missed even if a notification is.
- Enabling notifications is a one-time step she does on her phone. The admin should guide her through it in plain words, in French and Arabic, including the "add to home screen" step iPhones require.

### 5. Online bookings still need her approval, and the client hears back on WhatsApp

- The owner **wants to approve each online booking**. Online bookings keep starting as "waiting" (pending). The slot is held, so nobody else can take it in the meantime.
- After she taps **Confirm** or **Cancel**, or **moves** a booking to another date, time or stylist, the admin offers to **message the client on WhatsApp**. It opens her WhatsApp with a chat to the client's number and a pre-written message in **the client's language** (the booking's `lang`), for example "Your appointment on Friday 6 November at 10:00 (Coupe & Brushing) is confirmed. See you soon!" or the matching cancellation or "your appointment has been moved to…" message. She presses send. This applies to her own bookings too (in the language she picked on the form). *Offering it after a move is my call: otherwise a moved client is left with no answer.* This uses her own WhatsApp, so it costs nothing and needs no new account.
- The client-side success screen changes to say the request was received and **the salon will confirm on WhatsApp**. It no longer invites the client to send their own WhatsApp message, because that would put a duplicate request in her inbox. A "Questions? Message us on WhatsApp" link can stay, worded as a contact link rather than a booking step.

## Non-goals

- Customer accounts, client self-cancellation or rescheduling.
- Stylists having their own logins or views. The owner is the user.
- Configurable opening hours, closed days or holidays (hours stay constants for now).
- Staff and stylist management UI (still done in the Supabase dashboard).
- Automatic messages to clients (WhatsApp Business API, SMS, email), reminders before appointments.
- Payments, deposits, reports beyond the day's count, revenue and occupancy.

## Anti-goals (would be failure even if it works)

- Adding a booking is slower or fiddlier than writing it in the paper agenda.
- She misses a new online booking, or a client is left with no answer.
- Two clients end up booked with the same stylist at the same time.
- Anything that needs a paid service or a new account for the owner beyond what she already has.

## Constraints

- Existing stack: Vite + React 18 + TypeScript + Tailwind, TanStack Query, Supabase (Postgres RPCs, Auth, free tier). Follow `CLAUDE.md`: every string through `t()` in FR **and** AR, logical CSS (RTL), design tokens from `tailwind.config.js`, lucide-react icons only, no new UI libraries.
- Business rules stay in SQL, as in SP2. Bookings stay in the non-exposed `private` schema, and the new staff operations are SECURITY DEFINER RPCs that refuse non-staff, like `admin_list_bookings` / `admin_set_booking_status`.
- Changes to the live database go through new migration files (`supabase db push`, run by the user). Never edit a pushed migration.
- Supabase's free tier pauses the project after about a week without activity; it returned HTTP 521 on 2026-11-05. Real bookings should keep it awake, but a paused project means nobody can book.
- It's unknown whether the owner has an iPhone or Android. Notifications must work on both: iPhones only allow them for a site added to the home screen (iOS 16.4+).
- In `create_booking`, `client_ip` comes from Cloudflare's `cf-connecting-ip`. Bookings she adds must not count toward per-IP limits.

## What's left to the builder

- How notifications are sent (web push via service worker + VAPID; trigger from a new online booking, e.g. a database webhook or Edge Function), how subscriptions are stored, and what happens if sending fails. The constraint is that a failed notification must never fail or slow down the client's booking.
- The data model for "source" (online / added by owner) and the RPC shapes for create/update by staff.
- The form and booking-detail UI (sheet, modal or page), and the desktop layout.
- The week strip's data (one range query vs. per day) and occupancy definition (the day view already computes occupancy).
- Whether PR #4's side-by-side lanes are still needed. Within one stylist's column bookings can't overlap, so per-stylist columns may make them unnecessary.
- Deploying the Supabase side of notifications (`supabase functions deploy`, `supabase secrets set` for the VAPID keys etc.) is run by the user from their own shell, like `supabase db push`. The builder writes the exact commands. The service worker and manifest must be served as real files, not routed to `index.html` by the host's catch-all. *My call.*
- Phase order. Suggested: (1) schedule columns + add/edit, which replaces the paper agenda and is useful even before notifications; (2) notifications + WhatsApp reply + client success wording.
