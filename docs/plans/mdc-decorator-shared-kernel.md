# Promote `MdcTaskDecorator` to the Shared Kernel Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `MdcTaskDecorator` from `notification.application` to `shared`, compose it onto
`booking`'s refund pool beside the saturation policy, and add a structural guard so a fourth
self-configured worker pool cannot ship without it — closing the gap #404 left, where
`BookingRefundListener`'s worker lines carry no correlation id.

**Architecture:** The single significant decision is **promote, not duplicate, and admit it on
*ownership* grounds rather than on reuse.** No bounded context owns "how a pooled worker inherits
the submitting request's logging context" — the other half of that mechanism (`CorrelationIdFilter`,
which *sets* the MDC) sits at the composition root, which modules must not depend on, so `shared` is
the only package where the propagation half can live. This is #456's argument shape, one commit old:
`ShutdownBudget` was admitted because no context owns the SIGTERM grace. Reuse is the *trigger* here,
never the justification — CLAUDE.md still bars "code used in more than one place" as an admission
criterion, and this plan does not lean on it.

**Persistence:** JDBC only (invariant #1). `N/A — no table, no migration, no SQL in scope.`

**Source of intent:** GitHub issue #455 (filed as a Non-goal of #404/PR #453); the precedent it cites
is #456/PR #457, and the decision it overturns is #410's (`docs/plans/mail-worker-hygiene.md` §4a).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that #410's
plan doc recorded an explicit decision *against* `shared`, so this slice must overturn a written
decision rather than fill a blank; also caught that #456's Non-goals pre-committed the two static
helpers to "needs its own argument") · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what surfaced `aLaterEpisodeLogsAgain` as the compose-vs-replace
tripwire on the *refund* pool, not just the registry one) · `tdd` (each phase writes the failing
assertion first; phase 1's propagation test is run red against the undecorated pool before the
compose lands) · `riviera-modulith` (confirmed `shared` is flat classes at the module root with no
published surface, that `PackageShapeArchitectureTests` skips module-root types, and that both
`booking` and `notification` **already** grant `shared` — so promotion adds no `allowedDependencies`
edge) · `riviera-java-conventions` (§6c one-line-or-none comments; the long argument goes in Javadoc,
which is exempt) · `codebase-design` (loaded at the review gate per RV-PROC-1, F-2 — re-vetted the
seam: the deletion test passes, since removing the class puts hand-rolled MDC copy/restore back in
three pools, which is literally what `AsyncMailDispatcher` did before #410, and three installation
sites make it a real seam rather than a hypothetical one; **changed no decision**) ·
`domain-modeling` (same trigger — confirmed the slice adds **no** ubiquitous-language term and needs
no ADR: `shared` is explicitly not a bounded context, so a technical decorator earns no `CONTEXT.md`
entry, and the ADR bar wants hard-to-reverse **and** surprising **and** a real trade-off) ·
`riviera-stripe-payments` (loaded because the diff touches `RefundExecutorConfig` and the skill's own
trigger is deliberately generous — confirmed the slice touches **only** the executor's decorator
slot: no gateway call, refund decision, amount, idempotency key, or ledger effect, so collect-only /
no-Connect and invariants #8–#10 are untouched) · `riviera-local-debug` (cloud recipe: system
`gradle`, JDK-25 toolchain, scoped `--tests` runs; CI owns the full suite) ·
`riviera-review-overlay` (review gate — full backend bank walked on the diff; RV-BE-1/5/7/8/9/17
N/A with reasons, RV-BE-3/11/12 the live ones and all green, RV-PROC-1 self-flagged as F-2) ·
`riviera-docs-freshness` (**ran** over `origin/main..claude/sdlc-455-p55wyp`, **5 findings, all
patched** — see the Docs-freshness findings table below; the counting sweep also caught one
**pre-existing** drift #373 left behind, corrected as a declared drive-by)

**Branch:** `claude/sdlc-455-p55wyp` — the cloud session's designated remote branch, standing in for
`feature/mdc-decorator-shared-kernel` per `riviera-sdlc` §Remote/cloud session addendum. Exists in
git before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the promoted decorator at `ai.riviera.platform.shared.MdcTaskDecorator`, when
      the structural net runs, then the module graph is unchanged and no new dependency edge exists —
      `shared` still depends on nothing but `customer`/`operator`, and neither consumer module needed
      a new grant. *Pinned by:* `ModularityTests.verifiesModularStructure` + `PackageShapeArchitectureTests`.
- [ ] **AC-2:** Given the registry mail pool after the move, when a mail is submitted with a
      correlation id and the submitting thread then clears its own MDC, then the worker still runs
      under the submitter's context **and** the saturation episode flag still clears — i.e. the
      `CompositeTaskDecorator` was preserved, not replaced. *Pinned by:*
      `RegistryMailExecutorConfigTest.aWorkerRunsWithTheSubmittersLoggingContext` +
      `RegistryMailExecutorConfigTest.aLaterEpisodeLogsAgain` (both existing, unchanged).
- [ ] **AC-3:** Given the recovery dispatcher after the move, when a send is abandoned at shutdown,
      then the abandonment line still reads the kind back past the carrier and still borrows the
      abandoned send's context. *Pinned by:* `AsyncMailDispatcherTest` (existing, unchanged — the
      `payloadOf`/`inContextOf` helpers travel with the class).
