# Restructure `customer` to the ADR-0007 thin template Implementation Plan

> **Retroactive, right-sized doc.** `customer` (#76) was the **first** ADR-0007 migration PR
> (item **04/10** of #72) — a **pure move-class refactor** (~1 move, no behavior change) that
> also **settled the thin-template convention** for the series. It was implemented and merged
> (PR #86, commit `f73013c`) **without** a plan doc — per `riviera-sdd` Rule 6 this class of
> change normally skips it. This doc is written after the fact for series consistency with the
> #77/#78 records. Sections that cannot bite on a mechanical move are `N/A` with a reason.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move `customer` from the seven-package convention into the ADR-0007 **thin**
template (`api/` + `adapter/out/`, **no `application/` and no `domain/`**) with zero behavior
change, proven by the three-test safety net staying green.

**Architecture:** `customer` has **no application service** — its `api` port
(`CustomerDirectory`) is implemented **directly** by a JDBC adapter — so per the ADR-0007
assignment rule ("a module is THIN iff it has no application service") it takes the thin
template. Inventing an empty `application/`/`domain/` layer for a single adapter would be a
*hypothetical* seam; the thin shape avoids it. **One-time convention decision settled here:**
the thin module's adapter bucket is **`adapter/out/`** (keeps adapter vocabulary uniform and
the ArchUnit allowed-set clean) rather than `internal/`. This sets the pattern for any future
thin module.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — the single JDBC
adapter (`JdbcCustomerDirectory`) moved package only (`infrastructure/out` → `adapter/out`),
SQL unchanged, package-private visibility preserved.

**Source of intent:** GitHub issue #76 (part of #72, item 04/10 — first migration). Merged as
PR #86.

**Skills consulted:** `riviera-modulith` (confirmed the thin template for a serviceless
module: `api/` + `adapter/out/`, no `application/`/`domain/`; settled the `adapter/out/`
bucket convention; `allowedDependencies` references `::api`, which didn't move). No `postgres`
(no SQL/schema change); backend-only; no `riviera-stripe-payments`.

**Branch:** `feature/customer-adr-0007` (merged to `main` via PR #86).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the customer module in the ADR-0007 thin layout, when `ModularityTests`
  runs, then `ApplicationModules.verify()` passes. *Pinned by:*
  `ModularityTests.verifiesModularStructure`.
- [x] **AC-2:** Given the moved JDBC adapter, when `JdbcOnlyArchitectureTests` runs, then no
  JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [x] **AC-3:** Given the moved directory adapter, when the customer suite runs, then behavior
  is unchanged. *Pinned by:* `CustomerDirectoryIT`.
- [x] **AC-4:** Given the final tree, when inspected, then `customer/` = `api/` +
  `adapter/out/` (nothing else); `allowedDependencies` unchanged; no `public` visibility added
  just to compile (package-private stays package-private). *Pinned by:* `ModularityTests` +
  package-tree/`git diff` inspection.

## Non-goals

- No behavior change, no logic change, no SQL change.
- No `application/` or `domain/` layer added (thin module, no service).
- No `api`→ports/vocabulary/events split.
- No `public` widening; package-private stays package-private.
- No change to `allowedDependencies`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Accidental `public` widening to make the move compile | low | med | AC-4 check: adapter stays package-private; `git diff` inspected | claude | resolved @ PR #86 |
| R-2 | Wrong thin-bucket convention chosen, forcing churn later | low | med | Settled `adapter/out/` explicitly as the series convention | claude | resolved @ PR #86 |
| R-3 | Stale import/package decl → compile break | low | med | Full compile + customer suite green | claude | resolved @ PR #86 |

## Open questions / Assumptions

_None._

### Resolved

- **Thin-bucket convention (one-time decision):** `adapter/out/` vs `internal/` → chose
  **`adapter/out/`** (uniform adapter vocabulary, clean ArchUnit allowed-set). Sets the
  pattern for future thin modules. Resolved in PR #86.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` `customer` owns light tourist identity / guest-checkout
contact; it never writes `availability(set_id, booking_date)`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing | `Customer` | Owns tourist identity / guest-checkout contact; the move only re-packages its own single adapter |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerDirectory` | `CustomerId` (+ contact value records) | `booking` |

`api/` unchanged by the move (stays top-level, `@NamedInterface("api")`); implemented directly
by the package-private `JdbcCustomerDirectory` in `adapter/out`. No new named interface.

**Domain events (id-based payloads, invariant #11)**

`N/A — customer publishes/changes no event in this slice.`

### Module-ownership table (§4a)

All changed classes stay in `customer`; no cross-module capability added or moved. No boundary
change — pure intra-module re-packaging.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint or DTO changed (the adapter is a driven/outbound
JDBC repo, not a controller).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + import rewrite + safety-net verify | ✅ | `f73013c` (PR #86) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

Move (package/import rename only):

- `customer/infrastructure/out/JdbcCustomerDirectory.java` →
  `customer/adapter/out/JdbcCustomerDirectory.java` (implements the `api` port directly;
  package-private preserved).
- `customer/api/*` — unchanged (top-level, `@NamedInterface("api")`).
- `customer/api/package-info.java` + `customer/package-info.java` — javadoc updated to the
  ADR-0007 thin layout; `allowedDependencies` untouched.

After: `customer/` = `api/` + `adapter/out/`. Nothing else.

---

## Phase 0 — Move + import rewrite + safety-net verify ✅

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior; the
pre-existing tests are the safety net):

- [x] `git mv` `JdbcCustomerDirectory` `infrastructure/out` → `adapter/out`; delete the empty
  `infrastructure/` tree.
- [x] Rewrite the package declaration + any imports; preserve package-private visibility.
- [x] Update `package-info.java` javadocs (layout only; `allowedDependencies` untouched).
- [x] Run the safety net: `ModularityTests` + `JdbcOnlyArchitectureTests` + `CustomerDirectoryIT`
  → PASS.
- [x] Merge via PR #86 (review gate RV-BE-12 clear; Sonar green).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-01 | Phase 0 | stale customer package refs after move | `grep -rn "customer.infrastructure"` | 0 remaining (post-move) | none needed |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `ModularityTests` → PASS. PR #86.
- [x] **AC-2:** `JdbcOnlyArchitectureTests` → PASS. PR #86.
- [x] **AC-3:** `CustomerDirectoryIT` → PASS (unchanged). PR #86.
- [x] **AC-4:** `customer/` = `api/` + `adapter/out/`; package-private preserved;
  `allowedDependencies` unchanged. PR #86.

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying test.
- [x] No placeholders / TODO / TBD.
- [x] Type & signature consistency (pure rename).
- [x] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section justified N/A (customer never touches availability).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; thin
  template (no service) = `api/` + `adapter/out/` only (invariant #11) — `ModularityTests` green.
- [x] **Payment/payout** N/A (no money in scope).
- [x] Refund policy unaffected (invariant #10).
- [x] Timezone handling unchanged (invariant #6).
- [x] Booking codes unaffected (invariant #7).
- [x] No schema change → no Flyway migration needed (invariant #12).
- [x] **Frontend** N/A (backend-only).
- [x] Execution-status table matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
