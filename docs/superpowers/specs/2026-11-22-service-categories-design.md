# Service categories (more ready-made, owner's own) — design

Date: 2026-11-22. Status: discussed with the user; approach and layout chosen by the user. Points the user did not
state are marked **(my call)**.

## Why
Real salons have many services in many kinds. La Stella by HK (Oran, a real salon the user showed) lists **61
services in 5 categories**: Hydrafacial & Soins du Visage (9), Coiffure & Traitements Capillaires (14), Onglerie &
Soins des Mains / Pieds (11), Beauté du Regard (9), Épilation (18). Our 4 fixed categories (Packs, Coiffure, Beauté,
Spa) can't describe that: ~47 services would land in "Beauté", and the tabs from PR #30 wouldn't help.

## What the user decided
- **More ready-made categories** (Ongles, Visage, Épilation, …) that every salon can use.
- The owner can **add her own categories** when none of the ready-made ones fits.
- **Approach A:** ready-made categories keep **our names (FR + AR) and our order**; the owner can't rename, reorder
  or hide them. Her own categories come **after** them, in her order.
- **Layout** (sketch below):
  - **La carte:** ~~tabs that wrap~~ → **the same accordion as the booking step** (user, 2026-11-22, after seeing
    11 wrapped tabs: "crowded and messy"): one line per category with its number of services, the largest open,
    rows keep their photo, description and "Réserver".
  - **Booking, service step:** an **accordion** with **compact rows** (no photo), each category header showing
    its number of services and how many are ticked.

## Goals
1. The owner gives each service a ready-made category or one of her own, in the existing service form.
2. The owner creates, renames, reorders and deletes her own categories in Réglages.
3. Clients see every category the salon uses, in a stable order, on La carte and in the booking step, on a 320 px
   phone, in French and Arabic.
4. A salon of ~60 services in 5–8 categories is comfortable to browse (La carte) and to book from (booking step).

## Non-goals
- Renaming, reordering or hiding ready-made categories (approach B, rejected).
- Sub-categories.
- Price ranges ("600 – 2 500 DA"): noticed on La Stella, a separate decision **(my call: out of scope)**.
- Icons per category in the UI: `services.icon` is stored but not shown anywhere today; new categories just get a
  default icon **(my call)**.

## Anti-goals
- One salon seeing, or a service pointing at, another salon's category.
- A service left with no valid category, or a delete that silently changes or hides services or touches bookings.
- An empty category (ready-made or hers) shown to clients.
- A category the client can't reach on a phone (cut off, or hidden off the edge of a sideways-scrolling row).
- Sticky bars or buttons (the user dislikes them).

## Ready-made categories **(my call — the user saw this list and didn't correct it)**
In display order. Keys are stored in `services.category`; names live in the app's translations.

| key | FR | AR |
|---|---|---|
| `pack` | Packs | الباقات |
| `coiffure` | Coiffure | تصفيف الشعر |
| `capillaire` | Soins capillaires | العناية بالشعر |
| `visage` | Visage | العناية بالوجه |
| `regard` | Regard (cils & sourcils) | الرموش والحواجب |
| `ongles` | Ongles | الأظافر |
| `epilation` | Épilation | إزالة الشعر |
| `maquillage` | Maquillage | المكياج |
| `beaute` | Beauté | جمال |
| `spa` | Spa & hammam | سبا وحمّام |
| `massage` | Massage | تدليك |

