# Guarded payout-batch status transition — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the payout-batch status transition a single guarded statement, so two
concurrent admin marks can never regress a batch (`SETTLED` → `REPORTED`).

**Architecture:** Replace the check-then-act pair (`findById` → `canTransitionTo` →
unconditional `UPDATE`) with the codebase's existing guarded-transition idiom — a single
`UPDATE … WHERE id = :id AND status = :expected RETURNING …`, empty result ⟺ no row
transitioned. This is the same shape as `JdbcBookings#confirmReturningFacts` and
`JdbcPayments#markStatus`; `payout_batch` is the only status write in the repo that
lacked it. `RETURNING` also makes the success payload the row **as persisted**, rather
than an echo assembled from the pre-update read.

**Persistence:** JDBC only (invariant #1). Table `payout_batch` — **no migration**: the
fix is a `WHERE` clause, not DDL. The `status` `CHECK` (V15) is unchanged.

**Source of intent:** GitHub issue #571

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — verified every
claim in #571 against today's code and ran the generalization sweep that proved
`updateStatus` is the sole unguarded status write) · `riviera-plan-doc` (this template —
forced the Payment & payout section, which is where the invariant-#9 argument got written
down) · `tdd` (the guard is proven by a test that goes red against an unguarded UPDATE
before the `WHERE` clause is added — see Phase 0 steps 2–5) · `riviera-review-overlay`
(**ran** at ready-for-review, layered on `/code-review` at high effort per the money rule —
6 findings, 4 fixed, 1 skipped, 1 deferred; see the findings register) · `riviera-docs-freshness`
(**ran** pre-merge over `origin/main...HEAD`, **0 findings** — the rename grep shows no substrate
doc or skill cites `updateStatus`, and the counting sweep finds no claim this slice falsifies:
`CLAUDE.md`'s payout row and `CONTEXT.md`'s *Payout batch* entry describe ownership and
vocabulary, neither of which moved) · `riviera-java-conventions` (typed outcome
kept as the sealed `BatchStatusOutcome`; text-block SQL with named params; `Optional`
from the port rather than a sentinel) · `riviera-modulith` (confirmed the change stays on
an internal `application/` port + package-private `adapter/out` — no published surface,
no `allowedDependencies` change) · `postgres` (the guarded conditional UPDATE and why it
is atomic under READ COMMITTED — see R-1) · `riviera-stripe-payments` (the batch status
IS the record of what has been paid by BKT; that framing set the severity)

**Branch:** `bugfix/guarded-payout-batch-transition`

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a batch that is `SETTLED`, when a transition is attempted with
      `expected = DRAFT`, then no row changes and the port reports no transition.
      *Pinned by:* `JdbcPayoutBatchesIT.staleTransitionCannotRegressStatus`
- [x] **AC-2:** Given a batch whose status advanced **past** the requested target after the
      service read it, when `mark` runs, then the outcome is `IllegalTransition` carrying the
      **actual current** status — never a false `Marked`. (A batch that landed **on** the
      requested target is `Marked` — F-1.)
      *Pinned by:* `PayoutReportServiceTest.lostRaceReportsActualStatus` and
      `PayoutReportServiceTest.aBatchAlreadyAtTheRequestedTargetIsReportedMarked`
- [x] **AC-3:** Given an uncontended `DRAFT` batch, when `mark(REPORTED)` runs, then the
      outcome is `Marked` carrying the batch **as persisted**.
      *Pinned by:* `PayoutReportServiceTest.markedCarriesThePersistedRow` and the existing
      `PayoutBatchGenerationIT.lifecycleAdvancesAndFreezesReported`
- [x] **AC-4:** Given an unknown batch id, when `mark` runs, then the outcome is `NotFound`
      (→ 404) and no row is written. *Pinned by:* the existing
      `PayoutBatchGenerationIT.rejectsIllegalTransitionAndUnknownBatch`
- [x] **AC-5:** Given a batch that vanished between the read and the guarded update, when
      `mark` runs, then the outcome is `NotFound`, not a false `IllegalTransition`.
      *Pinned by:* `PayoutReportServiceTest.lostRaceOnMissingBatchIsNotFound`

