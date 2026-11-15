# Service Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Réglages → Prestations the owner can add, replace or remove a service's photo from her phone; it shows on the service's card in "Nos services".

**Architecture:** The browser shrinks the picked photo, uploads it to the public `salon-photos` bucket under `<salon>/uploads/<uuid>.jpg` (allowed by new `storage.objects` policies scoped with `private.my_salon()` / `private.my_role()`), then a new `security definer` RPC `admin_set_service_photo` points the service at that path after checking it. `services.image` holds a storage path for owner uploads (full URLs stay as they are); `fetchServices` turns paths into public URLs with `VITE_SUPABASE_URL`.

**Tech Stack:** Postgres/Supabase (migrations, storage RLS, pgTAP), React 18 + TypeScript, React Query, react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-service-photos-design.md`

## Global Constraints

- Every user-facing string goes through `t()` with **both** `fr` and `ar` keys in `src/context/LanguageContext.tsx`; logical CSS properties only (`ms-`/`me-`, `text-start`…); existing classes (`card`, `btn-*`, `label`) and Tailwind tokens, no raw hex.
- Icons: lucide-react only. No new npm packages.
- The browser never holds the service-role key; `services` gets no new grants — writes go through `security definer` RPCs scoped by `private.my_salon()`.
- An id from another salon behaves exactly like one that doesn't exist (`not_found`); `demo` role → `demo_disabled`.
- Never edit an already-pushed migration; new migration file only. Don't end it with a blanket `revoke … on all functions in schema private`.
- New public function: isolation tests in `supabase/tests/database/10_isolation.test.sql` **and** registered in `11_guard.test.sql`.
- Owner uploads live only under `<salon_id>/uploads/`; files elsewhere in the bucket (the launch script's `<salon_id>/<file>`) are never written or deleted by the app.
- Old uploads are deleted after a replace/remove **except on demo salons** (`salons.demo`).
- Resize: longest side ≤ **1600 px**, JPEG quality **0.82**; refuse originals over **25 MB** (`25 * 1024 * 1024` bytes) and non-images.
- Nothing changes on the public page until **Enregistrer**; Annuler leaves the stored photo untouched.
- The photo code lives in the lazily loaded admin; `pnpm check:bundle` must pass.

## Review Focus

1. **A portrait photo from a phone shows sideways.** EXIF orientation must be applied → test in Task 3 (`createImageBitmap` called with `imageOrientation: 'from-image'`).
2. **Retry after "service saved, photo step failed" creates a duplicate service.** The retry must update the service that was just created → test in Task 5.
3. **A transparent PNG turns black after JPEG encoding.** The canvas is filled white before drawing → test in Task 3.
4. **Replacing a photo the product owner set up deletes his file** (or a Pexels URL is treated as a path). Only `<salon>/uploads/…` old values come back as deletable → test in Task 1.
5. **Tapping Enregistrer while the picked photo is still being prepared** saves without it. Save is disabled while preparing → test in Task 5.

---

### Task 1: Database — storage policies and `admin_set_service_photo`

**Files:**
- Create: `supabase/migrations/20261116100000_service_photos.sql`
- Create: `supabase/tests/database/18_service_photos.test.sql`
- Modify: `supabase/tests/database/10_isolation.test.sql` (bump `plan(68)`), `supabase/tests/database/11_guard.test.sql` (`registered_api()` list)
- Modify: `salons/README.md` (one line under the `services[]` / photo rows: `--reapply-settings` overwrites photos the owner set in Réglages with the file's)

**Interfaces:**
- Produces: `public.admin_set_service_photo(p_id text, p_path text) returns text` — granted to `authenticated` only.
  - `p_path` null or `''` = remove the photo (`image = ''`).
  - Otherwise `p_path` must match `^<my_salon>/uploads/[0-9a-f-]{36}\.(jpg|webp)$` **and** exist in `storage.objects` (`bucket_id = 'salon-photos'`), else `invalid_photo`; stored as is in `services.image`.
  - Returns the previous `image` **only** if it starts with `<my_salon>/uploads/`, differs from the new value, and the salon's `demo` is false; otherwise `null`. The caller deletes that file.
  - Errors (P0001): `not_authorized` (no salon), `demo_disabled` (`private.my_role() = 'demo'`), `not_found` (service not in caller's salon), `invalid_photo`.
- Produces: `storage.objects` policies for `authenticated`, all requiring `bucket_id = 'salon-photos'`, `private.my_role() = 'owner'` and `name like private.my_salon() || '/uploads/%'`: one `for insert` (with check), one `for select` and one `for delete` (using). No update policy.

- [ ] **Step 1: Write the failing pgTAP tests** in `18_service_photos.test.sql`. Set up like `16_demo.test.sql` (users in `auth.users`, `pg_temp.act_as`), with an Élégance owner, a rival salon + staff, and an Élégance `demo` staff row (`update public.salons set demo = true where id = 'elegance'` inside the demo sub-section only, or a second demo salon). Seed files as superuser: `insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'), …`. Assertions:
  - owner: `admin_set_service_photo('coupe-femme', 'elegance/uploads/aaaa….jpg')` lives; `services.image` = that path; returns null (old was a URL).
  - owner, second call with another existing upload → returns the first path (deletable).
  - owner, `p_path` null → `image = ''`, returns the previous upload path.
  - service whose `image` is `'https://images.pexels.com/x.jpg'` or `'elegance/coupe.jpg'` (script file): replacing returns null.
  - `invalid_photo` for: `'rival/uploads/<uuid>.jpg'` (exists), `'elegance/coupe.jpg'`, `'elegance/uploads/../x.jpg'`, a well-formed path that is not in `storage.objects`, `'https://evil.example/x.jpg'`.
  - `not_found` for `'rival-cut'`; `not_authorized` for a non-staff user.
  - demo role: `demo_disabled`, nothing changed.
  - demo salon (owner role on a `demo = true` salon): replacing an upload returns null.
  - policies, as `authenticated` owner: `insert into storage.objects (bucket_id, name) values ('salon-photos', 'elegance/uploads/<uuid>.jpg')` lives; `'rival/uploads/<uuid>.jpg'`, `'elegance/x.jpg'` and bucket `'other'` throw `42501`; the demo user's own-folder insert throws `42501`; rival staff `select count(*)` of `elegance/uploads/%` = 0.

