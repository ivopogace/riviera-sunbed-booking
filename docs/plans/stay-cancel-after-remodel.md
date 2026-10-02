# Guest cancel of a stay after a remodel ended a stretch — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A guest can cancel a stitched stay whose stretch a remodel already ended: the cancel sets
those stretches aside, cancels the live remainder and quotes its refund on the first live day.

**Architecture:** The rule "which stretches does a guest cancel set aside, and which day is the
remainder judged on" gets one named holder in `booking/application/cancel` (`LiveRemainder`), read
by both the cancel and the code-gated view so the view's quote and the cancel cannot drift
(invariant #10). The predicate rests on the commit receipt's outcome lines
(`RemodelReceipts#endedByRemodel`), generically: any stretch a remodel commit ended is set aside,
however many there are and whatever the line's kind, so sibling #1292 (several `RELEASE` lines) and
the next wave's #1300 (a new ended kind) ride the same rule. A stretch cancelled by anything else
(the weather refund, a concurrent writer) still refuses the whole stay: no receipt line, no skip.

**Source of intent:** issue #1290 and the owner's decision comment of 2026-10-02.

**Branch:** `bugfix/stay-cancel-after-remodel-refund`

## Acceptance criteria

- [ ] **AC-1:** Given a two-stretch `CONFIRMED` stay whose second stretch a remodel commit refunded
  (`VENUE_CHANGE`, a `REFUND` receipt line), when the guest cancels by the stay's code inside the free
  window, then the first stretch is `CANCELLED` with its own refund, every day it held is released
  (#2), one `BookingCancelled` stamped with the stay is published for it and none for the ended
  stretch, one `StayCancelled` carries the remainder's refund, and payout reverses the live stretch's
  accrual exactly once (#9). *Seam:* `CancelBooking#cancel` · *Pinned by:*
  `CancelStayIT.aGuestCancelSkipsTheStretchARemodelEndedAndCancelsTheRest`
- [ ] **AC-2:** Given a stay starting tomorrow (its first day `LATE`) whose first stretch a remodel
  ended and whose second stretch starts three days out, when the guest cancels, then the remainder is
  quoted on the first live day: `FULL`, the whole second stretch, not the late share. *Seam:*
  `CancelBooking#cancel` · *Pinned by:* `CancelStayIT.theRemainderIsQuotedOnTheFirstLiveDay`
- [ ] **AC-3:** Given the same stay, when the code-gated view is read, then it is `cancellable` and
  `refundIfCancelledNow` is the remainder's refund quoted the same way. *Seam:* `ViewBooking#byCode`
  · *Pinned by:* `CancelStayIT.theRemainderIsQuotedOnTheFirstLiveDay` (view read before the cancel)
  and `ViewBookingServiceTest.aStayWithARemodelEndedStretchIsCancellableForItsRemainder`
- [ ] **AC-4:** Given a stay whose stretch went `CANCELLED` by any path that writes no receipt line (a
  concurrent weather refund), when the guest cancels, then nothing is written and the stay refuses as
  `NotCancellable(CANCELLED)`. *Seam:* `CancelBooking#cancel` · *Pinned by:*
  `CancelStayIT.aStretchChangedUnderAConcurrentWriterCancelsNothing` (unchanged) and
  `CancelBookingServiceTest.aStretchCancelledWithoutAReceiptLineStillRefusesTheStay`
- [ ] **AC-5:** Given a stay every stretch of which a remodel ended, when the guest cancels, then it
  refuses as `NotCancellable(CANCELLED)` and writes nothing. *Seam:* `CancelBooking#cancel` ·
  *Pinned by:* `CancelBookingServiceTest.aStayEveryStretchOfWhichARemodelEndedIsNotCancellable`
- [ ] **AC-6:** The exception is recorded as a dated amendment to ADR-0024 Decision 4 and to
  `docs/architecture/multi-day-stays.md` D6; `RESPONSIBILITIES.md` § booking, `CONTEXT.md` and
  ADR-0005's amendment log follow. *Pinned by:* review.

## Non-goals

- Cancelling one stretch of a stay on its own (the stay's code is the one credential, ADR-0024 §2).
- The "nothing left" ending of a fully day-refunded stretch (#1300, next wave) — it only has to be
  skippable by this rule, which it is by construction (a receipt outcome line).
- A remodel ending the other unpaid stretches of an `AWAITING_PAYMENT` stay (#1292, sibling).

## Risks

- **R-1 (#10):** the view quotes one way and the cancel another → both read `LiveRemainder` for the
  stretches and the window day; `CancelStayIT.theRemainderIsQuotedOnTheFirstLiveDay` reads the view
  then cancels and asserts the same figure.
- **R-2 (#9):** a remodel-ended stretch reversed twice → it is never transitioned or announced
  again: the guest cancel publishes `BookingCancelled` only for the stretches it transitions;
  `CancelStayIT` counts reversals (two in total: the remodel's and the guest's).
- **R-3 (#2):** a day of the ended stretch released twice or a day of the live one left held → the
  ended stretch is not touched; the live stretch releases `ServiceDays.held` as today.
- **R-4:** a stretch cancelled by a non-remodel path skipped by mistake, turning "never half a
  stay" into half a stay → the predicate is the receipt outcome line, nothing else;
  `aStretchChangedUnderAConcurrentWriterCancelsNothing` stays green.
- **R-5:** merge conflicts with #1292 (same service, same docs) → resolve by merging `origin/main`.

## Open questions

### Resolved

- Skip or refuse? → skip the remodel-ended stretches, cancel the live rest (owner, issue comment).
- Window day of the remainder? → the first live day (owner, issue comment).
- How does the cancel tell a remodel ending from a free exit? → the receipt's outcome lines
  (`RemodelReceipts#endedByRemodel`), both being `VENUE_CHANGE`.

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** the guest cancel's release of every
  held day of each live stretch (unchanged); nothing for a set-aside stretch (the remodel already
  released its days in its own commit).
- **Concurrency strategy:** unchanged — the stay's stretches are row-locked (`lockStretches`,
  `FOR UPDATE`) before any read; the receipt line is written in the remodel commit's transaction, so
  once the lock is held the line is visible iff the stretch's `CANCELLED` is the remodel's.
- **Pinning test:** `CancelStayIT.aStretchChangedUnderAConcurrentWriterCancelsNothing`.

## Payment & payout

- No new money path. Each live stretch refunds as today (`BookingCancelled` → `BookingRefundListener`
  → `payment.api.RefundPort`, idempotent on the booking id); the ended stretch's refund was the
  remodel's. Ledger: one `REVERSAL` per stretch, each published once (#9).

## Phases

- **Phase 0 — the rule holder:** `LiveRemainder` splits a stay's stretches into the live ones and
  the ones a remodel ended, and names the first live day · red test
  `CancelBookingServiceTest.aStayCancelSkipsTheStretchARemodelEndedAndQuotesTheRestOnItsFirstLiveDay`
- **Phase 1 — the cancel:** `CancelBookingService#cancelStay` cancels the remainder · red tests
  `CancelBookingServiceTest.aStretchCancelledWithoutAReceiptLineStillRefusesTheStay`,
  `aStayEveryStretchOfWhichARemodelEndedIsNotCancellable`, then the ITs of AC-1 and AC-2
- **Phase 2 — the view:** `ViewBookingService#toStayDetail` reads the same rule · red test
  `ViewBookingServiceTest.aStayWithARemodelEndedStretchIsCancellableForItsRemainder`
- **Phase 3 — docs:** ADR-0024 §4 amendment, D6 amendment, `RESPONSIBILITIES.md`, `CONTEXT.md`,
  ADR-0005 log

## Execution status

**Stage pointer:** `CI gate — draft PR, first push`

**Next action:** open the draft PR, check CI, then merge `origin/main` and mark ready for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the rule holder | ✅ | (first commit) |
| 1 — the cancel | ✅ | (first commit) |
| 2 — the view | ✅ | (first commit) |
| 3 — docs | ✅ | (first commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