`beaute` and `spa` keep their keys so existing services are untouched (`spa`'s label changes to "Spa & hammam").
Owners' categories follow, in her order. Arabic wording to be checked by the user while reading **(my call)**.

## Approaches considered (storage)
- **A1 — chosen (my call; the user handed over the how):** a new per-salon table `public.salon_categories` for the
  owner's categories; a service of one of hers has `category = 'custom'` and a nullable
  `custom_category_id` with a **composite FK `(salon_id, custom_category_id)`** to it, plus a table check
  `(category = 'custom') = (custom_category_id is not null)`. Ready-made categories stay a plain key. The FK makes a
  cross-salon link impossible and blocks deleting a category still in use.
- A2 — `services.category` holds either a ready-made key or a custom id: no FK possible, integrity by trigger only.
  Rejected: weaker guarantee for the worst bug class.
- A3 — every category is a row (ready-made ones copied into each salon), services reference rows: strongest
  model but duplicates ready-made categories per salon and invites renaming them, which goes against approach A.

## Design

### Database (new migration; never edit pushed ones)
- `public.salon_categories (salon_id text not null references salons, id text, name jsonb {fr, ar}, sort_order
  int, primary key/unique (salon_id, id))`. Ids are globally unique and, from the launch script, start with the
  salon id, as `salons/README.md` already asks for service ids **(my call)**. A name equal to a ready-made
  category's is allowed **(my call)**. RLS on; public read filtered by salon like `services`; no write grants or policies.
- `services`: add `custom_category_id`, the composite FK (`on delete restrict`), and the check above. Packs stay
  `category = 'pack'` (a pack can't be custom).
- Allowed `category` values everywhere become the ready-made keys + `custom`. Update the checks in
  `admin_save_service` (new optional trailing param `p_custom_category_id`, keeping existing callers working) and
  `private.provision_service`. `private.category_icon` gets defaults for the new keys and `custom`.
- Owner RPCs (`security definer`, scoped by `my_salon()`, `not_authorized` for non-staff, another salon's id behaves
  as `not_found`): `admin_save_category(p_id, p_name, p_sort_order)` (create or rename/reorder; empty AR name stored
  as FR, like other settings), `admin_delete_category(p_id)` raising **`category_in_use`** while any service of the
  salon (hidden ones included) uses it, `admin_move_category` or a sort-order param for reordering
  **(builder's call)**. Demo role may manage categories like other settings **(my call)**.
- Isolation tests for each new function in `10_isolation.test.sql` and register them in `11_guard.test.sql`.
- **Demo:** the snapshot captures the demo salon's categories. `demo_reset` deletes the prospect's services, then
  re-applies the snapshot's categories and services (categories first), and **only then** deletes the categories
  that aren't in the snapshot: the snapshot's services are re-applied in place, so a prospect may have moved one
  into a category she created, and deleting that category earlier would hit the `on delete restrict` FK
  **(my call, from the review)**. pgTAP test for that case.
- **Launch script:** `salons/<slug>.json` may carry `categories[] {id, name: {fr, ar?}}` (order = list order);
  a service uses `"category": "<ready-made key>"` or `"category": "custom:<id>"` **(my call on the syntax)**.
  `provision_salon` writes categories before services and keeps categories a payload doesn't mention.
  `salons/README.md` documents it.

### Front end
- `src/data/categories.ts`: the ready-made list grows; grouping works on a **category key**: a ready-made key, or
  `custom:<id>` for hers. Order: ready-made in list order, then hers by `sort_order`. Empty groups are dropped (as
  today). Label: ready-made → `t('category.<key>')`; hers → `name[lang]`. Unknown key → `coiffure` (as today).
- Fetch the salon's categories with the services (public read, `.eq('salon_id', …)`), `staleTime` like services.
- **La carte** (`Services.tsx`) **(amended 2026-11-22, user):** an accordion like the booking step — one header per
  category (name · "n prestations", chevron), several may be open, the largest open at first (ties in display
  order); rows unchanged (photo thumbnail, description, price with promo, duration, "Réserver"). One category: no
  headers. `CategoryTabs` is removed.
- **Category thumbnails on La carte (user, 2026-11-22):** each La carte header shows a small thumbnail (~56 px,
  lazy) — the photo of the category's first service *that has one*. Shown **only when every category has a photo**
  (otherwise none, to avoid a mixed look), and **hidden while that category is open** (its first row shows it just
  below). Decorative (`alt=""`). Not in the booking step. No owner-chosen category photo for now.

  ```
  Coiffure · 14 prestations        ▴
    Brushing ............ 1 500 DA
    Coupe + Brushing .... 2 500 DA
  ─────────────────────────────────
  Visage · 9 prestations           ▾
  ─────────────────────────────────
  Ongles · 11 prestations          ▾
  ```
- **Booking step 0** (`Booking.tsx`): replaces PR #30's tabs with an **accordion**: one header per category
  (name · "n prestations" · a badge with the number ticked), **compact rows** (name, price with promo, duration,
  tick; no photo, no description) **(my call: description dropped here, still on La carte)**. A pack's row keeps
  its "Comprend : …" line, so a client never picks a pack without seeing what's in it **(my call)**. Starts with one
  section open: the tapped service's category when coming from La carte, otherwise the largest. Several sections
  may be open at once **(my call)**. One category: no accordion, just the rows. Running total, max 4, packs
  behaviour, unavailable-parts handling unchanged.

  ```
  ▸ Coiffure · 14 prestations      ①
  ▾ Ongles · 11 prestations
     ☐ Pose gel ......... 3 000 DA · 60 min
     ☑ Vernis ........... 800 DA · 20 min
  ▸ Épilation · 18 prestations
  ```
  Accessible: each header a button with `aria-expanded`/`aria-controls`, ≥ 44 px; Radix Accordion is already a
  dependency family in use (`@radix-ui/*`) — use it if installed, else a plain disclosure **(builder's call)**.
- **Réglages:** a new section **Catégories** (`/admin/settings/categories`): her categories in order, add, rename
  (FR/AR), move up/down, delete (asks first with `useConfirm`, toast after; `category_in_use` shown inline with the
  number of services to move). The service form's category select lists the ready-made categories, then hers
  under a separator. The services list in Réglages, the owner's booking-sheet service picker and the stylists'
  service checklist group the same way **(my call)**.
- Re-running the launch script treats categories the way it treats services today **(my call)**.
- Every new string in `fr` and `ar`. Logical CSS properties. lucide icons only.

### Demo content (the user: "yes, update the demo too")
After the code is merged **and live**, with the user (live data, not a migration): move the demo's services into
the new categories (Manucure & Vernis → Ongles, Soin du Visage → Visage, Maquillage Professionnel → Maquillage), add
one owner-made example category ("Soins mariée", with one service), then re-capture the snapshot with
`pnpm setup-demo elegance` so the nightly reset keeps it. The plan ends with these steps as a checklist.

### PR #30
Not merged. This work builds on its branch (`feat/category-tabs`) and replaces it with one PR **(my call)**.

## Left to the builder
Exact table/column names, the reorder RPC shape, whether ids are generated server-side, and test layout — within
the rules in CLAUDE.md ("Adding a table or a public function", security definer scoping, no blanket revokes).
