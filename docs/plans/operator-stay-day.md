# Operator daily view and takings for stays — Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** On any date, the operator's daily view tells arriving, staying and leaving guests apart,
says who has not checked in today on any day of a stay, counts takings by the days served on that
date, and the layout editor's lock names the whole span a set is booked for.

**Architecture:** Three reads change shape, no table does. The staff daily list (`booking`) carries
the guest's span (the stay's when stitched, else the booking's) and today's `booking_day`
attendance; the takings port (`booking`) sums each covering booking's share of the date through a
pure domain rule; `venue`'s `BookingPresence` answers a set's booked span (earliest first day to
latest last day of its live bookings) and the lock views carry it. Grouping and wording stay in
the SPA.

**Source of intent:** `docs/architecture/multi-day-stays.md` § D4, stories 30–33; issue #1205
(epic #1096).

**Branch:** `claude/tailwind-angular-consult-bs3j7i` (the cloud session's designated branch, standing
in for `feature/operator-stay-day`).

## Decisions at intake (owner may retune)

- **Span on the daily row is the guest's, not the stretch's.** A stitched stay's row on set B on a
  move day reads as *staying* (the stay began earlier), never as an arrival: the guest is not new,
  and set A's turnover is visible on the map. The stretch's own span is not sent.
- **Groups:** *Arriving today* (span starts on the date; a one-day booking lands here), *Staying*
  (strictly inside the span), *Leaving today* (span ends on the date and began earlier). A one-day
  venue therefore sees every row under *Arriving today*, the same rows and chips as before.
- **"Not checked in today"** is the count of rows with today's day unresolved, shown for today
  only (a future day has no check-ins yet; a past day is the sweep's).
- **A day's share** of a booking is `amount_minor / days`, the remainder on the first day, so the
  span sums to the booking (integer minor units, #5). The reserve prices a booking at per-day
  price × days, so the remainder is zero for every row the reserve writes.
- **The lock's span is the union of the set's live bookings**: earliest first day to latest last
  day. Two back-to-back stays read "booked 20 Sep – 1 Oct" rather than naming only the first and
  letting a remodel planned for 1 Oct fail at save time.
- **No Flyway migration.** Every fact needed is in `booking`, `stay` and `booking_day` (V60–V67).

## Acceptance criteria

- [ ] **AC-1:** Given a one-day booking on D, a stay D-1..D+1 and a stay D-2..D on one venue, when
  the daily list is read for D, then each row carries `(firstDate, lastDate)` = (D, D), (D-1, D+1),
  (D-2, D). *Seam:* `GET /api/venues/{id}/bookings?date` · *Pinned by:*
  `StaffBookingControllerIT.eachRowCarriesTheGuestsSpan`
- [ ] **AC-2:** Given a stitched stay whose stretch on set B starts on D, when the list is read for
  D, then the row's span is the stay's, not the stretch's. *Seam:* the same endpoint · *Pinned by:*
  `StaffBookingControllerIT.aStitchedStretchCarriesTheStaysSpan`
- [ ] **AC-3:** Given a three-day stay checked in on day 1 and day 2 only, when the list is read for
  day 1, day 2 and day 3 (after the sweep), then `attendance` is `ATTENDED`, `ATTENDED`,
  `MISSED` while `status` stays the stay outcome. *Seam:* the same endpoint · *Pinned by:*
  `StaffBookingControllerIT.attendanceIsTheDaysNotTheStays`
- [ ] **AC-4:** Given a one-day `COMPLETED` and a one-day `NO_SHOW` booking, when listed, then
  `attendance` is `ATTENDED` and `MISSED` (parity with the status chips). *Pinned by:* the
  existing `StaffBookingControllerIT` cases plus `…attendanceIsTheDaysNotTheStays`.
- [ ] **AC-5:** Given a booking of 9000 over D..D+2 and a one-day booking of 4000 on D+1, when
  gross takings are read for D, D+1, D+2, then they are 3000, 7000, 3000 — never 9000 on D.
  *Seam:* `booking.api.DailyTakings#grossOnlineTakings` · *Pinned by:*
  `JdbcBookingsDailyTakingsIT.aStayCountsOnEachDayItServes`
- [ ] **AC-6:** Given amount 10000 over 3 days, when the share is asked per day, then it is
  3334, 3333, 3333 (sums to 10000). *Seam:* `booking.domain.DayShare` · *Pinned by:*
  `DayShareTest`
- [ ] **AC-7:** Given a set with live bookings 20–30 Sep and 1 Oct, when `nearestLiveBookings` is
  asked, then it answers the span 20 Sep – 1 Oct; a set with finished bookings only is absent.
  *Seam:* `venue.spi.BookingPresence` · *Pinned by:*
  `JdbcBookingPresenceIT.nearestLiveBookingsAnswersTheBookedSpanPerSet`
- [ ] **AC-8:** Given a locked set, when the owner's beach map is read and when a save that
  removes it is refused, then `SetLockView` and `BlockedSetView` carry `bookedUntil` beside
  `bookedOn`. *Seam:* `GET /{venueId}/beach-map`, `409 SETS_IN_USE` · *Pinned by:*
  `BeachMapReadServiceTest`, `VenueAdminControllerIT` (existing lock cases extended)
- [ ] **AC-9 (frontend):** the daily view groups rows into arriving / staying / leaving, labels a
  multi-day guest's span, shows the not-checked-in count for today, and the lock reads
  "booked 20 Sep – 1 Oct". *Pinned by:* `daily-view-tab.spec.ts`, `lock-reason.spec.ts`,
  `operator-console.service.spec.ts`, mocked e2e `operator-daily.e2e.ts` and
  `layout-editor.e2e.ts`.
- [ ] **AC-10 (parity):** every existing daily-view, takings, presence and lock test passes
  unchanged in intent; a one-day venue's numbers are identical.

## Non-goals

- Per-day refunds of a stay's stormy day (#1210).
- A remodel-aware lock that names each booking separately; the union span is enough to plan.
- Changing the ledger's accrual (one accrual per booking at the live rate — D4's accepted drift).
- Naming the stretch a guest moved from on a move day (slice 11's re-scan does that).

## Risks

- **R-1 (rounding, #5):** integer division of a booking's amount over its days could lose or
  invent minor units → `DayShare` puts the remainder on the first day and `DayShareTest` proves
  the span sums to the amount for a remainder of 0, 1 and n-1.
- **R-2 (parity):** a one-day venue's takings, list and lock must not change → every existing IT
  stays and the new ITs include a one-day row beside the stay.
- **R-3 (attendance source):** reading the chip from `booking_day` rather than `status` could
  disagree on legacy rows → V60 backfilled every ever-confirmed booking's day with its status's
  stamp; a row with no day (none exists after V60) reads `EXPECTED`.
- **R-4 (#13 BOLA):** unchanged — `DailyBookingsService`, `DailyTakingsService` and the beach-map
  read already assert ownership; the new fields ride the same reads (`CrossVenueDenialIT`).
- **R-5 (#7):** the code stays display-only; the new fields add no logging.
- **R-6 (lock in the past):** `bookedOn` may be a past date for a running stay (it already can);
  the frontend renders the span as sent.

## Open questions

_None._

## Modulith

- `booking.application.view.DailyBooking` gains `firstDate`, `lastDate`, `attendance`
  (`DayAttendance` enum in `booking/domain`); no new port.
- `booking.api.DailyTakings` keeps its signature; its adapter reads covering rows and sums via
  `booking.domain.DayShare`. `payout` is untouched (still the caller, still applies the rate).
- `venue.spi.BookingPresence#nearestLiveBookings` returns `Map<SetId, BookedSpan>` (a new
  `venue.vocabulary` record: `StaySpan`'s 62-day ceiling would refuse a season-long union);
  `venue.application.SetLock`,
  `venue.vocabulary.LockedSet`, `SetLockView`, `BlockedSetView` and the root's
  `RemodelCommitResponse.LockedSetView` carry `bookedUntil`. Owner check: the span of a booking is
  `booking`'s fact; the lock is `venue`'s reading of it — matches RESPONSIBILITIES §venue.

## FE↔BE contract

- `GET /api/venues/{id}/bookings?date` rows: `{ setId, code, status, firstDate, lastDate,
  attendance }` — `attendance ∈ EXPECTED | ATTENDED | MISSED`, dates ISO `LocalDate`.
- `GET /api/venues/{id}/beach-map` `locks[]` and `409 SETS_IN_USE` `sets[]` gain `bookedUntil`
  (ISO or `null`, `null` iff `bookedOn` is).
- `GET /api/venues/{id}/takings?date` unchanged in shape; the figure is the day's share.

## Phases

- **Phase 0 — day share rule:** `DayShare` · red test `DayShareTest`.
- **Phase 1 — takings per served day:** adapter reads covering rows · red test
  `JdbcBookingsDailyTakingsIT.aStayCountsOnEachDayItServes`.
- **Phase 2 — daily list span + attendance:** `DailyBooking` fields, SQL, view · red tests
  `StaffBookingControllerIT.eachRowCarriesTheGuestsSpan`, `…aStitchedStretchCarriesTheStaysSpan`,
  `…attendanceIsTheDaysNotTheStays`.
- **Phase 3 — lock span:** `BookingPresence`, `SetLock`, views · red tests
  `JdbcBookingPresenceIT.nearestLiveBookingsAnswersTheBookedSpanPerSet`, `LiveClaimsTest`,
  `BeachMapReadServiceTest`.
- **Phase 4 — frontend:** models, service parsing, `lock-reason`, daily-view groups and count ·
  red tests in the Vitest specs, then the mocked e2e.
- **Phase 5 — docs:** `RESPONSIBILITIES.md` §booking takings line, `CONTEXT.md` if a term is
  new, design doc status line; plan retired in the PR's last commit.

## Execution status

**Stage pointer:** `PR — draft open, CI due`

**Next action:** watch CI on the draft; then merge `origin/main`, mark ready, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — day share rule | ✅ | phase 0+1 commit |
| 1 — takings per served day | ✅ | phase 0+1 commit |
| 2 — daily list span + attendance | ✅ | phase 2 commit |
| 3 — lock span | ✅ | phase 3 commit |
| 4 — frontend | ✅ | phase 4 commit |
| 5 — docs | ✅ | phase 5 commit |

Local proof (cloud session, one IT class at a time): `DayShareTest`, `LiveClaimsTest`,
`BeachMapReadServiceTest`, `LayoutWriterTest`, `BeachMapRemodelServiceTest`,
`VenueAdminServiceTest`, `JdbcBookingsDailyTakingsIT`, `StaffBookingControllerIT`,
`JdbcBookingPresenceIT`, `VenueAdminControllerIT`, `BeachMapReplaceIT`, the structural net;
Vitest over `operator/`; mocked Playwright `operator-daily` + `layout-editor`; `ng lint`,
`format:check`, the comment/doc-budget/focus/touch guards.

Legend: blank = not started, ⏳ = in progress, ✅ = done.
