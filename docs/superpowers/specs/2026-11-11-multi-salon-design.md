# Multi-salon product: owner settings, one codebase for many salons, demo — design

- **Date:** 2026-11-11
- **Follows:** SP1–SP3 (read path, online bookings + staff admin, owner schedule + push notifications), all merged into `main`.
- **Status:** draft for approval.

## Intent: why this exists

Until now the project was built as one salon's site ("Élégance"). The product owner now wants to **sell it to several salons**. Each salon pays a one-time setup price (plus, probably, a yearly hosting/updates fee; pricing and billing are handled outside the app). Expectation: one or two real salons in the first year. No real salon is waiting today, so the work can go in the right order without a deadline.

What stays the same for every salon is **everything the product does**: the 4-step online booking, the owner's agenda (add / move / confirm / cancel), the pre-written WhatsApp replies, push notifications for new online bookings, the abuse limits, FR/AR with RTL, Algerian phone numbers, dinars, Algiers time. The page layout also stays the same: hero → trust badges → services → philosophy → booking → footer. Only content and colors change.

What differs per salon:

| Thing | Who sets it | When |
|---|---|---|
| Salon name | product owner | at launch |
| Main color | product owner | at launch |
| Photos (hero, services, stylists) | product owner | at launch, and later on request |
| Services, prices, durations | salon owner, from `/admin` | any time |
| Stylists, their services, working days, days off | salon owner | any time |
| Opening hours per weekday, closed weekdays | salon owner | any time |
| Closed dates (Eid, holidays) | salon owner | any time |
| Address, WhatsApp number | salon owner | any time |

**Élégance is not a real salon.** It is the product owner's **showroom**: the demo shown to prospects. Every real salon is a new, separate copy.

### Success looks like

- The product owner can launch a new salon in about an hour with one guided script, not a day of manual edits.
- A fix or feature merged to `main` reaches **every** salon (site and database) without per-salon work.
- A salon owner never needs the product owner to change a price, add a stylist, change hours or close for Eid.
- A prospect can try both the client side and the owner side of the demo, and nothing she does there leaks anywhere or survives the night.

### Non-goals

- Pricing, invoicing, payments for the salons.
- A shared multi-tenant database. Each salon has its **own** Supabase project; isolation is the point.
- Letting the salon owner change the name, colors or photos herself.
- Different page layouts or extra sections per salon.
- Salons outside Algeria, other languages, other currencies.
- A lunch break / several opening periods per day.
- `.dz` domains (they need a registered Algerian business and registry paperwork).

### Anti-goals (failure even if it "works")

- Salons drifting onto different versions of the code or database.
- A salon owner's settings change silently cancelling or breaking existing bookings.
- One salon (or a demo visitor) being able to see or touch another salon's data.
- A demo visitor receiving notifications, or real people receiving WhatsApp messages, because of demo activity.
- A brand color that makes the site unreadable.

## Constraints

- Keep the existing stack and conventions (see `CLAUDE.md`): Vite + React + TS + Tailwind, Supabase via CLI migrations, business rules in SQL functions, bookings in the `private` schema, all staff RPCs raise `not_authorized` for non-staff, every UI string through `t()` in both FR and AR, logical CSS properties, lucide-react only, `SmartImage` for content images, prices through `formatPrice()`.
- Never edit an already-pushed migration; changes are new migrations, applied to **every** salon's database.
- The salon owner uses `/admin` mostly **on her phone**.
- Online booking keeps: 30-minute grid, 14-day window, future times only, abuse limits. Owner side keeps: 15-minute steps, past dates allowed, no 14-day window, any stylist can do any service, no-overlap per stylist.
- **Money:** expected running cost is about $45/month for three salons (Supabase Pro $25/month per organization incl. one Micro project, ~$10/month per extra project; Cloudflare Pages free; ~$10/year per `.com`). The product owner pays with a card funded at the parallel rate (~250 DA/$), so cost matters: no paid services beyond these without asking.

## Decisions already made (by the product owner)

