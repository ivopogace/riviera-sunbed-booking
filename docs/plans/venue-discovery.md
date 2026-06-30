# Tourist Venue Discovery Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist lands on `/`, optionally filters by beach and/or region for a chosen
date, and sees the matching venues as cards — name, beach·region, rating, "from" price per
set, and that day's free/total set count — each linking to the existing `/venues/:id` map.

**Architecture:** A new list read on the existing `venue` read seam. `VenueCatalog` (the
deep venue-read module) gains a `listVenues(filter, date)` method returning
`VenueSummaryView` records; the JDBC adapter reuses the **U2 availability read** (the
`venue.spi.SetAvailabilityLookup`) to compute each venue's free count per date — the same
ownership-preserving overlay the single-venue map uses (issue #44). The Angular landing page
(`/`) is rebuilt from the coming-soon health tracer into the discovery list.

**Persistence:** JDBC only (invariant #1). **No migration** — pure read over the existing
`venue`, `set_position`, and `set_availability` tables.

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
§4.1 steps 1–2, §10 (v1 scope) · GitHub issue **#61**. (The repo's `U8` label is taken by
#10 *Staff daily view*; this is the earlier funnel slice, numbered "Discovery".)

**Skills consulted:** `riviera-modulith` (extend the `VenueCatalog` api port rather than add
a shallow port; reuse the `venue.spi` driven port for availability; no new event/module),
`riviera-java-conventions` (records for the summary DTO + filter, JdbcClient + text-block SQL,
package-private adapter, `.toList()`/method refs, named constants, `VenueFilter` record over
`Optional` params), `codebase-design` (`listVenues` is the same catalogue conversation — one
deep `VenueCatalog`, not a new module), `postgres` (optional-filter predicate with
`CAST(:p AS TEXT) IS NULL OR col = :p`, sort `rating_tenths DESC, name ASC`, reuse existing
indexes — no new index/migration), `angular-developer` + angular-cli MCP (v22 signals,
`@Service`, `@if/@for`, `input()`/`output()` n/a here, a11y/contrast gates), `playwright-cli`
(discovery e2e added to the CI-safe mocked a11y suite).

**Branch:** `claude/u8-venue-discovery-mxscbi` (exists, off latest `main`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the seeded venues, when `GET /api/venues` is called with no filter, then
  all venues are returned as summaries sorted by `ratingTenths` desc then `name` asc. *Pinned by:*
  `VenueListControllerIT.returnsAllVenuesSortedByRatingThenName`
- [ ] **AC-2:** Given venues on different beaches/regions, when `?beach=X` (and/or `?region=Y`)
  is supplied, then only venues exactly matching every supplied filter are returned. *Pinned by:*
  `VenueListControllerIT.filtersByBeach`, `VenueListControllerIT.filtersByRegion`
- [ ] **AC-3:** Given a venue with N sets and no `set_availability` rows for date D, when listed
  for D, then its `availability` is `{ free: N, total: N }` and `fromPrice` is the cheapest set's
  price in minor units + currency. *Pinned by:* `VenueListControllerIT.summaryCountsAndFromPrice`
- [ ] **AC-4:** Given a set of venue V booked for date D, when V is listed for D, then V's `free`
  drops by one for D only (a different date is unaffected) — sourced from `set_availability`
  (invariant #2). *Pinned by:* `VenueListControllerIT.bookedSetLowersFreeCountForThatDateOnly`
- [ ] **AC-5:** Given no `date` param, when `GET /api/venues` is called, then counts are computed
  for **tomorrow in Europe/Tirane** (invariant #6). *Pinned by:*
  `VenueListControllerIT.defaultsToTomorrowTirane`
- [ ] **AC-6:** Given a filter matching nothing, when listed, then `200` with an empty JSON array
  (not 404). *Pinned by:* `VenueListControllerIT.unmatchedFilterReturnsEmptyArray`
- [ ] **AC-7:** Given no credentials, when `GET /api/venues` is called, then `200` (public read).
  *Pinned by:* `VenueListControllerIT.endpointIsPublic`
- [ ] **AC-8:** Given the discovery page at `/`, when the venue list loads, then a card per venue
  renders its name, `beach · region`, rating, from-price, and "{free} of {total} free", each
  linking to `/venues/:id`. *Pinned by:* `Home.spec` (`renders a card per venue …`)
- [ ] **AC-9:** Given the page, when the request is in flight / returns empty / errors, then a
  distinct, accessible loading / empty / error state shows (not a blank screen). *Pinned by:*
  `Home.spec` (loading/empty/error cases)
- [ ] **AC-10:** Given the page, when filters change, then `listVenues` is re-requested with the
  new beach/region/date params. *Pinned by:* `Home.spec` (`re-queries on filter change`)
- [ ] **AC-11:** Given the rendered page, when audited by axe and the contrast table, then no
  serious/critical violations and all colour pairs meet AA. *Pinned by:* `home.a11y.spec`,
  `home.contrast.spec`, and the mocked e2e `discovery-flow.e2e` (real-browser contrast + keyboard).

## Non-goals

- Photos/images (no image column in the v1 `venue` table), map/geo, distance.
- Pagination / infinite scroll (v1 venue count is small — Phase-1 beaches).
- Free-text search; fuzzy matching (filters are exact-match on `beach`/`region`).
- Same-day booking or any availability **write** — staff tap-to-mark is #10.
- Sorting controls in the UI (sort order is fixed: rating desc, name asc).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Free count miscomputed → page implies bookable sets that aren't | med | high | Reuse the exact U2 `SetAvailabilityLookup.takenOn`; `free = total − takenInVenue`; IT books a real set and asserts the count drops for that date only (AC-4) | agent | open |
| R-2 | Postgres can't infer the type of a `NULL` filter param → query error | med | med | `CAST(:beach AS TEXT) IS NULL OR beach = :beach`; IT exercises both filtered and unfiltered paths | agent | open |
| R-3 | N+1 availability queries across venues | low | low | One `takenOn` call for **all** matched sets, then bucket in memory (single round-trip) | agent | open |
| R-4 | Replacing Home breaks the existing home specs / e2e entry | med | med | Rewrite `home.spec`/`home.a11y.spec`, add `home.contrast.spec`; the booking-flow e2e still enters at `/venues/1` (unchanged) | agent | open |
| R-5 | Colour-only state on cards fails WCAG-AA | low | med | Text conveys every fact ("{free} of {total} free", rating value); contrast spec + axe + real-browser e2e | agent | open |

## Open questions / Assumptions

> None open. The three product forks were resolved with the user before planning.

### Resolved

- **Page placement:** discovery **replaces Home at `/`** (the coming-soon backend-health tracer
  is dropped). — *user decision, pre-plan.*
- **Filter dimension:** **beach + region**, both optional exact-match query params
  (`?beach=&region=`); omitting both returns all venues. — *user decision, pre-plan.*
- **Sort order:** **rating desc, then name asc.** — *user decision, pre-plan.*

## Availability & concurrency (invariant #2)

This slice **reads** availability; it never writes it.

- **Write paths to `availability(set_id, booking_date)`:** none — this is a read-only discovery
  list. No claim, no release, no staff mark.
- **Availability read:** per-date free count is derived by reusing
  `venue.spi.SetAvailabilityLookup.takenOn(allSetIds, date)` — the same source-of-truth overlay
  (invariant #2) the single-venue map uses (issue #44). `free = total − |taken ∩ venue's sets|`.
  Row-existence = taken; absence = free (the U2 model).
- **Uniqueness / concurrency strategy:** N/A — no write, so no constraint or lock is engaged here.
- **Pool rule (invariant #3):** the free count is over **all** of a venue's sets (the discovery
  card is a coarse "how busy is it" signal); the online-pool restriction is enforced later at the
  map/claim, not at discovery. Documented so review doesn't read it as a pool leak.
- **Cutoff rule (invariant #4):** the default date is tomorrow in `Europe/Tirane` (display
  convenience, mirrors the U1 controller); the real cutoff stays server-side at booking time.
- **Pinning test:** `VenueListControllerIT.bookedSetLowersFreeCountForThatDateOnly` (date-aware
  count) — there is no concurrency test because there is no write path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns venue profiles, pricing, the set layout — the discovery summary is a venue read |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#listVenues(VenueFilter, LocalDate)` | `VenueSummaryView`, `AvailabilitySummary`, `VenueFilter` (new records) | venue's own REST adapter |
| NI-2 | `venue.spi` | `SetAvailabilityLookup#takenOn` (existing, reused) | `SetId` | implemented by `availability` |

No new module, no new `spi`, **no new event** (a read needs no fan-out). `listVenues` is added to
the existing `VenueCatalog` (same catalogue conversation — a deep module, not a new shallow port).

**Domain events:** N/A — read-only slice.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. (The summary *displays* a from-price in integer minor units, invariant #5,
but no charge/refund/ledger effect occurs.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/home.ts` + `.html` + `.scss` | rebuilt | standalone component | Signals (`venue list`, `state`, `selectedDate`, `beach`, `region`) + `computed` | plain inputs (beach/region selects + date) — no Signal Form needed for two selects + a date |
| FE-2 | `venue/venue.service.ts` | modified | `@Service` | — | adds `listVenues(filter, date): Observable<VenueSummaryView[]>` |
| FE-3 | `venue/venue.model.ts` | modified | types | — | adds `VenueSummary`, `AvailabilitySummary` interfaces |
| FE-4 | `e2e/discovery-flow.e2e.ts` | new | Playwright (mocked) | — | discovery → card → `/venues/:id`, axe at each step (CI `test:e2e:a11y`) |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals + `computed`, `class`/`style`
bindings (no `ngClass`/`ngStyle`), no `as any` on the contract, reuse `formatMoney` and the
`booking-date` helpers. Loading/empty/error states are distinct and accessible (aria-live /
`role="alert"`), card state conveyed by text not colour alone.

## FE↔BE contract

- **New endpoint:** `GET /api/venues?beach=&region=&date=` → `200` `VenueSummaryView[]`
  (JSON array; empty array when nothing matches). `beach`/`region`/`date` all optional; `date`
  defaults to tomorrow Europe/Tirane.
- **DTO shape:** `{ id, name, beach, region, ratingTenths, reviewsCount, bookingMode,
  fromPrice: { minorUnits, currency } | null, availability: { free, total } }`.
- **Client typing:** hand-written `VenueSummary` interface mirroring the record; typed
  `VenueService.listVenues`. Never `as any`.
- **Money/date on the wire:** amounts integer minor units + currency (invariant #5); date ISO
  `YYYY-MM-DD` `LocalDate` (invariant #6).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend: list read port + controller | ✅ | VenueListControllerIT 10/0/0; venue+modularity+jdbc-only green |
| 1 — Frontend: discovery page + service + e2e | ✅ | lint clean; 152 vitest; build green; 4 e2e pass (2 new) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `platform/.../venue/api/VenueSummaryView.java` — new summary record (+ `AvailabilitySummary`, `VenueFilter`)
- `platform/.../venue/api/VenueCatalog.java` — add `listVenues(VenueFilter, LocalDate)`
- `platform/.../venue/infrastructure/out/JdbcVenueCatalog.java` — implement the list query (reuse spi)
- `platform/.../venue/infrastructure/in/VenueReadController.java` — add `GET /api/venues`
- `platform/src/test/.../venue/VenueListControllerIT.java` — new IT (AC-1..AC-7)
- `frontend/src/app/venue/venue.model.ts` — add `VenueSummary`, `AvailabilitySummary`
- `frontend/src/app/venue/venue.service.ts` — add `listVenues`
- `frontend/src/app/pages/home/home.{ts,html,scss}` — rebuild as discovery
- `frontend/src/app/pages/home/home.{spec,a11y.spec,contrast.spec}.ts` — rewrite/add
- `frontend/e2e/discovery-flow.e2e.ts` — new mocked-a11y e2e

---

## Phase 0 — Backend: list read port + controller (TDD)

**Files:** Create `VenueSummaryView.java`, `VenueListControllerIT.java` · Modify
`VenueCatalog.java`, `JdbcVenueCatalog.java`, `VenueReadController.java`

- [ ] Write `VenueListControllerIT` (AC-1..AC-7) red against the seeded Miramar venue.
- [ ] Add `VenueSummaryView` / `AvailabilitySummary` / `VenueFilter` records to `venue.api`.
- [ ] Add `listVenues(VenueFilter, LocalDate)` to `VenueCatalog`; implement in `JdbcVenueCatalog`
      (venues query with optional `CAST(:p AS TEXT) IS NULL OR col = :p` filters + sort, sets query,
      one `takenOn` call, in-memory bucket).
- [ ] Add `@GetMapping` (no `{id}`) to `VenueReadController` mapping `beach`/`region`/`date`.
- [ ] Green: `./gradlew test --tests "*VenueListControllerIT*"` then `--tests "*venue*"` +
      `*ModularityTests*` + `*JdbcOnly*`.
- [ ] Commit `(#61)`; update execution status.

## Phase 1 — Frontend: discovery page + service + e2e (TDD)

**Files:** Modify `venue.model.ts`, `venue.service.ts`, `home.{ts,html,scss,spec,a11y.spec}` ·
Create `home.contrast.spec.ts`, `e2e/discovery-flow.e2e.ts`

- [ ] Add `VenueSummary`/`AvailabilitySummary` to `venue.model.ts`; `listVenues` to `venue.service.ts`.
- [ ] Rewrite `Home` as the discovery page (signals: list, state, date, beach, region; cards;
      loading/empty/error). Update `home.spec` (AC-8..AC-10), `home.a11y.spec`; add `home.contrast.spec`.
- [ ] Add `discovery-flow.e2e.ts` to the mocked suite (AC-11).
- [ ] Green: `npm run lint`, `npm test`, `npm run build` (e2e is CI's `test:e2e:a11y`).
- [ ] Commit `(#61)`; update execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-7: `./gradlew test --tests "*VenueListControllerIT*"` → all green.
- [ ] AC-8..AC-11: `npm test` (home specs) + `npm run test:e2e:a11y` (discovery-flow) → green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No JPA; no `@Entity`; JdbcClient + SQL only (invariant #1).
- [ ] Availability section filled; read-only, reuses the U2 source of truth (invariant #2).
- [ ] Modulith section filled; `listVenues` on `venue.api`, no cross-module internal imports;
      `ModularityTests` green (invariant #11).
- [ ] Payment/payout N/A (no money moves); money shown in minor units (invariant #5).
- [ ] Timezone: default date tomorrow `Europe/Tirane`, computed from injected `Clock` (invariant #6).
- [ ] Frontend standards met; no `as any`; a11y (axe + contrast + e2e) green.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty.