- [ ] **Step 2: Add the isolation and guard entries**: in `10_isolation.test.sql` beside the catalogue RPC checks — `admin_set_service_photo('rival-cut', null)` → `not_found`, and Élégance owner passing an existing `rival/uploads/<uuid>.jpg` → `invalid_photo`; bump `plan`. In `11_guard.test.sql` add `'admin_set_service_photo'` to `registered_api()`.

- [ ] **Step 3: Run to see them fail**

Run: `supabase start -x logflare,vector,studio && supabase db reset && supabase test db`
Expected: FAIL — `function public.admin_set_service_photo(unknown, unknown) does not exist` in 18 and 10; guard reports the stale entry.

- [ ] **Step 4: Write the migration** `20261116100000_service_photos.sql`: the three policies on `storage.objects`, the function (`language plpgsql volatile security definer set search_path = ''`, header comment listing inputs, return and error codes like the other `admin_*` functions), `revoke execute … from public, anon, authenticated; grant execute … to authenticated;`. Salon ids match `^[a-z0-9][a-z0-9-]{1,39}$`, so building the path regex from `my_salon()` needs no escaping.

- [ ] **Step 5: Run the database checks**

Run: `supabase db reset && supabase test db && supabase db lint --level warning`
Expected: all files `ok`, lint reports nothing new.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261116100000_service_photos.sql supabase/tests/database salons/README.md
git commit -m "feat(db): owner photo uploads in salon-photos/<salon>/uploads and admin_set_service_photo"
```

---

### Task 2: Public URL for a stored photo

**Files:**
- Create: `src/data/photoUrl.ts`, `src/data/photoUrl.test.ts`
- Modify: `src/data/queries.ts` (`fetchServices` mapping: `image: photoUrl(r.image)`)

**Interfaces:**
- Produces: `photoUrl(image: string, base: string = import.meta.env.VITE_SUPABASE_URL): string` — `''` → `''`; starts with `http://` or `https://` → unchanged; otherwise `` `${base without trailing /}/storage/v1/object/public/salon-photos/${image}` ``.
- Produces: `PHOTO_BUCKET = 'salon-photos'` (exported from `photoUrl.ts`, reused by Task 4).

- [ ] **Step 1: Write the failing tests** `photoUrl.test.ts`:

