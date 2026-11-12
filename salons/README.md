# Launching a salon: `pnpm new-salon <slug>`

Each salon is described by one file, `salons/<slug>.json`, with its photos in
`salons/<slug>/photos/`. Both stay on the product owner's machine: they are git-ignored
(the file holds the owner's email and phone); only `example.json` is committed.

```bash
cp .env.admin.example .env.admin        # once: Supabase service key + Cloudflare token
cp salons/example.json salons/sara.json # then edit it, put the photos in salons/sara/photos/
pnpm new-salon sara --dry-run           # check the file; prints what would be sent, writes nothing
pnpm new-salon sara                     # launch (or, later, update the branding/domains)
```

The script, step by step (each line printed with ✓, ! for a warning, ✗ for a failure):

1. loads `.env.admin` (every variable it needs is checked before anything is written) and checks
   `salons/<slug>.json` (every mistake is listed with its field);
2. makes the colour shades from `color` and warns when a shade had to be darkened to stay readable;
3. uploads the local photos to the `salon-photos` bucket, under `<salon id>/`;
4. finds the owner's login by email, or creates it with a password **printed once**;
5. creates the salon (`provision_salon`) with everything in the file, or updates an existing one (see re-running below);
6. attaches each domain to the Cloudflare Pages project (a bare domain also gets `www.`) and adds
   its DNS record when the domain is in the Cloudflare account; otherwise it prints the record to
   add at the domain's DNS provider. Skipped with a warning when `CLOUDFLARE_API_TOKEN` is empty;
7. prints the site and `/admin` addresses, the owner's login and what's left to do by hand.

**An id that already exists:** before writing anything the script prints the stored salon's name
and domains and asks `Continue? [y/N]` (`--yes` answers for you). If that isn't the salon in the
file, say no and give the file another `id` — otherwise its branding and domains would be overwritten.
Adding the file's owner email to a salon that already has other staff is refused (`owner_conflict`);
when that email really is an extra login of the same salon, re-run with `--add-owner`.

**Re-running** is safe (nothing is duplicated) and never undoes the owner's own edits: on an
existing salon the script only sends the product owner's keys — `name`, `color`, `heroPhoto`,
`story`, `storyIntro`, `founder`, `claims`, `domains` (when not empty) and the owner's login. Hours,
address, city, WhatsApp, links, services and stylists are only written when the salon is created;
after that they belong to the owner (Réglages). To overwrite them with the file anyway, run
`pnpm new-salon <slug> --reapply-settings`. An empty
`domains` list is never sent, so it can't take a salon's site offline; keys left out of the file
keep their current value.

**Moving a domain** from one salon to another: the edge keeps each address's salon for up to
5 minutes, so for that long the page head (tab title, colours) can still show the old salon; the
page itself follows the database at once.

The owner's password is printed as soon as her login is created (and again in the summary): note
it then, a later run can't show it again.

## The file

See `example.json`. Texts shown on the site are `{"fr": "…", "ar": "…"}`; a missing `ar` uses the French text.

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | 2–40 lowercase letters, digits, `-`. Never changes. |
| `name` | yes | `{fr, ar?}`; 2–80 characters. |
| `color` | yes | Main colour, `#RRGGBB`; it becomes the buttons/header shade. |
| `domains` | yes | List, may be empty until the domain is bought. `www.` is optional (stored without it). |
| `address`, `city` | yes | `{fr, ar?}`. |
| `whatsapp` | yes | Algerian mobile (`0555 12 34 56` or `+213 …`). |
| `instagram`, `facebook` | no | `https://…` links. |
| `story` | no | The quote of the "philosophy" section (hidden when absent). |
| `storyIntro` | no | The paragraph above the quote. |
| `founder` | no | `{"name": {fr, ar?}, "role": {fr, ar?}}` — signs the quote. |
| `claims` | no | `{yearsOpen, clientCount, rating, reviewCount}`; each one left out is hidden. `rating` 1–5, one decimal. |
| `hours` | yes | `monday` … `sunday`, each `"09:00-18:00"` (15-minute steps) or `"closed"`. |
| `services[]` | yes | `{id, category: "coiffure" \| "beaute", name, description?, price (DA), duration (minutes, multiple of 15), photo?}`. |
| `stylists[]` | yes | `{id, name, role?, services: [service ids], workdays?: ["tuesday", …], photo?}`. No `workdays`: the salon's open days. |
| `owner` | yes | `{"email": "…"}` — the owner's `/admin` login. |
| `heroPhoto` | no | The big photo at the top of the site. |

Service and stylist ids are shared by all salons: start them with the salon id (`sara-coupe`).
A photo is either a file name inside `salons/<slug>/photos/` (e.g. `"coupe.jpg"`, uploaded by the
script) or an `https://` address used as is.

## The demo: `pnpm setup-demo <salon-id>`

Turns a salon (e.g. `elegance`) into the showroom. It creates a dedicated demo login
(`demo+<salon-id>@demo.invalid`, or another domain with `--domain=`; never an owner's account),
flags the salon as the demo and records its **current** state as the snapshot the nightly reset
(03:00 Algiers) and the owner's "Réinitialiser la démo" button return to. The "Essayer la démo"
button then appears on that salon's `/admin`. Uses `.env.admin`; `--dry-run` writes nothing.

Re-running keeps the login, **rotates its password** (printed once; visitors never need it) and
**re-captures the snapshot**: run it when the salon looks the way prospects should see it.
