# Service Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** More ready-made service categories, owner-made categories per salon, La carte tabs that wrap, and an accordion with compact rows in the booking's service step.

**Architecture:** Ready-made categories stay plain keys in `services.category`; an owner's category is a row of a new per-salon table `public.salon_categories`, and her services carry `category = 'custom'` plus `custom_category_id` with a composite FK `(salon_id, custom_category_id)`. The front end groups services by a *category key* (`'ongles'` or `'custom:<id>'`) in one helper used by every list.

**Tech Stack:** Postgres/Supabase migrations + pgTAP, React 18 + TypeScript + Tailwind, React Query, Vitest + Testing Library, the `pnpm new-salon` script (`scripts/lib`).

**Spec:** `docs/superpowers/specs/2026-11-22-service-categories-design.md`

## Global Constraints

- Branch: continue on `feat/category-tabs` (PR #30's branch); the final PR replaces #30.
- Never edit a pushed migration: one new file `supabase/migrations/20261122100000_service_categories.sql` (a second, `…100100_…`, only if a later task truly needs it).
- Salon separation: NOT NULL `salon_id` FK, no default, RLS on, composite FKs; owner functions use `private.my_salon()`, never a salon id from the browser; another salon's id behaves exactly like a missing one. Every new public function: isolation tests in `supabase/tests/database/10_isolation.test.sql` **and** its name in `11_guard.test.sql` `registered_api()`.
- No `revoke … on all functions in schema private`; revoke specific functions.
- Ready-made categories, in this order, keys exactly: `pack, coiffure, capillaire, visage, regard, ongles, epilation, maquillage, beaute, spa, massage`. Stored owner-category marker: `custom`.
- Labels (FR / AR): Packs / الباقات · Coiffure / تصفيف الشعر · Soins capillaires / العناية بالشعر · Visage / العناية بالوجه · Regard (cils & sourcils) / الرموش والحواجب · Ongles / الأظافر · Épilation / إزالة الشعر · Maquillage / المكياج · Beauté / جمال · Spa & hammam / سبا وحمّام · Massage / تدليك.
- Every user-facing string through `t()` in both `fr` and `ar`; logical CSS (`ms-`, `text-start`…); lucide-react only; no new npm dependency; no sticky UI; ≥ 44 px targets; admin uses `useConfirm`/`useToast`, never `window.confirm`.
- Empty Arabic name → stored as the French one.
- Public code must not import `src/data/admin.ts` (`pnpm check:bundle`).
- DB tests need the local stack: `supabase start -x logflare,vector,studio && supabase db reset`, then `supabase test db`.

## Review Focus

1. **A service whose owner category is missing from the loaded list** (deleted between two fetches, stale cache): it must still show, under Coiffure (the existing unknown-category rule), never crash or vanish. → Task 5 test `groupServices puts a service of an unknown owner category under coiffure`.
2. **An owner category named like a ready-made one** ("Ongles"): two groups, two keys, ticks and counts never mix. → Task 5 test `an owner category named like a ready-made one is its own group`.
3. **A prospect moves a snapshot service into a category she created, then the demo resets**: the reset succeeds and her category is gone. → Task 3 pgTAP test.
4. **Delete with only hidden services left in the category**: refused with `category_in_use`, count includes hidden ones. → Task 2 pgTAP test.
5. **12 categories at 320 px, French and Arabic**: La carte tabs wrap with no page overflow; accordion headers with a long owner name wrap and stay ≥ 44 px. → Task 10 browser check (listed widths and languages).

---

### Task 1: Schema, public read, and `admin_save_service` with owner categories

**Files:**
- Create: `supabase/migrations/20261122100000_service_categories.sql`
- Create: `supabase/tests/database/25_categories.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (plan count + new asserts), `supabase/tests/database/05_public_read.test.sql` if it lists readable tables

**Interfaces:**
- Produces (SQL):
  - `public.salon_categories (id text primary key, salon_id text not null references public.salons, name jsonb not null, sort_order integer not null default 0, unique (salon_id, id))`, RLS on, public read exactly like `public.services` (same grants/policy shape), no write grants/policies.
  - `public.services.custom_category_id text null`, FK `(salon_id, custom_category_id) references public.salon_categories (salon_id, id) on delete restrict`, check `services_custom_category check ((category = 'custom') = (custom_category_id is not null))`.
  - `private.category_icon(text)`: adds `capillaire→'sparkles'`, `visage→'heart'`, `regard→'sparkles'`, `ongles→'hand'`, `epilation→'sparkles'`, `maquillage→'brush'`, `massage→'hand'`, `custom→'sparkles'` (keys already in `src/components/serviceIcons.ts`).
  - `public.admin_save_service(...same 12 params..., p_custom_category_id text default null) returns text` (drop + recreate, same grants). Allowed `p_category`: the 11 ready-made keys + `custom`. `custom` requires `p_custom_category_id` of a category of `my_salon()`, else `invalid_category`; any other category stores `custom_category_id = null`. A pack can't be custom (`pack` is its own key; existing `invalid_pack` rules unchanged).

- [ ] **Step 1: Write the failing pgTAP tests** in `25_categories.test.sql` (same header helpers as `23_packs_promotions.test.sql`: an `elegance` owner, a `rival` salon with a category `rival-cat`):
  - `has_table('public', 'salon_categories')`, `col_not_null('public','salon_categories','salon_id')`, RLS on.
  - anon can `select` Élégance's categories; a direct `insert` into `salon_categories` as `authenticated` fails (no grant).
  - insert into `services` with `category='custom'` and null `custom_category_id` → check violation; `category='ongles'` with a `custom_category_id` → check violation; `custom_category_id='rival-cat'` on an Élégance service → FK violation.
  - `admin_save_service(null, '{"fr":"Pose gel","ar":""}', '{}', 'ongles', 3000, 60, 0)` returns an id; the row has `category='ongles'`, `icon='hand'`.
  - with an Élégance category `el-mariee` inserted directly: `admin_save_service(null, …, 'custom', 5000, 60, 0, '{}', null, null, null, null, 'el-mariee')` → row `category='custom'`, `custom_category_id='el-mariee'`.
  - `'custom'` with `p_custom_category_id` null → `invalid_category`; with `'rival-cat'` → `invalid_category`; `'ongles'` with `'el-mariee'` → saved with `custom_category_id` null.
  - moving an existing service from `custom` to `visage` clears `custom_category_id`.
  - `p_category = 'nails'` → `invalid_name` (unchanged existing code for an unknown category).
- [ ] **Step 2: Add to `10_isolation.test.sql`:** `admin_save_service` with `'custom'` + `'rival-cat'` → `invalid_category` ("save_service: other salon's category is invalid_category"); bump `plan()`.
- [ ] **Step 3: Run** `supabase test db` → the new tests FAIL (table missing).
- [ ] **Step 4: Write the migration part** (table, policy/grants, column, FK, check, `category_icon`, `admin_save_service`). Keep the icon rule: a category change moves the icon only while it is still the old category's default.
- [ ] **Step 5: Run** `supabase db reset && supabase test db` → all PASS; `supabase db lint --level warning` → no new warnings.
- [ ] **Step 6: Commit** `feat(db): owner service categories table, more ready-made keys, admin_save_service`.

### Task 2: Owner category RPCs

**Files:**
- Modify: `supabase/migrations/20261122100000_service_categories.sql`
- Modify: `supabase/tests/database/25_categories.test.sql`, `10_isolation.test.sql`, `11_guard.test.sql`

**Interfaces:**
- Produces (all `security definer set search_path = ''`, `not_authorized` when `my_salon()` is null, granted to `authenticated`):
  - `public.admin_save_category(p_id text, p_name jsonb) returns text` — `p_id` null creates (id `gen_random_uuid()::text`, `sort_order` = salon max + 1); else renames, `not_found` if not hers. FR name trimmed 2..60 chars else `invalid_name`; empty AR → FR.
  - `public.admin_reorder_categories(p_ids text[]) returns void` — `p_ids` must be exactly the set of her category ids (no duplicates, none missing, none foreign) else `invalid_category`; sets `sort_order` = 1-based position.
  - `public.admin_delete_category(p_id text) returns void` — `not_found` if not hers; `category_in_use` with `detail = '<n>'` (number of her services using it, hidden included) when n > 0.
  - Demo role: allowed (no special case).

- [ ] **Step 1: Write failing pgTAP tests** in `25_categories.test.sql`:
  - create two categories → ids returned, `sort_order` 1 and 2; empty AR name stored as FR; 1-char FR name → `invalid_name`.
  - rename keeps `sort_order`; rename `rival-cat` → `not_found`.
  - reorder `[b, a]` → sort orders swapped; reorder with a missing id, a duplicate, or `rival-cat` added → `invalid_category`, order unchanged.
  - delete an empty category → gone; delete `rival-cat` → `not_found`.
  - **Review Focus 4:** a category whose only service is hidden (`active=false`) → `category_in_use` with detail `1` (use `pg_temp.error_of`), category kept.
  - a non-staff caller → `not_authorized` for each function.
- [ ] **Step 2: Add isolation asserts** (rename/delete/reorder with `rival-cat` behave as missing; `rival`'s category untouched) and append `'admin_save_category', 'admin_reorder_categories', 'admin_delete_category'` to `registered_api()` in `11_guard.test.sql`; bump plans.
- [ ] **Step 3: Run** `supabase test db` → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(db): owner RPCs to add, rename, reorder and delete service categories`.

### Task 3: Provisioning, snapshot and demo reset

**Files:**
- Modify: `supabase/migrations/20261122100000_service_categories.sql`
- Create: `supabase/tests/database/26_categories_provisioning.test.sql`

**Interfaces:**
- `provision_salon(p jsonb)` accepts optional `"categories": [{"id", "name": {fr, ar?}, "sort_order"?}]` (id matches `^[a-z0-9][a-z0-9-]{1,59}$`, FR name 2..60, sort_order default = list position), upserted by id (`where salon_id` matches, like services) **before** services; categories not listed are kept. Bad entry → `invalid_category`.
- `private.provision_service`: `"category"` is a ready-made key or `"custom:<id>"`; the latter needs a category of that salon (→ `category='custom'`, `custom_category_id=<id>`), else `invalid_service`. Pack rules unchanged.
- `private.salon_snapshot`: adds `"categories"` (id, name, sort_order, ordered) and emits a custom service's category as `"custom:<id>"`.
- `private.demo_reset`: order becomes — delete prospect's services → `provision_salon(snapshot)` (categories then services) → delete prospect's categories (ids not in `snapshot -> 'categories'`) → delete prospect's stylists (unchanged).

- [ ] **Step 1: Write failing tests** in `26_categories_provisioning.test.sql` (copy the setup style of `24_packs_provisioning.test.sql`):
  - provisioning a salon with `categories` + a service `"category": "custom:t-mariee"` → rows exist, service linked; re-provisioning without `categories` keeps them.
  - `"custom:missing"` → `invalid_service`; a category id `"Bad Id"` → `invalid_category`; a `"custom:<rival's id>"` → `invalid_service`.
  - `salon_snapshot` of that salon contains the category and `"category": "custom:t-mariee"`; feeding it back to `provision_salon` is a no-op.
  - **Review Focus 3:** on the demo salon (set up like `17_demo_reset.test.sql`), snapshot with one category; as the prospect create category `p-cat` and move a **snapshot** service into it; `private.demo_reset('elegance')` succeeds, the service is back in its snapshot category, `p-cat` is gone; a prospect category with only a prospect service is also gone.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (re-create `provision_salon`, `provision_service`, `salon_snapshot`, `demo_reset` from their latest bodies in `20261120100100_packs_snapshot.sql`, changing only what's above; keep their grants/revokes).
- [ ] **Step 4: Run** `supabase db reset && supabase test db` → all PASS (including `16_demo`, `17_demo_reset`, `24_packs_provisioning`).
- [ ] **Step 5: Commit** `feat(db): launch payloads, snapshot and demo reset carry owner categories`.

### Task 4: Launch script (`pnpm new-salon`)

**Files:**
- Modify: `scripts/lib/config.ts`, `scripts/lib/provision.ts`, `scripts/lib/config.test.ts`, `scripts/lib/provision.test.ts`, `salons/README.md`, `salons/example.json` (optional example category)

**Interfaces:**
- `CategoryConfig { id: string; name: Bilingual }`; `SalonConfig.categories?: CategoryConfig[]`.
- `ServiceConfig.category`: any ready-made key except `pack`, or `` `custom:${string}` `` whose id is in `categories`.
- `provision.ts` sends `categories` (with `sort_order` = list position) and `category` unchanged; maps `invalid_category` to `'a category is invalid (id or name)'`.

- [ ] **Step 1: Failing Vitest cases** in `config.test.ts`: accepts `"ongles"`; accepts `"custom:sara-mariee"` with `categories: [{id: "sara-mariee", name: {fr: "Soins mariée"}}]`; rejects `"custom:nope"` (error names the path `services[0].category`); rejects `"pack"` and `"nails"` with a message listing the allowed keys; rejects a duplicate category id and a bad id format (same `ITEM_ID_RE` as services). `provision.test.ts`: payload includes `categories` with `sort_order` 0,1.
- [ ] **Step 2:** `pnpm test scripts/lib` → FAIL. **Step 3: Implement.** **Step 4:** PASS.
- [ ] **Step 5:** Document `categories[]` and `"custom:<id>"` in `salons/README.md` (table row + one example).
- [ ] **Step 6: Commit** `feat(scripts): launch files can declare the salon's own categories`.

### Task 5: Front-end data — category keys, grouping, labels, fetch

**Files:**
- Modify: `src/data/categories.ts`, `src/data/categories.test.ts`, `src/data/types.ts`, `src/data/queries.ts`, `src/context/LanguageContext.tsx`, `src/components/serviceIcons.ts`

**Interfaces (Produces):**
```ts
// categories.ts
export const CATEGORIES = ['pack','coiffure','capillaire','visage','regard','ongles','epilation','maquillage','beaute','spa','massage'] as const;
export type Category = (typeof CATEGORIES)[number];            // ready-made
export type StoredCategory = Category | 'custom';             // services.category
export const SERVICE_FORM_CATEGORIES: readonly Exclude<Category,'pack'>[];
export type CategoryKey = Category | `custom:${string}`;
export interface CustomCategory { id: string; name: Record<Lang, string>; sortOrder: number }
export function categoryKeyOf(s: { category: string; customCategoryId: string | null }, custom: CustomCategory[]): CategoryKey;
export function groupServices<T extends { category: string; customCategoryId: string | null }>(items: T[], custom: CustomCategory[]): { key: CategoryKey; items: T[] }[];
export function categoryLabel(key: CategoryKey, custom: CustomCategory[], t: (k: string) => string, lang: Lang): string;
export function largestGroup<G extends { items: unknown[] }>(groups: G[]): G | undefined; // unchanged behaviour
// types.ts: Service gains `customCategoryId: string | null`
// queries.ts
export async function fetchCategories(): Promise<CustomCategory[]>;  // salon_categories, .eq('salon_id', currentSalonId()), order sort_order
export function useCategories(): UseQueryResult<CustomCategory[]>;    // staleTime STALE_MS, key ['categories', salonId]
```
- Rules: order = ready-made in `CATEGORIES` order, then owner categories by `sortOrder`; empty groups dropped; an unknown ready-made key **or** a `custom` service whose id isn't in `custom` → `coiffure`. `groupByCategory` and `categoryOf` are removed; all callers move to `groupServices` / `categoryKeyOf`.
- `categoryIcon(category: StoredCategory)` covers all keys (`custom` → `Sparkles`).
- Translations: `category.<key>` for the 7 new keys, `category.spa` → `Spa & hammam` / `سبا وحمّام` (Global Constraints table).

- [ ] **Step 1: Failing tests** in `categories.test.ts`:
  - `groupServices` orders ready-made then owner (`sortOrder` 2 before 5), drops empty groups, keys `'ongles'` and `'custom:c1'`.
  - **Review Focus 1:** `groupServices puts a service of an unknown owner category under coiffure`.
  - **Review Focus 2:** `an owner category named like a ready-made one is its own group` (owner `{id:'c1', name:{fr:'Ongles'…}}` + a ready-made `ongles` service → two groups `ongles` and `custom:c1`).
  - `categoryLabel('ongles', …)` → `t('category.ongles')`; `categoryLabel('custom:c1', …, 'ar')` → its AR name; unknown `custom:x` → `t('category.coiffure')`.
  - `largestGroup` tests kept.
- [ ] **Step 2:** `pnpm test src/data/categories` → FAIL. **Step 3: Implement** `categories.ts`, `types.ts`, `fetchServices` (select + map `custom_category_id`), `fetchCategories`/`useCategories`, icons, translations.
- [ ] **Step 4:** `npx tsc -b` — fix every caller of the removed functions minimally (Booking, Services, settings) so the build passes; behaviour changes come in later tasks. `pnpm test` → PASS (update the `queries` mocks in tests to also return `useCategories: () => ({ data: [] , isLoading:false, isError:false })`).
- [ ] **Step 5: Commit** `feat(site): category keys for ready-made and owner categories`.

### Task 6: La carte — tabs that wrap, owner labels

**Files:**
- Modify: `src/components/CategoryTabs.tsx`, `src/components/Services.tsx`, `src/components/Services.test.tsx`

**Interfaces:**
- `CategoryTabs` becomes key/label based: `{ idBase: string; items: { key: CategoryKey; label: string }[]; value: CategoryKey; onChange: (k: CategoryKey) => void; className?: string }`. The `chosen` prop and the sideways-scroll code (`useLayoutEffect`, `overflow-x-auto`, `no-scrollbar`) are removed; the row uses `flex flex-wrap gap-x-5 gap-y-1 sm:gap-x-6`. Ids: `categoryTabId(idBase, key)` must produce a valid id for `custom:<uuid>` (replace `:` with `-`).
- `Services` waits for `useCategories()` as well as services (loading placeholders / `DataError` retry covers both).

- [ ] **Step 1: Failing tests** in `Services.test.tsx`: with an owner category `{id:'c1', name:{fr:'Soins mariée', ar:'عروس'}}` and a service in it, a tab `Soins mariée` appears **after** ready-made tabs and shows that service; in Arabic it reads `عروس`; with 6 categories the tablist has no `overflow-x-auto` class and has `flex-wrap`; categories fetch error shows `DataError`. Keep the existing tab/keyboard/RTL tests green.
- [ ] **Step 2:** run → FAIL. **Step 3: Implement.** **Step 4:** `pnpm test src/components/Services` → PASS.
- [ ] **Step 5: Commit** `feat(site): La carte tabs wrap and show the salon's own categories`.

### Task 7: Booking service step — accordion with compact rows

**Files:**
- Create: `src/components/booking/ServicePicker.tsx`
- Modify: `src/components/Booking.tsx`, `src/components/Booking.test.tsx`, `src/context/LanguageContext.tsx`

**Interfaces:**
- `ServicePicker({ groups, labels, selectedIds, atMax, onToggle, open, onOpenChange })`:
  - `groups: { key: CategoryKey; items: Service[] }[]`, `labels: Record<string,string>` (key → label), `open: CategoryKey[]`, `onOpenChange(next: CategoryKey[])`.
  - One group: no headers, just rows. Several: per group `<h4><button aria-expanded aria-controls>` with label, `countText(t, lang, 'booking.visit.count', n)`, and when k > 0 ticked a badge (aria-hidden) plus the button's accessible name including `countText(t, lang, 'booking.tab.chosen', k)`; several sections may be open.
  - Row: `button aria-pressed` with name, `PriceTag align="start"`, duration, check icon; `aria-disabled` when blocked by max; a pack row adds `PackIncludes`; no photo, no description.
- `Booking`: replaces tabs with `ServicePicker`; state `openCats: CategoryKey[] | null` (null → `[largestGroup(groups).key]`); a La carte intent sets `openCats` to `[categoryKeyOf(service, custom)]`; the tabs code from PR #30 is removed. Waits for `useCategories()` with the other queries.

- [ ] **Step 1: Failing tests** (rewrite the "Booking step 0 grouping" block and the pack tests' `packsTab` helper as `openSection('Packs')`):
  - several categories: headers in order, only the largest open (`aria-expanded`), its rows visible, others' rows absent; opening a second keeps the first open.
  - ticks survive closing/opening; header accessible name `Coiffure, 2 prestations (2 choisies)` style (assert with a regex on `2 choisies`).
  - a row has no `img` and no description text; a pack row shows `Comprend : …`.
  - a tile intent for a Spa service, then Retour → the Spa section is open and its row pressed.
  - one category: no header buttons.
  - owner category appears as a section after ready-made ones.
- [ ] **Step 2:** run → FAIL. **Step 3: Implement.** **Step 4:** `pnpm test src/components/Booking` → PASS, then full `pnpm test`.
- [ ] **Step 5: Commit** `feat(booking): the service step is an accordion of compact rows by category`.

### Task 8: Réglages → Catégories

**Files:**
- Create: `src/components/settings/CategoriesSettings.tsx`, `src/components/settings/CategoriesSettings.test.tsx`
- Modify: `src/data/salonSettings.ts` (+ its test), `src/pages/SettingsPage.tsx`, `src/App.tsx` (route `/admin/settings/categories` if sections aren't generic), `src/context/LanguageContext.tsx`

**Interfaces:**
- `salonSettings.ts`: `useSaveCategory()` → `{ id: string | null; name: Record<Lang,string> }` → `admin_save_category`; `useReorderCategories()` → `string[]` → `admin_reorder_categories`; `useDeleteCategory()` → `string` → `admin_delete_category`. Each invalidates `['categories']` and services queries. `toSettingsError` knows `invalid_category` and `category_in_use` (and exposes the detail count for the latter).
- Screen: list of her categories in order, each with its service count (from `useAllServices`, hidden included), Modifier (FR/AR form), ↑/↓ (disabled at ends; sends the full new order), Supprimer (`useConfirm` danger) → toast; `category_in_use` shows inline: "Déplacez d'abord ses {n} prestations vers une autre catégorie." Add form at the bottom. Empty state text. SettingsPage gets a "Catégories" row with summary "{n} catégories".

- [ ] **Step 1: Failing tests** (`CategoriesSettings.test.tsx`, wrapped in `FeedbackProvider`): add calls the RPC with trimmed names and toasts; ↓ on the first sends `[b, a]`; delete asks then calls; `category_in_use` with detail `3` shows the inline message with 3; rename prefills both names.
- [ ] **Step 2:** run → FAIL. **Step 3: Implement.** **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(settings): the owner manages her own service categories`.

### Task 9: Owner pickers use the categories

**Files:**
- Modify: `src/components/settings/ServicesSettings.tsx` (+ test), `src/components/settings/ServicePhotoField.tsx`, `src/components/settings/StylistsSettings.tsx` (+ test), `src/components/admin/BookingSheet.tsx` (+ test), `src/data/salonSettings.ts` (`SaveServiceInput`)

**Interfaces:**
- `SaveServiceInput.category: StoredCategory`, `customCategoryId: string | null` → `p_custom_category_id`.
- Service form select options: `SERVICE_FORM_CATEGORIES` labels, then her categories (value `custom:<id>`, label `name[lang]`); the form maps `custom:<id>` → `{category:'custom', customCategoryId:id}`; editing a custom service preselects it.
- Services list in Réglages, stylists' service checklist: grouped by `groupServices` under small headings. Owner booking sheet service select: options in `groupServices` order (flat).

- [ ] **Step 1: Failing tests:** saving with "Soins mariée" selected sends `p_category:'custom', p_custom_category_id:'c1'`; editing a custom service preselects it; saving "Ongles" sends `p_custom_category_id:null`; the services list shows group headings in order; the stylist checklist groups; the sheet's options follow group order.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(settings): service form, lists and pickers know the salon's categories`.

### Task 10: Docs, full checks, PR, demo checklist

**Files:**
- Modify: `CLAUDE.md` (Owner settings: categories table, RPCs, `custom`; client page: tabs wrap, accordion; provisioning: `categories`, `custom:<id>`)

- [ ] **Step 1:** Update CLAUDE.md as listed.
- [ ] **Step 2: Run** `npx tsc -b && pnpm test && pnpm check:bundle && supabase db reset && supabase test db && supabase db lint --level warning` → all pass.
- [ ] **Step 3: Browser check (Review Focus 5):** local stack seeded with 12 categories (11 ready-made with one service each + one owner category named "Soins et rituels de mariée"); at 320 px and 390 px, FR and AR: La carte tabs wrap with `documentElement.scrollWidth === innerWidth`; the accordion header with the long name wraps and is ≥ 44 px tall; ticking across sections keeps counts right.
- [ ] **Step 4: Commit** `docs: service categories in CLAUDE.md`, push, open the PR (base `main`) describing the change and that it replaces #30; close #30 with a link.
- [ ] **Step 5: Demo checklist (after merge and live, with the user — not automated):** in Réglages as the owner of Élégance: Manucure & Vernis → Ongles, Soin du Visage → Visage, Maquillage Professionnel → Maquillage; create "Soins mariée" with one service; run `pnpm setup-demo elegance` (type the salon id) to re-capture the snapshot; check the public page.
