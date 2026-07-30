# Bulkhead the cancellation refund off the shared applicationTaskExecutor — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `booking.adapter.in.BookingRefundListener` off Boot's shared
`applicationTaskExecutor` onto a dedicated **bounded** executor, and stop it holding a JDBC
connection across the gateway round-trip, so that a degraded payment gateway can neither starve
the money-path spine of threads (`PaymentConfirmed` → confirm, invariant #8; `BookingConfirmed` →
payout accrual, invariant #9) nor drain the Hikari pool the whole application shares — while
proving the Event Publication Registry still tracks, completes and republishes the listener after
the decomposition.

**Architecture:** The same decomposition #383 applied to registry-borne mail, with a different
transport and one addition. `@ApplicationModuleListener` expands to exactly `@Async` +
`@Transactional(propagation = REQUIRES_NEW)` + `@TransactionalEventListener`; this slice replaces it
with `@Async(RefundExecutorConfig.REFUND_EXECUTOR)` + `@TransactionalEventListener` and **drops the
transaction**, because the listener's two payment-side statements are a read and a single-statement
`UPDATE` separated by the network call, with no consistency requirement between them — the only
thing the transaction bought was pinning a pooled connection across the round-trip. The class,
method name and parameter type are unchanged, so the registry's `listener_id` (which embeds exactly
those) is byte-identical and **no Flyway rewrite is needed** — pinned by a test rather than assumed.

