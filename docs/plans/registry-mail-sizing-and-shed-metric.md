# Registry-mail pool sizing + an attributable shed metric — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the registry-mail executor's two bounds environment-tunable (validated, so a
non-positive value fails at boot instead of silently becoming a `SynchronousQueue`) and make its
shed path attributable — a counter named in `shared/ObservabilityMetrics`, plus one escalated log
line per saturation episode instead of one per shed task.

**Architecture:** The single significant decision is **how the two knobs are validated**. The repo
has **no JSR-303 implementation on the runtime classpath** (verified: `gradle dependencies
--configuration runtimeClasspath` matches nothing for `valid`), and #97 settled the house posture as
*centralized-explicit validation, `spring-boot-starter-validation`/`@Valid` deliberately not
adopted*. So `@Validated` + `@Min` would **silently do nothing** here — the same class of footgun the
issue exists to close. The bounds are therefore a `@ConfigurationProperties` **record with a compact
canonical constructor** (`riviera-java-conventions` §2), which fails the bind and therefore the boot.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue **#408** (parent epic **#367**), carried forward from #383's
comparison review against the closed branch of PR #406.

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake grill gate produced AC-5 and the two
  Non-goals below.
- `riviera-modulith` — confirmed `notification` already grants `shared` in its
  `allowedDependencies`, so referencing an `ObservabilityMetrics` constant adds no new module edge;
  and kept the new properties record in `adapter/in` beside its `@Configuration` (ADR-0007 full
  template), not in `application`, where PR #406's branch had put the whole config.
- `riviera-java-conventions` — §2 compact-constructor validation over annotations (with §6b/#97 as
  the settled precedent), §6a named constants, §6c one-line-or-none comments, §10 parameterized
  logging with no address or booking code.
- `riviera-local-debug` — the cloud Gradle recipe (system `gradle`, JDK-25 toolchain registration,
  JDK 21 daemon) and the scoped-test discipline used for every phase run below.
- `riviera-plan-doc` — this document's structure and the Execution-status state store.
- `postgres`, `riviera-frontend`, `angular-developer`, `playwright-cli`, `riviera-stripe-payments` —
  **not loaded, not triggered**: no migration, no SQL, no frontend surface, no money movement.

**Branch:** `claude/sdlc-408-y7vbgo` — the cloud session's designated remote branch, standing in for
`feature/registry-mail-sizing-and-shed-metric` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given no environment overrides, when the context binds
      `riviera.notification.registry-mail.*`, then `poolSize` is `2` and `queueCapacity` is `200` —
      byte-for-byte today's constants — and the executor is built from those values.
      *Pinned by:* `RegistryMailPropertiesTest.bindsTheShippedDefaults` +
      `RegistryMailExecutorConfigTest.isBoundedOnEveryAxis`
- [x] **AC-2:** Given `RIVIERA_REGISTRY_MAIL_POOL_SIZE=4` and
      `RIVIERA_REGISTRY_MAIL_QUEUE_CAPACITY=50` in the environment, when the context binds, then the
      properties are `4`/`50` — i.e. #370 can retune without a code change.
      *Pinned by:* `RegistryMailPropertiesTest.theEnvironmentOverridesBothBounds`
- [x] **AC-3:** Given `riviera.notification.registry-mail.queue-capacity=0` (or any non-positive
      value), when the context starts, then startup **fails** with a message naming the property and
      the `SynchronousQueue` consequence — never a booted app whose pool sheds every send it cannot
      hand straight to a free thread. *Pinned by:*
      `RegistryMailPropertiesTest.aNonPositiveQueueCapacityFailsTheContext` +
      `RegistryMailPropertiesTest.rejectsANonPositiveQueueCapacity`
- [x] **AC-4:** Given a non-positive `pool-size`, when the record is constructed, then it throws
      rather than reaching `ThreadPoolExecutor`'s own opaque `IllegalArgumentException`.
      *Pinned by:* `RegistryMailPropertiesTest.rejectsANonPositivePoolSize`
- [x] **AC-5:** Given a saturated pool, when a send is shed, then the counter named by
      `ObservabilityMetrics.MAIL_REGISTRY_SHED` (declared there, not module-locally) increments by
      exactly one per shed task. *Pinned by:*
      `RegistryMailExecutorConfigTest.everyShedSendIncrementsTheCounter`
