# Nothing left outside the remodel Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A `CONFIRMED` booking or stay stretch with no unrefunded day is treated as *nothing left*
everywhere, not only by the remodel: the guest cancel refuses it (ADR-0026 §7), the move reminder is
sent only for a move day the guest holds, and the page reads "Refunded" instead of "No-show · Paid" or a
check-in promise.

**Architecture:** One rule, `EVERY_DAY_REFUNDED_SQL` in `JdbcBookings` ("has service days and none
unrefunded"), surfaced under one name, `everyDayRefunded`, on every read that decides on it: `LiveClaim`
and `LockedRemainder` (the remodel, as today) and now `BookingRecord` (the cancel, `LiveRemainder` and
the view). Never a `remainingMinor() == 0` shortcut. The move reminder keys on a different, per-day fact
("the guest holds the move day": that `booking_day` is neither refunded nor released), written once as
`JdbcBookings.HOLDS_DAY_SQL` and used by the sweep's read, the stamp and the mail's facts read.

**Source of intent:** issue #1381 (owner decisions 2026-10-02 in its comments); ADR-0026 §7, §8; ADR-0027 §6.

**Branch:** `bugfix/nothing-left-outside-remodel`

## Intake gate outcome

- ACs on the issue hold against `main` @ `0358630`. #1373 (PR #1396) merged first: `LiveRemainder`'s shape
  is unchanged and `Split#live()` has a second reader (`JdbcBookingNotificationFacts#narrowedToLiveRemainder`).
- Nothing in flight touches the booking cancel, the move reminder or the booking view (open PRs are
  dependabot bumps; siblings #1391/#1394 are architecture-test slices).
- No Flyway migration: the facts needed (`booking_day.refunded_at`, `released_at`) exist (V68, V71).
- Ownership: the "nothing left" decision and the cancel refusal are `booking`'s (ADR-0026 §7 is `booking`'s
  rule); the mail copy is `notification`'s, which renders a fact `booking` supplies; the review module is
  unchanged (RESPONSIBILITIES §review: eligibility is a pull on `CompletedStays`, and a `NO_SHOW` stay stays
  not completed).
- The #1373 residuals, decided here:
  1. `LiveRemainder` Javadoc and RESPONSIBILITIES' live-remainder bullet → updated (phase 4) to name the
     second set-aside kind and all three readers (view, move mail, stay cancellation mail).
  2. `StayConfirmationFacts` Javadoc → left: nothing in this slice makes `everConfirmed`, the birth window or
     the late share matter for the narrowed instance.
  3. The vanished-stay throw → left (a stay row is never deleted between the two reads).
  4. The dismissed remodel-release case stays unreachable: a nothing-left stretch is **set aside, not
     ended** (it stays `CONFIRMED`), so a stretch is still never `CANCELLED` alone outside a remodel receipt.
  - The "nothing live → whole stay" fallback in `narrowedToLiveRemainder` stays: the only publisher of a
    `StayCancelled` with nothing live is the remodel's whole-stay release (#1292), whose stretches are
    `AWAITING_PAYMENT` and so can have no refunded day. A guest cancel with nothing live is refused, so it
    publishes nothing. Pinned by the existing `StayConfirmationFactsIT` test plus a new case where a
    nothing-left stretch leaves the cancellation facts.

## Acceptance criteria

- [ ] **AC-1 (A, lone):** Given a `CONFIRMED` three-day booking whose every day is weather-refunded, when the guest
  cancels, then the outcome is `CancelOutcome.NothingLeft`, the row stays `CONFIRMED`, every `(set, date)` stays
  held, no `BookingCancelled` is published, and the view says `cancellable = false`, `nothingLeft = true`. The
  endpoint answers `409` with code `NOTHING_LEFT`. *Seam:* `CancelBooking`, `ViewBooking`, `POST /api/bookings/{code}/cancel` ·
  *Pinned by:* `CancelBookingIT.aBookingWithEveryDayRefundedHasNothingLeftToCancel`,
  `BookingControllerIT.nothingLeftRejectionCarriesItsOwnCode`
- [ ] **AC-2 (A, the rule):** Given a three-day booking of 2 minor units (day shares 2, 0, 0) with days 1 and 2
  refunded (remainder 0) and day 3 unrefunded, then `BookingRecord#everyDayRefunded` is false and the cancel
  proceeds as a cancel (not `NothingLeft`). *Seam:* `Bookings#findByCode`, `CancelBooking` ·
  *Pinned by:* `CancelBookingIT.aZeroShareDayStillHeldIsNotNothingLeft`
- [ ] **AC-3 (A, partial stay):** Given a two-stretch stay whose first stretch has every day refunded, when the
  guest cancels, then only stretch 2 transitions and is released, stretch 1 stays `CONFIRMED` with its days
  held, `StayCancelled` carries stretch 2's refund, and the window is judged on stretch 2's first day. *Seam:*
  `CancelBooking`, `LiveRemainder` · *Pinned by:* `CancelStayIT.aStretchWithNothingLeftIsSetAsideAndTheRestCancels`,
  `CancelBookingServiceTest.aStayStretchWithEveryDayRefundedIsSetAside`
- [ ] **AC-4 (A, whole stay):** Given every stretch has nothing left, when the guest cancels, then
  `CancelOutcome.NothingLeft`, nothing transitions, and the stay view says `cancellable = false`,
  `nothingLeft = true`. *Seam:* `CancelBooking`, `ViewBooking` ·
  *Pinned by:* `CancelStayIT.aStayWithNothingLeftOnEveryStretchRefuses`, `CancelBookingServiceTest.aStayWithNothingLeftOnEveryStretchIsRefused`
- [ ] **AC-5 (A, unit fences):** Given a `CONFIRMED` lone booking with `everyDayRefunded`, then the service answers
  `NothingLeft` without quoting, transitioning, releasing or publishing. *Seam:* `CancelBooking` ·
  *Pinned by:* `CancelBookingServiceTest.aConfirmedBookingWithEveryDayRefundedHasNothingLeft`
- [ ] **AC-6 (B, sweep):** Given a stitched stay whose arriving stretch's move day is refunded, when the evening-before
  sweep runs, then no `StayMoveDue` is published and nothing is stamped; a stay whose departing stretch's last day
  alone is refunded is still announced. *Seam:* `RemindStayMoves`, `Bookings#findStayMovesDue/#stampMoveReminder` ·
  *Pinned by:* `StayMoveReminderIT.aMoveToADayTheGuestNoLongerHoldsIsNotAnnounced`
- [ ] **AC-7 (B, facts + mail):** Given the departing stretch's last day is refunded, the move facts carry
  `fromDayHeld = false` and the mail omits "instead of today's A1"; given the move day is refunded after the stamp,
  the facts read answers empty. *Seam:* `BookingNotificationFacts#moveReminderFacts`, `Mailer#sendMoveReminder` ·
  *Pinned by:* `StayMoveFactsIT.aRefundedDepartureDayDropsTodaysSpotAndARefundedMoveDayResolvesNothing`,
  `SmtpMailerIT.theMoveReminderDropsTodaysSpotWhenTheGuestDoesNotHoldIt`
- [ ] **AC-8 (B, regression):** the existing move-reminder ITs stay green (`StayMoveReminderIT`, `StayMoveFactsIT`,
  `MoveReminderMailIT`, `StayMoveReminderMailListenerTest`).
- [ ] **AC-9 (C, frontend):** a `NO_SHOW` detail with `nothingLeft` renders the "Refunded" chip; a `CONFIRMED` one
  renders "Refunded", no Cancel section and the "nothing to review" note instead of the check-in promise; an
  ordinary `NO_SHOW` still renders "No-show · Paid". A `409 NOTHING_LEFT` on cancel explains and re-reads.
  *Seam:* `booking-view`, `review-panel`, `shared/booking-status` · *Pinned by:* `booking-status.spec.ts`,
  `review-panel.spec.ts`, `booking-view.spec.ts`, `find-a-booking.e2e.ts`
- [ ] **AC-10 (remodel regression):** the #1300 nothing-left tests stay green (`RemodelClaimsServiceTest`,
  `RemodelCommitIT`, `CancelVsDayRefundRaceIT`, `CancelStayIT.aStayWithANothingLeftStretchStillCancelsItsLiveStretch`).