- [ ] **AC-4:** Given a refund submitted to `bookingRefundExecutor` while the submitting thread
      holds a correlation id, when that thread clears its MDC and the worker runs, then the worker
      observes the submitter's correlation id and runs on a `booking-refund-` thread. *Pinned by:*
      `RefundExecutorConfigTest.aWorkerRunsWithTheSubmittersLoggingContext` (new).
- [ ] **AC-5:** Given the refund pool's decorator slot now holding a composite, when saturation ends
      and a later episode begins, then the second episode logs again — proving the compose did not
      replace the saturation policy's `decorate`. *Pinned by:*
      `RefundExecutorConfigTest.aLaterEpisodeLogsAgain` (existing, must stay green **unchanged**).
- [ ] **AC-6:** Given every production class that configures its own `ThreadPoolTaskExecutor`, when
      the structural rule runs, then each one references `MdcTaskDecorator` — and the rule is proven
      non-vacuous against a fixture pool that does not. *Pinned by:*
      `WorkerContextArchitectureTest.everySelfConfiguredWorkerPoolCarriesTheSubmittersContext` +
      `WorkerContextArchitectureTest.theDetectorFindsAnUndecoratedFixturePool` (new).

## Non-goals

- **Decorating Boot's shared `applicationTaskExecutor`.** #410 excluded it for a reason that still
  holds: it carries the invariant-#8/#9 spine listeners, and adding a decorator there changes
  behaviour on the money path. Out of scope, unchanged.
- **Decorating `@Scheduled` work.** #395's sweeps have no *submitting request* to inherit from, so
  MDC propagation is meaningless there. The AC-6 rule is scoped to `ThreadPoolTaskExecutor`
  precisely so it does not creep onto `ThreadPoolTaskScheduler`.
- **Renaming the class.** `MdcTaskDecorator` is a shipped name referenced by four plan docs and two
  substrate docs; a rename buys nothing and costs a doc sweep.
- **Retuning any pool bound or drain window.** Sizes and claims ship unchanged; `ShutdownBudget` is
  untouched.
