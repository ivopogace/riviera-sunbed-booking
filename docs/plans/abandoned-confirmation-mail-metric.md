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
`RESPONSIBILITIES.md` and the runbook each state), and — once phase 3 absorbed the payout sibling
(#431) — **`riviera-stripe-payments`**, re-entering the routing gate for the new area before editing:
it is what confirms the reversal must keep mirroring the accrual rather than re-reading the venue's
current rate, which is exactly why an accrual-less reversal can only be deferred (invariant #9,
ADR-0005). No `postgres` (no SQL, no migration — the payout fix needs no schema change), no frontend
skills (backend-only). **Phase 3b (the CI job timeouts) has no routed skill by design** — the routing
table has no workflow-YAML row and `riviera-local-debug` explicitly disclaims CI configuration
("that's `ci.yml` + issue #3 history, not this skill") — so only the always-on spine applies there;
recorded rather than left blank so RV-PROC-1 reads as a deliberate absence, not an omission.

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
- [x] **AC-9:** Given a `BookingCancelled` with `refundMinor > 0` whose booking has no `ACCRUAL` yet,
      when the payout listener runs, then it **throws** (so the publication stays outstanding and
      `riviera.outbox.pending` carries it) and posts no reversal — rather than completing as
      "nothing to reverse", which lost the reversal permanently.
      *Pinned by:* `BookingCancelledPayoutListenerTest.aRefundedCancellationWithNoAccrualThrowsSoThePublicationIsRetried`
- [x] **AC-10:** Given that deferral, when the line is logged, then it is an `ERROR` naming the
      booking and venue ids and the ledger consequence, and carries no booking code (invariant #7).
      *Pinned by:* `BookingCancelledPayoutListenerTest.theUnreversableCancellationLogsAnErrorNamingTheLedgerRisk`
- [x] **AC-11:** Given an accrued booking, when the refunded cancellation runs, then the
      proportional `REVERSAL` is still posted and nothing throws — the pre-existing behaviour is
      unchanged, as is a zero-refund cancellation touching the ledger not at all (ADR-0005).
      *Pinned by:* `BookingCancelledPayoutListenerTest.anAccruedBookingStillPostsTheProportionalReversal`
      + `aCancellationWithNoRefundTouchesTheLedgerNotAtAll`
- [x] **AC-12:** Every job in every workflow (`ci.yml`, `codeql.yml`, `deploy.yml`) declares
      `timeout-minutes`, and the step that hung declares its own tighter cap — so a wedged
      network fetch becomes a fast red instead of a six-hour pending check.
      *Verified by:* a `yaml.safe_load` walk asserting a non-null `timeout-minutes` on every job
      (command recorded at the AC-verification step); a docs/CI AC, deliberately not test-pinned.

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
- **No new alert wiring, and no fourth money-path signal.** `MoneyPathAlertCheck` still reads
  exactly its three signals: the mail counter is not one (same as its three siblings), and the
  absorbed payout fix deliberately needs none — its deferral is carried by `riviera.outbox.pending`,
  which that class *already* watches, so a counter of its own would count one deferral twice.
- **No redesign of how a reversal derives its commission.** The reversal still mirrors the accrual
  (rather than re-reading the venue's current rate), which is what keeps a rate change from breaking
  the netting — so an accrual-less reversal cannot be *computed*, only deferred. Making the pair
  order-independent by any other route (a pending-reversal row, a new `booking::api` read of the
  cancellation state) would be a schema or published-surface change and is not needed for
  correctness once the deferral is honest.
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
| R-1 | `ERROR` per loss floods the log during a systemic data fault, the exact failure mode #408's episode throttle exists to prevent | low | med | The three facts are FK-protected and never hard-deleted (see Open questions › Resolved), so a healthy system holds this at **zero** — unlike saturation, which fires once per send during an ordinary burst. If a systemic fault ever does raise it, one line per unrecoverable lost confirmation is the record we would want, since each is a distinct paying tourist and there is no durable copy to reconstruct from (the #415 argument, unchanged) | agent | closed — accepted; the reasoning is stated on the class and in the runbook, and the review gate did not dispute it |
| R-2 | The counter is read as "the mail system is broken" and sends on-call to the relay, when every increment is a data-integrity fault in `booking` / `venue` / `customer` | med | med | This is precisely what the `reason` tag and the runbook entry exist for: the runbook names this counter a **data-integrity** signal, explicitly *not* a relay signal, and maps each reason to its owning module | agent | closed — the runbook's entry leads with "data-integrity signal, not a relay signal — do not page the mail provider" and tables each reason to its module |
| R-3 | Emitting from `adapter/in` is read as a boundary slip | low | low | It is the established shape on this vehicle: `RegistryMailExecutorConfig` (also `adapter/in`) emits `MAIL_REGISTRY_SHED`. `shared` holds the name only; `notification` already grants `shared`, so no `allowedDependencies` change | agent | closed — `ModularityTests`, `PackageShapeArchitectureTests`, `JdbcOnlyArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` and `MailListenerExecutorArchitectureTest` all green |
| R-4 | Adding a `MeterRegistry` constructor parameter breaks the listener's registry `listener_id` (V31, #382), silently orphaning outstanding publications | low | high | The `listener_id` embeds the **class, method name and parameter type** — none of which a constructor parameter touches. `RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated` already pins it, so this is asserted rather than reasoned | agent | closed — the signature `on(BookingConfirmed)` is byte-for-byte unchanged; the IT needs Docker, so the assertion lands on the PR's CI run |
| R-5 | Merge collision with the other in-flight slice | low | low | Checked at the intake gate: open PR #429 (#426) touches `booking/adapter/in/*Properties*` + its own plan doc — **no file overlap**. No Flyway migration in this slice, so no `V<n>` to contend. Both slices may touch `CLAUDE.md`/`RESPONSIBILITIES.md` at close-out; whichever merges second rebases | agent | closed — no overlap materialised; PR #429 touched none of these files and this slice added no migration |
| R-9 | A CI cap set too tight turns a slow-but-healthy run (cold cache, slow runner) into a spurious red — trading a silent hang for noisy failures | low | med | Every value is ~4-6x the observed green duration and each carries that duration in a comment beside it, so the next reader can tell a real growth from a flake; the tightest cap (6 min) is on a step whose green time is ~20-30s, and `deploy.yml`'s is deliberately the loosest because its health poll is *designed* to wait ~15 min for a Render cold start | agent | closed — validated by loading all three workflows and asserting a non-null cap per job; the values are documented, not guessed |
| R-7 | The absorbed payout fix turns a silent branch into a thrown exception, so a condition that used to pass unnoticed now parks a publication in the outbox and holds `riviera_outbox_pending` non-zero | low | med | That is the intended trade and it is stated on the class, in `RESPONSIBILITIES.md` and in the runbook (with the "do not fix it by returning normally" warning): a visible backlog beats a ledger that quietly pays a venue for a refunded booking (invariant #9). The gauge is already alerted at threshold 10, so one parked publication does not page anyone | agent | closed — accepted and documented; the parking case needs the *accrual* to be permanently broken, which is its own alertable failure |
| R-8 | Throwing from the cancelled listener rolls back something it should not | low | high | The listener's transaction contains only the reversal read/insert; the refund and the availability release are done **synchronously by `booking` before the event is published** (`BookingCancelled`'s Javadoc), so nothing downstream of the tourist's money is inside this transaction | agent | closed — verified against `BookingCancelled`'s contract; `reverse` is `INSERT … ON CONFLICT DO NOTHING`, so the retry is a no-op once posted |
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

**In scope since phase 3** (it was `N/A` while the slice was the mail counter alone; the absorbed
payout fix put invariant #9 squarely in it — `riviera-stripe-payments` loaded before that edit).

- **Model unchanged (ADR-0002):** collect-only, no Stripe Connect, manual BKT settlement. No Stripe
  call, no gateway change, no new endpoint.
- **Invariant #9 is *strengthened*, not relaxed:** "a booking contributes exactly once; a refund
  reverses it" now holds regardless of the two publications' delivery order. Exactly-once is
  untouched — the retry rides the same `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO NOTHING`.
- **Invariant #5 (money) untouched:** no arithmetic changed. The reversal still mirrors the stored
  accrual rather than re-reading the venue's current rate (ADR-0005's rejected alternative stays
  rejected), which is exactly *why* an accrual-less reversal can only be deferred.
- **Invariant #10 untouched:** the refund decision and amount stay server-side in `booking`; this
  listener never decides a refund, it only records the venue-side consequence.
- **The mail half still must not disturb the money path:** its emission stays on the dedicated
  `registryMailExecutor` (#383), never Boot's shared `applicationTaskExecutor`, and
  `MoneyPathAlertCheck` continues to read exactly its three signals — the payout fix deliberately
  adds no fourth, since `riviera.outbox.pending` is already one of the three.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or response shape is touched; `/actuator/prometheus`
gains one series and stays authenticated (#75 lockdown preserved).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `merge close-out — plan doc final, merging via PR #430 (CI re-verifying after the workflow caps)`

**Next action:** Merge PR #430, then the GitHub-only close-out remainder: confirm #428 and #431
closed and that epic #367 records this slice.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `ce0ac30` (PR #430) |
| 1 — The counter, the reason tag, the log level | ✅ | this commit |
| 2 — Runbook + substrate docs | ✅ | this commit |
| 3 — The absorbed payout sibling (#431's scope) | ✅ | this commit |
| 3b — CI job timeouts (F-9, absorbed) | ✅ | this commit |
| 4 — Gates (CI, review, Sonar) + close-out | ✅ | `5fbcb6c` (5 review findings), `1532f06` (ADR amendment) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (agent 4, prior-PR comments) | `MAIL_REGISTRY_SHED`'s Javadoc still ended "do not sum **the two**" — written at #415 when there were two mail counters — in the very file this slice adds the fourth to, while `MAIL_RECOVERY_FAILED`'s block two entries down was updated to "the four". The class contradicted itself about its own counter set: **the identical miss #427 recorded fixing in `RESPONSIBILITIES.md`**, recurring one layer in | fixed |
| F-2 | review (agent 2, bug scan) | `everyAbandonedPathLogsAnErrorCarryingNoCredential` asserted only the `no-contact` branch while its name claimed all three, so a level or PII regression on `no-booking`/`no-set` alone would have kept the suite green — the AC-5 guarantee was pinned for one path in three. Now a `@ParameterizedTest` over the three reasons, also asserting the set id | fixed |
| F-3 | review (agent 1, RV-PROC-1) | The *Skills consulted* line still ended "no `riviera-stripe-payments` (no money)" after phase 3 absorbed the payout-ledger fix — self-contradicting the phase-3 section, which records loading it. The routing table maps any payout/ledger work to that skill regardless of whether Stripe's API is touched | fixed |
| F-4 | review (agent 1, CLAUDE.md/code-claim) | `abandon(...)`'s new Javadoc claimed the line "carr[ies] in its MDC the correlation id" — phrasing lifted from `TransactionalMailService`, where it is true because that vehicle propagates MDC. The `registryMailExecutor` pool has no MDC-propagating `TaskDecorator` (#410 is the slice that would add one), so the claim was false in the file that asserts it. Reworded to say why the ids *are* the whole trail here | fixed |
| F-5 | review (agent 3, git history) | No finding — but it surfaced the two precedents this change should cite and did not: U6's R-5 accepted the old branch on the "unreachable in practice" premise (the premise this corrects), and U5's R-7 already made the identical loud-over-silent trade for the accrual side. Both now cited on the listener | fixed |
| F-6 | sonar (pre-fix commit `59630d7`) | Clean, verified against the false-clean read (PR #318): issue list `total: 0` **and** `measures` non-empty (`new_lines` 133) **and** the `SonarCloud Code Analysis` check-run concluded `success`. `new_bugs` 0, `new_vulnerabilities` 0, `new_code_smells` 0, `new_duplicated_blocks` 0, density 0.0%, **`new_coverage` 100.0%** (bar ≥80%). Re-pulled after the fix push, cache-busted | closed |
| F-9 | CI (this PR's own run, `c995ef2`) | **The Frontend job hung ~11 min in `npx playwright install --with-deps chromium`** with lint, Vitest and the whole backend suite already green. No workflow declared `timeout-minutes`, so GitHub's six-hour default was the only ceiling — and because `sonar` `needs: [backend, frontend]`, the hang took the **Sonar gate** down with it: the PR could not reach a mergeable state and nothing went red to say why. Unrelated to this diff (backend-only), but a defect in the gate this slice has to pass, so fixed here on the maintainer's instruction rather than filed. Every job in all three workflows now carries a cap, the flaky step carries a tighter one, and the Render trigger `curl` gained `--max-time`. Operational note recorded: `gh` returns `403 Resource not accessible by integration` on run cancellation — the GitHub MCP tool has the permission | fixed |
| F-8 | `riviera-docs-freshness` (pre-merge, `origin/main...HEAD`) | **ADR-0005 stated the behaviour this slice changes** as a present-tense consequence: *"a missing accrual posts no reversal rather than a wrong one (accepted edge, like U5's R-7)"* — and cited as precedent the very U5 risk row that chose the opposite (throw, "loud over silent under-pay"). Per this skill's rule an ADR consequence is **flagged and amended, never silently rewritten**: the bullet now points to a new *Amendment (2026-07-29, #428)* section that re-affirms the decision (the reversal still mirrors the accrual; recomputing from the current rate stays rejected) and amends only the edge-handling, with the wrong premise named. Flagged to the maintainer in the session reply as well, since it is a decision change | fixed |
| F-7 | CI (`59630d7`) | All 7 checks green — Backend (build + test), Frontend, CodeQL ×2, both SonarCloud checks. This is the half scoped local runs cannot prove, and here it is load-bearing: it is what exercises `PayoutReversalIT` / `PayoutSpineScenarioIT` / `BookingConfirmationMailIT` / `RegistryMailBulkheadIT` (Docker-dependent) against the payout throw and the listener's new constructor | closed |

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
  the gap this slice closes, plus the `payout` clauses the absorbed fix changes (merge close-out
  step 5, `riviera-docs-freshness`).
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListener.java` —
  the absorbed sibling: defer (throw) instead of completing, with the ordering argument on the class.
- `platform/src/main/java/ai/riviera/platform/payout/application/PayoutLedger.java` — `findAccrual`'s
  contract said empty meant "nothing to reverse"; it now says "not yet, defer".
- `platform/src/test/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListenerTest.java` —
  new; AC-9 … AC-11.

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

## Phase 3b — CI job timeouts (F-9, absorbed)

**Files:** Modify `.github/workflows/ci.yml` · `.github/workflows/codeql.yml` · `.github/workflows/deploy.yml`

> Scope note: absorbed on the maintainer's instruction after this PR's own CI hung. **No routed skill
> covers workflow YAML** — `riviera-local-debug` explicitly disclaims CI configuration ("that's
> `ci.yml` + issue #3 history, not this skill") — so the routing gate has no row to satisfy here; the
> always-on spine (`riviera-plan-doc`, the review overlay) applies and is recorded.

- [x] **Step 1:** Cap every `ci.yml` job (backend 30, frontend 20, sonar 15) with the observed green
      duration in a comment beside each, plus the rationale header naming the #430 incident.
- [x] **Step 2:** Cap the step that actually hung (`playwright install`, 6 min) so the failure names
      the culprit rather than killing the job at some later point.
- [x] **Step 3:** Extend the same treatment to the two workflows with the identical gap —
      `codeql.yml` (20) and `deploy.yml` (guard 5, backend-render 25, the last deliberately loosest
      because its health poll is designed to wait out a Render cold start) — and give the Render
      trigger `curl` a `--max-time`, since the hook returns immediately and anything slower is a hang.
- [x] **Step 4:** Validate by parsing all three workflows and asserting a non-null `timeout-minutes`
      on every job (AC-12).

---

## Phase 3 — The absorbed payout sibling (#431's scope)

**Files:** Modify `BookingCancelledPayoutListener.java` · Modify `PayoutLedger.java` ·
Create `BookingCancelledPayoutListenerTest.java` · Modify `docs/runbooks/observability.md` ·
Modify `RESPONSIBILITIES.md` · Modify `CLAUDE.md`

> Scope note: absorbed on the maintainer's instruction rather than left as follow-up #431. The
> routing gate was re-run for the new area first — **`riviera-stripe-payments` loaded** (payout
> ledger / invariant #9) alongside the already-loaded `riviera-modulith` +
> `riviera-java-conventions`; no `postgres`, since the fix needs no schema change.

- [x] **Step 1: Write the failing tests** — AC-9 … AC-11 (four specs: the two new expectations plus
      the two pre-existing behaviours, so the fix is pinned as a *change* to one branch only).
- [x] **Step 2: Run them, verify they fail** — the two new specs FAIL, the two pre-existing PASS.
- [x] **Step 3: Minimal implementation** — `findAccrual(...).orElseThrow(() -> deferReversal(event))`,
      with the ordering argument and the accepted risk on the class Javadoc.
- [x] **Step 4: Run them, verify they pass** — both listener test classes green.
- [x] **Step 5: Substrate docs** — the port's `findAccrual` contract, the runbook's outbox-backlog
      cause (with the "do not fix it by returning normally" warning), the `payout` clauses in
      `CLAUDE.md` + `RESPONSIBILITIES.md`.
- [x] **Step 6: Commit + update the execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | Phase 1 | The #428 shape one level *out*: not "a mail that never arrives" but **any registry-vehicle listener that gives up behind a normal return**, completing the publication so no gauge moves | `grep -rln "TransactionalEventListener\|ApplicationModuleListener" platform/src/main/java/` (8 sites) then each one's `log.warn`/`log.info`-then-`return` and `ifPresentOrElse` branches; plus `grep -rn "ObservabilityMetrics\."` to confirm what is and is not counted today | 8 listeners, **1 real analogue**. `BookingCancelledPayoutListener:52` — a cancellation with `refundMinor > 0` that finds no accrual to reverse logs one `WARN`, returns normally, completes the publication, and moves nothing; if the accrual exists or later appears (the two publications are independent, so a crash can deliver `BookingCancelled` before a republished `BookingConfirmed`), the ledger permanently overstates what the venue is owed — invariant #9 failing unsignalled, on the money path. Not analogues: `BookingRefundListener:42` (non-refundable ⇒ nothing to refund, a policy outcome per ADR-0005), `BookingCancelledPayoutListener:43` (no refund ⇒ the accrual correctly stands), `PaymentEventListener` (no give-up branch), `BookingConfirmedPayoutListener` (no early return), `AsyncMailDispatcher` + `RegistryMailExecutorConfig` (already counted, #415/#408), `BookingConfirmationMailListener` (this slice) | Filed as #431, then **absorbed into this PR at the maintainer's instruction** ("don't file a new issue, fix it here") and #431 closed as fixed here. The fix is *not* the counter the issue proposed: investigating it showed the accrual is always **coming** (a refund only exists for a captured payment), so the fact *can* appear later — the mirror image of #428's three, which never can. So the listener now **throws**, keeping its publication outstanding for the republish, and `riviera.outbox.pending` (already a money-path signal) carries it. That is #423's own asymmetry argument applied in the direction it actually points, and it needs no new metric name. Phase 3 |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 … AC-6:** `gradle --no-daemon --console=plain -p platform test --tests "*BookingConfirmationMailListenerTest*"`
      → PASS (8 tests after F-2 parameterized AC-5 over the three reasons). Verified at `5fbcb6c`.
- [x] **AC-9 … AC-11:** `--tests "*BookingCancelledPayoutListenerTest*"` → PASS (4 tests: the
      deferral throws and posts nothing, its `ERROR` names the ledger consequence, and both
      pre-existing behaviours stay pinned). Verified at `5fbcb6c`.
- [x] **AC-7:** `grep -n "MAIL_CONFIRMATION_ABANDONED" platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java`
      and `grep -n "riviera_mail_confirmation_abandoned_total" docs/runbooks/observability.md`.
- [x] **AC-8:** `grep -n "ERROR" platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java`
      → the level's justification on the class Javadoc.
- [x] **AC-12:** `python3 -c "import yaml; [assert-per-job]"` over all three workflow files → every
      job reports a non-null `timeout-minutes` (backend 30, frontend 20 + a 6-min step cap on the
      Playwright install, sonar 15, codeql 20, deploy guard 5 / backend-render 25). Verified before
      the push that carries them.
- [x] **Structural net:** `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
      --tests "*JdbcOnlyArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"
      --tests "*MailListenerExecutorArchitectureTest*"` → PASS.
- [x] **Full suite:** green on the PR's CI run — all 7 checks (Backend, Frontend, CodeQL ×2, both
      SonarCloud checks) on `59630d7`, re-verified on the final commit. This is the half scoped runs
      cannot prove (`riviera-local-debug`'s full-suite-only failure class), and here it is
      load-bearing: it is what exercises the Docker-dependent `PayoutReversalIT`,
      `PayoutSpineScenarioIT`, `BookingConfirmationMailIT` and `RegistryMailBulkheadIT` — the last of
      which pins that the listener's registry `listener_id` survived its new constructor parameter.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-7/AC-8 are docs ACs, verified by
      the recorded `grep`s).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled — justified `N/A`, no availability write path (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event
      payload changed (invariant #11) — and the listener's class/method/parameter type are unchanged,
      so the registry `listener_id` needs no Flyway `event_type` rewrite.
- [x] **Payment/payout** section filled — **no longer `N/A`** since phase 3 absorbed the payout fix:
      invariant #9 strengthened, #5/#10 untouched, ADR-0005 amended rather than silently contradicted,
      and the mail emission still off `applicationTaskExecutor` (#383).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — no time arithmetic in scope.
- [x] Booking codes unguessable (invariant #7) — and both new `ERROR` lines carry neither the code
      nor the address, pinned by AC-5 (now over all three reasons) and AC-10.
- [x] Flyway migration present for schema changes (invariant #12) — `N/A`, no schema change.
- [x] **Frontend** standards — `N/A`, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — this doc's final state is committed here, citing
      `merged via PR #430`, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — `/code-review` via the `references/pr-gates.md` §1
      invocation ladder (rung 1, `Skill("code-review")`, was accepted this session), executed as the
      5-agent fan-out at **high** effort because the diff touches money, with
      `riviera-review-overlay` layered on. Five findings, all fixed in `5fbcb6c`; result posted on
      PR #430.
- [x] **`riviera-docs-freshness` ran** (close-out step 5) over `origin/main...HEAD`: one finding —
      ADR-0005's stated consequence contradicted the absorbed payout fix (F-8), amended in this PR
      rather than as a follow-up. `CLAUDE.md`, `RESPONSIBILITIES.md` and the runbook were patched in
      phases 2–3; `CONTEXT.md`, `docs/agents/` and the `riviera-*` skills state nothing this slice
      falsified (`riviera-stripe-payments`' "a refund reverses it" stays true — the reversal still
      happens, it is only deferred when it cannot yet be mirrored). Graph refresh skipped —
      `graphify-out/` is absent in this cloud clone.
