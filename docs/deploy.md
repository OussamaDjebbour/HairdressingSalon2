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

   (`salons` is the project name; the site is then `https://salons.pages.dev`.)
3. Give the edge functions their two settings (each command asks you to paste the value):

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
> an environment named **production** (Settings → Environments), which the deploy job uses.

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
Run workflow. If a step fails, nothing after it runs: the database is updated before the site, so
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
`salons` was already taken. In Supabase → SQL Editor:

```sql
insert into public.salon_domains (domain, salon_id) values ('salons.pages.dev', 'elegance');
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
   `pnpm dev` and `http://localhost:5173/?salon=<slug>` (this only works on localhost).
5. **Hand over** the site address, `/admin` address, the owner's email and the password.
