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

- [ ] **AC-1:** Given a wedged drainer with sends queued behind it, when the dispatcher is destroyed
      with a drain window too short to drain them, then each queued send increments
      `riviera.mail.recovery.dropped{reason="abandoned"}` and **neither** `saturated` nor `shutdown`
      moves — a redeploy's ones-and-twos cannot read as a degraded relay.
      *Pinned by:* `AsyncMailDispatcherTest.aSendStillQueuedWhenTheDrainWindowExpiresIsCountedAsAbandoned`
- [ ] **AC-2:** Given the same queued sends and the shipped drain window, when the drainer is
      released so the queue empties inside the window, then **nothing** is counted — the window
      exists to deliver those sends, and counting them would report a loss that did not happen.
      *Pinned by:* `AsyncMailDispatcherTest.aSendThatDrainsInsideTheWindowIsNotCountedAsAbandoned`
- [ ] **AC-3:** Given a send counted as abandoned, when the drainer is later released, then that send
      **does not run** — the count is honest because the send was discarded, not merely counted.
      *Pinned by:* the post-release assertions of the same `…IsCountedAsAbandoned` test.
- [ ] **AC-4:** Given sends submitted with `correlationId=corr-1` and a shutdown thread whose own
      context says otherwise, when they are abandoned, then there is **one `WARN` line per send**,
      each carrying `corr-1` in its own MDC and containing no `@`, no `http` and no arrival code
      (invariant #7, the #415 per-loss rule).
      *Pinned by:* `AsyncMailDispatcherTest.everyAbandonedSendIsLoggedOnceUnderItsOwnRequestsContext`
- [ ] **AC-5:** Given that same shutdown thread, when the abandonment lines have been emitted, then
      the thread's **own** logging context is intact — accounting for a lost mail must not relabel
      every later shutdown line as that user's request. *Pinned by:* the final assertion of the same
      test, and at the mechanism level by
      `MdcTaskDecoratorTest.restoresWhateverContextTheRunningThreadAlreadyHad`.
- [ ] **AC-6:** Given a send **running** when the window expires, when the dispatcher is destroyed,
      then it is still abandoned without interruption (no `shutdownNow()`, #410) and is **not**
      counted — it may already have handed off to the relay, so classifying it as lost would
      over-report a mail that arrived.
      *Pinned by:* `AsyncMailDispatcherTest.aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted`
      (existing, extended with the count assertion).
- [ ] **AC-7:** Given `docs/runbooks/observability.md`, when the recovery-mail section is read, then
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
| R-1 | The queue is drained **before** the window instead of after, discarding sends the drain exists to deliver — turning delivered mail into counted loss (the issue's own sketch suggests `drainTo` *before* `shutdown()`; grill finding G-1) | med | high | the drain runs strictly after `shutdown()` returns; AC-2 asserts the other half — a send that drains in time is *not* counted — so moving the drain earlier fails loudly | claude | open |
| R-2 | `getQueue().drainTo(...)` races the drainer's `poll()`, so a send is counted *and* runs (double-report) or is missed | med | med | a `BlockingQueue` hands each element to exactly one of `poll`/`drainTo`, so the race is benign in both directions: a task is run **xor** counted. AC-1's wedged drainer makes the count exact; AC-3 proves the counted ones never ran | claude | open |
| R-3 | Returning a named type from `decorate` silently changes the registry pool, whose `CompositeTaskDecorator` owns the same slot — the episode throttle strands open (the #410 R-1 hazard, one layer down) | low | high | `decorate`'s signature and the composition order are untouched, and the whole of `RegistryMailExecutorConfigTest` (MDC **and** throttle tests) runs unchanged in the phase-0 batch | claude | open |
| R-4 | The in-flight send is counted too, over-reporting a mail that already reached the relay — the exact ambiguity #410 refused to resolve by interrupting | med | med | only the **queue** is drained; AC-6 pins that a running send moves no counter, and the Javadoc + runbook state the exclusion so the number is not read as "every mail lost at shutdown" | claude | open |
| R-5 | Shared-state accumulation across the full suite (`riviera-local-debug`'s blind spot): `destroy()` now does extra work on every context close, and any context closing with a queued mail gains `WARN` lines | low | low | the added work is bounded by the queue (≤100) and is nil in a drained pool; no shared bean, filter or scheduled job is touched. To be verified by the PR's own CI run before phase 1 builds on it | claude | open |
| R-6 | A third `reason` on a shipped series changes what an existing dashboard total means, and an alert on the total starts firing on redeploys | low | med | the total already meant "recovery mail the pool never sent" — both existing reasons are pool-level refusals — so the addition is in-kind; the runbook's standing rule is unchanged (**alert on `reason="saturated"`, track the total**) and AC-1 pins that `saturated` cannot move on a redeploy | claude | open |

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

**Stage pointer:** `plan committed — entering implement (phase 0)`

**Next action:** Phase 0 step 1 — write the failing tests in `AsyncMailDispatcherTest` and
`MdcTaskDecoratorTest`, then push and open the draft PR on the first phase commit (CI fires on
`pull_request` only, #417) and record its number here.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — count and log the send abandoned at shutdown, attributably | | |
| 1 — runbook, metric doc, docs-freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet — the review and Sonar gates are due when the PR is marked ready for review)* | — |

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

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*"`
      → FAIL: `REASON_ABANDONED` and `MdcTaskDecorator.inContextOf` do not exist (compile), and once
      declared, the abandoned count is `0` where `QUEUED_AT_SHUTDOWN` is expected.

- [ ] **Step 3: Minimal implementation**

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

- [ ] **Step 4: Run them, verify they pass** —
      `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*" --tests "*RegistryMailExecutorConfigTest*" --tests "*MailTransport*"`
      then the structural net:
      `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*MailListenerExecutorArchitectureTest*"`
      → PASS, including all four shipped `MdcTaskDecoratorTest` tests and both registry throttle tests
      unchanged (R-3).

- [ ] **Step 5: Generalization-audit pass** — search every `destroy()` / `DisposableBean` /
      `waitForTasksToCompleteOnShutdown` / `awaitTermination` site for another place where a bounded
      queue can discard work unaccounted; decide per site and record in the log below.

- [ ] **Step 6: Commit** — `git commit -m "feat(#434): count the recovery mail abandoned in the queue at shutdown (#434)"`
      → then **push and open the draft PR immediately** (CI fires on `pull_request` only, #417).

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Runbook, metric doc, docs-freshness and close-out

**Files:** Modify `docs/runbooks/observability.md`, this plan doc, and whatever the docs-freshness run
finds due (expected: `CLAUDE.md`'s `notification` row, `RESPONSIBILITIES.md`'s notification section)

- [ ] **Step 1: The runbook row** (AC-7) — add `reason="abandoned"` to
      `riviera_mail_recovery_dropped_total`'s tag table with its alert rule (not on its own; a
      *sustained* rise means recovery volume has outgrown a single drainer thread, which nothing else
      makes visible), and state the one loss the counter still excludes (the in-flight send).
- [ ] **Step 2: Correct the contradicted sentence** at `docs/runbooks/observability.md:252`, which
      currently says abandonment is *not* counted.
- [ ] **Step 3: `riviera-docs-freshness`** over the phase-0..1 range; patch what the diff
      contradicts, extend where a future session could plausibly undo a decision.
- [ ] **Step 4: Add #434 as a sub-issue of epic #367** (grill finding G-7).
- [ ] **Step 5: Finalize Execution status** in this PR's own last commit, citing `merged via PR #NN`.
- [ ] **Step 6: Commit** — `git commit -m "docs(#434): document the abandoned recovery mail's counter and its limits (#434)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

> Filled at the end of each phase with the command run and the commit that proves it — not before.

- [ ] **AC-1..AC-5:** `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*" --tests "*MdcTaskDecoratorTest*"` → expected PASS.
- [ ] **AC-6:** the existing `aSendOutlastingTheDrainWindowIsAbandonedNotInterrupted`, extended → expected PASS.
- [ ] **AC-7:** the runbook diff states all three reasons and the exclusion.

**Full-suite verification:** the PR's own CI run — Backend (build + test), Frontend, CodeQL and
SonarCloud on the ready-for-review head, which is the half scoped local runs cannot prove
(`riviera-local-debug`'s shared-state blind spot).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-7 is prose, marked as such).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified `N/A`; no availability write path in the diff (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published
      surface changed (invariant #11).
- [ ] **Payment/payout** section justified `N/A`; the spine's executor is untouched (invariants #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] No booking code, address, or token in any new or edited log line (invariant #7) — asserted by AC-4.
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** `N/A — backend-only`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review`'s subagent fan-out per the
      `references/pr-gates.md` §1 ladder, plus `riviera-review-overlay`'s backend bank.
