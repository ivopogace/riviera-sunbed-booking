# Refund Idempotency Beyond Stripe's Key Window Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cancellation refund is paid **at most once per booking**, including when the
outbox replays the refund listener days later — after Stripe has pruned the idempotency key
that is today the only thing preventing a second refund.

**Architecture:** The single significant decision is **where the "already refunded?" answer
comes from**: the adapter asks **Stripe** (list the refunds on the booking's PaymentIntent)
before creating one, and adopts a live refund it finds instead of creating a second. It
deliberately does **not** short-circuit on the local `payment.refunded_minor`, even though
that read is cheaper — the local row is *derived* state, and trusting derived state over the
gateway is the same class of mistake as trusting the pruned key (invariant #8: Stripe is the
source of truth for payment state). A secondary change mirrors `initiate`'s existing
same-key replay on `ApiConnectionException` so the common lost-response case resolves
*inside* the key window and never reaches the days-later replay at all.

**Persistence:** JDBC only (invariant #1). **No migration** — the fix needs no new column;
`payment.refunded_minor` / `refund_id` (V11) already carry what is recorded. `V11`'s comment
asserting "at most one refund per booking (one idempotency-keyed gateway call)" is now only
half true, but **V11 is applied and must not be edited** (Flyway checksum validation,
invariant #12) — the correction lands in `RESPONSIBILITIES.md` §`payment` instead.

**Source of intent:** GitHub issue #569

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's suggested "check locally *and/or* read Stripe" hides a real fork, and that the false
"the key makes replays safe" premise is restated in 10 javadocs + a plan-doc risk row, none of
which the issue mentions) · `riviera-plan-doc` (this template — forced the Behavior-parity
ledger that turned up the fail-closed case, and the Module-ownership check) · `tdd` (each of
the three behaviors driven red→green in `StripePaymentGatewayTest`) ·
`riviera-review-overlay` (review gate — run at ready-for-review) · `riviera-docs-freshness`
(ran over the slice's own diff — the claim sweep in Phase 2 *is* its output; see the
Generalization-audit log) · `riviera-stripe-payments` (refund execution stays collect-only,
no Connect; confirmed the idempotency-key convention it mandates is a *complement* to, not a
substitute for, the existence read) · `riviera-java-conventions` (§6d — new javadoc carries
no issue numbers, rationale relocated to `RESPONSIBILITIES.md`; sealed `RefundResult` left
untouched rather than growing an `Adopted` variant) · `riviera-modulith` (confirmed the whole
fix sits inside `payment`'s own `adapter/out` — no published-surface change, no
`allowedDependencies` change) · `riviera-local-debug` (scoped test recipe; system `gradle` +
JDK-25 toolchain) · `postgres` (`N/A — no SQL and no migration in this slice`)

**Branch:** `claude/sdlc-569-7en5ef` — the cloud session's designated remote branch stands in
for `bugfix/refund-idempotency-beyond-key-window` (riviera-sdlc §Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a booking whose collection already carries a **live** refund at Stripe
  (the state left behind when a create posted but its response was lost, and the key has since
  been pruned), when the refund is issued again, then **no second refund is created**, the
  existing one is recorded locally, and the caller sees `Refunded`. *Pinned by:*
  `StripePaymentGatewayTest.adoptsAnExistingStripeRefundInsteadOfCreatingASecond`
- [ ] **AC-2:** Given no refund exists for the booking's PaymentIntent, when a refund is
  issued, then exactly one refund is created, carrying the booking-derived idempotency key,
  and it is recorded. *Pinned by:* `StripePaymentGatewayTest.refundUsesIdempotencyKeyAndRecordsTheRefund`
- [ ] **AC-3:** Given the "does a refund already exist?" read itself fails, when a refund is
  issued, then **no refund is created** and the result is `Failed` — fail-closed, so the event
  publication stays outstanding and retries rather than guessing. *Pinned by:*
  `StripePaymentGatewayTest.failsClosedWhenTheExistingRefundReadFails`
- [ ] **AC-4:** Given the refund create's response is lost to a connection timeout, when the
  refund is issued, then it is replayed **exactly once** with the **same** idempotency key and
  the recovered refund is recorded — resolving inside the key window. *Pinned by:*
  `StripePaymentGatewayTest.recoversAndRecordsWhenRefundCreateTimesOut`
- [ ] **AC-5:** Given both the create and its replay time out, when the refund is issued, then
  the result is `Failed` and nothing is recorded — and a later replay adopts whatever Stripe
  holds (AC-1), so the residual is a delay, never a double payment. *Pinned by:*
  `StripePaymentGatewayTest.failsWhenBothRefundAttemptsTimeOut`
- [ ] **AC-6:** Given the only refund Stripe holds for the intent is `failed` or `canceled`
  (money did **not** go back), when a refund is issued, then it is **not** adopted and a fresh
  refund is created. *Pinned by:* `StripePaymentGatewayTest.createsAFreshRefundWhenTheOnlyStripeRefundIsDead`
- [ ] **AC-7:** Given a refund is adopted rather than created, when it is recorded, then
  `riviera.refunds.adopted` increments — so a lost-response recovery is visible to ops instead
  of silent. *Pinned by:* `StripePaymentGatewayTest.countsAnAdoptedRefund`

## Non-goals

- **A refund webhook.** Refunds stay server-initiated and recorded from the gateway's answer
  (V11's stated model). Reconciling asynchronous refund state changes (`pending` → `failed`
  after the fact) is a separate concern.
- **Accumulating `refunded_minor` across multiple refunds as a supported flow.** The platform
  still issues at most one refund per booking; the adopt path sums what Stripe reports only so
  that a *legacy* double refund (created by this very bug before the fix) is recorded truthfully.
- **Topping up a partial refund** to reach the requested amount when Stripe already holds a
  smaller live refund. That is a money decision, and money decisions belong to `booking`
  (`payment` Not-My-Job). Adopt + warn; do not silently pay the difference.
- **Re-issuing refunds for bookings already double-refunded in production.** No such row is
  known; a remediation would be a data task, not this slice.
- **Changing the sealed `RefundResult`** to distinguish adopted from freshly created. `booking`
  does not act on the difference — it is an execution detail of `payment`.

## Behavior-parity ledger (retirement / replacement slices only)

> The refund path is *replaced*, not extended — every existing behavior of
> `StripePaymentGateway#refund` is enumerated and given a verdict.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| No PaymentIntent on record → `Failed("no_collection")`, no gateway call | preserved | unchanged first branch, still before any Stripe call |
| Creates a refund with `setPaymentIntent` + amount in minor units | preserved | moved into `createRefundWithRecovery`, params byte-identical |
| Idempotency key `booking-<id>-refund` | preserved | unchanged, and still the in-window defence; now a complement to the existence read |
| Success → `markRefunded(booking, requestedAmount, refundId)` → `Refunded` | changed | unchanged on the create path; on the **adopt** path the amount recorded is what **Stripe** reports, not what was requested (the truth about money that already moved) |
| Any `StripeException` → `Failed(code)`, never thrown | preserved | the widened `try` now also covers the existence read, so a failed read is `Failed` too (AC-3) |
| Exactly one Stripe API call per refund | changed | now two on the happy path (list, then create). Refunds are rare (cancellations only); the cost is one extra round-trip on a path that already tolerates 25s |
| `ApiConnectionException` propagates to `Failed` with no replay | changed | replayed once with the same key first (AC-4), mirroring `initiate`; a double timeout still lands on `Failed` (AC-5) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The existence read is itself unreliable, and a failed read is misread as "no refund exists" → the exact double-pay we are fixing | low | critical | The read sits **inside** the `try`; any `StripeException` returns `Failed` **before** reaching the create. Fail-closed is the default, pinned by AC-3 | this slice | open |
| R-2 | Stripe's refund list paginates and a live refund sits beyond page 1, so it is not seen | very low | critical | The platform issues at most one refund per booking; the list is capped at a limit far above any real count, and adoption triggers on *any* live refund, so page 1 is decisive. Documented on the helper | this slice | open |
| R-3 | A refund in a **dead** state (`failed`/`canceled`) is adopted, so a tourist owed money never gets it | low | high | Only live refunds are adoptable; dead ones fall through to a fresh create. Pinned by AC-6. Null status counts as live (conservative — never create a second on unknown state) | this slice | open |
| R-4 | The adopted amount exceeds `amount_minor` and trips V11's `payment_refunded_check` | very low | med | Only reachable if Stripe holds refunds summing past the collection, which Stripe's own refundable ceiling prevents. A violation surfaces loudly as a failed listener (publication stays outstanding), never as silent corruption | this slice | open |
| R-5 | Money invariant #5 slips at the boundary — `Refund.getAmount()` is a boxed `Long` | low | high | Summed as `long` minor units, recorded through the existing `markRefunded(long, …)`; no floating point anywhere on the path | this slice | open |
| R-6 | The doc sweep in Phase 2 corrects some claims and misses others, leaving the false premise alive somewhere | med | low | The sweep is grep-driven over the exact phrases (`idempotency-keyed`, `double-refund`), recorded in the Generalization-audit log with the search command, not done by memory | this slice | open |
| R-7 | Flyway version collision with a parallel slice | none | — | No migration in this slice. `V42` is left free; next free number on `main` is V42 and no open non-dependabot PR claims it | this slice | closed — no migration |

## Open questions / Assumptions

- **Assumption:** A booking receives **at most one** refund decision in its lifetime, so
  "any live refund on the intent" is a sound proxy for "this booking's refund already
  happened". *Verified from the code, not assumed:* the guest cancel is `CONFIRMED`-only and
  `WeatherRefundService` reaches `CONFIRMED`/`NO_SHOW` — a booking already `CANCELLED` by one
  path is not reachable by the other. — *Owner:* this slice · *Resolves by:* Phase 0
### Resolved

- **Assumption (verified at plan time):** `stripe-java` 33.1.1 exposes the API this design
  needs. Checked against the resolved jar with `javap`, not assumed:
  `RefundService#list(RefundListParams)` returns `StripeCollection<Refund>` with
  `getData()`/`getHasMore()`; `RefundListParams.Builder` has `setPaymentIntent(String)` and
  `setLimit(Long)`; `Refund` has `getId()`, `getStatus()`, and `getAmount()` — the last a boxed
  `Long`, which is why R-5 exists.

- **Open question (settled at plan time):** local `refunded_minor` pre-check, Stripe read, or
  both? → **Stripe read only.** The local row is derived state written *after* the gateway
  answers; the failure in #569 is precisely that it was never written. A local short-circuit
  would add a second source of truth for a question invariant #8 says only Stripe answers, and
  would skip the authoritative read in exactly the case where local state is stale. The cheap
  read buys nothing the authoritative one does not already cover, since a completed publication
  is never replayed (`RegistryRefundOutbox` re-drives *incomplete* publications only).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` row is read or
written on this path. The refund runs **after** the cancel transaction has already released the
claim (`BookingRefundListener` is an `AFTER_COMMIT` listener); this slice changes only how many
times money moves, never who holds a set. The concurrency that *is* in play is duplicate
*execution* of the same refund, which is the subject of the whole plan and is settled at the
gateway, not in the database.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns Stripe collection **and refund execution**; the gateway adapter is the only code that may speak to Stripe |
| M-2 | `booking` | existing | `Booking` | **Javadoc only** — the claim sweep corrects statements about why a replay is safe; no behavior change |
| M-3 | `shared` | existing | (none — kernel) | One metric **name** added to `ObservabilityMetrics`, matching `REFUNDS_FAILED`/`REFUNDS_SHED`; no logic, no state |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `RefundPort#refund` — **unchanged signature and semantics** | `BookingRef`, `Money`, `RefundResult` | `booking` |

No published surface changes: `RefundResult` keeps its two variants, no `spi/` is added, and no
`allowedDependencies` grant changes. The entire behavior change is inside
`payment/adapter/out/StripePaymentGateway`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` | `{ bookingId, …, refundMinor, currency }` | `booking` (refund), `payout`, `notification` | async `AFTER_COMMIT` | unchanged — **no event change in this slice** |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Ask Stripe whether a refund already exists before creating one | `payment` | `payment` **Job**: "Own Stripe collection — PaymentIntents, refunds, and webhook handling. Reconcile payment state from Stripe (never the client)." This is reconciliation-before-write, the same posture `cancel` already takes by retrieving the intent first. Not on any other module's list |
| Decide that a duplicate must not be paid | `payment` | Execution idempotency, not a money **decision**. `payment` Not-My-Job reserves "whether to refund / how much" for `booking` — untouched here: the requested amount still comes from `booking`, and the adopt path never chooses a *different* amount, it records the one that already moved |
| Count an adopted (recovered) refund | `payment` | Self-observation of this module's own refund execution, exactly as `RefundService` already counts `riviera.refunds.failed`; `MeterRegistry` is a framework bean, not a cross-module dependency |
| Correct the "the key alone makes a replay safe" claims | `booking` + `shared` + `payment` | Documentation of each module's own code, in that module's own files. No behavior moves |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook. Unchanged — this slice touches refunds only.
- **Idempotency:** **this is the slice.** Layered, and the layers are ordered by authority:
  1. **Existence read at Stripe** (new, authoritative, survives key pruning) — a live refund on
     the intent means the refund already happened; adopt it.
  2. **Idempotency key** `booking-<id>-refund` (existing) — covers replays inside Stripe's
     ~24h window, including the new immediate same-key replay.
  3. **Event Publication Registry** (existing) — a `Failed` leaves the publication outstanding
     so the refund is retried rather than lost; with layer 1 in place, retrying is now safe at
     any distance in time, which is what the registry always assumed.
- **Money:** integer minor units, EUR. The adopted amount is Stripe's reported `long` minor
  units, summed as `long`. No floating point, no currency conversion (the refund inherits the
  collection's currency).
- **Payout-ledger effect:** **none, and that is deliberate.** The ledger reverses on
  `BookingCancelled` (UNIQUE-guarded, exactly once, invariant #9) and was already correct — it
  is the money *actually paid out of Stripe* that this slice stops overcounting. The issue's
  observation that "the payout ledger reverses once" is the symptom of the two records
  diverging; after this slice they agree.
- **Refund policy applied:** unchanged — `booking` computes free-until-cutoff / partial-after /
  weather-admin (invariant #10) and hands `payment` an amount.
- **Pinning tests:** `StripePaymentGatewayTest` (all seven ACs), `RefundServiceTest`
  (port seam unchanged), `RefundBulkheadIT` (listener/executor contract unchanged).

## Angular — frontend surfaces touched

`N/A — backend-only.` No API shape, status code, or user-visible behavior changes.

## FE↔BE contract

`N/A — no contract change.`

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** Phase 2 — grep the false premise and correct each claim, then the runbook entry.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Adopt an existing Stripe refund instead of creating a second (+ the adoption counter) | ✅ | `2ff5b5d` |
| 1 — Same-key immediate replay on a lost refund response | ✅ | see the Phase-1 commit |
| 2 — The false-premise claim sweep + runbook | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripePaymentGateway.java` — the fix: existence read, adopt-or-create, same-key refund replay, adoption counter
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePaymentGatewayTest.java` — AC-1…AC-7
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `REFUNDS_ADOPTED` name
- `platform/src/main/java/ai/riviera/platform/payment/api/RefundPort.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/payment/vocabulary/RefundResult.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingRefundListener.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfig.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundOutbox.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundResubmissionService.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundService.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/shared/ResubmissionThrottle.java` — claim sweep
- `platform/src/main/java/ai/riviera/platform/shared/ResubmissionOutcome.java` — claim sweep
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RefundExecutorConfigTest.java` — claim sweep
- `RESPONSIBILITIES.md` — §`payment` gains the refund-execution rule (the relocated rationale, per `riviera-java-conventions` §6d)
- `docs/runbooks/observability.md` — `riviera.refunds.adopted`: what it means, when to chase it
- `docs/plans/refund-outbox-resubmission.md` — R-3's "closed" verdict superseded by this slice
- `docs/plans/refund-idempotency-beyond-key-window.md` — this plan

---

## Phase 0 — Adopt an existing Stripe refund instead of creating a second

**Files:** Modify `payment/adapter/out/StripePaymentGateway.java` · `shared/ObservabilityMetrics.java` · Test `payment/adapter/out/StripePaymentGatewayTest.java`

> AC-7 (the adoption counter) lands here rather than in Phase 2: it is an assertion *about the
> adopt path*, and the `MeterRegistry` constructor parameter it needs touches every construction
> site in the test class. Deferring it would churn those sites twice.

- [ ] **Step 1: Write the failing tests** — AC-1 (adopt), AC-3 (fail closed), AC-6 (dead refund
      is not adopted), AC-7 (counter), plus the existing happy-path test extended to stub an empty list.
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*StripePaymentGatewayTest*"`
      → FAIL: a second refund is created (AC-1), and the list is never consulted.
- [ ] **Step 3: Minimal implementation** — read the intent's refunds inside the existing `try`;
      adopt the first live one (recording Stripe's total and its id); otherwise create as before.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — does any *other* gateway call rely on the key
      alone for cross-window safety? Record the search and the answer.
- [ ] **Step 6: Commit** — `git commit -m "Ask Stripe for an existing refund before creating one (#569)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Same-key immediate replay on a lost refund response

**Files:** Modify `payment/adapter/out/StripePaymentGateway.java` · Test `payment/adapter/out/StripePaymentGatewayTest.java`

- [ ] **Step 1: Write the failing tests** — AC-4 (recover + record) and AC-5 (double timeout →
      `Failed`, nothing recorded, exactly two attempts).
- [ ] **Step 2: Run it, verify it fails** — `--tests "*StripePaymentGatewayTest*"` → FAIL: one
      attempt only, `Failed` returned on the first timeout.
- [ ] **Step 3: Minimal implementation** — `createRefundWithRecovery`, mirroring the intent
      path; rename the existing helper to `createIntentWithRecovery` so the pair reads as a pair.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — record.
- [ ] **Step 6: Commit** — `git commit -m "Replay a timed-out refund once inside the key window (#569)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The false-premise claim sweep + runbook

**Files:** Modify the nine claim-sweep files · `RESPONSIBILITIES.md` · `docs/runbooks/observability.md` · `docs/plans/refund-outbox-resubmission.md`

- [ ] **Step 1: No new test** — this phase changes documentation only; the behavior it describes
      is already pinned by AC-1…AC-7. The verification is the regression run in Step 4.
- [ ] **Step 2: Grep the false premise** — the exact phrases, recorded in the audit log.
- [ ] **Step 3: Correct each claim** — mechanism, not just conclusion.
- [ ] **Step 4: Run the regression** — plus the structural net
      (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`)
      and `*RefundServiceTest*`, `*RefundExecutorConfigTest*`, `*RefundOutboxScopeTest*`.
- [ ] **Step 5: Generalization-audit pass** — the sweep itself; record the grep and every hit.
- [ ] **Step 6: Commit** — `git commit -m "Count adopted refunds and correct the replay-safety claims (#569)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | Phase 0 | Any other gateway call trusting the idempotency key alone for safety across a replay that may outlive the key window | `grep -n "IdempotencyKey\|idempotencyKey(" StripePaymentGateway.java` then `grep -rn "\.pay(\|CheckoutPort" platform/src/main/java` | 2 keyed calls: `initiate` (`booking-<id>-pi`) and `refund` (`booking-<id>-refund`); plus `cancel`, unkeyed | **Fixed `refund` only, deliberately.** `initiate` is reached only from the synchronous request path (`CreateBookingService`, `RespondToRequestService`) — no event-publication replay vehicle can re-drive it days later, and its worst case after key pruning is a second *unconfirmed* intent that Stripe auto-expires, not money leaving. `cancel` already retrieves the intent's state from Stripe before acting — the same read-before-write posture this slice gives `refund`, which is why it needed no change |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-7:** Run `gradle --no-daemon --console=plain test --tests "*StripePaymentGatewayTest*"` → all pass. Verified at commit `<sha>`.
- [ ] **Regression:** Run `--tests "*RefundServiceTest*" --tests "*RefundExecutorConfigTest*" --tests "*RefundOutboxScopeTest*" --tests "*ModularityTests*"` → all pass. Verified at commit `<sha>`.
- [ ] **Full suite:** CI green on the PR (the half scoped runs cannot prove).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A` — the refund path touches no availability row).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published-surface change (invariant #11).
- [ ] **Payment/payout** section filled; webhooks still the source of truth; refund execution idempotent across the key window; money in minor units; payout exactly-once untouched (invariants #5, #8, #9).
- [ ] Refund policy still enforced server-side by `booking` (invariant #10) — `payment` records, never decides.
- [ ] Timezone correct (invariant #6) — no time arithmetic in this slice.
- [ ] Booking codes unguessable (invariant #7) — no code is logged; only booking ids and Stripe ids.
- [ ] No schema change, so no Flyway migration; **V11 left unedited** (checksum, invariant #12).
- [ ] **Frontend** — `N/A`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `/code-review` ladder *plus* `riviera-review-overlay`.
