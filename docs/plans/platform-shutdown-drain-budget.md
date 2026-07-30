# Platform-wide shutdown-drain budget — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform's SIGTERM grace a **platform-wide** statement with a guard that fails the
build when the *sum* of every draining pool's shutdown window exceeds it — so a fourth pool landing in
any module cannot silently push the combined drain past the grace, whatever module it lands in.

**Architecture:** The single most significant decision is that the guard **reads bytecode, not a
running context**. Both wrinkles #456 raises — the bulkhead pools are `defaultCandidate = false`, and
the recovery dispatcher's pool is not a bean at all — are artefacts of discovering pools through the
`ApplicationContext`. Every draining pool, bean or not, calls `ThreadPoolTaskExecutor
.setAwaitTerminationMillis(...)` in production code, so an ArchUnit scan over `PRODUCTION_CLASSES`
sees all three by construction and needs no special case for either. That turns "boot the context and
hope the scan is complete" into the `ScheduledWorkArchitectureTest` shape this repo already trusts:
**a discovery rule with a non-vacuity list, plus a budget rule** — the number's *reason*, encoded.

**Persistence:** JDBC only (invariant #1). **No migration, no schema change, no SQL.** The slice adds
one constants holder, edits two `@ConfigurationProperties` records, and adds one architecture test.

**Source of intent:** GitHub issue **#456**, raised at the #404 review gate (PR #453) where two of five
independent reviewers converged on the same defect. The bug it reports shipped in that PR's first cut
and was fixed there; what is still open is the *guard*.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — it upgraded the finding:
the existing canary is not merely mail-scoped, its budget assertion is **arithmetically unfalsifiable**,
which changes this slice from "widen a guard" to "replace a guard that never could have fired") ·
`riviera-plan-doc` (this template — its Behavior-parity ledger is what forced the retired-test row
below to be enumerated rather than waved through as "replaced by a better test") · `tdd` (every phase
is red → green; the discovery rule is written against a deliberately oversized fixture pool before the
real rule exists) · `riviera-review-overlay` (review gate — due when the PR is marked ready) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` at phase 3 — **6 findings, all patched**; the
counting sweep earned its keep: five of the six were `shared`-kernel arity statements — `CLAUDE.md`,
`RESPONSIBILITIES.md`, `ADR-0007`, `riviera-modulith/SKILL.md`, `PackageShapeArchitectureTests`'
Javadoc — enumerating four types where there are now five, and **none was in this slice's diff**, so
file-by-file review could not have found them) · `riviera-modulith`
(**the `shared`-admission argument in §4a, and the confirmation that the guard belongs in the root test
package** — it also settled that neither module gains a new `allowedDependencies` grant, since both
already depend on `shared`) · `riviera-java-conventions` (§6a name-your-literals for the claim
constants; §6c one-line-or-none for the rule bodies; compact-constructor validation over `@Validated`,
per #97 — the house idiom both properties records already use) · `riviera-local-debug` (the cloud
recipe: system `gradle` + JDK-25 toolchain registration, and the scoped-test discipline behind every
phase command below — this slice's tests are context-free, so they run locally in full).

**Not loaded, deliberately:** `postgres` (no migration, no schema, no query), `riviera-stripe-payments`
(no money moves, no gateway call, no ledger change — the refund *pool* is in scope, the refund *flow*
is not), `riviera-frontend` / `angular-developer` / `playwright-cli` (backend-only, no user-facing
surface, no API shape change).

**Branch:** `claude/review-issues-454-455-456-0lc50x` — the cloud session's designated remote branch,
standing in for `bugfix/platform-shutdown-drain-budget` per the `riviera-sdlc` remote-session addendum.
The branch name spans #454/#455/#456 because it was minted for a triage request; **this branch carries
#456 only**. #455 and #454 stay open and are named in Non-goals.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the shipped production code, when the guard scans for pools that drain on
      shutdown, then it finds **exactly three** — `RegistryMailExecutorConfig`, `AsyncMailDispatcher`,
      `RefundExecutorConfig` — and fails if the discovered set differs in either direction, so a fourth
      pool anywhere in `ai.riviera.platform` fails the build until a human accounts for it.
      *Pinned by:* `ShutdownDrainArchitectureTest.everyDrainingPoolIsAccountedFor`
- [x] **AC-2:** Given a deliberately oversized draining pool in the fixture tree, when the same
      detector runs over it, then it is discovered — proving the scan is non-vacuous rather than
      green because it finds nothing. *Pinned by:*
      `ShutdownDrainArchitectureTest.theDetectorFindsAnOversizedFixturePool`
- [x] **AC-3:** Given the claims declared in `ShutdownBudget`, when they are summed, then the total is
      ≤ the platform SIGTERM grace, and the assertion **goes red for an oversized claim set** rather
      than being satisfied by construction. *Pinned by:*
      `ShutdownDrainArchitectureTest.theCombinedDrainFitsThePlatformGrace` +
      `ShutdownBudgetTest.rejectsAClaimSetThatOverrunsTheGrace`
- [x] **AC-4:** Given a pool discovered by AC-1, when the guard runs, then that pool has a **declared
      claim** in `ShutdownBudget` and every declared claim has a discovered pool — so neither list can
      drift from the other. *Pinned by:*
      `ShutdownDrainArchitectureTest.everyDiscoveredPoolDeclaresAClaim`
- [x] **AC-5:** Given `MailTransportProperties`, when it validates `socketTimeoutMs`, then its ceiling
      is read from `ShutdownBudget`'s mail claim rather than from a locally-divided mail budget, and
      the shipped 10s value still binds and still rejects `0`, `-1`, and `ceiling + 1`.
      *Pinned by:* `MailTransportPropertiesTest.acceptsTheWholeTuningRangeButNotBeyondIt`
- [x] **AC-6:** Given `RefundExecutorProperties`, when it validates `shutdownDrain`, then its ceiling
      is read from `ShutdownBudget`'s refund claim, and the shipped `PT5S` still binds and still
      rejects `PT0.5S` and `PT6S`. *Pinned by:*
      `RefundExecutorPropertiesTest.rejectsADrainThatWouldOutlastTheShutdownGrace` (existing name kept
      — renaming a passing test to match a plan draft is churn, and the name still describes the rule)
- [x] **AC-7:** Given the whole context under the `mailer` profile, when it starts, then all three
      pools still initialize with their shipped drain windows — the repoint is a change of *where the
      number is stated*, not of the number. *Pinned by:* `RefundExecutorWiringIT` (existing, unchanged)
      + `MailTransportPropertiesTest.resolvesEverySmtpTimeoutThroughTheEnvironment` (existing)

## Non-goals

- **#455 — promoting `MdcTaskDecorator` to `shared`.** It is a genuine `shared`-admission question and
  this slice creates the precedent it will cite, but the class carries two `notification`-only static
  helpers (`payloadOf`, `inContextOf`, #434/#442) whose move needs its own argument. Filed, open,
  **not ridden in here** — a second admission in the same PR would make the review a referendum on
  `shared` rather than on this guard.
- **#454 — an admin re-drive lever for outstanding refunds.** Untouched; it needs re-refining first
  (its premise is the shed path, which #404 made near-unreachable).
- **Changing any drain *value*.** This slice moves where the numbers are stated and adds the guard that
  bounds their sum. 10s/10s/5s ship unchanged. Retuning is a config change against a real relay (#370)
  and a real gateway (ADR-0009), not a plan-time decision.
- **Making `server.shutdown` graceful.** `MailTransportProperties` notes the 20s is affordable
  *precisely because* no request-draining phase competes for it. Turning that on re-divides the grace
  and is a separate decision with its own risk register.
- **Bounding the scheduler pool.** `spring.task.scheduling.pool.size=4` has no
  `await-termination` set, so Boot does not wait on it at close and it claims none of the grace.
  Verified, not assumed — but if that property is ever set, this guard must learn about it (R-4).

## Behavior-parity ledger

> The slice **retires an existing guard**: `MailTransportPropertiesTest
> #theCombinedDrainOfEveryPoolFitsTheMailShutdownBudget`, plus the two constants it reads. Enumerated
> rather than waved through, because "replaced by a strictly better test" is exactly the claim the O6
> case history says to verify behavior-by-behavior.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `assertThat(SHUTDOWN_BUDGET_MS * DRAINING_POOLS).isLessThanOrEqualTo(MAIL_SHUTDOWN_BUDGET_MS)` | **dropped — it never could have failed** | `SHUTDOWN_BUDGET_MS` is *defined* as `MAIL_SHUTDOWN_BUDGET_MS / DRAINING_POOLS`, so with integer division `(a/b)*b <= a` holds for all positive `a,b`. Replaced by AC-3, which sums **independently declared** claims against a grace none of them is derived from — so the assertion can actually fail |
| `assertThat(DRAINING_POOLS).isEqualTo(2)` — the "increment when a third lands" tripwire | **changed → mechanical** | It fired only if someone edited the constant they'd have to remember to edit, and #404 landed pool #3 without it firing. Replaced by AC-1, which *discovers* pools from bytecode, so a new pool fails the build without anyone remembering anything |
| The per-pool ceiling on `socket-timeout-ms` (0 < v ≤ 10 000) | **preserved** | Same bound, same compact constructor, same message; the ceiling is now read from `ShutdownBudget.MAIL_POOL_CLAIM_MS` instead of a locally-computed division (AC-5) |
| The per-pool ceiling on `refund.shutdown-drain` (1s ≤ v ≤ 5s) | **preserved** | Same bound, same compact constructor; ceiling read from `ShutdownBudget.REFUND_POOL_CLAIM_MS` (AC-6) |
| `MailTransportProperties` Javadoc naming the stacking hazard and pointing at #456 | **changed** | The hazard statement moves to `ShutdownBudget` (the one place that can state it truthfully); the mail record keeps a one-line pointer, per AC-4 of the issue |
| Both pools' *derived* drain window (`MailTransportBudget#shutdownDrain`) | **preserved** | Untouched — the socket-timeout → drain derivation is #410's decision and is orthogonal to where the ceiling is stated |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | ArchUnit's `getMethodCallsFromSelf()` fails to resolve the `setAwaitTerminationMillis` target (owner type not in the imported packages), so the scan silently finds zero pools and the guard is green-and-blind | med | high | AC-2's fixture pool is the non-vacuity proof and fails first if resolution breaks. Documented fallback: `ArchitectureTestSupport.bytecode(Path)` constant-pool substring scan, already the repo's technique in `NoStripeConnectArchitectureTest` and `ResponsibilitiesArchitectureTests` | this slice | **closed, phase 0** — did not materialize; both rules green on the first run. The rule matches the owner by **package prefix** (`org.springframework.scheduling.concurrent.`) rather than `isAssignableTo(ThreadPoolTaskExecutor.class)`, which is what keeps it independent of whether ArchUnit resolved the Spring hierarchy. Fallback not taken |
| R-2 | The marker method is the wrong one — a pool that calls `setWaitForTasksToCompleteOnShutdown(true)` but never `setAwaitTerminationMillis` would be missed, or vice versa | med | med | Detect the **union** of both markers | this slice | **closed, phase 0** — `DRAIN_MARKERS` holds both; all three shipped pools call both, so the union is exercised rather than assumed |
| R-3 | ArchUnit cannot read the *argument* of `setWaitForTasksToCompleteOnShutdown`, so a pool passing `false` is counted as draining when it is not | low | low | Accepted; fails **safe** (over-counting tightens the budget, never loosens it) | this slice | **closed — accepted, phase 0.** Recorded in the guard's Javadoc with an explicit "do not narrow the marker set to fix this" note, since the argument is not in the bytecode the rule reads |
| R-4 | A future `spring.task.scheduling.shutdown.await-termination=true` adds a fourth claimant that is a Boot-configured pool with no `ThreadPoolTaskExecutor` call site, so the bytecode scan cannot see it | low | high | The guard adds a **second, property-based rule** in the `ScheduledWorkArchitectureTest#noGlobalQueryTimeoutIsIntroduced` shape: fail if the key is set in `src/main/resources` without a declared claim. Cheap, and it closes the one discovery hole the bytecode scan structurally has | this slice | **closed, phase 1** — `noBootPoolIsMadeToDrainWithoutAClaim`. Covers **both** Boot pools, not just the scheduler: `spring.task.execution.shutdown.await-termination` would make the shared `applicationTaskExecutor` drain too, and that pool carries the money-path spine |
| R-5 | Admitting `ShutdownBudget` to `shared` sets a precedent that erodes CLAUDE.md's "not a home for code used in more than one place" | med | med | The argument is **ownership, not reuse** — the same one that admitted `ObservabilityMetrics` | this slice | **closed, phase 1** — written in §4a, in the class Javadoc, and in `CLAUDE.md`'s `shared` note, each stating the narrower test explicitly so a merely-reused type is not admitted by this precedent |
| R-6 | The 25s of claims against Render's ~30s leaves only 5s for the web layer and Hikari to close in order — the guard blesses a total that is already tight | med | med | Out of scope to retune (Non-goals); the guard makes the headroom visible in one place instead of implicit across three | this slice | **open → carried, deliberately.** The slice does not change the total, and judging 5s adequate needs a real redeploy measurement this session cannot take. Named here rather than silently blessed; retuning is now a one-line edit to `SIGTERM_GRACE_MS` or a claim |
| R-7 | The ~30s grace is Render's documented default, not a repo-verified fact, and a platform change would invalidate every claim at once | low | high | Unchanged from #410's position, but improved: the number lives in one constant with its provenance in the Javadoc | this slice | **closed, phase 1** — `ShutdownBudget.SIGTERM_GRACE_MS` names it as Render's documented default and as "the one line to correct". The assumption is unchanged; what changed is that it is now checkable in one place |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Assumption (phase 1):** Render's SIGTERM→SIGKILL grace is ~30s. — **Accepted, not verified.** It is
  Render's documented default and every claim was already sized against it before #456 gave it a name,
  so recording it changed no behaviour. Carried as R-7 and stated in `ShutdownBudget.SIGTERM_GRACE_MS`'s
  Javadoc as the one line to correct if the platform changes.
