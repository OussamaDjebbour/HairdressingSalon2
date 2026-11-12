# Room Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping the date in the agenda's day bar opens a month calendar. It shows how full each day is, or how many start times fit a chosen service with a chosen coiffeuse (or anyone), and a tapped time opens "Nouveau rendez-vous" pre-filled.

**Architecture:**
- The availability rules are a pure, tested module, `src/data/roomFinder.ts`. It works on the data the admin already loads, so there is no database change.
- A new sheet component, `src/components/admin/DayPicker.tsx`, renders the calendar. It uses the shared `Sheet` frame and `useSheetMotion` from the parent branch.
- `Schedule` owns the open state and the remembered filter, and turns a pick into a day jump or a pre-filled add sheet.

**Tech Stack:** React 18, TypeScript, Tailwind 3.4, React Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-12-room-finder-design.md` (mockup: `docs/superpowers/specs/assets/2026-11-12-room-finder-mockup.html`)

**Branch:** `feat/admin-room-finder`, stacked on `feat/admin-sheet-motion` (needs `Sheet`'s `motion` prop and `useSheetMotion`).

## Global Constraints

- No new npm package. No migration, no new RPC.
- Every visible string goes through `t()`, with keys in both `fr` and `ar`. Use logical CSS (`ms-/me-/ps-/pe-/text-start/start-/end-`), palette tokens only, and the `tap` class (44 px minimum) on every small control.
- The rules are the owner's: salon hours and closed dates (`dayHours`), a 15-minute grid from opening, the service ends by closing time, no overlap with that coiffeuse's non-cancelled bookings, active coiffeuses who work that day (`stylistWorks`), and any coiffeuse can do any service.
- Week starts on **Sunday** (like `weekDays`). Count colours: **≥ 4 → green, 1–3 → amber**.
- Pickers list **active** services and coiffeuses only. "Toutes" = any coiffeuse. The pre-filled coiffeuse is the first free one in `useAllStylists` order.
- Neighbouring-month days: a greyed date, no indicators, still tappable (jump).
- Without a service filter, tapping a day jumps at once. With a filter, it lists that day's times plus "Voir la journée".
- The filter is remembered in `Schedule` state until reload.
- Switching sheets: the calendar slides away first (`motion.dismiss(then)`), then the agenda moves and "Nouveau rendez-vous" slides up.
- Run the suite with `pnpm test`, the typecheck with `npx tsc -b`, the build with `pnpm build`.

## Review Focus

1. **A booking that starts off the grid or has an odd length** (10:10 for 50 min) must block every overlapping start, and nothing that touches it end-to-start may be blocked. Test in Task 1.
2. **A viewer whose phone isn't on Algiers time** (bookings are UTC instants): minutes come from `salonMinutes`/`salonDate`, never `getHours()`. Test in Task 1.
3. **A service longer than what's left of the day** (150 min, closes in 2 h): no start, and the label says "complet". Test in Task 1.
4. **Today, after the last possible start:** "complet", not old times. Today mid-day: only later starts. Test in Task 1.
5. **A remembered filter whose service or coiffeuse was hidden since:** it is treated as "Toutes", and the calendar never shows "absente" everywhere. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/roomFinder.ts` (new) | Pure rules: free starts for a day, a day's room status, the month grid |
| `src/data/roomFinder.test.ts` (new) | Its tests |
| `src/data/formatters.ts` | + `formatMonthYear`, `weekdayInitials` |
| `src/components/admin/DayPicker.tsx` (new) | The calendar sheet (both modes) |
| `src/components/admin/DayPicker.test.tsx` (new) | Its tests |
| `src/components/admin/BookingSheet.tsx` | Add mode accepts an optional `serviceId` pre-fill |
| `src/components/Schedule.tsx` | Date button in the day bar, picker state, jump / pre-filled add |
| `src/context/LanguageContext.tsx` | New `admin.picker.*` keys (FR + AR) |

---

### Task 1: Availability rules (`roomFinder.ts`) and calendar formatters

**Files:** Create `src/data/roomFinder.ts`, `src/data/roomFinder.test.ts`. Modify `src/data/formatters.ts` (+ its test).

