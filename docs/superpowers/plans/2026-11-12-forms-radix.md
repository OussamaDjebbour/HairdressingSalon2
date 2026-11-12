# Forms (Radix + react-hook-form + zod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every form (the public booking's client details, login, the owner's booking form, the calendar's filters, and the five settings screens) uses one accessible field pattern. That means react-hook-form with zod rules shared where the data is the same, Radix controls for drop-downs, checkboxes, switches and popovers, and react-day-picker for dates and ranges, in French and Arabic.

**Architecture:**
- A small form kit in `src/components/form/`:
  - `Field` wires the label, help, error and aria attributes;
  - one wrapper per control (text, select, checkbox, switch, date, range, password);
  - a summary line, and a server-error mapper.
- Shared zod schemas in `src/data/schemas.ts`. Their messages are i18n keys, so they work in both languages.
- The admin and settings routes become lazy chunks, and Radix, react-day-picker and date-fns are forced into an `admin-ui` chunk that the public entry never imports statically. A build check enforces this.

**Tech Stack:** React 18, TypeScript, Vite 5, Tailwind 3.4, Vitest + Testing Library (jsdom), Radix UI primitives, react-hook-form, zod 4, react-day-picker 10 (date-fns 4).

**Spec:** `docs/superpowers/specs/2026-11-12-forms-radix-design.md` (mockup: `docs/superpowers/specs/assets/2026-11-12-form-fields-mockup.html`)

**Branch:** `feat/forms-radix` (from `main` 082dcd7).

## Global Constraints

- **Exact versions, pinned without a caret:**

  | Package | Version |
  |---|---|
  | `react-hook-form` | 7.91.0 |
  | `@hookform/resolvers` | 5.9.2 |
  | `zod` | 4.6.7 |
  | `react-day-picker` | 10.0.2 |
  | `@radix-ui/react-select` | 2.4.1 |
  | `@radix-ui/react-switch` | 1.4.1 |
  | `@radix-ui/react-checkbox` | 1.4.1 |
  | `@radix-ui/react-popover` | 1.3.1 |
  | `@radix-ui/react-direction` | 1.2.0 |
  | `@radix-ui/react-label` | 2.1.17 |

  No other UI or icon package (icons stay lucide-react).
- **No database change.** The client rules mirror the database and never relax it:

  | Rule | Limit |
  |---|---|
  | names (client, service FR, coiffeuse first name) | 2–80 characters after trim |
  | price | whole number 0–1 000 000 |
  | duration | 15–600, in steps of 15 (a Select) |
  | closed-period label | ≤ 60 characters |
  | address and city | ≤ 200 characters per language |
  | phone and WhatsApp | `^0[5-7][0-9]{8}$` after `normalizePhone` |
  | links | start with `https://` |
  | each open day | `opens < closes` |
  | periods | `from ≤ to` |
- **Validation:**
  - react-hook-form `mode: 'onTouched'`, `shouldFocusError: true`;
  - all errors show on Save, plus a summary line (`role="alert"`);
  - errors are i18n keys rendered through `t()`;
  - every invalid control has `aria-invalid="true"` and `aria-describedby` pointing to its error (and help, if any).
- **"(facultatif)" per field.** Optional fields:
  - the Arabic name, description, role, address and city, each with the help line `form.help.arFallback`;
  - the closed-period label;
  - WhatsApp (keeps its existing help line);
  - Instagram and Facebook.
- **Every new string** goes in both the `fr` and `ar` maps of `LanguageContext.tsx`. Logical CSS only, palette tokens only, `tap` (44 px) on small controls, and RTL arrows mirrored.
- **Radix in sheets:**
  - portalled content sits above the sheet (`z-[60]` is fine; the sheet is `z-50`);
  - Escape closes the open menu or calendar first;
  - `useSheetDialog`'s Tab trap and the backdrop ignore events inside `[data-radix-popper-content-wrapper]`;
  - menus use `collisionPadding={12}`.
