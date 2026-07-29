# Mail-listener executor rule — close the two escape hatches (#409) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MailListenerExecutorArchitectureTest` say what it means — a test-scope
listener under `ai.riviera.platform.notification` no longer produces a false failure, and a
listener written as `@Async` + plain `@EventListener` can no longer slip past the rule
unexamined — without losing the non-vacuity that made it worth having.

**Architecture:** Swap the rule's *discovery* mechanism from Spring's
`ClassPathScanningCandidateComponentProvider` (which resolves `classpath*:` and therefore
spans `build/classes/java/{main,test}`) to the repo's existing test-free ArchUnit import,
`ArchitectureTestSupport.PRODUCTION_CLASSES` (`ImportOption.Predefined.DO_NOT_INCLUDE_TESTS`),
while keeping reflection + `AnnotatedElementUtils` for the *assertion* — the merged-attribute
lookup that made reflection the right tool in the first place. Discovery then widens from
`@TransactionalEventListener` to any merged `@EventListener`, which subsumes it, and the
violation collector becomes a pure function of `List<Method>` so the negative cases are proven
against deliberate fixtures instead of by breaking production code — the
`PublishedSurfacePlacementArchitectureTests` / `ai.riviera.placementfixture` pattern, with the
fixtures deliberately placed *inside* the scanned package because that placement is exactly
what hole 1 is about.

