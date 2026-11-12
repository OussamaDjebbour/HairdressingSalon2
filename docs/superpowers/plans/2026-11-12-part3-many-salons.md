# Part 3 — Many Salons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One build serves every salon: the site finds its salon from the web address, takes its name, colors, photos and story from the database, is hosted on Cloudflare Pages, updates itself for every salon on each merge to `main`, and a new salon is launched with one command, `pnpm new-salon <slug>`.

**Architecture:** Branding moves into `public.salons` (plus a `salon_domains` table and a public `salon-photos` Storage bucket). The app resolves its salon once at startup from `location.host` (dev override by env / `?salon=`) and exposes it through a small store + `useSalon()`; `SALON_ID` becomes `currentSalonId()`. Tailwind's `rose` scale is rewritten to CSS variables (`rgb(var(--brand-600) / <alpha-value>)`), defaulting to Élégance's current values, so every existing class keeps working and each salon's palette is applied at runtime. A Cloudflare Pages Function rewrites the HTML head (title, theme-color, inlined palette) and serves a per-host web-app manifest before any JavaScript runs. Provisioning is one service-role-only SQL function, `public.provision_salon(jsonb)`, called by a local Node script that also uploads photos, creates the owner's login and attaches the domain through the Cloudflare API — the same function a future admin page could call.

**Tech Stack:** Supabase Postgres (migrations, pgTAP, Storage), React 18 + TS + Tailwind, Vitest, Cloudflare Pages + Pages Functions (Workers runtime, `HTMLRewriter`), `wrangler`, Node script run with `tsx`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-multi-salon-design.md` — section "Part 3 — Many salons" (and Parts 1–2 rules it must keep). Read both. `CLAUDE.md` § Salons and § Owner settings.

## Global Constraints

- **Stacked on Part 2:** branch `feat/part3-many-salons` from `feat/part2-owner-settings` (PR #10, not yet merged). Never edit migrations up to `20261113100400_settings_salon_rpcs.sql`.
- **Product-owner decisions (2026-11-12):** salons are created **only by the product owner, with a script** — no admin UI. The Supabase project is in the product owner's own account; **no Cloudflare account exists yet** (creating it is a manual prerequisite, Task 9).
- **Isolation (Parts 1–2):** every new table has `salon_id` NOT NULL FK + RLS (`salons` itself is allow-listed in `11_guard`); functions callable by `anon`/`authenticated` need isolation tests + guard registration. `provision_salon` is executable by `service_role` **only** (revoke from public, anon, authenticated). Never take a salon id from the browser in owner functions. No blanket `revoke … on all functions in schema private`.
- **Branding is written only by the product owner** (script / service role). No write grants or policies for `anon`/`authenticated` on branding columns or `salon_domains`; the owner's `admin_save_salon_info` must keep touching only address/city/whatsapp/socials.
- **Élégance must look exactly as today:** its palette is seeded verbatim from `tailwind.config.js` (`rose` 50–900: `#FBF1F3 #F7E0E5 #EFC1CC #E29FB1 #D17D93 #B85F76 #9D4B5F #7E3B4C #5F2D3A #421F28`), its claims are today's ("15+" years, "2 500+" clients, rating 4,9, 240 reviews, founder "Amina", role "Fondatrice & coiffeuse", today's philosophy quote), hero image today's Pexels URL.
- **Cream and gold scales stay fixed** for every salon; only the primary (`rose`) scale changes.
- **Readability rule:** generated palettes must meet WCAG AA (4.5:1) for white text on `600`/`700`/`800` (buttons, header, footer) and `800`/`900` text on `cream-50`; failing shades are darkened automatically and the script prints a warning.
- **Domains:** stored lowercase without a leading `www.`; unique; an unknown host shows a "salon introuvable" page, never another salon.
- **Story/claims fields left empty are hidden**; the stylist count shown is computed from active stylists.
- Every UI string through `t()` (fr + ar); logical CSS properties; lucide-react only; phone layout at 360 px.
- Secrets never in the repo. Local script secrets live in a git-ignored `.env.admin` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_PAGES_PROJECT`).
- Verify with `supabase db reset && supabase test db`, `supabase db lint --level warning --fail-on warning`, `pnpm test && npx tsc -b`.

## Review Focus

1. **A request for a host that isn't in `salon_domains`** (typo domain, `*.pages.dev` preview, raw IP) → "salon introuvable", no queries for any salon's data. (Tasks 4, 6.)
2. **`WWW.Sara-Salon.com` / `sara-salon.com.` (trailing dot) / `sara-salon.com:443`** → resolves to Sara. (Tasks 1, 4, 6.)
3. **A palette from a very light brand color (`#F2E205`)** → generated shades pass the readability rule; buttons and footer text stay readable. (Task 2.)
4. **Re-running `pnpm new-salon sara` after a failure halfway** → finishes without duplicating rows, users or domains. (Tasks 1, 7.)
5. **First paint on a non-Élégance domain** → no flash of Élégance's rose colours or title before the app loads. (Task 6.)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261114100000_salon_branding.sql` | branding columns on `salons`, `salon_domains`, `salon-photos` bucket, Élégance seed, `provision_salon` |
| `supabase/tests/database/15_branding.test.sql` | schema, domain normalisation, provisioning idempotence, grants |
| `src/lib/palette.ts` (+ test) | generate a 50–900 scale from one colour; contrast checks; auto-darken |
| `tailwind.config.js`, `src/index.css`, `src/lib/theme.ts` (+ test) | `rose` → CSS variables with Élégance defaults; `applyPalette()` |
| `src/data/currentSalon.ts` (+ test), `src/main.tsx`, `src/data/salon.ts`, `src/pages/SalonNotFound.tsx` | resolve salon from host at startup; `currentSalonId()`, `useSalon()` |
| `src/components/{Navbar,Footer,Hero,TrustBadges,Philosophy}.tsx`, `admin/AdminShell.tsx`, `src/data/whatsapp.ts`, `src/context/LanguageContext.tsx` | read branding from the salon |
| `functions/_middleware.ts`, `functions/manifest.webmanifest.ts`, `functions/_lib/head.ts` (+ test) | Cloudflare edge: head rewrite + per-host manifest |
| `salons/README.md`, `salons/example.json`, `scripts/new-salon.ts`, `scripts/lib/*.ts` (+ tests) | provisioning config + script |
| `.github/workflows/deploy.yml`, `docs/deploy.md` | automatic updates for every salon; account setup |