1. **Separate copy per salon:** own website, own database, own owner login.
2. **Owner settings** live in `/admin`, reached by a **gear icon in the agenda's header** that opens a separate **Réglages** page with a back arrow (mockup option B: `.superpowers/brainstorm/1908-1794396870/content/owner-settings.html`, local only). The agenda keeps the full screen.
3. Hours are set **per weekday**; some days differ (e.g. Thursday 09:00–13:00, Saturday 09:00–20:00).
4. **Each stylist has her own working days.**
5. The owner can **close specific dates** for the whole salon.
6. **Every salon gets updates automatically.**
7. Each salon's site is on **its own name** as the web address (e.g. `salon-yasmine.com`).
8. **Colors:** the product owner enters **one main color**, and the shades are generated from it (mockup option B: `.superpowers/brainstorm/1908-1794396870/content/colors.html`).
9. Élégance is the **demo**. Prospects can try the client side **and** the owner side with a demo login.

## Part 1 — Owner settings (build first)

Goes first because it moves hours, closed days, address and WhatsApp out of code and into each salon's database, which shrinks what Part 2 has to customise.

### What the owner can do (Réglages page)

Sections, in this order: **Prestations & prix**, **Coiffeuses**, **Horaires**, **Jours fermés**, **Infos du salon**, then a **Compte** group with **Notifications** (the existing `NotificationsCard` moves here) and **Se déconnecter**. Each section is a row showing a one-line summary (e.g. "09:00–18:00 · fermé dim., lun.", "Prochain : 16 mars") and opens its own screen.

- **Services and prices:** add, edit, remove (hide) a service: name (FR + AR), description (FR + AR), category, price (DA), duration (minutes, multiple of 15), order. *My guess, accepted:* she types names in both languages; if the Arabic is empty, the site shows the French.
- **Stylists:** add, edit, remove (hide) a stylist: name, role (FR + AR), which services she offers **online** (`stylist_services`), her **working weekdays**, and her **days off** (specific dates or a date range, e.g. a week of holiday). *My guess, accepted:* on a working day a stylist works the salon's full hours for that day.
- **Hours:** for each weekday, closed or open with an opening and a closing time (15-minute steps).
- **Closed dates:** pick dates (single or range) when the whole salon is closed, with an optional label ("Aïd"). Show upcoming ones; past ones drop off.
- **Salon info:** address (FR + AR, multi-line), **city** (FR + AR; shown in the hero subtitle and footer where "Alger" is hard-coded today), the WhatsApp number (Algerian mobile, same validation as client phones), and optional **Instagram** and **Facebook** links (each icon hidden when empty; today they are `href="#"`). *Decided by the product owner after the builder check.*

### How changes behave (my calls, accepted)

- **No setting change ever cancels or moves an existing booking.** When a change makes future bookings fall outside the new rules (shorter Thursday, newly closed date, stylist day off, hidden service or stylist), the app saves the change, then **warns her and lists those bookings** (opening each in the existing booking sheet) so she can contact the clients herself.
- **Removing a service or stylist hides it** from online booking and from the owner's pickers for new bookings. Past and existing bookings keep their name and history.
- *My call:* **a booking keeps working after the rules change under it.**
  - Editing a booking without changing its date, time or stylist (fixing a name, phone or language, confirming, cancelling) skips the hours, closed-date and hidden-service/stylist checks. Those checks only apply when the date, time, stylist or service actually changes.
  - A booking's **stored price and duration are kept** unless the owner changes its service. A new price or duration applies to new bookings only. Today `admin_update_booking` always recomputes them from the service; that changes.
  - The booking sheet's pickers include the booking's current service and stylist even when hidden.
  - The day grid **stretches to show bookings outside that day's hours** (e.g. a 16:00 booking on a Thursday now closing at 13:00), visibly marked as outside the hours, so the owner can find them.
- **Changes reach the public site and online booking within about a minute.** No redeploy.

### Rules engine changes (SQL)

Today the rules are constants: `private.is_open_day` (closed isodow 1 and 7, 14-day window), `get_slots` (540–1080 minutes), `private.staff_slot` (same), and `src/data/hours.ts` (`OPENING_HOUR`/`CLOSING_HOUR`). The date strip in `Booking.tsx` and the footer hours are hard-coded too. All of these move to data:

