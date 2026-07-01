# Restructure `payout` to the ADR-0007 layout Implementation Plan

> **Right-sized doc.** This is a **pure move-class refactor** (package/import renames,
> no behavior change) — part of the ADR-0007 restructure series (#76 customer, #77
> availability, this is 06/10 of #72). Per `riviera-sdd` Rule 6 this class of change
> normally skips the plan doc; this one is written after the fact at the user's request
> as a durable record. Sections that cannot bite on a mechanical move are `N/A` with a
> reason. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the `payout` module into the ADR-0007 full-template package shape
(`application/` + `domain/` + `adapter/in` + `adapter/out`, **no `api/`/`spi/`**) with
zero behavior change, proven by the three-test safety net staying green.

**Architecture:** ADR-0007 exploits the inside/outside asymmetry — `domain` +
`application` are the inside; `adapter/in` (driving: listeners + report controllers) and
`adapter/out` (driven: JDBC repos) are the outside. `payout` is a **pure event
subscriber**: it consumes `booking`/`venue` events and ports and exposes nothing, so it
correctly has **no `api/` and no `spi/`** — the single most significant "decision" here is
*not* adding an empty published surface.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — the JDBC
repositories moved package only (`infrastructure/out` → `adapter/out`), SQL unchanged.

**Source of intent:** GitHub issue #78 (part of #72, item 06/10).

**Skills consulted:** `riviera-modulith` (confirmed the full-template shape for a
serviceless-surface subscriber: fold `application/in`+`out` → `application/`,
`infrastructure/{in,out}` → `adapter/{in,out}`, keep `domain/`, add no `api/`/`spi/`, leave
`allowedDependencies` untouched); `riviera-java-conventions` (verified the move preserves the
Java idioms — JDBC-only/no-JPA, records, package-private adapters kept package-private, no
Lombok; the dropped imports were redundant same-package ones). No `postgres` (no SQL/schema
change), no `riviera-stripe-payments` (no money logic changed — pure package move), no
frontend skills (backend-only).

**Branch:** `claude/riviera-sdd-78-4uiemq` (exists; work committed + pushed).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the payout module in the ADR-0007 layout, when `ModularityTests`
  runs, then `ApplicationModules.verify()` passes (no cycle, no illegal access, no
  disallowed dependency). *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [x] **AC-2:** Given the moved JDBC repositories, when `JdbcOnlyArchitectureTests` runs,
  then no JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [x] **AC-3:** Given the moved accrual listeners, when the payout suite runs, then a
  booking contributes to the ledger **exactly once** and a refund reverses it (invariant
  #9), unchanged and passing. *Pinned by:* `PayoutAccrualIT`, `PayoutReversalIT`.
- [x] **AC-4:** Given the final package tree, when inspected, then **no `api/` and no
  `spi/` package exists** under `payout`, and `allowedDependencies` is unchanged
  (`{ booking::api, venue::api, operator::api }`). *Pinned by:* `ModularityTests` +
  package-tree/`git diff` inspection.

## Non-goals

- No behavior change, no logic change, no SQL change.
- No `api`/`spi` split — `payout` publishes nothing and stays that way.
- No widening/narrowing of `allowedDependencies`.
- Not touching the sibling ADR-0007 restructures (other modules in #72).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stale import/package decl left behind → compile break | low | med | Post-move grep proved zero remaining `payout.application.in/out` / `payout.infrastructure` refs; full compile + tests green | claude | resolved @ HEAD |
| R-2 | An accidental `api/` package or `allowedDependencies` edit | low | med | Explicit AC-4 check: no `api`/`spi` dir; `git diff` shows `allowedDependencies` unchanged | claude | resolved @ HEAD |
| R-3 | Behavior drift hidden by the move | low | high | Pure rename only; three-test net incl. idempotent accrual/reversal ITs green | claude | resolved @ HEAD |

## Open questions / Assumptions

_None._

### Resolved

- **Drift caught (issue-intake gate):** issue text lists `allowedDependencies =
  { booking::api, venue::api }`, but the live value already includes `operator::api`
  (added in #73). AC says "untouched," so the current value was kept verbatim. Resolved by
  keeping the deny-list unchanged.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` `payout` never writes
`availability(set_id, booking_date)`; it accrues a ledger entry on `BookingConfirmed`. No
write path, lock, or claim strategy is touched by a package move.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payout` | existing | `PayoutLedgerEntry`, `PayoutBatch` | Owns the venue payout ledger + BKT batch reporting; the move only re-packages its own classes |

**Cross-module named interfaces (`api/` ports)**

`N/A — payout publishes none.` It is a pure event subscriber; it exposes no `api/`/`spi/`
surface. This is the defining structural fact of the slice (AC-4).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, setId, venueId, … }` | `availability`, **`payout`** (listener moved to `adapter/in`) | async `AFTER_COMMIT` | `PayoutAccrualIT` |
| EV-2 | `BookingCancelled` | `booking` | `{ bookingId, … }` | `payment`, **`payout`** (listener moved to `adapter/in`) | async `AFTER_COMMIT` | `PayoutReversalIT` |

Consumption is unchanged — only the listener classes' package moved
(`infrastructure/in` → `adapter/in`). Payloads remain id-based.

### Module-ownership table (§4a)

All changed classes stay in `payout`; no cross-module interaction added or moved. No
boundary change — pure intra-module re-packaging.

## Payment & payout (invariants #5, #8, #9, #10)

Money logic **unchanged** — this is a package move, not a payout-logic change. For the
record, the invariants the moved code already upholds (and the safety net re-proves):

- **Model:** collect-only via Stripe, no Connect; payout via manual BKT batch. Untouched.
- **Money:** integer minor units, EUR. Untouched.
- **Payout-ledger effect:** accrual on `BookingConfirmed`, reversal on `BookingCancelled`,
  **exactly-once** (invariant #9). Re-proven green by `PayoutAccrualIT` / `PayoutReversalIT`.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint path, method, or DTO shape changed (the report
controllers moved package only; their `@RequestMapping` paths are unchanged).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + import rewrite + safety-net verify | ✅ | (this branch HEAD) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

Moves (package/import renames only; `domain/` unchanged):

- `payout/application/in/*` + `payout/application/out/*` → `payout/application/`
  (`BatchStatusOutcome`, `LedgerEntryView`, `PayoutReport`, `VenueLedger`,
  `ViewPayoutLedger`, `LedgerEntryRow`, `PayoutBatches`, `PayoutLedger`,
  `VenuePeriodTotal`) — empty `in/`+`out/` deleted; now-redundant same-package imports
  dropped from `PayoutLedgerQueryService`/`PayoutReportService`.
- `payout/infrastructure/in/*` → `payout/adapter/in/` (`AdminPayoutBatchController`,
  `AdminPayoutLedgerController`, `BookingConfirmedPayoutListener`,
  `BookingCancelledPayoutListener`, `PayoutBatchView`, `PayoutLedgerView`).
- `payout/infrastructure/out/*` → `payout/adapter/out/` (`JdbcPayoutBatches`,
  `JdbcPayoutLedger`).
- `payout/domain/*` — unchanged.
- `payout/package-info.java` — javadoc updated to the ADR-0007 layout;
  `allowedDependencies` untouched.
- Test-side import updates: `WebSliceStubs`, `PayoutBatchGenerationIT`, `PayoutLedgerIT`,
  `PayoutLedgerViewIT`, `PayoutReversalIT`.

---

## Phase 0 — Move + import rewrite + safety-net verify ✅

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior
to drive test-first; the pre-existing tests are the safety net):

- [x] `git mv` the classes into `application/` + `adapter/{in,out}`; delete empty
  `application/{in,out}` and `infrastructure/{in,out}`.
- [x] Rewrite package declarations + imports across main + test trees; verify zero
  remaining `payout.application.in/out` / `payout.infrastructure` references.
- [x] Drop now-redundant same-package imports in the two services.
- [x] Update `package-info.java` javadoc (layout only; `allowedDependencies` untouched).
- [x] Run the safety net:
  `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"` → PASS;
  `./gradlew test --tests "ai.riviera.platform.payout.*"` → PASS (46 tests; one transient
  `AdminPayoutSecurityIT` context-cache flake under full-suite load, green in isolation and
  on re-run).
- [x] Commit + push to `claude/riviera-sdd-78-4uiemq`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-01 | Phase 0 | stale payout package refs after move | `grep -rn "payout.application.in\|payout.application.out\|payout.infrastructure"` | 0 remaining | none needed |
| 2026-07-01 | Phase 0 | now-redundant same-package imports | manual read of `PayoutLedgerQueryService`/`PayoutReportService` | 2 files | dropped the redundant imports |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `./gradlew test --tests "*ModularityTests*"` → PASS. Verified at branch HEAD.
- [x] **AC-2:** `./gradlew test --tests "*JdbcOnlyArchitectureTests*"` → PASS. Verified at branch HEAD.
- [x] **AC-3:** `./gradlew test --tests "ai.riviera.platform.payout.*"` → PASS (incl.
  `PayoutAccrualIT`, `PayoutReversalIT`). Verified at branch HEAD.
- [x] **AC-4:** No `api/`/`spi/` dir under `payout`; `git diff` shows `allowedDependencies`
  unchanged. Verified at branch HEAD.

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying test.
- [x] No placeholders / TODO / TBD.
- [x] Type & signature consistency (pure rename — signatures unchanged).
- [x] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section justified N/A (no availability write path touched).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports;
  event payloads id-based; no `api`/`spi` added (invariant #11) — `ModularityTests` green.
- [x] **Payment/payout** money logic unchanged; exactly-once accrual re-proven (invariants
  #5, #8, #9).
- [x] Refund policy server-side, unchanged (invariant #10).
- [x] Timezone handling unchanged (invariant #6).
- [x] Booking codes unaffected (invariant #7).
- [x] No schema change → no Flyway migration needed (invariant #12).
- [x] **Frontend** N/A (backend-only).
- [x] Execution-status table matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.

> Remaining loop stages (post-plan): open PR → CI gate → Review gate
> (`riviera-review-overlay` RV-BE-12) → Sonar gate → merge.
