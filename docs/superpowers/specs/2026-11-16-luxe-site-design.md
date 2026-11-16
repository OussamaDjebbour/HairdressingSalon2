# A luxurious client page — design

Date: 2026-11-16. Status: direction approved by the user on a throwaway build (branch `spike/luxe-hero`,
commit on top of `bbfb50d`: `HeroLuxe.tsx`, `ServicesLuxe.tsx`, `NavbarLuxe.tsx`). Points the user did not state
are marked **(my call)**.

## Why
The user asked "does it look luxurious? does it give salon vibes?". Honest answer: tasteful but not luxurious —
tool/sink photos, a text-only first screen on phones, a heavy serif, tracked-caps labels everywhere (a generic
template look). The site is a product sold to salons and Élégance is its showroom, so the first impression is the
pitch. The user saw the throwaway version and said: "yes, do the rest of the page like this".

## What the user decided
- The look must feel luxurious; the direction is mine ("no specific site, just make it feel luxurious").
- Approach B: rebuild the presentation sections, restyle the booking wizard **without changing its steps or
  behaviour**; not a booking-flow redesign.
- The throwaway hero + "La carte" are the reference: "yes, do the rest of the page like this".

## Goals
1. The whole client page (`/`) reads as one luxurious, image-led, calm design: hero, services, story, booking,
   footer, plus the "Salon introuvable" page.
2. It works for **every salon**: the salon's own brand scale (`rose-*` = runtime `--brand-*`), photos and texts
   from the database; nothing Élégance-specific in code.
3. French and Arabic (RTL) are equally refined.
4. Phone first (390 px), then desktop.

## Non-goals
- No change to the booking wizard's steps, rules, data or error behaviour; no change to any RPC.
- The owner's admin (`/admin`, Réglages) keeps its current look **(my call)**: it shares `btn-*`, `card`,
  `input`, `chip` and `font-display` with the client page (24 files), so the new look is **scoped** to the client
  page and the admin is untouched.
- No per-salon choice of theme; one design for all **(my call, YAGNI)**.
- No new database columns.

## Anti-goals
- Generic template tells: tracked-out all-caps labels above sections, numbered markers, middle-dot meta strings,
  identical rounded cards with soft shadows, scattered fade-in animations.
- Any salon's page looking broken in its own colour (e.g. dark-on-dark text), or Arabic looking like an
  afterthought.
- A slower or heavier page: the public bundle check is at 194.1 KB of its 195 KB cap.

## The design (from the approved throwaway)

**Tokens (my call)**
- Type: **Bodoni Moda** (display, regular weight, italic for secondary lines), **Jost** (text), **Amiri**
  (Arabic display), **Cairo** (Arabic text, as today). In RTL, display stacks are `'Bodoni Moda', 'Amiri'` so
  Latin words (salon name, French tagline) keep Bodoni and Arabic falls through to Amiri.
- Colour: the salon's brand scale for deep fields and text (`rose-900` etc.), **pearl** grounds (`#FBF9F8`,
  `#F4EFEC`, `#E7DFDA`) instead of cream, **champagne** (existing `gold-200/700`) as the one metallic accent.
- Shape: near-square corners (2 px) on buttons, no card shadows; thin rules (`rose-900/10`) instead of boxes.
- Motion: one load moment only — the hero photo settles (scale 1.06 → 1) and the name then the lines rise in;
  `prefers-reduced-motion` turns it off. Everything else moves only in answer to a tap.

**Sections, in order**
1. **Top bar**: transparent with light text over the hero, pearl once past the hero; salon name appears only then;
   language switch as a word ("العربية" / "Français"); "Réserver" outline button (≥ 44 px targets). A mobile menu
   is not needed (one page, one action) **(my call)**.
2. **Hero**: full-height (`100svh`) salon hero photo (`salons.hero_image`), brand colour rising from the bottom;
   salon name very large; French tagline in Bodoni italic and Arabic tagline in Amiri (both always shown, as
   today); primary "Prendre rendez-vous" (champagne fill), secondary "La carte des soins" (underlined link); one
   quiet line "Maison de beauté, {city} — {rating}/5" (rating only if set). A salon without a hero photo gets a
   deep brand field with the same type (no shimmer, no icon tile).
