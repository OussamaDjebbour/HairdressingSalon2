# SP3 Phase 2: Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a client books on the site, the owner's phone shows a notification ("Nouvelle réservation: Nour, Samedi 7 novembre à 10:00 …"), and tapping it opens that booking in `/admin`.

**Architecture:**
- **Subscriptions:** the admin becomes an installable web app (manifest + service worker). The owner subscribes her device with Web Push (VAPID), and the subscription is stored in `private.push_subscriptions`.
- **Trigger:** an `AFTER INSERT` trigger on online bookings calls one SQL helper. The helper reads the subscriptions and two Vault secrets, then fires an **asynchronous** `pg_net` POST to a stateless Edge Function `notify-booking`. Because the POST is async, a slow or broken notification can never slow down or fail the client's booking.
- **Sending:** the Edge Function builds the localized message for each subscription, sends the pushes, and prunes dead subscriptions through a `service_role`-only RPC.

**Tech Stack:** Supabase (Postgres, `pg_net`, Vault, Edge Functions on Deno), Web Push / VAPID, service worker, React 18 + TS, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-11-06-owner-schedule-design.md`, goal 4 (phase 2). Phase 1 plan: `docs/superpowers/plans/2026-11-06-sp3-owner-schedule.md`.

## Global Constraints

- The branch `feat/sp3-push-notifications` stacks on `feat/sp3-owner-schedule` (PR #5). Rebase onto `origin/main` once #5 is merged.
- The spec requires all of the following:
  - only bookings made **on the site** notify her (`source = 'online'`);
  - free, with no outside account for her (no WhatsApp Business API, no SMS);
  - works on Android and iPhone (iPhone only once the site is added to the home screen, iOS 16.4+);
  - the admin guides her through enabling it in plain French and Arabic, including the iPhone "add to home screen" step;
  - **a failed notification must never fail or slow down the client's booking**;
  - tapping the notification opens that booking.
- No new npm dependencies in `package.json`. The Edge Function may import one push library through a Deno specifier (`npm:` or `jsr:`), chosen in Task 1.
- Project conventions from `CLAUDE.md` apply:
  - every string goes through `t()` (FR + AR);
  - logical CSS;
  - design tokens;
  - lucide icons only;
  - SECURITY DEFINER functions with `set search_path = ''`;
  - staff RPCs raise `not_authorized`;
  - new migrations only (`20261107120000_push_notifications.sql`).
- Secrets never go in git: the VAPID private key, `NOTIFY_SECRET`, and the Vault values. The VAPID **public** key is public and goes in `VITE_VAPID_PUBLIC_KEY`.
- The live setup steps are run by the user (Task 9): `supabase secrets set`, `supabase functions deploy`, one SQL snippet for Vault, and the Vercel env var.

## Review Focus

1. **Notification plumbing broken or not configured** (Vault secrets missing, function URL wrong, function down): the client's booking still succeeds immediately. → Task 2 pgTAP: `online insert works with no vault secrets`, and `online insert queues one async request`.
2. **A subscription that has expired** (browser data cleared, app reinstalled; the push service answers 404/410): it is deleted, and her other devices still get the notification. → Task 3 test `prunes 404/410 endpoints and still sends to the others`.
3. **Owner on two devices, or re-enabling on the same device:** both devices receive the notification, and re-subscribing doesn't create duplicates. → Task 2 pgTAP: `same endpoint upserts`, and `two endpoints for one user`.
4. **The Edge Function runs in UTC:** the time in the notification is salon time (09:00Z → "10:00"), in the language she enabled notifications with. → Task 3 test `uses Algiers time and the subscription language`.
5. **Tapping a notification for a booking in another week, or while `/admin` is already open:** the right day loads and the booking's sheet opens. → Task 7 test `deep link to another week opens that booking`, and Task 5 test `notificationclick focuses an open admin tab`.

---

### Task 1: Spike — push library and local plumbing (throwaway, findings only)

**Files:** none committed except the ledger notes (scratch function under `supabase/functions/_spike/`, deleted at the end of the task).

**Questions to answer, and record as ledger lines `Task 1: Finding: …`:**
1. **Library.** In an Edge Function served by `supabase functions serve`, which of these sends a VAPID web push successfully?
   - **A:** `npm:web-push@3.6.7` (`webpush.setVapidDetails` + `sendNotification`);
   - **B:** `jsr:@negrel/webpush`.

   Test against a real subscription made in Chrome on `http://localhost` (service workers are allowed on localhost), where a push service response of 201 counts as success. Try A first.
