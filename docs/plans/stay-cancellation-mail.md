# One cancellation mail per stitched stay — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a guest who cancels a stitched stay receives exactly one cancellation mail (the stay's
code, span, reason and summed refund), while every stretch still publishes its own
`BookingCancelled`, reverses once and refunds once.

**Architecture:** `CancelBookingService.cancelStay` stamps each stretch's `BookingCancelled` with a
nullable `cancelledWithStay` (the stay id) and publishes one id-based `StayCancelled` after the loop.
The per-booking mail listener skips a stamped event; a new `StayCancellationMailListener` mails the
stay once, rendered as an ordinary `BookingCancellationMail` under the stay's code and span. Every
other `BookingCancelled` publisher leaves the stamp null, so a stretch ended on its own mails as today.

**Source of intent:** issue #1259 (epic #1096; `docs/architecture/multi-day-stays.md` D6;
ADR-0024 decision 4). Pattern: #1255 / PR #1258.

**Branch:** `claude/sdlc-1259-t4fda1` (cloud session; stands in for `feature/stay-cancellation-mail`)

## Acceptance criteria

- [ ] **AC-1:** Given a confirmed stitched stay of two stretches, when the guest cancels it by the
  stay's code, then exactly one `BOOKING_CANCELLATION` reaches the guest, carrying the stay's code,
  the stay's first and last day, `POLICY` and the summed refund, and no second cancellation mail
  follows. *Seam:* `CancelBooking.cancel` → registry → `MockMailer` · *Pinned by:*
  `StayCancellationMailIT.mailsTheStayOnceWhenTheGuestCancelsIt`
- [ ] **AC-2:** Given the same cancel, then each stretch's `BookingCancelled` carries the stay id in
  `cancelledWithStay`, and one `StayCancelled` carries the stay id, the summed refund, currency and
  reason. *Seam:* `CancelBooking.cancel` + `ApplicationEvents` · *Pinned by:*
  `CancelStayIT.cancelsEveryStretchReleasesEveryDayAndReversesEachAccrualOnce` (extended; its
  reversal and release assertions stay unchanged)
- [ ] **AC-3:** Given a stretch of a stay ended alone by a remodel (a `BookingCancelled` with
  `VENUE_CHANGE` and no stamp), when it is delivered, then that stretch is mailed once under the
  stay's code, with its rebook link. *Seam:* registry → `MockMailer` · *Pinned by:*
  `StayCancellationMailIT.aStretchEndedAloneByARemodelStillMailsWithItsRebookLink`
- [ ] **AC-4:** A lone booking's cancellation mail is unchanged: `BookingCancellationMailIT` and
  `BookingCancellationMailListenerTest` stay green untouched, and a payload without the new field
  deserializes to an unstamped event. *Pinned by:* the existing suites +
  `BookingCancellationMailListenerTest` (a stamped event sends nothing).
- [ ] **AC-5:** Stay reason: `VENUE_CHANGE` only when every stretch was quoted `VENUE_CHANGE` (all
  moved, free exit open), else `POLICY`. A zero total renders the words, never `EUR 0.00`.
  *Seam:* `CancelBooking.cancel` · *Pinned by:* `CancelBookingServiceTest` (stay cases)
- [ ] **AC-6:** The mail never carries a stretch's row code; the abandon line names ids only (#7).
  *Pinned by:* AC-1's code assertion + `StayCancellationMailListenerTest.abandonLogsNoCode`.

## Non-goals

- Weather refund for one day of a stay (#1210): stays are not selected by the weather refund today.
- A cancellation delivery log / admin resend: cancellation mails have none.
- Listing each stop in the cancellation mail: the span line names every day.

## Risks

- **R-1 (#9, #10):** the stamp or the new event changes payout or refund behaviour → payout and
  refund listeners ignore the new field; `StayCancelled` has no listener outside `notification`;
  `CancelStayIT` keeps its once-per-stretch reversal assertion.
- **R-2 (deploy):** a `BookingCancelled` serialized before the field exists → Jackson leaves it null,
  so it mails per stretch as today; nothing is lost, at worst one extra mail during the deploy.
- **R-3 (#7):** the stay code must never ride a payload or a log → `StayCancelled` carries ids and
  money only; the code is read at send time via `BookingNotificationFacts.stayConfirmationFacts`.
- **R-4 (at-least-once):** a transport failure re-drives only the stay mail's publication; the
  per-stretch publications complete as no-ops, so no retry multiplies mails.

## Open questions

### Resolved

- *Which reason does one mail carry when stretches quoted different reasons (one moved stretch in its
  free exit, `VENUE_CHANGE`; the rest `POLICY`)?* → `POLICY` ("Your cancellation is confirmed.") with
  the summed refund; `VENUE_CHANGE` only when every stretch was, where "refunded in full" is true.
  Decided at intake; the per-stretch events keep their own reasons for payout's fee rule.
- *Issue lists "a free-exit cancel after a move" and "a weather refund for one day" as per-stretch
  paths.* → Neither ends a stretch alone today: a stretch's row code resolves nothing
  (`CancelStayIT.aStretchsRowCodeIsNoCredential`), so a moved stretch's free exit is part of the
  whole-stay cancel; the weather refund leaves stays to a manual refund. Only the remodel legs
  (`RemodelClaimsService`) end a stretch alone; the stamp is set by `cancelStay` alone, so any
  future single-stretch path mails per stretch by default.
- *Intake:* no open PR touches `booking`/`notification`; no Flyway migration; the event is new, so
  no `event_type` rewrite.

## Modulith

- **`booking.events.StayCancelled`** (new record): owner `booking`; consumer `notification`
  (`StayCancellationMailListener`, already granted `booking::events` + `::vocabulary`).
- **`BookingCancelled.cancelledWithStay`** (new trailing nullable `StayId`): read by
  `notification` only; `payout` and `booking`'s own listeners ignore it.
- No new port: the mail reuses `BookingNotificationFacts.stayConfirmationFacts` (code, span,
  customer, sets) and `BookingMailFactsService`. Mail rendering stays `notification`'s
  (`RESPONSIBILITIES.md` §notification); the refund total is `booking`'s decision (#10).
- `MailListenerExecutorArchitectureTest` gains the new listener.

## Payment & payout

No money moves differently: per-stretch refunds (`booking-<id>-refund` keys) and reversals are
untouched. The mail reports the summed server-side quote (#10), integer minor units + currency (#5).

## Phases

- **Phase 0 — `booking` publishes the stamp and `StayCancelled`:** red `CancelStayIT` (AC-2) and
  `CancelBookingServiceTest` (AC-5).
- **Phase 1 — `notification` mails the stay once:** red `StayCancellationMailListenerTest`,
  `BookingCancellationMailListenerTest` (stamped → nothing), `StayCancellationMailIT` (AC-1, AC-3).
- **Phase 2 — docs:** `RESPONSIBILITIES.md` §booking/§notification, `CLAUDE.md` event inventory,
  ADR-0024 decision 4 + consequences, `multi-day-stays.md` status, `CONTEXT.md` stitched stay.

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** red `StayCancellationMailListenerTest` + stamped-skip in `BookingCancellationMailListenerTest`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — booking publishes | ✅ | phase-0 commit |
| 1 — notification mails | ⏳ | |
| 2 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
