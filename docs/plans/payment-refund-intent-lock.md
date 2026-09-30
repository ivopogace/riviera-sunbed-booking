# Payment refund writes serialize on the intent Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every refund write of one PaymentIntent reads its sibling shares and its failure arms after
the intent's row lock, so parallel refunds of a stay end at the right status and a `refund.failed`
racing its own record is never consumed unapplied.

**Architecture:** `JdbcPayments` takes the `payment` row lock (not only the share's) in a statement of
its own before every `APPLY_REFUND` write. The webhook's two failure arms (recorded id, then
unrecorded attempt) become one booking-scoped port call that takes that lock before either arm, so
both run on a snapshot taken after an in-flight `markRefunded` commits.

**Source of intent:** #1298 (sibling sweep of #1281; residual of #594).

**Branch:** `bugfix/payment-refund-intent-lock`

## Acceptance criteria

- [x] **AC-1:** Given one intent collecting shares A and B, when `markRefunded(A)` and `markRefunded(B)`
  run concurrently in full, then the intent is `REFUNDED`. *Seam:* `Payments.markRefunded` ·
  *Pinned by:* `JdbcPaymentsIT.twoSharesRefundedInParallelEndRefunded` (red on `main`).
- [x] **AC-2:** Given A refunded and B's refund recorded, when `markRefunded(A)` races
  `markRefundFailed(B's id)`, then the intent is `PARTIALLY_REFUNDED` (A's money is out), so A's own
  later `refund.failed` still un-records. *Seam:* `Payments.markRefunded` / `markRefundFailed` ·
  *Pinned by:* `JdbcPaymentsIT.aSiblingsRefundFailureRacingARecordKeepsTheRecordVisible` (red on `main`).
- [ ] **AC-3:** Given our attempt on record, when a `refund.failed` for the refund arrives while
  `markRefunded` holds it uncommitted, then once it commits the refund is un-recorded and the booking
  listed as owed. *Seam:* `Payments.markRefundFailed(refundId, booking, scope)` · *Pinned by:*
  `JdbcPaymentsIT.aFailureRacingItsOwnRecordUnrecordsItOnceCommitted` (mutation-checked by removing
  the lock).
- [ ] **AC-4:** The webhook routes a tagged refund's death through the booking-scoped call and an
  unattributable one through the refund id alone; `JdbcPaymentsIT`, `StripeWebhookIT` and the
  structural net stay green.

## Non-goals

- Second-guessing the amounts `booking` sends (#1281: `payment` acts on the events it receives).
- Any schema, port-in-`api/` or event change.

## Risks

- **R-1: deadlock from a new lock order.** → Every refund write takes the `payment` row first, then
  its refund row, then the share; `markStatus` and `markRefundAttempted` take no `payment` lock and
  hold none while waiting on one. `RefundService` runs outside any caller transaction, so no `booking`
  row is held around it.
- **R-2: webhook duplicate / out-of-order (#8).** → The guards stay the same single statements; the
  lock only moves their snapshot after an in-flight write, never widens what they match.

## Payment & payout

No new Stripe call, key or ledger effect. The fix touches how the collection record derives the
intent's status and the owed flag; payout reads neither.

## Phases

- **Phase 0 — intent lock on the refund writes:** AC-1, AC-2 · red tests above.
- **Phase 1 — failure arms under the lock:** AC-3, AC-4 · red test above; port reshaped
  (`markUnrecordedRefundFailed` folds into the booking-scoped `markRefundFailed`).
- **Phase 2 — docs:** `RESPONSIBILITIES.md` §payment names the intent lock.

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** red IT for AC-3, then the booking-scoped `markRefundFailed`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — intent lock | ✅ | (this commit) |
| 1 — failure arms | ⏳ | |
| 2 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
