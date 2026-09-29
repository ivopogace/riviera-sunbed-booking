# Venue day refund 1/2 — operator path Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`. Decision record: ADR-0027
> (amending ADR-0026 §3 for reason `VENUE`).

**Goal:** From the staff daily view, the venue's operator refunds one guest's one day for the
venue's own reason: the day's own rate comes back, the service day is stamped `VENUE` + released +
actor, the `(set, day)` claim is freed unless the day is past, and a lone one-day booking is
cancelled whole with reason `VENUE`.

**Architecture:** The weather refund's two legs (ADR-0026) are reused with a reason and a released
stamp threaded through: `booking` owns a new per-guest use case (`RefundVenueDay`) that asserts
ownership first (#13), resolves the booking by code within the venue (as check-in does), stamps
the day under the same guarded `UPDATE` and lock order as the weather refund, releases the claim
through `availability::api`, and publishes `BookingDayRefunded` carrying `reason` + `released`.
`payment` is untouched (same per-day port, same gateway key); `payout` writes the event's reason
on the `DAY_REVERSAL`; `notification` branches the guest copy on it. The row and the check-in
refusal branch on the released **stamp**, never on the reason.

**Source of intent:** issue #1275 (parent #1272), ADR-0027, ADR-0026.

**Branch:** `claude/sdlc-1275-yk9v22` (the cloud session's designated branch stands in for
`feature/venue-day-refund-operator`).

## Acceptance criteria

- [ ] **AC-1 (stay's day):** Given a `CONFIRMED` 5-day stay at an owned venue with every day held,
  when the operator refunds day 3 by the stay's code, then exactly `DayShare` of day 3 is refunded
  (#5), `booking_day` day 3 carries `refunded_at`, `refund_minor`, `refund_reason = 'VENUE'`,
  `released_at` and the actor, the `(set, day 3)` availability row is gone and re-claimable, days
  1, 2, 4, 5 are untouched, the booking stays `CONFIRMED`, and one `BookingDayRefunded(reason =
  VENUE, released = true)` is published. *Seam:* `RefundVenueDay` port → `Bookings#refundDay` +
  `AvailabilityClaim#release` · *Pinned by:* `VenueDayRefundServiceIT.aStaysDayIsRefundedReleasedAndTheStayContinues`
- [ ] **AC-2 (idempotent, attended, weather-held):** Given AC-1 done, when replayed, then
  `DayAlreadyRefunded` and nothing more moves; given a day the guest checked into, then
  `DayAttended` and nothing stamped; given a day already refunded for weather, then
  `DayAlreadyRefunded` and the weather day keeps its claim. *Seam:* `RefundVenueDay` · *Pinned by:*
  `VenueDayRefundServiceIT.aReplayAnAttendedDayAndAWeatherDayAreRefused`
- [ ] **AC-3 (past missed day):** Given a stay whose day 2 the sweep marked missed and today is
  after it, when refunded, then the day is refunded with reason `VENUE`, `released_at` is null,
  the claim row stays, and the event says `released = false`. *Seam:* `RefundVenueDay` ·
  *Pinned by:* `VenueDayRefundServiceIT.aPastMissedDayIsRefundedButNotReleased`
- [ ] **AC-4 (lone one-day booking):** Given a lone one-day `CONFIRMED` booking on a past date
  (after any cutoff), when refunded, then it is `CANCELLED` with `cancel_reason = 'VENUE'` and
  `refund_minor = amount`, its day released, one `BookingCancelled(reason = VENUE)` published (one
  `REVERSAL` and the cancellation mail follow from it). *Seam:* `Bookings#cancelByVenue` ·
  *Pinned by:* `VenueDayRefundServiceIT.aLoneOneDayBookingIsCancelledWholeWithReasonVenue`
- [ ] **AC-5 (gates):** Given an operator who does not own the venue, when they post the refund,
  then `403 NOT_VENUE_OWNER` before any read of the booking; given an owned venue and a code from
  another venue, then `404 BOOKING_NOT_FOUND`; no body carries the code (#7). *Seam:* `POST
  /api/venues/{id}/bookings/{code}/day-refund?date=` · *Pinned by:*
  `CrossVenueDenialIT.venueDayRefundByNonOwnerIs403`, `VenueDayRefundControllerIT.aForeignCodeAtAnOwnedVenueIsNotFound`
- [ ] **AC-6 (payout):** Given an accrual, when `BookingDayRefunded(reason = VENUE)` arrives, then
  one `DAY_REVERSAL` with `reason = 'VENUE'` per `(booking, day)`, pro-rata commission and no
  `FEE`; a later cancellation reverses only the remainder and the booking nets zero. *Seam:*
  `BookingDayRefundedPayoutListener` · *Pinned by:*
  `BookingDayRefundedPayoutListenerTest.aVenueRefundedDayCarriesItsReason`,
  `PayoutDayReversalIT.aVenueDayReversalCarriesTheReasonAndALaterCancellationTakesTheRemainder`
- [ ] **AC-7 (payment):** Given a day refund with reason `VENUE`, when the day-then-cancellation
  case runs, then the refund contract holds with the same day key
  (`booking-<id>-day-<yyyy-MM-dd>-refund`); nothing in `payment` changes. *Seam:*
  `RefundPort#refundDay` · *Pinned by:* `PaymentGatewayRefundContract` (unchanged, re-run) +
  `BookingDayRefundListenerTest` (the listener ignores the reason)
- [ ] **AC-8 (daily view + check-in):** Given the released day, when staff read the daily view,
  then the stay's row is listed on that date with `attendance = REFUNDED` and `released = true`,
  the chip reads "Day released" (a weather day keeps "Day refunded"); a check-in on that day is
  `409 DAY_RELEASED` with copy saying the spot was released. *Seam:* `GET
  /api/venues/{id}/bookings`, `CheckInResult.DayReleased` · *Pinned by:*
  `StaffBookingControllerIT.aReleasedDayIsListedAndTold`, `CheckInFlowIT.aReleasedDayRefusesCheckInSayingSo`,
  `daily-view-tab.spec.ts` ("badges a released day", "explains a scan on a released day")
- [ ] **AC-9 (guest mail + page):** Given `BookingDayRefunded(reason = VENUE, released)`, then
  the mail says the venue refunded the day and the amount and, when released, that the spot is no
  longer held, with no grounds; the booking page lists the day under "Refunded by the venue";
  the weather copy is byte-for-byte unchanged. *Seam:* `BookingDayRefundMailListener`,
  `SmtpMailer#sendDayRefund`, `GET /api/bookings/{code}` `refundedDays[].reason/released` ·
  *Pinned by:* `BookingDayRefundMailListenerTest`, `SmtpMailerIT`, `booking-view.spec.ts`
- [ ] **AC-10 (structure + docs):** The structural net is green; `RESPONSIBILITIES.md` §`booking`,
  §`payout`, §`notification` and `CONTEXT.md` describe the shipped behaviour; ADR-0027's status
  names this slice. *Pinned by:* the six-test command; `BookingMigrationIT` for the enum ↔
  CHECK lockstep of `RefundReason` and the day's reason.
- [ ] **AC-11 (e2e):** Mocked Playwright drives sign-in → daily view → row action → confirm → the
  "Day released" chip. *Pinned by:* `frontend/e2e/operator-daily.e2e.ts`

## Non-goals

- The admin path (booking id, audited, email lookup) — slice 2/2.
- Releasing a past day; refunding an attended day; any reason text for the guest.
- Stamping the actor on the weather refund (its behaviour is unchanged; `refunded_by_operator_id`
  is required for `VENUE` only).

## Risks

- **R-1 (#2, a hole under a live row):** releasing `(set, day)` while the stay's row still covers
  the day lets a second booking claim it. Bounded by ADR-0027 §4/§5: only a non-past day is
  released; the daily list keeps the row and shows the hole. Every reader listing a set's
  bookings on a date must tolerate two rows on one set → the daily view's `@for` tracks by row
  code, not set id (a duplicate track key would break rendering). `AC-1` proves the claim is
  re-claimable.
- **R-2 (lock order):** the day stamp locks the booking row, then the day row, then releases the
  availability row — the weather cancel's order (`refundInFull`), so a scan, the sweep and a
  reserve cannot deadlock with it.
- **R-3 (idempotency, #10):** the guarded `UPDATE … WHERE attended_at IS NULL AND refunded_at IS
  NULL` makes a replay a 0-row no-op; the event is published only by the winner; the release is
  idempotent (a no-op when no online claim holds the day).
- **R-4 (old registry payloads):** `BookingDayRefunded` gains `reason` + `released`; an outstanding
  publication serialized before them deserializes with `reason = null`, `released = false`.
  `refundReason()` answers `WEATHER` for null (as `BookingCancelled#lastDay()` does); the listener
  ids are unchanged, so nothing is orphaned.
- **R-5 (schema lockstep, #12):** `V71` is free on `main` and unclaimed by any open PR (only
  dependabot PRs are open); the branch merging second renumbers. Existing refunded days backfill
  `refund_reason = 'WEATHER'` before the CHECK is added.
- **R-6 (BOLA, #13):** `assertOwns` runs first in the service; the code lookup is venue-scoped
  (`CODE_MATCH AND b.venue_id = :venue`), so a foreign code is `NotFound`.
- **R-7 (rounding, #5):** `DayShare` and `commissionOn` unchanged; the reason changes nothing in
  the arithmetic.

## Open questions

### Resolved

- **Is "today" released or held?** Released. "Past" is the no-show sweep's definition
  (`service_date < today` in `Europe/Tirane`); today is still sellable until the sales close (#4)
  and is the day the venue has just decided the guest will not use.
- **How does the daily view tell held from released?** A `released` boolean on the row (the
  stamp), beside `attendance = REFUNDED`; the FE picks the chip from both. Not a fifth
  `DayAttendance` value: released is a fact about the claim, not the attendance.
- **Check-in refusal:** a new sealed outcome `CheckInResult.DayReleased` → `409 DAY_RELEASED`;
  `DayRefunded` keeps the weather copy.
- **The lone-booking cancel:** `Bookings#cancelForWeather` becomes `cancelByVenue(…, reason)`
  guarded by the renamed `BookingTransition.VENUE_REFUND` (weather or the venue's own day refund;
  still the only transition admitting `NO_SHOW`).
- **Event shape:** `BookingDayRefunded` gains `reason` and `released` (the mail needs the released
  fact; a past `VENUE` day is refunded but not released, so the reason alone cannot tell).
- **Endpoint:** `POST /api/venues/{venueId}/bookings/{code}/day-refund?date=YYYY-MM-DD` (the code in
  the path as check-in, the required `date` as the weather refund; the body never echoes the code).

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** the new release of `(set, day)` for a
  non-past `VENUE` day (via `AvailabilityClaim#release`, `availability` stays the sole writer);
  the lone one-day cancel's release (unchanged leg).
- **Concurrency strategy:** the day stamp is a guarded `UPDATE` under `SELECT … FOR UPDATE` on the
  booking row; the release runs in the same transaction after the stamp; a concurrent reserve
  claims with `INSERT … ON CONFLICT DO NOTHING` and wins only once the row is gone (commit).
- **Pool (#3) and cutoff (#4):** the release frees an online claim only (a staff mark is never
  touched); a past day is never released, and nothing sells a past day.
- **Pinning test:** `VenueDayRefundServiceIT` re-claims the released day through
  `AvailabilityClaim#claim` and proves a past day's row stays.

## Modulith

- `booking::application.refund` gains the `RefundVenueDay` port + `VenueDayRefundService`
  (internal, no `api/`); `booking` already depends on `availability::api`, `operator::api`.
- `booking::events.BookingDayRefunded` gains `reason` (a `booking::vocabulary` type) + `released`.
- `booking::vocabulary.RefundReason` gains `VENUE`.
- No new cross-module call or port; `payout` and `notification` read the wider event. Owners per
  `RESPONSIBILITIES.md`: `booking` decides, `payment` executes (unchanged), `payout` books the
  reversal, `notification` renders.

## Payment & payout

- **Idempotency keys:** unchanged — `booking-<id>-day-<yyyy-MM-dd>-refund` for the day,
  `booking-<id>-refund` for the lone booking's whole share.
- **Ledger:** `DAY_REVERSAL` with `reason = VENUE`, at most once per `(booking, day)` (`UNIQUE NULLS
  NOT DISTINCT`), pro-rata commission, no `FEE`; the lone booking posts one `REVERSAL(VENUE)`.
- **Refund policy:** the day's own rate (`DayShare`), full for the lone booking whatever the
  cutoff (#10); a later cancellation is quoted over `remainingMinor`.
- **Pinning tests:** `PayoutDayReversalIT`, `BookingDayRefundedPayoutListenerTest`,
  `BookingCancelledPayoutListenerTest` (a `VENUE` reversal carries no fee), `PaymentGatewayRefundContract`.

## FE↔BE contract

- **New:** `POST /api/venues/{venueId}/bookings/{code}/day-refund?date=` → `200 {kind:
  'DAY_REFUNDED'|'BOOKING_CANCELLED', serviceDate, refundMinor, currency, released}`; `403
  NOT_VENUE_OWNER`, `404 BOOKING_NOT_FOUND`, `409 DAY_ATTENDED | DAY_ALREADY_REFUNDED |
  DAY_NOT_COVERED` (RFC-7807, `instance` code-free).
- **Changed:** `GET /api/venues/{id}/bookings` rows gain `released: boolean`; the check-in POST
  gains `409 DAY_RELEASED`; `GET /api/bookings/{code}` `refundedDays[]` gain `reason` and
  `released`; the payout ledger's `DAY_REVERSAL.reason` may be `VENUE`.

## Phases

- **Phase 0 — vocabulary + schema:** `RefundReason.VENUE`; `V71` (day reason, released stamp,
  actor; the two widened reason CHECKs; weather backfill) · red test
  `BookingMigrationIT.dayRefundReasonAndTheCancelReasonStayInLockstepWithTheEnum`
- **Phase 1 — event + stamps:** `BookingDayRefunded(reason, released)`, `Bookings#refundDay` with
  a `DayRefundStamp`, `cancelByVenue`, `VENUE_REFUND` transition, `RefundedDay` + daily row
  `released` · red tests `JdbcBookingTransitionTableIT`, `WeatherRefundServiceIT` (unchanged
  behaviour under the new stamp), `BookingDayRefundedPayoutListenerTest.aVenueRefundedDayCarriesItsReason`
- **Phase 2 — the use case:** `RefundVenueDay` + `VenueDayRefundService` · red tests
  `VenueDayRefundServiceTest` (fake ports: legs, gates, past day), `VenueDayRefundServiceIT` (AC-1..4)
- **Phase 3 — the edge:** controller + `SecurityConfig` rule; `CheckInResult.DayReleased`; daily
  row `released` · red tests `VenueDayRefundControllerIT`, `CrossVenueDenialIT`, `CheckInFlowIT`,
  `StaffBookingControllerIT`
- **Phase 4 — payout + notification:** reason on the `DAY_REVERSAL`; mail copy by reason ·
  red tests `PayoutDayReversalIT`, `BookingDayRefundMailListenerTest`, `SmtpMailerIT`, `DayRefundMailIT`
- **Phase 5 — frontend:** console service + model, daily view row action + confirm + chips +
  check-in copy, payouts reason label, booking page copy · red tests `daily-view-tab.spec.ts`,
  `operator-console.service.spec.ts`, `payouts-tab.spec.ts`, `booking-view.spec.ts`
- **Phase 6 — e2e + docs:** `operator-daily.e2e.ts`; `RESPONSIBILITIES.md`, `CONTEXT.md`,
  ADR-0027 status, `domain-model.md`; plan removed in the last commit.

## Execution status

> The session-recovery anchor: re-read it (plus the current stage's `riviera-sdlc` reference)
> after a compaction or when unsure. Update in the same commit window as what it records.

**Stage pointer:** `PR — draft open, CI due; then ready for review + review/Sonar gates`

**Next action:** confirm CI on the pushed head, mark ready for review, run `/code-review` + overlay.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — vocabulary + schema | ✅ | backend commit |
| 1 — event + stamps | ✅ | backend commit |
| 2 — the use case | ✅ | backend commit |
| 3 — the edge | ✅ | backend commit |
| 4 — payout + notification | ✅ | backend commit |
| 5 — frontend | ✅ | frontend commit |
| 6 — e2e + docs | ⏳ | docs commit; plan removed in the last commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
