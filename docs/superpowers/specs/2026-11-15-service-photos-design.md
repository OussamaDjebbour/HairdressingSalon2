# Service photos from Réglages — design

Date: 2026-11-15. Status: approved in conversation; builder check done (its two questions settled below).

## Why

When a salon owner adds a service in Réglages → Prestations, its card in the public "Nos services"
section shows only the category icon, while the services the product owner set up (through
`salons/<slug>.json` and `pnpm new-salon`) have photos. The page looks unfinished, and today only
the product owner can change that. The owner should be able to give a service a photo herself,
in the same form where she types its name and price.

## Who and how

- The owner, on her phone, almost always. Photos are mostly her own phone pictures of her clients'
  results; sometimes a picture she found online and saved to her phone. Either way she picks it
  from the phone's gallery or takes it with the camera.
- No pasting of web links (photos found online usually belong to someone else; links break).

## Goals

1. In the service form (add and edit), the owner can **add**, **replace** or **remove** the
   service's photo. This includes photos the product owner set up.
2. The photo shows on that service's card in "Nos services", like the provisioned ones.
3. Strict salon separation, as for every other salon-owned thing: an owner can only write photos
   into her own salon's storage, and a service can only point at a photo of its own salon.
4. The demo account (role `demo`) sees the photo controls but cannot upload or remove: it gets a
   clear message, like the other demo restrictions.

## Non-goals

- Stylist photos (same empty-card problem, deliberately later).
- A cropping or editing tool.
- Pasting web links.
- Several photos per service, galleries.

## Anti-goals (failure even if it "works")

- One salon's owner can write, overwrite or delete another salon's files, or point a service at
  another salon's photo.
- A stranger with the public demo login can put an arbitrary picture on the public demo page.
- A 4–10 MB camera photo is uploaded as is: slow on mobile data, heavy public page.
- A photo change goes live before she taps **Enregistrer**, or survives her cancelling the form.
- The browser ever holds the service-role key.

## The experience

In Réglages → Prestations → add or edit a service, a photo area sits above the name field:

- **No photo:** the category icon (as on the public card) and an **Ajouter une photo** button,
  which opens the phone's picker (gallery or camera; `accept="image/*"`).
- **With a photo:** a preview in the public card's shape (`aspect-[16/11]`, centred crop, like
  `SmartImage` on the card), with **Changer** and **Retirer**.