---

### Task 1: Branding data, domains, photo bucket and `provision_salon`

**Files:**
- Create: `supabase/migrations/20261114100000_salon_branding.sql`, `supabase/tests/database/15_branding.test.sql`
- Modify: `supabase/seed.sql` (local `localhost` and `127.0.0.1` domains → `elegance`), `supabase/tests/database/11_guard.test.sql` only if needed (new table must pass unchanged)

**Interfaces:**
- Produces:
  - `public.salons` gains: `name_ar text` (null → use `name`), `palette jsonb not null` (keys `"50"`…`"900"`, values `#RRGGBB`; check: 10 keys), `hero_image text not null default ''`, `founder_name text`, `founder_role jsonb` (`{fr, ar}`), `story jsonb` (`{fr, ar}`), `years_open integer check (> 0)`, `client_count integer check (> 0)`, `rating numeric(2,1) check (between 1 and 5)`, `review_count integer check (> 0)`. The default for `palette` is Élégance's scale (Global Constraints) so the column can be NOT NULL.
  - Élégance row seeded with today's values (Global Constraints); `story` = today's `philosophy.quote` texts (fr + ar) from `LanguageContext.tsx`.
  - `public.salon_domains (domain text primary key check (domain = lower(domain) and domain !~ '^www\.' and domain !~ '[:/ ]' and domain !~ '\.$'), salon_id text not null references public.salons on delete cascade)`; RLS on; public read `to anon, authenticated using (true)`; `revoke insert, update, delete, truncate … from anon, authenticated`.
  - `private.normalize_host(p text) returns text` — lowercase, trim, strip a trailing dot, a `:port`, and a leading `www.`.
  - Storage bucket `salon-photos` (public read; no insert/update/delete policies for anon/authenticated — the service role writes).
  - `public.provision_salon(p jsonb) returns text` — `security definer`, `set search_path = ''`, execute granted to `service_role` only. Upserts (idempotent; safe to re-run): the salon row (id, name, name_ar, palette, hero_image, story fields, address, city, whatsapp, socials), its domains (normalised; a domain owned by **another** salon → raises `domain_taken`), its 7 `salon_hours`, services and stylists (by id; ids must be unique across salons — an id owned by another salon → raises `id_taken`), `stylist_services`, `stylist_workdays`, and — when `p->>'owner_user_id'` is present — the `private.staff` row (a user already staff of another salon → `staff_taken`). Returns the salon id. Input shape documented in a SQL comment and mirrored by `salons/example.json` (Task 7).

