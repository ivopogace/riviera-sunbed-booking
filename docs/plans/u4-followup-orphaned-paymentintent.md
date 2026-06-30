# Harden StripePaymentGateway against an orphaned PaymentIntent Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the **register-after-create** gap in `StripePaymentGateway.initiate` (issue #66,
surfaced by the #52 review gate). Today the PaymentIntent id is persisted (`payments.register`)
**only after** `stripe…paymentIntents().create(...)` returns; so a PI that Stripe *creates* but
whose response exceeds our (now 20s) read timeout throws `ApiConnectionException` → caught →
`Failed`, and `register` never runs — the PI lingers at Stripe **untracked** (un-cancellable,
because `findIntentByBookingRef` is empty). Harden so the created-but-timed-out PI is **recovered
and recorded**.

**Architecture:** The single significant decision — **retry the idempotent `create` once on a
connection failure**, inside `initiate`, then register as normal. Stripe's idempotency-key replay
(`booking-<id>-pi`, already deterministic) returns the **same** PaymentIntent that the first
(timed-out) call created — so the id + client secret are recovered and `register` runs. If the
first request never reached Stripe (connect failure), the replay simply creates it fresh. Either
way the id is recoverable and never double-created (idempotency key guarantees one PI per booking).
This is gateway-level (unit-testable against the mocked `StripeClient`, per AC-3), needs no SDK
`maxNetworkRetries` (which would be invisible behind the mock and untestable at the gateway), no
new port, no schema change. The retry is **narrow**: only `ApiConnectionException` (the timeout /
network case) is retried — a definitive Stripe response (decline, invalid-request) is **not**
replayed (no orphan risk, and a replay would just repeat the same definitive error).

