# VenueCatalog Role Split (B1) + Honesty Rule (C2) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Split `venue.api.VenueCatalog` (6 methods, 4 consumer roles) into three
role-named ports — `VenueCatalog` (tourist reads), `SetBookingFacts` (set facts + pool),
`VenueRates` (commission + late-cancel bps) — with **zero behavior change**, then lock the
split with an ArchUnit dependency rule so the god-port cannot regrow.

**Architecture:** The one significant decision: the honesty rule (C2) is a
**dependency-direction rule** — "no class outside `venue` may depend on `VenueCatalog`" —
not a method-list freeze. After the split the tourist-read port has no sibling consumers,
so any attempt to pile a sibling-facing method back onto it forces a sibling import and
fails the build; a method-list freeze would instead break on every legitimate tourist-read
change. All three ports stay in the `venue.api` package under the existing
`@NamedInterface("api")`, so **no `allowedDependencies` grant changes** and the module
graph is untouched — only the *class-level* arrows narrow.

**Persistence:** JDBC only (invariant #1). **No tables/migrations touched** — pure
interface refactor; `JdbcVenueCatalog`'s SQL is unchanged.

**Source of intent:** Issue #94 (epic #93, improvement-plan items B1+C2);
`docs/architecture/improvement-plan.md` §B1/§C2.

**Skills consulted:** `riviera-modulith` (the "splitting an overgrown api" section names
this exact split and keeps all roles under `venue::api`; api-vs-spi untouched),
`riviera-java-conventions` (ports public in `api/`, adapter stays package-private,
`Optional`-not-null port contracts), `codebase-design` (depth: each consumer now learns a
2-method interface, not a 6-method one; the C2 rule as dependency-direction, not
method-freeze), `riviera-plan-doc` (this doc). `postgres` — N/A, no schema change.
`angular-developer`/`playwright-cli` — N/A, backend-only, no observable behavior change.
`riviera-stripe-payments` — N/A, `VenueRates` re-types existing bps *reads*; no money
logic, flow, or rounding changes.

**Branch:** `claude/hello-boss-jc8iz7` (the session's designated remote branch — stands in
for `feature/venuecatalog-role-split`; PR targets `main`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the split, when the class-level dependencies are inspected, then no
  class outside `ai.riviera.platform.venue` depends on `venue.api.VenueCatalog`;
  `availability`/`booking` reach set facts only via `SetBookingFacts` and
  `payout`/`booking` reach rates only via `VenueRates`. *Pinned by:*
  `VenueApiRoleSplitTests` (the C2 rule).
- [ ] **AC-2:** Given the refactor, when the full suite runs, then every existing test
  passes with **no test semantics weakened** (fakes/stubs re-typed only) — proving no
  behavior change. *Pinned by:* the existing suite (`ModularityTests`,
  `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`, all module tests/ITs).
- [ ] **AC-3:** Given a deliberate violation (a scratch class in `booking` importing
  `VenueCatalog`), when `VenueApiRoleSplitTests` runs, then it **fails** — the rule
  demonstrably fires. *Pinned by:* a red run recorded in this doc's execution notes
  (violation removed before commit).
- [ ] **AC-4:** Given the split, when `ApplicationModules.verify()` runs, then it passes
  **without any `allowedDependencies` edit** (all three ports remain under `venue::api`).
  *Pinned by:* `ModularityTests` + `git diff` showing no `package-info.java`
  `allowedDependencies` change.

## Non-goals

- **No B2 here** (ports/vocabulary/events named-interface split) — that is #95; mixing the
  two destroys the "green = safe" guarantee (same discipline as the ADR-0007 migration).
- **No relocation of `VenueCatalog` out of `api/`** even though post-split it has no
  sibling consumers — deferred to #95, which restructures published surfaces wholesale.
- **No method/SQL/behavior changes** in `JdbcVenueCatalog` or any consumer.
- **No new capability** on any port.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A retype silently rewires a consumer to the wrong method | low | high | Pure signature moves — method bodies untouched; full suite must stay green with unweakened assertions | Claude | 53ccabe (CI confirms) |
| R-2 | C2 rule is brittle and fights legitimate future change | med | low | Rule is dependency-direction only (who may import `VenueCatalog`), never a method list | Claude | resolved in `VenueApiRoleSplitTests` |
| R-3 | Bean wiring: `JdbcVenueCatalog` implements 3 interfaces; test stubs must satisfy all injection points | med | med | One `@Repository` bean satisfies all 3 by-type injections; `WebSliceStubs` exposes three role-port stub beans | Claude | 53ccabe (web-slice tests green) |
| R-4 | Hidden `VenueCatalog` usages beyond the 5 mapped consumers | low | med | Grep-verified consumer map (below); compiler enforces completeness | Claude | 53ccabe (compile green) |

## Open questions / Assumptions

- **Assumption:** `SetBookingFacts` and `VenueRates` are port names, not new glossary
  terms — `CONTEXT.md` unchanged. — *Owner:* Claude · *Resolves by:* review gate.
- **Deferred (→ #95):** post-split `VenueCatalog` is consumed only by `venue`'s own
  adapter; per ADR-0007 ("`api/` only if a sibling consumes") it could leave `api/`.
  #95 owns that call when it restructures the published surfaces.

## Availability & concurrency (invariant #2)

No write path changes. `availability`'s claim keeps the identical pool check — the
`poolOf` **implementation and call site are untouched**; only the interface the call site
names changes (`VenueCatalog` → `SetBookingFacts`). The atomic
`INSERT … ON CONFLICT DO NOTHING` claim, the `UNIQUE(set_id, booking_date)` constraint,
and the cutoff rule are all out of scope and unmodified.

- **Pinning test:** existing `ConcurrentClaimIT` / `ConcurrentReservationIT` /
  `StaffMarkVsOnlineClaimConcurrencyIT` stay green, unmodified.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns the published read surface being split |
| M-2 | `availability` | existing | `SetAvailability` | Consumer retype only (`SetBookingFacts`) |
| M-3 | `booking` | existing | `Booking` | Consumer retype only (`SetBookingFacts`, `VenueRates`) |
| M-4 | `payout` | existing | `PayoutLedgerEntry` | Consumer retype only (`VenueRates`) |

**Module-ownership table (4a):** no behavior added or moved — all capabilities stay with
their current owners; `venue` continues to own every method implementation. One-line case:
interface-only split inside `venue.api`, no boundary change.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#findVenueMap, #listVenues` (narrowed) | `VenueMapView`, `VenueSummaryView`, `VenueFilter` | `venue` adapter only (post-split) |
| NI-2 | `venue.api` | `SetBookingFacts#setBookingInfo, #poolOf` (new) | `SetBookingInfo`, `SetId` | `booking` (reserve, cancel, view), `availability` (claim, staff) |
| NI-3 | `venue.api` | `VenueRates#commissionBps, #lateCancelRefundBps` (new) | — | `payout` (accrual listener), `booking` (cancel policy) |

**Domain events:** none touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money behavior in scope. `VenueRates` re-types the existing `commissionBps` /
`lateCancelRefundBps` **reads**; the accrual math, refund policy, webhook handling, and
ledger semantics are untouched (their tests must stay green unmodified — that is the
proof).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no endpoint or DTO changes.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + improvement-plan doc committed | ✅ | 5274aa3 |
| 1 — Role split + consumer retype (suite green) | ✅ | 53ccabe |
| 2 — C2 rule (`VenueApiRoleSplitTests`), red-verified then green | ✅ | (this commit) |
| 3 — PR + CI + review gate + Sonar gate + merge | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Main:**
- `venue/api/VenueCatalog.java` — narrow to `findVenueMap`, `listVenues`
- `venue/api/SetBookingFacts.java` — new: `setBookingInfo`, `poolOf` (javadoc moves with the methods)
- `venue/api/VenueRates.java` — new: `commissionBps`, `lateCancelRefundBps`
- `venue/adapter/out/JdbcVenueCatalog.java` — `implements VenueCatalog, SetBookingFacts, VenueRates` (bodies untouched)
- `availability/adapter/out/JdbcAvailabilityClaim.java` — retype to `SetBookingFacts`
- `availability/application/StaffAvailabilityService.java` — retype to `SetBookingFacts`
- `booking/application/reserve/ReserveSetService.java` — retype to `SetBookingFacts`
- `booking/application/cancel/CancellationPolicy.java` — retype to `SetBookingFacts` + `VenueRates`
- `payout/adapter/in/BookingConfirmedPayoutListener.java` — retype to `VenueRates`

**Test:**
- `WebSliceStubs.java` — one stub object registered as all three interfaces
- `booking/application/reserve/CreateBookingServiceTest.java` — `FakeCatalog` implements `SetBookingFacts`
- `payout/PayoutModuleTest.java` — mock `VenueRates`
- `venue/SetBookingInfoIT.java` — autowire `SetBookingFacts`
- `VenueApiRoleSplitTests.java` — new (root, beside `PackageShapeArchitectureTests`): the C2 rule

**Docs:**
- `docs/architecture/improvement-plan.md` — the #93 source of intent, persisted in-repo
- this plan doc

---

## Phase 1 — Role split + consumer retype

- [ ] Extract `SetBookingFacts` / `VenueRates` from `VenueCatalog` (javadoc travels with
  each method; `VenueCatalog` javadoc re-scoped to tourist reads)
- [ ] `JdbcVenueCatalog implements VenueCatalog, SetBookingFacts, VenueRates`
- [ ] Retype the 5 consumers + 4 test files (constructor param / field / mock types only)
- [ ] `./gradlew test` → green, no test semantics changed
- [ ] Commit `Split VenueCatalog into role-named ports (no behavior change) (#94)`

## Phase 2 — C2 honesty rule

- [ ] `VenueApiRoleSplitTests`: ArchUnit rule — classes outside `..platform.venue..` may
  not depend on `..venue.api.VenueCatalog`
- [ ] **Red check:** scratch violation in `booking` → run → FAIL → delete violation
- [ ] `./gradlew test --tests "*VenueApiRoleSplitTests*"` → green
- [ ] Commit `Lock the VenueCatalog role split with an ArchUnit dependency rule (#94)`

## Phase 3 — Gates

- [ ] Push; open PR referencing #94; CI green
- [ ] Review gate: `/code-review` + `riviera-review-overlay` (RV-BE-3b/3c/11/12, RV-PROC-1)
- [ ] Sonar gate: quality gate green, no new issues, new-code coverage ≥ 80 %
  (interface extraction adds no uncovered lines; the ArchUnit test covers itself)
- [ ] Merge; close #94; tick #93 checklist

---

## Review-gate record (SDLC)

Ran `/code-review origin/main...HEAD` with `riviera-review-overlay` loaded (8 angles via
6 finder agents, 1-vote verify). Sonar quality gate on PR #103: **passed** — 0 new
issues, 100% coverage on new code, 0 duplication.

- **Fixed (75a4bf5):** two stale javadoc `{@link VenueCatalog#…}` references to methods
  that moved to `SetBookingFacts` (`venue/api/package-info.java`, `SetBookingInfo.java`).
- **Deferred → #96:** shared `ClassFileImporter` support across the arch-test classes
  (house idiom today is per-class importers; #96 adds more fitness functions and is the
  natural home for consolidating).
- **Rejected with rationale:** generalizing the C2 rule into consumer-allowlists for
  `SetBookingFacts`/`VenueRates` — would freeze legitimate consumer evolution (risk R-2's
  brittleness, deliberately avoided). `VenueCatalog` is the special case whose
  sibling-consumer set is intentionally empty.
- Overlay walk: RV-BE-1 ✅ (no write-path change), RV-BE-3b/3c ✅ (split matches the
  intended shape; rule exists and passes), RV-BE-9 ➖ (no venue-scoped endpoint change),
  RV-BE-11 ✅ (no behavior moved), RV-BE-12 ✅ (no new packages), RV-PROC-1 ✅ (Skills
  consulted covers the diff). Angle A / conventions finders: no findings.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-3:** `VenueApiRoleSplitTests` green at HEAD; red run verified with a scratch
  `booking.application.ScratchViolation` importing `VenueCatalog` → rule FAILED → violation
  removed (local run, Phase 2; Gradle 8.14/JDK25 toolchain per `gradle-proxy-trust.md`).
- [x] **AC-2 (local scope):** structural net (`ModularityTests`, `JdbcOnlyArchitectureTests`,
  `PackageShapeArchitectureTests`, `OperatorAuthPlacementTests`) + `CreateBookingServiceTest` +
  web-slice tests green locally; Docker-gated ITs (`SetBookingInfoIT`, `PayoutModuleTest`,
  concurrency ITs) run in CI — CI green is the full AC-2 verification.
- [x] **AC-4:** no `package-info.java` touched anywhere in the diff; `ModularityTests` green
  without edits.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] No JPA introduced (invariant #1); no new dependencies at all.
- [ ] Availability section honest: no write-path change; concurrency ITs green unmodified.
- [ ] Modulith section filled; no cross-module internals import; no `allowedDependencies` edit (invariant #11).
- [ ] Payment/payout N/A justified: reads re-typed, semantics untouched.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions resolved or deferred with issue #.
