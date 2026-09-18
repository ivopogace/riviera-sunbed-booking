# Venue beach catalogue + map-following Discover filters — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A venue's beach is one entry of a fixed platform catalogue covering the Albanian coast,
its region is derived from that entry, and choosing a beach or region on Discover narrows the list
AND eases the riviera map to the chosen place — so no two operators can spell one beach two ways
and the tourist's filter, card, place pill and map label all carry the same name.

**Architecture:** The catalogue is `venue.vocabulary.Beach` (a nested `Region` per entry), the
DB `CHECK` on `venue.beach` its backstop, and `venue.region` is dropped: region is a property of
the beach, so storing it would be a second copy of one fact. The frontend mirror
(`shared/beaches.ts`) adds what the backend never needs — labels and a hand-recorded camera view
per beach and region — so the map follows the filter with no geocoding (ADR-0022).

**Persistence:** JDBC only (invariant #1). `V59__venue_beach_catalogue.sql`: rows mapped to
`KSAMIL`, `venue_beach_catalogue_check` added, `venue.region` dropped.

**Source of intent:** GitHub issue #1141.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the issue was
written from the grilled conversation; no in-flight Flyway number, `V58` is the head on `main`
and the one open plan claims none) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger for the two retired text inputs and the region column) · `tdd` (command
validation and the region-filter expansion pinned red first; the migration IT and the list IT
run in CI, Docker being absent in the session) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**ran** by hand over the diff: `CONTEXT.md`
gains the Beach catalogue + Region entries, `docs/architecture/domain-model.md`'s venue column
list loses `region`) · `riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped tests only, no
Docker → ITs skip locally) · `postgres` (`TEXT + CHECK` over a native enum, in lockstep with the
Java enum; the drop is a forward migration) · `riviera-modulith` (the catalogue is a
`vocabulary/` enum, no new port, no new module; the derived region is computed in the adapter,
not stored) · `riviera-java-conventions` (commands take the typed `Beach`, edge DTOs parse the
code like `Amenity`; views keep code strings on the wire) · `codebase-design` (no new seam: the
region filter expands inside `JdbcVenueCatalog`) · `domain-modeling` (glossary entries) ·
`riviera-frontend` (`shared/beaches.ts` is vocabulary → `shared/`; the select field lives in
`operator/` beside `booking-mode-field.ts`) · `angular-developer` (Signal Forms `Field<BeachCode>`
on a native `<select>`) · `riviera-tailwind` (the field reuses the console select skin and the
`[appTouchTarget]` floor; `<optgroup>` needs no new token) · `playwright-cli` (mocked e2e:
choosing a beach eases the map, the pill narrows by code).

**Branch:** `claude/venue-beach-region-dropdown-bfqohz` (the session's designated remote branch
stands in for `feature/venue-beach-catalogue`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `NewVenueCommand` or `VenueProfileCommand` whose beach is not a catalogue
  code, when it is constructed, then it is rejected with `IllegalArgumentException` (→ `400
  INVALID_REQUEST`). *Seam:* the command's canonical constructor · *Pinned by:*
  `VenueProfileCommandTest.unknownBeachIsRejected`, `NewVenueCommandTest.unknownBeachIsRejected`
- [ ] **AC-2:** Given venues on `SHENGJIN` and `TALE` (both region `LEZHE`), when the list is
  filtered by `region=LEZHE`, then all of them are listed rating-desc, name-asc; by
  `beach=SHENGJIN` exactly the Shëngjin one, whose `region` reads `LEZHE`. *Seam:*
  `GET /api/venues?beach=&region=` over `venue.api.VenueCatalog` · *Pinned by:*
  `VenueListControllerIT.filtersByRegionAndAppliesSort`, `.filtersByBeach`
- [ ] **AC-3:** Given an unknown region or beach code, when the list is filtered by it, then the
  answer is `200 []`. *Seam:* as AC-2 · *Pinned by:* `VenueListControllerIT.unmatchedFilterReturnsEmptyArray`
- [ ] **AC-4:** Given the Flyway chain, when a venue row is inserted with an off-catalogue beach,
  then `venue_beach_catalogue_check` rejects it, and the table has no `region` column. *Seam:*
  the migration (Testcontainers Postgres) · *Pinned by:* `VenueBeachCatalogueMigrationIT`
- [ ] **AC-5:** Given the create card and the venue tab, when the operator submits, then the body
  carries the beach code and no region. *Seam:* the `VenueAdminService` / console service request
  types · *Pinned by:* `venue-create-card.spec.ts`, `venue-tab.spec.ts`
- [ ] **AC-6:** Given the Discover page with the map open, when a beach is chosen, then the map
  eases to that beach's catalogue view and the list reloads with the code; choosing a region
  eases to the region's view; "All beaches" returns to the region's view or the riviera view.
  *Seam:* the `RivieraMap` handle (`easeTo`) and `VenueService.listVenues` · *Pinned by:*
  `home.spec.ts`
- [ ] **AC-7:** Given two pinned venues on `DHERMI`, when their pins crowd, then the place pill
  reads `Dhërmi` and pressing it narrows the Beach filter to `DHERMI`. *Seam:* `VenuePinLayer`'s
  `narrowed` output · *Pinned by:* `venue-pin-layer.spec.ts`
- [ ] **AC-8:** Given every surface that shows a venue's beach (card, map header, console picker,
  admin lists), when the code is `DHERMI`, then the text reads `Dhërmi`. *Seam:*
  `shared/beaches.ts#beachLabel` · *Pinned by:* `beaches.spec.ts`, the touched surface specs