```ts
expect(photoUrl('', 'https://x.supabase.co')).toBe('');
expect(photoUrl('https://images.pexels.com/a.jpg', 'https://x.supabase.co')).toBe('https://images.pexels.com/a.jpg');
expect(photoUrl('elegance/uploads/abc.jpg', 'https://x.supabase.co/'))
  .toBe('https://x.supabase.co/storage/v1/object/public/salon-photos/elegance/uploads/abc.jpg');
```

- [ ] **Step 2: Run** `pnpm vitest run src/data/photoUrl.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `photoUrl` and use it in `fetchServices` only (stylists unchanged, per spec non-goals).
- [ ] **Step 4: Run** `pnpm test` — Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "feat(services): turn a stored photo path into its public URL"`

---

### Task 3: Shrinking a picked photo

**Files:**
- Create: `src/lib/photo.ts`, `src/lib/photo.test.ts`

**Interfaces:**
- Produces:
  - `MAX_PHOTO_BYTES = 25 * 1024 * 1024`, `PHOTO_LONG_SIDE = 1600`, `PHOTO_QUALITY = 0.82`.
  - `type PhotoErrorCode = 'photo_not_image' | 'photo_too_large' | 'photo_unreadable'`; `class PhotoError extends Error { code: PhotoErrorCode }` (message = code).
  - `fitWithin(width: number, height: number, longSide: number): { width: number; height: number }` — scales down keeping ratio, rounds, never scales up.
  - `preparePhoto(file: File): Promise<Blob>` — throws `PhotoError('photo_not_image')` if `!file.type.startsWith('image/')`, `photo_too_large` if `file.size > MAX_PHOTO_BYTES`, `photo_unreadable` if decoding fails; decodes with `createImageBitmap(file, { imageOrientation: 'from-image' })`, draws onto a canvas sized by `fitWithin` after filling it white, returns `canvas.toBlob(…, 'image/jpeg', PHOTO_QUALITY)` (a null blob → `photo_unreadable`).

- [ ] **Step 1: Write the failing tests**: `fitWithin(4000, 3000, 1600)` → `{1600, 1200}`; `fitWithin(3000, 4000, 1600)` → `{1200, 1600}`; `fitWithin(800, 600, 1600)` → `{800, 600}`. `preparePhoto` with a `text/plain` File → rejects with code `photo_not_image`; with an `image/jpeg` File whose `size` is overridden to `MAX_PHOTO_BYTES + 1` → `photo_too_large`; with `createImageBitmap` stubbed to reject → `photo_unreadable`. With `createImageBitmap` stubbed to return `{ width: 4032, height: 3024, close() {} }` and `HTMLCanvasElement.prototype.getContext`/`toBlob` stubbed: asserts `createImageBitmap` was called with `{ imageOrientation: 'from-image' }`, the canvas is 1600×1200, `fillStyle` was `'#fff'` (or `'#ffffff'`) and `fillRect` ran **before** `drawImage`, and `toBlob` got `'image/jpeg', 0.82`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/photo.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/photo.ts`.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/photo.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(admin): shrink a phone photo before upload"`

---

### Task 4: Saving a service with its photo (data layer)

**Files:**
- Modify: `src/data/salonSettings.ts`
- Create: `src/data/servicePhoto.test.ts`
- Modify: `src/context/LanguageContext.tsx` (error keys, below)

**Interfaces:**
- Consumes: `PHOTO_BUCKET` (Task 2); `admin_set_service_photo` (Task 1); `currentSalonId()` from `src/data/salon.ts`.
- Produces (in `salonSettings.ts`):
  - `type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; blob: Blob }`.
  - `SettingsErrorCode` gains `'invalid_photo' | 'demo_disabled' | 'upload_failed'` (also in `SETTINGS_ERROR_CODES`).
  - `class ServiceSaveError extends Error { code: SettingsErrorCode; serviceId: string | null }` — `serviceId` is the id of a service created during this attempt (null otherwise).
  - `saveServiceWithPhoto(input: SaveServiceInput, photo: PhotoChange): Promise<string>` — order: (1) `new` → upload `blob` to `` `${currentSalonId()}/uploads/${crypto.randomUUID()}.jpg` `` (`contentType: 'image/jpeg'`, `upsert: false`; failure → `upload_failed`); (2) `admin_save_service` → id; (3) if photo is not `keep` → `admin_set_service_photo(id, path | null)`; (4) returned old path → `storage.remove([old])`, errors ignored. If (2) or (3) fails: best-effort `remove` of the file uploaded in (1), then throw `ServiceSaveError` with `toSettingsError(err)` and `serviceId` = the id from (2) when `input.id` was null and (2) succeeded. Returns the service id.
  - `useSaveServiceWithPhoto()` = `useSettingsWrite(({ input, photo }) => saveServiceWithPhoto(input, photo), CATALOG_KEYS)`. `useSaveService` stays for now; Task 5 switches the form over and removes it if nothing else imports it.
  - `toSettingsError` accepts `ServiceSaveError` (its `code`).