- **Assumption (phase 0):** ArchUnit resolves method-call targets to types outside the imported package
  set (`ThreadPoolTaskExecutor` is a Spring type, not under `ai.riviera.platform`). — **Confirmed.**
  Both rules passed on the first run, with the production scan finding exactly the three known pools
  including the non-bean dispatcher one. The rule matches the target owner by package prefix rather
  than by assignability, so it never depends on hierarchy resolution. R-1's bytecode fallback is not
  needed.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No code path in this slice reads or writes
`availability(set_id, booking_date)`, and no SQL is added. The one adjacency worth naming: the guard
must **not** grow into bounding `spring.jdbc.template.query-timeout`, which
`ScheduledWorkArchitectureTest#noGlobalQueryTimeoutIsIntroduced` already forbids for invariant #2's
sake — the claim's loser legitimately waits on the winner's index tuple lock. This slice adds a rule
beside that one and does not touch it.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `shared` | existing | none (not a bounded context) | The OPEN Shared Kernel is where a platform-wide technical fact lives that no bounded context owns — see §4a |
| M-2 | `notification` | existing | none | Owns two of the three draining pools; its properties record's ceiling is repointed at the platform statement |
| M-3 | `booking` | existing | `Booking` | Owns the third pool; same repoint |

**Cross-module named interfaces (`api/` ports)** — none. `shared` is `@ApplicationModule(type = OPEN)`,
so consumers reference its types directly and it publishes no named interface. No new
`allowedDependencies` grant is needed: `notification` and `booking` both already depend on `shared`
(`ObservabilityMetrics` in both, `ApiProblem` in the edge).

