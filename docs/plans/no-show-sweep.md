# NO_SHOW Sweep Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A scheduled sweep marks every `CONFIRMED` booking whose service day has passed
(`Europe/Tirane`) as `NO_SHOW`, so an undelivered stay stops looking like a live upcoming
booking — without changing any venue's money facts for that day.

**Architecture:** The sweep is a **single bulk guarded `UPDATE`** (`WHERE status = 'CONFIRMED'
AND booking_date < :today`), not the read-ids-then-per-row shape the two existing sweeps use.
That deviation is the significant decision: the abandoned-payment and request-expiry sweeps loop
per row because each row must also *release* its `(set, date)` availability claim and publish an
event. A no-show releases nothing and publishes nothing, so there is no second write to isolate —
one statement is atomic, idempotent, concurrency-safe by construction, and cannot half-finish.
The second decision is that `CONFIRMED` stops being an open-ended state: every read filtering on it
was audited and split into "live upcoming booking" (stays narrow) vs "was delivered/paid" (widens).

**Persistence:** JDBC only (invariant #1). One migration — `V41`, a **partial index only**, no
column: `NO_SHOW` has been admitted by the `booking_status_check` constraint since V5 (re-stated
V19/V37), and no `no_show_at` column is added (see Non-goals).

**Source of intent:** GitHub issue #584 (sub-issue of epic #575; blocked-by #583, merged via PR #585)

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that AC #5
would silently kill past-date weather refunds, a capability `WeatherRefundService` documents and
`WeatherRefundServiceIT.fullRefundRegardlessOfCutoff` pins; escalated and re-decided, see Resolved
Q-1) · `riviera-plan-doc` (this template — forced the Behavior-parity ledger that surfaced the
empty-past-day arrivals regression and the `CheckInService.classify` message regression) · `tdd`
(each phase red-green: the sweep's guard, then each widened read, then the FE chip) ·
`riviera-review-overlay` (review gate — <ran at ready-for-review>) · `riviera-docs-freshness`
(<ran over the slice's merge range>) · `riviera-modulith` (kept the sweep inside `booking`,
no new published surface, no event; placed the service in the existing `application/checkin/`
attendance group rather than minting a 7th use-case package) · `riviera-java-conventions`
(`sweepJdbc` bounded client for scheduled work, typed-outcome-free `int` return, package-private
adapter, named status constants) · `postgres` (the partial index on `booking (booking_date) WHERE
status = 'CONFIRMED'`, following the V13/V19 sweep-index precedent) · `riviera-stripe-payments`
(confirmed the weather-refund widening reuses the U6 refund spine unchanged — reversal via the
existing `BookingCancelled` listener, exactly-once, invariant #9) · `riviera-frontend` (the daily
view's model change stays in `operator/`; the status vocabulary stays in `shared/booking-status.ts`)
· `angular-developer` + angular-cli MCP (confirmed the v22 rules for the arrivals view-model — the
test-hook ternary moved out of the template into `ARRIVAL_CHIPS`) · `riviera-tailwind` (reuse the
shared `StatusChip` directive instead of a second hand-rolled inline chip, so the `chip--no-show`
fill keeps its existing AA proof) · `playwright-cli` (the mocked-suite spec for a swept past day) · `riviera-local-debug` (scoped test runs)

**Branch:** `claude/sdlc-584-spwjmh` — the cloud session's designated remote branch stands in for
`feature/no-show-sweep` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `CONFIRMED` booking whose `booking_date` is before today in `Europe/Tirane`,
  when `MarkNoShows#sweep` runs, then that booking is `NO_SHOW`. *Pinned by:*
  `NoShowSweepIT.sweepsPastConfirmedBooking`
- [ ] **AC-2:** Given `CONFIRMED` bookings dated today and tomorrow (`Europe/Tirane`), when the
  sweep runs, then both remain `CONFIRMED`. *Pinned by:*
  `NoShowSweepIT.leavesTodayAndFutureUntouched`
- [ ] **AC-3:** Given a past-day booking already `COMPLETED` by check-in (#583), when the sweep
  runs, then it stays `COMPLETED`. *Pinned by:* `NoShowSweepIT.neverTouchesCheckedInBooking`
- [ ] **AC-4:** Given a past-day `CONFIRMED` booking, when the sweep runs twice, then the second run
  reports 0 rows and no row changes. *Pinned by:* `NoShowSweepIT.secondRunIsANoOp`
- [ ] **AC-5:** Given past-day bookings in every non-`CONFIRMED` status (`CANCELLED`, `EXPIRED`,
  `DECLINED`, `WITHDRAWN`, `AWAITING_PAYMENT`, `PENDING_REQUEST`), when the sweep runs, then none
  changes status. *Pinned by:* `NoShowSweepIT.onlyConfirmedIsSwept`
- [ ] **AC-6:** Given a venue's past service date with one `CONFIRMED`, one `COMPLETED` and (after
  the sweep) one `NO_SHOW` booking, when `DailyTakings#grossOnlineTakings` is read before and after
  the sweep, then the gross is identical. *Pinned by:*
  `JdbcBookingsDailyTakingsIT.noShowSweepDoesNotChangeTakings`
- [ ] **AC-7:** Given a swept `NO_SHOW` booking, when the guest calls `CancelBooking`, then the
  outcome is `NotCancellable` and no refund is issued. *Pinned by:*
  `CancelBookingIT.noShowIsNotCancellable`
- [ ] **AC-8:** Given a swept `NO_SHOW` booking, when an operator scans its code, then the result is
  `WrongServiceDate` carrying the booking date and the status stays `NO_SHOW`. *Pinned by:*
  `CheckInFlowIT.sweptNoShowScanNamesTheDate`
- [ ] **AC-9:** Given a washed-out **past** date whose bookings the sweep has marked `NO_SHOW`, when
  the admin runs the weather refund for that `(venue, date)`, then each is `CANCELLED` with a full
  refund and one `BookingCancelled` is published per booking. *Pinned by:*
  `WeatherRefundServiceIT.refundsSweptNoShowsOnAPastDate`
- [ ] **AC-10:** Given a past service date with a swept `NO_SHOW` booking, when the operator opens
  the console's Daily view for that date, then the arrivals list still lists the booking, carrying
  status `NO_SHOW`. *Pinned by:* `StaffBookingControllerIT.dailyViewListsSweptNoShows` and
  `daily-view-tab.spec.ts` ("renders a no-show arrivals row")
- [ ] **AC-11:** Given the committed scheduler configuration, when its `@Scheduled` defaults are
  read, then both the initial delay and the interval are ≥ 30 minutes and the trigger is
  `fixedDelay`, so no sweep can fire inside a suite's window. *Pinned by:*
  `NoShowSweepSchedulerConfigTest`

## Non-goals

- **No `no_show_at` column.** V37's reasoning applies verbatim: `DECLINED`/`EXPIRED`/`WITHDRAWN`
  stamp status alone. The business fact is "the service day passed" — already stored as
  `booking_date`; a sweep timestamp would only record when the scheduler happened to run.
- **No domain event.** Nothing accrues, nothing refunds (the `payout` accrual happened at
  `BookingConfirmed` and a no-show reverses nothing — invariant #9). Mirrors withdraw (#123) and
  check-in (#583), both deliberately silent.
- **No guest notification.** Mailing "you were marked a no-show" is a product decision nobody made.
- **`COMPLETED` is not weather-refundable.** The widening in AC-9 admits `CONFIRMED` + `NO_SHOW`
  only; a guest who checked in was demonstrably there.
- **No distributed lock.** Single-instance lockless posture is unchanged (improvement-plan D1/D3);
  the bulk guarded `UPDATE` makes a concurrent second runner a 0-row no-op.
- **Not re-opening the #566/#574 guest-cancel fence.** ADR-0005's 2026-08-08 amendment stands.

## Behavior-parity ledger

> This slice changes the meaning of an existing state (`CONFIRMED` stops being open-ended), so every
> surface reading it is an old surface being replaced. Filled per `riviera-plan-doc` §7.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `JdbcDailyTakings.grossOnlineTakings` sums `CONFIRMED` + `COMPLETED` for a date | **changed** | widens to `+ NO_SHOW`. A paid no-show is not refunded (invariant #10 — the window closed at 00:00 on the service date), so the venue's day must not shrink when the sweep runs (AC-6) |
| `findConfirmedForVenueOn` lists `CONFIRMED` + `COMPLETED` (arrivals) | **changed** | widens to `+ NO_SHOW`; without it a past day's arrivals list renders **empty** and the operator loses the record of who was booked. Row carries the status token instead of #583's `checkedIn` boolean (see FE↔BE contract) |
| `findConfirmedForWeatherRefund` lists `CONFIRMED` for a `(venue, date)` | **changed** | widens to `+ NO_SHOW`, and the transition moves to a new `cancelForWeather` admitting both. Preserves the past-date capability `WeatherRefundService` documents — a no-show on a washed-out day is precisely the guest who stayed home (Resolved Q-1) |
| `cancelConfirmed` guards `status = 'CONFIRMED'` (guest cancel **and** weather) | **preserved** for guest cancel | stays `CONFIRMED`-only; the weather path moves to its own `cancelForWeather`, so a `NO_SHOW` never becomes guest-cancellable (AC-7) |
| `CheckInService.classify` answers `WrongServiceDate` for a `CONFIRMED` code scanned off-date | **preserved** | a swept booking would otherwise fall to `default -> NotFound` ("no booking with that code at this venue"), which is false. Adds `case NO_SHOW -> WrongServiceDate` so the operator still gets the true message (AC-8) |
| `ViewBookingService.cancellable` requires `CONFIRMED` | **preserved** | a `NO_SHOW` is not `CONFIRMED`, so the code-gated view already renders it non-cancellable with no change |
| Tourist views render the status chip from `STATUS_META` | **preserved** | `NO_SHOW` already has a label, chip and contrast test (`booking-status.ts:43`, `status-chip.ts:16`) and `my-bookings.ts:37` already reads "Marked as no-show" — the FE was built for this state; AC #6 of the issue is pre-satisfied |
| `JdbcGuestBookingHistory` / `JdbcBookingPresence` / `JdbcCustomerBookings` | **preserved** | all three are deliberately status-agnostic (retention basis, set presence, `everConfirmed` from `confirmed_at`) — verified, no change |
| `ViewBookingService.emailWithheld` requires `CONFIRMED` | **changed (accepted)** | a swept booking stops reporting the withheld-mail flag. The flag tells a guest their *confirmation* mail was suppressed; on a past, undelivered stay it is moot |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The sweep fires **during** an integration test and flips a fixture's `CONFIRMED` booking to `NO_SHOW`, causing intermittent full-suite-only failures (case history #98/#122) | med | high | `initialDelay` **and** interval default to `PT1H`; `NoShowSweepSchedulerConfigTest` pins a 30-minute floor on both; ITs call `MarkNoShows#sweep` directly, never wait for the scheduler | this slice | closed — `2f28bb1` |
| R-2 | A widened read is missed, so a past day's money or arrivals silently change when the sweep runs | med | high | The `CONFIRMED` predicate audit is enumerated in the Behavior-parity ledger — every site in `platform/src/main` is listed with a verdict; AC-6/AC-9/AC-10 pin the three that widen | this slice | open |
| R-3 | Past-date weather refunds silently become impossible once the sweep runs | high | high | Caught at the intake grill **before** planning; resolved by widening the weather path to `NO_SHOW` (Resolved Q-1), pinned by AC-9 | this slice | open |
| R-4 | `V41` collides with a parallel slice's migration | low | med | Verified free: `V40` is the max on `main` and the only open PRs are dependabot bumps (no migrations). Default renumbering rule: whoever merges second | this slice | open |
| R-5 | The bulk `UPDATE` runs unbounded on the scheduler thread and holds a connection | low | med | Uses the existing bounded `sweepJdbc` client (`riviera.scheduled.query-timeout-seconds`), same as the other two sweeps' reads; `V41`'s partial index keeps the candidate set a range scan | this slice | open |
| R-6 | Widening `cancelForWeather` to `NO_SHOW` lets a *second* weather run double-refund | low | high | The guarded `UPDATE … RETURNING` makes the losing run a 0-row no-op — the row is `CANCELLED` after the first, and `CANCELLED` is in neither admitted status; unchanged from today's exactly-once argument (invariant #9) | this slice | open |
| R-7 | The `DailyBookingView` wire shape changes (`checkedIn` → `status`), breaking a cached FE bundle | low | low | Backend and SPA ship in one image, same-origin (#110) — they cannot skew in prod. `metaFor()` already degrades gracefully on an unknown token | this slice | open |

## Open questions / Assumptions

- **Assumption:** A no-show's `payout` accrual stands — the venue held the set and keeps the money,
  so nothing reverses. *Owner:* this slice · *Resolves by:* phase 1 (AC-6 proves the money facts are
  unchanged; `payout` has no listener to add because no event is published).

### Resolved

- **Q-1 (escalated at the intake grill, answered by the maintainer 2026-08-09):** Issue #584's AC #5
  says a `NO_SHOW` is "not weather-refundable", but `WeatherRefundService`'s Javadoc explicitly
  documents — and `WeatherRefundServiceIT.fullRefundRegardlessOfCutoff` pins — that an operator
  **may** weather-refund a **past** date, because "the storm is only known afterwards". Since the
  sweep turns every past `CONFIRMED` row into `NO_SHOW` within an hour of midnight, keeping AC #5
  literally would have narrowed weather refunds to same-day-only, silently. **Outcome:** widen the
  weather-refund read and transition to `CONFIRMED` + `NO_SHOW`; AC #5 of the issue is amended to
  "not *guest*-cancellable, not check-in-able" and the admin weather path is the one exception.
  Rationale: a no-show on a washed-out day *is* the guest who stayed home because of the storm.
- **Q-2 (same grill, answered by the maintainer 2026-08-09):** the arrivals list would render empty
  for a swept past date. **Outcome:** widen `findConfirmedForVenueOn` to include `NO_SHOW` and carry
  the **status token** rather than adding a second boolean beside #583's `checkedIn` (two booleans
  can represent an impossible state; the FE already owns a `NO_SHOW` chip).
- **Q-3 (settled from the code, no escalation needed):** profile guard? **No.**
  `AbandonedBookingScheduler` is `@Profile("stripe")` because nothing lingers in `AWAITING_PAYMENT`
  under the stub profile — a payment-specific reason. Bookings reach `CONFIRMED` under *both*
  profiles, so the sweep has work in both; it follows `RequestSweepScheduler` (ungated), and
  `@EnableScheduling` is already global via `BookingRequestConfig`.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** **none — this slice adds no availability
  write at all.** That is the section's whole content and it is deliberate: the two existing sweeps
  *release* the claim because their bookings never delivered (an unpaid hold, an unanswered request),
  freeing the set for someone else. A no-show's set **was** sold and held for a date now in the past;
  releasing it would rewrite history and, worse, make a past `(set, date)` re-claimable. The row
  stays exactly as the booking left it.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` from V4 still holds; nothing
  in this slice inserts or deletes an availability row.
- **Concurrency strategy:** a single **bulk guarded `UPDATE`**:
  `UPDATE booking SET status='NO_SHOW' WHERE status='CONFIRMED' AND booking_date < :today`. The
  `status='CONFIRMED'` predicate is the guard — Postgres row locks serialize any concurrent writer,
  and whichever loses re-evaluates the predicate against committed state and matches 0 rows. So a
  second scheduler instance, a concurrent guest cancel, and a concurrent check-in are each a no-op
  against the sweep rather than a lost update. This also delivers AC-4 (idempotence) for free.
- **Pool rule (invariant #3):** N/A — the sweep neither creates bookings nor reads the pool flag.
- **Cutoff rule (invariant #4):** the sweep's boundary is the same instant invariant #4/#10 use —
  `00:00 Europe/Tirane` on the service date — computed as `LocalDate.ofInstant(clock.instant(),
  TIRANE)` and applied as `booking_date < today`. Never the JVM default zone (invariant #6).
- **Pinning test:** `NoShowSweepIT.concurrentSweepsYieldExactlyOneTransition` — a check-in and
  the sweep racing the same past-dated row end with exactly one transition applied, never both.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | The sweep is a `Booking` lifecycle transition; `booking` owns the lifecycle and is the only writer of `booking.status` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | **none added** | — | — |

`booking.api.DailyTakings` is **unchanged in signature** — only the SQL behind
`JdbcDailyTakings` widens, so `payout` (its one consumer) needs no change and no new grant.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | structural, not a test: `NoShowSweepService` takes no `ApplicationEventPublisher`, so publishing one would not compile |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Mark past unchecked-in bookings `NO_SHOW` | `booking` | `booking` Job: owns "bookings, booking codes, lifecycle (…no-show…)" and is the sole writer of `booking.status`. Not on any other module's list; `availability`'s Not-My-Job explicitly rejects booking lifecycle |
| Widen the daily-takings aggregation to `NO_SHOW` | `booking` | `booking` owns the read behind `booking.api.DailyTakings`; `payout` Job is the *ledger*, and its Not-My-Job rejects reading booking rows directly — it consumes the port, which is why no `payout` change is needed |
| Weather refund admits `NO_SHOW` | `booking` | `booking` Job: owns the refund **decision** (which bookings and how much); `payment`'s Not-My-Job is "deciding whether/how much to refund → `booking`". Execution stays in `payment` via the unchanged `RefundPort` |
| Arrivals list carries the status token | `booking` | Same read, same owner; the DTO is `booking`'s own `adapter/in` shape |

All four sit inside `booking`; **no boundary change, no new published surface, no new grant.**

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** unchanged — the sweep never confirms anything; it only reads a status
  the verified webhook already wrote (invariant #8).
- **Idempotency:** the sweep itself takes no money action. The one money path it *widens* — the
  weather refund — keeps today's exactly-once argument: the guarded `UPDATE … RETURNING` yields
  facts only on a real transition, so `BookingCancelled` is published at most once per booking and
  `BookingRefundListener` issues one idempotency-keyed refund.
- **Money:** integer minor units, EUR (invariant #5). No arithmetic is added by this slice — the
  takings change is a widened `WHERE`, not a new computation.
- **Payout-ledger effect:** **none from the sweep.** The accrual was posted at `BookingConfirmed`
  and a no-show reverses nothing — the venue held the set and keeps the money (invariant #9). A
  weather refund on a swept `NO_SHOW` reverses exactly as it does today, through the existing
  `BookingCancelled` → `payout` listener; no new listener, no double-accrual surface.
- **Refund policy applied:** unchanged for the guest (invariant #10 — the window closed at 00:00 on
  the service date, so a no-show is non-refundable). The **weather-admin** exception stays
  deliberately outside that fence and now reaches swept rows too.
- **Pinning tests:** `WeatherRefundServiceIT.refundsSweptNoShowsOnAPastDate` (AC-9),
  `JdbcBookingsDailyTakingsIT.noShowSweepDoesNotChangeTakings` (AC-6),
  `CancelBookingIT.noShowIsNotCancellable` (AC-7).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.model.ts` | existing | interface | — (type only) | — |
| FE-2 | `operator/operator-console.service.ts` | existing | service | signals / RxJS | — |
| FE-3 | `operator/daily-view-tab.ts` + `.html` | existing | standalone component | signals + `computed` | — |

`shared/booking-status.ts` is **not** touched — `NO_SHOW` already has its `STATUS_META` row and
`status-chip.ts` already has its contrast-tested Tailwind classes. FE-3 reuses `metaFor(status)`
rather than growing a second boolean branch.

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
`NgOptimizedImage` for new images. No deviation expected.

## FE↔BE contract

- **New/changed endpoints:** no new endpoint. `GET /api/venues/{venueId}/bookings?date=` changes one
  field of its row shape: `DailyBookingView(long setId, String code, boolean checkedIn)` →
  `DailyBookingView(long setId, String code, String status)`, where `status` is the
  `BookingStatus` token (`CONFIRMED` | `COMPLETED` | `NO_SHOW`).
- **Client typing:** `ConsoleDailyBooking.checkedIn: boolean` → `status: BookingStatus`, the union
  already exported from `shared/booking-status.ts`. Hand-written typed service, no `as any`.
- **Money/date on the wire:** unchanged — no amount or date shape changes in this slice.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `implement (phase 6)`

**Next action:** Phase 6 — docs sweep (`riviera-docs-freshness` over the branch range), then
mark the PR ready for review.
`findConfirmedForVenueOn` to carry the status token (AC-10, backend half).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Sweep core (port, service, JDBC bulk update, V41 index) | ✅ | `0a9fdde` |
| 1 — Read audit: takings + arrivals widening | ✅ | `996a27b` |
| 2 — Terminal-state guards (cancel, check-in classify) | ✅ | `025c5cf` |
| 3 — Weather-refund widening (`cancelForWeather`) | ✅ | `bc77276` |
| 4 — Scheduler + config pinning test | ✅ | `2f28bb1` |
| 5 — Frontend: status token + no-show arrivals row + e2e | ✅ | `204ae7c` |
| 6 — Docs sweep + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/resources/db/migration/V41__booking_confirmed_service_day_index.sql` — the
  partial sweep index
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/MarkNoShows.java` — the
  sweep's driving port
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/NoShowSweepService.java` —
  the use case
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — adds
  `markPastConfirmedAsNoShow` + `cancelForWeather`; widens `findConfirmedForVenueOn` /
  `findConfirmedForWeatherRefund` docs
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — the bulk
  guarded UPDATE on `sweepJdbc`, the widened reads, `cancelForWeather`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcDailyTakings.java` — widen to
  `NO_SHOW`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/NoShowSweepScheduler.java` — the
  scheduled driving adapter
- `platform/src/main/resources/application.properties` — scheduling pool 4 → 5, one thread per job
- `platform/src/test/java/ai/riviera/platform/ScheduledWorkArchitectureTest.java` — the fifth job
  joins the non-vacuity list
- `platform/src/main/java/ai/riviera/platform/booking/application/view/DailyBooking.java` — carry
  the status token
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ListDailyBookings.java` —
  the port contract for the widened arrivals read
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/DailyBookingView.java` — wire shape
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/StaffBookingController.java` —
  row mapping
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInService.java` —
  `NO_SHOW` → `WrongServiceDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundService.java` ·
  `RefundForWeather.java` · `RefundableBooking.java` — call `cancelForWeather`; the read is renamed
  `findConfirmedForWeatherRefund` → `findRefundableForWeather` now that it returns more than one status
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingStatus.java` — Javadoc: `NO_SHOW`
  is now written
- `platform/src/test/java/ai/riviera/platform/booking/NoShowSweepIT.java` — the sweep's ITs
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/NoShowSweepSchedulerConfigTest.java` —
  pins the initial-delay floor
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsDailyTakingsIT.java` —
  takings unchanged by the sweep
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` —
  the `Bookings` test fake gains the new method
- `platform/src/test/java/ai/riviera/platform/booking/CheckInFlowIT.java` ·
  `WeatherRefundServiceIT.java` · `StaffBookingControllerIT.java` ·
  `CancelBookingIT.java` — amended for the widened reads and the terminal-state guards
- `frontend/src/app/operator/operator-console.model.ts|.service.ts` — the status token
- `frontend/src/app/operator/daily-view-tab.ts|.html` — the no-show arrivals row
- `frontend/src/app/operator/daily-view-tab.spec.ts` — the no-show and no-badge specs
- `frontend/e2e/operator-daily.e2e.ts` — the mocked-suite spec for a swept past day
- `CONTEXT.md` · `RESPONSIBILITIES.md` · `CLAUDE.md` — docs sweep (phase 6)
- `docs/plans/no-show-sweep.md` — this plan

---

## Phase 0 — Sweep core

**Files:** Create `MarkNoShows.java`, `NoShowSweepService.java`, `V41__…sql`,
`NoShowSweepIT.java` · Modify `Bookings.java`, `JdbcBookings.java`

- [ ] **Step 1: Write the failing test** — `NoShowSweepIT` covering AC-1..AC-5 and the
  concurrency case, seeded through the existing booking IT fixtures against Testcontainers Postgres.
- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*NoShowSweepIT*"` → FAIL (`MarkNoShows` does not exist)
- [ ] **Step 3: Minimal implementation** — the port, the service (`Clock` → `LocalDate` in
  `Europe/Tirane`), the `sweepJdbc` bulk guarded UPDATE, and `V41`'s partial index.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*NoShowSweepIT*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — search every `status = 'CONFIRMED'` predicate; record
  the verdict per site against the Behavior-parity ledger (this seeds phases 1–3).
- [ ] **Step 6: Commit** — `git commit -m "Mark past unchecked-in bookings as no-shows (#584)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

> Phases 1–5 follow the same red-green shape, one behavior each, per the ledger rows above;
> phase 6 runs `riviera-docs-freshness` over the slice's range and writes the close-out.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5, concurrency:** `./gradlew test --tests "*NoShowSweepIT*"` → PASS
- [ ] **AC-6:** `./gradlew test --tests "*JdbcBookingsDailyTakingsIT*"` → PASS
- [ ] **AC-7:** `./gradlew test --tests "*CancelBookingIT*"` → PASS
- [ ] **AC-8:** `./gradlew test --tests "*CheckInFlowIT*"` → PASS
- [ ] **AC-9:** `./gradlew test --tests "*WeatherRefundServiceIT*"` → PASS
- [ ] **AC-10:** `./gradlew test --tests "*StaffBookingControllerIT*"` + `npm test` → PASS
- [ ] **AC-11:** `./gradlew test --tests "*NoShowSweepSchedulerConfigTest*"` → PASS

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