- [ ] **Step 1: Failing `15_branding.test.sql`:** Élégance's palette `"600"` = `#9D4B5F` and `"900"` = `#421F28`; `rating = 4.9`, `review_count = 240`; `salon_domains` rejects `'WWW.x.com'`, `'x.com:443'`, `'x.com.'`; `private.normalize_host('WWW.Sara-Salon.com.:443')` = `'sara-salon.com'`; anon reads `salon_domains` but `insert` → `42501`; anon/authenticated cannot execute `provision_salon` (`has_function_privilege` false); as `service_role`: provisioning a full `sara` payload (2 services, 1 stylist, hours, domain `sara-salon.com`) creates the rows; calling it again with the same payload leaves exactly the same row counts; a payload claiming `elegance`'s domain → `domain_taken`; a payload reusing service id `coupe-femme` → `id_taken`; Élégance rows unchanged afterwards.
- [ ] **Step 2: Run** — FAIL. **Step 3:** migration + seed. **Step 4: Run** full DB suite + lint — PASS (guard unchanged).
- [ ] **Step 5: Commit** — `feat(db): salon branding, domains, photo bucket and provisioning`

---

### Task 2: Palette generation with the readability rule

**Files:** Create `src/lib/palette.ts`, `src/lib/palette.test.ts`

**Interfaces:**
- Produces: `type Palette = Record<'50'|'100'|'200'|'300'|'400'|'500'|'600'|'700'|'800'|'900', string>`; `contrastRatio(fg: string, bg: string): number` (WCAG relative luminance); `generatePalette(base: string): { palette: Palette; warnings: string[] }` — the base colour becomes `600`; lighter steps mix toward white and darker toward black in OKLCH (or HSL if simpler, documented), then each check in the Readability rule is enforced by darkening the failing shade in small lightness steps until it passes, adding a warning naming the shade and the check. `CREAM_50 = '#FDFBF8'`. `isHexColor(s): boolean`.

- [ ] **Step 1: Failing tests:** `contrastRatio('#FFFFFF', '#000000')` ≈ 21; `generatePalette('#9D4B5F').palette['600']` = `'#9D4B5F'` and 50 is lighter than 100 … 900 darkest (monotonic luminance); for `#F2E205` and `#7FFFD4` every Readability check passes and `warnings.length > 0`; for `#9D4B5F` no warnings; invalid input throws.
- [ ] **Step 2–4:** FAIL → implement → `pnpm test` PASS.
- [ ] **Step 5: Commit** — `feat(theme): palette generation with readability checks`

---

### Task 3: Brand colour through CSS variables

**Files:** Modify `tailwind.config.js`, `src/index.css`; create `src/lib/theme.ts`, `src/lib/theme.test.ts`

**Interfaces:**
- Produces: in `tailwind.config.js`, `rose: { 50: 'rgb(var(--brand-50) / <alpha-value>)', … 900: … }` (token name stays `rose`, so no component changes); in `src/index.css` `:root { --brand-50: 251 241 243; … --brand-900: 66 31 40; }` = Élégance's current values as space-separated RGB channels; `src/lib/theme.ts`: `paletteToCssVars(p: Palette): Record<string, string>` (`'--brand-600' → '157 75 95'`) and `applyPalette(p: Palette, root = document.documentElement): void`.

- [ ] **Step 1: Failing tests:** `paletteToCssVars` converts Élégance's palette to the exact channel strings in `index.css`; `applyPalette` sets them on a test element; a test reads `tailwind.config.js` and asserts every `rose` step is a `var(--brand-N)` with `<alpha-value>`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Also run `pnpm build` and check the built CSS contains `rgb(var(--brand-800)` and that classes with opacity (e.g. `bg-rose-800/60`) compile.
- [ ] **Step 5: Commit** — `feat(theme): brand colour scale through CSS variables`

---

### Task 4: The app finds its salon from the web address

**Files:**
- Create: `src/data/currentSalon.ts`, `src/data/currentSalon.test.ts`, `src/pages/SalonNotFound.tsx`
- Modify: `src/main.tsx`, `src/data/salon.ts`, every `SALON_ID` user (`queries.ts`, `bookings.ts`, `salonSettings.ts`, `admin/SalonGate.tsx`), `src/vite-env.d.ts`, `.env.example`, tests that mock `SALON_ID`