**Interfaces:**
- Produces:
  ```ts
  export interface FreeStart { time: string; stylistId: string }        // "HH:MM" salon time
  export type DayRoom =
    | { kind: 'past' } | { kind: 'closed' } | { kind: 'absent' } | { kind: 'full' }
    | { kind: 'room'; starts: FreeStart[] };
  export interface RoomInput {
    date: Date;                 // local-midnight day (like the agenda's `day`)
    hours: DayHours | null;     // dayHours(salonHours, closedDates, date)
    durationMin: number;        // the service's duration
    candidates: Stylist[];      // [chosen] or every active stylist, in useAllStylists order
    specific: boolean;          // true when one coiffeuse was chosen (enables 'absent')
    daysOff: StylistDayOff[];
    bookings: AdminBooking[];   // any range; filtered to `date` and non-cancelled inside
    now: Date;
  }
  export function dayRoom(input: RoomInput): DayRoom;
  export function roomLevel(count: number): 'lots' | 'few';             // >= 4 → 'lots'
  export function monthGrid(month: Date): { date: Date; inMonth: boolean }[];  // Sunday-first, whole weeks
  ```
  Also, in `formatters.ts`:
  - `formatMonthYear(date: Date, lang: Lang): string`: `'Novembre 2026'` / `'نوفمبر 2026'`, capitalised in French, built from the existing month names.
  - `weekdayInitials(lang: Lang): string[]`: Sunday-first. `fr`: `['D','L','M','M','J','V','S']`; `ar`: `['ح','ن','ث','ر','خ','ج','س']`.

**Algorithm (`dayRoom`), in this order:**
1. The date is before today (salon date of `now`) → `past`.
2. `hours === null` → `closed`.
3. Working = `candidates.filter(s => stylistWorks(s, daysOff, date))`. If none: `specific ? 'absent' : 'full'`.
4. Candidate starts = `staffTimeOptions(durationMin, hours)` (15-min grid, must end by closing). On today, keep only starts after `salonMinutes(now)`.
5. A start is free for a stylist when no non-cancelled booking of hers on that salon date overlaps `[start, start+duration)`. Overlap uses `salonMinutes(b.startsAt)` and the booking's own length (`endsAt − startsAt`), and is strict: touching ends don't overlap.
6. Free set = starts where some working stylist is free. Its `stylistId` is the first such stylist in `candidates` order.
7. Thin out: keep a start on :00/:30, and keep a :15/:45 start only if neither `start−15` nor `start+15` is in the free set.
8. Empty → `full`. Otherwise → `room` with the thinned list.

- [ ] **Step 1: Write the failing tests** in `roomFinder.test.ts`. Use local `stylist()`/`booking()` helpers, as in `week.test.ts`; bookings are UTC instants, and 09:00Z = 10:00 Algiers. Day = Tuesday 2030-01-08, hours `{ opens: 540, closes: 1080 }`, `now = 2030-01-07T12:00:00Z` unless stated:
  ```ts
  const base: RoomInput = {
    date: new Date(2030, 0, 8), hours: { opens: 540, closes: 1080 }, durationMin: 60,
    candidates: [amina, leila], specific: false, daysOff: [], bookings: [], now: new Date('2030-01-07T12:00:00Z'),
  };
  const times = (r: DayRoom) => (r.kind === 'room' ? r.starts.map((s) => s.time) : []);

  it('lists half-hours from opening to the last start that ends by closing', () => {
    const t = times(dayRoom({ ...base, durationMin: 120 }));
    expect(t[0]).toBe('09:00');
    expect(t.at(-1)).toBe('16:00');
    expect(t).toHaveLength(15); // 09:00 … 16:00 every 30 min; free quarters are thinned out
  });
  it('a booking blocks every overlapping start, an odd one too; touching ends do not', () => {
    // Amina 10:10–11:00 Algiers (09:10Z, 50 min), given as UTC instants (Review Focus 2); service 60 min
    const t = times(dayRoom({ ...base, candidates: [amina], specific: true, bookings: [booking('2030-01-08T09:10:00Z', 50, 'amina')] }));
    expect(t).toContain('09:00');      // 09:00–10:00 ends before 10:10
    expect(t).not.toContain('09:30');  // overlaps 10:10
    expect(t).not.toContain('10:30');  // inside the booking
    expect(t).toContain('11:00');      // starts when it ends
  });
  ```
  Add one test per remaining rule, with these assertions:
  - pending and confirmed bookings block; a `cancelled` one doesn't;
  - `hours: null` → `{ kind: 'closed' }`;
  - the chosen coiffeuse is off → `{ kind: 'absent' }`; with `specific: false` and nobody working → `{ kind: 'full' }`;
  - 150 min with `{ opens: 540, closes: 660 }` → `{ kind: 'full' }`;
  - today with `now = 2030-01-08T14:10:00Z` (15:10 Algiers) → the first time is `'15:30'`;
  - today with `now` after the last start → `full`;
  - a day before `now`'s date → `past`;
  - "Toutes": Amina busy 10:00–12:00, Leila free → `10:00` is offered with `stylistId: 'leila'`, and `09:00` with `'amina'` (the first in order);
  - quarter rule: free starts only at `13:15` (a 45-minute gap from 13:15 to 14:00, service 45) → `['13:15']`;
  - `roomLevel(4) === 'lots'`, `roomLevel(3) === 'few'`;
  - `monthGrid(new Date(2026, 10, 1))` has 35 cells, the first is Sunday 2026-11-01 (`inMonth: true`), the last is Saturday 2026-12-05 (`inMonth: false`);
  - `monthGrid(new Date(2026, 7, 1))` (August 2026 starts on a Saturday) has 42 cells.
  
  In `formatters.test.ts`: `formatMonthYear(new Date(2026,10,1),'fr') === 'Novembre 2026'`, the same with `'ar'` → `'نوفمبر 2026'`, and `weekdayInitials('fr')[0] === 'D'`.
