# Restructure `venue` to the ADR-0007 layout Implementation Plan

> **Right-sized doc.** This is a **pure move-class refactor** (package/import renames,
> no behavior change) — part of the ADR-0007 restructure series (#76 customer, #77
> availability, #78 payout; this is **07/10** of #72). Per `riviera-sdlc` Rule 6 this
> class of change normally skips the plan doc; it is written for a durable record because
> `venue` is the **highest-care** module in the series — it owns the one live cross-module
> dependency inversion (`venue.spi.SetAvailabilityLookup`). Sections that cannot bite on a
> mechanical move are `N/A` with a reason. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the `venue` module into the ADR-0007 full-template package shape
(`api/` + `spi/` + `application/` + `adapter/in` + `adapter/out`, **no `domain/` today**)
with zero behavior change, proven by the three-test safety net staying green — and, in
particular, by `ModularityTests` re-proving the `venue ↔ availability` inversion.

**Architecture:** ADR-0007 exploits the inside/outside asymmetry — `application` is the
inside; `adapter/in` (driving: `VenueAdminController`, `VenueReadController` + request DTOs)
and `adapter/out` (driven: `JdbcVenueCatalog`, `JdbcVenues`) are the outside. `venue` is the
one module that owns a **cross-module inversion**: `venue.spi.SetAvailabilityLookup` is
declared here and **implemented by `availability`** so the beach-map read can overlay live
per-`(set, date)` availability without `venue` depending on `availability` (compile-time edge
`availability → venue`, runtime call `venue → availability`, acyclic). `api/` **and** `spi/`
therefore stay **top-level and exposed** (`@NamedInterface`) and their `package-info.java`
files do **not** move — the single most significant structural fact of this slice.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — the JDBC
repositories moved package only (`infrastructure/out` → `adapter/out`), SQL unchanged.

**Source of intent:** GitHub issue #79 (part of #72, item 07/10).

**Skills consulted:** `riviera-modulith` (re-read the `api`-vs-`spi` section — this is the
module it describes; confirmed the full-template fold `application/in`+`out` → `application/`,
`infrastructure/{in,out}` → `adapter/{in,out}`, with `api/` **and** `spi/` kept top-level and
their `@NamedInterface` `package-info` untouched, and both modules' `allowedDependencies`
left verbatim); `riviera-java-conventions` (verified the move preserves the Java idioms —
JDBC-only/no-JPA, records, package-private adapters kept package-private, no Lombok; the
dropped imports were redundant same-package ones). No `postgres` (no SQL/schema change), no
`riviera-stripe-payments` (no money logic — pure package move), no frontend skills
(backend-only).

**Branch:** `claude/riviera-sdlc-issue-79-f97b2q`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the venue module in the ADR-0007 layout, when `ModularityTests` runs,
  then `ApplicationModules.verify()` passes — specifically proving the `venue ↔ availability`
  inversion is intact (compile-time edge `availability → venue`, runtime call
  `venue → availability`, acyclic). *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [x] **AC-2:** Given the moved JDBC repositories, when `JdbcOnlyArchitectureTests` runs,
  then no JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [x] **AC-3:** Given the moved controllers/adapters, when the `venue` suite runs, then all
  venue tests are green, unchanged. *Pinned by:* `VenueAdminControllerIT`, `VenueReadControllerIT`,
  `VenueListControllerIT`, `SetBookingInfoIT`, `BeachMapLayoutMigrationIT`, `VenueSeedMigrationIT`,
  `VenueAdminServiceTest`.
- [x] **AC-4:** Given the final package tree, when inspected, then `api/` **and** `spi/` still
  exist top-level as `@NamedInterface` packages under `venue`; the final shape is
  `api/` + `spi/` + `application/` + `adapter/in` + `adapter/out` (no `domain/`); and
  `allowedDependencies` is unchanged on **both** `venue` (`{ operator::api }`) and
  `availability` (`{ venue::api, venue::spi, operator::api }`) — the `{ venue::api, venue::spi }`
  grant still resolves. *Pinned by:* `ModularityTests` + package-tree/`git diff` inspection.

## Non-goals

- No behavior change, no logic change, no SQL change.
- **No api-split** — `VenueCatalog` is not decomposed here (that is a separate future item).
- No `spi` change — `SetAvailabilityLookup` stays in `venue.spi`, top-level, exposed.
- No widening/narrowing of `allowedDependencies` on either module.
- Not touching the sibling ADR-0007 restructures (other modules in #72).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `venue ↔ availability` inversion breaks / cycles after the move | low | high | `spi/` + its `@NamedInterface` `package-info` deliberately **not** moved; `JdbcVenueCatalog` keeps its `venue.spi.SetAvailabilityLookup` import; AC-1 (`ModularityTests`) re-proves acyclicity | claude | resolved @ HEAD (`ModularityTests` green) |
| R-2 | A stale import/package decl left behind → compile break | low | med | Post-move grep proves zero remaining `venue.application.in/out` / `venue.infrastructure` refs; full compile + tests green | claude | resolved @ HEAD (0 remaining refs; compile + tests green) |
| R-3 | An accidental edit to `allowedDependencies` on venue **or** availability | low | high | Explicit AC-4 check: `git diff` shows both deny-lists unchanged | claude | resolved @ HEAD (`availability/package-info` not in diff; venue deny-list unchanged) |
| R-4 | Behavior drift hidden by the move | low | high | Pure rename only; three-test net + full venue IT suite green | claude | resolved @ HEAD (zero non-package/import/javadoc content changes) |

## Open questions / Assumptions

_None._

### Resolved

- **Drift caught (issue-intake gate):** the issue says AC "`allowedDependencies` untouched on
  both `venue` and `availability`." The live values already include `operator::api` (added by
  the operator-auth work, #73) on both modules — venue `{ operator::api }`, availability
  `{ venue::api, venue::spi, operator::api }`. "Untouched" is honored by keeping both verbatim.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` `venue` never writes `availability(set_id, booking_date)`;
it *reads* live availability via the `SetAvailabilityLookup` driven port (implemented by
`availability`). No write path, lock, or claim strategy is touched by a package move — and the
port itself does not move.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns venue profiles / beach map / pools / pricing; the move only re-packages its own classes |

**Cross-module named interfaces (`api/` ports and `spi/` driven ports)**

| # | Interface | Kind | Declared in | Consumed/implemented by | Moved? |
|---|---|---|---|---|---|
| I-1 | `VenueCatalog` (+ `SetId`, `VenueId`, view records) | `api` (inbound) | `venue.api` | `availability`, `booking`, `payout` call it | **No** — stays top-level |
| I-2 | `SetAvailabilityLookup` | `spi` (driven / inverted) | `venue.spi` | **implemented by `availability`** | **No** — stays top-level |

The whole point of the slice: `api/` and `spi/` are the published surface and do **not** move.
Only the module's *internal* packages fold (`application.in/out` → `application`) and rename
(`infrastructure.{in,out}` → `adapter.{in,out}`).

**Domain events (id-based payloads, invariant #11)**

`N/A — venue publishes no domain events in this slice.` Collaboration is via the `api/` port
(inbound) and the `spi/` driven port (inverted). No event wiring is touched.

### Module-ownership table (§4a)

All changed classes stay in `venue`; no cross-module interaction added, removed, or moved. The
one cross-module edge (`availability` implements `venue.spi.SetAvailabilityLookup`) is
unchanged — pure intra-module re-packaging.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money logic touched.` `venue` carries pricing/commission-rate *config* read via
`VenueCatalog`, but this slice changes no arithmetic and no currency handling — pure package
move.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint path, method, or DTO shape changed — the controllers
moved package only; their `@RequestMapping` paths and request/response records are unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + import rewrite + safety-net verify | ✅ | `a026df1` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

## Review-gate note (PR #89)

Ran the SDLC review gate (`riviera-review-overlay` + `/code-review` on
`origin/main...HEAD`). **No findings.** The content diff is exclusively package
declarations, import statements, and javadoc — **zero** non-package/import/javadoc
lines changed (verified by filtering the diff). Overlay items walked:

- **RV-BE-12** (ADR-0007 package shape) ✅ — final shape `api/` + `spi/` + `application/`
  + `adapter/{in,out}`; `api`/`spi` top-level `@NamedInterface`; adapter split by direction;
  no lingering `infrastructure/`; top-level package set ⊆ `{api, spi, application, adapter}`.
- **RV-BE-3b** (spi placement) ✅ — `SetAvailabilityLookup` stays in `venue.spi`, unmoved.
- **RV-BE-3c / RV-BE-11** ✅ — no port/id/event added to `api`; no behavior moved between modules.
- **RV-PROC-1** ✅ — *Skills consulted* (`riviera-modulith`, `riviera-java-conventions`)
  matches the backend-only diff (no migration/FE/Stripe area touched).
- Correctness (removed-behavior / cross-file) ✅ — dropped imports were redundant
  same-package; no call-site breakage (full venue suite green).

---

## File structure

Moves (package/import renames only; `api/` + `spi/` unchanged and untouched):

- `venue/application/in/*` + `venue/application/out/Venues` → `venue/application/`
  (`AddSetOutcome`, `ChangeOutcome`, `EditBeachMap`, `NewVenueCommand`, `OnboardVenue`,
  `SetCommand`, `SetRejection`, `Venues`) — empty `in/`+`out/` deleted; now-redundant
  same-package imports dropped from `VenueAdminService` and `Venues`.
- `venue/infrastructure/in/*` → `venue/adapter/in/` (`VenueAdminController`,
  `VenueReadController`, `CreateVenueRequest`, `SetPositionRequest`).
- `venue/infrastructure/out/*` → `venue/adapter/out/` (`JdbcVenueCatalog`, `JdbcVenues`).
- `venue/api/*`, `venue/spi/*` — **unchanged** (including both `package-info.java`).
- `venue/package-info.java` — javadoc updated to the ADR-0007 layout; `allowedDependencies`
  untouched. Minor javadoc accuracy fixes in `api`/`spi` `package-info` and `Venues` (old
  `infrastructure.*`/`application.out` phrasing → new layout).
- Cross-module javadoc: `operator/application/Operators.java` comment
  `venue.application.out.Venues` → `venue.application.Venues`.
- Test-side import updates: `WebSliceStubs`, `VenueAdminServiceTest`.

---

## Phase 0 — Move + import rewrite + safety-net verify

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior to
drive test-first; the pre-existing tests are the safety net):

- [ ] `git mv` the classes into `application/` + `adapter/{in,out}`; delete empty
  `application/{in,out}` and `infrastructure/{in,out}`.
- [ ] Rewrite package declarations + imports across main + test trees; verify zero remaining
  `venue.application.in/out` / `venue.infrastructure` references.
- [ ] Drop now-redundant same-package imports in `VenueAdminService` and `Venues`.
- [ ] Update `package-info.java` javadoc (layout only; `allowedDependencies` untouched); minor
  javadoc accuracy fixes.
- [ ] Run the safety net: `./gradlew test --tests "*ModularityTests*"
  --tests "*JdbcOnlyArchitectureTests*"` → PASS; `./gradlew test --tests
  "ai.riviera.platform.venue.*"` → PASS.
- [ ] Commit + push to `claude/riviera-sdlc-issue-79-f97b2q`.

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*ModularityTests*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*JdbcOnlyArchitectureTests*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "ai.riviera.platform.venue.*"` → PASS.
- [ ] **AC-4:** `api/` + `spi/` present top-level; shape is `api/spi/application/adapter.{in,out}`;
  `git diff` shows both modules' `allowedDependencies` unchanged.

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] Type & signature consistency (pure rename — signatures unchanged).
- [ ] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [ ] **Availability** section justified N/A (no availability write path touched; the `spi`
  read port unmoved).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports;
  `api`/`spi` kept top-level `@NamedInterface`; the `venue ↔ availability` inversion intact
  (invariant #11) — `ModularityTests` green.
- [ ] Money/payout logic unchanged (invariants #5, #8, #9); refund policy unchanged (#10).
- [ ] Timezone handling unchanged (invariant #6); booking codes unaffected (invariant #7).
- [ ] No schema change → no Flyway migration needed (invariant #12).
- [ ] Venue-scoped ownership check (invariant #13) unchanged — `VenueAdminService` logic
  untouched by the move.
- [ ] **Frontend** N/A (backend-only).
- [ ] Execution-status table matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.

> Remaining loop stages (post-plan): open PR → CI gate → Review gate
> (`riviera-review-overlay` RV-BE-12; RV-BE-3b on the spi placement) → Sonar gate → merge.
