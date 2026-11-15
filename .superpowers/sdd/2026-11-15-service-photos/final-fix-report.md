# Final fix report

RED run (new tests before the fixes): 4 failed / 42 passed in the three touched test files
(config.test.ts, servicePhoto.test.ts, ServicesSettings.test.tsx). GREEN: after the fixes, all pass.

- F1: salons/README.md:76 reworded as asked. Line 40 is consistent (no change needed).
- F2: CLAUDE.md Owner settings paragraph (line ~84): exact delete rule, `services.image` URL-or-path + `photoUrl`/`fetchServices` rule; Salons section: new storage.objects policies line.
- F3: ServicePhotoField.tsx new `disabled` prop OR-ed into the 3 buttons (`locked`); ServicesSettings.tsx passes `disabled={save.isPending}`. Test: "locks the photo buttons while the save is pending" (RED, now GREEN).
- F4: ServicesSettings.tsx onError invalidates ['services'] on any ServiceSaveError; savedId logic kept. Test: "invalidates the services list when the photo step fails on an existing service" (RED, GREEN).
- F5: scripts/new-salon.ts drops `.svg`; scripts/lib/config.ts `photo()` rejects local files not ending .jpg/.jpeg/.png/.webp/.avif/.gif (case-insensitive) with a clear message (applies to heroPhoto, services, stylists). Test in scripts/lib/config.test.ts (RED, GREEN). The `?? 'application/octet-stream'` fallback stays but is unreachable for validated configs.
- F6: salonSettings.ts saveServiceWithPhoto: `photoCalled` flag; on failure the upload is removed only if the photo RPC was not reached or the error code is not 'unknown'; comment added. Tests: lost response keeps file (RED, GREEN); known code removes it.
- F7: servicePhoto.test.ts adds: save fails after upload (file removed, serviceId null, no photo rpc); existing service photo failure -> serviceId null; toSettingsError(ServiceSaveError); F6 keep/remove cases. All except the lost-response one passed immediately (they cover existing behaviour).

## Verification (after `supabase db reset`)
- pnpm test: 57 files, 631 tests passed
- npx tsc -b: OK
- pnpm build: OK
- pnpm check:bundle: OK (190.2 KB gzip, baseline 165, limit +30)
- supabase test db: 597 tests, PASS
(scripts tests are part of the same vitest run.)
