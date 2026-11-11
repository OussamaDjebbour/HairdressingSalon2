# Multi-salon product: shared database, owner settings, many salons, demo — design

- **Date:** 2026-11-11
- **Follows:** SP1–SP3 (read path, online bookings + staff admin, owner schedule + push notifications), all merged into `main`.
- **Status:** approved by the product owner on 2026-11-11.

## Intent: why this exists

Until now the project was built as one salon's site ("Élégance"). The product owner now wants to **sell it to several salons**. Each salon pays a one-time setup price (plus, probably, a yearly hosting/updates fee; pricing and billing are handled outside the app). Expectation: one or two real salons in the first year, possibly many more later. No real salon is waiting today, so the work can go in the right order without a deadline.

What stays the same for every salon is **everything the product does**: the 4-step online booking, the owner's agenda (add / move / confirm / cancel), the pre-written WhatsApp replies, push notifications for new online bookings, the abuse limits, FR/AR with RTL, Algerian phone numbers, dinars, Algiers time. The page layout also stays the same: hero → trust badges → services → philosophy → booking → footer. Only content and colors change.

What differs per salon:

| Thing | Who sets it | When |
|---|---|---|
| Salon name | product owner | at launch |
| Main color | product owner | at launch |
| Photos (hero, services, stylists) | product owner | at launch, and later on request |
| Salon story and claims (founder, years open, client count, rating) | product owner | at launch |
| Services, prices, durations | salon owner, from `/admin` | any time |
| Stylists, their services, working days, days off | salon owner | any time |
| Opening hours per weekday, closed weekdays | salon owner | any time |
| Closed dates (Eid, holidays) | salon owner | any time |
| Address, city, WhatsApp number, Instagram/Facebook links | salon owner | any time |

**Élégance is not a real salon.** It is the product owner's **showroom**: the demo shown to prospects. It becomes one salon among others in the shared database.

### Success looks like

- **No salon can ever see or change another salon's data**, and this is enforced by the database and proven by automated tests, not by care.
- The product owner can launch a new salon in about an hour with one guided script.
- A fix or feature merged to `main` reaches **every** salon at once: one database update, one site deploy.
- A salon owner never needs the product owner to change a price, add a stylist, change hours or close for Eid.
- A prospect can try both the client side and the owner side of the demo, and nothing she does there reaches anyone or survives the night.
- Running cost stays roughly flat as salons are added.

### Non-goals

- Pricing, invoicing, payments for the salons.
- A separate database per salon (considered and rejected 2026-11-11: higher cost per salon and per-salon updates; the leak risk of a shared database is handled by the safeguards below).
- Letting the salon owner change the name, colors, story or photos herself.
- A web UI for the product owner to manage salons (a script is enough for now).
- Different page layouts or extra sections per salon.
- Salons outside Algeria, other languages, other currencies.
- A lunch break / several opening periods per day.
- `.dz` domains (they need a registered Algerian business and registry paperwork).

### Anti-goals (failure even if it "works")

- **One salon (or a demo visitor) seeing or touching another salon's data** — client names, phone numbers, bookings, settings. This is the worst possible failure of the product.
- A salon owner's settings change silently cancelling or breaking existing bookings.
- A demo visitor receiving notifications, or real people receiving WhatsApp messages, because of demo activity.
- The demo's nightly reset touching anything outside the demo salon.
- A brand color that makes the site unreadable.
- Made-up claims (reviews, founder, years) appearing on a real salon's site.

## Constraints

- Keep the existing stack and conventions (see `CLAUDE.md`): Vite + React + TS + Tailwind, Supabase via CLI migrations, business rules in SQL functions, bookings in the `private` schema, all staff RPCs raise `not_authorized` for non-staff, every UI string through `t()` in both FR and AR, logical CSS properties, lucide-react only, `SmartImage` for content images, prices through `formatPrice()`.
- Never edit an already-pushed migration; changes are new migrations.
- The salon owner uses `/admin` mostly **on her phone**.
- Online booking keeps: 30-minute grid, 14-day window, future times only, abuse limits. Owner side keeps: 15-minute steps, past dates allowed, no 14-day window, any stylist can do any service, no-overlap per stylist.
- **Money:** one Supabase project on the Pro plan (~$25/month, check supabase.com/pricing), Cloudflare Pages free, ~$10/year per `.com` domain. The product owner pays with a card funded at the parallel rate (~250 DA/$), so no paid services beyond these without asking.
- The existing Supabase project "HairSalon" (ref `wfuystygggbgjztrgqen`) becomes the shared database. Its current data is Élégance's, i.e. demo data.

