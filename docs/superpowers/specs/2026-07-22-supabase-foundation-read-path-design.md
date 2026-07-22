# SP1 — Supabase Foundation & Data (Read Path)

- **Date:** 2026-07-22
- **Status:** Approved (design) — pending spec review
- **Part of:** "Make it a real product" (SP1 of 3). SP2 = booking persistence & real availability; SP3 = auth & live admin.
- **Branch:** `feature/redesign-and-admin` (or a new `feat/sp1-supabase-foundation` — decide at plan time)

## Context

The app is a Vite + React 18 + TS + Tailwind salon site (pnpm). All content is currently hardcoded in `src/data/services.ts`:

- `services` — 6 entries, `Service` shape: `{ id, category, name: Record<Lang,string>, description: Record<Lang,string>, price, duration, image, icon }`
- `stylists` — 3 entries, `Stylist` shape: `{ id, name, role: Record<Lang,string>, specialties: Record<Lang,string>[], image }`
- `generateTimeSlots()` / `getBookedSlots()` — stubs (SP2 territory, untouched here)

`Services.tsx` and `Booking.tsx` import these arrays **synchronously**. Language is provided by `LanguageContext` (`Lang = 'fr' | 'ar'`). Backend chosen: **Supabase**, managed via **CLI migrations**.

## Goal & success criteria

The public site renders services + stylists fetched **live from Supabase**, with loading and error states, FR/AR intact, and the schema reproducible from committed CLI migrations + seed.

Done when:

1. `supabase db push` applies the migration cleanly; `select` returns 6 `services` and 3 `stylists`.
2. The Services section and the Booking wizard render the same content as before, now sourced from the DB.
3. A loading (skeleton) state shows while fetching; an error state with a working **Retry** appears when the fetch fails (e.g. bad key).
4. The FR/AR toggle still switches service/stylist text (jsonb round-trips correctly).
5. `pnpm build` passes; the query-hook unit test is green.

## Scope

**In:** Supabase client + env wiring; `services` + `stylists` tables (migration + RLS + seed); a TanStack Query read layer (`useServices`/`useStylists` under a `QueryClientProvider`); refactor of `Services.tsx` and `Booking.tsx` to consume it; loading/error UI + i18n; Vitest setup + one query-hook test.

**Explicitly OUT (later sub-projects):**
- Booking persistence — booking still opens WhatsApp only (SP2)
- Real availability — `generateTimeSlots`/`getBookedSlots` stubs stay (SP2)
- `appointments` and `business_hours` tables — created with their features (SP2/SP3)
- Admin dashboard going live — still uses mock `todayAppointments` (SP3)
- Any authentication (SP3)

## Data model

Bilingual fields stored as **`jsonb` `{ "fr": "...", "ar": "..." }`** to mirror the existing `Record<Lang,string>` types (minimal TS churn). Primary keys are the existing **text slugs** (stable, human-readable, referenced by future `appointments`).

```sql
-- migration: create_services_stylists
create table services (
  id          text primary key,               -- e.g. 'coupe-femme'
  category    text not null,                   -- 'coiffure' | 'beaute'
  name        jsonb not null,                  -- { fr, ar }
  description jsonb not null,                  -- { fr, ar }
  price       integer not null,                -- DA
  duration    integer not null,                -- minutes
  image       text not null,
  icon        text not null,                   -- lucide key
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table stylists (
  id          text primary key,               -- e.g. 'amina'
  name        text not null,
  role        jsonb not null,                  -- { fr, ar }
  specialties jsonb not null default '[]',     -- [ { fr, ar }, ... ]
  image       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS: public read only, no client writes
alter table services enable row level security;
alter table stylists enable row level security;

create policy "public read services" on services for select to anon using (true);
create policy "public read stylists" on stylists for select to anon using (true);
```

`sort_order` preserves the current display order (array index today). Reads use `.order('sort_order')`.

**Seed** (`supabase/seed.sql`): the current 6 services and 3 stylists verbatim (same ids, prices, durations, image URLs, FR/AR text). Note: `db push` does not run `seed.sql`; seed is applied via `supabase db reset` (local) or by running the file in the SQL editor / `psql` against the linked project — documented in setup steps.

## Supabase client & env