2. **VAPID keys:** the command that generates them (for example, `npx --yes web-push generate-vapid-keys --json`). It must not add dependencies.
3. **Local URL:** the URL at which the **database container** reaches the local function, so that `pg_net` can call it. Try `http://host.docker.internal:54321/functions/v1/<name>`, then `http://kong:8000/functions/v1/<name>`. Check the result in `net._http_response`.
4. **Queue introspection:** the `pg_net` queue table and columns pgTAP can inspect after `net.http_post` in a rolled-back transaction (expected: `net.http_request_queue` with `url`, `headers`, `body bytea`).
5. **Notification permission:** can the chrome-devtools browser accept the permission prompt? If not, Task 9 asks the user to click "Autoriser" once.

- [ ] **Step 1:** Create the scratch function and a scratch page (`public/_spike.html` registering a minimal sw), subscribe, and send. Record findings 1–5.
- [ ] **Step 2:** Delete the scratch files. If neither library works, **stop and report**: the architecture needs another sender.
- [ ] **Step 3:** No commit. The task is complete when the five `Finding:` lines are in the ledger (`task-done … -- sh -c 'grep -c "Task 1: Finding" <ledger>'` → 5).

---

### Task 2: Database — subscriptions, staff RPCs, trigger → async POST

**Files:**
- Create: `supabase/migrations/20261107120000_push_notifications.sql`
- Test: `supabase/tests/database/08_push.test.sql`

**Interfaces:**
- Produces:
  - `create extension if not exists pg_net with schema extensions;`
  - `private.push_subscriptions(endpoint text primary key, user_id uuid not null references auth.users(id) on delete cascade, p256dh text not null, auth text not null, lang text not null check (lang in ('fr','ar')), created_at timestamptz not null default now())`
  - `public.admin_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_lang text) returns void` — staff only. Upserts on `endpoint`, setting `user_id = auth.uid()`. Raises `invalid_subscription` (P0001) if any of the three keys is empty. `lang` falls back to `fr`.
  - `public.admin_delete_push_subscription(p_endpoint text) returns void` — staff only. Deletes only the caller's own row.
  - `public.admin_send_test_push() returns void` — staff only. Calls `private.post_push('test', null, auth.uid())`.
  - `public.push_prune_subscriptions(p_endpoints text[]) returns void` — executable by `service_role` **only**.
  - `private.post_push(p_kind text, p_booking jsonb, p_user uuid default null) returns void` — SECURITY DEFINER, `search_path = ''`:
    - reads `vault.decrypted_secrets` named `notify_booking_url` and `notify_booking_secret`; if either is missing, or there are no matching subscriptions, it returns without doing anything;
    - otherwise calls `net.http_post(url, body := jsonb_build_object('kind', p_kind, 'booking', p_booking, 'subscriptions', <array of {endpoint,p256dh,auth,lang}>), headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', <secret>))`;
    - the whole body is wrapped in `exception when others then raise warning …; return;`.
  - Trigger `bookings_notify_online` `after insert on private.bookings for each row when (new.source = 'online')` → `private.notify_new_booking()`. It builds `p_booking = {id, client_name, starts_at, service_name (services.name jsonb), stylist_name}` and calls `post_push('new_booking', …)`.

