# New salon checklist

From "a salon said yes" to "she takes bookings on her phone". The details live in
[`salons/README.md`](../salons/README.md) (the salon file) and [`deploy.md`](deploy.md) § 6 (launching).

## Once, before the first real salon

- [ ] **Supabase on Pro** (about 25 USD a month for all salons together; Dashboard → Organization → Billing).
      The free plan pauses the database after a week without activity: every salon would go offline.
- [ ] **Leaked password protection on** (Authentication → Sign In / Providers → Email → "Prevent use of
      leaked passwords"; needs Pro).
- [ ] `.env.admin` on your machine (Supabase service key + Cloudflare token, see `deploy.md` § 5).

## For each salon

### 1. Collect from the owner

- [ ] Salon name and its main colour (one colour; the script makes the shades).
- [ ] Address, city, and the WhatsApp number clients should write to.
- [ ] Opening hours for each weekday (15-minute steps) and the closed days.
- [ ] Services: name, price in DA, length (multiple of 15 minutes), category, a photo if she has one.
- [ ] Stylists: name, role, the services each one does, the days each one works, a photo.
- [ ] The email she will log in with.
- [ ] Optional: Instagram / Facebook links, a short story or quote, years open, number of clients,
      rating and number of reviews (each one left out is hidden).
- [ ] A main photo: a result (hair, a face), at least 1600 px on the long side, subject in the upper half.

Arabic texts are optional: anything without Arabic shows the French.

### 2. Buy the domain

- [ ] Preferably in your Cloudflare account (the script then adds the DNS record itself). A domain bought
      elsewhere works too: the script prints the record to add there.

### 3. Launch

```bash
cp salons/example.json salons/<slug>.json   # fill it in; photos go in salons/<slug>/photos/
pnpm new-salon <slug> --dry-run             # checks the file, lists every mistake, writes nothing
pnpm new-salon <slug>                       # creates everything
```

- [ ] **Copy the owner's password** the moment it is printed: it is shown only once.
- [ ] Before the domain works, preview with `pnpm dev` at `http://localhost:5173/?salon=<slug>`.
- [ ] Once the domain works (DNS and certificate can take a few minutes): check the site and `/admin`.

### 4. Hand over

- [ ] Give her the site address, the `/admin` address, her email and the password.
- [ ] On her phone, with her: open `/admin`, add it to the home screen, then Réglages → Compte →
      turn on notifications, so new bookings reach her.
- [ ] Show her Réglages: services, hours, closed days, packs and promotions are hers to manage.

## Cautions

- **Never run `pnpm setup-demo` on a real salon.** The demo reset deletes all of its bookings. The script
  refuses a salon with future online bookings, but `--force` would skip that.
- **Re-running `pnpm new-salon <slug>` is safe:** it only updates the branding (name, colour, photos, story,
  domains) and never undoes her own changes. `--reapply-settings` overwrites her settings with the file:
  only use it on purpose.
- `salons/<slug>.json` and its photos stay on your machine (git-ignored: they hold her email and phone).