- Picking or removing only changes the form. Nothing changes on the public page until she taps
  **Enregistrer**; then the usual "Prestation enregistrée" / "Prestation ajoutée" toast (the
  admin's `useToast`). **Annuler** leaves the stored photo as it was.
- While a photo is being prepared/uploaded, Enregistrer shows it is busy; a failure says what went
  wrong and keeps the form (and the picked photo) so she can retry.
- A file that is not an image, or cannot be read, gets a clear error on the photo field instead of
  a failed upload. A very large original (e.g. over ~25 MB) is refused with a message.
- Demo account: tapping Ajouter/Changer/Retirer shows the demo message (e.g. "Les photos ne
  peuvent pas être changées dans la démo."); nothing is uploaded. The server refuses as well
  (`demo_disabled`), so the block does not rely on the UI.
- Everything in FR and AR, through `t()`, with RTL-correct layout (logical properties), per
  CLAUDE.md.

## Decided constraints

- **Shrink on the phone before upload:** resize so the longest side is about 1600 px and encode
  as JPEG (or WebP where supported) at a quality giving a few hundred KB. Done in the browser
  (canvas or `createImageBitmap`); no new image library unless needed. Respect EXIF orientation
  (`createImageBitmap(..., { imageOrientation: 'from-image' })` or equivalent) so phone portraits
  aren't sideways. iPhone HEIC: iOS Safari hands the page a JPEG when picking from the gallery
  with `accept="image/*"`; if a browser hands over something it can't decode, show the
  "not an image" error.
- **Storage:** the existing public bucket `salon-photos`, in the salon's own folder. Owner uploads
  go in a separate subfolder, e.g. `<salon_id>/uploads/<random-uuid>.jpg`, so they never collide
  with the script's files (`<salon_id>/<file name>`, see `storagePath` in
  `scripts/lib/provision.ts`). File names are random, never the service id, so a new service can
  get its photo before it has an id.
- **Who may write:** the bucket currently has no write policies (service role only). Add
  `storage.objects` policies for `authenticated` that allow insert (and delete) **only** in
  bucket `salon-photos`, **only** under `<private.my_salon()>/uploads/`, and **not** for the
  `demo` role (`private.my_role()`). No update/overwrite of existing objects. Reads stay public
  through public URLs, as today.
- **What a service points at:** `public.services.image` keeps its meaning for existing rows (a
  full `https://…` URL, `''` = none). For an owner upload it stores the **storage path** instead
  (`<salon>/uploads/<uuid>.jpg`, no scheme): the database doesn't know the project's public
  address (it differs locally and live, and no migration or setting holds it), so it can't build
  the URL itself, and accepting a full URL from the browser would let the browser choose the
  host. The frontend turns a path into the public URL with `VITE_SUPABASE_URL`
  (`<url>/storage/v1/object/public/salon-photos/<path>`) in **one** place, the row mapping in
  `src/data/queries.ts`; a value starting with `http` is used as is. Nothing else reads
  `image` (checked: `functions/` and the edge function don't). The demo snapshot copies the
  column value, so it works unchanged. *(Builder's call, settled after the builder check.)*
  The browser must not be able to set `image` directly (no write grants on `services`;
  writes go through `security definer` `admin_*` RPCs scoped by `my_salon()`, per CLAUDE.md).
  The RPC that sets the photo accepts either "none" or a path in **the caller's own**
  `<salon>/uploads/` folder that **exists** in `storage.objects` for that bucket, and stores that
  path. Anything else → an error code (e.g. `invalid_photo`). A service id of another salon
  behaves like one that doesn't exist (`not_found`), as for the other owner functions. `demo`
  role → `demo_disabled`.
- **Saving is one action for her:** "Enregistrer" saves the fields and the photo change together
  from her point of view. Whether that is one RPC (e.g. `admin_save_service` gaining an image
  argument with keep / set / remove meaning) or `admin_save_service` followed by a separate
  `admin_set_service_photo(p_id, p_path)` is the builder's call; if it is two calls and the
  photo part fails, she sees an error and can retry without retyping.
- **Old files:** after a successful save that replaced or removed a photo, delete the old file
  **if** it is one of her uploads (`<salon>/uploads/…`) **and the salon is not a demo**
  (`salons.demo`). On a demo salon the product owner's own login can upload, `pnpm setup-demo`
  may record that path in the reset snapshot, and the nightly reset would then restore a link to
  a deleted file; so on demo salons old uploads are kept (orphans are acceptable).
  *(Builder's call, settled after the builder check.)* Files the script put there
  (`<salon>/<file>`) are never deleted (re-running `pnpm new-salon` relies on them). A picked
  photo that was uploaded but never saved (she cancelled or the save failed for good) should be
  deleted when practical; a leftover orphan is acceptable, not a bug.
- **Re-running the launch script:** `pnpm new-salon` keeps the owner's settings unless
  `--reapply-settings`, which overwrites services (and so her photos) with the JSON file. That is
  the intended behaviour; mention it in `salons/README.md`.
- **Demo reset:** `private.demo_reset` restores services from its snapshot, which includes
  `image`. The shared `demo` login cannot upload, and old uploads on demo salons are never deleted
  (above), so no demo cleanup is needed.
- **Tests, per CLAUDE.md "Adding a table or a public function":** isolation tests in
  `supabase/tests/database/10_isolation.test.sql` (another salon's service → `not_found`;
  another salon's path or a path outside `uploads/` → refused; storage insert outside own folder
  refused; demo refused) and register any new function in `11_guard.test.sql`. Vitest for the
  form (add / change / remove / cancel / demo message / errors) and for the resize helper's
  decisions (size and type limits).
- Public bundle: the photo picker and resizing live in the lazily loaded admin; `pnpm
  check:bundle` must still pass.

## Left to the builder

- One RPC vs two (above), exact RPC and error names, the exact resize numbers and output format.
- Whether the upload happens when she picks the photo or when she taps Enregistrer (either is
  fine as long as nothing goes live before Enregistrer and failures are retryable).
- The visual layout of the photo area within the existing form styles (`card`, `btn-*`,
  `SmartImage`), and the FR/AR wording.
- Whether the settings list rows show a small thumbnail (nice, not required).

## Calls made in conversation (not asked of the owner)

- Shrinking on the phone, centred crop, no crop tool, no links.
- Owner uploads in `<salon>/uploads/`, script photos never deleted.
- Old uploaded files deleted on replace/remove (except on demo salons).
- `services.image` holds a storage path for owner uploads; the frontend builds the URL.
