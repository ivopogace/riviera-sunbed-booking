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

- [ ] **AC-1 (the issue's headline):** Given a `Mailer` that blocks indefinitely on
  `sendBookingConfirmation`, when enough bookings are confirmed to occupy every mail
  thread and then one further `PaymentConfirmed` is published, then that booking still
  reaches `CONFIRMED` and its `BookingConfirmed` still accrues exactly one
  `payout_ledger_entry`, within a bounded wait. *Pinned by:*
  `ConfirmationMailBulkheadIT.aBlockedRelayDoesNotDelayTheMoneyPath`

- [ ] **AC-2 (the connection half):** Given the same blocking mailer, when it is called,
  then no transaction is active on that thread and no `DataSource` resource is bound to it
  — i.e. the SMTP call holds no pooled connection. *Pinned by:*
  `ConfirmationMailBulkheadIT.theSendHoldsNoTransactionAndNoConnection`

- [ ] **AC-3 (bounded, with documented saturation):** Given the mail executor's queue is
  full, when a further `BookingConfirmed` is delivered, then the money path is unaffected
  (no exception reaches the publishing/committing thread) and that event's publication row
  is left **incomplete** — the send is shed, never silently marked done. *Pinned by:*
  `ConfirmationMailBulkheadIT.saturationShedsTheSendAndLeavesThePublicationOutstanding`

- [ ] **AC-4 (registry durability intact — the reason this wasn't done in #371):** Given a
  `BookingConfirmed` whose listener failed, when outstanding publications are resubmitted
  (what `republish-outstanding-events-on-restart` does at boot), then the confirmation mail
  is delivered; and given one that succeeded, resubmission produces **no** second mail.
  *Pinned by:* `BookingConfirmationMailIT.resubmittingOutstandingPublicationsRedeliversOnlyTheFailedOne`
  (extends the existing AC-4 case, which today only covers the completed side)

- [ ] **AC-5 (no orphaned publications):** Given the decomposition in phase 1, when a
  `BookingConfirmed` publication is written, then its `listener_id` is byte-identical to
  the pre-change value
  (`ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)`),
  so no Flyway `listener_id` rewrite is needed. *Pinned by:*
  `ConfirmationMailListenerIdIT.decompositionKeepsTheRegistryListenerId`

- [ ] **AC-6 (its own pool):** Given a `BookingConfirmed`, when the listener runs, then it
  runs on a thread whose name carries the dedicated confirmation-mail prefix and **not** on
  `applicationTaskExecutor` (`task-`). *Pinned by:*
  `ConfirmationMailBulkheadIT.theListenerRunsOnItsOwnPool`

- [ ] **AC-7 (no regression to the shipped behaviour):** Given the existing #371/#382/#390
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
| R-1 | **Registry `listener_id` drift.** The registry stores the listener's FQ method signature; a rename/move orphans outstanding rows (the V18 + V31/#382 lesson) | low | high | Do not rename or move the class or method — the decomposition is annotation-only. `listener_id` is derived by `TransactionalApplicationListenerMethodAdapter#getListenerId()` from the method, not from which annotation declared it, so it must not change. Pinned by **AC-5**; if it ever does change, this slice grows a Flyway rewrite modelled on `V31` | implementer | open |
| R-2 | **A rejected submission throws onto the money-path thread.** `@Async` submits on the caller's thread — here the `AFTER_COMMIT` synchronization of the *booking/payment* commit. A `TaskRejectedException` from a saturated pool could surface inside `commit()` | med | high | Choose a rejection policy that does not throw (see **OQ-1**), and prove it: **AC-3** asserts the money path is unaffected under saturation. `CallerRunsPolicy` is explicitly forbidden — it would run the SMTP call *on* the money-path thread, the exact failure this slice removes | implementer | open |
| R-3 | Removing the listener's transaction widens the at-least-once crash window | **closed at plan time** | — | Verified against Modulith 2.1.0 sources: `DefaultEventPublicationRegistry#markProcessing`/`markCompleted`/`markFailed` are each `@Transactional(REQUIRES_NEW)`, and `CompletionRegisteringMethodInterceptor` orders at `HIGHEST_PRECEDENCE + 10` vs the transaction advisor's default `LOWEST_PRECEDENCE`, so completion always ran *outside* the listener's transaction. The window is unchanged | planner | closed — no code change needed |
| R-4 | A **permanently** failing send (550 to a mistyped address) never completes, is resubmitted every restart, and holds `riviera.outbox.pending` above `MoneyPathAlertCheck`'s threshold for a non-money reason | med | med | **Carried, not closed.** Absorbing it needs ADR-0011 decision 7's bounce feed (#372). This slice must not make it worse: AC-3's shed-and-leave-outstanding behaviour adds a *second* way to hold a publication open, so phase 3 records the interaction in the plan + `docs/runbooks/observability.md`, and OQ-1 weighs it. Noted on **#405** too — a manual retry button makes this easier to trip, not harder | implementer | open → defer to #372 |
| R-5 | Under-sizing the new pool turns a healthy-relay burst into shed sends | med | low | Sizing is OQ-2 with a stated rule, not a guess: confirmations are one send per confirmed booking on a low-volume marketplace; queue depth is the buffer, thread count is the concurrency. Saturation is visible (logged + the publication stays outstanding), not silent | implementer | open |
| R-6 | A wedged send delays graceful shutdown / redeploy | low | low | Mirror `AsyncMailDispatcher`: `setWaitForTasksToCompleteOnShutdown(true)` with a short `awaitTerminationSeconds`, so a redeploy drains briefly and then abandons — the abandoned publication stays outstanding and is resubmitted at boot | implementer | open |
| R-7 | Module-boundary regression — the executor bean lands in the wrong package or pulls a new dependency | low | med | The bean is module-internal, in `notification/application/` beside `AsyncMailDispatcher`; no `allowedDependencies` change (no new module is referenced). Pinned by `ModularityTests` + `PackageShapeArchitectureTests` in the phase-2 regression scope | implementer | open |
| R-8 | Two extra `REQUIRES_NEW` registry transactions (`markProcessing`, `markCompleted`) bracket every invocation on the new small pool, each taking a connection | low | low | Both already happen today and are unaffected by this slice. Precisely: `markCompleted` is one short single-row write; **`markProcessing` issues no SQL at all** — it is a no-op `default` on `EventPublicationRepository` that `JdbcEventPublicationRepository` does not override (fact 8) — but its `REQUIRES_NEW` still checks a connection out eagerly, so the checkout is real and the statement is not. Noted so a reviewer reading "the listener holds no connection" is not surprised to see three brief checkouts per mail | planner | closed — documented, no action |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Open question OQ-1 — what exactly should saturation do?** Two candidates, and the
  deciding evidence is *where a `TaskRejectedException` lands* (R-2):
  - **(a) Discard-and-log** (`ThreadPoolExecutor.DiscardPolicy` or a logging variant):
    `submit` returns normally, nothing runs on the pool, so neither `markProcessing` nor
    `markCompleted` fires and the publication stays outstanding → resubmitted at the next
    restart. Nothing can reach the committing thread. Cost: the retry horizon is a restart
    (fact 8 — there is no scheduled retry and no operational trigger **today**), and it adds a
    second contributor to R-4's outbox backlog. **#405 softens this cost materially**: once an
    admin can resubmit on demand, "shed it, the registry still owes it" stops meaning "wait for
    the next deploy". This slice does **not** depend on #405 and must not wait for it — but if
    (a) is chosen, say so in the PR body, because the argument for (a) is weaker while #405 is
    open than after it lands.
  - **(b) Abort** (`AbortPolicy`, the `ThreadPoolTaskExecutor` default) **only if** the
    throw provably cannot escape into `commit()`. Louder and more honest, but it is the
    money-path risk in R-2.
    *Leaning (a)* — this vehicle's saturation must never be able to touch the money path,
    which is the whole premise of the slice. *Owner:* implementer · *Resolves by:* phase 1,
    with a spike test that publishes a `BookingConfirmed` against a full queue and asserts
    what the publishing thread observes.
- **Open question OQ-2 — pool size and queue capacity.** `AsyncMailDispatcher` uses 1
  thread / 100 queue with an argued rationale ("a serial drain behind a 100-deep buffer is
  the whole requirement"). Confirmation mail has a different volume shape (one per confirmed
  booking, not "a handful a day"), so the numbers should be re-argued rather than copied.
  Core and max must stay equal for the same reason stated on the dispatcher: a
  `ThreadPoolExecutor` only grows past core once the queue is full. *Owner:* implementer ·
  *Resolves by:* phase 1.
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

**Stage pointer:** `plan — draft under review with the maintainer` (not yet approved; no
code written)

**Next action:** Resolve **OQ-1** (saturation behaviour) with the maintainer, since it
shapes phase 1's executor construction and AC-3's assertion. Then start phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Take the transaction off the send | | |
| 1 — Dedicated bounded executor (decomposition) | | |
| 2 — Registry durability + saturation proof | | |
| 3 — Substrate: ADR/RESPONSIBILITIES/Javadoc close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

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

---

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java`
  — **modify.** Phase 0: `@ApplicationModuleListener(propagation = Propagation.NOT_SUPPORTED)`.
  Phase 1: decompose into `@Async("<executor>")` + `@TransactionalEventListener`. Class name,
  package and method signature are **frozen** (R-1). Javadoc rewritten to carry the new
  posture and the `AsyncMailDispatcher` cross-reference.
- `platform/src/main/java/ai/riviera/platform/notification/application/ConfirmationMailExecutor.java`
  — **create.** The dedicated bounded `ThreadPoolTaskExecutor`, package-private
  `@Configuration`/`@Bean` beside `AsyncMailDispatcher`. Permitted by
  `PackageShapeArchitectureTests` (top-level `application` is in the allowed set; the class
  depends on nothing under `adapter.*`).
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

## Phase 0 — Take the transaction off the send

**Goal:** the SMTP call holds no pooled connection. Independently valuable, independently
mergeable, and — per the Resolved entry — provably neutral to registry durability.

**Files:** Modify `notification/adapter/in/BookingConfirmationMailListener.java` · Create
`notification/ConfirmationMailBulkheadIT.java` (AC-2 case only; the rest lands in phase 1)

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

- [ ] **Step 3: Minimal implementation**

```java
	@ApplicationModuleListener(propagation = Propagation.NOT_SUPPORTED)
	void on(BookingConfirmed event) {
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS

> Scope (end-of-phase regression): `--tests "*notification*"` plus
> `--tests "*BookingConfirmationMailIT*"` — the durability suite must be untouched.

- [ ] **Step 5: Generalization-audit pass** — search for other listeners that hold a
  transaction across an outbound network call:
  `grep -rn "ApplicationModuleListener" --include=*.java platform/src/main/java` →
  candidates: `PaymentEventListener`, `BookingRefundListener` (calls `payment`'s
  `RefundPort` → **Stripe**, a third-party network call, inside `REQUIRES_NEW`),
  `BookingConfirmedPayoutListener`, `BookingCancelledPayoutListener`,
  `CancelBookingService`. **`BookingRefundListener` is the same shape as this bug** — decide
  fix-here vs new issue and record it. Append to the Generalization-audit log.

- [ ] **Step 6: Commit** — `git commit -m "fix(#383): stop the confirmation mail holding a DB connection across the SMTP call (#383)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Dedicated bounded executor

**Goal:** a degraded relay cannot occupy the shared pool. Requires decomposition, because
`@ApplicationModuleListener` publishes no executor attribute.

**Files:** Create `notification/application/ConfirmationMailExecutor.java` · Modify the
listener · Extend `ConfirmationMailBulkheadIT`

- [ ] **Step 0: Resolve OQ-1 with a spike** — publish a `BookingConfirmed` against a
  deliberately full queue and record what the *publishing* thread observes (clean return vs
  a `TaskRejectedException` escaping `commit()`). The answer selects the rejection policy.
  Record the outcome in Open Questions → Resolved, with the observed behaviour.

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
		pool.setRejectedExecutionHandler(SHED_AND_LEAVE_OUTSTANDING);
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationSeconds(SHUTDOWN_DRAIN_SECONDS);
		return pool;
	}
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
| | phase 0 | `@ApplicationModuleListener` holding a transaction across an outbound third-party call | `grep -rn "ApplicationModuleListener" --include=*.java platform/src/main/java` | | |
| | phase 1 | outbound third-party call on the shared spine executor | | | |

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