**Persistence:** N/A — no database, schema, or SQL in scope. Test-scope Java only
(invariant #1 untouched: nothing added, no JPA).

**Source of intent:** GitHub issue #409 (parent epic #367; found at the #383 comparison
review, PR #403 merged / #406 closed as superseded).

**Skills consulted:** `riviera-sdlc` (routing gate + the cloud-session branch substitution),
`riviera-plan-doc` (this doc), `riviera-java-conventions` (§6a name the literals — the
`AFTER_COMMIT`/package constants; §6c one-line-or-none inline comments with the long prose in
Javadoc, which is where both boundaries get documented; §9 match the surrounding assertion
style — plain JUnit 5 `assertTrue`/`assertEquals`, no new assertion library),
`riviera-modulith` (placement: the rule is a `notification` fitness function and stays in
`notification/adapter/in`; the published-surface listener rule in
`PublishedSurfacePlacementArchitectureTests` is the sibling whose fixture pattern this copies;
no `allowedDependencies` change — test scope is outside `ApplicationModules.verify()`, which
imports with `DO_NOT_INCLUDE_TESTS`), `tdd` (each phase reproduces the reported hole red
first), `riviera-local-debug` (scoped `--tests` runs; system `gradle`, not the wrapper), `riviera-review-overlay` + `/review 412`, then the full **`/code-review` five-agent fan-out** once the plugin skill became available mid-session and the human authorised the subagents (the degraded mode ran first and is disclosed on the PR; the fan-out then found F-5 and F-6, matching the #351 case history that it is the strongest of the three), `riviera-docs-freshness` (pre-merge smoke over `origin/main...HEAD`: **zero findings** — CLAUDE.md:157's "pinned … by `MailListenerExecutorArchitectureTest`" stays true, the rule got stronger and contradicted no stated fact; `graphify-out/` is absent in this cloud clone, so the graph refresh is moot).
`postgres` / `riviera-stripe-payments` / `riviera-frontend` / `angular-developer` /
`playwright-cli` deliberately **not** loaded — no DB, no money, no frontend surface in the diff.

**Branch:** `claude/sdlc-409-0kb5tf` — the cloud session's designated remote branch stands in
for `bugfix/mail-listener-rule-escape-hatches` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (hole 1):** Given a test-scope `@TransactionalEventListener` declared under
  `ai.riviera.platform.notification` and carrying no `@Async`, when the rule runs, then it
  reports no violation and the discovered listener set contains none of that fixture's methods.
  *Pinned by:* `MailListenerExecutorArchitectureTest.everyNotificationEventListenerNamesTheMailExecutor`
  + `MailListenerExecutorArchitectureTest.testScopeListenersAreNotCollected`
- [x] **AC-2 (hole 2):** Given a listener written as `@Async(MAIL_EXECUTOR)` + plain
  `@EventListener` on a platform event, when the violation collector runs over it, then it
  reports the durability violation (no registry publication, runs inside the publishing
  transaction). *Pinned by:* `MailListenerExecutorArchitectureTest.plainEventListenerIsRejected`
- [x] **AC-3 (non-vacuity):** Given a listener carrying `@ApplicationModuleListener` — the
  shape `BookingConfirmationMailListener` would revert to — when the violation collector runs
  over it, then it reports that the listener runs on Boot's shared `applicationTaskExecutor`.
  *Pinned by:* `MailListenerExecutorArchitectureTest.revertingToApplicationModuleListenerIsRejected`
- [x] **AC-4 (non-vacuity of discovery):** Given the production import, when the rule runs,
  then the set of listeners the rule actually **examines** — after both the production import and
  the platform-event carve-out — contains `BookingConfirmationMailListener#on` by declaring class
  and method name; a stronger guard than "the set is non-empty" (tightened by review finding F-1).
  *Pinned by:* `MailListenerExecutorArchitectureTest.theRuleExaminesTheProductionListener`
- [x] **AC-5 (no new false failures):** Given the two spellings Spring itself supports but the
  old rule would have mis-reported — a class-level `@Async(MAIL_EXECUTOR)` with the method
  carrying only `@TransactionalEventListener`, and a listener of a non-platform (Spring
  container-lifecycle) event — when the collector runs over each, then it reports nothing.
  *Pinned by:* `MailListenerExecutorArchitectureTest.classLevelAsyncIsHonoured`
  + `MailListenerExecutorArchitectureTest.containerLifecycleListenerIsOutOfScope`
- [x] **AC-6 (the durability rule means AFTER_COMMIT):** Given a listener at
  `TransactionPhase.BEFORE_COMMIT`, when the collector runs over it, then it reports the phase
  violation. *Pinned by:* `MailListenerExecutorArchitectureTest.beforeCommitPhaseIsRejected`
- [x] **AC-7 (the compliant shape still passes):** Given `@Async(MAIL_EXECUTOR)` +
  `@TransactionalEventListener` on a platform event, when the collector runs over it, then it
  reports nothing — the collector rejects shapes, not everything.
  *Pinned by:* `MailListenerExecutorArchitectureTest.theCompliantShapePasses`

## Non-goals

- **Renaming the test class.** `CLAUDE.md` names `MailListenerExecutorArchitectureTest` as the
  thing pinning #373/#374; a rename would be diff noise plus a substrate-doc edit for nothing.
- **Extending the rule beyond `notification`.** `booking`'s and `payout`'s
  `@ApplicationModuleListener`s belong on the shared pool — the bulkhead is mail-specific.
- **Writing #373 / #374.** This slice makes the rule trustworthy for them; it does not
  pre-empt them.
- **Any production-code change.** The diff is test scope plus one accessor on the test-scope
  `ArchitectureTestSupport`. `BookingConfirmationMailListener` and `RegistryMailExecutorConfig`
  are read, never edited.
- **A second rule for durability outside `notification`** (e.g. "no plain `@EventListener`
  anywhere"). Out of scope; the module-local rule is what #409 asks for.

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces the rule's discovery mechanism, so the ledger applies to *the rule's own
behaviors* — the check being replaced.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Collects candidates under `ai.riviera.platform.notification` via `ClassPathScanningCandidateComponentProvider` + `AssignableTypeFilter(Object.class)` | changed | ArchUnit `ArchitectureTestSupport.PRODUCTION_CLASSES` filtered to the notification package — same set minus test scope (the defect), and the same import every sibling arch rule already uses |
| Selects methods carrying a merged `@TransactionalEventListener` | changed → widened | Selects methods carrying a merged `@EventListener`, which `@TransactionalEventListener` is itself meta-annotated with, so the old set is a strict subset (hole 2) |
| Rejects a listener with no `@Async` ("would run inline on the committing thread") | preserved | Same message, same merged lookup — plus a class-level `@Async` fallback so Spring's other supported spelling stops reading as a violation |
| Rejects a listener whose `@Async` value is not `MAIL_EXECUTOR`, naming the shared pool when the value is empty | preserved | Verbatim, including the `@ApplicationModuleListener`-takes-no-qualifier hint |
| Fails when the discovered set is empty ("would be vacuously green") | changed → strengthened | Asserts the set contains `BookingConfirmationMailListener#on` by name (AC-4); an empty set fails that assertion too |
| Asserts violations are empty with a `\n - `-joined report | preserved | Same report shape, now fed by the extracted pure collector |
| (none — the old rule had no durability check) | new | A platform-event listener must be `@TransactionalEventListener` at `AFTER_COMMIT` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | ArchUnit's `DO_NOT_INCLUDE_TESTS` fails to exclude Gradle's `build/classes/java/test`, so hole 1 stays open behind a green test | low | high (the fix would be fictional) | Its `GRADLE_PATTERN` is `.*/build/classes/([^/]+/)?test/.*`, which matches `build/classes/java/test/`; and the mechanism is already load-bearing here — `PackageShapeArchitectureTests` runs on the same import and would explode on test packages. Proven directly by AC-1's `testScopeListenersAreNotCollected`, which only passes because a real test-scope listener exists and is excluded | claude | closed — the fixtures failed the rule with 4 named violations before the fix (`2e817e2` parent) and are excluded after |
| R-2 | Excluding test scope makes the rule vacuously green if the production import ever misses `notification` | low | high | AC-4 asserts the discovered set contains `BookingConfirmationMailListener#on` by declaring class **and** method name, not merely that the set is non-empty | claude | closed — `theRuleExaminesTheProductionListener` (renamed in `6055036` per F-1; the row cited the old name) |
| R-3 | Widening to `@EventListener` creates a *new* false-failure class — a legitimate Spring container-lifecycle listener (`ContextRefreshedEvent`) in `notification` would be told to become `@TransactionalEventListener`, which is nonsense when there is no publishing transaction | med | med | Scope the rules to listeners of **platform** events (parameter types ∪ `@EventListener#classes` under `ai.riviera.platform`); document the carve-out as a named boundary in the Javadoc; pin it with AC-5 | claude | closed — `containerLifecycleListenerIsOutOfScope`; `listenersOf` asserts the fixture *is* a listener first, so an empty result means "carved out", not "not examined" |
| R-4 | The fixtures are inert classes in a scanned package — a future reader "tidies" them away or Spring picks them up as beans | med | med | No `@Component`/stereotype, so component scanning never instantiates them; every method body calls a private `never(...)` that throws if ever dispatched; the fixtures' Javadoc states they are load-bearing for AC-1 and AC-3; `listenersOf` fails loudly if a fixture stops being a listener | claude | closed |
| R-5 | Scope creep — the phase and class-level-`@Async` checks are not literally named in #409 | med | low | Both are in the issue's own frame: the phase check *is* the durability rule the issue asks us to decide on (`AFTER_COMMIT` is what makes the registry story at-least-once), and the class-level `@Async` fallback removes a false failure of exactly hole 1's family. Both are ≤3 lines, both are pinned (AC-5, AC-6), both are recorded here so review can judge rather than discover | claude | closed — both landed, both pinned (`beforeCommitPhaseIsRejected`, `classLevelAsyncIsHonoured`); the class-level `@Async` case was not hypothetical, it produced a real false failure in the phase-0 red run |
| R-6 | Making the shared production import reachable from another package widens a test utility's surface | low | low | Expose a `public static JavaClasses productionClasses()` accessor rather than the field (immutable type, no Sonar mutable-static exposure); the class already carries the same precedent for `bytecode(Path)`, whose Javadoc is updated to name the second sharer | claude | closed — `productionClasses()` accessor, field stays package-private |
| R-7 | Merge conflict with parallel work | low | low | The ten open PRs are all Dependabot frontend bumps; no backend file overlap. No Flyway migration in this slice, so no `V<n>` collision to arbitrate (#122/#127 class) | claude | open |

## Open questions / Assumptions

*(empty — every entry resolved below.)*

### Resolved

- **Assumption:** `notification` will never legitimately need a plain (non-transactional)
  `@EventListener` on a *platform* event. → **Held, and is now enforced rather than assumed.**
  The module's only inbound domain-event path is mail, and ADR-0011 decision 5 puts every
  ids-only mail on the registry vehicle; the rule now fails such a listener and the Javadoc says
  why, so if #373/#374 ever need one the argument happens at the rule instead of silently.
  *Resolved in:* phase 1 (`plainEventListenerIsRejected`).

- **Open question (grill, #409's "then decide"):** should a non-transactional mail listener
  fail on the executor rule, the durability rule, or both? → **Both.** A plain `@EventListener`
  loses the `event_publication` row (nothing to republish on restart) *and* runs inside the
  publishing transaction, so the mail can precede — or outlive — a commit that never happens;
  the executor question is orthogonal and still applies. Recorded in the Javadoc and pinned by
  AC-2. *Resolves in:* phase 1.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds no write path of any kind; it edits an
architecture test and its fixtures. `availability(set_id, booking_date)` is neither read nor
written by anything in the diff.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state) | The rule is the module's own fitness function over its own `adapter/in` listeners, and it names `RegistryMailExecutorConfig.MAIL_EXECUTOR`, which is package-private in `notification.adapter.in`. Test scope only — no main-source class is added or moved |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | N/A — no port added, changed, or consumed | | | |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | N/A — no event added or changed. The fixtures declare a **test-scope** `MailListenerRuleFixtures.FixtureEvent` that is never published and is not a published surface; it exists so the fixtures do not have to import `booking::events` to be recognised as platform-event listeners | | | | | |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The mail-executor / registry-durability fitness function over `notification`'s event listeners | `notification` (test scope) | `notification` Job: transactional-mail delivery incl. "each on its own bounded executor, never Boot's shared `applicationTaskExecutor`" — the rule is the machine-check of that Job. Not `shared`, which admits no business logic and no module-owned state; not the root, which nothing may depend on |
| The shared, test-free production classpath import, now reachable from a module's own test package | `ai.riviera.platform` test scope (`ArchitectureTestSupport`) | Already the single home of "one production classpath scan instead of one per test class" and already public-for-cross-package-sharing (`bytecode(Path)`, used from `payment`'s test package). This is the same precedent, not a new one |

All test scope; no `allowedDependencies` grant changes — `ApplicationModules.verify()` imports
with `DO_NOT_INCLUDE_TESTS`, so nothing here is inside its view.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is read, computed, or moved. The slice's *subject* is the
bulkhead protecting the money path (invariants #8/#9), but it changes no code on that path.

## Angular — frontend surfaces touched

N/A — backend-only (and within that, test-scope-only).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or wire shape is touched.

## Execution status

**Stage pointer:** `DONE — merged via PR #412`

**Next action:** None. All gates passed on head `baa665a` (10/10 checks green, both review
halves run, Sonar clear with its one finding deferred to #416).

**Merged via PR #412.** (Recorded pre-merge on purpose — a squash SHA cannot exist before
the merge, and citing one guarantees a second docs-only PR; `pr-gates.md` §3 step 4.)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Reproduce and close hole 1 (test-scope false failure) | ✅ | `2e817e2` |
| 1 — Close hole 2 (plain `@EventListener`) + the durability rule + boundaries | ✅ | `d7ecbe8` |
| 2 — PR #412, review gate, Sonar gate, close-out | ✅ | `6055036` (F-1..F-3), `b77f627`, `0072e60`, `0ead7ec` (F-4), `3044860` (F-5/F-6), `baa665a` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (correctness) | AC-4's guard asserted only that the production listener was **discovered**. Two filters stand between a classpath class and an assertion — the production import *and* the platform-event carve-out — so the guard would have stayed green if the carve-out ever swallowed `BookingConfirmationMailListener#on`, which is exactly the vacuity it exists to prevent. Fix: named the carve-out `inScopeListeners(...)`, used by both the collector and the guard, and renamed the test `theRuleExaminesTheProductionListener` | fixed-in-`6055036` |
| F-2 | review (test coverage) | The collector's `no @Async at all` branch had **no fixture** — and it is the branch that gives `containerLifecycleListenerIsOutOfScope` its meaning, since that fixture also carries no `@Async`: an empty result there could equally have meant the null-check had stopped working. Fix: added `MailListenerRuleFixtures.InlineListener` (the lifecycle fixture's annotations minus the platform event) + `listenerWithNoAsyncIsRejected`, making the carve-out test non-vacuous by construction | fixed-in-`6055036` |
| F-5 | review (`/code-review` fan-out, agent 5 — prose-vs-code) | The carve-out reads the event type from `@EventListener#classes` as well as from the method parameter, but **no fixture exercised that spelling** — a branch introduced by this PR with no test behind it. Fix: `MailListenerRuleFixtures.DeclaredEventTypeListener` (`@TransactionalEventListener(classes = FixtureEvent.class)`, no method parameter) + `anEventTypeDeclaredOnTheAnnotationIsInScope`. Deliberately made *non-compliant* so the rule must **reject** it — a compliant fixture would assert an empty list, which is exactly what being silently carved out looks like. Mutation-verified: stubbing `listensToAPlatformEvent` to `false` fails this test and only this test | fixed-in-`3044860` |
| F-6 | review (`/code-review` fan-out, agent 3 — git history) | Risk-register row R-2 still cited `theRuleReachesTheProductionListener`, the pre-F-1 test name. `6055036` renamed the test and updated the AC and verification rows but missed this one — an internal inconsistency in the PR's own paper trail that `riviera-docs-freshness` cannot catch, since it audits substrate docs, not a plan doc's self-consistency | fixed-in-`3044860` |
| F-4 | sonar | **The Sonar gate on this PR is structurally empty, and that is a finding about the repo, not about the diff.** `sonar-project.properties` sets `sonar.sources=platform/src/main/java,frontend/src` and declares no `sonar.tests` anywhere, so this PR's entire code diff — all test scope — sits outside SonarCloud's analysis. The gate passed with `0 New issues` and `new_bugs`/`new_vulnerabilities`/`new_code_smells`/`new_security_hotspots` = 0, but `new_lines`, `new_coverage` and both duplication metrics are **absent** from `api/measures/component`, which is the tell: `pr-gates.md`'s documented false-clean check catches an *unanalyzed* PR, not an analyzed one whose files are all out of scope. Nothing to fix in this diff; the configuration gap is real and would be a large, separate triage wave | deferred → issue #416 |
| F-3 | review (accuracy) | `MailListenerRuleFixtures`' Javadoc claimed the old scanner "would have failed the build with six violations". The recorded phase-0 red run collected **four** fixtures and reported **two** violations, and the number moves whenever a fixture is added. Fix: stated the rule the run actually demonstrated instead of a brittle count | fixed-in-`6055036` |

---

## File structure

- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerExecutorArchitectureTest.java`
  — **modify.** Discovery moves to the test-free ArchUnit import and widens to `@EventListener`;
  the violation logic is extracted into a pure collector over `List<Method>`; the Javadoc gains
  the boundaries section #409 asks for.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerRuleFixtures.java`
  — **create.** Six deliberately-shaped listeners in the scanned package: they prove the
  test-scope exclusion by existing, and prove non-vacuity by being fed to the collector.
- `platform/src/test/java/ai/riviera/platform/ArchitectureTestSupport.java` — **modify.** Add
  `public static JavaClasses productionClasses()` and name the second cross-package sharer in
  the class Javadoc.

---

## Phase 0 — Reproduce and close hole 1 (test-scope false failure)

**Files:** Create `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerRuleFixtures.java`
· Modify `platform/src/test/java/ai/riviera/platform/ArchitectureTestSupport.java`
· Modify `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerExecutorArchitectureTest.java`

- [ ] **Step 1: Write the failing test.** Land `MailListenerRuleFixtures` (the compliant,
  composite, plain-`@EventListener`, before-commit, class-level-`@Async` and
  container-lifecycle shapes) plus the hole-1 assertion:

```java
@Test
void testScopeListenersAreNotCollected() {
	List<String> collectedFixtures = notificationEventListeners().stream()
			.map(Method::getDeclaringClass)
			.filter(type -> type.getEnclosingClass() == MailListenerRuleFixtures.class)
			.map(Class::getSimpleName)
			.toList();

	assertTrue(collectedFixtures.isEmpty(), () -> "The rule collected test-scope fixtures "
			+ collectedFixtures + " — a test fixture under " + NOTIFICATION_PACKAGE
			+ " must not read as a production violation (#409 hole 1)");
}
```

- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*MailListenerExecutorArchitectureTest*"`
  → FAIL. Two failures, both hole 1: `testScopeListenersAreNotCollected` reports the fixture
  classes, and the pre-existing `everyNotificationEventListenerNamesTheMailExecutor` reports
  them as production violations — the exact false failure #409 describes.

- [ ] **Step 3: Minimal implementation.** Add the accessor to `ArchitectureTestSupport`:

```java
/**
 * The shared production-code import, for an architecture rule that lives in its own module's
 * test package rather than here — {@code notification}'s
 * {@code MailListenerExecutorArchitectureTest}, which must sit in
 * {@code notification.adapter.in} to name the package-private mail-executor bean constant.
 */
public static JavaClasses productionClasses() {
	return PRODUCTION_CLASSES;
}
```

  and replace the scanner in `MailListenerExecutorArchitectureTest`:

```java
static List<Method> notificationEventListeners() {
	List<Method> listeners = new ArrayList<>();
	for (JavaClass type : ArchitectureTestSupport.productionClasses()) {
		if (!inNotificationModule(type.getPackageName())) {
			continue;
		}
		for (JavaMethod method : type.getMethods()) {
			Method reflected = method.reflect();
			if (isEventListener(reflected)) {
				listeners.add(reflected);
			}
		}
	}
	return listeners;
}

private static boolean inNotificationModule(String packageName) {
	return packageName.equals(NOTIFICATION_PACKAGE) || packageName.startsWith(NOTIFICATION_PACKAGE + ".");
}
```

- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*MailListenerExecutorArchitectureTest*"` → PASS.

> Scope (end-of-phase regression): `gradle test --tests "*ArchitectureTest*" --tests "*ArchitectureTests*" --tests "*ModularityTests*"`
> — every sibling rule shares `ArchitectureTestSupport`.

- [ ] **Step 5: Generalization-audit pass** — search for other rules discovering classes in a
  way that spans test scope; record the result in the log below.

- [ ] **Step 6: Commit** — `git commit -m "test(#409): stop the mail-listener rule reading test fixtures as production violations"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Close hole 2, pin the durability rule, document the boundaries

**Files:** Modify `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerExecutorArchitectureTest.java`

- [ ] **Step 1: Write the failing test** — AC-2's hole-2 case against the extracted collector:

```java
@Test
void plainEventListenerIsRejected() {
	List<String> violations = executorIsolationViolations(listenersOf(MailListenerRuleFixtures.PlainAsyncListener.class));

	assertTrue(violations.stream().anyMatch(v -> v.contains("plain @EventListener")),
			"Expected a plain @Async + @EventListener to be examined and rejected — it carries no "
					+ "event_publication row and runs inside the publishing transaction (#409 hole 2), "
					+ "but got: " + violations);
}
```

- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*MailListenerExecutorArchitectureTest*"`
  → FAIL: `violations` is empty, because the collector only ever examined
  `@TransactionalEventListener` methods.

- [ ] **Step 3: Minimal implementation** — widen the collector and add the durability rule:

```java
static List<String> executorIsolationViolations(List<Method> listeners) {
	List<String> violations = new ArrayList<>();
	for (Method listener : listeners) {
		if (!listensToAPlatformEvent(listener)) {
			continue;
		}
		TransactionalEventListener transactional =
				AnnotatedElementUtils.findMergedAnnotation(listener, TransactionalEventListener.class);
		if (transactional == null) {
			violations.add(describe(listener) + " is a plain @EventListener — it runs inside the "
					+ "publishing transaction, so a send can precede a commit that never happens, and it "
					+ "leaves no event_publication row to republish. Write "
					+ "@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR) + @TransactionalEventListener");
		}
		else if (transactional.phase() != TransactionPhase.AFTER_COMMIT) {
			violations.add(describe(listener) + " listens at " + transactional.phase()
					+ " — the registry vehicle's at-least-once story is AFTER_COMMIT (#383)");
		}

		Async async = mergedAsync(listener);
		if (async == null) {
			violations.add(describe(listener) + " is an event listener with no @Async at all — "
					+ "it would run inline on the committing thread");
		}
		else if (!RegistryMailExecutorConfig.MAIL_EXECUTOR.equals(async.value())) {
			violations.add(describe(listener) + " runs on "
					+ (async.value().isEmpty() ? "Boot's shared applicationTaskExecutor" : "'" + async.value() + "'")
					+ " rather than '" + RegistryMailExecutorConfig.MAIL_EXECUTOR + "' — a mail send there can "
					+ "back up the money path (#383). Note @ApplicationModuleListener takes no executor "
					+ "qualifier: write out @Async(RegistryMailExecutorConfig.MAIL_EXECUTOR) + "
					+ "@TransactionalEventListener instead");
		}
	}
	return violations;
}
```

- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*MailListenerExecutorArchitectureTest*"` → PASS,
  with AC-3/5/6/7's fixture tests added alongside.

> Scope (end-of-phase regression): `gradle test --tests "*ai.riviera.platform.notification.*"`
> plus the architecture/modularity set from phase 0.

- [ ] **Step 5: Generalization-audit pass** — does any sibling rule key on
  `@TransactionalEventListener` where `@EventListener` is the true predicate? Record below.

- [ ] **Step 6: Commit** — `git commit -m "test(#409): widen the mail-listener rule to plain @EventListener and pin its boundaries"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 0 | Class discovery that spans the test source set (hole 1's family) | `grep -rn "ClassPathScanningCandidateComponentProvider\|ClassFileImporter\|Files.walk" platform/src/test/java` | 5 discovery sites: `ArchitectureTestSupport.PRODUCTION_CLASSES` (`DO_NOT_INCLUDE_TESTS`, correct — and the import `PackageShapeArchitectureTests`, `ResponsibilitiesArchitectureTests`, `ErrorContractArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` and `CompositionRootDisciplineTests` all share) · `ArchitectureTestSupport.fixtureClasses` (includes tests **by design**, only ever pointed at `ai.riviera.placementfixture`) · `NoStripeConnectArchitectureTest` (hardcoded `build/classes/java/main/...`, correct) · `MailListenerExecutorArchitectureTest` (the defect) | Fixed the one site by joining it to the shared test-free import. The others were already main-scope or deliberately fixture-scope; no further sites |
| 2026-07-29 | phase 1 | A rule keying on `@TransactionalEventListener` where the wider `@EventListener` is the true predicate (hole 2's family) | `grep -rn "TransactionalEventListener\|ApplicationModuleListener" platform/src/test/java` | 1 other: `PublishedSurfacePlacementArchitectureTests.isTransactionalEventListener` | **Deliberately left as-is.** That rule's subject is where a *cross-module published event* may live, and a published event is by definition consumed transactionally (registry-borne) — a plain `@EventListener` on a sibling's event is a different defect, owned by this slice's durability rule for `notification` and by nothing for other modules. Widening it would change what that rule means, not close a hole in it. Recorded here so the asymmetry is a decision, not an oversight |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*MailListenerExecutorArchitectureTest*"` → `everyNotificationEventListenerNamesTheMailExecutor` and `testScopeListenersAreNotCollected` both PASS with the fixtures present.
- [x] **AC-2:** Same run → `plainEventListenerIsRejected` PASS.
- [x] **AC-3:** Same run → `revertingToApplicationModuleListenerIsRejected` PASS.
- [x] **AC-4:** Same run → `theRuleExaminesTheProductionListener` PASS (asserts the listener survives the carve-out too, per F-1).
- [x] **AC-5:** Same run → `classLevelAsyncIsHonoured` and `containerLifecycleListenerIsOutOfScope` PASS.
- [x] **AC-6:** Same run → `beforeCommitPhaseIsRejected` PASS.
- [x] **Collector branch coverage (F-2):** Same run → `listenerWithNoAsyncIsRejected` PASS.
- [x] **Carve-out branch coverage (F-5):** Same run → `anEventTypeDeclaredOnTheAnnotationIsInScope` PASS; mutation-verified (stubbing `listensToAPlatformEvent` to `false` fails this test and only this test). 11 tests, 0 failures.
- [x] **AC-7:** Same run → `theCompliantShapePasses` PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A — no write path in the diff).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (N/A — no money in scope).
- [x] Refund policy enforced server-side (invariant #10) — N/A, untouched.
- [x] Timezone correct (invariant #6) — N/A, no time arithmetic.
- [x] Booking codes unguessable (invariant #7) — N/A; nothing here logs or handles a code.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented — N/A, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — both halves. `/review 412` + `riviera-review-overlay` ran first (3 findings, F-1..F-3) while `/code-review` was unregistered; the plugin skill then became available, the human authorised the subagents, and the full five-agent fan-out ran (2 further findings, F-5/F-6 — the #351 case history holding exactly). All fixed and re-verified.