- [ ] **AC-11 (docs):** CONTEXT.md's No-show entry carries the exception; ADR-0026 §7 gets a dated amendment line
  naming cancel, view and reminder as where §7 is enforced.
- [ ] **AC-12:** the structural net and the frontend gates are green.

## Non-goals

- A new booking status or a change to the stored outcome (`NO_SHOW` stays) or to review eligibility.
- The stay cancellation mail's span (#1373, merged).
- Re-aiming the reminder to the first held day (declined by the owner).
- Copy for an ordinary late cancel; "My bookings" list wording (`findByAccountId` carries the flag but the
  list is untouched).

## Risks

- **R-1 (#2, release):** the refusal must release nothing. Mitigation: `NothingLeft` is answered before any
  write; AC-1/AC-3 count `set_availability` rows after the cancel.
- **R-2 (#10, stale read):** the cancel reads `everyDayRefunded` after `lockByCode`/`lockStretches` in a
  statement of its own, as the remainder is (#1281), so a day refunded under the lock is counted.
- **R-3 (drift):** two definitions of "nothing left". Mitigation: one SQL constant; `LiveClaim`,
  `LockedRemainder` and `BookingRecord` all read `COL_EVERY_DAY_REFUNDED` off it; AC-2 pins the €0 case.
- **R-4 (reminder):** the predicate must not change which stays are announced otherwise. Mitigation: AC-8.
- **R-5 (FE/BE skew):** an older payload lacks `nothingLeft`; the FE treats absence as `false`.

## Open questions

### Resolved

- Should a stay with nothing live and a mix of remodel-ended and nothing-left stretches refuse as `NothingLeft`
  or `NotCancellable`? → `NothingLeft` when any set-aside stretch is still `CONFIRMED` (the guest still holds
  something, fully refunded); `NotCancellable(CANCELLED)` when every stretch was ended by a remodel (today's answer).
- Should the "Refunded" chip get its own fill? → No: it wears `chip--cancelled`'s proven AA fill (money came
  back, same family), so no new token or contrast row.

## Availability & concurrency

- **Write paths to `set_availability`:** none added. The cancel's release leg is skipped entirely for a
  nothing-left booking or stretch; the move reminder writes no availability row.
- **Concurrency strategy:** the cancel's existing row lock (`lockByCode` / `lockStretches`), then the read.
- **Pinning test:** `CancelBookingIT.aBookingWithEveryDayRefundedHasNothingLeftToCancel` (held rows unchanged).

## Modulith

- No new port, event or module. `CancelOutcome` (booking-internal) gains `NothingLeft`; `BookingRecord`
  (booking-internal) gains `everyDayRefunded`; `BookingDetail`/`BookingDetailView` gain `nothingLeft`.
- `booking.vocabulary.StayMoveFacts` (published, read by `notification`) gains `fromDayHeld`; `notification`'s
  `MoveReminderMail` mirrors it. Owner check: `booking` supplies the fact, `notification` renders it
  (RESPONSIBILITIES §notification: mails decide nothing).

## FE↔BE contract

- `GET /api/bookings/{code}`: `nothingLeft: boolean` on the detail and on each `stretches[]` entry.
- `POST /api/bookings/{code}/cancel`: new `409` problem code `NOTHING_LEFT`.

## Phases

- **Phase 0 — the rule on `BookingRecord`:** `everyDayRefunded` loaded by `findByCode`, `stretchesOf`,
  `findByAccountId` off `EVERY_DAY_REFUNDED_SQL` · red test `CancelBookingIT.aZeroShareDayStillHeldIsNotNothingLeft`
- **Phase 1 — the cancel refuses, the view says so:** `CancelOutcome.NothingLeft`, lone check, `LiveRemainder`
  set-aside, controller `409 NOTHING_LEFT`, `cancellable`/`nothingLeft` on the view · red tests
  `CancelBookingServiceTest.*`, `CancelBookingIT.*`, `CancelStayIT.*`, `ViewBookingServiceTest.*`,
  `BookingControllerIT.*`, `StayConfirmationFactsIT.*`
- **Phase 2 — the move reminder:** `HOLDS_DAY_SQL` in sweep read, stamp and facts; `fromDayHeld` through to the
  mail · red tests `StayMoveReminderIT.*`, `StayMoveFactsIT.*`, `SmtpMailerIT.*`
- **Phase 3 — frontend:** model, chip, review panel, cancel refusal copy, e2e · red tests
  `booking-status.spec.ts`, `review-panel.spec.ts`, `booking-view.spec.ts`
- **Phase 4 — docs:** CONTEXT.md, ADR-0026 §7, RESPONSIBILITIES §booking/§notification, `LiveRemainder` Javadoc.

## Execution status

**Stage pointer:** `PR — review gate due`

**Next action:** mark ready for review, run `/code-review` (high) + `riviera-review-overlay`, check Sonar.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the rule on `BookingRecord` | ✅ | phase 0/1 commit |
| 1 — the cancel refuses, the view says so | ✅ | phase 0/1 commit |
| 2 — the move reminder | ✅ | phase 2 commit |
| 3 — frontend | ✅ | phase 3 commit |
| 4 — docs | ✅ | phase 4 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