**Persistence:** JDBC only (invariant #1). **No schema change, no Flyway migration** — `register`,
`findIntentByBookingRef` and the `payment` table are unchanged; the fix is control-flow in the
adapter only. (`postgres` skill therefore not triggered — no SQL/index/table work.)

**Source of intent:** GitHub issue **#66** (U4-followup). Origin: the **#52** review gate
(`docs/plans/u4-followup-two-phase-create.md`, Review note — "Orphaned PaymentIntent on a
created-but-read-timed-out PI", deferred to this follow-up). ADR-0002 (collect-only, no Connect).

**Skills consulted:** `riviera-sdd` (Issue-intake grill — confirmed the gap in current code, that
the idempotency key is already deterministic, that no migration is needed, and that the recovery is
gateway-level; + the routing gate), `riviera-plan-doc` (this doc), `riviera-stripe-payments`
(idempotency-replay is the recovery mechanism; collect-only; webhook stays the source of truth — the
retry changes only *whether the id is recovered*, never *how a booking confirms*), `riviera-modulith`
(in-place edit of the package-private `payment.infrastructure.out.StripePaymentGateway` adapter — no
new module/`api`/`spi` port, no `allowedDependencies` change, no class moved), `riviera-java-conventions`
(narrow `catch (ApiConnectionException)` — never a bare catch; package-private adapter unchanged; SLF4J
code-only logging; no new types).

**Branch:** `claude/riviera-sdd-issue-66-izkenl` (exists, checked out).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the `stripe` profile, when `create` throws `ApiConnectionException` on the
  first attempt (Stripe created the PI but the response was lost), then `initiate` **replays the
  create with the same idempotency key**, recovers the PI, **registers** it, and returns
  `PaymentOutcome.Pending` — so the PI is recorded, never left orphaned-and-untracked at Stripe.
  *Pinned by:* `StripePaymentGatewayTest.recoversAndRegistersWhenCreateTimesOutAfterStripeCreated`.
- [ ] **AC-2:** Given a normal create that returns on the first attempt, when `initiate` runs, then
  `create` is invoked **exactly once** and the happy path is byte-for-byte unchanged (same params,
  idempotency key, `register`, `Pending`). Invariant #8 holds — still `Pending`, confirmed only by
  the verified webhook. *Pinned by:* `StripePaymentGatewayTest.createsIntentWithIdempotencyKeyAndMinorUnits`
  (existing, must add a "single create call" assertion).
- [ ] **AC-3:** Given a definitive Stripe error (`StripeException` that is **not**
  `ApiConnectionException`, e.g. a decline) on the first attempt, when `initiate` runs, then it is
  **not** retried and maps to `PaymentOutcome.Failed` with the error code.
  *Pinned by:* `StripePaymentGatewayTest.stripeFailureMapsToFailed` (existing — assert create called once).
- [ ] **AC-4:** Given the first attempt times out (`ApiConnectionException`) **and** the replay also
  fails, when `initiate` runs, then it maps to `Failed` (the documented residual: a *double* timeout;
  Stripe auto-expires the unconfirmed PI, exactly as the pre-existing self-heal — no money/double-sell
  risk). *Pinned by:* `StripePaymentGatewayTest.failsWhenBothCreateAttemptsTimeOut`.
- [ ] **AC-5:** `ModularityTests` + `JdbcOnlyArchitectureTests` stay green; `./gradlew build` green.
  *Pinned by:* `ModularityTests`, `JdbcOnlyArchitectureTests`, build green.

## Non-goals

- **No SDK-level `setMaxNetworkRetries`.** The fix is at the gateway so it is testable per AC-3 and
  so a successful return (the only thing that lets `register` run) is always followed by `register`.
- **No change to the compensation / cancel path** (`ReleaseAbandonedBooking`, `gateway.cancel`). With
  the PI now recorded on the timeout race, the existing cancel path can already void it via
  `findIntentByBookingRef`; no new `gateway.cancel()` call is added to the booking compensation.
- **No retry of a *definitive* Stripe error** (decline/invalid-request) — only `ApiConnectionException`.
- **No unbounded/​configurable retry count** — a single replay is the proportional fix for a low-impact
  follow-up; the double-timeout residual is covered by Stripe auto-expiry (issue "Impact (low)").
- **No Flyway migration, no table/column/index change** (reuses existing `payment` SQL).
- **No frontend / Angular / Playwright** (backend-only, no API-shape change).
- **No change to refund / cancel idempotency** — those keys/paths are untouched.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The replay double-creates a second PaymentIntent (double-charge risk) | low | high | Same idempotency key `booking-<id>-pi` on both attempts ⇒ Stripe returns the **original** PI, never a second; at create time nothing is charged anyway (PI is `requires_payment_method`) | claude | mitigated by design |
| R-2 | Retrying a *definitive* error (decline) hides a real failure or loops | low | med | Catch is **narrow** — only `ApiConnectionException` is replayed; every other `StripeException` falls straight through to `Failed`, unchanged | claude | open |
| R-3 | Both attempts time out → PI still orphaned | low | low | Documented residual: Stripe auto-expires the unconfirmed PI (no charge, set already freed by the #52 compensation) — same self-heal as today, now far rarer (needs *two* consecutive timeouts) | claude | accepted |
| R-4 | The replay changes confirmation semantics (invariant #8) | low | high | The replay only recovers the **id** and returns `Pending`; the booking still confirms **only** on the signature-verified webhook — confirmation path untouched | claude | open |
| R-5 | A latent `register` failure after a successful replay strands the booking | low | low | Unchanged from today — `register` already runs after a successful create; the replay just provides one more successful return to register from | claude | open |

## Open questions / Assumptions

### Resolved

- **Which of the issue's three options?** — **Resolved:** option 1 (retrieve-or-create by
  idempotency key), realized as an **idempotent `create` replay on `ApiConnectionException`** — the
  only API mechanism to recover a PI from its idempotency key is to replay the create (Stripe has no
  "get by idempotency key" endpoint). Options 2/3 (persist-before-create, cancel-via-key in the
  compensation) are heavier and push create-params knowledge into the cancel path; rejected as
  out-of-proportion for a low-impact follow-up. *Owner:* claude (verified vs code + Stripe semantics).
- **Retry count?** — **Resolved:** a single replay. The double-timeout residual is covered by Stripe
  auto-expiry (the issue's accepted self-heal). A tuning detail, not a product decision — not escalated.
  *Owner:* claude.
- **SDK `maxNetworkRetries` instead?** — **Resolved:** no — it would be invisible behind the mocked
  `StripeClient` (untestable per AC-3) and still leaves `register` running only after a successful
  return; the gateway-level replay is what closes the register-after-create gap testably. *Owner:* claude.
- **Migration needed?** — **Resolved:** no — `register` / `findIntentByBookingRef` / the `payment`
  table are unchanged; the fix is adapter control-flow only. *Owner:* claude (verified vs code).

## Availability & concurrency (invariant #2)

N/A — this slice touches no `availability(set_id, booking_date)` write path. It changes only the
Stripe `payment.infrastructure.out` adapter's create-error handling. The #52 two-phase create already
frees the `(set, date)` on a payment `Failed` via `ReleaseAbandonedBooking`; that behaviour is
unchanged. The hardening makes the timed-out PI **recorded** so a later cancel *can* void it, but it
adds no new availability writer and no new claim/release.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns the Stripe edge; the create-replay recovery is internal to `payment.infrastructure.out`. |

**Cross-module named interfaces (`api/` ports)** — none added or changed. `CheckoutPort` /
`PaymentGateway` / `Payments` signatures are all unchanged.

`StripePaymentGateway` stays a **package-private** `@Component` in `payment.infrastructure.out`
(`riviera-modulith`: only the `api/` port is public). **No new `allowedDependencies`**, no class
moved between packages, no new `spi`.

**Domain events (id-based payloads, invariant #11)**

N/A — the slice adds no event. Confirmation still flows from the existing verified-webhook path.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002). The PaymentIntent is still created
  by `StripePaymentGateway.initiate`; this slice only adds a **single idempotent replay** when the
  create response is lost to a connection timeout.
- **Confirmation trigger:** unchanged — a booking confirms only on the signature-verified webhook
  (invariant #8). The replay returns `Pending`, never confirms from the create path.
- **Idempotency:** the recovery **relies on** the existing `booking-<id>-pi` key — replaying with the
  same key returns the original PI (one PI per booking, no double-charge). Refund key untouched.
- **Money:** unchanged — integer minor units, EUR; converted only at the Stripe edge (#5).
- **Payout-ledger effect:** none — nothing accrues until `BookingConfirmed`; an
  `AWAITING_PAYMENT`/recovered-`Pending` booking has not accrued.
- **Refund policy applied:** N/A — nothing is collected on the create path; no refund involved.
- **Pinning tests:** `StripePaymentGatewayTest` (new + existing cases above).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no API shape change. `POST /api/bookings` behaviour is unchanged; the recovery is internal to
the Stripe adapter. A recovered timeout now returns `202 AwaitingPayment` (as a normal Pending would)
instead of a 5xx — a strict improvement, no contract change.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — Idempotent create-replay recovery + tests | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `payment/infrastructure/out/StripePaymentGateway.java` — narrow `catch (ApiConnectionException)`
  around the first `create`; on it, replay `create` once with the **same** params + options, then
  `register` + return `Pending`; if the replay throws, fall through to `Failed`. A small private
  helper `createWithRetry(params, options, booking)` keeps `initiate` readable.
- `payment/infrastructure/out/StripePaymentGatewayTest.java` — add
  `recoversAndRegistersWhenCreateTimesOutAfterStripeCreated` (first call throws
  `ApiConnectionException`, second returns the created PI → register + Pending),
  `failsWhenBothCreateAttemptsTimeOut`, and a "create called once" assertion on the happy-path +
  definitive-failure cases.

---

## Phase 1 — Idempotent create-replay recovery

TDD: red — add `recoversAndRegistersWhenCreateTimesOutAfterStripeCreated` (mock `intents.create` to
throw `ApiConnectionException` then return the PI; assert `register` + `Pending`, `create` called
twice). Green — extract the create into `createWithRetry`: try once; on `ApiConnectionException` log
(code-only) and replay once; let any other `StripeException` (and a failed replay) propagate to the
existing `catch (StripeException) → Failed`. Add `failsWhenBothCreateAttemptsTimeOut` and the
single-call assertions. End with `./gradlew test --tests "*StripePaymentGatewayTest*"` then
`./gradlew build` (incl. `ModularityTests`, `JdbcOnlyArchitectureTests`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-06-30 | Phase 1 — register-after-create | other Stripe `create`/`register` ordering with idempotency keys | grep `payments.register`, `\.create(` in `payment.infrastructure.out` | `initiate` (PI create) and `refund` (Refund create). The refund path's `markRefunded` is also after `create`, but a lost-response refund is **already recoverable** via the same idempotency key on the next cancel attempt (the cancel/refund path re-derives the key), and a refund is driven by a retrying sweep — not the create-once race #66 is about. No second site needs the same replay. | Applied the replay only to `initiate` (the create-once, user-facing path); noted the refund path is covered by its retrying caller + idempotency key. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `./gradlew test --tests "*StripePaymentGatewayTest*"` →
  `recoversAndRegistersWhenCreateTimesOutAfterStripeCreated` PASS (PI recovered via replay, registered, `Pending`).
- [x] **AC-2:** `createsIntentWithIdempotencyKeyAndMinorUnits` PASS — `verify(intents).create(...)` pins a
  single create call on the happy path (Mockito `verify` defaults to `times(1)`).
- [x] **AC-3:** `stripeFailureMapsToFailed` PASS with the added `times(1)` assertion — a definitive error is not replayed.
- [x] **AC-4:** `failsWhenBothCreateAttemptsTimeOut` PASS — double timeout → `Failed`, nothing registered.
- [x] **AC-5:** `./gradlew build` → BUILD SUCCESSFUL (incl. `ModularityTests` + `JdbcOnlyArchitectureTests` + all ITs).

## Review note (SDD Review gate)

_To be filled at the review gate._

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] **No JPA**; no SQL change at all this slice (invariant #1).
- [ ] Availability section justified `N/A` — no `(set, date)` writer touched (invariant #2).
- [ ] Pool + cutoff rules unchanged (invariants #3, #4).
- [ ] **Modulith** section filled; adapter stays package-private in-module, no new port/`allowedDependencies`;
      `ModularityTests` green (invariant #11).
- [ ] **Payment** section filled; webhook stays the source of truth; PI idempotency relied upon, not
      changed; no money moved on the create path (invariants #5, #8).
- [ ] Timezone unchanged (invariant #6). Booking codes never logged (invariant #7).
- [ ] No Flyway migration needed (no schema change) — verified (invariant #12).
- [ ] `catch` is narrow (`ApiConnectionException`), never a bare `catch (Exception)`.
- [ ] Execution-status table matches reality; Open Questions empty (all Resolved).