- [ ] **Step 1: Write the failing tests** `servicePhoto.test.ts`, mocking `../lib/supabase` with `rpc` and `storage.from(bucket) → { upload, remove }`:
  - `keep` on an existing service: one `admin_save_service` call, no `admin_set_service_photo`, no storage calls.
  - `new` on a new service: `upload` path matches `/^elegance\/uploads\/[0-9a-f-]{36}\.jpg$/` in bucket `salon-photos`; then `admin_save_service` with `p_id: null`; then `admin_set_service_photo` with `{ p_id: '<returned id>', p_path: '<uploaded path>' }`; returned old path `'elegance/uploads/old.jpg'` → `remove(['elegance/uploads/old.jpg'])`.
  - `remove`: `admin_set_service_photo` with `p_path: null`; returned `null` → no `remove`.
  - `admin_set_service_photo` rejects `{ message: 'invalid_photo' }` after a successful create → throws `ServiceSaveError` with `code: 'invalid_photo'`, `serviceId: '<new id>'`, and `remove` called with the uploaded path.
  - `upload` error → `ServiceSaveError` `upload_failed`, no RPC called.
  - a failing `remove` of the old file still resolves with the id.
- [ ] **Step 2: Run** `pnpm vitest run src/data/servicePhoto.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** in `salonSettings.ts`; add translations:
  - `settings.error.invalid_photo`: FR `La photo n’a pas pu être enregistrée. Veuillez réessayer.` / AR `تعذّر حفظ الصورة. يرجى المحاولة مرة أخرى.`
  - `settings.error.demo_disabled`: FR `Impossible dans la démo.` / AR `غير متاح في النسخة التجريبية.`
  - `settings.error.upload_failed`: FR `L’envoi de la photo a échoué. Vérifiez la connexion et réessayez.` / AR `فشل إرسال الصورة. تحقّقي من الاتصال وأعيدي المحاولة.`
- [ ] **Step 4: Run** `pnpm test` — Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "feat(settings): save a service and its photo together"`

---

### Task 5: The photo field in the service form

**Files:**
- Create: `src/components/settings/ServicePhotoField.tsx`
- Modify: `src/components/settings/ServicesSettings.tsx` (`ServiceFormCard`, `Draft`), `src/components/settings/ServicesSettings.test.tsx`, `src/context/LanguageContext.tsx`, `CLAUDE.md` (Owner settings: one sentence on service photos, the `uploads/` folder, `admin_set_service_photo`, `photoUrl`)

**Interfaces:**
- Consumes: `preparePhoto`, `PhotoError` (Task 3); `PhotoChange`, `useSaveServiceWithPhoto`, `ServiceSaveError`, `toSettingsError` (Task 4); `useMyRole()` from `src/data/admin.ts`; `SmartImage`.
- Produces: `ServicePhotoField({ id, currentUrl, category, value, onChange, onBusyChange, demo }: { id: string; currentUrl: string; category: 'coiffure' | 'beaute'; value: PhotoChange; onChange(v: PhotoChange): void; onBusyChange(busy: boolean): void; demo: boolean })`.
  - Shows: the picked blob (object URL, revoked on change/unmount), else `currentUrl` unless `value.kind === 'remove'`, else the category icon (`Sparkles` for beauté, `Scissors` otherwise) — all `aspect-[16/11]`, centred cover.
  - No photo shown → **Ajouter une photo**; photo shown → **Changer** + **Retirer**. Buttons open a hidden `<input type="file" accept="image/*">` (no `capture`, so the phone offers gallery and camera).
  - On pick: `onBusyChange(true)`, `preparePhoto`, then `onChange({ kind: 'new', blob })` or show `t('settings.error.<PhotoErrorCode>')` under the field (`role="alert"`), then `onBusyChange(false)`.
  - `demo`: buttons still shown; tapping shows `t('settings.services.photoDemo')` (`role="status"`) and opens nothing.
