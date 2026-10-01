# Payout: mark(REPORTED) freezes the reviewed total — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A batch moves `DRAFT → REPORTED` only at the total the admin reviewed. If a `generate`
refreshed the total since, the request answers `409 TOTAL_CHANGED`, the batch stays `DRAFT` at the
new total, and the new admin-console Payouts tab re-reads the period and shows the new figure.

**Architecture:** The fence is one more predicate on the existing status-guarded `UPDATE`
(`… AND total_net_minor = :expectedTotal`). Under READ COMMITTED a `mark` that waits on a refreshing
`upsertDraft` row lock re-evaluates the predicate against the committed total, so it needs no
period lock. The console fills the reserved `Payouts` slot in `ADMIN_CONSOLE_TAB_GROUPS`.

**Source of intent:** GitHub issue #1320 (split out of #1309). Owner decisions at intake: build the
console tab in this slice; `expectedTotalNetMinor` is **required** for `REPORTED`.

**Branch:** `bugfix/payout-mark-reviewed-total`

## Acceptance criteria

- [ ] **AC-1:** Given a `DRAFT` batch the admin read at total T, when a `generate` commits total T′ ≠ T
  and the admin then marks it `REPORTED` expecting T, then the outcome is `TotalChanged` carrying the
  batch at T′, and the row stays `DRAFT` at T′. *Seam:* `PayoutReport#mark` over real Postgres ·
  *Pinned by:* `PayoutBatchRaceIT.aRefreshBetweenTheReadAndTheMarkRefusesTheMark`
- [ ] **AC-2:** Given a `DRAFT` batch at total T, when the admin marks it `REPORTED` expecting T, then
  it is `REPORTED` at T. *Seam:* `PayoutReport#mark` · *Pinned by:*
  `PayoutBatchGenerationIT` (existing mark paths, now passing the expected total)
- [ ] **AC-3:** Given a `mark(REPORTED)` blocked behind an uncommitted refresh of the same row, when the
  refresh commits a different total, then the mark returns `TotalChanged`. It does not freeze the old
  total and does not report `IllegalTransition`. *Seam:* `PayoutBatches#transition` (JDBC, two
  connections, `LockOrderRace` pausing after `upsertDraft`) · *Pinned by:*
  `PayoutGenerateRaceIT.aMarkBlockedBehindARefreshSeesTheCommittedTotal`
- [ ] **AC-4:** Given `PATCH /api/admin/payout-batches/{id}` with `status=REPORTED` and no
  `expectedTotalNetMinor`, then `400 INVALID_REQUEST` and nothing moves. With a stale value, then
  `409 TOTAL_CHANGED`. For `SETTLED` the field is ignored, because a `REPORTED` total is already
  frozen. *Seam:* the controller over a stubbed `PayoutReport` · *Pinned by:*
  `AdminPayoutBatchControllerTest`
- [ ] **AC-5:** Given the admin on `/admin/payouts`, when they load a period, then each batch shows the
  venue name, the signed total formatted from minor units, and the status. They can generate or
  refresh the period. A `DRAFT` row offers *Mark reported*, which sends the displayed total. A
  `REPORTED` row offers *Mark settled*. *Seam:* `AdminPayouts` component + `AdminPayoutsService` ·
  *Pinned by:* `admin-payouts.spec.ts`, `admin-payouts.service.spec.ts`
- [ ] **AC-6:** Given the server answers `409 TOTAL_CHANGED` (or `ILLEGAL_TRANSITION`), when the admin
  marks, then the tab re-reads the period, shows the new total and announces the reason in a live
  region, and nothing is marked. *Seam:* `AdminPayouts` · *Pinned by:* `admin-payouts.spec.ts`;
  user-visible flow in `e2e/admin-payouts.e2e.ts` (mocked suite)