- [ ] **Step 1: Write `08_push.test.sql`.** Reuse the staff/non-staff `act_as` setup from `04_admin.test.sql`. Assertions:
  - anon → 42501 on the three admin RPCs and on `push_prune_subscriptions`; non-staff → `not_authorized`; authenticated staff → 42501 on `push_prune_subscriptions`.
  - **`same endpoint upserts`:** saving the same endpoint twice with a different `p256dh` → 1 row, with the latest key.
  - **`two endpoints for one user`:** → 2 rows. `invalid_subscription` on an empty `p_auth`.
  - `admin_delete_push_subscription` removes the caller's own row and leaves another staff user's row alone.
  - **`online insert works with no vault secrets`:** `lives_ok` on an online booking insert. The queue count in the Finding 4 table is unchanged.
  - **`online insert queues one async request`:**
    - `select vault.create_secret('http://example.invalid/notify','notify_booking_url'), vault.create_secret('s3cret','notify_booking_secret')`, plus one subscription;
    - insert an online booking → the queue count +1;
    - the queued body's `kind` = `new_booking`, its `booking.client_name` is correct, `jsonb_array_length(subscriptions)` = 1, and the header `x-notify-secret` = `s3cret`.
  - **`staff booking does not notify`:** an insert with `source = 'staff'` → the queue count is unchanged.
  - **`test push targets only the caller`:** with two users' subscriptions, `admin_send_test_push()` as staff → the queued body has 1 subscription, and `kind` = `test`.

- [ ] **Step 2:** `supabase test db` → 08 FAILs.
- [ ] **Step 3: Write the migration.** Revoke from `public, anon, authenticated` (and re-run `revoke execute on all functions in schema private …`). Grant the three admin RPCs to `authenticated`, and `push_prune_subscriptions` to `service_role`.
- [ ] **Step 4:** Run `supabase db reset && supabase test db` → 01–08 pass. Run `supabase db lint --level warning` → no new warnings.
- [ ] **Step 5: Commit** — `feat(db): push subscriptions and async notify trigger for online bookings`

---

### Task 3: Notification content and send logic (pure, shared with the Edge Function)

**Files:**
- Create: `supabase/functions/_shared/notify.ts`
- Test: `supabase/functions/_shared/notify.test.ts` (run by Vitest; the module must have **no** Deno-only imports)

**Interfaces:**
- Produces (types and functions):
  - `type Lang = 'fr' | 'ar'`
  - `interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string; lang: Lang }`
  - `interface BookingPayload { id: string; client_name: string; starts_at: string; service_name: Record<Lang, string>; stylist_name: string }`
  - `interface NotifyRequest { kind: 'new_booking' | 'test'; booking: BookingPayload | null; subscriptions: PushSubscriptionRow[] }`
  - `interface PushMessage { title: string; body: string; url: string; tag: string }`
  - `buildPushMessage(kind: NotifyRequest['kind'], booking: BookingPayload | null, lang: Lang): PushMessage`
  - `handleNotify(req: NotifyRequest, deps: { send(sub: PushSubscriptionRow, msg: PushMessage): Promise<number>; prune(endpoints: string[]): Promise<void> }): Promise<{ sent: number; failed: number; pruned: string[] }>`
- Behaviour of `handleNotify`:
  - It sends every subscription its message, in that subscription's language.
  - `send` resolves to an HTTP status. 2xx counts as sent; 404/410 marks the subscription for pruning; any other status, or a thrown error, counts as failed.
  - `prune` is called once with the dead endpoints, and only when there are any.
- Copy, exact, with date and time in **Africa/Algiers**. The date format matches the app's `formatLongDate`; the day and month names are copied into this module, because the function can't import `src/`.
  - new_booking fr: title `Nouvelle réservation`, body `{name} · {Jour} {d} {mois} à {HH:MM}\n{service} · {stylist}`
  - new_booking ar: title `حجز جديد`, body `{name} · {يوم} {d} {شهر} على الساعة {HH:MM}\n{service} · {stylist}`
  - test fr: `Notifications activées` / `Vous recevrez une alerte à chaque nouvelle réservation en ligne.`
  - test ar: `تم تفعيل الإشعارات` / `ستتلقين تنبيهًا عند كل حجز جديد عبر الموقع.`
  - `url`: `/admin?day={YYYY-MM-DD salon date}&booking={id}` for a new booking, `/admin` for test.
  - `tag`: `booking-{id}` / `test`.

