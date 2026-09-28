# Weather refund for one day of a stay — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`. Slice 12/12 of epic #1096.

**Goal:** an operator's weather refund for `(venue, date)` refunds the day's share of every stay
covering that date whose day was not attended, keeps the stay live, and one-day bookings behave as
today.

**Architecture:** a washed-out day becomes a **day-level fact** on `booking_day`
(`refunded_at`, `refund_minor`) announced by one new event, `BookingDayRefunded`, that the three
money-and-mail consumers ride exactly as they ride `BookingCancelled`: `booking`'s own listener
refunds through a new `RefundPort#refundDay`, `payout` posts a `DAY_REVERSAL` keyed by
`(booking, day)`, `notification` mails the guest. Money stays per booking row (a stitched stay's
stretch is one set at one price, so `DayShare` yields the day's exact rate); the payout ledger and
`payment` each gain a per-scope key so a day refund and a later cancellation refund can both exist
for one booking, at most once each.

**Source of intent:** issue #1210; `docs/architecture/multi-day-stays.md` § D5 (option A, decided
2026-09-24); owner decisions at intake (2026-09-28, below).

**Branch:** `claude/tailwind-angular-consult-9fcgjj` (the cloud session's designated branch, standing
in for `feature/stay-day-refund`).

## Owner decisions at intake (2026-09-28)

1. **The day decides admission.** A booking that happened (`CONFIRMED`, `COMPLETED`, `NO_SHOW`) has
   its stormy day refunded iff that day is neither attended nor already refunded. A `COMPLETED` stay's
   missed stormy day is refunded. One-day lone bookings keep today's whole-cancel path; a one-day
   `COMPLETED` booking attended its day, so both rules exclude it.
2. **The refunded day's set stays held; check-in on it is refused.** Nothing is released (invariant
   #2 untouched); a scan on a refunded day answers "this day was refunded"; the day is neither
   attended nor missed; takings exclude it.
3. **A stretch of a stitched stay is a day of the stay**, one-day stretches included: the stretch
   stays `CONFIRMED` with the day refunded, one day-refund mail under the stay's code. "One-day
   bookings behave as today" means lone bookings (`stay_id IS NULL`).
4. **Payment shape: one `payment_refund` child table** (owner asked for best practice; this is it):
   one row per refund of either scope, `payment_booking.refunded_minor` the running sum.

Decided here, ← confirm at review: **a stay whose every day ends up refunded stays live** with zero
remaining (no cancel, no release, no cancellation mail); the sweep resolves it as any stay.

## Acceptance criteria

- [ ] **AC-1 (day refund):** Given a 14-day `CONFIRMED` booking at 3000/day and day 8 unattended, when
  the operator refunds `(venue, day 8)`, then `booking_day(day 8)` is refunded for 3000, the booking
  stays `CONFIRMED`, the other 13 days are untouched, no availability row changes, and
  `BookingDayRefunded(booking, day 8, 3000 EUR)` is published. *Seam:* `RefundForWeather` ·
  *Pinned by:* `WeatherRefundServiceIT.aStaysUnattendedDayIsRefundedAndTheStayContinues`
- [ ] **AC-2 (checked-in day):** Given the guest checked in on day 8, when the operator refunds day 8,
  then nothing changes and the outcome lists the booking under `notRefunded`. *Seam:*
  `RefundForWeather` · *Pinned by:* `WeatherRefundServiceIT.aCheckedInDayIsNotRefundedAndIsNamed`
- [ ] **AC-3 (missed day):** Given day 8 was swept `MISSED` (booking `CONFIRMED` or already
  `COMPLETED`), when refunded, then the day is refunded and stays missed. *Seam:* `RefundForWeather` ·
  *Pinned by:* `WeatherRefundServiceIT.aMissedDayIsRefunded`, `…aCompletedStaysMissedDayIsRefunded`
- [ ] **AC-4 (stitched rate):** Given a stay of two stretches at 2000/day and 5000/day, when the
  storm hits a day of the second stretch, then exactly 5000 is refunded on that stretch; a one-day
  stretch is refunded the same way, never cancelled. *Seam:* `RefundForWeather` · *Pinned by:*
  `WeatherRefundServiceIT.aStitchedStayRefundsTheStretchsOwnRate`, `…aOneDayStretchIsADayOfTheStay`
- [ ] **AC-5 (idempotent per day):** Given day 8 refunded, when the operator re-runs day 8, then
  nothing more is refunded or published; running day 9 refunds a second day. *Seam:*
  `RefundForWeather` · *Pinned by:* `WeatherRefundServiceIT.rerunRefundsNothingNew`,
  `…twoStormDatesRefundTwoDays`
