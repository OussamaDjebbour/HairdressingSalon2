# Forms: Radix UI + react-hook-form + zod — design

Approved mockup: `docs/superpowers/specs/assets/2026-11-12-form-fields-mockup.html` (screens A–D).

## Why

The owner (and the product owner, testing on Android) found the admin's inputs awkward and wants better accessibility. A walkthrough of every admin form at 360 px in FR and AR found these problems (details are in the conversation of 2026-11-12):

- **Validation feedback (every form):**
  - Errors appear only after Save, as small red text. The field itself doesn't change, and focus doesn't move to it.
  - Only Salon info ties its errors to their fields for screen readers (`aria-invalid` / `aria-describedby`).
  - Several messages are wrong or vague: an empty name gives "2 à 80 caractères", an empty phone gives "invalide", and empty closed-day dates give "la fin ne peut pas précéder le début".
  - Services shows one error at a time, at the bottom. Required fields aren't marked, and help text looks like errors.
- **Dates:** native date inputs look different on each phone, and the empty ones show a clipped "dd/mm/yyy". Ranges are split into "Du / Au".
- **Drop-downs and toggles:**
  - Drop-downs are native, including a long list of times. In Arabic the time drop-down's arrow sits on the opposite side from the others.
  - The hours screen's day pills aren't recognisable as open/closed toggles.
  - The service checkboxes are 20 px.
- **Other:**
  - The address textareas cut off their content.
  - The login form has no show-password toggle.
  - The placeholder "Aïd" is too pale to read.

The owner chose **all forms** (admin + public booking) and **Radix UI + react-hook-form + zod**, with **react-day-picker** for dates.

## Goals

1. **One field pattern for every form.** A shared `Field` component renders:
   - the label;
   - an optional "(facultatif)" marker on optional fields (no stars on required ones);
   - an optional help line in a quiet colour;
   - the control itself;
   - an error line with an icon, in rust, distinct from help.

   An invalid control gets a rust border and a light rust background, `aria-invalid="true"`, and `aria-describedby` pointing to its help and error. The look follows mockup A/D.
2. **Validation with react-hook-form + zod, all forms:**
   - **Timing:** `mode: 'onTouched'`. A field is checked when it loses focus and on Save; once in error, it re-checks as the user types.
   - **On Save:** all errors show at once, focus moves to the first invalid field (`shouldFocusError`), and a short summary line appears at the top of the form ("2 champs à corriger." / Arabic). The summary is announced (`role="alert"`).
   - **Messages:** each states the cause and how to fix it. "obligatoire" for empty, a specific message for wrong length, format or range, and the expected format as an example where useful (phone: "ex. 0555 12 34 56").
   - **Server errors:** an error from an RPC that concerns a field goes to that field with `setError` (for example `invalid_phone` → phone, `invalid_url` → the link, `slot_taken` → time). Other server errors keep the existing form-level alert.
3. **Shared rules.** zod schemas live in `src/data/` and are reused wherever the same data is entered:
   - client name and phone, shared by the public booking form and the owner's booking form;
   - an "Algerian mobile" phone rule, also used by WhatsApp in Salon info;
   - an https link rule;
   - date ranges, where the end is on or after the start.

   The database stays the final judge. zod mirrors its rules but never relaxes them.
