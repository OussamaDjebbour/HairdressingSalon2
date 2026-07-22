# SP1 — Supabase Foundation & Data (Read Path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the salon's services and stylists to the public site from Supabase (instead of hardcoded arrays), fetched through TanStack Query with loading and error states.

**Architecture:** Postgres tables `services` + `stylists` (bilingual `jsonb`, text-slug PKs, RLS public-read) created via Supabase CLI migrations and seeded from the current mock data. The React app reads them via TanStack Query hooks (`useServices`/`useStylists`) under a `QueryClientProvider`; `Services.tsx` and `Booking.tsx` consume the hooks with skeleton/error UI.

**Tech Stack:** Vite + React 18 + TypeScript, Tailwind, pnpm, `@supabase/supabase-js`, `@tanstack/react-query`, Vitest + Testing Library, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-07-22-supabase-foundation-read-path-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, `pnpm add -D`, `pnpm test`, `pnpm build`). Never use npm.
- Bilingual content is stored as `jsonb` `{ "fr": "...", "ar": "..." }`; app types use `Record<Lang, string>` where `Lang = 'fr' | 'ar'`.
- Primary keys are **text slugs** (e.g. `coupe-femme`, `amina`), not uuid.
- Both tables have **RLS enabled** with an `anon SELECT` policy only (no client writes).
- Every user-facing string goes through `t(key)` with the key added to **both** `fr` and `ar` maps in `src/context/LanguageContext.tsx`.
- Use logical CSS (`text-start`, `ms-`/`me-`, `gap-`) for RTL; icons from `lucide-react` only.
- **Out of scope (do NOT touch):** booking persistence, real availability (`generateTimeSlots`/`getBookedSlots` stubs stay as-is), `appointments`/`business_hours` tables, the `/admin` dashboard, and any auth. These are SP2/SP3.
- After each task: `pnpm build` must pass and `pnpm test` must be green before committing.

---

### Task 1: Test harness + dependencies

**Files:**
- Modify: `package.json` (deps + scripts)
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create (temporary): `src/test/smoke.test.ts`

**Interfaces:**
- Produces: a working `pnpm test` (Vitest, jsdom, jest-dom matchers) that later tasks rely on.

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
pnpm add @supabase/supabase-js @tanstack/react-query
pnpm add -D vitest @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add the `test` scripts to `package.json`**

Change the `scripts` block to:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

Replace the whole file with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: Create the test setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Write a smoke test**

Create `src/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test harness**

Run: `pnpm test`
Expected: 1 passing test (`test harness > runs`), exit code 0.

- [ ] **Step 7: Verify the build still passes**

Run: `pnpm build`
Expected: `tsc` clean, `vite build` writes `dist/` with no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts src/test/setup.ts src/test/smoke.test.ts
git commit -m "chore(sp1): add Vitest harness + supabase/react-query deps"
```

---

### Task 2: Extract shared `Service`/`Stylist` types

Pure refactor — move the interfaces out of `src/data/services.ts` so both the mock module and the new query layer share one definition. App behaviour is unchanged; it still reads the mock arrays until Tasks 7–8.

**Files:**
- Create: `src/data/types.ts`
- Modify: `src/data/services.ts` (remove interface bodies, import + re-export them)

**Interfaces:**
- Produces: `Service` and `Stylist` interfaces from `src/data/types.ts`.

- [ ] **Step 1: Create `src/data/types.ts`**

```ts
import { Lang } from '../context/LanguageContext';

export interface Service {
  id: string;
  category: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  price: number;
  duration: number;
  image: string;
  icon: string;
}

export interface Stylist {
  id: string;
  name: string;
  role: Record<Lang, string>;
  specialties: Record<Lang, string>[];
  image: string;
}
```

- [ ] **Step 2: Update `src/data/services.ts` to use the shared types**

Replace the top of the file (the `import { Lang }` line through the `export interface Service { ... }` block) so it imports and re-exports the types instead of defining them. The file must now start:

```ts
import type { Service, Stylist } from './types';

export type { Service, Stylist } from './types';

export const services: Service[] = [
```

Then **delete** the now-duplicate `export interface Stylist { ... }` block that currently sits between the `services` array and the `stylists` array (lines ~95–101). Keep the `services` array, the `stylists` array, and both `generateTimeSlots` / `getBookedSlots` functions exactly as they are.

- [ ] **Step 3: Verify the build passes**

Run: `pnpm build`
Expected: `tsc` clean (no "Service is declared but never used" or duplicate-identifier errors), `vite build` succeeds.

- [ ] **Step 4: Verify tests still pass**

Run: `pnpm test`
Expected: smoke test passes.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/services.ts
git commit -m "refactor(sp1): move Service/Stylist types to data/types.ts"
```

---

### Task 3: Supabase migration + seed

Create the schema and seed data via the Supabase CLI. No app code changes.

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/<timestamp>_create_services_stylists.sql`
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: tables `services` (columns: `id, category, name, description, price, duration, image, icon, sort_order, created_at`) and `stylists` (`id, name, role, specialties, image, sort_order, created_at`), both RLS public-read, seeded with 6 services + 3 stylists.

- [ ] **Step 1: Initialize Supabase in the repo**

Run: `supabase init`
Expected: creates `supabase/config.toml` and the `supabase/` directory. (Answer "N" if asked to generate VS Code settings.)

- [ ] **Step 2: Create the migration file**

Run: `supabase migration new create_services_stylists`
Expected: creates an empty `supabase/migrations/<timestamp>_create_services_stylists.sql`.

- [ ] **Step 3: Write the schema + RLS into that migration file**

```sql
create table services (
  id          text primary key,
  category    text not null,
  name        jsonb not null,
  description jsonb not null,
  price       integer not null,
  duration    integer not null,
  image       text not null,
  icon        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table stylists (
  id          text primary key,
  name        text not null,
  role        jsonb not null,
  specialties jsonb not null default '[]',
  image       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table services enable row level security;
alter table stylists enable row level security;

create policy "public read services" on services for select to anon using (true);
create policy "public read stylists" on stylists for select to anon using (true);
```

- [ ] **Step 4: Write the seed data**

Create `supabase/seed.sql`:

```sql
insert into services (id, category, name, description, price, duration, image, icon, sort_order) values
('coupe-femme','coiffure',
 '{"fr":"Coupe & Brushing","ar":"قص وتصفيف الشعر"}',
 '{"fr":"Coupe personnalisée et brushing pour sublimer votre style.","ar":"قص مخصص وتصفيف لإبراز إطلالتكِ."}',
 2500, 60, 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=600', 'scissors', 0),
('coloration','coiffure',
 '{"fr":"Coloration & Balayage","ar":"صبغة الشعر وبلاليج"}',
 '{"fr":"Coloration professionnelle et balayage pour un rendu naturel.","ar":"صبغة احترافية وبلاليج لنتيجة طبيعية."}',
 6000, 120, 'https://images.pexels.com/photos/3992874/pexels-photo-3992874.jpeg?auto=compress&cs=tinysrgb&w=600', 'palette', 1),
('soin-keratine','coiffure',
 '{"fr":"Soin Kératine","ar":"علاج الكيراتين"}',
 '{"fr":"Lissage et soin profond à la kératine pour des cheveux soyeux.","ar":"تنعيم وعلاج عميق بالكيراتين لشعر حريري."}',
 8000, 150, 'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=600', 'sparkles', 2),
('manucure','beaute',
 '{"fr":"Manucure & Vernis","ar":"مانيكير وطلاء الأظافر"}',
 '{"fr":"Manucure soignée et pose de vernis semi-permanent.","ar":"مانيكير متقن وطلاء أظافر نصف دائم."}',
 2000, 45, 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600', 'hand', 3),
('maquillage','beaute',
 '{"fr":"Maquillage Professionnel","ar":"مكياج احترافي"}',
 '{"fr":"Maquillage pour mariée, soirée ou événements spéciaux.","ar":"مكياج للعروس، السهرة أو المناسبات الخاصة."}',
 5000, 90, 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=600', 'brush', 4),
('soin-visage','beaute',
 '{"fr":"Soin du Visage","ar":"عناية بالوجه"}',
 '{"fr":"Nettoyage profond, gommage et masque pour une peau éclatante.","ar":"تنظيف عميق، تقشير وقناع لبشرة مشرقة."}',
 3500, 75, 'https://images.pexels.com/photos/3997390/pexels-photo-3997390.jpeg?auto=compress&cs=tinysrgb&w=600', 'heart', 5);

insert into stylists (id, name, role, specialties, image, sort_order) values
('amina','Amina',
 '{"fr":"Coiffeuse Styliste","ar":"خبيرة تصفيف الشعر"}',
 '[{"fr":"Balayage","ar":"بلاليج"},{"fr":"Kératine","ar":"كيراتين"}]',
 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=400', 0),
('leila','Leila',
 '{"fr":"Esthéticienne","ar":"خبيرة تجميل"}',
 '[{"fr":"Maquillage","ar":"مكياج"},{"fr":"Soin visage","ar":"عناية بالوجه"}]',
 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=400', 1),
('sara','Sara',
 '{"fr":"Prothésiste Ongles","ar":"خبيرة أظافر"}',
 '[{"fr":"Manucure","ar":"مانيكير"},{"fr":"Vernis","ar":"طلاء"}]',
 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=400', 2);
```

- [ ] **Step 5: Apply and verify the schema + seed**

Local (requires Docker):
```bash
supabase start
supabase db reset   # applies all migrations, then seed.sql
```
Expected: reset output ends with "Applying migration ..._create_services_stylists.sql" and "Seeding data from supabase/seed.sql".

Verify row counts (local Studio at the URL printed by `supabase start`, SQL editor):
```sql
select count(*) from services;   -- expect 6
select count(*) from stylists;   -- expect 3
select name->>'ar' from services where id = 'coupe-femme';  -- expect: قص وتصفيف الشعر
```

If Docker is unavailable, apply to the linked remote instead: `supabase link --project-ref <ref>` then `supabase db push`, and run `supabase/seed.sql` in the remote SQL editor. Verify the same counts in the dashboard.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/seed.sql
git commit -m "feat(sp1): add services/stylists migration + seed"
```

---

### Task 4: Supabase client, env, and QueryClient

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/queryClient.ts`
- Create: `.env.example`
- Create: `.env` (local only — gitignored, not committed)
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `supabase` (a `SupabaseClient`) from `src/lib/supabase.ts`; `queryClient` (a `QueryClient`) from `src/lib/queryClient.ts`.

- [ ] **Step 1: Type the env vars in `src/vite-env.d.ts`**

Replace the file with:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Create the Supabase client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).'
  );
}

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 3: Create the QueryClient**

