# An untagged refund is never adopted for a day Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a day refund never adopts a live refund that names no booking, so a failure of that refund can never be
matched to the wrong scope and dropped.

**Architecture:** `StripePaymentGateway.candidatesFor` treats an untagged live refund on a day scope as it treats one on
a shared intent: `refund_mismatch`, for a human to attribute. The whole-share adoption of a single-booking intent's
manual refund stays, because the webhook's failure-before-record arm matches an untagged refund to the whole share.

**Source of intent:** #1310 (sweep for #1298), fix direction 1.

**Branch:** `bugfix/untagged-refund-day-scope`

## Acceptance criteria

- [x] **AC-1:** Given a single-booking intent carrying a live untagged refund for exactly one day's amount, when that
  day is refunded, then nothing is created or recorded and the answer is `refund_mismatch`. *Seam:*
  `PaymentGateway.refund(booking, RefundScope.day(d), amount)` · *Pinned by:*
  `StripePaymentGatewayTest.refusesAnUntaggedLiveRefundForADayOfASingleBookingIntent` (red on `main`: adopted).
- [x] **AC-2:** the gateway, contract and webhook suites stay green; the whole-share adoption of an untagged refund is
  unchanged (`adoptsAnExistingStripeRefundInsteadOfCreatingASecond`).

## Risks

- **R-1 (#10, a guest left unpaid):** a refused day refund keeps its `BookingDayRefunded` publication outstanding and
  lights `riviera.refunds.failed`; a human settles it at the gateway, as a shared intent's untagged refund already does.
- **R-2 (#8):** the webhook is unchanged.

## Payment & payout

- **Ledger effect:** none; `payout` reverses on `BookingDayRefunded`, which is unchanged. **Idempotency:** unchanged
  (`booking-<id>-day-<date>-refund`).

## Phases

- **Phase 0 — red:** AC-1.
- **Phase 1 — refuse:** `candidatesFor`, and `RESPONSIBILITIES.md` §payment.

## Execution status

**Stage pointer:** review

**Next action:** PR, review gate, plan removal, CI and Sonar, merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red | ✅ | a4540893 |
| 1 — refuse | ✅ | e375b1c9 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