**Interfaces:**
- Produces:
  - `interface CurrentSalon { id: string; name: Record<Lang, string>; palette: Palette; heroImage: string; founderName: string | null; founderRole: Record<Lang,string> | null; story: Record<Lang,string> | null; yearsOpen: number | null; clientCount: number | null; rating: number | null; reviewCount: number | null }`.
  - `normalizeHost(host: string): string` (same rules as `private.normalize_host`).
  - `resolveSalon(host: string, search: string): Promise<CurrentSalon | null>` — dev override first: `VITE_SALON_ID` env, then `?salon=<id>` **only when the host is `localhost`/`127.0.0.1`**; otherwise `from('salon_domains').select('salon:salons(…)').eq('domain', normalizeHost(host)).maybeSingle()`.
  - `setCurrentSalon(s)`, `currentSalonId(): string` (throws if unset), `useSalon(): CurrentSalon`.
  - `src/main.tsx` awaits `resolveSalon` before rendering: found → `setCurrentSalon` + `applyPalette` + `document.title = name` + render the app; `null` → render `SalonNotFound` ("Salon introuvable" / "الصالون غير موجود", no data queries); network error → a minimal retry screen.
  - `src/data/salon.ts`: `SALON_ID` constant removed; callers use `currentSalonId()`.

- [ ] **Step 1: Failing tests:** `normalizeHost('WWW.Sara-Salon.com.:443')` = `'sara-salon.com'`; `resolveSalon('sara-salon.com', '')` queries `salon_domains` with `domain = 'sara-salon.com'` and maps the row; `resolveSalon('evil.com', '?salon=elegance')` ignores the override (not localhost); `resolveSalon('localhost:5173', '?salon=sara')` returns sara's row; unknown → `null`; `currentSalonId()` before `setCurrentSalon` throws. Existing tests keep passing with the store set in their setup.
- [ ] **Step 2–4:** FAIL → implement → `pnpm test && npx tsc -b` PASS.
- [ ] **Step 5: Commit** — `feat(app): find the salon from the web address`

---

### Task 5: Every salon-specific text and image comes from the salon

**Files:** Modify `Navbar.tsx`, `Footer.tsx`, `Hero.tsx`, `TrustBadges.tsx`, `Philosophy.tsx`, `admin/AdminShell.tsx`, `src/data/whatsapp.ts`, `src/context/LanguageContext.tsx`, `src/lib/push.ts` / NotificationsCard copy if it names the salon; their tests

**Interfaces:** Consumes `useSalon()` and `useAllStylists`/`useStylists`.
- Name: Navbar, Footer (title + `© <year> <name>`), AdminShell header use `salon.name[lang]`.
- Hero image from `salon.heroImage` (empty → the existing category-icon/placeholder style tile, no endless shimmer). Hero rating line shows `rating` + `reviewCount` only when both are set.
- TrustBadges: years/clients/rating badges only when set; the stylist badge shows the count of active stylists. With nothing set, the section still looks complete (only the stylist badge).
- Philosophy: the quote is `salon.story[lang]` and the signature `founderName` + `founderRole[lang]`; hidden entirely when `story` is null. Remove `philosophy.quote`/`philosophy.role` hard-coded copy from `LanguageContext` (now data). `hero.subtitle`'s "Alger"/"الجزائر العاصمة" becomes the salon city (`info.city[lang]`) via a `{city}` placeholder replaced at the call site.
- WhatsApp client messages and `admin.push.iosStep3` use the salon name (`{salon}` placeholder replaced at the call site).

- [ ] **Step 1: Failing tests:** with a mocked salon "Salon Yasmine" (no claims, no story, 2 active stylists): Navbar/Footer/AdminShell show "Salon Yasmine"; no "Élégance" text anywhere in the rendered HomePage; TrustBadges shows only "2"; Philosophy renders nothing; hero shows no rating line; a WhatsApp confirmation message contains "chez Salon Yasmine". With Élégance's data everything renders as today (spot-check "15+", "4,9", "240", the founder line).
- [ ] **Step 2–4:** FAIL → implement → `pnpm test && npx tsc -b` PASS; `grep -rn "Élégance" src --include=*.tsx --include=*.ts | grep -v test` returns nothing.
- [ ] **Step 5: Commit** — `feat(site): salon name, story, claims and photos come from the salon`

---

### Task 6: Cloudflare edge — per-salon head and manifest

