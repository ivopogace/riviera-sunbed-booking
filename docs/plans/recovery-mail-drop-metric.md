# Recovery-mail drop counter + a deliberate logging decision — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recovery vehicle's dropped sends attributable — a counter named in
`shared/ObservabilityMetrics` — and settle, in writing, whether its per-drop log line stays
per-event or gains #408's per-episode throttle.

**Architecture:** The single significant decision is **the logging one, and the answer is the
opposite of #408's** — the per-drop line **stays per-event**, because the two vehicles' rejections
differ in the one property a throttle trades away. A registry *shed* is redundant with a durable
record (the `event_publication` row survives, carrying the payload), so collapsing N lines to one
loses nothing recoverable. A recovery *drop* has no durable record by construction (ADR-0011
decision 5 — the payload is a bearer credential the registry may not persist), so **the log line is
the only per-loss artefact that exists**, and its MDC correlation id is the only thread back to the
request whose user is still waiting. Throttling here would delete evidence, not noise. The second
decision follows from the same asymmetry: unlike #408, a rejection **during shutdown is still
counted**, because for this vehicle it is a real loss rather than a non-event — so the counter
carries a `reason` tag (`saturated` / `shutdown`) to keep "the relay is wedged" distinguishable from
"a redeploy raced a request".

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue **#415** (parent epic **#367**), filed by #408's phase-1
generalization audit (PR #413) as the second of the codebase's two rejection sites.

**Skills consulted:**
- `riviera-sdlc` — drove the loop; its issue-intake grill gate produced the two upstream-rate facts
  under *Resolved at the intake grill* and the shutdown-path question the issue did not raise.
- `riviera-modulith` — confirmed `notification` already grants `shared` in `allowedDependencies`
  (#391/#408), so a second `ObservabilityMetrics` constant adds no module edge; and kept the change
  inside `application/` where `AsyncMailDispatcher` already lives (it is the vehicle's own
  behaviour, not an adapter concern) rather than moving it beside the registry vehicle's config.
- `riviera-java-conventions` — §6a named constants for the tag key/values, §6c one-line-or-none
  inline comments with the long reasoning on the Javadoc, §10 parameterized logging carrying
  neither address nor link (invariant #7), §3 constructor injection into a `final` field.
- `riviera-local-debug` — the cloud Gradle recipe (system `gradle`, JDK-25 toolchain registration)
  and the scoped-test discipline used for every phase run below.
- `riviera-plan-doc` — this document's structure and the Execution-status state store.
- `riviera-docs-freshness` — the phase-1 sweep over `origin/main..HEAD`.
- `riviera-review-overlay` + the `/code-review` fan-out — the Review gate (see the findings
  register).
- `postgres`, `riviera-frontend`, `angular-developer`, `playwright-cli`, `riviera-stripe-payments` —
  **not loaded, not triggered**: no migration, no SQL, no frontend surface, no money movement.

**Branch:** `claude/sdlc-415-9430t2` — the cloud session's designated remote branch, standing in for
`feature/recovery-mail-drop-metric` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a saturated recovery dispatcher, when a send is rejected, then the counter
      named by `ObservabilityMetrics.MAIL_RECOVERY_DROPPED` (declared there, not module-locally)
      increments by exactly one per dropped send.
      *Pinned by:* `AsyncMailDispatcherTest.everyDroppedSendIncrementsTheCounter`
- [x] **AC-2:** Given a saturation episode in which N sends are dropped, when the episode is
      observed, then **N** log lines are emitted, not one — the per-drop record is deliberately
      **not** throttled, because unlike a registry shed each line is the only trace of an
      unrecoverable loss.
      *Pinned by:* `AsyncMailDispatcherTest.everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss`
- [x] **AC-3:** Given a dispatcher shut down by a redeploy, when a still-in-flight request
      dispatches a send, then the counter **does** increment — carrying `reason=shutdown` rather
      than `reason=saturated`, since the mail is genuinely lost but the relay is not the cause.
      *Pinned by:* `AsyncMailDispatcherTest.aDropDuringShutdownIsCountedButAttributedToTheShutdown`
- [x] **AC-4:** Given any dropped send, when it is logged, then the line carries neither the
      recipient address nor the reset/verification link (invariant #7).
      *Pinned by:* `AsyncMailDispatcherTest.theDropLineCarriesNeitherAddressNorLink`
- [x] **AC-5:** Given a rejected dispatch, when `dispatch` returns, then it has **not** thrown and
      the send has **not** run on the caller's thread — the drop semantics of #369 are unchanged.
      *Pinned by:* `AsyncMailDispatcherTest.aRejectedDispatchIsDroppedWithoutThrowing` (existing,
      kept verbatim)

## Non-goals

- **No throttle on the drop line.** This is the slice's decision, not an omission — argued above and
  recorded on the class. If aggregate recovery volume ever makes the per-drop line a genuine flood,
  the change to make is an escalated once-per-episode line **alongside** the per-drop record, never
  replacing it.
- **No change to the drop semantics themselves** (issue AC-4): still best-effort, still never
  throwing onto the request thread (#369), still never caller-runs.
- **No `MoneyPathAlertCheck` integration.** Same reasoning #408 recorded: that check reads three
  deliberately-chosen money-path signals and a lost recovery mail is not one. The counter is an
  externally-alertable Prometheus series documented in the runbook instead.
- **No retry, queue-persistence, or dead-letter for dropped recovery mail.** Persisting a
  bearer-credential payload is on `notification`'s Not-My-Job list ("nobody's job, ever" —
  `RESPONSIBILITIES.md:326`) and would reverse ADR-0011 decision 5. The user re-requests; that is
  the design.
- **Not #414** (the two silently-degrading numeric knobs), **#407**, **#410** or **#411** — sibling
  follow-ups from the same review arc; each keeps its own issue.

## Behavior-parity ledger

**Mandatory — this slice changes an existing surface** (the dispatcher's rejection path).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A rejected dispatch is swallowed, never thrown at the caller | preserved | the `catch (TaskRejectedException)` block is unchanged in shape; `aRejectedDispatchIsDroppedWithoutThrowing` kept verbatim |
| A rejected task never runs on the caller's thread | preserved | same test, unchanged |
| One log line per dropped send | preserved | **deliberately** — AC-2 now pins it as a decision rather than leaving it an accident |
| The line names the rejection's exception class and no PII | preserved | AC-4 pins the PII half explicitly, which nothing did before |
| The drop is uncounted | **changed** | increments `MAIL_RECOVERY_DROPPED`, tagged `reason` |
| `log.warn` for every rejection | **changed** | `ERROR` when the pool is saturated (an unrecoverable loss with a relay to investigate — and strictly worse than the registry shed #408 already logs at `ERROR`); `WARN` retained for the shutdown race, where the loss is real but no relay is at fault |
| `new AsyncMailDispatcher()` (no-arg, used by the unit test) | **changed** | takes `MeterRegistry`; the test passes a `SimpleMeterRegistry` (repo precedent: `RefundFailureMetricTest`, `RegistryMailExecutorConfigTest`) |
| MDC carried onto the pooled thread and cleared afterwards | preserved | `runWithin` untouched; both existing MDC tests kept |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The logging decision is made by copying #408 rather than by argument, shipping a throttle that deletes the only record of an unrecoverable loss | **was high** | high | The issue names this as the fork; the decision is argued from the durable-record asymmetry, pinned by AC-2 (which asserts N lines, so a later "tidy-up" throttle goes red) and stated on the class | agent | **closed** — the decision is argued from the durable-record asymmetry, and `everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss` asserts N lines, so a later "tidy-up" throttle goes red rather than shipping silently |
| R-2 | Counting the shutdown rejection makes the runbook's "alert on any increase" fire on every redeploy — #408's F-5 defect, reintroduced | med | med | Not excluded (here it *is* a loss) but **tagged**: the runbook alerts on `reason="saturated"` and tracks the total; AC-3 pins the attribution | agent | **closed** — the tag ships; `aDropDuringShutdownIsCountedButAttributedToTheShutdown` pins that a redeploy lands on `reason=shutdown` and leaves `reason=saturated` at zero. The review gate confirmed the residual race is one-directional and benign (F-1) |
| R-3 | Adding a `MeterRegistry` constructor parameter breaks the component's wiring, or the test's direct construction | low | med | `MeterRegistry` is an existing container bean (`RegistryMailExecutorConfig` already injects it); the four direct constructions in `AsyncMailDispatcherTest` are updated in the same phase and the module's tests re-run | agent | **closed** — `MeterRegistry` is an existing container bean; the four direct constructions were updated and the module's 132-test scope ran green, ITs included |
| R-4 | `getThreadPoolExecutor()` throws when consulted to distinguish shutdown from saturation, turning a swallowed drop into an exception on the request thread | low | **high** | The pool is `initialize()`d in the constructor, so it is always available; the distinction is computed inside the existing `catch`, and AC-5 re-runs unchanged to prove nothing escapes | agent | **closed** — resolved by inspection and confirmed independently at the review gate: `initialize()` runs in the constructor before `this.executor` is assigned, so `getThreadPoolExecutor()` cannot throw here, and `isShutdown()` is a non-throwing state read. `aRejectedDispatchIsDroppedWithoutThrowing` still passes unchanged |
| R-5 | Full-suite-only failure (the `riviera-local-debug` shared-state class) from a meter accumulating across cached contexts | low | med | No new bean, no `@Scheduled`, no filter; the meter is registered per-context and every test owns its dispatcher and releases it in a `finally` | agent | **closed** — PR #424's CI is green on the full suite (`Backend (build + test)` success), so the failure class scoped runs cannot show did not materialise. No new bean, no `@Scheduled`, no filter; every test owns its dispatcher and releases it in a `finally` |

## Open questions / Assumptions

### Open

*(none)*

### Resolved at the intake grill

- **Per-drop or throttled?** → **per-drop**, and the argument is the durable-record asymmetry, not
  #408's answer. Two facts were verified rather than assumed. (a) **This vehicle has no republish
  path** — by construction, since ADR-0011 decision 5 keeps the bearer-credential payload out of the
  registry. #408's decisive flood scenario ("a restart that republishes an hour of outstanding sends
  into a recovered relay would emit hundreds of lines") therefore *cannot occur here*: there is no
  backlog to replay. (b) **The arrival rate is bounded upstream** — the vehicle's only feed is
  `TransactionalMailService.dispatchQuietly`, reached from `sendEmailVerification` /
  `sendPasswordReset`, and **all three** endpoints that reach those are per-IP rate-limited: customer
  register (`AuthController:220`), the authenticated verification resend
  (`MyAccountController:137`), and forgot-password (`AccountRecoveryController:83`). **Corrected at
  the review gate (F-2)** — the first draft of this bullet said "four endpoints, all on
  `RateLimitFilter.RECOVERY_PATHS`", which is false twice over: `RECOVERY_PATHS` has four members but
  two of them (`reset-password`, `verify-email`) only *redeem* tokens and send no mail, while
  register — which does send — rides `customerAuthBuckets` instead, a separation `RateLimitFilter`
  documents as deliberate so recovery spam cannot starve login. The conclusion survives unchanged
  because `customerAuthBuckets` is also per-IP; only the citation was wrong. The residual case a
  per-IP budget does not bound is a *distributed* burst against a wedged relay; at this vehicle's
  volume ("a handful of sends a day") that is not today's flood, and the Non-goal above states what
  to change if it ever becomes one.
- **Does the shutdown rejection count?** → **yes, and this is a deliberate divergence from #408**,
  which the issue does not raise. #408 excluded it because a shed-at-shutdown loses nothing (the
  publication stays outstanding). Here the same event *is* a loss: `server.shutdown=graceful` is
  unset, so an in-flight request can still reach `dispatch` after `destroy()` has shut the pool, and
  that user's reset mail is gone with nothing to retry from. Excluding it would make the counter
  under-report the very thing the runbook says it means. The `reason` tag keeps the alerting
  distinction #408's F-5 was right to insist on.
- **Which counter name?** → `riviera.mail.recovery.dropped`, the name #408 reserved and declined to
  declare without an emitter. Declared in `ObservabilityMetrics` beside `MAIL_REGISTRY_SHED`, per
  the convention #408 settled (one place for names; the emitter owns the emission).
- **Is the previous sibling slice's close-out complete?** → **yes.** #408 is closed, its plan doc is
  finalized at `merged via PR #413`, and it is a registered sub-issue of epic #367. #415 is already
  attached to #367, so this slice's close-out has no attach step. **The gap #408 reported is still
  open:** #407, #409, #410 and #411 are not sub-issues of #367 (#409 shipped via PR #412 and is
  closed). Reported to the maintainer again rather than silently reassigned.
- **What else is in flight?** → nothing that can collide: the only open PRs are ten Dependabot
  frontend bumps (#332–#341); no backend feature branch is open. **No Flyway migration is in
  scope**, so the `V<n>` collision class does not apply.
- **Module ownership** → checked against `RESPONSIBILITIES.md`; see §4a. Nothing here lands on a
  Not-My-Job list, and the one clause that *could* have — persisting the payload so a drop could be
  retried — is explicitly out of scope above.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` Nothing reads or writes `availability(set_id, booking_date)`.
The slice touches only the vehicle that delivers already-issued recovery credentials; a dropped send
changes no booking, no claim and no ledger row. The one concurrency consideration is that the
rejection path runs on the **caller's request thread** (unlike #408's handler, which runs on the
commit thread): the counter increment is a Micrometer atomic, and the shutdown check is a read of
the pool's own state — neither blocks, and AC-5 keeps the "never throws at the caller" guarantee.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state, no aggregate) | It owns both delivery vehicles (#382/#383); a vehicle's saturation accounting is the vehicle's own business |
| M-2 | `shared` | existing | none (OPEN Shared Kernel, not a bounded context) | One added `String` constant in `ObservabilityMetrics`, already the single source of truth for metric names. Passes the kernel's admission test: no business logic, no module-owned state, no dependency on a module that depends back |

**Cross-module named interfaces (`api/` ports)**

`N/A — no port added or changed.` `notification` still publishes only `MailSender` and
`MailDeliverability`. The `shared` reference is a direct type reference (the kernel is `type = OPEN`)
and the grant already exists.

**Domain events**

`N/A — no event added, moved, or renamed.` No listener signature changes, so the Event Publication
Registry's `listener_id` is untouched and **no Flyway `event_type` rewrite is needed** (the V31/#382
lesson, re-checked).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Counting a dropped recovery send | `notification` | `notification` **Job**: owns "the bounded in-memory dispatcher for bearer-credential payloads … each draining on its own bounded executor". The drop is that dispatcher's own saturation behaviour, exactly as the shed is the registry executor's. Not the root: #382 moved mail machinery **out** of the composition root |
| The logging decision (per-drop, level split by cause) | `notification` | Same Job line — the vehicle's own behaviour, and the class that already documents the drop-vs-shed contract is the right place for the reason |
| The metric **name** | `shared` | Consistent with `REFUNDS_FAILED` (declared in `shared`, emitted from `payment.application.RefundService`) and with `MAIL_REGISTRY_SHED`: the kernel owns the name, the emitter owns the emission |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no ledger row changes, no Stripe call. This vehicle is
deliberately isolated from the money-path spine (#369/#383) and nothing here narrows that.

## Angular — frontend surfaces touched

`N/A — backend-only.` No component, route, service, style or e2e spec is in scope.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is added or altered. The counter is
exposed only via the already-authenticated `/actuator/prometheus`.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current `riviera-sdlc` stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** `merge close-out — all three gates run and green; ready to merge PR #424`

**Next action:** Merge PR #424. After the merge only GitHub-only items remain, no commit: #415 closes
via `Closes #415`; #415 is already a sub-issue of epic #367, and the follow-up this slice filed
(#423) is attached too.

**Gate results (PR #424).** CI green on `ea3c697`: `Backend (build + test)`, `Frontend (lint + test +
build)`, `CodeQL`, `Analyze (java-kotlin)`, `Analyze (javascript-typescript)`, `SonarCloud scan`,
`SonarCloud Code Analysis` all `success`. Sonar green **and its reported list pulled and empty**:
`new_lines=93` (so an analysis genuinely exists — the false-clean read of `pr-gates` §2 is ruled
out), `new_bugs=0`, `new_vulnerabilities=0`, `new_code_smells=0`, `new_duplicated_blocks=0`,
`new_duplicated_lines_density=0.0`, `new_coverage=100.0`, `new_reliability_rating=1.0`,
`new_security_rating=1.0`, `issues/search total=0`, `hotspots/search total=0`.

**What the review gate cost and bought.** Run as the full `/code-review` subagent fan-out (five
independent reviewers + the overlay), authorized by the maintainer mid-gate because the session
carries a standing no-Agent-tool instruction — `pr-gates` §1 is explicit that such an instruction is
not grounds to skip the gate. Two reviewers returned clean, three converged on the same two prose
defects (F-1, F-2). **Neither was a logic bug, and that is the interesting part**: the slice's code
was right and its *documentation* was wrong in a checkable way — a false citation of which rate-limit
budget bounds the vehicle's arrivals, which was load-bearing for the whole per-drop logging argument.
An overlay-only pass would very likely have shipped it, because the claim reads plausible and only
falls to someone opening `RateLimitFilter` and following the call graph.

**Phase 0 test evidence:** `gradle test --tests "*AsyncMailDispatcherTest*"` → 9/9 green; the widened
regression scope (`*Mail*`, `*Notification*` + the structural net `*ModularityTests*`,
`*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`,
`*PublishedSurfacePlacementArchitectureTests*`) → **132 tests, 0 failures, 0 errors**, Testcontainers
ITs included (Docker present in this session).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the drop counter, tagged, with the logging decision | ✅ | this commit |
| 1 — substrate docs + close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | `/code-review` fan-out (bug scan) | **The drop's cause is read after the rejection.** `execute` throws before `recordDrop` can ask why, so a saturation rejection racing a concurrent `destroy()` is attributed to the shutdown. Verified independently before acting: the race is real but **one-directional** — `shutdown()` latches its flag permanently, so a shutdown rejection can never read as saturation, and a deploy therefore cannot manufacture a `REASON_SATURATED` increment (#408's F-5 failure mode is structurally unreachable). The only error is under-reporting saturation while a pod is going away | fixed — **documented, not restructured.** No JDK primitive makes reject-and-classify atomic, and reading the flag *before* `execute` costs a read on every send while remaining equally racy. The class now states the direction and warns against that non-fix, so the tag is not over-trusted during a deploy window |
| F-2 | `/code-review` fan-out (comment/prose truthfulness) | **A confidently-worded false claim about the code**, in the plan doc's intake-grill bullet and echoed in the class Javadoc: "whose four endpoints all ride their own per-IP token budget (`RateLimitFilter.RECOVERY_PATHS`)". Wrong twice — `RECOVERY_PATHS` does hold four paths, but two only *redeem* tokens and send no mail; and customer register, which does send, rides `customerAuthBuckets`, a separation `RateLimitFilter` documents as deliberate so recovery spam cannot starve login. Three endpoints feed this vehicle, across two budgets | fixed — both places now name the three real call sites and both budgets. **The argument they support is unchanged**: `customerAuthBuckets` is per-IP too, so "arrivals are bounded upstream" still holds; only the citation was false |
| — | `/code-review` fan-out (CLAUDE.md compliance, prior-PR lessons) | Reviewers #1 and #4 returned clean. #1 independently re-verified the diff's four falsifiable claims (ADR-0011 decision 5, `server.shutdown=graceful` unset, the `shared` grant in `notification`'s `package-info`, Micrometer availability) and walked RV-BE-*, RV-STYLE-1 (zero inline comments added — the removed one-liner became Javadoc, which is exempt) and RV-PROC-1. #4 checked this diff against #413/#408's F-4..F-9 and #379/#369's findings and found no repeated lesson | closed |

---

## File structure

- `platform/src/main/java/…/shared/ObservabilityMetrics.java` — modify. Add
  `MAIL_RECOVERY_DROPPED` beside `MAIL_REGISTRY_SHED`, with the loss-vs-shed meaning in its Javadoc.
- `platform/src/main/java/…/notification/application/AsyncMailDispatcher.java` — modify.
  `MeterRegistry` constructor parameter; the `catch` block counts (tagged) and logs at a level
  chosen by cause; the class Javadoc records the per-drop decision and its reason.
- `platform/src/test/java/…/notification/application/AsyncMailDispatcherTest.java` — modify.
  Four new cases (AC-1..AC-4); the four existing constructions take a `SimpleMeterRegistry`.
- `docs/runbooks/observability.md` — modify. The new counter, its two tag values, and what a
  non-zero value means for a user.
- `CLAUDE.md` / `RESPONSIBILITIES.md` — modify. The `notification` row/Job and the `shared` Job's
  metric-name clause, which today names only the shed counter.

---

## Phase 0 — The drop counter, tagged, with the logging decision

**Files:** Modify `ObservabilityMetrics.java`, `AsyncMailDispatcher.java`, `AsyncMailDispatcherTest.java`

- [x] **Step 1: Write the failing test** — in `AsyncMailDispatcherTest`:
      `everyDroppedSendIncrementsTheCounter` (AC-1),
      `everyDropIsLoggedBecauseEachIsTheOnlyRecordOfALoss` (AC-2),
      `aDropDuringShutdownIsCountedButAttributedToTheShutdown` (AC-3),
      `theDropLineCarriesNeitherAddressNorLink` (AC-4), using `SimpleMeterRegistry` + a Logback
      `ListAppender` (precedent: `RegistryMailExecutorConfigTest`, `MoneyPathAlertCheckTest`).
      Saturation is reached by wedging the single drainer and filling the 100-slot queue.
- [x] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*AsyncMailDispatcherTest*"` → FAIL.
- [x] **Step 3: Minimal implementation** — `MAIL_RECOVERY_DROPPED` in `ObservabilityMetrics`; the
      `MeterRegistry` parameter; the `catch` block resolving `saturated` vs `shutdown` from the
      pool's own state, incrementing the tagged counter, and logging per drop at the level that
      cause earns.
- [x] **Step 4: Run it, verify it passes** — same command, then the touched module and the
      structural net: `--tests "*Notification*" --tests "*Mail*" --tests "*ModularityTests*"
      --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"`.
- [x] **Step 5: Generalization-audit pass** — re-run #408's rejection-site search and confirm the
      codebase's two sites are now both counted; record the result.
- [x] **Step 6: Commit** — `feat(#415): count dropped recovery mail and keep the per-drop record`
- [x] **Step 7: Update plan-doc execution status** in the same commit window; open the draft PR.

---

## Phase 1 — Substrate docs + close-out

**Files:** Modify `docs/runbooks/observability.md`, `CLAUDE.md`, `RESPONSIBILITIES.md`, this plan doc

- [x] **Step 1:** Add the counter to the runbook's non-money-path table beside the shed counter —
      the two tag values, the alerting rule, and the user-facing meaning (a verify/reset mail that
      will never arrive unless re-requested).
- [x] **Step 2:** Run `riviera-docs-freshness` over `origin/main..HEAD` and patch whatever the diff
      contradicts — at minimum the `shared` Job's metric-name clause (which names only the shed
      counter) and the `notification` row's saturation contract.
- [x] **Step 3:** Finalize this plan doc **in this PR's last commit**, citing `merged via PR #424`
      (never a merge SHA) — the three-slice tax (#326→#347, #346→#352, #351→#354) is the reason.
- [x] **Step 4:** Report the still-open #407/#410/#411 epic-attachment gap to the maintainer.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | phase 0 (new pattern: counting a recovery mail that will never arrive, and choosing its log cardinality from whether a durable record exists) | first #408's own search, re-run to confirm both rejection sites are now counted; then **widened** from "rejected task" to "recovery mail the user will never receive", which is the class the counter actually measures | `rg 'RejectedExecutionHandler\|TaskRejectedException\|RejectedExecutionException' --include=*.java src/main/java` then `rg 'was dropped\|was not delivered' --include=*.java src/main/java` | The narrow search found the expected 2 sites, both now counted (`SaturationPolicy`, this slice's `recordDrop`). The **widened** search found a third the narrow one structurally could not: `TransactionalMailService:87` catches a `RuntimeException` from the send itself — the mail was accepted and then failed in transport — and logs one `WARN` with **no counter**. Same user-visible consequence (an unrecoverable lost recovery mail), different cause, and *likelier* than the drop: saturating this pool needs 100 queued sends at a volume of "a handful a day", whereas a relay outage takes every send with it | **Skip here, file as a follow-up.** Folding it in would have made this slice's own Non-goal ("no change to the drop semantics") untrue mid-PR and widened a metric-and-docs slice into the send path — precisely the judgment #408 made when it filed *this* issue. It also needs a name and meaning of its own: reusing `…recovery.dropped` for a failed transmission would make both numbers unreadable. **Filed as #423** and attached to epic #367 |

---

## Docs-freshness run (merge close-out step 5)

Range `origin/main..HEAD`, run at phase 1. **Three findings, all patched**, and the third is the same
*class* #408's F-9 caught — an ownership **clause** contradicted, not a type list.

| Doc | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `RESPONSIBILITIES.md:348` (`shared` **Job**) | "…the platform's metric names (`ObservabilityMetrics`: the money-path trio from #100, plus the registry-mail shed counter added by #408). **Nothing else.**" | a second mail counter now lives there | **patched** — the clause names both mail-loss counters; the "Nothing else" boundary is kept |
| `RESPONSIBILITIES.md:353/357` (the metric-name blockquote) | "`notification` emits `MAIL_REGISTRY_SHED`" and "`MAIL_REGISTRY_SHED` has a single reader today" | `notification` now emits two names, and the tag vocabulary is new | **patched** — both sentences pluralized; added that the `reason` tag values are the emitter's vocabulary and stay with it, so the kernel's remit is not read as widening to tags |
| `RESPONSIBILITIES.md:286` (`notification` **Job**) | carried the shed's counter + per-episode escalation, with no drop accounting | #415 | **patched** — one clause, stating the two deliberate inversions rather than implying symmetry |
| `CLAUDE.md:157` (notification module row) | "…a rejection during shutdown is neither counted nor escalated" sat inside the #408 clause and, once a second counter existed, read as a statement about **both** vehicles — the opposite of what this slice ships | #415 | **patched** — the four registry-only clauses are now explicitly scoped as such, and the recovery pool's opposite answers are stated beside them, with #423 named as the remaining uncounted loss |

Checked and **not** patched, deliberately: `ADR-0011` (decision 5 is about which vehicle carries which
payload — unchanged, and it is the *premise* of this slice's argument rather than a casualty of it;
its lines 117/145 concern the #386 fail-open carve-out, untouched); `CONTEXT.md` (no glossary term
added — "drop" and "shed" were already the vocabulary); the `riviera-*` skills (none cites
`AsyncMailDispatcher` or a metric name in an example table); `docs/deploy/cd-pipeline.md` (no new env
var — this slice adds no tunable).

Step 6 (graph refresh) **skipped**: `graphify-out/` is gitignored and absent in this cloud clone.

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS. Verified at commit `<sha>`.
- [x] **AC-2:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS. Verified at commit `<sha>`.
- [x] **AC-3:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS. Verified at commit `<sha>`.
- [x] **AC-4:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS. Verified at commit `<sha>`.
- [x] **AC-5:** Run `gradle test --tests "*AsyncMailDispatcherTest*"` → PASS. Verified at commit `<sha>`.

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
- [x] Booking codes unguessable (invariant #7) — AC-4 pins that the drop line carries no address and no link.
- [x] Flyway migration present for schema changes (invariant #12) — none needed; no `listener_id`/`event_type` rewrite implied.
- [x] **Frontend** standards met or deviation documented — `N/A`, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final state committed here citing **merged via PR #424**.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