## Non-goals

- Changing `BatchStatusOutcome`'s variants or the controller's status mapping — the fix
  reuses `IllegalTransition` → `409`, so `AdminPayoutBatchController` is untouched.
- Adding an optimistic-concurrency version column to `payout_batch`. The status column is
  itself the guard; a version column would be a second mechanism for the same job.
- Auditing *who* raced (an admin action log). Out of scope; the loser already gets a `409`.
- Revisiting the `DRAFT → REPORTED → SETTLED` lifecycle or allowing backward moves.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `mark` returns `NotFound` for an unknown id (→ 404) | preserved | the pre-read still runs first; unchanged |
| `mark` returns `IllegalTransition(from, to)` for an illegal move (→ 409) | preserved | `canTransitionTo` check unchanged; the guarded 0-row case now maps here too |
| `mark` returns `Marked(batch)` on success (→ 200) | changed | payload now comes from `RETURNING` (the row as persisted) instead of being rebuilt from the pre-update read — same values uncontended, truthful under contention |
| `updateStatus` stamps `updated_at = NOW()` | preserved | same `SET` clause, now inside the guarded statement |
| Two admins marking the **same** target concurrently both get `200 Marked` | preserved | initially dropped by the guard (the loser got a 409 naming `REPORTED → REPORTED`); restored at the review gate — `lostRace` reports `Marked` when the batch already sits at the requested target, so only the write itself is exclusive, not the answer (F-1) |
| An unconditional write regressed a raced batch | **dropped (the bug)** | `AND status = :expected` makes the loser a 0-row no-op |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The guard is assumed atomic but isn't, and the race survives the fix | low | high | A single `UPDATE … WHERE status = :expected` is atomic: under READ COMMITTED the statement blocks on the concurrent writer's row lock, then re-evaluates its own `WHERE` against the **latest** row version (EvalPlanQual) — so the loser matches 0 rows. This is the same mechanism that made #391's data-modifying CTE unsafe, applied in the direction where it helps: the predicate lives in the UPDATE, not in a separate outer SELECT | Ivo | closed — `staleTransitionCannotRegressStatus` proves it against real Postgres in `ba97ccd4` |
| R-2 | The regression test passes against the buggy code, proving nothing (#391's second lesson) | med | high | Phase 0 lands the signature change with the **unguarded** SQL first and runs the test to observe RED, then adds the `WHERE` clause. The red run is recorded in the phase table, not assumed | Ivo | closed — red run observed: 4 of the 5 new tests failed against the unguarded write (`10 tests completed, 4 failed`), all green after the guard |
| R-3 | `Marked` now echoes `RETURNING`, so a concurrent `upsertDraft` refresh of a still-`DRAFT` batch changes the reported total | low | low | This is the improvement, not a regression: the response reports what was persisted. Called out in the parity ledger so review reads it as intended | Ivo | closed — pinned by `markedCarriesThePersistedRow`, which fails if the payload is rebuilt from the pre-read |
| R-4 | Sonar S1192 (duplicated string literals) on the new named params | med | low | Bind through `private static final` param-name constants, matching `JdbcBookings`/`JdbcPayments` (`riviera-java-conventions` §6a) | Ivo | closed — not needed: after the change the file's most-repeated literals are `"id"` and `"period"` at ×2 each, under S1192's threshold of 3. Kept inline to match the file's existing style; revisit if a fourth statement lands |
| R-5 | Signature change ripples beyond the module | low | low | `updateStatus` has exactly one caller (`PayoutReportService:83`) and one implementation (`JdbcPayoutBatches:78`), both inside `payout`; the port is internal to `application/`, not published | Ivo | closed — confirmed by compilation; the diff touches 5 files, all under `payout` |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Assumption:** `payout_batch` rows are never deleted, so AC-5's "vanished between read
  and update" is defensive rather than reachable today. — **Resolved:** handled anyway; the
  empty-`Optional` branch re-reads and returns `NotFound` when the row is gone, which cost one
  `orElseGet` in `PayoutReportService#lostRace` and keeps the 404/409 split honest if a purge is
  ever added (`ba97ccd4`).

## Availability & concurrency (invariant #2)

`N/A — does not touch availability.` The slice writes only `payout_batch.status`; no
`availability(set_id, booking_date)` row, no set claim or release, no booking transition.
The concurrency reasoning that *does* apply to this slice is R-1 above, and it is the same
guarded-single-statement discipline invariant #2 mandates for the claim path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payout` | existing | `PayoutBatch` | `payout` Job: owns the venue payout ledger and the manual BKT batch reporting, including the batch lifecycle |

**Cross-module named interfaces (`api/` ports)**

`N/A — no published surface changes.` `PayoutBatches` is an internal port in
`payout.application`, implemented by the package-private `payout.adapter.out.JdbcPayoutBatches`.
`payout` publishes no `api/`, `spi/`, `vocabulary/`, or `events/` surface, and this slice
does not create one. No `allowedDependencies` change.

**Domain events (id-based payloads, invariant #11)**

`N/A — no events published or consumed by this slice.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Enforce the forward-only batch transition atomically at the write | `payout` | `payout` Job: "the venue payout ledger …, manual BKT batch reporting; accrual/reversal is order-independent and idempotent". The batch lifecycle is `payout`'s own state machine (`BatchStatus` lives in `payout.domain`); no other module's **Not My Job** list claims it, and none reads `payout_batch` |

All in `payout`, no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch (ADR-0002).
  Unchanged by this slice.
- **Confirmation trigger:** `N/A — no payment confirmation in scope.`
- **Idempotency:** the transition becomes idempotent in the sense that matters here — a
  replayed or raced mark whose expected status no longer holds is a 0-row no-op, not a write.
- **Money:** untouched. `total_net_minor` is read and echoed, never recomputed; still integer
  minor units (invariant #5).
- **Payout-ledger effect:** **none** — no `payout_ledger_entry` row is written, read, or
  reversed. The slice touches only `payout_batch.status`, which records *where a period's
  payout stands*, not what is owed.
- **Invariant #9 (auditable ledger):** the batch status is the platform's record of **what
  has actually been paid** — `SETTLED` means the founder made the BKT transfer. Silently
  regressing it to `REPORTED` destroys that record and invites a second transfer for a
  period already paid. The guard makes the status a strictly forward, atomically enforced
  fact, which is what "auditable" requires. `upsertDraft` already protects the *total* this
  way (`WHERE payout_batch.status = 'DRAFT'`); this slice extends the same protection to
  the *status*.
- **Refund policy applied:** `N/A — no refund path in scope.`
- **Pinning tests:** `PayoutBatchGenerationIT.staleTransitionCannotRegressStatus`,
  `PayoutReportServiceTest.lostRaceReportsActualStatus`

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` `PUT /api/admin/payout-batches/{id}/status` keeps its request
shape and its three outcomes (200 / 404 / 409). A racing admin now receives `409` where it
previously received a false `200`; that is the bug being fixed, and `409` is already a
documented response for this endpoint.

## Execution status

**Stage pointer:** `merge close-out — all gates cleared, awaiting the maintainer's go-ahead to merge`

**Next action:** Merge **via PR #652**. Merging `main` deploys to Render (`deploy.yml`), so the
merge itself is the maintainer's call, not the agent's. After merging: confirm #571 closed
(the PR's `Closes` does it) — there is no parent epic to tick, and both deferred findings
already have homes (#653, #654).

**Slice closed out via PR #652.**

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Guard the transition | ✅ | plan `39a45f44`, fix `ba97ccd4`, status `9aad86c3` |
| 1 — Review-gate fixes (F-1/F-2/F-3/F-5) | ✅ | `d76e3623`, plan `48a21256` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Local verification (scoped per `riviera-local-debug`; CI owns the full suite):**
`./gradlew test --tests "*payout*" --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
--tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`
→ BUILD SUCCESSFUL. Docker was available, so the Testcontainers ITs ran rather than skipping —
`staleTransitionCannotRegressStatus` is verified against real Postgres, not skipped.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (high) | Losing a race **to the same target** returned `IllegalTransition(from == to)` → a 409 naming a transition nobody attempted, and an unlisted parity change (both callers used to get 200) | fixed in `d76e3623` — `lostRace` reports `Marked` when the batch already sits at the requested target; pinned by `aBatchAlreadyAtTheRequestedTargetIsReportedMarked` |
| F-2 | review (high) | `lostRace`'s re-read only reports the true status under READ COMMITTED, and nothing at the call site said so | fixed in `d76e3623` — stated on the method's Javadoc, including what a snapshot isolation level would hide |
| F-3 | review (high) | `rejectsAnIllegalTransitionWithoutAttemptingTheWrite` never verified the write was skipped, so the name promised a guarantee nothing enforced | fixed in `d76e3623` — `verify(batches, never()).transition(…)` |
| F-4 | review (high) | No test exercises the lost-race path end to end: the guard is proven at the adapter, the mapping only against mocks | deferred → **issue #653**. Closing it needs a Mockito spy bean or a delegating double, i.e. a second Spring context and a pattern the repo doesn't use, to pin a Postgres/Spring isolation guarantee rather than our own logic — which F-1/F-3 now cover at both levels |
| F-5 | review (high) | Adapter-level SQL test was bolted onto the service-level generation IT, which had to autowire the internal port | fixed in `d76e3623` — moved to `JdbcPayoutBatchesIT` beside its adapter, matching `JdbcPaymentsIT` / `JdbcBookingsTransitionIT`; the generation IT is back to driving the facade only |
| F-6 | review (high) | SQL bind names inline where sibling adapters hoist `PARAM_*` constants | skipped — `"id"`/`"period"` appear ×2, under S1192's threshold of 3, and the rest of this file binds inline; hoisting only this statement would make the file less consistent, not more. Revisit if a third guarded statement lands (also R-4) |
| F-7 | tooling (found at the gate) | `scripts/check-plan-file-structure.mjs --diff origin/main` reported clean while `JdbcPayoutBatchesIT.java` was untracked — `git diff` cannot see untracked files, so the guard false-cleans exactly when a slice **adds** a file, its most likely omission | deferred → **issue #654**; worked around here by staging before re-running. CI sees the committed diff, so it would have failed the PR rather than shipping the gap |

---

## File structure

- `docs/plans/guarded-payout-batch-transition.md` — this plan
- `platform/src/main/java/ai/riviera/platform/payout/application/PayoutBatches.java` — port: `updateStatus` → guarded `transition` returning `Optional<PayoutBatch>`
- `platform/src/main/java/ai/riviera/platform/payout/adapter/out/JdbcPayoutBatches.java` — the guarded `UPDATE … WHERE status = :expected RETURNING …`
- `platform/src/main/java/ai/riviera/platform/payout/application/PayoutReportService.java` — `mark` maps a 0-row transition to the actual current status
- `platform/src/test/java/ai/riviera/platform/payout/application/PayoutReportServiceTest.java` — NEW: lost-race outcome mapping at the seam (mocked port, no DB)
- `platform/src/test/java/ai/riviera/platform/payout/adapter/out/JdbcPayoutBatchesIT.java` — NEW: the SQL guard against real Postgres, beside its adapter like `JdbcPaymentsIT` (review finding F-5)
- `platform/src/test/java/ai/riviera/platform/payout/PayoutBatchGenerationIT.java` — reverted to its facade-only shape when F-5 moved the adapter test out

---

## Phase 0 — Guard the transition

**Files:** Modify `PayoutBatches.java` · `JdbcPayoutBatches.java:78-83` ·
`PayoutReportService.java:74-88` · Create `PayoutReportServiceTest.java` · Modify
`PayoutBatchGenerationIT.java`

- [x] **Step 1: Write the failing tests** — `PayoutReportServiceTest` (fakes at the
      `PayoutBatches` seam: `findById` reports `DRAFT`, `transition` reports no row, assert
      `IllegalTransition` carries the actual `SETTLED`) and
      `PayoutBatchGenerationIT.staleTransitionCannotRegressStatus` (settle a batch, then call
      `transition(id, DRAFT, REPORTED)` and assert empty + row still `SETTLED`).

- [x] **Step 2: Land the signature change with the SQL still UNGUARDED** — `transition`
      returning `Optional<PayoutBatch>` via `UPDATE … WHERE id = :id RETURNING …`, no
      `AND status`. This reproduces today's bug behind the new shape.

- [x] **Step 3: Run them, verify they FAIL** —
      `./gradlew test --tests "*PayoutReportServiceTest*" --tests "*PayoutBatchGenerationIT*"`
      → FAIL: the unguarded UPDATE returns the row, so the IT sees `REPORTED` where it
      asserted `SETTLED`, and the service returns `Marked`. **This red run is the point of
      the phase (R-2) — record it in the phase table.**

> Scope: target these two classes with `--tests`. Not the full suite.

- [x] **Step 4: Add the guard** — `AND status = :expected` in the adapter; `mark` maps the
      empty `Optional` through a re-read to `IllegalTransition(actual, target)` or `NotFound`.

- [x] **Step 5: Run them, verify they PASS** — same command → PASS.

> Scope (end-of-phase regression): broaden to `--tests "*payout*"`.

- [x] **Step 6: Generalization-audit pass**

Population `every SQL statement in the repo that writes a status column` → enumerate
`grep -rn --include=*.java "SET status" platform/src/main/java` → candidates
`JdbcOperators` (×2), `JdbcPayments`, `JdbcBookings` (×10), `JdbcPayoutBatches` →
decision: recorded in the log below. Run **before** the fix so the sweep is honest.

- [x] **Step 7: Commit** — `git commit -m "Guard the payout batch status transition (#571)"`

- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-13 | Phase 0 (pre-fix, issue-intake grill) | Every SQL statement that writes a `status` column — the mechanism the defect needs is *a status write whose predicate does not pin the expected prior status*, not "code that looks like `updateStatus`" | `grep -rn --include=*.java "SET status" platform/src/main/java` | 14 across 4 adapters: `JdbcOperators` ×2 (`WHERE id AND status = :pending` / `= :expected`), `JdbcPayments.markStatus` (`WHERE payment_intent_id AND status IN (:open)`), `JdbcBookings` ×10 (all `WHERE … AND status = :…`, several `RETURNING`), `JdbcPayoutBatches.updateStatus` (`WHERE id` only) | Fix the one unguarded site. The other 13 already carry the guard — `payout_batch` was the sole exception, confirming #571's claim rather than widening it |

---

## Acceptance-criteria verification (final)

All five were run together as
`./gradlew test --tests "*PayoutReportServiceTest*" --tests "*PayoutBatchGenerationIT*"` —
**RED before the guard** (`10 tests completed, 4 failed`), **BUILD SUCCESSFUL** after it.

- [x] **AC-1:** `PayoutBatchGenerationIT.staleTransitionCannotRegressStatus` → PASS (real Postgres). Verified at commit `ba97ccd4`.
- [x] **AC-2:** `PayoutReportServiceTest.lostRaceReportsActualStatus` → PASS. Verified at commit `ba97ccd4`.
- [x] **AC-3:** `PayoutReportServiceTest.markedCarriesThePersistedRow` + `PayoutBatchGenerationIT.lifecycleAdvancesAndFreezesReported` → PASS. Verified at commit `ba97ccd4`.
- [x] **AC-4:** `PayoutBatchGenerationIT.rejectsIllegalTransitionAndUnknownBatch` → PASS. Verified at commit `ba97ccd4`.
- [x] **AC-5:** `PayoutReportServiceTest.lostRaceOnMissingBatchIsNotFound` → PASS. Verified at commit `ba97ccd4`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section justified N/A (no availability write in scope).
- [x] Pool + cutoff rules honored (invariants #3, #4) — not in scope.
- [x] **Modulith** section filled; no cross-module imports added; no published surface change (invariant #11).
- [x] **Payment/payout** section filled; payout ledger untouched; batch status now atomically forward-only (invariant #9).
- [x] Refund policy enforced server-side (invariant #10) — not in scope.
- [x] Timezone correct (invariant #6) — `updated_at = NOW()` unchanged.
- [x] Booking codes unguessable (invariant #7) — not in scope.
- [x] No schema change, so no Flyway migration (invariant #12) — verified: the fix is a `WHERE` clause.
- [x] **Frontend** N/A — backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final plan state committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