3. **Photo strip + La carte**: up to three tall photos taken from the salon's **service photos** (first three
   services that have one) **(my call: no new column)**, decorative (not links); strip hidden when none. Then "La carte": services grouped
   by category (category heading in champagne italic only when 2+ categories), each row = name and price large,
   description and duration small, thin rule between rows; **a row whose service has a photo shows it as a slim
   portrait thumbnail at the row's start (user's decision, option A)** so every photo the owner uploads stays
   visible — rows without a photo stay text only; photos read only through `photoUrl`/`fetchServices`, lazy; tapping a row opens the wizard on that service exactly as
   the old tiles did (`chooseService`). Loading: quiet placeholder rows; error: `DataError` with retry.
4. **La maison** (replaces Philosophy + TrustBadges): deep brand field; the story as a large Bodoni italic quote;
   intro text; founder name and role; the salon's claims folded into one plain sentence ("Depuis 15 ans à Alger,
   plus de 2 500 clientes.") only with the claims that exist **(my call: the stats band goes)**. Hidden entirely if
   the salon has no story, as today; if it has claims but no story, the sentence moves under the hero line
   **(my call)**.
5. **Booking**: same component and behaviour; restyled under the page scope: pearl ground, Bodoni headings, the step
   indicator keeps its icons and order but in the new colours and thinner lines **(my call)**; inputs with a bottom rule or 2 px corners, chips as thin-bordered rectangles, selected = brand fill; summary and
   success screen in the same language. All `chip-*` states (available / selected / partial / disabled) stay
   distinguishable (not by colour alone).
6. **Footer**: deep brand field; salon name in Bodoni; address, hours, phone/WhatsApp, socials as plain text links
   in Jost; no all-caps labels.
7. **Salon introuvable**: same type and pearl ground.

**Scoping (my call)**: the client page root gets a class (e.g. `site`); new tokens and the restyled `btn-*`,
`card`, `input`, `label`, `chip-*` rules apply under it only. Fonts: the client page uses Bodoni/Jost/Amiri;
the admin keeps Fraunces/Inter/Cairo. Google Fonts only downloads faces that are used, so the admin pays nothing.

