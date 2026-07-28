# Bulkhead registry-borne mail off the shared applicationTaskExecutor — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `BookingConfirmationMailListener` off Boot's shared `applicationTaskExecutor` onto a
dedicated **bounded** executor, so that under the `mailer` profile a slow or unresponsive SMTP relay
cannot delay or starve the money-path spine (`PaymentConfirmed` → booking confirm, invariant #8;
`BookingConfirmed` → payout accrual, invariant #9) — while proving the Event Publication Registry
still tracks, completes and republishes the listener after the decomposition.

**Architecture:** `@ApplicationModuleListener` takes no executor qualifier, so the listener is
decomposed into the three annotations it is meta-annotated with — verified from the 2.1.0 bytecode as
exactly `@Async` + `@Transactional(propagation = REQUIRES_NEW)` + `@TransactionalEventListener` — with
two deliberate changes: `@Async` names a dedicated `registryMailExecutor`, and the transaction is
**dropped**, because the listener's three port reads are independent read-only queries with no
consistency requirement between them, and the only thing a transaction bought was holding a Hikari
connection across the SMTP round-trip — the harm the issue names. The class, method name and
parameter type are unchanged, so the registry's `listener_id` (which embeds exactly those) is
byte-identical and **no Flyway rewrite is needed** — pinned by a test rather than assumed.

**Persistence:** JDBC only (invariant #1). **No migration, no schema change.** The slice reads
`event_publication` in tests only; the registry schema stays Flyway-owned (V8, V31).

**Source of intent:** GitHub issue **#383** (sub-issue of epic **#367**, "Transactional email — real
mailer on Scaleway TEM"); the regression is against the decision documented in `AsyncMailDispatcher`'s
own Javadoc (#369) and ADR-0011 decision 5.

**Skills consulted:**
- `riviera-sdlc` — the loop, the Skill-routing gate, the issue-intake grill gate.
- `riviera-modulith` (+ `references/events.md`) — confirmed the executor bean belongs in the
  `notification` module's `adapter/in` next to the driving adapter it serves (precedent:
  `customer.adapter.in.CustomerRetentionConfig`, a package-private `@Configuration` in `adapter/in`),
  and that a moved/renamed listener would need a Flyway `listener_id` rewrite — which is precisely why
  AC-5 pins that the id did **not** move.
- `riviera-java-conventions` — package-private `@Configuration` + package-private listener,
  constructor injection, named constants over magic literals (the bean name is a compile-time constant
  shared by the `@Bean` and the `@Async`), no bare `catch`, one-line-or-none inline comments. It also
  supplied the tension this plan has to argue rather than ignore: §8 says *"don't hand-roll thread
  pools in application code"* — see R-4.
- `riviera-plan-doc` — this document's structure and the Execution-status discipline.
- `riviera-local-debug` — the cloud recipe (system `gradle`, JDK-25 toolchain registration, daemon on
  21) and the scoped-test discipline used for every phase command below.
- **Not loaded, deliberately:** `postgres` (no migration, no schema, no new query — the tests read
  `event_publication` with a `count(*)` copied from the existing ITs); `riviera-stripe-payments` (no
  payment, payout, commission or Stripe logic changes — the money path is *asserted unaffected*, not
  edited); `riviera-frontend` / `angular-developer` / `playwright-cli` (no user-facing surface —
  backend-only, no API shape change).

**Branch:** `claude/sdlc-383-iy57l3` — the cloud session's designated remote branch, standing in for
`bugfix/registry-mail-bulkhead` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

Mapped to the issue's four ACs; AC-5 is added by the intake grill (see Open questions).

- [ ] **AC-1 (issue AC-1):** Given a mailer that blocks indefinitely and enough outstanding
  `BookingConfirmed` publications to occupy every mail thread **and** more than Boot's
  `applicationTaskExecutor` core pool (8), when a further booking is confirmed via the payment path,
  then `PaymentConfirmed` → `CONFIRMED` and `BookingConfirmed` → payout accrual both complete within
  seconds while the mail sends are still wedged. *Pinned by:*
  `RegistryMailBulkheadIT.wedgedMailDoesNotDelayTheMoneyPath`
- [ ] **AC-2 (issue AC-2):** Given the registry-mail executor, when more tasks are submitted than its
  pool and queue can hold, then the surplus is **shed** — the submission neither throws to the caller
  nor runs on the caller's thread — and the pool is bounded at its configured core/max/queue.
  *Pinned by:* `RegistryMailExecutorConfigTest.isBoundedAndShedsOnSaturation`
- [ ] **AC-3 (issue AC-3, durability half a):** Given a confirmation send that fails, when the
  publication set is resubmitted (what `republish-outstanding-events-on-restart` does at boot), then
  the mail is re-attempted — i.e. the decomposed listener still leaves an **outstanding** publication
  on failure. *Pinned by:* `RegistryMailBulkheadIT.aFailedSendLeavesThePublicationOutstandingAndIsRetried`
- [ ] **AC-4 (issue AC-3, durability half b):** Given a confirmation that was delivered, when the
  publication set is resubmitted, then no second mail is sent — the decomposed listener is still
  **completed** by the registry. *Pinned by:* the existing
  `BookingConfirmationMailIT.doesNotResendWhenACompletedPublicationIsResubmitted` and
  `EventRegistryDurabilityIT.boundsTheLivePublicationTableByArchivingCompletions`, re-run unchanged.
- [ ] **AC-5 (added by the grill):** Given the decomposition, when a publication for the listener is
  written, then its `listener_id` is exactly the FQCN+signature string V31 migrated to — so no live
  or archived row dead-letters on the post-deploy republish. *Pinned by:*
  `RegistryMailBulkheadIT.keepsTheListenerIdV31Migrated`
- [ ] **AC-6 (issue AC-4):** Given any transactional event listener in the `notification` module, then
  it declares the dedicated mail executor by name — a bare `@ApplicationModuleListener` (which would
  silently land back on the shared executor) fails the build. This is what makes
  `AsyncMailDispatcher`'s stated rule hold for *every* mail path, including the ones #373/#374 have
  not written yet. *Pinned by:*
  `MailListenerExecutorArchitectureTests.everyNotificationEventListenerNamesTheMailExecutor`
- [ ] **AC-7 (the transaction half of issue "what to build" bullet 3):** Given a confirmation send,
  when the transport is invoked, then no transaction (and therefore no pooled connection) is held open
  around it. *Pinned by:* `RegistryMailBulkheadIT.sendsWithNoTransactionHeldOpen`

## Non-goals

- **Moving the mail off the Event Publication Registry.** The vehicle is correct and ADR-0011-mandated
  (decision 5: ids-only payload → registry). Only the executor and transaction posture change.
- **Re-tuning Boot's shared `applicationTaskExecutor`** (its unbounded queue, its core size) for the
  money-path listeners themselves. Bounding the spine's own executor is a separate question with a
  different failure mode — shedding a payout accrual is not obviously better than queueing it.
- **A scheduled resubmit of incomplete publications.** Retry stays "on restart", exactly as today; a
  periodic republish would change the retry contract for every registry listener, not just mail.
- **Absorbing a permanently-failing send** (the issue's "Related" note — a 550 to a mistyped address
  parks a publication forever and holds `riviera.outbox.pending` above threshold). See Open questions
  → Resolved: this is now #372's bounce feed, and the suppression list it feeds already exists.
- **Merging the two mail executors.** The recovery dispatcher (#369) and this one keep different
  saturation semantics on purpose — see R-3.
- **Any change to `MockMailer`, `SmtpMailer`, the suppression list, or the send chokepoint.**

## Behavior-parity ledger

The slice replaces the listener's *dispatch mechanics*, so the ledger covers what
`@ApplicationModuleListener` was providing.

| Old-surface behavior (`@ApplicationModuleListener`) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `@Async` — runs off the publishing thread | **preserved** | `@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)` — still async, now on a named pool |
| runs on Boot's shared `applicationTaskExecutor` | **changed** (the point of the slice) | dedicated bounded `registryMailExecutor`; AC-1 proves the spine is unaffected |
| `@TransactionalEventListener` default phase = `AFTER_COMMIT` | **preserved** | the same annotation, phase left at its default |
| registry tracks the publication before delivery | **preserved** | tracking keys on `@TransactionalEventListener`, which is unchanged — AC-3 |
| registry marks the publication complete on success | **preserved** | AC-4 (existing ITs, re-run unchanged) |
| failure leaves the publication outstanding → retried on restart | **preserved** | AC-3 |
| `listener_id` = `<FQCN>.on(BookingConfirmed)` | **preserved** | class/method/param untouched, so no V36 rewrite — AC-5 |
| `@Transactional(propagation = REQUIRES_NEW)` around the whole method | **dropped** | three independent read-only port queries need no shared unit of work; the transaction's only other effect was pinning a Hikari connection across the SMTP round-trip, the exact harm #383 names. AC-7 pins it; R-2 carries the fallback if the registry turns out to depend on it |
| unbounded queueing (Boot default) | **changed** | bounded queue that sheds to the registry — AC-2 |
| exceptions swallowed by the async proxy | **preserved** | still `@Async`; the failure path is the registry's outstanding publication, not a thrown call |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The decomposition silently loses registry tracking, converting at-least-once into fire-and-forget with no failing test — the issue's stated main reason this wasn't folded into #371 | low | **critical** | Bytecode-verified that `@ApplicationModuleListener` *is* exactly these three annotations, so tracking (which keys on `@TransactionalEventListener`) cannot change; then proven both directions — AC-3 (outstanding on failure) and AC-4 (completed on success), the latter by the **existing, unmodified** #371 ITs | agent | open |
| R-2 | Dropping `@Transactional` breaks completion registration or archive atomicity | low | high | AC-4's existing ITs are the detector, and they run in phase 1. **Fallback if red:** restore `@Transactional(propagation = REQUIRES_NEW, readOnly = true)` and drop AC-7 — the executor bulkhead (the issue's primary fix) stands either way; record the outcome here and in the parity ledger | agent | open |
| R-3 | The two mail pools drift into looking like duplication, and a future slice "unifies" them — re-opening the #369 timing oracle or the #383 bulkhead | med | high | Documented on both classes as **deliberately different saturation semantics**: the recovery dispatcher must *drop* (its payload is a bearer credential the registry may not persist, ADR-0011 decision 5, so there is nothing to retry from), while this one *sheds to the registry*, which still holds the work. AC-6 makes the split structural, not advisory | agent | open |
| R-4 | `riviera-java-conventions` §8 says "don't hand-roll thread pools in application code" — this slice hand-rolls one | n/a | n/a | Accepted with reason: §8's target is using threads as a *concurrency primitive* (the DB unique index owns that, invariant #2). This pool is a **bulkhead**, the opposite — it exists to *limit* concurrency and isolate a failure domain. The precedent (`AsyncMailDispatcher`, #369) was accepted on the same grounds, and the issue is that the precedent was not applied consistently | agent | open |
| R-5 | The wedging IT leaves a blocked executor or a claimed `(set, date)` behind and poisons the shared Spring context for other ITs (invariant #2: a claim is never released) | med | med | The IT declares a nested `@TestConfiguration`, which gives it **its own context cache key** rather than the shared one; the latch is released in `@AfterEach` unconditionally; bookings are SQL-seeded on dates no other IT uses (the class-level unique-date discipline `BookingConfirmationMailIT` documents) | agent | open |
| R-6 | Saturation shedding is *silent* — a shed send is invisible until the next restart republishes it | med | med | The rejection handler logs a WARN (no address, invariant #7 posture); the shed publication keeps `riviera.outbox.pending` non-zero, which `MoneyPathAlertCheck` already surfaces. Documented on the config class as the saturation contract AC-2 requires | agent | open |
| R-7 | A full-suite-only failure (the `riviera-local-debug` shared-state class): a new bounded, long-lived pool accumulating wedged threads across cached contexts | med | med | The only test that wedges the pool owns its own context (R-5) and releases in `@AfterEach`; no `@Scheduled`, no filter, no rate-limit key involved. Verified by the push's CI run before the next phase, per the SDLC CI-gate rule |  agent | open |

## Open questions / Assumptions

- **Assumption:** Pool size **2** and queue **200** are right for one send per confirmed booking.
  Rationale: 2 rather than 1 so a single wedged address (up to ~30s of #368's connect+read+write
  timeouts) cannot serialize every subsequent confirmation behind it — the reason `AsyncMailDispatcher`
  could accept 1 ("a handful of sends a day") does not hold for a per-booking send; and small rather
  than large because the pool's *job* is to be smaller than the spine's. 200 queue slots is ≈50 minutes
  of worst-case backlog at 2×30s, well past the point where shedding to the durable registry beats
  queueing. Constants, not properties, matching `AsyncMailDispatcher`'s precedent. — *Owner:* agent ·
  *Resolves by:* phase 0 (the numbers are asserted, so changing them is a one-line, test-covered edit)

### Resolved

- **Drift the grill found — the issue's "Related" paragraph is stale.** It says a permanently-failing
  send "keeps `riviera.outbox.pending` above threshold" and that "there is currently no suppression
  list to absorb it (ADR-0011 decision 7, not yet built)". The suppression list **has** shipped since
  (#382 V32, hashed since #388/V33, reinstatement #391/V35) and the module enforces *no send to a
  suppressed address* at the chokepoint. What is still missing is only the **bounce/complaint feed**
  that would populate it from a 550 — which is exactly #372's scope, still open. So the paragraph's
  concern is real but its stated cause is out of date, and it is **not** decided here: it needs the
  feed, not an executor. Recorded as a Non-goal, deferred to **#372**.
- **Does the decomposition need a Flyway `listener_id` rewrite (the V31/#382 lesson)?** No — the
  registry derives `listener_id` from the listener class FQCN, method name and parameter type, none of
  which this slice changes. Only the annotations on the method change. Pinned by AC-5 rather than
  trusted.
- **Is the next Flyway version at risk of collision?** Moot — the slice adds no migration. For the
  record, the only open PRs are ten Dependabot frontend bumps (#332–#341); no feature branch is in
  flight, so no shared-file or version contention exists.
- **Is the previous sibling slice's close-out complete?** Yes. Epic #367's sub-issues show #368, #369
  and #371 closed; #370 (ready-for-human) and #372–#375, #380 remain open as expected. No un-ticked
  close-out gap to repair one slice later.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches no write path to
`availability(set_id, booking_date)`: it changes which executor a **mail** listener runs on and
removes a transaction that wrapped three read-only queries. The `booking` → `availability` claim stays
the synchronous `AvailabilityClaim` port call it has always been. Two adjacent notes, since the plan is
the place to state them rather than discover them:

- The tests **seed** bookings by SQL on deliberately unique dates and never claim through the port, for
  the reason `BookingConfirmationMailIT` documents: ITs sharing a context share one container and one
  ONLINE set, and a claimed `(set, date)` is never released (R-5).
- The `queryTimeout` reasoning from #386 is untouched: the suppression lookup keeps its
  adapter-scoped timeout, and this slice adds no global statement timeout that could bound
  `availability`'s `SELECT … FOR UPDATE`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | none (owns `email_suppression` state, no aggregate) | It owns "the two delivery vehicles" (`RESPONSIBILITIES.md`); the executor a vehicle runs on is that vehicle's own machinery |

No other module's source changes. `booking`, `payout` and `payment` appear only in **tests**, as the
spine whose independence is being asserted.

**Cross-module named interfaces (`api/` ports)**

`N/A — no published surface changes.` The listener keeps reading exactly the ports it reads today
(`booking.api.BookingNotificationFacts`, `venue.api.SetBookingFacts`, `customer.api.CustomerLookup`),
so `notification`'s `allowedDependencies` are unchanged.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, venueId, setId, bookingDate, amountMinor, currency }` | `payout` (unchanged, shared executor), `notification` (**this slice**, dedicated executor) | async `AFTER_COMMIT`, registry-backed — both | `RegistryMailBulkheadIT`, `PayoutAccrualIT` |

No event is added, moved, renamed or re-payloaded.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The bounded executor that registry-borne mail runs on | `notification` | `notification` **Job**: owns "the two delivery vehicles — the Event Publication Registry listener for ids-only payloads and the bounded in-memory dispatcher for bearer-credential payloads". The pool a vehicle drains on is part of the vehicle. It is on no other module's Not-My-Job list, and it is emphatically **not** the composition root's: the root is a pure composition root + auth edge since #382 and holds no module listeners (`CompositionRootDisciplineTests`) |
| The structural rule "a mail listener must name its executor" | test scope (root `ai.riviera.platform`) | Sits with the other fitness functions, which all live at the root test package and share `ArchitectureTestSupport`'s single production classpath scan (#96). It asserts *about* `notification` but is not production code in it |

Placement within the module: `adapter/in`, beside `BookingConfirmationMailListener`, the driving
adapter it exists to serve — the same shape as `customer.adapter.in.CustomerRetentionConfig` (a
package-private `@Configuration` in `adapter/in`). Not `application/`: the executor is the driving
adapter's infrastructure, and `PackageShapeArchitectureTests` assertion 4 keeps the inside from
depending on the outside, which a shared bean would tempt.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no amount is computed, no Stripe call, no ledger write is
added or changed. The payment/payout listeners are the **subject of an assertion** (AC-1: they must
stay responsive while mail is wedged), not of an edit — `riviera-stripe-payments` is deliberately not
loaded for that reason.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or response shape is touched.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current `riviera-sdlc` stage
> reference) after any compaction or in a fresh session, before acting.

**Stage pointer:** `implement (phase 1)`

**Next action:** Phase 1 — write `RegistryMailBulkheadIT` (AC-1/3/5/7), watch it fail, then swap the
listener's annotations.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the bounded executor + its saturation contract | ✅ | see phase-0 commit |
| 1 — decompose the listener onto it; registry durability + listener_id proven | ⏳ | |
| 2 — the structural rule (AC-6) + substrate docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfig.java`
  — **new.** Package-private `@Configuration`; the bounded `registryMailExecutor` bean, its bean-name
  constant, and the Javadoc that states the saturation contract (AC-2, R-6) and the deliberate
  difference from `AsyncMailDispatcher` (R-3).
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java`
  — **modified.** `@ApplicationModuleListener` → `@Async(MAIL_EXECUTOR)` +
  `@TransactionalEventListener`; Javadoc updated to carry the executor and no-transaction reasoning.
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java`
  — **modified, Javadoc only.** Its "the pool is deliberately its own" paragraph currently reads as if
  the shared executor is still what module listeners use; point it at the sibling executor so the two
  read as one decision (AC-6's prose half).
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/RegistryMailExecutorConfigTest.java`
  — **new.** Plain unit test (no Spring): bounds + shed-on-saturation (AC-2).
- `platform/src/test/java/ai/riviera/platform/notification/RegistryMailBulkheadIT.java`
  — **new.** Testcontainers IT with a controllable `Mailer`: AC-1, AC-3, AC-5, AC-7.
- `platform/src/test/java/ai/riviera/platform/MailListenerExecutorArchitectureTests.java`
  — **new.** The fitness function for AC-6.
- `RESPONSIBILITIES.md`, `CLAUDE.md` — **modified.** The `notification` Job line and the module table
  gain the executor fact (merge close-out step 5, `riviera-docs-freshness`).

---

## Phase 0 — The bounded executor + its saturation contract

**Files:** Create `notification/adapter/in/RegistryMailExecutorConfig.java` · Test
`notification/adapter/in/RegistryMailExecutorConfigTest.java`

- [ ] **Step 1: Write the failing test** — assert the pool is bounded (core, max, queue) and that
  submitting past capacity neither throws nor runs on the caller's thread.
- [ ] **Step 2: Run it, verify it fails** —
  `gradle --no-daemon --console=plain test --tests "*RegistryMailExecutorConfigTest*"` → FAIL
  (compilation: `RegistryMailExecutorConfig` does not exist).
- [ ] **Step 3: Minimal implementation** — the `@Configuration` + `@Bean`, with a rejection handler
  that logs and discards.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — search for other unqualified `@Async` / bare
  `@ApplicationModuleListener` sites and decide which are in scope (expected: the money-path listeners
  are deliberately out — see Non-goals).
- [ ] **Step 6: Commit** — `git commit -m "feat(#383): add a bounded executor for registry-borne mail"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Decompose the listener onto it; prove the registry intact

**Files:** Modify `notification/adapter/in/BookingConfirmationMailListener.java` · Test
`notification/RegistryMailBulkheadIT.java`

- [ ] **Step 1: Write the failing tests** — AC-1 (wedged mail vs. the spine), AC-3 (failure leaves the
  publication outstanding and is retried), AC-5 (`listener_id` unchanged), AC-7 (no transaction held
  around the send).
- [ ] **Step 2: Run them, verify they fail** —
  `gradle --no-daemon --console=plain test --tests "*RegistryMailBulkheadIT*"` → FAIL (AC-1 times out:
  mail is on the shared executor; AC-7 fails: a transaction is active).
- [ ] **Step 3: Minimal implementation** — swap the annotations on the listener.
- [ ] **Step 4: Run them, verify they pass** — the same command, then the regression scope that
  guards R-1/R-2:
  `gradle --no-daemon --console=plain test --tests "*BookingConfirmationMailIT*" --tests "*EventRegistryDurabilityIT*" --tests "*ListenerMoveMigrationIT*" --tests "*PayoutAccrualIT*"`
  → PASS **unmodified** (that they are unmodified is the point: they are the #371 durability contract).
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** —
  `git commit -m "fix(#383): run booking-confirmation mail on its own bounded executor"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Make the rule structural, and reconcile the substrate

**Files:** Create `MailListenerExecutorArchitectureTests.java` · Modify `AsyncMailDispatcher.java`
(Javadoc) · Modify `RESPONSIBILITIES.md`, `CLAUDE.md`

- [ ] **Step 1: Write the failing test** — every `@TransactionalEventListener` method in the
  `notification` module must carry `@Async` naming the mail executor; prove it is not vacuously green
  (it must actually find the listener).
- [ ] **Step 2: Run it, verify it fails** — temporarily revert the listener to
  `@ApplicationModuleListener` → FAIL; restore.
- [ ] **Step 3: Implementation** — the rule, plus the Javadoc and substrate-doc updates.
- [ ] **Step 4: Run the structural net** —
  `gradle --no-daemon --console=plain test --tests "*MailListenerExecutorArchitectureTests*" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*CompositionRootDisciplineTests*"`
  → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "test(#383): pin that every notification mail listener names its executor"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-28 | phase 0 (new pattern: a dedicated bounded executor for a listener doing blocking external I/O) | every async event listener, to see which others put a blocking round-trip on the shared `applicationTaskExecutor` | `rg '^\s*@(ApplicationModuleListener\|Async\|EventListener\|TransactionalEventListener)' platform/src/main/java` | 6: `payout` ×2 (`BookingConfirmed`/`BookingCancelled` accrual+reversal), `booking.PaymentEventListener` ×2, `booking.BookingRefundListener`, `notification.BookingConfirmationMailListener` | **Subset.** Only the mail listener moves (this slice). The four `payout`/`PaymentEventListener` methods are DB-only and *are* the spine — giving the spine a smaller pool than it has today would shed money-path work, which is strictly worse (Non-goals). **One genuine sibling found:** `BookingRefundListener` drives `payment`'s `RefundPort` — a blocking **Stripe HTTP** round-trip on the shared spine executor, the same hazard class as this issue with a different transport. Out of scope here (it is payment work, needs `riviera-stripe-payments`, and shedding a refund is not obviously right) → **raised as a follow-up issue at close-out**, not silently dropped |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle test --tests "*RegistryMailBulkheadIT*"` → `wedgedMailDoesNotDelayTheMoneyPath` PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** `gradle test --tests "*RegistryMailExecutorConfigTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** `gradle test --tests "*RegistryMailBulkheadIT*"` → `aFailedSendLeavesThePublicationOutstandingAndIsRetried` PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `gradle test --tests "*BookingConfirmationMailIT*" --tests "*EventRegistryDurabilityIT*"` → PASS, unmodified. Verified at commit `<sha>`.
- [ ] **AC-5:** `gradle test --tests "*RegistryMailBulkheadIT*"` → `keepsTheListenerIdV31Migrated` PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** `gradle test --tests "*MailListenerExecutorArchitectureTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** `gradle test --tests "*RegistryMailBulkheadIT*"` → `sendsWithNoTransactionHeldOpen` PASS. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A); no new write path to `set_availability` (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `allowedDependencies` unchanged (invariant #11).
- [ ] **Payment/payout** section filled (justified N/A); the spine's behavior is asserted, not edited (invariants #5, #8, #9).
- [ ] No booking code, address or token in any new log line (invariant #7).
- [ ] No Flyway migration needed — and that claim is pinned by AC-5, not asserted (invariant #12).
- [ ] **Frontend** N/A.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