- [x] **AC-6:** Given a saturation episode in which N sends are shed with no intervening progress,
      when the episode is observed, then **exactly one** `ERROR` line is logged, not N.
      *Pinned by:* `RegistryMailExecutorConfigTest.aSaturationEpisodeLogsOnceNotOncePerShedTask`
- [x] **AC-7:** Given a saturation episode that ends (the pool drains a task) and a later one
      begins, when the second episode's first send is shed, then a **new** `ERROR` line is logged —
      the throttle must not silence a genuinely new incident.
      *Pinned by:* `RegistryMailExecutorConfigTest.aLaterEpisodeLogsAgain`

## Non-goals

- **No upper bound on either knob.** Rejecting non-positive values is the AC; capping `pool-size` at
  some invented ceiling would defeat the point of making it tunable at #370, when a real relay's
  latency is known for the first time. An absurd value fails loudly (OOM / thread exhaustion), not
  silently, which is the distinction that matters here.
- **No counter for the recovery vehicle's drop.** `AsyncMailDispatcher` drops with a WARN and no
  counter, and its drop is a genuine loss (bearer-credential payload, nothing to retry from —
  ADR-0011 decision 5), so it deserves its own name and its own justification. Out of scope; the
  name chosen here (`riviera.mail.registry.shed`) deliberately leaves room for a sibling
  `riviera.mail.recovery.dropped`.