- `ServiceFormCard`: `Draft` gains `image: string` (the service's current public URL, `''` for new); local state `photo: PhotoChange` (start `keep`), `preparing: boolean`, `savedId: string | null`. Submit calls `useSaveServiceWithPhoto` with `{ input: toInput(savedId ?? draft.id, values), photo }`; on `ServiceSaveError` with a `serviceId`, store it in `savedId` (so a retry updates that service) and show the error as today (`demo_disabled`, `invalid_photo`, `upload_failed` added to `ERROR_KEYS`). Save button disabled while `save.isPending || preparing`. The existing `onSaved` toast logic still uses `draft.id` to choose "ajoutée"/"enregistrée".
- Translations (FR / AR): `settings.services.photo` `Photo` / `الصورة`; `settings.services.addPhoto` `Ajouter une photo` / `إضافة صورة`; `settings.services.changePhoto` `Changer` / `تغيير`; `settings.services.removePhoto` `Retirer` / `إزالة`; `settings.services.photoDemo` `Les photos ne peuvent pas être changées dans la démo.` / `لا يمكن تغيير الصور في النسخة التجريبية.`; `settings.error.photo_not_image` `Ce fichier n’est pas une photo.` / `هذا الملف ليس صورة.`; `settings.error.photo_too_large` `Cette photo est trop lourde (25 Mo maximum).` / `هذه الصورة كبيرة جدًا (25 ميغابايت كحد أقصى).`; `settings.error.photo_unreadable` `Cette photo n’a pas pu être lue. Essayez-en une autre.` / `تعذّرت قراءة هذه الصورة. جرّبي صورة أخرى.`

- [ ] **Step 1: Write the failing tests** in `ServicesSettings.test.tsx`. Extend the supabase mock with `storage.from → { upload, remove }`, mock `../../lib/photo` (`preparePhoto` resolves a `Blob` by default; keep the real `PhotoError`), mock `../../data/admin` `useMyRole` (default `'owner'`), stub `URL.createObjectURL`/`revokeObjectURL`. Tests:
  - new service without a photo: icon shown, **Ajouter une photo** button; saving calls no `upload` and no `admin_set_service_photo`.
  - picking a file (`fireEvent.change` on the file input) shows the preview with **Changer** and **Retirer**; Enregistrer uploads, then `admin_save_service`, then `admin_set_service_photo` with the uploaded path; toast "Prestation ajoutée".
  - editing a service with `image: 'https://…/a.jpg'`: preview shows it; **Retirer** then Enregistrer → `admin_set_service_photo` with `p_path: null`.
  - **Annuler** after picking: no `upload`, no RPC.
  - `preparePhoto` rejects `new PhotoError('photo_not_image')` → alert "Ce fichier n’est pas une photo." and the form keeps its previous photo.
  - while `preparePhoto` is pending, Enregistrer is disabled (Review Focus 5).
  - `admin_set_service_photo` fails once with `invalid_photo` after creating `'new-1'`; the retry calls `admin_save_service` with `p_id: 'new-1'`, not `null` (Review Focus 2).
  - demo role: tapping **Ajouter une photo** shows the demo message and the file input is not clicked; saving sends no photo calls.
- [ ] **Step 2: Run** `pnpm vitest run src/components/settings/ServicesSettings.test.tsx` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `ServicePhotoField` and wire it into `ServiceFormCard` (field placed above the French name); pass `image: s.image` into the edit `Draft`.
- [ ] **Step 4: Run the full checks**

Run: `pnpm test && pnpm build && pnpm check:bundle && supabase test db`
Expected: all tests pass, build OK, `check:bundle` prints `OK`, pgTAP all `ok`.

- [ ] **Step 5: Check by hand on a phone-sized window** against the local stack (`VITE_SUPABASE_URL=<API_URL> VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> pnpm dev`, values from `supabase status -o env`; the seed has a `localhost` salon row): add a service with a photo, see it on the home page's "Nos services" card, replace it (old file gone from Storage), remove it (icon back), switch to AR (layout mirrored).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings src/context/LanguageContext.tsx CLAUDE.md
git commit -m "feat(settings): owner adds, replaces or removes a service photo"
```