## Decisions already made (by the product owner)

1. **One shared database for all salons**, with strict isolation (decided after comparing with separate copies). Each salon still has its own website address and its own owner login.
2. **Owner settings** live in `/admin`, reached by a **gear icon in the agenda's header** that opens a separate **Réglages** page with a back arrow (mockup option B: `.superpowers/brainstorm/1908-1794396870/content/owner-settings.html`, local only). The agenda keeps the full screen.
3. Hours are set **per weekday**; some days differ (e.g. Thursday 09:00–13:00, Saturday 09:00–20:00).
4. **Each stylist has her own working days.**
5. The owner can **close specific dates** for the whole salon.
6. **Every salon gets updates automatically.**
7. Each salon's site is on **its own name** as the web address (e.g. `salon-yasmine.com`).
8. **Colors:** the product owner enters **one main color**, and the shades are generated from it (mockup option B: `.superpowers/brainstorm/1908-1794396870/content/colors.html`).
9. **Salon story and claims** are filled in per salon at launch; anything left empty is hidden.
10. Élégance is the **demo**. Prospects can try the client side **and** the owner side with a demo login. Shared demo state is accepted, with masked phone numbers and an owner-only reset button.

## Order

1. **Part 1 — Shared-database foundation** (salon separation + its safeguards), with Élégance as the only salon. Must come first: everything after adds tables and functions that need to be salon-aware from day one.
2. **Part 2 — Owner settings** (Réglages).
3. **Part 3 — Many salons**: one site for all salon addresses, branding from the database, Cloudflare hosting, automatic updates, the new-salon script.
4. **Part 4 — The demo.**

Each part gets its own plan (superpowers:writing-plans) and lands as its own PR(s) to `main`. After Part 1 the live site must behave exactly as today.

## Part 1 — Shared-database foundation

### Data

