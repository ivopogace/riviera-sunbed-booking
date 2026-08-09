# Stripe webhook: guard the payment state machine, and stop consuming unreadable events

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signature-verified Stripe webhook can no longer (a) overwrite a terminal
`payment` row with a late non-terminal outcome, or (b) silently consume a verified event whose
PaymentIntent id cannot be read — the first becomes a guarded no-op, the second a rolled-back
5xx that Stripe redelivers.

**Architecture:** The single significant decision is **where the payment state machine lives**:
in the SQL, as a guarded `UPDATE … WHERE status IN (open states)`, exactly like every `booking`
transition — not in a service-level read-then-write (racy) and not in a DB trigger (invisible to
the JDBC-only stack). `markStatus` graduates from `void` to a boolean "did a row move", and the
webhook publishes `PaymentConfirmed`/`PaymentCanceled` **only when it did**, so a late event
cannot fan out to the spine either. For the unreadable-event half, the handler throws inside its
own `@Transactional` boundary, which rolls back the dedup insert it already made — the same
at-least-once posture the handler was already documented to have.

**Persistence:** JDBC only (invariant #1). Tables touched: `payment` (query change only —
no DDL, **no Flyway migration**; the transition set is a `WHERE` clause, not a constraint).

**Source of intent:** GitHub issues [#568](https://github.com/ivopogace/riviera-sunbed-booking/issues/568)
(unguarded `markStatus`) and [#570](https://github.com/ivopogace/riviera-sunbed-booking/issues/570)
(verified event consumed on deserialization failure). Both are `payment`-module webhook-fidelity
bugs against invariant #8, in the same two files — one slice, one PR.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced a third,
unfiled instance of the same bug class: a late `payment_intent.canceled` publishing `PaymentCanceled`
for a paid intent, so the fix gates event publication, not just the write) · `riviera-plan-doc`
(this template — forced the Behavior-parity ledger, which is what pinned `findPendingCredentials`'s
payable set as the same set as the new open-state guard) · `tdd` (each phase is red-first: the
late-event ITs fail against today's unguarded `UPDATE` before the guard lands) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(merge close-out step 5, over this PR's merge span) · `riviera-stripe-payments` (confirmed the
collect-only model is untouched, and that webhook duplicate/out-of-order handling is the module's
named test obligation — this slice adds the missing out-of-order half) · `riviera-modulith`
(placement: the guard belongs in `adapter/out` SQL behind the internal `application.Payments`
port; the new exception stays package-private in `adapter/in`, published nowhere) ·
`riviera-java-conventions` (§6a named the `OPEN_STATUSES` token list instead of inlining
literals; §6b confirmed a per-controller `@ExceptionHandler` is forbidden, so the retryable
failure is a `@ResponseStatus` exception rather than a bespoke handler) · `postgres` (the
guarded `UPDATE … WHERE status IN (…)` idiom; confirmed no index is warranted — the predicate
rides the existing `payment_intent_uniq` unique index) · `riviera-local-debug` (scoped test
recipe for the session's first Gradle run).

**Branch:** `claude/sdlc-568-570-6scirg` — the cloud session's **designated remote branch**
standing in for `bugfix/stripe-webhook-payment-state-guard` (`riviera-sdlc` § Remote/cloud
session addendum). Exists in git before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `payment` row in `SUCCEEDED`, when a `payment_failed` outcome is applied
      for that PaymentIntent, then the row stays `SUCCEEDED` and the port reports the transition
      as not applied. *Pinned by:* `JdbcPaymentsIT.lateFailureCannotOverwriteASucceededCollection`
- [ ] **AC-2:** Given a `payment` row in `REFUNDED` with `refunded_minor > 0`, when a
      `payment_failed` outcome is applied, then status and `refunded_minor` are both unchanged —
      no self-contradictory row. *Pinned by:* `JdbcPaymentsIT.lateFailureCannotOverwriteARefundedCollection`
- [ ] **AC-3:** Given a `payment` row in `REQUIRES_PAYMENT` or `FAILED` (the open states), when a
      webhook outcome is applied, then the transition applies and is reported as applied — a
      declined-then-retried intent still reaches `SUCCEEDED`.
      *Pinned by:* `JdbcPaymentsIT.anOpenCollectionStillTransitions`
- [ ] **AC-4:** Given a booking whose payment already succeeded, when a **late**
      `payment_intent.payment_failed` arrives under a fresh event id, then the payment record
      stays `SUCCEEDED` and the response is `200` (the event is consumed — it is genuinely applied,
      as a no-op). *Pinned by:* `StripeWebhookIT.lateFailureAfterSuccessLeavesThePaymentSucceeded`
- [ ] **AC-5:** Given a booking whose payment already succeeded, when a **late**
      `payment_intent.canceled` arrives under a fresh event id, then the payment stays `SUCCEEDED`
      and **no `PaymentCanceled` is published** — the claim-release path is never entered for a
      collected payment. *Pinned by:* `StripeWebhookIT.lateCancelAfterSuccessPublishesNoRelease`
- [ ] **AC-6:** Given a verified `payment_intent.succeeded` whose `data.object` cannot be read as
      a PaymentIntent, when it is delivered, then the response is a 5xx, **no** `stripe_webhook_event`
      row is committed for that event id, and the payment row is unchanged — Stripe redelivers.
      *Pinned by:* `StripeWebhookIT.unreadableHandledEventIsRetryableAndNotConsumed`
- [ ] **AC-7:** Given a verified event of a type this app does not act on, when its payload is
      unreadable, then it is still `200` and consumed — the retryable failure is scoped to the
      three handled types. *Pinned by:* `StripeWebhookIT.unreadableIgnoredEventTypeIsStillConsumed`
- [ ] **AC-8:** Given a verified `payment_intent.succeeded` for an intent this app never recorded,
      when it is delivered, then it is `200` with no state change and no event — unchanged
      behavior, not a retry. *Pinned by:* `StripeWebhookIT.unknownIntentIsIgnoredNotRetried`
- [ ] **AC-9:** Given the existing happy paths (succeeded confirms, canceled releases, duplicate
      delivery is idempotent, bad/absent signature is `400`), when the guard ships, then all of
      them still hold. *Pinned by:* the pre-existing `StripeWebhookIT` + `StripeWebhookListenerFailureIT` methods.

## Non-goals

- **No parked/replayable raw-event store.** #570 names it as an alternative; it is a table plus an
  admin re-drive surface (the shape of #405's mail outbox) and a slice of its own. This slice takes
  the issue's first-listed option — make the failure retryable and visible — and leaves the event
  recoverable from the Stripe dashboard because its id is never blacklisted.
- **No reconciliation sweep** (#102) and no orphan-intent design (#479). They are the recovery nets
  *behind* the webhook; this slice fixes the webhook itself.
- **No DB-level transition constraint.** A CHECK cannot see the previous row; a trigger would hide
  logic from the JDBC-only stack (invariant #1). The guarded `UPDATE` is the repo idiom.
- **No new metric.** A suppressed late event is logged at WARN with ids only; wiring
  `ObservabilityMetrics` is not in scope.
- **No change to `findPendingCredentials`' payable set**, to the booking-side guarded transitions,
  or to any frontend surface.

## Behavior-parity ledger

> This slice changes an existing surface (the webhook handler + the `Payments` port), so the
> ledger applies to the behaviors those two carry today.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `markStatus` writes the new status unconditionally for a known intent | **changed** | now guarded on the open states (`REQUIRES_PAYMENT`, `FAILED`); a terminal row is a no-op. This is the bug (#568) |
| `markStatus` returns `void` | **changed** | returns `boolean applied`, so callers can branch on a real transition (the repo's guarded-`UPDATE …  RETURNING` idiom, expressed as a row count) |
| `markStatus` on an unknown intent is a silent 0-row no-op | **preserved** | the guard adds a predicate; a missing row still matches nothing and still returns `false` |
| `onSucceeded` publishes `PaymentConfirmed` whenever a booking ref exists | **changed** | publishes only when the status transition actually applied — a late `succeeded` on a refunded row no longer burns a listener |
| `onCanceled` publishes `PaymentCanceled` whenever a booking ref exists | **changed** | same gate. This is the unfiled third instance the grill found: a late `canceled` after `succeeded` would have announced a claim release for a paid booking (the booking-side `AWAITING_PAYMENT` guard was the only thing stopping it) |
| `StripePaymentGateway.cancel` marks `CANCELED` after Stripe confirms the intent is not succeeded | **preserved** | it already reads Stripe's authoritative state first and returns `Canceled()` either way; it ignores the new boolean, which is correct — a repeat sweep over an already-terminal row is a no-op, not a failure |
| An unreadable payload on a handled type → WARN + `200`, event consumed | **changed** | throws → transaction (incl. the dedup insert) rolls back → 5xx → Stripe redelivers. This is the bug (#570) |
| An unreadable payload on an **unhandled** type → `200`, consumed | **preserved** | the `default` arm never calls `paymentIntentId(...)`, so nothing changes for it |
| An event for an intent this app never recorded → WARN + `200` | **preserved** | retrying cannot help (the row will never appear); the deliberate ignore stays |
| Event-id dedup, signature rejection (`400 INVALID_SIGNATURE`), the one-transaction handler | **preserved** | untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The open-state set is drawn too narrow and a **legitimate** transition is silently swallowed (e.g. a retried intent that failed once can no longer reach `SUCCEEDED`) | med | high | `FAILED` is explicitly **open**, not terminal — Stripe's `payment_failed` is non-terminal and the guest may retry the same intent (the reason `findPendingCredentials` already treats `FAILED` as payable). AC-3 pins it | Claude | open |
| R-2 | Gating event publication on the guard suppresses a *needed* `PaymentConfirmed` — e.g. a redelivery meant to re-drive a failed confirm | low | high | Confirm re-drive is the **Event Publication Registry**'s job, not the webhook's (`StripeWebhookListenerFailureIT`): a failed async listener leaves an incomplete publication for resubmission, so nothing depends on a second webhook re-publishing. AC-9 keeps that IT green | Claude | open |
| R-3 | The new 5xx turns a permanently-undeserializable event into a 3-day redelivery storm plus repeating ERROR lines | low | med | That is the intended trade (visible + recoverable beats silent + lost). The id is never blacklisted, so a manual dashboard replay works after a fix; the log line carries event id + type only | Claude | open |
| R-4 | Throwing from the controller leaks a non-RFC-7807 body, against the one-error-contract rule (`riviera-java-conventions` §6b) | low | low | Deliberate and documented: the webhook's only client is Stripe, which reads the status code and ignores the body. No per-controller `@ExceptionHandler` is added (forbidden, `ErrorContractArchitectureTests`); the exception carries `@ResponseStatus` so the status is deterministic and testable | Claude | open |
| R-5 | Widening `markStatus` to `boolean` breaks the three test doubles implementing `Payments` | high | low | Mechanical: `WebSliceStubs`, `PaymentServiceTest`'s inline stub, `ThrowingPayments`. Compile failure is the detector | Claude | open |
| R-6 | Money/payout consequence: a guarded write changes when `PaymentConfirmed` fires, which is what `payout` accrues on (invariant #9) | low | high | The gate only suppresses publication where the payment row did **not** transition — i.e. where the accrual either already happened (terminal `SUCCEEDED`) or must not happen (`REFUNDED`/`CANCELED`). `payout`'s accrual is idempotent per booking regardless | Claude | open |
| R-7 | Flyway version collision | n/a | n/a | **No migration in this slice.** Next free number on `main` is `V42`; unclaimed either way — the only open PRs are dependabot bumps | Claude | closed — no DDL |

## Open questions / Assumptions

- **Assumption:** an intent's **open** set and its **payable** set are the same two states
  (`REQUIRES_PAYMENT`, `FAILED`), so one named constant can serve both queries in `JdbcPayments`.
  Grounded in `findPendingCredentials`' existing comment ("an intent is payable while OPEN") —
  *Owner:* Claude · *Resolves by:* phase 0
- **Assumption:** the SDK's `deserializeUnsafe` can be made to fail in a test by pairing a
  mismatched `api_version` with an unknown `data.object.object` value; if it does not throw, the
  wrong-object-type arm (a well-formed non-PaymentIntent object) still exercises the same
  "no intent id extracted" branch and AC-6 is pinned through it —
  *Owner:* Claude · *Resolves by:* phase 2

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** This slice
  writes only the `payment` table.
- **Indirect effect — and it is the point.** `availability` is written by `booking`'s claim/release,
  which the webhook reaches only through `PaymentConfirmed` / `PaymentCanceled`. Today a late
  `payment_intent.canceled` on a **collected** payment publishes `PaymentCanceled`, i.e. it *asks*
  for the `(set, date)` claim of a paid booking to be released. Nothing bad ships today because
  `PaymentEventListener` drives a guarded `AWAITING_PAYMENT → CANCELLED` transition, so a
  `CONFIRMED` booking ignores it. This slice removes the request at the source (AC-5), turning a
  one-layer defence into two.
- **Uniqueness guarantee:** unchanged — `availability`'s `UNIQUE (set_id, booking_date)`.
- **Concurrency strategy (this slice):** the guarded single-statement `UPDATE … WHERE
  payment_intent_id = :intent AND status IN (:openStates)`. It is atomic under Postgres row
  locking, so two concurrent webhook deliveries cannot both observe "open" and both write — the
  same read-and-write-in-one-statement discipline as the availability claim's
  `INSERT … ON CONFLICT`. A service-level `findRefundState`-then-`markStatus` would have been racy.
- **Pool rule (invariant #3):** N/A — no set selection in scope.
- **Cutoff rule (invariant #4):** N/A — no booking-date arithmetic in scope.
- **Pinning test:** `JdbcPaymentsIT.lateFailureCannotOverwriteASucceededCollection` (the
  single-statement guard) + `StripeWebhookIT.lateCancelAfterSuccessPublishesNoRelease` (the
  release is never requested). No new `ConcurrentReservationIT`-style test is warranted: this
  slice adds no second writer to any row.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | It owns "reconcile payment state from signature-verified Stripe webhooks" (`RESPONSIBILITIES.md` § `payment`). The payment record's state machine is the module's own invariant; no other module reads `payment.status` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | **none added or changed** | — | — |

`Payments` is an **internal** driven port in `payment.application` (implemented by
`adapter/out/JdbcPayments`), not a published surface — so widening it to `boolean` changes no
module boundary and needs no `allowedDependencies` edit. The new
`UnreadableWebhookEventException` is package-private in `payment.adapter.in`, published nowhere.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `PaymentConfirmed` | `payment` | `{ bookingRef, paymentIntentId }` | `booking` | async `@ApplicationModuleListener` | `StripeWebhookIT.verifiedSucceededConfirmsBooking` (unchanged) + AC-4/AC-6 for the suppression cases |
| EV-2 | `PaymentCanceled` | `payment` | `{ bookingRef }` | `booking` | async `@ApplicationModuleListener` | `StripeWebhookIT.canceledPublishesPaymentCanceled` (unchanged) + AC-5 |

Neither event's **shape** changes — only the **condition** under which it is published (a real
transition). No `event_type` rewrite migration is needed (nothing moved or was renamed).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The payment record's allowed state transitions (which webhook outcomes may overwrite which states) | `payment` | `payment` Job: "Reconcile payment state from signature-verified Stripe webhooks (never the client)". A state machine over `payment.status` is that job's core. Not `booking` — its Not-My-Job is "Talking to Stripe or moving money → `payment`", and the booking lifecycle has its own guarded transitions |
| Deciding that an unreadable verified event is retryable rather than consumed | `payment` | Same Job line: reconciliation fidelity is the module's, and the decision is expressed entirely inside its own driving adapter. No other module learns of the event |
| Suppressing `PaymentConfirmed`/`PaymentCanceled` when no transition occurred | `payment` | The publisher decides whether a fact happened; subscribers decide what to do about it. `booking` keeps its own guarded transitions (defence in depth) — this does not move policy into `payment` |

All in `payment`; no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002); payout via manual BKT batch. Untouched.
- **Confirmation trigger:** the signature-verified webhook — unchanged, and *strengthened*: the
  webhook is the source of truth (invariant #8), so its record must not be corruptible by a late
  event, and a verified fact must not be discardable.
- **Idempotency:** unchanged at the gateway (`booking-<id>-pi`, `booking-<id>-refund`). At the
  handler: event-id dedup stays layer one; the guarded `UPDATE` becomes an explicit layer two, so
  "make the transition idempotent" (the `riviera-stripe-payments` red-flag row) is now true of the
  *payment record*, not only of the booking transition.
- **Money:** untouched — no amount arithmetic in this slice. `refunded_minor` is protected by
  AC-2 (a late `FAILED` may not leave `FAILED` alongside `refunded_minor > 0`).
- **Payout-ledger effect:** none directly. Indirectly, gating publication means `payout` cannot be
  handed a `PaymentConfirmed` for a payment that did not transition — accrual stays exactly-once
  (invariant #9), which it already was via its own idempotent listener.
- **Refund policy applied:** unchanged (invariant #10 is `booking`'s decision). This slice only
  stops a late `payment_failed` from *overwriting* a `REFUNDED`/`PARTIALLY_REFUNDED` record.
- **Pinning tests:** `StripeWebhookIT` (out-of-order + unreadable-event contract),
  `JdbcPaymentsIT` (the guard at the SQL seam), `StripeWebhookListenerFailureIT` (registry
  re-drive still the confirm-retry path, unchanged).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. The `/api/payments/stripe/webhook` endpoint's client is Stripe; its
success shape (`200 "ok"` / `"duplicate"`) and its `400 INVALID_SIGNATURE` problem body are
unchanged. The only addition is a 5xx on a previously-silent failure path.

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** Phase 1 — gate `PaymentConfirmed`/`PaymentCanceled` publication on a real transition.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Guard `markStatus` at the SQL seam (#568) | ✅ | `<phase-0>` |
| 1 — Gate event publication on a real transition (#568) | | |
| 2 — Make an unreadable handled event retryable (#570) | | |
| 3 — Docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/stripe-webhook-payment-state-guard.md` — this plan doc
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — `markStatus`
  returns `boolean applied`; Javadoc states the open-state guard
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — the guarded
  `UPDATE`; `OPEN_STATUSES` named once and shared with `findPendingCredentials`
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/StripeWebhookController.java` —
  publish only on a real transition; throw on an unreadable handled event
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/UnreadableWebhookEventException.java`
  — new, package-private, `@ResponseStatus(SERVICE_UNAVAILABLE)`
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — AC-1..AC-3
- `platform/src/test/java/ai/riviera/platform/payment/adapter/in/StripeWebhookIT.java` — AC-4..AC-9
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stub signature
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentServiceTest.java` — stub signature
- `platform/src/test/java/ai/riviera/platform/payment/application/ThrowingPayments.java` — stub signature
- `RESPONSIBILITIES.md` — `payment` § gains the state-machine + unreadable-event rules (the
  rationale §6d keeps out of Javadoc)

---

## Phase 0 — Guard `markStatus` at the SQL seam (#568)

**Files:** Modify `payment/application/Payments.java` · `payment/adapter/out/JdbcPayments.java` ·
`payment/adapter/out/StripePaymentGateway.java:170` · Test `payment/adapter/out/JdbcPaymentsIT.java`
· stubs (`WebSliceStubs`, `PaymentServiceTest`, `ThrowingPayments`)

- [ ] **Step 1: Write the failing tests** — `JdbcPaymentsIT`: a `SUCCEEDED` row refuses `FAILED`
      (AC-1); a `REFUNDED` row refuses `FAILED` and keeps `refunded_minor` (AC-2); an open row
      (`REQUIRES_PAYMENT`, then `FAILED`) still transitions and reports `true` (AC-3).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcPaymentsIT*"` → FAIL
      (today's unconditional `UPDATE` overwrites, and `markStatus` returns `void`, so it will not
      even compile against the new assertions — write the port change with the test).
- [ ] **Step 3: Minimal implementation** — `boolean markStatus(...)` on the port; `AND status IN
      (:openStates)` in the SQL, returning `update() == 1`; update the three stubs.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*JdbcPaymentsIT*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — search every write to `payment.status`
      (`grep -rn "UPDATE payment" platform/src/main`) and every `markStatus` call site; decide
      whether `markRefunded` needs the same guard.
- [ ] **Step 6: Commit** — `git commit -m "Guard the payment record's webhook transitions (#568)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Gate event publication on a real transition (#568)

**Files:** Modify `payment/adapter/in/StripeWebhookController.java` · Test
`payment/adapter/in/StripeWebhookIT.java`

- [ ] **Step 1: Write the failing tests** — AC-4 (late `payment_failed` after success leaves
      `SUCCEEDED`, `200`) and AC-5 (late `canceled` after success publishes no `PaymentCanceled`).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*StripeWebhookIT*"` → FAIL on
      the published `PaymentCanceled` (AC-4 may already pass from phase 0 — that is the phase-0
      guard doing its job; keep the test, it pins the HTTP-level contract).
- [ ] **Step 3: Minimal implementation** — `onSucceeded`/`onCanceled` publish only when
      `markStatus` returned `true`; log the suppression at WARN with event ids only.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*StripeWebhookIT*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — any other publisher that announces a fact it did not
      verify happened?
- [ ] **Step 6: Commit** — `git commit -m "Publish a payment outcome only when the record moved (#568)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Make an unreadable handled event retryable (#570)

**Files:** Create `payment/adapter/in/UnreadableWebhookEventException.java` · Modify
`payment/adapter/in/StripeWebhookController.java` · Test `payment/adapter/in/StripeWebhookIT.java`

- [ ] **Step 1: Write the failing tests** — AC-6 (unreadable `succeeded` → 5xx, **no**
      `stripe_webhook_event` row, payment unchanged), AC-7 (unreadable ignored type → still `200`),
      AC-8 (unknown intent → still `200`, no retry).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*StripeWebhookIT*"` → FAIL
      (today: `200` and a committed dedup row).
- [ ] **Step 3: Minimal implementation** — for the three handled types, an absent intent id throws
      `UnreadableWebhookEventException`; the `@Transactional` rollback un-does the dedup insert.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*StripeWebhookIT*"` → PASS,
      then broaden: `--tests "*payment*"` plus `*ModularityTests*` `*PackageShapeArchitectureTests*`
      `*ErrorContractArchitectureTests*`.
- [ ] **Step 5: Generalization-audit pass** — any other endpoint that records "seen" before it has
      applied the fact?
- [ ] **Step 6: Commit** — `git commit -m "Redeliver, never consume, an unreadable verified webhook event (#570)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 3 — Docs freshness + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `docs/plans/stripe-webhook-payment-state-guard.md`

- [ ] **Step 1:** Run `riviera-docs-freshness` over the merge span; patch what the diff contradicts.
- [ ] **Step 2:** Reconcile the File-structure section —
      `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 3:** Finalize Execution status (`merged via PR #NN`), close every risk row, empty Open
      Questions.
- [ ] **Step 4: Commit** — `git commit -m "Close out the webhook state-guard slice (#568, #570)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | Phase 0 — the guarded transition | every write to `payment.status` | `grep -rn "UPDATE payment" platform/src/main/java` | 2: `markStatus` (guarded now), `markRefunded` | **Subset.** `markRefunded` deliberately stays unguarded: it is not webhook-driven — it records a refund the app *itself* just obtained from the gateway (`StripePaymentGateway.refund` writes it only after Stripe returns a `Refund`), so there is no late-event ordering to defend against. Guarding it on the open states would be actively wrong, since it must move a **`SUCCEEDED`** row |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3:** Run `./gradlew test --tests "*JdbcPaymentsIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4..AC-9:** Run `./gradlew test --tests "*StripeWebhookIT*" --tests "*StripeWebhookListenerFailureIT*"` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; no new write path, and the indirect release-request path is closed (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, stated.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads unchanged (invariant #11).
- [ ] **Payment/payout** section filled; webhooks are source of truth; idempotent; money untouched; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — unchanged, and a refunded record is now protected from overwrite.
- [ ] Timezone correct (invariant #6) — N/A, no time arithmetic.
- [ ] Booking codes unguessable (invariant #7) — no code logged; the new WARN carries event ids only.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no DDL; stated in the risk register.
- [ ] **Frontend** standards — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
