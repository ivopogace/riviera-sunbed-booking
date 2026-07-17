# Domain glossary (ubiquitous language)

The canonical vocabulary for Riviera Sunbed Booking. Use these exact terms in code,
issues, commits, and conversation. This file is a **glossary only** — definitions,
not implementation. Rules live in `CLAUDE.md`; decisions in `docs/adr/`; the visual
model in `docs/architecture/domain-model.md`.

## Supply (venue side)

- **Venue** — a beach club / bar / hotel that owns sunbeds on its stretch of beach
  and publishes availability. Has a booking mode, a commission rate, and payout details.
- **Amenities** — a venue's facilities, shown as tags on the discovery card and the beach-map
  page. A **fixed platform catalogue** (Beach bar, Restaurant, Cafe, Free parking, Showers, WiFi,
  Water sports, Pet friendly, Snack shack, Snorkelling, Quiet bay); a venue holds an
  order-insensitive subset, validated server-side against the catalogue (an unknown tag → 400).
- **Distance to water** — how far a venue's sunbeds sit from the shoreline: an optional positive
  integer in metres (rendered "15m to water").
- **Venue photo** — venue profile media (#142): one image per photo slot, uploaded by the venue's
  operator, validated server-side (JPEG/PNG/WebP, ≤25 MB, real-bytes magic check, decompression-bomb
  guard), EXIF-stripped, and persisted only as its resized variants (the full-res upload is
  discarded — ADR-0008). Only the **cover** slot is tourist-surfaced.
- **Photo slot** — one of a venue's three fixed photo positions: `COVER` (shown on the Discover
  card + beach-map banner), `SUNBEDS`, `BAR` (stored, operator-preview only). At most one photo
  per `(venue, slot)`; uploading again replaces the slot; deleting erases metadata + bytes in one
  transaction.
- **Photo variant** — one stored rendition of a venue photo for a display surface: `CARD`
  (≤640×384), `BANNER` (≤1280×480), `PREVIEW` (≤480×360) — fit-within-resized progressive JPEGs,
  each served by its **content hash** at an immutable, long-cached public URL
  (`/api/venues/{venueId}/photos/{hash}`); a replace mints new hashes → new URLs.
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
- **Booking status** — the lifecycle state of a booking. Canonical set (mirrored 1:1
  by the `booking.status` CHECK constraint, V19 — keep enum and SQL in lockstep):
  `PENDING_REQUEST`, `AWAITING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `COMPLETED`,
  `NO_SHOW`, `DECLINED`, `EXPIRED` (the last three are Request-to-Book, shipped by #98).
- **Pending request / soft-hold** — a Request-to-Book booking awaiting the venue's
  decision (`PENDING_REQUEST`): it claims the same `availability(set, date)` row as any
  online booking (invariant #2) — the soft-hold — but no PaymentIntent exists and no card
  is charged until the venue accepts (payment-request-on-accept). Released on decline
  (`DECLINED`) or when the response deadline passes (`EXPIRED`, swept). The deadline is
  min(request + `booking.request.expiry-window`, the evening-before cutoff); after accept
  the guest has `booking.request.pay-window` (from accept) to pay before the abandoned
  sweep cancels.
- **Booking code** — the unguessable bearer credential staff verify on arrival.
- **Cutoff** — the moment online bookings for a day close (default 18:00 the
  evening before, `Europe/Tirane`). Doubles as the free-cancellation deadline.
- **Booking mode** — how a venue accepts bookings: **Instant Book** (auto-confirm)
  or **Request-to-Book** (venue accepts/declines first).

## Money

- **Commission** — the platform's per-booking cut; rate stored per venue.
- **Payout ledger** — the per-venue record of what is owed (booking amounts minus
  commission), entry-per-booking, reversed on refund.
- **Accrual** — a payout-ledger entry that adds what the platform owes a venue for a
  confirmed booking (`net = gross − commission`).
- **Reversal** — a payout-ledger entry that backs out an accrual when a booking is
  refunded. **Proportional to the refund**: a full refund reverses the whole accrual,
  a partial refund reverses the matching fraction, no refund posts no reversal.
- **Payout batch** — a period's worth of ledger entries settled together, paid to
  the venue manually via BKT.
- **Refund** — money returned to a tourist, by reason: policy, weather, or conflict.
- **Refund tier** — the policy outcome of a cancellation: **full** (cancelled before
  the cutoff), **partial** (after the cutoff, the venue's configurable late-cancel
  share), or **none** (after the cutoff, non-refundable). Always computed server-side.

## Demand (tourist side)

- **Tourist / Customer** — the person booking a set. Guest checkout (email only) is
  allowed; an **account** is optional (S2 #111).
- **Customer account** — a registered tourist identity (email + opaque credential hash) for
  register / sign-in via a server-side session. Deliberately **separate** from the
  guest-checkout contact row (no foreign key): registering never auto-claims a guest email's
  past bookings — back-linking guest bookings is a **permanent non-goal** (design D-6, amended
  at S8). The account's credential hash is stored by `customer`; all login machinery lives at
  the platform edge (RV-BE-11).
- **Email verification** — a soft, non-blocking signal that a customer account's email was
  proven owned (`email_verified`, S8 #113). Set by visiting a tokenized link mailed at
  registration, or granted automatically for SSO-created accounts (provider-verified).
  Informational in v1 — it gates no sign-in or booking.
- **Recovery token** — a single-use, expiring, **hashed** bearer credential mailed to an
  account's email for one of two purposes: **verify-email** or **reset-password**
  (`customer_account_token`, S8 #113). Treated like a secret (invariant #7); consumed on redeem.

## Operators (venue management side)

- **Operator** — an account that manages one or more venues (the venue's people, not the
  tourist). Owns the venues mapped to it; may act only on those. Distinct from the
  platform-wide admin surface.
- **Venue ownership** — the operator↔venue mapping that answers *"does this operator own
  this venue?"*. Every venue-scoped operation (beach-map edit, staff bookings, staff
  availability, weather refund, payout ledger) verifies it in the application service and
  returns **403** on a mismatch (object-level authorization, not role-level — invariant #13).
- **Bootstrap operator** — the interim account flagged *owns-all-venues*. Per-operator
  DB-backed credentials have landed (#74), so it is no longer a shared login — it remains
  only as the owns-all bridge until every operator is strictly per-venue. A launch
  bridge, not the target.