- A `salons` table (id, slug, status). Branding columns arrive in Part 3, settings in Part 2.
- **Every salon-owned table gets a required `salon_id`**: `services`, `stylists`, `stylist_services`, `private.bookings`, `private.staff`, `private.push_subscriptions`, and every table added later (hours, closed dates, stylist days, salon info…).
- **Cross-table links include the salon** (composite keys, e.g. a booking's `(salon_id, stylist_id)` references `stylists (salon_id, id)`), so the database itself refuses a booking whose service or stylist belongs to another salon.
- Existing rows are assigned to the Élégance salon by the migration.
- IDs that are unique today only within one salon (e.g. service ids like `'brushing'`) must not collide across salons; the builder picks how (composite keys or generated ids).

### Who is in which salon

- `private.staff` becomes `(user_id, salon_id)`: **a staff account belongs to exactly one salon.**
- One helper, e.g. `private.my_salon()`, returns the logged-in staff member's salon (or nothing).
- **Owner functions never accept a salon id from the browser.** They always use `my_salon()`. Any booking, stylist or service id passed in is checked to belong to that salon; if not, the function behaves as if it doesn't exist (no hint that it exists elsewhere).
- *My call:* if a staff account logs in on another salon's address, `/admin` shows "this account belongs to another salon" and nothing else.

### Public side

- Public data (active services, stylists, hours, salon info) is read **filtered by salon**. The site knows its salon from its web address (Part 3; until then, Élégance).
- `get_slots` and `create_booking` take the salon as a parameter (the client is booking at that salon) and verify that the service and stylist belong to it.
- **Abuse limits are counted per salon** (per phone, per IP, site-wide all become "within this salon"), so traffic at one salon or the demo can't block another.

### Functions and permissions

- **Row-level security on every salon-owned table**, with policies based on `my_salon()` for staff and on salon + active flag for public reads.
- Today's functions are `security definer`, which bypasses row-level security. *My call:* staff functions are rewritten to run as the caller (`security invoker`) so row-level security applies to them too. Functions that genuinely need elevated rights (public `create_booking`/`get_slots`, push plumbing) stay `security definer` but take their salon only from a validated parameter or from `my_salon()`, and are each covered by isolation tests.
- Push notifications go only to subscriptions of **staff of the booking's salon**, and the message names that salon.

### Safeguards that prove it (tests, all run in CI before any deploy)

1. **Isolation tests (pgTAP):** with two fixture salons A and B, staff of A calls **every** staff function with B's ids (booking, stylist, service, date ranges) and gets `not_authorized` / no rows / no change; anon booking at A with B's service or stylist is refused; B's data is unchanged afterwards.
2. **Guard test that reads the database catalogue** and fails if:
   - a table in `public` or `private` (except an explicit allow-list like `salons`) has no `salon_id`;
   - a table has row-level security disabled;
   - a function exposed to `anon`/`authenticated` is not in the list of functions covered by isolation tests.
   This catches the mistakes people forget months later (a new table, a new function).
3. `supabase db lint --level warning` must pass in CI.
4. Existing pgTAP and Vitest suites keep passing (adapted to salons).

### What's left to the builder

Exact table/column/key design, helper names, how to adapt existing RPC signatures (keeping the frontend working), migration of existing rows, test fixtures, RLS policy details.

## Part 2 — Owner settings

### What the owner can do (Réglages page)

Sections, in this order: **Prestations & prix**, **Coiffeuses**, **Horaires**, **Jours fermés**, **Infos du salon**, then a **Compte** group with **Notifications** (the existing `NotificationsCard` moves here) and **Se déconnecter**. Each section is a row showing a one-line summary (e.g. "09:00–18:00 · fermé dim., lun.", "Prochain : 16 mars") and opens its own screen.

- **Services and prices:** add, edit, remove (hide) a service: name (FR + AR), description (FR + AR), category, price (DA), duration (minutes, multiple of 15), order. She types names in both languages; if the Arabic is empty, the site shows the French.
- **Stylists:** add, edit, remove (hide) a stylist: name, role (FR + AR), which services she offers **online** (`stylist_services`), her **working weekdays**, and her **days off** (specific dates or a date range). On a working day a stylist works the salon's full hours for that day.
- **Hours:** for each weekday, closed or open with an opening and a closing time (15-minute steps).
- **Closed dates:** pick dates (single or range) when the whole salon is closed, with an optional label ("Aïd"). Show upcoming ones; past ones drop off.
- **Salon info:** address (FR + AR, multi-line), **city** (FR + AR; shown in the hero and footer where "Alger" is hard-coded today), the WhatsApp number (Algerian mobile, same validation as client phones), optional **Instagram** and **Facebook** links (each icon hidden when empty; today they are `href="#"`).

All of these tables carry `salon_id` and are covered by the Part 1 safeguards (the guard test enforces it).

### How changes behave

- **No setting change ever cancels or moves an existing booking.** When a change makes future bookings fall outside the new rules (shorter Thursday, newly closed date, stylist day off, hidden service or stylist), the app saves the change, then **warns her and lists those bookings** (opening each in the existing booking sheet) so she can contact the clients herself.
- **Removing a service or stylist hides it** from online booking and from the owner's pickers for new bookings. Past and existing bookings keep their name and history.
- **Changes reach the public site and online booking within about a minute.** No redeploy.
- *My call:* **a booking keeps working after the rules change under it.**
  - Editing a booking without changing its date, time or stylist (fixing a name, phone or language, confirming, cancelling) skips the hours, closed-date and hidden-service/stylist checks. Those checks only apply when the date, time, stylist or service actually changes.
  - A booking's **stored price and duration are kept** unless the owner changes its service. A new price or duration applies to new bookings only. Today `admin_update_booking` always recomputes them from the service; that changes.
  - The booking sheet's pickers include the booking's current service and stylist even when hidden.
  - The day grid **stretches to show bookings outside that day's hours**, visibly marked as outside the hours.

### Rules engine changes (SQL)

Today the rules are constants: `private.is_open_day` (closed isodow 1 and 7, 14-day window), `get_slots` (540–1080 minutes), `private.staff_slot` (same), and `src/data/hours.ts` (`OPENING_HOUR`/`CLOSING_HOUR`). The date strip in `Booking.tsx` and the footer hours are hard-coded too. All of these move to per-salon data: weekly hours, closed dates, stylist working weekdays and days off, salon info, and an active/hidden flag on services and stylists.

- **Online booking (`get_slots`, `create_booking`):** a slot is offered only if the salon is open that weekday, the date isn't a closed date, the service fits inside that day's hours, and the stylist works that weekday, isn't off that date, offers the service online, and is free. "No preference" picks among stylists who meet all of that. Hidden services/stylists are never offered.
- **Online grid with 15-minute hours:** *my call:* online slots run every 30 minutes **starting from that day's opening time** (opening at 09:15 gives 09:15, 09:45, …); `create_booking`'s `:00|:30` check is loosened accordingly.
- **Owner side (`admin_create_booking`, `admin_update_booking`):** salon hours for that day and salon closed dates are **enforced** when date/time/stylist/service change. A **stylist's day off or non-working weekday is not enforced** for the owner; the sheet shows a warning ("Leila ne travaille pas ce jour-là") but lets her save. *My call.*
- **Writes** only through staff functions using `my_salon()`, in the existing admin RPC style.
- **Admin agenda:** the day grid uses that day's hours; closed days/dates are greyed in the week strip; stylists not working that day are greyed in their column (still tappable for the owner).
- **Public site:** the footer shows hours grouped by identical days (e.g. "Mar – Ven 9:00 – 18:00 · Sam 9:00 – 17:00 · Dim – Lun Fermé"), the address, city and phone from salon info. The booking date strip derives closed days from the data.
- **Seed for Élégance** keeps today's behaviour: Tue–Sat 09:00–18:00, Sun/Mon closed, all stylists working every open day, current address. The footer today claims Saturday closes at 17:00 while the SQL books until 18:00; *my call:* the SQL is the truth (18:00).

### What's left to the builder

Table and RPC shapes; exact screen layouts within the design system; how the "affected bookings" list is presented; caching (React Query `staleTime`) as long as changes appear within about a minute; pgTAP + Vitest coverage in the existing style plus isolation coverage for every new function.

## Part 3 — Many salons

### One site, many addresses

- *My call:* **one build, one Cloudflare Pages project**, with every salon's domain attached to it (free plan allows commercial use and many custom domains; Vercel's free plan doesn't allow commercial use). `vercel.json` and the Vercel references in `docs/notifications-setup.md` are replaced.
- At startup the site looks up **its salon from the web address** through a **domains table** in the shared database (`domain → salon_id`, e.g. `elegance-demo.com → Élégance`, `salon-yasmine.com → Yasmine`, `sara-salon.com → Sara`). The edge middleware reads the request's host, looks it up (cached for a few minutes), and the app then uses that salon's id for every query.
  - **Each domain is unique** (database constraint): one address can never point to two salons.
  - **Hosts are normalised** before lookup and on insert: lowercase, `www.` stripped, so `WWW.Sara-Salon.com` finds Sara.
  - **A salon may have several domains** (several rows pointing to it).
  - An **unknown address** shows a simple "salon introuvable" page, never another salon's site.
  - The domains table is public-readable (domains are public anyway) but written only by the product owner's script.
  - Local development picks a salon with an env var or `?salon=` parameter.
- Deep links (`/admin`, `/admin?day=…&booking=…`) must work on every domain, and `sw.js` / the manifest are served as real files.
- *My call:* a small Cloudflare Pages Function (edge middleware) serves, per domain, the right `<title>`, `theme-color` and web-app manifest (name, short name, theme color), because these are read before the app's JavaScript runs (home-screen install, link previews).

### Branding from the database

The `salons` row holds what the product owner sets at launch: name (FR + AR), main color and its generated shades, photos, and the **salon story and claims**. Everything that currently says "Élégance" or is salon-specific reads from it: Navbar, Footer (name, copyright), AdminPage header, the `admin.push.iosStep3` copy, the WhatsApp client messages in `src/data/whatsapp.ts`, the hero image, push notification text.

**Salon story and claims** (decided by the product owner): founder name and role, founder story (FR + AR), years open, client count, rating and review count. **Any field left empty is hidden** (the badge, the rating line, or the whole philosophy quote/signature), and the layout still looks complete without it. The stylist count is computed from the active stylists. Today's hard-coded claims (`TrustBadges` "15+ ans, 2 500+ clientes, 3 coiffeuses, 4,9"; hero "4,9 · 240 avis vérifiés"; philosophy "Depuis quinze ans au cœur d'Alger…", "Amina, Fondatrice & coiffeuse") become Élégance's values. Other generic copy stays the same for all salons, with the salon name and city interpolated.

### Colors

- The main color generates the full 50–900 scale that replaces today's `rose` scale. Because one build serves every salon, colors are applied **at runtime through CSS variables** that the Tailwind tokens point to (the token can stay `rose` or become `brand` — builder's call; still one token used everywhere, no raw hex in components).
- Shades are generated **when the product owner sets the color** (in the setup script) and stored, so the site doesn't compute them on every load.
- **Cream background and gold accents stay the same for every salon.**
- *My call:* the generation **checks readability** (WCAG AA for button text on the button color, headings on the background, footer text on the footer) and **darkens a failing shade automatically, printing a warning**.
- Élégance's current palette must come out the same (or visually indistinguishable).
- The page should not flash Élégance's colors before the salon's load (the edge middleware can inline the salon's CSS variables).

### Photos

*My call:* one public Supabase Storage bucket with a folder per salon; only the product owner (via the script, with the service key) writes to it. A service or stylist the owner adds without a photo shows a tasteful placeholder (category icon / initials); the product owner adds the real photo on request with a script command.

### Automatic updates

On merge to `main`, one GitHub Actions workflow: run `pnpm test`, `supabase test db` and `supabase db lint` → apply migrations to the shared database → deploy Edge Functions → build and deploy the site. Every salon is updated at once. The repo belongs to a teammate, so CI secrets must be added by someone with admin access; flag it, don't work around it.

### Launching a new salon (guided script)

One command (e.g. `pnpm new-salon <slug>`), resumable, that:

1. Creates the salon row: name, main color (shades + readability check), story and claims, domain.
2. Loads starting data (services, stylists, hours, address, city, WhatsApp number) and uploads photos to the salon's folder.
3. Creates the owner's login (email + password) and links her to the salon in `private.staff`. Sign-ups stay disabled.
4. Attaches the domain to the Pages project (after the manual purchase through Cloudflare Registrar, ~$10/year; the script tells the product owner when).
5. Prints a summary: site URL, admin URL, owner email, what's left by hand.

No new database, no new secrets, no deploy needed per salon. Push notifications need nothing per salon (one VAPID key pair for the whole product).

### Open (must be answered before Part 3 is planned)

Which Supabase organization holds "HairSalon" (the product owner's own or the teammate's) and which Cloudflare account will host the site. "HairSalon" is on the free plan (it paused itself on 2026-11-05); it must move to a Pro plan in an organization the product owner controls before real salons go on it.

### What's left to the builder

Domain lookup and caching, the middleware details, the script's implementation (Supabase CLI / Management API / service key), color algorithm (within the readability rule and Élégance's palette), CI secret handling.

