# Refund-failure race, guarded un-record, and a queryable owed-refund trace — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Close the three residuals #592 accepted: a verified refund-failure event that
races its own record must not be consumed and lost, `markRefunded` must refuse to assert
a collection that never succeeded, and a refund the platform still owes must leave a
**queryable** trace rather than one WARN line.

**Architecture:** One decision carries all three — **the `payment` row gains an explicit
refund-attempt/refund-failure trace (`refund_attempted_at`, `refund_failed_at`,
`failed_refund_id`), and every refund write becomes a guarded single statement that
reports whether it moved.** That turns the race from "first writer wins silently" into
"the un-record leaves a tombstone the record then refuses to overwrite": the losing
`markRefunded` returns `false`, the gateway answers `RefundResult.Failed`, and the event
publication stays outstanding — so the existing re-drive machinery creates a fresh refund
past the idempotency-key window instead of a human discovering the loss. The alternative
(deferring the webhook with a `503`) was rejected by the issue itself: the shared endpoint
would 5xx-loop on a manual dashboard refund and get Stripe to disable payment delivery
with it (invariants #2/#8).

**Persistence:** JDBC only (invariant #1). One additive migration — `V42` on `payment`
(three nullable columns + one partial index). No new table, no status token: a
`REFUND_FAILED` status would have to enter `payment_status_check` and would collide with
`RefundProgress`'s `status == SUCCEEDED → OUTSTANDING` mapping, whereas the collection
genuinely *is* still `SUCCEEDED` when a refund dies.

**Source of intent:** GitHub issue #594 (three residuals recorded from #592's review gate,
merged via PR #593).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the issue's premise "`markRefunded` … commits with `BookingRefundListener`'s transaction"
is **stale**: #404 dropped that listener's transaction entirely, so the pre-create write
this plan adds is a plain auto-commit statement, not the `REQUIRES_NEW` the issue's
two-phase-write sketch implies) · `riviera-plan-doc` (this template — its risk register
forced the manual-dashboard-refund false-positive out into the open, which is what put
`refund_attempted_at` in the design instead of a bare by-intent fallback) · `tdd` (each
phase red-first at the `Payments` port seam, then the webhook and gateway above it) ·
`riviera-review-overlay` (review gate — RV-BE-3b/RV-BE-8 on the diff at ready-for-review)
· `riviera-docs-freshness` (**ran** at merge close-out over this PR's range — see
Execution status) · `postgres` (nullable `TIMESTAMPTZ` columns + a **partial** index on
`refund_failed_at IS NOT NULL` so the owed-refund enumeration is an index-only scan over a
near-empty set, rather than a full index on a column that is NULL for every healthy row) ·
`riviera-modulith` (confirmed all three fixes stay **inside** `payment` — no published
surface, no `allowedDependencies` change, no new port; `Payments` is the module's internal
driven port and stays in `application/`) · `riviera-java-conventions` (§6 typed outcome —
`markRefunded` returns `boolean` like its `markStatus`/`markRefundFailed` siblings rather
than throwing; §6a named status-set constants kept in lockstep with the SQL; §6d Javadoc
budget — the rationale lands in `RESPONSIBILITIES.md`, not in the port doc) ·
`riviera-stripe-payments` (refund execution stays collect-only; the un-record is
reconciled from the signature-verified webhook, never from the create call's answer —
invariant #8 applied to the refund lifecycle) · `riviera-local-debug` (scoped-test recipe:
system `gradle`, JDK-25 toolchain, one IT class at a time)

**Branch:** `claude/sdlc-594-y01nut` — the cloud session's **designated remote branch**
stands in for `bugfix/refund-failure-race-and-queryable-trace` (riviera-sdlc §Remote /
cloud session addendum). Exists in git before phase 0, based on `origin/main` at `a6e425e`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a booking whose refund attempt is on record (`refund_attempted_at`
      set) and whose refund has **not yet** been recorded, when a verified refund-lifecycle
      event reports that refund `failed`/`canceled`, then the payment row is marked
      refund-failed (`refund_failed_at` set, `failed_refund_id` = that refund) and the
      money-path counter fires — instead of the event being consumed as "nothing to
      un-record". *Pinned by:* `JdbcPaymentsIT.markUnrecordedRefundFailedMarksTheRacingAttempt`
      and `StripeWebhookIT.aRefundFailureRacingItsOwnRecordIsNotLost`
- [ ] **AC-2:** Given the payment row already carries a refund-failed tombstone for refund
      `re_X`, when the losing `markRefunded(booking, amount, re_X)` runs, then it moves no
      row and reports `false`, so `refunded_minor` stays `0` and the collection stays
      `SUCCEEDED`. *Pinned by:* `JdbcPaymentsIT.markRefundedRefusesARefundAlreadyReportedDead`
- [ ] **AC-3:** Given the gateway's `markRefunded` reports no move, when
      `StripePaymentGateway#refund` returns, then it answers
      `RefundResult.Failed("refund_died_before_record")` — so `BookingRefundListener`
      throws, the publication stays outstanding, and a re-drive past the key window issues a
      fresh refund. *Pinned by:* `StripePaymentGatewayTest.refundThatDiedBeforeItsRecordIsReportedFailed`
- [ ] **AC-4:** Given a payment row in a **non-collected** status (`REQUIRES_PAYMENT`,
      `FAILED`, or `CANCELED`), when `markRefunded` is called for it, then it moves no row
      and reports `false` — a refund can never assert a collection that never succeeded.
      *Pinned by:* `JdbcPaymentsIT.markRefundedRefusesAnUncollectedPayment`
- [ ] **AC-5:** Given a refund recorded on a collected payment, when `markRefundFailed`
      un-records it, then the row reads `status = SUCCEEDED`, `refunded_minor = 0`,
      `refund_id = NULL` and carries `refund_failed_at` + `failed_refund_id` — the trace the
      runbook's remedy needs, and a `refund_id` that no longer claims a live refund.
      *Pinned by:* `JdbcPaymentsIT.markRefundFailedLeavesAQueryableTrace`
- [ ] **AC-6:** Given N bookings whose refunds died and one whose retry then succeeded,
      when the owed-refund count is read, then it is N — distinct refunds owed, not
      observations. *Pinned by:* `JdbcPaymentsIT.owedRefundCountCountsDistinctOwedRefunds`
- [ ] **AC-7:** Given a verified refund-failure event for a refund on a PaymentIntent this
      platform never attempted a refund on (a manual dashboard refund), when it is handled,
      then no row moves, no counter fires, and the response is `200` — the platform owes
      nothing and must not raise a money-path alert.
      *Pinned by:* `StripeWebhookIT.aManualDashboardRefundFailureRaisesNoMoneyPathAlert`
- [ ] **AC-8:** Given the `V42` migration, when Flyway runs on real Postgres, then the three
      columns exist nullable with no default, and a row may carry `refund_failed_at` while
      `status = 'SUCCEEDED'` (the state a dead refund leaves). *Pinned by:*
      `PaymentMigrationIT.refundFailureTraceColumnsAdmitAnOwedRefund`

## Non-goals

- **No automatic re-drive of a webhook-reported failure.** `RESPONSIBILITIES.md` §`payment`
  states the posture — an issuer rejection is not a transient error. What this slice adds is
  narrower and deliberate: the **race** loser (AC-3) keeps its publication outstanding
  because the refund was never recorded in the first place, so the existing re-drive still
  applies to it. A refund that was recorded and *then* died stays a human's job.
- **No admin endpoint or console tab for owed refunds.** The issue asks for a queryable
  trace; this ships the column, the partial index, the enumeration query in the runbook, and
  a gauge. A `/api/admin/**` surface is a separate slice if the count ever moves.
- **No `REFUND_FAILED` payment status.** Rejected above — the collection is still `SUCCEEDED`.
- **No change to the `refund.failed` vs `refund.updated` unreadable-payload split** (#592's
  fail-closed / fail-open decision stands).
- **No new refund path.** Issue item 2 notes `markRefunded`'s hazard becomes reachable "the
  moment a second refund path exists" — this slice guards it; it does not add one.

## Behavior-parity ledger (retirement / replacement slices only)

Not a retirement, but `markRefunded`/`markRefundFailed` **change contract**, so the ledger
earns its place:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `markRefunded` moves a row in **any** status | changed | guarded to the collected set (`SUCCEEDED`, `REFUNDED`, `PARTIALLY_REFUNDED`) — issue item 2 |
| `markRefunded` returns `void` (caller cannot tell if it moved) | changed | returns `boolean`, matching `markStatus`/`markRefundFailed`; the gateway branches on it |
| `markRefunded` is a 0-row no-op with no payment row (stub profile) | preserved | still 0 rows; now *reported* as `false`, which the stub gateway never sees (it does not call `Payments`) |
| `markRefundFailed` writes `status = SUCCEEDED` unconditionally | changed | still writes `SUCCEEDED`, now **sound by construction**: `markRefunded`'s new guard means the only status a refund record can have replaced is `SUCCEEDED` |
| `markRefundFailed` leaves a stale `refund_id` with no flag | changed | moves it to `failed_refund_id`, NULLs `refund_id`, stamps `refund_failed_at` |
| `markRefundFailed` guard = "a row still recording that refund" | preserved | unchanged `WHERE refund_id = :refundId AND status IN (recorded)`; the four existing ITs still pin it |
| A dead-refund event matching no recorded refund is a `200` debug no-op | changed (narrowly) | still `200`, but now first tries the by-intent fallback, which fires **only** when `refund_attempted_at` is set and no refund is recorded. A manual dashboard refund still no-ops (AC-7) |
| `riviera.refunds.failed` counts observations | preserved | unchanged; the new `riviera.refunds.owed` **gauge** is the distinct-count answer, published beside it, never summed with it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The by-intent fallback fires for a **manual dashboard refund** that failed, raising a money-path alert for money we do not owe | med | med | Fallback is guarded on `refund_attempted_at IS NOT NULL` — set only when *this platform* began a refund for that booking. A dashboard refund on a booking we never refunded leaves it NULL and no-ops (AC-7) | this slice | open |
| R-2 | The by-intent fallback double-reports on a re-delivered failure (Stripe re-delivers; both `refund.failed` and `refund.updated` carry the same death) | high | med | Fallback guard includes `(failed_refund_id IS NULL OR failed_refund_id <> :refundId)`, so the second delivery moves 0 rows — the same idempotency shape as `markRefundFailed`'s existing guard (AC-1 sibling test) | this slice | open |
| R-3 | Guarding `markRefunded` breaks #569's contract tests / `PaymentGatewayRefundContract`, whose fixtures record refunds on rows that were never `SUCCEEDED` | high | med | Fixtures and the two `JdbcPaymentsIT` cases that refund a `REQUIRES_PAYMENT` row are updated to mark `SUCCEEDED` first — which is what production always does. `Payments` **Mockito mocks default `false` for the new boolean**, so every `StripePaymentGatewayTest` refund case must stub it `true` or the gateway will answer `Failed` | this slice | **closed in phase 1** — the two `JdbcPaymentsIT` cases now mark `SUCCEEDED` first, and both Mockito fixtures (`StripePaymentGatewayTest`, `StripeRefundContractTest`) stub `markRefunded` `true` |
| R-4 | `refund_attempted_at` is stamped inside a transaction that has not committed, so the concurrent webhook cannot see it — the fix silently does nothing | med | high | Stamped from `RefundService#refund`, which #404 left **transaction-free** (`BookingRefundListener` dropped `@Transactional`), so it auto-commits before the gateway call. Pinned by an assertion that the stamp is visible from a second connection (`RefundAttemptVisibilityIT`) | this slice | **closed in phase 2** — `RefundAttemptVisibilityIT` goes red if a transaction is ever wrapped round `RefundService#refund` |
| R-5 | Flyway `V42` collides with a parallel slice | low | high | Verified free on `main` at `a6e425e` and unclaimed by every open PR (all 17 are Dependabot, no migrations). Default rule: whoever merges second renumbers | this slice | open |
| R-6 | The new gauge runs a `COUNT(*)` per metrics scrape, adding DB load to the money path | low | low | Partial index `WHERE refund_failed_at IS NOT NULL` makes it an index-only scan over a set that is empty in the healthy case | this slice | open |
| R-7 | Full-suite-only failure class (`riviera-local-debug`): the gauge is a new shared-state bean read by every context | low | med | The gauge reads the DB, holds no accumulating in-JVM state, and adds no filter/scheduler. CI's full suite is the check; do not claim green from scoped runs alone | this slice | open |

## Open questions / Assumptions

- **Assumption:** `RefundService#refund` is never invoked inside a caller-owned transaction,
  so the `refund_attempted_at` stamp commits before the gateway call. Evidence: the only
  production `RefundPort` consumer is `BookingRefundListener`, whose transaction #404
  deliberately dropped; the admin re-drive and the restart republish both re-enter through
  that same listener. — *Owner:* this slice · *Resolves by:* phase 2 (R-4's visibility IT)
- **Assumption:** clearing `refund_failed_at` (but **keeping** `failed_refund_id`) on a
  successful later record is the wanted semantics — the flag means "owed **now**", the id
  keeps the last death for traceability. — *Owner:* this slice · *Resolves by:* phase 1

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path in this slice touches
`availability(set_id, booking_date)`; the slice is confined to the `payment` row's refund
columns. The adjacent invariant-#2 concern — a webhook `503` loop getting the shared Stripe
endpoint disabled, which would strand paid bookings in `AWAITING_PAYMENT` holding their
claim — is precisely why the `503`-defer option is a **Non-goal** here.

**Concurrency does matter, on a different row.** Two writers race for the same `payment`
row: the webhook's un-record and the gateway's record.

- **Strategy:** every refund write is a **single guarded `UPDATE`**, never a read-then-write,
  so the row's own lock serializes the two writers and the loser observes it by getting 0
  rows. No `SELECT … FOR UPDATE` is needed — there is one row and one statement per writer.
- **Ordering-independence:** whichever commits first, the outcome is the same — either the
  record lands and the un-record then matches it (the existing `markRefundFailed` path), or
  the tombstone lands and the record is refused (AC-2). The lost update the issue reports is
  exactly the case where neither guard existed.
- **Visibility:** Postgres READ COMMITTED takes a fresh snapshot per statement, so the
  gateway's `markRefunded` sees a tombstone the webhook committed after the gateway's own
  earlier statements ran. Pinned by `RefundAttemptVisibilityIT`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | The refund record, its guards, and the webhook that reconciles it are all this module's Job ("Stripe collection — PaymentIntents, refunds, and webhook handling") |
| M-2 | `shared` | existing | — (not a bounded context) | One metric-name constant joins `ObservabilityMetrics`, which is already the single home of metric names |

**Cross-module named interfaces (`api/` ports)**

`N/A — no published surface changes.` `Payments` is `payment`'s **internal** driven port
(`application/`, implemented by `adapter/out/JdbcPayments`) — it is not published and needs
no `api`/`spi` promotion (`riviera-modulith` §api-vs-spi: the module's own `adapter/out`
implements it). `payment`'s `allowedDependencies = { "shared" }` is unchanged.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event added, moved, or renamed`, so no Flyway `event_type` rewrite is owed. The
refund un-record deliberately publishes nothing: no other module's state depends on it
(`StripeWebhookController` javadoc; #592).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Guard the refund record against a non-collected payment (item 2) | `payment` | `payment` Job: owns the collection record and its state machine. Not on any other module's list; it is *execution* hygiene, not a refund **decision** (which `booking` owns — `payment`'s Not-My-Job: "deciding whether/how much to refund → `booking`") |
| Mark a refund the gateway reported dead **before** it was recorded (item 1) | `payment` | Same Job line: reconciling refund state from a signature-verified webhook. `booking` is untouched — nothing re-decides the refund; the amount `booking` already decided is simply retried by the existing publication |
| Record that a refund attempt is in flight (`refund_attempted_at`) | `payment` | The discriminator is a fact about *this module's own gateway conversation*. Asking `booking` whether a cancellation refund was decided would invert the dependency (`payment → booking`) and close a cycle |
| The owed-refund trace + gauge (item 3) | `payment` emits, `shared` names | Matches the existing `riviera.refunds.failed`/`.adopted` split: `ObservabilityMetrics` (shared kernel) owns metric **names** only; `payment` owns the emission — `RESPONSIBILITIES.md` §`shared` |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook, not the client redirect. Unchanged.
  This slice extends the same principle to the refund lifecycle: the gateway's **later**
  word beats the create call's request-time answer.
- **Idempotency:** unchanged at the gateway (`booking-<id>-refund`) and at the webhook
  (`stripe_webhook_event.event_id` PK). New: both new writes are guarded so a re-delivery
  moves 0 rows (R-2).
- **Money:** integer minor units, EUR. No arithmetic added — `refunded_minor` is only ever
  set to a value the caller already computed, or cleared to `0`.
- **Payout-ledger effect:** **none.** `payout` reacts to `BookingCancelled`, not to the
  refund's gateway outcome, and this slice publishes no event — so the accrual/reversal
  pair is untouched and invariant #9's exactly-once is unaffected. Worth stating because it
  is the natural worry: a refund that dies does **not** un-reverse the ledger, and should
  not — the booking is still cancelled.
- **Refund policy applied:** unchanged (`booking` decides; this module executes).
- **Pinning tests:** `JdbcPaymentsIT`, `StripeWebhookIT`, `StripePaymentGatewayTest`,
  `PaymentGatewayRefundContract` (unchanged contract, updated fixture), `PaymentMigrationIT`,
  `RefundAttemptVisibilityIT`.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape changes; the webhook's
responses (`200`/`400`/`503`) are unchanged.

## Execution status

**Stage pointer:** `PR #596 — draft, marking ready for review`

**Next action:** Mark PR #596 ready for review, then run the Review gate (pr-gates §1
ladder + `riviera-review-overlay`) and the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `V42` migration: the refund-failure trace columns | ✅ | `0f30527` |
| 1 — Guard the refund record; make the un-record leave a trace (items 2 + 3a) | ✅ | `3826949` |
| 2 — Close the race: attempt stamp, by-intent fallback, gateway refusal (item 1) | ✅ | `55f18b4` |
| 3 — Owed-refund gauge + docs sweep (item 3b) | ✅ | `30e8cd5` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI — `Repo hygiene (diff-scoped)` | The plan's File-structure section omitted `StripeRefundContractTest.java` and listed `RefundAttemptVisibilityIT.java` under the wrong package; a multi-line inline comment in `JdbcPayments` (RV-STYLE-1) was re-flagged because this diff rewrote its opening line | fixed-in-``30e8cd5`` |
| F-2 | CI — `Backend (build + test)` | `RefundFailureMetricTest` used the strict `ThrowingPayments`, which now throws on the new `markRefundAttempted` — a full-suite-visible break my scoped runs missed because that class was not in the `--tests` selection | fixed-in-``30e8cd5`` (shared `AttemptRecordingPayments` double; scoped runs widened to `ai.riviera.platform.payment.*` + `*Refund*`) |

---

## File structure

- `docs/plans/refund-failure-race-and-queryable-trace.md` — this plan
- `platform/src/main/resources/db/migration/V42__payment_refund_failure_trace.sql` — the three nullable columns + the partial index
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — port: `markRefunded` → `boolean`, plus `markRefundAttempted`, `markUnrecordedRefundFailed`, `owedRefundCount`
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — the guarded SQL for all of the above
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundService.java` — stamps the attempt before delegating to the gateway
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundOwedGauge.java` — binds `riviera.refunds.owed` to the port read
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripePaymentGateway.java` — refuses to report success when the record was refused
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/StripeWebhookController.java` — the by-intent fallback on the dead-refund branch
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `REFUNDS_OWED`
- `platform/src/test/java/ai/riviera/platform/payment/PaymentMigrationIT.java` — AC-8
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — AC-1, AC-2, AC-4, AC-5, AC-6
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundAttemptVisibilityIT.java` — R-4: the stamp is committed before the gateway call
- `platform/src/test/java/ai/riviera/platform/payment/application/AttemptRecordingPayments.java` — the shared `Payments` double that tolerates the attempt write
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundFailureMetricTest.java` — uses that double instead of the strict one
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefundContractTest.java` — the contract fixture stubs the record as accepting
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePaymentGatewayTest.java` — AC-3 + the `markRefunded` stubbing (R-3)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/in/StripeWebhookIT.java` — AC-1, AC-7
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentServiceTest.java` — `Payments` test double signature
- `platform/src/test/java/ai/riviera/platform/payment/application/ThrowingPayments.java` — `Payments` test double signature
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundServiceTest.java` — the attempt stamp is made before delegating
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — `Payments` stub signature
- `RESPONSIBILITIES.md` — §`payment`: the three residuals, closed
- `docs/runbooks/observability.md` — the owed-refund enumeration query, the new gauge row, the new `refund_died_before_record` reason
- `CLAUDE.md` — the `payment` module row, if the counting sweep says it went stale

---

## Phase 0 — `V42` migration: the refund-failure trace columns

**Files:** Create `platform/src/main/resources/db/migration/V42__payment_refund_failure_trace.sql` · Test `platform/src/test/java/ai/riviera/platform/payment/PaymentMigrationIT.java`

- [ ] **Step 1: Write the failing test** — `PaymentMigrationIT.refundFailureTraceColumnsAdmitAnOwedRefund`:
      insert a `SUCCEEDED` payment, `UPDATE` it to set `refund_failed_at = NOW()` and
      `failed_refund_id = 're_dead'` with `refunded_minor = 0`, and assert the row reads back —
      i.e. the columns exist, are nullable, and the CHECK constraints admit "collected, nothing
      refunded, a refund died".
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*PaymentMigrationIT*"` → FAIL, `column "refund_failed_at" of relation "payment" does not exist`
- [ ] **Step 3: Minimal implementation** — `V42__payment_refund_failure_trace.sql`, additive only:
      `refund_attempted_at TIMESTAMPTZ`, `refund_failed_at TIMESTAMPTZ`, `failed_refund_id TEXT`,
      plus `CREATE INDEX payment_refund_owed_idx ON payment (booking_ref) WHERE refund_failed_at IS NOT NULL`.
      No `NOT NULL`, no default, no status-token change (all three are NULL for every existing row,
      which is the correct history: no attempt recorded, no failure observed).
- [ ] **Step 4: Run it, verify it passes** — same command → PASS
- [ ] **Step 5: Generalization-audit pass** — search for other places that read `payment` columns
      positionally or `SELECT *` (a new column would break them).
- [ ] **Step 6: Commit** — `git commit -m "Add the payment refund-failure trace columns (#594)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Guard the refund record; make the un-record leave a trace

**Files:** Modify `Payments.java`, `JdbcPayments.java`, `StripePaymentGateway.java` · Test `JdbcPaymentsIT.java`, `StripePaymentGatewayTest.java`

Closes issue items **2** and the write half of **3**.

- [ ] **Step 1: Write the failing tests** — `JdbcPaymentsIT.markRefundedRefusesAnUncollectedPayment`
      (AC-4: a `REQUIRES_PAYMENT` / `FAILED` / `CANCELED` row does not move and reports `false`)
      and `JdbcPaymentsIT.markRefundFailedLeavesAQueryableTrace` (AC-5: after the un-record,
      `refund_id IS NULL`, `failed_refund_id` = the dead refund, `refund_failed_at` set).
      **Update the two existing cases that refund a `REQUIRES_PAYMENT` row on purpose**
      (`markRefundedFullMovesToRefunded`, `markRefundedPartialMovesToPartiallyRefunded`) to mark
      `SUCCEEDED` first — production always has (R-3).
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*JdbcPaymentsIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `markRefunded` returns `boolean` and gains
      `AND status IN (:collected)` (the named `REFUND_COLLECTED_STATUSES` constant, in lockstep
      with the SQL); `markRefundFailed` additionally writes `refund_id = NULL`,
      `failed_refund_id = :refundId`, `refund_failed_at = NOW()`; `markRefunded` clears
      `refund_failed_at` (a booking whose retry succeeded is no longer owed) while **keeping**
      `failed_refund_id`. Both gateway call sites branch on the new `boolean`.
- [ ] **Step 4: Run it, verify it passes** — `--tests "*JdbcPaymentsIT*" --tests "*StripePaymentGatewayTest*" --tests "*StripeRefundContractTest*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — every `Payments` implementor/double must gain the
      new signature: `WebSliceStubs`, `ThrowingPayments`, `PaymentServiceTest`.
- [ ] **Step 6: Commit** — `git commit -m "Guard the refund record and trace the un-record (#594)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Close the race: attempt stamp, by-intent fallback, gateway refusal

**Files:** Modify `Payments.java`, `JdbcPayments.java`, `RefundService.java`, `StripeWebhookController.java`, `StripePaymentGateway.java` · Test `JdbcPaymentsIT.java`, `RefundAttemptVisibilityIT.java`, `StripeWebhookIT.java`, `RefundServiceTest.java`, `StripePaymentGatewayTest.java`

Closes issue item **1**.

- [ ] **Step 1: Write the failing tests** — `JdbcPaymentsIT.markUnrecordedRefundFailedMarksTheRacingAttempt`
      (AC-1), `.markRefundedRefusesARefundAlreadyReportedDead` (AC-2), the re-delivery sibling (R-2),
      `StripeWebhookIT.aRefundFailureRacingItsOwnRecordIsNotLost` (AC-1) and
      `.aManualDashboardRefundFailureRaisesNoMoneyPathAlert` (AC-7),
      `StripePaymentGatewayTest.refundThatDiedBeforeItsRecordIsReportedFailed` (AC-3),
      `RefundAttemptVisibilityIT` (R-4: the stamp is visible from a second connection before the
      gateway call returns).
- [ ] **Step 2: Run it, verify it fails** — `--tests "*JdbcPaymentsIT*" --tests "*StripeWebhookIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `markRefundAttempted(BookingRef)` stamped from
      `RefundService#refund` before delegating; `markUnrecordedRefundFailed(intentId, refundId)`
      guarded on `refund_attempted_at IS NOT NULL AND refund_id IS NULL AND status = 'SUCCEEDED'
      AND (failed_refund_id IS NULL OR failed_refund_id <> :refundId)`;
      `StripeWebhookController#onRefundDied` tries the recorded un-record first, then the fallback,
      reporting (counter + WARN) on either; `markRefunded`'s existing `failed_refund_id <> :refundId`
      guard from phase 1 is what refuses the corpse, and the gateway maps the refusal to
      `RefundResult.Failed("refund_died_before_record")`.
- [ ] **Step 4: Run it, verify it passes** — the four classes above, then the structural net
      (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`).
- [ ] **Step 5: Generalization-audit pass** — does the same race exist on the **collection** path
      (`register` after `paymentIntents().create`)? Record the finding either way: a PaymentIntent
      id is recorded before any event about it can exist (the issue says so), so the answer is
      expected to be "no" — but write down the search.
- [ ] **Step 6: Commit** — `git commit -m "Stop losing a refund failure that races its own record (#594)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Owed-refund gauge + docs sweep

**Files:** Create `RefundOwedGauge.java` · Modify `Payments.java`, `JdbcPayments.java`, `ObservabilityMetrics.java`, `RESPONSIBILITIES.md`, `docs/runbooks/observability.md`, `CLAUDE.md` · Test `JdbcPaymentsIT.java`

Closes the read half of issue item **3**.

- [ ] **Step 1: Write the failing test** — `JdbcPaymentsIT.owedRefundCountCountsDistinctOwedRefunds` (AC-6).
- [ ] **Step 2: Run it, verify it fails** — `--tests "*JdbcPaymentsIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `Payments#owedRefundCount()` over the partial index;
      `REFUNDS_OWED = "riviera.refunds.owed"` in `ObservabilityMetrics` with the "never sum it with
      `REFUNDS_FAILED`" note the class already applies to its siblings; `RefundOwedGauge` binds it.
- [ ] **Step 4: Run it, verify it passes** — `--tests "*JdbcPaymentsIT*" --tests "*MoneyPathAlertCheckTest*"` → PASS
- [ ] **Step 5: Docs sweep** — `RESPONSIBILITIES.md` §`payment` records all three residuals closed
      and **why the hard-coded `SUCCEEDED` restore is now sound** rather than lucky; the runbook
      gains the enumeration query, the gauge row, and the `refund_died_before_record` reason beside
      the existing five shapes (it will then read "six shapes" — the counting sweep
      `riviera-docs-freshness` exists for).
- [ ] **Step 6: Commit** — `git commit -m "Count and enumerate the refunds the platform still owes (#594)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | Phase 2 | Does the same "recorded after the gateway already knows" race exist on the **collection** path? | read `StripePaymentGateway#initiate` + `Payments#register` | 1 (`register` after `paymentIntents().create`) | **No fix needed, and the reason is not symmetry:** a PaymentIntent id is minted *and recorded* before Stripe can emit any event naming it, and `markStatus`'s open-state guard already makes a late event a no-op rather than a loss. The refund case differs because the gateway knows the refund first |
| 2026-08-10 | F-2 (CI) | Every `Payments` implementor/double that must tolerate the two new writes | `grep -rn "new RefundService(\|ThrowingPayments() {" --include=*.java platform/src/test` | 3 constructions, 3 doubles (`WebSliceStubs`, `ThrowingPayments`, `PaymentServiceTest`) | Fixed all: strict double kept strict, shared `AttemptRecordingPayments` added for the two refund-seam tests. `RefundServiceTest.serviceWithState` needed nothing — its cases never call `refund()` |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** Run `gradle --no-daemon --console=plain test --tests "*JdbcPaymentsIT*" --tests "*StripeWebhookIT*" --tests "*StripePaymentGatewayTest*" --tests "*RefundAttemptVisibilityIT*"` → all PASS.
- [ ] **AC-8:** Run `gradle --no-daemon --console=plain test --tests "*PaymentMigrationIT*"` → PASS.
- [ ] **Structural net:** `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.
- [ ] **Full suite:** green on the PR's CI run (the only place the shared-context failure class shows).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A`; the payment-row race is documented instead).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event changed (invariant #11).
- [ ] **Payment/payout** section filled; webhooks remain the source of truth; both new writes idempotent; money in minor units; the payout ledger is untouched (invariants #5, #8, #9).
- [ ] Refund policy still enforced server-side by `booking` (invariant #10) — this slice adds no decision.
- [ ] Timezone correct: `TIMESTAMPTZ` columns, `NOW()` server-side (invariant #6).
- [ ] Booking codes unguessable (invariant #7) — untouched; no refund id or booking code added to a log line that did not already carry it.
- [ ] Flyway migration present; the new columns' behavior tested (invariant #12).
- [ ] **Frontend** — `N/A`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` reports nothing.
- [ ] **Close-out written in THIS PR** — final plan state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