**Tagline and labels (my call)**: the tagline stays the same generic pair for every salon ("Votre beauté, notre
savoir-faire" / "جمالكِ، خبرتنا"), as today, but through `t()`; no new column. All button/link labels via `t()`.

**Claims (my call)**: the "La maison" sentence is built from `yearsOpen`, `clientCount` and the city with
`formatClaim`, only with the claims that exist; the rating stays in the hero line only. Claims without a story:
the sentence becomes its own line under the hero line.

**Scope details (my call)**: the scope class is set on the document root while a client route is mounted
(`HomePage`, `SalonNotFound`), so Radix portals/toasts rendered into `body` are covered too. Font tokens are
namespaced (e.g. `font-site-display`, `font-site-text`) or redefined only under the scope; admin components using
`font-display` keep Fraunces. The extra `@import` CSS on admin routes is accepted (a few hundred bytes; font files
download only where used). `SalonNotFound` gets the pearl bar permanently (no hero there).

**Booking restyle extent (my call)**: scoped CSS for `btn-*`, `card*`, `input`, `label`, `chip-*` under the scope,
plus minimal className edits in `Booking.tsx` / `booking/*` where a class is inline. Chip states keep their
existing non-colour cues ("sans X" text on partial, disabled styling) — no new cues needed.

**Real salons' hero photos (my call)**: handle the empty case (deep brand field); default `object-position`
centre-top; add a short photo guideline to `salons/README.md` (portrait or wide, ≥ 1600 px, result-led).

**Brand contrast**: `src/lib/palette.ts` already guarantees white text on 600–800 and 800/900 text on cream-50
(WCAG AA), so pearl text on `rose-900` fields is safe for every salon; a test with a light brand colour confirms it.

**Copy**: every new string through `t()` in fr and ar. Remove the strings and components that disappear
(`TrustBadges`, the old `Hero`/`Services`/`Philosophy` copy such as kickers) so the public bundle stays under its cap.

## Constraints
- Palette source stays `tailwind.config.js` (pearl added there); no raw hex in components.
- Logical CSS (`ms/me/ps/pe/text-start`), lucide-react icons only, `SmartImage` for content photos (it gains
  whatever the full-bleed hero needs, e.g. `object-position`), images lazy except the hero.
- `pnpm check:bundle` must pass without raising the cap (baseline 165 KB + 30 KB = 195 KB; now 194.1 KB). Plan
  order: delete the replaced components and their strings first and measure after each task. If still over at the
  end, move the `admin.*` / `schedule.*` / `settings.*` strings out of the public `translations` dictionary into the
  lazy admin chunk **(my call; never raise the cap)**.
- Every salon colour: text on brand fields uses pearl; check contrast with the darkest and lightest plausible
  brand-900 (e.g. the demo plum and a navy).
- Tests that assert the old markup (`Services.test`, `Footer.test`, `salonContent.test`, `Booking.test` where it
  checks classes or copy) are updated, not deleted.

## Rollout (my call)
- Demo photos: choose result-led photos by hand for Élégance's hero and service images, update the salon
  (`provision_salon` via the script), then **re-capture the demo snapshot** (`pnpm setup-demo elegance`), or the
  nightly reset brings the old photos back.
- Publish after merge with `.superpowers/publish-with-push.sh` (Deploy workflow still lacks Supabase secrets).

## Approaches considered
- A. Restyle in place (keep section shapes): cheap but keeps the generic shape. Rejected.
- **B. Rebuild presentation sections, restyle booking (chosen by the user).**
- C. Also redesign the booking flow: too risky right after multi-service visits. Rejected.

## Left to the builder
- Exact sizes/spacing within the tokens above; component split; how the scope class is applied.
- Desktop composition of the hero (the throwaway crops the face tight on wide screens; a split or an
  `object-position` per breakpoint are both fine).

## Amendment (2026-11-16): La carte without the photo strip — user's choice "A"

Seen on a phone after the build: the strip repeated the thumbnails right below it (the demo's sink photo showed
three times in a row), the section ran to 2.4 screens for 6 services, rows didn't look tappable, and the strip
put weak salon photos first. Options shown: A (tighter list, no strip), B (category tabs), C (signature cards +
list). **The user chose A.**

- No strip: every service photo appears once, as its row's thumbnail.
- Row: thumbnail at the start; first line = name and price; below, the description at the full width of the
  text column; last line = duration at the start and a small "Réserver ›" cue at the end (`services.book`, chevron
  flipped in RTL). The whole row stays one link to `#booking` that opens the wizard on that service.
- Everything else in the section is unchanged (title, subtitle, category headings, loading and error states).
- Later, not now: tabs (B) automatically for salons with many services; signature cards (C) once salons have
  strong photos.

## Amendment (2026-11-16): booking polish — user asked for items 1–6 and no sticky bar

1. The service step's rows look like La carte: photo thumbnail when the service has one (no icon tile), name and
   price in the display serif, description and duration in the text font, a check and brand border when selected.
2. Navigation on phones: the primary action (Continuer / Confirmer la réservation) is full width; Retour is a small
   text link under it. Side by side from `sm` up.
3. Stylist choices (multi-service staff step) are near-square like the time chips, not round pills.
4. Jost 600 is loaded, so semi-bold text is real, not synthesized.
5. Retour is not shown on the first step.
6. The step indicator becomes a quiet line: four thin segments (brand colour up to the current step) and the text
   "Étape n sur 4 — <step name>", instead of circles with icons.
7. **User:** the navigation bar is never sticky ("I don't like that, remove it"); the running total stays in the bar
   at the end of the service step. The fade and its spacer go with it.
