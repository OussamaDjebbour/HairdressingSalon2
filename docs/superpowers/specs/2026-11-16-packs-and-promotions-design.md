# Packs and promotions — design

Date: 2026-11-16. Status: discussed with the user; approach chosen by the user. Points the user did not state are
marked **(my call)**.

## Why
Salon owners sell **packs** (several services from different categories at one price) and sometimes run
**promotions** on some services. Today a service has one price and nothing else; the owner has no way to put either
on her site.

## What the user decided
- A pack is done **in a single appointment**.
- For the client, a pack is **one product**: one line in La carte, one choice in the booking, one price.
- Packs are done by **several people**, and **the owner checks and organises her team herself** (as she does today
  when a client calls). So the site books a pack **like one service**: one total duration the owner sets, in the
  agenda of **one person responsible**; the owner confirms the request on WhatsApp after checking her team.
- Packs have **more than 5 services** — with this model that's display only, no limit applies to the parts.
- Promotions: **on some services, for a few days, shown as a crossed-out price**.
- The promotion's days are **the days the client books** (option A): a booking made during the promotion gets the
  promo price, whatever the appointment date.
- Approach A (below): a pack is a kind of service; promotions are set on each service.

## Goals
1. The owner creates, edits and hides packs in Réglages: name, description, photo, price, total duration, person
   responsible, included services.
2. Clients see packs in La carte and book one like a service, without a stylist step.
3. The owner puts a promotion on any service or pack: promo price, first day, last day. It starts and ends by itself.
4. While a promotion runs, the site shows the crossed-out regular price and the promo price, and every booking made
   that day records the promo price.

## Non-goals
- Placing a pack's parts in several people's agendas, or in parallel (the owner organises her team).
- Multi-day packs.
- Named campaigns covering many services ("Promo Aïd" at −20 % on everything) — a promotion is set per service.
- Percent-off promotions — the owner types the promo price **(my call; she thinks in DA)**.
- Packs in the launch script (`salons/<slug>.json`): owners create packs in Réglages **(my call)**.

## Anti-goals
- A client charged (or shown) a price different from the one recorded on her booking.
- A promotion that silently never ends, or one that changes the price of bookings already made.
- A pack bookable online with nobody responsible (hidden or inactive person).

## The design

### Packs (a pack is a service)
- Stored as a service in a new category **`pack`**, after `coiffure`, `beaute`, `spa` in the data but **shown first**
  in La carte under "Packs" **(my call: the offer she most wants to show)**. All existing service behaviour applies:
  price frozen on the booking, photo upload, hiding, sort order, the affected-bookings list, the agenda block.
- Two extra details, only for packs:
  - **included services**: a list of the salon's own services (same salon only, never another pack), shown to
    clients as "Coupe, couleur, manucure…"; display only. A hidden included service is still listed **(my call:
    it's still part of what she sells)**.
  - **person responsible**: one active stylist of the salon. Stored as the only `stylist_services` row for that
    pack, so the existing "who offers this service" rule makes her the only one bookable for it.
- Duration: the owner types the total (15-minute steps, up to 600 minutes — the existing service bounds).
- Booking: a pack counts as **one of the client's 4 picks** (it can be combined with other services) **(my call)**.
  The stylist step is skipped for a pack; when the visit also has other services, only those show staff choices.
- If the person responsible is hidden or inactive, the pack isn't bookable online (existing rule) and Réglages says
  so on the pack.

### Promotions (per service or pack)
- Three optional details on a service: **promo price** (DA, strictly below the regular price), **first day**, **last
  day** (Algiers dates, inclusive, first ≤ last).
- The **effective price** is the promo price on days from first to last (by the Algiers date at booking time),
  else the regular price. One database function computes it, and every booking path uses it: online visits
  (`get_visit_slots` totals if any, `create_visit`), the older `create_booking`, and the owner's own bookings
  (`admin_create_booking`, and `admin_update_booking` when the service changes) **(my call: one rule everywhere)**.
- A booking keeps the price it was made at (already true): a promotion never changes bookings already made, and
  editing a promotion never changes them either.
- Display: wherever a price is shown to the client — La carte, the booking's service step, the running total, the
  summary, the success screen — a running promotion shows the regular price crossed out next to the promo price.
  The web shows the promo by the device's Algiers date but **the server decides** the recorded price.
- Réglages → Services (and Packs): a "Promotion" part in the form with the price and the two days; the list marks
  services with a running or upcoming promotion. Ending one early = setting its last day to yesterday, or clearing it.

### What the owner sees in Réglages (sketch)
```
 Packs                                  [ + Nouveau pack ]
 Pack Mariée          25 000 DA · 5 h · Amina
   Coupe, couleur, manucure, maquillage, soin visage
   Promotion : 22 000 DA du 1 au 7 mars
```

### Rules settled after review (all my calls)
- **A pack stays a pack.** Its category can't be changed, and a service can't be turned into a pack; the owner
  creates packs as packs. The included list is editable at any time (display only, no effect on bookings). It is
  stored on the pack as a list of the salon's service ids, validated by the owner function (same salon, not a pack)
  — no new table.
- **The person responsible is required** to save a pack (no drafts); hiding her makes the pack unbookable online
  and Réglages says so.
- **Editing a booking keeps its price** unless its service changes (today's rule): changing only the date, time or
  person never re-prices it, even after a promotion ended.
- **Shown price = recorded price.** The client page sends the total it showed; if the server's price differs
  (a promotion just started or ended, e.g. across midnight), `create_visit` refuses with a new `price_changed`
  code, the page refreshes the prices and the confirm step says "Le prix a changé" with the new total. The new
  parameter is optional so older pages keep working.
- **A pack combined with other services** is placed back to back like any part; the existing no-overlap rule
  covers the case where the person responsible also does another picked service.
- **Packs come first in the booking's service step too**, not only in La carte.
- **The demo shows packs and promotions.** The demo snapshot carries packs (category, included services, person
  responsible) and promotions, so a pitch can show a pack and a crossed-out price; `provision_salon` accepts the
  new fields and the nightly reset restores them. The demo account may create and edit packs and promotions like
  other settings (reset nightly).

## Constraints
- Salon isolation: included services and the person responsible must belong to the owner's salon; owner functions
  take no salon id; a pack's included services can't reference another salon's services (isolation + guard tests).
- No change to the abuse limits or the visit rules; a pack is one part of a visit.
- Strings in fr and ar; logical CSS; no sticky UI; `pnpm check:bundle` without raising the cap; the client page
  keeps the luxe look (crossed price in the display serif, quiet).
- The demo: see "The demo shows packs and promotions" above; `private.demo_reset` keeps working and its tests
  cover the new fields.

## Approaches considered
- **A. A pack is a kind of service; promotions per service (chosen).** Reuses availability, booking, the frozen
  price, the agenda, photos, hiding. Limit: one person responsible per pack — which is the decided model.
- B. Packs as their own tables and path through booking and the agenda: more flexible, about twice the work and risk.
- C. Promotions as named campaigns across services: a new concept and screen; per-service promotions are enough.

## Left to the builder
Column names and types, the price function's name, how the Réglages pack form is split (a "Packs" section vs a
pack mode of the service form), exact copy beyond the strings above, and test fixtures.
