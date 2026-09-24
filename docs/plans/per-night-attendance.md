# Per-day attendance Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Attendance leaves `booking.status` for a `booking`-owned `booking_day` table (one row per
service day), so that every existing single-service day check-in, no-show and transition test passes unchanged
while a multi-day booking (inserted directly) can be checked in service day by service day and resolves to
its stay outcome only after its last service day.

**Architecture:** `booking.status` stays the contract state machine; `COMPLETED` / `NO_SHOW`
become *stay outcomes* written once, when the last service day resolves. Check-in stamps today's row
under a guarded `UPDATE … WHERE attended_at IS NULL AND missed_at IS NULL` and resolves the parent
in the same transaction when no later service day remains; the sweep marks past unattended service days missed
and resolves the parents whose last service day has passed, same batching, same scheduler. The service-day rows
are materialised by a row-level trigger on `booking` the moment a row becomes `CONFIRMED` — the
one place "written when the booking confirms" holds for the webhook confirm, the stub confirm and
every fixture that inserts a `CONFIRMED` row directly, which is what lets the existing ITs stay
the equivalence oracle without touching a fixture.

**Persistence:** JDBC only (invariant #1). New table `booking_day` + trigger + backfill in
`V60__booking_day.sql`; `booking` unchanged (`completed_at` re-read as "when the stay resolved as
`COMPLETED`").

**Source of intent:** GitHub issue #1200 (epic #1096); `docs/architecture/multi-night-stays.md`
§ D1, D2 and *Testing Decisions* Seam 1.

**Skills consulted:** `riviera-sdlc` (intake gate: no triggers in the tree, the transition-table
IT deletes fixtures so the child FK cascades, V41 argued against sweep timestamps → `completed_at`
is stamped on `COMPLETED` only) · `riviera-plan-doc` (forced the Module-ownership table and the
assumption register below) · `tdd` (tests written before each implementation at the named seams; Docker Hub's pull limit on `postgres:17` delayed the local IT runs, so the multi-day tests' red was by construction and their first observed run caught the one defect — the untyped `:at` inside a `CASE` — before CI did) ·
`riviera-review-overlay` (ran with `code-review:code-review` over `cf5e84bb..5e9c5b4b`; RV-PROC-1 caught the
`domain-modeling` omission, RV-PROC-2's sweeps found no stale citation; findings F-2..F-5) · `riviera-docs-freshness` (**ran** over `cf5e84bb..51ae8be3`: 2 findings — the flow's step 8 in
`RESPONSIBILITIES.md` and the design doc's "nothing here is built" status, both patched; ADR-0015's
"check-in fact" wording is a dated decision's rationale, left; the observability runbook's "the two
sweeps" predates this slice) ·
`riviera-local-debug` (JDK at `/opt/jdk-25`, scoped test classes only, Docker present) ·
`postgres` (composite PK as the uniqueness guard, partial index on unresolved service days, FK indexed by
the PK, `ON DELETE CASCADE` with the V28 child-record rationale) · `riviera-modulith` (no new
port or surface; `Bookings` stays internal; the structural net + `ResponsibilitiesArchitectureTests`
due) · `riviera-java-conventions` (outcomes as values, Javadoc as contract, named literals) ·
`grilling` (the issue's ACs cross-checked against the code — see *Open questions*) ·
`domain-modeling` (the owner corrected the unit's name from the design doc's *night* to the tree's existing *service day*; CONTEXT.md gains *Service day* and *Stay outcome*; *Check-in*, *No-show* and *Review
window* re-defined; the glossary names no table — RV-PROC-1 caught the omission at the review gate).

**Branch:** `claude/sdlc-1200-4r14la` (the cloud session's designated branch; stands in for
`feature/per-day-attendance`)

---

## Acceptance criteria (testable)

- [x] **AC-1 (equivalence):** Given the per-day implementation, when the existing check-in,
  no-show and transition-table suites run **unmodified**, then they pass. *Seam:* `CheckInBooking`,
  `MarkNoShows`, `Bookings#completeConfirmed` / `#markPastConfirmedAsNoShow` · *Pinned by:*
  `CheckInFlowIT`, `CheckInConcurrencyIT`, `NoShowSweepIT`, `JdbcBookingTransitionTableIT`,
  `StaffBookingControllerIT`, `WeatherRefundServiceIT`, `JdbcCompletedStaysIT`,
  `ScheduledQueryTimeoutIT`, `BookingMigrationIT` (existing methods) — all unchanged in the diff.
- [x] **AC-2:** Given a `CONFIRMED` booking with service days D, D+1, D+2 (rows inserted directly), when
  it is checked in on D, then on D+1, then on D+2, then each scan is `CheckedIn`, the booking stays
  `CONFIRMED` after D and D+1 and becomes `COMPLETED` with `completed_at` stamped after D+2.
  *Seam:* `Bookings#completeConfirmed` (the date is a parameter) · *Pinned by:*
  `MultiDayAttendanceIT.eachServiceDayIsCheckedInOnceAndTheLastResolvesTheStay`
- [x] **AC-3:** Given a `CONFIRMED` stay spanning yesterday..tomorrow whose yesterday is attended,
  when staff scan it today twice, then the first answers `CheckedIn` and the second
  `AlreadyCheckedIn`, and the booking stays `CONFIRMED`. *Seam:* `CheckInBooking#checkIn` ·
  *Pinned by:* `MultiDayAttendanceIT.secondScanOnTheSameDayAnswersAlreadyCheckedIn`
- [x] **AC-4:** Given a stay with service days D..D+2 whose D is attended, when the sweep runs with today
  = D+2, then D+1 is missed and the booking is still `CONFIRMED`; when it runs with today = D+3,
  then D+2 is missed and the booking is `COMPLETED`. *Seam:* `Bookings#markPastConfirmedAsNoShow`
  · *Pinned by:* `MultiDayAttendanceIT.partlyAttendedStayResolvesOnlyAfterItsLastDay`
- [x] **AC-5:** Given a stay whose first service day is attended and whose remaining service days are all in
  the past, when `MarkNoShows#sweep` runs, then every unattended service day is missed and the outcome is
  `COMPLETED`; given a stay with no attended service day, all past, then the outcome is `NO_SHOW` and
  `completed_at` stays null. *Seam:* `MarkNoShows#sweep` · *Pinned by:*
  `MultiDayAttendanceIT.guestWhoStopsTurningUpGetsMissedDaysAndCompletes`,
  `MultiDayAttendanceIT.stayNobodyAttendedResolvesToNoShow`
- [x] **AC-6:** Given V60, when a `CONFIRMED` booking is inserted (or an `AWAITING_PAYMENT` one
  confirmed), then exactly one `booking_day` row for `booking_date` exists; a second row for the
  same `(booking_id, service_date)` is refused; a row both attended and missed is refused; a non-confirmed
  insert yields no service day. *Seam:* the schema · *Pinned by:*
  `BookingMigrationIT.confirmedBookingCarriesOneServiceDayRow`,
  `BookingMigrationIT.serviceDayIsUniquePerBooking`, `BookingMigrationIT.serviceDayIsNeverBothAttendedAndMissed`
- [x] **AC-7:** Given the sole-writer rule for `booking_day`, when the production classes are
  scanned, then only `booking` references the table and the rogue fixture is rejected; the
  structural net passes. *Seam:* `ResponsibilitiesArchitectureTests` · *Pinned by:*
  `ResponsibilitiesArchitectureTests.bookingDayTableIsTouchedOnlyInsideTheBookingModule`
- [x] **AC-8:** Daily takings, `BookingStatus#canStillBeHonoured` and the weather refund's
  admitted statuses are byte-for-byte unchanged. *Seam:* `DailyTakings`, `BookingStatus`,
  `BookingTransition.WEATHER_REFUND` · *Pinned by:*
  `CheckInFlowIT.arrivalsAndTakingsCountCheckedInBookings`,
  `CheckInFlowIT.completedBookingIsNeitherCancellableNorWeatherRefundable`,
  `BookingTransitionTest` (unchanged), plus the diff touching none of the three.

## Non-goals

- `booking.last_date`, range reserve, N-service day claims (D3 — the next slice).
- Any tourist- or staff-facing change: the check-in response, the daily view and the review
  surfaces keep their shapes; a scan's `bookingDate` stays the booking's first service day.
- Per-day takings (D4), per-day weather refunds (D5), itinerary search (D7).
- A "not yet checked in today" staff read (story 31) — the rows now exist for it; the read is its
  own slice.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Check-in `CONFIRMED → COMPLETED` on the service date, exactly once | preserved | Stamps the service day; a single-service day booking's only service day is its last, so the parent resolves in the same transaction |
| Second scan → `ALREADY_CHECKED_IN` | preserved | `COMPLETED` still answers it; a `CONFIRMED` stay whose today-service day is attended answers it too |
| Wrong-day scan → `WRONG_SERVICE_DATE` naming the date | preserved | A `CONFIRMED` stay with no attended service day today; the date named is the first service day |
| Swept `NO_SHOW` scan → `WRONG_SERVICE_DATE` | preserved | unchanged classification |
| Sweep marks past `CONFIRMED` → `NO_SHOW`, batched, guarded, no availability write | preserved | Marks service days, then resolves the parents whose last service day passed; the count returned is bookings resolved |
| `completed_at` = the check-in instant | changed | = the instant the stay resolved `COMPLETED`; identical for every single-service-day row (backfill copies it) |
| `NO_SHOW` rows carry no timestamp on `booking` | preserved | the service-day row's `missed_at` carries the mark; `completed_at` stays null (V41's stance) |
| Review window opens at check-in | changed | opens at the stay outcome — the same instant for a single-service day stay; the latent first-morning defect for stays is gone |
| Fixture `DELETE FROM booking …` in ITs | preserved | `booking_day … ON DELETE CASCADE` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two concurrent scans both stamp today's row | low | high | Row lock on `booking_day`; the loser re-evaluates `attended_at IS NULL` after the lock and matches 0 rows | slice | closed — `CheckInConcurrencyIT` unchanged, green |
| R-2 | Two sweep runners resolve the same stay twice | low | high | Statement 2 keys on `status = 'CONFIRMED' … FOR UPDATE` (no `SKIP LOCKED`), the existing discipline | slice | closed — unchanged, green |
| R-3 | Backfill of legacy `COMPLETED` rows with a null `completed_at` (pre-V40) | medium | low | `attended_at = COALESCE(completed_at, end of the service day in Europe/Tirane)`; `NO_SHOW` → `missed_at` = end of the service day | slice | closed — V60 |
| R-4 | The trigger is a hidden write a reader of `JdbcBookings#confirm` cannot see | medium | medium | Named in the migration header, `Bookings#confirm` Javadoc, `RESPONSIBILITIES.md` §booking; pinned by `BookingMigrationIT` | slice | closed — flagged in the PR body for the owner |
| R-5 | Drain heuristic: service days marked hit the batch while bookings resolved do not → run stops early | low (service days == bookings until D3) | low | Each statement is its own port call and its own batch loop under the shared per-run cap (`NoShowSweepService.Backlog`); the review gate raised it twice (F-2) | slice | closed — F-2 |
| R-6 | Timezone: a service day is a `Europe/Tirane` civil day; `today` derived from the injected `Clock` (#6) | low | high | Unchanged derivation in `CheckInService` / `NoShowSweepService` | slice | closed |
| R-7 | Flyway `V60` collision | low | low | Free on `main` (V59 is the tip) and unclaimed by the open PRs (all dependabot). No V60 landed elsewhere | slice | closed |
| R-8 | The sweep's first statement no longer touches `booking` alone — the bounded-client timeout proof | low | medium | Both statements lock `booking`, so an `ACCESS EXCLUSIVE` lock on it still blocks and cancels them | slice | closed — `ScheduledQueryTimeoutIT` unchanged, green |
| R-9 | BOLA on check-in (#13) | low | high | `VenueOwnership#assertOwns` before any lookup, untouched; the guarded update still keys on `venue_id` | slice | closed — `CheckInFlowIT.foreignVenueCodeReadsAsNotFound` unchanged, green |
| R-10 | `ON DELETE CASCADE` deletes attendance history | low | low | No production path deletes a `booking` row (grep: none); only IT fixtures do | slice | closed |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the service-day rows are materialised by a trigger on `booking` rather than by an
  explicit `INSERT` after each confirm statement. Rationale: AC-1 demands the existing fixtures
  (direct `INSERT … 'CONFIRMED'`) stay the oracle; the trigger is the schema-level form of "written
  when the booking confirms", and D3 will only change its `generate_series`. The tree has no other
  trigger, so this is flagged for the owner in the PR. — decided in-slice, flagged in the PR body for the owner; merged via PR #1211
- **Assumption:** the stay outcome is `COMPLETED` iff at least one service day was attended, else
  `NO_SHOW`. — decided in-slice, flagged in the PR body for the owner; merged via PR #1211
- **Assumption:** `completed_at` is stamped only when the outcome is `COMPLETED` (the review
  window's input); a `NO_SHOW` resolution stamps the service day's `missed_at` and nothing on `booking`,
  keeping today's rows byte-identical and V41's "no sweep timestamp on `booking`" stance. — *Owner:*
  slice · *Resolves by:* PR review
- **Assumption:** the backfill covers every booking that ever confirmed
  (`confirmed_at IS NOT NULL OR status IN ('CONFIRMED','COMPLETED','NO_SHOW')`), so the trigger's
  rule and the backfill agree. — decided in-slice, flagged in the PR body for the owner; merged via PR #1211

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none — attendance never touches
  `set_availability`; the sweep still writes no availability row (a past claim stays claimed).
- **Uniqueness guarantee:** `booking_day PRIMARY KEY (booking_id, service_date)` — one attendance fact
  per service day; `set_availability UNIQUE (set_id, booking_date)` untouched.
- **Concurrency strategy:** guarded `UPDATE booking_day … WHERE attended_at IS NULL AND
  missed_at IS NULL RETURNING` for check-in; the sweep's keyed subquery `… LIMIT :batch FOR UPDATE`
  (no `SKIP LOCKED`) for both its statements, as today.
- **Pool rule (#3):** unaffected.
- **Cutoff rule (#4):** unaffected; the sweep's "past" is `service_date < today` in `Europe/Tirane`.
- **Pinning test:** `CheckInConcurrencyIT.concurrentScansYieldExactlyOneTransition`,
  `NoShowSweepIT.concurrentSweepsYieldExactlyOneTransition` (both unchanged).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `booking`, `booking_day` (new) | Attendance is a booking fact; the lifecycle it resolves is `booking`'s (§booking Job) |
| M-2 | `review` | existing | — | Javadoc only: `completedAt` reads "the instant the stay resolved"; the window rule is untouched |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | — | none added or changed | — | `CompletedStays` (review.spi) keeps its shape |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | none | check-in and the sweep publish nothing, as today | | | | |

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| `booking_day` table, its trigger and backfill | `booking` | §booking Job: "Own bookings, booking codes, and the lifecycle"; §availability's Not-My-Job rejects attendance on `set_availability` |
| Service day check-in + stay resolution on the last service day | `booking` | the guarded transition is §booking's check-in rule, re-scoped to a service day |
| Missed-service day marking + stay resolution by sweep | `booking` | §booking's no-show sweep, same batching, no new scheduler |
| Review window (60 days from `completedAt`) | `review` | unchanged; only the meaning of the instant it receives shifts |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope`: no money moves; the weather refund's `CONFIRMED|NO_SHOW` admission
and `DailyTakings` are unchanged (AC-8).

## Angular — frontend surfaces touched

`N/A — backend-only`

## FE↔BE contract

`N/A — no contract change`

## Execution status

**Stage pointer:** `DONE — merged via PR #1211`

**Next action:** none; the epic's checklist tick for D2 and the plan's retirement happen at the next close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Schema: `booking_day`, trigger, backfill | ✅ | PR #1211 |
| 1 — Check-in stamps the service day, resolves on the last; sole-writer rule 9 | ✅ | PR #1211 |
| 2 — Sweep marks service days, resolves due stays | ✅ | PR #1211 |
| 3 — Docs + close-out | ✅ | PR #1211 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | local IT run | `completed_at = CASE WHEN … THEN :at END` resolved the untyped parameter to text (`42804`) | fixed — `CAST(:at AS TIMESTAMPTZ)` |
| F-2 | review gate (history + prior-PR reviewers) | the sweep returned only the resolve count, so a full service day batch with no due stay read as "drained" | fixed — `markPastServiceDaysMissed` is its own port call and batch loop |
| F-3 | review gate (history reviewer) | the missed-day statement locked the service-day row, not the `booking` row its `status` predicate reads | fixed — the statement locks the live stays first (`FOR UPDATE` on `booking`), then marks their past service days: the booking-then-service days order every writer now shares |
| F-4 | review gate (prior-PR reviewer) | `MultiDayAttendanceIT` steps the sweep on a far-past date, the pattern `JdbcBookingTransitionTableIT` already carries | accepted: the class drains first, asserts its own stay's rows, and deletes its fixtures |
| F-6 | CI (`CancelBookingIT.noShowAnswersWindowClosedLikeAnUnsweptSpentDay`) | `ServiceDayBackdate` moved `booking_date` but not the service day the trigger wrote, so the sweep saw a service day still ahead | fixed — the helper moves the service day with the day |
| F-8 | owner (in session) | "night" is the hotel word; a set is booked for a service day and nobody sleeps on it | fixed — `booking_day(booking_id, service_date, …)`, glossary term *Service day*, the design doc's mechanism sections (D2–D6) reworded; its user stories keep "nights" until the range slice touches them |
| F-7 | Sonar (`java:S1192`) | the `"today"` parameter name repeated three times in `JdbcBookings` | fixed — `PARAM_TODAY` |
| F-5 | overlay RV-PROC-1 | `CONTEXT.md` edited without `domain-modeling` on the skills line; the *Service day* entry named a table | fixed — skill loaded, entry re-worded |

---

## File structure

- `platform/src/main/resources/db/migration/V60__booking_day.sql` — table, PK, CHECK, partial index, trigger + function, backfill
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — service day check-in + resolve; two-statement sweep; facts read with today's service day
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — contracts of `completeConfirmed`, `markPastConfirmedAsNoShow`, `findCheckInFacts`, `confirm*`
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInFacts.java` — `attendedToday`
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInService.java` — classification over the service day
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInBooking.java` — contract wording
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInResult.java` — contract wording
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CompletedCheckIn.java` — contract wording
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/MarkNoShows.java` — contract wording
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/NoShowSweepService.java` — contract wording
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingStatus.java` — Javadoc: outcomes
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingTransition.java` — Javadoc: CHECK_IN / SWEEP_NO_SHOW rows
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcCompletedStays.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/StaffBookingController.java` — Javadoc: the check-in stamps today
- `platform/src/main/java/ai/riviera/platform/review/spi/CompletedStays.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/CompletedStay.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewWindow.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewGate.java` — Javadoc
- `platform/src/test/java/ai/riviera/platform/booking/BookingMigrationIT.java` — V60 shape tests
- `platform/src/test/java/ai/riviera/platform/booking/MultiDayAttendanceIT.java` — AC-2..AC-5
- `platform/src/test/java/ai/riviera/platform/booking/ServiceDayBackdate.java` — the backdate helper carries the service-day row with the service day
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — fake `Bookings` signature
- `platform/src/test/java/ai/riviera/platform/ResponsibilitiesArchitectureTests.java` — rule 9
- `platform/src/test/java/ai/riviera/responsibilityfixture/booking/adapter/out/FixtureJdbcBookingDays.java` — the module's own SQL
- `platform/src/test/java/ai/riviera/responsibilityfixture/rogue/adapter/out/RogueBookingDayWriter.java` — the outside writer
- `RESPONSIBILITIES.md` — §booking check-in / sweep / sole-writer lines
- `CONTEXT.md` — Check-in, No-show, Service day, Review window
- `CLAUDE.md` — module table: `booking_day`
- `docs/architecture/domain-model.md` — schema listing + state notes
- `docs/architecture/multi-night-stays.md` — status line: D2 landed
- `docs/plans/per-day-attendance.md` — this plan

---

## Phase 0 — Schema: `booking_day`, trigger, backfill, sole-writer rule

**Files:** Create `V60__booking_day.sql` · Test `BookingMigrationIT` (rule 9 moved to phase 1:
its "the module itself writes the table" proof needs the adapter's SQL)

- [x] **Step 1: Write the failing tests** — `BookingMigrationIT.confirmedBookingCarriesOneServiceDayRow`
  (insert `CONFIRMED` → one row `(id, booking_date)`, unattended; insert `AWAITING_PAYMENT` → none;
  `UPDATE … status = 'CONFIRMED'` → one), `serviceDayIsUniquePerBooking`,
  `serviceDayIsNeverBothAttendedAndMissed`, `deletingABookingTakesItsServiceDays`.
- [x] **Step 2: Run, verify red** — run with V60 set aside; the run failed at context load
  (Docker Hub 429 on `postgres:17`), so the red is by construction (no `booking_day` relation),
  not observed. CI carries the first real run.
- [x] **Step 3: Minimal implementation** — V60.
- [x] **Step 4: Run, verify green** — `BookingMigrationIT` 11/11 locally once the image pulled.
- [x] **Step 5: Generalization-audit pass** — every IT that deletes `booking` rows
  (`grep -rn "DELETE FROM booking\b" platform/src/test`) keeps working via the cascade;
  `deletingABookingTakesItsServiceDays` pins it.
- [x] **Step 6: Commit** — `Per-day attendance: booking_day table, trigger and backfill (#1200)`
- [x] **Step 7: Update Execution status.**

## Phase 1 — Check-in stamps the service day, resolves on the last

**Files:** Modify `JdbcBookings` (`completeConfirmed`, `findCheckInFacts`), `Bookings`,
`CheckInFacts`, `CheckInService` · Test `MultiDayAttendanceIT` (AC-2, AC-3)

- [x] **Step 1: Failing tests** — AC-2 at `Bookings#completeConfirmed` stepping the date; AC-3 at
  `CheckInBooking#checkIn` with a stay spanning yesterday..tomorrow.
- [x] **Step 2: Red** — `./gradlew test --tests "*MultiDayAttendanceIT*"`.
- [x] **Step 3: Implementation** — service day update `RETURNING b.id, b.set_id, b.booking_date`, then
  the resolve statement when no later service day exists; `findCheckInFacts(code, venue, today)` with a
  `LEFT JOIN` on today's service day; classification `COMPLETED → AlreadyCheckedIn`, `CONFIRMED →
  attendedToday ? AlreadyCheckedIn : WrongServiceDate`, `NO_SHOW → WrongServiceDate`.
- [x] **Step 4: Green** — `MultiDayAttendanceIT`, `CheckInFlowIT`, `CheckInConcurrencyIT`,
  `JdbcBookingTransitionTableIT`, `StaffBookingControllerIT`.
- [x] **Step 6: Commit** — `Check-in stamps today's row and resolves the stay on its last service day (#1200)`

## Phase 2 — Sweep marks service days, resolves due stays

**Files:** Modify `JdbcBookings#markPastConfirmedAsNoShow`, `Bookings`, `MarkNoShows`,
`NoShowSweepService` · Test `MultiDayAttendanceIT` (AC-4, AC-5)

- [x] **Step 1: Failing tests** — AC-4 at `Bookings#markPastConfirmedAsNoShow` with explicit
  `today`; AC-5 at `MarkNoShows#sweep` with service days relative to today.
- [x] **Step 2: Red.**
- [x] **Step 3: Implementation** — statement 1 marks past unresolved service days of `CONFIRMED`
  bookings (keyed subquery, `LIMIT :batch FOR UPDATE OF n`); statement 2 resolves due bookings
  (`status = 'CONFIRMED' AND booking_date < today AND NOT EXISTS service_date >= today`, `LIMIT :batch FOR
  UPDATE`) via a data-modifying CTE that also marks their stragglers missed, outcome by
  `EXISTS attended`. Returns bookings resolved.
- [x] **Step 4: Green** — `MultiDayAttendanceIT`, `NoShowSweepIT`, `JdbcBookingTransitionTableIT`,
  `CheckInFlowIT`, `ScheduledQueryTimeoutIT`.
- [x] **Step 6: Commit** — `The no-show sweep marks missed service days and resolves stays whose last service day passed (#1200)`

## Phase 3 — Docs + close-out

- [x] `RESPONSIBILITIES.md` §booking, `CONTEXT.md`, `CLAUDE.md`, `domain-model.md`, review Javadoc;
  Execution status finalised in the PR's last code-touching commit.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-24 | FK from `booking_day` to `booking` | ITs that delete booking rows | `grep -rn "DELETE FROM booking\b" platform/src/test` | 7 | `ON DELETE CASCADE`; pinned by `BookingMigrationIT.deletingABookingTakesItsServiceDays` |
| 2026-09-24 | `findCheckInFacts` gains a parameter | implementers of `Bookings` | `grep -rln "implements Bookings" platform/src` | 2 (`JdbcBookings`, the fake in `CreateBookingServiceTest`) | both updated |
| 2026-09-24 | a fixture rewrites `booking_date` after confirm | tests updating `booking.booking_date` (production never does: `grep -rn "SET.*booking_date" platform/src/main` is empty) | `grep -rn "SET booking_date" platform/src/test` | 1 (`ServiceDayBackdate`) | the helper moves the service-day row too |
| 2026-09-24 | `completed_at` re-read as "stay resolved" | readers of `completed_at` | `grep -rn completed_at platform/src/main` | `JdbcCompletedStays`, `JdbcBookings` | Javadoc re-worded; SQL unchanged |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-8:** listed test classes green in CI on `024ef640` (backend job success, Testcontainers ITs `skipped=0`), Sonar 0 issues after F-7, 91.5% new-code coverage, 0 duplicated blocks.

## Self-review checklist

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [x] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [x] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [x] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [x] Flyway migration present; invariant-enforcing constraints tested (#12).
- [x] Frontend standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [x] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