**Domain events** — none added, changed, moved, or renamed. No Flyway `event_type` rewrite is owed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| State the platform's SIGTERM→SIGKILL grace | `shared` | No bounded context owns it — it is a property of the **deployment platform**, exactly like the metric-name namespace `ObservabilityMetrics` already holds. `notification`'s Job is transactional-mail delivery and `booking`'s is bookings; neither's Job line covers "how long the process has to close", and the current split has `notification` stating a number that binds `booking` — which is the defect. Passes the CLAUDE.md admission bar: no business logic (constants + one pure sum), no module-owned state, no dependency on any module |
| Declare each draining pool's claim against that grace | `shared` | Follows the grace by necessity: a claim stated inside a module is a claim the platform cannot sum, which is #456 restated. Keeping the claims beside the grace is what lets the guard read both without any module widening its visibility — the alternative (making two package-private records' constants public) would leak module internals to satisfy a test |
| Enforce each pool's own ceiling at boot | `notification` / `booking` | **Unchanged** — each module still validates its own property in its own compact constructor. Only the *source of the ceiling* moves. This is the decision-vs-execution split the template warns about, kept intact: `shared` states the budget, each module enforces its share |
| The cross-module guard itself | root test package | Cross-module by nature, and the root may depend on modules (never the reverse) — the precedent is `ScheduledWorkArchitectureTest` and `CompositionRootDisciplineTests`, which live there for exactly this reason |

