# Statistiques for the owner — design (short)

Date: 2026-11-23. Status: proposed by me, approved by the user ("yes go ahead and build it").

## Why
The owner only saw one day at a time (bookings, income, occupancy under the agenda). She needs the period's picture:
is the month better than the last, which coiffeuse is under-booked, is the website bringing clients.

## What
- A Statistiques screen (`/admin/stats`), from a chart icon next to the Réglages gear.
- Period: this week (Mon–Sun) / this month / last month / last 3 months (this month and the two before).
- Key figures against the previous period of the same length: income, visits (+ pending), occupancy, new clients
  ("sur N clientes").
- Per coiffeuse (bookings · income · occupancy), the 5 most booked services (count · income), the website's
  requests (requests · confirmed · refused · waiting, and the share of confirmed visits that came from the site).

## Counting rules
Confirmed bookings only for income, visits, clients and booked minutes (the price recorded on each booking,
promotions included; a multi-part visit counts once); pending counted apart; cancelled never. Capacity = each
active coiffeuse's working days × that day's opening minutes. New client = a phone with no earlier non-cancelled
booking at the salon. A period is by visit day (Algiers), at most a year.

## Approaches
- **Chosen:** one `security definer` RPC, `admin_stats(p_from, p_to)`, scoped by `my_salon()`, returning totals only
  (no client name or phone) — light, correct for returning clients, works for the demo (phones masked).
- Rejected: aggregating `admin_list_bookings` rows in the browser — heavy over 3 months and can't count returning
  clients on the demo (masked phones).

## Not in this version
Charts over time, export, no-shows (needs a "came / didn't come" status first).
