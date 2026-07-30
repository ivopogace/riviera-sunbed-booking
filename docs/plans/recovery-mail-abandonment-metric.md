# Recovery-mail abandonment metric Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recovery mail still sitting in the dispatcher's queue when the shutdown drain window
expires is counted and logged instead of vanishing with the pool — so `riviera.mail.recovery.dropped`
means *every* recovery mail the pool never sent, and no mail-loss shape is left invisible to every
gauge the platform has.

**Architecture:** `AsyncMailDispatcher.destroy()` gains a second step: **after** `shutdown()` has
awaited the derived drain window and given up (#410 — never `shutdownNow()`), it **drains the
executor's remaining queue** and accounts for each element as
`MAIL_RECOVERY_DROPPED{reason="abandoned"}`. Draining rather than merely sizing is what makes the
number true: `shutdown()` leaves the pool *running*, so a counted-but-left task could still execute
and deliver, and the counter would then report a loss that did not happen. The third `reason` tag —
rather than a fifth metric name — is the taxonomy decision (D-1 under *Resolved*). To keep the
per-loss log line worth emitting, `MdcTaskDecorator` returns a **named** carrier type instead of a
lambda, so the abandoning thread can re-apply each discarded send's own submitting context: without
that, N identical unattributable lines would be the #415 per-loss rule cargo-culted past its own
rationale (grill finding G-2).

**Persistence:** JDBC only (invariant #1). `N/A — no table, no migration.` No Flyway version is
claimed, so the #122/#127 collision class does not apply.

**Source of intent:** GitHub issue **#434** (parent epic **#367**), raised as OQ-1 of **#410**
(PR #433, merged) and deliberately not absorbed there — it needs a metric decision and its own
runbook row.

**Skills consulted:**
- `riviera-sdlc` — the loop + the Skill-routing gate that selected the rest; the issue-intake grill
  gate (findings G-1..G-7 below).
- `riviera-java-conventions` — §5 pattern-matching `instanceof` for the carrier type instead of a
  cast ladder, records for the carrier, §6a named constants (`REASON_ABANDONED`, the tests' queue
  depth and grace window) over literals, §6c one-line-or-none comments with the prose in Javadoc,
  §10 SLF4J with no address and no link in any line (invariant #7).
- `riviera-modulith` — placement: nothing published changes. The counter name is read from `shared`'s
  `ObservabilityMetrics` (a read, not an addition), the emitter stays `notification.application`, and
  the carrier type stays a **private** nested record of `MdcTaskDecorator` — the narrowest surface
  that serves the one caller, so no `allowedDependencies` edit and no `event_type` rewrite.
- `riviera-local-debug` — system `gradle` + JDK-25 toolchain registration, scoped `--tests` runs
  only; CI owns the full suite. Its shared-state blind spot is why R-5 exists.
- `riviera-plan-doc` — this document's shape and the Execution-status state store.
- `riviera-review-overlay` — the review gate's project bank (RV-BE-1..18 + RV-STYLE-1 + RV-PROC-1),
  walked over the diff alongside `/code-review`'s subagent fan-out.
- `riviera-docs-freshness` — the substrate-doc sweep at phase 1, which found the three contradicted
  facts recorded below.
- **Not loaded, deliberately:** `postgres` (no SQL, no DDL, no migration), `riviera-stripe-payments`
  (no money path — `payment`/`payout` untouched), `riviera-frontend` / `angular-developer` /
  `playwright-cli` (backend-only; no user-observable surface — this slice makes an existing loss
  visible to operators and changes nothing a tourist can see).

**Branch:** `claude/sdlc-434-tbxhre` — the cloud session's **designated remote branch stands in for
`feature/recovery-mail-abandonment-metric`** (`riviera-sdlc` §Remote/cloud session addendum). A draft
PR is opened on the plan commit so CI gates every later push (`pull_request` only, #417); its number
is recorded in Execution status once it exists.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a wedged drainer with sends queued behind it, when the dispatcher is destroyed
      with a drain window too short to drain them, then each queued send increments
      `riviera.mail.recovery.dropped{reason="abandoned"}` and **neither** `saturated` nor `shutdown`
      moves — a redeploy's ones-and-twos cannot read as a degraded relay.
      *Pinned by:* `AsyncMailDispatcherTest.aSendStillQueuedWhenTheDrainWindowExpiresIsCountedAsAbandoned`
- [x] **AC-2:** Given the same queued sends and the shipped drain window, when the drainer is
      released so the queue empties inside the window, then **nothing** is counted — the window
      exists to deliver those sends, and counting them would report a loss that did not happen.
      *Pinned by:* `AsyncMailDispatcherTest.aSendThatDrainsInsideTheWindowIsNotCountedAsAbandoned`
- [x] **AC-3:** Given a send counted as abandoned, when the drainer is later released, then that send
      **does not run** — the count is honest because the send was discarded, not merely counted.
      *Pinned by:* the post-release assertions of the same `…IsCountedAsAbandoned` test.
- [x] **AC-4:** Given sends submitted with `correlationId=corr-1` and a shutdown thread whose own
      context says otherwise, when they are abandoned, then there is **one `WARN` line per send**,
      each carrying `corr-1` in its own MDC and containing no `@`, no `http` and no arrival code
      (invariant #7, the #415 per-loss rule).
      *Pinned by:* `AsyncMailDispatcherTest.everyAbandonedSendIsLoggedOnceUnderItsOwnRequestsContext`
- [x] **AC-5:** Given that same shutdown thread, when the abandonment lines have been emitted, then
      the thread's **own** logging context is intact — accounting for a lost mail must not relabel
      every later shutdown line as that user's request. *Pinned by:* the final assertion of the same
      test, and at the mechanism level by
      `MdcTaskDecoratorTest.restoresWhateverContextTheRunningThreadAlreadyHad`.
- [x] **AC-6:** Given a send **running** when the window expires, when the dispatcher is destroyed,
      then it is still abandoned without interruption (no `shutdownNow()`, #410) and is **not**
      counted — it may already have handed off to the relay, so classifying it as lost would
      over-report a mail that arrived.
      *Pinned by:* `AsyncMailDispatcherTest.aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted`
      (existing, extended with the count assertion).
- [x] **AC-7:** Given `docs/runbooks/observability.md`, when the recovery-mail section is read, then
      it states which losses each name covers — including that abandonment is now
      `reason="abandoned"`, and what the counter still excludes — so no counter reads as more
      complete than it is. Its pre-#434 sentence *"not counted by `riviera.mail.recovery.dropped`,
      which counts rejections"* is corrected rather than left contradicting the code.
      *Pinned by:* review of the diff (prose; no test).

## Non-goals

- **A fifth metric name.** Decided against — D-1 under *Resolved*.
- **Counting the in-flight send** at window expiry (AC-6 states why it must not be counted).
- **`shutdownNow()` escalation**, or any other change to the non-interruption decision (#410). The
  drain this slice adds touches the *queue*, which is what `shutdownNow()` would return anyway — it
  interrupts nothing.
- **`server.shutdown=graceful`.** Making the web layer stop accepting requests before the mail pools
  close would shrink both `reason="shutdown"` and `reason="abandoned"` at the source. That is a
  platform-wide posture change with its own blast radius — it competes for the same SIGTERM grace the
  mail drain is bounded by (the runbook's per-pool ceiling) — not a metric slice's call.
- **Alert wiring.** `MoneyPathAlertCheck` reads exactly three money-path signals and deliberately
  none of the mail counters (#408/#415/#423/#428 all held this line); this slice does not change that.
- **The registry vehicle.** It has no equivalent gap: its abandoned sends leave the publication
  outstanding and the next start republishes them, which is precisely why #410 could afford to give
  up rather than interrupt.
- No new endpoint, DTO, migration, published surface, or frontend surface.

## Behavior-parity ledger (retirement / replacement slices only)

`MdcTaskDecorator`'s clear-afterwards semantics **is** an existing behavior being changed, so the
ledger applies to it:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `decorate` captures `MDC.getCopyOfContextMap()` on the submitting thread | preserved | unchanged — the capture lands in a named record instead of a lambda's closure; `MdcTaskDecoratorTest.capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne` must stay green unchanged |
| A `null` caller context is tolerated (no `setContextMap(null)`) | preserved | same guard, now inside the record; `toleratesAnAbsentCallerContext` stays green |
| A task's failure propagates out of the decorated `Runnable` | preserved | same `finally`-only handling; `clearsTheContextEvenWhenTheTaskThrows` stays green |
| `MDC.clear()` in a `finally`, unconditionally | **changed** | now restores whatever context the running thread already had. On a pooled worker that **is** empty (the previous task restored it), so worker behaviour is identical and `clearsTheContextAfterTheTask` stays green. The change exists for the one caller that is not a fresh worker: the shutdown thread emitting the abandonment lines (AC-5) |
| `AsyncMailDispatcher.destroy()` = `executor.shutdown()` and nothing else | **changed** | it now drains and accounts for the leftover queue afterwards; the `shutdown()` call, its derived window and the no-`shutdownNow()` decision are untouched |
| `MAIL_RECOVERY_DROPPED` carries exactly two `reason` values | **changed** | a third, `abandoned`; both existing series keep their meaning and their alert rules (D-1) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The queue is drained **before** the window instead of after, discarding sends the drain exists to deliver — turning delivered mail into counted loss (the issue's own sketch suggests `drainTo` *before* `shutdown()`; grill finding G-1) | med | high | the drain runs strictly after `shutdown()` returns; AC-2 asserts the other half — a send that drains in time is *not* counted — so moving the drain earlier fails loudly | claude | closed — `destroy()` drains after `shutdown()`; mutation-checked, moving the drain ahead of the window reddens `aSendThatDrainsInsideTheWindowIsNotCountedAsAbandoned` |
| R-2 | `getQueue().drainTo(...)` races the drainer's `poll()`, so a send is counted *and* runs (double-report) or is missed | med | med | a `BlockingQueue` hands each element to exactly one of `poll`/`drainTo`, so the race is benign in both directions: a task is run **xor** counted. AC-1's wedged drainer makes the count exact; AC-3 proves the counted ones never ran | claude | closed — exact counts in both directions; the wedge holds the only thread for the whole window, so nothing polls concurrently in the pinned case |
| R-3 | Returning a named type from `decorate` silently changes the registry pool, whose `CompositeTaskDecorator` owns the same slot — the episode throttle strands open (the #410 R-1 hazard, one layer down) | low | high | `decorate`'s signature and the composition order are untouched, and the whole of `RegistryMailExecutorConfigTest` (MDC **and** throttle tests) runs unchanged in the phase-0 batch | claude | closed — `decorate`'s signature and the composition order are untouched; all of `RegistryMailExecutorConfigTest` green unchanged |
| R-4 | The in-flight send is counted too, over-reporting a mail that already reached the relay — the exact ambiguity #410 refused to resolve by interrupting | med | med | only the **queue** is drained; AC-6 pins that a running send moves no counter, and the Javadoc + runbook state the exclusion so the number is not read as "every mail lost at shutdown" | claude | closed — only the queue is drained; `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` now asserts the running send moves no counter |
| R-5 | Shared-state accumulation across the full suite (`riviera-local-debug`'s blind spot): `destroy()` now does extra work on every context close, and any context closing with a queued mail gains `WARN` lines | low | low | the added work is bounded by the queue (≤100) and is nil in a drained pool; no shared bean, filter or scheduled job is touched. To be verified by the PR's own CI run before phase 1 builds on it | claude | closed — CI green on the phase-0/1 head (Backend, Frontend, CodeQL) with no IT regression; the added work is bounded by the queue and nil in a drained pool |
| R-6 | A third `reason` on a shipped series changes what an existing dashboard total means, and an alert on the total starts firing on redeploys | low | med | the total already meant "recovery mail the pool never sent" — both existing reasons are pool-level refusals — so the addition is in-kind; the runbook's standing rule is unchanged (**alert on `reason="saturated"`, track the total**) and AC-1 pins that `saturated` cannot move on a redeploy | claude | closed — the runbook now carries a `reason="abandoned"` row with its own alert rule, restates the standing one (alert on `saturated`, track the total), and says why the third value belongs to this name |

## Open questions / Assumptions

*(none open — D-1 and G-1..G-7 are resolved below; anything the build surfaces gets a new row here)*

### Resolved

- **D-1 (the issue's real question, resolved at plan time): a third `reason` tag on
  `MAIL_RECOVERY_DROPPED`, not a fifth metric name.** The issue asks that this be decided
  consistently with the #423 `FAILED`-vs-`DROPPED` split rather than in isolation, and it is: #423
  split on **attempted vs never attempted** — `FAILED` is the send the transport ran and lost,
  `DROPPED` the send the pool never ran. Abandonment is squarely the second: the pool never ran it.
  Operationally it is the twin of the existing `reason="shutdown"` — a redeploy artefact, no relay at
  fault, expected in ones and twos, meaningful only if sustained — and the two differ *only* in
  whether `execute()` had already returned, which is invisible to the user and irrelevant to the
  remedy. A fifth name would add a series nobody alerts on and would invite exactly the summing all
  four Javadocs warn against. It also matches the issue's own stated order of preference. Consequence
  carried into phase 0: the gloss "could not accept" in `ObservabilityMetrics` and "the dispatcher
  refused the work" in the runbook are corrected to **never ran** — those wordings are what made a
  third reason look inconsistent with the name.
- **G-1 (grill, resolved at plan time):** the issue's sketch suggests `getQueue().drainTo(...)`
  *before* `shutdown()`. That would discard sends the drain window exists to deliver and count them
  as lost. The drain must run **after** `shutdown()` returns — i.e. after the window has expired —
  which is also the first moment "still queued" means "never going to run". Encoded as R-1 + AC-2.
- **G-2 (grill, resolved at plan time):** the issue's AC-2 asks for one log line per abandoned send,
  citing the #415 per-loss rule. That rule's stated rationale is that the line *"carries in its MDC
  the correlation id of the request whose user is still waiting"* — and it does **not** transfer for
  free here, because the line is emitted on the shutdown thread, not the submitter's. A naive
  implementation would emit N identical, unattributable lines: the rule cargo-culted past its reason.
  Resolution: make the rationale true rather than drop the AC — `MdcTaskDecorator` returns a named
  carrier so each line is emitted under its own send's captured context (AC-4).
- **G-3 (grill, resolved at plan time):** counting without removing would over-report.
  `ThreadPoolTaskExecutor.shutdown()` awaits termination and returns, but the pool is **still
  running**, so a queued task can still execute afterwards. Reading `getQueue().size()` and leaving
  the tasks in place would therefore claim losses that may not occur. `drainTo` makes the count and
  the loss the same event, and it interrupts nothing, so #410's decision is untouched.
- **G-4 (grill, resolved at plan time):** the **in-flight** send at window expiry stays deliberately
  uncounted (AC-6, R-4) — it is the one shutdown loss that cannot be classified, which is why #410
  chose give-up over `shutdownNow()` in the first place. Stated in the Javadoc and the runbook so the
  counter is not read as "every mail lost at shutdown".
- **G-5 (grill, in-flight check):** open PRs are **#435** (a docs-only stage-pointer edit to a plan
  doc, #407) and nine frontend Dependabot bumps. None touches `notification`, `shared`, or
  `docs/runbooks/observability.md`. No Flyway version is claimed by this slice **or** by any open PR's
  diff, so the #122/#127 collision class does not apply. `#410` (PR #433), which last touched both
  files in scope, is merged.
- **G-6 (grill, module ownership):** checked against `RESPONSIBILITIES.md` — the emitter stays in
  `notification` (its Job line owns both vehicles *and* their executors), `shared` is only **read**
  for the name (its own note warns against admitting more), and no other module's Not-My-Job list is
  touched. Table filled in §4a.
- **G-7 (grill, previous sibling's close-out):** #410's close-out is complete — the issue is closed,
  and epic #367 tracks slices as **sub-issues** (12/19 complete) rather than a checkbox list, so
  there was no checkbox to tick. One real gap found: **#434 itself is not a sub-issue of #367**; it is
  added at phase 1 so the epic's own count reflects it.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` Nothing in scope reads or writes
`availability(set_id, booking_date)`: the diff accounts for mail the recovery pool will not send, and
carries a logging context onto the thread that says so. The claim/release path
(`availability.api.AvailabilityClaim`, invariant #2) is unreachable from `AsyncMailDispatcher`, and
the cutoff (#4) and pool flag (#3) are untouched. The one adjacent invariant-#2 hazard in this area —
a global `queryTimeout` bounding `availability`'s `SELECT … FOR UPDATE` — is not approached: no SQL,
no property and no data source is touched (#386 keeps that timeout adapter-scoped).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | It owns transactional-mail delivery and **both vehicles' bounded executors** (CLAUDE.md module table, #382/#383). What happens to a queued send when its pool closes is a property of that pool, so it cannot live anywhere else. |
| M-2 | `shared` | existing | (none — OPEN Shared Kernel, not a bounded context) | **Read-only touch.** `ObservabilityMetrics.MAIL_RECOVERY_DROPPED`'s Javadoc gains the third `reason`; no constant is added, so the kernel does not grow (its #371 admission bar is untouched). The `String` is compile-time inlined, so no runtime dependency is created (invariant #11). |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | `N/A — no published surface added, changed, or moved.` `notification::api` keeps exactly `MailSender` + `MailDeliverability`; no `vocabulary`, `events` or `spi` change; no `allowedDependencies` edit; no Flyway `event_type` rewrite. | | |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | `N/A — no event added or changed.` No listener signature moves, so the registry's `listener_id` still reads as V31 migrated it (kept green by `RegistryMailBulkheadIT.keepsTheListenerIdV31Migrated`). | | | | | |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Account for a recovery send discarded unrun when the drain window expires (`AsyncMailDispatcher`, `notification.application`) | `notification` | `notification` Job: "the two delivery vehicles … each draining on its own bounded executor". The loss is created by that executor's shutdown, and the class that configures the window is the only one that can observe it. Not `shared` (which owns metric **names**, explicitly not observability) and not the root (nothing may depend on the composition root). |
| Re-apply a discarded send's submitting context while accounting for it (`MdcTaskDecorator`, `notification.application`) | `notification` | Same Job line, and the same reasoning #410 recorded for the decorator itself: it is a property of these two pools. Kept as a **private** nested record plus one static helper — the narrowest surface that serves the one caller — so nothing new is published and `adapter/in`'s existing use of the class is unaffected. |
| Nothing is added to, or moved out of, any other module | — | No other module's **Not My Job** list is touched; `shared` gains no member. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no ledger row is read or written, no Stripe call is
made. The slice's only relationship to the money path is the protective one it inherits: this pool
exists so a degraded relay cannot occupy the shared `applicationTaskExecutor` that carries
`booking`'s payment→confirm listener (invariant #8) and `payout`'s accrual/reversal (invariant #9).
That pool is untouched, and `MailListenerExecutorArchitectureTest` keeps it that way.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or response shape is touched.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current `riviera-sdlc` stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** `merge close-out — both gates run, findings fixed; awaiting merge of PR #436`

**Next action:** Merge PR #436 once CI and Sonar are green on this commit. Everything the close-out
can do pre-merge is done; what remains is GitHub-only and needs no commit — closing #434 (the PR's
`Closes #434` does it). #434 was added as a sub-issue of epic #367 at phase 1, which is the epic tick
this repo's sub-issue tracking uses in place of a checkbox.

*Fan-out completeness:* all five reviewers reported. Two (shallow-bug-scan, git-history) came back clean
having independently decompiled Spring 7.0.8 to verify the two facts the whole slice rests on — that
`ExecutorConfigurationSupport.shutdown()` blocks for the drain window before returning and never hides a
`shutdownNow()`, and that `ThreadPoolTaskExecutor` decorates *inside* `execute()` so the carrier record
is what actually sits in the queue. Those were reasoned from the docs at plan time; they are now
verified against the bytecode in use.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — count and log the send abandoned at shutdown, attributably | ✅ | `e7d68db` |
| 1 — runbook, metric doc, docs-freshness | ✅ | `dab29a7` |
| 2 — review-gate findings F-1..F-3 + close-out | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` fan-out, prior-PR-comments reviewer; confidence **100**/100) | **RV-PROC-1: the *Skills consulted* line omitted `riviera-review-overlay` and `riviera-docs-freshness`**, though the diff rewrites three substrate docs and the slice goes through the review gate — and the plan's own body records both running. The *identical* finding was raised and fixed on **#427** and again on **#430**, which is what makes it a finding rather than a nitpick: three consecutive slices have now written that line as an inventory of *plan-time* skills when RV-PROC-1 reads it as an inventory of *every area the diff touches*. | fixed-in-`fix-round` |
| F-2 | review (`/code-review` fan-out, comment-compliance reviewer; confidence **75**/100) | **`recordAbandonment`'s Javadoc said the closing thread "carries none of its own" context** — stated absolutely, while this PR's own `MdcTaskDecorator` deliberately *restores* that thread's context and `everyAbandonedSendIsLoggedOnceUnderItsOwnRequestsContext` asserts a `"shutdown-thread"` value survives. True of production, false as written, and it read as contradicting the decorator's stated reason for restoring. | fixed-in-`fix-round` — reworded to "in production a shutdown thread with no request of its own to name", with the restore behaviour named |
| F-3 | review (`/code-review` fan-out, comment-compliance reviewer; confidence **25**/100 and **0**/100 respectively — fixed anyway) | Two smaller comment inaccuracies the same reviewer raised: `MdcTaskDecoratorTest`'s "the shutdown thread's context, i.e. none" (scored 25 — the scorer read it as a counterfactual, which it is, but "i.e. none" is still wrong about the thread), and `ObservabilityMetrics:82`'s "a deferral, a **refusal**, a failure and an abandonment" (scored 0 on the mistaken basis that the line was modified by this PR — it was not, and "refusal" is exactly the gloss the new text 20 lines above says to stop using). Both are one-line prose corrections that make the file self-consistent, so they were taken despite scoring below the fan-out's ≥80 posting bar. | fixed-in-`fix-round` |
| F-4 | review (`/code-review` fan-out, CLAUDE.md-adherence reviewer; confidence **75**/100) | **The `notification` module row grew ~150 words**, against `CLAUDE.md:8`'s own rule — *"Keep this file short and stable; detailed, situational guidance lives in the skills, not here."* Notable because **#410 raised this same candidate, scored it 0, and filtered it** as "a house pattern 12 prior slices each followed". That dismissal does not survive contact with the rule: a pattern repeated by twelve slices is what a worsening violation looks like, not evidence of compliance. | fixed-in-`fix-round` — the addition is cut to the fact (the third value, and that the name reads *never ran*) with a pointer to the runbook for the counting rule and the exclusion; ~60 words instead of ~150 |
| — | review (`/code-review` fan-out) | **Ran in full** — eligibility + CLAUDE.md-scope + 5 parallel reviewers (CLAUDE.md adherence, shallow bug scan, git-history context, prior-PR comments, code-comment compliance) + per-finding confidence scoring, after the maintainer authorized the subagents that this session's standing instruction otherwise withholds. Two reviewers clean; the three findings above plus F-3's pair came from the other three. `riviera-review-overlay`'s backend bank (RV-BE-1..18, RV-STYLE-1, RV-PROC-1) walked inline alongside it — no additional finding, and RV-BE-13 was actively verified rather than waved through: `CorrelationIdFilter` allowlists an inbound id to `[A-Za-z0-9_-]{1,64}`, so borrowing a correlation id onto a log line carries no CRLF-forging risk. | complete |
| — | sonar | Gate passed on the reviewed head, and the list pulled from the API rather than read off the badge: `total: 0` issues, `new_duplicated_blocks=0`, `new_coverage=100.0%` — **not** a false-clean zero, since `new_lines=133` confirms an analysis actually ran (the PR #318 failure mode). Re-checked on the fix-round head. | clear |

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  the third `reason` constant + counter, and `destroy()` gaining the drain-and-account step.
- `platform/src/main/java/ai/riviera/platform/notification/application/MdcTaskDecorator.java` —
  `decorate` returns a private named carrier record; one static `inContextOf` helper so a *non-worker*
  thread can run something under a task's captured context; the `finally` restores rather than clears.
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` —
  `MAIL_RECOVERY_DROPPED`'s Javadoc: three reasons, "never ran" instead of "could not accept", and the
  exclusion; `MAIL_RECOVERY_FAILED`'s sibling sentence corrected to match.
- `platform/src/test/java/ai/riviera/platform/notification/application/AsyncMailDispatcherTest.java` —
  three new tests (AC-1..AC-5) plus the count assertion on the existing AC-6 test.
- `platform/src/test/java/ai/riviera/platform/notification/application/MdcTaskDecoratorTest.java` —
  the helper's two paths and the restore-not-clear semantics.
- `docs/runbooks/observability.md` — the `reason="abandoned"` row, what the counter excludes, and the
  correction of the sentence that says abandonment is uncounted.
- `CLAUDE.md`, `RESPONSIBILITIES.md` — the docs-freshness pass's extensions, if the run finds them due.

---

## Phase 0 — Count and log the send abandoned at shutdown, attributably

**Files:** Modify `notification/application/AsyncMailDispatcher.java`,
`notification/application/MdcTaskDecorator.java`, `shared/ObservabilityMetrics.java` (Javadoc),
`notification/application/AsyncMailDispatcherTest.java`,
`notification/application/MdcTaskDecoratorTest.java`

- [x] **Step 1: Write the failing tests**

```java
// AsyncMailDispatcherTest (AC-1, AC-3)
@Test
void aSendStillQueuedWhenTheDrainWindowExpiresIsCountedAsAbandoned() throws Exception {
	AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, new MailTransportBudget(TINY_DRAIN));
	CountDownLatch ran = new CountDownLatch(QUEUED_AT_SHUTDOWN);
	CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, ran);

	dispatcher.destroy();

	assertThat(droppedFor(AsyncMailDispatcher.REASON_ABANDONED))
			.as("a send discarded with the pool is as lost as one the pool refused, and nothing else sees it")
			.isEqualTo(QUEUED_AT_SHUTDOWN);
	assertThat(droppedFor(AsyncMailDispatcher.REASON_SATURATED))
			.as("a redeploy is not a degraded relay; the alerting reason must not move")
			.isZero();
	assertThat(droppedFor(AsyncMailDispatcher.REASON_SHUTDOWN)).isZero();

	gate.countDown();
	assertThat(ran.await(DISCARD_GRACE_MILLIS, TimeUnit.MILLISECONDS)).isFalse();
	assertThat(ran.getCount())
			.as("the count is only honest if the send was discarded, not counted and then run anyway")
			.isEqualTo(QUEUED_AT_SHUTDOWN);
}

// (AC-2)
@Test
void aSendThatDrainsInsideTheWindowIsNotCountedAsAbandoned() throws Exception {
	AsyncMailDispatcher dispatcher = dispatcher();
	CountDownLatch ran = new CountDownLatch(QUEUED_AT_SHUTDOWN);
	CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, ran);

	gate.countDown();
	dispatcher.destroy();

	assertThat(ran.await(AWAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
	assertThat(droppedTotal())
			.as("the window exists to deliver these; counting them would report a loss that did not happen")
			.isZero();
}

// (AC-4, AC-5)
@Test
void everyAbandonedSendIsLoggedOnceUnderItsOwnRequestsContext() throws Exception {
	AsyncMailDispatcher dispatcher = new AsyncMailDispatcher(meters, new MailTransportBudget(TINY_DRAIN));
	MDC.put(CORRELATION_KEY, "corr-1");
	CountDownLatch gate = wedgeWithQueuedSends(dispatcher, QUEUED_AT_SHUTDOWN, new CountDownLatch(1));
	MDC.put(CORRELATION_KEY, "shutdown-thread");

	try {
		dispatcher.destroy();

		assertThat(logs.list)
				.as("one line per loss (#415): there is no durable copy to make a repeat redundant")
				.hasSize(QUEUED_AT_SHUTDOWN)
				.allSatisfy(event -> {
					assertThat(event.getLevel())
							.as("a redeploy outrunning the drain is a real loss, but no relay is at fault")
							.isEqualTo(Level.WARN);
					assertThat(event.getMDCPropertyMap())
							.as("invariant #7 keeps the address and the link out, so the correlation id is "
									+ "the only handle on whose mail this was — and it must be the "
									+ "submitter's, not the shutdown thread's")
							.containsEntry(CORRELATION_KEY, "corr-1");
					assertThat(event.getFormattedMessage()).doesNotContain("@").doesNotContain("http");
				});
		assertThat(MDC.get(CORRELATION_KEY))
				.as("accounting for a lost mail must not relabel every later shutdown line as that request")
				.isEqualTo("shutdown-thread");
	}
	finally {
		MDC.clear();
		gate.countDown();
	}
}
```

> The wedge helper mirrors the shipped `saturate(...)`: dispatch one send that blocks on a gate,
> **confirm it is running** (or it would occupy a queue slot the test is counting), then queue
> `QUEUED_AT_SHUTDOWN` sends that count down `ran` if they ever execute.

```java
// MdcTaskDecoratorTest — the mechanism the attributable line rests on (AC-5)
@Test
void runsAnActionUnderTheContextADecoratedTaskWasSubmittedWith() { /* the action sees corr-1 */ }

@Test
void runsTheActionPlainlyForATaskItDidNotDecorate() { /* no carrier: still runs, no NPE */ }

@Test
void restoresWhateverContextTheRunningThreadAlreadyHad() { /* "other" survives running a corr-1 task */ }
```

- [x] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*"`
      → FAIL: `REASON_ABANDONED` and `MdcTaskDecorator.inContextOf` do not exist (compile), and once
      declared, the abandoned count is `0` where `QUEUED_AT_SHUTDOWN` is expected.

- [x] **Step 3: Minimal implementation**

```java
// MdcTaskDecorator — a named carrier instead of a lambda, so a non-worker thread can borrow the context
@Override
public Runnable decorate(Runnable task) {
	return new ContextCarryingTask(task, MDC.getCopyOfContextMap());
}

public static void inContextOf(Runnable task, Runnable action) {
	if (task instanceof ContextCarryingTask carried) {
		carried.inCallerContext(action);
		return;
	}
	action.run();
}

private record ContextCarryingTask(Runnable task, Map<String, String> callerContext) implements Runnable {

	@Override
	public void run() {
		inCallerContext(task);
	}

	private void inCallerContext(Runnable action) {
		Map<String, String> ownContext = MDC.getCopyOfContextMap();
		if (callerContext != null) {
			MDC.setContextMap(callerContext);
		}
		try {
			action.run();
		}
		finally {
			restore(ownContext);
		}
	}

	private static void restore(Map<String, String> context) {
		if (context == null) {
			MDC.clear();
			return;
		}
		MDC.setContextMap(context);
	}
}
```

```java
// AsyncMailDispatcher — the fourth loss shape, on the existing series' third reason
/** The drain window expired with the send still queued: a redeploy outran the pool. Still a lost mail. */
static final String REASON_ABANDONED = "abandoned";

@Override
public void destroy() {
	executor.shutdown();
	accountForAbandonedSends();
}

private void accountForAbandonedSends() {
	List<Runnable> abandoned = new ArrayList<>();
	executor.getThreadPoolExecutor().getQueue().drainTo(abandoned);
	abandoned.forEach(this::recordAbandonment);
}

private void recordAbandonment(Runnable send) {
	droppedWhenAbandoned.increment();
	MdcTaskDecorator.inContextOf(send, AsyncMailDispatcher::logAbandonment);
}

private static void logAbandonment() {
	log.warn("Recovery email still queued when the shutdown drain window expired; the send was discarded "
			+ "and the user must re-request");
}
```

Each class's Javadoc gains the reasoning the code cannot carry: why the drain runs *after* the window
(a count that is a loss), why the in-flight send is excluded (it may have reached the relay), and why
this is a third `reason` rather than a fifth name (D-1).

- [x] **Step 4: Run them, verify they pass** —
      `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*" --tests "*RegistryMailExecutorConfigTest*" --tests "*MailTransport*"`
      then the structural net:
      `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*MailListenerExecutorArchitectureTest*"`
      → PASS, including all four shipped `MdcTaskDecoratorTest` tests and both registry throttle tests
      unchanged (R-3).

- [x] **Step 5: Generalization-audit pass** — search every `destroy()` / `DisposableBean` /
      `waitForTasksToCompleteOnShutdown` / `awaitTermination` site for another place where a bounded
      queue can discard work unaccounted; decide per site and record in the log below.

- [x] **Step 6: Commit** — `git commit -m "feat(#434): count the recovery mail abandoned in the queue at shutdown (#434)"`
      → then **push and open the draft PR immediately** (CI fires on `pull_request` only, #417).

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Runbook, metric doc, docs-freshness and close-out

**Files:** Modify `docs/runbooks/observability.md`, this plan doc, and whatever the docs-freshness run
finds due (expected: `CLAUDE.md`'s `notification` row, `RESPONSIBILITIES.md`'s notification section)

- [x] **Step 1: The runbook row** (AC-7) — add `reason="abandoned"` to
      `riviera_mail_recovery_dropped_total`'s tag table with its alert rule (not on its own; a
      *sustained* rise means recovery volume has outgrown a single drainer thread, which nothing else
      makes visible), and state the one loss the counter still excludes (the in-flight send).
- [x] **Step 2: Correct the contradicted sentence** at `docs/runbooks/observability.md:252`, which
      currently says abandonment is *not* counted.
- [x] **Step 3: `riviera-docs-freshness`** over the phase-0..1 range; patch what the diff
      contradicts, extend where a future session could plausibly undo a decision.
- [x] **Step 4: Add #434 as a sub-issue of epic #367** (grill finding G-7).
- [x] **Step 5: Finalize Execution status** in this PR's own last commit, citing `merged via PR #NN`.
- [x] **Step 6: Commit** — `git commit -m "docs(#434): document the abandoned recovery mail's counter and its limits (#434)"`

### Docs-freshness run (merge close-out step 5)

Range `origin/main..HEAD`, run at phase 1. **Three contradicted facts, all patched:**

- `docs/runbooks/observability.md:252` — stated that an abandoned send is *"**not** counted by
  `riviera.mail.recovery.dropped`, which counts rejections, not abandonment at shutdown"* —
  contradicted by phase 0 — **patched** to name the `reason="abandoned"` series and to state the one
  loss still excluded (the in-flight send), so it cannot read as more complete than it is.
- `CLAUDE.md:157` — the `notification` row stated the tag's value set as *"(`saturated`/`shutdown`)"* —
  now three — **patched**, with the drain-after-the-window rule and the exclusion, since both are
  decisions a future session could plausibly undo.
- `RESPONSIBILITIES.md:302` — stated *"#423 **completed** that accounting"*, a present-tense
  completeness claim #434 disproves, alongside the same two-value tag — **patched** to "extended", plus
  the third value and why the name reads *never ran* rather than *refused*.

Checked and **clean**: `CONTEXT.md` (a metric tag is not ubiquitous language — its only `abandon` hit
is the Request-mode pay-window, unrelated), `docs/adr/ADR-0011` (decision 5 says a redeploy past the
drain window loses the send and never claims it is invisible, so it stays true), `docs/adr/ADR-0012`,
`docs/agents/*`, `docs/deploy/*`, `docs/runbooks/mailer-profile-smoke-test.md` (its drain sentence
names the deriving property, not a literal, and says "lost", not "uncounted"), the `riviera-*` skills
(none cites these classes or the counter), `README.md`. Knowledge-graph refresh **skipped** —
`graphify-out/` is absent in this cloud clone, as expected.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 0 (accounting for work discarded at shutdown) | any other executor that can discard queued work unaccounted when its context closes | `grep -rn "DisposableBean\|awaitTermination\|WaitForTasksToComplete\|ThreadPoolTaskExecutor" platform/src/main/java` | **one other executor, deliberately left alone.** The registry pool (`RegistryMailExecutorConfig`) discards queued sends at shutdown too, but each one's event publication stays outstanding and the next start republishes it — `riviera.outbox.pending` already carries them, so a counter there would count one loss twice (#423's argument, verbatim). No third executor is declared in main; Boot's shared `applicationTaskExecutor` is auto-configured and carries the registry-backed money-path listeners for the same reason | no further site to fix; the asymmetry is recorded in `AsyncMailDispatcher`'s Javadoc beside the three it already carries |

---

## Acceptance-criteria verification (final)

> Filled at the end of each phase with the command run and the commit that proves it — not before.

- [x] **AC-1..AC-5:** `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*"` → PASS (13 + 7 tests, 0 failures, 0 skipped), phase 0. **Mutation-checked three ways, each reddening exactly one test and nothing else:** counting the queue without draining it reddens AC-3's post-release assertion; logging without borrowing the send's context reddens AC-4's MDC assertion; draining before the window is awaited reddens AC-2. None of the three assertions is vacuous.
- [x] **AC-6:** `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted` → PASS, extended so the in-flight send is asserted to move no counter (still mutation-checked by swapping `shutdown()` for `shutdownNow()`).
- [x] **AC-7:** the runbook diff states all three reasons and the exclusion — phase 1.

**Full-suite verification:** the PR's own CI run — Backend (build + test), Frontend, CodeQL and
SonarCloud on the ready-for-review head, which is the half scoped local runs cannot prove
(`riviera-local-debug`'s shared-state blind spot).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-7 is prose, marked as such).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section justified `N/A`; no availability write path in the diff (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published
      surface changed (invariant #11).
- [x] **Payment/payout** section justified `N/A`; the spine's executor is untouched (invariants #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6).
- [x] No booking code, address, or token in any new or edited log line (invariant #7) — asserted by AC-4.
- [x] No schema change, so no Flyway migration (invariant #12).
- [x] **Frontend** `N/A — backend-only`.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #436`.
- [x] **The review gate ran in full** — `/code-review`'s subagent fan-out per the
      `references/pr-gates.md` §1 ladder, plus `riviera-review-overlay`'s backend bank.