## Payment & payout (invariants #5, #8, #9, #10)

No money moves and no money-path logic changes: no gateway call, no ledger write, no refund decision,
no idempotency key, no webhook. The slice's connection to money is **indirect but real and worth
stating** — the pool it bounds is `booking`'s refund bulkhead, and the failure mode the guard prevents
is a redeploy that overruns the grace and gets the process `SIGKILL`ed mid-close. Under invariant #10
that costs nothing durable (a refund whose listener never completed stays outstanding and is
republished at the next start, and the gateway call is idempotency-keyed on `booking-<id>-refund`), but
it *does* tear down Hikari and the web layer out of order. So: **collect-only via Stripe, no Connect**,
unchanged; **no** payout-ledger effect; **no** refund-policy change. Pinned indirectly by the existing
`RefundExecutorWiringIT` (AC-7), which proves the pools still initialize with the shipped windows.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, style, or e2e spec is touched.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or error shape is added or modified.

## Execution status

**Stage pointer:** `review gate — PR #457 marked ready`

**Next action:** Run the review gate per `riviera-sdlc` `references/pr-gates.md` §1 (the invocation
ladder) with `riviera-review-overlay` layered on, then the Sonar gate once CI reports.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Discover every draining pool (AC-1, AC-2) | ✅ | `654e16d` |
| 1 — State the grace and its claims in `shared` (AC-3, AC-4) | ✅ | `41634fd` |
| 2 — Repoint both modules; retire the vacuous guard (AC-5, AC-6, AC-7) | ✅ | `a4f6f4d` |
| 3 — Docs freshness + close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/shared/ShutdownBudget.java` — **new.** The platform
  SIGTERM grace, the per-pool claims that divide it, and the pure sum the guard asserts on.
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MailTransportProperties.java` —
  ceiling repointed at `ShutdownBudget.MAIL_POOL_CLAIM_MS`; `MAIL_SHUTDOWN_BUDGET_MS` and
  `DRAINING_POOLS` deleted; Javadoc reconciled.
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorProperties.java` —
  `MAX_SHUTDOWN_DRAIN` repointed at `ShutdownBudget.REFUND_POOL_CLAIM_MS`; Javadoc's "do that where
  the budget is stated, not here" now names the place.
- `platform/src/test/java/ai/riviera/platform/ShutdownDrainArchitectureTest.java` — **new.** The
  discovery rule, the claim-linkage rule, the budget rule, and R-4's property rule.
- `platform/src/test/java/ai/riviera/platform/shared/ShutdownBudgetTest.java` — **new.** The sum
  function's own red case (AC-3's non-vacuity half).
- `platform/src/test/java/ai/riviera/drainfixture/OversizedDrainingPool.java` — **new fixture**, in the
  established `ai.riviera.*fixture` tree (#95) so a negative case is proven without mis-shaping
  production code.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailTransportPropertiesTest.java` —
  the vacuous `theCombinedDrainOfEveryPoolFitsTheMailShutdownBudget` deleted; the range test kept and
  repointed.