- Weekly salon hours (weekday → closed, or open/close time).
- Salon closed dates.
- Stylist working weekdays and stylist days off.
- Salon info (address FR/AR, WhatsApp number).
- `services` and `stylists` gain an "active/hidden" flag.

**Online booking (`get_slots`, `create_booking`):** a slot is offered only if the salon is open that weekday, the date isn't a closed date, the service fits inside that day's hours, and the stylist works that weekday, isn't off that date, offers the service online, and is free. "No preference" picks among stylists who meet all of that. Hidden services/stylists are never offered.

**Owner side (`admin_create_booking`, `admin_update_booking`):** salon hours for that day and salon closed dates are **enforced** (as today's hours/closed days are). A **stylist's day off or non-working weekday is not enforced** for the owner; the sheet shows a warning ("Leila ne travaille pas ce jour-là") but lets her save. *My call:* she knows best, same spirit as "any stylist can do any service".

**Public read:** hours, closed dates (future only), salon info, active services, active stylists and their working days are readable by `anon` and `authenticated` (the public site needs them). Writes only via staff-only RPCs (or staff-only RLS) that raise `not_authorized` like the existing admin RPCs.

**Admin agenda:** the day grid uses that day's hours instead of fixed 09:00–18:00; closed days/dates are greyed in the week strip; stylists not working that day are shown greyed in their column (still tappable for the owner).

**Public site:** the footer shows hours grouped by identical days (e.g. "Mar – Ven 9:00 – 18:00 · Sam 9:00 – 17:00 · Dim – Lun Fermé"), the address and the phone from salon info. The booking date strip derives closed days from the data (it no longer duplicates a hard-coded rule).

**Online grid with 15-minute hours:** hours can be set in 15-minute steps. *My call:* online slots run every 30 minutes **starting from that day's opening time** (opening at 09:15 gives 09:15, 09:45, …); `create_booking`'s `:00|:30` check is loosened accordingly.

**Migration for existing data:** seed the new tables so the current behaviour is unchanged (Tue–Sat 09:00–18:00, Sun/Mon closed, all stylists working every open day, current address and placeholder number). The footer today claims Saturday closes at 17:00 while the SQL books until 18:00; *my call:* the SQL is the truth, so the seed uses 18:00.

### What's left to the builder

Table and RPC names and shapes; whether writes go through RPCs or staff-only RLS (follow the existing admin RPC style unless there's a reason not to); the exact screen layouts within the project's design system; how the "affected bookings" list is presented; caching (React Query `staleTime`) as long as changes appear within about a minute; pgTAP + Vitest coverage in the existing style.

## Part 2 — One codebase, many salons (build second)

### Shape

- **One repo, one `main`.** Each salon is described by a small **settings bundle** in the repo, e.g. `salons/<slug>/` with:
  - name (FR + AR; may be the same Latin text in both),
  - main color (hex),
  - photos (hero and any other site images, plus starting service/stylist photos),
  - web address,
  - Supabase project ref, URL, publishable key, VAPID public key,
  - a `demo` flag (Part 3),
  - starting data for the first launch: services, stylists, hours, address, WhatsApp number (after launch the owner owns these in the database).
- Nothing secret goes in the repo (only publishable keys). Secrets (DB passwords, Supabase access token, Cloudflare token, VAPID private keys, notify secrets) live in CI secrets and in the product owner's password manager.
- A build for one salon: `pnpm build` with a salon selector (e.g. `SALON=<slug>`) produces that salon's static site.

### Everything that currently says "Élégance" or is salon-specific comes from the bundle

`index.html` title, `public/manifest.webmanifest` (name, short name, theme color), Navbar, Footer (name, copyright), AdminPage header, the `admin.push.iosStep3` copy, the WhatsApp client messages in `src/data/whatsapp.ts`, `SALON_WHATSAPP_NUMBER` (now from the database, Part 1), the hero image in `Hero.tsx`. Push notification text (`supabase/functions/_shared/notify.ts`) should name the salon if it does today or would benefit; the function reads it from that salon's data or env. ### Salon story and claims (decided by the product owner after the builder check)

Today the site carries claims that are only true of the fictional Élégance: `TrustBadges` ("15+ ans, 2 500+ clientes, 3 coiffeuses, 4,9"), the hero's "4,9 · 240 avis vérifiés", and the philosophy section ("Depuis quinze ans au cœur d'Alger…", signed "Amina, Fondatrice & coiffeuse"). These must never ship unchanged to a real salon.

- These become **bundle fields the product owner fills in at launch**: founder name and role, founder story (FR + AR), years open, client count, rating and review count.
- **Any field left empty is hidden** (the badge, the rating line, or the whole philosophy quote/signature), and the layout still looks complete without it.
- The stylist count is computed from the active stylists, not typed.
- City and social links are salon info, edited by the owner (Part 1).
- Other generic marketing copy (hero tagline, section headings) stays the same for all salons, with the salon name and city interpolated where they appear.

### Colors

- The main color generates the full 50–900 scale that replaces today's `rose` scale (the primary brand color used across components and `index.css`). The token can stay named `rose` or be renamed (e.g. `brand`) — builder's call, but it must be one token used everywhere, generated at build time, no raw hex in components.
- **Cream background and gold accents stay the same for every salon.**
- *My call:* the build **checks readability** (WCAG AA contrast for button text on the button color, headings on the background, footer text on the footer) and, if a check fails, **darkens that shade automatically and prints a warning**. A yellow logo can't produce an unreadable site.
- Élégance's current rose palette must come out the same (or visually indistinguishable) when its main color is entered, so the demo doesn't change.

### Photos

Real salons need their own photos (today's images are Pexels URLs). *My call:* each salon's photos are stored in a public **Supabase Storage** bucket in that salon's project, and service/stylist rows point to them. The setup script uploads the bundle's photos. A service or stylist the owner adds later without a photo shows a tasteful placeholder (category icon / initials); the product owner adds the real photo on request (a small script command is enough — no upload UI for the owner).

### Hosting and addresses

- *My call:* **Cloudflare Pages**, one Pages project per salon (free plan allows commercial use; Vercel's free plan doesn't). Each project needs the SPA fallback that `vercel.json` provides today (Pages serves `index.html` for unknown paths when there is no `404.html`; confirm `/admin` deep links and `/admin?day=…&booking=…` work) and must serve `sw.js` and the manifest as real files. `vercel.json` and the Vercel references in `docs/notifications-setup.md` are replaced.
- *My call:* **`.com` domains bought through Cloudflare Registrar** (~$10/year each) in the product owner's Cloudflare account, attached to the salon's Pages project. Buying the domain is a manual step (no registrar API); the script tells the product owner when to do it.
- The demo gets its own address too (e.g. a `.com` for Élégance).

### Automatic updates for every salon

- On merge to `main`, one CI workflow (GitHub Actions) runs, for **each salon** in `salons/`:
  1. apply pending database migrations to that salon's Supabase project,
  2. deploy the Edge Functions,
  3. build the site with that salon's bundle and deploy it to its Pages project.
- *My call:* run the database step for all salons first, and only deploy sites once every database succeeded, so no site ships ahead of its database. If one salon fails, the workflow stops and reports which salon and step.
- Tests (`pnpm test`, `supabase test db`) must pass before anything deploys.
- The repo is owned by a teammate; CI secrets need to be added by someone with admin access to it. Flag this as a prerequisite, don't work around it.

### Launching a new salon (guided script)

One command (e.g. `pnpm new-salon <slug>`) that walks the product owner through, with clear prompts and a resumable checklist (re-running continues where it stopped):

1. Create the Supabase project in the product owner's organization (or ask for its ref if created by hand).
2. Apply all migrations, deploy Edge Functions, set function secrets (VAPID keys generated per salon, `NOTIFY_SECRET`, `VAPID_SUBJECT`) and the Vault secrets for notifications (the steps in `docs/notifications-setup.md`, automated).
3. Load the bundle's starting data (services, stylists, hours, address, WhatsApp number) and upload photos.
4. Create the owner's login (email + password), add her to `private.staff`, keep sign-ups disabled.
5. Create the Cloudflare Pages project, deploy the site, attach the domain (after the manual purchase step).
6. Print a summary: site URL, admin URL, owner email, what's left by hand, where secrets were saved.

The salon is then picked up automatically by the update workflow.

### Existing live project

The current Supabase project ("HairSalon", ref `wfuystygggbgjztrgqen`) becomes **Élégance = the demo** (Part 3). The production VAPID keys generated on 2026-11-11 can be used for it.

**Open (must be answered before Part 2 is planned):** which Supabase organization and which Cloudflare account hold the salons. "HairSalon" is on the free plan (it paused itself on 2026-11-05), and it's not known whether it sits in the product owner's own account or the teammate's. All salons must sit in one paid Supabase organization the product owner controls; if "HairSalon" is elsewhere, Part 2 starts with transferring it.

### What's left to the builder

Bundle file format; how the build selects the salon (env var, Vite mode, generated config module); color-generation algorithm (as long as it meets the readability rule and preserves Élégance's palette); how CI stores per-salon secrets; whether the script uses the Supabase Management API or CLI; error handling details.

## Part 3 — The demo (build third)

- **Élégance stays the showroom**: a normal salon copy (with `demo: true` in its bundle), made-up services, stylists and photos, its own address.
- Prospects try both sides: **as a client** (book on the public site) and **as the owner** (agenda + Réglages), where they can change prices, close dates, move bookings.
- *My call:* the demo's `/admin` login page shows an **"Essayer la démo"** button that signs in with a demo owner account in one tap (credentials are shipped in the demo build only; acceptable because the data is fake and reset nightly). Only builds with `demo: true` show it.
- *My call:* **nightly reset** (e.g. a `pg_cron` job at ~03:00 Algiers time in the demo project) restores the original services, stylists, hours, closed dates and salon info, deletes all bookings and push subscriptions of the demo account, and generates **a week of realistic fake bookings** relative to the current date (mix of statuses and sources, a couple pending) so the agenda never looks empty. Phone numbers entered by prospects are gone the next morning.
- *My call:* **the demo never notifies or messages anyone except the product owner.**
  - The demo owner account cannot enable push notifications (the Notifications row explains it's disabled in the demo). Only the product owner's own staff account in the demo project can subscribe.
  - The salon WhatsApp number in the demo is the product owner's.
  - The WhatsApp "message to the client" button, in the demo, shows the prepared message but opens WhatsApp to the **salon (product owner's) number** instead of the client's number typed by a prospect.
- **Shared demo state is accepted** (decided by the product owner after the builder check): every visitor uses the same demo owner account and sees the others' changes until the reset. Two safeguards:
  - **Client phone numbers are hidden in the demo** for the demo owner account (shown masked, e.g. `05•• •• •• 12`), so prospects never see each other's numbers.
  - A **"Réinitialiser la démo"** action, available **only to the product owner's own account** in the demo project, runs the same reset immediately, so a messed-up showroom can be cleaned right before a pitch.
  - Prospects may still edit text (service names etc.); no extra restrictions.
- **Abuse limits stay on** in the demo. Known risk: during a busy pitch the per-IP limit could block test bookings from the same phone; the nightly reset clears counts. The builder should check the limit values against a realistic pitch (a few bookings from one device) and report if they'd get in the way; do not silently disable them.
- The demo owner account can't reach any real salon: separate projects, so this comes for free.

### What's left to the builder

The reset mechanism (pg_cron + SQL function, or a scheduled Edge Function), fake data generation, how the demo account is distinguished from the product owner's account in the demo project.

## Order and process

1. **Part 1 — Owner settings**, its own plan, built and reviewed, merged.
2. **Part 2 — Many salons**, its own plan; ends with Élégance deployed on Cloudflare as the first salon copy.
3. **Part 3 — Demo**, its own plan.

Each part is planned separately (superpowers:writing-plans) and lands as its own PR(s) to `main`.
