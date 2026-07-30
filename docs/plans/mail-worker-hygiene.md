# Mail-executor worker hygiene Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every log line a mail worker emits carries the submitting request's MDC (one shared
mechanism, not two hand-rolled ones), and the two mail pools' shutdown drain window is *derived
from* the SMTP socket budget rather than being a second constant that happens to disagree with it.

**Architecture:** One `TaskDecorator` (`notification.application.MdcTaskDecorator`) becomes the
module's single MDC-propagation mechanism: the registry pool **composes** it with the existing
`SaturationPolicy` decorator (`CompositeTaskDecorator` — replacing the slot would silently break the
episode throttle, which `RegistryMailExecutorConfig`'s Javadoc already warns about), and
`AsyncMailDispatcher` drops its hand-rolled capture/restore in favour of it. For the drain, the SMTP
socket timeout becomes one **bound, validated** knob
(`riviera.notification.mail.socket-timeout-ms`) that `application-mailer.properties` interpolates
into all three `spring.mail.properties.mail.smtp.*` keys, and from which
`notification.application.MailTransportBudget` derives the drain window both pools use — so tuning
the relay budget moves the drain by construction and cannot drift from it.

**Persistence:** JDBC only (invariant #1). `N/A — no table, no migration.` No Flyway version is
claimed, so the #122/#127 collision class does not apply.

**Source of intent:** GitHub issue **#410** (parent epic **#367**; folds in **#411**, closed as
duplicate). Both parts were found at the #383 comparison review (PR #403 merged, PR #406 closed as
superseded) and predate both branches.

**Skills consulted:**
- `riviera-sdlc` — the loop + the Skill-routing gate that selected the rest.
- `riviera-modulith` — placement: the `TaskDecorator` and the derived budget are **application**-layer
  types (public, so `adapter/in` may use them) while the `@ConfigurationProperties` record stays at
  the `adapter/in` edge, following the shipped `CustomerRetentionProperties → RetentionWindow`
  pattern; no published surface changes, so no `allowedDependencies` edit and no `event_type` rewrite.