---

## Phase 0 — Discover every draining pool

**Files:** Create `platform/src/test/java/ai/riviera/drainfixture/OversizedDrainingPool.java` ·
Create `platform/src/test/java/ai/riviera/platform/ShutdownDrainArchitectureTest.java`

- [x] **Step 1: Write the failing test** — the non-vacuity case first, because it is also the
      experiment that answers R-1.

```java
package ai.riviera.drainfixture;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * A deliberately oversized draining pool, in the fixture tree so the detector's negative case is
 * proven without mis-shaping production code (the {@code ai.riviera.*fixture} mechanism, #95).
 *
 * <p>It exists to make {@code ShutdownDrainArchitectureTest}'s scan falsifiable: a detector that
 * silently found nothing would satisfy every rule below it trivially and stay green forever.
 */
public final class OversizedDrainingPool {

	public static ThreadPoolTaskExecutor pool() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(600_000);
		return pool;
	}
}
```

```java
	@Test
	void theDetectorFindsAnOversizedFixturePool() {
		Set<String> found = drainingPools(fixtureClasses("ai.riviera.drainfixture"));

		assertThat(found)
				.as("non-vacuity: a detector that finds nothing satisfies every rule below trivially")
				.containsExactly("OversizedDrainingPool");
	}
```

- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests
      "*ShutdownDrainArchitectureTest*"` → FAIL (no `drainingPools` method yet). **Then re-run after
      step 3 with the detector in place**: if it fails with an *empty* set rather than a green pass,
      R-1 has materialized — switch to the `ArchitectureTestSupport.bytecode(Path)` constant-pool scan
      in this same step and record the switch in the Generalization-audit log.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — the detector plus the production-side discovery rule.

```java
	/** The two calls that create a drain window; the union, per R-2. */
	private static final Set<String> DRAIN_MARKERS = Set.of(
			"setAwaitTerminationMillis", "setWaitForTasksToCompleteOnShutdown");

	/**
	 * Today's draining pools. Extending this set is the deliberate cost of adding a fourth — it is
	 * the moment someone confirms the grace can carry it, and declares its claim.
	 */
	private static final Set<String> KNOWN_DRAINING_POOLS = Set.of(
			"AsyncMailDispatcher", "RefundExecutorConfig", "RegistryMailExecutorConfig");

	@Test
	void everyDrainingPoolIsAccountedFor() {
		assertThat(drainingPools(PRODUCTION_CLASSES))
				.as("a pool that drains on shutdown spends the platform's SIGTERM grace, and the "
						+ "windows ADD rather than overlap — declare its claim in ShutdownBudget")
				.containsExactlyInAnyOrderElementsOf(new TreeSet<>(KNOWN_DRAINING_POOLS));
	}

	/** Simple names of every class configuring a pool that drains on shutdown. */
	private static Set<String> drainingPools(JavaClasses classes) {
		Set<String> pools = new TreeSet<>();
		for (JavaClass type : classes) {
			for (JavaMethodCall call : type.getMethodCallsFromSelf()) {
				if (DRAIN_MARKERS.contains(call.getTarget().getName())
						&& call.getTargetOwner().isAssignableTo(ThreadPoolTaskExecutor.class)) {
					pools.add(type.getSimpleName());
				}
			}
		}
		return pools;
	}
