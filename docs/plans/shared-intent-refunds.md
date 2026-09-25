# Multi-day stays 9/12: one payment across several bookings, refunded per booking Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** `payment` can hold one PaymentIntent that collects for several bookings and refund each
of those bookings separately, at most once each, with the failure webhooks reconciling the right
booking; a single-booking payment behaves exactly as today and the payout ledger is untouched.

**Architecture:** The collection record splits in two. `payment` keeps what is true of the
PaymentIntent (id, secret, total, currency, lifecycle status); a new child table `payment_booking`
holds one row per booking the intent collects for — its share and its refund state (amount, gateway
id, attempt, failure trace). Every refund write becomes a guarded statement on the child that
re-derives the parent's status from the children's sum in the same statement. At Stripe, a refund is
tagged with its booking in metadata, which is how the adapter's adoption read and the webhook's
un-record tell one booking's refund from a sibling's on the same intent.

**Persistence:** JDBC only (invariant #1). `payment_booking` (V64) created and back-filled from
`payment`; `payment.booking_ref` and its five refund columns dropped after the move; the owed-refund
partial index re-created on the child.

**Source of intent:** GitHub issue #1207; `docs/architecture/multi-day-stays.md` § D6, D8 (epic
#1096, stories 14, 20, 40).

**Skills consulted:** `riviera-sdlc` (intake gate: the issue's "refund child table keyed by
booking" cannot be only a refund table — a sibling booking must be reachable from its intent for
`findPendingCredentials`, `cancel` and `refund` before any refund exists, so the child row is created
at collection time and carries the share; `payment` today cannot hold two bookings on one intent at
all (`UNIQUE (payment_intent_id)` + `UNIQUE (booking_ref)`), so the collection side changes in this
slice even though group checkout is slice 10's; the Stripe adoption rule "exactly one live refund on
the intent" would refuse every sibling after the first refund, so refunds need an owner tag at the
gateway; open PRs are dependabot only; V64 is free on `main` @ `c5415f48` and unclaimed; the previous
sibling #1204 merged via PR #1220 with its close-out comment posted, and its plan
`docs/plans/venue-max-stay.md` retires in this PR's last code commit) · `riviera-plan-doc` (forced
the data-move test onto a real pre-V64 schema and the "sibling's refund does not block mine"
state into the ACs) · `tdd` (each AC red first at its seam) · `riviera-review-overlay` (runs at
ready-for-review) · `riviera-docs-freshness` (runs at close-out; the runbooks and the domain model
name the moved columns) · `grilling` (the intake questions were answered from the code and are
recorded as Assumptions below) · `riviera-stripe-payments` (idempotency key unchanged per booking;
webhooks stay the truth; refund metadata is a Stripe-edge concern and lives in the adapters only) ·
`riviera-modulith` (no new port: `Payments` is module-internal; the published `api/` ports keep
their shape; `PaymentConfirmed`/`PaymentCanceled` are published once per booking on the intent, so
`booking`'s listener is unchanged) · `riviera-java-conventions` (records for the new shapes;
guarded single-statement writes that report whether they moved; no new problem code) ·
`codebase-design` (the seam stays `Payments`; the attribution rule is a private decision inside
`StripePaymentGateway`, tested through `PaymentGateway`) · `domain-modeling` (no new glossary term:
a stay is still a group of bookings; `CONTEXT.md` unchanged) · `postgres` (identity PK, FK indexed,
`UNIQUE (booking_ref)` and `UNIQUE (refund_id)`, per-share `CHECK`, partial index for the owed
list; the move is one `INSERT … SELECT` before the columns drop) · `riviera-local-debug` (JDK 25 at
`/opt/jdk-25`, scoped test runs only; the Maven proxy 429s transiently — retry)

**Branch:** `claude/sdlc-1207-uhgau0` (the designated cloud branch stands in for
`feature/shared-intent-refunds`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a database at V63 holding a collected payment with a full refund, a partial
  refund, an owed (failed) refund and an untouched row, when V64 runs, then `payment_booking` holds
  one row per payment with the same `booking_ref`, share, `refunded_minor`, `refund_id`, attempt and
  failure trace, and `payment` no longer carries them. *Seam:* the schema through Flyway · *Pinned by:*
  `PaymentBookingBackfillIT.everyExistingPaymentBecomesOneBookingRowWithItsRefundIntact`
- [x] **AC-2:** Given the schema at V64, when two `payment_booking` rows name the same booking, or
  a share's `refunded_minor` exceeds its `amount_minor`, then the insert is refused; a payment with
  two bookings on one intent is accepted. *Seam:* the `payment_booking` table · *Pinned by:*
  `PaymentMigrationIT.oneBookingRowPerBooking`, `PaymentMigrationIT.aShareCannotBeOverRefunded`,
  `PaymentMigrationIT.oneIntentMayCollectForSeveralBookings`
- [x] **AC-3:** Given one intent registered for bookings A (4500) and B (3000), when the refund of A
  is recorded, then A's progress is `ACCEPTED`, B's is `OUTSTANDING`, and the payment reads
  `PARTIALLY_REFUNDED`; recording B's refund reads `REFUNDED`; un-recording A's refund puts A back to
  `OUTSTANDING`, leaves B `ACCEPTED`, and the payment reads `PARTIALLY_REFUNDED` again. *Seam:*
  `Payments` (`register`, `markRefunded`, `markRefundFailed`) + `RefundStatusLookup` · *Pinned by:*
  `JdbcPaymentsIT.refundingOneBookingOnASharedIntentLeavesItsSiblingOutstanding`,
  `JdbcPaymentsIT.unrecordingOneSiblingsRefundKeepsTheOthers`,
  `RefundServiceTest.progressIsOutstandingWhenOnlyASiblingWasRefunded`
- [x] **AC-4:** Given one intent for bookings A and B, when a verified `payment_intent.succeeded`
  arrives, then the payment moves to `SUCCEEDED` once and `PaymentConfirmed` is published once for
  A and once for B; `payment_intent.canceled` likewise publishes `PaymentCanceled` per booking.
  *Seam:* `POST /api/payments/stripe/webhook` → `payment::events` · *Pinned by:*
  `StripeWebhookIT.succeededOnASharedIntentConfirmsEveryBooking`,
  `StripeWebhookIT.canceledOnASharedIntentReleasesEveryBooking`
- [x] **AC-5:** Given one intent for A and B with both refunds recorded, when a verified
  `refund.failed` names B's refund id, then only B is un-recorded and owed; when a `refund.failed`
  names an unrecorded refund carrying `metadata.bookingRef = A` after A's attempt, then A is owed
  and B untouched; the same failure with no booking tag on a shared intent moves nothing. *Seam:*
  `POST /api/payments/stripe/webhook` · *Pinned by:*
  `StripeWebhookIT.aFailedRefundOnASharedIntentUnrecordsOnlyItsBooking`,
  `StripeWebhookIT.anUnrecordedFailureIsAttributedByItsBookingTag`,
  `StripeWebhookIT.anUntaggedUnrecordedFailureOnASharedIntentMovesNothing`
- [x] **AC-6:** Given a collecting gateway holding one intent for two bookings, when each is
  refunded and then each call is replayed beyond the key window, then each replay reports its own
  first refund id and exactly two refunds were minted. The coverage rule still fails the build for an
  unclassified collecting gateway. *Seam:* `PaymentGateway#refund` · *Pinned by:*
  `PaymentGatewayRefundContract.severalBookingsOnOneCollectionAreEachRefundedOnce` (bound by
  `StripeRefundContractTest`), `PaymentGatewayContractCoverageArchitectureTest` (unchanged)
- [x] **AC-7:** Given Stripe holds a live refund tagged with sibling B on A's intent, when A is
  refunded, then a fresh refund is created for A carrying `metadata.bookingRef = A` and the
  booking-derived key; given Stripe holds an untagged live refund on a shared intent, then A's
  refund is `Failed("refund_mismatch")` and nothing is created; on a single-booking intent an
  untagged live refund is adopted exactly as today. *Seam:* `PaymentGateway#refund` · *Pinned by:*
  `StripePaymentGatewayTest.tagsTheRefundWithItsBooking`,
  `StripePaymentGatewayTest.aSiblingsLiveRefundDoesNotBlockThisBookings`,
  `StripePaymentGatewayTest.refusesAnUntaggedLiveRefundOnASharedIntent`,
  `StripePaymentGatewayTest.adoptsAnExistingStripeRefundInsteadOfCreatingASecond` (existing)
- [x] **AC-8:** Given three confirmed bookings each with an accrual, when `BookingCancelled` with a
  full refund is published for two of them, then each of those two has exactly one `REVERSAL` and the
  third has none. *Seam:* `booking::events` → the payout ledger · *Pinned by:*
  `PayoutReversalIT.twoOfThreeSegmentsReverseExactlyTwice`
- [x] **AC-9:** Given the existing payment and refund suites, when run against V64, then every
  behaviour assertion passes unchanged; the only edits are fixtures that inserted a `payment` row by
  hand or read a moved column by name. *Seam:* the suites themselves · *Pinned by:* the test classes
  in the File structure marked "fixture only"

## Non-goals

- Group checkout through `CheckoutPort` (one call collecting for several bookings) — slice 10's; this
  slice makes `Payments.register` and the webhook fan-out group-capable so slice 10 adds the port
  without touching persistence or reconciliation.
- More than one refund per booking (the stormy-day share, #1210): `payment_booking_uniq` keeps one
  refund per booking and the key `booking-<id>-refund`; #1210 relaxes both.
- A group cancel of the intent: `CancelPaymentPort.cancel(booking)` cancels the intent behind the
  booking, which for an unpaid group is all of it — an unpaid group is all-or-nothing (story 18/38).
- Any product or UI change.

## Behavior-parity ledger (retirement / replacement slices only)

The five refund columns and `booking_ref` move tables; every reader is re-pointed. Marked here
because the runbooks' SQL and the domain model name the old columns.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `markRefunded` sets `refunded_minor` absolutely, status `REFUNDED`/`PARTIALLY_REFUNDED` by comparing to `amount_minor` | preserved | On the child; the parent's status compares the children's sum to the intent total |
| `markRefunded` refuses an uncollected payment and a refund id already reported dead | preserved | Same guards, joined to the parent's status |
| `markRefundFailed(refundId)` un-records and restores `SUCCEEDED` | changed | Restores `SUCCEEDED` only when no sibling remains refunded, else `PARTIALLY_REFUNDED` |
| `markUnrecordedRefundFailed(intent, refundId)` matched by intent | changed | Keyed by booking; the webhook resolves the booking from the refund's tag, or the intent's sole booking when untagged |
| `findBookingRefByIntent` → one booking | changed | `findBookingRefsByIntent` → every booking on the intent; the webhook publishes per booking |
| Owed-refund list and gauge count payments | preserved | Count `payment_booking` rows — one per booking, as before |
| Runbook SQL against `payment.refund_*` / `booking_ref` | changed | Re-pointed at `payment_booking` (`docs/runbooks/observability.md`, `stripe-profile-smoke-test.md`) |
| Adoption: exactly one live refund on the intent for exactly the amount | preserved on a single-booking intent; changed on a shared one | Shared intent: candidates are the live refunds tagged with this booking; an untagged live refund is `refund_mismatch` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The V64 data move changes a refunded amount or drops a failure trace | Low | A guest shown refunded who was not, or an owed refund off the list (#10) | One `INSERT … SELECT` before the columns drop; `PaymentBookingBackfillIT` runs V64 on a real V63 schema seeded with every refund shape | payment | closed — b3755047 |
| R-2 | The parent's status is derived in the same statement as the child write; a data-modifying CTE sees the pre-statement snapshot, so a naive `SUM` misses the row just written | High | `PARTIALLY_REFUNDED` where `REFUNDED` is true | The sum is computed over the siblings plus the value being written, never re-read; AC-3 pins both directions | payment | closed — b3755047 |
| R-3 | An untagged live refund on a shared intent (a manual dashboard refund, or a pre-slice refund) cannot be attributed | Medium | Adopting it for the wrong booking would strand a guest owed money | Refuse with `refund_mismatch` — the posture that already means "a human settles this"; single-booking intents keep today's rule | payment | closed — f80c42aa |
| R-4 | Cross-module test fixtures insert `payment` rows by hand and will not compile against V64 | Certain | Red CI | Enumerated: `AbandonedBookingSweepIT`, `RequestAcceptPayIT`, `ConcurrentRequestClaimIT`, `GuestContactRetentionIT`, `AccountErasureIT` — each inserts parent + child | this PR | closed — b3755047 (a second `booking_ref` update in `RequestAcceptPayIT` was found by the run, not the grep) |
| R-5 | `Payments` doubles outside the module break on the port change | Certain | Compile break | `WebSliceStubs`, `PaymentServiceTest#noPayments`, `ThrowingPayments` updated in phase 1 | this PR | closed — b3755047 |
| R-6 | Flyway `V64` collides with another branch | Low | Rename | Free on `main` @ `c5415f48`, unclaimed by any open PR; the branch merging second renumbers | this PR | closed — still free at ready-for-review |
| R-7 | The webhook publishes per booking; a listener failure on one booking leaves the others confirmed | Low | Partial confirmation of a group | Each publication is registry-backed and re-driven independently; the same at-least-once posture as today per booking | payment | closed — b3755047 (`StripeWebhookIT.succeededOnASharedIntentConfirmsEveryBooking`) |
| R-8 | Webhook duplicate / out-of-order on a shared intent (#8) | Medium | Double un-record or a late event contradicting a refund | Unchanged guards: event-id dedup; `markStatus` moves only open rows; the un-record is keyed on the recorded `refund_id`, unique per child | payment | closed — b3755047 (existing `StripeWebhookIT` cases unchanged) |
| R-9 | Payout double-accrual or double-reversal (#9) | Low | Venue over/under-paid | Untouched: `UNIQUE (booking_id, entry_type)`; AC-8 pins two-of-three | payout | closed — phase 4 |
| R-10 | The refund attempt stamp must stay visible mid-call from another connection | Low | A racing failure misattributed | `RefundAttemptVisibilityIT` re-pointed at the child column; `RefundService` unchanged | payment | closed — b3755047 |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the child table is `payment_booking` — one row per booking the intent collects for,
  created at `register` time, carrying the share and the refund state; the issue's "refund child
  table keyed by booking" needs the mapping to exist before any refund does, so the two are one
  table. Outcome: kept (V64, b3755047).
- **Assumption:** `payment.booking_ref`, `refunded_minor`, `refund_id`, `refund_attempted_at`,
  `refund_failed_at` and `failed_refund_id` move to the child rather than staying as a duplicated
  "lead booking" view; the parent's status is derived from the children's sum. Outcome: kept
  (b3755047; `JdbcPaymentsIT.unrecordingOneSiblingsRefundKeepsTheOthers` pins the derivation).
- **Assumption:** the refund's owner travels as Stripe refund metadata `bookingRef`, set on create
  and read on list and on the failure webhook; an untagged live refund on a shared intent is refused
  (`refund_mismatch`) rather than guessed at. Outcome: kept (f80c42aa, b3755047).
- **Assumption:** `CheckoutPort`, `RefundPort`, `CancelPaymentPort`, `RefundStatusLookup` and the
  two events keep their shape; `payment` publishes one `PaymentConfirmed`/`PaymentCanceled` per
  booking on the intent. Outcome: kept (b3755047).
- **Assumption:** at most one refund per booking (`payment_booking_uniq`, key unchanged); #1210
  owns the second. Outcome: kept (V64).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no write path to `set_availability` changes; `booking`'s
listeners consume the same per-booking events they do today.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `payment`, `payment_booking` (new) | Its Job: PaymentIntents, refunds, webhook reconciliation |
| M-2 | `payout` | existing | none (a pinning test only) | Story 40: one accrual and one reversal per booking is its exactly-once promise |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | unchanged (`CheckoutPort`, `RefundPort`, `CancelPaymentPort`, `RefundStatusLookup`, `PaymentCredentialsLookup`) | unchanged | `booking` |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `PaymentConfirmed` | `StripeWebhookController`, once per booking on the intent | `BookingRef`, intent id | `booking` | async (registry) | `StripeWebhookIT` |
| EV-2 | `PaymentCanceled` | same, once per booking | `BookingRef` | `booking` | async (registry) | `StripeWebhookIT` |

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| One intent collecting for several bookings; per-booking refund state; attribution of a gateway refund to its booking | `payment` | Job: "Own Stripe collection — PaymentIntents, refunds, and webhook handling"; `booking`'s Not-My-Job leaves execution to `payment`, and `payment` still decides nothing about whether or how much |
| One reversal per refunded booking | `payout` | Unchanged; pinned only |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, no Connect; payout via manual BKT batch.
- **Confirmation trigger:** signature-verified webhook; on a shared intent the one verified
  `succeeded` confirms every booking it collects for.
- **Idempotency:** PaymentIntent key `booking-<id>-pi` (unchanged); refund key
  `booking-<id>-refund`, unique per booking on the intent; refund create carries
  `metadata.bookingRef`; webhook dedup on event id (unchanged); every refund write is a guarded
  single statement keyed on the child row.
- **Money:** integer minor units, EUR; a share is bounded by `payment_booking_refunded_check`; the
  intent total is the sum of shares.
- **Payout-ledger effect:** untouched — `BookingCancelled` is per booking, so one reversal per
  refunded booking; AC-8.
- **Refund policy applied:** unchanged, server-side in `booking` (#10); `payment` executes.
- **Pinning tests:** `JdbcPaymentsIT`, `StripeWebhookIT`, `StripePaymentGatewayTest`,
  `StripeRefundContractTest` (via `PaymentGatewayRefundContract`), `PayoutReversalIT`,
  `PaymentBookingBackfillIT`.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `PR — draft open, CI gate`

**Next action:** check the draft's CI run; then merge `origin/main`, mark ready for review, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V64 `payment_booking` + backfill IT | ✅ | b3755047 |
| 1 — `Payments` on the child: parity for one booking, then shared-intent state | ✅ | b3755047 |
| 2 — Webhook: per-booking fan-out, refund attribution | ✅ | b3755047 |
| 3 — Stripe adapter: refund tag, shared-intent adoption; contract extension | ✅ | f80c42aa |
| 4 — Payout pin, docs, plan retirement, close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/resources/db/migration/V64__payment_booking.sql` — the child table, the move, the drops, the re-created partial index
- `platform/src/main/java/ai/riviera/platform/payment/application/NewPayment.java` — one intent, one or more `Share(bookingRef, amountMinor)`; the single-booking constructor stays
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — `findBookingRefsByIntent`, `markUnrecordedRefundFailed(BookingRef, String)`; Javadoc re-read whole
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundService.java` — progress reads the child's amount against the parent's collected status
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundState.java` — Javadoc: the share, not the row
- `platform/src/main/java/ai/riviera/platform/payment/domain/PaymentStatus.java` — `holdsCollectedMoney()`, the one lifecycle rule two callers share
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — every statement re-pointed; the parent status derived in the refund writes
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripePaymentGateway.java` — refund tag; shared-intent candidate rule
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripeRefundTag.java` — the metadata key and its read, shared by both adapters
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/StripeWebhookController.java` — per-booking publish; refund attribution
- `platform/src/test/java/ai/riviera/platform/payment/PaymentBookingBackfillIT.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/payment/PaymentMigrationIT.java` — AC-2; fixtures re-pointed
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — AC-3; column reads re-pointed
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePaymentGatewayTest.java` — AC-7
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefundContractTest.java` — AC-6 binding; the fake keeps refund metadata
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefunds.java` — a tagged refund shape
- `platform/src/test/java/ai/riviera/platform/payment/adapter/in/StripeWebhookIT.java` — AC-4, AC-5; column reads re-pointed
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentGatewayRefundContract.java` — AC-6
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundServiceTest.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundAttemptVisibilityIT.java` — fixture only (column moved)
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentServiceTest.java` — fixture only (port shape)
- `platform/src/test/java/ai/riviera/platform/payment/application/ThrowingPayments.java` — fixture only (port shape)
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — fixture only (port shape)
- `platform/src/test/java/ai/riviera/platform/booking/AbandonedBookingSweepIT.java` — fixture only (hand-inserted payment)
- `platform/src/test/java/ai/riviera/platform/booking/RequestAcceptPayIT.java` — fixture only
- `platform/src/test/java/ai/riviera/platform/booking/ConcurrentRequestClaimIT.java` — fixture only
- `platform/src/test/java/ai/riviera/platform/customer/GuestContactRetentionIT.java` — fixture only
- `platform/src/test/java/ai/riviera/platform/customer/AccountErasureIT.java` — fixture only
- `platform/src/test/java/ai/riviera/platform/payout/PayoutReversalIT.java` — AC-8
- `RESPONSIBILITIES.md` — § `payment`: the child table, the tag, the shared-intent adoption rule
- `CLAUDE.md` — `payment` *Sole writer of* cell gains `payment_booking`
- `docs/architecture/domain-model.md` — § 3.4 diagram and note
- `docs/architecture/multi-day-stays.md` — status line
- `docs/runbooks/observability.md` — the owed-refund SQL and the settle-by-hand statement
- `docs/runbooks/stripe-profile-smoke-test.md` — the DB checks
- `docs/plans/venue-max-stay.md` — retired (merged via PR #1220)
- `docs/plans/shared-intent-refunds.md` — this plan

---

## Phase 0 — V64 `payment_booking` + backfill IT

**Files:** Create `V64__payment_booking.sql` · Create `PaymentBookingBackfillIT.java` · Modify
`PaymentMigrationIT.java`

- [ ] **Step 1: Write the failing tests** — `PaymentBookingBackfillIT` (`spring.flyway.target=63`,
  the `BookingLastDateBackfillIT` shape): seed four `payment` rows (full refund, partial refund, owed
  after a failure, untouched), migrate to latest, assert one `payment_booking` row each with the same
  values and that `payment` has no `booking_ref` column. `PaymentMigrationIT`: AC-2's three cases.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*PaymentBookingBackfillIT*" --tests "*PaymentMigrationIT*"` → FAIL (no such table)
- [ ] **Step 3: Minimal implementation** — the migration:

```sql
CREATE TABLE payment_booking (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id          BIGINT      NOT NULL REFERENCES payment (id),
    booking_ref         BIGINT      NOT NULL,
    amount_minor        BIGINT      NOT NULL,
    refunded_minor      BIGINT      NOT NULL DEFAULT 0,
    refund_id           TEXT,
    refund_attempted_at TIMESTAMPTZ,
    refund_failed_at    TIMESTAMPTZ,
    failed_refund_id    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_booking_uniq           UNIQUE (booking_ref),
    CONSTRAINT payment_booking_refund_uniq    UNIQUE (refund_id),
    CONSTRAINT payment_booking_amount_check   CHECK (amount_minor >= 0),
    CONSTRAINT payment_booking_refunded_check CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor)
);
CREATE INDEX payment_booking_payment_idx ON payment_booking (payment_id);
CREATE INDEX payment_booking_refund_owed_idx ON payment_booking (booking_ref) WHERE refund_failed_at IS NOT NULL;
INSERT INTO payment_booking (payment_id, booking_ref, amount_minor, refunded_minor, refund_id,
                             refund_attempted_at, refund_failed_at, failed_refund_id, created_at, updated_at)
SELECT id, booking_ref, amount_minor, refunded_minor, refund_id,
       refund_attempted_at, refund_failed_at, failed_refund_id, created_at, updated_at
FROM payment;
DROP INDEX payment_refund_owed_idx;
ALTER TABLE payment
    DROP COLUMN booking_ref, DROP COLUMN refunded_minor, DROP COLUMN refund_id,
    DROP COLUMN refund_attempted_at, DROP COLUMN refund_failed_at, DROP COLUMN failed_refund_id;
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS. The rest of the suite is red until phase 1 (the adapter still names the dropped columns); phases 0 and 1 ship in one push.
- [ ] **Step 5: Generalization-audit pass** — every hand-written `INSERT INTO payment` in the tree: `grep -rn "INSERT INTO payment\b" platform/src docs scripts` → the five fixtures in R-4 plus the two runbooks; all re-pointed in phases 1 and 4.
- [ ] **Step 6: Commit** — `git commit -m "Move a booking's share and refund state to payment_booking (#1207)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

## Phase 1 — `Payments` on the child

**Files:** Modify `NewPayment`, `Payments`, `JdbcPayments`, `RefundService`; the doubles in R-5; the
fixtures in R-4; Test `JdbcPaymentsIT`, `RefundServiceTest`, `RefundAttemptVisibilityIT`

- [ ] **Step 1: Write the failing tests** — `JdbcPaymentsIT`: AC-3's two cases plus
  `findBookingRefsByIntent` answering both bookings; `RefundServiceTest`: `PARTIALLY_REFUNDED` with a
  zero share is `OUTSTANDING`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcPaymentsIT*" --tests "*RefundServiceTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `NewPayment(String paymentIntentId, String currency, String clientSecret, List<Share> shares)` with the five-argument constructor delegating to one share; `register` inserts the parent `RETURNING id` then one child per share; every read joins `payment_booking b ON b.payment_id = p.id`; `markRefunded`, `markRefundFailed`, `markUnrecordedRefundFailed` as data-modifying CTEs updating the child and then the parent's status from `(SELECT COALESCE(SUM(refunded_minor), 0) FROM payment_booking WHERE payment_id = … AND id <> moved.id) + :refunded` (R-2).
- [ ] **Step 4: Run it, verify it passes** — the payment package: `./gradlew test --tests "ai.riviera.platform.payment.*"` → PASS; then the five R-4 fixtures' classes.
- [ ] **Step 5: Generalization-audit pass** — every `Payments` implementation: `grep -rln "implements Payments\|new Payments()\|extends ThrowingPayments" platform/src` → judged; every reader of a moved column: `grep -rn "refund_failed_at\|refund_attempted_at\|failed_refund_id\|refunded_minor\|refund_id\|booking_ref" platform/src` → re-pointed.
- [ ] **Step 6: Commit** — `git commit -m "Record and refund each booking's share of a shared PaymentIntent (#1207)"`
- [ ] **Step 7: Update Execution status.**

## Phase 2 — Webhook: per-booking fan-out, refund attribution

**Files:** Modify `StripeWebhookController`; Create `StripeRefundTag`; Test `StripeWebhookIT`

- [ ] **Step 1: Write the failing tests** — AC-4 and AC-5's five cases.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*StripeWebhookIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `onSucceeded`/`onCanceled` publish for every booking `findBookingRefsByIntent` answers; `markOwedAgain` resolves the booking through `StripeRefundTag.bookingOf(refund)` (the `bookingRef` metadata), falling back to the intent's sole booking, and moves nothing when it cannot attribute.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — every reader of `findBookingRefByIntent`: `grep -rn "findBookingRefsByIntent" platform/src`.
- [ ] **Step 6: Commit** — `git commit -m "Reconcile a shared PaymentIntent's webhooks per booking (#1207)"`
- [ ] **Step 7: Update Execution status.**

## Phase 3 — Stripe adapter: refund tag, shared-intent adoption; contract extension

**Files:** Modify `StripePaymentGateway`; Test `StripePaymentGatewayTest`, `PaymentGatewayRefundContract`, `StripeRefundContractTest`, `StripeRefunds`

- [ ] **Step 1: Write the failing tests** — AC-6's contract case (the fake mints refunds that keep the create's metadata); AC-7's three cases.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*StripePaymentGatewayTest*" --tests "*StripeRefundContractTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `RefundCreateParams.putMetadata(StripeRefundTag.KEY, id)`; candidates: on a single-booking intent every live refund (today's rule); on a shared intent the live refunds tagged with this booking, and any untagged live refund is `refund_mismatch`.
- [ ] **Step 4: Run it, verify it passes** — the payment package → PASS; the coverage architecture test still green.
- [ ] **Step 5: Generalization-audit pass** — every reader of `Refund#getMetadata`: `grep -rn "getMetadata" platform/src/main/java/ai/riviera/platform/payment` → all through `StripeRefundTag`.
- [ ] **Step 6: Commit** — `git commit -m "Tag a Stripe refund with its booking and adopt only its own on a shared intent (#1207)"`
- [ ] **Step 7: Update Execution status.**

## Phase 4 — Payout pin, docs, plan retirement, close-out

**Files:** Test `PayoutReversalIT`; Modify `RESPONSIBILITIES.md`, `CLAUDE.md`, `docs/architecture/domain-model.md`, `docs/architecture/multi-day-stays.md`, the two runbooks; Delete `docs/plans/venue-max-stay.md`

- [ ] **Step 1: Write the failing test** — AC-8 (fails only if the mechanism regresses; written as a pin).
- [ ] **Step 2: Run it** — `./gradlew test --tests "*PayoutReversalIT*"` → PASS (a pin, not a red).
- [ ] **Step 3: Docs** — every substrate line naming the moved columns re-pointed; the structural net run.
- [ ] **Step 4: Commit** — `git commit -m "Pin one reversal per refunded booking and re-point the payment docs (#1207)"`
- [ ] **Step 5: Update Execution status; retire the previous plan in the last code-touching commit.**

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-25 | V64 drops `payment.booking_ref` and the refund columns | every hand-written statement naming them, in tests and docs | `grep -rn -E 'refund_failed_at\|refund_attempted_at\|failed_refund_id\|refunded_minor\|refund_id\|booking_ref' platform/src docs` | 5 fixture classes, 2 runbooks, the domain model, RESPONSIBILITIES.md | all re-pointed; one site (`RequestAcceptPayIT`'s second `UPDATE … WHERE booking_ref`) surfaced only when the IT ran — the grep matched it but the first read missed it |
| 2026-09-25 | `Payments` port shape change | every implementation or double | `grep -rln "implements Payments\|new Payments()\|extends ThrowingPayments" platform/src` | `JdbcPayments`, `WebSliceStubs`, `PaymentServiceTest`, `ThrowingPayments` | all updated |
| 2026-09-25 | Two test classes sharing one container collided on booking ref 9901 | every `BookingRef(99xx)` literal in the suite | `grep -rn 'BookingRef(99[0-9][0-9]L)' platform/src/test` | `RefundAttemptVisibilityIT` (9901) | the shared-intent cases moved to 9951–9958 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-9:** Run the pinning classes named above → PASS. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