- [ ] **AC-6 (ledger):** Given the accrual for a 14-day booking, when `BookingDayRefunded(day 8)` is
  delivered twice, then exactly one `DAY_REVERSAL (booking, day 8)` exists; a later
  `BookingCancelled` with the remaining refund posts one `REVERSAL` whose gross is the remaining
  amount; the period total nets `accrual − day − reversal` and a fully reversed booking nets exactly
  zero. *Seam:* `BookingDayRefunded` / `BookingCancelled` → `payout` · *Pinned by:*
  `PayoutDayReversalIT.{oneDayReversalPerBookingAndDay,aLaterCancellationReversesOnlyTheRemainder,
  aFullyReversedBookingNetsZero}`, `ReversalMathTest`, `PayoutBatchGenerationIT.aDayReversalDeducts`
- [ ] **AC-7 (payment):** Given one collection, when a day refund then a whole refund are requested
  and each replayed, then two refunds exist at the gateway, one per scope, and a replay adopts its
  own. *Seam:* `PaymentGateway` (contract) · *Pinned by:*
  `PaymentGatewayRefundContract.aDayRefundAndACancellationRefundAreEachMadeOnce`; the coverage rule
  `PaymentGatewayContractCoverageArchitectureTest` unchanged. Webhook: a dead day refund is
  un-recorded by its own row. *Pinned by:* `JdbcPaymentsIT.aDeadDayRefundIsUnrecordedAlone`
- [ ] **AC-8 (attendance):** Given day 8 refunded, when the guest scans on day 8, then
  `CheckInResult.DayRefunded`; the sweep leaves day 8 neither missed nor attended; the stay resolves
  `COMPLETED` if any other day was attended, else `NO_SHOW`; the daily takings for day 8 exclude the
  booking's share. *Seams:* `CheckInBooking`, `MarkNoShows`, `DailyTakings` · *Pinned by:*
  `CheckInFlowIT.aRefundedDayRefusesCheckIn`, `NoShowSweepIT.aRefundedDayIsNeitherMissedNorAttended`,
  `DailyTakingsIT.aRefundedDayIsExcluded`
- [ ] **AC-9 (policy over the remainder):** Given day 8 refunded on a 14-day booking, when the guest
  cancels in the FREE window, then the refund is `amount − 3000` and the view's
  `refundIfCancelledNow` says so beforehand. *Seam:* `CancelBooking`, `ViewBooking` · *Pinned by:*
  `CancelBookingIT.aCancellationAfterADayRefundRefundsTheRemainder`
- [ ] **AC-10 (one-day as today):** every existing `WeatherRefundServiceIT` case for one-day bookings
  passes unchanged, including no refund once checked in (`COMPLETED`).
- [ ] **AC-11 (outcome, mail, page):** the outcome separates cancelled one-day bookings from day
  refunds and lists checked-in bookings; the guest gets one mail per refunded day naming the day and
  amount; the booking page lists refunded days. *Seams:* `POST …/weather-refund`,
  `BookingDayRefunded` → `notification`, `GET /api/bookings/{code}` · *Pinned by:*
  `DayRefundMailIT`, `DayRefundMailListenerTest`, `BookingViewIT.refundedDaysAreListed`,
  Vitest `payouts-tab.spec.ts`/`booking-view.spec.ts`, mocked Playwright `operator-payouts.e2e.ts`,
  `stay-day-refund.e2e.ts`

## Non-goals

- Releasing a refunded day's availability (decision 2).
- Cancelling a stay whose every day was refunded (stays live, see above).
- Refunding a day for any reason but weather; a per-day guest cancellation (user story 20 is whole).
- A day refund at Stripe reconciled from a success webhook (today's model records from the create
  response; failure webhooks un-record — unchanged).
- Re-pricing: the day's rate is what the guest paid for that stretch.

## Risks

