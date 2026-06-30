# Abandoned-payment TTL sweep Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled sweep expires `AWAITING_PAYMENT` bookings older than a configurable TTL
and frees their `(set, date)` availability claim, closing the held→confirmed gap (D-3 / R-4) for
true abandonment (closed tab → no terminating webhook), idempotently with the existing
`payment_intent.canceled` path.

**Architecture:** The single most significant decision — **cancel the lingering Stripe
PaymentIntent first, then release the claim directly** (not "cancel the PI and wait for the
webhook to release"). The sweep authoritatively cancels the PI at Stripe (so the payment truly
cannot succeed), and only then reuses the **same** guarded `cancelAwaitingPayment` + `release`
orchestration the webhook listener uses — extracted into one shared transactional application
service so the two drivers (webhook event, scheduled sweep) cannot double-act. Idempotency is the
guarded `UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING`: whoever transitions the row first
wins; the second driver is a 0-row no-op. The Stripe cancel itself is made idempotent by reading
the PI status first (a `succeeded` PI is left for the confirm webhook; an already-`canceled` PI is
treated as success).

**Persistence:** JDBC only (invariant #1). One new Flyway migration (V13) adds a **partial index**
on `booking(created_at) WHERE status='AWAITING_PAYMENT'` for the sweep predicate; no table/column
change (the existing `booking.created_at TIMESTAMPTZ` is the age column).

**Source of intent:** GitHub issue **#51** (U4-followup); origin #8
(`docs/plans/u4-stripe-payment-webhook.md`, D-3 / R-4). ADR-0002 (collect-only, no Connect).

**Skills consulted:** `riviera-sdd` (Issue-intake grill + routing gate), `riviera-plan-doc` (this
doc), `riviera-modulith` (the cancel port goes in `payment.api`; the shared release + sweep are
`booking.application`; the scheduler is a `booking.infrastructure.in` driving adapter; no new
`allowedDependencies` — `booking` already has `payment::api`/`availability::api`, `payment` stays
self-contained), `riviera-java-conventions` (JDBC `JdbcClient` read, sealed `PaymentCancellation`
outcome, package-private adapters, constructor injection, `@Scheduled` not hand-rolled threads),
`riviera-stripe-payments` (collect-only `PaymentIntent.cancel`, no Connect, idempotent), `postgres`
(partial index on the sweep predicate, `TIMESTAMPTZ`).

**Branch:** `claude/abandoned-booking-ttl-sweep-gjuons` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an `AWAITING_PAYMENT` booking created more than the TTL ago whose `(set,date)`
  is claimed `BOOKED_ONLINE`, when the sweep runs, then the booking becomes `CANCELLED`, its
  PaymentIntent is canceled at Stripe, and the `(set,date)` row is freed (re-claimable).
  *Pinned by:* `AbandonedBookingSweepIT.expiresStaleBookingAndFreesTheSet`
- [ ] **AC-2:** Given the sweep has already expired a booking, when a `payment_intent.canceled`
  webhook for the same booking is then delivered (both paths fire), then there is no error and no
  double effect — the booking stays `CANCELLED`, the set stays free, exactly one transition
  happened. *Pinned by:* `AbandonedBookingSweepIT.isIdempotentWithTheCanceledWebhook`
- [ ] **AC-3:** Given a `CONFIRMED` booking and an `AWAITING_PAYMENT` booking created within the TTL,
  when the sweep runs, then neither is touched (no cancel, no release).
  *Pinned by:* `AbandonedBookingSweepIT.leavesConfirmedAndWithinTtlBookingsAlone`
- [ ] **AC-4:** Given a stale `AWAITING_PAYMENT` booking, when the sweep runs twice in a row, then
  the second run is a no-op (the booking is already `CANCELLED`, no second PI cancel, no error) —
  the guarded `UPDATE … RETURNING` is the concurrency primitive (no distributed lock).
  *Pinned by:* `AbandonedBookingSweepIT.isSafeToRunRepeatedly`
- [ ] **AC-5:** Given a stale `AWAITING_PAYMENT` booking whose PaymentIntent already `succeeded` at
  Stripe (race: succeeded but the confirm webhook hasn't arrived), when the sweep runs, then the
  booking is **not** cancelled and the set is **not** freed (the confirm webhook will win).
  *Pinned by:* `AbandonedBookingSweepIT.doesNotCancelABookingWhosePaymentSucceeded`
- [ ] **AC-6:** TTL and sweep interval are configurable (`booking.awaiting-payment.ttl` /
  `…sweep-interval`); `ModularityTests` and `JdbcOnlyArchitectureTests` stay green.
  *Pinned by:* `ModularityTests`, `JdbcOnlyArchitectureTests`, build green.

## Non-goals

- No ShedLock / distributed lock (the DB-guarded transition is sufficient at v1 scale — single
  instance, and even multi-instance the guarded `UPDATE … RETURNING` serializes).
- No change to the synchronous stub-profile flow (no `AWAITING_PAYMENT` rows exist there; the
  scheduler is `@Profile("stripe")`).
- No Request-to-Book authorize/capture handling (not in this slice).
- No new booking lifecycle status (`AWAITING_PAYMENT → CANCELLED` reuses the existing transition).
- No frontend / Angular / Playwright (backend-only).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Sweep frees a set whose payment actually succeeded (cancel-but-paid divergence) | low | high | Read PI status first; a `succeeded` PI → `NotCancellable`, sweep leaves the booking for the confirm webhook (AC-5) | claude | open |
| R-2 | Sweep and `payment_intent.canceled` webhook both act → double cancel/release or error | med | high | Single shared guarded `cancelAwaitingPayment` (`UPDATE … RETURNING`); second driver is a 0-row no-op; `release` is a no-op on a missing row (AC-2) | claude | open |
| R-3 | A legitimately-paying tourist gets swept mid-checkout | low | high | TTL default 15 min ≫ a real Stripe PaymentElement session; only `created_at < now − ttl` selected (AC-3) | claude | open |
| R-4 | Transition commits but release fails (crash between) → CANCELLED-but-claimed stuck set | low | high | Transition + release in **one** `@Transactional` method (same atomicity as the webhook listener) | claude | open |
| R-5 | Stripe cancel call inside a DB txn holds a row lock across a network round-trip | low | med | PI cancel happens **outside** the transaction (before `release`), mirroring `BookingRefundListener` | claude | open |
| R-6 | Multi-instance sweepers double-cancel the same PI | low | low | Guarded transition lets one win the row; PI cancel is idempotent (status-read guard); transient errors retried next sweep | claude | open |

## Open questions / Assumptions

### Resolved

- **Release strategy** (cancel-via-API-let-webhook-release vs cancel+release-directly) — **Resolved:**
  cancel the PI then release directly (robustness to a lost/late webhook + end-to-end testability),
  idempotent with the webhook via the guarded `UPDATE`. *Owner:* user ("you decide") + claude.
- **TTL default** — **Resolved:** 15 minutes (configurable). *Owner:* user.
- **Scheduling approach / profile** — **Resolved:** `@Scheduled` fixed-delay, scheduler gated on
  `@Profile("stripe")` (stub confirms synchronously → nothing to sweep; keeps default-profile tests
  clean; the IT runs under the `stripe` profile like the existing webhook ITs). *Owner:* claude.
- **Module owner** — **Resolved:** `booking` (owns the lifecycle + the existing cancel+release). *Owner:* claude.
- **PI-cancel op already in `payment`?** — **Resolved:** no; this slice adds
  `payment.api.CancelPaymentPort` + `PaymentGateway.cancel`. *Owner:* claude (verified against code).
- **Multi-instance safety / ShedLock?** — **Resolved:** not needed at v1; the guarded
  `UPDATE … RETURNING` serializes, the PI cancel is idempotent. *Owner:* claude.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** this slice adds **one new caller** of the
  existing `availability.api.AvailabilityClaim.release(SetId, LocalDate)` — the scheduled sweep. It
  introduces **no new SQL** against `set_availability`; it reuses the same `release` the
  `payment_intent.canceled` listener already uses (deletes only a `BOOKED_ONLINE` row, never a
  staff `WALK_IN` row).
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` on `set_availability`. Once
  the sweep releases the row, the set is re-claimable by any channel.
- **Concurrency strategy:** the guarded `UPDATE booking SET status='CANCELLED' WHERE id=:id AND
  status='AWAITING_PAYMENT' RETURNING set_id, booking_date` is the atomic primitive — at most one
  driver (sweep or webhook) gets the `RETURNING` row and therefore performs the single `release`.
  Transition + release run in one `@Transactional` unit; the Stripe cancel is outside it.
- **Pool rule (invariant #3):** unchanged — release only frees a `BOOKED_ONLINE` row.
- **Cutoff rule (invariant #4):** not affected — this is a payment-abandonment TTL, distinct from
  the booking-date cutoff.
- **Pinning test:** `AbandonedBookingSweepIT.isIdempotentWithTheCanceledWebhook` /
  `.isSafeToRunRepeatedly` prove the two drivers and repeated runs cannot double-release.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the lifecycle + the existing cancel+release orchestration; the sweep reuses it. |
| M-2 | `payment` | existing | `Payment` | Owns the Stripe collection; the new cancel-PaymentIntent op belongs behind its gateway. |
| M-3 | `availability` | existing | `SetAvailability` | Sole writer of the row; `release` reused unchanged. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `CancelPaymentPort#cancel(BookingRef)` | `PaymentCancellation` (sealed: `Canceled` / `NotCancellable` / `Failed`), `BookingRef` | `booking` (sweep) |
| NI-2 | `availability.api` | `AvailabilityClaim#release(SetId, LocalDate)` (existing) | — | `booking` (sweep + webhook listener) |

No new `allowedDependencies`: `booking` already lists `payment::api` + `availability::api`;
`payment` stays `allowedDependencies = {}` (cancel port is self-contained, `BookingRef` is its own
type).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `PaymentCanceled` (existing) | `payment` | `{ bookingRef }` | `booking` | async | `AbandonedBookingSweepIT.isIdempotentWithTheCanceledWebhook` |

The sweep does **not** add an event — it calls `CancelPaymentPort` (sync, needs the outcome to
decide) and the shared release service directly.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002). The new op is a plain
  `PaymentIntent.cancel` — no Connect primitive.
- **Confirmation trigger:** unchanged — signature-verified webhook. The sweep never *confirms*; it
  only cancels an abandoned PI and releases. A `succeeded` PI is left for the confirm webhook (AC-5),
  preserving invariant #8 (webhook is the source of truth for a successful payment).
- **Idempotency:** the cancel reads PI status first (`canceled` → treated as success, `succeeded` →
  `NotCancellable`); `markStatus(intentId, CANCELED)` is an idempotent UPDATE; the booking
  transition is guarded. No money moves (cancel ≠ refund), so no refund idempotency key needed.
- **Money:** unchanged — no amount arithmetic in this slice.
- **Payout-ledger effect:** none — an `AWAITING_PAYMENT` booking never accrued (accrual is on
  `BookingConfirmed`), so cancelling it has no ledger effect (no reversal needed). Confirmed in U5.
- **Refund policy applied:** N/A — nothing was collected, so there is nothing to refund.
- **Pinning tests:** `AbandonedBookingSweepIT.*`, `StripePaymentGatewayTest` (cancel mapping).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no API shape change (no new HTTP endpoint; the sweep is an internal scheduled job).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Payment cancel-PI port + gateway | ✅ | (this commit) |
| 1 — Booking stale read + shared release + sweep service | ✅ | (this commit) |
| 2 — Scheduler + properties + migration V13 | ✅ | (this commit) |
| 3 — Sweep IT (AC-1..5) + full build | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. `./gradlew build` green incl.
`ModularityTests` + `JdbcOnlyArchitectureTests`.

---

## File structure

- `payment/api/CancelPaymentPort.java` — new inbound port `booking` calls to cancel a booking's PI.
- `payment/api/PaymentCancellation.java` — new sealed outcome (`Canceled`/`NotCancellable`/`Failed`).
- `payment/application/PaymentCancelService.java` — new `@Service` implementing the port.
- `payment/application/out/PaymentGateway.java` — add `cancel(BookingRef)`.
- `payment/infrastructure/out/StripePaymentGateway.java` — implement `cancel` (retrieve→guard→cancel→markStatus).
- `payment/infrastructure/out/StubPaymentGateway.java` — implement `cancel` (in-process `Canceled`).
- `booking/application/out/Bookings.java` + `infrastructure/out/JdbcBookings.java` — add
  `findExpirableAwaitingPayment(Instant)`.
- `booking/application/in/ReleaseAbandonedBooking.java` — new port: guarded cancel + release.
- `booking/application/ClaimReleaseService.java` — `@Service @Transactional` impl (shared by sweep + listener).
- `booking/application/in/ExpireAbandonedBookings.java` — new port: `sweep()`.
- `booking/application/AbandonedBookingSweepService.java` — `@Service` impl (loop: find → cancel PI → release).
- `booking/infrastructure/AbandonedPaymentProperties.java` — `@ConfigurationProperties("booking.awaiting-payment")`.
- `booking/infrastructure/BookingSchedulingConfig.java` — `@Profile("stripe") @EnableScheduling @EnableConfigurationProperties`.
- `booking/infrastructure/in/AbandonedBookingScheduler.java` — `@Profile("stripe")` `@Scheduled` adapter.
- `booking/infrastructure/in/PaymentEventListener.java` — refactor cancel branch to call `ReleaseAbandonedBooking`.
- `db/migration/V13__booking_awaiting_payment_sweep_index.sql` — partial index for the sweep predicate.
- `application.properties` — `booking.awaiting-payment.ttl=PT15M`, `…sweep-interval=PT5M`.
- Tests: `AbandonedBookingSweepIT`, `StripePaymentGatewayTest` (cancel cases), `StubPaymentGatewayTest`
  (cancel), `BookingMigrationIT` (index present).

---

## Phase 0 — Payment cancel-PaymentIntent port + gateway

Add `CancelPaymentPort` + `PaymentCancellation` (payment.api), `PaymentGateway.cancel`, Stripe +
stub impls, `PaymentCancelService`. TDD via `StripePaymentGatewayTest` (cancel mapping:
cancelable→Canceled, already-canceled→Canceled, succeeded→NotCancellable, no-collection→
NotCancellable, StripeException→Failed) and `StubPaymentGatewayTest`.

## Phase 1 — Booking stale read + shared release + sweep service

Add `Bookings.findExpirableAwaitingPayment(Instant)` (+ `JdbcBookings` SQL); extract the
cancel+release into `ClaimReleaseService`/`ReleaseAbandonedBooking`; refactor `PaymentEventListener`
to use it; add `ExpireAbandonedBookings` + `AbandonedBookingSweepService`.

## Phase 2 — Scheduler + properties + migration V13

Add `AbandonedPaymentProperties`, `BookingSchedulingConfig` (`@Profile("stripe")`,
`@EnableScheduling`), `AbandonedBookingScheduler` (`@Scheduled(fixedDelayString=…)`), the migration,
and the property defaults.

## Phase 3 — Sweep IT + full build

`AbandonedBookingSweepIT` (AC-1..5, `@ActiveProfiles("stripe")`, mocked `StripeClient`); then
`./gradlew build` (incl. `ModularityTests`, `JdbcOnlyArchitectureTests`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-06-30 | Phase 1 — needed cancel+release for the sweep | every cancel-AWAITING-then-release site | grep `cancelAwaitingPayment` | `PaymentEventListener.on(PaymentCanceled)` (the only other site) | Extracted both into the shared `ClaimReleaseService` (`ReleaseAbandonedBooking`) so the webhook and the sweep share one guarded transition — they cannot double-act. |

---

## Review note (SDD Review gate)

Ran the Review gate (`riviera-review-overlay` + `/code-review` on `main...HEAD`, high effort,
8 finder angles). The two headline overlay checks passed: **RV-BE-1** (availability release goes
only through the shared guarded `UPDATE … RETURNING` + `availability.api.release`, no new
`set_availability` writer) and **RV-CT-3/RV-BE-7** (a `succeeded` PI yields `NotCancellable` and is
left for the confirm webhook — webhook stays the source of truth, collect-only/no Connect). JDBC-only
(#1), Modulith boundaries (#11), money/time (#5/#6) and booking-code-as-secret logging (#7) all clean.

Findings fixed (re-entered Implement; skills already loaded — `riviera-modulith` +
`riviera-java-conventions`):
- **Resilience (Major):** `sweep()` now isolates each booking in a `try/catch (RuntimeException)` so a
  transient DB error on one release can't abort the batch and starve later bookings.
- **Dead config (Major):** dropped the unread `sweepInterval` component from `AbandonedPaymentProperties`
  (record is now `{ttl}` only); the cadence stays as `@Scheduled` placeholder properties.
- **Brittle placeholders (Minor):** added inline defaults to the `@Scheduled` placeholders
  (`:PT5M` / `:PT1M`) so a missing key can't fail context startup.

Accepted as-is: a PI in Stripe `processing` state is retried each run until it settles — self-healing
(the webhook resolves it), v1 is card-based (synchronous), and enumerating Stripe's cancelable states
would add more staleness risk than the rare wasted call is worth.

## Acceptance-criteria verification (final)

- [ ] **AC-1..5:** `./gradlew test --tests "*AbandonedBookingSweepIT*"` → PASS.
- [ ] **AC-6:** `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"` → PASS; `./gradlew build` green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] **No JPA** introduced; `JdbcClient` + SQL only (invariant #1).
- [ ] **Availability** section filled; the two-driver / repeat-run no-double-release tests present (invariant #2).
- [ ] **Modulith** section filled; cancel port in `payment.api`, sweep internals in `booking`; id-based payloads (invariant #11).
- [ ] **Payment** section filled; webhook stays source of truth; PI cancel idempotent; no money moved (invariants #5, #8).
- [ ] Timezone correct: UTC `created_at`, TTL arithmetic on `Instant` (invariant #6).
- [ ] Booking codes never logged (invariant #7) — sweep logs ids only.
- [ ] Flyway migration present (V13) for the index (invariant #12).
- [ ] Execution-status table matches reality; Open Questions empty (all Resolved).