4. **Controls (Radix primitives, styled with Tailwind and the palette):**
   - **Select** for every drop-down (service, coiffeuse, time, category, duration, opening and closing times, the calendar's filters). It looks like the text fields, with the arrow mirrored in RTL.
   - **Switch** for each day's open/closed on the hours screen. Each day is one row: day, switch, then the times or "Fermé" (mockup C).
   - **Checkbox** for a coiffeuse's services, with a 44 px tap target.
   - **Popover + react-day-picker** for single dates (the owner's booking date) and **ranges** (a coiffeuse's days off, the salon's closed days). Each range becomes one "Période" field (mockup B). It uses the French or Arabic locale from date-fns, `dir` follows the page, and the week starts on Sunday like the rest of the admin.
   - **Label** to associate labels with controls where a native `<label>` can't.
5. **Small fixes:**
   - textareas grow with their content (Salon info address);
   - the login password gets a show/hide button;
   - placeholders use a readable colour;
   - the "Ordre d'affichage" field gets a one-line help text.
6. **The public booking form** (client details step: name and phone) uses the same `Field` pattern, the shared schemas and the new messages. The rest of the booking wizard (service, coiffeuse, day and time buttons) is unchanged.
7. **Download size:** the admin and settings routes load lazily (`React.lazy` + `Suspense` with the existing spinner), so Radix, react-day-picker and date-fns aren't in the public site's first download. react-hook-form + zod are shared and small.
8. **Everything bilingual:** every new string goes through `t()` with both `fr` and `ar` keys. Logical CSS only. Controls work right to left. Tap targets are at least 44 px (`tap`).

## Non-goals

- No change to what the forms save, or to any database function or migration.
- No redesign of the booking wizard's steps, the agenda, the sheets or the calendar sheet (`DayPicker`), apart from swapping its two native `<select>`s for the Radix Select.
- No new icon or UI-theme package. Radix primitives are unstyled; icons stay lucide-react.
- No other component library (shadcn generators, MUI, etc.).

## Anti-goals

- A client or owner can submit something the database then refuses for a reason the form could have caught, or the form refuses something the database accepts. The rules must match.
- Errors that a screen reader can't connect to their field, or focus left somewhere unhelpful after a failed Save.
- A heavier first page for clients on the public site because of admin-only libraries.
- Anything that breaks in Arabic or at 360 px. That includes a popover or select menu opening off-screen, or an arrow pointing the wrong way.

## Constraints

- Stack: React 18, TypeScript, Vite, Tailwind 3.4, Vitest + Testing Library. The design system lives in `src/index.css` (`input`, `label`, `btn-*`, `tap`) and `tailwind.config.js` (palette tokens). New field styles extend those classes rather than inline one-offs.
- **Pinned versions** (at least two weeks old on 2026-11-12):

  | Package | Version |
  |---|---|
  | `react-hook-form` | 7.91.0 |
  | `@hookform/resolvers` | 5.9.2 (peer: RHF ^7.55, zod ^3.25 or ^4) |
  | `zod` | 4.6.7 |
  | `react-day-picker` | 10.0.2 (brings `date-fns` ^4) |
  | `@radix-ui/react-select` | 2.4.1 |
  | `@radix-ui/react-switch` | 1.4.1 |
  | `@radix-ui/react-checkbox` | 1.4.1 |
  | `@radix-ui/react-popover` | 1.3.1 |
  | `@radix-ui/react-direction` | 1.2.0 (wrap the app in `DirectionProvider` with the current `dir`) |
  | `@radix-ui/react-label` | 2.1.17 |
- Validation limits come from the database (`supabase/migrations`: the check constraints and the `admin_*` / `create_booking` functions) and today's client checks. Examples: client name 2–80 characters; phone `/^0[5-7][0-9]{8}$/` after `normalizePhone`; price a non-negative whole number; links start with `https://`; a day's closing time is after its opening time.
- Tests mock Supabase (`pnpm test`). Existing tests that type into fields or pick options will need updating where native `<select>`/date inputs become Radix or react-day-picker controls. Their assertions about behaviour stay.

## Forms in scope

| Form | File | Fields |
|---|---|---|
| Public booking, client details | `src/components/Booking.tsx` | name, phone |
| Login | `src/components/LoginForm.tsx` | email, password (+ show/hide) |
| Owner's booking (add / edit) | `src/components/admin/BookingSheet.tsx` | name, phone, service, coiffeuse, date (calendar), time, client language |
| Calendar filters | `src/components/admin/DayPicker.tsx` | service, coiffeuse (Select only) |
| Services | `src/components/settings/ServicesSettings.tsx` | names FR/AR, descriptions FR/AR, category, price, duration, display order |
| Coiffeuses | `src/components/settings/StylistsSettings.tsx` | first name, role FR/AR, services (checkboxes), workdays; days off (range) |
| Hours | `src/components/settings/HoursSettings.tsx` | per day: open switch, opening and closing time |
| Closed days | `src/components/settings/ClosedDatesSettings.tsx` | period (range), label |
| Salon info | `src/components/settings/SalonInfoSettings.tsx` | address FR/AR, city FR/AR, WhatsApp, Instagram, Facebook |

## Calls I made (owner can overrule)

- **Optional fields** say "(facultatif)"; required ones aren't starred, since most fields are required.
- **Errors show** on leaving a field and on Save, never while typing a first time.
- **A summary line** ("n champs à corriger") at the top on a failed Save, in addition to the per-field errors.
- **The time picker** is a styled Select listing the same quarter-hour times as today. It is not a free-typing time field.
- **Lazy-loading:** admin and settings are lazy-loaded to keep the public page light.
- **The calendar's filters** in `DayPicker` switch to the Radix Select for consistency. Nothing else about the calendar changes.

## Details settled after the builder check (my calls)

- **Public download size:**
  - react-hook-form and zod (full `zod`, not `zod/mini`) may be in the public first chunk. The hard gate is that Radix, react-day-picker and date-fns are not.
  - Budget: the public first chunk grows by **at most 30 KB gzipped**, measured with `pnpm build` before and after. If it goes over, switch the shared schemas to `zod/mini`.
- **WhatsApp and links match the database exactly** (`private.clean_salon_info`):
  - WhatsApp is optional. When filled, it must be an Algerian mobile after `normalizePhone`, `^0[5-7][0-9]{8}$`.
  - Instagram and Facebook are optional. When filled, they must start with `https://`.
  - The client checks each link separately, so a bad one is flagged on its own field. A server `invalid_url` (rare, after the client check) goes to the first link that fails the same check, or to Instagram if neither does.
- **Time Select:**
  - The owner's booking form keeps today's behaviour: a booking's current time stays in the list (in order) even when it's off the grid or outside the hours.
  - The hours screen lists quarter hours. A stored value not in the list is added as an extra option, so the Select never shows blank.
- **Radix inside the sheets:**
  - Minimal changes to `Sheet` / `useSheetDialog` are in scope, as plumbing rather than a redesign.
  - Escape closes an open menu or calendar first, not the sheet.
  - The Tab trap and the backdrop tap ignore Radix portals.
  - Portalled menus sit above the sheet (`z-50` and up) and open fully on screen at 360 px (`collisionPadding`, `avoidCollisions`).
- **Range picker:**
  - Past dates are allowed.
  - A single tapped day is a one-day period (start = end).
  - An empty period gives "Choisissez une période." (not the "fin avant début" message).
  - Overlapping periods and maximum lengths are left to the database, so no extra limits.
- **Tests:** jsdom polyfills for Radix (`ResizeObserver`, `hasPointerCapture` / `setPointerCapture` / `releasePointerCapture`, `scrollIntoView`) go in the Vitest setup file. Tests drive the real Select and calendar (keyboard or accessible names) rather than mocking them, so the "same RPC payloads" checks stay meaningful.
- **"(facultatif)" is per field.** The optional fields are:
  - **Arabic names, descriptions, roles, address and city:** their help line says that, left empty, the French text is used.
  - **The closed-period label.**
  - **The WhatsApp number:** its help line keeps "Laissez vide pour masquer les liens WhatsApp sur le site.".
  - **Instagram and Facebook.**
- **The owner's booking form date** becomes a button opening a Popover with react-day-picker (single date). The calendar sheet (`DayPicker`) stays a separate feature; only its two Selects change.

## Left to the builder

- Component names, file layout (for example `src/components/form/`) and how the `Field` wrapper composes with each Radix control.
- How a schema is split between shared pieces and per-form schemas, and how server error codes map to fields in each form. The examples above are the ones to keep.
- Exact Tailwind classes within the mockup's look, and the exact wording of each new message (both languages, following the "cause + fix" rule).
- Test strategy for Radix and react-day-picker in jsdom (for example opening a Select with the keyboard, or picking days by their accessible names).

## Verification

- Unit tests for every zod schema: the rules above, with French and Arabic messages.
- Per form:
  - empty Save shows every error at once and focuses the first invalid field;
  - each invalid field has `aria-invalid` and an error linked by `aria-describedby`;
  - server error codes land on the right field;
  - valid input still saves exactly what it saved before (same RPC payloads as today's tests).
- Browser check at 360 px in FR and AR, and on desktop, for every form. Select menus and calendars open fully on screen, arrows mirror, and nothing is clipped.
- Build: the public route's first JS chunk does not contain Radix or react-day-picker. Compare `pnpm build` output before and after.
