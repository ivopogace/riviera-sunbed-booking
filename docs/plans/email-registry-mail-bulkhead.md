# Bulkhead registry-borne mail off the shared executor Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A degraded SMTP relay must not delay or fail `PaymentConfirmed` → booking
confirmation or `BookingConfirmed` → payout accrual, and must not consume a Hikari
connection while it blocks — proven by an IT with a deliberately blocking mailer.

**Architecture:** Two separable changes to `BookingConfirmationMailListener`, in
increasing order of risk. **(1)** The SMTP round-trip stops running inside a database
transaction — the listener writes nothing, so the transaction only ever bought a
connection held for the length of a third-party network call. **(2)** The listener moves
off Boot's shared `applicationTaskExecutor` onto a dedicated bounded pool, which requires
decomposing `@ApplicationModuleListener` into its three constituent annotations because it
publishes no executor attribute. The registry vehicle is unchanged and stays ADR-mandated
(ADR-0011 decision 5, ids-only payload → registry); this slice changes only the executor
and transaction posture.

**Persistence:** JDBC only (invariant #1). **No migration.** No table is created, altered
or read differently. The Event Publication Registry tables (`event_publication`,
`event_publication_archive`, V8) are touched only through Spring Modulith's own
`REQUIRES_NEW` writes, which this slice does not modify — see R-1 for why the
`listener_id` column nonetheless constrains the refactor.

**Source of intent:** GitHub issue **#383** (parent epic **#367**), deferred from #371's
review gate by two independent reviewers. Blocks **#370** activating the `mailer` profile
in production.

**Relationship to PR #403.** An earlier, independent implementation of #383 exists — open,
CI-green, branch `claude/sdlc-383-iy57l3`, plan `docs/plans/registry-mail-bulkhead.md`. This
branch is a **deliberate re-implementation at the maintainer's direction**, not an accidental
duplicate. Two consequences worth carrying: (a) #403 found the F-1 Blocker below, which this
branch also had until it was cross-checked — the finding is a fact about Boot, not a matter of
taste; (b) #403 ships a `MailListenerExecutorArchitectureTest` making the "name the mail
executor" rule structural, which this branch does **not** yet have and should port, because
#373 and #374 will each reach for `@ApplicationModuleListener` — the documented, obvious way to
write a registry listener, and the one that lands on the shared pool.

**Skills consulted:**
- `riviera-sdlc` — ran the Skill-routing gate; matched the "writing/refactoring any backend
  Java" row (annotations + one new bean, no new module, port, event, adapter or class move).
- `riviera-plan-doc` — this template and its discipline.
- `riviera-modulith` — confirmed the executor bean belongs in `notification/application/`
  beside `AsyncMailDispatcher` (the module already owns a pool there) rather than at the
  composition root, and that `PackageShapeArchitectureTests` permits a `@Configuration` in
  `application/`; also supplied the `listener_id`/event-move rule behind R-1.
- `riviera-java-conventions` — §8 "virtual threads are a deliberate, deferred config
  decision … don't flip `spring.threads.virtual.enabled` casually" is the direct basis for
  rejecting the virtual-thread alternative in D-3; §6c (one-line comments) and §10
  (parameterized logging, no PII) shape the new code.
- `codebase-design` — **assessed, not loaded.** The slice introduces no new module seam:
  the executor is module-internal infrastructure, and no `api/`, `spi/` or `vocabulary/`
  surface changes. To be loaded if OQ-2 promotes the executor to a published surface.
- `riviera-local-debug` — **to load at execution**, before the first `./gradlew` of the
  implementing session (scoped-test recipe; the bare `test` task OOMs the cloud sandbox).

**Branch:** `claude/issue-383-mailer-blocking-s9nhnf` — **deviates from the template's
`<feature|bugfix>/<short-slug>`**: the branch is assigned by the session harness and must
not be renamed. Already exists and is checked out.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC against the application boundary —
> the inner hexagon — not the outside technology.**

- [x] **AC-1 (the issue's headline):** Given a `Mailer` that blocks indefinitely on
  `sendBookingConfirmation`, when enough bookings are confirmed to occupy every mail
  thread and then one further `PaymentConfirmed` is published, then that booking still
  reaches `CONFIRMED` and its `BookingConfirmed` still accrues exactly one
  `payout_ledger_entry`, within a bounded wait. *Pinned by:*
  `ConfirmationMailBulkheadIT.aBlockedRelayDoesNotDelayTheMoneyPath`

- [x] **AC-2 (the connection half):** Given the same blocking mailer, when it is called,
  then no transaction is active on that thread and no `DataSource` resource is bound to it
  — i.e. the SMTP call holds no pooled connection. *Pinned by:*
  `ConfirmationMailBulkheadIT.theSendHoldsNoTransactionAndNoConnection`

- [x] **AC-3 (bounded, with documented saturation):** Given the mail executor's queue is
  full, when a further `BookingConfirmed` is delivered, then the booking still reaches
  `CONFIRMED` and accrues its payout entry, and that event's publication row is left
  **incomplete** (`completion_date IS NULL`) — the send is shed, never silently marked done,
  and the saturation is counted. *Pinned by:*
  `ConfirmationMailBulkheadIT.saturationShedsTheSendAndLeavesThePublicationOutstanding`
  (fact 9 proves the money path is safe from framework sources; this AC is the regression test
  that keeps it true across upgrades)

- [x] **AC-4 (registry durability intact — the reason this wasn't done in #371):** Given a
  `BookingConfirmed` whose listener failed, when outstanding publications are resubmitted
  (what `republish-outstanding-events-on-restart` does at boot), then the confirmation mail
  is delivered; and given one that succeeded, resubmission produces **no** second mail.
  *Pinned by:* `ConfirmationMailBulkheadIT.aFailedSendStaysOutstandingAndIsRedeliveredOnResubmission`
  — **moved off `BookingConfirmationMailIT`**, which the plan originally named: proving the *failed*
  side needs a transport that fails on demand, and adding a fail-next hook to the production
  `MockMailer` would put test-only machinery in shipped code. The bulkhead IT's probe is test-only
  and already exists. `BookingConfirmationMailIT` keeps the completed half, unchanged

- [x] **AC-5 (no orphaned publications):** Given the decomposition in phase 1, when a
  `BookingConfirmed` publication is written, then its `listener_id` is byte-identical to
  the pre-change value
  (`ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)`),
  so no Flyway `listener_id` rewrite is needed. *Pinned by:*
  `ConfirmationMailBulkheadIT.decompositionKeepsTheRegistryListenerId` — **moved into phase 0**
  with the decomposition (fact 10), and folded into the bulkhead IT rather than a class of its
  own so the two assertions share one Spring context

- [x] **AC-6 (its own pool):** Given a `BookingConfirmed`, when the listener runs, then it
  runs on a thread whose name carries the dedicated confirmation-mail prefix and **not** on
  `applicationTaskExecutor` (`task-`). *Pinned by:*
  `ConfirmationMailBulkheadIT.theListenerRunsOnItsOwnPool`

- [x] **AC-7 (no regression to the shipped behaviour):** Given the existing #371/#382/#390
  suite, when the change lands, then `BookingConfirmationMailIT`, `MailSenderWiringIT`,
  `TransactionalMailServiceTest`, `SuppressedConfirmationMailDeliveryTest` and
  `ModularityTests` all still pass unchanged. *Pinned by:* those classes, run as the
  phase-2 regression scope.

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **Moving the confirmation mail off the Event Publication Registry.** The vehicle is
  ADR-0011 decision 5 and correct; this slice changes the executor and transaction posture
  only.
- **Enabling virtual threads** (`spring.threads.virtual.enabled`). Rejected in D-3, with
  reasons; if it is ever revisited it is a platform-wide decision with Hikari sizing
  attached, not a mail fix. Worth its own issue on the merits.
- **Resizing the Hikari pool** (still the stock 10 — nothing in the repo sets
  `spring.datasource.hikari.*`). This slice removes mail's claim on the pool; it does not
  re-argue the pool's size.
- **Fixing the shared single scheduler thread** — the four `@Scheduled` sweeps on Boot's
  default `spring.task.scheduling.pool.size=1`. Same *class* of defect, different beans,
  already filed as **#395**.
- **Building the bounce feed / permanent-failure absorption** (#372, ADR-0011 decision 7).
  See R-4: this slice inherits, and does not close, the "permanently failing send keeps
  `riviera.outbox.pending` high" carryover (issue #383's *Related* note, F-10 from #371).
- **An admin resend surface** (#380 — resending a mail whose publication is already
  *complete*, which the registry will never retry).
- **An admin trigger for resubmitting *incomplete* publications** (**#405**, filed from this
  plan's findings). Different mechanism from #380, and out of scope here: today's only retry
  is at restart (fact 8), and this slice does not change that either way.
- **Touching the recovery vehicle** (`AsyncMailDispatcher`). Its pool, its
  drop-on-saturation semantics, and its callers are unchanged — only its Javadoc's claim
  is made true for the other vehicle too (AC in #383's list, phase 3).

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface.** A "refactor only,
> no behavior change" claim is **aspirational until verified**.

This slice replaces `@ApplicationModuleListener`'s bundled execution posture on one
listener. The annotation is sugar for three decisions; the ledger enumerates what each
currently buys and what happens to it.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `@TransactionalEventListener(AFTER_COMMIT)` — mail only after the booking commits | **preserved** | phase 1 keeps `@TransactionalEventListener` explicitly; its default phase *is* `AFTER_COMMIT`, and `CompletionRegisteringAdvisor`'s pointcut only matches `AFTER_COMMIT` listeners, so a drift here would disable registry tracking loudly (AC-4/AC-5) |
| Registry tracking — publication written, completed only on successful return | **preserved** | the advisor's pointcut is `@TransactionalEventListener`, not `@ApplicationModuleListener`; verified by reading `CompletionRegisteringAdvisor` (2.1.0). Pinned by AC-4 + AC-5 |
| `republish-outstanding-events-on-restart` redelivers a failed send | **preserved** | unchanged config; AC-4 now tests the *failed* side, which the existing suite did not |
| At-least-once, no dedupe table (#371's accepted guarantee) | **preserved** | unchanged — the crash window (mail sent, process dies before `markCompleted`) is identical, because `markCompleted` was never inside the listener's transaction (see "Verified mechanics") |
| `@Async` on `applicationTaskExecutor` | **changed** | moves to a dedicated bounded pool. This is the point of the slice (AC-6) |
| Unbounded queueing of pending sends | **changed → bounded** | Boot's default queue is `Integer.MAX_VALUE`; the new pool is bounded with an explicit saturation behaviour (AC-3, OQ-1) |
| `@Transactional(REQUIRES_NEW)` around the whole listener body | **dropped** | the listener performs four reads and **zero writes**; nothing needs a consistency boundary, and the transaction's only real effect was pinning a connection across the SMTP call (AC-2). Registry completion is unaffected — it never joined this transaction |
| Four reads seeing one consistent snapshot | **dropped (deliberate)** | with no transaction each read auto-commits independently. Nothing here depends on cross-read consistency: booking code, set label and contact email are immutable facts of a confirmed booking, and a mid-read change would at worst mail a renamed venue's new name |
| Failure semantics: a transport throw leaves the publication outstanding | **preserved** | unchanged — the `@Async` exception path still bypasses `markCompleted`. AC-4 |
| Skip-and-log on missing booking / set / contact | **preserved** | untouched listener body |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Registry `listener_id` drift.** The registry stores the listener's FQ method signature; a rename/move orphans outstanding rows (the V18 + V31/#382 lesson) | low | high | Class, package and method signature left untouched — the decomposition is annotation-only. `listener_id` is derived by `TransactionalApplicationListenerMethodAdapter#getListenerId()` from the *method*, not from which annotation declared it. **Verified green in phase 0**, and the frozen string is asserted in-repo so a future move fails loudly rather than silently orphaning rows; no Flyway rewrite needed | implementer | closed in `eb442c4` — pinned by AC-5 |
| R-2 | **A rejected submission throws onto the money-path thread.** `@Async` submits on the caller's thread — here the `AFTER_COMMIT` synchronization of the *booking/payment* commit. A `TaskRejectedException` from a saturated pool could surface inside `commit()` | — | — | **Closed at plan time — the exception provably cannot escape** (fact 9): `AFTER_COMMIT` is dispatched from `afterCompletion`, and `TransactionSynchronizationUtils.invokeAfterCompletion` catches `Throwable` and logs it; the commit itself already completed, in a `finally` *before* that call. The chosen handler swallows anyway (OQ-1), so this is belt-and-braces. **AC-3 still asserts it** — a proof read from framework sources is not a regression test, and a framework upgrade could change it. `CallerRunsPolicy` remains forbidden: it would run the SMTP call *on* the money-path thread, the exact failure this slice removes | planner | closed — pinned by AC-3 |
| R-3 | Removing the listener's transaction widens the at-least-once crash window | **closed at plan time** | — | Verified against Modulith 2.1.0 sources: `DefaultEventPublicationRegistry#markProcessing`/`markCompleted`/`markFailed` are each `@Transactional(REQUIRES_NEW)`, and `CompletionRegisteringMethodInterceptor` orders at `HIGHEST_PRECEDENCE + 10` vs the transaction advisor's default `LOWEST_PRECEDENCE`, so completion always ran *outside* the listener's transaction. The window is unchanged | planner | closed — no code change needed |
| R-4 | A **permanently** failing send (550 to a mistyped address) never completes, is resubmitted every restart, and holds `riviera.outbox.pending` above `MoneyPathAlertCheck`'s threshold for a non-money reason | med | med | **Carried, not closed.** Absorbing it needs ADR-0011 decision 7's bounce feed (#372). This slice must not make it worse: AC-3's shed-and-leave-outstanding behaviour adds a *second* way to hold a publication open, so phase 3 records the interaction in the plan + `docs/runbooks/observability.md`, and OQ-1 weighs it. Noted on **#405** too — a manual retry button makes this easier to trip, not harder | implementer | open → defer to #372 |
| R-5 | Under-sizing the new pool turns a healthy-relay burst into shed sends | low | low | Sized by OQ-2 (2 threads / 100 queue, both env-tunable) against the actual context: the app is unreleased, zero venues and zero customers, so the queue cannot fill today. Saturation is visible — counted, logged once per episode, and the publications stay outstanding — never silent. Because both numbers are properties, a real-volume correction is an env change, not a redeploy | implementer | closed — sized, see OQ-2 |
| R-6 | A wedged send delays graceful shutdown / redeploy | low | low | Mirror `AsyncMailDispatcher`: `setWaitForTasksToCompleteOnShutdown(true)` with a short `awaitTerminationSeconds`, so a redeploy drains briefly and then abandons — the abandoned publication stays outstanding and is resubmitted at boot | implementer | open |
| R-7 | Module-boundary regression — the executor bean lands in the wrong package or pulls a new dependency | low | med | The bean is module-internal, in `notification/application/` beside `AsyncMailDispatcher`; no `allowedDependencies` change (no new module is referenced). Pinned by `ModularityTests` + `PackageShapeArchitectureTests` in the phase-2 regression scope | implementer | open |
| R-8 | Two extra `REQUIRES_NEW` registry transactions (`markProcessing`, `markCompleted`) bracket every invocation on the new small pool, each taking a connection | low | low | Both already happen today and are unaffected by this slice. Precisely: `markCompleted` is one short single-row write; **`markProcessing` issues no SQL at all** — it is a no-op `default` on `EventPublicationRepository` that `JdbcEventPublicationRepository` does not override (fact 8) — but its `REQUIRES_NEW` still checks a connection out eagerly, so the checkout is real and the statement is not. Noted so a reviewer reading "the listener holds no connection" is not surprised to see three brief checkouts per mail | planner | closed — documented, no action |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

**OQ-1 and OQ-2 are both resolved** (below); **OQ-3 is open but does not block** — it resolves
at phase 3, and nothing before it depends on the answer.

- **Open question OQ-3 — does ADR-0011 need an amendment?** Decision 5 (which vehicle a mail
  uses) is unchanged and stays correct. What changes is a property ADR-0011 did not state:
  *the registry vehicle also gets its own bounded pool and holds no transaction across the
  transport*. Candidates: amend ADR-0011 (as #397 did for the fail-open carve-out), or record
  it in `RESPONSIBILITIES.md` + the listener Javadoc only. *Owner:* implementer ·
  *Resolves by:* phase 3.
- **Assumption A-1:** production runs neither `mailer` nor `smtp4dev`, so the defect is
  latent and this slice ships no user-visible behaviour change. Basis: `MockMailer` is
  `@Profile("!mailer & !smtp4dev")` and `CLAUDE.md` states prod activation is gated on #370.
  *Owner:* implementer · *Resolves by:* phase 0 (confirm the deployed
  `SPRING_PROFILES_ACTIVE` before claiming "latent" in the PR body).
- **Assumption A-2:** no consumer depends on the four listener reads sharing one snapshot
  (ledger row 8). Basis: all four are immutable facts of an already-confirmed booking.
  *Owner:* implementer · *Resolves by:* phase 0 review.

### Resolved

- **Resolved (planning) — OQ-2, pool size and queue capacity → `core = max = 2`,
  `queue = 100`, both `${VAR:default}` properties.** Settled with the maintainer against the
  actual context: **the app is unreleased — zero venues, zero customers.** So the queue will
  not fill and the pool will not be contended; any value across a wide range is correct, and
  the decision is not worth more investment than this paragraph.
  - **Two threads, not one — the argument is structural, not volumetric,** so zero volume does
    not weaken it. Throughput never selects the count: `JavaMailSenderImpl` opens a session per
    `send()`, so even one thread at ~0.5s/send is ~7,200 mails/hour, far above anything this
    business will produce. What selects it is head-of-line blocking.
    `AsyncMailDispatcher`'s own Javadoc names the hazard of its single-drainer shape — *"one
    serial drainer means one wedged task stalls the queue and then silently drops sends once
    the 100 slots fill"* — and accepts it because everything on that thread is bounded. Here it
    is **not**: fact 6 shows a degraded relay holding a thread far past any configured timeout.
    Copying 1 would knowingly inherit that hazard in the one place its precondition fails.
    Core and max stay equal (a `ThreadPoolExecutor` grows past core only once the queue is
    full, so an unequal max would buy nothing until 100 sends were already backed up).
  - **Queue 100** — deliberately the sibling's number. No better one is derivable from data
    that does not exist, and one depth across both mail pools makes them legible together.
    Depth matters less than instinct suggests anyway: a shed mail and a queued mail are in the
    *same* state (undelivered, outstanding, retried together), and outage visibility does not
    depend on it, since `riviera.outbox.pending` climbs from the **first** failed send, long
    before the queue fills.
  - **Configurable, and the decisive reason is the test, not ops tuning.** AC-3 must saturate
    the queue; against a hard-coded 100 that means enqueuing 100+ blocked tasks — slow and
    brittle. As a property the test sets capacity to 1 via `@TestPropertySource` and the setup
    is two lines. Configurability therefore pays for itself immediately, at zero volume,
    whether or not anyone ever tunes it. Precedent: `riviera.ratelimit.username.capacity`
    carries `${VAR:default}` for exactly this "env-tunable without a rebuild" reason.
    `AsyncMailDispatcher` hard-codes its constants — defensible there, where volume was known
    and tiny; not here, where it is unknown and grows with the business.
  - **Check against the provider at #370:** relays commonly cap concurrent connections (often
    5–10). Two threads sits comfortably under any such limit, but confirm Scaleway TEM's actual
    number when the account is created.

- **Resolved (planning) — OQ-1, what should saturation do? → shed the send, log it once,
  count it; never throw.** The deciding question was whether a `TaskRejectedException` could
  reach the money path. **It cannot** (fact 9), so both candidate policies are safe and both
  give *identical* durability — the publication is left untouched either way, because `@Async`
  is outermost and the rejection happens before `proceed()`, so no completion advice runs.
  With safety off the table the choice came down to evidence quality, and `AbortPolicy` loses:
  its operator-visible artefact is Spring's generic
  `"TransactionSynchronization.afterCompletion threw exception"` at ERROR, emitted immediately
  after a payment confirm — a message that reads like the money path just broke, told loudly,
  at exactly the moment someone is diagnosing an outage under pressure. So: a custom
  `RejectedExecutionHandler` that logs one purposeful line and swallows.
  Three riders, from the reasoning rather than the mechanism:
  1. **A shed send is a symptom, not an independent loss.** For the handler to fire, the queue
     is already full — so the mails ahead of it are *equally* undelivered and outstanding.
     Shedding declines to reserve a slot; it does not lose a mail the queue would have saved.
  2. **ERROR, not WARN** — someone paid and will not get their arrival code until a restart or
     #405 — but **throttled to one per episode**, not one per shed: a relay outage during a
     cutoff burst could otherwise emit hundreds and bury the logs that matter.
  3. **Count it** (`ObservabilityMetrics`, already Prometheus-scraped) — the counter is worth
     more than the log line, since it makes saturation visible before a user complains.
  Never `CallerRunsPolicy`: it would run the SMTP call on the money-path thread. Closes R-2.
  Reversible — a one-line swap on a bean behind an interface — so it is not worth relitigating.

- **Resolved (planning) — does the registry's completion write ride inside the listener's
  transaction?** **No, and it structurally cannot.** Two independent mechanisms: the
  completion advisor orders outside the transaction advisor
  (`HIGHEST_PRECEDENCE + 10` vs `LOWEST_PRECEDENCE`, `AbstractPointcutAdvisor#getOrder`
  falling through to the advice's order), and `markProcessing`/`markCompleted`/`markFailed`
  are each `@Transactional(REQUIRES_NEW)` on `DefaultEventPublicationRegistry`, which would
  suspend any ambient transaction rather than join it. Consequence: phase 0 is safe on its
  own and does not change the at-least-once crash window. Closes R-3.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No code path in this slice reads or writes
`availability(set_id, booking_date)`. The listener assembles a message from three read
ports and hands it to the transport; the claim/release happens in `booking` at claim time,
far upstream and untouched.

The connection is worth stating in the negative, because it is what the slice protects: a
mail send that pins 8 of 10 Hikari connections starves *every* DB-touching path, including
`availability`'s `SELECT … FOR UPDATE`. Removing mail's claim on the pool (AC-2) reduces
pressure on invariant #2's machinery; it does not change its logic. This is the same
reasoning that made the global `spring.jdbc.template.query-timeout` the wrong instrument in
#386 and #395.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state, no aggregate) | It owns transactional-mail **delivery**, including both vehicles (ADR-0011 decision 5). *How* a vehicle executes — which pool, which transaction posture — is part of delivery, not of `booking`'s or the root's job |

**Cross-module named interfaces (`api/` ports)**

**None added or changed.** `notification::api` (`MailSender`, `MailDeliverability`) is
untouched; so are the consumed `booking::api`/`::events`/`::spi`/`::vocabulary`,
`venue::api`, `customer::api` and `shared`. No `allowedDependencies` edit — the slice
references no module it does not already reference.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, setId, bookingDate, amountMinor, currency }` | `payout` (accrual), `notification` (this listener) | async `AFTER_COMMIT`, registry-backed | `BookingConfirmationMailIT`, `ConfirmationMailBulkheadIT` |

**No event is added, moved or renamed**, so no Flyway `event_type` rewrite is needed. The
adjacent `listener_id` concern is R-1 / AC-5.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The dedicated bounded executor that carries registry-borne mail | `notification` | `notification` **Job**: "own transactional-mail delivery … the two delivery vehicles". The module already owns the sibling pool (`AsyncMailDispatcher`) in `application/`, so this is the same job, not a new one. Not the composition root: the root's job is auth/edge + wiring (RV-BE-11, `CompositionRootDisciplineTests`), and an executor that exists to serve one module's transport is not app-wide config like `SecurityConfig`/`TimeConfig` |
| The listener's transaction posture (no transaction across the transport) | `notification` | Same **Job** line. The listener is `notification`'s own driving adapter (`adapter/in`, moved there by #382); nothing in `booking` or `payout` observes or depends on it |
| Protecting the money-path spine from a degraded relay | `notification` (by construction) | `payout` **Not-My-Job** does not include "defend itself from other modules' listeners", and `booking` cannot see who else subscribes to its event. The only module that can bound mail's resource use is the one that owns mail |

All three sit inside one module; **no boundary changes, no new cross-module interaction.**

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no Stripe call, no ledger arithmetic, no
refund decision, no amount is computed or rounded. `riviera-stripe-payments` not loaded.

The payout **ledger** appears only as a *victim* to be protected, never as a thing this
slice changes: **AC-1** asserts that `BookingConfirmed` → `BookingConfirmedPayoutListener`
still accrues **exactly one** `payout_ledger_entry` while mail is blocked — i.e. invariant
#9's exactly-once property is preserved under the failure mode, using the existing accrual
code untouched.

## Angular — frontend surfaces touched

**N/A — backend-only.** No file under `frontend/` changes. No `playwright-cli` e2e is owed:
nothing user-observable changes (A-1 — the mock mailer is what runs today, and it is
instant either way).

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, status code or error body is added or
altered.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh
> session, or whenever unsure where the work stands: re-read this section (plus the current
> stage's `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records.

**Stage pointer:** `implement — phases 0-2 complete, phase 3 (substrate close-out) next`

**Next action:** Start **phase 3** — the substrate close-out: resolve **OQ-3** (amend ADR-0011 vs
Javadoc + `RESPONSIBILITIES.md` only), update `AsyncMailDispatcher`'s Javadoc so its stated rule
reads as holding for both vehicles, correct `CLAUDE.md`'s "gated on #370 alone" line, and record
R-4's interaction on #372. **Every AC (1-7) is now green.**

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Take the transaction off the send (**+ decomposition, AC-5**) | ✅ | `eb442c4` |
| 1 — Dedicated bounded executor (qualifier + bean only) | ✅ | `e1545ab` |
| 2 — Registry durability + saturation proof | ✅ | `42c78b5` |
| 3 — Substrate: ADR/RESPONSIBILITIES/Javadoc close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | cross-check against **PR #403** (the earlier, independent implementation of #383) | **Blocker — the bulkhead removed a bound from the path it protects.** Declaring the mail pool as a plain `Executor` bean made Boot skip `applicationTaskExecutor` entirely, so every unqualified `@Async` — all four money-path listeners — fell back to an unbounded executor. **Every test still passed**, because unbounded threads always keep up: AC-1 asserts the money path *works*, not which executor it works on | fixed in `<sha>` — `defaultCandidate = false`, pinned by `ConfirmationMailBulkheadIT.declaringTheMailPoolLeavesBootsSharedExecutorInPlace` (verified RED before the fix: the bean was absent) |

---

## Verified mechanics (read before touching the annotations)

> Facts established at plan time by reading the dependency sources, so the implementer does
> not re-derive them. Versions: Spring Boot 4.1.0, Spring Framework 7.0, Spring Modulith 2.1.0.

1. **`@ApplicationModuleListener` = `@Async` (no qualifier) + `@Transactional(REQUIRES_NEW)`
   + `@TransactionalEventListener`.** It aliases `readOnlyTransaction`, `id`, `condition` and
   **`propagation`** — but **not** the async executor. That missing alias is the whole reason
   phase 1 needs decomposition, and the present `propagation` alias is what makes phase 0 a
   one-line change.
2. **Async is enabled by Modulith, not by this repo.** `EventPublicationAutoConfiguration`
   imports `AsyncEnablingConfiguration` (`@EnableAsync`,
   `@ConditionalOnMissingBean(AbstractAsyncConfiguration.class)`). The repo declares no
   `@EnableAsync` and no `AsyncConfigurer`, so Boot's
   `ApplicationTaskExecutorAsyncConfigurer` supplies `applicationTaskExecutor` to every
   `@Async` method. **Do not add a bare `@EnableAsync`** — it changes nothing and would only
   move which configuration class owns the switch.
3. **The shared pool is 8 threads with an unbounded queue.** Boot 4.1
   `TaskExecutionProperties.Pool`: `coreSize = 8`, `queueCapacity = Integer.MAX_VALUE`,
   `maxSize = Integer.MAX_VALUE`. Because the queue is unbounded the pool **never grows past
   8** — `maxSize` is unreachable. Five listeners share it: this one, `PaymentEventListener`
   (×2), both payout listeners, and `BookingRefundListener`.
4. **The transaction holds a connection for the whole method.** Boot autoconfigures
   `JdbcTransactionManager` (a `DataSourceTransactionManager`), which acquires the
   `Connection` eagerly at `doBegin`; there is no `LazyConnectionDataSourceProxy`. Nothing in
   the repo sets `spring.datasource.hikari.*`, so `maximumPoolSize` is HikariCP's own default
   of **10**.
5. **Registry completion never joins the listener's transaction** — see the Resolved entry
   above. Phase 0 therefore cannot change durability.
6. **The SMTP timeouts do not bound the call.** `application-mailer.properties` sets 10s
   connect / read / write, but `mail.smtp.timeout` and `writetimeout` are **per socket
   operation**, and `JavaMailSenderImpl` opens a fresh connection per `send()`. A relay
   answering just under 10s at each step of a ~10-exchange session holds the thread far
   longer than the 30s the issue text estimates. **The blocking-mailer test must not assume a
   30s ceiling** — block on a latch released by the test, not on a timeout.
7. **The `@Async` interceptor is outermost** (`AsyncAnnotationBeanPostProcessor` calls
   `setBeforeExistingAdvisors(true)`), so the chain is
   `@Async → CompletionRegistering → Transaction → method body`. Consequence for AC-3: if a
   submission never reaches the pool, no completion advice runs at all, so the publication is
   left untouched — which is the behaviour OQ-1 (a) relies on.
8. **A failed or shed send is durable, but retried only at restart** — and only
   `completion_date` records it. The publication row is INSERTed by
   `PersistentApplicationEventMulticaster.multicastEvent` → `storePublications(...)` on the
   *publishing* thread, inside the booking's own transaction, before any delivery attempt, so
   it is atomic with the booking. On failure `markCompleted` is never reached and
   `completion_date` stays NULL; with `completion-mode=archive` a *successful* publication is
   moved to `event_publication_archive`, so the live `event_publication` table is effectively
   the "not yet delivered" queue. Retry comes solely from
   `afterSingletonsInstantiated` → `resubmitIncompletePublications(__ -> true)` under
   `republish-outstanding-events-on-restart` — **there is no scheduled retry**, and the
   `modulith` actuator endpoint is deliberately unexposed (#75), so there is no operational
   trigger today. **#405** adds one. Two traps for anyone reading the schema: `markProcessing`
   and `markFailed` are no-op `default` methods the JDBC repository does not override, so V8's
   `status` / `completion_attempts` / `last_resubmission_date` columns stay NULL on every row
   and nothing may be built on them; and `markResubmitted` likewise defaults to `return true`,
   so the framework's documented "another instance already claimed this" guard is inert here.
11. **Declaring any `Executor` bean suppresses Boot's `applicationTaskExecutor`.**
   `TaskExecutorConfigurations.TaskExecutorConfiguration` — which declares the
   `applicationTaskExecutor` bean — is annotated `@Conditional(OnExecutorCondition.class)`, an
   `AnyNestedCondition` whose first branch is `@ConditionalOnMissingBean(Executor.class)` (the
   second is `spring.task.execution.mode=force`). So a second, unguarded `Executor` bean makes
   Boot skip the whole configuration, and every unqualified `@Async` falls back to an unbounded
   executor — silently, since no test asserts *which* executor the spine runs on.
   `@Bean(defaultCandidate = false)` keeps the bean out of by-type resolution, satisfying the
   condition, while `@Async(BEAN_NAME)` still resolves by name. See F-1.
10. **`propagation = NOT_SUPPORTED` removes the transaction but NOT the connection hold** —
   discovered by AC-2 going red on the "one-line fix" in phase 0, and the reason the
   decomposition moved from phase 1 into phase 0. With nothing to suspend,
   `AbstractPlatformTransactionManager.getTransaction` takes the *"Create "empty" transaction:
   no actual transaction, but potentially synchronization"* branch and sets
   `newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS)` — which is
   the default. Synchronization is therefore **active** for the method's scope, so
   `DataSourceUtils.doGetConnection` takes its `isSynchronizationActive()` branch, binds the
   first read's `ConnectionHolder` to the thread and registers a `ConnectionSynchronization` to
   release it at scope completion. Net effect: `isActualTransactionActive()` goes false while
   `hasResource(dataSource)` stays true — the connection is still pinned across the SMTP call.
   The same reasoning rules out `SUPPORTS` and `NEVER`; every non-actual-transaction propagation
   goes through that one branch. **Only removing `@Transactional` outright releases the
   connection.** This is why AC-2 asserts `hasResource`, not just `isActualTransactionActive`:
   the weaker assertion would have passed on a fix that did not work.
9. **A rejected `@Async` submission cannot fail the money path.** `AFTER_COMMIT` is dispatched
   from `TransactionalApplicationListenerSynchronization.PlatformSynchronization.afterCompletion(int)`
   — *not* from `afterCommit()` — and `AbstractPlatformTransactionManager.processCommit` calls
   `triggerAfterCompletion(status, STATUS_COMMITTED)` in a **`finally`**, after the commit has
   already succeeded. `TransactionSynchronizationUtils.invokeAfterCompletion` wraps each
   synchronization in `try { … } catch (Throwable ex) { logger.error(…) }`. Meanwhile
   `AsyncExecutionAspectSupport.doSubmit` for a `void` method is
   `executor.submit(task); return null;` with no catch, so a `TaskRejectedException` *does*
   propagate out of the interceptor — and is then caught and logged by the transaction
   infrastructure. It can reach neither the booking commit nor the payout listener (a separate
   synchronization). This is what closes R-2 and settles OQ-1.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java`
  — **modify.** Phase 0: `@ApplicationModuleListener(propagation = Propagation.NOT_SUPPORTED)`.
  Phase 1: decompose into `@Async("<executor>")` + `@TransactionalEventListener`. Class name,
  package and method signature are **frozen** (R-1). Javadoc rewritten to carry the new
  posture and the `AsyncMailDispatcher` cross-reference.
- `platform/src/main/java/ai/riviera/platform/notification/application/ConfirmationMailExecutorConfig.java`
  — **create.** The dedicated bounded `ThreadPoolTaskExecutor` beside `AsyncMailDispatcher`, with
  its `SaturationPolicy` (the shed handler + the per-episode-log `TaskDecorator`). Named
  `…Config`, not `ConfirmationMailExecutor`: a `@Configuration` class registers under its own
  decapitalized name, which collided with the `@Bean("confirmationMailExecutor")` it declares
  (`BeanDefinitionOverrideException` at context load). Public only so `adapter/in` can name the
  bean in `@Async`, whose value must be a compile-time constant.
- `platform/src/main/resources/application.properties` — **modify.** The two pool knobs as
  `${VAR:default}` placeholders (OQ-2).
- `platform/src/test/java/ai/riviera/platform/notification/ConfirmationMailBulkheadIT.java`
  — **create.** AC-1, AC-2, AC-3, AC-6. Testcontainers + `@EnabledIfDockerAvailable`, matching
  `BookingConfirmationMailIT`'s harness.
- `platform/src/test/java/ai/riviera/platform/notification/ConfirmationMailListenerIdIT.java`
  — **create.** AC-5.
- `platform/src/test/java/ai/riviera/platform/notification/BookingConfirmationMailIT.java`
  — **modify.** Extend AC-4 to the *failed-publication* side (today only the completed side
  is covered).
- `RESPONSIBILITIES.md` — **modify** (phase 3): the `notification` Job line gains the
  execution posture of the registry vehicle.
- `docs/adr/ADR-0011-*.md` — **modify, pending OQ-3.**
- `CLAUDE.md` — **modify** (phase 3): the module table's `notification` row and the epic-#367
  bullet currently say prod activation is "gated on #370 provider setup alone"; #383 is a
  second gate until it closes.

---

## Phase 0 — Take the transaction off the send ✅

**Goal:** the SMTP call holds no pooled connection. Independently valuable, independently
mergeable, and — per the Resolved entry — provably neutral to registry durability.

> **What actually happened (plan correction).** Step 3's one-line
> `propagation = NOT_SUPPORTED` **did not work**: AC-2 stayed red on the connection assertion
> while the transaction assertion went green (fact 10 — an "empty transaction" still activates
> synchronization, and `DataSourceUtils` then binds the connection for the scope). Removing
> `@Transactional` outright is the only fix, which means **the decomposition into `@Async` +
> `@TransactionalEventListener` landed here, not in phase 1**. Consequences: **AC-5 moved into
> this phase** (the registry `listener_id` had to be pinned the moment the annotation changed)
> and **R-1 closed here**. Phase 1 is now purely additive — the executor bean plus the
> `@Async` qualifier. This is the fix arriving one phase earlier than planned, not extra scope.

**Files:** Modify `notification/adapter/in/BookingConfirmationMailListener.java` · Create
`notification/ConfirmationMailBulkheadIT.java` (AC-2 + AC-5)

- [ ] **Step 1: Write the failing test**

```java
/**
 * AC-2 — the transport must not run inside a transaction: a blocking relay would otherwise
 * pin a Hikari connection (stock pool: 10) for the length of a third-party network call.
 */
@Test
void theSendHoldsNoTransactionAndNoConnection() throws Exception {
	AtomicBoolean txActive = new AtomicBoolean(true);
	AtomicBoolean connectionBound = new AtomicBoolean(true);
	CountDownLatch sent = new CountDownLatch(1);

	probeMailer.onSend(() -> {
		txActive.set(TransactionSynchronizationManager.isActualTransactionActive());
		connectionBound.set(TransactionSynchronizationManager.hasResource(dataSource));
		sent.countDown();
	});

	publishConfirmedBooking();

	assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).as("the confirmation mail never ran").isTrue();
	assertThat(txActive).as("the SMTP call must not run inside a transaction").isFalse();
	assertThat(connectionBound).as("the SMTP call must hold no pooled connection").isFalse();
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ConfirmationMailBulkheadIT*"`
  → FAIL: `the SMTP call must not run inside a transaction — expected false but was true`

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite. Load
> `riviera-local-debug` first — the wrapper cannot self-provision behind the repo proxy.

- [x] **Step 3: Minimal implementation** — attempted `@ApplicationModuleListener(propagation =
  Propagation.NOT_SUPPORTED)` first; it left `hasResource(dataSource)` true (fact 10), so the
  landed fix drops `@Transactional` entirely:

```java
	@Async
	@TransactionalEventListener
	void on(BookingConfirmed event) {
```

- [x] **Step 4: Run it, verify it passes** — `gradle test --tests "*ConfirmationMailBulkheadIT*"`
  → PASS, `tests="2" skipped="0" failures="0"`. Regression scope also green: the structural net
  (`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`, `CompositionRootDisciplineTests`) and the
  durability suite (`BookingConfirmationMailIT` 5/5 — including the AC-4 resubmission case —
  `ListenerMoveMigrationIT`, `MailSenderWiringIT`), none skipped.

> Scope (end-of-phase regression): `--tests "*notification*"` plus
> `--tests "*BookingConfirmationMailIT*"` — the durability suite must be untouched.

- [x] **Step 5: Generalization-audit pass** — two searches, both recorded in the log below.
  Four `@ApplicationModuleListener` sites remain; only **`BookingRefundListener`** shares the
  shape (calls `payment`'s `RefundPort` → **Stripe** inside `REQUIRES_NEW`). Deferred, not
  absorbed: it lives in `booking` + `payment`, outside this `notification` slice, and it is
  **bounded** where mail is not — Stripe's timeouts are explicit and finite (`PT5S` connect /
  `PT20S` read, `application.properties`), so the hold is ~25s rather than open-ended, and
  refunds are far rarer than confirmations. Same class of defect, materially smaller. No other
  site uses a non-actual-transaction propagation, so nothing else inherited the fact-10 trap.

- [x] **Step 6: Commit**

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Dedicated bounded executor

**Goal:** a degraded relay cannot occupy the shared pool. Requires decomposition, because
`@ApplicationModuleListener` publishes no executor attribute.

**Files:** Create `notification/application/ConfirmationMailExecutor.java` · Modify the
listener · Extend `ConfirmationMailBulkheadIT`

> **Both inputs are decided** (Resolved): saturation sheds / logs once / counts / never throws
> (OQ-1), and the pool is `core = max = 2` with a `100`-deep queue, both `${VAR:default}`
> properties (OQ-2). No spike is needed — fact 9 answers what the spike was for.

- [ ] **Step 1: Write the failing tests** (AC-1, AC-3, AC-6)

```java
/**
 * AC-1 — the money path must be indifferent to a wedged relay. Every mail thread is parked on
 * a latch the test controls (never on a timeout — the configured SMTP timeouts are per socket
 * operation, not a session ceiling, so a duration-based test would be both slow and wrong).
 */
@Test
void aBlockedRelayDoesNotDelayTheMoneyPath() throws Exception {
	CountDownLatch release = probeMailer.blockAllSends();
	try {
		saturateMailPool();

		BookingId booking = confirmOneMoreBookingThroughPayment();

		Awaitility.await().atMost(Duration.ofSeconds(AWAIT_SECONDS))
				.untilAsserted(() -> {
					assertThat(bookingStatusOf(booking)).isEqualTo("CONFIRMED");
					assertThat(payoutLedgerEntriesFor(booking)).isEqualTo(1);
				});
	}
	finally {
		release.countDown();
	}
}

/** AC-6 — the listener runs on its own pool, never Boot's shared applicationTaskExecutor. */
@Test
void theListenerRunsOnItsOwnPool() throws Exception {
	AtomicReference<String> thread = new AtomicReference<>();
	CountDownLatch sent = new CountDownLatch(1);
	probeMailer.onSend(() -> { thread.set(Thread.currentThread().getName()); sent.countDown(); });

	publishConfirmedBooking();

	assertThat(sent.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
	assertThat(thread.get())
			.as("registry-borne mail must not share the money path's executor")
			.startsWith(CONFIRMATION_MAIL_THREAD_PREFIX)
			.doesNotStartWith("task-");
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ConfirmationMailBulkheadIT*"`
  → FAIL: AC-6 sees a `task-N` thread name; AC-1 times out waiting for `CONFIRMED`.

- [ ] **Step 3: Minimal implementation** — the executor (sizing per OQ-2, policy per OQ-1):

```java
/**
 * The pool that carries registry-borne mail (#383), deliberately separate from Boot's shared
 * {@code applicationTaskExecutor} — which carries the payment→booking and booking→payout
 * spine — and from {@link AsyncMailDispatcher}'s recovery pool, whose saturation semantics are
 * the opposite: recovery drops a send the user can re-request, whereas a shed confirmation must
 * leave its publication outstanding so the registry can retry it.
 */
@Configuration(proxyBeanMethods = false)
class ConfirmationMailExecutor {

	static final String BEAN_NAME = "confirmationMailExecutor";
	private static final String THREAD_NAME_PREFIX = "confirmation-mail-";

	@Bean(BEAN_NAME)
	ThreadPoolTaskExecutor confirmationMailExecutor() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setCorePoolSize(POOL_SIZE);
		pool.setMaxPoolSize(POOL_SIZE);
		pool.setQueueCapacity(QUEUE_CAPACITY);
		pool.setThreadNamePrefix(THREAD_NAME_PREFIX);
		pool.setRejectedExecutionHandler(shedAndLeaveOutstanding());
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		return pool;
	}

	/**
	 * Saturation (OQ-1): shed the send and return normally. Because {@code @Async} is the
	 * outermost advice, a task that never reaches the pool never reaches the completion advisor
	 * either, so the publication keeps {@code completion_date} NULL and the registry still owes
	 * the mail. Deliberately does <strong>not</strong> throw: a {@code TaskRejectedException}
	 * cannot fail the money path (it is caught by the transaction infrastructure), but it
	 * surfaces as "TransactionSynchronization.afterCompletion threw exception" beside a payment
	 * confirm — an alarming message about the wrong subsystem. One purposeful line, throttled to
	 * one per saturation episode, plus a counter, is the better artefact.
	 */
	private RejectedExecutionHandler shedAndLeaveOutstanding() { … }
}
```

and the decomposed listener — **class, package and method signature frozen** (R-1):

```java
	@Async(ConfirmationMailExecutor.BEAN_NAME)
	@TransactionalEventListener
	void on(BookingConfirmed event) {
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS

> Scope (end-of-phase regression): `--tests "*notification*"` `--tests "*ModularityTests*"`
> `--tests "*PackageShapeArchitectureTests*"` `--tests "*PublishedSurfacePlacementArchitectureTests*"`.

- [ ] **Step 5: Generalization-audit pass** — the rule "an outbound third-party call must not
  run on the shared spine executor" now has two instances (this listener, and
  `AsyncMailDispatcher`'s reason for existing). Search `@Async` + outbound adapters; the
  `BookingRefundListener` → Stripe candidate from phase 0 re-surfaces here. Record the decision.

- [ ] **Step 6: Commit** — `git commit -m "fix(#383): move registry-borne mail onto its own bounded executor (#383)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Registry durability + saturation proof

**Goal:** prove the thing that kept this out of #371 — that decomposition did not silently
convert at-least-once into fire-and-forget.

**Files:** Create `ConfirmationMailListenerIdIT` · Modify `BookingConfirmationMailIT`

- [ ] **Step 1: Write the failing tests** (AC-3, AC-4, AC-5)

```java
/** AC-5 — the registry keys on the FQ method signature; the decomposition must not move it (R-1). */
@Test
void decompositionKeepsTheRegistryListenerId() {
	publishConfirmedBookingWithAFailingMailer();

	String listenerId = jdbc.sql("SELECT listener_id FROM event_publication WHERE event_type = ?")
			.param(BOOKING_CONFIRMED).query(String.class).single();

	assertThat(listenerId).isEqualTo(EXPECTED_LISTENER_ID);
}

/** AC-4 — a failed send stays outstanding and is redelivered; a completed one is not. */
@Test
void resubmittingOutstandingPublicationsRedeliversOnlyTheFailedOne() {
	// ... one booking whose send throws, one whose send succeeds; then
	incompletePublications.resubmitIncompletePublications(__ -> true);
	// ... exactly one further mail, for the failed booking only
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ConfirmationMailListenerIdIT*" --tests "*BookingConfirmationMailIT*"`

- [ ] **Step 3: Minimal implementation** — expected to be **none**. If AC-5 fails, the
  decomposition moved the id and the slice grows a Flyway `listener_id` rewrite modelled on
  `V31__*.sql` (R-1) — a scope change to raise with the maintainer, not to absorb silently.

- [ ] **Step 4: Run it, verify it passes** — same command → PASS

> Scope (end-of-phase regression): the full `notification` package + the structural net.

- [ ] **Step 5: Generalization-audit pass** — N/A unless step 3 produced a fix.

- [ ] **Step 6: Commit** — `git commit -m "test(#383): pin registry durability and the listener id across the decomposition (#383)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Substrate close-out

**Files:** `RESPONSIBILITIES.md` · `CLAUDE.md` · `docs/adr/ADR-0011-*.md` (pending OQ-3) ·
`AsyncMailDispatcher` Javadoc · this plan doc

- [ ] **Step 1:** Resolve **OQ-3** (ADR amendment vs Javadoc + RESPONSIBILITIES only).
- [ ] **Step 2:** `AsyncMailDispatcher`'s Javadoc currently states a rule ("Boot's shared
  `applicationTaskExecutor` … a degraded relay sharing it could back up the money path") that
  was true only of its own vehicle. Update it to state that **both** vehicles now honour it,
  and cross-reference `ConfirmationMailExecutor` — this is #383's AC-4 in the issue's list.
- [ ] **Step 3:** `CLAUDE.md` — correct "prod activation is now gated on **#370 provider
  setup alone**" (the epic-#367 bullet), and add the execution posture to the `notification`
  module-table row.
- [ ] **Step 4:** `RESPONSIBILITIES.md` — the `notification` **Job** line gains: the registry
  vehicle runs on its own bounded pool and holds no transaction across the transport.
- [ ] **Step 5:** Record R-4's interaction (a shed send is a second way to hold a publication
  open, feeding `riviera.outbox.pending`) in `docs/runbooks/observability.md` and on **#372**.
- [ ] **Step 6:** Run `riviera-docs-freshness` over the branch range (merge close-out step 5).
- [ ] **Step 7:** Finalize this doc **in the PR's own last commit** — stage pointer DONE,
  every phase row ✅, Open Questions empty, every risk row closed, `merged via PR #NN`
  (never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 0 | `@ApplicationModuleListener` holding a transaction across an outbound third-party call | `grep -rn "ApplicationModuleListener" --include=*.java platform/src/main/java` | 4 listener sites: `PaymentEventListener` (×2), `BookingConfirmedPayoutListener`, `BookingCancelledPayoutListener` — all DB-only; plus **`BookingRefundListener` → Stripe `RefundPort` inside `REQUIRES_NEW`** | **Deferred, not fixed.** Same shape, but bounded (Stripe timeouts `PT5S`/`PT20S` ≈ 25s vs mail's open-ended) and rarer, and it sits in `booking` + `payment`, outside this slice. Raise with the maintainer as its own issue |
| 2026-07-29 | phase 0 | other sites relying on a non-actual-transaction propagation (which would inherit the fact-10 connection-hold trap) | `grep -rn "NOT_SUPPORTED\|Propagation.SUPPORTS\|Propagation.NEVER" --include=*.java platform/src/main/java` | none outside this listener's own Javadoc | No action — the trap is not replicated anywhere |
| 2026-07-29 | phase 1 | outbound third-party call still on the shared spine executor; any other unqualified `@Async` | `grep -rn "@Async" --include=*.java platform/src/main/java` + `grep -rln "ThreadPoolTaskExecutor" …` | The only `@Async` site is now this listener, qualified. Two executors exist, both in `notification` (`AsyncMailDispatcher`, `ConfirmationMailExecutorConfig`). `BookingRefundListener` → Stripe re-surfaces from phase 0 as the one remaining spine-executor outbound call | Unchanged decision: deferred to its own issue, not absorbed. No new sites |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1:** `./gradlew test --tests "*ConfirmationMailBulkheadIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** same command → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** same command → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*BookingConfirmationMailIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** `./gradlew test --tests "*ConfirmationMailListenerIdIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*ConfirmationMailBulkheadIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "*notification*" --tests "*ModularityTests*"` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases — **the listener's FQ method
      signature is byte-identical to `main`'s** (R-1 / AC-5).
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified); no availability write path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no
      `allowedDependencies` change; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (N/A justified); payout accrual still exactly-once
      **under the blocked-relay failure mode** (invariant #9, AC-1).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — and **no arrival code in any new log line**,
      including the new executor's saturation log.
- [ ] Flyway migration present for schema changes — **none needed**; AC-5 is the evidence
      (invariant #12).
- [ ] **Frontend** standards met or deviation documented — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`, not a merge SHA.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
