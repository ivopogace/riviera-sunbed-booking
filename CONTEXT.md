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
  discarded — ADR-0008). Every occupied slot is tourist-surfaced in the photo slideshows on the
  Discover card and the beach-map banner band; the **cover** leads both.
- **Photo slot** — one of a venue's three fixed photo positions: `COVER` (the first slide of both
  tourist slideshows), `SUNBEDS`, `BAR` (the later slides — and, as always, visible to the
  venue's own operator and, since #511, to a platform admin moderating them). At most one photo
  per `(venue, slot)`; uploading again replaces the slot; deleting erases metadata + bytes in one
  transaction.
- **Photo takedown** — the **platform admin's** removal of any venue's photo by `(venue, slot)`
  (#504) — the "remove" half of the report-and-remove moderation stance (ADR-0013, #230). Same
  single-transaction erase as the operator's own delete, driven through the same storage call, but
  role-gated on the platform-admin flag (`is_admin`) instead of venue ownership: it exists precisely
  to reach a venue the actor does **not** own, which the venue-scoped delete refuses with `403
  NOT_VENUE_OWNER`. Scoped to one **slot**, not one image — the same picture published in a second
  slot keeps serving from that slot's variants, so each published slot is its own takedown.
- **Photo moderation** — the platform admin's read-then-remove pair over any venue's photos (#511):
  the **Photo takedown** above plus the slot read that makes it operable
  (`GET /api/admin/venues/{venueId}/photos`). Both are ownership-free by design and share one port
  named for that posture. The read exists because the only other per-slot view is the venue-scoped
  operator profile, which answers a non-owner `403 NOT_VENUE_OWNER` — so before #511 an admin could
  delete a photo it had no way to look at. It answers **every** slot, empty ones as a null preview
  URL, and answers identically for an unknown venue, so it reports nothing about which venues exist.
- **Photo variant** — one stored rendition of a venue photo for a display surface: `CARD`
  (≤640×384), `BANNER` (≤1280×480), `PREVIEW` (≤480×360) — fit-within-resized progressive JPEGs,
  each served by its **content hash** at a public URL (`/api/venues/{venueId}/photos/{hash}`);
  a replace mints new hashes → new URLs, and a removed variant stops being served rather than
  outliving its removal in caches.
- **Venue visibility** — whether tourists can discover and book a venue: a venue is
  **visible iff its owning operator is `ACTIVE`** (#693) — derived, never a flag. Hidden
  means absent from the tourist list, 404 on the map and availability-calendar reads, and both
  booking paths refused;
  an unowned venue is hidden (fail-closed). Bookings sold while visible keep working.
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
- **Availability calendar** — how many of a venue's sets are free on each day across a
  window of dates, as counts rather than per-set state. A different question from
  **Availability** above, which is one set on one date: the calendar answers *which days
  are worth choosing*, so a tourist picks a date already knowing the answer instead of
  learning it after the map redraws. **A snapshot, never a hold** — a day showing free
  capacity can be full by the time a set is claimed; only the claim decides.
- **Booking** — a tourist's reservation of a specific set for a specific date, with
  a status, a price paid, a booking code, and a cancellation deadline.
- **Booking status** — the lifecycle state of a booking. Canonical set (mirrored 1:1
  by the `booking.status` CHECK constraint, V19 — keep enum and SQL in lockstep):
  `PENDING_REQUEST`, `AWAITING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `COMPLETED`,
  `NO_SHOW`, `DECLINED`, `EXPIRED` (Request-to-Book, shipped by #98), `WITHDRAWN`
  (the guest's own retraction of a pending request, #123 — V37).
- **Pending request / soft-hold** — a Request-to-Book booking awaiting the venue's
  decision (`PENDING_REQUEST`): it claims the same `availability(set, date)` row as any
  online booking (invariant #2) — the soft-hold — but no PaymentIntent exists and no card
  is charged until the venue accepts (payment-request-on-accept). It ends in one of three
  ways, one per party who can end it: the venue **declines** (`DECLINED`), nobody answers by
  the response deadline (`EXPIRED`), or the guest **withdraws** it (`WITHDRAWN`). Each frees
  the soft-hold. The deadline is
  min(request + `booking.request.expiry-window`, the venue's sales close); after accept
  the guest has min(accept + `booking.request.pay-window`, the end of the service day) to pay
  before the abandoned sweep cancels — never past the day's end, because once the day is
  over there is nothing left to buy (invariant #4).
- **Withdraw** — the guest's own retraction of their pending request, before the venue has
  decided (`WITHDRAWN`). Distinct from **cancel**, which ends a *confirmed* booking and carries
  a refund decision: a withdrawn request was never charged, so there is nothing to refund.
  Distinct from **decline** (the venue's no) and **expire** (nobody's answer) only in who acted.
- **Booking code** — the unguessable bearer credential staff verify on arrival.
- **Check-in** — staff recording, by scanning the booking's QR code or typing its
  booking code on the service date, that the guest arrived; transitions a confirmed
  booking to `COMPLETED`, exactly once.
- **No-show** — a confirmed booking whose service day passed without a check-in
  (`NO_SHOW`), written by the scheduled sweep, never by hand. Terminal: not cancellable and
  not check-in-able. It is **not** a refund — the guest paid and the venue held the set, so
  every money read that counts a delivered stay counts a no-show too. The one exception is
  the admin **weather refund**, which reaches a no-show on purpose: on a washed-out day
  those are the guests who stayed home because of the storm.
- **Sales close** — the moment a venue's online sales for a date close, on the date
  itself: a per-venue setting fixed at one of three wall-clock values (00:01 opts the
  venue out of same-day sales, 16:00 the default, or 23:59), `Europe/Tirane`. The point
  past which a booking can no longer be created for that date (invariant #4).
- **Cutoff** — the evening-before wall-clock boundary (default 18:00, `Europe/Tirane`,
  per-venue configurable). Governs free cancellation only — it no longer gates whether
  a booking can be created; that is sales close's job.
- **Booking mode** — how a venue accepts bookings: **Instant Book** (auto-confirm)
  or **Request-to-Book** (venue accepts/declines first).

## Money

- **Commission** — the platform's per-booking cut; rate stored per venue, in exact-integer basis
  points. Two readings of "the rate", and which one applies depends on the question (A7 #348):
  the **live rate** governs every *decision* made from now on (an accrual, a refund computation),
  while the **rate schedule** records which service dates a rate applied to, for figures that
  describe days already sold. Only the platform admin may change it — a venue does not set its own
  commission (O8 #177).
- **Rate schedule** — the per-venue record of which commission rate applied to bookings served on
  which dates. A change is **forward-only**: it pins the rate it supersedes and takes effect for
  reporting from the current service date (`Europe/Tirane`), so today's takings answer the same
  rate new accruals apply while a day already past never re-prices, and the payout ledger it must
  agree with is never rewritten (invariant #9). A venue whose rate has never changed has no
  schedule at all — its live rate is what applied throughout.
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
- **Refund progress** — how far a decided refund has actually travelled: **decided**
  (the cancellation fixed an amount the platform owes), **accepted** (the payment
  gateway has acknowledged it will return the money), **settled** (it has reached the
  guest's statement — not tracked in v1). A refund decided but not yet accepted is
  **outstanding**; guest-facing copy then says the refund is being processed, never
  that it is on its way. Where the gateway never collected, there is nothing to track
  and the question does not arise — absence is not a stuck refund.
- **Refund tier** — the policy outcome of a cancellation: **full** (cancelled before
  the cutoff), **partial** (after the cutoff, the venue's configurable late-cancel
  share), or **none** (after the cutoff, the venue offering 0 bps). Always computed
  server-side, and only within the **cancellation window**.
- **Cancellation window** — how long a confirmed booking may be cancelled at all:
  from booking until `00:00 Europe/Tirane` on the service date. Once the service day
  opens the window is **closed** — the cancellation is refused outright (not refunded
  at a tier), because the guest can already be consuming the stay. The venue's own
  weather refund is outside the window and stays available for past dates.

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
- **Data subject** — the identified person behind the PII (the tourist), the party who exercises
  the right to **erasure** (GDPR Art 17 / Law 9887). Distinct from the technical `customer` /
  `customer_account` rows that hold their data.
- **Erasure** — honouring a data subject's right to be forgotten (#101). Because bookings are
  retained tax records (the **statutory-retention exception**, GDPR Art 17(3)(b)), erasure does not
  delete rows — it **pseudonymizes in place** the `customer` + `customer_account` PII and deletes the
  transient SSO identities + recovery tokens, leaving the booking / payment / payout records intact.
  Self-service (a signed-in customer's own account) or admin-actioned by email (ADR-0010).
- **Tombstone** — an erased row kept for referential integrity but stripped of PII: `email` becomes a
  unique non-routable placeholder (`erased+<id>@erased.invalid`), name/phone become `ERASED`, the
  credential hash is nulled, and `erased_at` is stamped. A tombstoned account can no longer sign in.
- **Statutory-retention exception** — the legal duty to keep booking/payment/payout records for a
  retention period (tax/accounting) that **overrides** erasure for those rows; it is why erasure
  pseudonymizes rather than deletes, and why the payout ledger (which holds no PII) stays auditable
  (invariant #9).
- **Retention basis** — the fact that makes it lawful to still hold a guest's contact details: a
  booking of theirs dated on or after the retention cutoff. Any status counts (a cancelled or no-show
  booking still produced a financial record). When no basis remains, the contact must go — the
  storage-limitation duty (GDPR Art 5(1)(e)), the mirror image of the statutory-retention exception.
- **Retention window** — how far back a retention basis may reach; configuration, not a constant, and a
  **legal** determination rather than an engineering one. The cutoff is *today in `Europe/Tirane`* minus
  the window (invariant #6).
- **Retention sweep** — the scheduled job that tombstones guest contacts with no remaining retention
  basis (#101 Slice 2). Proactive where **erasure** is reactive, but it writes the same **tombstone**.
  It touches guest contacts only, never accounts, and never the retained financial records.

## Transactional mail

- **Suppression list** — the platform's do-not-mail record: the addresses no transactional mail
  may go to, because they hard-bounced or their recipient complained. It is a **durable
  deliverability record, not a cache** — entries are never deleted, and deliberately survive a
  tourist's **erasure** (ADR-0012), so someone who objected and later re-books with the same
  address stays protected. Stored non-identifiably (a peppered hash plus the bare domain), so
  nobody can read *who* is on it.
- **Suppressed address** — an address currently on that list. The one invariant the whole
  `notification` context exists to keep is *no send to a suppressed address*.
- **Reinstatement** — a platform admin deliberately lifting a suppression, so the address is
  mailable again. The remedy for a bounce that turned out to be temporary (a full mailbox, a
  domain that came back). It is **not a deletion**: the entry stays and is marked lifted, so the
  history survives and a later bounce simply suppresses it again. Always an ops judgment call,
  never self-service and never a side-effect of erasure.

  > Not to be confused with **operator reinstatement** below, which returns a *suspended operator
  > account* to `ACTIVE`. Same verb, unrelated subjects: one acts on an email address in the
  > do-not-mail record, the other on a person's ability to sign in.

## Operators (venue management side)

- **Operator** — an account that manages one or more venues (the venue's people, not the
  tourist). Owns the venues mapped to it; may act only on those. Distinct from the
  platform-wide admin surface.
- **Venue ownership** — the operator↔venue mapping that answers *"does this operator own
  this venue?"*. Every venue-scoped operation (beach-map edit, staff bookings, staff
  availability, weather refund, payout ledger) verifies it in the application service and
  returns **403** on a mismatch (object-level authorization, not role-level — invariant #13).
- **Operator approval** — a platform admin's decision on a self-registered (`PENDING`) operator:
  approve (→ `ACTIVE`) or reject (→ `REJECTED`, terminal). Since #694 a `PENDING` operator already
  signs in and uses the **entire** operator console — registering flows straight into it, and the
  venue it creates is its own — so approval gates **venue visibility** (whether tourists see and
  can book its venues), never console access. Rejection locks the account out and ends any live
  session it holds. `SUSPENDED` and `REJECTED` accounts cannot sign in.
- **Bootstrap operator** — the seeded `operator` account. **Retired as owns-all in #115** and
  **demoted to the platform admin** (`is_admin`): it no longer owns every venue — V29 dropped
  `owns_all_venues` and backfilled the venues it previously reached to it — and now approves operator
  self-registrations via the ADMIN-gated `/api/admin/operators`. Unlocked by `RIVIERA_OPERATOR_PASSWORD`
  (no new prod secret). Every operator is now strictly per-venue, owning what it creates
  (creator-owns-on-create).
- **Suspension / operator reinstatement** — an admin putting an `ACTIVE` operator account out of
  action (`SUSPENDED`) and later returning it to `ACTIVE`. Either transition kills that operator's
  live sessions immediately, so a suspension takes effect now rather than at their next sign-in —
  and, since #693, flips their venues' **venue visibility** (hidden while suspended, shown again
  on reinstatement; bookings already sold keep working either way).
  An admin cannot suspend itself. Distinct from **reinstatement** in *Transactional mail* above,
  which lifts a suppressed email address and has nothing to do with sign-in.
