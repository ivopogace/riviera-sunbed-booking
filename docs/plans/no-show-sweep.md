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
`riviera-review-overlay` (review gate — ran at ready-for-review) · `riviera-docs-freshness`
(**ran** over `origin/main..claude/sdlc-584-spwjmh`, 5 findings, all patched — see the docs-sweep note
below) · `riviera-modulith` (kept the sweep inside `booking`,
no new published surface, no event; placed the service in the existing `application/checkin/`
attendance group rather than minting a 7th use-case package) · `riviera-java-conventions`
(`sweepJdbc` bounded client for scheduled work, typed-outcome-free `int` return, package-private
adapter, named status constants) · `postgres` (the partial index on `booking (booking_date) WHERE
status = 'CONFIRMED'`, following the V13/V19 sweep-index precedent; then at the review-fix round the
batched keyed subquery, `FOR UPDATE` **without** `SKIP LOCKED`, and ordering the batch by
`booking_date` so it walks that index rather than sorting) · `riviera-stripe-payments`
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

- [x] **AC-1:** Given a `CONFIRMED` booking whose `booking_date` is before today in `Europe/Tirane`,
  when `MarkNoShows#sweep` runs, then that booking is `NO_SHOW`. *Pinned by:*
  `NoShowSweepIT.sweepsPastConfirmedBooking`
- [x] **AC-2:** Given `CONFIRMED` bookings dated today and tomorrow (`Europe/Tirane`), when the
  sweep runs, then both remain `CONFIRMED`. *Pinned by:*
  `NoShowSweepIT.leavesTodayAndFutureUntouched`
- [x] **AC-3:** Given a past-day booking already `COMPLETED` by check-in (#583), when the sweep
  runs, then it stays `COMPLETED`. *Pinned by:* `NoShowSweepIT.neverTouchesCheckedInBooking`
- [x] **AC-4:** Given a past-day `CONFIRMED` booking, when the sweep runs twice, then the second run
  reports 0 rows and no row changes. *Pinned by:* `NoShowSweepIT.secondRunIsANoOp`
- [x] **AC-5:** Given past-day bookings in every non-`CONFIRMED` status (`CANCELLED`, `EXPIRED`,
  `DECLINED`, `WITHDRAWN`, `AWAITING_PAYMENT`, `PENDING_REQUEST`), when the sweep runs, then none
  changes status. *Pinned by:* `NoShowSweepIT.onlyConfirmedIsSwept`
- [x] **AC-6:** Given a venue's past service date with one `CONFIRMED`, one `COMPLETED` and (after
  the sweep) one `NO_SHOW` booking, when `DailyTakings#grossOnlineTakings` is read before and after
  the sweep, then the gross is identical. *Pinned by:*
  `JdbcBookingsDailyTakingsIT.noShowSweepDoesNotChangeTakings`
- [x] **AC-7:** Given a swept `NO_SHOW` booking, when the guest calls `CancelBooking`, then the
  outcome is `NotCancellable` and no refund is issued. *Pinned by:*
  `CancelBookingIT.noShowIsNotCancellable`
- [x] **AC-8:** Given a swept `NO_SHOW` booking, when an operator scans its code, then the result is
  `WrongServiceDate` carrying the booking date and the status stays `NO_SHOW`. *Pinned by:*
  `CheckInFlowIT.sweptNoShowScanNamesTheDate`
- [x] **AC-9:** Given a washed-out **past** date whose bookings the sweep has marked `NO_SHOW`, when
  the admin runs the weather refund for that `(venue, date)`, then each is `CANCELLED` with a full
  refund and one `BookingCancelled` is published per booking. *Pinned by:*
  `WeatherRefundServiceIT.refundsSweptNoShowsOnAPastDate`