**Files:**
- Create: `functions/_lib/head.ts`, `functions/_lib/head.test.ts`, `functions/_lib/lookup.ts`, `functions/_middleware.ts`, `functions/manifest.webmanifest.ts`, `wrangler.toml` (Pages project config: `pages_build_output_dir = "dist"`)
- Modify: `src/lib/manifest.ts` (keep linking `/manifest.webmanifest`), `public/manifest.webmanifest` (stays as the fallback for local dev), `vitest` config to include `functions/**/*.test.ts`; delete `vercel.json`
- Modify: `docs/notifications-setup.md` (Vercel → Cloudflare)

**Interfaces:**
- `functions/_lib/head.ts` (pure, tested): `normalizeHost` (same rules), `headTags(salon): { title: string; themeColor: string; style: string }` where `style` = `:root{--brand-50:…;…}`; `manifestFor(salon): object` (name `"<name> — Espace salon"`, short_name `<name>`, theme/background colours from the palette `900`/cream, same icons/start_url `/admin` as today).
- `functions/_lib/lookup.ts`: `lookupSalon(host, env)` — fetch `SUPABASE_URL/rest/v1/salon_domains?domain=eq.<host>&select=salon:salons(id,name,palette)` with the publishable key; cache the answer (including "not found") for 5 minutes with the Cache API.
- `_middleware.ts`: for `text/html` responses, `HTMLRewriter` sets `<title>`, `<meta name="theme-color">`, and appends the `<style>` to `<head>`; unknown host → pass through (the SPA shows "salon introuvable"); errors → pass through unchanged (never break the page). `manifest.webmanifest.ts` returns `manifestFor(salon)` (404 if unknown host).
- Env vars for the Pages project: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (documented in `docs/deploy.md`, Task 8).
- Deep links (`/admin`, `/admin?day=…&booking=…`, `/admin/settings/…`) still serve `index.html` (Pages SPA fallback; keep no `404.html` in `dist`).

- [ ] **Step 1: Failing tests** (`head.test.ts`): `headTags` for Élégance → title "Élégance — Salon de beauté", theme-color `#421F28`, style contains `--brand-600:157 75 95`; `manifestFor` for "Salon Yasmine" → `short_name` "Salon Yasmine"; `normalizeHost` cases as in Task 4.
- [ ] **Step 2–4:** FAIL → implement → `pnpm test && npx tsc -b` PASS; `npx wrangler pages dev dist` locally (after `pnpm build`) serves `/admin` and `/manifest.webmanifest` (with a `.dev.vars` file pointing at the local Supabase) — record the check in the report.
- [ ] **Step 5: Commit** — `feat(edge): per-salon title, colours and app manifest at the edge`

---

### Task 7: `pnpm new-salon <slug>`

**Files:**
- Create: `salons/README.md`, `salons/example.json`, `scripts/new-salon.ts`, `scripts/lib/config.ts` (+ test), `scripts/lib/provision.ts` (+ test), `scripts/lib/cloudflare.ts` (+ test)
- Modify: `package.json` (script `"new-salon": "tsx scripts/new-salon.ts"`, devDependency `tsx`), `.gitignore` (`.env.admin`, `salons/*/photos/`, and `salons/*.json` except `salons/example.json` — salon configs contain the owner's email and phone, so they stay on the product owner's machine, not in the repo), `vitest` config to include `scripts/**/*.test.ts`

**Interfaces:**
- `salons/<slug>.json` (validated by `parseSalonConfig(json): SalonConfig`, readable errors): `id`, `name {fr, ar?}`, `color` (hex), `domains[]`, `address {fr, ar?}`, `city {fr, ar?}`, `whatsapp`, `instagram?`, `facebook?`, `story? {fr, ar?}`, `founder? {name, role {fr, ar?}}`, `claims? {yearsOpen?, clientCount?, rating?, reviewCount?}`, `hours` (Monday→Sunday: `"09:00-18:00"` or `"closed"`), `services[] {id, category, name, description, price, duration, photo?}`, `stylists[] {id, name, role, services[], workdays[], photo?}`, `owner {email}`, `heroPhoto?`. Photos are file paths under `salons/<slug>/photos/`.
- `buildProvisionPayload(config, palette, photoUrls, ownerUserId?)` → the `provision_salon` jsonb (pure, tested).
- `scripts/new-salon.ts <slug> [--dry-run]` steps, each printed with ✓/✗, re-runnable:
  1. load `.env.admin`, parse the config;
  2. `generatePalette(color)` → print warnings;
  3. upload photos to `salon-photos/<id>/…` (upsert) → public URLs;
  4. find-or-create the owner's auth user (`auth.admin.listUsers` by email / `createUser` with a generated password printed once, `email_confirm: true`);
  5. `rpc('provision_salon', payload)` with the service-role client;
  6. for each domain: add it to the Pages project via the Cloudflare API (`POST /accounts/{account}/pages/projects/{project}/domains`; "already exists" = ok) and print the DNS record to create if the domain's zone isn't in the account;
  7. summary: site URL(s), `/admin` URL, owner email (+ password if just created), what's left by hand (buy the domain if not done, DNS).
  `--dry-run` validates and prints the payload without writing anything.

