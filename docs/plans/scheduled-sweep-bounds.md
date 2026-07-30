# Bound the scheduled sweeps' queries (#395) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Make it impossible for one wedged database query to stall every scheduled job in the
platform — the four `@Scheduled` methods get **their own threads** (so a stuck job cannot delay a
sibling *while* it is stuck) **and** each job's entry query gets a **finite bound** (so a stuck job
eventually ends instead of pinning its thread and its pooled connection forever), with neither
instrument able to reach `availability`'s claim path.

**Architecture:** The single most significant decision is that this needs **two instruments, not
one, because the issue's ACs ask two different questions.** AC-2 ("`AbandonedBookingScheduler`
*keeps running* when an unrelated sweep's query is stuck") is a question about **thread isolation**
and a query timeout cannot answer it — during the timeout window the wedged job still owns the only
thread. AC-1 ("cannot *indefinitely* prevent") is a question about **boundedness** and a bigger pool
cannot answer it — it only raises the number of simultaneous wedges required. So: pool size ≥ the
number of `@Scheduled` methods (pinned by a fitness function, so a fifth job cannot silently
re-share), plus one opt-in `queryTimeout` property applied to each scheduled job's **entry query**
via an adapter-scoped `JdbcClient` — the #386 idiom, deliberately *not* the global
`spring.jdbc.template.query-timeout`. (The entry queries turned out to be **five**, not the four the
issue's per-job count implied — phase 1's generalization audit found the retention sweep asks two
questions before it writes.)

