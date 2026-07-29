# Abandoned booking-confirmation mail — the loss the outbox cannot see Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A booking-confirmation mail the registry listener *abandons* for a missing booking, set or
contact increments an alertable, cause-attributed counter and escalates to `ERROR` — instead of
returning normally behind a `WARN`, completing its event publication, and moving no gauge at all.
The runbook stops implying `riviera_outbox_pending` covers the registry vehicle's every loss.

**Architecture:** One new metric name, `riviera.mail.confirmation.abandoned`, declared in
`shared/ObservabilityMetrics` beside the three that precede it (the convention #408 settled and
#415/#423 followed: one place for names, the emitter owns the emission, a name ships with the
emitter that gives it meaning). The emitter is `BookingConfirmationMailListener` — the abandoning
site itself, and `adapter/in` already emits a metric on this vehicle (`RegistryMailExecutorConfig`'s
shed counter), so the placement has precedent. A `reason` tag (`no-booking` / `no-set` /
`no-contact`) names which fact was missing, because the three implicate three different modules.
The three early returns keep their semantics exactly — return normally, publication completed — and
gain a counter and an escalated line. Two decisions carry the slice, both recorded below: the log
level (**`ERROR`, per occurrence, unthrottled**) and its justification (**all three are unreachable
through any application path**, so each is simultaneously a data-integrity defect and a paying
tourist with no arrival code).

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration, no SQL in scope.

**Source of intent:** GitHub issue #428 (parent epic #367; siblings #408 → #415 → #423 → this).

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake gate — confirmed #423 closed and
registered under epic #367, and that open PR #429 touches none of this slice's files),
`riviera-plan-doc` (this template), `riviera-modulith` (confirmed the emitter belongs in
`notification/adapter/in` beside the listener — `shared` holds the *name*, the module owns the
*emission*; `notification` already grants `shared`, so no `allowedDependencies` change),
`riviera-java-conventions` (§6a name the tag literals rather than inlining `"no-booking"`; §6c one
line or none inline, the long argument to Javadoc; §10 parameterized logging with no code and no
PII), `riviera-local-debug` (scoped `gradle --no-daemon` runs; CI owns the full suite),
`riviera-review-overlay` (the RV-BE/RV-STYLE/RV-PROC bank layered onto `/code-review` at the review
gate), `riviera-docs-freshness` (pre-merge audit, since the slice falsifies a sentence `CLAUDE.md`,
`RESPONSIBILITIES.md` and the runbook each state). No `postgres` (no SQL), no frontend skills
(backend-only), no `riviera-stripe-payments` (no money).

**Branch:** `claude/sdlc-428-p5tav9` — the cloud session's designated branch, standing in for
`feature/abandoned-confirmation-mail-metric` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a `BookingConfirmed` whose booking row does not resolve, when the listener
      runs, then `riviera.mail.confirmation.abandoned{reason="no-booking"}` increments by one, no
      mail is sent, and the method returns normally (the publication still completes).
      *Pinned by:* `BookingConfirmationMailListenerTest.aMissingBookingIsCountedAndAbandoned`
- [x] **AC-2:** Given a booking that resolves but a set that does not, when the listener runs, then
      the increment carries `reason="no-set"` and the contact is never read — the three reasons are
      distinguishable in one series.
      *Pinned by:* `BookingConfirmationMailListenerTest.aMissingSetIsCountedUnderItsOwnReason`
- [x] **AC-3:** Given a booking and set that resolve but no contact, when the listener runs, then
      the increment carries `reason="no-contact"` and no mail is sent.
      *Pinned by:* `BookingConfirmationMailListenerTest.aMissingContactIsCountedUnderItsOwnReason`
- [x] **AC-4:** Given all three facts present, when the listener runs, then the confirmation is sent
      and **no** abandoned counter exists — a healthy send must not register as a loss.
      *Pinned by:* `BookingConfirmationMailListenerTest.aCompleteConfirmationCountsNothing`
