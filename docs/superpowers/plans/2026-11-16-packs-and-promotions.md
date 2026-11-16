# Packs and Promotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners sell packs (a service of category `pack` with its included services and one person responsible) and run promotions (promo price between two days) shown as a crossed-out price; every booking records the effective price, and a price that changed between display and confirmation is refused.

**Architecture:** New columns on `public.services`; one private function gives the effective price (promo by the Algiers date of the booking) and every booking path uses it. The pack's person responsible lives on the pack (`pack_stylist_id`) and is mirrored into `stylist_services` by the pack's save, so availability works unchanged; stylist saves and provisioning never touch pack rows. The client page groups packs first and shows crossed prices; Réglages gets a Packs section and a Promotion part in both forms.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Vite + React 18 + TS + Tailwind + React Query + react-hook-form/zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-packs-and-promotions-design.md`

## Global Constraints
- Never edit a pushed migration. New migration: `supabase/migrations/20261120100000_packs_promotions.sql` (after `20261119100000_manage_visit.sql`). Local stack only for verification (`supabase db reset`, `supabase test db`, `supabase db lint --level warning`); never `--linked`/`db push`.
- Salon isolation: owner functions use `private.my_salon()` and take no salon id; included services and the person responsible must be the owner's salon's; another salon's id behaves like a missing one. New/changed public functions keep isolation tests (`10_isolation`) and guard registration (`11_guard`).
- Columns on `public.services`: `includes text[] not null default '{}'`, `pack_stylist_id text` (FK `(salon_id, pack_stylist_id)` → `stylists(salon_id, id)`), `promo_price integer`, `promo_from date`, `promo_to date`. Table checks: the three promo columns all null or all set; `promo_from <= promo_to`; `promo_price >= 0 and promo_price < price`; `(category = 'pack') = (pack_stylist_id is not null)`.
- Effective price: `promo_price` when `promo_from <= (now() at time zone 'Africa/Algiers')::date <= promo_to`, else `price`.
- Error codes (exact): `price_changed` (create_visit), `invalid_promo` (promo fields), `invalid_pack` (pack without a valid active person responsible, includes not this salon's non-pack services, category change to/from `pack`).
- Category `pack`: icon `gift` (lucide `Gift`); display order everywhere on the client page: `pack`, `coiffure`, `beaute`, `spa`. The Réglages service form never offers `pack` (packs have their own section).
- Strings in fr and ar (list in Task 2); logical CSS; lucide only; no sticky UI; `pnpm check:bundle` passes without raising the cap (now ≈193 KB of 195).
- Copy (fr / ar): `category.pack` Packs / الباقات · `services.includes` Comprend : {list} / تشمل: {list} · `booking.error.priceChanged` Le prix vient de changer (une promotion a commencé ou pris fin). Vérifiez le nouveau total avant de confirmer. / تغيّر السعر للتو (بدأ عرض أو انتهى). تحقّقي من المجموع الجديد قبل التأكيد. · settings keys in Task 4.

## Review Focus
1. **Midnight boundary:** the page showed the promo, the server's date moved past `promo_to` → `price_changed`, the confirm step shows the new total, nothing booked. Tests: Task 1 `create_visit refuses a stale total with price_changed`; Task 3 `price_changed refreshes prices and stays on the confirm step`.
2. **Saving a stylist doesn't unlink her packs:** `admin_save_stylist` with a service list that omits the pack keeps the pack's row. Test: Task 1 `saving the person responsible keeps her pack`.
3. **Re-running provisioning keeps owner packs and promos** (launch script re-run, demo reset restores them from the snapshot). Tests: Task 5.
4. **The owner lowers a regular price below its promo** → `invalid_promo`, with an inline message on the price/promo fields. Tests: Task 1 `a promo must stay below the price`; Task 4 form test.
5. **A pack + another service done by the same person** → placed back to back, no overlap. Test: Task 1 `a pack and a service by the same person are placed back to back`.

---

### Task 1: Database — columns, effective price, packs in the owner functions, price check
**Files:** Create `supabase/migrations/20261120100000_packs_promotions.sql`, `supabase/tests/database/23_packs_promotions.test.sql`; modify `10_isolation.test.sql`, `11_guard.test.sql` (only if a public function name is added), `CLAUDE.md` (Owner settings + Booking flow paragraphs).
**Interfaces (produces):**
- `private.service_price(p_salon_id text, p_service_id text) returns integer` — effective price now (null if no such service).
- Redefined from their latest versions, using `private.service_price` for the stored price: `private.visit_items` (so `get_visit_slots`/`create_visit` price parts), `public.create_booking`, `public.admin_create_booking`, `public.admin_update_booking` (only when the service changes — today's keep rule).
- `public.create_visit(... existing params ..., p_expected_total integer default null)` — when not null and ≠ sum of the parts' effective prices: `raise exception 'price_changed'`. Drop + recreate (signature change); grants as before.
- `public.admin_save_service(p_id, p_name, p_description, p_category, p_price, p_duration, p_sort_order, p_includes text[] default '{}', p_pack_stylist_id text default null, p_promo_price integer default null, p_promo_from date default null, p_promo_to date default null) returns text` — category `pack` allowed on create only; an existing service's category can't change to/from `pack` (`invalid_pack`); a pack needs an active stylist of the salon and includes = this salon's non-pack services (`invalid_pack`); promo all-or-none, `promo_price < price`, `from <= to` (`invalid_promo`); for a pack, replaces its single `stylist_services` row with `(salon, pack_stylist_id, id)`.
- `public.admin_save_stylist` (latest) — its service list excludes packs: it deletes/inserts only rows whose service isn't a pack, and ignores pack ids sent to it.
- `private.category_icon('pack') = 'gift'`.
- [ ] Tests first (`23_packs_promotions`, names): `effective price is the promo inside its days, the price outside`; `create_visit records the promo price`; `create_visit refuses a stale total with price_changed` (expected total ≠ server total → `price_changed`, no row); `create_visit accepts the right total and no total`; `create_booking and admin_create_booking record the promo price`; `admin_update_booking keeps the price unless the service changes`; `a pack is saved with its person responsible as its only stylist_services row`; `a pack needs an active person responsible of the salon` (`invalid_pack`); `a pack's includes must be this salon's services, not packs` (`invalid_pack`); `a service can't become a pack and a pack can't change category` (`invalid_pack`); `a promo must stay below the price` (saving price ≤ promo → `invalid_promo`); `promo needs all three fields and from <= to` (`invalid_promo`); `saving the person responsible keeps her pack`; `a pack and a service by the same person are placed back to back` (create_visit with both, one stylist, consecutive ranges). Isolation: another salon's stylist as `p_pack_stylist_id` → `invalid_pack`; another salon's service in `p_includes` → `invalid_pack`.
- [ ] `supabase db reset && supabase test db` → new file FAILS; implement the migration; rerun → all PASS; `supabase db lint --level warning` clean.
- [ ] CLAUDE.md: packs (category `pack`, `pack_stylist_id` mirrored into `stylist_services`, stylist saves skip pack rows), promotions (effective price by booking date, `price_changed`), update the "Service categories are …" sentence.
- [ ] Commit `feat(db): packs and promotions — effective price, pack rules, price check`.

### Task 2: Data layer — types, effective price, categories, strings
**Files:** `src/data/types.ts`, `src/data/queries.ts`, `src/data/categories.ts`, `src/data/visit.ts`, create `src/data/pricing.ts` + `src/data/pricing.test.ts`, `src/data/bookings.ts` (`toBookingError` knows `price_changed`; `createVisit` sends `p_expected_total`), `src/data/salonSettings.ts` (save hook params), `src/components/serviceIcons.ts` (`gift`), `src/context/LanguageContext.tsx`.
**Interfaces (produces):**
- `Service` gains `includes: string[]`, `packStylistId: string | null`, `promo: { price: number; from: string; to: string } | null` (`from`/`to` as `YYYY-MM-DD`).
- `effectivePrice(s: Pick<Service, 'price' | 'promo'>, today?: string): { price: number; regular: number | null }` — `regular` is the crossed-out price when a promo runs (`today` defaults to the Algiers date via `algiersTime.ts`).
- `CATEGORIES = ['pack', 'coiffure', 'beaute', 'spa']` (display order); `SERVICE_FORM_CATEGORIES = ['coiffure', 'beaute', 'spa']`.
- `visitTotals` sums effective prices. `createVisit(input & { expectedTotal: number })`.
- Settings strings (fr / ar): `settings.section.packs` Packs / الباقات · `settings.pack.new` Nouveau pack / باقة جديدة · `settings.pack.stylist` Personne responsable / المسؤولة · `settings.pack.includes` Prestations incluses / الخدمات المشمولة · `settings.pack.unbookable` La personne responsable est masquée : ce pack ne peut pas être réservé en ligne. / المسؤولة مخفية: لا يمكن حجز هذه الباقة عبر الإنترنت. · `settings.promo.title` Promotion / عرض ترويجي · `settings.promo.price` Prix promotionnel / السعر الترويجي · `settings.promo.days` Du … au … / من … إلى … · `settings.promo.running` Promotion en cours / عرض جارٍ · `settings.promo.upcoming` Promotion à venir / عرض قادم · `settings.error.invalid_promo` Le prix promotionnel doit être inférieur au prix, avec un premier et un dernier jour. / يجب أن يكون السعر الترويجي أقل من السعر، مع يوم أول ويوم أخير. · `settings.error.invalid_pack` Choisissez une personne responsable active et des prestations du salon. / اختاري مسؤولة نشطة وخدمات من الصالون.
- [ ] Tests first: `effectivePrice` inside/outside/first-day/last-day; `visitTotals uses promo prices`; `groupByCategory puts packs first`; `toBookingError maps price_changed`; `createVisit sends p_expected_total`. FAIL → implement → PASS; `pnpm test && npx tsc -b`. Commit `feat(data): packs, promotions and effective price on the client`.

### Task 3: Client page — La carte, booking, crossed prices, price_changed
**Files:** `src/components/Services.tsx`, `src/components/Booking.tsx`, `src/components/booking/*` (summary), tests in `Services.test.tsx`, `Booking.test.tsx`.
**Interfaces (consumes):** Task 2.
- La carte: a "Packs" group first (heading `category.pack`), pack rows show `services.includes` with the included services' names (salon's services, in their order); every price shows `effectivePrice` — when `regular` is set, the regular price crossed out (`line-through`, 60 %) before the promo price, with an sr-only "au lieu de" (fr) / "بدلاً من" (ar).
- Booking: packs first in step 0 (rows show includes); the stylist step lists only non-pack parts, and is skipped (Continuer from 0 → 2, Retour from 2 → 0) when every part is a pack; totals, summary and success use effective prices with the same crossed display for single parts; `create_visit` gets `expectedTotal = totals.price`; on `price_changed`: invalidate services, stay on the confirm step, show `booking.error.priceChanged` in the alert.
- [ ] Tests first: `packs come first under Packs with what they include`; `a running promo shows the crossed regular price`; `a pack alone skips the stylist step and Retour comes back to services`; `a pack with a service shows only the service in the stylist step`; `sends the total it showed`; `price_changed refreshes prices and stays on the confirm step`. FAIL → implement → PASS; full suite, tsc, build, check:bundle. Commit `feat(site): packs and promotions on the client page`.

### Task 4: Réglages — Packs section and Promotion fields
**Files:** `src/pages/SettingsPage.tsx` (Packs entry), create `src/components/settings/PacksSettings.tsx` (+ test), modify `src/components/settings/ServicesSettings.tsx` (Promotion part, list badges, category select from `SERVICE_FORM_CATEGORIES`, list excludes packs), `src/components/settings/StylistsSettings.tsx` (service checkboxes exclude packs), `src/data/schemas.ts` (promo rules mirrored client-side), route `/admin/settings/packs`.
- Pack form: name fr/ar, description fr/ar, photo (`ServicePhotoField`, same upload path), price, duration (15-min, ≤ 600), person responsible (select of active stylists), included services (checkbox list of non-pack services), Promotion part (price + `DateRangeField`), hide/show like services; warning `settings.pack.unbookable` when the person responsible is hidden. Saves through `admin_save_service` with category `pack`; errors mapped inline (`invalid_pack` on the person/includes, `invalid_promo` on the promo fields).
- Service form: same Promotion part; list rows show `settings.promo.running`/`upcoming` with the promo price.
- [ ] Tests first: `creates a pack with its person, includes and price`; `the pack form requires a person responsible`; `a promo above the price is refused inline`; `the service list marks a running promotion`; `the stylist form doesn't offer packs`; `the service form doesn't offer the pack category`. FAIL → implement → PASS (wrap in `FeedbackProvider`); full suite, tsc, build, check:bundle. Commit `feat(settings): packs and promotions in Réglages`.

### Task 5: Provisioning and the demo
**Files:** migration from Task 1 (append) or a second migration `20261120100100_packs_snapshot.sql`; `supabase/tests/database/17_demo_reset.test.sql` (+ provisioning test file); `salons/README.md` (packs are made in Réglages; the launch script keeps them).
- `private.salon_snapshot` includes each service's `includes`, `pack_stylist_id`, promo fields; `provision_salon` accepts them (category `pack` allowed, same validation as the owner function) and, when re-run from the launch file on an existing salon, **never deletes or changes packs or promotions the file doesn't mention**; the demo reset restores packs, their `stylist_services` rows and promos from the snapshot.
- [ ] Tests first: `the snapshot carries packs and promotions`; `demo reset restores a pack, its person and a promo`; `re-provisioning from a file without packs keeps the owner's packs and promos`. FAIL → implement → PASS. Commit `feat(db): packs and promotions survive provisioning and the demo reset`.

## Final check
`supabase test db`, lint; `pnpm test`, `npx tsc -b`, `pnpm build`, `pnpm check:bundle`; manual pass at 390 px FR/AR on the local stack (create a pack and a promo in Réglages, book the pack, see the crossed price, run a stale-total booking); whole-branch review.