```

- [x] **Step 4: Run it, verify it passes** — `gradle --no-daemon --console=plain test --tests
      "*ShutdownDrainArchitectureTest*"` → PASS (both tests).

> Scope (end-of-phase regression): the structural net —
> `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`,
> because a new fixture package and a new `shared` type both touch what those rules check.

- [x] **Step 5: Generalization-audit pass** — search for other "increment this constant when a new X
      lands" tripwires that no mechanical rule backs. Command:
      `grep -rn "increment this\|when a third\|when a new" platform/src/main/java --include=*.java`.
      Decision recorded in the log below.

- [x] **Step 6: Commit** — `git commit -m "test(#456): discover every pool that drains on shutdown"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — State the grace and its claims in `shared`

**Files:** Create `platform/src/main/java/ai/riviera/platform/shared/ShutdownBudget.java` ·
Create `platform/src/test/java/ai/riviera/platform/shared/ShutdownBudgetTest.java` ·
Modify `ShutdownDrainArchitectureTest`

- [x] **Step 1: Write the failing test** — the budget rule's own red case, so AC-3 is falsifiable
      rather than satisfied by construction.

```java
	@Test
	void rejectsAClaimSetThatOverrunsTheGrace() {
		assertThat(ShutdownBudget.fits(Map.of("a", 20_000, "b", 5_000)))
				.as("25s of claims against a 30s grace fits, with headroom for Hikari and the web layer")
				.isTrue();
		assertThat(ShutdownBudget.fits(Map.of("a", 20_000, "b", 5_000, "c", 30_000)))
				.as("a fourth pool pushing the SUM past the grace must be rejected — the whole point")
				.isFalse();
	}
```

- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests
      "*ShutdownBudgetTest*"` → FAIL, `ShutdownBudget` does not exist.

- [x] **Step 3: Minimal implementation** — constants + one pure function. Claim values are the
      **unchanged** shipped ceilings; only their home moves.

```java
/**
 * The platform's SIGTERM→SIGKILL grace, and how the pools that drain on shutdown divide it (#456).
 *
 * <p><strong>Why this is platform-wide and not module-local.</strong> Pools that drain are separate
 * beans (or, for the recovery dispatcher, not beans at all), and {@code destroySingletons()} runs their
 * {@code destroy()} methods <em>sequentially on one thread</em> — so their windows <strong>add rather
 * than overlap</strong>. #410 encoded that in {@code notification}, dividing a mail budget by a mail
 * pool count; #404 then landed a third draining pool in {@code booking}, which that arithmetic could
 * not see and which invariant #11 forbade it from reaching. A budget enforced per-module while the
 * resource it rations is platform-wide is the defect this class closes.
 *
 * <p><strong>Why it is admitted to the Shared Kernel</strong>, given CLAUDE.md's warning that
 * {@code shared} is not a home for "code used in more than one place": the grace is a property of the
 * <em>deployment platform</em>, and no bounded context owns it. That is the same argument that admitted
 * {@link ObservabilityMetrics}' metric namespace, and it is narrower than "two modules need it" — a
 * type that is merely reused does not qualify. No business logic, no module-owned state, no dependency
 * on any module.
 *
 * <p>Each module still <strong>enforces</strong> its own claim in its own {@code @ConfigurationProperties}
 * compact constructor. This class states the budget; the modules spend it.
 */
public final class ShutdownBudget {