## Non-goals

- An admin-editable beach table. Growing the catalogue is a migration + enum + mirror change.
- Deriving the beach from the venue's location pin, or validating the pin against the beach.
- Renaming the wire parameter `region` (it stays `region`, now a region code).
- Changing the Discover list's sort or the pin-crowding geometry.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Operator types any beach text; blank → "Beach is required" | changed | a `<select>` of catalogue entries grouped by region; blank stays required |
| Operator types any region text; blank → "Region is required" | dropped | region is derived from the beach; no input, no validator |
| Server stores `beach` and `region` as given | changed | `beach` must be a catalogue code (edge + CHECK); `region` derived at read time |
| `GET /api/venues?beach=X` exact-matches the stored string | preserved | exact match on the code |
| `GET /api/venues?region=X` exact-matches the stored region | changed | expands the region code to its beaches; unknown → `[]` (as before) |
| Blank `?beach=`/`?region=` = unfiltered | preserved | `VenueFilter.of` unchanged |
| Discover selects list the distinct strings present, locale-sorted | changed | catalogue entries present in the unfiltered list, in catalogue order, labelled |
| Place pill narrows the Beach filter when a crowd shares one beach | preserved | groups on the code, labels via `beachLabel`, emits the code |
| Card / map header / admin lists print the stored string | changed | print `beachLabel(code)` and `regionLabel(code)` |
| Profile GET returns `region` | dropped | the tab never showed it read-only; the form no longer has the field |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stored beach the enum does not know (drift between CHECK and enum) breaks every read | low | high | the enum is the one source; the CHECK lists its names verbatim; `VenueBeachCatalogueMigrationIT` inserts every enum name and asserts the CHECK accepts them all | session | open |
| R-2 | The 60-odd ITs that insert venue rows with `region` fail to compile or violate the CHECK | high | med | a scripted rewrite of the test SQL (drop the region column/value, map beach literals to `KSAMIL` unless a test needs its own); `compileTestJava` proves the shape, CI the rows | session | open |
| R-3 | The region column drop breaks `VenueListControllerIT`'s isolation (it keyed on a marker region) | high | med | fixtures move to `SHENGJIN`/`TALE`/`PATOK` (region `LEZHE`), which no other test uses; teardown keys on those beach codes | session | open |
| R-4 | Camera coordinates recorded by hand are off | med | low | town-scale zoom (13) tolerates a few hundred metres; the coordinates are constants, one line each to correct | maintainer | open |
| R-5 | The `venue.region` drop and V3's seed values | low | low | V59 UPDATEs every row to `KSAMIL` before the CHECK; the app is not live (maintainer's call) | session | open |
| R-6 | Wire change on `POST /api/venues` and `PATCH /api/venues/{id}` (no `region`) | — | low | an extra `region` property is ignored by Jackson (`FAIL_ON_UNKNOWN_PROPERTIES` is off in Boot); the FE types drop the field so the compiler enforces it | session | open |

## Open questions / Assumptions

