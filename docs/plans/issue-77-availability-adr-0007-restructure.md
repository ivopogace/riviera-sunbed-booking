# Restructure `availability` to the ADR-0007 layout Implementation Plan

> **Retroactive, right-sized doc.** `availability` (#77) was a **pure move-class refactor**
> (package/import renames, no behavior change), item **05/10** of the ADR-0007 series (#72).
> It was implemented and merged (PR #87, commit `6827cc8`) **without** a plan doc — per
> `riviera-sdd` Rule 6 this class of change normally skips it. This doc is written after the
> fact for series consistency with the #78 record. Sections that cannot bite on a mechanical
> move are `N/A` with a reason. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the `availability` module into the ADR-0007 full-template shape
(`api/` + `application/` + `adapter/in` + `adapter/out`) with zero behavior change, proven
by the three-test safety net staying green — including the atomic no-double-booking
concurrency test (invariant #2).

**Architecture:** `availability` is **"small but full"** — it has no large service set but
owns the synchronous `AvailabilityClaim` port with real concurrency semantics, so it takes
the full template, not the thin one. The `api/` surface (`AvailabilityClaim`,
`ClaimOutcome`) is unchanged. It has **no `spi/`** — it does not *own* a driven port; it
*implements* `venue::spi` (the `SetAvailabilityLookup` inversion), which is exactly what
`ModularityTests` re-verifies after the move.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — the JDBC
adapters (`JdbcAvailabilityClaim`, `JdbcSetAvailabilityLookup`) moved package only
(`infrastructure/out` → `adapter/out`), SQL unchanged.

**Source of intent:** GitHub issue #77 (part of #72, item 05/10). Merged as PR #87.

**Skills consulted:** `riviera-modulith` (confirmed the "small but full" shape: fold
`application/in` → `application/`, `infrastructure/{in,out}` → `adapter/{in,out}`, keep
`api/` top-level, add no `spi/` since availability implements venue's spi rather than owning
one, leave `allowedDependencies = { venue::api, venue::spi }` untouched);
`riviera-java-conventions` (verified the move preserves the Java idioms — JDBC-only/no-JPA,
records, package-private adapters, no Lombok). No `postgres` (no SQL/schema change);
backend-only (no frontend skills); no `riviera-stripe-payments`.

**Branch:** `feature/availability-adr-0007` (merged to `main` via PR #87).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the availability module in the ADR-0007 layout, when `ModularityTests`
  runs, then `ApplicationModules.verify()` passes — specifically proving `availability`
  still implements `venue::spi` correctly. *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [x] **AC-2:** Given the moved JDBC adapters, when `JdbcOnlyArchitectureTests` runs, then no
  JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [x] **AC-3:** Given the moved claim path, when two clients claim the same `(set, date)`
  concurrently, then exactly one succeeds (invariant #2), unchanged and passing. *Pinned by:*
  `StaffMarkVsOnlineClaimConcurrencyIT`, `ConcurrentClaimIT`.
- [x] **AC-4:** Given the final tree, when inspected, then the shape is
  `api/` + `application/` + `adapter/in` + `adapter/out` (no `domain/` today, no `spi/`) and
  `allowedDependencies` is unchanged (`{ venue::api, venue::spi }`). *Pinned by:*
  `ModularityTests` + package-tree/`git diff` inspection.

## Non-goals

- No behavior change, no logic change, no SQL change.
- No `api`→ports/vocabulary/events split (`api/` left exactly as-is).
- No `spi/` added — availability owns no driven port.
- No change to `allowedDependencies`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Move breaks the `venue::spi` implementation wiring | low | high | `ModularityTests` re-verifies availability implements `venue::spi` after the move | claude | resolved @ PR #87 |
| R-2 | Concurrency semantics silently altered by the move | low | high | Pure rename; `StaffMarkVsOnlineClaimConcurrencyIT` / `ConcurrentClaimIT` green | claude | resolved @ PR #87 |
| R-3 | Stale import/package decl → compile break | low | med | Full compile + availability suite green | claude | resolved @ PR #87 |

## Open questions / Assumptions

_None._

## Availability & concurrency (invariant #2)

The whole point of this module — re-verified, not changed, by the move:

- **Write paths to `availability(set_id, booking_date)`:** online booking claim + staff
  tap-to-mark, both through the `AvailabilityClaim` port (`JdbcAvailabilityClaim` in
  `adapter/out`). Unchanged by the move.
- **Uniqueness guarantee:** DB unique constraint on `(set_id, booking_date)` (existing
  migration; untouched).
- **Concurrency strategy:** atomic claim (existing `INSERT … ON CONFLICT`/row-lock strategy
  in `JdbcAvailabilityClaim`); unchanged — only the class's package moved.
- **Pool rule (invariant #3):** unchanged.
- **Cutoff rule (invariant #4):** unchanged.
- **Pinning test:** `StaffMarkVsOnlineClaimConcurrencyIT` — proves two concurrent claims of
  the same `(set, date)` cannot both succeed. Import updated for the move; assertions
  unchanged.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `availability` | existing | `SetAvailability` | Single writer of the `(set, date)` source-of-truth row; the move only re-packages its own classes |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `AvailabilityClaim` | `ClaimOutcome` | `booking` |

`api/` unchanged by the move. `availability` **implements** `venue.spi.SetAvailabilityLookup`
(the inversion for venue's live-map read); the compile-time edge stays `availability → venue`
(acyclic), re-verified by `ModularityTests`. No new named interface introduced.

**Domain events (id-based payloads, invariant #11)**

`N/A — availability introduces/changes no event in this slice.` (It reacts to booking events
via listeners already present; those listeners' packages were not part of this move beyond
the standard `infrastructure/in` → `adapter/in` rename where applicable.)

### Module-ownership table (§4a)

All changed classes stay in `availability`; no cross-module capability added or moved. No
boundary change — pure intra-module re-packaging.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves through `availability`.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` `StaffAvailabilityController` moved package only; its
`@RequestMapping` paths and DTOs (`MarkRequest`) are unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + import rewrite + safety-net verify | ✅ | `6827cc8` (PR #87) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

Moves (package/import renames only):

- `availability/application/in/*` → `availability/application/` (`MarkOutcome`,
  `ReleaseOutcome`, `StaffAvailability`) — beside `StaffAvailabilityService`; empty `in/`
  deleted; now-redundant same-package imports dropped from `StaffAvailabilityService`.
- `availability/infrastructure/in/*` → `availability/adapter/in/`
  (`StaffAvailabilityController`, `MarkRequest`).
- `availability/infrastructure/out/*` → `availability/adapter/out/` (`JdbcAvailabilityClaim`,
  `JdbcSetAvailabilityLookup`).
- `availability/api/*` — unchanged (`AvailabilityClaim`, `ClaimOutcome`).
- `availability/package-info.java` — javadoc updated to the ADR-0007 layout;
  `allowedDependencies` untouched.
- Test-side import updates: `WebSliceStubs`, `StaffAvailabilityIT`,
  `StaffMarkVsOnlineClaimConcurrencyIT`.

---

## Phase 0 — Move + import rewrite + safety-net verify ✅

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior;
the pre-existing tests are the safety net):

- [x] `git mv` classes into `application/` + `adapter/{in,out}`; delete empty
  `application/in` and `infrastructure/{in,out}`.
- [x] Rewrite package declarations + imports across main + test trees.
- [x] Drop now-redundant same-package imports in `StaffAvailabilityService`.
- [x] Update `package-info.java` javadoc (layout only; `allowedDependencies` untouched).
- [x] Run the safety net: `ModularityTests` + `JdbcOnlyArchitectureTests` + all
  `availability` tests (incl. the concurrency ITs) → PASS.
- [x] Merge via PR #87 (review gate RV-BE-12 clear; Sonar green).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-01 | Phase 0 | stale availability package refs after move | `grep -rn "availability.application.in\|availability.infrastructure"` | 0 remaining (post-move) | none needed |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `ModularityTests` → PASS (proves `venue::spi` still implemented). PR #87.
- [x] **AC-2:** `JdbcOnlyArchitectureTests` → PASS. PR #87.
- [x] **AC-3:** `StaffMarkVsOnlineClaimConcurrencyIT` / `ConcurrentClaimIT` → PASS. PR #87.
- [x] **AC-4:** Shape = `api/` + `application/` + `adapter/{in,out}`; `allowedDependencies`
  unchanged. PR #87.

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying test.
- [x] No placeholders / TODO / TBD.
- [x] Type & signature consistency (pure rename).
- [x] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section filled; concurrency test present & green (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports;
  `venue::spi` implementation re-verified (invariant #11) — `ModularityTests` green.
- [x] **Payment/payout** N/A (no money in scope).
- [x] Refund policy unaffected (invariant #10).
- [x] Timezone handling unchanged (invariant #6).
- [x] Booking codes unaffected (invariant #7).
- [x] No schema change → no Flyway migration needed (invariant #12).
- [x] **Frontend** N/A (backend-only).
- [x] Execution-status table matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
