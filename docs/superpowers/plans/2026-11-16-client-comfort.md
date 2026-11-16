# Client Comfort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The eight comfort items of the spec, on branch `feat/client-comfort` (stacked on `feat/luxe-site`).

**Architecture:** Pure helpers in public data modules (`src/data/clientLinks.ts`: `.ics` text, Maps link; `src/data/rememberedClient.ts`: device storage). Wizard behaviour in `src/components/Booking.tsx` (scroll on step change, back-button guard, first open day, prefill). Footer links. Fonts moved to `index.html`.

**Tech Stack:** React 18 + TS, Vitest + Testing Library (jsdom history/popstate, mocked `scrollIntoView`).

**Spec:** `docs/superpowers/specs/2026-11-16-client-comfort-design.md`

## Global Constraints
- No RPC/database change; strings in fr + ar; no sticky UI; `pnpm check:bundle` passes (cap 195 KB, now 191.2 KB).
- Keys (fr / ar): `booking.addToCalendar` Ajouter à mon agenda / أضيفي إلى تقويمي · `booking.directions` Itinéraire / الاتجاهات · `booking.askWhatsapp` Une question ? Écrivez-nous sur WhatsApp / سؤال؟ راسلينا على واتساب · `booking.notYou` Ce n’est pas vous ? Effacer / لستِ أنتِ؟ امسحي · `booking.calendarPending` En attente de confirmation par le salon. / في انتظار تأكيد الصالون. · `contact.directions` Itinéraire / الاتجاهات

## Review Focus
1. Back button after a successful booking leaves the page (no stuck guard). Test: Task 2 `after booking the back button is not intercepted`.
2. Storage unavailable (private mode throws): booking still works, nothing prefilled. Test: Task 1 `load/save survive a throwing storage`.
3. Every open day in 14 has no free time: the date step stops on the last day with the "no slots" message, no loop. Test: Task 2 `stops auto-advancing at the last open day`.
4. A salon without address/WhatsApp: no empty links. Tests: Task 3 / Task 2.
5. Reduced motion: step scroll is instant. Test: Task 2 `scrolls instantly under reduced motion`.

---

### Task 1: Helpers — `.ics`, Maps link, remembered client
**Files:** Create `src/data/clientLinks.ts`, `src/data/clientLinks.test.ts`, `src/data/rememberedClient.ts`, `src/data/rememberedClient.test.ts`.
**Produces:** `mapsLink(address: string, city: string): string | null` (null when both blank; `https://www.google.com/maps/search/?api=1&query=<encoded address lines + city>`); `visitIcs(input: { salon: string; services: string; start: Date; end: Date; location: string; description: string; uid: string }): string` (RFC 5545, CRLF, UTC `YYYYMMDDTHHMMSSZ`, text escaping of `,;\` and newlines); `loadClient(salonId): { name: string; phone: string } | null`, `saveClient(salonId, c)`, `forgetClient(salonId)` (key `salon:<id>:client`, every storage call in try/catch).
- [ ] Tests first (names): `mapsLink joins address lines and city`, `mapsLink is null without address and city`, `visitIcs has one VEVENT with UTC times, escaped text and CRLF lines`, `save then load returns the client`, `forget clears it`, `load/save survive a throwing storage`, `stored per salon`. Run → FAIL; implement; run → PASS; commit `feat(client): calendar, directions and remembered-client helpers`.

### Task 2: The wizard — scroll, back button, first open day, prefill, WhatsApp line, success actions
**Files:** Modify `src/components/Booking.tsx`, `src/context/LanguageContext.tsx`; tests in `src/components/Booking.test.tsx`.
- [ ] Tests first: `scrolls the booking card into view on each step change, not on first render` (mock `Element.prototype.scrollIntoView`, `block: 'start'`, `behavior: 'smooth'`); `scrolls instantly under reduced motion`; `the back button goes to the previous step`; `on the first step the back button is not intercepted`; `after booking the back button is not intercepted`; `opens the date step on the first open day`; `moves to the next open day when the first has no free time`; `stops auto-advancing at the last open day`; `a tapped day is never changed automatically`; `prefills the confirm step for a remembered client and Effacer clears it`; `saves the client after a successful booking`; `shows the WhatsApp question line only when the salon has WhatsApp`; `the success screen offers Ajouter à mon agenda and Itinéraire`.
- [ ] Implement; run the booking tests and the full suite; commit `feat(booking): steps open in view, back button, first open day, remembered client, calendar and directions`.

### Task 3: Footer links
**Files:** Modify `src/components/Footer.tsx`, `src/components/Footer.test.tsx`.
- [ ] Tests first: `links Itinéraire to Google Maps under the address`; `offers WhatsApp beside the phone`; `no Itinéraire without an address`. Implement; commit `feat(site): footer WhatsApp and directions`.

### Task 4: Fonts out of the render-blocking chain
**Files:** Modify `index.html` (preconnect to `fonts.googleapis.com` and `fonts.gstatic.com` crossorigin, the two stylesheet links), `src/index.css` (remove the two `@import` lines).
- [ ] Measure before/after with a throttled performance trace (render-blocking time); check the client page and `/admin` still use their fonts; commit `perf(site): load fonts from index.html, not CSS @import`.

## Final check
`pnpm test`, `npx tsc -b`, `pnpm build`, `pnpm check:bundle`; manual pass at 390 px FR/AR; final whole-branch review.
