# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page marketing + booking site for a women's hairdressing/beauty salon ("Élégance") in Algiers. Vite + React 18 + TypeScript + Tailwind, originally scaffolded by Bolt (see `.bolt/`). There is **no backend and no database** — all data is mock/static, and the booking flow terminates in a WhatsApp deep link.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # tsc typecheck, then vite build
npm run preview    # serve the production build
```

- **No test framework** is configured — there are no tests to run.
- **No `lint` script.** `eslint.config.js` exists, but the ESLint packages it imports are *not* in `package.json` and are *not* installed. To lint you must first install them (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `eslint`), then `npx eslint .`.
- Typecheck alone: `npx tsc -b` (the `build` runs `tsc` first, so a broken build usually means a type error).

## Architecture

The app is a fixed vertical stack of sections rendered by `src/App.tsx`, all wrapped in a single `LanguageProvider`: `Navbar → Hero → TrustBadges → Services → Booking → Schedule → Footer`. Sections are linked by anchor `id`s (e.g. `#booking`, `#services`) — navigation is in-page scrolling, not routing.

Two cross-cutting systems drive almost everything:

### 1. Bilingual FR/AR with RTL (custom, no i18n library)

`src/context/LanguageContext.tsx` is the single source of truth for language. It holds a flat `translations` dictionary keyed `Record<Lang, Record<string, string>>` with dotted string keys (`'booking.step.service'`). Consume it via the `useLang()` hook, which exposes `t(key)`, `lang` (`'fr' | 'ar'`), `dir`, and `toggleLang()`. The provider writes `document.documentElement.lang`/`dir` on change, so switching language flips the whole page to RTL.

Conventions that must be respected when touching UI or copy:
- **Every user-facing string goes through `t()`** — add the key to *both* `fr` and `ar` maps. `t()` falls back to French, then the raw key.
- **Domain data carries its own translations** inline as `Record<Lang, string>` (see `Service.name`, `Stylist.role` in `src/data/services.ts`), read as `service.name[lang]` — these are *not* in the `translations` dict.
- **Use logical CSS properties** for RTL correctness: `text-start`/`text-end`, `ms-`/`me-`, `ps-`/`pe-`, and `gap-` — not `text-left` / `ml-` / `pl-`. Default direction is LTR (French).
- Default language is `'fr'`; there is no persistence (resets on reload).

### 2. The design system lives in CSS + Tailwind config, not in components

Component styling is centralized as `@layer components` classes in `src/index.css` — `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-whatsapp` (+ `btn-sm`/`btn-lg`), `card` / `card-hover` / `card-selected`, `input`, `label`, `img-placeholder`, `no-scrollbar`. Prefer these classes over rebuilding styles inline. `src/components/Button.tsx` is just a typed wrapper mapping variant/size props onto those CSS classes.

`tailwind.config.js` defines the visual language and **must be the palette source**: custom color scales `cream / rose / gold / sage / amber / rust` (rose is the primary brand color; e.g. `rose-800` for headings, `cream-50` backgrounds), fonts `font-display` (Fraunces), `font-sans` (Inter), `font-arabic` (Cairo), custom shadows (`shadow-soft/card/lift/glow`), and the signature `ease-silk` easing + `animate-fadeIn`/`animate-shimmer`. Do not introduce raw hex colors or arbitrary values when a token exists.

### Booking flow (the core interaction) — `src/components/Booking.tsx`

A 4-step wizard (`Service → Stylist → Date & time → Confirm`) driven by local `useState` (`step: 0|1|2|3`). It does **not** submit to any server: the final step builds a localized plain-text message and opens `https://wa.me/<WHATSAPP_NUMBER>?text=...`. The salon's number is the module constant `WHATSAPP_NUMBER` in that file.

Availability is faked: `generateTimeSlots()` / `getBookedSlots()` in `src/data/services.ts` are **stubs** (booked slots are hardcoded, date/stylist args are ignored). `Schedule.tsx` likewise renders the static `todayAppointments` from `src/data/appointments.ts`. Wiring a real backend means replacing these data-layer functions and the mock arrays.

### Data & formatting

`src/data/` holds all content and pure helpers: `services.ts` (services, stylists, slot stubs), `appointments.ts` (mock day + `OPENING_HOUR`/`CLOSING_HOUR`), `formatters.ts`. Money is Algerian Dinar formatted via `formatPrice()` (`fr-FR` grouping + ` DA` suffix) — always format prices/durations/dates through these helpers so the AR/FR output stays consistent.

### Icons & images

Icons are **lucide-react only** (per `.bolt/prompt`; do not add other icon or UI-theme packages). Images are remote Pexels URLs rendered through `src/components/SmartImage.tsx`, which handles lazy-loading + a shimmer placeholder — use it instead of bare `<img>` for content images.