- [ ] **Step 1: Write failing tests:**
  - **`uses Algiers time and the subscription language`:** booking `starts_at: '2026-11-07T09:00:00Z'`, Nour, Manucure & Vernis / مانيكير وطلاء الأظافر, Sara.
    - fr → `{ title: 'Nouvelle réservation', body: 'Nour · Samedi 7 novembre à 10:00\nManucure & Vernis · Sara', url: '/admin?day=2026-11-07&booking=b1', tag: 'booking-b1' }`.
    - ar → the title is `حجز جديد`, and the body contains `السبت 7 نوفمبر على الساعة 10:00`.
  - **Late-evening UTC still uses the salon date:** `'2026-11-07T23:30:00Z'` → url `day=2026-11-08` (00:30 in Algiers).
  - **The test message** in fr and ar, with url `/admin`.
  - **`prunes 404/410 endpoints and still sends to the others`:** 3 subscriptions, and `send` resolves 201, 410, 500 → `{ sent: 1, failed: 1, pruned: ['<the 410 endpoint>'] }`, with `prune` called once with that list.
  - **A thrown `send`** counts as failed, and the other subscriptions are still sent.
  - **No dead endpoints** → `prune` is not called.
- [ ] **Step 2:** `pnpm vitest run supabase/functions/_shared` → FAIL.
- [ ] **Step 3: Implement** `notify.ts`.
- [ ] **Step 4:** Run the same command → PASS. Then `pnpm test` → the full suite passes.
- [ ] **Step 5: Commit** — `feat(push): notification copy and send/prune logic`

---

### Task 4: Edge Function `notify-booking`

**Files:**
- Create: `supabase/functions/notify-booking/index.ts`, `supabase/functions/.env.example`
- Modify: `supabase/config.toml` (`[functions.notify-booking] verify_jwt = false`), `.gitignore` (`supabase/functions/.env`)

**Interfaces:**
- Consumes: `handleNotify`, `NotifyRequest` (Task 3); the push library from Task 1; the env vars `NOTIFY_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and the auto-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces `POST /functions/v1/notify-booking`:
  - wrong or missing `x-notify-secret` (constant-time compare) → **401**;
  - anything other than POST → **405**;
  - a malformed body → **400**;
  - otherwise **200** with `handleNotify`'s result as JSON;
  - `deps.send` uses the library with a 30-second TTL and the `JSON.stringify(PushMessage)` payload;
  - `deps.prune` calls `rpc('push_prune_subscriptions', { p_endpoints })` with a service-role client (`npm:@supabase/supabase-js@2`).

- [ ] **Step 1: Write the failing smoke checks** as a script `supabase/functions/notify-booking/smoke.sh`, run against `supabase functions serve --env-file supabase/functions/.env`:
  - no secret → 401;
  - right secret with `{"kind":"test","booking":null,"subscriptions":[]}` → 200 and `{"sent":0,"failed":0,"pruned":[]}`;
  - right secret with a body of `not json` → 400.
- [ ] **Step 2:** Run it before the function exists → it fails (404 from the gateway).
- [ ] **Step 3:** Implement `index.ts`, plus `.env.example` listing the five variables with placeholder values.
- [ ] **Step 4:** Run `smoke.sh` → all three pass. Run `pnpm test` → still green (Vitest must not pick up `index.ts`).
- [ ] **Step 5: Commit** — `feat(push): notify-booking edge function`

---

### Task 5: Installable admin — manifest, icons, service worker

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png` (180×180), `public/icons/icon.svg` (the source: the scissors mark on `rose-900`, matching the admin header)
- Modify: `index.html` (`<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="Élégance">`)
- Test: `src/test/sw.test.ts`

