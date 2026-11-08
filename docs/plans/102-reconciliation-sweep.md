# Provider-neutral payment reconciliation sweep Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a daily, report-only sweep compares every recent open `payment` row with the wired provider's
answer, reports paid-but-waiting, canceled-but-waiting and orphan transactions, and an idempotent admin
action repairs one payment from the provider's answer alone.

**Architecture:** `PaymentGateway` gains a per-payment `lookup` and an account-wide unpaid listing;
`PaymentReconciliationService` runs the comparison outside any transaction, with no state of its own, so
the scheduler and the admin `GET` share one read and no migration is needed. The repair re-reads the
provider and applies the answer through the same guarded transition the webhook uses, extracted into
`VerifiedPaymentOutcomes`, so the two can never drift.

**Source of intent:** #102, #479, ADR-0029 decisions 4, 9, 11. **Partial by agreement:** `Part of #102`.

**Branch:** `claude/102-reconciliation-sweep-3f6699`

## Acceptance criteria

- [ ] **AC-1:** Given a payment the provider holds as paid / canceled / still open / unreadable, when `lookup` asks, then it answers `Paid` / `Canceled` / `Waiting` / `Unavailable` and never throws; every gateway answers. *Seam:* `PaymentGateway` · *Pinned by:* `PaymentGatewayLookupContract`, `CollectingGatewayLookupContract` (Stripe), `PaymentGatewayContractCoverageArchitectureTest`
- [ ] **AC-2:** Given an open row older than the in-flight grace that the provider holds as paid, when the sweep runs, then it reports `PAID_LOCALLY_WAITING` and changes nothing; likewise canceled → `CANCELED_LOCALLY_WAITING`. *Seam:* `PaymentReconciliation.report` · *Pinned by:* `PaymentReconciliationServiceTest`, `PaymentReconciliationIT`
- [ ] **AC-3:** Given every open row agrees with the provider, when the sweep runs, then it logs nothing and every gauge is 0. *Seam:* scheduler · *Pinned by:* `PaymentReconciliationSchedulerTest.aCleanRunLogsNothing`
- [ ] **AC-4:** Given a booking awaiting payment past its TTL whose provider payment is paid, when the abandoned-payment sweep runs, then it is not released, and the reconciliation reports it. *Seam:* `ExpireAbandonedBookings` + `PaymentReconciliation` · *Pinned by:* `PaymentReconciliationIT.aPaidWaitingBookingOutlivesTheExpiryAndIsReported`, contract `aPaidPaymentCannotBeVoided`
- [ ] **AC-5:** Given more open rows than one page and a provider listing of several pages, when the sweep runs, then it reads to the end; a repeat run reports exactly the same. *Pinned by:* `PaymentReconciliationServiceTest.readsEveryPageAndARepeatRunReportsTheSame`, contract `theListingReadsToTheLastPage`
- [ ] **AC-6:** Given a divergent payment, when an admin repairs it, then the outcome is applied once from a fresh provider read; a second repair changes nothing. A `Waiting` answer repairs nothing. *Seam:* `PaymentReconciliation.repair` · *Pinned by:* `PaymentReconciliationIT.repairingConfirmsOnceFromTheProviderAnswer`, `PaymentReconciliationServiceTest`
- [ ] **AC-7:** Given a row with no `payee_venue_id` (pre-V80), when the sweep or repair reaches it, then it is reported unchecked / refused and the gateway is never asked. *Pinned by:* `PaymentReconciliationServiceTest.aRowWithNoPayeeIsNeverLookedUp`
- [ ] **AC-8 (#479):** Given an unpaid provider transaction older than 24h with no `payment` row, when the sweep runs, then it is reported as an orphan and never canceled; the provider is only ever asked for transactions older than 24h. *Pinned by:* `PaymentReconciliationServiceTest`, contract `theListingAsksOnlyForTheWindowAndSkipsPaidOnes`
- [ ] **AC-9:** Every `/api/admin/payment-reconciliation` route is ADMIN-gated. *Pinned by:* `AdminSurfaceRoleGateTest` (discovers it), `AdminPaymentReconciliationControllerTest`
- [ ] **AC-10:** The sweep exists only under a collecting gateway. *Pinned by:* `PaymentReconciliationGatewaySwitchTest`

## Non-goals

- The production provider's lookup (#284 P2) and the dispute half of #102: both wait on the providers' written answers.
- A per-venue iteration of the orphan listing: the Stripe demo has one account, POK and Paysera Classic document no listing (#284 P1 adds venue accounts).
- An admin-console screen. The surface is `GET`/`POST` plus the runbook.
- Cancelling an orphan: #479 Q4 leaves that to a later action if reports show volume.

## Decisions

- **The expiry asks the provider first.** `gateway.cancel` already reads the provider and answers `NotCancellable` for a paid payment, so the sweep cannot release it. A 5-minute daily race cannot be won by cadence. The contract now holds every collecting gateway to it.
- **The report is computed, not stored.** No table, no V82: the `GET` always shows the provider's current answer, and the repair re-reads anyway.
- **The grace (30 min), lookback (30 days) and orphan age (24 h) are constants.** #479 Q2: the safety argument must not rest on a tunable. A row past the lookback has been reported 30 times; repair still reaches it by id.
- **The admin routes are not profile-bound; the sweep is.** `AdminSurfaceRoleGateTest` discovers routes in the default context, so a profile-bound controller would escape the gate. Under the stub there are no rows, so the report is empty.
- **Stripe's auto-expiry claim is removed.** Stripe's PaymentIntent lifecycle and object references state no time limit for unpaid intents, so the claim comes out of `PaymentCancellation`, `AbandonedBookingSweepService` and the gateway test.

## Risks

- **R-1:** A webhook still in flight is reported as a divergence → the 30-minute grace; a report is harmless and the repair re-reads.
- **R-2:** Repair racing the webhook double-publishes → the same guarded `markStatus`; only the mover publishes (#8).
- **R-3:** Search lag or stale `status` reports a paid intent as an orphan → the 24h floor, and the current object's status is re-checked (Stripe's search docs warn the filter is cached). A skipped row is caught next run.
- **R-4:** A lookup inside a transaction pins a connection → the service is not transactional; only `VerifiedPaymentOutcomes` is.
- **R-5:** A confirmed repair for a booking already released confirms nothing → unchanged webhook behaviour; the runbook says to check the booking after repair.

## Modulith

No new module, grant or published surface. New internal port `ReconcilablePayments` (`application/`), implemented by `adapter/out`; `PaymentGateway` gains two methods. `payment` stays `{ "shared" }`; the metric name inlines.

## Payment & payout

No new idempotency key: no provider write. The ledger effect is the existing `PaymentConfirmed` → `BookingConfirmed` → accrual, exactly once by the guarded transition. Confirmation comes only from an authenticated provider read (#8, ADR-0029 decision 4).

## Availability & concurrency

No write to `set_availability` here. The release is the existing guarded `ReleaseAbandonedBooking`, reached through `PaymentCanceled` (#2).

## Phases

- **Phase 0 — Lookup on the port:** Stripe + stub + contract · red `CollectingGatewayLookupContract`
- **Phase 1 — Report:** `ReconcilablePayments`, `PaymentReconciliationService.report` · red `PaymentReconciliationServiceTest`
- **Phase 2 — Repair:** `VerifiedPaymentOutcomes`, webhook delegates · red repair cases
- **Phase 3 — Surface:** scheduler, gauges, admin routes, security · red scheduler + controller tests
- **Phase 4 — End to end + docs:** `PaymentReconciliationIT`, runbook, `RESPONSIBILITIES.md`, claim removal

## Execution status

**Stage pointer:** PR open, review gate next

**Next action:** run the high-effort review on the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Lookup | ✅ | this branch |
| 1 — Report | ✅ | this branch |
| 2 — Repair | ✅ | this branch |
| 3 — Surface | ✅ | this branch |
| 4 — End to end + docs | ✅ | this branch |
