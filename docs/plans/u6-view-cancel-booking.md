# U6 — View & cancel booking + cancellation policy/refund — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` (installed). Steps use checkbox syntax.
> **Status: PLANNED** — authored 2026-06-29 against current `main` (U5/#9 merged: `44de687`) after the
> Issue-intake grill gate. Issue **#11**. Branch `claude/u6-booking-cancel-w1d5pc`.

**Goal:** A tourist can view a booking by its code and cancel it. The server computes the refund
**server-side** from the cancellation policy (free until the evening-before cutoff in `Europe/Tirane`
→ full; after → a per-venue configurable %), actions it through the payment gateway behind a port
(idempotency-keyed), frees the `(set, date)`, and posts an exactly-once **proportional** payout
REVERSAL sized to the refund.

**Architecture:** The cancel is orchestrated synchronously inside `booking` (mirroring U4's
`PaymentEventListener` release path): `booking` **calls** `availability.release` and a new
`payment::api` **`RefundPort`** directly — it does **not** publish to them — because `booking` already
depends on `availability::api` and `payment::api`, so an event consumed by either would create a
module **cycle** that `ApplicationModules.verify()` rejects (see Grill outcome). The only true
`BookingCancelled` event consumer is **`payout`** (`payout → booking::api` already exists, no cycle),
which reverses its prior ACCRUAL **proportionally to the refund**.

**Persistence:** JDBC only (invariant #1). New Flyway migrations: **V10** (`booking.cancelled_at` +
`booking.refund_minor`; `venue.late_cancel_refund_bps`) and **V11** (`payment` status set gains
`REFUNDED`/`PARTIALLY_REFUNDED`; `refunded_minor` + `refund_id`). No payout migration — V9 already
admits `REVERSAL` (`CHECK` + `UNIQUE(booking_id, entry_type)`).

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` (the spine)
+ GitHub issue **#11**. Builds on U3 (#6), U4 (#8), U5 (#9). **#50 depends on the new GET endpoint.**

**Skills consulted:** `riviera-modulith` (+ `references/events.md`) — established that `payment`/
`availability` **cannot** consume a `booking`-produced event (cycle); refund via `booking→payment::api`
RefundPort + synchronous `availability.release`; `payout` the only event consumer; `BookingCancelled`
in `booking.api` (id-based). `riviera-java-conventions` — records, sealed `CancelOutcome`, typed
outcomes, package-private adapters, integer money math, no JPA/Lombok. `riviera-stripe-payments` —
server-side refund amount, idempotency key `booking-{id}-refund`, refund reverses the accrual,
collect-only/no-Connect (refund recorded from the gateway response — we initiate it, so invariant #8's
"don't trust the client" is satisfied without a refund webhook in v1). `postgres` — V10/V11 column +
`CHECK` design (bps `0..10000`, `refunded_minor` bounds), no new index needed (lookups ride existing
`UNIQUE(code)` / `UNIQUE(booking_ref)`). `angular-developer` + angular-cli MCP — v22 `resource()` for
the GET, Signal-Forms-free cancel action, `@Service`, AXE/WCAG-AA. `codebase-design` — the new ports
(`ViewBooking`, `CancelBooking`, `RefundPort`) mirror existing single-impl seams (`ConfirmBooking`,
`CheckoutPort`); no speculative layers added. `domain-modeling` — ADR-0005 (refund tiers + proportional
reversal) + CONTEXT.md glossary (cancellation cutoff, refund tier, reversal). `riviera-plan-doc` (this
doc), `tdd` (red→green per behaviour).

**Branch:** `claude/u6-booking-cancel-w1d5pc` (off `main` @ `44de687`).

---

## Issue-intake grill outcome (drift vs #11, recorded before planning)

1. **The spine narrative "`BookingCancelled` → availability frees + payment refunds (as listeners)" is
   not buildable as written — it cycles.** A `booking`-produced event lives in `booking.api`, so any
   consumer depends on `booking`. But `booking → availability::api` (claim) and `booking → payment::api`
   (checkout) already exist, so `availability`/`payment` listening to `BookingCancelled` makes
   `booking ⇄ availability` and `booking ⇄ payment` cycles → `ModularityTests` fails. **Resolution
   (matches U4 precedent):** `booking` **calls** `availability.release(...)` and a new `payment::api`
   `RefundPort` **synchronously** (existing dependency direction); only **`payout`** consumes the event
   (`payout → booking::api` already allowed by U5). The cycle-break trick in `events.md` only works
   when the event flows *against* an existing dep (U4: `payment` produces, `booking` consumes) — not
   here.
2. **A late-cancel needs a payout decision the issue under-specifies.** The issue says "posts a
   REVERSAL" unconditionally; but after the cutoff the tourist is non-refundable while the platform
   keeps the money — a blanket reversal would pay the venue €0 for a held spot. **Resolved with the
   owner (AskUserQuestion, 2026-06-29): reversal mirrors the refund** (full before cutoff; **partial**
   after, proportional to the refunded amount; **none** if nothing is refunded), and **partial refunds
   are configurable per venue**. Recorded as **ADR-0005**.
3. **The `release` port already exists** (U4, `AvailabilityClaim.release`) — reuse verbatim. **The
   `REVERSAL` enum + V9 schema already exist** (U5) — no payout migration; add the reversal factory +
   port methods + listener.
4. **The `cancelled_at` column does not exist** on `booking` (V5 has only `confirmed_at`); the
   `payment` status `CHECK` has no `REFUNDED`. Both need migrations (V10/V11).
5. **Under the default `!stripe` (stub) profile there is no `payment` row** (`StubPaymentGateway`
   doesn't `register`), so refund-recording is a 0-row no-op in CI — by design; the real refund record
   exists only under the `stripe` profile. The refund flow still runs (stub gateway returns success).

## Acceptance criteria (testable)

> Written at the inner hexagon (ports/events), not the HTTP/Angular edge.

- [ ] **AC-1 (view):** Given a `CONFIRMED` booking with code `C`, when `ViewBooking.byCode("C")`, then
  it returns the booking summary **and** the server-computed refund-if-cancelled-now (full before
  cutoff). Unknown code → `Optional.empty`. *Pinned by:* `BookingViewIT.returnsDetailWithRefundTerms`,
  `BookingViewIT.unknownCodeIsEmpty`.
- [ ] **AC-2 (cutoff, server-side, Europe/Tirane):** Given a venue cutoff `18:00` and "now" computed
  from an injected UTC `Clock`, when the refund is computed, then "before the evening-before cutoff in
  `Europe/Tirane`" yields a **full** refund and "after" yields `floorDiv(gross × lateCancelBps, 10000)`
  — never the JVM default zone. *Pinned by:* `RefundPolicyTest` (pure) + `BookingCutoffTest`
  (cancellation boundary).
- [ ] **AC-3 (refund server-side + idempotent):** Given a cancel, when the refund is actioned, then the
  **amount is computed by the server** (never supplied by the caller) and the gateway is called with
  idempotency key `booking-{id}-refund`; a re-issued refund for the same booking does not double-refund.
  *Pinned by:* `CancelBookingServiceTest.computesRefundServerSide`, `StripePaymentGatewayTest.refundUsesIdempotencyKey`.
- [ ] **AC-4 (availability freed):** Given a `CONFIRMED` booking on `(set, date)`, when it is cancelled,
  then the `BOOKED_ONLINE` row for `(set, date)` is released to `FREE` (re-claimable, invariant #2).
  *Pinned by:* `CancelBookingIT.cancelReleasesTheSet`.
- [ ] **AC-5 (event published, id-based):** Given a cancel transitions the booking, when the
  transaction commits, then exactly one `BookingCancelled{bookingId, venueId, setId, bookingDate,
  refundMinor, currency}` is published (ids + immutable value only). *Pinned by:*
  `CancelBookingIT.publishesBookingCancelledOnCancel`.
- [ ] **AC-6 (proportional reversal, exactly-once):** Given a `BookingCancelled` with `refundMinor = R`
  for a booking whose ACCRUAL is `(gross G, commission C)`, when the `payout` listener runs, then
  exactly one `REVERSAL` exists with `gross = R`, `commission = floorDiv(C × R, G)`, `net = R −
  commission`; `R = G` reverses the full accrual, `R = 0` posts **no** reversal; redelivery stays at one
  row. *Pinned by:* `ReversalMathTest` (pure), `PayoutReversalIT.reversesProportionally`,
  `PayoutReversalIT.redeliveryIsIdempotent`, `PayoutReversalIT.noRefundNoReversal`.
- [ ] **AC-7 (not-cancellable guard):** Given a booking that is not `CONFIRMED` (already `CANCELLED`/
  `AWAITING_PAYMENT`), when cancel is attempted, then it is rejected as not-cancellable and nothing is
  released/refunded/reversed. *Pinned by:* `CancelBookingServiceTest.rejectsNonConfirmed`,
  `BookingControllerIT.cancelAlreadyCancelledIs409`.
- [ ] **AC-8 (boundaries):** No cross-module internal imports; `payment` stays `allowedDependencies={}`;
  `booking`/`payout`/`availability` deps unchanged; `ApplicationModules.verify()` passes. *Pinned by:*
  `ModularityTests`, `JdbcOnlyArchitectureTests`.
- [ ] **AC-9 (frontend):** Given a booking code, the booking-view page shows details + the refund terms
  and a cancel action; on confirm it calls the cancel endpoint and reflects the outcome; passes AXE.
  *Pinned by:* `booking-view.spec.ts`.
- [ ] **AC-10:** Full suite green; `ng build` + frontend tests green.

## Non-goals

- **Weather-exception admin refund** (invariant #10) — admin-triggered, no admin surface in v1. Deferred.
- **Refund reconciliation via Stripe webhook** (`charge.refunded`) — v1 records the refund from the
  server-initiated gateway response; webhook reconciliation is a later hardening.
- **Cancelling an `AWAITING_PAYMENT` booking** through this flow — that path is U4's
  `payment_intent.canceled`; U6 cancels `CONFIRMED` bookings only.
- **Multiple/partial-top-up refunds** — one refund per booking (full or partial-once).
- **Auth beyond the booking code** — the code is the bearer credential (invariant #7); no accounts in v1.
- **Payout currency conversion** (EUR→ALL) — out-of-app at BKT time (provisional).
- **Backfilling `late_cancel_refund_bps` per venue** — column defaults to `0` (non-refundable after
  cutoff); venues configure it later.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An event consumed by `payment`/`availability` creates a module cycle | (was) high | high | Refund via `booking→payment::api` RefundPort; `availability.release` called directly; only `payout` consumes the event. `ModularityTests` gate (AC-8) | plan | resolved by design |
| R-2 | Refund amount supplied/altered by the client (breaks #10) | low | high | Amount computed in `CancelBookingService` from booking state + venue policy; the API takes **no** amount; pinned by `CancelBookingServiceTest` (AC-3) | impl | open |
| R-3 | Double refund on retry / redelivery | med | high | Stripe idempotency key `booking-{id}-refund`; guarded `CONFIRMED→CANCELLED` UPDATE (a re-cancel is a 0-row no-op); refund only on actual transition | impl | open |
| R-4 | Double / wrong-signed payout reversal | med | high | `UNIQUE(booking_id, REVERSAL)` + `INSERT … ON CONFLICT DO NOTHING`; reversal stores **positive** magnitudes (V9 CHECK forbids negatives), sign is by `entry_type`; `ReversalMathTest`+`PayoutReversalIT` (AC-6) | impl | open |
| R-5 | Reversal listener runs before the ACCRUAL exists (async ordering) | very low | med | Cancel is a human action long after confirm; the accrual (async, fires right after confirm-commit) is durably present. `findAccrual` empty ⇒ no reversal (no silent double); unreachable in practice — documented like U5 R-7 | impl | accepted by design |
| R-6 | Refund (Stripe call) inside the cancel transaction; tx rolls back after a successful refund | low | med | Mirrors U4's checkout-in-tx posture; idempotency key makes the retried cancel converge (Stripe returns the existing refund). Registry-backed internal-listener refund is a documented future hardening | impl | accepted (v1) |
| R-7 | Cutoff computed in the JVM default zone (breaks #4/#6) | low | high | Reuse `BookingCutoff` (injected `Clock`, `Europe/Tirane`); `BookingCutoffTest` covers the cancellation boundary (AC-2) | impl | open |
| R-8 | Money rounding wrong (float / wrong direction) | low | high | Integer-only `floorDiv`; refund and proportional-reversal commission both round **down** (platform keeps the sub-cent), written down + tested (AC-2/AC-6) | impl | open |
| R-9 | Booking code logged in clear (breaks #7) | low | med | Log ids only, never the code; `{code}` is a path var treated as a secret. Review-gate check (RV-BE booking-code) | impl | open |

## Open questions / Assumptions

- **Assumption:** Refund rounds **down** — `floorDiv(gross × lateCancelBps, 10000)` (full = gross);
  proportional reversal commission `floorDiv(C × R, G)`. Platform keeps the sub-cent (consistent with
  U5 commission rounding). Written here because division happens (invariant #5). — *Owner:* impl
- **Assumption:** The booking **code** authorizes both view and cancel (bearer credential, invariant
  #7); no other auth in v1. — *Owner:* impl
- **Assumption:** Under the `!stripe` stub profile, the refund gateway returns success and the
  `payment`-row refund record is a 0-row no-op (no payment row exists); the real record exists under the
  `stripe` profile. — *Owner:* impl

### Resolved

- **(grill #1) event cycle** — RESOLVED at the grill gate: refund via `payment::api` RefundPort +
  synchronous `availability.release`; only `payout` consumes `BookingCancelled`. (Risk R-1.)
- **(grill #2) late-cancel payout + partial refunds** — RESOLVED with the owner (AskUserQuestion,
  2026-06-29): reversal mirrors the refund; partial refunds configurable per venue. Recorded as
  **ADR-0005**.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** **one — release on cancel.**
  `CancelBookingService` calls the existing `AvailabilityClaim.release(setId, bookingDate)` (U4) inside
  the cancel transaction. No new claim path; no new SQL against the availability table.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` (V4). Release `DELETE`s only the
  `BOOKED_ONLINE` row, never a staff-marked row, so the set becomes re-claimable cleanly.
- **Concurrency strategy:** the release is idempotent (0-row `DELETE` if nothing online holds it). The
  cancel itself is guarded by the `CONFIRMED→CANCELLED` UPDATE (`RETURNING`), so two concurrent cancels
  → one transitions (releases once), the other is a 0-row no-op.
- **Pool / cutoff rules:** pool (#3) not re-checked on release (the set is being freed). Cutoff (#4/#6)
  is reused here as the **cancellation** cutoff via `BookingCutoff` (`Europe/Tirane`, injected `Clock`).
- **Pinning test:** `CancelBookingIT.cancelReleasesTheSet` (released row is re-claimable) +
  `JdbcBookingsTransitionIT` (guarded transition is a no-op when not `CONFIRMED`).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | view + cancel use cases; owns cancellation-policy enforcement; publishes `BookingCancelled` |
| M-2 | `payment` | existing | `Payment` | new inbound `RefundPort`; gateway `refund`; records the refund |
| M-3 | `payout` | existing | `PayoutLedgerEntry` | consumes `BookingCancelled`; posts the proportional REVERSAL |
| M-4 | `venue` | existing | `Venue` | exposes `lateCancelRefundBps` via `api/` |
| M-5 | `availability` | existing | `SetAvailability` | **no code change** — `release` reused |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port / type | Consumers |
|---|---|---|---|
| NI-1 | `booking.api` | `BookingCancelled` (event record) — **new** | `payout` |
| NI-2 | `payment.api` | `RefundPort#refund(BookingRef, Money) → RefundResult` — **new inbound port** | `booking` |
| NI-3 | `venue.api` | `VenueCatalog#lateCancelRefundBps(VenueId) → OptionalInt` — **method added** | `booking` |
| NI-4 | `booking.application.in` | `ViewBooking`, `CancelBooking` — **internal** inbound ports (NOT cross-module) | `BookingController` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` | `{ BookingId, VenueId, SetId, LocalDate, long refundMinor, String currency }` | `payout` (`@ApplicationModuleListener`) | async `AFTER_COMMIT`, own tx | `CancelBookingIT`, `PayoutReversalIT` |

**Dependency deltas:** `payment` stays `allowedDependencies = {}` (RefundPort uses only `payment.api`
types). `booking` unchanged (already has `venue::api`, `availability::api`, `payment::api`). `payout`
unchanged (already `{booking::api, venue::api}`). **No new edges** → no cycle. (`booking`'s
`allowedDependencies` already lists every module it uses.)

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only, no Connect. Refund is **server-initiated** through the outbound
  `PaymentGateway.refund` (Stripe `Refund` under the `stripe` profile; stub returns success) behind the
  inbound `RefundPort` — `booking` never imports Stripe types.
- **Refund computed server-side (invariant #10):** `CancelBookingService` computes the amount from the
  booking's gross + the cutoff + the venue's `late_cancel_refund_bps`. The API accepts **no** amount.
- **Idempotency (invariant #8):** Stripe idempotency key `booking-{id}-refund`; the guarded
  `CONFIRMED→CANCELLED` UPDATE makes a re-cancel a no-op so the refund/event fire **once**.
- **Money:** integer minor units, EUR; `floorDiv` rounding documented (R-8).
- **Payout-ledger effect (invariant #9):** one `REVERSAL` per booking, **proportional** to the refund
  (`gross=R, commission=floorDiv(C×R,G), net=R−commission`), exactly-once via
  `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO NOTHING`; **no** reversal when `R=0`.
- **Refund policy applied:** free-until-cutoff (full) / after-cutoff (`late_cancel_refund_bps`, default
  0). Weather-admin is a non-goal.
- **Pinning tests:** `StripePaymentGatewayTest.refundUsesIdempotencyKey`, `RefundPolicyTest`,
  `ReversalMathTest`, `PayoutReversalIT`, `JdbcPaymentsIT` (markRefunded).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | new | standalone component | `resource()` (GET by code) + signals | none (a cancel button + confirm) |
| FE-2 | `booking/booking.service.ts` | modify | `@Service` | adds `getByCode`/`cancel` | — |
| FE-3 | `booking/booking.model.ts` | modify | types | `BookingDetail`, `Cancellation` | — |
| FE-4 | `booking/booking-confirmation.ts` | modify | component | adds a "view / manage booking" link to `/booking/:code` | — |
| FE-5 | `app.routes.ts` | modify | routes | lazy `booking/:code` | — |

**Standards:** standalone components (no `standalone:true`), no explicit `OnPush`, `inject()`,
`@if`/`@for`, `input()`/`output()`, `resource()` for the async GET, money via `Intl.NumberFormat`
(match `booking-confirmation`), AXE/WCAG-AA (focus management on the cancel confirm, contrast pins like
the existing SCSS). No `as any` on the contract.

## FE↔BE contract

- **New endpoints (booking module):**
  - `GET /api/bookings/{code}` → `200` `BookingDetailView` | `404 {error:"NO_SUCH_BOOKING"}`.
  - `POST /api/bookings/{code}/cancel` → `200` `CancellationView` | `404 {error:"NO_SUCH_BOOKING"}` |
    `409 {error:"NOT_CANCELLABLE"}`. **No request body** (the amount is server-computed).
- **`BookingDetailView`:** `{ code, status, venueId, venueName, rowLabel, positionNo, bookingDate,
  amount: Money, cancellable: boolean, beforeCutoff: boolean, refundIfCancelledNow: Money,
  refundedAmount: Money | null }` (the last set only when `status==CANCELLED`).
- **`CancellationView`:** `{ code, status, refund: Money, tier: "FULL"|"PARTIAL"|"NONE" }`.
- **Client typing:** hand-written typed service (matches the existing `booking.service.ts`); money as
  integer minor units + currency; date as ISO `LocalDate`. Never `as any`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Flyway V10/V11 + migration ITs + ADR-0005 | ✅ | `[U6] Flyway V10/V11 …` |
| 1 — `booking` view: GET /{code} + refund policy + `venue.api.lateCancelRefundBps` | ✅ | `[U6] booking: GET …` |
| 2 — `payment` RefundPort + gateway refund + record | ✅ | `[U6] payment: RefundPort …` |
| 3 — `booking` cancel orchestration + `BookingCancelled` + POST /{code}/cancel | ✅ | `[U6] booking: cancel …` |
| 4 — `payout` proportional REVERSAL listener | ✅ | `[U6] payout: proportional REVERSAL …` |
| 5 — Frontend booking view + cancel | | |
| 6 — verify + review gate | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as the code.

---

## File structure

**Migrations / docs**
- `resources/db/migration/V10__booking_cancellation_and_venue_refund_policy.sql`
- `resources/db/migration/V11__payment_refund.sql`
- `docs/adr/0005-cancellation-refund-tiers-and-proportional-reversal.md`
- `CONTEXT.md` — glossary: cancellation cutoff, refund tier, proportional reversal.

**booking**
- `booking/api/{BookingCancelled,package-info}.java` — new event (package-info exists).
- `booking/application/in/{ViewBooking,CancelBooking,CancelOutcome,BookingDetail}.java` — inbound ports + types.
- `booking/application/{ViewBookingService,CancelBookingService}.java` — package-private `@Service`.
- `booking/application/BookingCutoff.java` — add `freeCancellationOpen(LocalTime, LocalDate)` (shared boundary).
- `booking/domain/RefundPolicy.java` — pure refund math.
- `booking/application/out/{Bookings,BookingRecord,CancelledBooking}.java` — `findByCode`, `cancelConfirmed`.
- `booking/infrastructure/out/JdbcBookings.java` — the two new queries.
- `booking/infrastructure/in/{BookingController,BookingDetailView,CancellationView}.java` — GET + POST mapping.

**payment**
- `payment/api/{RefundPort,RefundResult}.java` — inbound port + sealed outcome.
- `payment/application/RefundService.java` — package-private `@Service implements RefundPort`.
- `payment/application/out/PaymentGateway.java` — add `refund(BookingRef, Money) → RefundOutcome`.
- `payment/application/out/{Payments,RefundOutcome}.java` — `markRefunded`; refund outcome record.
- `payment/infrastructure/out/{StubPaymentGateway,StripePaymentGateway,JdbcPayments}.java` — impls.
- `payment/domain/PaymentStatus.java` — add `REFUNDED`, `PARTIALLY_REFUNDED`.

**venue**
- `venue/api/VenueCatalog.java` (+`lateCancelRefundBps`) · `venue/infrastructure/out/JdbcVenueCatalog.java`.

**payout**
- `payout/domain/PayoutLedgerEntry.java` — add `reversalOf(accrual, refundMinor)` factory.
- `payout/application/out/PayoutLedger.java` — add `findAccrual(long) : Optional<PayoutLedgerEntry>`, `reverse(entry)`.
- `payout/infrastructure/out/JdbcPayoutLedger.java` — impls (shared idempotent insert).
- `payout/infrastructure/in/BookingCancelledPayoutListener.java` — `@ApplicationModuleListener`.

**frontend** — `booking/booking-view.ts` (+`.scss`), `booking/booking.service.ts`, `booking/booking.model.ts`,
`booking/booking-confirmation.ts`, `app.routes.ts`; test `booking/booking-view.spec.ts`.

---

## Phase 0 — Flyway V10/V11 + migration ITs + ADR-0005

**Files:** Create the two migrations + ADR-0005; Modify `CONTEXT.md`; Test `BookingMigrationIT`,
`VenueSeedMigrationIT`/`SetBookingInfoIT`, `PaymentMigrationIT`.

> Load `postgres` (done) + `domain-modeling` (for the ADR/glossary) before writing.

```sql
-- V10: cancellation columns + per-venue late-cancel refund policy.
ALTER TABLE booking ADD COLUMN cancelled_at TIMESTAMPTZ;          -- set when status -> CANCELLED (#6)
ALTER TABLE booking ADD COLUMN refund_minor BIGINT;               -- server-computed refund issued (#5), null until cancelled
ALTER TABLE booking ADD CONSTRAINT booking_refund_check
    CHECK (refund_minor IS NULL OR (refund_minor >= 0 AND refund_minor <= amount_minor));

-- After-cutoff refund share, basis points (0 = non-refundable, 10000 = full). Before-cutoff is always
-- full (invariant #10) and not stored. Mirrors venue.commission_bps (V2).
ALTER TABLE venue ADD COLUMN late_cancel_refund_bps INT NOT NULL DEFAULT 0
    CONSTRAINT venue_late_cancel_bps_check CHECK (late_cancel_refund_bps BETWEEN 0 AND 10000);
```
```sql
-- V11: payment refund state. Money is BIGINT minor units (#5); status TEXT+CHECK (postgres skill).
ALTER TABLE payment ADD COLUMN refunded_minor BIGINT NOT NULL DEFAULT 0
    CONSTRAINT payment_refunded_check CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor);
ALTER TABLE payment ADD COLUMN refund_id TEXT;                    -- Stripe refund id (re_...), null until refunded
ALTER TABLE payment DROP CONSTRAINT payment_status_check;
ALTER TABLE payment ADD CONSTRAINT payment_status_check CHECK (status IN
    ('REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'));
```

- [ ] **Step 1: failing tests** — extend the migration ITs to assert the new columns/constraints exist
  (Testcontainers): `booking.cancelled_at`/`refund_minor` + the bound CHECK; `venue.late_cancel_refund_bps`
  default 0 + `0..10000` CHECK; `payment` accepts `REFUNDED`/`PARTIALLY_REFUNDED` + `refunded_minor` bound.
- [ ] **Step 3: write V10 + V11.**
- [ ] **Step 4:** `./gradlew test --tests "*MigrationIT*"` green (Docker).
- [ ] **Step 5:** write `ADR-0005` (refund tiers: full-before / configurable-partial-after; reversal
  mirrors refund, proportional; rounding down) + add glossary terms to `CONTEXT.md`.
- [ ] **Step 6: commit** `[U6] Flyway V10/V11: cancellation + refund schema; ADR-0005 (#11)`.

## Phase 1 — `booking` view (GET /api/bookings/{code}) + server-side refund policy

**Files:** `RefundPolicy` (domain), `ViewBooking`/`BookingDetail`/`Bookings.findByCode`/`BookingRecord`,
`JdbcBookings`, `VenueCatalog#lateCancelRefundBps` + `JdbcVenueCatalog`, `BookingCutoff#freeCancellationOpen`,
`BookingController` GET + `BookingDetailView`; Tests `RefundPolicyTest`, `BookingCutoffTest` (boundary),
`BookingViewIT`, `JdbcBookings` find IT, `SetBookingInfoIT`/venue IT for the bps lookup.

> Load `riviera-modulith` + `riviera-java-conventions` + `riviera-stripe-payments` (refund policy) +
> `postgres` (the query) — done.

```java
// booking.domain.RefundPolicy — pure, no Spring (mirrors payout CommissionMath). Rounding DOWN (#5).
final class RefundPolicy {
    private static final long BPS_DENOMINATOR = 10_000L;
    private RefundPolicy() {}
    static long refundMinor(long grossMinor, boolean beforeCutoff, int lateCancelBps) {
        if (beforeCutoff) return grossMinor;                                  // full (invariant #10)
        return Math.floorDiv(grossMinor * lateCancelBps, BPS_DENOMINATOR);    // configurable partial
    }
}

// booking.application.in
interface ViewBooking { Optional<BookingDetail> byCode(String code); }
// BookingDetail carries the summary + computed terms (cancellable, beforeCutoff, refundIfCancelledNow,
// refundedAmount when already cancelled).

// venue.api.VenueCatalog (added)
OptionalInt lateCancelRefundBps(VenueId venueId);
```

- [ ] **Step 1: failing test** `RefundPolicyTest` (gross 4500: before→4500; after@5000bps→2250;
  after@0→0; rounding-down case e.g. gross 4505 @ 5000bps → 2252) and `BookingViewIT.returnsDetailWithRefundTerms`
  / `unknownCodeIsEmpty`.
- [ ] **Step 3: implement** `RefundPolicy`; `Bookings.findByCode` (`SELECT … WHERE code=:code`) +
  `BookingRecord`; `ViewBookingService` (loads booking + `venueCatalog.setBookingInfo` for cutoff/display
  + `lateCancelRefundBps`, computes terms via `BookingCutoff.freeCancellationOpen` + `RefundPolicy`);
  `VenueCatalog#lateCancelRefundBps` + JDBC; controller GET + `BookingDetailView`. Never log the code (#7).
- [ ] **Step 4:** `./gradlew test --tests "*booking*" --tests "*Venue*"` green; `ModularityTests` green.
- [ ] **Step 6: commit** `[U6] booking: GET /api/bookings/{code} + server-side refund terms (#11)`.

## Phase 2 — `payment` RefundPort + gateway refund + record

**Files:** `payment.api.{RefundPort,RefundResult}`, `payment.application.RefundService`,
`PaymentGateway#refund` + `RefundOutcome`, `Payments#markRefunded` + `JdbcPayments`,
`Stub/StripePaymentGateway`, `PaymentStatus`; Tests `StubPaymentGatewayTest`, `StripePaymentGatewayTest`
(mock `StripeClient`, assert idempotency key), `RefundServiceTest`, `JdbcPaymentsIT`.

> Load `riviera-stripe-payments` + `riviera-modulith` + `riviera-java-conventions` — done.

```java
// payment.api
public interface RefundPort { RefundResult refund(BookingRef booking, Money amount); }
public sealed interface RefundResult { record Refunded(String refundId) implements RefundResult {}
                                       record Failed(String reason) implements RefundResult {} }

// payment.application.out.PaymentGateway (added) — refund is server-initiated, idempotency-keyed (#8/#10)
RefundOutcome refund(BookingRef booking, Money amount);

// StripePaymentGateway.refund: stripe.v1().refunds().create(RefundCreateParams … paymentIntent),
//   RequestOptions idempotencyKey = "booking-"+booking.value()+"-refund"; typed Failed on StripeException.
// StubPaymentGateway.refund: return new RefundOutcome.Succeeded("stub-re-"+booking.value()).
```

- [ ] **Step 1: failing test** `StripePaymentGatewayTest.refundUsesIdempotencyKey` (mock client, capture
  `RequestOptions`), `RefundServiceTest` (delegates to gateway, records via `Payments.markRefunded` with
  `REFUNDED` for full / `PARTIALLY_REFUNDED` for partial), `JdbcPaymentsIT.markRefundedUpdatesRow`.
- [ ] **Step 3: implement** the ports, both gateway impls, `RefundService`, `markRefunded`
  (`UPDATE payment SET status,refunded_minor,refund_id,updated_at WHERE booking_ref=:ref` — 0-row no-op
  under stub), `PaymentStatus` tokens.
- [ ] **Step 4:** `./gradlew test --tests "*payment*"` + `ModularityTests` green (`payment` stays `{}`).
- [ ] **Step 6: commit** `[U6] payment: RefundPort + gateway refund (idempotency-keyed) + record (#11)`.

## Phase 3 — `booking` cancel orchestration + `BookingCancelled` + POST /{code}/cancel

**Files:** `CancelBooking`/`CancelOutcome` (application.in), `CancelBookingService`,
`Bookings#cancelConfirmed` + `CancelledBooking`, `JdbcBookings`, `booking.api.BookingCancelled`,
`BookingController` POST + `CancellationView`; Tests `CancelBookingServiceTest` (fakes),
`CancelBookingIT` (release + event + refund call), `BookingControllerIT` (200/404/409),
`JdbcBookingsTransitionIT` (guarded cancel).

> Load all backend skills — done.

```java
// booking.api
public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
                               LocalDate bookingDate, long refundMinor, String currency) {}

// booking.application.in
sealed interface CancelOutcome permits Cancelled, NotFound, NotCancellable { … }
//   Cancelled(long refundMinor, String currency, Tier tier) ; Tier { FULL, PARTIAL, NONE }

// booking.application.out.Bookings (added) — guarded CONFIRMED->CANCELLED, RETURNING facts
Optional<CancelledBooking> cancelConfirmed(long bookingId, Instant cancelledAt, long refundMinor);
```
`CancelBookingService.cancel(code)` (`@Transactional`): `findByCode` → guard `CONFIRMED` → compute
refund (cutoff + `RefundPolicy`) → `cancelConfirmed` (guard; empty ⇒ `NotCancellable`) →
`availability.release` → `refundPort.refund(...)` **iff** refund>0 → `publishEvent(BookingCancelled)` →
`Cancelled`. The amount is **never** taken from the request (AC-3).

- [ ] **Step 1: failing test** `CancelBookingServiceTest.computesRefundServerSide` /
  `rejectsNonConfirmed`; `CancelBookingIT.cancelReleasesTheSet` /
  `publishesBookingCancelledOnCancel` (`AssertablePublishedEvents`).
- [ ] **Step 3: implement** the event, ports, `cancelConfirmed` SQL (`UPDATE … SET status=CANCELLED,
  cancelled_at=:at, refund_minor=:r WHERE id=:id AND status='CONFIRMED' RETURNING …`), service, controller
  POST mapping (`Cancelled`→200, `NotFound`→404, `NotCancellable`→409). Log ids only (#7/#9, R-9).
- [ ] **Step 4:** `./gradlew test --tests "*booking*"` + `ModularityTests` green.
- [ ] **Step 6: commit** `[U6] booking: cancel + BookingCancelled + POST /{code}/cancel (#11)`.

## Phase 4 — `payout` proportional REVERSAL listener

**Files:** `PayoutLedgerEntry#reversalOf`, `PayoutLedger#findAccrual`/`reverse`, `JdbcPayoutLedger`,
`BookingCancelledPayoutListener`; Tests `ReversalMathTest` (pure), `PayoutReversalIT`,
`PayoutReversalScenarioIT`.

> Load `riviera-stripe-payments` + `riviera-modulith` + `postgres` — done.

```java
// payout.domain.PayoutLedgerEntry — positive magnitudes (V9 CHECK forbids negatives); proportional (#5/#9)
public static PayoutLedgerEntry reversalOf(PayoutLedgerEntry accrual, long refundMinor) {
    long revCommission = accrual.grossMinor() == 0 ? 0
            : Math.floorDiv(accrual.commissionMinor() * refundMinor, accrual.grossMinor());
    return new PayoutLedgerEntry(accrual.venueId(), accrual.bookingId(), EntryType.REVERSAL,
            refundMinor, revCommission, refundMinor - revCommission, accrual.currency());
}

// payout.infrastructure.in.BookingCancelledPayoutListener
@ApplicationModuleListener
void on(BookingCancelled e) {
    if (e.refundMinor() <= 0) return;                                  // nothing refunded → accrual stands
    ledger.findAccrual(e.bookingId().value())
          .ifPresent(accrual -> ledger.reverse(PayoutLedgerEntry.reversalOf(accrual, e.refundMinor())));
}
```

- [ ] **Step 1: failing test** `ReversalMathTest` (G4500/C675: R4500→rev(4500,675,3825); R2250→rev(2250,337,1913);
  R0 path not built; rounding case) + `PayoutReversalIT.reversesProportionally` / `redeliveryIsIdempotent`
  / `noRefundNoReversal`.
- [ ] **Step 3: implement** the factory; `findAccrual` (`SELECT … WHERE booking_id=:id AND entry_type='ACCRUAL'`)
  + `reverse` (shared idempotent `INSERT … ON CONFLICT (booking_id, entry_type) DO NOTHING`); the listener.
- [ ] **Step 4:** `./gradlew test --tests "*ayout*"` + `ModularityTests` green.
- [ ] **Step 6: commit** `[U6] payout: proportional REVERSAL on BookingCancelled (#11)`.

## Phase 5 — Frontend booking view + cancel

**Files:** `booking/booking-view.ts` (+`.scss`), `booking.service.ts`, `booking.model.ts`,
`booking-confirmation.ts`, `app.routes.ts`; Test `booking-view.spec.ts`.

> Load `angular-developer` + angular-cli MCP `get_best_practices` (done; v22). Run `ng build` after.

- [ ] **Step 1: failing test** `booking-view.spec.ts` — renders details + refund terms from a stubbed
  `getByCode`; clicking cancel (after confirm) calls `cancel` and shows the refund outcome; AXE clean.
- [ ] **Step 3: implement** `getByCode(code): Observable<BookingDetail>` + `cancel(code): Observable<Cancellation>`
  on the service (typed, `environment.apiBaseUrl`); `BookingDetail`/`Cancellation` models (no `any`);
  `booking-view` standalone component using `resource()` for the GET, a cancel button with an accessible
  confirm (focus management), refund-terms copy ("Free cancellation until the evening before — full
  refund €X" vs "Non-refundable / €Y partial"), money via `Intl.NumberFormat`; route `booking/:code`
  (lazy); a "Manage / view booking" link on the confirmation screen.
- [ ] **Step 4:** `npm --prefix frontend run build` + `npm --prefix frontend test` green (incl. AXE).
- [ ] **Step 6: commit** `[U6] frontend: booking view + cancel with refund terms (#11)`.

## Phase 6 — verify + review gate

- [ ] `./gradlew test` full suite green (incl. `ModularityTests`, `JdbcOnlyArchitectureTests`,
  `NoStripeConnectArchitectureTest`); `ng build` + frontend tests green.
- [ ] **Review gate:** `/code-review origin/main...HEAD` + `riviera-review-overlay` (RV-BE/RV-FE/RV-CT
  + the availability/payment blockers + RV-PROC-1). Announce it. Resolve findings **through the loop**
  (re-run the Skill-routing gate per fix; re-CI; re-review).
- [ ] Update issue #11 if any drift surfaced; note #50's dependency on the new GET.
- [ ] Push `claude/u6-booking-cancel-w1d5pc`. **PR/merge deferred to the user** unless asked.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-8 (backend):** `./gradlew test` → all named ITs/tests green. Verified at `<sha>`.
- [ ] **AC-9/AC-10 (frontend + full):** `npm --prefix frontend test` + `./gradlew test` green. `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task + a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA**; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; release is idempotent; guarded transition tested (invariant #2).
- [ ] Cutoff reused for cancellation in `Europe/Tirane` from injected `Clock` (invariants #4/#6).
- [ ] **Modulith** section filled; no cross-module internal imports; `BookingCancelled` id-based; no new
  edges / no cycle; `payment` stays `{}` (invariant #11); `ModularityTests` green.
- [ ] **Payment/payout** filled; refund server-computed + idempotency-keyed; reversal exactly-once +
  proportional + positive magnitudes; money minor units (invariants #5, #8, #9, #10).
- [ ] Booking code never logged; treated as a bearer credential (invariant #7).
- [ ] Flyway V10/V11 present; constraints tested (invariant #12).
- [ ] **Frontend** standards met; no `as any`; AXE/WCAG-AA.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty or deferred with an issue #.
