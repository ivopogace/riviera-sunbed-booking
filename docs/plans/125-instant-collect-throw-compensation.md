# Instant-flow collect: compensate a thrown `CheckoutPort.pay` (+ sweepable no-collection rows) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed)
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An unexpected `RuntimeException` from `CheckoutPort.pay` in the Instant flow must
never leave a booking stranded `AWAITING_PAYMENT` holding its `(set, date)` claim — it
compensates synchronously (release the claim, rethrow), and the abandoned-payment TTL sweep
becomes a durable backstop that can recover a no-collection `AWAITING_PAYMENT` row (today it
skips it forever).

**Architecture:** Two independent defenses for the same gap (issue #125). (1) `CreateBookingService.collect`
wraps `checkout.pay` in a `try/catch (RuntimeException)` that runs the existing #51
`ReleaseAbandonedBooking` compensation and rethrows — the exact shape the accept path already
uses (`RespondToRequestService.collect`, #98/PR #122), but *release* rather than revert-to-pending
(an instant booking has no `PENDING_REQUEST` to revert to). (2) The sweep learns to release a
stale `AWAITING_PAYMENT` row that has **no payment on record** — surfaced as a new **typed**
`PaymentCancellation.NoCollection` outcome (not a magic `"no_collection"` string switched on across
the module boundary), so `AbandonedBookingSweepService` branches on the sealed type. Defense (1)
handles the common case and frees the set immediately; defense (2) closes the residual window where
(1) itself cannot run — the failure cause is the DB (so the compensating release transaction also
fails) or the process crashes mid-compensation.

**Persistence:** JDBC only (invariant #1). **No migration** — the sweep's `findExpirableAwaitingPayment`
query already selects no-collection rows (it reads `booking` only, no `payment` join); only the
in-memory skip-decision changes. No schema, no constraint, no `event_type` rewrite.

**Source of intent:** GitHub issue #125 (pre-existing latent gap surfaced by the #98 / PR #122 review).

**Skills consulted:** `riviera-sdlc` (routing gate), `riviera-plan-doc` (this doc),
`riviera-modulith` (`booking` owns the sweep + orchestration; `payment.vocabulary` owns the new
sealed outcome — cross-module coupling stays typed via `payment::vocabulary`, not a magic string),
`riviera-java-conventions` (typed sealed outcome over a `String` reason switch — §6; catch the
specific `RuntimeException`, never bare `Exception` — §6; one-line comments — §6c),
`riviera-stripe-payments` (collect-only; the orphan-PI residual is the already-documented
`createWithRecovery` low-impact residual — a released set may coexist with an inert, un-cancellable
Stripe PI that auto-expires). No `postgres` — no SQL/migration in scope. No frontend skills —
backend-only.

**Branch:** `bugfix/instant-collect-throw-compensation` — **substituted** by the cloud-session
designated branch **`claude/sdlc-125-378z7g`** (remote/cloud addendum); all work pushes there.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (synchronous compensation):** Given an Instant booking whose `(set, date)` claim +
  `AWAITING_PAYMENT` row have committed, when `CheckoutPort.pay` throws a `RuntimeException` (e.g. the
  payment-row insert fails after Stripe created the intent), then the service runs
  `ReleaseAbandonedBooking.release(bookingId)` exactly once and rethrows the original exception (the
  booking is not left held). *Pinned by:* `CreateBookingServiceTest.compensatesByReleasingWhenPaymentThrows`
- [ ] **AC-2 (sweep backstop — typed outcome):** Given a booking's cancel finds no PaymentIntent on
  record, when `CancelPaymentPort.cancel` is called, then it returns `PaymentCancellation.NoCollection`
  (a distinct case, not `NotCancellable`). *Pinned by:*
  `StripePaymentGatewayTest.cancelWithoutAKnownCollectionReportsNoCollection`
- [ ] **AC-3 (sweep releases no-collection):** Given a stale `AWAITING_PAYMENT` booking past its TTL
  whose cancel yields `NoCollection`, when the sweep runs, then it releases the booking
  (`AWAITING_PAYMENT → CANCELLED` + claim freed) and counts it expired. *Pinned by:*
  `AbandonedBookingSweepServiceTest.releasesAStaleBookingWithNoCollectionOnRecord` (unit) and
  `AbandonedBookingSweepIT.expiresAStaleBookingWithNoPaymentRecord` (Testcontainers, real DB).
- [ ] **AC-4 (no regression — succeeded still skipped):** Given a stale `AWAITING_PAYMENT` booking
  whose payment already `succeeded`, when the sweep runs, then it is left untouched for the confirm
  webhook (invariant #8). *Pinned by:* `AbandonedBookingSweepServiceTest.leavesASucceededBookingForTheWebhook`
  (existing `AbandonedBookingSweepIT.doesNotCancelABookingWhosePaymentSucceeded` continues to pass).

## Non-goals

- **Cancelling the orphan Stripe PI from the no-collection path.** When `pay` threw after Stripe
  created the intent, a live-but-inert PI may exist with no payment row. We cannot cancel what we
  cannot see (the cancel keys off the `payment` table), and it is inert — its client secret was never
  delivered, so the guest cannot pay it; Stripe auto-expires it. This is the already-documented
  `createWithRecovery` low-impact residual, not new debt.
- **Any schema/Flyway change.** The sweep query already selects the row; no DB change is warranted.
- **Changing the accept path** (`RespondToRequestService`) — it already compensates (#98/PR #122).
- **Retrying `pay` in-process.** Compensation releases the set and surfaces the failure to the caller;
  the guest re-books. No automatic retry loop.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new compensation + a widened sweep branch; retires/replaces no existing surface. The only
behavior *changed* is the sweep's treatment of a no-collection stale row (previously skipped forever,
now released) — that is the bug fix itself, captured as AC-3, and the succeeded-row behavior is held
constant by AC-4.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Sweep releases a **legitimately in-flight** booking that briefly has no payment row (the normal reserve-commit→pay-register window) | low | high | The sweep only selects rows older than the TTL (`created_at < now − ttl`, order of minutes); the normal window is sub-second. AC-4 + the existing within-TTL IT (`leavesConfirmedAndWithinTtlBookingsAlone`) pin that fresh rows are never swept. | agent | open |
| R-2 | Adding a 4th case to the sealed `PaymentCancellation` silently breaks an exhaustive `switch` elsewhere | low | med | Sealed type → the compiler flags every non-exhaustive switch; the only site is `AbandonedBookingSweepService.expire`, updated here. `grep` for `PaymentCancellation.` confirms no other switch. | agent | open |
| R-3 | Synchronous compensation's own `release` transaction fails (the failure cause is the DB) → still stranded | med | high | This is exactly why defense (2) exists: the sweep now recovers the no-collection row on a later run once the DB recovers. Both defenses ship together. | agent | open |
| R-4 | Double-release race between the synchronous compensation and the sweep/webhook | low | low | `ReleaseAbandonedBooking` is the guarded `UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING` — idempotent; the second driver is a 0-row no-op (pinned by existing `isIdempotentWithTheCanceledWebhook`). | agent | open |
| R-5 | Log injection / booking-code leak in new log lines | low | med | Log ids/enums only, never the booking code (invariant #7) — same discipline as the surrounding lines. | agent | open |

## Open questions / Assumptions

- **Assumption:** `PaymentCancellation.NoCollection` returned by the Stripe adapter reliably means
  "no payment row" (a deterministic empty query result), not a transient lookup error — a transient
  `DataAccessException` during `findIntentByBookingRef` *throws* and is caught per-booking in
  `sweep(...)` (logged, retried next run), never mapped to `NoCollection`. *Owner:* agent · *Resolves by:* Phase 2 (verified by reading `StripePaymentGateway.cancel`).

### Resolved

- **Scope decision (both defenses):** the issue's open "decision" on whether the sweep should also
  learn to expire no-collection rows was answered **yes** (user, 2026-07-24) — do both the synchronous
  fix and the sweep backstop.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** this slice adds no new write path. It
  changes *when* an existing release runs — the #51 `ReleaseAbandonedBooking` transactional release
  (guarded `AWAITING_PAYMENT → CANCELLED` + `availability` claim free) now also fires (a) synchronously
  when `pay` throws in the Instant flow, and (b) from the sweep for a no-collection stale row.
- **Uniqueness guarantee:** unchanged — the `(set_id, booking_date)` unique constraint holds a set for
  at most one party per date. This slice only *frees* claims that a bug previously stranded.
- **Concurrency strategy:** unchanged — `ReleaseAbandonedBooking` is the guarded atomic
  `UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING`; whichever driver reaches the row first
  performs the single release, the rest are no-ops (idempotent). No new lock.
- **Pool rule (invariant #3):** unaffected.
- **Cutoff rule (invariant #4):** unaffected.
- **Pinning test:** invariant #2 non-regression is covered by the existing `ReleaseAbandonedBooking`
  idempotency IT (`AbandonedBookingSweepIT.isIdempotentWithTheCanceledWebhook`); the new AC-1/AC-3
  tests assert the claim is freed (availability row gone) after compensation.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the reserve→pay→confirm orchestration (`CreateBookingService`) and the booking lifecycle incl. the abandoned-payment sweep (`AbandonedBookingSweepService`). |
| M-2 | `payment` | existing | `Payment` | Owns Stripe collection + cancel; the `PaymentCancellation` outcome vocabulary is `payment`'s to shape. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `CheckoutPort#pay` (unchanged signature) | `PaymentOutcome`, `Money`, `BookingRef` | `booking` |
| NI-2 | `payment.api` | `CancelPaymentPort#cancel` (unchanged signature) | `PaymentCancellation` (**+ new `NoCollection` case** in `payment.vocabulary`) | `booking` (the sweep) |

No new port. `booking` already depends on `payment::api` + `payment::vocabulary`; the new
`NoCollection` type is added to the already-granted `payment.vocabulary` surface — no
`allowedDependencies` change.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | N/A — no new/changed event; the release path publishes nothing new. |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Compensate a thrown `pay` by releasing the claim (Instant flow) | `booking` | `booking` Job: "Orchestrate the reserve → pay → confirm flow across `availability` and `payment`." Releasing on a failed collect is orchestration/lifecycle, not money movement. Not on `payment`'s Job (it owns collection, not the booking lifecycle). |
| Decide to release a stale no-collection booking (sweep) | `booking` | `booking` Job: owns "the lifecycle (confirmed / cancelled …)"; the sweep is a `booking` service. It *asks* `payment` for the cancel outcome and *decides* the lifecycle transition — the decision/execution split held. |
| Report "no collection on record" as a typed outcome | `payment` | `payment` Job: "Own Stripe collection — PaymentIntents, refunds …". The cancel outcome vocabulary (`PaymentCancellation`) is `payment`'s; adding a case is shaping its own published outcome, not a `booking` concern. |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002). Cancel voids an *uncollected* PI —
  no money moves.
- **Confirmation trigger:** unchanged — the signature-verified webhook remains the source of truth
  (invariant #8). This slice only handles *failed/abandoned* collection, never confirms.
- **Idempotency:** the release is idempotent (guarded transition); the Stripe PI idempotency key
  (`booking-<id>-pi`) is unchanged. No new charge/refund created.
- **Money:** integer minor units, EUR — unchanged; no arithmetic added.
- **Payout-ledger effect:** none — a released `AWAITING_PAYMENT` booking never confirmed, so it never
  accrued; nothing to reverse (invariant #9 intact).
- **Refund policy applied:** N/A — cancelling an uncollected intent is not a refund.
- **Pinning tests:** `StripePaymentGatewayTest.cancelWithoutAKnownCollectionReportsNoCollection`,
  `AbandonedBookingSweepServiceTest`, `AbandonedBookingSweepIT.expiresAStaleBookingWithNoPaymentRecord`.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no API shape change (an internal orchestration/sweep fix; the thrown `pay` already surfaces as
the existing `ApiErrorHandler` 5xx to the client, unchanged).

## Execution status

**Stage pointer:** `implement — done, ready for CI/PR gate`. Both phases implemented + green locally
(unit + structural net + the sweep IT under real-DB Testcontainers).

**Next action:** Push to `claude/sdlc-125-378z7g`, confirm CI green, then run the Review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | afc6f4d |
| 1 — Synchronous compensation (`CreateBookingService`) | ✅ | af0c41e |
| 2 — Sweep backstop (`NoCollection` typed outcome + sweep release) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/.../booking/application/reserve/CreateBookingService.java` — wrap `checkout.pay` in
  `try/catch (RuntimeException)` → `releaseAbandoned.release` + rethrow; update the class Javadoc
  outcome-mapping list.
- `platform/.../booking/application/reserve/CreateBookingServiceTest.java` — add AC-1 pinning test.
- `platform/.../payment/vocabulary/PaymentCancellation.java` — add `record NoCollection()`; narrow the
  `NotCancellable` Javadoc to the succeeded/terminal case.
- `platform/.../payment/adapter/out/StripePaymentGateway.java` — return `NoCollection()` in the
  no-PI-on-record branch (was `NotCancellable("no_collection")`).
- `platform/.../payment/api/CancelPaymentPort.java` — Javadoc: mention `NoCollection`.
- `platform/.../payment/adapter/out/StripePaymentGatewayTest.java` — update the no-collection test to
  expect `NoCollection`.
- `platform/.../booking/application/refund/AbandonedBookingSweepService.java` — add
  `case NoCollection -> release`; update Javadoc.
- `platform/.../booking/application/refund/AbandonedBookingSweepServiceTest.java` — **new** fast unit
  test (Mockito `Bookings`, fake ports) for AC-3/AC-4 branch logic.
- `platform/.../booking/AbandonedBookingSweepIT.java` — add AC-3 real-DB test (no payment row inserted).

---

## Phase 1 — Synchronous compensation in `CreateBookingService`

**Files:** Modify `CreateBookingService.java:92-96` · Test `CreateBookingServiceTest.java`

- [ ] **Step 1: Write the failing test** — a `CheckoutPort` whose `pay` throws; assert the
  original exception propagates AND `release` recorded exactly one call.

```java
@Test
void compensatesByReleasingWhenPaymentThrows() {
    // #125: a RAW throw from pay (not the typed Failed) — e.g. the payment-row insert failing after
    // Stripe created the intent — must still compensate: release the committed claim, then rethrow,
    // never leaving an orphaned AWAITING_PAYMENT booking holding the set with no payment row.
    CheckoutPort throwingCheckout = (_, _) -> {
        throw new org.springframework.dao.DataAccessResourceFailureException("register blew up after intent");
    };
    CreateBookingService service = service(set("ONLINE"),
            claiming(ClaimOutcome.CLAIMED), throwingCheckout, () -> "CODETHROW01");

    assertThrows(org.springframework.dao.DataAccessResourceFailureException.class,
            () -> service.create(command()));
    assertEquals(1, bookings.inserted.size(), "the booking was persisted before the throwing payment");
    assertEquals(1, release.released.size(), "a thrown payment triggers exactly one compensating release");
    assertTrue(confirmer.confirmed.isEmpty(), "a thrown payment confirms nothing");
}
```

- [ ] **Step 2: Run it, verify it fails** — `gradle -p platform test --tests "*CreateBookingServiceTest*"`
  → FAIL (exception propagates but `release.released` is empty — no compensation).

- [ ] **Step 3: Minimal implementation** — in `collect(...)`, wrap the `checkout.pay` call:

```java
PaymentOutcome payment;
try {
    payment = checkout.pay(new BookingRef(reserved.bookingId()),
            new Money(set.price().minorUnits(), set.price().currency()));
}
catch (RuntimeException paymentBlewUp) {
    // #125: not just the typed Failed — an unexpected throw (e.g. the payment-row insert failing
    // after Stripe created the intent) would otherwise strand the booking AWAITING_PAYMENT holding
    // the set. Release the committed claim (same #51 seam as the Failed branch), then rethrow.
    releaseAbandoned.release(new BookingId(reserved.bookingId()));
    throw paymentBlewUp;
}
```

- [ ] **Step 4: Run it, verify it passes** — `gradle -p platform test --tests "*CreateBookingServiceTest*"` → PASS.

- [ ] **Step 5: Generalization-audit pass** — search for other bare `checkout.pay` / driven-network
  calls after a committed claim. Candidates: `RespondToRequestService.collect` (already guarded, #98).
  Decision: instant path was the one gap; accept path already fixed. Append to the log.

- [ ] **Step 6: Commit** — `git commit -m "fix(booking): compensate a thrown CheckoutPort.pay in the instant flow (#125)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Sweep backstop via typed `NoCollection` outcome

**Files:** Modify `PaymentCancellation.java`, `StripePaymentGateway.java:147-154`,
`CancelPaymentPort.java`, `AbandonedBookingSweepService.java:83-106` · Modify
`StripePaymentGatewayTest.java:285-297` · Create `AbandonedBookingSweepServiceTest.java` · Modify
`AbandonedBookingSweepIT.java`

- [ ] **Step 1: Write the failing tests**
  - `StripePaymentGatewayTest.cancelWithoutAKnownCollectionReportsNoCollection` — expect
    `PaymentCancellation.NoCollection` (replaces the `NotCancellable("no_collection")` assertion).
  - `AbandonedBookingSweepServiceTest` (new, fast, Mockito `Bookings`): a stale id whose
    `CancelPaymentPort.cancel` returns `NoCollection` → `release` called, `sweep` returns 1; a
    `NotCancellable("succeeded")` → `release` not called, returns 0; `Canceled` → release called
    (regression guard); `Failed` → release not called.
  - `AbandonedBookingSweepIT.expiresAStaleBookingWithNoPaymentRecord` — insert a stale
    `AWAITING_PAYMENT` booking + claim but **no** `payment` row; assert `CANCELLED` + claim freed +
    expired count 1 (no Stripe stubbing needed — the adapter returns before any Stripe call).

- [ ] **Step 2: Run them, verify they fail** —
  `gradle -p platform test --tests "*StripePaymentGatewayTest*" --tests "*AbandonedBookingSweepServiceTest*"`
  → FAIL to compile (`NoCollection` undefined) / assertion mismatch.

- [ ] **Step 3: Minimal implementation**
  - `PaymentCancellation`: add to `permits` and define `record NoCollection() implements PaymentCancellation {}`;
    narrow `NotCancellable`'s Javadoc to the terminal-`succeeded` case.
  - `StripePaymentGateway.cancel`: the no-PI-on-record branch returns `new PaymentCancellation.NoCollection()`.
  - `CancelPaymentPort` Javadoc: note that a missing collection returns `NoCollection`.
  - `AbandonedBookingSweepService.expire`: add `case PaymentCancellation.NoCollection ignored -> { … release … }`
    (release + log "no PaymentIntent on record"), keep `NotCancellable -> skip`, `Failed -> retry`; update
    the class Javadoc.

```java
return switch (outcome) {
    case PaymentCancellation.Canceled ignored -> releaseAndCount(id, "canceled its PaymentIntent");
    case PaymentCancellation.NoCollection ignored ->
        // #125: no payment on record (a pay() that threw after the reserve commit). Past the TTL this
        // is a stranded booking, not an in-flight one — release it so the set isn't held forever. Any
        // orphan Stripe PI is inert (client secret never delivered) and auto-expires.
        releaseAndCount(id, "no PaymentIntent on record");
    case PaymentCancellation.NotCancellable notCancellable -> {
        log.info("sweep skipped booking {} — payment not cancellable ({})", id.value(), notCancellable.reason());
        yield false;
    }
    case PaymentCancellation.Failed failed -> {
        log.warn("sweep could not cancel payment for booking {} — retrying next run ({})", id.value(), failed.reason());
        yield false;
    }
};
```

- [ ] **Step 4: Run them, verify they pass** — the same `--tests` filters → PASS; then broaden to the
  touched packages: `gradle -p platform test --tests "*payment*" --tests "*AbandonedBookingSweep*"`
  (IT skips cleanly if Docker is absent).

- [ ] **Step 5: Generalization-audit pass** — search `PaymentCancellation.` for any other exhaustive
  switch that must handle `NoCollection`. Decision: only `AbandonedBookingSweepService` switches;
  gateways/tests only construct. Append to the log.

- [ ] **Step 6: Commit** — `git commit -m "fix(booking): sweep can now expire no-collection AWAITING_PAYMENT rows (#125)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-24 | Phase 1 (thrown-`pay` compensation) | driven-network call after a committed `(set,date)` claim | `grep -rn '\.pay(' platform/src/main` | `CreateBookingService.collect` (fixed here), `RespondToRequestService.collect` (already guarded #98) | No other sites; accept path already compensates (revert-to-pending). |
| 2026-07-24 | Phase 2 (`NoCollection` case) | exhaustive `switch` over `PaymentCancellation` that must handle the new case | `grep -rn 'PaymentCancellation\.' platform/src` + a clean `compileJava`/`compileTestJava` (sealed → compiler-enforced) | Only `AbandonedBookingSweepService.expire` switches; gateways/tests only construct | Updated the one switch; compilation proves exhaustiveness. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle -p platform test --tests "*CreateBookingServiceTest*"` → PASS.
- [ ] **AC-2:** `gradle -p platform test --tests "*StripePaymentGatewayTest*"` → PASS.
- [ ] **AC-3:** `gradle -p platform test --tests "*AbandonedBookingSweepServiceTest*"` → PASS (unit);
  `AbandonedBookingSweepIT` PASS in CI (Docker).
- [ ] **AC-4:** `AbandonedBookingSweepServiceTest` succeeded-branch + existing
  `AbandonedBookingSweepIT.doesNotCancelABookingWhosePaymentSucceeded` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases (`NoCollection` no-arg record; `release(BookingId)`).
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; the release is the guarded idempotent transition (invariant #2).
- [ ] Pool + cutoff rules unaffected (invariants #3, #4).
- [ ] **Modulith** section filled; the new type lives in `payment.vocabulary` (published); no
  cross-module `application.*`/`adapter.*` import; booking switches on the typed outcome (invariant #11).
- [ ] **Payment/payout** section filled; no confirm-from-client; idempotent; no ledger effect (invariants #5, #8, #9).
- [ ] Refund policy unaffected (invariant #10).
- [ ] Timezone/booking-code unaffected (invariants #6, #7); new logs are ids/enums only.
- [ ] No Flyway migration needed (verified the sweep query selects the row already) — invariant #12 N/A.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (or deferred with an issue #).