- [ ] **Step 1: Failing tests:** `parseSalonConfig(example.json)` succeeds; a bad colour, an unknown service id in a stylist, a weekday string like `"9-18"`, or a missing owner email → a readable error naming the field; `buildProvisionPayload` produces hours `{weekday:1…7}` with null for `"closed"`, normalised domains, `ar` defaulting to `fr`; `cloudflare.addDomain` treats the API's "already added" error as success (mocked fetch).
- [ ] **Step 2–4:** FAIL → implement → `pnpm test && npx tsc -b` PASS. Then against the **local** stack: `pnpm new-salon example --dry-run` prints a valid payload; `pnpm new-salon example` with a local `.env.admin` (local service key; Cloudflare step skipped when `CLOUDFLARE_API_TOKEN` is unset, with a warning) creates the salon; running it again changes nothing; `http://localhost:5173/?salon=<id>` shows the new salon with its colours. Record in the report.
- [ ] **Step 5: Commit** — `feat(ops): pnpm new-salon provisions a salon in one command`

---

### Task 8: Automatic updates for every salon, and the setup guide

**Files:** Create `.github/workflows/deploy.yml`, `docs/deploy.md`; modify `CLAUDE.md` (Commands + a "Salons & hosting" paragraph), `README` if any.

**Interfaces:**
- `deploy.yml`: on `push` to `main` (and manual `workflow_dispatch`): job `checks` reuses the CI steps (or `needs` the CI workflow via `workflow_call`); job `deploy` (needs checks; `environment: production`): `supabase link --project-ref $SUPABASE_PROJECT_REF` → `supabase db push` → `supabase functions deploy notify-booking --no-verify-jwt` → `pnpm build` (with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`) → `npx wrangler pages deploy dist --project-name=$CLOUDFLARE_PAGES_PROJECT --branch=main`. Database before site; any failure stops the job. Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`.
- `docs/deploy.md`: one-time setup in order — (1) upgrade the Supabase project to Pro before real salons (cost note); (2) create a Cloudflare account, a Pages project (`npx wrangler pages project create salons`), set its env vars `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` for the Functions; (3) create the API token with the exact permissions (Account → Cloudflare Pages: Edit; Zone → DNS: Edit for salon domains); (4) add the GitHub Actions secrets — **the repository belongs to a teammate and the product owner is not an admin: a repo admin must add them (or grant admin)**; (5) local `.env.admin` for the script; (6) launching a salon: buy the domain in Cloudflare Registrar → fill `salons/<slug>.json` → `pnpm new-salon <slug>` → check the site → hand over the owner login. Plus the Élégance demo's address (`<project>.pages.dev` until a demo domain is bought — add it to `salon_domains` via a one-line SQL shown in the doc).

- [ ] **Step 1:** Write the workflow; validate syntax with `npx --yes @action-validator/cli .github/workflows/deploy.yml` (or `actionlint` if available) — record output.
- [ ] **Step 2:** Write `docs/deploy.md` and the `CLAUDE.md` updates.
- [ ] **Step 3:** `pnpm test && npx tsc -b` still PASS.
- [ ] **Step 4: Commit** — `ci: deploy every salon on merge to main; setup guide`

---

### Task 9: First live rollout (needs the product owner; not run by subagents)

- [ ] Product owner: merge PR #10 (Part 2) and apply its migrations; then this branch's PR.
- [ ] Product owner: Cloudflare account + Pages project + token; GitHub secrets via a repo admin (see `docs/deploy.md`).
- [ ] `supabase db push --dry-run` (expect `20261114100000_salon_branding.sql`), then `supabase db push` from the product owner's shell; add the demo domain row.
- [ ] First deploy (merge to `main` or `workflow_dispatch`); verify on the live address: Élégance looks as before, `/admin` works, `/manifest.webmanifest` names Élégance, an unknown subdomain shows "Salon introuvable".