- [x] **AC-5:** Given any abandoned path, when the line is logged, then it is logged at **`ERROR`**
      (one line per loss, no episode throttle) and carries neither the booking code nor the address
      (invariant #7) — only the ids, the reason, and what it means.
      *Pinned by:* `BookingConfirmationMailListenerTest.everyAbandonedPathLogsAnErrorCarryingNoCredential`
- [x] **AC-6:** Given a transport failure on a *complete* confirmation, when the listener runs, then
      the exception still propagates (the publication stays outstanding, #371) and **no** abandoned
      counter increments — this counter measures the give-up, never the retryable failure.
      *Pinned by:* `BookingConfirmationMailListenerTest.aTransportFailureStillPropagatesAndCountsNothing`
- [x] **AC-7:** The name is declared in `ObservabilityMetrics` (not inlined at the emitter), and
      `docs/runbooks/observability.md` documents it beside the other three mail counters, stating
      plainly that this is the one mail loss `riviera_outbox_pending` **cannot** show and correcting
      the implication left by #423's registry-asymmetry paragraph.
      *Verified by:* inspection at the AC-verification step (`grep` commands recorded there) — a
      docs AC, deliberately not test-pinned.
- [x] **AC-8:** The log-level decision and its reasoning are stated on the listener class, so the
      next reader finds the argument where the code is, not only in a plan doc.
      *Verified by:* inspection at the AC-verification step.

## Non-goals

- **No change to the skip semantics.** The three early returns still return normally, so the
  publication still **completes**; retrying a permanently-missing fact would park a forever-failing
  publication in the outbox, which the listener's Javadoc already argues and which stays true.
  "Give up" and "give up silently" are separable; only the second is in scope.
- **No throw, no dead-letter table, no admin resubmission surface.** The operational lever for
  "completed, but the inbox is empty" remains the admin resend (#380/#405), unchanged.
- **No counter for the registry vehicle's *transport* failure.** #423 settled that in writing and
  the reasoning is untouched: a transport failure throws, so the publication stays outstanding and
  `riviera_outbox_pending` already carries it. This slice covers only the inverse — the loss that
  returns normally.
- **No new alert wiring.** `MoneyPathAlertCheck` still reads exactly its three money-path signals;
  this is not one, same as its three siblings.
- **Not the tombstoned-contact send.** A GDPR-erased or retention-swept guest keeps its row with an
  `erased+<id>@erased.invalid` address, so the listener resolves a contact and mails the reserved
  `.invalid` TLD — a wasted send, not an abandoned one, and a different question (recorded in the
  Generalization-audit log, not fixed here).
- **No change to the `MockMailer`/`SmtpMailer` transports, the suppression path, or either pool.**

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A missing booking / set / contact logs and returns, completing the publication | preserved | Identical control flow; the return is still normal and the publication still completes (AC-1…AC-3) |
| Each of the three logs a distinct `WARN` naming which fact was missing | changed (level) | One line per loss still, now at `ERROR`, and the "which fact" moves into a `reason` tag as well as the line — see the log-level decision under Open questions › Resolved |
| No line carries the booking code or the address (invariant #7) | preserved | Unchanged and now pinned by AC-5, which the old lines had no test for |
| A complete confirmation is sent through the `TransactionalMailService` chokepoint | preserved | Untouched; AC-4 pins that the healthy path counts nothing |
| A transport failure propagates, keeping the publication outstanding (#371) | preserved | Untouched; AC-6 pins that it counts nothing here either |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `ERROR` per loss floods the log during a systemic data fault, the exact failure mode #408's episode throttle exists to prevent | low | med | The three facts are FK-protected and never hard-deleted (see Open questions › Resolved), so a healthy system holds this at **zero** — unlike saturation, which fires once per send during an ordinary burst. If a systemic fault ever does raise it, one line per unrecoverable lost confirmation is the record we would want, since each is a distinct paying tourist and there is no durable copy to reconstruct from (the #415 argument, unchanged) | agent | open |
| R-2 | The counter is read as "the mail system is broken" and sends on-call to the relay, when every increment is a data-integrity fault in `booking` / `venue` / `customer` | med | med | This is precisely what the `reason` tag and the runbook entry exist for: the runbook names this counter a **data-integrity** signal, explicitly *not* a relay signal, and maps each reason to its owning module | agent | open |
| R-3 | Emitting from `adapter/in` is read as a boundary slip | low | low | It is the established shape on this vehicle: `RegistryMailExecutorConfig` (also `adapter/in`) emits `MAIL_REGISTRY_SHED`. `shared` holds the name only; `notification` already grants `shared`, so no `allowedDependencies` change | agent | closed — `ModularityTests`, `PackageShapeArchitectureTests`, `JdbcOnlyArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` and `MailListenerExecutorArchitectureTest` all green |
| R-4 | Adding a `MeterRegistry` constructor parameter breaks the listener's registry `listener_id` (V31, #382), silently orphaning outstanding publications | low | high | The `listener_id` embeds the **class, method name and parameter type** — none of which a constructor parameter touches. `RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated` already pins it, so this is asserted rather than reasoned | agent | closed — the signature `on(BookingConfirmed)` is byte-for-byte unchanged; the IT needs Docker, so the assertion lands on the PR's CI run |
| R-5 | Merge collision with the other in-flight slice | low | low | Checked at the intake gate: open PR #429 (#426) touches `booking/adapter/in/*Properties*` + its own plan doc — **no file overlap**. No Flyway migration in this slice, so no `V<n>` to contend. Both slices may touch `CLAUDE.md`/`RESPONSIBILITIES.md` at close-out; whichever merges second rebases | agent | open |
| R-6 | The new unit test duplicates what `BookingConfirmationMailIT` covers, or needs Docker to run | low | low | The IT covers the *happy* registry path end-to-end and needs Docker; the abandoned paths are pure listener logic with three stubbed ports, so they belong in a fast `adapter/in` unit test (`SimpleMeterRegistry` + Mockito + a logback `ListAppender`, the shape `TransactionalMailServiceTest` established for exactly this) | agent | closed — six specs in a 1s unit test; the IT is untouched |

## Open questions / Assumptions

_None open._

### Resolved

- **Is a missing booking / set / contact ever expectable, or always a bug?** (The issue's stated
  reason for being its own ticket.) **Always a bug** — settled from the schema at the intake gate,
  not by judgment: `booking.set_id REFERENCES set_position(id)` and
  `booking.customer_id REFERENCES customer(id)` are both plain FKs with **no** `ON DELETE CASCADE`,
  so neither a set nor a contact can disappear while the booking that names it exists; the booking
  row itself is never deleted (no `DELETE FROM booking` anywhere in the codebase); and GDPR erasure
  and the retention sweep are **tombstone-in-place `UPDATE`s** (`JdbcAccountErasure`), so an erased
  guest still resolves. None of the three is reachable through any application path.
- **Log level:** **`ERROR`, one line per loss, no episode throttle** — following from the answer
  above. Each increment is simultaneously a referential-integrity fault and a tourist who paid and
  will never receive their arrival code, with nothing to retry from. The volume objection that
  keeps #423's transport failures at `WARN` does not apply in reverse: a relay outage fails *every*
  send while it lasts, whereas this is zero in a healthy system and cannot flood (R-1).
  The throttle argument from #408's shed path likewise does not transfer — an episode there is a
  transient, self-recovering saturation; here every line is a distinct permanent loss, so the #415
  rule applies instead: no durable copy, therefore no line may be traded away.
- **Counter name and tag vocabulary:** `riviera.mail.confirmation.abandoned`, tagged
  `reason=no-booking|no-set|no-contact`. *Abandoned*, not *shed* (deferred, will be republished),
  not *dropped* (a refused dispatch), not *failed* (a transport error) — the four names must stay
  readable apart, and the runbook says so. Three compile-time tag values, so cardinality is closed.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `availability(set_id, booking_date)` write path, no booking
lifecycle transition, and no new DB access of any kind: the change is a Micrometer counter and a
log level on a path that already runs after commit on the registry-mail pool.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none) | It owns transactional-mail **delivery**, and abandoning a confirmation is a delivery outcome. The emitter is the abandoning site itself, `BookingConfirmationMailListener` (`adapter/in`) — the same layer that already emits this vehicle's shed counter |
| M-2 | `shared` | existing | (none — OPEN kernel) | Holds the metric **name** only, as the other three mail counters do. A `String` constant is inlined at compile time, so this adds no runtime dependency (invariant #11); `notification` already grants `shared` |

**Cross-module named interfaces (`api/` ports)**

N/A — no port added, changed, or consumed. The listener's three reads
(`booking.api.BookingNotificationFacts`, `venue.api.SetBookingFacts`, `customer.api.CustomerLookup`)
keep their signatures and their existing least-privilege grants.

**Domain events (id-based payloads, invariant #11)**

N/A — no event published, consumed, moved, or renamed. `BookingConfirmed` is untouched, and the
listener's class / method name / parameter type stay identical, so the registry `listener_id` still
reads as V31 migrated it — no `event_type` Flyway rewrite (R-4).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Counting a confirmation mail abandoned for a missing fact | `notification` | Its **Job**: "own transactional-mail delivery … both delivery vehicles", and the accounting for each vehicle's losses is already explicitly its (`MAIL_REGISTRY_SHED`, `MAIL_RECOVERY_DROPPED`, `MAIL_RECOVERY_FAILED`). Not `booking`'s: `booking` publishes the fact and is deliberately ignorant of whether a mail followed (the #390 edge is inverted for exactly that reason) |
| Declaring the metric's **name** | `shared` | The kernel's stated remit is "metric *names*, not the money path" (#408); admission requires no business logic, no module-owned state, no back-dependency — a `String` constant qualifies |
| Naming *which* fact was missing (`no-booking` / `no-set` / `no-contact`) | `notification` (tag vocabulary) | The reasons point at three other modules, but the vocabulary belongs to the emitter, which is the only place that can tell them apart. The runbook maps each reason to the module to investigate |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves, no ledger entry, no Stripe call. The one adjacency is
that this slice must *not* disturb the money path: the emission stays on the dedicated
`registryMailExecutor` (#383), never Boot's shared `applicationTaskExecutor`, and
`MoneyPathAlertCheck` continues to read exactly its three signals.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or response shape is touched; `/actuator/prometheus`
gains one series and stays authenticated (#75 lockdown preserved).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `phase 2 done — phase 3 (the absorbed payout sibling) next`

**Next action:** Fix the generalization-audit finding **in this PR** rather than as follow-up #431
(maintainer's call, 2026-07-29), then mark PR #430 ready for review and run the Review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `ce0ac30` (PR #430) |
| 1 — The counter, the reason tag, the log level | ✅ | this commit |
| 2 — Runbook + substrate docs | ✅ | this commit |
| 3 — Gates (CI, review, Sonar) + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| _(none yet)_ | | | |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — declare
  `MAIL_CONFIRMATION_ABANDONED`, with the Javadoc that gives it meaning (what it measures, why it
  is none of the other three, and why `riviera.outbox.pending` cannot see it).
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java` —
  emit it: a `MeterRegistry` constructor parameter, named `reason` constants, one `abandon(...)`
  helper behind the three early returns, and the log-level argument on the class Javadoc.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListenerTest.java` —
  new; AC-1 … AC-6.
- `docs/runbooks/observability.md` — the counter's entry beside the other three, and the correction
  to the registry-asymmetry paragraph that currently ends "tracked as **#428**".
- `RESPONSIBILITIES.md` / `CLAUDE.md` — the `notification` and `shared` clauses that today end with
  the gap this slice closes (merge close-out step 5, `riviera-docs-freshness`).

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/abandoned-confirmation-mail-metric.md`

- [x] **Step 1: Commit the plan doc** — `git commit -m "docs(#428): plan the abandoned-confirmation-mail metric (#428)"`
- [x] **Step 2: Push and open the draft PR** — CI fires on `pull_request` only (#417), so the draft
      is what makes every later push gated.

---

## Phase 1 — The counter, the reason tag, the log level

**Files:** Modify `ObservabilityMetrics.java` · Modify `BookingConfirmationMailListener.java:93-118` ·
Create `BookingConfirmationMailListenerTest.java`

- [x] **Step 1: Write the failing tests** — AC-1 … AC-6 (the listener gains a `MeterRegistry`
      constructor parameter; the spec reads counters off a `SimpleMeterRegistry` and asserts the
      level + content of the line through a logback `ListAppender`, exactly as
      `TransactionalMailServiceTest` does).

- [x] **Step 2: Run them, verify they fail** —
      `gradle --no-daemon --console=plain test --tests "*BookingConfirmationMailListenerTest*"` →
      FAIL (no such constructor / no such metric name / still `WARN`).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation** — declare `MAIL_CONFIRMATION_ABANDONED`; give the listener
      a `MeterRegistry`; route the three early returns through one helper:

```java
private void abandon(String reason, BookingConfirmed event) {
    meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED, REASON_TAG, reason).increment();
    log.error("Booking-confirmation mail abandoned ({}) for booking {} on set {} — the fact cannot "
            + "appear later, so the publication completes and nothing retries it: a paying tourist "
            + "has no arrival code by mail", reason, event.bookingId().value(), event.setId().value());
}
```

- [x] **Step 4: Run them, verify they pass** — the same scoped command → PASS.

> Scope (end-of-phase regression): broaden to the touched module's package plus the structural net
> (`*ModularityTests*`, `*PackageShapeArchitectureTests*`, `*JdbcOnlyArchitectureTests*`,
> `*PublishedSurfacePlacementArchitectureTests*`) and `*MailListenerExecutorArchitectureTest*`.

- [x] **Step 5: Generalization-audit pass** — re-run the audit that produced this issue one level
      down: which other listeners abandon work behind a normal return? Record below.

- [x] **Step 6: Commit** — `git commit -m "feat(#428): count an abandoned booking-confirmation mail, attributed by missing fact (#428)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Runbook + substrate docs

**Files:** Modify `docs/runbooks/observability.md` · Modify `RESPONSIBILITIES.md` · Modify `CLAUDE.md`

- [x] **Step 1:** Add the counter's own entry beside the other three: what one increment means for a
      user, the `reason` vocabulary mapped to the module to investigate, and that it is a
      **data-integrity** signal rather than a relay one.
- [x] **Step 2:** Correct the registry-asymmetry paragraph — replace "That is a genuine blind spot,
      tracked as **#428**" with the counter that now covers it, and state plainly that this is the
      one mail loss `riviera_outbox_pending` cannot show (AC-7).
- [x] **Step 3:** Update the four-counters-now clauses in `CLAUDE.md` (the `notification` row) and
      `RESPONSIBILITIES.md` (both the `notification` and `shared` sections).
- [x] **Step 4: Commit** — `git commit -m "docs(#428): document the abandoned-confirmation counter and close the outbox blind spot (#428)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | Phase 1 | The #428 shape one level *out*: not "a mail that never arrives" but **any registry-vehicle listener that gives up behind a normal return**, completing the publication so no gauge moves | `grep -rln "TransactionalEventListener\|ApplicationModuleListener" platform/src/main/java/` (8 sites) then each one's `log.warn`/`log.info`-then-`return` and `ifPresentOrElse` branches; plus `grep -rn "ObservabilityMetrics\."` to confirm what is and is not counted today | 8 listeners, **1 real analogue**. `BookingCancelledPayoutListener:52` — a cancellation with `refundMinor > 0` that finds no accrual to reverse logs one `WARN`, returns normally, completes the publication, and moves nothing; if the accrual exists or later appears (the two publications are independent, so a crash can deliver `BookingCancelled` before a republished `BookingConfirmed`), the ledger permanently overstates what the venue is owed — invariant #9 failing unsignalled, on the money path. Not analogues: `BookingRefundListener:42` (non-refundable ⇒ nothing to refund, a policy outcome per ADR-0005), `BookingCancelledPayoutListener:43` (no refund ⇒ the accrual correctly stands), `PaymentEventListener` (no give-up branch), `BookingConfirmedPayoutListener` (no early return), `AsyncMailDispatcher` + `RegistryMailExecutorConfig` (already counted, #415/#408), `BookingConfirmationMailListener` (this slice) | **Filed as #431**, not absorbed — it is in another module, on the money path, and unlike its four mail siblings a counter may not be the whole fix (the ordering itself may be the defect, and whether it joins `MoneyPathAlertCheck`'s deliberately-three-signal read set is its own decision). Absorbing it would also have falsified this slice's stated Non-goals mid-PR, the same reason #415/#423/#428 were each filed rather than folded in |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-6:** `gradle --no-daemon --console=plain test --tests "*BookingConfirmationMailListenerTest*"`
- [ ] **AC-7:** `grep -n "MAIL_CONFIRMATION_ABANDONED" platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java`
      and `grep -n "riviera_mail_confirmation_abandoned_total" docs/runbooks/observability.md`.
- [ ] **AC-8:** `grep -n "ERROR" platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java`
      → the level's justification on the class Javadoc.
- [ ] **Structural net:** `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
      --tests "*JdbcOnlyArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
      --tests "*MailListenerExecutorArchitectureTest*"` → PASS.
- [ ] **Full suite:** green on the PR's CI run (the half scoped runs cannot prove —
      `riviera-local-debug`'s full-suite-only failure class).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test (AC-7/AC-8 are docs ACs, verified by
      the recorded `grep`s).
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
- [ ] Booking codes unguessable (invariant #7) — and the new `ERROR` lines carry neither the code
      nor the address, pinned by AC-5.
- [ ] Flyway migration present for schema changes (invariant #12) — `N/A`, no schema change.
- [ ] **Frontend** standards — `N/A`, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — this doc's final state committed here, citing the merging
      PR, so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — `/code-review` via the `references/pr-gates.md` §1
      invocation ladder, with `riviera-review-overlay` layered on.
- [ ] **`riviera-docs-freshness` ran** (close-out step 5) over `origin/main...HEAD`.