	/**
	 * Render's documented default SIGTERM→SIGKILL window. A drain outlasting it gets the process killed
	 * mid-close, so Hikari and the web layer never close in order — strictly worse than giving up. This
	 * is the one line to correct if the platform or its grace changes.
	 */
	public static final int SIGTERM_GRACE_MS = 30_000;

	/** Each mail pool's share — the registry executor and the recovery dispatcher claim it separately. */
	public static final int MAIL_POOL_CLAIM_MS = 10_000;

	/** {@code booking}'s refund bulkhead (#404), sized short because an abandoned refund replays. */
	public static final int REFUND_POOL_CLAIM_MS = 5_000;

	private ShutdownBudget() {
	}

	/** Whether {@code claims} — one entry per draining pool — fit inside {@link #SIGTERM_GRACE_MS}. */
	public static boolean fits(Map<String, Integer> claims) {
		return claims.values().stream().mapToInt(Integer::intValue).sum() <= SIGTERM_GRACE_MS;
	}
}
```

- [x] **Step 4: Run it, verify it passes** — `gradle --no-daemon --console=plain test --tests
      "*ShutdownBudgetTest*"` → PASS.

- [x] **Step 5: Wire the guard's remaining two rules** (AC-3, AC-4) — the claim map keyed by the same
      simple names phase 0 discovers, so the two lists cannot drift.

```java
	/** One claim per pool in {@link #KNOWN_DRAINING_POOLS}, keyed identically so neither can drift. */
	private static final Map<String, Integer> CLAIMS = Map.of(
			"AsyncMailDispatcher", ShutdownBudget.MAIL_POOL_CLAIM_MS,
			"RegistryMailExecutorConfig", ShutdownBudget.MAIL_POOL_CLAIM_MS,
			"RefundExecutorConfig", ShutdownBudget.REFUND_POOL_CLAIM_MS);

	@Test
	void everyDiscoveredPoolDeclaresAClaim() {
		assertThat(CLAIMS.keySet()).containsExactlyInAnyOrderElementsOf(KNOWN_DRAINING_POOLS);
	}

	@Test
	void theCombinedDrainFitsThePlatformGrace() {
		assertThat(ShutdownBudget.fits(CLAIMS))
				.as("the pools drain SEQUENTIALLY, so windows that each fit alone can still overrun "
						+ "the grace together — %dms claimed of %dms",
						CLAIMS.values().stream().mapToInt(Integer::intValue).sum(),
						ShutdownBudget.SIGTERM_GRACE_MS)
				.isTrue();
	}
```

- [x] **Step 6: Add R-4's property rule** — the one discovery hole a bytecode scan structurally has,
      in the `ScheduledWorkArchitectureTest#noGlobalQueryTimeoutIsIntroduced` shape (walk
      `src/main/resources` as text, skip comment lines, fail on the key).

- [x] **Step 7: Run the class** → PASS; **commit** —
      `git commit -m "feat(#456): state the platform shutdown grace and its per-pool claims"`; update
      execution status in the same commit window.

---

## Phase 2 — Repoint both modules; retire the vacuous guard

**Files:** Modify `MailTransportProperties.java` · `RefundExecutorProperties.java` ·
`MailTransportPropertiesTest.java`

- [x] **Step 1:** Repoint `MailTransportProperties` — delete `MAIL_SHUTDOWN_BUDGET_MS` and
      `DRAINING_POOLS`, set `SHUTDOWN_BUDGET_MS = ShutdownBudget.MAIL_POOL_CLAIM_MS`, and rewrite the
      `DRAINING_POOLS` Javadoc block into a one-line pointer at `ShutdownBudget` (AC-4 of the issue).
      Keep the compact constructor's message accurate — it currently names "the N pools", which
      `ShutdownBudget` now owns.
- [x] **Step 2:** Repoint `RefundExecutorProperties.MAX_SHUTDOWN_DRAIN` at
      `Duration.ofMillis(ShutdownBudget.REFUND_POOL_CLAIM_MS)`; its Javadoc's "do that where the budget
      is stated, not here" now names `ShutdownBudget`.
- [x] **Step 3:** Delete `theCombinedDrainOfEveryPoolFitsTheMailShutdownBudget` (the ledger's row 1 —
      it never could have failed) and repoint the surviving range test at the new ceiling.
- [x] **Step 4: Run the touched classes** — `gradle --no-daemon --console=plain test --tests
      "*MailTransportPropertiesTest*" --tests "*RefundExecutorPropertiesTest*" --tests
      "*ShutdownDrainArchitectureTest*" --tests "*ShutdownBudgetTest*"` → PASS.