Create `src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

- [ ] **Step 4: Create `.env.example` and local `.env`**

`.env.example` (committed):
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`.env` (local, NOT committed — already ignored by the `.env` rule in `.gitignore`): copy `.env.example` and fill in the real project URL + anon key from the Supabase dashboard (Project Settings → API).

- [ ] **Step 5: Verify build + dev server start**

Run: `pnpm build`
Expected: `tsc` clean, `vite build` succeeds.

Run: `pnpm dev`, open http://localhost:5173/ — the site loads with no console error about missing Supabase env (the `.env` values are present). Stop the server after checking.

- [ ] **Step 6: Commit** (note: `.env` is not staged)

```bash
git add src/lib/supabase.ts src/lib/queryClient.ts src/vite-env.d.ts .env.example
git commit -m "feat(sp1): add supabase client, query client, and env wiring"
```

> **Optional (requires the linked project):** generate typed DB definitions with `supabase gen types typescript --linked > src/lib/database.types.ts` and pass `createClient<Database>(...)`. Not required for the tasks below — the query layer defines its own row types.

---

### Task 5: Query layer (`fetchServices`/`fetchStylists` + hooks) — TDD

**Files:**
- Create: `src/data/queries.ts`
- Create: `src/data/queries.test.tsx`
- Delete: `src/test/smoke.test.ts` (replaced by a real test)

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `Service`/`Stylist` from `src/data/types.ts`.
- Produces: `fetchServices(): Promise<Service[]>`, `fetchStylists(): Promise<Stylist[]>`, and hooks `useServices()` / `useStylists()` returning TanStack Query results (`{ data, isLoading, isError, refetch, ... }`).

- [ ] **Step 1: Write the failing test**

Create `src/data/queries.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { useServices } from './queries';

const SEEDED = [
  {
    id: 'coupe-femme',
    category: 'coiffure',
    name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف الشعر' },
    description: { fr: 'desc fr', ar: 'desc ar' },
    price: 2500,
    duration: 60,
    image: 'img',
    icon: 'scissors',
    sort_order: 0,
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useServices', () => {
  it('maps rows to services on success', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: SEEDED, error: null }) }),
    });

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('coupe-femme');
    expect(result.current.data![0].name.fr).toBe('Coupe & Brushing');
  });

  it('surfaces an error when the query fails', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: null, error: new Error('boom') }) }),
    });

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(typeof result.current.refetch).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./queries` (module not created yet).

- [ ] **Step 3: Implement the query layer**

Create `src/data/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Service, Stylist } from './types';

interface ServiceRow {
  id: string;
  category: string;
  name: Service['name'];
  description: Service['description'];
  price: number;
  duration: number;
  image: string;
  icon: string;
  sort_order: number;
}

interface StylistRow {
  id: string;
  name: string;
  role: Stylist['role'];
  specialties: Stylist['specialties'];
  image: string;
  sort_order: number;
}

export async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, category, name, description, price, duration, image, icon, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data as ServiceRow[]).map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    description: r.description,
    price: r.price,
    duration: r.duration,
    image: r.image,
    icon: r.icon,
  }));
}

export async function fetchStylists(): Promise<Stylist[]> {
  const { data, error } = await supabase
    .from('stylists')
    .select('id, name, role, specialties, image, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data as StylistRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    specialties: r.specialties,
    image: r.image,
  }));
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: fetchServices });
}

export function useStylists() {
  return useQuery({ queryKey: ['stylists'], queryFn: fetchStylists });
}
```

- [ ] **Step 4: Delete the smoke test**

```bash
rm src/test/smoke.test.ts
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: `useServices` — 2 passing tests, exit code 0.

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/data/queries.ts src/data/queries.test.tsx
git commit -m "feat(sp1): add services/stylists query hooks with tests"
```

---

### Task 6: App provider wiring + loading/error UI + i18n

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/context/LanguageContext.tsx`
- Create: `src/components/ServiceCardSkeleton.tsx`
- Create: `src/components/DataError.tsx`

**Interfaces:**
- Consumes: `queryClient` from `src/lib/queryClient.ts`.
- Produces: `<ServiceCardSkeleton />` (no props); `<DataError onRetry={() => void} />`; i18n keys `data.error`, `data.retry`.

- [ ] **Step 1: Wrap the app in `QueryClientProvider`**

In `src/App.tsx`, add the imports and wrap `<BrowserRouter>`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { LanguageProvider } from './context/LanguageContext';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
```

- [ ] **Step 2: Add i18n keys**

In `src/context/LanguageContext.tsx`, add to the **`fr`** map (next to the other keys):

```ts
    'data.error': 'Impossible de charger le contenu.',
    'data.retry': 'Réessayer',
