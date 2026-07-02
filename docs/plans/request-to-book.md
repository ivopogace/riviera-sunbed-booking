# Request-to-Book (issue #98) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tourist can *request* a set at a Request-mode venue (no charge, soft-hold on the
`(set, date)` row); the venue accepts (→ `AWAITING_PAYMENT` + fresh PaymentIntent, guest pays,
verified webhook confirms) or declines/lets it expire (→ hold released, terminal state, no money
moved) — with Instant-mode behavior byte-for-byte unchanged.

**Architecture:** The soft-hold **reuses the existing availability claim unchanged** — a pending
request claims `set_availability` as `BOOKED_ONLINE` exactly like an instant booking, because
`availability` records *that* a set is held, never *why* (RESPONSIBILITIES.md); the request
lifecycle lives entirely in `booking`. Accept is **payment-request-on-accept** (locked by
`riviera-stripe-payments`, NOT auth-and-capture): a fresh PaymentIntent via the existing
`payment::api` `CheckoutPort` at accept time, then the existing Elements/webhook spine. Expiry is a
**lockless** `@Scheduled` sweep (guarded `UPDATE … RETURNING`), matching the abandoned-payment
sweep's documented single-instance posture (improvement-plan D1; the stripe skill's
"ShedLock-guarded" phrasing is stale — the shipped sweep is lockless).

**Persistence:** JDBC only (invariant #1). Touches: `booking` (V19: widen `booking_status_check`,
add `request_expires_at`, `accepted_at`, two partial sweep indexes), `payment` (V19: nullable
`client_secret`). No `availability` schema change.

**Source of intent:** issue #98 (parent epic #93, workstream D1); design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` §3 (booking modes);
`.claude/skills/riviera-stripe-payments/SKILL.md` (the locked money model).

**Skills consulted:** `riviera-plan-doc` (this template + AC discipline), `grilling` (issue-intake
gate: surfaced the accepted-request-vs-instant-TTL sweep interaction, the lockless-vs-ShedLock doc
conflict, and the four product decisions below), `riviera-stripe-payments`
(payment-request-on-accept, idempotency-key reuse, webhook-as-truth), `postgres` (TEXT+CHECK
widening, TIMESTAMPTZ, partial sweep indexes over full-column ones), `riviera-modulith` (request
slice placement in `booking/application/request/`, `CheckoutPort` as the purposeful conversation to
widen rather than a fifth port, no new published events → no EPR migration). Loading at implement
time (recorded here in advance; will be re-announced then): `riviera-java-conventions` +
`riviera-local-debug` (first backend phase), `codebase-design` (if any seam judgment call arises),
`angular-developer` + angular-cli MCP + `playwright-cli` (FE phases).

**Branch:** `claude/riviera-booking-acceptance-dsfram` — the cloud session's designated remote
branch, standing in for `feature/request-to-book` per the SDLC remote addendum.

---

## Acceptance criteria (testable)

Written at the application boundary (inner hexagon); HTTP/Angular specifics are pinned by
adapter-level tests named alongside.

- [x] **AC-1:** Given a REQUEST-mode venue with a free online-pool set and a pre-cutoff date, when
  `CreateBooking.create` runs, then the outcome is `Requested`: the booking is `PENDING_REQUEST`
  with `request_expires_at = min(now + expiry-window, evening-before cutoff)`, the
  `(set, date)` availability row is claimed, **no PaymentIntent exists and no `CheckoutPort` call
  happens**, and the code has invariant-#7 entropy (existing generator).
  *Pinned by:* `CreateBookingServiceTest` (request branch, gateway never invoked),
  `RequestToBookFlowIT` (adapter: `202` + `PENDING_REQUEST` body).