- [ ] **Step 2: Run** `npx vitest run src/data/roomFinder.test.ts src/data/formatters.test.ts`. Expected: FAIL (module not found / exports missing).
- [ ] **Step 3: Implement** the interfaces above. Reuse `staffTimeOptions`, `salonMinutes`, `salonDate`, `minutesToTime`, `stylistWorks`, `toYmd`; don't re-implement them.
- [ ] **Step 4: Run** the same command, then `pnpm test && npx tsc -b`. Expected: all green.
- [ ] **Step 5: Commit** `feat(admin): room-finder rules — free start times per day for a service and coiffeuse`

---

### Task 2: The calendar sheet, without a filter (`DayPicker`)

**Files:** Create `src/components/admin/DayPicker.tsx`, `src/components/admin/DayPicker.test.tsx`. Modify `src/context/LanguageContext.tsx`.

**Interfaces:**
- Consumes: Task 1's `monthGrid`, `formatMonthYear`, `weekdayInitials`; `Sheet` (`title`, `onRequestClose`, `motion`) and `useSheetMotion()` (`{ state, dismiss(then) }`); `useAdminBookings(from, to)`, `useSalonHours`, `useClosedDates`, `useStylistDaysOff`, `useAllStylists`; `dayHours`, `dayOccupancy`, `algiersToday`.
- Produces:
  ```ts
  export interface RoomFilter { serviceId: string | null; stylistId: string | null } // null = Toutes
  export interface DayPickerProps {
    day: Date;                                   // the agenda's day: opening month + selection
    filter: RoomFilter;
    onFilterChange(f: RoomFilter): void;
    onJump(date: Date): void;                    // called after the slide-away
    onPickTime(p: { date: Date; time: string; stylistId: string; serviceId: string }): void; // Task 3
    onClose(): void;                             // called after the slide-away
  }
  export function DayPicker(props: DayPickerProps): JSX.Element;
  ```
- **Keys (FR / AR):**

  | Key | French | Arabic |
  |---|---|---|
  | `admin.picker.title` | `Choisir un jour` | `اختيار يوم` |
  | `admin.picker.prevMonth` | `Mois précédent` | `الشهر السابق` |
  | `admin.picker.nextMonth` | `Mois suivant` | `الشهر التالي` |
  | `admin.picker.pending` | `réservations à confirmer` | `حجوزات بانتظار التأكيد` |

  Day button names use `formatLongDate` + ` — ` + status, where the status is `t('schedule.closed')` or `{pct}%`, plus `, ` + `t('admin.picker.pending')` when there's a dot.

- [ ] **Step 1: Write the failing tests.** Mock the data hooks as `Schedule.test.tsx` does, with fake `Date` at `2030-01-08T07:00:00Z` and `day = new Date(2030, 0, 8)`:
  - Renders `dialog` named `Choisir un jour`, the heading `Janvier 2030`, and 7 initials starting with `D`.
  - The button `Mardi 8 janvier — 0%` has `aria-pressed="true"`. Closed Mondays (`eleganceHours[1] === null`) are `disabled`, with names ending `— Fermé`.
  - With an online pending booking on 2030-01-10 (`startsAt > now`), the button for Thursday 10 has a name containing `réservations à confirmer`.
  - The `Mois suivant` button shows `Février 2030` and calls `useAdminBookings` with Feb 1 to Feb 28.
  - Clicking `Vendredi 11 janvier — 0%` calls `onJump(new Date(2030, 0, 11))` (equality via `toYmd`) and not `onClose`.
  - The neighbouring-month cell `Samedi 2 février` (from the January grid) is enabled and jumps.
  - Escape calls `onClose`.
