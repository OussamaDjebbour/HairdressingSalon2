# A smoother, more pleasant booking for the client — design

Date: 2026-11-16. Status: the user asked for all eight items after a review of the client journey on a phone
("do all 8"). Built on top of `feat/luxe-site` (PR #26). Points the user did not state are **(my call)**.

## Why (what the review measured, production build, 390 px phone)
Fast already (LCP 1.6 s on throttled 4G, CLS 0, Lighthouse accessibility 100), but the booking had friction:
after "Continuer" from the bottom of the service list the next step's heading was 537 px above the screen; the
phone's back button left the booking; the date step opened empty; a returning client retyped her details; and
there was nothing to help her after booking (calendar, directions) or before it (WhatsApp question).

## The eight items
1. **Each step opens in view.** On every step change made by the client (Continuer, Retour, back button,
   "Changer", tile request) the top of the booking card is scrolled into view (smooth; instant under reduced motion),
   below the fixed bar. Not on first render.
2. **The phone's back button goes to the previous step.** While the wizard is past the first step, one history entry
   guards it: back = previous step (stays on the page, same URL); on the first step back leaves as usual. The on-screen
   "Retour" behaves the same. After a successful booking the guard is released, so back leaves the page **(my call)**.
3. **The date step opens on a day.** Entering the date step with no day chosen selects the first open day. If that
   day turns out to have no free time, the next open day is tried, until one has times or the 14 days run out
   **(my call)**; as soon as the client taps a day herself, nothing moves on its own.
4. **A returning client is remembered on her phone.** After a successful booking her name and phone are saved on
   the device (localStorage, per salon); next time the confirm step is prefilled and shows "Ce n'est pas vous ?
   Effacer" which clears both the fields and the saved copy. Storage failures are ignored (private mode).
5. **After booking: "Ajouter à mon agenda".** Downloads an `.ics` with one event from the first part's start to the
   last part's end, titled "<salon> — <services>", the address as location, and "En attente de confirmation par le
   salon." in the description **(my call: one event, pending wording)**.
6. **WhatsApp before booking.** A quiet line under the step indicator: "Une question ? Écrivez-nous sur WhatsApp"
   (opens the salon's WhatsApp); hidden when the salon has no WhatsApp. The footer gets a WhatsApp link too.
7. **Itinéraire.** A Google Maps search link built from the salon's address and city, in the footer under the address
   and on the success screen. Hidden without an address.
8. **Faster first paint.** Google Fonts move from CSS `@import` (render-blocking chain) to `<link rel="preconnect">` +
   stylesheet links in `index.html`; same families and weights.

## Constraints
- No change to booking rules, RPCs or the database. Item 4 stores only the client's own name and phone, on her device.
- Every string through `t()` in fr and ar; logical CSS; lucide-react only; public code must not import
  `src/data/admin.ts`; `pnpm check:bundle` must pass without raising the cap.
- No sticky or floating UI (user preference).

## Left to the builder
Helper names and files, exact wording of the `.ics` fields beyond the above, the scroll offset value.
