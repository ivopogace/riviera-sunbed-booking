# A PENDING operator lays out and prices its own venue — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A `PENDING` operator's console loads and saves its venue's beach map and pricing, while
the tourist reads keep hiding that venue until approval.

**Architecture:** The owner's map read stops composing through the tourist `VenueCatalog` (whose
contract fences on `VenueVisibility`) and reads the same map through a module-internal driven port
with no fence — ownership, asserted first, is the whole authorization (invariant #13), and the
principal already comes from `OperatorDirectory`'s may-operate set (`ACTIVE` + `PENDING`). The
console's every map read then goes through `GET /api/venues/{id}/beach-map` (the owner's read)
instead of the tourist `GET /api/venues/{id}`. Owner decision (orchestrator brief): fix the reads;
the console banner and the spec's approval wording stay.

**Source of intent:** #1531; CONTEXT.md § Operator approval; ADR-0013; RESPONSIBILITIES.md §venue,
§operator.

**Branch:** `bugfix/pending-owner-reads`

## Acceptance criteria

- [ ] **AC-1:** Given an operator in status `PENDING` owning venue V with sets, when it reads
  `GET /api/venues/V/beach-map`, then it is `200` with V's map and locks. *Seam:* `ViewBeachMap`
  over HTTP · *Pinned by:* `PendingOwnerConsoleReadsIT.pendingOwnerReadsItsOwnBeachMap`
- [ ] **AC-2:** Given the same venue V, when a tourist reads `GET /api/venues/V`, then it is
  `404` (the `VenueCatalog` fence is unchanged). *Seam:* `VenueCatalog` over HTTP ·
  *Pinned by:* `PendingOwnerConsoleReadsIT.touristReadsKeepTheFence`
- [ ] **AC-3:** Given another operator (any status), when it reads V's beach map, then `403`
  before any existence probe. *Seam:* `ViewBeachMap` · *Pinned by:*
  `PendingOwnerConsoleReadsIT.anotherOperatorIsDeniedBeforeExistence`,
  `BeachMapReadServiceTest.deniesNonOwnerBeforeAnyProbe`
- [ ] **AC-4:** Given ownership passed, when the module composes the owner's map, then it reads
  through the unfenced `OwnerVenueMap` port and never `VenueCatalog`. *Seam:* `OwnerVenueMap` ·
  *Pinned by:* `BeachMapReadServiceTest.answersTheMapAndItsLockedSetsOrderedBySetId`
- [ ] **AC-5:** Given the console's shared snapshot, the Pricing tab, the Requests tab, the stats
  strip and the Daily view, when they load their venue map, then the request is
  `GET /api/venues/{id}/beach-map` and the map is its `map` member. *Seam:*
  `ConsoleVenueMap` / `OperatorConsoleService#beachMap` · *Pinned by:* `console-venue-map.spec`,
  `daily-view-tab.spec`, `operator-console.spec`, `pricing-tab.spec`, `requests-tab.spec`
- [ ] **AC-6:** Given a freshly registered (PENDING) operator creating a venue, when it opens the
  console's Beach map and Pricing tabs, then both load from the owner's read. *Seam:* mocked e2e ·
  *Pinned by:* `operator-onboarding.e2e.ts`

## Non-goals

- Changing the pending-approval banner, the spec's approval wording, or the tourist fence.
- #1526's venue-not-found routing (it builds on this read's 403/404).
- A `date` parameter on the owner's read: no console surface needs another day's overlay
  (the Daily view's tile states come from the owner's `…/availability?date=` read).

## Risks

- **R-1 (BOLA, #13):** an unfenced read must stay owner-asserted first → the service's order is
  unchanged (ownership → map → locks), `deniesNonOwnerBeforeAnyProbe` verifies no interaction.
- **R-2 (tourist leak):** the new port must not be reachable from the tourist controller → it is
  module-internal (`application/`), and `VenueCatalog`'s fence stays; `VenueCatalogVisibilityIT`
  and `PendingOwnerConsoleReadsIT.touristReadsKeepTheFence` pin it.
- **R-3 (e2e drift):** console specs only mocked the tourist URL → each console spec gains the
  owner-read mock; tourist specs untouched.

## Open questions

### Resolved

- Should the Daily view keep the tourist read? → No: it only needs the layout; its tile states
  and today's sales verdict do not depend on the map's date overlay.

## Modulith

- New driven port `venue.application.OwnerVenueMap` (module-internal, implemented by
  `JdbcVenueCatalog`): the map in the tourist shape without the fence. Owner: `venue` (it names
  its own map). No grant changes.

## FE↔BE contract

- Unchanged endpoints; the console drops its use of `GET /api/venues/{id}?date=`.

## Phases

- **Phase 0 — backend:** red `BeachMapReadServiceTest` on `OwnerVenueMap`; adapter; IT.
- **Phase 1 — frontend:** red `console-venue-map.spec` / `daily-view-tab.spec`; impl; consumer specs.
- **Phase 2 — e2e + docs:** owner-read mocks; onboarding spec; RESPONSIBILITIES, skill, lint edge.

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** console unit specs green, then the e2e mocks

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — backend | ✅ | phase-0 |
| 1 — frontend | ⏳ | |
| 2 — e2e + docs | | |