```

And to the **`ar`** map:

```ts
    'data.error': 'تعذّر تحميل المحتوى.',
    'data.retry': 'إعادة المحاولة',
```

- [ ] **Step 3: Create the skeleton component**

Create `src/components/ServiceCardSkeleton.tsx`:

```tsx
export function ServiceCardSkeleton() {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-cream-200 overflow-hidden">
      <div className="aspect-[16/11] img-placeholder" />
      <div className="p-6 space-y-3">
        <div className="h-5 w-2/3 rounded img-placeholder" />
        <div className="h-3 w-full rounded img-placeholder" />
        <div className="h-3 w-4/5 rounded img-placeholder" />
        <div className="h-px bg-cream-200 my-2" />
        <div className="h-6 w-1/3 rounded img-placeholder" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the error component**

Create `src/components/DataError.tsx`:

```tsx
import { useLang } from '../context/LanguageContext';

export function DataError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div className="text-center py-12">
      <p className="text-rose-600 mb-4">{t('data.error')}</p>
      <button onClick={onRetry} className="btn-secondary">
        {t('data.retry')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Verify build + tests**

Run: `pnpm build && pnpm test`
Expected: both clean/green.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/context/LanguageContext.tsx src/components/ServiceCardSkeleton.tsx src/components/DataError.tsx
git commit -m "feat(sp1): add QueryClientProvider, skeleton, error UI + i18n"
```

---

### Task 7: `Services.tsx` reads from Supabase

**Files:**
- Modify: `src/components/Services.tsx`

**Interfaces:**
- Consumes: `useServices()` from `src/data/queries.ts`; `<ServiceCardSkeleton />`, `<DataError />`.

- [ ] **Step 1: Swap the data source and imports**

In `src/components/Services.tsx`, change the imports — remove `services` from the data import and add the hook, types, skeleton, and error component:

```tsx
import { Scissors, Palette, Sparkles, Hand, Brush, Heart, Clock, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import type { Service } from '../data/types';
import { useServices } from '../data/queries';
import { formatPrice, formatDuration } from '../data/formatters';
import { SmartImage } from './SmartImage';
import { ServiceCardSkeleton } from './ServiceCardSkeleton';
import { DataError } from './DataError';
```

(The `iconMap` and the `ServiceCard` sub-component stay exactly as they are.)

- [ ] **Step 2: Consume the hook and render loading/error/data states**

Replace the `Services` function's body so it uses the hook. The header block stays; only the grid becomes state-driven:

```tsx
export function Services() {
  const { t } = useLang();
  const { data: services, isLoading, isError, refetch } = useServices();

  return (
    <section id="services" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-14">
          <p className="eyebrow mb-4">{t('services.kicker')}</p>
          <h2 className="font-display font-semibold text-rose-900 text-[clamp(2rem,4vw,3rem)] leading-tight">
            {t('services.title')}
          </h2>
          <p className="mt-4 text-lg text-rose-600 text-pretty">{t('services.subtitle')}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ServiceCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <DataError onRetry={() => refetch()} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(services ?? []).map((service: Service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

> Note: the subtitle color `text-rose-600` matches the accessibility fix already applied elsewhere. Confirm it reads `text-rose-600` (not `text-rose-500/80`) in the existing file before replacing; keep whatever the current file has if it already differs.

- [ ] **Step 3: Verify build + run**

Run: `pnpm build`
Expected: clean.

Run: `pnpm dev`, open http://localhost:5173/ — the Services section renders the 6 seeded services from Supabase; toggling FR/AR switches names/descriptions. Temporarily setting a wrong `VITE_SUPABASE_ANON_KEY` shows the error state with a working Retry (restore the key after). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/Services.tsx
git commit -m "feat(sp1): Services reads from Supabase via useServices"
```

---

### Task 8: `Booking.tsx` reads from Supabase + remove mock arrays

**Files:**
- Modify: `src/components/Booking.tsx`
- Modify: `src/data/services.ts` (remove the now-unused `services` and `stylists` arrays)

**Interfaces:**
- Consumes: `useServices()`, `useStylists()`; `<DataError />`.

- [ ] **Step 1: Swap the Booking imports**

In `src/components/Booking.tsx`, change the data import line so it keeps only the stubs, and add the hooks + type + error component:

```tsx
import { generateTimeSlots, getBookedSlots } from '../data/services';
import type { Service } from '../data/types';
import { useServices, useStylists } from '../data/queries';
import { DataError } from './DataError';
```

(Leave the `formatters`, `TimeSlotChip`, `SmartImage`, and lucide imports as they are.)

- [ ] **Step 2: Fetch inside the component and gate the wizard on load/error**

At the top of the `Booking` component body, after `const { lang, t } = useLang();`, add:

```tsx
  const servicesQuery = useServices();
  const stylistsQuery = useStylists();
  const services = servicesQuery.data ?? [];
  const stylists = stylistsQuery.data ?? [];
  const dataLoading = servicesQuery.isLoading || stylistsQuery.isLoading;
  const dataError = servicesQuery.isError || stylistsQuery.isError;
  const retryData = () => {
    servicesQuery.refetch();
    stylistsQuery.refetch();
  };
```

Then, inside the returned `<section id="booking" ...>` for the main (non-`submitted`) view, render loading/error before the wizard card. Replace the wizard card container so it becomes:

```tsx
        {dataLoading ? (
          <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-10 min-h-[400px] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : dataError ? (
          <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-10 min-h-[400px] flex items-center justify-center">
            <DataError onRetry={retryData} />
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-6 sm:p-8 lg:p-10 min-h-[400px] flex flex-col">
            {/* ...existing step indicator + steps 0-3 + navigation stay exactly here... */}
          </div>
        )}
```

Keep every existing child of the wizard card (step indicator, the four step blocks, and the navigation footer) unchanged inside the final `else` branch. The `services` and `stylists` values they reference now come from the hooks above instead of the module import — no other logic changes.

> The spinner respects reduced motion via the global `@media (prefers-reduced-motion: reduce)` rule already in `index.css`.

- [ ] **Step 3: Remove the now-unused mock arrays**

In `src/data/services.ts`, delete the `export const services: Service[] = [ ... ];` array and the `export const stylists: Stylist[] = [ ... ];` array (they are no longer imported anywhere). Keep the `export type { Service, Stylist }` re-export line, `generateTimeSlots`, and `getBookedSlots`. The `import type { Service, Stylist }` line at the top can also be removed if nothing else in the file references those types.

- [ ] **Step 4: Verify no stale imports remain**

Run: `grep -rn "from '../data/services'" src` and confirm the only remaining imports of `services.ts` are for `generateTimeSlots`/`getBookedSlots` (in `Booking.tsx`).

- [ ] **Step 5: Verify build + tests + run**

Run: `pnpm build && pnpm test`
Expected: `tsc` clean (no "services is declared but never used" or unresolved-import errors), tests green.

Run: `pnpm dev` — complete a booking end-to-end: the Service step lists the 6 seeded services, the Stylist step lists the 3 seeded stylists, and the WhatsApp message still builds correctly. FR/AR toggle works. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/components/Booking.tsx src/data/services.ts
git commit -m "feat(sp1): Booking reads from Supabase; drop mock arrays"
```

---

## Notes for the implementer

- **Env required:** the app throws at startup without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`. Set them (Task 4) before running `pnpm dev` from Task 5 onward.
- **DB required for runtime checks:** Tasks 7–8's `pnpm dev` verification needs the seeded Supabase project reachable. The unit test (Task 5) and `pnpm build` do **not** need a live DB.
- **Do not** modify the `/admin` page, the schedule, or the booking→WhatsApp logic — only the data source changes.