- [ ] **Step 2: Run** `npx vitest run src/components/admin/DayPicker.test.tsx`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `DayPicker` (no-filter mode only; the filter pickers come in Task 3):
  - month state starts at `day`'s month; fetch bookings for that month's first to last day;
  - each in-month cell shows the date number, the fill bar (same markup as `WeekStrip`'s bar, `dayOccupancy(bookings, d, activeStylists.length, dayHours(...))`), the ring for today, the corner dot (`absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-500`) and selection fill (`bg-rose-800 text-cream-50`);
  - a tap on any enabled cell calls `motion.dismiss(() => onJump(date))`;
  - every grid button and the month arrows use `tap`; RTL comes from the document direction (flip the arrow icons with `rtl:rotate-180`).
- [ ] **Step 4: Run** the test file, then `pnpm test && npx tsc -b`. Expected: all green.
- [ ] **Step 5: Commit** `feat(admin): month calendar to jump to any day, with how full each day is`

---

### Task 3: Filter mode: service, coiffeuse, counts, times

**Files:** Modify `src/components/admin/DayPicker.tsx`, `DayPicker.test.tsx`, `src/context/LanguageContext.tsx`.

**Interfaces:**
- Consumes: Task 1's `dayRoom`, `roomLevel`, `FreeStart`; `useAllServices`; `countText`; Task 2's props.
- **Keys (FR / AR):**

  | Key | French | Arabic |
  |---|---|---|
  | `admin.picker.all` | `Toutes` | `الكل` |
  | `admin.picker.full` | `complet` | `محجوز` |
  | `admin.picker.absent` | `absente` | `غائبة` |
  | `admin.picker.times` | `Libre le {day} à :` | `متاح يوم {day} على الساعة:` |
  | `admin.picker.viewDay` | `Voir la journée` | `عرض اليوم` |
  | `admin.picker.slots.one` | `{n} créneau` | `موعد واحد متاح` |
  | `admin.picker.slots.other` | `{n} créneaux` | `{n} موعد متاح` |
  | `admin.picker.slots.two` | | `موعدان متاحان` |
  | `admin.picker.slots.few` | | `{n} مواعيد متاحة` |
  | `admin.picker.slots.many` | | `{n} موعدًا متاحًا` |

  The pickers reuse `admin.sheet.service` ("Prestation") and `admin.sheet.stylist` ("Coiffeuse") as their labels.

- [ ] **Step 1: Write the failing tests** (same mocks; services from fixtures, `coupe-femme` is 60 min):
  - Two `select`s labelled `Prestation` and `Coiffeuse`. Each lists `Toutes` plus **active** items only (a hidden service or coiffeuse is absent).
  - Choosing `Coupe & Brushing` calls `onFilterChange({ serviceId: 'coupe-femme', stylistId: null })`. Re-rendered with that filter, the button for Tuesday 8 has a name containing `créneaux`, and the visible count has class `bg-sage-100` (≥ 4) or `bg-amber-100` (1–3).
  - With `stylistId: 'amina'` and her day off on 2030-01-09: that day's name contains `absente`. A day filled up with her bookings contains `complet`.
  - With a filter, clicking a day does **not** call `onJump`. It shows `Libre le Jeudi 10 janvier à :` and time buttons, and clicking `11:00` calls `onPickTime({ date: <Jan 10>, time: '11:00', stylistId: 'amina', serviceId: 'coupe-femme' })` after the slide-away. Run with no `matchMedia` in tests, so it's immediate.
  - `Voir la journée` calls `onJump` with that day.
  - While the month's bookings are loading (`isLoading: true, data: undefined`), no day says `complet`.
  - **Review Focus 5:** `filter = { serviceId: 'gone', stylistId: 'hidden-one' }`, where neither is active, shows plain fill bars (no counts), and no day says `absente`.
- [ ] **Step 2: Run** `npx vitest run src/components/admin/DayPicker.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement:**
  - An effective filter: a service or stylist id not in the active lists → `null`.
  - With a service: each cell shows the count pill (`roomLevel` → `bg-sage-100 text-sage-800` / `bg-amber-100 text-amber-800`) or the `complet` / `absente` label, from `dayRoom` with `now = new Date()` and `candidates` = [chosen] or every active stylist (`specific` accordingly).
  - Tapping a day selects it and shows its times (`starts` as `tap` buttons) and the `Voir la journée` link under the grid.
  - A time tap calls `motion.dismiss(() => onPickTime(...))`.
- [ ] **Step 4: Run** the test file, then `pnpm test && npx tsc -b`. Expected: all green.
- [ ] **Step 5: Commit** `feat(admin): find room for a service and coiffeuse in the calendar`

---

### Task 4: Wire it into the agenda, with a pre-filled booking

**Files:** Modify `src/components/Schedule.tsx`, `src/components/Schedule.test.tsx`, `src/components/admin/BookingSheet.tsx`, `src/components/admin/BookingSheet.test.tsx`, `src/context/LanguageContext.tsx`.

**Interfaces:**
- Consumes: Task 2/3's `DayPicker`, `RoomFilter`.
- Changes: `SheetState` add mode becomes `{ mode: 'add'; stylistId: string; date: Date; time: string; serviceId?: string }`, and `initialForm` uses `state.serviceId ?? ''`.
- Key: the day bar's date button uses `aria-label = formatLongDate(day) + ' — ' + t('admin.picker.title')`, so its name contains `Choisir un jour`.

- [ ] **Step 1: Write the failing tests.**
  - `BookingSheet`: `renderSheet({ mode: 'add', stylistId: 'leila', date: tuesday, time: '11:00', serviceId: 'manucure' })` → `Prestation` has value `manucure`, `Coiffeuse` has `leila` (not replaced by her usual service's defaults), and `Heure` has `11:00`.
  - `Schedule`:
    - clicking the button whose name contains `Choisir un jour` opens the dialog `Choisir un jour`;
    - clicking `Jeudi 10 janvier — 0%` closes it and the day bar shows `Jeudi 10 janvier`;
    - with a filter chosen in the picker (`Prestation` → `Coupe & Brushing`), clicking Jan 10 then `10:00` opens the dialog `Nouveau rendez-vous`, with `Prestation` = `coupe-femme`, `Date` = `2030-01-10` and `Heure` = `10:00`;
    - reopening the picker keeps `Coupe & Brushing` selected.
- [ ] **Step 2: Run** `npx vitest run src/components/Schedule.test.tsx src/components/admin/BookingSheet.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement:**
  - `Schedule`: the date `span` becomes a `tap` button (same text styles; `whitespace-nowrap` kept) that opens the picker.
  - State: `showPicker`, `roomFilter: RoomFilter` (initial `{ serviceId: null, stylistId: null }`).
  - `onJump` → `setShowPicker(false); setDay(d)`.
  - `onPickTime` → `setShowPicker(false); setDay(date); setSheet({ mode: 'add', stylistId, date, time, serviceId })`.
  - `BookingSheet`: the `serviceId` pre-fill as specified.
- [ ] **Step 4: Run** `pnpm test && npx tsc -b && pnpm build`. Expected: all green, build OK.
- [ ] **Step 5: Browser check:** local stack with the dev server, logged in as the owner, at 360 px and 1280 px, FR and AR:
  - the date button opens the calendar, which slides;
  - the grid fits 360 px without sideways scroll, and in Arabic the columns run right to left starting with ح;
  - counts and labels are readable;
  - tapping a time slides the calendar away and the pre-filled form up.
- [ ] **Step 6: Commit** `feat(admin): tap the date to find room and book from the calendar`

---

## Self-review notes

- **Spec coverage:**

  | Spec goal | Task |
  |---|---|
  | Goal 1 (jump) | Tasks 2 and 4 |
  | Goal 2 (fill bars, closed, today, dot) | Task 2 |
  | Goal 3 (filter counts and labels) | Tasks 1 and 3 |
  | Goal 4 (times, pre-fill) | Tasks 3 and 4 |
  | Goal 5 (months) | Task 2 |
  | Non-goals and anti-goals | Global Constraints and Review Focus |

  The "details settled" section is all in Global Constraints or the tasks.
- **Types:** `RoomFilter`, `DayPickerProps`, `FreeStart`, `DayRoom` and `RoomInput` are defined once (Tasks 1 and 2) and used unchanged in Tasks 3 and 4.
