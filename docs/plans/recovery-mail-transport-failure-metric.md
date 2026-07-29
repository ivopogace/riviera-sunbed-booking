# Recovery-mail transport failure — the third silent loss site Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recovery mail (verification / password-reset) that is *accepted* by the dispatcher and
then never delivered increments an alertable, cause-attributed counter instead of leaving a single
`WARN` line as the entire record — and the registry vehicle's deliberate lack of an equivalent is
written down rather than implied.

**Architecture:** One new metric name, `riviera.mail.recovery.failed`, declared in
`shared/ObservabilityMetrics` beside `MAIL_REGISTRY_SHED` and `MAIL_RECOVERY_DROPPED` (the
convention #408 settled and #415 followed: one place for names, the emitter owns the emission).
The emitter is `TransactionalMailService` — the send chokepoint, which is where the swallowing
catch already lives. The single significant decision: the counter carries **two** tags, `kind`
(`verification` / `password-reset`, already in hand at the call site) **and** `reason`
(`transport` / `suppression-lookup`), because today's one catch swallows two operationally
different losses — a broken relay and a structurally broken suppression read (#386) — and a
runbook cannot say "this counter means the relay is broken right now" if a revoked DB grant
raises the same series. Splitting the catch to attribute the cause is the whole code change;
delivery semantics are untouched.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue #423 (parent epic #367; siblings #408 → #415 → this).

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake gate — confirmed #415 closed and
no open-PR file overlap), `riviera-plan-doc` (this template), `riviera-modulith` (confirmed the
emitter belongs in `notification/application`, not `shared`: `shared` holds the *name*, the module
owns the *emission*; `notification` already grants `shared`), `riviera-java-conventions` (§6a name
the tag literals instead of inlining `"verification"`; §6 catch the narrowest type and never
widen the swallow; §6c one-line comments, long prose to Javadoc), `riviera-local-debug` (scoped
`gradle --no-daemon` runs; CI owns the full suite). No `postgres` (no SQL), no frontend skills
(backend-only), no `riviera-stripe-payments` (no money).

**Branch:** `claude/sdlc-423-kxuuka` — the cloud session's designated branch, standing in for
`feature/recovery-mail-transport-failure-metric` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a recovery send whose transport throws, when the dispatched task runs, then
      `riviera.mail.recovery.failed{kind="password-reset", reason="transport"}` increments by one and
      the task still completes normally (D-8 — the failure may not reach the caller).
      *Pinned by:* `TransactionalMailServiceTest.aTransportFailureIsCountedAndStillSwallowed`
- [ ] **AC-2:** Given a failing verification send, when the dispatched task runs, then the increment
      carries `kind="verification"` — the two mail kinds are distinguishable in one series.
      *Pinned by:* `TransactionalMailServiceTest.theFailureCounterCarriesTheMailKind`
- [ ] **AC-3:** Given a suppression lookup that fails **non-transiently** (the #386 fail-open does not
      apply, so the mail is dropped), when the dispatched task runs, then the counter increments with
      `reason="suppression-lookup"` and **not** `reason="transport"`, and the transport is never called.
      *Pinned by:* `TransactionalMailServiceTest.aBrokenSuppressionLookupIsCountedAsItsOwnCause`
- [ ] **AC-4:** Given a suppression lookup that fails **transiently**, when the dispatched task runs,
      then the mail is sent (the #386 carve-out is untouched) and **no** failure counter increments —
      nothing was lost. *Pinned by:*
      `TransactionalMailServiceTest.aTransientSuppressionFailureIsNotAFailedMail`
- [ ] **AC-5:** Given a suppressed address, when the dispatched task runs, then the send is skipped and
      **no** failure counter increments — a withheld mail is a policy outcome, not a loss.
      *Pinned by:* `TransactionalMailServiceTest.aSuppressedSkipIsNotCountedAsAFailure`
- [ ] **AC-6:** Given a booking-confirmation send whose transport throws, when it runs, then the
      exception still propagates (keeping the publication outstanding, #371) and **no**
      `riviera.mail.recovery.failed` series exists — the registry vehicle is accounted for by
      `riviera.outbox.pending`, not here. *Pinned by:*
      `TransactionalMailServiceTest.theRegistryVehicleIsAccountedForByTheOutboxNotThisCounter`
- [ ] **AC-7:** Given any of the failure paths above, when the line is logged, then it carries neither
      the address nor the link (invariant #7) — only the mail kind and the exception's simple name.
      *Pinned by:* `TransactionalMailServiceTest.neitherFailureLineCarriesTheAddressOrTheLink`
- [ ] **AC-8:** The name is declared in `ObservabilityMetrics` (not inlined at the emitter) and
      `docs/runbooks/observability.md` documents it beside the other two mail counters, stating which
      one to read first during a relay outage and why the registry vehicle has no twin.
      *Verified by:* inspection at the AC-verification step (`grep` commands recorded there) — a docs
      AC, deliberately not test-pinned.

## Non-goals

- **No change to delivery semantics.** The catch still swallows, the send stays best-effort and
  off the request thread (#369), the #386 fail-open-on-*transient*-suppression-lookup carve-out is
  untouched, and no response status or latency changes (D-8).
- **No log-level change.** The failure lines stay `WARN`. #415 escalates `reason="saturated"` to
  `ERROR` because saturation is rare and always actionable; a transport failure is the opposite —
  during the outage this counter exists to measure, *every* send fails, so escalating each one
  would flood `ERROR` exactly when it is being read. The runbook's standing rule applies: alert on
  the counter, read the log for detail.
- **No counter for the registry vehicle.** Settled in writing instead (AC-6, AC-8).
- **No new alert wiring.** `MoneyPathAlertCheck` still reads exactly its three money-path signals;
  this is not one, same as its two siblings.
- **No throttling or aggregation of the existing per-drop / per-failure lines.**
- **Not the `BookingConfirmationMailListener` skip paths** (missing booking / set / contact). Those
  are a *data* gap on the registry vehicle, not a transport loss; see the Generalization-audit log
  for the decision and its follow-up.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `dispatchQuietly` swallows every `RuntimeException` from the dispatched task | preserved | The task still never throws; the single catch becomes two catches around the same two operations, both still swallowing |
| One `WARN` per lost recovery mail, naming the kind + exception class, no address/link | preserved (split) | Still one line per loss at `WARN`; the suppression-lookup cause now gets its own wording so the two causes are readable apart. Neither line gains PII (AC-7) |
| A *transient* suppression failure sends the mail rather than dropping it (#386) | preserved | `isSuppressedOrFailOpen` is unchanged; it still returns `false` on `TransientDataAccessException` before either catch sees anything |
| `sendBookingConfirmation` propagates transport failures | preserved | Untouched — asserted by AC-6, which also pins the *absence* of a counter there |
| A suppressed address logs `INFO` and returns | preserved | Untouched; AC-5 pins that it counts nothing |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Splitting one catch into two accidentally lets an exception escape onto the pooled thread — the very thing the outer net exists to prevent | low | high | Both new catches are `RuntimeException` (unchanged breadth) and cover the same two operations with nothing between them; AC-1/AC-3 assert the dispatched task completes normally on both paths | agent | open |
| R-2 | The counter is read as "the relay is broken" while a revoked DB grant is the real cause, sending on-call to the wrong system | med | med | The `reason` tag exists precisely for this; the runbook names `transport` as the relay signal and `suppression-lookup` as a database/grant signal | agent | open |
| R-3 | Tag cardinality creep — two tag dimensions on one series | low | low | Bounded and closed: 2 kinds × 2 reasons = 4 series, every value a compile-time constant, none derived from input | agent | open |
| R-4 | A future third mail kind on this vehicle (operator-approval, #375) silently widens the `kind` vocabulary | low | low | The kind strings become named constants on the service, so a new kind is a visible edit next to them, and the runbook lists the vocabulary | agent | open |
| R-5 | Module-boundary slip: emitting from `shared` instead of `notification` | low | med | `shared` holds the name only (invariant #11, the #408/#415 convention); `ModularityTests` + `PackageShapeArchitectureTests` in the phase-0 test scope | agent | open |
| R-6 | Merge collision with the other in-flight slice | low | low | Checked at the intake gate: open PR #425 (#414) touches `RateLimitProperties`, `CustomerRetentionProperties`, `application.properties` and `data-erasure.md` — **no overlap**. No Flyway migration in this slice, so no `V<n>` claim to contend | agent | open |

## Open questions / Assumptions

- **Assumption:** counting the non-transient suppression-lookup drop under *this* counter (rather
  than leaving it uncounted or minting a third name) is the right call — it is the same
  consequence (a recovery mail that will never arrive) reached one step earlier, and leaving it
  out would create a fourth silent loss site in the slice that closes the third. — *Owner:* agent ·
  *Resolves by:* phase 0 (recorded as decided; revisit only if review disagrees)
- **Assumption:** `WARN` remains the right level for both lines (see Non-goals). — *Owner:* agent ·
  *Resolves by:* review gate

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `availability(set_id, booking_date)` write path, no booking
lifecycle transition, and no new DB access of any kind: the change is a Micrometer counter and two
log lines on a path that already runs off the request thread.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none) | It owns transactional-mail **delivery** and therefore the accounting for a delivery that failed; `TransactionalMailService` is the module's send chokepoint and already holds the swallowing catch |
| M-2 | `shared` | existing | (none — OPEN kernel) | Holds the metric **name** only, as `MAIL_REGISTRY_SHED` and `MAIL_RECOVERY_DROPPED` already do. A constant is inlined at compile time, so this adds no runtime dependency (invariant #11); `notification` already grants `shared` |

**Cross-module named interfaces (`api/` ports)**

N/A — no port added, changed, or consumed. `notification::api` (`MailSender`, `MailDeliverability`)
is untouched, as is the inbound `booking.spi.ConfirmationMailDelivery` implementation.

**Domain events (id-based payloads, invariant #11)**

N/A — no event published, consumed, moved, or renamed; no `event_type` Flyway rewrite.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Counting a recovery mail lost after the dispatcher accepted it | `notification` | Its **Job**: "Own transactional-mail **delivery** … the two delivery vehicles"; the recovery dispatcher's accounting (`MAIL_RECOVERY_DROPPED`) is already explicitly its. Not the **edge**'s: the edge's job stops at "deciding **when** to send" (`notification` Not-My-Job list, RV-BE-11) — a send that failed in transport is a delivery fact |
| Declaring the metric's **name** | `shared` | The kernel's stated remit is "metric *names*, not the money path" (#408); admission requires no business logic, no module-owned state, no back-dependency — a `String` constant qualifies. The **emission** stays with the emitter, per the same convention |
| Stating why the registry vehicle gets no equivalent counter | `notification` (Javadoc) + the runbook | The asymmetry is a property of the two vehicles this module owns; `riviera.outbox.pending` (owned by the platform's observability config) already covers the registry side |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves, no ledger entry, no Stripe call. The one adjacency is
that this slice must *not* disturb the money path: the emission stays on the recovery dispatcher's
own pool, never Boot's shared `applicationTaskExecutor` (#383), and `MoneyPathAlertCheck` continues
to read exactly its three signals.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or response shape is touched;
`/actuator/prometheus` gains one series and stays authenticated (#75 lockdown preserved).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `plan — committing the plan doc, opening the draft PR`

**Next action:** Commit this doc, push the branch, open the draft PR (CI fires on
`pull_request` only, #417), then start phase 1 test-first.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ⏳ | |
| 1 — The counter and its cause split | | |
| 2 — Runbook + substrate docs | | |
| 3 — Gates (CI, review, Sonar) + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — declare
  `MAIL_RECOVERY_FAILED`, with the Javadoc that gives it meaning (what it measures, why it is not
  `MAIL_RECOVERY_DROPPED`, why the registry vehicle has no twin).
- `platform/src/main/java/ai/riviera/platform/notification/application/TransactionalMailService.java` —
  emit it: split `dispatchQuietly`'s single catch into the suppression-lookup catch and the
  transport catch, name the `kind` and `reason` tag vocabularies as constants, keep both swallowing.
- `platform/src/test/java/ai/riviera/platform/notification/application/TransactionalMailServiceTest.java` —
  the ACs above; the service now takes a `SimpleMeterRegistry`.
- `docs/runbooks/observability.md` — the counter's entry beside the other two mail counters;
  replace the "tracked as #423 / today it increments nothing" note with the real signal, and say
  which of the three to read first during a relay outage.
- `RESPONSIBILITIES.md` / `CLAUDE.md` — the `notification` row's third-loss-site clause (merge
  close-out step 5, `riviera-docs-freshness`).

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/recovery-mail-transport-failure-metric.md`

- [ ] **Step 1: Commit the plan doc** — `git commit -m "docs(#423): plan the recovery-mail transport-failure metric (#423)"`
- [ ] **Step 2: Push and open the draft PR** — CI fires on `pull_request` only (#417), so the draft
      is what makes every later push gated.

---

## Phase 1 — The counter and its cause split

**Files:** Modify `ObservabilityMetrics.java` · Modify `TransactionalMailService.java:75-91` ·
Test `TransactionalMailServiceTest.java`

- [ ] **Step 1: Write the failing tests** — AC-1 … AC-7 (the service gains a `MeterRegistry`
      constructor parameter; the spec reads counters off a `SimpleMeterRegistry`, exactly as
      `AsyncMailDispatcherTest` does).

- [ ] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*TransactionalMailServiceTest*"` → FAIL
      (no such constructor / no such metric name).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** — declare `MAIL_RECOVERY_FAILED`; give the service a
      `MeterRegistry`; split the catch:

```java
private void dispatchQuietly(String kind, String toEmail, Runnable send) {
    dispatcher.dispatch(() -> {
        boolean suppressed;
        try {
            suppressed = isSuppressedOrFailOpen(kind, toEmail);
        }
        catch (RuntimeException e) {
            recordLoss(kind, REASON_SUPPRESSION_LOOKUP, e);
            return;
        }
        if (suppressed) {
            log.info("Recovery {} mail skipped: the address is suppressed", kind);
            return;
        }
        try {
            send.run();
        }
        catch (RuntimeException e) {
            recordLoss(kind, REASON_TRANSPORT, e);
        }
    });
}
```

- [ ] **Step 4: Run them, verify they pass** — the same scoped command → PASS.

> Scope (end-of-phase regression): broaden to the touched module's package plus the structural net
> (`*ModularityTests*`, `*PackageShapeArchitectureTests*`, `*JdbcOnlyArchitectureTests*`).

- [ ] **Step 5: Generalization-audit pass** — the audit that produced this issue, re-run one level
      down: which *other* sites lose a mail behind a swallow? Record below.

- [ ] **Step 6: Commit** — `git commit -m "feat(#423): count a recovery mail lost in transport, attributed by cause (#423)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Runbook + substrate docs

**Files:** Modify `docs/runbooks/observability.md` · Modify `RESPONSIBILITIES.md` · Modify `CLAUDE.md`

- [ ] **Step 1:** Replace the runbook's `#423` placeholder note with the counter's own entry: what
      one increment means for a user, the `reason` vocabulary, and the read-first order during a
      relay outage (`riviera_mail_recovery_failed_total{reason="transport"}` first — it is the one
      that rises on the first failed send; `riviera_outbox_pending` next for the registry side;
      `riviera_mail_recovery_dropped_total` last, since saturating that pool needs 100 queued sends).
- [ ] **Step 2:** State the registry asymmetry in both places a reader will look — the runbook and
      `TransactionalMailService`'s Javadoc (AC-6/AC-8).
- [ ] **Step 3:** Update the `notification` clause in `CLAUDE.md` and `RESPONSIBILITIES.md` that
      currently ends "…is still uncounted, tracked as #423".
- [ ] **Step 4: Commit** — `git commit -m "docs(#423): document the transport-failure counter and the registry asymmetry (#423)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| _(phase 1)_ | | | | | |


---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-7:** `gradle --no-daemon --console=plain test --tests "*TransactionalMailServiceTest*"`
      → all green. Verified at commit `<sha>`.
- [ ] **AC-8:** `grep -n "MAIL_RECOVERY_FAILED" platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java`
      → declared with its Javadoc; `grep -n "riviera_mail_recovery_failed_total" docs/runbooks/observability.md`
      → the counter's own section, the read-first order, and the registry-asymmetry paragraph.
      Verified at commit `<sha>`.
- [ ] **Structural net:** `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
      --tests "*JdbcOnlyArchitectureTests*"` → PASS (no boundary moved, asserted not assumed).
- [ ] **Full suite:** green on the PR's CI run (the half scoped runs cannot prove —
      `riviera-local-debug`'s full-suite-only failure class).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-8 is a docs AC, verified by the
      recorded `grep`s).
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled — justified `N/A`, no availability write path (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event
      payload changed (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`), and the money path is explicitly protected — the
      emission stays off `applicationTaskExecutor` (#383).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — no time arithmetic in scope.
- [ ] Booking codes unguessable (invariant #7) — and the new log lines carry neither address nor
      link, pinned by AC-7.
- [ ] Flyway migration present for schema changes (invariant #12) — `N/A`, no schema change.
- [ ] **Frontend** standards — `N/A`, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — this doc's final state is committed here, citing
      `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` via the `references/pr-gates.md` §1
      invocation ladder, plus `riviera-review-overlay`.
