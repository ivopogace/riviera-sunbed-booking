# Refund at-most-once contract + failed-refund reconciliation Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Close the two refund-execution residuals #569 accepted — make a Stripe-reported
refund **failure** un-record the local refund (so the guest is told the truth and the money-path
alert fires), and make `PaymentGateway#refund`'s at-most-once promise a **machine-checked**
contract that a future collecting adapter cannot silently skip.

**Architecture:** The single most significant decision is that a failed refund is **recorded and
surfaced, never automatically re-driven**. Stripe fails a refund when the issuer rejects it — the
funds return to our balance and the same card often cannot receive them — so an auto-retry loop on
the money path would repeat a call that is expected to fail again. Instead the verified webhook
un-records the refund (`refunded_minor → 0`, status → `SUCCEEDED`), which makes every existing
mechanism tell the truth for free: `RefundProgress` flips back to `OUTSTANDING` (the guest-facing
half, #582), `riviera.refunds.failed` lights the money-path alert, and the gateway's own existence
read already treats a `failed` refund as dead so the next re-drive creates a fresh one. This is the
same posture §`payment` already states for `refund_mismatch`: *it will not clear itself; a human
settles it at the gateway.*

**Persistence:** JDBC only (invariant #1). One new guarded `UPDATE` on the existing `payment`
table (`JdbcPayments#markRefundFailed`). **No migration** — the un-record writes existing columns
(`refunded_minor`, `status`) to values the V11 `CHECK` already admits, so `V42` is left free.

**Source of intent:** GitHub issue #592 (both items), which records the residuals from #569
(`docs/plans/refund-idempotency-beyond-key-window.md`, risk rows **R-7** and **R-8**).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
guest-facing half needs **no** code: `ViewBookingService#refundOutstanding` already reads
`RefundProgress`, so un-recording closes it for free; and that #592 bundles two items, which PR
#590 (#568+#570) is precedent for shipping as one PR) · `riviera-plan-doc` (this template — forced
the Module-ownership table that pinned the un-record in `payment`, not `booking`) · `tdd` (every
phase is red→green; the contract test in phase 2 is written against the *port*, then a second
adapter-shaped fixture is what proves it is not Stripe-specific) · `riviera-review-overlay` (review
gate — <when it ran>) · `riviera-docs-freshness` (<ran over `<range>`, N findings>)
· `riviera-stripe-payments` (webhook-as-source-of-truth for the refund lifecycle too, and the
reminder that refund *eligibility* is server-side in `booking` — so the webhook may un-record but
must never re-decide) · `riviera-modulith` (kept the new port internal to `payment.application`
rather than widening the published `api/RefundPort`, and confirmed the counter-in-adapter shape has
precedent in `StripePaymentGateway`) · `riviera-java-conventions` (guarded typed-boolean outcome
over an exception; `PaymentStatus` constants over SQL literals; §6d kept the rationale in
`RESPONSIBILITIES.md` with a one-line Javadoc pointer) · `postgres` (the guarded single-statement
`UPDATE` — never read-then-write — and the deliberate no-index decision for `refund_id`)
· `riviera-local-debug` (scoped `--tests` runs; system `gradle` + JDK-25 toolchain in this cloud
session)

**Branch:** `claude/sdlc-592-u0n8hm` — **cloud-session substitution** for the conventional
`bugfix/refund-contract-and-failure-reconciliation`; this session's designated remote branch stands
in for it (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a payment row that records a refund (`refunded_minor > 0`, status
  `REFUNDED`), when a signature-verified refund event reports that refund id as `failed`, then the
  row is un-recorded (`refunded_minor = 0`, status `SUCCEEDED`) and `riviera.refunds.failed`
  increments by one. *Pinned by:* `StripeWebhookIT.failedRefundUnrecordsTheRefund`
- [ ] **AC-2:** Given that row already un-recorded, when a second refund-failure event for the same
  refund id arrives (a distinct event id, so the dedup table does not absorb it), then no row moves
  and the counter does not increment again. *Pinned by:*
  `StripeWebhookIT.aSecondFailureForTheSameRefundMovesNothing`
- [ ] **AC-3:** Given a refund event whose `Refund` is still live (`pending`, `succeeded`), when it
  arrives, then the payment row is untouched and the response is `200`. *Pinned by:*
  `StripeWebhookIT.aLiveRefundUpdateChangesNothing`
- [ ] **AC-4:** Given a handled refund event whose payload cannot be read as a `Refund`, when it
  arrives, then `UnreadableWebhookEventException` propagates (`503`) and the event-id dedup insert
  rolls back, so Stripe re-delivers. *Pinned by:*
  `StripeWebhookIT.anUnreadableRefundEventIsNotConsumed`
- [ ] **AC-5:** Given a refund-failure event naming a refund id this app never recorded, when it
  arrives, then no row moves, the counter does not increment, and the response is `200`.
  *Pinned by:* `StripeWebhookIT.aFailureForAnUnknownRefundIsIgnored`
- [ ] **AC-6:** Given a booking whose recorded refund was un-recorded by AC-1, when the refund
  progress is read, then it is `OUTSTANDING` (money collected, none returned) rather than
  `ACCEPTED`. *Pinned by:* `RefundServiceTest.progressIsOutstandingAfterARecordedRefundFailed`
- [ ] **AC-7:** Given a collecting `PaymentGateway` that already holds a refund for exactly the
  requested amount, when `refund` is replayed with its idempotency key assumed pruned, then exactly
  one refund exists at the gateway and the replay reports the **first** refund's id. *Pinned by:*
  `PaymentGatewayRefundContract.replayingBeyondTheKeyWindowMovesMoneyOnlyOnce` via
  `StripeRefundContractTest`
- [ ] **AC-8:** Given a `PaymentGateway` implementation in production code, when it is neither
  paired with a `PaymentGatewayRefundContract` subclass nor declared non-collecting, then the
  architecture rule fails the build naming the unclassified adapter. *Pinned by:*
  `PaymentGatewayContractCoverageArchitectureTest.everyGatewayIsContractCoveredOrNonCollecting`

## Non-goals

- **Automatically re-driving a failed refund.** See *Architecture* — an issuer rejection is not a
  transient error, and the existing publication has already completed (archive completion mode), so
  a re-drive would need a *new* trigger. Recorded as R-3; the deliberate answer is the alert plus a
  human at the gateway, exactly as `refund_mismatch` already works.
- **A refund-settlement webhook beyond failure.** `refund.updated` for a *succeeded* refund is a
  200 no-op; `RefundProgress.ACCEPTED` already means "accepted, not settled" and this slice does not
  add a settled state.
- **Making `StubPaymentGateway` stateful.** #592 offered this or an exemption marker; the marker
  already exists as `payment.api.CollectionGuarantee`, so the stub is untouched.
- **Any frontend change.** The guest-facing half closes through existing wiring (see R-5).
- **A Flyway migration or an index on `refund_id`.** See *Persistence* and R-4.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. Both items are additive: a new webhook branch on types the
handler currently falls through to `default -> log.debug`, and a new test-side contract. No existing
surface is retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The un-record fires for a refund we did **not** record (a manual dashboard refund failing), zeroing a legitimately-recorded one | med | high | The guard keys on `refund_id = :refundId` — the exact id we stored — never on the PaymentIntent. A failure for any other refund matches 0 rows (AC-5) | this slice | open |
| R-2 | A duplicate / out-of-order refund event re-applies the un-record, double-counting the alert or reverting a *fresh* successful refund | med | high | Same single guarded statement as `markStatus`: `WHERE refund_id = … AND status IN (REFUNDED, PARTIALLY_REFUNDED)` — never read-then-write. A fresh refund's `markRefunded` overwrites `refund_id`, so a stale failure for the old id matches nothing (AC-2) | this slice | open |
| R-3 | Nothing re-drives the refund after the un-record, so the guest stays unpaid until a human acts | high | med | **Accepted by design, not by omission** — see *Architecture* and Non-goals. The un-record is what makes the state honest: `riviera.refunds.failed` fires the money-path alert (runbook), the guest sees "refund outstanding" (AC-6), and the gateway's dead-refund read means the next re-drive creates a fresh one rather than adopting the corpse | this slice | open |
| R-4 | The `refund_id` lookup has no index, so the webhook path seq-scans `payment` | low | low | `payment` holds one row per booking (`UNIQUE(booking_ref)`) at 5–15 venues, and refund-failure events are rare; an index would cost a migration and a `V42` claim for a scan of a few thousand rows. Deliberate — revisit if the table grows an order of magnitude | this slice | open |
| R-5 | The guest-facing half is assumed to close for free and does not | low | med | Verified at the grill, not assumed: `ViewBookingService#refundOutstanding` = booking `CANCELLED` **and** `booking.refund_minor > 0` **and** `RefundProgress.OUTSTANDING`; the un-record flips only the third term, and `booking`'s own decided amount is untouched. AC-6 pins the `payment` half | this slice | open |
| R-6 | The contract test bakes in Stripe-shaped assumptions, so it would not actually constrain the ADR-0009 Paysera adapter | med | med | The contract is written against `PaymentGateway` + `RefundResult` only; every Stripe type stays behind the subclass's `arrange…` fixture hooks. AC-8's coverage rule is what forces the next adapter to write its own subclass | this slice | open |
| R-7 | Widening the meaning of `riviera.refunds.failed` breaks the existing alert's runbook interpretation | low | med | The counter already carries two shapes (create-failed and `refund_mismatch`), and §`payment` states its meaning as "a refund the platform owes could not be issued" — exactly true here. Runbook + metric Javadoc gain the third shape in phase 4 rather than a new unwatched counter | this slice | open |
| R-8 | Flyway version collision with a parallel slice | none | — | No migration in this slice; `V42` is left free. Next free number on `main` is V42 and no open non-dependabot PR exists | this slice | closed — no migration |

## Open questions / Assumptions

- **Assumption:** Stripe's refund-lifecycle event types this deployment may receive are
  `charge.refund.updated` (legacy API versions), `refund.updated`, and `refund.failed`. All three
  carry a `Refund` object, so the handler branches on the **Refund's status**, not on the event
  type — which makes the set safe to over-specify. — *Owner:* this slice · *Resolves by:* phase 1
  (the branch is status-driven, so a type we never receive is dead-but-harmless config)
- **Assumption:** reverting a failed refund's row to `SUCCEEDED` is correct rather than inventing a
  `REFUND_FAILED` status — no money went back, so the collection stands in full, and `SUCCEEDED` is
  terminal for `markStatus` so a late `payment_intent.*` event still cannot move it.
  — *Owner:* this slice · *Resolves by:* phase 0

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path here touches `availability(set_id,
booking_date)`. The slice acts strictly on the `payment` row after a booking is already
`CANCELLED`; the claim was released by `booking`'s cancel leg long before any refund event arrives,
and nothing here re-opens or re-claims a set. The concurrency that *is* in scope is the payment
row's own — handled as a single guarded `UPDATE` (R-2), the same primitive as `markStatus`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns Stripe webhook handling and the collection/refund record. The un-record is reconciliation of *its own* row from a verified webhook — its Job line verbatim |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | — | none added | — | — |

No published surface changes. `Payments#markRefundFailed` is an **internal** port
(`payment.application`, public interface / package-private `JdbcPayments` impl) — the same shape as
`markStatus`, and deliberately **not** added to the published `api/RefundPort`, which exists for
`booking` to command a refund and has no business carrying a webhook-only reconciliation method.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | — | none added | — | — | — | — |

No event is published. A failed refund changes no other module's state: `booking` already decided
and recorded the refund amount, and `payout`'s reversal is keyed on the cancellation, not on whether
the money physically landed. Publishing one would invite exactly the auto-re-drive this slice
declines (R-3).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Un-record a refund the gateway reports as failed | `payment` | `payment` Job: "reconcile payment state from signature-verified Stripe webhooks (never the client)" and it owns the refund record. **Not** `booking`: this is refund *execution* state, not the refund *decision* — `booking`'s Not-My-Job boundary is the reverse direction, and the decided `booking.refund_minor` is untouched |
| Report the refund as `OUTSTANDING` again | `payment` | Already `payment`'s published read (`api/RefundStatusLookup`, §`payment`: "answered from this module's own row"). No new capability — the existing mapping tells the truth once the row does |
| Count the failure on `riviera.refunds.failed` | `payment` | Self-observation of this module's own refund execution, the same grounds `RefundService` and `StripePaymentGateway` already hold counters on |
| Force a collecting gateway to honour at-most-once | `payment` (test scope) | The port is `payment.application.PaymentGateway`; the contract and its coverage rule are test-side fitness functions beside `NoStripeConnectArchitectureTest`, which already guards this module's adapters |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook (not the client redirect). This slice
  extends that same posture to the **refund** lifecycle — invariant #8 applied where #569's plan
  noted it was still missing (R-7 there).
- **Idempotency:** unchanged keys (`booking-<id>-refund`); webhook dedupe on event id, plus the
  guarded `UPDATE` for the un-record (R-2) so a re-delivery that clears dedup still moves nothing.
- **Money:** integer minor units, EUR. The un-record writes the literal `0`, never arithmetic.
- **Payout-ledger effect:** **none.** The reversal already happened on `BookingCancelled`; a refund
  that fails at the issuer does not restore what the venue is owed — the platform still owes the
  guest. Deliberately no `payout` interaction (invariant #9's exactly-once is untouched).
- **Refund policy applied:** none re-applied. The webhook reconciles execution state only; the
  amount `booking` decided under invariant #10 is never recomputed here.
- **Pinning tests:** `StripeWebhookIT` (AC-1…AC-5), `RefundServiceTest` (AC-6),
  `StripeRefundContractTest` (AC-7), `PaymentGatewayContractCoverageArchitectureTest` (AC-8).

## Angular — frontend surfaces touched

`N/A — backend-only.` The guest-facing half closes through existing wiring: `ViewBookingService`
already derives `refundOutstanding` from `payment.api.RefundStatusLookup`, and #582 already renders
it. No `frontend/` file changes, so no new e2e spec (the flow's coverage shipped with #582).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or field is added or changed. `GET /api/bookings/{code}`
returns the same shape; only the *value* of the existing `refundOutstanding` flag can now flip back
to `true` after a failure.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** Phase 0 — write `JdbcPaymentsIT.markRefundFailedUnrecordsARecordedRefund` red,
then add `Payments#markRefundFailed` + the guarded `UPDATE`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Un-record port + guarded SQL | | |
| 1 — Webhook refund-failure branch | | |
| 2 — Shared at-most-once refund contract | | |
| 3 — Contract-coverage architecture rule | | |
| 4 — Docs sweep + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/refund-contract-and-failure-reconciliation.md` — this plan
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — the
  `markRefundFailed` port method
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — the guarded
  `UPDATE`
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/StripeWebhookController.java` —
  the refund-lifecycle branch, the shared event-payload reader, the failure counter
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — the third shape
  on `REFUNDS_FAILED`'s doc
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — phase 0
- `platform/src/test/java/ai/riviera/platform/payment/adapter/in/StripeWebhookIT.java` — AC-1…AC-5
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundServiceTest.java` — AC-6
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentGatewayRefundContract.java`
  — the port-level at-most-once contract (abstract)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefundContractTest.java` —
  the Stripe binding of the contract (AC-7)
- `platform/src/test/java/ai/riviera/platform/payment/PaymentGatewayContractCoverageArchitectureTest.java`
  — AC-8
- `RESPONSIBILITIES.md` — §`payment`: the two residuals become the two rules that closed them
- `docs/runbooks/` — the `riviera_refunds_failed_total` row gains the third shape
- `CLAUDE.md` — the `payment` module row's refund sentence

---

## Phase 0 — Un-record port + guarded SQL

**Files:** Modify `payment/application/Payments.java` · `payment/adapter/out/JdbcPayments.java` ·
Test `payment/adapter/out/JdbcPaymentsIT.java`

- [ ] **Step 1: Write the failing test** — `markRefundFailedUnrecordsARecordedRefund` (row with
  `refunded_minor > 0` + `REFUNDED` → `true`, row reads `0` / `SUCCEEDED`),
  `markRefundFailedIsGuarded` (already-`SUCCEEDED` row → `false`, nothing moves), and
  `markRefundFailedIgnoresAnUnknownRefundId` (→ `false`).
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*JdbcPaymentsIT*"` → FAIL
  (method does not exist).
- [ ] **Step 3: Minimal implementation** — `boolean markRefundFailed(String refundId)` on
  `Payments`; in `JdbcPayments`, one statement:
  `UPDATE payment SET refunded_minor = 0, status = :succeeded, updated_at = NOW() WHERE refund_id = :refundId AND status IN (:recorded)`
  with `:recorded` built from `PaymentStatus.REFUNDED`/`PARTIALLY_REFUNDED` (no SQL literals, §6a).
- [ ] **Step 4: Run it, verify it passes** → PASS.
- [ ] **Step 5: Generalization-audit pass** — search for other places that write `refunded_minor`.
- [ ] **Step 6: Commit** — `git commit -m "Un-record a refund the gateway reports as failed (#592)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Webhook refund-failure branch

**Files:** Modify `payment/adapter/in/StripeWebhookController.java` · Test
`payment/adapter/in/StripeWebhookIT.java` · `payment/application/RefundServiceTest.java`

- [ ] **Step 1: Write the failing tests** — AC-1…AC-6.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*StripeWebhookIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — extract the existing `deserializeUnsafe` fallback into
  one `dataObject(Event)` helper feeding both the `PaymentIntent` and the new `Refund` accessor
  (no copy of the #569 F-12 shape); add the refund-event branch: dead status → `markRefundFailed`
  + `REFUNDS_FAILED` when it applied; live status → no-op `200`; unreadable payload →
  `UnreadableWebhookEventException`.
- [ ] **Step 4: Run it, verify it passes** → PASS; then broaden to `--tests "*payment*"`.
- [ ] **Step 5: Generalization-audit pass** — does any other handler branch consume a verified fact
  it cannot read?
- [ ] **Step 6: Commit** — `git commit -m "Reconcile a failed refund from its verified webhook (#592)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Shared at-most-once refund contract

**Files:** Create `payment/application/PaymentGatewayRefundContract.java` ·
`payment/adapter/out/StripeRefundContractTest.java`

- [ ] **Step 1: Write the failing test** — the abstract contract (AC-7) plus the Stripe binding,
  whose fixture makes `refunds().create` mint a *fresh* id if called a second time, so a regression
  to key-only idempotency fails loudly.
- [ ] **Step 2: Run it, verify it fails** — deliberately, by stubbing the fixture before the
  subclass exists → FAIL.
- [ ] **Step 3: Minimal implementation** — the fixture hooks (`gateway()`, `arrangeCollection()`,
  `arrangeKeyWindowExpired()`, `refundsCreatedAtGateway()`), Stripe-typed only in the subclass.
- [ ] **Step 4: Run it, verify it passes** → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Pin at-most-once refunds as a port contract, not one adapter's habit (#592)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Contract-coverage architecture rule

**Files:** Create `payment/PaymentGatewayContractCoverageArchitectureTest.java`

- [ ] **Step 1: Write the failing test** — AC-8: every production `PaymentGateway` implementation is
  either contract-covered or declared non-collecting, and every non-collecting declaration is
  justified by a `CollectionGuarantee` answering `false`.
- [ ] **Step 2: Run it, verify it fails** — assert against a deliberately-unclassified name first.
- [ ] **Step 3: Minimal implementation** — the rule over `ArchitectureTestSupport.productionClasses()`.
- [ ] **Step 4: Run it, verify it passes** → PASS; broaden to the arch-test set.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Fail the build on a gateway that honours no refund contract (#592)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Docs sweep + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `CLAUDE.md` · `docs/runbooks/` ·
`docs/plans/refund-idempotency-beyond-key-window.md` (R-7/R-8 pointers) · this plan

- [ ] **Step 1:** Run `riviera-docs-freshness` over the branch range.
- [ ] **Step 2:** Rewrite §`payment`'s "Two residuals" paragraph as the two rules that closed them.
- [ ] **Step 3:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main` and
  `node scripts/check-inline-comments.mjs --diff origin/main`.
- [ ] **Step 4: Commit** — `git commit -m "Record the closed refund residuals in the substrate docs (#592)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-5:** `gradle test --tests "*StripeWebhookIT*"` → PASS. Verified at `<sha>`.
- [ ] **AC-6:** `gradle test --tests "*RefundServiceTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-7:** `gradle test --tests "*StripeRefundContractTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-8:** `gradle test --tests "*PaymentGatewayContractCoverage*"` → PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A — no availability write path).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published
      surface widened (invariant #11).
- [ ] **Payment/payout** section filled; webhooks are source of truth; idempotent; money in minor
      units; payout untouched (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — not re-decided here.
- [ ] Timezone correct: UTC stored (invariant #6).
- [ ] Booking codes unguessable (invariant #7) — no code logged on the new paths.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