- **Adding an ADR.** `domain-modeling`'s bar is hard-to-reverse **and** surprising **and** a real
  trade-off. This is reversible (one package move), unsurprising (CLAUDE.md's `shared` note and
  #404's Non-goals both anticipate it by name), and the trade-off is already written in the issue.
  The argument lands in `shared/package-info.java`, the class Javadoc, and `RESPONSIBILITIES.md`.

## Behavior-parity ledger

> The slice **moves** an existing class and **adds** a decorator to an existing pool. The move is a
> pure relocation; the addition is the one real behavior change. Both are enumerated because
> "refactor only" is aspirational until verified — and the second row is exactly where a
> `setTaskDecorator` call would silently replace the saturation policy.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `decorate` captures `MDC.getCopyOfContextMap()` on the **submitting** thread | preserved | identical body, new package; `MdcTaskDecoratorTest.capturesOnTheSubmittingThreadAndRestoresOnTheRunningOne` moves with it and must stay green unchanged |
| Context is **restored**, not cleared, after the task runs (#434's shutdown-thread case) | preserved | unchanged body; `MdcTaskDecoratorTest.restoresWhateverContextTheRunningThreadAlreadyHad` |
| A `null` caller context is tolerated | preserved | unchanged null guard; `MdcTaskDecoratorTest.toleratesAnAbsentCallerContext` |
| `payloadOf` unwraps the carrier so the drain can read `MailKind` (#442) | preserved | travels with the class; `AsyncMailDispatcherTest` unchanged. **The carrier record stays private** — only the payload comes back out, so #442's R-4 property survives the move |
| `inContextOf` lends a discarded send's context to the closing thread (#434) | preserved | travels with the class; `AsyncMailDispatcherTest` unchanged |
| Registry pool's decorator slot holds `CompositeTaskDecorator(saturation, mdc)` | preserved | import changes only; `aLaterEpisodeLogsAgain` is the tripwire if the list is ever collapsed |
| Recovery pool's slot holds a bare `MdcTaskDecorator` | preserved | import changes only |
| **Refund pool's slot holds the bare saturation policy** | **changed** → composite | becomes `CompositeTaskDecorator(saturation, mdc)`, the registry pool's shape. The saturation policy's `decorate` (which clears the episode flag) **must still run** — AC-5 |
| Refund shed line is attributable via the committing thread | preserved | untouched: `reject(...)` runs on the calling thread, so this never needed a decorator (issue #455 says so explicitly; do not "fix" it) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The refund pool's `setTaskDecorator` is **called twice** instead of composed, silently replacing the saturation policy — the episode flag then never clears, every later saturation is counted but never logged, and no test about the *missing lines* goes red | med | high | Compose via `CompositeTaskDecorator`, exactly as the registry pool does; AC-5 keeps `aLaterEpisodeLogsAgain` as the tripwire. `RefundExecutorConfig`'s Javadoc already warns about this slot by name | Claude | open |
| R-2 | The decorator is captured on the **worker** thread rather than the submitting one, making AC-4 pass for the wrong reason (submitter and worker are the same thread in a naive test) | med | med | AC-4 reuses the registry test's shape verbatim: clear the submitter's MDC after submitting, and assert the worker's thread name starts with `booking-refund-`. A worker-side capture then sees an empty map and fails | Claude | open |
| R-3 | Promotion is justified by "two modules use it", which CLAUDE.md explicitly bars as an admission criterion — the review gate reads the slice as growing `shared` into a utility bag | med | med | The written argument is **ownership**, not reuse (see Architecture + §4a). Reuse is named as the trigger only. The admission text lands in three places so it cannot be read as incidental | Claude | open |
| R-4 | The two static helpers (`payloadOf`, `inContextOf`) are `notification`-only callers today, so moving them looks like moving module-specific code into the kernel | med | med | They are accessors of the decorator's **own private carrier type** — splitting them would force `ContextCarryingTask` public, which is strictly worse and breaks #442's R-4. Recorded in §4a; the alternative is written down rather than left implicit | Claude | open |
| R-5 | The AC-6 rule over-reaches onto `ThreadPoolTaskScheduler` (#395's sweeps) or `SimpleAsyncTaskExecutor`, failing the build for pools that have no submitting request to inherit | low | med | Scope the marker to `ThreadPoolTaskExecutor` only; Non-goals states why. Verified today: exactly three production classes call its setters | Claude | open |
| R-6 | The AC-6 rule is **vacuous** — the detector finds nothing and the rule passes trivially, which is precisely how #410's own guard stayed green while #404 shipped an undecorated pool | med | high | A fixture tree (`ai.riviera.workercontextfixture`) with an undecorated pool, asserted found — the `ShutdownDrainArchitectureTest` / #95 fixture mechanism | Claude | open |
| R-7 | ArchUnit reads the *call*, not its argument, so a class that references `MdcTaskDecorator` in some other capacity would satisfy AC-6 without decorating | low | low | Accepted and documented in the rule's Javadoc, as `ShutdownDrainArchitectureTest` documents the same limitation. The direction is safe: it cannot mark a decorated pool undecorated, and the per-pool propagation tests (AC-2, AC-4) assert the real behaviour | Claude | open |

## Open questions / Assumptions

- **Assumption:** issue AC-1's "decision between promote / duplicate / leave" is delegated to the
  implementer — three of its four ACs are written as "If promoted", and the issue argues duplication
  will drift while "leave" contradicts the issue existing. **Decided: promote**, argument recorded
  above and in the code. — *Owner:* Claude · *Resolves by:* phase 0 (this plan's Architecture line).
- **Assumption:** no Flyway version is claimed by this slice, so the #122/#127 collision check is
  moot. Verified: the diff adds no migration, and the ten open PRs are all frontend Dependabot
  bumps. — *Owner:* Claude · *Resolves by:* phase 0.

### Resolved

- **Open question (grill):** does promotion need new `allowedDependencies` grants? — **No.** Both
  `booking` and `notification` already list `shared`. Verified against both `package-info.java`
  files at plan time.
- **Open question (grill):** does #410's recorded decision against `shared` still bind? — **No, its
  stated ground is now false.** #410 wrote *"both users are inside this one module"*; #404 added a
  third user in `booking`. The decision was right on its facts and those facts changed. This is
  written into the class Javadoc so the next reader sees the overturn, not a contradiction.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` write path is touched:
the slice changes a `TaskDecorator` slot and a package name. The refund listener's body — including
its `markRefunded` write — is untouched, and no claim/release path is in scope.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `shared` | existing (non-context kernel) | — (owns no aggregate) | Gains `MdcTaskDecorator`. Admission is on ownership: no bounded context owns how a pooled worker inherits the submitting request's logging context |
| M-2 | `notification` | existing | — | **Loses** the class; three call sites change import only. Behaviour unchanged (AC-2, AC-3) |
| M-3 | `booking` | existing | `Booking` | `RefundExecutorConfig` composes the decorator onto `bookingRefundExecutor` (AC-4) |

**Cross-module named interfaces (`api/` ports)**

`N/A — no port added, changed, or consumed.` `shared` is `type = OPEN`: it publishes no named
interface and consumers reference its types directly, so the move creates no published surface.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event added, moved, or renamed`, so **no Flyway `event_type` rewrite is needed.** The
moved class is a `TaskDecorator`, not an event payload, and nothing about it is persisted by the
Event Publication Registry.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Carry the submitting request's MDC onto a pooled worker (`MdcTaskDecorator`) | `shared` | **Ownership, not reuse.** `shared`'s Job is "the handful of edge types that bounded contexts legitimately share"; its admission test is *no business logic, no module-owned state, no dependency on a module that depends back* — this class passes all three (it depends only on SLF4J's `MDC` and Spring's `TaskDecorator`). The positive case is that **no bounded context owns it**: the mechanism's other half, `CorrelationIdFilter`, sits at the composition root, which modules must not depend on (#371), so a module-owned home is structurally unavailable to the second consumer. This is `ShutdownBudget`'s admission argument (#456) one commit earlier, and it is *not* "code used in more than one place", which `shared`'s Not-My-Job list still bars |
| The carrier's two accessors (`payloadOf`, `inContextOf`) | `shared` | They travel with the class because they read its **own private carrier record**. Leaving them in `notification` would require publishing `ContextCarryingTask`, defeating #442's R-4 (the context map must stay unreachable). They carry no mail vocabulary — `AsyncMailDispatcher` supplies `MailKind` at the call site, and it stays in `notification` |
| Compose the decorator onto `bookingRefundExecutor` | `booking` | `booking` Job includes the refund listener's own bounded executor (#404). The pool is `booking`'s, so its decorator slot is `booking`'s to fill; **not** `notification` (its Not-My-Job does not extend to another module's pool) and **not** `shared` (which owns the mechanism, never a pool's wiring) |
| The structural rule that every self-configured pool carries it | root (`ai.riviera.platform` test package) | Platform-wide, spanning `booking` and `notification` — the same placement and reason as `ShutdownDrainArchitectureTest`. A module-scoped rule is exactly what failed to fire when #404 landed |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves.` The slice touches the refund executor's *decorator slot*, never the refund
decision, amount, idempotency key, or the `RefundPort` call. `BookingRefundListener`'s body is
unmodified, so invariant #10's server-side refund computation and the `booking-<id>-refund`
idempotency key are untouched.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape is touched.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `implement (phase 3)` — draft PR **#458** open, so every later push is CI-gated.

**Next action:** Phase 3 — run `riviera-docs-freshness` over this PR's range, patch `CLAUDE.md` and
`RESPONSIBILITIES.md`, then finalize this section and mark the PR ready for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Promote the decorator to `shared` | ✅ | `68335b6` |
| 1 — Compose it onto the refund pool | ✅ | `a452627` |
| 2 — Structural guard against a fourth undecorated pool | ✅ | `b09d672` |
| 3 — Substrate docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` fan-out, CLAUDE.md-adherence reviewer) | **`RESPONSIBILITIES.md`'s tagged-counter count went stale inside this PR's own docs-freshness fix.** Extending the enumerated list from five names to six left the trailing clause reading "including the **latter four's** `kind`/`reason` tag values". Verified against source rather than scored: `MAIL_REGISTRY_SHED` registers untagged (`RegistryMailExecutorConfig:188`), while the other **five** pass `MailKind.TAG`/`REASON_TAG` — so the tagged remainder is five. Textbook counting-sweep drift, and the skill's own case history predicted it (#373's fix went stale within the hour) | **fixed** — "latter four's" → "latter five's"; re-swept the whole block, all counts now agree (six / six / five) |
| F-2 | review gate, RV-PROC-1 (self-check against the `riviera-sdlc` routing table) | The routing table's backend-structure row names **`codebase-design` + `domain-modeling`** beside `riviera-modulith` for "moving a class between packages", and `riviera-stripe-payments` triggers on anything touching refund. Only `riviera-modulith` had been loaded, so *Skills consulted* was untruthful about the design's provenance | **fixed** — all three loaded and the slice re-vetted through them (outcome recorded on the *Skills consulted* line); none changed a decision, which is itself the finding's answer |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/shared/MdcTaskDecorator.java` — **moved** from
  `notification/application/`. Javadoc gains the admission argument and the #410-overturn note.
- `platform/src/main/java/ai/riviera/platform/shared/package-info.java` — **modified.** The kernel's
  admitted-types list gains the decorator, on ownership grounds.
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  **modified.** Import only.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfig.java`
  — **modified.** Import only; the composite is unchanged.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfig.java` —
  **modified.** The decorator slot becomes a `CompositeTaskDecorator`; the Javadoc's "#455 is the
  likely one" sentence becomes a statement of what shipped.
- `platform/src/test/java/ai/riviera/platform/shared/MdcTaskDecoratorTest.java` — **moved** from
  `notification/application/`. Body unchanged.
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfigTest.java` —
  **modified.** Adds AC-4's propagation test.
- `platform/src/test/java/ai/riviera/platform/WorkerContextArchitectureTest.java` — **new.** The
  AC-6 rule.
- `platform/src/test/java/ai/riviera/workercontextfixture/UndecoratedWorkerPool.java` — **new.** The
  non-vacuity fixture.
- `CLAUDE.md`, `RESPONSIBILITIES.md` — **modified.** Both state the decorator's location.

---

## Phase 0 — Promote the decorator to `shared`

**Files:** Move `notification/application/MdcTaskDecorator.java` → `shared/` · Move
`notification/application/MdcTaskDecoratorTest.java` → `shared/` · Modify `shared/package-info.java`,
`AsyncMailDispatcher.java`, `RegistryMailExecutorConfig.java`

> The existing `MdcTaskDecoratorTest` **is** this phase's safety net: it moves unchanged and must
> stay green, which is what makes "pure relocation" a verified claim rather than an aspiration.

- [ ] **Step 1:** `git mv` both files; change the `package` declaration to
      `ai.riviera.platform.shared`; add `import ai.riviera.platform.shared.MdcTaskDecorator;` to the
      two `notification` call sites.
- [ ] **Step 2: Run the structural net + the moved test, verify green** —
      `gradle --no-daemon --console=plain test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*MdcTaskDecoratorTest*"`
      → PASS (AC-1).
- [ ] **Step 3:** Write the admission argument into the class Javadoc — ownership not reuse, the
      `CorrelationIdFilter`-at-the-root structural reason, and the explicit note that #410 decided
      the other way on a ground (*"both users are inside this one module"*) that #404 falsified.
      Add the decorator to `shared/package-info.java`'s admitted set with the same one-clause reason.
- [ ] **Step 4: Run the notification pool tests, verify unchanged behaviour** —
      `gradle --no-daemon --console=plain test --tests "*RegistryMailExecutorConfigTest*" --tests "*AsyncMailDispatcherTest*"`
      → PASS (AC-2, AC-3).
- [ ] **Step 5: Commit** — `refactor(#455): promote MdcTaskDecorator to the shared kernel (#455)`
- [ ] **Step 6: Push and open the draft PR immediately** (CI fires on `pull_request` only — a branch
      with no PR gets no CI at all).
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Compose it onto the refund pool

**Files:** Modify `booking/adapter/in/RefundExecutorConfig.java`,
`booking/adapter/in/RefundExecutorConfigTest.java`

- [ ] **Step 1: Write the failing test** — AC-4, in the registry test's shape. The MDC clear after
      submission is load-bearing: without it a worker-side capture would pass.

```java
/**
 * AC-4 — a refund worker's own lines are attributable to the request that cancelled the booking.
 *
 * <p>The submitter clears its MDC after handing the task over, so only a context captured at
 * <em>submit</em> time can satisfy this. A decorator that captured inside the returned
 * {@code Runnable} would read the worker's own empty context and fail here — which is the
 * failure mode #410 called out and this shape exists to exclude.
 */
@Test
void aWorkerRunsWithTheSubmittersLoggingContext() throws Exception {
	ThreadPoolTaskExecutor pool = initializedExecutor(SHIPPED);
	AtomicReference<String> seen = new AtomicReference<>();
	AtomicReference<String> workerThread = new AtomicReference<>();
	CountDownLatch ran = new CountDownLatch(1);
	MDC.put(CORRELATION_KEY, "corr-1");

	try {
		pool.execute(() -> {
			seen.set(MDC.get(CORRELATION_KEY));
			workerThread.set(Thread.currentThread().getName());
			ran.countDown();
		});
		MDC.clear();

		assertTrue(ran.await(RELEASE_TIMEOUT_SECONDS, TimeUnit.SECONDS), "the refund never ran");
		assertTrue(workerThread.get().startsWith(RefundExecutorConfig.THREAD_NAME_PREFIX),
				"the refund must run on this pool, or the propagation proves nothing");
		assertEquals("corr-1", seen.get(),
				"a worker-thread line is unattributable without the submitter's correlation id");
	}
	finally {
		pool.shutdown();
	}
}
```

- [ ] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*RefundExecutorConfigTest*"` → FAIL:
      `aWorkerRunsWithTheSubmittersLoggingContext` expected `corr-1` but was `null`.
- [ ] **Step 3: Minimal implementation** — compose, never replace:

```java
// One decorator slot: the saturation policy and the MDC carry share it, so a third must join this list.
pool.setTaskDecorator(new CompositeTaskDecorator(List.of(saturation, new MdcTaskDecorator())));
```

- [ ] **Step 4: Run it, verify it passes** —
      `gradle --no-daemon --console=plain test --tests "*RefundExecutorConfigTest*"` → PASS,
      **including `aLaterEpisodeLogsAgain` unchanged** (AC-5 — this is the compose-vs-replace proof).
- [ ] **Step 5:** Update `RefundExecutorConfig`'s Javadoc: the slot paragraph currently says
      "#410's `MdcTaskDecorator` is the likely one (#455)" — make it state what shipped, keeping the
      compose-don't-replace warning for the next decorator.
- [ ] **Step 6: End-of-phase regression** —
      `gradle --no-daemon --console=plain test --tests "*booking.adapter.in*" --tests "*RefundExecutorWiringIT*"`
      → PASS.
- [ ] **Step 7: Commit** — `fix(#455): carry the submitter's logging context onto the refund pool`
- [ ] **Step 8: Update plan-doc execution status**; check the push's CI run before phase 2.

---

## Phase 2 — Structural guard against a fourth undecorated pool

**Files:** Create `platform/src/test/java/ai/riviera/platform/WorkerContextArchitectureTest.java`,
`platform/src/test/java/ai/riviera/workercontextfixture/UndecoratedWorkerPool.java`

> **Why this phase exists, given issue AC-3 asks only for "one obvious pattern to follow".** The
> pattern is the code change in phase 1; this phase is what makes it *hold*. #455 exists because
> #404 added a pool and nothing fired — the identical shape #456 records for the drain budget
> (*"#404 landed a third draining pool and it did not fire, which is the whole case for this
> class"*). A comment is not an assertion, and the discovery mechanism already exists to copy.

- [ ] **Step 1: Write the failing test** — discover every production class that calls a setter on
      `org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor`, and assert each also
      references `MdcTaskDecorator`; plus the non-vacuity proof against the fixture (R-6).
- [ ] **Step 2: Run it, verify the non-vacuity half fails first** —
      `gradle --no-daemon --console=plain test --tests "*WorkerContextArchitectureTest*"` → FAIL
      until `UndecoratedWorkerPool` exists and is found.
- [ ] **Step 3: Add the fixture** — a class configuring a `ThreadPoolTaskExecutor` with no
      decorator, in `ai.riviera.workercontextfixture`, mirroring `ai.riviera.drainfixture`.
- [ ] **Step 4: Run it, verify it passes** → PASS. Both halves: the three production pools are
      found and all carry the decorator; the fixture pool is found and does not (AC-6).
- [ ] **Step 5: Generalization-audit pass** — search for any other executor/decorator site the rule
      should cover, and record the scoping decision (`ThreadPoolTaskScheduler` deliberately excluded
      — see Non-goals). Append to the log below.
- [ ] **Step 6: Commit** — `test(#455): pin that every self-configured worker pool carries the MDC`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Substrate docs + close-out

**Files:** Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, this plan doc

- [ ] **Step 1:** Load `riviera-docs-freshness` and run it over this PR's range. Both substrate docs
      state the decorator lives in `notification`; the counting sweep also applies — `shared`'s
      admitted-types list is enumerated in both files and gains a sixth entry.
- [ ] **Step 2:** Patch `RESPONSIBILITIES.md` §`shared` (the admitted set + the "one admitted type
      whose justification is *not* reuse" note, which now has a sibling with a *different* non-reuse
      justification) and its `notification` §worker-hygiene sentence.
- [ ] **Step 3:** Patch `CLAUDE.md`'s `shared` module note and the `notification` row's #410 clause.
- [ ] **Step 4:** Finalize Execution status — stage pointer DONE, every phase row ✅ with its commit,
      Open Questions empty, every risk row closed, AC pin-names matching what shipped. Cite
      **`merged via PR #NN`**, never a merge SHA.
- [ ] **Step 5: Commit** — `docs(#455): record the shared-kernel admission of MdcTaskDecorator`
- [ ] **Step 6:** Mark the PR ready for review → the Review and Sonar gates become due.

---

## Docs-freshness findings (`origin/main..claude/sdlc-455-p55wyp`)

> Run at phase 3 per `riviera-sdlc` merge close-out step 5. Format: `doc:line — stated fact —
> contradicted by — action`. The sweep was re-run after the fix round, per the skill's own rule.

| # | Doc | Stated fact | Contradicted by | Action |
|---|---|---|---|---|
| D-1 | `CLAUDE.md` §`shared` blockquote | the kernel holds five types, ending at `ShutdownBudget` | the promotion adds a sixth | **patched** — added with its ownership argument and the #410 overturn |
| D-2 | `CLAUDE.md` `notification` row | "#410 then made **the two pools'** worker hygiene one decision … carries the MDC onto **both**" | three pools now, and the class left the module | **patched** — the #410 clause stays as history, followed by what #455 changed |
| D-3 | `RESPONSIBILITIES.md:321` | "one shared `MdcTaskDecorator` (#410), composed onto the registry pool" — stated as `notification`'s | the class moved to `shared` | **patched** — records the move and that the decorator is no longer this module's to own |
| D-4 | `RESPONSIBILITIES.md` §`shared` opener + Job list | the admitted set omits the decorator; the **Job** list never mentioned `ShutdownBudget` either | the promotion, plus #456's own omission | **patched** — both added; the Job list was demonstrably incomplete before this slice |
| D-5 | `RESPONSIBILITIES.md` non-reuse note | "this is **the one** admitted type whose justification is *not* 'more than one module needs it'" | `ShutdownBudget` and now `MdcTaskDecorator` are both admitted on ownership | **patched** — generalized to "no admission has ever rested on reuse", naming the two newest |

**Pre-existing drift corrected as a declared drive-by** (not caused by this slice): `RESPONSIBILITIES.md`
§`shared` said "the **five** mail-loss counters" and listed five, while the very next sentence said
"all **six**" — #373 shipped `MAIL_PAYMENT_DUE_ABANDONED` and this half of the count was missed. Two
words and one name; left uncorrected it would have been a known-false statement inside a block this PR
edits anyway. Called out here and in the PR body so review can separate it from the slice.

**Checked and deliberately NOT patched:** `docs/runbooks/observability.md` — its MDC passages are about
the recovery vehicle specifically and carry no pool count, so they stay true; noting the new rule
beside `ShutdownDrainArchitectureTest` would be *new* documentation, which this skill's scope
discipline excludes. Likewise `.claude/skills/**` (no reference to the decorator's location),
`CONTEXT.md` (no domain vocabulary change) and `docs/adr/**` (no decision re-decided).

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 2 (the structural guard) | any other self-configured executor, `TaskDecorator` slot, or hand-rolled MDC carry in main | `grep -rn "new ThreadPoolTaskExecutor\|new ThreadPoolTaskScheduler\|setTaskDecorator\|SimpleAsyncTaskExecutor\|newFixedThreadPool\|newSingleThreadExecutor\|Executors\." src/main/java` and `grep -rn "getCopyOfContextMap\|setContextMap" src/main/java` | **exactly the three known pools**, all now decorated; the only MDC copy/restore left in main is `MdcTaskDecorator` itself | No further sites to fix. Two deliberate exclusions confirmed: **no `ThreadPoolTaskScheduler` is instantiated in main at all** (#395's sweeps are property-configured), so the rule's `ThreadPoolTaskExecutor` scoping costs nothing today while still stating why; and Boot's `applicationTaskExecutor` is auto-configured rather than declared, so it is structurally invisible to the scan and stays undecorated per #410's Non-goals |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run the structural net → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `--tests "*RegistryMailExecutorConfigTest*"` → PASS, unchanged. Verified at `<sha>`.
- [ ] **AC-3:** Run `--tests "*AsyncMailDispatcherTest*"` → PASS, unchanged. Verified at `<sha>`.
- [ ] **AC-4:** Run `--tests "*RefundExecutorConfigTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-5:** `aLaterEpisodeLogsAgain` green with the composite in place. Verified at `<sha>`.
- [ ] **AC-6:** Run `--tests "*WorkerContextArchitectureTest*"` → PASS, both halves. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `shared`
      still depends only on `customer`/`operator` (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9); the refund body is unmodified.
- [ ] Refund policy still enforced server-side, untouched (invariant #10).
- [ ] Timezone unaffected (invariant #6). Booking codes unaffected (invariant #7) — and the new
      test asserts on a correlation id, never a code.
- [ ] No Flyway migration needed; no published event moved (invariant #12).
- [ ] **Frontend** N/A.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 invocation ladder *plus*
      `riviera-review-overlay`, not the overlay alone.
