# Domain glossary (ubiquitous language)

The canonical vocabulary for Riviera Sunbed Booking. Use these exact terms in code,
issues, commits, and conversation. This file is a **glossary only** — definitions,
not implementation. Rules live in `CLAUDE.md`; decisions in `docs/adr/`; the visual
model in `docs/architecture/domain-model.md`.

## Supply (venue side)

- **Venue** — a beach club / bar / hotel that owns sunbeds on its stretch of beach
  and publishes availability. Has a booking mode, a commission rate, and payout details.
- **Beach map** — a venue's visual layout: rows and individual set positions.
- **Set position** — one spot on the beach map (e.g. Row A, position 3), flagged
  by tier and pool, with its own price.
- **Set** — the bookable unit: **2 loungers + 1 umbrella**, full day, tied to a set
  position. The thing a tourist books.
- **Tier** — `PREMIUM` (front-row / better) or `STANDARD`; affects price.
- **Pool** — which channel a set belongs to: **online pool** (bookable in the app)
  or **walk-in pool** (held back for guests who arrive in person). A given set is in
  exactly one pool. Online bookings can only ever target online-pool sets.
- **Walk-in** — a guest who takes a set in person, without an app booking. Staff
  mark walk-in sets taken in the app.

## Booking & availability

- **Booking date** — the single full day a set is booked for; a `LocalDate` in
  `Europe/Tirane`.
- **Availability** — the live state of one set on one date: `FREE`,
  `BOOKED_ONLINE`, or `STAFF_MARKED` (walk-in). The single source of truth that the
  beach map renders. Keyed by `(set, date)`.
- **Booking** — a tourist's reservation of a specific set for a specific date, with
  a status, a price paid, a booking code, and a cancellation deadline.
- **Booking code** — the unguessable bearer credential staff verify on arrival.
- **Cutoff** — the moment online bookings for a day close (default 18:00 the
  evening before, `Europe/Tirane`). Doubles as the free-cancellation deadline.
- **Booking mode** — how a venue accepts bookings: **Instant Book** (auto-confirm)
  or **Request-to-Book** (venue accepts/declines first).

## Money

- **Commission** — the platform's per-booking cut; rate stored per venue.
- **Payout ledger** — the per-venue record of what is owed (booking amounts minus
  commission), entry-per-booking, reversed on refund.
- **Payout batch** — a period's worth of ledger entries settled together, paid to
  the venue manually via BKT.
- **Refund** — money returned to a tourist, by reason: policy, weather, or conflict.

## Demand (tourist side)

- **Tourist / Customer** — the person booking a set. Guest checkout (email only) is
  allowed; identity is intentionally light.