**The whole slice is vendor-neutral, and that is a scoping decision, not a coincidence.** ADR-0009
(epic #284) replaces Stripe with Paysera and states in its Consequences that `booking`, the ledger
and all domain events are **untouched** by that migration; every file this slice changes is in
`booking` (plus one metric name in `shared`), and none of them names a gateway. The listener drives
`payment.api.RefundPort`, and ADR-0009 keeps refunds an API call behind that same port. The one
gateway-specific artefact is the *number* — the worst-case round-trip the bounds are sized against —
which is why it is expressed as a **derivation** in prose and pinned by a test in `payment` that
fails to compile when the Stripe adapter is removed, forcing re-derivation rather than silently
carrying a stale constant into P1. See Non-goals and the #284 handoff in phase 3.

**Persistence:** JDBC only (invariant #1). **No migration, no schema change.** The slice reads
`event_publication` in tests only; the registry schema stays Flyway-owned (V8, V31). Dropping the
listener transaction changes no SQL — `JdbcPayments#markRefunded` is a single `UPDATE`, so its
atomicity does not depend on a surrounding transaction (verified at
`payment/adapter/out/JdbcPayments.java:99-112`).

**Source of intent:** GitHub issue **#404**, raised at #383's close-out by that slice's
generalization-audit pass (`docs/plans/registry-mail-bulkhead.md`, Generalization-audit log,
row dated 2026-07-28 phase 0) as the one genuine sibling it found and deliberately deferred.

**Skills consulted:**
- `riviera-sdlc` (routing + the issue-intake grill gate — it caught the two findings that reshaped
  this slice: the issue's "volume" mitigation is falsified by `WeatherRefundService`, and the
  `REQUIRES_NEW` connection pin the issue never mentioned).
- `riviera-plan-doc` (this template — it forced the Behavior-parity ledger, which is what turned
  "swap an annotation" into an enumerated list of five listener properties that must survive).
- `tdd` (every phase below is red → green; the executor's shed policy and the property guards are
  unit-tested before the bean exists, and the bulkhead ITs fail on today's code before the move).
- `riviera-review-overlay` (review gate — due when the PR is marked ready for review; RV-BE-3b on
  the new `adapter/in` config, RV-BE-11 against the Module-ownership table below).
- `riviera-docs-freshness` (**due at phase 3 and re-run at close-out** over `origin/main...HEAD`.
  One finding is already known at plan time and is scheduled in phase 3: the boundary bullet in
  `MailListenerExecutorArchitectureTest`'s Javadoc states *"`booking`'s and `payout`'s
  `@ApplicationModuleListener`s belong on the shared pool"*, which this slice makes false for one
  of them).
- `riviera-modulith` — confirmed the executor bean belongs in `booking`'s `adapter/in` beside the
  driving adapter it serves (same placement #383 used in `notification`), that `booking`'s
  `allowedDependencies` already grants `shared` so the new counter needs no grant change, and that
  a moved/renamed listener would need a Flyway `listener_id` rewrite — which is why AC-5 pins that
  it did **not** move.
- `riviera-java-conventions` — package-private `@Configuration` + package-private listener,
  constructor injection into `final` fields, a compile-time constant shared by the `@Bean` name and
  the `@Async` that names it, record `@ConfigurationProperties` validated in the compact constructor
  (not `@Validated`/`@Min` — #97 declined `spring-boot-starter-validation`, so annotations would
  bind and validate nothing), no bare `catch`, one-line-or-none inline comments. §8's *"don't
  hand-roll thread pools in application code"* is the tension this plan has to argue rather than
  ignore — see R-5.
- `riviera-stripe-payments` — confirmed the collect-only model is untouched (no Connect, no new
  gateway call, no change to who decides a refund) and that the refund idempotency key
  `booking-<id>-refund` is what makes every retry path in this plan safe. It also supplied the
  ADR-0009 pointer that made the vendor-neutrality scoping explicit rather than assumed.
- `riviera-local-debug` — the cloud recipe (system `gradle`, JDK-25 toolchain registration, daemon
  on 21) and the scoped-test discipline behind every phase command below.
- **Review-fix round (F-1…F-5), per the re-entry rule:** `riviera-java-conventions` re-applied for §6c
  (F-1, the one-line inline-comment rule) and for the `@ConfigurationProperties` compact-constructor
  bounds (F-4); `riviera-docs-freshness` re-applied for the runbook claim (F-2) and for the now-stale
  *"a third **mail** pool"* sentence in `MailTransportProperties` that F-4 falsified. **No new area:**
  every fix is backend Java or a doc already in scope — no migration, no frontend, no new module edge
  (the mail-side edit is Javadoc only, so `notification` gains no dependency on `booking`).
- **Not loaded, deliberately:** `postgres` (no migration, no schema, no new query — the ITs read
  `event_publication` with a `count(*)` copied from the existing bulkhead IT); `riviera-frontend` /
  `angular-developer` / `playwright-cli` (backend-only, no user-facing surface, no API shape change).

**Branch:** `claude/sdlc-404-uhb2ha` — the cloud session's designated remote branch, standing in for
`bugfix/refund-listener-bulkhead` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the shipped payment-gateway client configuration, when the worst-case duration
      one refund can occupy a worker is derived, then the derivation is
      `(connectTimeout + readTimeout) × (1 + maxNetworkRetries)` and **each factor is pinned by an
      assertion**, not prose — today's Stripe instantiation being `(5s + 20s) × 1 = 25s`, with the
      configured ceilings giving an absolute worst case of `(30s + 80s) × 1 = 110s`.
      *Pinned by:* `StripeConfigTest.theRefundBudgetIsOneRoundTripWithNoSdkRetries`
- [x] **AC-2:** Given a `BookingCancelled` whose gateway refund blocks indefinitely, when a
      `PaymentConfirmed` and a `BookingConfirmed` are published, then the booking still reaches
      `CONFIRMED` (invariant #8) and the payout ledger still accrues (invariant #9) inside the test
      window. *Pinned by:* `RefundBulkheadIT.wedgedRefundDoesNotDelayTheMoneyPath`
- [x] **AC-3:** Given a `BookingCancelled` with an amount owed, when the refund listener runs, then
      no transaction is active on the worker **and** no JDBC connection is bound to it for the
      duration of the gateway call. *Pinned by:*
      `RefundBulkheadIT.refundsWithNoTransactionOrConnectionHeldOpen`
- [x] **AC-4:** Given a gateway that returns `RefundResult.Failed`, when the listener runs, then it
      throws, the `event_publication` row stays outstanding, and a subsequent successful attempt
      completes it. *Pinned by:*
      `RefundBulkheadIT.aFailedRefundLeavesThePublicationOutstandingAndIsRetried`
- [x] **AC-5:** Given the decomposed listener, when a `BookingCancelled` is published, then the
      registry writes the **same** `listener_id` as before the decomposition, so no Flyway rewrite is
      owed. *Pinned by:* `RefundBulkheadIT.keepsTheListenerIdUnchanged`
- [x] **AC-6:** Given the refund executor bean is declared, when the context starts, then
      `applicationTaskExecutor` is **still present** and unqualified `@Async` still resolves to it —
      with two `defaultCandidate = false` executors in the context, not one.
      *Pinned by:* `RefundExecutorWiringIT`
- [x] **AC-7:** Given the pool is saturated at `poolSize + queueCapacity`, when a further refund is
      submitted, then the submission is **shed**: `riviera.refunds.shed` increments, an `ERROR` is
      logged once per saturation episode (an episode ending when the queue drains), the handler
      neither throws nor runs the task on the calling thread, and a rejection arriving during
      shutdown is neither counted nor escalated.
      *Pinned by:* `RefundExecutorConfigTest`
- [x] **AC-8:** Given a non-positive or oversized `pool-size`, `queue-capacity` or `shutdown-drain`,
      when the context binds the properties, then boot **fails** with a message naming the property
      and its range — rather than booting clean onto a `SynchronousQueue` (capacity ≤ 0) or a queue
      deep enough to be the unbounded one this slice removes.
      *Pinned by:* `RefundExecutorPropertiesTest`
- [x] **AC-9:** Given any event listener in `booking.adapter.in` that reaches `payment::api`, when the
      architecture rule runs, then it must carry `@Async` naming the refund executor — and the rule is
      proven non-vacuous by finding today's listener.
      *Pinned by:* `RefundListenerExecutorArchitectureTest`

## Non-goals

- **Any change to who decides a refund, or to its amount.** `booking` still computes eligibility and
  amount server-side (invariant #10); `payment` still executes. This slice moves *when and where the
  execution runs*, nothing else.
- **Any change to `payment`'s adapters, the Stripe client, or its timeouts.** AC-1 *asserts* the
  existing configuration; it does not tune it. Sizing the pool against that budget is this slice's
  job; changing the budget is not.
- **Bounding the shared `applicationTaskExecutor`** (issue #404 option 3). It carries the payout
  accrual and the payment→confirm transition; giving the spine a smaller pool would shed money-path
  work, which is strictly worse — the same reasoning #383 recorded in its Non-goals.
- **Moving `payout`'s two listeners or `booking`'s `PaymentEventListener`.** They are DB-only and
  *are* the spine; they belong on the shared pool.
- **An admin re-drive lever for outstanding refunds** (the `/api/admin/mail-outbox` equivalent, #405).
  A shed or crash-lost refund is recovered by `republish-outstanding-events-on-restart`, and AC-4
  proves the publication survives. Shortening that horizon is automated money-path retry and deserves
  its own issue and risk register — **filed as #454**, not ridden in here.
- **MDC propagation onto the refund pool** (#410's `MdcTaskDecorator`). That class lives in
  `notification.application` and invariant #11 forbids importing it from `booking`; promoting it to
  `shared` is a cross-module move with its own docs cost. Today's shared pool propagates no MDC
  either, so **this is not a regression** — but the review gate was right that the first version of
  this sentence defended only half of it. Two different lines are in play: the **shed** line is
  attributable regardless, because `ThreadPoolExecutor.execute` calls `reject(...)` on the *calling*
  thread (the one committing the cancellation); the listener's **own** `refunded cancelled booking {}`
  line and any gateway-failure throw run on a `booking-refund-N` worker and carry no correlation id.
  That second half is genuinely uncovered — it is simply uncovered *today* as well, on the shared
  pool, which is what makes it a gap rather than a regression. **Filed as #455.**

## Behavior-parity ledger

> The slice replaces the listener's annotation, which is a replacement of its framework-supplied
> behaviors even though no business logic changes. "Swap `@ApplicationModuleListener` for its
> expansion" is exactly the kind of claim that reads as *preserved* while quietly dropping a
> property, so each one is enumerated.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Runs **asynchronously**, after the publishing transaction commits | preserved | `@TransactionalEventListener` defaults to `AFTER_COMMIT`; `@Async` keeps it off the committing thread. AC-2 exercises both |
| Registered in the **Event Publication Registry** under a stable `listener_id`; incomplete on failure | preserved | Modulith's `CompletionRegisteringAdvisor` pointcut keys on the listener, not on `@ApplicationModuleListener`; the id embeds class + method + parameter type, none of which move. AC-4 + AC-5 |
| **Throws** on `RefundResult.Failed` so the publication is retained and retried | preserved | Unchanged listener body. AC-4 |
| **No-ops** when `refundMinor() <= 0` (non-refundable cancellation, ADR-0005) | preserved | Unchanged guard, still the first statement |
| Runs inside a **`REQUIRES_NEW` transaction** | **dropped** — deliberately | This is the defect, not a feature: it pins a Hikari connection across the gateway round-trip. Safe to drop because the listener's only write, `JdbcPayments#markRefunded`, is a single `UPDATE` (atomic under auto-commit) and it runs only after a successful refund, so there is nothing a rollback could have undone. AC-3 pins the absence |
| Runs on Boot's **shared `applicationTaskExecutor`** | **changed** | Now a dedicated bounded pool. Under saturation the behavior genuinely differs — see the retry story in Payment & payout below. AC-2, AC-6, AC-7 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Declaring a second `Executor` bean makes Boot back off `applicationTaskExecutor` (`@ConditionalOnMissingBean(Executor.class)`), silently dropping every unqualified `@Async` — the money-path listeners included — onto an unbounded `SimpleAsyncTaskExecutor`, where no test fails because unbounded threads always keep up | med | **critical** | `defaultCandidate = false`, the fix #383 established; AC-6's IT asserts both halves (the shared bean exists **and** unqualified `@Async` resolves to it) with **two** such beans in the context, which is the configuration #383 never tested | this slice | **closed** — `RefundExecutorWiringIT` green, 4 tests, 0 skipped: the shared pool is present and unqualified `@Async` still resolves to it |
| R-2 | Dropping the listener transaction changes durability or completion semantics | low | high | Modulith's completion registration is advisor-based and independent of `@Transactional` (re-derived by #383's review, not taken on faith); AC-4 proves outstanding-on-failure and AC-5 proves the id is unmoved, both against a real registry | this slice | **closed** — both green against a real registry; AC-4/AC-5 also passed *before* the swap, which is what makes them regression guards rather than new claims |
| R-3 | Shedding a refund loses money owed to a tourist (invariant #10) | low | **critical** | A shed submission never runs, so the publication is never completed and `riviera.outbox.pending` carries it until the next start republishes it (AC-4 proves the mechanism). The queue is sized so a whole weather-refund sweep fits without shedding; the shed path is a backstop with its own counter (AC-7), because — unlike a crash — shedding does not itself trigger the restart that recovers it | this slice | open |
| R-4 | The pool is sized against an estimate that real gateway latency falsifies, and correcting it costs a deploy | high | med | All three bounds are `@ConfigurationProperties` with env placeholders (#408's precedent), validated at both ends (AC-8). Retuning is a config change; the P1 re-derivation is a recorded handoff, not a memory | this slice | **closed** — the queue is 500 deep against a worst realistic burst of one venue-day, the shed path is counted (`riviera.refunds.shed`) and documented in the observability runbook, and AC-4 proves the publication survives; the residual retry horizon is #454 |
| R-5 | `riviera-java-conventions` §8 says *"don't hand-roll thread pools in application code"* | — | — | Honored, not violated: this is a Spring `ThreadPoolTaskExecutor` bean in a driving-adapter `@Configuration`, not a hand-rolled pool in a service. §8's target is `new Thread()`/`ExecutorService` inside domain or application logic, and its second clause — *"the real scaling knob is the Hikari pool"* — is precisely what phase 2 protects by dropping the connection pin | this slice | **closed** — the bean is a Spring `ThreadPoolTaskExecutor` in a driving-adapter `@Configuration`, the shape #383 established; AC-3 pins the Hikari half |
| R-6 | Full-suite-only failure: a new `@ConfigurationProperties` bean plus a second pool changes context caching, or the shed counter accumulates across tests in one JVM | med | med | The `riviera-local-debug` shared-state rule. The counter is read per-test from a fresh `SimpleMeterRegistry` in the unit tests; the ITs assert deltas, never absolutes. Verified only by the push's CI run | this slice | **open until this push's CI** — and the class did bite once already, in-slice: `RefundBulkheadIT`'s first cut used global counters, so refunds still draining from the wedge test completed *after* the next test's `reset()` and made an exact `== 1` unsatisfiable. Fixed by keying every sample to the booking under test rather than by sleeping |
| R-8 | **The shutdown drain overspends a budget this module cannot see.** Pool drains add rather than overlap, and the constant that tracks it (`MailTransportProperties.DRAINING_POOLS`) is mail-scoped, so nothing in the suite fails when a pool lands elsewhere | — | **critical** | **Missed at plan time; caught by the review gate** (F-4). Capped at 5s so 20 + 5 fits the ~30s grace; the mail-side Javadoc now records that a non-mail claimant exists; the structural gap — no platform-wide guard — is **#456**, since closing it needs the grace stated somewhere both modules may read | review gate | **closed** — value fixed here, guard tracked in #456 |
| R-7 | The architecture rule (AC-9) is vacuous — it finds no listener and passes forever | med | med | Non-vacuity is a step, not a hope: proven by **fixtures** rather than the planned manual revert — `RefundListenerRuleFixtures` keeps the negative cases permanent, per #409's lesson that a temporary revert is a proof nobody can re-run | this slice | **closed** — 8 tests, incl. three independent non-vacuity checks |

## Open questions / Assumptions

- **Assumption:** the largest realistic single-burst refund count is one weather-refund sweep over
  one `(venue, date)` — bounded by a venue's confirmed bookings for that day — and a `queue-capacity`
  of 500 therefore absorbs several venues' worth of one storm without shedding. *Owner:* this slice ·
  *Resolves by:* phase 1, by writing the derivation into `RefundExecutorProperties`' Javadoc so the
  number is falsifiable rather than folkloric; the env placeholder is what makes being wrong cheap.

### Resolved

- **Open question (resolved at plan time, by the maintainer):** *is this worth building at all
  given the Paysera migration?* — Resolved **build it, vendor-neutral**. ADR-0009 puts `booking`
  outside the migration's blast radius; #284 is unscheduled and gated on company registration and
  EMI KYC; and Paysera has **no sandbox** (ADR-0009: test payments run against production), so P1
  would otherwise land an unmeasurable-latency blocking call onto the shared spine pool. Only the
  worst-case *number* is disposable, and phase 3 step 5 records its re-derivation on #284's P1 slice.
- **Open question (resolved at plan time, by the grill):** *does the Stripe SDK retry, multiplying
  the worst case?* — Resolved **no**. `StripeClient.StripeClientBuilder.maxNetworkRetries` is a bare
  `int` field defaulting to `0`, and `StripeConfig.clientBuilder` never sets it; the
  `Stripe.maxNetworkRetries = 2` in the SDK is the **legacy static API's** default and never reaches
  a `StripeClient`. `RequestOptions.merge` falls back to the client value when the per-request
  options leave it null, which `StripePaymentGateway#refund` does. AC-1 pins all three facts.

## Availability & concurrency (invariant #2)

The slice touches `booking`, so this section is filled rather than waived — but it adds **no write
path** to `availability(set_id, booking_date)` and moves none.

- **Write paths to `availability(set_id, booking_date)`:** unchanged and untouched — online reserve
  (`ReserveSetService`), staff tap-to-mark, cancellation release (`CancelBookingService`), the admin
  weather refund (`WeatherRefundService`), and the Request-to-Book pending hold / decline / expiry
  release. **None is in this diff.**
- **Why the refund listener cannot affect it:** the release already happens *inside* the cancel
  transaction, synchronously, via `availability.api.AvailabilityClaim#release` — before
  `BookingCancelled` is published. This listener runs strictly **after** that commit and never calls
  `availability`. Moving it to another executor therefore cannot reorder, delay or duplicate an
  availability write; the set is free the moment the cancel commits, whether the refund is fast,
  slow, shed, or retried after a restart.
- **Uniqueness guarantee:** unchanged — the unique constraint on `(set_id, booking_date)`.
- **Concurrency strategy:** unchanged — `INSERT … ON CONFLICT DO NOTHING` claim.
- **Pool rule (invariant #3) / cutoff rule (invariant #4):** unchanged, not in scope.
- **Pinning test:** the existing `ConcurrentReservationIT` stays green and **unmodified** — that it
  is unmodified is the point. Phase 2's regression scope runs it.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | The listener being moved is `booking`'s own driving adapter, reacting to `booking`'s own event; the executor that runs it belongs beside it in `adapter/in` |
| M-2 | `shared` | existing | — (Shared Kernel) | One new metric-name constant on `ObservabilityMetrics`, which is where every other money-path metric name already lives. No logic, no state — admission criteria met |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `RefundPort#refund(BookingRef, Money)` | `RefundResult` | `booking` (unchanged — **no new port, no signature change**; listed because it is the blocking call this slice isolates) |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` | `{ bookingId, venueId, setId, bookingDate, refundMinor, currency, reason }` | `booking` (refund), `payout` (reversal), `notification` (cancellation mail) | async `AFTER_COMMIT` | `RefundBulkheadIT` (this slice) · existing `PayoutReversalIT` unchanged |

**No event is added, moved or renamed**, so no Flyway `event_type` rewrite is owed; no
`allowedDependencies` grant changes (`booking` already lists `payment::api`, `payment::vocabulary`
and `shared`).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The bounded executor the refund listener drains on | `booking` | `booking` **Job**: owns the cancellation lifecycle and orchestrates "reserve → pay → confirm" across `availability` and `payment`. The listener is `booking`'s driving adapter, so the pool that runs it is `booking`'s wiring — the same placement #383 chose (`notification` owns the pool its own listener drains on). Not `payment`: its **Not-My-Job** is deciding refunds, and hosting another module's executor would be the mirror error — it does not know it is being called asynchronously, and must not |
| The shed counter's **name** (`riviera.refunds.shed`) | `shared` | `ObservabilityMetrics` is the Shared Kernel's existing home for money-path metric names, including the sibling `riviera.refunds.failed` this one is read beside. Admission holds: a `String` constant is no business logic, no module-owned state, and depends on nothing |
| Incrementing that counter | `booking` | Self-observation of `booking`'s own dispatch decision, the same posture `RefundService` takes for `riviera.refunds.failed` (`MeterRegistry` is a framework bean, not a cross-module dependency). Deliberately **not** in `payment`: the shed happens because the submission never reached `payment` at all |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only, **no Connect** (ADR-0002; ADR-0009 reaffirms collect-only under Paysera).
  Unchanged by this slice.
- **Confirmation trigger:** signature-verified webhook, not the client redirect. Unchanged — and
  **AC-2 is the assertion that this slice protects it**: the whole point is that a wedged refund
  cannot delay `PaymentConfirmed` → `CONFIRMED`.
- **Idempotency:** the refund key stays `booking-<id>-refund`, derived from the booking id at the
  gateway edge. This is what makes every retry path in this plan safe — a republished publication
  re-issues the same key and Stripe (and, per ADR-0009, Paysera) returns the original refund rather
  than moving money twice.
- **Money:** integer minor units, EUR (invariant #5). Untouched — the listener forwards
  `event.refundMinor()` and `event.currency()` verbatim, as it does today.
- **Payout-ledger effect:** none directly. `payout`'s `BookingCancelledPayoutListener` subscribes to
  the same event **on the shared pool and stays there**; AC-2 asserts it is no longer queued behind
  refunds, which is the invariant-#9 half of the fix.
- **Refund policy applied:** unchanged — computed server-side by `booking` before the event is
  published (invariant #10). The listener renders a decision already made; it never re-decides.
- **The retry story under saturation, stated explicitly (issue #404 AC-4).** A shed refund is **not
  lost**: the submission never runs, so the listener never completes, so its `event_publication` row
  stays outstanding — `riviera.outbox.pending` carries it, `MoneyPathAlertCheck` watches that gauge,
  and `republish-outstanding-events-on-restart=true` re-delivers it on the next start. Two honest
  limits, which are why the queue is sized so shedding is unreachable in normal operation rather than
  treated as routine: the outbox alert's default threshold is **10**, so a *single* shed refund would
  not trip it — which is exactly why AC-7 gives the shed its own counter — and, unlike a crash, a
  shed does not itself trigger the restart that recovers it. Shortening that horizon is a follow-up
  (Non-goals), not an assumption.
- **Pinning tests:** `RefundBulkheadIT` (AC-2/3/4/5), `StripeConfigTest` (AC-1), plus the existing
  `PayoutReversalIT` and `PaymentEventListenerIT` re-run **unmodified** as the regression net.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service or API shape changes.

## FE↔BE contract

`N/A — no contract change.` No endpoint is added, removed or altered; the only new configuration is
server-side and env-supplied.

## Execution status

**Stage pointer:** `review gate — fixing findings (F-1…F-5); re-review + re-check CI/Sonar next`

**Next action:** Push the F-1…F-5 fix round, re-run the review over the changed surface, then
re-check CI + the Sonar issue list before merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Establish and pin the refund budget (AC-1) | ✅ | `c57b0b3` |
| 1 — The bounded executor, its bounds, and its shed policy (AC-6, AC-7, AC-8) | ✅ | `7800e03` |
| 2 — Move the listener onto it and drop the transaction (AC-2, AC-3, AC-4, AC-5) | ✅ | `5cbfde8` |
| 3 — Make the rule structural; reconcile the substrate (AC-9) | ✅ | `505e807` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | **review gate** (reviewer 5/5, code-comment lens) | **RV-STYLE-1.** The inline comment above `setTaskDecorator` ran to two lines. Per `riviera-java-conventions` §6c the prose belongs in Javadoc, which is exempt — so it moved into `SaturationPolicy`'s Javadoc and the inline shrank to one line | fixed-in-`ffd3e09` |
| F-2 | **review gate** (reviewer 5/5) | **A false claim in a runbook, which is worse than none.** The new `riviera.refunds.shed` note said the lever is "a restart (or a targeted resubmission)". There is no refund resubmission endpoint — `/api/admin/mail-outbox` is scoped by listener-id prefix to `notification` precisely so an admin resubmitting mail never replays money-path work. An operator would have hunted for a button that does not exist, mid-incident. Rewritten to say restart-only, and to name #454 as the follow-up | fixed-in-`ffd3e09` |
| F-3 | **review gate** (reviewer 2/5, bug lens) | The episode flag's two writers race: the rejection handler opens it with a CAS, a worker clears it with an unconditional `set(false)` after reading the queue, so a stale read can clear a live episode and cost one extra `ERROR`. **Verified real; deliberately not fixed.** It cannot lose a count or a refund, needs `queueCapacity` (500) submissions inside a nanosecond window to reach, and is the same shape as the merged `RegistryMailExecutorConfig` — fixing one copy would diverge two deliberately-parallel implementations. Written into the Javadoc rather than left implicit | assessed → documented |
| **F-4** | **review gate** (reviewers 3/5 **and** 4/5, independently) | **Blocker, and the real find of this review.** Pools drain **sequentially** at context close, so drain windows *add*. `MailTransportProperties` already spends 20s of Render's ~30s SIGTERM grace across two pools and says in as many words that a third must not push past it — *"increment this when one lands"*. This slice landed the third with a **30s default and a 60s ceiling**: 50s combined at defaults, 80s if tuned up, i.e. the process SIGKILLed mid-close with Hikari and the web layer torn down instead of closed in order. My own Javadoc's claim that "its ceiling is the platform's SIGTERM grace" was simply false. Capped at **5s = default = ceiling** (the mail budget's own convention), with the reasoning inverted: an abandoned refund is *safe* — outstanding publication + idempotency key — so the drain only needs the sub-second common case | fixed-in-`ffd3e09` |
| F-5 | **review gate** (reviewer 3/5, history lens) | The MDC deferral's written justification defended only the shed line, not the listener body's own worker-thread line. The **deferral stands** (the gap predates this slice — the shared pool propagates no MDC either), but the Non-goal now says which half is uncovered instead of implying neither is | fixed-in-`ffd3e09` |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfig.java` — **new.**
  Package-private `@Configuration`; the bounded `ThreadPoolTaskExecutor` bean
  (`defaultCandidate = false`) and its saturation policy.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorProperties.java` —
  **new.** Package-private `@ConfigurationProperties` record; the three bounds, validated at both
  ends in the compact constructor.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingRefundListener.java` —
  **modify.** Annotations only: `@ApplicationModuleListener` → `@Async(REFUND_EXECUTOR)` +
  `@TransactionalEventListener`. Body unchanged. Javadoc rewritten to state the bulkhead and the
  dropped transaction.
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — **modify.** Add
  `REFUND_SHED`, with the counting rule in its Javadoc beside its siblings.
- `platform/src/main/resources/application.properties` — **modify.** The three env-placeholder
  property lines.
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeConfigTest.java` —
  **modify.** AC-1.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfigTest.java` —
  **new.** AC-7.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundExecutorPropertiesTest.java` —
  **new.** AC-8.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundExecutorWiringIT.java` —
  **new.** AC-6.
- `platform/src/test/java/ai/riviera/platform/booking/RefundBulkheadIT.java` — **new.**
  AC-2, AC-3, AC-4, AC-5.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundListenerExecutorArchitectureTest.java`
  — **new.** AC-9.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerExecutorArchitectureTest.java`
  — **modify.** Javadoc only: the boundary bullet this slice falsifies.
- `CLAUDE.md`, `RESPONSIBILITIES.md`, `docs/runbooks/observability.md` — **modify.** Phase 3
  substrate reconciliation.

---

## Phase 0 — Establish and pin the refund budget (AC-1)

**Files:** Modify `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeConfigTest.java`

The issue's first acceptance criterion is a *measurement*, and a measurement written only in prose
rots silently. This phase makes it an assertion instead: the three facts the 25s derivation rests on
(connect timeout, read timeout, and that the SDK adds no retries) each become a failing-if-changed
check. It is also the one artefact ADR-0009's P1 slice will delete — deliberately, since it will
then fail to compile against the removed `StripeConfig`, which forces the re-derivation rather than
letting a stale number ride into the Paysera era.

- [x] **Step 1: Write the failing test** — `theRefundBudgetIsOneRoundTripWithNoSdkRetries`, asserting
      on `StripeConfig.clientBuilder(properties)` that `getConnectTimeout()` is 5 000 ms,
      `getReadTimeout()` is 20 000 ms, and `getMaxNetworkRetries()` is **0**, with the failure message
      spelling out the derivation and why a non-zero retry count multiplies the worker-occupancy
      budget the refund pool is sized against.
- [x] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*StripeConfigTest*"` → FAIL (the method does
      not exist yet; then, once written against a deliberately wrong expectation, FAIL on the value).
- [x] **Step 3: Minimal implementation** — none required in `main`: the assertions describe the
      shipped configuration. This phase's deliverable is the pin plus the derivation recorded in the
      test's Javadoc.
- [x] **Step 4: Run it, verify it passes** — the same command → PASS.
- [x] **Step 5: Generalization-audit pass** — search for other blocking gateway calls whose duration
      is assumed rather than pinned (`initiate`, `cancel`): they share the same client and therefore
      the same budget; decide whether one pin covers them.
- [x] **Step 6: Commit** — `git commit -m "test(#404): pin the refund round-trip budget the bulkhead is sized against"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window, then **push and open
      the draft PR** — the first commit exists, and CI fires on `pull_request` only (#417).

---

## Phase 1 — The bounded executor, its bounds, and its shed policy (AC-6, AC-7, AC-8)

**Files:** Create `RefundExecutorConfig.java`, `RefundExecutorProperties.java` · Modify
`ObservabilityMetrics.java`, `application.properties` · Test `RefundExecutorConfigTest.java`,
`RefundExecutorPropertiesTest.java`, `RefundExecutorWiringIT.java`

The pool is built and proven **before** anything runs on it, so R-1 — the trap that would silently
unbound the money path — is caught by a test that exists before the listener moves.

- [x] **Step 1: Write the failing tests** — AC-7 (shed counts, escalates once per episode, a later
      episode logs again, never throws, never runs on the caller, shutdown rejections are neither
      counted nor escalated), AC-8 (each bound rejected at both ends with a message naming the
      property), AC-6 (`applicationTaskExecutor` still present; unqualified `@Async` still resolves to
      it — with **two** `defaultCandidate = false` executors in the context).
- [x] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*RefundExecutorConfigTest*" --tests "*RefundExecutorPropertiesTest*" --tests "*RefundExecutorWiringIT*"`
      → FAIL (the classes do not exist).
- [x] **Step 3: Minimal implementation** — the properties record (`pool-size` 4, `queue-capacity` 500,
      `shutdown-drain` PT30S, each with a floor and a ceiling and the reason for both in Javadoc), the
      `@Bean(name = REFUND_EXECUTOR, defaultCandidate = false)` with core = max = `poolSize`, the
      saturation policy as a combined `RejectedExecutionHandler` + `TaskDecorator`, and the
      `REFUND_SHED` constant.
- [x] **Step 4: Run them, verify they pass** — the same command → PASS, then the structural net:
      `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*CompositionRootDisciplineTests*"`
- [x] **Step 5: Generalization-audit pass** — the pattern being introduced is "a second bounded
      executor beside a driving adapter". Search every `@Bean` returning an `Executor`/
      `ThreadPoolTaskExecutor` and confirm each carries `defaultCandidate = false`; decide whether the
      rule should be structural rather than reviewed.
- [x] **Step 6: Commit** — `git commit -m "feat(#404): add a bounded executor for cancellation refunds"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Move the listener onto it and drop the transaction (AC-2, AC-3, AC-4, AC-5)

**Files:** Modify `BookingRefundListener.java` · Test `RefundBulkheadIT.java`

- [x] **Step 1: Write the failing tests** — AC-2 (a wedged refund vs. the spine), AC-3 (no transaction
      **and** no bound connection across the call), AC-4 (a failed refund leaves the publication
      outstanding and a later attempt completes it), AC-5 (`listener_id` unchanged, asserted against
      what the running registry writes).
- [x] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*RefundBulkheadIT*"` → FAIL (AC-2 times out:
      the refund is on the shared pool and starves the spine; AC-3 fails: a transaction and a
      connection are held).
- [x] **Step 3: Minimal implementation** — swap the annotations on the listener; rewrite its Javadoc
      to state the bulkhead, the dropped transaction and why dropping it is safe.
- [x] **Step 4: Run them, verify they pass** — the same command, then the regression scope that guards
      R-2 and the money path:
      `gradle --no-daemon --console=plain test --tests "*BookingRefundListenerTest*" --tests "*PayoutReversalIT*" --tests "*PayoutAccrualIT*" --tests "*PaymentEventListenerIT*" --tests "*WeatherRefundIT*" --tests "*CancelBookingIT*" --tests "*ConcurrentReservationIT*"`
      → PASS **unmodified** (that they are unmodified is the point).
- [x] **Step 5: Generalization-audit pass** — re-run #383's phase-0 search over every async listener
      now that a second one has moved, and record which remain on the shared pool **and why that is
      still right** (the DB-only spine listeners).
- [x] **Step 6: Commit** — `git commit -m "fix(#404): run the cancellation refund on its own bounded executor"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Make the rule structural; reconcile the substrate (AC-9)

**Files:** Create `RefundListenerExecutorArchitectureTest.java` · Modify
`MailListenerExecutorArchitectureTest.java` (Javadoc), `CLAUDE.md`, `RESPONSIBILITIES.md`,
`docs/runbooks/observability.md`

- [x] **Step 1: Write the failing test** — every event listener in `booking.adapter.in` whose method
      reaches `payment::api` must carry `@Async` naming `REFUND_EXECUTOR`; resolve the annotation
      method-first then type, and discover candidates via `ArchitectureTestSupport.productionClasses()`
      so the test source set is excluded (the `classpath*:` scanning trap #409 documented).
- [x] **Step 2: Run it, verify it fails and is not vacuous** — temporarily revert the listener to
      `@ApplicationModuleListener` → FAIL naming that listener; restore (R-7).
- [x] **Step 3: Reconcile the substrate** — patch the stale boundary bullet in
      `MailListenerExecutorArchitectureTest`'s Javadoc (it claims `booking`'s listeners belong on the
      shared pool, which is now false for one of them); add the refund pool to `CLAUDE.md`'s `booking`
      row and `RESPONSIBILITIES.md`'s `booking` **Job**; document `riviera.refunds.shed` in
      `docs/runbooks/observability.md` beside the mail loss counters, stating what it does **not**
      mean (a shed refund is outstanding, not lost).
- [x] **Step 4: Run the full architecture set** —
      `gradle --no-daemon --console=plain test --tests "*RefundListenerExecutorArchitectureTest*" --tests "*MailListenerExecutorArchitectureTest*" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`
      → PASS.
- [x] **Step 5: Run `riviera-docs-freshness` over `origin/main...HEAD`**, then file the two recorded
      follow-ups (the admin re-drive lever; MDC propagation via a `shared` `MdcTaskDecorator`) and add
      the P1 handoff line to epic **#284**: *re-derive the refund bulkhead's worst-case bound from
      Paysera's client timeouts and retry policy, and resize `riviera.booking.refund.*` against it.*
- [x] **Step 6: Commit** — `git commit -m "test(#404): pin that the refund listener names its executor"`
- [x] **Step 7: Finalize this document** — stage pointer DONE, every phase row ✅, risks closed,
      `merged via PR #NN`.

---

## Docs-freshness report (`origin/main...HEAD`)

Run at phase 3 — **4 findings, all patched, none needing a human decision.** The counting sweep's
trigger here was *"this slice makes the second dedicated bulkhead executor, and moves the first
non-mail listener off the shared pool"*.

| Doc | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `MailListenerExecutorArchitectureTest` Javadoc, boundary bullet | "`booking`'s and `payout`'s `@ApplicationModuleListener`s belong on the shared pool" | this slice moves one of `booking`'s off it | **patched** — restated so the criterion is the blocking external round-trip, not the module, and it now points at the sibling rule |
| `CLAUDE.md` `booking` row | said nothing about which executor the refund drains on, nor about the dropped transaction | #404 | patched |
| `RESPONSIBILITIES.md` `booking` **Not My Job** | "Talking to Stripe or moving money → `payment`" read as covering the wiring too | `booking` now owns the executor its own driving adapter drains on | patched — with the distinction spelled out (wiring for *my* adapter, not gateway knowledge) |
| `docs/runbooks/observability.md` | no entry for `riviera.refunds.shed`, and no statement of why a shed needs a counter when the outbox gauge also rises | #404 | patched |

Deliberately **not** patched, having been re-read and found still true: `RESPONSIBILITIES.md`'s
`notification` Job ("the shared `applicationTaskExecutor` that carries the payment→booking and
booking→payout listeners" — exactly what remains); `RegistryMailExecutorWiringIT`'s "the money-path
listeners carry a bare `@Async`" (they still do; the refund listener was never one of them);
`riviera-modulith`'s `@ApplicationModuleListener` guidance (still the default — this is the second
exception, not a repo-wide replacement); and every "the two …" hit in the sweep that turned out to be
two of some other subject (two assertions, two halves, the two *mail* pools). `docs/plans/*` from
earlier slices are historical records, not living docs, per the skill's scope discipline.

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 2 (a second listener moved off the shared pool) | #383's phase-0 sweep, re-run: every async event listener, to see which still put a blocking external round-trip on the shared `applicationTaskExecutor` | `grep -rnE '^\s*@(ApplicationModuleListener\|Async\|EventListener\|TransactionalEventListener)' platform/src/main/java` | 8 listener methods: 3 mail (`MAIL_EXECUTOR`), 1 refund (`REFUND_EXECUTOR`, this slice), and 4 on the shared pool — `PaymentEventListener` ×2, `BookingConfirmedPayoutListener`, `BookingCancelledPayoutListener` | **Fix all — the class is now closed.** Every listener that makes a blocking *external* call is bulkheaded; the four remaining are DB-only and *are* the spine, so moving them would shed money-path work onto a smaller pool (strictly worse — #383's Non-goals, restated here). #383's audit found one genuine sibling and deferred it; this slice is that deferral, and re-running the same search now returns none |
| 2026-07-30 | phase 1 (new pattern: a second bulkhead executor beside a driving adapter) | every bean the container could see as an `Executor`, since one visible by type makes Boot skip `applicationTaskExecutor` entirely (R-1) | `grep -rn -A2 "@Bean" platform/src/main/java \| grep -E "TaskScheduler\|ScheduledExecutor\|ExecutorService\|TaskExecutor\|Executor\b"` | 2: `RegistryMailExecutorConfig` (#383) and this slice's `RefundExecutorConfig`. `AsyncMailDispatcher` (#369) holds an executor but is published as a `MailDispatcher`, so it is invisible to the condition; scheduling uses Boot's own `taskScheduler` via `spring.task.scheduling.pool.size` | **Fix all — already compliant.** Both carry `defaultCandidate = false`. **Deliberately no structural rule added:** an ArchUnit rule would key on the syntax (`@Bean` returning an `Executor`), while `RefundExecutorWiringIT` asserts the *outcome* on the real context — that `applicationTaskExecutor` exists and unqualified `@Async` resolves to it. The outcome test catches any future cause, including bean types a syntactic rule would not think to match (a `ThreadPoolTaskScheduler` is also an `Executor`), so it strictly dominates |
| 2026-07-30 | phase 0 (new pattern: pinning a gateway call's occupancy budget instead of assuming it) | every blocking `StripeClient` call, to see which others have a duration the codebase reasons about but never asserts | `grep -n "stripe.v1()" platform/src/main/java` | 4 calls in `StripePaymentGateway`: `refund`, `initiate` (×2, via `createWithRecovery`), `cancel` (retrieve + cancel) | **Subset — one pin, deliberately.** The three *client-level* facts (connect timeout, read timeout, retry count) are shared by every call, so `theRefundBudgetIsOneRoundTripWithNoSdkRetries` protects all of them; a per-call pin would restate the same builder. The **per-call multiplier** differs and is worth recording rather than pinning here: `initiate` deliberately replays once on `ApiConnectionException` (#66 orphan recovery), so its worst case is **2 × 25s = 50s**, and `cancel` makes two sequential calls. Neither is in scope — `initiate` runs on a request thread (its own hazard class, already bounded by #52's timeouts) and `cancel` runs on the abandoned-payment sweep, which #395 gave a thread of its own. Only `refund` runs on the money-path spine, which is why only `refund` gets a bulkhead |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*StripeConfigTest*"` → `theRefundBudgetIsOneRoundTripWithNoSdkRetries` PASS. Proven non-vacuous first: asserting `1` retry failed with `expected: <1> but was: <0>`, which verified the source-reading against the real stripe-java 33.1.1 jar rather than trusting it.
- [x] **AC-2:** Run `gradle test --tests "*RefundBulkheadIT*"` → `wedgedRefundDoesNotDelayTheMoneyPath` PASS. **Pre-fix failure mode recorded:** `ConditionTimeoutException: Condition with alias 'payment -> booking confirmation (invariant #8)' didn't complete within 20 seconds` — the money path starved behind ten wedged refunds on the shared pool, which is the harm the issue names.
- [x] **AC-3:** Run `gradle test --tests "*RefundBulkheadIT*"` → `refundsWithNoTransactionOrConnectionHeldOpen` PASS. Non-vacuous by construction: both sample lists are asserted `isNotEmpty()` first, so a refund that never ran fails rather than passing on nothing. Pre-fix it failed on the transaction/connection samples.
- [x] **AC-4:** Run `gradle test --tests "*RefundBulkheadIT*"` → `aFailedRefundLeavesThePublicationOutstandingAndIsRetried` PASS, against a real registry.
- [x] **AC-5:** Run `gradle test --tests "*RefundBulkheadIT*"` → `keepsTheListenerIdUnchanged` PASS — the id the running registry writes still reads `ai.riviera.platform.booking.adapter.in.BookingRefundListener.on(...BookingCancelled)`, so no Flyway rewrite is owed (invariant #12).
- [x] **AC-6:** Run `gradle test --tests "*RefundExecutorWiringIT*"` → PASS, `tests="4" skipped="0"` (checked in the result XML — a Docker-less skip would have read as green).
- [x] **AC-7:** Run `gradle test --tests "*RefundExecutorConfigTest*"` → PASS (10 methods: bounds, shed-without-throw-or-caller-run, per-shed counting, episode throttling, drain-does-not-end-an-episode, later-episode-logs-again, shutdown-not-counted, abandoned-not-interrupted).
- [x] **AC-8:** Run `gradle test --tests "*RefundExecutorPropertiesTest*"` → PASS (all three bounds rejected at both ends).
- [x] **AC-9:** Run `gradle test --tests "*RefundListenerExecutorArchitectureTest*"` → PASS, 8 tests, 0 skipped. Non-vacuity proven **three ways, none of them a manual revert**: `theRuleExaminesTheRefundListener` (the scope predicate finds the real production listener), `revertingToApplicationModuleListenerIsRejected` (the fixture #383 would revert to is rejected), and `theCompliantShapePasses` (the rule does not reject everything). `thePaymentEventListenerIsOutOfScopeAndCorrectlySo` pins the other edge.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; no new write path to `set_availability` (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports;
      `allowedDependencies` unchanged (invariant #11).
- [ ] **Payment/payout** section filled; webhook-as-truth protected rather than changed; refund
      idempotency key unchanged; money in minor units; accrual/reversal untouched (invariants #5, #8, #9).
- [ ] Refund policy still enforced server-side, still decided in `booking` (invariant #10).
- [ ] Timezone: no new time arithmetic (invariant #6).
- [ ] No booking code, address or token in any new log line (invariant #7).
- [ ] No Flyway migration needed — and that claim is pinned by AC-5, not asserted (invariant #12).
- [ ] **Frontend** N/A.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — this document's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