**Persistence:** JDBC only (invariant #1). **No migration, no schema change** — the slice changes
how existing statements *execute*, never their text. Tables read by the bounded queries: `booking`
(two sweep candidate reads), `customer` (retention candidate read), `event_publication` (the
outbox-backlog gauge).

**Source of intent:** GitHub issue **#395**, split out of `docs/plans/notification-hardening.md`
phase 3's generalization-audit log (#386).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the issue's
own risk table is wrong about `MoneyPathAlertCheck` "adding no query of its own", and that
`availability`'s claim is `INSERT … ON CONFLICT`, not `SELECT … FOR UPDATE`) · `riviera-plan-doc`
(this template — forced the Behavior-parity ledger question, which is what surfaced the
"unbounded writes stay unbounded" decision as an explicit *kept* behavior rather than an oversight)
· `tdd` (each phase red-first: the fitness function fails on the unset pool size, the timeout IT
hangs against an unbounded client, the isolation IT queues behind the wedge at pool size 1) ·
`riviera-review-overlay` (review gate — ran at the PR stage, see Findings register) ·
`riviera-docs-freshness` (**ran** over this slice's own range at merge close-out step 5 — see
Execution status) · `riviera-modulith` (placement: each module bounds its **own** adapter; the pool
size is app-level config in the root `application.properties` alongside `RateLimitFilter` /
`MoneyPathAlertCheck`, not a module concern — and no new `allowedDependencies` grant is needed
because nothing crosses a module boundary) · `riviera-java-conventions` (constructor injection into
`final` fields, package-private adapters, `@Value` default inlined as a constant like
`JdbcEmailSuppressions`) · `postgres` (lock semantics behind the test design: `ACCESS EXCLUSIVE`
blocks even a plain `SELECT`, which is what makes a *real* wedge reproducible; and the confirmation
that `INSERT … ON CONFLICT`'s loser waits on the winner's index tuple lock — the wait a global
timeout would abort) · `riviera-local-debug` (scoped `--tests` runs + the system-`gradle`/JDK-25
recipe; CI owns the full suite) · `riviera-stripe-payments` (`N/A — not loaded: no payment/payout
code, Stripe call, commission or ledger arithmetic is touched; the abandoned sweep's
`CancelPaymentPort` call is read-only context for the AC-2 test, not modified`) ·
`riviera-frontend` / `angular-developer` / `playwright-cli` (`N/A — backend-only slice, no
user-observable surface`)

**Branch:** `claude/sdlc-395-jwewxr` — *cloud-session substitution for `feature/scheduled-sweep-bounds`
(`riviera-sdlc` §Remote/cloud addendum): the session's designated remote branch stands in for the
`feature/<slug>` name; the literal branch is deliberately not created.*

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the `event_publication` table is held under an `ACCESS EXCLUSIVE` lock by an
  unrelated connection, when the outbox-backlog gauge read that `MoneyPathAlertCheck` performs is
  executed, then it **aborts with a `DataAccessException` within its configured bound** rather than
  blocking for as long as the lock is held. *Pinned by:*
  `ScheduledQueryTimeoutIT.aWedgedOutboxGaugeReadAbortsInsteadOfPinningTheSchedulerThread`
- [ ] **AC-2:** Given the table a scheduled job reads is held under an `ACCESS EXCLUSIVE` lock, when
  that job's entry query runs, then it aborts within its bound and surfaces the driver's cancel —
  for **all four** such queries: the abandoned-payment sweep's candidate read, the request-expiry
  sweep's candidate read, and **both** of the retention sweep's (its `customer` candidate read *and*
  its `booking` retention-basis read, the fifth query the issue's four-job count missed).
  *Pinned by:* `ScheduledQueryTimeoutIT.everyScheduledEntryQueryIsBounded`
- [ ] **AC-3:** Given one scheduled job is wedged on a locked table and is **still stuck** (its bound
  set far above the test's patience, so the wedge does not self-clear), when the abandoned-payment
  sweep is dispatched on the platform's real `TaskScheduler`, then it **completes** — expiring an
  `AWAITING_PAYMENT` booking and **deleting its `set_availability` row**, so the `(set, date)` is
  claimable again. *Pinned by:*
  `AbandonedSweepSurvivesWedgedJobIT.theAbandonedSweepStillReleasesItsClaimWhileAnotherJobIsWedged`
- [ ] **AC-4:** Given the committed configuration, when the fitness function counts every
  `@Scheduled` method on the production classpath, then `spring.task.scheduling.pool.size` is **at
  least** that count — so adding a fifth scheduled job without raising the pool **fails the build**.
  *Pinned by:* `ScheduledWorkArchitectureTest.everyScheduledJobHasAThreadOfItsOwn`
- [ ] **AC-5:** Given the whole repository's Spring configuration, when the fitness function scans
  every `application*.properties`, then **no** `spring.jdbc.template.query-timeout` is set anywhere —
  the instrument that would reach `availability`'s claim path cannot be introduced by accident.
  *Pinned by:* `ScheduledWorkArchitectureTest.noGlobalQueryTimeoutIsIntroduced`
- [ ] **AC-6:** Given two clients claiming the same `(set, date)` concurrently, when both submit,
  then exactly one wins — unchanged by this slice. *Pinned by:* the existing `ConcurrentReservationIT`,
  `ConcurrentClaimIT` and `StaffMarkVsOnlineClaimConcurrencyIT`, which must stay green **untouched**.

## Non-goals

- Retuning any sweep's interval, initial delay, or TTL (the issue's own out-of-scope list).
- The `availability` claim path itself — it is the thing being protected from the fix, not changed.
- Bounding the sweeps' **per-item writes** (the guarded `UPDATE … RETURNING`, and the
  `DELETE FROM set_availability` behind `AvailabilityClaim.release`). See the Behavior-parity ledger
  for why this is a decision and not an omission.
- Distributed locking / ShedLock for multi-instance scheduling (improvement-plan D3, unchanged).
- Making the retention sweep or the alert check *run* — their existing gates
  (`customer.retention.enabled`, `@Profile("stripe")`) are untouched.
- Migrating the scheduler to virtual threads (`spring.threads.virtual.enabled`) — a bigger,
  separate decision about the whole app, not a fix for this finding.

## Behavior-parity ledger (retirement / replacement slices only)

> This slice replaces no surface, but it *does* change the execution envelope of four existing
> queries — which is the same class of silent-drop risk the ledger exists to catch, so it is filled
> rather than waived.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Sweep candidate reads block indefinitely on a lock | **changed** | now abort after `riviera.scheduled.query-timeout-seconds`; the sweep run fails, is logged, and the next tick retries — every sweep is already idempotent and guarded per row |
| A failed sweep run leaves its work undone until the next tick | **preserved** | unchanged: `fixedDelay` scheduling, guarded per-row transitions, no partial state — an aborted candidate read simply selects nothing |
| Sweeps share one thread with each other | **changed** | each `@Scheduled` job now has a thread available to it (pool size ≥ job count); no job's schedule can be delayed by a sibling's stall |
| Sweeps' per-item **writes** are unbounded | **preserved — deliberately** | bounding them would put a timeout on the `DELETE FROM set_availability` that releases a claim and on the guarded `UPDATE … RETURNING`; those run on `booking`'s shared adapters and touch invariant #2's table, which is exactly the reach the issue forbids. With thread isolation, a wedge there costs only that sweep's own next run, and the item is retried |
| `MoneyPathAlertCheck` reads the outbox gauge on every tick | **preserved** | same read, same cadence — now bounded. The alert semantics do not change; a bounded read that aborts raises the exception the scheduler already logs |
| No global `spring.jdbc.template.query-timeout` | **preserved — and now machine-locked** | AC-5's fitness function fails the build if one is ever added |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The bound reaches `availability`'s claim and turns a legitimate contention wait into an abort (invariant #2) | low | **critical** | No global property (AC-5, machine-locked). `JdbcAvailabilityClaim` keeps the shared, unbounded `JdbcClient` — untouched by the diff. Bounded clients are constructed per adapter and used by **named methods only**. AC-6 keeps the three concurrency ITs green *without edits* | Claude | open |
| R-2 | Pool size and job count drift apart — a fifth `@Scheduled` job silently re-shares a thread | **high** (this is how the finding was born) | med | AC-4's fitness function counts `@Scheduled` methods on the production classpath and fails the build; non-vacuity guard names today's four so a broken scan cannot pass green | Claude | open |
| R-3 | The timeout is set too tight and a healthy sweep aborts on an ordinary slow tick | low | med | Default **10 s** against candidate reads that are index-served and complete in single-digit ms, on jobs that tick every 5 min — three orders of magnitude of headroom; overridable per environment | Claude | open |
| R-4 | The timeout IT is flaky in CI (it asserts an elapsed-time upper bound) | med | low | Mirror `SuppressionQueryTimeoutIT` exactly: a **real** `ACCESS EXCLUSIVE` lock (not a mocked slow query), a 1 s timeout, and a 15 s "must have aborted by" ceiling — a ~14 s margin, the shape already proven in CI since #386 | Claude | open |
| R-5 | The isolation IT races the real scheduler's tick and is nondeterministic | med | med | Do **not** wait for a tick: dispatch both tasks onto the autowired `TaskScheduler` bean explicitly. That still proves the property under test (the pool really has ≥ 2 usable threads) without depending on `fixedDelay` timing — the #98/#122 lesson about tests that lean on sweep cadence | Claude | open |
| R-6 | A shared `riviera.scheduled.*` property read from three modules reads as cross-module coupling at review | med | low | It is ops config, not a module dependency — no import, no grant, no `ModularityTests` edge. Each javadoc states the one rationale and points at the others; the alternative (three module-scoped names for one ops concern) is recorded as rejected below | Claude | open |
| R-7 | Bounding the gauge read changes `/actuator/prometheus` behavior for scrapes, not just the alert check | low | low | Same read, same failure mode as any other DB error during a scrape; the gauge already propagates whatever the query throws. Called out here so review checks it rather than discovers it | Claude | open |

## Open questions / Assumptions

- **Assumption:** `spring.task.scheduling.pool.size = 4` (today's `@Scheduled` count) is enough
  headroom, because `ScheduledThreadPoolExecutor` never exceeds its core size and each job runs
  `fixedDelay` (so a job never overlaps itself and never needs a second thread). — *Owner:* Claude ·
  *Resolves by:* phase 0, by the fitness function encoding `poolSize >= jobCount` as the rule.
- **Assumption:** the four bounded reads are the complete set of database work a `@Scheduled` job
  performs *before* it starts mutating. — *Owner:* Claude · *Resolves by:* phase 1's
  generalization-audit pass, which walks each `@Scheduled` method's call graph to its first write.

### Resolved

- **Open question (from the intake grill): does `MoneyPathAlertCheck` issue a query at all?** The
  issue's table and the class's own javadoc say it "adds no query of its own" and only reads the
  `MeterRegistry`. **That is false.** `outboxBacklog()` calls `Gauge#value()` on
  `riviera.outbox.pending`, whose supplier is `ObservabilityConfig#pendingPublications` —
  `SELECT count(*) FROM event_publication`, evaluated by Micrometer **at read time, on the calling
  thread**. So the alarm is not merely a stalled victim; it is itself a wedge candidate, on the one
  table a stuck registry listener bloats. This *strengthens* the issue and adds a fourth bounded
  read plus a javadoc correction. — Resolved at plan time, phase 2 carries the doc fix.
- **Open question (from the intake grill): is the constant carried over from #386 stated correctly?**
  Not quite. `JdbcAvailabilityClaim.claim` is `INSERT … ON CONFLICT (set_id, booking_date) DO
  NOTHING` — "the row's creation is the claim"; it has **no** `SELECT … FOR UPDATE`. The repo's
  `FOR UPDATE` statements live in `venue` (`JdbcVenues` set-version + `set_position` locking, #226)
  and in `JdbcEmailSuppressions`' own upsert. The #386 constraint still holds, just for a different
  statement: the **loser of an `INSERT … ON CONFLICT` waits on the winner's index tuple lock until
  it commits**, and that legitimate wait is exactly what a global timeout would abort. Recorded
  because the plan has to prove the chosen instrument cannot reach it, and it cannot prove that
  against the wrong statement.
- **Open question: which instrument?** Decided — **both** isolation and bounding; see Architecture.
  Rejected alternatives are recorded below (AC-4 of the issue).

### Rejected alternatives (issue AC-4)

| Alternative | Why rejected |
|---|---|
| **Global `spring.jdbc.template.query-timeout`** | Bounds *every* statement in the application, including the claim path — a legitimate index-tuple-lock wait under set contention would abort as a timeout instead of serializing, turning invariant #2 into a flaky guarantee to fix a scheduler concern. Explicitly forbidden by the issue and now machine-locked by AC-5 |
| **Pool size alone** (the issue's option 1) | Bounds nothing. It raises the number of simultaneous wedges needed to stall everything from one to four; a permanently wedged `AbandonedBookingScheduler` still leaks availability silently, which is the harm the issue names |
| **Query timeout alone** (the issue's option 2, unaccompanied) | Cannot satisfy AC-3: during the timeout window the wedged job still owns the only thread, so `AbandonedBookingScheduler` does *not* "keep running" while a sibling is stuck — it merely resumes afterwards |
| **A second `DataSource` for scheduled work with connection-level `statement_timeout`** (the issue's option 3) | A second Hikari pool and a second connection budget (Neon-hosted, ADR-0004) for four queries; and because it binds the *connection*, it would also cover the sweeps' `set_availability` writes — reaching precisely the path the issue protects. The routing to make it selective is more invasive than the four adapter-scoped clients it replaces |
| **Three module-scoped property names** mirroring #386's `riviera.notification.suppression-query-timeout-seconds` | #386's name is module-scoped because the *concern* was that module's. "How long may scheduled work wait on the database" is one cross-cutting ops question with one right answer per environment; three knobs for one decision is a worse operator experience and drifts |
| **A watchdog that abandons the sweep thread after N seconds** | Abandons the thread without cancelling the statement — the connection stays pinned and the leak gets worse, not better |

## Availability & concurrency (invariant #2)

The slice writes nothing to `availability(set_id, booking_date)`, but it sits directly upstream of
two release paths, so this section is filled rather than waived.

- **Write paths to `availability(set_id, booking_date)`:** unchanged and untouched by the diff —
  online claim (`AvailabilityClaim.claim`), staff tap-to-mark, cancellation release, weather refund,
  the Request-to-Book pending hold, and the two **sweep-driven releases** this slice protects
  (abandoned-payment expiry and request expiry, both via `AvailabilityClaim.release`).
- **Uniqueness guarantee:** `UNIQUE (set_id, booking_date)` on `set_availability` — unchanged.
- **Concurrency strategy:** `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING`, rows-affected
  decides the winner. **Unchanged, and demonstrably unreachable by this slice:** no global timeout is
  introduced (AC-5), `JdbcAvailabilityClaim` does not appear in the diff and keeps the shared
  unbounded `JdbcClient`, and the bounded clients added here are private to `JdbcBookings`,
  `JdbcAccountErasure` and `ObservabilityConfig` and used only by the named candidate/gauge reads.
- **Direction of failure:** every new failure mode is in the safe direction. A bounded candidate read
  that aborts selects **nothing**, so the sweep expires nothing that tick — a set stays held slightly
  longer, never double-sold. That is the same safe direction the issue notes for the leak itself.
- **Pool rule (invariant #3):** untouched — pool selection lives in `JdbcAvailabilityClaim.claim`.
- **Cutoff rule (invariant #4):** untouched — no booking-date arithmetic in scope.
- **Pinning test:** `ConcurrentReservationIT`, plus `ConcurrentClaimIT` and
  `StaffMarkVsOnlineClaimConcurrencyIT`. All three must pass **without edits** (AC-6) — an edit to
  any of them is the signal that the bound reached the claim path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | its own `adapter/out` bounds its own two sweep candidate reads; no other module may configure `booking`'s persistence |
| M-2 | `customer` | existing | `Customer` | same, for the retention sweep's candidate read (the retention sweep is `customer`'s per `RESPONSIBILITIES.md`) |
| M-3 | *(root — not a module)* | existing | — | `ObservabilityConfig`'s outbox gauge and `spring.task.scheduling.pool.size` are app-level platform config, sitting with `RateLimitFilter` / `MoneyPathAlertCheck` in the composition root |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | *none added or changed* | — | — |

No `api`/`spi`/`vocabulary`/`events` surface is added, moved, or widened; no `allowedDependencies`
grant changes; nothing crosses a module boundary. `ModularityTests`, `PackageShapeArchitectureTests`
and `PublishedSurfacePlacementArchitectureTests` should be unaffected — run anyway (they are the
definition of correct structure, not intuition).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | — | *none added or changed* | — | — | — | — |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Bound the abandoned-payment + request-expiry candidate reads | `booking` | `booking` **Job**: "own bookings … and the lifecycle"; these are its own tables read by its own `adapter/out`. Not `availability`'s (**Not My Job** for `booking` is *owning the `(set,date)` row* — which this does not touch) |
| Bound the retention-sweep candidate read | `customer` | `customer` **Job**: "own the **retention policy** … and the sweep that tombstones them". Explicitly **not** `booking`'s (its Not-My-Job: "the retention window or the contact scrub → `customer`") |
| Bound the outbox-backlog gauge read | *root (composition root)* | `event_publication` is Spring Modulith framework infrastructure "owned by no module" (`ObservabilityConfig`'s own javadoc); the gauge already lives at the root with the rest of the observability wiring |
| Size the scheduler's thread pool | *root (`application.properties`)* | One app-wide executor shared by three modules' jobs — no module may own it, and a module-local override would be invisible to the other two |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves and no payment/payout code is modified. The
abandoned-payment sweep's `CancelPaymentPort` call is *read* by the AC-3 test (it runs under the
default profile's in-process stub) but is neither changed nor bounded — the Stripe round-trip
already has its own explicit timeouts (#52/#426) and deliberately runs outside any DB transaction.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, style, or e2e spec changes; nothing user-observable.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape is added or altered.

## Execution status

**Stage pointer:** `implement — phases 0-1 done, entering phase 2`

**Next action:** Phase 2 — write `AbandonedSweepSurvivesWedgedJobIT` (both instruments together on
the real `TaskScheduler`), then correct `MoneyPathAlertCheck`'s Javadoc and the deploy runbook.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Isolate the scheduler's lane (pool size + fitness function) | ✅ | `0d636c6` |
| 1 — Bound every scheduled entry query | ✅ | |
| 2 — Prove it end-to-end + correct the stale docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *none yet* | — |

---

## File structure

- `platform/src/main/resources/application.properties` — **modify**: add
  `spring.task.scheduling.pool.size`, with the comment carrying the "why ≥ job count" rationale.
- `platform/src/main/java/ai/riviera/platform/ObservabilityConfig.java` — **modify**: the outbox
  gauge reads through a bounded client; carries the canonical rationale javadoc the other two
  point at.
- `platform/src/main/java/ai/riviera/platform/MoneyPathAlertCheck.java` — **modify**: javadoc only —
  correct the false "adds no query of its own" claim.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — **modify**:
  a second, bounded `JdbcClient` used by `findExpirableAwaitingPayment` + `findOverduePendingRequests`.
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcAccountErasure.java` —
  **modify**: same, for `expiredGuestCandidates`.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcGuestBookingHistory.java` —
  **modify**: bounded **outright** (no second client), because every call reaching this SPI is
  scheduled work — `ExpireGuestContactsService.sweep()` is its sole consumer. Found by phase 1's
  generalization audit, not by the issue.
- `platform/src/test/java/ai/riviera/platform/ScheduledWorkArchitectureTest.java` — **create**:
  AC-4 + AC-5 fitness functions. Named for *scheduled work*, not for the pool, because it carries
  one rule per instrument.
- `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java` — **create**: AC-1 + AC-2,
  real `ACCESS EXCLUSIVE` wedges.
- `platform/src/test/java/ai/riviera/platform/AbandonedSweepSurvivesWedgedJobIT.java` — **create**:
  AC-3, both instruments together on the real `TaskScheduler`.
- `docs/deploy/production-hardening.md` — **modify**: the scheduling row gains the pool-size +
  bound facts (it is the doc that currently describes the single-instance scheduler posture).
- `docs/plans/scheduled-sweep-bounds.md` — this plan.

---

## Phase 0 — Isolate the scheduler's lane

**Files:** Create `platform/src/test/java/ai/riviera/platform/ScheduledWorkArchitectureTest.java` ·
Modify `platform/src/main/resources/application.properties`

- [x] **Step 1: Write the failing test** ✅ — count `@Scheduled` methods across
  `ArchitectureTestSupport.productionClasses()`; read `application.properties` from the main
  resources; assert `spring.task.scheduling.pool.size >= count`. Non-vacuity guard: assert the
  discovered method set is exactly the four known jobs (`AbandonedBookingScheduler#sweep`,
  `RequestSweepScheduler#sweep`, `GuestContactRetentionScheduler#sweep`, `MoneyPathAlertCheck#check`),
  mirroring `MailListenerExecutorArchitectureTest`'s guard — a broken scan must fail loudly, not pass
  green on zero. Second test: no `application*.properties` sets
  `spring.jdbc.template.query-timeout` (AC-5).
- [x] **Step 2: Run it, verify it fails** —
  `gradle test --tests "*ScheduledWorkArchitectureTest*"` → FAIL: property absent (Boot's
  default is 1, and 1 < 4).
- [x] **Step 3: Minimal implementation** — set `spring.task.scheduling.pool.size=4` with the
  rationale comment (why it must track the job count; that the fitness function enforces it).
- [x] **Step 4: Run it, verify it passes** → PASS.
- [x] **Step 5: Generalization-audit pass** — search for other shared-executor bounds that could
  starve the same way (`grep -rn "@Async\|TaskExecutor\|ThreadPoolTask" platform/src/main`) and
  record the decision (expected: the two mail pools are already bounded and deliberately isolated
  per #383/#408; Boot's `applicationTaskExecutor` is a separate, larger question).
- [x] **Step 6: Commit** — `git commit -m "give every scheduled job a thread of its own (#395)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Bound every scheduled entry query

**Files:** Create `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java` ·
Modify `ObservabilityConfig.java`, `JdbcBookings.java`, `JdbcAccountErasure.java`

- [x] **Step 1: Write the failing test** — `@EnabledIfDockerAvailable` + `TestcontainersConfiguration`
  + `@SpringBootTest(properties = "riviera.scheduled.query-timeout-seconds=1")`. Per query: hold an
  `ACCESS EXCLUSIVE` lock on its table from a second connection, assert the read throws
  `DataAccessException` within 15 s, then roll back. Exactly `SuppressionQueryTimeoutIT`'s shape.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*ScheduledQueryTimeoutIT*"` → FAIL
  (the unbounded reads block until the test's own timeout).
- [x] **Step 3: Minimal implementation** — one property,
  `riviera.scheduled.query-timeout-seconds` (default 10), read by each of the three adapters, each
  building its own `JdbcTemplate`-backed bounded `JdbcClient` exactly as
  `JdbcEmailSuppressions#boundedClient` does. The canonical rationale javadoc lives on
  `ObservabilityConfig`; `JdbcBookings` and `JdbcAccountErasure` state the local stakes and point at
  it. Every javadoc repeats the one non-negotiable: **scoped here on purpose, never global**.
- [x] **Step 4: Run it, verify it passes** → PASS. Then the regression scope:
  `gradle test --tests "*JdbcBookings*" --tests "*ConcurrentReservationIT*" --tests "*ConcurrentClaimIT*"`.
- [x] **Step 5: Generalization-audit pass** — walk each `@Scheduled` method's call graph down to its
  first write and confirm no *fifth* entry read was missed; record the walk and the decision to leave
  the per-item writes unbounded (Behavior-parity ledger row 4).
- [x] **Step 6: Commit** — `git commit -m "bound every scheduled job's entry query (#395)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Prove it end-to-end + correct the stale docs

**Files:** Create `platform/src/test/java/ai/riviera/platform/AbandonedSweepSurvivesWedgedJobIT.java` ·
Modify `MoneyPathAlertCheck.java` (javadoc), `docs/deploy/production-hardening.md`

- [ ] **Step 1: Write the failing test** — seed an `AWAITING_PAYMENT` booking holding a
  `set_availability` row. Lock `event_publication` `ACCESS EXCLUSIVE`; set
  `riviera.scheduled.query-timeout-seconds` **high** for this test so the wedge genuinely does not
  self-clear. Dispatch the wedged gauge read on the autowired `TaskScheduler`, then dispatch
  `ExpireAbandonedBookings.sweep(...)` on the same scheduler; assert it completes, the booking is no
  longer `AWAITING_PAYMENT`, and its `set_availability` row is gone. Release the lock in a `finally`.
- [ ] **Step 2: Run it, verify it fails** — temporarily override
  `spring.task.scheduling.pool.size=1` in the test to prove the test is not vacuous: the sweep must
  queue behind the wedge and time out. Then remove the override.
- [ ] **Step 3: Minimal implementation** — none needed (phases 0+1 are the implementation); correct
  `MoneyPathAlertCheck`'s javadoc ("it adds no query of its own" → it reads a gauge **whose supplier
  queries `event_publication` on this thread, bounded since #395") and add the scheduling facts to
  `docs/deploy/production-hardening.md`.
- [ ] **Step 4: Run it, verify it passes** → PASS.
- [ ] **Step 5: Generalization-audit pass** — record whether any other doc or javadoc repeats the
  "adds no query of its own" claim or the "four jobs, one thread" fact
  (`riviera-docs-freshness` counting sweep).
- [ ] **Step 6: Commit** — `git commit -m "prove a wedged job cannot stall the abandoned sweep (#395)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 1 (new pattern: a bounded entry query) | every `@Scheduled` method's call graph down to its **first write** — is there another entry read? | read each of `AbandonedBookingSweepService`, `ExpireRequestsService`, `ExpireGuestContactsService`, `MoneyPathAlertCheck.check` | **5 entry reads, not 4.** `ExpireGuestContactsService.sweep()` asks `customer` for candidates *and then* asks `booking` for the retention basis (`GuestBookingHistory#withBookingOnOrAfter`), both before any write. The alert check's other two signals are meter reads, no DB | **fixed all.** Bounded `JdbcGuestBookingHistory` outright (its sole consumer is the sweep, so it has no request path to protect) and extended `ScheduledQueryTimeoutIT` to cover it. Left the per-item **writes** unbounded on purpose — Behavior-parity ledger row 4 |
| 2026-07-30 | phase 0 (new pattern: a shared executor with no isolation rule) | other shared/bounded executors that could starve the same way | `grep -rn "ThreadPoolTaskExecutor\|setCorePoolSize\|setQueueCapacity\|applicationTaskExecutor\|@Async" platform/src/main/java` | 2 pools (`RegistryMailExecutorConfig`, `AsyncMailDispatcher`) + 3 `@Async` mail listeners | **skip — already closed.** Both pools are deliberately isolated and bounded (#369/#383/#408) and all three `@Async` sites name their executor explicitly, pinned by `MailListenerExecutorArchitectureTest`. Nothing runs on Boot's shared `applicationTaskExecutor`. The scheduler pool was the last shared executor with no rule |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle test --tests "*ScheduledQueryTimeoutIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Same run, `everyScheduledEntryQueryIsBounded` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `gradle test --tests "*AbandonedSweepSurvivesWedgedJobIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4/AC-5:** Run `gradle test --tests "*ScheduledWorkArchitectureTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `gradle test --tests "*ConcurrentReservationIT*" --tests "*ConcurrentClaimIT*" --tests "*StaffMarkVsOnlineClaimConcurrencyIT*"` → PASS, **with no diff in those files**. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; the concurrency ITs pass **unedited** (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module imports added; no grant changes (invariant #11).
- [ ] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — no date arithmetic in scope.
- [ ] Booking codes unguessable (invariant #7) — no code is logged by anything added here.
- [ ] No Flyway migration needed; none added (invariant #12).
- [ ] **Frontend** N/A — backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