- **Ranges:** past dates are allowed, a single tapped day means from = to, and an empty period gives `form.error.periodRequired`.
- **Time Selects:** the current value is always an option (in order), even when it's off the grid.
- **Public download:** the entry chunk's static import closure must not contain the `admin-ui` chunk. Its gzip size may grow by **≤ 30 KB** over the Task 1 baseline. If it grows more, switch `src/data/schemas.ts` to `zod/mini`.
- **Commands:** `pnpm test`, `npx tsc -b`, `pnpm build`, `pnpm check:bundle` (added in Task 1).

## Review Focus

1. **A Radix Select or calendar opened inside a sheet** (owner's booking) must open fully on a 360 px screen. Escape closes the menu, not the sheet, and Tab moves into the menu. Test in Task 5.
2. **Arabic:** Select arrows, the calendar's month arrows and the error icon mirror. Phone values stay left-to-right. The error text is Arabic. Test in Task 3 (Select `dir`) and Task 4 (Arabic error on the public form).
3. **Saving an edit must send the same RPC payload as today.** Only the controls changed, and the existing payload assertions must still pass unchanged in Tasks 4–7.
4. **A stored time or date not on the grid** (old booking at 10:10, hours ending 18:45) must still show as the current value. Test in Task 3 (SelectField keeps an unknown value) and Task 5.
5. **A server error after a valid client check** lands on its field: `slot_taken` → time, `invalid_phone` → phone or WhatsApp, `invalid_url` → the failing link. Tests in Tasks 5 and 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Pinned dependencies, `check:bundle` script |
| `vite.config.ts` | `manualChunks`: `@radix-ui`, `react-day-picker`, `date-fns` → `admin-ui`; `build.manifest: true` |
| `scripts/check-public-bundle.mjs` (new) | Reads `dist/.vite/manifest.json`. Fails if the entry's static imports include `admin-ui`, or if the entry closure's gzip size exceeds baseline + 30 KB |
| `src/App.tsx` | `React.lazy` admin and settings pages; `DirectionProvider` with the current `dir` |
| `src/test/setup.ts` | jsdom polyfills for Radix |
| `src/index.css` | Invalid, help, error, placeholder and Select-trigger styles in `@layer components` |
| `src/components/form/*` (new) | `Field`, `TextField`, `PasswordField`, `SelectField`, `CheckboxField`, `SwitchField`, `DateField`, `DateRangeField`, `FormSummary`, `serverErrors.ts` |
| `src/data/schemas.ts` (new) | Shared zod pieces and message keys |
| `src/components/admin/useSheetDialog.ts` | Ignore Radix portals in the Tab trap and Escape |
| Forms (modify) | `Booking.tsx` (client step), `LoginForm.tsx`, `admin/BookingSheet.tsx`, `admin/DayPicker.tsx` (Selects only), `settings/ServicesSettings.tsx`, `settings/StylistsSettings.tsx`, `settings/HoursSettings.tsx`, `settings/ClosedDatesSettings.tsx`, `settings/SalonInfoSettings.tsx` |
| `src/context/LanguageContext.tsx` | `form.*` keys (FR + AR) |

---

### Task 1: Dependencies, lazy admin, bundle gate, test polyfills

**Files:** `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `scripts/check-public-bundle.mjs`, `src/App.tsx`, `src/test/setup.ts`; test `scripts/check-public-bundle.test.ts` (Vitest, Node environment via `// @vitest-environment node`).

**Interfaces:**
- Produces:
  - `pnpm check:bundle` (exit 0 / 1, prints the entry closure's gzip KB and the baseline);
  - `scripts/public-bundle-baseline.json`: `{ "entryGzipKB": <number> }`, recorded **before** this task's code changes;
  - an `admin-ui` chunk.
- The check's core is an exported pure function: `checkPublicBundle(manifest: Record<string, { file: string; imports?: string[]; isEntry?: boolean; dynamicImports?: string[] }>, sizes: Record<string, number>, baselineKB: number): { ok: boolean; entryKB: number; reasons: string[] }`.

- [ ] **Step 1: Record the baseline.** On the unchanged code, run `pnpm build`. Gzip-measure the entry JS (and its static imports) with Node's `zlib.gzipSync`, and write the number to `scripts/public-bundle-baseline.json`.
- [ ] **Step 2: Write the failing tests** for `checkPublicBundle`:
  - an entry that statically imports a chunk whose `file` contains `admin-ui` → `ok: false`, with a reason naming it;
  - `admin-ui` reachable only through `dynamicImports` → `ok: true`;
  - an entry closure 31 KB over the baseline → `ok: false`; 29 KB over → `ok: true`.
- [ ] **Step 3: Run** `npx vitest run scripts/check-public-bundle.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement:**
  - `checkPublicBundle` and its CLI wrapper (reads the manifest and file sizes, prints, sets the exit code);
  - install the pinned packages (`pnpm add -E …`);
  - in `vite.config.ts`, set `build.manifest: true` and `manualChunks(id)` returning `'admin-ui'` for ids containing `/node_modules/@radix-ui/`, `/node_modules/react-day-picker/` or `/node_modules/date-fns/`;
  - in `App.tsx`, lazy `AdminPage`, `SettingsPage` and `SettingsSectionPage` (named exports via `.then(m => ({ default: m.X }))`) inside `Suspense`, with the existing spinner markup as fallback;
  - wrap the routes in Radix `DirectionProvider dir={dir}`, where `dir` comes from `useLang()` (move the provider inside `LanguageProvider`);
  - in `setup.ts`, add polyfills when missing: `ResizeObserver` (a no-op class), `Element.prototype.hasPointerCapture` / `setPointerCapture` / `releasePointerCapture`, and `Element.prototype.scrollIntoView`;
  - add `"check:bundle": "node scripts/check-public-bundle.mjs"`.
- [ ] **Step 5: Run** `pnpm test && npx tsc -b && pnpm build && pnpm check:bundle`. Expected: all green, and check:bundle OK (no Radix is used yet, so `admin-ui` may not even exist).
- [ ] **Step 6: Commit** `build: pin form libraries, lazy-load the admin, guard the public bundle`

---

### Task 2: Form kit, part 1: Field, TextField, PasswordField, FormSummary, server errors, styles

**Files:** Create `src/components/form/Field.tsx`, `TextField.tsx`, `PasswordField.tsx`, `FormSummary.tsx`, `serverErrors.ts`, `form.test.tsx`. Modify `src/index.css`, `LanguageContext.tsx`.

**Interfaces:**
- Produces:
  ```ts
  export interface FieldA11y { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }
  export function Field(props: { id: string; label: string; optional?: boolean; help?: string; error?: string; // error = i18n key
                                 children: (a11y: FieldA11y) => ReactNode }): JSX.Element;
  export const TextField: ForwardRef<HTMLInputElement | HTMLTextAreaElement, {
    id: string; label: string; optional?: boolean; help?: string; error?: string; multiline?: boolean;
  } & UseFormRegisterReturn & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'|'onChange'|'onBlur'>>;
  export const PasswordField: typeof TextField; // adds a show/hide toggle button
  export function FormSummary(props: { count: number }): JSX.Element | null;
  export function applyServerError(code: string, fields: Record<string, string>,
                                   setError: (name: string, e: { type: 'server'; message: string }) => void): boolean;
  ```
  `applyServerError` returns true when `code` is mapped. It sets the message to the i18n key `admin.error.<code>` or `settings.error.<code>`, as the caller's map provides.
- **Keys (FR / AR, both required; the Arabic needs a native check):**

  | Key | French |
  |---|---|
  | `form.optional` | `facultatif` |
  | `form.summary.one` | `1 champ à corriger.` |
  | `form.summary.other` | `{n} champs à corriger.` |
  | `form.error.required` | `Ce champ est obligatoire.` |
  | `form.error.nameRequired` | `Le nom est obligatoire.` |
  | `form.error.nameLength` | `Le nom doit contenir 2 à 80 caractères.` |
  | `form.error.phoneRequired` | `Le numéro est obligatoire.` |
  | `form.error.phone` | `Numéro de mobile algérien invalide (ex. 0555 12 34 56).` |
  | `form.error.url` | `Le lien doit commencer par https://.` |
  | `form.error.price` | `Indiquez un prix en dinars, sans centimes (0 à 1 000 000).` |
  | `form.error.periodRequired` | `Choisissez une période.` |
  | `form.error.labelLength` | `Le libellé ne doit pas dépasser 60 caractères.` |
  | `form.error.textLength` | `Ce texte ne doit pas dépasser 200 caractères.` |
  | `form.error.hours` | `L’heure de fermeture doit être après l’ouverture.` |
  | `form.error.emailRequired` | `L’e-mail est obligatoire.` |
  | `form.error.email` | `Adresse e-mail invalide.` |
  | `form.error.passwordRequired` | `Le mot de passe est obligatoire.` |
  | `form.help.arFallback` | `Laissé vide, le texte français est utilisé.` |
  | `form.showPassword` | `Afficher le mot de passe` |
  | `form.hidePassword` | `Masquer le mot de passe` |

  Arabic plural keys for the summary go through `countText` (`form.summary.{one,two,few,many,other}`).
- **Styles in `index.css` `@layer components`:**
  - `.input[aria-invalid="true"]`: `border-rust-500 bg-rust-50/40`;
  - `.field-help`: `text-xs text-rose-600`;
  - `.field-error`: `text-xs font-medium text-rust-700`, flex with a lucide `AlertCircle` icon;
  - placeholder becomes `placeholder:text-rose-500/70`, readable at 4.5:1 on cream;
  - `textarea.input` gets `field-sizing: content` with a `min-h-24` fallback.

- [ ] **Step 1: Write the failing tests** (`form.test.tsx`; render inside a tiny `useForm` harness):
  - `Field` with `error="form.error.nameRequired"`: the control has `aria-invalid="true"`, `aria-describedby` contains the error's id, and the error text is `Le nom est obligatoire.`;
  - with `help` and no error: `aria-describedby` points to the help only;
  - `optional`: the label shows `facultatif`;
  - `TextField` registered with RHF and a schema requiring 2+ characters, `mode: 'onTouched'`:
    - typing `a` shows no error;
    - blur → error;
    - typing `ab` → the error disappears;
  - `PasswordField`: the button `Afficher le mot de passe` switches `type` to `text`, and its name becomes `Masquer le mot de passe`;
  - `FormSummary count={2}` → `role="alert"` with `2 champs à corriger.`; `count={0}` → nothing;
  - `applyServerError('invalid_phone', { invalid_phone: 'clientPhone' }, setError)` → `setError('clientPhone', { type: 'server', message: 'admin.error.invalid_phone' })`, returns true; unknown code → false.
- [ ] **Step 2: Run** `npx vitest run src/components/form/form.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the interfaces. `Field` renders a native `<label htmlFor>` (no Radix Label is needed here), the help with id `${id}-help`, the error with id `${id}-error`, and passes the `FieldA11y` to its child.
- [ ] **Step 4: Run** the test file, then `pnpm test && npx tsc -b`. Expected: green.
- [ ] **Step 5: Commit** `feat(forms): accessible field kit — labels, help, errors, summary`

---

### Task 3: Form kit, part 2: Select, Checkbox, Switch, Date, Range

**Files:** Create `src/components/form/SelectField.tsx`, `CheckboxField.tsx`, `SwitchField.tsx`, `DateField.tsx`, `DateRangeField.tsx`, `controls.test.tsx`. Modify `LanguageContext.tsx` (`form.pickDate`, `form.pickPeriod`, `form.prevMonth`, `form.nextMonth`).

**Interfaces:**
- Consumes: Task 2's `Field`.
- Produces (all controlled, with RHF `Controller`-friendly props; `onBlur` marks the field touched):
  ```ts
  export interface Option { value: string; label: string }
  export const SelectField: ForwardRef<HTMLButtonElement, { id: string; label: string; value: string; options: Option[];
    onValueChange(v: string): void; onBlur?(): void; error?: string; optional?: boolean; help?: string; placeholder?: string; dirLtrValues?: boolean }>;
  export function CheckboxField(p: { id: string; label: string; checked: boolean; onCheckedChange(c: boolean): void }): JSX.Element;
  export function SwitchField(p: { id: string; label: string; checked: boolean; onCheckedChange(c: boolean): void }): JSX.Element;
  export const DateField: ForwardRef<HTMLButtonElement, { id: string; label: string; value: Date | null; onChange(d: Date): void;
    onBlur?(): void; error?: string }>;
  export interface Period { from: Date; to: Date }
  export const DateRangeField: ForwardRef<HTMLButtonElement, { id: string; label: string; value: Period | null;
    onChange(p: Period | null): void; onBlur?(): void; error?: string }>;
  ```
- **`SelectField` rules:**
  - if `value` is not among `options`, it renders an extra option for it (label = value) at its sorted place (Review Focus 4);
  - `dirLtrValues` sets `dir="ltr"` on item text (for times);
  - the trigger has class `input` plus a down chevron (lucide `ChevronDown`, not rotated) placed with `ms-auto`, so it sits on the end side in both directions;
  - content: `position="popper"`, `sideOffset={6}`, `collisionPadding={12}`, z-index above the sheet;
  - items use `tap` height.
- **Dates:** a Popover containing react-day-picker:
  - `locale` is `fr` or `arDZ` from `date-fns/locale`, matching `lang`, and `dir` matches the page;
  - `weekStartsOn={0}`;
  - the trigger shows `formatLongDate` (single) or `{from} → {to}` (range);
  - in range mode, the first click sets `{ from: d, to: d }` and the second click extends it.

- [ ] **Step 1: Write the failing tests** (`controls.test.tsx`):
  - **SelectField:** the trigger has the label's accessible name and shows `Amina`. Keyboard (`Enter`, then `ArrowDown`, then `Enter`) selects `Leila` and calls `onValueChange('leila')`. With `value="10:10"` and grid options `10:00`, `10:15`, the opened list reads `10:00, 10:10, 10:15` and the trigger shows `10:10`. With `error`, the trigger has `aria-invalid="true"`.
  - **CheckboxField:** clicking the label toggles it (`aria-checked`), and the root has class `tap`.
  - **SwitchField:** `role="switch"`, toggling via the label, `aria-checked`.
  - **DateField** (fake Date `2030-01-08`): the trigger shows `Mardi 8 janvier`. Opening it and clicking the day named `vendredi 11 janvier 2030` (react-day-picker's accessible day label in French; read it from the rendered grid) calls `onChange` with Jan 11.
  - **DateRangeField:**
    - clicking 2 then 5 May gives `{from: 2 May, to: 5 May}`;
    - a single click on 2 May gives `{from: 2 May, to: 2 May}`;
    - in Arabic (`LanguageProvider` toggled), the popover's grid has `dir="rtl"`.
- [ ] **Step 2: Run** `npx vitest run src/components/form/controls.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces. Take the classes from the mockup (rounded 14 px like `.input`, palette tokens only), and import react-day-picker's base CSS once in these components (it lands in the lazy chunk).
- [ ] **Step 4: Run** the test file, then `pnpm test && npx tsc -b && pnpm build && pnpm check:bundle`. Expected: green, with `admin-ui` present and not statically imported by the entry.
- [ ] **Step 5: Commit** `feat(forms): Radix select, checkbox, switch and react-day-picker date fields`

---

### Task 4: Shared schemas, public booking client step, login

**Files:** Create `src/data/schemas.ts`, `src/data/schemas.test.ts`. Modify `src/components/Booking.tsx` (client details only), `src/components/LoginForm.tsx`, their tests, `LanguageContext.tsx`.

**Interfaces:**
- Produces:
  ```ts
  export const MSG = { /* the form.error.* keys from Task 2 */ } as const;
  export const clientNameSchema: z.ZodType<string>;          // trim; '' → nameRequired; 2–80 → nameLength
  export const mobilePhoneSchema: z.ZodType<string>;         // '' → phoneRequired; isValidPhone → phone
  export const optionalMobilePhoneSchema: z.ZodType<string>; // '' ok; else as above
  export const optionalHttpsUrlSchema: z.ZodType<string>;    // '' ok; else /^https:\/\// → url
  export const periodSchema: z.ZodType<Period | null>;       // null → periodRequired; from ≤ to
  export const clientDetailsSchema = z.object({ clientName: clientNameSchema, clientPhone: mobilePhoneSchema });
  ```
  Messages are the `MSG` keys. `isValidPhone` and `normalizePhone` are reused from `src/data/bookings.ts`, not copied.

- [ ] **Step 1: Write the failing tests:**
  - `schemas.test.ts`, one case per rule:
    - `''` → `form.error.nameRequired`;
    - `'a'` → `form.error.nameLength`;
    - 81 characters → `form.error.nameLength`;
    - `' Nour '` → ok;
    - `'021 12 34 56'` → `form.error.phone`;
    - `'+213 555 12 34 56'` → ok;
    - optional phone `''` → ok;
    - `'http://x'` → `form.error.url`;
    - `periodSchema` null → `form.error.periodRequired`;
    - from after to → an error.
  - `Booking.test.tsx`, client step:
    - Continue/confirm with empty fields shows `Le nom est obligatoire.` and `Le numéro est obligatoire.` together;
    - focus is on the name input;
    - both inputs have `aria-invalid="true"`;
    - **Review Focus 2:** in Arabic, the phone error is the Arabic text of `form.error.phone`, and the phone input keeps `dir="ltr"`;
    - the existing successful-booking payload test passes unchanged.
  - `LoginForm.test.tsx`:
    - empty submit shows `L’e-mail est obligatoire.` and `Le mot de passe est obligatoire.` and calls nothing;
    - `PasswordField` toggles;
    - a wrong-password server error still shows the existing message.
- [ ] **Step 2: Run** `npx vitest run src/data/schemas.test.ts src/components/Booking.test.tsx src/components/LoginForm.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement:**
  - the schemas;
  - in `Booking.tsx`, the client step uses `useForm({ resolver: zodResolver(clientDetailsSchema), mode: 'onTouched' })` with `TextField`s. Keep the existing "button disabled until valid" behaviour only if a test needs it; otherwise the button stays enabled and Save shows the errors (spec: all errors on Save);
  - in `LoginForm`, the same with an email schema (`z.email()` with the `MSG` keys) and `PasswordField`.
- [ ] **Step 4: Run** the three files, then `pnpm test && npx tsc -b && pnpm build && pnpm check:bundle`. Expected: green, with the public entry within budget.
- [ ] **Step 5: Commit** `feat(forms): shared client rules; public booking and login use the new fields`

---

### Task 5: Owner's booking form and the calendar's filters (and Radix inside sheets)

**Files:** Modify `src/components/admin/BookingSheet.tsx`, `useSheetDialog.ts`, `DayPicker.tsx` (two Selects), and tests `BookingSheet.test.tsx`, `DayPicker.test.tsx`, `Schedule.test.tsx`.

**Interfaces:**
- Consumes: Tasks 2–4 (`TextField`, `SelectField`, `DateField`, `FormSummary`, `applyServerError`, `clientNameSchema`, `mobilePhoneSchema`).
- Server mapping: `slot_taken`, `outside_hours` and `salon_closed` → `time`; `invalid_phone` → `clientPhone`; `invalid_name` → `clientName`. Anything else keeps the existing form-level alert (`admin.error.*`).
- `useSheetDialog`:
  - on Escape, if `document.querySelector('[data-radix-popper-content-wrapper]')` exists, do nothing (Radix closes its own menu);
  - the Tab trap's focusables include the portalled content (query both the dialog and `[data-radix-popper-content-wrapper]`);
  - a backdrop click whose target is inside a portal is ignored.

- [ ] **Step 1: Write the failing tests:**
  - **The existing `BookingSheet` tests stay green:** change how they pick values (the Select via keyboard or role `option`, the date via the calendar), but **not their assertions about `create`/`update` payloads** (Review Focus 3).
  - **New:**
    - empty Save on the add form shows `2 champs à corriger.`, `Le nom est obligatoire.` and `Le numéro est obligatoire.`, and focus is on the name;
    - `create` rejected with `{ message: 'slot_taken' }` shows the slot message under `Heure`, and the `Heure` trigger has `aria-invalid="true"` (Review Focus 5);
    - an edit of a 10:10 booking shows `10:10` on the `Heure` trigger (Review Focus 4);
    - with the `Heure` menu open, Escape closes the menu and the dialog `Nouveau rendez-vous` is still there (Review Focus 1);
    - in `DayPicker`, the `Prestation` and `Coiffeuse` filters are Radix Selects, and the existing DayPicker and Schedule tests stay green (picking through the Select).
- [ ] **Step 2: Run** `npx vitest run src/components/admin src/components/Schedule.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement:**
  - `BookingSheet`'s form on `useForm` with a schema built from the shared pieces plus `serviceId`, `stylistId`, `date`, `time` and `lang`;
  - keep `initialForm`, the dirty guard, "Retour au résumé", the closed-day and own-span time options, the demo masked-phone exception (a masked phone sent back unchanged skips the phone rule), and the stylist-off warning;
  - make the `useSheetDialog` changes listed above.
- [ ] **Step 4: Run** the same command, then `pnpm test && npx tsc -b`. Expected: green.
- [ ] **Step 5: Commit** `feat(forms): owner's booking form on the new fields; Radix menus work inside sheets`

---

### Task 6: Services and coiffeuses settings

**Files:** Modify `settings/ServicesSettings.tsx`, `settings/StylistsSettings.tsx` and their tests.

**Interfaces:**
- Consumes: the form kit; `clientNameSchema` (the same 2–80 rule for a service's French name and a coiffeuse's first name); `periodSchema`.
- **Services schema:**
  - `name.fr` uses the name rule;
  - `name.ar`, `description.fr` and `description.ar` are optional, and the Arabic ones show `form.help.arFallback`;
  - `category`: Select;
  - `price`: string input → integer 0–1 000 000 (`form.error.price`);
  - `duration`: Select of 15…600 in steps of 15, showing the current value if it's off the list;
  - `sortOrder`: integer ≥ 0, with help `Plus petit = affiché en premier.` (new key `settings.services.sortHelp`, FR + AR).
- **Coiffeuse schema:**
  - name rule;
  - the Arabic role is optional with fallback help;
  - services: `CheckboxField` list;
  - workdays: the existing toggle pills stay (they're already clear);
  - days off: one `DateRangeField` (`Période`) replacing Du/Au, submitted as `from`/`to` `YYYY-MM-DD` exactly as today.
- Server mapping: `invalid_name` → name, `invalid_price` → price, `invalid_duration` → duration, `invalid_dates` → period.

- [ ] **Step 1: Write the failing tests:**
  - **Services:**
    - empty Save shows **both** `Le nom est obligatoire.` and `Indiquez un prix en dinars, sans centimes (0 à 1 000 000).` (today only the price shows);
    - `12.5` → the price error;
    - the existing save-payload test passes unchanged.
  - **Coiffeuses:**
    - the services are checkboxes (`role="checkbox"`) toggled through their labels;
    - adding a day off with an empty period shows `Choisissez une période.`;
    - picking 2–5 May sends `from: '2099-05-02', to: '2099-05-05'` (adapt to the test's fixed dates);
    - a single day sends `from === to`;
    - the existing save payloads are unchanged.
- [ ] **Step 2: Run** `npx vitest run src/components/settings/ServicesSettings.test.tsx src/components/settings/StylistsSettings.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the schemas and controls above, keeping each RPC call's arguments identical.
- [ ] **Step 4: Run** the same command, then `pnpm test && npx tsc -b`. Expected: green.
- [ ] **Step 5: Commit** `feat(forms): services and coiffeuses settings — all errors at once, range for days off`

---

### Task 7: Hours, closed days and salon info; final bundle and browser check

**Files:** Modify `settings/HoursSettings.tsx`, `settings/ClosedDatesSettings.tsx`, `settings/SalonInfoSettings.tsx` and their tests.

**Interfaces:**
- Consumes: the form kit; `periodSchema`, `optionalMobilePhoneSchema`, `optionalHttpsUrlSchema`.
- **Hours:** one row per day: day name, `SwitchField` (label = the day name, e.g. `Mardi`), then the opening and closing `SelectField`s (quarter hours, current value kept), or `Fermé` when off (mockup C).
  - A day with `opens >= closes` gets `form.error.hours` under that day's row.
  - The payload is identical to today's.
- **Closed days:** `DateRangeField` (`Période`) plus the label (optional, ≤ 60 → `form.error.labelLength`). An empty period gives `form.error.periodRequired`, no longer the "fin avant début" message.
- **Salon info:**
  - address FR/AR as auto-growing textareas (≤ 200; Arabic optional with fallback help);
  - city FR/AR (≤ 200; Arabic optional);
  - WhatsApp via `optionalMobilePhoneSchema`, keeping its help line;
  - Instagram and Facebook via `optionalHttpsUrlSchema`, each flagged on its own field;
  - server mapping `invalid_phone` → WhatsApp; `invalid_url` → the first link failing the client check, else Instagram.

- [ ] **Step 1: Write the failing tests:**
  - **Hours:**
    - each day is a `role="switch"` named by the day;
    - turning Monday on shows its two time Selects;
    - setting Tuesday 18:00–09:00 shows `L’heure de fermeture doit être après l’ouverture.` under Tuesday and blocks Save;
    - the existing payload test passes unchanged;
    - a stored `18:45` close shows as the Select's value.
  - **Closed days:**
    - empty submit shows `Choisissez une période.`;
    - a 61-character label shows the label error;
    - a valid range sends the same RPC arguments as today.
  - **Salon info:**
    - `not a url` in Facebook flags **Facebook** (not Instagram);
    - a server `invalid_url` with Instagram valid and Facebook bad flags Facebook;
    - `invalid_phone` flags WhatsApp;
    - the Arabic address shows `facultatif` and the fallback help;
    - the existing save payload is unchanged.
- [ ] **Step 2: Run** `npx vitest run src/components/settings`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the three forms as specified.
- [ ] **Step 4: Run** `pnpm test && npx tsc -b && pnpm build && pnpm check:bundle`. Expected: all green; check:bundle prints the entry gzip KB ≤ baseline + 30.
- [ ] **Step 5: Browser check** (local stack, dev server, owner account, 360 px in FR and AR, then 1280 px) on every form in scope:
  - empty-Save behaviour;
  - menus and calendars open fully on screen, including inside the booking sheet;
  - Escape closes the menu first;
  - arrows mirror in Arabic;
  - nothing is clipped (dates, addresses);
  - the public booking client step works on the phone;
  - DevTools Network on `/` doesn't load the `admin-ui` chunk.
- [ ] **Step 6: Commit** `feat(forms): hours with switches, one range for closed days, salon info on the new fields`

---

## Self-review notes

- **Spec coverage:**

  | Spec goal | Task(s) |
  |---|---|
  | 1 (one field pattern) | 2, 3 |
  | 2 (validation timing, summary, focus, server errors) | 2, then each form task |
  | 3 (shared rules) | 4 |
  | 4 (controls) | 3 |
  | 5 (small fixes: textarea, password, placeholder, sort help) | 2, 4, 6, 7 |
  | 6 (public form) | 4 |
  | 7 (lazy admin and bundle) | 1, checked again in 3, 4 and 7 |
  | 8 (bilingual, RTL, tap sizes) | every task |

  The settled details (WhatsApp and links, time Select, Radix in sheets, ranges, test polyfills, "(facultatif)", the booking date as a popover) are in Global Constraints or the owning tasks.
- **Types:** `Field`, `TextField`, `SelectField`, `DateField`, `DateRangeField`, `Period`, `FormSummary`, `applyServerError` and the `MSG` keys are defined in Tasks 2–4 and used unchanged in Tasks 5–7.
