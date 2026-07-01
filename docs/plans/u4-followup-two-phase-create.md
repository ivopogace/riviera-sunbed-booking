# Two-phase create + explicit Stripe timeouts Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Stripe PaymentIntent network call from the locked availability-claim
transaction (risk **R-3** from U4 / #8), so a slow or failing Stripe never holds the
`(set, date)` row lock (or a pooled connection) for its full timeout — by (1) configuring
short, explicit `StripeClient` connect/read timeouts and (2) committing the booking + claim
(`AWAITING_PAYMENT`) **before** creating the PaymentIntent, with a compensating release if PI
creation fails.

**Architecture:** The single most significant decision — **split `create` into a committed
"reserve" transaction and a post-commit "collect" step.** A new package-private
`@Transactional ReserveSetService.reserve(...)` does validate → claim → insert → **commit**
(the lock is released here); `CreateBookingService.create` then calls `checkout.pay(...)`
**outside** any transaction. On `Failed` it **compensates** by reusing the #51
`ReleaseAbandonedBooking.release(bookingId)` (guarded `AWAITING_PAYMENT → CANCELLED` +
availability release), with the #51 TTL sweep as the crash backstop. Invariant #2 is preserved
because claim atomicity comes from the DB `UNIQUE(set_id, booking_date)` + `INSERT … ON
CONFLICT` claim, **not** from holding the lock across the payment call.

**Persistence:** JDBC only (invariant #1). **No schema change, no Flyway migration** — reuses
the existing `insertAwaitingPayment`, the #51 `cancelAwaitingPayment … RETURNING`, and
`availability.release`. (`postgres` skill therefore not triggered — no SQL/index/table work.)

**Source of intent:** GitHub issue **#52** (U4-followup). Origin **#8**
(`docs/plans/u4-stripe-payment-webhook.md`, risk **R-3** + the cleanup reviewer's "no explicit
Stripe timeout" note). Builds directly on **#51** (`abandoned-booking-ttl-sweep.md`), whose
`ReleaseAbandonedBooking` is the compensating-release seam. ADR-0002 (collect-only, no Connect).

**Skills consulted:** `riviera-sdlc` (Issue-intake grill — validated #51's `ReleaseAbandonedBooking`
exists to reuse, that moving `pay()` out of the txn doesn't weaken invariant #2, and that no
migration is needed; + the routing gate), `riviera-plan-doc` (this doc), `riviera-modulith`
(the new `ReserveSetService` is package-private `booking.application`, no interface — single
internal impl; no new `api/`/`spi` port; no new `allowedDependencies` — `ReleaseAbandonedBooking`
is already in-module `booking.application.in`), `riviera-java-conventions` (declarative
`@Transactional` on the small reserve write method — the production house style, *not*
`TransactionTemplate` which exists only in two payout test files; sealed `ReserveOutcome`;
package-private `@Service`; constructor injection; `Duration` config), `riviera-stripe-payments`
(collect-only `StripeClient` timeout config at the Stripe edge; webhook stays the source of
truth — the two-phase split changes *when* the PI is created, never *how* a booking confirms).

**Branch:** `claude/riviera-sdlc-issue-52-7rn4ph` (exists, checked out).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the `stripe` profile, when the `StripeClient` bean is built, then it is
  configured with explicit short connect/read timeouts sourced from `stripe.connect-timeout` /
  `stripe.read-timeout` (defaults 5s / 20s), not the SDK's 30s/80s defaults.
  *Pinned by:* `StripeConfigTest.buildsClientWithConfiguredTimeouts`,
  `StripeConfigTest.bindsTimeoutsFromConfigWithDefaults`.
- [ ] **AC-2:** Given an online set claimable on a future date, when `create` runs the real
  (Pending) Stripe path, then the booking + claim are **persisted/committed before**
  `checkout.pay` is invoked (the PI call is outside the reserve transaction) and the outcome is
  `AwaitingPayment`. *Pinned by:* `CreateBookingServiceTest.persistsBeforePayingThenAwaits`,
  `CreateBookingStripeProfileIT.createReturns202AwaitingPaymentWithClientSecret` (still green).
- [ ] **AC-3:** Given a committed `AWAITING_PAYMENT` booking, when PI creation fails (gateway
  returns `Failed`), then the booking is **not** left orphaned `AWAITING_PAYMENT` with a held
  claim — it is `CANCELLED` and its `(set, date)` row is freed (re-claimable) via the
  compensating `ReleaseAbandonedBooking.release`, and the create surfaces the failure.
  *Pinned by:* `CreateBookingServiceTest.compensatesByReleasingWhenPaymentFails`,
  `CreateBookingPaymentFailureIT.releasesClaimWhenPaymentIntentCreationFails`.
- [ ] **AC-4:** Given many tourists racing the same `(set, date)`, when they create concurrently,
  then exactly one ends `CONFIRMED` and every other `SET_TAKEN` — invariant #2 holds with the
  network call out of the locked transaction. *Pinned by:* `ConcurrentReservationIT.exactlyOneWins`
  (unchanged, still green).
- [ ] **AC-5:** `ModularityTests` + `JdbcOnlyArchitectureTests` stay green; `./gradlew build` green.
  *Pinned by:* `ModularityTests`, `JdbcOnlyArchitectureTests`, build green.

## Non-goals

- No change to the stub (default-profile) **synchronous** confirm semantics beyond the necessary
  consequence that confirm now runs in its own post-commit transaction (the stub has no network
  call; the split is harmless there). The stub never returns `Failed`/`Pending`.
- No new booking lifecycle status — `AWAITING_PAYMENT → CANCELLED` reuses the existing transition.
- No retry/backoff of a failed PI creation in `create` (a user-facing failure is returned; the TTL
  sweep + the client re-submitting is the recovery path). No Request-to-Book authorize/capture.
- No Flyway migration, no new table/column/index (reuses existing SQL).
- No frontend / Angular / Playwright (backend-only).
- No mapping of `PaymentDeclinedException` to a non-500 HTTP status (pre-existing; the stub never
  declines, the real path's hard failure is an exceptional 5xx — out of scope to redesign here).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Splitting the txn lets the booking commit `AWAITING_PAYMENT`, then PI creation fails → orphaned booking holding a set | med | high | Compensating `ReleaseAbandonedBooking.release` on `Failed` (guarded `UPDATE … RETURNING` + `availability.release`), exactly the #51 seam; #51 TTL sweep is the backstop if the process crashes between commit and compensation (AC-3) | claude | open |
| R-2 | Moving `pay()` out of the locked txn weakens the double-booking guard (invariant #2) | low | high | Claim atomicity is the DB `UNIQUE(set_id, booking_date)` + `INSERT … ON CONFLICT` in the **committed** reserve txn — independent of lock-hold duration; `ConcurrentReservationIT` proves exactly-one-wins (AC-4) | claude | open |
| R-3 | Stub-path confirm now runs in a separate post-commit txn; if it throws, the booking would be stuck `AWAITING_PAYMENT` (default profile has no TTL sweep) | low | low | **Mitigated in code** (review finding): the `Succeeded` branch wraps `confirm` and compensates symmetrically with the `Failed` branch (release the claim, then rethrow) — no asymmetry, no stranded set on any profile. Pinned by `CreateBookingServiceTest.compensatesWhenConfirmFailsAfterCommit` | claude | mitigated |
| R-4 | Compensating release itself fails (transient DB error) after the `Failed` branch | low | med | `release` is its own `@Transactional` guarded unit; on failure the booking is left `AWAITING_PAYMENT` and the **#51 TTL sweep** cancels the (already-failed) PI and frees the set within the TTL — the documented backstop | claude | open |
| R-5 | Too-short Stripe timeouts cause false failures under normal latency | low | med | Defaults connect 5s / read 20s ≫ a normal sub-second PI create; **configurable** via `stripe.connect-timeout` / `stripe.read-timeout` so ops can tune per environment | claude | open |
| R-6 | A `Failed` after commit double-charges if the same booking is retried (new PI) | low | med | The PI idempotency key is `booking-<id>-pi` (per booking id); a compensated+cancelled booking is `CANCELLED` and not retried in place — a re-submit is a **new** booking id ⇒ new key. No double-charge | claude | open |

## Open questions / Assumptions

### Resolved

- **Compensation vs rely-only-on-sweep** — **Resolved:** do the **explicit** compensating release
  on `Failed` (frees the set immediately, good UX + end-to-end testable) with the #51 TTL sweep as
  the crash backstop. The issue allows "compensating release, **or** covered by the TTL sweep"; we
  do both (belt and braces). *Owner:* claude (verified `ReleaseAbandonedBooking` exists in code).
- **Transaction-boundary mechanism** (separate `@Transactional` bean vs `TransactionTemplate`) —
  **Resolved:** a separate package-private `@Service ReserveSetService` with declarative
  `@Transactional` — the production house style (`ConfirmBookingService` / `ClaimReleaseService`);
  `TransactionTemplate` appears only in two payout *test* files, so introducing it in prod code
  would be a novel pattern. *Owner:* claude.
- **Timeout values / configurability** — **Resolved:** connect 5s, read 20s, configurable via
  `stripe.connect-timeout` / `stripe.read-timeout` (ISO-8601 `Duration`). A tuning default, not a
  product decision — not escalated. *Owner:* claude.
- **Does the stub path stay atomic?** — **Resolved:** no, and that is fine — confirm moves to a
  post-commit txn (R-3, accepted; stub is in-process, dev/CI only). *Owner:* claude.
- **Migration needed?** — **Resolved:** no — reuses existing SQL (`insertAwaitingPayment`,
  `cancelAwaitingPayment … RETURNING`, `availability.release`). *Owner:* claude (verified vs code).

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged set of writers. This slice
  adds **no new SQL**. The create flow still `claim`s the row (now inside the committed `reserve`
  txn); the **new** behaviour is that on a payment `Failed` the create calls the existing
  `availability.release` (via `ReleaseAbandonedBooking`) — the same release the webhook/sweep use,
  which deletes only a `BOOKED_ONLINE` row (never a staff `WALK_IN`).
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` on `set_availability`.
- **Concurrency strategy:** the atomic `INSERT … ON CONFLICT DO NOTHING` claim (`ClaimOutcome`)
  inside the `reserve` transaction is the primitive. Because the claim **commits** before `pay`,
  the row lock is **not** held across the Stripe network call — exactly the R-3 fix. A concurrent
  same-`(set,date)` booker loses its own claim (`ALREADY_TAKEN → SET_TAKEN`) without blocking on a
  payment round-trip.
- **Pool rule (invariant #3):** unchanged — online create targets only `ONLINE` sets; release frees
  only a `BOOKED_ONLINE` row.
- **Cutoff rule (invariant #4):** unchanged — the evening-before cutoff is enforced in `reserve`
  before the claim (`BookingCutoff`, `Europe/Tirane`).
- **Pinning test:** `ConcurrentReservationIT.exactlyOneWins` (unchanged) proves two concurrent
  reservations of the same `(set, date)` cannot both succeed with the network call moved out.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the create orchestration + the lifecycle; the reserve/collect split and the compensating release are internal to it. |
| M-2 | `payment` | existing | `Payment` | Owns the Stripe edge; the `StripeClient` timeout config is `payment.infrastructure`. |
| M-3 | `availability` | existing | `SetAvailability` | Sole writer of the row; `claim` + `release` reused unchanged via `availability.api`. |

**Cross-module named interfaces (`api/` ports)** — no new ports. Reused, unchanged:

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `CheckoutPort#pay(BookingRef, Money)` (existing) | `PaymentOutcome` (sealed) | `booking` |
| NI-2 | `availability.api` | `AvailabilityClaim#claim/release` (existing) | `ClaimOutcome` | `booking` |

`ReserveSetService` is package-private `booking.application` with **no** interface (single internal
impl — `riviera-java-conventions`: don't invent a port for one impl). `ReleaseAbandonedBooking` is
already `booking.application.in` (in-module). **No new `allowedDependencies`.**

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` (existing) | `booking` (via `ConfirmBooking`) | `{ bookingId, venueId, setId, bookingDate, amountMinor, currency }` | `availability`, `payout` | async `AFTER_COMMIT` | `PayoutAccrualIT` (unchanged) |

The slice adds **no event** — the `Failed` path calls `ReleaseAbandonedBooking` directly (sync; it
needs the outcome), matching the #51 sweep's choice.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002). The PaymentIntent is still created
  by `StripePaymentGateway.initiate`; this slice only changes **when** (after the reserve commit)
  and adds an explicit client timeout.
- **Confirmation trigger:** unchanged — a booking confirms only on the signature-verified webhook
  (invariant #8). The two-phase split never confirms from the create path for the real gateway; it
  returns `AwaitingPayment` exactly as before.
- **Idempotency:** unchanged — PI create keeps its `booking-<id>-pi` idempotency key. A compensated
  booking is `CANCELLED`; a re-submit is a new booking id ⇒ a new key (no double-charge, R-6).
- **Money:** unchanged — integer minor units, EUR; converted only at the Stripe edge.
- **Payout-ledger effect:** none — an `AWAITING_PAYMENT`/compensated-`CANCELLED` booking never
  accrued (accrual is on `BookingConfirmed`), so there is nothing to reverse.
- **Refund policy applied:** N/A — nothing was collected on the failure path (PI create failed), so
  there is nothing to refund; the compensation is a **cancel + release**, not a refund.
- **Pinning tests:** `CreateBookingPaymentFailureIT`, `CreateBookingStripeProfileIT`, `StripeConfigTest`.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no API shape change. `POST /api/bookings` still returns `201 Confirmed` (stub) / `202
AwaitingPayment` (Stripe) with the same body; the failure path still surfaces as a 5xx
(unchanged). The two-phase split is internal.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — Explicit Stripe client timeouts | ✅ | `a9df3d6` |
| 2 — Two-phase create + compensating release | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Phase 1 (timeouts)**
- `payment/infrastructure/StripeProperties.java` — add `Duration connectTimeout/readTimeout` (defaults).
- `payment/infrastructure/StripeConfig.java` — build via `StripeClient.builder()` with the timeouts;
  package-private static `clientBuilder(props)` seam for testing.
- `payment/infrastructure/StripeConfigTest.java` — timeout binding defaults/override + builder wiring.
- `application.properties` — document `stripe.connect-timeout` / `stripe.read-timeout` defaults.

**Phase 2 (two-phase create)**
- `booking/application/ReserveOutcome.java` — new package-private sealed `Reserved` / `Rejected`.
- `booking/application/ReserveSetService.java` — new package-private `@Service`, `@Transactional reserve(...)`.
- `booking/application/CreateBookingService.java` — orchestrate reserve (committed) → pay (outside txn)
  → confirm / awaiting / compensating-release; inject `ReserveSetService` + `ReleaseAbandonedBooking`.
- `booking/application/CreateBookingServiceTest.java` — rewire fakes; new `persistsBeforePayingThenAwaits`,
  `compensatesByReleasingWhenPaymentFails`; keep existing branch coverage green.
- `booking/CreateBookingPaymentFailureIT.java` — new stripe-profile IT: PI create throws → booking
  `CANCELLED`, set freed.

---

## Phase 1 — Explicit Stripe client timeouts

TDD: extend `StripeProperties` with `connectTimeout`/`readTimeout` (`Duration`, defaults 5s/20s);
add `StripeConfig.clientBuilder(props)` building `StripeClient.builder().setApiKey(...)
.setConnectTimeout((int) connectTimeout.toMillis()).setReadTimeout((int) readTimeout.toMillis())`;
`stripeClient` bean returns `clientBuilder(props).build()`. `StripeConfigTest` asserts the bound
defaults/overrides and that `clientBuilder` sets the expected millis (the builder exposes
`getConnectTimeout()`/`getReadTimeout()`).

## Phase 2 — Two-phase create + compensating release

TDD: extract validate→claim→insert into `@Transactional ReserveSetService.reserve(...)` returning
sealed `ReserveOutcome`; make `CreateBookingService.create` non-transactional, call `reserve`, then
`checkout.pay` outside the txn and branch (`Succeeded`→`confirmBooking.confirm`; `Pending`→
`AwaitingPayment`; `Failed`→`releaseAbandonedBooking.release(new BookingId(id))` then throw
`PaymentDeclinedException`). Unit-test the ordering + compensation with fakes; add the stripe-profile
compensation IT. End with `./gradlew build` (incl. `ModularityTests`, `JdbcOnlyArchitectureTests`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-06-30 | Phase 2 — extracting the reserve phase | other callers of the validate→claim→insert / `insertAwaitingPayment` flow | grep `insertAwaitingPayment`, `availability.claim` | only `CreateBookingService` (the create path); the webhook/sweep paths use `confirmFromPayment`/`cancelAwaitingPayment`, not the create flow | Moved the whole validate→claim→insert unit into `ReserveSetService` (single owner); no other site to generalize. The compensating-release used the **existing** shared `ReleaseAbandonedBooking` (#51), so no new release path was forked. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `./gradlew test --tests "*StripeConfigTest*"` → PASS (4/4). Verified at `a9df3d6`.
- [x] **AC-2/AC-3:** `./gradlew test --tests "*CreateBookingServiceTest*" --tests "*CreateBookingPaymentFailureIT*"` → PASS (unit branch coverage + the stripe-profile compensation IT).
- [x] **AC-4:** `./gradlew test --tests "*ConcurrentReservationIT*"` → PASS (exactly-one-wins, unchanged).
- [x] **AC-5:** `./gradlew build` → BUILD SUCCESSFUL incl. `ModularityTests` + `JdbcOnlyArchitectureTests`.

## Review note (SDLC Review gate)

Ran the Review gate (`riviera-review-overlay` + `/code-review` on `origin/main...HEAD`, high effort,
8 finder angles → verify). The two headline overlay checks passed: **RV-BE-1** (the atomic claim
moved intact into the committed `reserve` txn; no new `set_availability` writer; compensation goes
only through the shared `availability.api.release`) and **RV-CT-3/RV-BE-7** (the real Stripe path
still returns `AwaitingPayment` and confirms only via the verified webhook — only the in-process stub
confirms synchronously). JDBC-only (#1), Modulith boundaries (#11), money/time (#5/#6), booking-code
logging (#7), and **RV-PROC-1** (Skills consulted matches the diff) all clean.

Findings fixed (re-entered Implement; skills already loaded — `riviera-modulith` +
`riviera-java-conventions` + `riviera-stripe-payments`):
- **Confirm-after-commit asymmetry (the load-bearing finding):** the `Succeeded`/stub path confirmed
  post-commit with no compensation, so a confirm failure would strand the set `AWAITING_PAYMENT`
  (no TTL sweep on the default profile). Now compensates symmetrically with the `Failed` branch
  (release + rethrow). Pinned by `CreateBookingServiceTest.compensatesWhenConfirmFailsAfterCommit`.
- **Timeout int-overflow (Minor):** `(int) Duration.toMillis()` → `Math.toIntExact(...)` so a
  misconfigured > ~24.8-day timeout fails fast at startup instead of wrapping negative.
- **Test honesty/precision (Minor):** corrected `persistsBeforePayingThenAwaits` to claim only the
  insert→pay ordering it proves (the commit boundary is proven structurally + by the IT); strengthened
  `CreateBookingPaymentFailureIT` to assert exactly one booking row for the `(set, date)`.

Deferred to a follow-up issue (out of scope, no money/double-sell risk):
- **Orphaned PaymentIntent on a created-but-read-timed-out PI:** `StripePaymentGateway.initiate`
  registers the intent id *after* `create()`, so a PI that Stripe creates but whose response exceeds
  the (now shorter) read timeout is returned as `Failed` with no DB record; the compensation frees the
  set correctly but cannot later `cancel` that PI (no id on record). Harmless (PI unconfirmed → no
  charge, Stripe auto-expires it, set is freed), but worth hardening in the gateway. Filed as
  **#66**. *Rationale:* needs a gateway change (register-before-create / idempotency-key lookup),
  distinct from this slice's reserve/collect split.

Accepted as-is: the ignored `release()` boolean on the `Failed` path — `false` (booking no longer
`AWAITING_PAYMENT`) is unreachable there, since the booking was just committed and nothing else can
have transitioned it before the code is handed to anyone.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] **No JPA**; `JdbcClient` + SQL only; no new SQL at all this slice (invariant #1).
- [ ] **Availability** section filled; `ConcurrentReservationIT` proves exactly-one-wins with the
      network call moved out of the locked txn (invariant #2).
- [ ] Pool + cutoff rules unchanged and honored (invariants #3, #4).
- [ ] **Modulith** section filled; `ReserveSetService` package-private in-module, no new port, no new
      `allowedDependencies`; `ModularityTests` green (invariant #11).
- [ ] **Payment** section filled; webhook stays the source of truth; PI idempotency unchanged; no
      money moved on the failure path (invariants #5, #8).
- [ ] Timezone unchanged: UTC stored, `Europe/Tirane` cutoff (invariant #6).
- [ ] Booking codes never logged (invariant #7) — `code` still logged nowhere above DEBUG.
- [ ] No Flyway migration needed (no schema change) — verified (invariant #12).
- [ ] Execution-status table matches reality; Open Questions empty (all Resolved).