## Part 4 — The demo

- **Élégance is a normal salon in the shared database** with a `demo` flag, made-up services, stylists and photos, and its own address.
- Prospects try both sides: **as a client** (book on the public site) and **as the owner** (agenda + Réglages), where they can change prices, close dates, move bookings.
- *My call:* the demo's `/admin` login page shows an **"Essayer la démo"** button that signs in with a demo owner account in one tap. Only the demo salon's address shows it.
- *My call:* **nightly reset** (~03:00 Algiers time, e.g. `pg_cron`) restores Élégance's original services, stylists, hours, closed dates and salon info, deletes its bookings and the demo account's push subscriptions, and generates **a week of realistic fake bookings** relative to the current date (mix of statuses and sources, a couple pending). **The reset touches only the demo salon's rows**; an isolation test proves that running it leaves another salon's data unchanged.
- **Shared demo state is accepted** (decided by the product owner): every visitor uses the same demo owner account and sees the others' changes until the reset. Safeguards:
  - **Client phone numbers are masked in the demo** for the demo owner account (e.g. `05•• •• •• 12`).
  - A **"Réinitialiser la démo"** action, available **only to the product owner's own staff account** in the demo salon, runs the reset immediately.
  - Prospects may still edit text; no extra restrictions.
- *My call:* **the demo never notifies or messages anyone except the product owner.**
  - The demo owner account cannot enable push notifications (the Notifications row explains it's disabled in the demo). Only the product owner's own account can subscribe.
  - The demo's WhatsApp number is the product owner's.
  - The WhatsApp "message to the client" button, in the demo, shows the prepared message but opens WhatsApp to the **salon (product owner's) number** instead of a number typed by a prospect.
- **Abuse limits stay on**, counted for the demo salon only. Known risk: during a busy pitch the per-IP limit could block test bookings from one phone; the reset clears counts. The builder should check the limit values against a realistic pitch and report if they'd get in the way; do not silently disable them.

### What's left to the builder

Reset mechanism, fake data generation, how the demo account is told apart from the product owner's account.