- **Assumption:** existing rows on the Render dev database may all become `KSAMIL`; the
  maintainer said so on the issue's conversation and will re-point them by hand. — *Owner:*
  maintainer · *Resolves by:* merge

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no write to `set_availability`, no beach-map change; the
venue profile write keeps its optimistic version check unchanged.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue` | the venue profile, including where the venue is, is the venue module's Job |

**Cross-module named interfaces (`api/` ports)** — none new. `venue.vocabulary.Beach` joins the
published vocabulary (an enum, like `Amenity`); `VenueFilter`'s shape is unchanged.

**Domain events** — none.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| the beach catalogue and its region derivation | `venue` | `venue` Job: venue profile + location; no other module's Not-My-Job mentions it |
| the region → beaches expansion in the list read | `venue` | the discovery read is `VenueCatalog`'s, all in `venue`, no boundary change |

## Payment & payout

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beaches.ts` | new | vocabulary mirror | pure | — |
| FE-2 | `operator/beach-field.ts` | new | standalone component | `input()` | Signal Forms `Field<BeachCode>` |
| FE-3 | `operator/venue-create-card.*` | existing | component | signals | Signal Forms |
| FE-4 | `operator/venue-tab.*` | existing | component | signals | Signal Forms |
| FE-5 | `pages/home/home.*` | existing | page | signals | — |
| FE-6 | `pages/home/venue-pin-layer.ts`, `venue-card.ts` | existing | component + view | signals | — |
| FE-7 | `venue/venue-map.*`, `operator/operator-home.ts`, `operator/operator-venue-switch.ts`, `console-shell.ts`, `admin/admin-*.ts` | existing | display sites | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`.

## FE↔BE contract

- **Changed endpoints:** `POST /api/venues` and `PATCH /api/venues/{id}` bodies lose `region`;
  `beach` is a catalogue code. `GET /api/venues/{id}/profile` loses `region`. `GET /api/venues`
  and `GET /api/venues/{id}` keep `beach` and `region`, both now codes. `GET /api/venues?beach=&region=`
  takes codes.
- **Client typing:** hand-written types in `shared/venue-views.ts`, `operator/venue-admin.model.ts`,
  `operator/operator-console.model.ts`; `BeachCode`/`RegionCode` unions from the mirror.

## File structure

> Every path in the diff, machine-checked by `node scripts/check-plan-file-structure.mjs --diff origin/main`.

- `CONTEXT.md` — glossary: Beach catalogue + region
- `docs/architecture/domain-model.md` — `venue` column list
- `frontend/e2e/*.e2e.ts`, `frontend/e2e/support/*.ts` — mocked venues carry codes; filter values are codes; the create steps pick from the select
- `frontend/e2e/support/admin-console.mocks.ts` — beach shown through `beachLabel`
- `frontend/e2e/support/auth-mocks.ts` — beach shown through `beachLabel`
- `frontend/e2e/support/operator-console.mocks.ts` — beach shown through `beachLabel`
- `frontend/e2e/support/tourist.mocks.ts` — beach shown through `beachLabel`
- `frontend/src/app/admin/admin-commissions.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-commissions.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-commissions.ts` — beach shown through `beachLabel`
- `frontend/src/app/admin/admin-console-stats.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-operators.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-reviews.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-reviews.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-reviews.ts` — beach shown through `beachLabel`
- `frontend/src/app/admin/admin-venue-changes.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-venue-changes.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-venue-photos.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-venue-photos.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/admin-venue-photos.ts` — beach shown through `beachLabel`
- `frontend/src/app/admin/admin-venues.service.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/admin/moderation-venue-picker.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/app.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/console-shell.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/console-shell.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/console-shell.ts` — beach shown through `beachLabel`
- `frontend/src/app/core/owned-venues.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/beach-field.ts` — the shared beach `<select>` grouped by region
- `frontend/src/app/operator/console-stats-strip.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/console-venue-map.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/console-venue-switch.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/daily-view-tab.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/daily-view-tab.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-console.model.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-console.model.ts` — request/view types: `BeachCode`, no `region`
- `frontend/src/app/operator/operator-console.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-home.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-home.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-home.ts` — beach shown through `beachLabel`
- `frontend/src/app/operator/operator-venue-switch.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/operator-venue-switch.ts` — beach shown through `beachLabel`
- `frontend/src/app/operator/requests-tab.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/requests-tab.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-admin.model.ts` — request/view types: `BeachCode`, no `region`
- `frontend/src/app/operator/venue-admin.service.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-create-card.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-create-card.html` — `app-beach-field` replaces the two text inputs; no region
- `frontend/src/app/operator/venue-create-card.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-create-card.ts` — `app-beach-field` replaces the two text inputs; no region
- `frontend/src/app/operator/venue-tab.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-tab.html` — `app-beach-field` replaces the two text inputs; no region
- `frontend/src/app/operator/venue-tab.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/operator/venue-tab.ts` — `app-beach-field` replaces the two text inputs; no region
- `frontend/src/app/pages/home/home.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/home.html` — catalogue-fed selects, `followFilter()` eases the map, labelled crumb/card
- `frontend/src/app/pages/home/home.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/home.ts` — catalogue-fed selects, `followFilter()` eases the map, labelled crumb/card
- `frontend/src/app/pages/home/pin-crowding.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/venue-card.ts` — `beachLabel`/`regionLabel` beside the code
- `frontend/src/app/pages/home/venue-pin-layer.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/venue-pin-layer.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/venue-pin-layer.ts` — place pill labelled, narrows by code
- `frontend/src/app/pages/home/venue-preview-card.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/pages/home/venue-preview-card.html` — beach shown through `beachLabel`
- `frontend/src/app/pages/home/venue-preview-card.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/shared/beaches.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/shared/beaches.ts` — the frontend mirror: codes, labels, regions, camera views
- `frontend/src/app/shared/venue-views.ts` — `beach: BeachCode`, `region: RegionCode` on the tourist views
- `frontend/src/app/venue/venue-map-switch.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/venue/venue-map.spec.ts` — fixtures carry codes; labels asserted
- `frontend/src/app/venue/venue-map.ts` — beach shown through `beachLabel`
- `frontend/src/testing/venue-cards.ts` — fixtures carry codes; labels asserted
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/BeachCode.java` — wire code → `Beach` parse shared by the two request bodies
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/CreateVenueRequest.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/UpdateVenueProfileRequest.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/EditVenueProfile.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/NewVenueCommand.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueFieldValidation.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileCommand.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/Beach.java` — the catalogue enum with its nested `Region` (venue vocabulary)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueFilter.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — typed beach, derived region
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueSummaryView.java` — typed beach, derived region
- `platform/src/main/resources/db/migration/V59__venue_beach_catalogue.sql` — rows → `KSAMIL`, the catalogue CHECK, `region` dropped
- `platform/src/test/java/ai/riviera/platform/AuthSessionIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/BookingCreateChallengeIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/CsrfProtectionIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/MoveVsReserveConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/MyVenuesControllerTest.java` — beach literals → catalogue codes
- `platform/src/test/java/ai/riviera/platform/MyVenuesIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/OperatorSuspensionRevocationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/PendingOperatorConsoleIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/PerOperatorLoginIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/RemodelCommitIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/RemodelPreviewIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/RemodelReceiptIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/ReviewFixtures.java` — beach shown through `beachLabel`
- `platform/src/test/java/ai/riviera/platform/availability/RetiredSetClaimIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/BookingControllerIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewSuppressionIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/CancellationTermsEndpointIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/CheckInConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/CheckInFlowIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/ConcurrentRequestClaimIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/ConcurrentRequestTerminationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/FreeExitCancelIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/HiddenVenueSoldBookingRegressionIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/NoShowSweepIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/RemodelCommitMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/RequestAcceptPayIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/RequestExpiryVsAcceptRaceIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/RequestToBookFlowIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/SameDayRequestLifecycleIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/SeasonClosureReserveIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/VenueCausedCancellationMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/WithdrawRequestIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsDailyTakingsIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsLiveClaimsIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceiptsIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RequestTerminationEventPublicationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/operator/OperatorOwnershipIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/operator/OperatorVenueVisibilityIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/AdminVenueChangeRefundsIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/PayoutBatchGenerationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/PayoutBatchRaceIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/PayoutLedgerViewIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/VenueCommissionForwardOnlyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/payout/adapter/out/JdbcPayoutBatchesIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/review/ReviewMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/AdminPhotoModerationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/AdminPhotoTakedownIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/AdminVenueCommissionIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapDiffConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/BookingModeSwitchIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/JdbcPhotoStorageIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/JdbcVenueCommissionScheduleIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/PoolSwitchOnBookedSetIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SeasonClosureCatalogIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SeasonClosureControllerIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetBatchApplyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetBookingInfoIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireVsMarkConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetSpotsIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/SetWriteVsClaimConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAmenityMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAvailabilityCalendarIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueBeachCatalogueMigrationIT.java` — pins the CHECK, the dropped column, the seed mapping (AC-4)
- `platform/src/test/java/ai/riviera/platform/venue/VenueCatalogVisibilityIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueCommissionScheduleMigrationIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueListControllerIT.java` — fixtures re-keyed on the `LEZHE` beaches; region filter by code (AC-2/3)
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoReadModelIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoServingIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueProfileConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueRepriceConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueRepriceIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueRowRenameIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/VenueSetWriteConcurrencyIT.java` — venue fixture: `region` dropped, beach → `KSAMIL`
- `platform/src/test/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionControllerTest.java` — beach literals → catalogue codes
- `platform/src/test/java/ai/riviera/platform/venue/adapter/in/BeachCodeTest.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java` — beach literals → catalogue codes
- `platform/src/test/java/ai/riviera/platform/venue/application/NewVenueCommandTest.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — beach literals → catalogue codes
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueCommissionServiceTest.java` — beach literals → catalogue codes
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueProfileCommandTest.java` — typed beach, no region (AC-1)

## Execution status

**Stage pointer:** implement (phase 3 — docs + close-out), then PR + CI gate

**Next action:** push the branch; open the PR so CI runs the Testcontainers ITs this session could not (no Docker); then the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — issue + plan | ✅ | |
| 1 — backend: `Beach`, V59, commands, adapters, ITs | ✅ | (this PR's first commit) |
| 2 — frontend: mirror, field, forms, Discover + map, labels | ✅ | (same commit) |
| 3 — docs + close-out | ⏳ | plan doc finalised; CI on the PR runs the two Testcontainers ITs |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

### Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-17 | phase 1 — the `region` column drop and the beach CHECK | every test that inserts a `venue` row (any SQL naming the column list) | `grep -rl "INSERT INTO venue" platform/src/test/java` | 80 files | scripted rewrite: `region` dropped from column and value lists, literal beaches → `KSAMIL`; the four `:beach`-parameter sites and the list IT's isolation by hand |
| 2026-09-17 | phase 2 — beach codes on the wire | every surface that prints a venue's beach or region | `grep -rn "\\.beach\\b\\|\\.region\\b" frontend/src/app --include=*.html --include=*.ts` | 11 sites (card, preview, map header, crumb, place pill, console picker, venue switch, palette hint, three admin lists) | all print `beachLabel`/`regionLabel`; the pin layer keeps grouping on the code |

### Acceptance-criteria verification

- [x] **AC-1:** `./gradlew test --tests "*NewVenueCommandTest*" --tests "*VenueProfileCommandTest*" --tests "*BeachCodeTest*"` → 16 pass (session).
- [ ] **AC-2/AC-3/AC-4:** `VenueListControllerIT`, `VenueBeachCatalogueMigrationIT` — Testcontainers; skipped in the session (no Docker), verified by the PR's CI run.
- [x] **AC-5:** `venue-create-card.spec.ts`, `venue-tab.spec.ts` → pass (session).
- [x] **AC-6:** `home.spec.ts` "eases the map to the chosen beach, then its region, then back to the riviera" → pass (session).
- [x] **AC-7:** `venue-pin-layer.spec.ts` (narrows to `KSAMIL` / `DHERMI`, pill reads the label) → pass (session).
- [x] **AC-8:** `beaches.spec.ts` + the touched surface specs → pass (session).

### Self-review checklist

- [x] Every AC pinned by the named test.
- [x] Flyway migration present; the CHECK tested by its IT (invariant #12).
- [x] No JPA; `JdbcClient` SQL only (invariant #1).
- [x] `ModularityTests` + the structural net green (session).
- [x] `npm run lint`, `format:check`, `test` (3407 specs) and `test:e2e:a11y` (665 tests) green in the session.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green.
- [x] `check-inline-comments`, `check-touch-target`, `check-focus-posture` over the touched files: clean.
