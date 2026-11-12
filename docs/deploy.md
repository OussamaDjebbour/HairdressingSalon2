# Setting up automatic updates and launching salons

Every merge to `main` runs the checks, updates the shared database, then publishes the one site
that serves all salons (`.github/workflows/deploy.yml`). You set the accounts up **once**, below,
in this order. After that, a new salon is one command.

## Order of things

Do steps 1-5 below, then the one-time section "Before the first merge to main" (database
migrations and the demo's address), and only then merge to `main` for the first time. Launching
salons (step 6) comes last.

## 1. Supabase: upgrade to Pro

The free plan **pauses the project after a week without activity**: salons would be offline.
Upgrade to Pro (about 25 USD per month for the whole project, shared by all salons) before the
first real salon. Dashboard → Organization → Billing.

## 2. Cloudflare: account and Pages project

1. Create a free account at <https://dash.cloudflare.com>.
2. Create the Pages project that serves every salon. On your machine, once:

   ```bash
   npx wrangler login
   npx wrangler pages project create salons --production-branch=main
   ```

   (`salons` is the project name; the site is then `https://salons.pages.dev`, or with a suffix
   if that name was taken.)
3. If this repository was ever connected to **Vercel** (or another host), disconnect or delete
   that project there, so it stops deploying an old copy of the site from the same repository.
4. Give the edge functions their two settings (each command asks you to paste the value):

   ```bash
   npx wrangler pages secret put SUPABASE_URL --project-name salons
   npx wrangler pages secret put SUPABASE_PUBLISHABLE_KEY --project-name salons
   ```

   `SUPABASE_URL` is your project URL and `SUPABASE_PUBLISHABLE_KEY` the publishable (anon) key
   (Supabase → Project Settings → API). Use these commands rather than the dashboard's
   Variables page, which may not reach functions published with wrangler. The functions use them
   to put each salon's name and colours in the page.

## 3. Cloudflare: the API token

Dashboard → My Profile → API Tokens → Create Token → Custom token, with exactly these permissions:

- Account → **Cloudflare Pages: Edit**
- Zone → **Zone: Read**
- Zone → **DNS: Edit** (for the salons' domains; scope: all zones in your account)

Copy the token once; it is not shown again. Also note your **Account ID** (Account home → the
three dots next to your account name → Copy account ID).

## 4. GitHub: the Actions secrets

> **The repository belongs to a teammate and you are not an admin of it.** Only a repository
> admin can add secrets. Ask the teammate either to add the secrets below (Settings → Secrets and
> variables → Actions → New repository secret) or to make you an admin. Also ask them to create
> an environment named **production** (Settings → Environments), which the deploy job uses, and
> to restrict it to the `main` branch (that environment → Deployment branches and tags →
> Selected branches → add `main`), so no other branch can ever use the deploy secrets.

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens → Generate |
| `SUPABASE_DB_PASSWORD` | the database password chosen when the project was created (reset it under Project Settings → Database if lost) |
| `SUPABASE_PROJECT_REF` | the code in the project URL `https://<ref>.supabase.co` |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same page, publishable (anon) key |
| `VITE_VAPID_PUBLIC_KEY` | the public push key (see `docs/notifications-setup.md`) |
| `CLOUDFLARE_API_TOKEN` | step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | step 3 |
| `CLOUDFLARE_PAGES_PROJECT` | `salons` (step 2) |

From then on, merging to `main` deploys. To redeploy without a change: GitHub → Actions → Deploy →
Run workflow (with `main` selected: started from another branch, only the checks run). If a step fails, nothing after it runs: the database is updated before the site, so
a failed migration never publishes a site that expects it.

## 5. Your machine: `.env.admin`

The launch script needs its own secrets in a file that is never committed:

```bash
cp .env.admin.example .env.admin
```

Fill it in (every line is explained inside the file): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
(Supabase → Project Settings → API; **it bypasses all protections, keep it private**),
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (step 3), `CLOUDFLARE_PAGES_PROJECT=salons`.

Node 22 is recommended locally (the deploy uses it); Node 20.12 or newer works.

## Before the first merge to main (one time, after steps 1-5)

The live database must have **all migrations** (Part 2's `20261113*` files and Part 3's
`20261114100000`, which creates the `salon_domains` table) before the site goes out.

```bash
supabase login
supabase link --project-ref <ref>     # <ref> = SUPABASE_PROJECT_REF from step 4
supabase db push --dry-run            # lists what will be applied: expect the 20261113* and 20261114100000 files
supabase db push
```

Then the live Élégance demo needs a row saying which address belongs to it, or the site shows
"Salon introuvable". Use its real `pages.dev` address: copy it from the Cloudflare dashboard
(Workers & Pages → `salons`); it gets a suffix (for example `salons-ab1.pages.dev`) if the name
`salons` was already taken. In Supabase → SQL Editor (replace `<your-project>.pages.dev` with it):

```sql
insert into public.salon_domains (domain, salon_id) values ('<your-project>.pages.dev', 'elegance');
```

After the first deploy (the merge), check it worked: view the page source of a salon's address. It shows
that salon's `<title>` and a `<style>` with `--brand-*` values (`--brand-600: ...`).

## 6. Launching a salon

1. **Buy the domain** in your Cloudflare account (Domain Registration → Register Domains). It
   stays yours and can be transferred to the salon later. A domain bought elsewhere also works:
   the script prints the DNS record to add there.
2. **Describe the salon:** `cp salons/example.json salons/<slug>.json`, edit it, and put its
   photos in `salons/<slug>/photos/`. Details: `salons/README.md`.
3. **Check, then launch:**

   ```bash
   pnpm new-salon <slug> --dry-run   # validates only, writes nothing
   pnpm new-salon <slug>
   ```

   It creates the salon and the owner's login, attaches the domain (and `www.`) to the Pages
   project and adds the DNS record when the domain is in your Cloudflare account. The owner's
   **password is printed once**: copy it now.
   Re-running is safe and keeps the owner's own settings; `--reapply-settings` overwrites them
   with the file. When the id already exists, the script shows that salon's name and domains and
   asks before changing anything (`--yes` answers for you).
4. **Check the site** at the new domain (DNS and the certificate can take a few minutes) and at
   `/admin`. Before the domain works, preview any salon on your computer with
   `pnpm dev` and `http://localhost:5173/?salon=<slug>` (this only works on localhost; the live
   database has no `localhost` address row, so plain `http://localhost:5173/` shows "Salon
   introuvable" — use `?salon=elegance` or `VITE_SALON_ID=elegance pnpm dev`).
5. **Hand over** the site address, `/admin` address, the owner's email and the password.

## 7. The demo (pitching to salon owners)

The demo is the Élégance salon at https://salons-dzi.pages.dev. Its login is public on purpose (the data is fake), so prospects can try the booking page and the owner's `/admin` for themselves.

### Set up (once, after deploying Part 4)

1. Apply the database changes first, then publish the site (database before site, as in `deploy.yml`). Until the GitHub deploy secrets exist this is manual: `supabase db push`, then `pnpm build && npx wrangler pages deploy dist --project-name salons --branch main`.
2. Log in to `/admin` as the Élégance owner (no owner account yet: see § 6) and set Élégance up the way prospects should see it. In particular set Réglages → Infos du salon → **WhatsApp** to **your own number**: in the demo, WhatsApp messages "to the client" open WhatsApp to the salon's number, not the client's.
3. **Then** create the demo account:

   ```bash
   pnpm setup-demo elegance --dry-run   # checks only, writes nothing
   pnpm setup-demo elegance             # shows the salon, then asks you to type "elegance"
   ```

   Before writing anything it shows the salon's name, its number of future bookings (and how many are online), its owner accounts and whether it is already the demo, then asks you to **type the salon id** to confirm (without a terminal, pass `--yes=elegance`; any other value is refused). It **refuses** a salon that is not the demo yet and has future online bookings (that looks like a real salon with real clients) unless you add `--force`.

   It creates `demo+elegance@demo.invalid` and prints its **password once**. It also records Élégance's current state as the "original" the reset returns to, which is why step 2 comes first. `--domain=` changes the email domain.

   > **What the reset deletes.** Once setup-demo has run, the **first reset** (the nightly one, or Réinitialiser la démo) **deletes every booking, closed date and stylist day off of that salon**: they are not part of the snapshot. Export or check anything you want to keep **before** running setup-demo. Closed dates and days off you set before setup-demo are not kept either.

   **Re-running setup-demo** (to keep later changes to Élégance's settings): tap **Réinitialiser la démo first**, make your changes, then **re-run `pnpm setup-demo elegance` immediately**, before prospects change anything (it records whatever is there at that moment as the new original, and rotates the demo password).

   **3b. Check the demo works on the live project:**

   - Log in as your Élégance owner account and tap Réglages → Compte → **Réinitialiser la démo** once. This confirms the reset, including restoring the demo login (an `auth` schema write), works on the hosted project.
   - Log out, tap **Essayer la démo** on `/admin`, and check that client phone numbers are **masked** (`05•• •• •• 56`).
   - Supabase dashboard → Database → **Cron**: the job `demo-nightly-reset` is listed (`0 2 * * *`).
   - The next morning, in the SQL editor: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;` shows a `succeeded` run around 02:00 UTC.
4. Supabase → Authentication → Email: keep **"Secure email change"** on (both addresses must confirm), and keep Supabase's **default SMTP** (see the caveats below).

### Reset before a pitch

- Log in as your own Élégance owner account, then Réglages → Compte → **Réinitialiser la démo**. The button is only shown to the product owner's own account.
- The reset restores the demo account's email and password, removes everything prospects added (services, stylists, closed dates, days off, bookings), restores the snapshot, then adds a week of fake bookings (3 to 5 per open day, some pending) without sending any notification.
- It also runs by itself every night at **03:00 Algiers** (pg_cron job `demo-nightly-reset`, `0 2 * * *` UTC).

### What prospects see and can do

- They can book on the public page, and in `/admin` add, move, confirm and cancel bookings, change services, stylists, hours and text. All of it is shared by everyone using the demo and disappears at the next reset.
- Client phone numbers are **masked** for the demo account (`05•• •• •• 56`), enforced in SQL, not only in the screen.
- They cannot enable push notifications, cannot change the salon's WhatsApp number, cannot see the reset button, and no WhatsApp message ever reaches a real client (and there is no call shortcut on the masked numbers).

### Abuse limits during a pitch

The online-booking limits stay on, per salon and counting online bookings only (read from `create_booking`):

| Limit | Effect |
| --- | --- |
| 20 online bookings created in 10 minutes (whole salon) | `rate_limited` |
| 5 online bookings per client IP (`cf-connecting-ip`) per hour | `rate_limited` on the 6th |
| 3 future, non-cancelled online bookings per phone | `too_many_bookings` on the 4th |

So one phone number gets **3** future bookings (cancelling one frees a slot), and one IP gets **5** per hour, whichever comes first. Staff bookings made in `/admin` are not counted. The fake bookings are inserted with an old `created_at`, so they do not count either. The reset deletes every booking, which **clears all the counters**. If a prospect is blocked, or several prospects share one Wi-Fi (one IP) at an event, run **Réinitialiser la démo**; the limits are deliberately not loosened for the demo.

### Known caveats: the shared demo session

- **Emails.** Anyone in the public demo session can call the Supabase auth API as the demo account (e.g. request an email change). Keep Supabase's **default SMTP**: it only delivers to the email addresses of the Supabase project's team members, so the demo session cannot make it email arbitrary people. If a custom SMTP provider is ever configured, the demo session could make Supabase send confirmation emails to **any** address; do not add one while a demo exists (or rely on "Secure email change" and Supabase's email rate limits, knowing that is weaker). The reset restores the demo account's email.
- **Password.** A prospect could change the demo account's password (supabase-js `updateUser`) and lock every other visitor out of "Essayer la démo" until the next reset. **Réinitialiser la démo** fixes it immediately (it restores the stored password).