- `riviera-java-conventions` — record + compact-constructor validation instead of `@Validated`/`@Min`
  (no JSR-303 on the classpath, #97); named constants over magic numbers (`SHUTDOWN_BUDGET_MS`,
  `THREAD_NAME_PREFIX`); §6c one-line-or-none comments with the long prose in Javadoc; §10 no secret or
  address in any line (invariant #7).
- `riviera-local-debug` — system `gradle` + JDK-25 toolchain registration, scoped `--tests` runs only;
  CI owns the full suite.
- `riviera-plan-doc` — this document's shape and the Execution-status state store.
- **Not loaded, deliberately:** `postgres` (no SQL/DDL), `riviera-stripe-payments` (no money path
  touched — `payout`/`payment` are unchanged), `riviera-frontend` / `angular-developer` /
  `playwright-cli` (backend-only, no user-observable surface).

**Branch:** `claude/sdlc-410-akl3fg` — the cloud session's **designated remote branch stands in for
`feature/mail-worker-hygiene`** (`riviera-sdlc` §Remote/cloud session addendum). Draft **PR #433** opened on the
plan commit, so CI gates every later push (`pull_request` only, #417).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a caller with `correlationId` in its MDC, when a task is submitted to the
      registry mail executor, then the task **runs** with that same MDC map.
      *Pinned by:* `RegistryMailExecutorConfigTest.aWorkerRunsWithTheSubmittersLoggingContext`
- [x] **AC-2:** Given a task that ran with a caller's MDC, when a later task runs on the same pooled
      thread with no caller context, then it sees **no** leftover context.
      *Pinned by:* `RegistryMailExecutorConfigTest.aWorkerDoesNotInheritThePreviousTasksContext`
- [x] **AC-3:** Given a saturated registry pool and a submitter with `correlationId` in its MDC, when
      the send is shed, then the escalated line's own MDC carries that `correlationId` — attributable,
      not merely claimed by a comment. *Pinned by:*
      `RegistryMailExecutorConfigTest.theShedLineIsAttributableToTheSubmittingRequest`
- [x] **AC-4:** Given the shared decorator, when the recovery dispatcher runs a send, then the
      caller's context is carried and cleared **through `MdcTaskDecorator`** and `AsyncMailDispatcher`
      holds no capture/restore code of its own. *Pinned by:*
      `AsyncMailDispatcherTest.carriesTheCallersLoggingContext` +
      `AsyncMailDispatcherTest.clearsTheLoggingContextAfterTheTask` (both existing, kept green) and
      `MdcTaskDecoratorTest` (the mechanism, once).
- [x] **AC-5:** Given the registry pool's existing `SaturationPolicy` decorator, when MDC propagation
      is added, then the episode throttle still opens exactly one line per episode and re-opens for a
      later one — i.e. the decorator slot was **composed**, not replaced. *Pinned by:*
      `RegistryMailExecutorConfigTest.aSaturationEpisodeLogsOnceNotOncePerShedTask` +
      `aLaterEpisodeLogsAgain` (existing, kept green).
- [x] **AC-6:** Given no shed and no drop line in scope, when any of these lines is emitted, then it
      contains no `@`, no `http`, and no arrival code (invariant #7). *Pinned by:*
      `RegistryMailExecutorConfigTest.theShedLineIsAttributableToTheSubmittingRequest` (asserts the
      MDC carries the id while the message carries neither) + the existing
      `AsyncMailDispatcherTest.theDropLineCarriesNeitherAddressNorLink`.
- [x] **AC-7:** Given `riviera.notification.mail.socket-timeout-ms` set to `N`, when either mail pool
      is built, then its await-termination window equals `MailTransportBudget`'s derivation from `N`
      and **not** a literal — one knob moves both. *Pinned by:*
      `MailTransportBudgetTest.derivesTheDrainFromTheSocketBudget` +
      `aRetunedRelayBudgetMovesTheDrainWithIt` (the derivation),
      `MailTransportPropertiesTest.theDrainWindowIsTheBudget` (the bound value reaching it), and
      behaviourally by both pools' `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` — which
      observes the window expiring rather than reading a field back, so no getter or reflection is needed
- [x] **AC-8:** Given the `mailer` profile, when the context resolves
      `spring.mail.properties.mail.smtp.{connectiontimeout,timeout,writetimeout}`, then all three
      equal the same knob's value — the properties file interpolates it rather than restating `10000`.
      **Holds for `smtp4dev` too** (the phase-1 generalization audit found it restating the literal), so
      the test is parameterized over both profiles that drive the real `SmtpMailer`.
      *Pinned by:* `MailTransportPropertiesTest.theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom`
- [x] **AC-9:** Given a socket timeout whose derived drain would exceed the named shutdown budget, or
      a non-positive one, when the context binds, then boot **fails** with a message naming the
      property — the degenerate value cannot boot clean (the #414/#426 posture). *Pinned by:*
      `MailTransportPropertiesTest.anOversizedSocketTimeoutFailsTheContext` +
      `aNonPositiveSocketTimeoutFailsTheContext` + `acceptsTheWholeTuningRangeButNotBeyondIt`
- [x] **AC-10:** Given a send still running when the drain window expires, when the pool shuts down,
      then the task is **abandoned without interruption** (no `shutdownNow()`), so it never returns and
      the registry never completes its publication. *Pinned by:*
      `RegistryMailExecutorConfigTest.aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` +
      `AsyncMailDispatcherTest.aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted`;
      composed with the already-shipped
      `RegistryMailBulkheadIT.leavesAFailedSendsPublicationOutstanding` (#383 AC-3), which proves the
      other half — a listener that does not return leaves `completion_date` NULL.
- [x] **AC-11:** Given `docs/plans/registry-mail-bulkhead.md`, when the follow-up sentence is read,
      then **#411** is described as folded into #410 rather than as a separate open issue.
      *Pinned by:* review of the diff (prose; no test).

## Non-goals

- **Tuning the relay budget's *value* against a real relay.** The knob is externalised and validated;
  choosing its production value belongs to **#370** (provider setup), which is the first point at
  which real latency data exists. This slice ships the shipped-today value unchanged.
- **`shutdownNow()` escalation.** Decided against, explicitly, with the reason recorded in Javadoc
  (see Risk R-3) — not left open.
- **Counting recovery sends still queued when the drain window expires.** A real gap (they are lost
  and no counter moves), but it is a *new* metric with its own runbook row, not this slice's
  ACs — filed as a follow-up (Open questions → OQ-1).
- **Anything about #407** (proving a *shed* send's publication outstanding in a Spring context) or
  **#409** (the architecture-test escape hatches). AC-10 deliberately covers the *shutdown* path only
  and leans on an already-shipped IT for the registry half rather than growing a new one.
- **MDC propagation anywhere outside `notification`.** Boot's shared `applicationTaskExecutor` (the
  money-path spine) is untouched: adding a decorator there changes behaviour on invariant-#8/#9
  listeners and is not what #410 asks for.
- No new endpoint, DTO, migration, or frontend surface.

## Behavior-parity ledger (retirement / replacement slices only)

`AsyncMailDispatcher`'s hand-rolled MDC carry/clear **is** a surface being replaced, so the ledger
applies to it:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `dispatch` captures `MDC.getCopyOfContextMap()` on the caller's thread | preserved | `MdcTaskDecorator.decorate` runs on the submitting thread (`ThreadPoolTaskExecutor` decorates at submit), so the capture point is identical |
| A `null` caller context is tolerated (no `setContextMap(null)`) | preserved | the decorator keeps the same null guard; `MdcTaskDecoratorTest.toleratesAnAbsentCallerContext` pins it |
| `MDC.clear()` in a `finally`, so context cannot leak to the next pooled task | preserved | same `finally` inside the decorator; existing `clearsTheLoggingContextAfterTheTask` stays green unchanged |
| The drop line (`recordDrop`) is emitted on the **caller's** thread and therefore already had the MDC | preserved | unchanged — `recordDrop` is not a pooled task and is deliberately left outside the decorator |
| `awaitTerminationSeconds(5)` literal | **changed** | now `setAwaitTerminationMillis(budget.shutdownDrain())`; the value grows from 5s to the derived window (see Architecture) — that is the point of Part 2 |
| `POOL_SIZE`/`QUEUE_CAPACITY` and the drop counters | preserved | untouched; #415's tests stay green byte-for-byte |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `setTaskDecorator` is called twice on the registry pool, silently replacing `SaturationPolicy` — the episode flag then never clears, every later saturation is counted but never logged, and only `aLaterEpisodeLogsAgain` goes red | med | high | compose via `CompositeTaskDecorator`; AC-5 keeps both existing throttle tests in the same class as the new MDC ones, so the composition is asserted from both sides | claude | closed — `CompositeTaskDecorator`, and `aSaturationEpisodeLogsOnceNotOncePerShedTask` + `aLaterEpisodeLogsAgain` stayed green unchanged (`ac9e095`) |
| R-2 | The decorator is applied on the **worker** thread instead of the submitting one (e.g. by wrapping inside the task), capturing an empty map and making AC-1 pass for the wrong reason | med | med | `MdcTaskDecoratorTest` asserts the captured value comes from the *submitting* thread's MDC after that thread has cleared it; AC-1 asserts the worker's thread name differs from the caller's | claude | closed — `MdcTaskDecoratorTest.capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne` clears the submitter's MDC after decorating and runs on a different thread, so a worker-side capture cannot pass (`ac9e095`) |
| R-3 | A longer drain window delays context shutdown past the platform's SIGTERM→SIGKILL grace, so a redeploy is killed mid-shutdown — worse than giving up, because Hikari and the web layer never close cleanly | low | med | the derived window is bounded by a named `SHUTDOWN_BUDGET` constant well inside Render's default 30s grace, and the ceiling is *validated* (AC-9) so no env override can exceed it; **no `shutdownNow()`** — an interrupt during the relay handoff is exactly what turns at-least-once into a duplicate mail (issue #410 Part 2), and that reasoning is recorded in the config Javadoc | claude | closed — the ceiling `SHUTDOWN_BUDGET_MS` is validated (`anOversizedSocketTimeoutFailsTheContext`), and both pools' `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` pin the no-`shutdownNow()` decision (`04e6f49`) |
| R-4 | `spring.mail.properties.mail.smtp.*` interpolation silently fails to resolve (typo in the placeholder), and Jakarta Mail falls back to **infinite** timeouts — the exact hazard #368 closed, reintroduced invisibly | low | high | AC-8 resolves all three keys through the `mailer`-profile environment and asserts they equal the knob; an unresolved placeholder fails the property resolution loudly | claude | closed — and it was a live hazard: the phase-1 audit found `application-smtp4dev.properties` still restating the literals. All three keys now interpolate under **both** real-transport profiles, parameterized in `theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom` (`04e6f49`) |
| R-5 | Boundary leak: the `@ConfigurationProperties` record or the `TaskDecorator` lands in the wrong layer (e.g. a framework config type inside `application`, or a public adapter class) | low | med | `riviera-modulith` placement recorded in §Module ownership; `PackageShapeArchitectureTests` + `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` run in the phase-1 scoped batch | claude | closed — `ModularityTests` + `PackageShapeArchitectureTests` + `PublishedSurfacePlacementArchitectureTests` + `MailListenerExecutorArchitectureTest` green; no published surface changed |
| R-6 | Shared-state accumulation across the full suite (the `riviera-local-debug` blind spot): a new bean in every context, plus a longer drain, slows or destabilises unrelated ITs | low | med | the new bean is a pure value record; ITs that shut contexts down get the derived window from the **shipped** knob, and the fast unit tests pass a tiny knob so no test waits on a real 10s drain; verified by the PR's own CI run before phase 2 builds on it | claude | closed — the new bean is a pure value record; unit tests pass a 200ms budget so none waits on the shipped 10s drain, and `RegistryMailExecutorWiringIT` + `MailSenderWiringIT` + `RegistryMailBulkheadIT` ran green locally against real Postgres. Full-suite behaviour is the PR's CI run |

## Open questions / Assumptions

- **Assumption (A-1):** the deploy platform's shutdown grace is Render's default **SIGTERM then
  SIGKILL after 30s**; nothing in `docs/deploy/` or `docs/runbooks/` records it, so the plan encodes
  a `SHUTDOWN_BUDGET` comfortably inside it rather than claiming the platform number as fact.
  *Owner:* claude · *Resolves by:* phase 1 (the constant's Javadoc states the assumption and its
  source, so a future #370 session can correct one line).


### Resolved

- **A-1 (resolved, phase 1):** the platform-grace assumption is now encoded rather than assumed away.
  `MailTransportProperties.SHUTDOWN_BUDGET_MS` is the single constant that carries it, its Javadoc states
  that Render's ~30s SIGTERM→SIGKILL default is the source and that nothing in `docs/deploy/` records it,
  and it is the *validated ceiling* on the knob — so an env override cannot produce a drain that outlasts
  the grace, and a platform change is one line to correct.
- **OQ-1 (resolved, phase 2 → issue #434):** recovery sends still **queued** when the drain window
  expires are lost and no counter moves (`MAIL_RECOVERY_DROPPED` counts *rejections*,
  `MAIL_RECOVERY_FAILED` counts accepted-then-failed; abandonment is neither). Filed as **#434** with the
  taxonomy question it shares with #423, deliberately not absorbed here — it needs a new metric name or
  `reason` tag plus its own runbook row. #410 makes it strictly less likely, since the drain grew from a
  flat 5s to the full socket budget.
- **OQ-2 (resolved at plan time):** *Is the shed line really MDC-less, as #410 Part 1 states?* **No.**
  `ThreadPoolExecutor.execute` calls `reject(...)` on the **calling** thread, and for this pool the
  caller is the thread committing the booking transaction (`@Async` + `@TransactionalEventListener`
  submits from inside `commit()`), which does carry `CorrelationIdFilter`'s MDC. So the shed and
  shutdown lines are already attributable and the comment's claim is already true *for them*; what is
  genuinely MDC-less is every line emitted from a **worker** thread — `BookingConfirmationMailListener`'s
  `MAIL_CONFIRMATION_ABANDONED` ERROR, `TransactionalMailService`'s suppression WARN, and whatever
  #370's real relay produces on a transport failure. Consequence for this slice: AC-3 *asserts* the
  shed line's attributability (the issue's own AC-3 wording — "asserted, not assumed" — is satisfied
  either way), and the comment is **corrected to say why** it holds rather than deleted; the decorator
  is what fixes the worker-side lines. The issue's premise is narrowed, not its ACs.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No code path in scope reads or writes
`availability(set_id, booking_date)`: the two files touched build thread pools and propagate a logging
context, and the only behavioural change to a *send* is when a shutting-down pool stops waiting for
it. The claim/release path (`AvailabilityClaim`, invariant #2) is not reachable from either. Nor is
the cutoff (#4) or the pool flag (#3).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | It owns both mail delivery vehicles and their executors (CLAUDE.md module table, #382/#383). The MDC mechanism and the drain/socket-budget relationship are properties *of those pools*, so they cannot live anywhere else. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | `N/A — no published surface added, changed, or moved.` `notification::api` keeps exactly `MailSender` + `MailDeliverability`; no `vocabulary`, `events` or `spi` change; no `allowedDependencies` edit; no Flyway `event_type` rewrite. | | |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | `N/A — no event added or changed.` `BookingConfirmed`'s listener signature is untouched, so the registry's `listener_id` still reads as V31 migrated it (kept green by `RegistryMailBulkheadIT.keepsTheListenerIdV31Migrated`). | | | | | |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Propagate the submitting thread's MDC onto a mail worker (`MdcTaskDecorator`, `notification.application`) | `notification` | `notification` Job: "transactional-mail delivery … both delivery vehicles per ADR-0011 decision 5 … each on its own bounded executor". The decorator is a property of those executors. It is **public** in `application` (not `adapter/in`) precisely because *both* vehicles need it — one in `application`, one in `adapter/in` — and `adapter/in → application` is the allowed direction. It is **not** a `shared`-kernel candidate: CLAUDE.md's `shared` note bars "code used in more than one place" as an admission criterion, and both users are inside this one module. |
| The bound + validated SMTP socket budget (`MailTransportProperties`, `notification.adapter/in`) | `notification` | Same Job line. The `@ConfigurationProperties` type stays at the adapter edge, exactly as `RegistryMailProperties` (#408) and `CustomerRetentionProperties` do, keeping the inner hexagon framework-light. |
| The derived shutdown-drain window (`MailTransportBudget`, `notification.application`) | `notification` | The `CustomerRetentionProperties → RetentionWindow` mapping pattern: a plain application-layer value carrying no configuration type, consumed by `AsyncMailDispatcher` (`application`) and `RegistryMailExecutorConfig` (`adapter/in`). |
| Nothing is added to, or moved out of, any other module | — | No other module's **Not My Job** list is touched; `shared` gains no member (its `ObservabilityMetrics` constants are read, not added to). |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves and no ledger row is written or read. The slice's only
relationship to the money path is protective and unchanged: both pools exist so a degraded relay
cannot occupy the shared `applicationTaskExecutor` that carries `booking`'s payment→confirm listener
(invariant #8) and `payout`'s accrual/reversal (invariant #9). Neither pool is that pool, and
`MailListenerExecutorArchitectureTest` keeps it that way.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or response shape is touched.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current `riviera-sdlc` stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** `both gates run — awaiting merge of PR #433`

**Next action:** Merge PR #433. Everything the close-out can do pre-merge is done; what remains is
GitHub-only and needs no commit — the `#367` epic checkbox tick and closing #410 (its `Closes #410`
should do it). #434 is already filed.

**Merged via PR #433.**

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared MDC decorator, composed onto both pools + the corrected comments | ✅ | `ac9e095` |
| 1 — the drain window derived from the socket budget, bound and validated | ✅ | `04e6f49` |
| 2 — housekeeping (#411 fold-in), runbook rows, docs-freshness + close-out | ✅ | `68e6953` |
| 3 — review-gate findings F-1..F-4 | ✅ | `<phase-3>` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-PROC-1 accuracy) | *Skills consulted* cited `SOCKET_PHASES` as a shipped named constant — a leftover from the plan-time 3× derivation that phase 1 replaced with 1×. A stale plan-doc fact is what RV-PROC-1 exists to catch. | fixed-in-`<phase-3>` |
| F-2 | review (plan-doc discipline / close-out step 4) | **Three AC pin-names named tests that never shipped** — AC-7 cited `RegistryMailExecutorConfigTest.drainsForTheDerivedWindow` and `AsyncMailDispatcherTest.drainsForTheDerivedWindow` (neither exists; the drain is proven behaviourally instead) and AC-9 cited `rejectsValuesOutsideTheTuningRange` (shipped as `acceptsTheWholeTuningRangeButNotBeyondIt`). Exactly the "verify, don't assume" failure the close-out warns about. | fixed-in-`<phase-3>` |
| F-3 | review (plan-doc accuracy) | The phase-1 code sketch still showed the abandoned `drainWindowOf` reflection approach and its phantom test, describing an implementation that was deliberately not taken. | fixed-in-`<phase-3>` — sketch replaced with what shipped, and the rejected approach recorded as a resolved decision |
| F-4 | review (runbook completeness) | `RIVIERA_SMTP_SOCKET_TIMEOUT_MS` ships **at** its ceiling, so it can only be tuned *downward* — an operator reading the range `1`–`10000` would not notice, and #370's whole purpose is retuning. The runbook stated the range without stating the asymmetry or what to do when a relay needs more. | fixed-in-`<phase-3>` — the runbook now names the trade-off and the correct escalation (raise the platform grace, then `SHUTDOWN_BUDGET_MS`) |
| — | review (`/code-review` fan-out) | **Not run** — this session's standing instruction forbids the Agent tool, which is the ladder's rung-3 condition ("the review subagents genuinely cannot run"). The degraded inline path ran instead and is **declared** in the PR with the box left unticked, per `references/pr-gates.md` §1. | declared, not substituted silently |
| — | sonar | 0 new issues, 0 security hotspots, 0 duplicated blocks, 100% coverage on new code (`new_lines=287`, analysis confirmed present — not a false-clean zero) | clear |

---

### Docs-freshness run (merge close-out step 5)

Range `origin/main..HEAD`, run at phase 2. **One contradicted fact, patched:**

- `docs/runbooks/mailer-profile-smoke-test.md:119` — stated *"a crash or redeploy past the **5s** drain
  window loses it"* — contradicted by the derived window (phase 1) — **patched** to name the deriving
  property instead of a literal, so it cannot go stale again when #370 retunes it.

Two docs were **extended** rather than corrected, because the diff contradicted nothing there but added
two facts a future session could plausibly undo (the composed decorator slot, and give-up-not-`shutdownNow`):
`CLAUDE.md`'s `notification` module row and `RESPONSIBILITIES.md`'s notification section — the same
treatment #408/#415/#423/#428 each got.

Checked and **clean**: `CONTEXT.md` (no new domain term — these are technical knobs, not ubiquitous
language), `docs/adr/ADR-0011` (its decision-5 text already says "a redeploy past the drain window"
without a number, so it stays true), `docs/agents/*`, the `riviera-*` skills (none cites these classes or
the literal), `docs/deploy/*`. Knowledge-graph refresh **skipped** — `graphify-out/` is absent in this
cloud clone, as expected.

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/application/MdcTaskDecorator.java` — **new.**
  The module's one MDC-propagation mechanism: capture on submit, restore-and-clear around the task.
- `platform/src/main/java/ai/riviera/platform/notification/application/MailTransportBudget.java` — **new.**
  The derived value: the relay's per-socket-operation budget and the shutdown drain window computed
  from it.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MailTransportProperties.java` — **new.**
  `@ConfigurationProperties("riviera.notification.mail")`, validated in the compact constructor.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MailTransportConfig.java` — **new.**
  Binds the properties and maps them to the application-layer `MailTransportBudget` bean.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfig.java` —
  compose the two decorators; take the budget; correct the two shed comments.
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  drop `runWithin`, adopt the decorator, take the budget.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java` —
  correct the `abandon` Javadoc's "this pool propagates no MDC (#410 is the slice that would add it)".
- `platform/src/main/resources/application.properties` — the new knob (env-overridable).
- `platform/src/main/resources/application-mailer.properties` — the three smtp keys interpolate it.
- `platform/src/test/java/ai/riviera/platform/notification/application/MdcTaskDecoratorTest.java` — **new.**
- `platform/src/test/java/ai/riviera/platform/notification/application/MailTransportBudgetTest.java` — **new.**
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailTransportPropertiesTest.java` — **new.**
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfigTest.java` —
  the MDC + drain tests; existing throttle tests unchanged.
- `platform/src/test/java/ai/riviera/platform/notification/application/AsyncMailDispatcherTest.java` —
  constructor gains the budget; the two MDC tests stay as-is (they now exercise the shared mechanism).
- `docs/plans/registry-mail-bulkhead.md:281-282` — fold #411 into #410 (issue's housekeeping ask).
- `docs/runbooks/observability.md` — a row for the new knob beside #408's two.

---

## Phase 0 — The shared MDC decorator, composed onto both pools

**Files:** Create `notification/application/MdcTaskDecorator.java`,
`notification/application/MdcTaskDecoratorTest.java` · Modify
`notification/adapter/in/RegistryMailExecutorConfig.java`,
`notification/application/AsyncMailDispatcher.java`,
`notification/adapter/in/BookingConfirmationMailListener.java` (Javadoc),
`notification/adapter/in/RegistryMailExecutorConfigTest.java`

- [ ] **Step 1: Write the failing tests**

```java
// MdcTaskDecoratorTest — the mechanism, asserted once, where it lives
@Test
void capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne() throws Exception {
	MDC.put(CORRELATION_KEY, "corr-1");
	Runnable decorated = new MdcTaskDecorator().decorate(() -> seen.set(MDC.get(CORRELATION_KEY)));
	MDC.clear();   // the submitting thread has moved on; only the capture may survive

	try (ExecutorService worker = Executors.newSingleThreadExecutor()) {
		worker.submit(decorated).get(AWAIT_SECONDS, TimeUnit.SECONDS);
	}

	assertThat(seen.get())
			.as("the context must be captured where decorate() runs — the submitting thread")
			.isEqualTo("corr-1");
}

@Test
void clearsTheContextAfterTheTaskEvenWhenItThrows() { /* MDC empty afterwards; the throw propagates */ }

@Test
void toleratesAnAbsentCallerContext() { /* no MDC on the submitter -> no NPE, task still runs */ }
```

```java
// RegistryMailExecutorConfigTest — the pool actually wired with it (AC-1, AC-2, AC-3)
@Test
void aWorkerRunsWithTheSubmittersLoggingContext() throws Exception {
	ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
	AtomicReference<String> seen = new AtomicReference<>();
	AtomicReference<String> thread = new AtomicReference<>();
	CountDownLatch ran = new CountDownLatch(1);
	MDC.put(CORRELATION_KEY, "corr-1");

	try {
		pool.execute(() -> {
			seen.set(MDC.get(CORRELATION_KEY));
			thread.set(Thread.currentThread().getName());
			ran.countDown();
		});
		MDC.clear();

		assertThat(ran.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
		assertThat(thread.get()).startsWith(THREAD_NAME_PREFIX);   // not the caller's thread
		assertThat(seen.get())
				.as("a worker-thread line — the abandoned-confirmation ERROR, a transport failure — "
						+ "is unattributable without this")
				.isEqualTo("corr-1");
	}
	finally {
		MDC.clear();
		pool.shutdown();
	}
}

@Test
void theShedLineIsAttributableToTheSubmittingRequest() throws Exception {
	ThreadPoolTaskExecutor pool = initializedExecutor(TINY);
	CountDownLatch gate = new CountDownLatch(1);
	MDC.put(CORRELATION_KEY, "corr-1");

	try {
		gate = saturate(pool, () -> { }, SHED_SENDS);

		ILoggingEvent escalated = logs.list.stream()
				.filter(event -> event.getLevel() == Level.ERROR)
				.findFirst()
				.orElseThrow();
		assertThat(escalated.getMDCPropertyMap())
				.as("invariant #7 keeps the address and the code out of the line, which leaves the "
						+ "correlation id as the only handle on which send was shed")
				.containsEntry(CORRELATION_KEY, "corr-1");
		assertThat(escalated.getFormattedMessage()).doesNotContain("@").doesNotContain("http");
	}
	finally {
		MDC.clear();
		gate.countDown();
		pool.shutdown();
	}
}
```

> `aWorkerDoesNotInheritThePreviousTasksContext` mirrors the shipped
> `AsyncMailDispatcherTest.clearsTheLoggingContextAfterTheTask` against the registry pool.

- [ ] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*MdcTaskDecoratorTest*" --tests "*RegistryMailExecutorConfigTest*"`
      → FAIL: `MdcTaskDecorator` does not compile (absent); `aWorkerRunsWithTheSubmittersLoggingContext`
      expects `"corr-1"` but the worker sees `null`.
      **`theShedLineIsAttributableToTheSubmittingRequest` is expected to pass immediately** — that is
      the OQ-2 finding, and the test is written to *pin* the property rather than to drive a change.

- [ ] **Step 3: Minimal implementation**

```java
package ai.riviera.platform.notification.application;

/**
 * Carries the submitting thread's SLF4J {@link MDC} onto a mail worker, and clears it afterwards so it
 * cannot leak onto the next task sharing the pooled thread (#410).
 *
 * <p><strong>The module's one MDC mechanism, deliberately.</strong> {@link AsyncMailDispatcher} carried
 * the context by hand from #369; {@link ai.riviera.platform.notification.adapter.in.RegistryMailExecutorConfig}'s
 * pool carried nothing, so every line a registry-mail worker emitted — the abandoned-confirmation
 * {@code ERROR} (#428), the suppression {@code WARN}, and whatever #370's real relay produces on a
 * transport failure — was unattributable. Invariant #7 keeps the recipient and the arrival code out of
 * those lines, which leaves the correlation id as the only handle on <em>which</em> send they describe.
 * A {@link TaskDecorator} is the framework's own seam for this, so both vehicles now share it rather
 * than diverging into two implementations of one rule.
 *
 * <p><strong>{@link #decorate} must run on the submitting thread</strong> — it does: Spring's
 * {@code ThreadPoolTaskExecutor} decorates in {@code execute}/{@code submit}, before the task is
 * handed to the queue. Capturing inside the returned {@link Runnable} would read the <em>worker's</em>
 * (empty) context and make the propagation tests pass for the wrong reason.
 *
 * <p>Public because both vehicles use it and they sit in different packages —
 * {@code adapter/in → application} is the permitted direction. Stateless, so one instance per pool is
 * as good as one shared.
 */
public final class MdcTaskDecorator implements TaskDecorator {

	@Override
	public Runnable decorate(Runnable task) {
		Map<String, String> callerContext = MDC.getCopyOfContextMap();
		return () -> {
			if (callerContext != null) {
				MDC.setContextMap(callerContext);
			}
			try {
				task.run();
			}
			finally {
				MDC.clear();
			}
		};
	}
}
```

```java
// RegistryMailExecutorConfig#registryMailExecutor — compose, never replace (R-1)
pool.setRejectedExecutionHandler(saturation);
pool.setTaskDecorator(new CompositeTaskDecorator(List.of(saturation, new MdcTaskDecorator())));
```

> `CompositeTaskDecorator` applies its members in list order, each wrapping the previous, so the MDC
> decorator ends up **outermost**: the episode bookkeeping in `SaturationPolicy#decorate` then also
> runs inside the caller's context. If `CompositeTaskDecorator` is unavailable on this Spring version,
> fall back to an explicit `task -> mdc.decorate(saturation.decorate(task))` and say so in a comment.

```java
// AsyncMailDispatcher — one mechanism, so runWithin() and its Map import are deleted
pool.setTaskDecorator(new MdcTaskDecorator());
...
@Override
public void dispatch(Runnable send) {
	try {
		executor.execute(send);
	}
	catch (TaskRejectedException e) {
		recordDrop(e);
	}
}
```

- [ ] **Step 3b: Correct the comments the issue names** (its "or delete the claim from them")
  - `SaturationPolicy` Javadoc — replace *"the correlation id rides the MDC"* with **why** it holds for
    a rejection line (`rejectedExecution` runs on the submitting thread, which is the one committing the
    booking transaction) and note that worker-side lines now hold it via `MdcTaskDecorator`.
  - The same Javadoc's *"#410 … must compose with `decorate` rather than call `setTaskDecorator` again"*
    warning — rewrite in the present tense: it **is** composed, via `CompositeTaskDecorator`, and a
    third decorator must join that list.
  - `AsyncMailDispatcher` Javadoc — *"The caller's logging context rides along … and is cleared
    afterwards"* now points at the shared decorator instead of describing local code.
  - `BookingConfirmationMailListener#abandon` Javadoc — drop *"this pool propagates no MDC from the
    confirming request (#410 is the slice that would add it)"*; the ids stay, for their own reason
    (the correlation id says *which request*, the ids say *which booking* — a reader of the alert needs
    both, and the ids are what an operator can query).

- [ ] **Step 4: Run them, verify they pass** —
      `gradle --no-daemon --console=plain test --tests "*MdcTaskDecoratorTest*" --tests "*RegistryMailExecutorConfigTest*" --tests "*AsyncMailDispatcherTest*" --tests "*BookingConfirmationMailListenerTest*"`
      → PASS, **including the four shipped throttle/drop tests unchanged** (AC-5).

- [ ] **Step 5: Generalization-audit pass** — search every `ThreadPoolTaskExecutor` /
      `setTaskDecorator` / hand-rolled `MDC.getCopyOfContextMap()` in `platform/src/main`; decide
      per site whether it should adopt the decorator (expected: the two mail pools yes; Boot's shared
      `applicationTaskExecutor` **no** — see Non-goals). Record in the log below.

- [ ] **Step 6: Commit** — `git commit -m "feat(#410): carry the submitter's MDC onto both mail pools' workers (#410)"`
      → then **push and open the draft PR immediately** (CI fires on `pull_request` only, #417).

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The drain window, derived from the socket budget

**Files:** Create `notification/application/MailTransportBudget.java`,
`notification/adapter/in/MailTransportProperties.java`,
`notification/adapter/in/MailTransportConfig.java`, `…/MailTransportBudgetTest.java`,
`…/MailTransportPropertiesTest.java` · Modify `RegistryMailExecutorConfig.java`,
`AsyncMailDispatcher.java`, `application.properties`, `application-mailer.properties`, and the two
executor test classes

- [ ] **Step 1: Write the failing tests**

```java
// MailTransportBudgetTest (AC-7)
@Test
void derivesTheDrainFromTheSocketBudget() {
	assertThat(new MailTransportBudget(Duration.ofMillis(10_000)).shutdownDrain())
			.as("one decision, not two constants that happen to disagree")
			.isEqualTo(Duration.ofMillis(10_000));
}

@Test
void aBiggerRelayBudgetMovesTheDrainWithIt() {
	assertThat(new MailTransportBudget(Duration.ofMillis(4_000)).shutdownDrain())
			.isEqualTo(Duration.ofMillis(4_000));
}
```

```java
// MailTransportPropertiesTest (AC-8, AC-9) — the RegistryMailPropertiesTest shape
@Test
void theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom() {
	runner.withPropertyValues("spring.profiles.active=mailer",
					"riviera.notification.mail.socket-timeout-ms=7000")
			.run(context -> {
				Environment env = context.getEnvironment();
				assertThat(List.of("connectiontimeout", "timeout", "writetimeout"))
						.allSatisfy(key -> assertThat(
								env.getProperty("spring.mail.properties.mail.smtp." + key))
								.as("an unresolved or restated value means Jakarta Mail's INFINITE "
										+ "default is one typo away (#368)")
								.isEqualTo("7000"));
				assertThat(context.getBean(MailTransportBudget.class).socketTimeout())
						.isEqualTo(Duration.ofMillis(7_000));
			});
}

@Test
void anOversizedSocketTimeoutFailsTheContext() { /* rootCause IllegalArgumentException, names the property + the shutdown budget */ }

@Test
void aNonPositiveSocketTimeoutFailsTheContext() { /* 0 and -1 */ }

@Test
void bindsTheShippedDefault() { /* unset config reproduces #368's value exactly */ }

@Test
void theEnvironmentOverridesTheBudget() { /* RIVIERA_SMTP_SOCKET_TIMEOUT_MS=4000 */ }

@Test
void acceptsTheWholeTuningRangeButNotBeyondIt() { /* direct construction, both ends reachable */ }

@Test
void theDrainWindowIsTheBudget() { /* the bound value reaches MailTransportBudget#shutdownDrain */ }
```

```java
// RegistryMailExecutorConfigTest + AsyncMailDispatcherTest (AC-7, AC-10) — one per pool
@Test
void aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted() throws Exception {
	ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED, new MailTransportBudget(TINY_DRAIN));
	CountDownLatch running = new CountDownLatch(1);
	CountDownLatch gate = new CountDownLatch(1);
	AtomicBoolean interrupted = new AtomicBoolean();
	AtomicBoolean completed = new AtomicBoolean();

	pool.execute(() -> {
		running.countDown();
		try {
			gate.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
			completed.set(true);
		}
		catch (InterruptedException e) {
			interrupted.set(true);
			Thread.currentThread().interrupt();
		}
	});
	assertTrue(running.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS));

	pool.shutdown();   // waits the derived window, then gives up

	assertFalse(completed.get(),
			"the send must not have finished — that is what leaves the publication outstanding");
	assertFalse(interrupted.get(),
			"and it must not be interrupted: an interrupt during the relay handoff is where the "
					+ "duplicate mail comes from, so the window expiring means give up, not shutdownNow()");
	gate.countDown();
}
```

> **Resolved in favour of the behavioural assertion.** `awaitTerminationMillis` has no getter, and
> reflecting on the field would both trip Sonar and assert configuration rather than effect. What shipped
> instead: `MailTransportPropertiesTest.theDrainWindowIsTheBudget` proves the bound value reaches the
> derivation, and each pool's `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` *observes the
> window expiring* — which is the property that matters and needs no getter at all.

- [ ] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*MailTransport*" --tests "*RegistryMailExecutorConfigTest*" --tests "*AsyncMailDispatcherTest*"`
      → FAIL: the three new main-source types do not exist; the executor signature takes no budget.

- [ ] **Step 3: Minimal implementation**

```java
// notification/application/MailTransportBudget.java
/**
 * The relay's per-socket-operation budget, and the shutdown drain window derived from it (#410 Part 2).
 *
 * <p><strong>Why derived and not a second constant.</strong> #368 gave the SMTP transport finite
 * connect/read/write timeouts because Jakarta Mail's defaults are infinite; #369 and #383 gave the two
 * mail pools a 5-second {@code awaitTerminationSeconds}. Nothing related the two, and they disagreed:
 * a single degraded send can legitimately hold its thread for a full socket timeout, so the drain gave
 * up while legitimate work was still in flight and {@code HikariDataSource} closed underneath it —
 * connection-closed noise at the worst possible moment, and a possible duplicate mail if the send had
 * already reached the relay. Deriving the window from the same value makes tuning one move the other.
 *
 * <p><strong>The derivation is one socket operation, not a whole send.</strong> A worker caught by
 * shutdown is sitting in exactly one blocking socket call; letting that call reach its own timeout is
 * what lets the send unwind and the thread finish. A relay slow enough to consume connect *and* read
 * *and* write budgets is making progress rather than wedged, and cutting it off is the accepted cost —
 * the alternative is a drain window three times the relay budget, which would outlast the platform's
 * SIGTERM grace and get the process SIGKILLed mid-shutdown, losing the orderly close entirely.
 *
 * <p><strong>What happens when the window expires: nothing further.</strong>
 * {@code ExecutorConfigurationSupport} awaits and then gives up; this slice deliberately does
 * <em>not</em> escalate to {@code shutdownNow()}. Interrupting a send whose publication is still
 * outstanding would be safe, but interrupting one that already handed off to the relay is precisely
 * how at-least-once becomes a duplicate mail — and the interrupt cannot tell the two apart. So an
 * unfinished registry send stays outstanding for the next start's republish (which is what the Event
 * Publication Registry is for), and an unfinished recovery send is a loss the user re-requests.
 *
 * @param socketTimeout the per-operation budget every {@code spring.mail.properties.mail.smtp.*}
 *        timeout is set from; the drain window equals it
 */
public record MailTransportBudget(Duration socketTimeout) {

	public Duration shutdownDrain() {
		return socketTimeout;
	}
}
```

```java
// notification/adapter/in/MailTransportProperties.java — the house guard idiom (#414/#426, no JSR-303)
@ConfigurationProperties("riviera.notification.mail")
record MailTransportProperties(@DefaultValue("10000") int socketTimeoutMs) {

	/**
	 * The most the shutdown drain may spend. Render sends SIGTERM and SIGKILLs the process ~30s later
	 * (assumption A-1 — nothing in {@code docs/deploy/} records it), and the drain is only one phase of
	 * context close, so the ceiling leaves the rest of the shutdown room to finish.
	 */
	static final int SHUTDOWN_BUDGET_MS = 20_000;

	MailTransportProperties {
		if (socketTimeoutMs <= 0 || socketTimeoutMs > SHUTDOWN_BUDGET_MS) {
			throw new IllegalArgumentException(
					"riviera.notification.mail.socket-timeout-ms must be between 1 and "
							+ SHUTDOWN_BUDGET_MS + ", but was " + socketTimeoutMs
							+ "; it is both the relay's per-operation budget and the pools' shutdown "
							+ "drain window, so a non-positive value would restore Jakarta Mail's "
							+ "infinite timeouts (#368) while an oversized one would outlast the "
							+ "platform's SIGTERM grace and get the process killed mid-shutdown");
		}
	}
}
```

```java
// notification/adapter/in/MailTransportConfig.java
@Configuration
@EnableConfigurationProperties(MailTransportProperties.class)
class MailTransportConfig {

	@Bean
	MailTransportBudget mailTransportBudget(MailTransportProperties properties) {
		return new MailTransportBudget(Duration.ofMillis(properties.socketTimeoutMs()));
	}
}
```

```properties
# application.properties — one knob; application-mailer.properties interpolates it, MailTransportBudget derives the drain from it
riviera.notification.mail.socket-timeout-ms=${RIVIERA_SMTP_SOCKET_TIMEOUT_MS:10000}
```

```properties
# application-mailer.properties — replaces the three hard-coded 10000s
spring.mail.properties.mail.smtp.connectiontimeout=${riviera.notification.mail.socket-timeout-ms}
spring.mail.properties.mail.smtp.timeout=${riviera.notification.mail.socket-timeout-ms}
spring.mail.properties.mail.smtp.writetimeout=${riviera.notification.mail.socket-timeout-ms}
```

Both pools then replace their `SHUTDOWN_DRAIN_SECONDS` literal with
`pool.setAwaitTerminationMillis(budget.shutdownDrain().toMillis())`, and each class's Javadoc gains the
post-window decision (give up, never `shutdownNow()`) with its duplicate-mail implication — AC-10's
documentation half.

- [ ] **Step 4: Run them, verify they pass** —
      `gradle --no-daemon --console=plain test --tests "*MailTransport*" --tests "*RegistryMailExecutorConfigTest*" --tests "*AsyncMailDispatcherTest*" --tests "*RegistryMailPropertiesTest*" --tests "*MailerProfileWiringTest*" --tests "*MailSenderWiringIT*"`
      then the structural net:
      `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*MailListenerExecutorArchitectureTest*"`
      → PASS.

- [ ] **Step 5: Generalization-audit pass** — search for any other `awaitTermination*` /
      hard-coded socket or shutdown literal in `platform/src/main`; decide per site. Record below.

- [ ] **Step 6: Commit** — `git commit -m "fix(#410): derive the mail pools' shutdown drain from the relay socket budget (#410)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Housekeeping, runbook, and close-out

**Files:** Modify `docs/plans/registry-mail-bulkhead.md:281-282`, `docs/runbooks/observability.md`,
this plan doc

- [ ] **Step 1: Fold #411 into #410** in `registry-mail-bulkhead.md`'s follow-up sentence (AC-11) —
      a two-line prose edit, deliberately riding this PR rather than earning a docs-only one
      (`riviera-sdlc` merge close-out step 5 warns against exactly that).
- [ ] **Step 2: Runbook row** for `RIVIERA_SMTP_SOCKET_TIMEOUT_MS` beside #408's two knobs in
      `docs/runbooks/observability.md` — default, range, and the sentence that it also sets the
      shutdown drain, so nobody retunes one expecting the other to hold still.
- [ ] **Step 3: `riviera-docs-freshness`** over the phase-0..2 range — the module table's
      `notification` paragraph in `CLAUDE.md` states the two pools' saturation semantics; check whether
      the drain/MDC facts belong there or only in the runbook, and patch what the diff contradicts.
- [ ] **Step 4: OQ-1** — file the queued-at-shutdown recovery-loss follow-up (or record why not) and
      cite it here.
- [ ] **Step 5: Finalize Execution status** in this PR's own last commit, citing `merged via PR #NN`.
- [ ] **Step 6: Commit** — `git commit -m "docs(#410): fold #411 into #410 and document the derived drain (#410)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 1 (the derived drain window) | any other `awaitTermination*` window or restated relay-timeout literal | `grep -rn "awaitTermination\|WaitForTasksToComplete" platform/src/main/java` and `grep -rn "timeout" platform/src/main/resources/application*.properties` | **one real site**: `application-smtp4dev.properties` restated all three `10000`s — the local sink profile, which drives the *real* `SmtpMailer`, so a divergence there hides until it reproduces deployed. (`stripe.connect-timeout`/`read-timeout` also matched but feed no drain window and are already bounded by #426.) | fixed — all three now interpolate the knob, and `theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom` is parameterized over `mailer` **and** `smtp4dev` so the audit's finding is pinned, not just patched |
| 2026-07-29 | phase 0 (the shared MDC decorator) | any other explicitly-declared executor, `TaskDecorator`, or hand-rolled MDC carry in main | `grep -rn "ThreadPoolTaskExecutor\|setTaskDecorator\|TaskExecutor\|@EnableAsync" platform/src/main/java \| grep -v notification/` and `grep -rn "getCopyOfContextMap\|setContextMap" platform/src/main/java` | **none** outside `notification`; the only remaining copy/restore is `MdcTaskDecorator` itself | no further sites to fix. Boot's shared `applicationTaskExecutor` is auto-configured, not declared, and stays undecorated on purpose (Non-goals): adding one there changes behaviour on the invariant-#8/#9 spine listeners and is not what #410 asks for |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6:** `gradle --no-daemon --console=plain test --tests "*MdcTaskDecoratorTest*" --tests "*RegistryMailExecutorConfigTest*" --tests "*AsyncMailDispatcherTest*" --tests "*BookingConfirmationMailListenerTest*"` → PASS (`ac9e095`).
- [x] **AC-7..AC-9:** `gradle --no-daemon --console=plain test --tests "*MailTransport*" --tests "*MailerProfileWiringTest*"` → PASS (`04e6f49`). Both mutation-checked: re-hardcoding one `smtp.timeout` reddens `theRelayTimeoutsAreTheSameKnobTheDrainIsDerivedFrom`, so the assertion is not vacuous.
- [x] **AC-10:** both pools' `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` → PASS (`04e6f49`), mutation-checked by swapping `shutdown()` for `shutdownNow()` (reddens as intended). Registry half composed with `RegistryMailBulkheadIT` → PASS locally against real Postgres (Docker present).
- [x] **AC-11:** `docs/plans/registry-mail-bulkhead.md` follow-up sentence now describes #411 as folded into #410 (`68e6953`).

**Full-suite verification:** PR #433's own CI run — Backend (build + test), Frontend, CodeQL and SonarCloud all `success` on the ready-for-review head, which is the half the scoped local runs cannot prove (`riviera-local-debug`'s shared-state blind spot).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified `N/A`; no availability write path in the diff (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published surface changed (invariant #11).
- [ ] **Payment/payout** section justified `N/A`; the spine's executor is untouched (invariants #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] No booking code, address, or token in any new or edited log line (invariant #7).
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** `N/A — backend-only`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — **deliberately left unticked.** `riviera-review-overlay` was
      loaded and its whole backend bank walked (RV-BE-1..18 + RV-STYLE-1 + RV-PROC-1), and the ladder's
      rung 1 (`Skill("code-review")`) *did* load the plugin workflow — but that workflow is a subagent
      fan-out and this session's standing instruction forbids the Agent tool, which is rung 3's "the
      review subagents genuinely cannot run". The degraded inline path ran instead and is **declared** in
      the PR. Ticking this would make the PR record lie about the process (case history: PR #353/#355).