- [x] **AC-2:** Given a pending request holds `(set, date)`, when a concurrent online booking (or
  request) targets the same row, then exactly one claim succeeds (`SET_TAKEN` for the loser), and a
  staff mark on the same row is `ALREADY_TAKEN` (invariant #2 — same single row, same atomic claim).
  *Pinned by:* `ConcurrentRequestClaimIT` (two racing requests → one `PENDING_REQUEST`),
  `RequestToBookFlowIT.staffMarkBlockedWhilePending`.
- [x] **AC-3:** Given a pending, unexpired request, when the owning operator accepts, then the
  booking transitions `PENDING_REQUEST → AWAITING_PAYMENT` (recording `accepted_at`), a **fresh
  PaymentIntent** is initiated via the existing `CheckoutPort` (idempotency key `booking-<id>-pi`),
  and from there the flow is the existing spine: the signature-verified webhook confirms,
  `BookingConfirmed` is published once, the payout ledger accrues exactly once (invariants #8, #9).
  *Pinned by:* `RespondToRequestServiceTest` (transition + port call),
  `RequestAcceptPayIT` (accept → webhook → CONFIRMED + single ledger row).
- [x] **AC-4:** Given a pending request, when the owning operator declines (or the request expires),
  then the booking is terminally `DECLINED` (/`EXPIRED`), the availability row is released, and a
  subsequent accept/pay/confirm attempt is rejected — a declined/expired request can never be paid.
  *Pinned by:* `RespondToRequestServiceTest.declineReleasesHold`,
  `ExpireRequestsServiceTest.expiredRequestCannotBeAccepted`.
- [x] **AC-5:** Given a `PENDING_REQUEST` past its `request_expires_at`, when the request-expiry
  sweep runs, then the guarded transition (`UPDATE … WHERE status='PENDING_REQUEST' AND
  request_expires_at <= now … RETURNING`) moves it to `EXPIRED` and releases the claim — honoring
  the configured window, safe to run on the (documented) single instance without a lock, and a
  concurrent accept and sweep cannot both win.
  *Pinned by:* `ExpireRequestsServiceTest`, `RequestExpiryVsAcceptRaceIT`.
- [x] **AC-6:** Given an accepted request whose guest never pays, when the abandoned-payment sweep
  runs, then the booking is expirable only after `accepted_at + pay-window` (NOT `created_at +
  instant-TTL` — an accepted request must not be swept by the instant clock), and the existing
  cancel-PI-then-release machinery applies unchanged.
  *Pinned by:* `AbandonedBookingSweepServiceTest` (extended: accepted-request uses the pay-window
  clock; instant bookings unaffected).
- [x] **AC-7:** Given an operator who does not own the venue, when they call accept, decline, or the
  pending-requests query, then the application service rejects with `NotVenueOwnerException` → `403
  NOT_VENUE_OWNER` (invariant #13, check in the service not the controller).
  *Pinned by:* `CrossVenueDenialIT` (three new denial rows + owner-positive counterparts).
- [x] **AC-8:** Given the V19 migration, when the enum and schema are compared, then
  `BookingStatus` and the `booking_status_check` CHECK constraint hold the identical set
  (`PENDING_REQUEST, AWAITING_PAYMENT, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW, DECLINED,
  EXPIRED`) — enum + migration land in lockstep (invariant #12).
  *Pinned by:* `BookingMigrationIT.everyEnumStatusAccepted` + `unknownStatusRejected` (folded into the existing migration IT rather than a new class).
- [x] **AC-9:** Given an INSTANT-mode venue, when the full existing booking/cancel/webhook/sweep
  suite runs, then it is green unchanged (regression).
  *Pinned by:* existing `booking`/`payment`/`availability` suites in CI.
- [x] **AC-10:** Given a guest's booking code, when they fetch their booking, then the view exposes
  the request status (`PENDING_REQUEST` + deadline / `AWAITING_PAYMENT` + payment credentials /
  `DECLINED` / `EXPIRED`) so the in-app page is the acceptance channel (decision Q3).
  *Pinned by:* `ViewBookingServiceTest`, `RequestAcceptPayIT` (GET carries clientSecret once accepted).
- [x] **AC-11:** Tourist request flow (request CTA on a REQUEST venue, pending status page,
  pay-on-accept) and operator pending queue (list + accept/decline) ship with mocked-suite e2e +
  axe coverage.
  *Pinned by:* `frontend/e2e/request-to-book.e2e.ts`, `frontend/e2e/staff-requests.e2e.ts`.

## Non-goals

- **No email/SMS/push notification infrastructure** — guest acceptance channel is in-app status
  only (decision Q3); follow-up issue filed at close-out.
- **No auth-and-capture / manual-capture PaymentIntent** — explicitly retracted in
  `riviera-stripe-payments`; any doc implying it is stale.
- **No ShedLock / distributed locking** — v1 posture is lockless-on-one-instance, same as the
  abandoned sweep (improvement-plan D1/D3); this plan documents the constraint, D3 owns scale-out.
- **No full #118 migration** — this slice is born-on-typed only (decision Q4): it introduces
  `InvalidApiRequestException` + its handler mapping and uses it in code this slice adds/touches;
  the 3 existing DTOs, payout parsing, and IAE-handler narrowing stay in #118.
- **No per-venue expiry/pay windows** — both are global config values in v1.
- **No availability-state vocabulary change** — the soft-hold reuses `BOOKED_ONLINE`; no
  `REQUEST_HELD` state, no V4 CHECK change, `availability` module untouched.
- **No Stripe Connect** (standing, ADR-0002).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two concurrent requests (or request vs instant booking) claim the same `(set, date)` | med | high | Reuse the shipped atomic `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING` claim — no new claim path; `ConcurrentRequestClaimIT` | agent | |
| R-2 | The instant 15-min abandoned sweep cancels an accepted request before the guest can pay (sweep keys on `created_at`) | high (if unaddressed) | high | `accepted_at` column; sweep query branches: instant candidates (`accepted_at IS NULL AND created_at < :instantCutoff`) vs accepted (`accepted_at < :payCutoff`); pinned by AC-6 | agent | |
| R-3 | Accept races the expiry sweep (or a second accept/decline) | med | med | All transitions are guarded `UPDATE … WHERE status='PENDING_REQUEST' [AND request_expires_at > now] … RETURNING` — disjoint predicates, at most one winner; `RequestExpiryVsAcceptRaceIT` | agent | |
| R-4 | PI creation fails at accept → booking stuck `AWAITING_PAYMENT` with no PI | low | med | Compensating guarded revert to `PENDING_REQUEST` on `PaymentOutcome.Failed` (mirrors instant flow's compensate-on-fail); typed outcome `PaymentInitFailed` → 502 `PAYMENT_INIT_FAILED`; retry reuses idempotency key `booking-<id>-pi` | agent | |
| R-5 | Double PI / double charge on accept retry or webhook re-delivery | low | high | Existing machinery: Stripe idempotency key per booking, webhook dedupe on event id, idempotent `confirmFromPayment`; `payment_booking_uniq` UNIQUE(booking_ref) makes a second PI row impossible | agent | |
| R-6 | Booking code leaks into operator pending queue / logs / ProblemDetail (invariant #7) | med | med | Queue view is **id-based, no code**; accept/decline paths use `bookingId`; errors built via `ApiProblem` (instance redacted by construction); review-gate check | agent | |
| R-7 | `client_secret` exposure via `GET /api/bookings/{code}` | med | low | Secret only returned while `AWAITING_PAYMENT` and only on the code-authenticated view (the code is already the bearer credential, ADR-0006); it is payer-scoped by Stripe design | agent | |
| R-8 | Second lockless scheduler ships while the single-instance constraint is still undocumented (improvement-plan gap #7/D3) | high | med | This slice adds the deploy-runbook note (`docs/deploy/production-hardening.md`) covering BOTH sweeps | agent | |
| R-9 | Mode check missing → REQUEST venue silently gets instant-booked (or vice versa) | med | high | `SetBookingInfo` gains `BookingMode`; `ReserveSetService` branches on it; `RequestToBookFlowIT` + instant regression suite | agent | |
| R-10 | New endpoints drift off the #97 error contract | low | med | Sealed outcomes → `switch` → `ApiProblem.response(...)`; no `@ExceptionHandler` (locked by `ErrorContractArchitectureTests`); stable codes listed in FE↔BE contract below | agent | |

## Open questions / Assumptions

### Resolved

- **Expiry window default vs cutoff (#4)** — *Resolved (user, 2026-07-02):* deadline =
  `min(requestedAt + booking.request.expiry-window [PT24H], evening-before cutoff)`. Accept is
  guarded by the stored deadline, so acceptance after bookings close is impossible by construction.
- **Pay window after accept** — *Resolved (user, 2026-07-02):* `booking.request.pay-window`
  default `PT12H`, measured from `accepted_at`; enforced by the extended abandoned sweep.
- **How the guest learns of acceptance** — *Resolved (user, 2026-07-02):* in-app status only; the
  `booking/:code` page is the channel; follow-up issue for email/notifications at close-out.
- **ShedLock vs lockless** — *Resolved (evidence + hint):* lockless, matching the shipped
  abandoned sweep (`docs/plans/abandoned-booking-ttl-sweep.md` resolved "not needed at v1");
  single-instance constraint documented in the deploy runbook this slice (R-8).
- **#118 fold-in** — *Resolved (user, 2026-07-02):* born-on-typed only (see Non-goals).
- **Pending requests in staff daily view** — *Resolved (design):* yes — the pending queue renders
  as a venue-wide section on the staff daily page (all pending requests sorted by deadline,
  independent of the selected date); held sets appear on the map as `BOOKED_ONLINE` (locked), same
  as any online hold.
- **Soft-hold availability state** — *Resolved (design):* reuse `BOOKED_ONLINE`; availability
  stores *that*, not *why* (RESPONSIBILITIES.md); release paths reused verbatim.
- **Unpaid-after-accept terminal state** — *Resolved (design):* `CANCELLED` via the existing
  abandoned machinery (byte-for-byte reuse); `EXPIRED` is reserved for venue-never-responded.
  (domain-model's target `AWAITING_PAYMENT → EXPIRED` leg is amended to match — see Phase 7.)
- **Stale docs found at the grill** — improvement-plan line ~35 claims `PENDING_REQUEST/DECLINED`
  already exist in the enum (false; CONTEXT.md and domain-model.md are correct); stripe skill calls
  the existing sweep "ShedLock-guarded" (false). Both corrected in Phase 7.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** (1) online instant booking claim
  (existing, unchanged); (2) **online request soft-hold — the SAME claim call**
  (`AvailabilityClaim.claim` → `INSERT … ON CONFLICT DO NOTHING`, state `BOOKED_ONLINE`); (3) staff
  tap-to-mark (existing, unchanged); (4) cancellation release (existing); (5) **decline release —
  the SAME `AvailabilityClaim.release`** (`DELETE … WHERE state='BOOKED_ONLINE'`); (6) **expiry
  release — same call, from the new sweep**; (7) abandoned-payment release (existing; now also
  covers unpaid-after-accept via the pay-window clock).
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` (V4) — untouched.
- **Concurrency strategy:** the shipped atomic `INSERT … ON CONFLICT (set_id, booking_date) DO
  NOTHING` claim; the row's creation IS the claim. **No new claim code is written** — the request
  path calls the identical `availability::api` port. Booking-side transitions are guarded
  `UPDATE … WHERE status=<from> … RETURNING` (the lockless concurrency backbone shared with the
  webhook and abandoned sweep).
- **Pool rule (invariant #3):** unchanged — `claim()` rejects non-`ONLINE` pool sets; the request
  path goes through the same `ReserveSetService` checks.
- **Cutoff rule (invariant #4):** unchanged at creation (`BookingCutoff.isBookable`); additionally
  the request deadline is **capped at the same cutoff instant**, so accept (guarded by
  `request_expires_at > now`) can never occur after bookings close — one rule, now three jobs.
- **Pinning tests:** `ConcurrentRequestClaimIT` (two racing requests → exactly one
  `PENDING_REQUEST`, loser gets `SET_TAKEN`); `RequestToBookFlowIT.staffMarkBlockedWhilePending`;
  `RequestExpiryVsAcceptRaceIT` (sweep and accept cannot both win); existing
  `ConcurrentReservationIT` stays green.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Request lifecycle = booking lifecycle (Job: "bookings, codes, lifecycle"); new `application/request/` use-case slice |
| M-2 | `payment` | existing | `Payment` | Accept-time PaymentIntent + stored `client_secret` (Job: Stripe collection); decision stays in `booking` |
| M-3 | `venue` | existing | `Venue` | Booking mode is a venue fact; `SetBookingInfo` (vocabulary) gains `BookingMode` |
| M-4 | `availability` | existing — **no code change** | `SetAvailability` | Soft-hold reuses `claim`/`release` verbatim; sole-writer rule intact |
| M-5 | `operator` | existing — **no code change** | `Operator` | `VenueOwnership.assertOwns` consulted by the new booking services |

**Module-ownership table (plan-doc §4a)**

| Capability (added/changed) | Owner module | Justification |
|---|---|---|
| `PENDING_REQUEST/DECLINED/EXPIRED` states + transitions | `booking` | Job: "lifecycle"; not `availability` (Not-My-Job: *why* a set is taken) |
| Soft-hold + release of `(set,date)` | `availability` (via existing `::api`) | Job: sole writer of the row; `booking` orchestrates, never writes the table |
| Expiry-deadline computation (window ∧ cutoff) | `booking` | Owns the cutoff rule (`BookingCutoff`); not `venue` |
| Accept-time PaymentIntent + credentials storage | `payment` | Job: Stripe collection; Not-My-Job of `booking`: "talking to Stripe" |
| Accept/decline **decision endpoints** + pending queue view | `booking` | Booking lifecycle command/read; venue-scoped auth via `operator::api` |
| Venue booking-mode fact at reserve time | `venue` | Job: booking mode; exposed as vocabulary on `SetBookingInfo` |
| Payout accrual | `payout` | Unchanged — reacts to `BookingConfirmed` exactly once (invariant #9) |

**Cross-module named interfaces (`api/`/`vocabulary/` — no new ports, two widenings)**

| # | Surface | Change | Consumers |
|---|---|---|---|
| NI-1 | `venue.vocabulary.SetBookingInfo` | + `BookingMode bookingMode` (new `venue.vocabulary.BookingMode` enum `INSTANT/REQUEST`) | `booking` (reserve branch) |
| NI-2 | `payment.api.PaymentCredentialsLookup` (new role port) | `pendingCredentials(BookingRef): Optional<PaymentCredentials>` (new `payment.vocabulary.PaymentCredentials`) — split from `CheckoutPort` by consumer role at implement time (issue-#94 precedent, keeps `CheckoutPort` a functional seam); + `customer.api.CustomerLookup.findById(CustomerId)` for the queue's guest names | `booking` (guest view / queue) |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Change |
|---|---|---|
| EV-1 | `BookingConfirmed` | **unchanged** — published on webhook confirm as today; payout accrues once |
| EV-2 | `BookingCancelled` | **unchanged** — decline/expiry never confirmed ⇒ no ledger entry ⇒ no event; release is synchronous via `availability::api` (same reasoning as the abandoned path) |

**No new published events ⇒ no Event Publication Registry FQCN migration** (the #95 note fires
only on a new/moved event class). `allowedDependencies` unchanged for all modules (booking already
holds `venue::api/vocabulary`, `availability::api/vocabulary`, `payment::api/vocabulary/events`,
`operator::api/vocabulary`). `ModularityTests` must stay green.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Request-to-Book
  is **payment-request-on-accept**: no PaymentIntent exists before accept; a fresh immediate-capture
  PI is created at accept via the existing `CheckoutPort.pay` → `StripePaymentGateway.initiate`.
  **NOT auth-and-capture** (retracted model — do not build).
- **Confirmation trigger:** the same signature-verified `payment_intent.succeeded` webhook; the
  client redirect/poll never confirms. From `AWAITING_PAYMENT` onward the flow is byte-for-byte the
  instant spine (`PaymentEventListener → confirmFromPayment → BookingConfirmed`).
- **Idempotency:** Stripe key `booking-<id>-pi` (existing derivation — accept retry replays the
  same PI); webhook dedupe on event id (`stripe_webhook_event` PK); guarded idempotent
  `confirmFromPayment`; `payment_booking_uniq` prevents a second collection row per booking.
- **Money:** integer minor units, EUR; amount fixed at request time from the venue's price
  (stored on the booking row as today).
- **Payout-ledger effect:** accrues exactly once on `BookingConfirmed` — unchanged; declined and
  expired requests were never confirmed, so the ledger never sees them.
- **Refund policy applied:** unchanged (this slice adds no refund path; a confirmed
  request-booking cancels/refunds exactly like an instant one).
- **Pinning tests:** `RequestAcceptPayIT` (accept → webhook → CONFIRMED + exactly one ledger row),
  existing `WebhookIdempotency`/sweep suites (regression), `AbandonedBookingSweepServiceTest`
  (pay-window clock).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-dialog.ts` | modify | standalone component | mode-aware CTA ("Request to book"), handles `requested` result kind | Signal Forms (existing) |
| FE-2 | `booking/request-confirmation.ts` (+ route `booking/requested`) | new | standalone component | signals; shows code, deadline, "check your booking link" copy | — |
| FE-3 | `booking/booking-view.ts` (`booking/:code`) | modify | standalone component | status-aware: pending (deadline), accepted (Pay now → `/booking/pay` with fetched clientSecret), declined, expired | — |
| FE-4 | `booking/booking-pay.ts` | modify | standalone component | accept clientSecret via router state from booking-view (today: only via 202 signal); existing poll loop reused | — |
| FE-5 | `staff/staff-daily.ts` | modify | standalone component | new venue-wide "Pending requests" section: list + Accept/Decline actions, optimistic + reconcile like tap-to-mark | — |
| FE-6 | `booking/booking.service.ts`, `staff/staff.service.ts` | modify | services | `requested` result kind; `pendingRequests`/`accept`/`decline` + error mappers | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal `input()`/`output()`,
role=alert on errors, axe-clean (mocked e2e asserts). `angular-developer` + angular-cli MCP
`get_best_practices` load before FE code (recorded in Skills consulted).

**E2E (RV-FE-E2E):** both specs go in the **mocked, CI-safe suite** `frontend/e2e/` (route
mocking via `page.route`, fake Stripe via `__RIVIERA_FAKE_STRIPE__`, stateful status mocks as in
`booking-flow.e2e.ts`): `request-to-book.e2e.ts` (tourist: request → pending → accepted →
pay → confirmed; plus declined view) and `staff-requests.e2e.ts` (operator queue: list, accept,
decline, 403 copy). No real-backend spec needed — the flow adds no new backend-infra risk class
the mocked suite can't cover, matching the existing split.

## FE↔BE contract

- **`POST /api/bookings`** (existing) — new response case for REQUEST-mode venues: `202` with
  `{ kind-discriminable body: code, status: "PENDING_REQUEST", requestExpiresAt, venueName, set…,
  amount… }` (no clientSecret, no paymentIntentId). Existing `201`/`202` instant shapes unchanged.
- **`GET /api/bookings/{code}`** (existing, widened) — `status` may now be
  `PENDING_REQUEST|DECLINED|EXPIRED`; adds `requestExpiresAt` (nullable) and, **only while
  `AWAITING_PAYMENT`**, `payment: { clientSecret, paymentIntentId }` (nullable otherwise).
- **`GET /api/venues/{venueId}/booking-requests`** (new, operator) — `200` array of
  `{ bookingId, setId, bookingDate, guestName, amount: { minorUnits, currency },
  requestedAt, requestExpiresAt }` — **no booking code** (invariant #7), sorted by deadline;
  the staff UI resolves the set's row/position label from its already-loaded map by `setId`
  (as-built correction: was `setLabel`/`amountMinor` in the draft).
- **`POST /api/venues/{venueId}/booking-requests/{bookingId}/accept`** (new) — `200`
  `{ bookingId, status }` (`AWAITING_PAYMENT`, or `CONFIRMED` on the stub profile). Errors
  (all `ApiProblem`, stable codes): `404 NO_SUCH_REQUEST`, `409 REQUEST_NOT_PENDING`,
  `409 REQUEST_EXPIRED`, `502 PAYMENT_INIT_FAILED`, `403 NOT_VENUE_OWNER`.
- **`POST /api/venues/{venueId}/booking-requests/{bookingId}/decline`** (new) — `200`
  `{ bookingId, status: "DECLINED" }`. Errors: `404 NO_SUCH_REQUEST`, `409 REQUEST_NOT_PENDING`,
  `403 NOT_VENUE_OWNER`.
- **Error contract:** every rejection via `ApiProblem.response(...)` / typed exceptions handled by
  the single `ApiErrorHandler`; **no per-controller `@ExceptionHandler`**
  (`ErrorContractArchitectureTests`); booking codes never in `detail`/`instance` (redacted by
  construction). New edge validation throws `InvalidApiRequestException` (born-on-typed, Q4).
- **Client typing:** hand-written typed models (existing pattern); no `as any`.
- **Money/date on the wire:** minor units + currency; ISO `LocalDate`. `requestExpiresAt`/
  timestamps as ISO-8601 UTC instants.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V19 migration + statuses + booking mode vocabulary | ✅ | a1f36b5 |
| 1 — Request creation path (soft-hold, no PI) + concurrency IT | ✅ | a1f36b5 |
| 2 — Accept/decline services + endpoints + CrossVenueDenialIT | ✅ | 1d66b3a |
| 3 — Expiry sweep + pay-window extension of abandoned sweep | ✅ | 1d66b3a |
| 4 — Guest view (status/credentials) + pending-queue endpoint | ✅ | 1d66b3a |
| 5 — FE tourist flow + mocked e2e | ✅ | (this commit) |
| 6 — FE operator queue + mocked e2e | ✅ | (this commit) |
| 7 — Docs/substrate updates + runbook note | ✅ | 015c5a8 |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each
phase's code.

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`):**
- `db/migration/V19__request_to_book.sql` — widen `booking_status_check`; `booking.request_expires_at`,
  `booking.accepted_at` (TIMESTAMPTZ NULL); partial indexes `booking_pending_expires_idx
  (request_expires_at) WHERE status='PENDING_REQUEST'` and `booking_awaiting_accepted_idx
  (accepted_at) WHERE status='AWAITING_PAYMENT' AND accepted_at IS NOT NULL`; `payment.client_secret
  TEXT NULL`
- `booking/domain/BookingStatus.java` — + `PENDING_REQUEST, DECLINED, EXPIRED`
- `venue/vocabulary/BookingMode.java` (new enum) + `SetBookingInfo` widening + venue adapter select
- `booking/application/reserve/` — `ReserveSetService` branches on mode (insert `PENDING_REQUEST` +
  deadline); `BookingOutcome.Requested` variant; `CreateBookingService` skips collect for requests
- `booking/application/request/` (new slice) — `RespondToRequest` (in-port: accept/decline),
  `RespondToRequestService`, `AcceptOutcome`/`DeclineOutcome` (sealed), `ExpireRequests` (in-port),
  `ExpireRequestsService`, `PendingRequests` (in-port) + `PendingRequestsService` + `PendingRequest`
  (view record)
- `booking/application/Bookings.java` + `adapter/out/JdbcBookings.java` — guarded transitions
  (`acceptPending`, `declinePending`, `expirePending`, `revertAcceptToPending`), pending-queue query,
  two-clock `findExpirableAwaitingPayment`
- `booking/adapter/in/` — `BookingRequestController` (accept/decline/queue), `RequestSweepScheduler`
  (+ `RequestProperties` `booking.request.{expiry-window,pay-window,sweep-interval}`), widened
  booking view DTO; `BookingController` `Requested` case → 202
- `payment/` — `CheckoutPort.pendingCredentials`, `payment/vocabulary/PaymentCredentials`,
  `StripePaymentGateway` stores `client_secret`, `JdbcPayments` select
- `ai.riviera.platform.InvalidApiRequestException` (root, next to `ApiProblem`) + `ApiErrorHandler`
  mapping → 400 `INVALID_REQUEST`
- Tests: `ConcurrentRequestClaimIT`, `RequestToBookFlowIT`, `RequestAcceptPayIT`,
  `RequestExpiryVsAcceptRaceIT`, `BookingStatusSchemaLockstepIT`, service tests per slice,
  `CrossVenueDenialIT` extension, `ApiErrorHandlerTest` extension

**Frontend (`frontend/src/app/`):** per the Angular table above + `frontend/e2e/request-to-book.e2e.ts`,
`frontend/e2e/staff-requests.e2e.ts`.

**Docs (Phase 7):** `CONTEXT.md` (statuses + soft-hold/pending-request glossary), `CLAUDE.md`
(booking lifecycle wording), `RESPONSIBILITIES.md` (R2B variant now built),
`docs/architecture/domain-model.md` (built-vs-target flip; amend `AWAITING_PAYMENT→EXPIRED` leg to
`CANCELLED`), `docs/architecture/improvement-plan.md` (fix stale line 35; tick D1),
`.claude/skills/riviera-stripe-payments/SKILL.md` (fix "ShedLock-guarded" → lockless),
`docs/deploy/production-hardening.md` (single-instance note covering both sweeps).

---

## Phase 0 — V19 migration + statuses + booking-mode vocabulary

**Files:** V19 SQL · `BookingStatus` · `BookingMode` + `SetBookingInfo` + venue adapter ·
`BookingStatusSchemaLockstepIT`

- [ ] Failing test: `BookingStatusSchemaLockstepIT` — for each `BookingStatus` value, an
  `INSERT` into `booking` succeeds; a made-up status violates `booking_status_check`. (Docker-gated
  IT; also a pure-JVM `BookingStatusTest` asserting the exact value set.)
- [ ] V19 (postgres skill): `ALTER TABLE booking DROP CONSTRAINT booking_status_check; ALTER TABLE
  booking ADD CONSTRAINT booking_status_check CHECK (status IN ('PENDING_REQUEST',
  'AWAITING_PAYMENT','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW','DECLINED','EXPIRED'));` +
  columns + partial indexes + `payment.client_secret`.
- [ ] Enum widened; `BookingMode` enum + `SetBookingInfo.bookingMode` + venue adapter `SELECT`
  includes `booking_mode`; fix all `SetBookingInfo` construction sites.
- [ ] Scoped run: `--tests "*BookingStatus*" --tests "*SetBookingFacts*"` + `ModularityTests`,
  `PackageShapeArchitectureTests`. Commit `[#98] Booking request states + mode vocabulary (V19)`.

## Phase 1 — Request creation path

**Files:** `ReserveSetService`, `CreateBookingService`, `BookingOutcome`, `NewBooking`/insert path,
`BookingController` + request DTO/view, `RequestProperties` (expiry window), tests

- [ ] Failing tests: `CreateBookingServiceTest.requestModeCreatesPendingRequestWithoutPayment`
  (fake gateway asserts **zero** interactions), `…requestDeadlineCappedAtCutoff` (fixed `Clock`),
  `ConcurrentRequestClaimIT`, `RequestToBookFlowIT` (202 shape; staff-mark blocked).
- [ ] Implement: reserve branch on `SetBookingInfo.bookingMode` — REQUEST inserts
  `status='PENDING_REQUEST'`, `request_expires_at = min(now + expiryWindow,
  BookingCutoff.closesAt(cutoff, date))` (new public `closesAt` exposing the existing boundary);
  `CreateBookingService` returns `BookingOutcome.Requested(confirmation, requestExpiresAt)` without
  calling `CheckoutPort`; controller maps to 202. `InvalidApiRequestException` introduced for any
  touched DTO validation.
- [ ] Scoped run: booking package tests + `ConcurrentReservationIT` (instant regression). Commit.

## Phase 2 — Accept / decline

**Files:** `application/request/` slice, `JdbcBookings` guarded transitions,
`BookingRequestController`, `CheckoutPort.pendingCredentials` + `client_secret` storage,
`CrossVenueDenialIT`, `RequestAcceptPayIT`

- [ ] Failing tests: `RespondToRequestServiceTest` (accept: `assertOwns` first → guarded transition
  `SET status='AWAITING_PAYMENT', accepted_at=now WHERE id=? AND venue_id=? AND
  status='PENDING_REQUEST' AND request_expires_at > now RETURNING …` → `CheckoutPort.pay`; decline:
  guarded → `DECLINED` → `availability.release`; expired/not-pending/foreign-venue rejections;
  `PaymentOutcome.Failed` → compensating revert). `CrossVenueDenialIT` +3 denial +3 positive.
  `RequestAcceptPayIT` (accept → webhook → CONFIRMED, one ledger row, GET carries credentials).
- [ ] Implement service + controller (sealed outcomes → `ApiProblem`, codes per FE↔BE contract);
  `StripePaymentGateway` persists `client_secret`; stub profile: accept → `Succeeded` → confirm.
- [ ] Scoped run: request slice + `CrossVenueDenialIT` + `ErrorContractArchitectureTests`. Commit.

## Phase 3 — Expiry sweep + pay-window

**Files:** `ExpireRequestsService`, `RequestSweepScheduler`, `AbandonedBookingSweepService` +
`Bookings.findExpirableAwaitingPayment` two-clock split, tests

- [ ] Failing tests: `ExpireRequestsServiceTest` (past-deadline → `EXPIRED` + release; future
  untouched; per-row isolation), `RequestExpiryVsAcceptRaceIT`,
  `AbandonedBookingSweepServiceTest` (accepted request expirable only after
  `accepted_at + pay-window`; instant TTL behavior unchanged).
- [ ] Implement: guarded bulk transition + release loop; `@Scheduled(fixedDelay =
  "${booking.request.sweep-interval:PT5M}")`, **not** profile-gated (no Stripe involved), lockless
  (documented); abandoned sweep query branches on `accepted_at`.
- [ ] Scoped run: refund/request slices. Commit.

## Phase 4 — Guest view + pending queue (BE)

- [ ] Failing tests: `ViewBookingServiceTest` (new statuses; credentials only while
  `AWAITING_PAYMENT`), `PendingRequestsServiceTest` (`assertOwns`; id-based rows, **no code**;
  deadline sort), controller IT rows in `RequestToBookFlowIT`.
- [ ] Implement view widening + queue endpoint. Scoped run; commit.

## Phase 5 — FE tourist flow + e2e · Phase 6 — FE operator queue + e2e

- [ ] Load `angular-developer` + angular-cli MCP `get_best_practices` + `playwright-cli` (announce).
- [ ] Per-surface work per the Angular table (FE-1…FE-6); unit specs alongside
  (`*.spec.ts`, existing patterns); mocked e2e specs `request-to-book.e2e.ts`,
  `staff-requests.e2e.ts` with axe checks.
- [ ] `npm test` scoped + `npm run test:e2e:a11y`. Commit per phase.

## Phase 7 — Docs/substrate + runbook

- [ ] Apply the Docs list under *File structure*; verify Open Questions all resolved; execution
  table ✅ at HEAD. Commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] AC-1…AC-8, AC-10: scoped `gradle test` runs green locally per phase (see execution table
  commits); full suite + Docker ITs green in CI on the PR head.
- [x] AC-9: full existing suite green in CI (PR #122 checks).
- [x] AC-11: `npm run test:e2e:a11y` — 12 e2e green locally (incl. expired-panel + error-copy cases).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section filled; concurrency tests present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module internals imports; no new events (invariant #11).
- [x] **Payment/payout** filled; webhook source of truth; idempotent; minor units; exactly-once (#5, #8, #9).
- [x] Refund policy untouched/server-side (invariant #10).
- [x] Timezone: UTC stored, `Europe/Tirane` reasoning (invariant #6).
- [x] Booking codes unguessable; never in queue view/problems (invariant #7).
- [x] Flyway migration + constraint tests (invariant #12).
- [x] **Frontend** standards met; no `as any`.
- [x] Execution-status table at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty (all under Resolved).
