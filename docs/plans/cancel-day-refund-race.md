# Cancel vs in-flight day refund Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** No interleaving of a day refund with a guest cancel, a stay cancel or a remodel refund
refunds more than was collected: each whole-booking cancel quotes from a read taken after the
booking row lock.

**Architecture:** A day refund writes only `booking_day` under a `FOR UPDATE` on the booking row, so a
cancel `UPDATE` that waits on that lock proceeds without re-checking its `booking_day` guard (the row
itself did not change, and the subquery runs on the statement's start snapshot). Fix: every
whole-booking cancel takes the booking row lock in its own statement, then reads and quotes in a
second statement whose READ COMMITTED snapshot sees the committed day refund. Making `refundDay`
write the booking row would not fix it: EvalPlanQual re-checks only the target row, and the
`booking_day` subquery still runs on the old snapshot.

**Source of intent:** GitHub issue #1281

**Branch:** `bugfix/cancel-day-refund-race`

## Acceptance criteria

- [ ] **AC-1:** Given a lone 3-day booking (9000 collected, FREE window) whose day-2 refund (3000)
  holds the booking lock, when the guest cancels and the refund then commits, then the cancel
  answers `Cancelled(6000)`, the booking's `refund_minor` is 6000, and refunded total ≤ 9000.
  *Seam:* `CancelBooking.cancel` · *Pinned by:* `CancelVsDayRefundRaceIT.aLoneCancelWaitingOnADayRefundRefundsTheRemainder`
- [ ] **AC-2:** Given a stay whose second stretch has a day refund holding its lock, when the guest
  cancels the stay, then it answers `Cancelled` over the remainder (no `IllegalStateException`).
  *Seam:* `CancelBooking.cancel` · *Pinned by:* `CancelVsDayRefundRaceIT.aStayCancelWaitingOnADayRefundRefundsTheRemainder`
- [ ] **AC-3:** Given a confirmed 3-day booking classified `REFUND` by a remodel, with a day refund
  holding its lock, when the remodel commits, then the booking's `refund_minor` and the published
  `BookingCancelled` refund are the amount less the refunded day.
  *Seam:* `RemodelClaims.commit` · *Pinned by:* `CancelVsDayRefundRaceIT.aRemodelRefundWaitingOnADayRefundRefundsTheRemainder`
- [ ] **AC-4:** Each race test fails on `main` (mutation-checked by reverting the lock) and passes
  after; `CancelBookingIT`, `CancelStayIT`, `SpanReleaseIT` and the structural net stay green.

## Non-goals

- `payment` / `payout` changes: they act correctly on the events they get (issue § Module boundaries).
- The venue's lone one-day leg (`cancelByVenue` in `VenueDayRefundService` / `WeatherRefundService`):
  a lone one-day booking never takes the day leg, so it has no `booking_day` refund to race.

## Risks

- **R-1 deadlock:** a new lock taken earlier could invert an order. → Booking rows are locked in
  the orders already used: one row for a lone cancel; stretches in `booking_date` order (as
  `lockStretches`); remodel's live claims in `(booking_date, id)` order, the order it already
  updated them in and the sweep's `booking_date` order. Remodel already waited on these rows at
  `cancelConfirmed`/`moveToSet` under the venue lock; locking them earlier adds no new pair.
- **R-2 payout double reversal (#9):** follows from a single event; pinned by the refunded-total
  assertions in AC-1..3.

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged (release after the guarded transition).
- **Concurrency strategy:** `SELECT … FOR UPDATE` on `booking` in a statement of its own, then a
  fresh read; the guarded `UPDATE` stays as the backstop.
- **Pinning test:** `CancelVsDayRefundRaceIT`.

## Payment & payout

No money path changes: one `BookingCancelled` with the true remainder (#10 quote server-side),
so `BookingRefundListener` refunds within the charge and payout reverses within the accrual (#9).

## Phases

- **Phase 0 — lone cancel locks before quoting:** red `CancelVsDayRefundRaceIT` AC-1, then `Bookings.lockByCode`.
- **Phase 1 — stay cancel reads after the lock:** red AC-2, then `lockStretches` lock-then-read.
- **Phase 2 — remodel commit locks its claims before classifying:** red AC-3, then `lockLiveOnSets`.

## Execution status

**Stage pointer:** implement done → CI gate / draft PR

**Next action:** confirm the scoped suites + structural net green locally, push, open the draft PR.

Phases 0–2 landed together: one mechanism (lock, then read in a fresh statement), one race IT covering
all three legs, red on `main` for each and mutation-checked by reverting the locks.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — lone cancel | ✅ | fix commit |
| 1 — stay cancel | ✅ | fix commit |
| 2 — remodel | ✅ | fix commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