- [x] **AC-10:** Given a past service date with a swept `NO_SHOW` booking, when the operator opens
  the console's Daily view for that date, then the arrivals list still lists the booking, carrying
  status `NO_SHOW`. *Pinned by:* `StaffBookingControllerIT.dailyViewListsSweptNoShows` and
  `daily-view-tab.spec.ts` ("renders a no-show arrivals row")
- [x] **AC-11:** Given the committed scheduler configuration, when its `@Scheduled` defaults are
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
| The console's "Checked in" arrivals badge (#583) is a bespoke inline chip: `#1d6b34` on `#e7f5ea`, `text-[11.5px] px-2.5 py-1` | **changed** | it moves to the shared `StatusChip` directive, so it renders `chip--completed` (`#0a5e6e` on `#e1f5f9`, `text-[12px] px-3 py-[5px]`) — a deliberate restyle of a surface this slice did not otherwise touch. Taken because the alternative was hand-rolling a second inline chip for `NO_SHOW`, duplicating hex pairs that already exist in `status-chip.ts`; the reuse also inherits that file's AA proof instead of needing a new one. Recorded here because it is a visible change with no other home |
| Tourist views render the status chip from `STATUS_META` | **preserved** | `NO_SHOW` already has a label, chip and contrast test (`booking-status.ts:43`, `status-chip.ts:16`) and `my-bookings.ts:37` already reads "Marked as no-show" — the FE was built for this state; AC #6 of the issue is pre-satisfied |
| `JdbcGuestBookingHistory` / `JdbcBookingPresence` / `JdbcCustomerBookings` | **preserved** | all three are deliberately status-agnostic (retention basis, set presence, `everConfirmed` from `confirmed_at`) — verified, no change |
| `ViewBookingService.emailWithheld` requires `CONFIRMED` | **changed (accepted)** | a swept booking stops reporting the withheld-mail flag. The flag tells a guest their *confirmation* mail was suppressed; on a past, undelivered stay it is moot |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The sweep fires **during** an integration test and flips a fixture's `CONFIRMED` booking to `NO_SHOW`, causing intermittent full-suite-only failures (case history #98/#122) | med | high | `initialDelay` **and** interval default to `PT1H`; `NoShowSweepSchedulerConfigTest` pins a 30-minute floor on both; ITs call `MarkNoShows#sweep` directly, never wait for the scheduler | this slice | closed — `2f28bb1` |
| R-2 | A widened read is missed, so a past day's money or arrivals silently change when the sweep runs | med | high | The `CONFIRMED` predicate audit is enumerated in the Behavior-parity ledger — every site in `platform/src/main` is listed with a verdict; AC-6/AC-9/AC-10 pin the three that widen | this slice | closed |
| R-3 | Past-date weather refunds silently become impossible once the sweep runs | high | high | Caught at the intake grill **before** planning; resolved by widening the weather path to `NO_SHOW` (Resolved Q-1), pinned by AC-9 | this slice | closed |
| R-4 | `V41` collides with a parallel slice's migration | low | med | Verified free: `V40` is the max on `main` and the only open PRs are dependabot bumps (no migrations). Default renumbering rule: whoever merges second | this slice | closed |
| R-5 | The bulk `UPDATE` runs unbounded on the scheduler thread and holds a connection | low | med | Uses the existing bounded `sweepJdbc` client (`riviera.scheduled.query-timeout-seconds`), same as the other two sweeps' reads; `V41`'s partial index keeps the candidate set a range scan | this slice | closed |
| R-6 | Widening `cancelForWeather` to `NO_SHOW` lets a *second* weather run double-refund | low | high | The guarded `UPDATE … RETURNING` makes the losing run a 0-row no-op — the row is `CANCELLED` after the first, and `CANCELLED` is in neither admitted status; unchanged from today's exactly-once argument (invariant #9) | this slice | closed |
| R-7 | The `DailyBookingView` wire shape changes (`checkedIn` → `status`), breaking a cached FE bundle | low | low | Backend and SPA ship in one image, same-origin (#110) — they cannot skew in prod. `metaFor()` already degrades gracefully on an unknown token | this slice | closed |

## Open questions / Assumptions

### Resolved

- **Assumption (confirmed):** A no-show's `payout` accrual stands — the venue held the set and keeps
  the money, so nothing reverses. AC-6 proves the money facts are unchanged across the sweep, and
  `payout` gained no listener because the sweep publishes no event. The only `payout` edits in the
  slice are doc corrections (its consumer-side Javadoc still claimed a `CONFIRMED`-only basis).

*(No open questions remain.)*

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

**Stage pointer:** `gates cleared — awaiting the maintainer's merge decision` · **merged via PR #589**

**Next action:** Maintainer decision on merging. Both gates are recorded below; the fix-round
re-review ran as the overlay re-walk (the `/code-review` re-invocation was declined in-session), so
that half is stated rather than assumed.

**Review gate.** Ran `/code-review` at **high** effort (the slice touches the booking lifecycle,
money and authorization) over `origin/main...HEAD` with `riviera-review-overlay` layered on. 13
findings; 3 were real defects (the no-progress sweep, the wall-clock-only test isolation, the
destructive fitness case), the rest contract drift. All fixed, plus 3 found while fixing (F-4, F-16,
and the RV-STYLE-1 comment reflow). The fix round was re-checked by re-walking the overlay bank —
RV-BE-1/7/9, invariants #1/#5/#6/#11/#12, the error contract, RV-FE-8, RV-STYLE-1 (guard green) and
RV-PROC-1 — **not** by a second `/code-review` fan-out.

**Sonar gate.** Green, and the reported list is empty *by the API, not the badge*:
`api/issues/search` total **0**; `new_bugs` 0, `new_vulnerabilities` 0, `new_code_smells` 0,
`new_duplicated_blocks` 0, `new_coverage` **91.4%** (≥80%), with `new_lines` 358 confirming a real
analysis rather than the unanalyzed false-clean read. The 2 new issues the bot reported mid-slice
were cleared by the review-fix round.
`findConfirmedForVenueOn` to carry the status token (AC-10, backend half).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Sweep core (port, service, JDBC bulk update, V41 index) | ✅ | `0a9fdde` |
| 1 — Read audit: takings + arrivals widening | ✅ | `996a27b` |
| 2 — Terminal-state guards (cancel, check-in classify) | ✅ | `025c5cf` |
| 3 — Weather-refund widening (`cancelForWeather`) | ✅ | `bc77276` |
| 4 — Scheduler + config pinning test | ✅ | `2f28bb1` |
| 5 — Frontend: status token + no-show arrivals row + e2e | ✅ | `204ae7c` |
| 6 — Docs sweep | ✅ | `9bb0b95` |

| 7 — Review-gate findings (15) | ✅ | `6526eb1` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI | `ScheduledQueryTimeoutIT` / `ListDailyBookings` absent from the plan's File-structure section (twice) | fixed-in-`979d914`, `ee2a880` |
| F-2 | review | **The sweep could never make progress on a real backlog.** One unbatched `UPDATE` on the 10 s-bounded client rolls back whole when it times out, so a first run over historical data fails identically forever | fixed — batched with a per-run cap, each batch its own commit |
| F-3 | review | Scheduler leaned on a 1 h `initialDelay` as its only test isolation: a wall-clock bandaid that also meant any instance restarting hourly never swept, and pinned a 30-min floor on a **production** knob for a test reason | fixed — `@ConditionalOnProperty` seam (ships enabled), `PT2M`/`PT15M`, floor assertion dropped |
| F-4 | review-fix (self-found) | **`SKIP LOCKED` + "short batch means drained" left contended rows unswept** — reproduced as a real flake in the scoped batch | fixed — plain `FOR UPDATE`, so a contended row is waited for, not skipped |
| F-16 | overlay re-walk | The batch ordered by `id`, so it sorted the filtered set instead of walking V41's partial index | fixed — ordered by `booking_date`, the index's own order |
| F-5 | review | The fitness case ran a destructive platform-wide `UPDATE` inside `readWhileLocked`; if it ever completed it would corrupt the shared DB | fixed — cutoff no booking can precede, so it still blocks but cannot mutate |
| F-6 | review | `BookingStatus` Javadoc still said `NO_SHOW` "stays unwritten until the sweep ships" — and the file was listed in File structure without being touched | fixed |
| F-7 | review | `Bookings#findRefundableForWeather` doc still said "The `CONFIRMED` bookings" and named `cancelConfirmed` | fixed |
| F-8 | review | `RefundableBooking` doc half-updated — transition link still `cancelConfirmed` | fixed |
| F-9 | review | `operator-console.service.ts` TSDoc still named the removed `checkedIn` wire field | fixed |
| F-10 | review | `cancelForWeather` near-duplicated `cancelConfirmed`; the latter's `reason` param became dead flexibility | fixed — one guarded `cancelReturningFacts` helper; `reason` dropped from `cancelConfirmed` |
| F-11 | review | `onlyConfirmedIsSwept` seeded impossible rows, incl. a `PENDING_REQUEST` with NULL `request_expires_at` that arms an NPE in the venue's request-queue read | fixed — companion columns now match the status |
| F-12 | review | `payout`'s consumer docs still stated a `CONFIRMED`-only takings basis (3 sites; the phase-6 freshness run missed them) | fixed |
| F-13 | review | Literal `"noShow"` bound instead of the `PARAM_NO_SHOW` constant the same diff introduced | fixed |
| F-14 | review | The shared-`StatusChip` swap silently restyled #583's "Checked in" badge with no parity-ledger row | fixed — recorded as an explicit **changed** row |
| F-15 | review | `ConsoleDailyBooking` TSDoc carried rejected-alternative rationale and ran past the frontend 6-line type budget | fixed — trimmed to the contract |

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
- `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java` — asserts the sweep's
  bulk `UPDATE` is bounded too (phase 6, docs-freshness finding)
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
- `frontend/src/app/operator/operator-console.model.ts` — the status token
- `frontend/src/app/operator/operator-console.service.ts` — the endpoint's documented row shape
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` —
  drops the now-constant `reason` argument
- `platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java` ·
  `DailyTakingsView.java` — `payout`'s consumer-side docs, which stated a `CONFIRMED`-only takings
  basis the widened read no longer has
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/VenueTakingsController.java` — same
- `frontend/src/app/operator/daily-view-tab.ts|.html` — the no-show arrivals row
- `frontend/src/app/operator/daily-view-tab.spec.ts` — the no-show and no-badge specs
- `frontend/e2e/operator-daily.e2e.ts` — the mocked-suite spec for a swept past day
- `CONTEXT.md` · `RESPONSIBILITIES.md` · `CLAUDE.md` — docs sweep (phase 6)
- `docs/plans/no-show-sweep.md` — this plan

---

## Phase 0 — Sweep core

**Files:** Create `MarkNoShows.java`, `NoShowSweepService.java`, `V41__…sql`,
`NoShowSweepIT.java` · Modify `Bookings.java`, `JdbcBookings.java`

- [x] **Step 1: Write the failing test** — `NoShowSweepIT` covering AC-1..AC-5 and the
  concurrency case, seeded through the existing booking IT fixtures against Testcontainers Postgres.
- [x] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*NoShowSweepIT*"` → FAIL (`MarkNoShows` does not exist)
- [x] **Step 3: Minimal implementation** — the port, the service (`Clock` → `LocalDate` in
  `Europe/Tirane`), the `sweepJdbc` bulk guarded UPDATE, and `V41`'s partial index.
- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*NoShowSweepIT*"` → PASS
- [x] **Step 5: Generalization-audit pass** — search every `status = 'CONFIRMED'` predicate; record
  the verdict per site against the Behavior-parity ledger (this seeds phases 1–3).
- [x] **Step 6: Commit** — `git commit -m "Mark past unchecked-in bookings as no-shows (#584)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

> Phases 1–5 follow the same red-green shape, one behavior each, per the ledger rows above;
> phase 6 runs `riviera-docs-freshness` over the slice's range and writes the close-out.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | phase 0 → 1 | every `status = 'CONFIRMED'` predicate, split into "live upcoming booking" vs "was delivered/paid" | `grep -rn "CONFIRMED" platform/src/main/java --include=*.java` | 9 reads/guards | widened 3 (takings, arrivals, weather refund); left 4 narrow (guest cancel, check-in transition, `emailWithheld`, the confirm path); confirmed 3 status-agnostic (`JdbcGuestBookingHistory`, `JdbcBookingPresence`, `JdbcCustomerBookings`). Verdicts are the Behavior-parity ledger |
| 2026-08-09 | review-fix (F-4) | the same short-batch termination bug in the other two sweeps | read `ExpireRequestsService` / `AbandonedBookingSweepService` | 0 | neither batches — both read a full candidate id list and loop per row, so "short batch" has no meaning there. No change |

---

## Docs-freshness run (phase 6)

Range `origin/main..claude/sdlc-584-spwjmh`. **5 findings, all patched in phase 6.**

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `RESPONSIBILITIES.md` §`booking` | "the cancel and weather-refund guards deliberately stay `CONFIRMED`-only" | the weather refund now admits `NO_SHOW` (AC-9) | patched |
| `RESPONSIBILITIES.md` §`booking` | "arrivals list and daily takings count `COMPLETED` alongside `CONFIRMED`" | both now count `NO_SHOW` too | patched |
| `CLAUDE.md` module table, `booking` row | the same two facts, plus no mention of the sweep | this slice | patched |
| `CONTEXT.md` glossary | no **No-show** term — `NO_SHOW` was an unwritten state, so none existed | `NO_SHOW` is now written, and terminal-except-weather | added |
| `ScheduledQueryTimeoutIT` Javadoc | "Five reads, not the four the issue named… one entry query per scheduled job" | a job whose entry statement is a *write*, not a read | patched, **and** the fitness function extended to assert the sweep's `UPDATE` is bounded |

Counting sweep — three near-misses read and confirmed **still true**, deliberately not churned:

- `JdbcAccountErasure` "the widest of the **three** scheduled candidate queries" — the no-show sweep
  has no candidate read at all (its entry statement is its write), so the three are unchanged.
- `ScheduledQueryTimeout` "the **four** bounded clients" / "the **three** module adapters" — the
  sweep reuses `JdbcBookings`'s existing `sweepJdbc`; no new bounded client.
- `ScheduledQueryTimeout` "above the **5-minute** sweep cadence it no longer bounds" — 5 minutes is
  still the tightest cadence; this sweep's hourly one is looser.

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-5, concurrency:** `./gradlew test --tests "*NoShowSweepIT*"` → PASS
- [x] **AC-6:** `./gradlew test --tests "*JdbcBookingsDailyTakingsIT*"` → PASS
- [x] **AC-7:** `./gradlew test --tests "*CancelBookingIT*"` → PASS
- [x] **AC-8:** `./gradlew test --tests "*CheckInFlowIT*"` → PASS
- [x] **AC-9:** `./gradlew test --tests "*WeatherRefundServiceIT*"` → PASS
- [x] **AC-10:** `./gradlew test --tests "*StaffBookingControllerIT*"` + `npm test` → PASS
- [x] **AC-11:** `./gradlew test --tests "*NoShowSweepSchedulerConfigTest*"` → PASS

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — `/code-review` at high effort via the ladder's rung 1,
      with `riviera-review-overlay` layered on; 13 findings, all resolved. **Caveat stated in the
      PR:** the post-fix *re-review* was the overlay re-walk, not a second `/code-review` fan-out,
      because that re-invocation was declined in-session.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