- **No `MoneyPathAlertCheck` integration.** That check is the *money-path* self-check (#100, D4) with
  three deliberately-chosen signals; a shed confirmation mail is not money-path work. The counter is
  documented in the observability runbook as an externally-alertable Prometheus series instead.
- **No change to the shed semantics themselves** — still discard, still no throw, still no
  caller-runs. #383 settled that and its reasoning is unchanged.
- **Not #407** (prove a shed send leaves its publication outstanding, in a Spring context), **#409**,
  **#410** or **#411**. Sibling follow-ups from the same review; each keeps its own issue.

## Behavior-parity ledger

**Mandatory — this slice changes an existing surface** (the executor's construction and its shed
handler). "Defaults reproduce today's behaviour" is exactly the claim that must be verified
behavior-by-behavior rather than asserted.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Core = max = `POOL_SIZE` (2) | preserved | `pool.setCorePoolSize(props.poolSize())` / `setMaxPoolSize(props.poolSize())`, default `2`; AC-1 pins the value, `isBoundedOnEveryAxis` pins core == max |
| Queue capacity `QUEUE_CAPACITY` (200) | preserved | `pool.setQueueCapacity(props.queueCapacity())`, default `200`; AC-1 |
| Rejection handler discards; never throws at the caller | preserved | `SaturationPolicy.rejectedExecution` returns normally, unchanged; the existing `shedsOnSaturationWithoutThrowingOrRunningOnTheCallerThread` test is kept verbatim |
| Rejection handler never runs the task on the caller's thread | preserved | same test, unchanged |
| Thread-name prefix `registry-mail-` | preserved | untouched constant |
| `waitForTasksToCompleteOnShutdown` + 5s await | preserved | untouched (its own follow-up is #411) |
| `defaultCandidate = false` on the bean | preserved | untouched — load-bearing per `RegistryMailExecutorWiringIT`, which still passes unchanged |
| One `WARN` per shed task | **changed** | becomes one `ERROR` per *episode* + a counter per task. Volume drops from N lines to 1; severity rises because a shed send is deferred until a restart (or #405's admin resubmission), which can be days — AC-6/AC-7 pin both halves |
| Constants `POOL_SIZE` / `QUEUE_CAPACITY` readable by tests | **changed** | removed; the executor test now builds the config with an explicit `RegistryMailProperties`, which is more honest than asserting a constant against itself |
| `new RegistryMailExecutorConfig().registryMailExecutor()` (no-arg, used by the unit test) | **changed** | takes `(RegistryMailProperties, MeterRegistry)`; the test passes a `SimpleMeterRegistry` (repo precedent: `RefundFailureMetricTest`) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `@Validated`/`@Min` chosen out of habit, silently no-ops (no JSR-303 impl on the classpath) and ships the exact footgun #408 is closing | **was high** | high | Classpath verified empty of `valid*` before designing; compact-constructor guard chosen instead; AC-3 asserts the *context* fails, not just the record, so a regression to a silent annotation cannot pass | agent | **closed** — the guard is a compact constructor; `aNonPositiveQueueCapacityFailsTheContext` asserts the context fails, so a regression to a silent annotation goes red |
| R-2 | The episode throttle silences a *second*, genuinely new incident | med | med | The flag clears the moment the pool makes progress (a task actually starts), so a later saturation logs again — AC-7 exists solely to pin this | agent | **closed** — `aLaterEpisodeLogsAgain` passes, which it cannot do unless the flag clears |
| R-3 | `ThreadPoolTaskExecutor` may not apply a `TaskDecorator` on the `submit()` path in this Spring version, so the reset never fires under the existing test's submission style | med | med | Drive the episode tests through `execute()` — which is what `@Async` on the listener's `void` method actually uses — and keep the existing `submit()`-based shed test unchanged; verify empirically in phase 1 rather than trusting the framework doc | agent | **closed** — resolved empirically: `aLaterEpisodeLogsAgain` expects a *second* line and passes, which is only reachable if the decorator runs on the `execute()` path. Had it not, the test would have stayed at one line and gone red |
| R-4 | Constructing the bean with a `MeterRegistry` parameter breaks the wiring the `defaultCandidate = false` trap depends on | low | high | `RegistryMailExecutorWiringIT` is untouched and re-run in phase 1; it asserts all three halves (Boot's shared pool survives, bare `@Async` resolves to it, the mail bean stays name-addressable) | agent | **closed** — `RegistryMailExecutorWiringIT` ran (Docker present) 3/3 green after the signature change, alongside `RegistryMailBulkheadIT` 4/4 |
| R-5 | Full-suite-only failure (the `riviera-local-debug` shared-state class): a bounded long-lived pool plus a new meter accumulating across cached contexts | low | med | No new `@Scheduled`, filter, or rate-limit key; the meter is registered per-context; the only test that wedges the pool owns its executor and releases it in a `finally`. Verified by the push's CI run, per the CI-gate rule | agent | open — scoped runs green; **CI's full suite is the real verdict**, checked on the push before the PR is called ready |
| R-6 | Property namespace drifts from the bean it configures, so a future reader cannot connect `riviera.notification.confirmation-mail.*` (PR #406's name) to `registryMailExecutor` | low | low | Namespace is `riviera.notification.registry-mail.*`, matching the bean name, the class name and the vehicle name used throughout #383's Javadoc | agent | **closed** — namespace is `riviera.notification.registry-mail.*` as designed |

## Open questions / Assumptions

### Open

*(none)*

### Resolved at the intake grill

- **Which validation mechanism?** → compact constructor, not `@Min`. The issue offers
  "`@Min`/validated `@ConfigurationProperties`" as the shape; the classpath decides between them, and
  it has no JSR-303 implementation, so `@Validated` would bind and validate nothing. #97's settled
  decision (`references/error-contract.md`: *"`spring-boot-starter-validation`/`@Valid` was
  deliberately not adopted … explicit code in records is the house idiom"*) makes adding one a
  project-level dependency reversal, not a slice-level detail. **This is a deliberate divergence
  from the issue's parenthetical, and it satisfies the AC it was offered for** (a bad value fails at
  boot).
- **Where does the metric name live, and does `ObservabilityMetrics`' remit stretch?** → in
  `ObservabilityMetrics`, with the class Javadoc **explicitly widened** from *"the names of the
  money-path metrics (issue #100, D4)"* to the platform's operational metric names, keeping the
  money-path trio grouped and labelled as such. The issue names this as the fork to resolve rather
  than leave two conventions in the codebase. `notification` already lists `shared` in
  `allowedDependencies` (granted at #391 for `ApiProblem`), so no new module edge is created, and
  `String` constants are compile-time-inlined so no runtime dependency is either.
- **Is the previous sibling slice's close-out complete?** → #383 is closed, its plan doc is finalized
  at `merged via PR #403`, and it is a registered sub-issue of epic #367. **One gap found:** the five
  follow-ups #383 filed at close-out (#407–#411) were **not** attached to #367 as sub-issues, though
  the earlier #405 was. This slice attaches **#408** at its own close-out and reports the other four
  to the maintainer rather than silently reassigning them.
- **What else is in flight?** → nothing that can collide. The only open PRs are ten Dependabot
  frontend bumps (#332–#341); no feature branch is open. **No Flyway migration is in scope**, so the
  `V<n>` collision class does not apply.
- **Does the new `@ConfigurationProperties` type need registering?** → yes, via
  `@EnableConfigurationProperties(RegistryMailProperties.class)` on the existing
  `RegistryMailExecutorConfig`, mirroring `BookingSchedulingConfig` / `CustomerRetentionConfig` /
  `ObservabilityConfig`. The repo does not use `@ConfigurationPropertiesScan`.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` Nothing here reads or writes `availability(set_id,
booking_date)`. The slice touches only the executor that *delivers already-committed confirmation
mail*; a shed send changes no booking, no claim and no ledger row. The one concurrency primitive in
scope is the `AtomicBoolean` episode flag, whose worst-case race is a duplicate or missing **log
line** — never a lost counter increment (the counter increments unconditionally, before the flag is
consulted) and never a task-scheduling decision.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state, no aggregate) | It owns the registry delivery vehicle and its executor (#383). The bounds and the shed policy are properties of that vehicle |
| M-2 | `shared` | existing | none (OPEN Shared Kernel, not a bounded context) | One added `String` constant in `ObservabilityMetrics`, the existing single source of truth for metric names. Passes the kernel's admission test: no business logic, no module-owned state, no dependency on a module that depends back |

**Cross-module named interfaces (`api/` ports)**

`N/A — no port added or changed.` `notification` still publishes only `MailSender` and
`MailDeliverability`; nothing new is consumed. The `shared` reference is a direct type reference
(the kernel is `type = OPEN`, so it publishes no named interfaces) and is already granted.

**Domain events**

`N/A — no event added, moved, or renamed.` `BookingConfirmed`'s payload, its listener's class name,
method name and parameter type are all untouched, so the Event Publication Registry's `listener_id`
is unchanged and **no Flyway `event_type` rewrite is needed** (the V31/#382 lesson, re-checked).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The registry-mail pool's bounds, as bound configuration | `notification` | `notification` Job: owns "the two delivery vehicles … and the bounded in-memory dispatcher" — the executor's shape is the vehicle's own business. Not the root: #382 moved mail machinery **out** of the composition root, and putting its tunables back would reverse that |
| The shed policy (count + escalate once per episode) | `notification` | Same Job line; it is the vehicle's saturation behaviour, already documented there as a contract by #383 |
| The metric **name** | `shared` | Consistent with `REFUNDS_FAILED`, which is declared in `shared` and emitted from `payment.application.RefundService` — the emitter owns the emission, the kernel owns the name. Declaring it module-locally is what the issue explicitly rules out ("two conventions in the codebase") |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no ledger row changes, no Stripe call. The pool this
slice tunes exists *precisely so that mail cannot touch* the money-path spine (#383); nothing here
narrows that separation — `RegistryMailExecutorWiringIT` re-runs unchanged to prove it.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, style or e2e spec is in scope.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is added or altered.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current `riviera-sdlc` stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** `PR — pushed, opening the PR; review gate next`

**Next action:** Open the PR into `main`, check that push's CI run, then run the Review gate
(`/code-review` + `riviera-review-overlay`) and the Sonar gate before any merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — externalise + validate the two bounds | ✅ | `98c4796` |
| 1 — the shed counter + the per-episode escalation | ✅ | `aa1065d` |
| 2 — substrate docs (freshness run: 0 contradictions, 4 patches) | ✅ | `d5cf5b7` |
| 3 — review + sonar gates, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

- `platform/src/main/java/…/notification/adapter/in/RegistryMailProperties.java` — **new.** The
  bound record + its compact-constructor guards.
- `platform/src/main/java/…/notification/adapter/in/RegistryMailExecutorConfig.java` — modify.
  `@EnableConfigurationProperties`; bean built from the record; `SaturationPolicy` replaces the
  `shed()` lambda; the two `static final int` constants go.
- `platform/src/main/java/…/shared/ObservabilityMetrics.java` — modify. Add
  `MAIL_REGISTRY_SHED`; widen the class Javadoc's remit.
- `platform/src/main/resources/application.properties` — modify. Two `${VAR:default}` placeholders
  with the rationale comment.
- `platform/src/test/java/…/notification/adapter/in/RegistryMailPropertiesTest.java` — **new.**
  Record guards + `ApplicationContextRunner` binding/boot-failure.
- `platform/src/test/java/…/notification/adapter/in/RegistryMailExecutorConfigTest.java` — modify.
  Sizing from properties; counter; episode logging.
- `docs/runbooks/observability.md` — modify. The new counter and how to alert on it.
- `docs/deploy/cd-pipeline.md` — modify. The two new (optional, unset-by-default) env vars.

---

## Phase 0 — Externalise and validate the two bounds

**Files:** Create `RegistryMailProperties.java`, `RegistryMailPropertiesTest.java` · Modify
`RegistryMailExecutorConfig.java`, `application.properties`, `docs/deploy/cd-pipeline.md`

- [ ] **Step 1: Write the failing test** — `RegistryMailPropertiesTest` covering the four record
      guards (AC-3 record half, AC-4), the shipped defaults (AC-1), the env override (AC-2), and the
      context-fails-to-start case (AC-3 boot half), using `ApplicationContextRunner` +
      `ConfigDataApplicationContextInitializer` per `RateLimitPropertiesBindingTest`.
- [ ] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*RegistryMailPropertiesTest*"` → FAIL
      (cannot resolve `RegistryMailProperties`).
- [ ] **Step 3: Minimal implementation** — the record with `@DefaultValue("2")` /
      `@DefaultValue("200")` and a compact constructor rejecting non-positive values with a message
      that names the property and the `SynchronousQueue` consequence; the two placeholders in
      `application.properties`; `@EnableConfigurationProperties` + the bean reading the record.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, then the touched module's tests:
      `--tests "*RegistryMail*"`.
- [ ] **Step 5: Generalization-audit pass** — search for other unchecked numeric `@Value`/
      `@ConfigurationProperties` knobs whose non-positive value degrades silently rather than
      loudly; record the search and the decision in the log below.
- [ ] **Step 6: Commit** — `feat(#408): bind the registry-mail pool bounds as validated properties`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The shed counter and the per-episode escalation

**Files:** Modify `ObservabilityMetrics.java`, `RegistryMailExecutorConfig.java`,
`RegistryMailExecutorConfigTest.java`, `docs/runbooks/observability.md`

- [ ] **Step 1: Write the failing test** — in `RegistryMailExecutorConfigTest`:
      `everyShedSendIncrementsTheCounter` (AC-5),
      `aSaturationEpisodeLogsOnceNotOncePerShedTask` (AC-6), `aLaterEpisodeLogsAgain` (AC-7), using
      `SimpleMeterRegistry` + a Logback `ListAppender` per `MoneyPathAlertCheckTest`, and driving
      submissions through `execute()` (R-3).
- [ ] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*RegistryMailExecutorConfigTest*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — `MAIL_REGISTRY_SHED` in `ObservabilityMetrics` (+ the
      widened remit Javadoc); a `SaturationPolicy` implementing `RejectedExecutionHandler` +
      `TaskDecorator` that increments unconditionally and logs `ERROR` only on the flag's
      false→true transition, the flag clearing when a task actually starts.
- [ ] **Step 4: Run it, verify it passes** — same command, then the structural net and the wiring IT
      (R-4): `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
      --tests "*PackageShapeArchitectureTests*" --tests "*RegistryMailExecutorWiringIT*"`.
- [ ] **Step 5: Generalization-audit pass** — search every `RejectedExecutionHandler` /
      rejection log site for the same log-per-event flood (`AsyncMailDispatcher` is the known
      sibling); record the decision.
- [ ] **Step 6: Commit** — `feat(#408): count shed registry mail and escalate once per episode`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Substrate docs + close-out

**Files:** Modify `docs/runbooks/observability.md`, `docs/deploy/cd-pipeline.md`, this plan doc

- [ ] **Step 1:** Run `riviera-docs-freshness` over the branch's range (merge close-out step 5) and
      patch whatever the diff contradicts — at minimum the observability runbook's metric inventory
      and the CD env-var list.
- [ ] **Step 2:** Finalize this plan doc **in this PR's last commit**, citing `merged via PR #NN`
      (never a merge SHA) — the three-slice tax (#326→#347, #346→#352, #351→#354) is the reason.
- [ ] **Step 3:** Attach **#408** as a sub-issue of epic **#367**, and report the #407/#409/#410/#411
      gap to the maintainer.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 0 (new pattern: guarding a numeric config knob whose non-positive value degrades *silently* rather than loudly) | every bound numeric property in the codebase, asking "what does `0` do here?" | `rg 'int \|long ' --include=*Properties.java src/main/java` then read each use site | 6 knobs; **2 are the same defect class, both verified by reading the use site, not assumed**: (a) `RateLimitProperties.maxTrackedKeys=0` → `RateLimitFilter:499` `buckets.size() >= 0` is true on *every* new key, so `buckets.clear()` (line 503) wipes every other key's spent tokens on each miss — the rate limiter degrades to near-useless while booting cleanly and saying so only at `DEBUG`; (b) `CustomerRetentionProperties.batchSize=0` → `expiredGuestCandidates(cutoff, 0)` → `LIMIT 0`, a sweep that silently scrubs nothing forever. The `MoneyPathAlert` thresholds are **not** candidates — `0` is their documented "alert on any" value | **Subset — fix neither here, file one follow-up issue.** Both are outside this slice's module and area: (a) is a security control owned by the #129/#286 arc and deserves its own review, and widening a mail-sizing PR into `RateLimitFilter` is exactly the "while I'm here" the Non-goals section guards against. **Filed at close-out** as its own issue rather than silently dropped (number recorded in Execution status once it exists) |
| 2026-07-29 | phase 1 (new pattern: counting a discarded unit of work and escalating once per episode instead of once per event) | every site that handles a rejected/discarded task, asking "does this log per event, and is the discard counted?" | `rg 'RejectedExecutionHandler\|TaskRejectedException\|RejectedExecutionException' --include=*.java src/main/java` | 2 sites — this slice's `SaturationPolicy`, and `AsyncMailDispatcher:87`, which logs one `WARN` per dropped recovery mail and has **no counter at all** | **Skip here, file as a follow-up.** Same shape, different semantics: the recovery vehicle *drops* (bearer-credential payload, nothing durable to retry from — ADR-0011 decision 5), so unlike a shed each line describes an unrecoverable loss and may well deserve to stay per-event. Deciding that, and naming its counter, is exactly the judgment this slice's Non-goals reserved — folding it in would make the Non-goal untrue mid-PR |

---

## Docs-freshness run (merge close-out step 5)

Range `origin/main..HEAD`, run at phase 2. **Zero contradictions** — no substrate doc states a fact
this slice makes false. The `shared`-kernel membership lists (`CLAUDE.md:136`,
`RESPONSIBILITIES.md:337`, `ADR-0007:273`) name `ObservabilityMetrics` as a *type* and are unaffected
by a constant being added to it; `CLAUDE.md:157` and `RESPONSIBILITIES.md:279`'s "recovery *drops*,
registry *sheds*" and "each draining on its own bounded executor" both remain true; the runbook's
"three money-path signals" heading stays accurate, since `MoneyPathAlertCheck` still reads exactly
those three (a Non-goal here, and now stated in the runbook).

Two **omissions** patched, both in rows the repo maintains at per-slice mechanism granularity:

| Doc | Stated fact | Action |
|---|---|---|
| `CLAUDE.md:157` (notification module row) | carried #383's saturation contract but not #408's validated bounds or the shed counter | **patched** — one clause |
| `RESPONSIBILITIES.md:279` (notification **Job**) | same gap | **patched** — one clause |
| `docs/runbooks/observability.md` | had no entry for the new counter | **patched** — a non-money-path metric section + the two tunables |
| `docs/deploy/cd-pipeline.md` | env-var list had no entry for the two new knobs | **patched** — a leave-unset entry pointing at the runbook |

Step 6 (graph refresh) **skipped**: `graphify-out/` is gitignored and absent in this cloud clone.

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle test --tests "*RegistryMailPropertiesTest*" --tests "*RegistryMailExecutorConfigTest*"` → PASS. Verified at commit `98c4796`.
- [x] **AC-2:** `gradle test --tests "*RegistryMailPropertiesTest*"` → PASS. Verified at commit `98c4796`.
- [x] **AC-3:** `gradle test --tests "*RegistryMailPropertiesTest*"` → PASS. Verified at commit `98c4796`.
- [x] **AC-4:** `gradle test --tests "*RegistryMailPropertiesTest*"` → PASS. Verified at commit `98c4796`.
- [x] **AC-5:** `gradle test --tests "*RegistryMailExecutorConfigTest*"` → PASS. Verified at commit `aa1065d`.
- [x] **AC-6:** `gradle test --tests "*RegistryMailExecutorConfigTest*"` → PASS. Verified at commit `aa1065d`.
- [x] **AC-7:** `gradle test --tests "*RegistryMailExecutorConfigTest*"` → PASS. Verified at commit `aa1065d`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified `N/A`); no availability write path in scope (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event payload changed (invariant #11).
- [x] **Payment/payout** section filled (justified `N/A`) (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — no time arithmetic in scope.
- [x] Booking codes unguessable (invariant #7) — the shed log still carries no address and no code.
- [x] Flyway migration present for schema changes (invariant #12) — none needed, and re-verified that no `listener_id`/`event_type` rewrite is implied.
- [x] **Frontend** standards met or deviation documented — `N/A`, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state committed here citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