- [x] **Step 5: Run the structural net + a scoped wiring IT** (AC-7) —
      `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests
      "*RefundExecutorWiringIT*"`. The `shared` addition is exactly the kind of change
      `PackageShapeArchitectureTests` exists to vet (a type at a module root, permitted for `shared`).
- [x] **Step 6: Generalization-audit pass** — search for any remaining place a per-module constant
      states a platform-wide bound. Append to the log.
- [x] **Step 7: Commit** — `git commit -m "refactor(#456): read both pools' drain ceilings from the
      platform budget"`; update execution status in the same commit window.

---

## Phase 3 — Docs freshness + close-out

- [x] **Step 1:** Run `riviera-docs-freshness` over `origin/main...HEAD`, including the **counting
      sweep** — this slice makes the *third* draining pool the first one a rule counts, and any doc
      saying "the two pools" or "a third **mail** pool" is now stale outside the diff.
- [x] **Step 2:** Patch `CLAUDE.md`'s `notification` module row where it states the drain derivation,
      and `docs/runbooks/observability.md` if it names the mail budget as the platform's.
- [x] **Step 3:** Finalize Execution status **in this PR's own last commit**, citing **`merged via PR #457`**
      (never a merge SHA — the squash SHA cannot exist before the merge; three consecutive slices paid
      that tax).
- [x] **Step 4:** Run the Self-review checklist below; leave nothing unchecked without an Open Question.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | phase 0 | "increment this constant when a new X lands" tripwires with no mechanical rule behind them | `grep -rn "increment this\|when a third\|increment when\|when a new .* lands" platform/src/main/java platform/src/test/java --include=*.java` | 2 — `MailTransportProperties:66`, `MailTransportPropertiesTest:150` | **Both are this slice's own targets, retired in phase 2. No third site.** The two comparable hand-maintained lists — `ScheduledWorkArchitectureTest.KNOWN_SCHEDULED_JOBS` and `MailListenerExecutorArchitectureTest`'s non-vacuity list — are already backed by a rule that fails when the list drifts, which is exactly the property this slice adds here. No further action |
| 2026-07-30 | phase 2 | a per-module constant restating a platform-wide bound | `grep -rn "SIGTERM\|platform's grace\|shutdown grace\|Render's ~30s" platform/src/main/java --include=*.java` | 7 mentions across 3 files | **No other constant restates the grace** — all seven are prose that now *points at* `ShutdownBudget` rather than duplicating it. One was left imprecise by the repoint (`MailTransportProperties`' "what the shutdown may spend on mail", true of the pair but not of the per-pool ceiling it annotates) and was corrected in the same phase. `MailTransportBudget` is untouched on purpose: it derives the drain from the socket budget, which is #410's decision and orthogonal to where the ceiling is stated |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*ShutdownDrainArchitectureTest*"` → `everyDrainingPoolIsAccountedFor` PASS. Verified at commit `654e16d`.
- [x] **AC-2:** Same run → `theDetectorFindsAnOversizedFixturePool` PASS. Verified at commit `654e16d`.
- [x] **AC-3:** Run `gradle test --tests "*ShutdownBudgetTest*" --tests "*ShutdownDrainArchitectureTest*"` → both budget assertions PASS, and the oversized claim set returns `false`. Verified at commit `41634fd`.
- [x] **AC-4:** Same run → `everyDiscoveredPoolDeclaresAClaim` PASS. Verified at commit `41634fd`.
- [x] **AC-5:** Run `gradle test --tests "*MailTransportPropertiesTest*"` → PASS. Verified at commit `a4f6f4d`.
- [x] **AC-6:** Run `gradle test --tests "*RefundExecutorPropertiesTest*"` → PASS. Verified at commit `a4f6f4d`.
- [x] **AC-7:** Run `gradle test --tests "*RefundExecutorWiringIT*"` → PASS (or documented Docker skip; CI owns the authoritative run). Verified at commit `a4f6f4d`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified `N/A`); no SQL added, and the global-query-timeout ban is untouched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched by this slice.
- [x] **Modulith** section filled; `shared` stays free of business logic and of any module dependency; no new `allowedDependencies` grant needed (invariant #11).
- [x] **Payment/payout** section filled; no money moves; the refund pool still initializes with its shipped window (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — no time-of-day logic added; the constants are durations, not instants.
- [x] Booking codes unguessable (invariant #7) — no new log line carries one; the guard logs nothing.
- [x] Flyway migration present for schema changes (invariant #12) — `N/A`, no schema change.
- [x] **Frontend** standards met or deviation documented — `N/A`, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final plan-doc state committed here, `merged via PR #457`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