**Interfaces:**
- Produces:
  - **Manifest:**
    - `name: "Élégance — Espace salon"`, `short_name: "Élégance"`;
    - `start_url: "/admin"`, `scope: "/"`, `display: "standalone"`;
    - `background_color` / `theme_color`: the hex values of `cream-50` / `rose-900` from `tailwind.config.js`, copied with a comment in the PR (a manifest can't reference tokens);
    - the icons above, with `purpose: "any maskable"` on the 512 icon.
  - **`sw.js`** (plain JS, no imports):
    - `push`: parses the JSON `PushMessage` and calls `self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } })`;
    - `notificationclick`: closes the notification. If a window client with a path starting `/admin` exists, it calls `focus()` and `navigate(url)`; otherwise `clients.openWindow(url)`;
    - `install` → `skipWaiting()`, `activate` → `clients.claim()`;
    - **no fetch caching** (not an offline app).

- [ ] **Step 1: Write failing tests.** Load `public/sw.js` text and evaluate it with a fake `self`/`clients` that records `addEventListener` handlers:
  - **`push shows the notification`:** payload `{title:'Nouvelle réservation', body:'…', url:'/admin?day=2026-11-07&booking=b1', tag:'booking-b1'}` → `showNotification` is called with that title, and `data.url` equals the url. The handler passes a promise to `event.waitUntil`.
  - **`notificationclick focuses an open admin tab`:** clients `[{url:'https://x/admin', focus, navigate}]` → `focus` and `navigate('/admin?day=…')` are called, and `openWindow` is not.
  - **`notificationclick opens a window when none is open`:** → `openWindow(url)`.
- [ ] **Step 2:** `pnpm vitest run src/test/sw.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Generate the PNGs from `icon.svg` with a tool already on the machine (`qlmanage -t -s <size>`, or a headless-Chrome screenshot). Record which one in the ledger.
- [ ] **Step 4:** Run `pnpm vitest run src/test/sw.test.ts` → PASS. `pnpm build` → `dist/` contains `sw.js`, `manifest.webmanifest` and `icons/`.
- [ ] **Step 5: Commit** — `feat(push): installable admin with service worker`

---

### Task 6: Client push library and the "Notifications" card

**Files:**
- Create: `src/lib/push.ts`, `src/components/admin/NotificationsCard.tsx`
- Modify: `src/components/Schedule.tsx` (render the card above the week strip), `src/context/LanguageContext.tsx`, `.env.example` (`VITE_VAPID_PUBLIC_KEY=`)
- Test: `src/lib/push.test.ts`, `src/components/admin/NotificationsCard.test.tsx`

**Interfaces:**
- Consumes: the RPCs from Task 2; `/sw.js` (Task 5); `import.meta.env.VITE_VAPID_PUBLIC_KEY`.
- Produces (`push.ts`):
  - `type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'`
  - `getPushState(): Promise<PushState>`:
    - `needs-install` when the device is iOS (`/iPad|iPhone|iPod/` or iPadOS: `MacIntel` with touch points) and not standalone (`navigator.standalone !== true` and `!matchMedia('(display-mode: standalone)').matches`);
    - `unsupported` when `serviceWorker`, `PushManager` or `Notification` is missing, or the VAPID key is empty;
    - `denied` when `Notification.permission === 'denied'`;
    - `on` when a registration has a subscription;
    - else `off`.
  - `enablePush(lang: Lang): Promise<PushState>` — registers `/sw.js`, requests permission (→ `denied` if refused), subscribes with `userVisibleOnly: true` and the VAPID key (base64url → `Uint8Array`), then calls `admin_save_push_subscription` with the endpoint and both keys (base64url of `getKey('p256dh')` / `getKey('auth')`) → `on`.
  - `disablePush(): Promise<PushState>` — unsubscribes, calls `admin_delete_push_subscription` → `off`.
  - `sendTestPush(): Promise<void>` — calls `admin_send_test_push`.
  - `usePushState()` — a React hook: `{ state, enable, disable, test, busy, error }`.
- **`NotificationsCard`** (no props) is always visible and compact. It renders by state:
  - `needs-install` → the title plus numbered steps `admin.push.iosStep1..3`;
  - `off` → a short explanation plus an **Activer** button;
  - `denied` → `admin.push.denied`;
  - `unsupported` → `admin.push.unsupported`;
  - `on` → `admin.push.on` plus **Envoyer un test** and **Désactiver** links;
  - `error` → `admin.error.unknown`.
- New i18n keys (fr / ar):
  - `admin.push.title` = `Notifications des réservations` / `إشعارات الحجوزات`
  - `admin.push.offText` = `Recevez une alerte sur ce téléphone à chaque réservation en ligne.` / `تلقَّي تنبيهًا على هذا الهاتف عند كل حجز عبر الموقع.`
  - `admin.push.enable` = `Activer` / `تفعيل`
  - `admin.push.on` = `Activées sur cet appareil.` / `مفعّلة على هذا الجهاز.`
  - `admin.push.test` = `Envoyer un test` / `إرسال تجربة`
  - `admin.push.testSent` = `Test envoyé — il doit arriver dans quelques secondes.` / `تم إرسال التجربة — ستصل خلال ثوانٍ.`
  - `admin.push.disable` = `Désactiver` / `إيقاف`
  - `admin.push.denied` = `Les notifications sont bloquées. Autorisez-les dans les réglages du navigateur pour ce site.` / `الإشعارات محظورة. اسمحي بها من إعدادات المتصفح لهذا الموقع.`
  - `admin.push.unsupported` = `Ce navigateur ne permet pas les notifications.` / `هذا المتصفح لا يدعم الإشعارات.`
  - `admin.push.iosTitle` = `Sur iPhone : ajoutez d’abord le site à l’écran d’accueil` / `على الآيفون: أضيفي الموقع أولاً إلى الشاشة الرئيسية`
  - `admin.push.iosStep1` = `Touchez le bouton Partager dans Safari.` / `اضغطي على زر المشاركة في سفاري.`
  - `admin.push.iosStep2` = `Choisissez « Sur l’écran d’accueil ».` / `اختاري «إضافة إلى الشاشة الرئيسية».`
  - `admin.push.iosStep3` = `Ouvrez Élégance depuis la nouvelle icône, puis revenez ici.` / `افتحي Élégance من الأيقونة الجديدة ثم عودي إلى هنا.`

- [ ] **Step 1: Write failing tests:**
  - **`push.test.ts`** (fake `navigator.serviceWorker`, `PushManager`, `Notification`, `matchMedia`; mock `../lib/supabase`; stub the env key via `vi.stubEnv`):
    - iPhone UA, not standalone → `needs-install`;
    - permission `denied` → `denied`;
    - no subscription → `off`;
    - **`enablePush saves the subscription`:** permission granted, and subscribe returns endpoint `https://push.example/abc` with keys → rpc `admin_save_push_subscription` called with `{ p_endpoint: 'https://push.example/abc', p_p256dh: <base64url>, p_auth: <base64url>, p_lang: 'ar' }`, and it resolves `on`;
    - permission refused → `denied`, and no rpc;
    - `disablePush` → `unsubscribe` called, rpc `admin_delete_push_subscription` with the endpoint → `off`.
  - **`NotificationsCard.test.tsx`** (mock `../../lib/push`'s `usePushState`):
    - `off` → an **Activer** button that calls `enable`;
    - `needs-install` → the three iOS steps are visible;
    - `on` → **Envoyer un test** calls `test`, then shows `admin.push.testSent`.
- [ ] **Step 2:** `pnpm vitest run src/lib/push.test.ts src/components/admin/NotificationsCard.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, and add the card to `Schedule.tsx` (between the pending badge and the week strip).
- [ ] **Step 4:** Run the two files, then `pnpm test` and `pnpm build` → all pass.
- [ ] **Step 5: Commit** — `feat(push): enable notifications from the admin, with iPhone guidance`

---

### Task 7: Deep link — the notification opens the booking

**Files:**
- Modify: `src/components/Schedule.tsx`, `src/components/Schedule.test.tsx`

**Interfaces:**
- Consumes: the URL `/admin?day=YYYY-MM-DD&booking=<id>` (Task 3), and `useSearchParams` from react-router.
- Produces:
  - On load, a valid `day` sets the selected day.
  - Once the week's bookings contain `booking`, the sheet opens in edit mode for it.
  - Both params are then removed (`setSearchParams({}, { replace: true })`) so a refresh doesn't reopen it.
  - An unknown booking id is ignored: the day still loads, and nothing opens.

- [ ] **Step 1: Write failing tests** in `Schedule.test.tsx`. Wrap the render in a `MemoryRouter` with `initialEntries`, and keep the existing fake date of 2030-01-08:
  - **`deep link to another week opens that booking`:** `/admin?day=2030-01-17&booking=p9`, with the week mock returning a booking `p9` on 2030-01-17 → the day picker shows `Jeudi 17 janvier`, and the dialog `Rendez-vous` is open.
  - **`unknown booking id just opens the day`:** → `Jeudi 17 janvier`, and no dialog.
- [ ] **Step 2:** `pnpm vitest run src/components/Schedule.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Check that `AdminPage` renders inside the router (it does: `App.tsx` routes).
- [ ] **Step 4:** Run the file, then `pnpm test` → pass.
- [ ] **Step 5: Commit** — `feat(push): notification deep link opens the booking`

---

### Task 8: Docs and setup notes

**Files:**
- Modify: `CLAUDE.md` (a "Notifications" section: the flow, the files, local setup, and that the live secrets are set by the user), `.env.example`
- Create: `docs/notifications-setup.md`, the exact live setup steps for the user:
  1. generate the VAPID keys (command from Task 1);
  2. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:… NOTIFY_SECRET=…`;
  3. `supabase functions deploy notify-booking --no-verify-jwt`;
  4. the SQL to run once in the dashboard's SQL editor: `select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-booking','notify_booking_url'); select vault.create_secret('<NOTIFY_SECRET>','notify_booking_secret');`;
  5. Vercel env `VITE_VAPID_PUBLIC_KEY`, then redeploy;
  6. on her phone: open `/admin`, (iPhone) add to the home screen, open it from the icon, tap **Activer**, then **Envoyer un test**.

  Also how to rotate `NOTIFY_SECRET`: update the secret, then `vault.update_secret`.

- [ ] **Step 1:** Write both docs. Check that every command and name matches Tasks 1–6: `grep` for `notify_booking_url`, `NOTIFY_SECRET` and `notify-booking` across the repo, and confirm the names match.
- [ ] **Step 2:** `pnpm test`, `pnpm build` → pass.
- [ ] **Step 3: Commit** — `docs: push notification setup`

---

### Task 9: End-to-end check on the local stack

- [ ] **Step 1: Database.** Run `supabase db reset`, `supabase test db` (01–08) and lint.
- [ ] **Step 2: Function and secrets.** Generate local VAPID keys into `supabase/functions/.env` (git-ignored), and start `supabase functions serve --env-file supabase/functions/.env`. In the local DB, create the two Vault secrets with the local function URL (Finding 3) and the local `NOTIFY_SECRET`.
- [ ] **Step 3: App.** Run `VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… VITE_VAPID_PUBLIC_KEY=<local public key> pnpm dev`. Log in as a local-only staff user and tap **Activer**. If the browser can't accept the permission prompt (Finding 5), ask the user to click "Autoriser" once.
- [ ] **Step 4: Expected results.**
  - **Envoyer un test:** `net._http_response` shows 200 with `{"sent":1,…}`.
  - **Online booking:** a booking via the public `create_booking` → a 200 with `sent:1`, and the notification is shown. Check it with a temporary `console.log` in the service worker, or through the user's eyes.
  - **Staff booking** → no request is queued.
  - **Deep link:** open the notification's url → the booking's sheet opens.
  - **Function stopped:** with the function stopped, an online booking still succeeds immediately.
- [ ] **Step 5: Clean up.** Run `supabase db reset`, stop the servers, and delete the local `.env`. Then the rollout (the user runs it) is `docs/notifications-setup.md` after PR #5 is merged and the site is on Vercel. Testing on a real phone needs the HTTPS site.