- Add dependency `@supabase/supabase-js`.
- `src/lib/supabase.ts` — creates the client from `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; throws a clear error at startup if either is missing.
- `.env` (gitignored — already covered by `.env` rule in `.gitignore`) holds the real values; `.env.example` (committed) documents the two var names.
- `src/lib/database.types.ts` — generated via `supabase gen types typescript --linked`, used to type queries.

## App architecture (sync constants → React Query)

Data fetching uses **TanStack Query (`@tanstack/react-query`)** — caching, request dedup, and loading/error/refetch come built in, so there's no hand-rolled fetch state.

- **`src/lib/queryClient.ts`** — a `QueryClient` with content-appropriate defaults: `staleTime: 5 * 60_000`, `refetchOnWindowFocus: false`, `retry: 1` (salon content changes rarely).
- **`App.tsx`** — wrap with `QueryClientProvider`. Provider order: `LanguageProvider` → `QueryClientProvider` → `BrowserRouter` → `Routes`.
- **`src/data/queries.ts`** — the fetch/map layer + typed query hooks:
  - `fetchServices()` / `fetchStylists()` — supabase `select(...).order('sort_order')`, mapping rows (jsonb → `Record<Lang,string>`) to the `Service`/`Stylist` types.
  - `useServices()` → `useQuery({ queryKey: ['services'], queryFn: fetchServices })`
  - `useStylists()` → `useQuery({ queryKey: ['stylists'], queryFn: fetchStylists })`
  - Separate hooks (not one combined provider) so each screen fetches only what it needs; React Query dedupes and caches shared query keys across components.
- **`Service` / `Stylist` interfaces** move from `src/data/services.ts` to a shared `src/data/types.ts`; `src/data/services.ts` keeps only `generateTimeSlots`/`getBookedSlots` (untouched) and re-exports the types for back-compat if any import path still points there.
- **`Services.tsx`** uses `useServices()`; **`Booking.tsx`** uses `useServices()` + `useStylists()` (combining their `isLoading` / `isError`).

**Loading:** while `isLoading`, show a `ServiceCardSkeleton` (and a booking-step skeleton) reusing the existing `.img-placeholder` shimmer + neutral blocks.

**Error:** while `isError`, show a friendly bilingual message with a **Retry** button calling the query's `refetch()` — styled as the existing empty-state pattern (centered, muted text, secondary button).

## i18n additions

New keys in both `fr` and `ar` maps (`LanguageContext`):
- `data.error` — e.g. "Impossible de charger le contenu." / "تعذّر تحميل المحتوى."
- `data.retry` — "Réessayer" / "إعادة المحاولة"

## Testing

The repo currently has no test framework. SP1 adds:
- Dev deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- Test config: a `test` block in the Vite config via `defineConfig` from `vitest/config` (env `jsdom`), plus `"test": "vitest"` in `package.json` scripts.
- One test — `queries.test.tsx` — renders a hook (`useServices`) inside a `QueryClientProvider` (with `retry: false`) over a mocked `src/lib/supabase.ts`: asserts loading→data (seeded rows returned) and loading→error (fetch rejects → `isError` true, `refetch` callable).

## User setup steps (documented in README/spec)

1. Create a Supabase project (dashboard).
2. `supabase link --project-ref <ref>`.
3. `supabase db push` to apply the migration.
4. Apply the seed (`supabase db reset` locally, or run `supabase/seed.sql` in the SQL editor against the linked DB).
5. Copy the project URL + anon key into `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
6. `supabase gen types typescript --linked > src/lib/database.types.ts`.

## Deliverables (file-level)

- `supabase/config.toml` + `supabase/migrations/<ts>_create_services_stylists.sql` + `supabase/seed.sql`
- `package.json` — `@supabase/supabase-js` + `@tanstack/react-query` deps; Vitest dev deps; `test` script
- `src/lib/supabase.ts`, `src/lib/database.types.ts`, `src/lib/queryClient.ts`
- `src/data/queries.ts` (fetchers + `useServices`/`useStylists` hooks)
- `src/data/types.ts` (moved `Service`/`Stylist` interfaces)
- Edits: `src/App.tsx` (`QueryClientProvider`), `src/components/Services.tsx`, `src/components/Booking.tsx`, `src/context/LanguageContext.tsx` (i18n keys)
- `.env.example`
- Test: `src/data/queries.test.tsx` + Vite config `test` block

## Resolved decisions

- Bilingual storage: **jsonb `{fr,ar}`** (not per-language columns or a translations table).
- Primary keys: **text slugs** (not uuid).
- Read layer: **TanStack Query hooks** (`useServices` / `useStylists`) under a `QueryClientProvider` — caching + loading/error/refetch built in (not a hand-rolled context provider).
- Testing: **Vitest included** in SP1.
- Schema scope: **`services` + `stylists` only**; other tables land with SP2/SP3.