- **R-1 (#9, double reversal):** a re-delivered `BookingDayRefunded` must not post twice →
  `UNIQUE NULLS NOT DISTINCT (booking_id, entry_type, service_date)` replaces
  `payout_once_per_booking`; `ON CONFLICT` on the same key. Postgres 17 (`PostgresContainerConfiguration`).
- **R-2 (#9, over-reversal on cancel):** a cancellation after a day refund must reverse only the
  remainder → `CancellationPolicy` quotes on `amount − Σ day refunds`; `payout`'s reversal reads
  prior reversals so a booking whose reversals reach its gross reverses its commission exactly
  (no rounding cents left). `ReversalMathTest` pins both.
- **R-3 (#8/#10, payment):** a day refund and a whole refund on one booking must each be created at
  most once → per-scope idempotency key (`booking-<id>-day-<date>-refund`), the refund tagged with
  `bookingRef` + `serviceDate`, adoption filtered by scope; `payment_refund` `UNIQUE (payment_booking_id,
  scope, service_date)`; over-refund impossible via `refunded_minor ≤ amount_minor` on the running sum.
- **R-4 (#2, availability):** nothing is released; the refunded day keeps its row (decision 2).
- **R-5 (#13):** `VenueOwnership.assertOwns` stays first in `WeatherRefundService`; `CrossVenueDenialIT`
  unchanged.
- **R-6 (#7):** the outcome lists booking ids, never codes; the mail names the stay's code to its owner
  only.
- **R-7 (registry payload):** `BookingCancelled` is unchanged; the new event is new, so no stored
  payload is widened. The new refund listener's id is pinned in `RegistryRefundOutbox` so the outbox
  read covers day refunds too.
- **R-8 (Flyway):** V68 (`booking_day`), V69 (`payout_ledger_entry`), V70 (`payment_refund`) are free
  on `main` and unclaimed by any open PR (only dependabot PRs open on 2026-09-28).
- **R-9 (behaviour change):** the operator outcome drops `manualRefunds` (see parity ledger); the
  payouts tab's copy and e2e mocks change with it.

## Open questions

- none — *Resolved:* the four owner decisions above; all-days-refunded stays live (← confirm at review).

## Availability & concurrency

- **Write paths to `set_availability`:** none new; the day refund releases nothing (decision 2). The
  one-day lone path releases as today.
- **Concurrency strategy:** the day refund locks the booking row (`FOR UPDATE`) then stamps the day
  under a guard (`attended_at IS NULL AND refunded_at IS NULL`), the lock order check-in and the sweep
  use; a racing check-in or cancel makes one side a 0-row no-op.
- **Pinning test:** `WeatherRefundServiceIT.aCheckedInDayIsNotRefundedAndIsNamed` (the guard),
  `CancelStayIT` (existing race with the stay cancel).

## Modulith

- **`booking.events.BookingDayRefunded`** (new record: `BookingId`, `VenueId`, `SetId`,
  `serviceDate`, `refundMinor`, `currency`, `stayId` nullable). Owner `booking`; consumers
  `booking` (refund), `payout` (ledger), `notification` (mail). `availability` and `payment` never
  subscribe.
- **`payment.api.RefundPort#refundDay(BookingRef, LocalDate, Money)`** joins the refund conversation
  (a new method on the existing port, not a new port). Internally `PaymentGateway` and `Payments` take
  a `RefundScope` (`payment.vocabulary`).
- **`booking.domain.DayShare`** is the day's rate (already the takings' rule). `CheckInResult.DayRefunded`
  and `DayAttendance.REFUNDED` extend existing vocabularies.
- Owners checked against `RESPONSIBILITIES.md`: `booking` decides the refund and the day fact;
  `payment` executes; `payout` computes the reversal; `notification` renders. `payment` is the sole
  writer of `payment_refund` (`ResponsibilitiesArchitectureTests` gains the table).
- Structural net after each backend phase.

## Payment & payout

- **Idempotency keys:** whole refund `booking-<id>-refund` (unchanged); day refund
  `booking-<id>-day-<yyyy-MM-dd>-refund`. Stripe metadata `bookingRef` (unchanged) + `serviceDate` on a
  day refund; adoption candidates are the live refunds tagged with this booking **and** scope
  (untagged ones still only on a single-booking intent, as today).
- **Ledger effect:** `ACCRUAL` on confirm (unchanged); `DAY_REVERSAL (booking, day)` on
  `BookingDayRefunded`, gross = the day's refund, commission `floorDiv(accrual.commission × refund,
  accrual.gross)`; `REVERSAL` on `BookingCancelled` over the remainder; when a reversal brings the
  booking's reversed gross to its accrual gross, its commission is the accrual's commission minus what
  earlier reversals took, so the booking nets zero. Direction is the type: every sum already reads
  "only an `ACCRUAL` adds", so `DAY_REVERSAL` deducts with no query change; `venueChangeTotals` filters
  `REVERSAL` under `VENUE_CHANGE` and a day reversal is always `WEATHER`. `FEE` unchanged.
- **Refund policy (#10):** the day refund is in full whatever the cutoff (as today's weather rule);
  a later guest cancellation is quoted by `CancellationPolicy` over `amount − Σ day refunds`.
- **Pinning tests:** `PayoutDayReversalIT`, `ReversalMathTest`, `PayoutBatchGenerationIT.aDayReversalDeducts`,
  `PaymentGatewayRefundContract.aDayRefundAndACancellationRefundAreEachMadeOnce`, `PaymentMigrationIT`
  (scope uniqueness, over-refund), `PaymentRefundBackfillIT` (V70 moves every existing refund unchanged).

## Behaviour-parity ledger

| Old-surface behaviour | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| One-day lone booking on the date is cancelled + fully refunded, set released, `BookingCancelled` | preserved | same path, same tests |
| `NO_SHOW` one-day booking is refunded | preserved | same admission |
| `COMPLETED` one-day booking is not refunded | preserved | its day is attended → excluded by the day rule |
| A multi-day booking is named under `manualRefunds` for a manual refund | **dropped** | it is refunded automatically per day; the outcome names checked-in bookings instead (`notRefunded`) |
| A one-day stretch of a stitched stay is cancelled outright | **changed** | decision 3: a day of the stay |
| Re-run is a no-op | preserved | per `(booking, day)` |
| Payouts tab notice "N stays overlap this date and need a manual refund" | **changed** | "refunded k day(s) of N stay(s)" + "M checked in, not refunded" |

## FE↔BE contract

- `POST /api/venues/{id}/weather-refund?date` → `WeatherRefundView { refundedCount, totalRefundedMinor,
  currency, dayRefundCount, dayRefundedMinor, notRefundedCount, notRefundedBookingIds }`
  (`manualRefundCount`/`manualRefundBookingIds` removed).
- `GET /api/bookings/{code}` → `BookingDetailView.refundedDays: [{ day, amount: MoneyView }]` (every
  stretch's, ascending).
- `GET /api/venues/{id}/bookings?date` → `attendance` gains `REFUNDED`.
- `GET /api/venues/{id}/payouts` ledger rows → `entryType` gains `DAY_REVERSAL`, row gains
  `serviceDate` (nullable).
- Check-in → a new outcome code `DAY_REFUNDED`.

## Phases

- **Phase 0 — schema:** V68 `booking_day.refunded_at/refund_minor` + CHECKs; V69 ledger
  `DAY_REVERSAL` + `service_date` + `UNIQUE NULLS NOT DISTINCT`; V70 `payment_refund` + backfill ·
  red tests `BookingDayMigrationIT`, `PayoutMigrationIT.{oneDayReversalPerBookingAndDay,…}`,
  `PaymentMigrationIT`, `PaymentRefundBackfillIT`
- **Phase 1 — payout:** `BookingDayRefunded` record; `EntryType.DAY_REVERSAL`; reversal math with
  prior reversals; `BookingDayRefundedPayoutListener`; ledger reads carry `serviceDate` · red tests
  `ReversalMathTest`, `PayoutDayReversalIT`, `PayoutBatchGenerationIT.aDayReversalDeducts`
- **Phase 2 — payment:** `RefundScope`; `Payments` per-scope writes on `payment_refund`;
  `RefundPort#refundDay`; Stripe key/tag/adoption by scope; stub gateway · red tests
  `PaymentGatewayRefundContract.aDayRefundAndACancellationRefundAreEachMadeOnce`, `JdbcPaymentsIT`,
  `RefundServiceTest`
- **Phase 3 — booking day refund:** candidates by day, `Bookings#refundDay`, the service's three
  legs (lone one-day → cancel; attended → named; else day refund), outcome record,
  `BookingDayRefundListener` → `refundDay`, outbox pin · red tests `WeatherRefundServiceIT` (AC-1…5)
- **Phase 4 — attendance, takings, policy:** check-in refusal, sweep exclusion, takings exclusion,
  `CancellationPolicy` over the remainder, `BookingRecord.dayRefundedMinor` · red tests
  `CheckInFlowIT`, `NoShowSweepIT`, `DailyTakingsIT`, `CancelBookingIT`
- **Phase 5 — notification:** `DayRefundMail`, listener, SMTP + mock rendering, abandon counter ·
  red tests `DayRefundMailListenerTest`, `DayRefundMailIT`
- **Phase 6 — API views:** `WeatherRefundView`, `BookingDetail.refundedDays`, `DailyBooking`
  `REFUNDED`, ledger row `serviceDate`, check-in `DAY_REFUNDED`, `WebSliceStubs` · red tests
  `BookingViewIT.refundedDaysAreListed`, controller slices
- **Phase 7 — frontend:** payouts tab notice + confirm copy + ledger label; daily view chip; booking
  page refunded days; models · red tests Vitest specs, mocked Playwright
- **Phase 8 — docs + close-out:** ADR-0026 (a washed-out day is a day-level reversal),
  `RESPONSIBILITIES.md` §booking/§payment/§payout/§notification, `CONTEXT.md` (*Day refund*),
  design doc status line, `CLAUDE.md` sole-writer cell (`payment_refund`); plan doc removed in the last
  commit.

## Execution status

**Stage pointer:** `plan committed — implement (phase 0)`

**Next action:** write the three migrations and their red migration ITs.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — schema | ⏳ | |
| 1 — payout | | |
| 2 — payment | | |
| 3 — booking day refund | | |
| 4 — attendance, takings, policy | | |
| 5 — notification | | |
| 6 — API views | | |
| 7 — frontend | | |
| 8 — docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