- [ ] **AC-7:** The tab rail renders `Payouts` in its reserved slot. *Pinned by:*
  `admin-console-tabs.spec.ts` (subsequence contract), `admin-payouts.a11y.spec.ts` (axe; its tokens are the Venue changes tab's, whose contrast spec proves them)

## Non-goals

- Venue names joined server-side. The tab composes the payout list with `GET /api/admin/venues`
  client-side (see Modulith).
- Locking `mark` behind `lockPeriod`. The row guard is enough (AC-3).
- Unfreezing or re-reporting a `REPORTED` batch whose ledger has since moved. That stays a manual
  reconcile, and `warnIfFrozenAndStale` still logs it.

## Risks

- **R-1: mark waits behind a refresh and then freezes the stale total (#9).** The total predicate
  sits in the same `UPDATE … WHERE`. Postgres re-checks it on the updated row version after the
  lock wait. Pinned by AC-3 with two real connections.
- **R-2: the lost-race path misreads a total mismatch.** Today `lostRace` re-reads and reports
  `IllegalTransition(DRAFT→REPORTED)` while the row is still `DRAFT`, which is a retry-forever answer.
  The re-read now classifies the result as `TotalChanged` (still `DRAFT`, total ≠ expected),
  `Marked` (already at target), `IllegalTransition`, or `NotFound`.
- **R-3: API contract break.** Any script that sends `{status:"REPORTED"}` alone now gets a 400. The
  console is the only first-party client, and this is intended.
- **R-4: money display (#5).** Totals are signed minor units. Format them with `shared/money.ts`
  `formatMoney`, never with float arithmetic. A negative total (deductions > accruals) renders with
  its sign.
- **R-5: Flyway:** none. No schema change.

## Open questions

### Resolved

- Console tab or backend only? → **Build the tab** (owner, intake).
- Expected total required or optional? → **Required for `REPORTED`** (owner, intake).

## Modulith

The change stays inside `payout` plus the root edge, with **no new `allowedDependencies`, no event,
and no published surface**. `ModularityTests` and the structural net must stay green unchanged.

- `PayoutReport#mark` (the module-internal inbound port, `application`) gains the expected total.
  `BatchStatusOutcome` gains `TotalChanged(PayoutBatch current)`. `PayoutBatches#transition` (the
  module-internal outbound port) gains the expected total. Every consumer is in `payout`.
- Venue names: `payout` owns no venue data. Reading `venue` in payout SQL would break #11, and
  `payout` already allows `venue::api`, but adding a name lookup there widens a money module for a
  display concern. The **frontend** composes the names from `GET /api/admin/venues` (`venue`'s admin
  surface, already ADMIN-readable) through `AdminVenuesService`.
- Edge: `SecurityConfig` already gates `PAYOUT_BATCHES_PATH`/`PAYOUT_BATCH_ITEM_PATH` as `ADMIN`.
  `AdminAuditFilter` (root, over `audit::api`) already records the PATCH with its real status, so a
  refused `409` leaves an audit row with no change. Pinned by the existing `AdminPayoutSecurityIT`.
- Owner check (`RESPONSIBILITIES.md` §payout): batch reporting is payout's Job. Nothing here is a
  refund decision or a commission-rate write.

## Payment & payout

No money moves. The batch is a report (ADR-0002, manual BKT). The ledger is untouched. The fix makes
the frozen `REPORTED` total equal to the one a human reviewed (#9's auditability). The idempotent
generate (#1309's `lockPeriod`) is unchanged.

## FE↔BE contract

- `PATCH /api/admin/payout-batches/{id}` body `{ status: "REPORTED" | "SETTLED", expectedTotalNetMinor?:
  number }`. The field is required for `REPORTED`. The responses are `200 PayoutBatchView`,
  `400 INVALID_REQUEST`, `404 NO_SUCH_BATCH`, `409 ILLEGAL_TRANSITION`, and `409 TOTAL_CHANGED`.
  The detail names the condition, never a remedy (error contract).
- `GET` / `POST /api/admin/payout-batches?period=IYYY-Www` are unchanged and return
  `PayoutBatchView[]` `{id, venueId, periodKey, totalNetMinor, currency, status}`.

## Phases

- **Phase 0 — guarded transition:** `PayoutBatches#transition` refuses a stale total, and the
  mark-behind-refresh race holds · red `JdbcPayoutBatchesIT`, `PayoutBatchRaceIT`,
  `PayoutGenerateRaceIT` (AC-1, AC-3)
- **Phase 1 — outcome + service:** `TotalChanged` outcome and `lostRace` classification · red
  `PayoutReportServiceTest` (AC-1, AC-2, R-2)
- **Phase 2 — HTTP contract:** required field for `REPORTED`, `409 TOTAL_CHANGED` · red
  `AdminPayoutBatchControllerTest` (AC-4)
- **Phase 3 — console service + tab:** `AdminPayoutsService`, `AdminPayouts` in the reserved slot,
  and the route · red `admin-payouts.service.spec.ts`, `admin-payouts.spec.ts`,
  `admin-console-tabs.spec.ts` (AC-5, AC-7)
- **Phase 4 — 409 handling + e2e + a11y:** re-read on conflict, live-region notice, mocked e2e, axe
  · red `admin-payouts.spec.ts`, `e2e/admin-payouts.e2e.ts`, `admin-payouts.a11y.spec.ts` (AC-6, AC-7)

## Execution status

**Stage pointer:** `review — fixing findings` (CI + Sonar green on fb63213; review gate run on #1324)

**Next action:** Push the review fixes, post the review comment, then the merge close-out (delete this plan last).

Local evidence: the payout ITs and unit tests, `CrossVenueDenialIT`, `AdminSurfaceRoleGateTest`, and the
structural net (plus `ErrorContractArchitectureTests`, `ResponsibilitiesArchitectureTests`) are green. Both race ITs
go red with the total predicate removed from the `UPDATE`. The full frontend unit and a11y suites, lint, format and
the guard scripts pass, as do the affected mocked e2e specs.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — guarded transition | ✅ | backend commit |
| 1 — outcome + service | ✅ | backend commit |
| 2 — HTTP contract | ✅ | backend commit |
| 3 — console service + tab | ✅ | frontend commit |
| 4 — 409 handling + e2e + a11y | ✅ | frontend commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
