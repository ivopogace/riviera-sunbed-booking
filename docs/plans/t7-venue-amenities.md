# T7 — Venue amenities + distance-to-water Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task, red-green-refactor.
> Riviera discipline (Availability / Modulith / Payment sections) is baked in below.

**Goal:** A venue profile gains an order-insensitive **amenity set** (fixed 11-tag platform
catalogue) and an optional **distance-to-water** in metres; both surface on `GET /api/venues`
+ `GET /api/venues/{id}`, are edited via a new venue-scoped `PATCH /api/venues/{venueId}`
(operator-owns-venue enforced, invariant #13), and render as chips on the Discover cards
(≤3 + to-water) and the beach-map header (full row + to-water).

**Architecture:** The single most significant decision is **storage = a `venue_amenity` join
table** (not a `text[]` column) — chosen to make a future "filter Discover by amenity" a natural
indexed query. Amenities travel the wire as **stable codes** (`BEACH_BAR`, `FREE_PARKING`, …),
mirrored FE/BE exactly like the existing `booking-status.ts` ↔ `BookingStatus` pattern; display
labels are FE-only. The edit path is a **new internal `EditVenueProfile` port** on the existing
`VenueAdminService` (mirrors `EditBeachMap`), so the actor-owns-venue check sits in the
application service, not the controller.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V21** — a `venue_amenity`
join table + a nullable positive-int `distance_to_water_m` column on `venue`. `JdbcClient`/
`JdbcTemplate` + explicit SQL; no JPA.

**Source of intent:** GitHub issue **#140** (epic **#133**, the Liquid Glass tourist redesign).
Design: `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` (tourist chips, lines ~190–193,
~223–226, ~1231, ~1253) + `docs/design/riviera-operator-console-v2.dc.html` (the operator
"Commodities" chip-toggle intent, lines ~428–436) + `docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted:**
- `riviera-plan-doc` — plan discipline + template.
- `postgres` — join-table vs `text[]` (chose join per the filtering-roadmap answer), FK + composite
  PK for order-insensitive dedup, `CHECK` for the fixed catalogue + positive-distance, `ON DELETE CASCADE`
  (profile data, not the append-only ledger).
- `riviera-modulith` — placement: read-view field additions stay in `venue::vocabulary` (additive,
  no consumer break); new `Amenity` enum → `venue.vocabulary`; the edit port stays **internal** in
  `application/` (like `EditBeachMap`), not `api/`; no new event/spi; `ModularityTests` +
  `PackageShapeArchitectureTests` + `PublishedSurfacePlacementArchitectureTests` + `VenueApiRoleSplitTests`
  stay green.
- `riviera-java-conventions` — records for the command/DTO, typed `Amenity` at the seam, edge validation
  in `toCommand()` throwing `IllegalArgumentException` → `400 INVALID_REQUEST` (§6b), typed outcome
  (reuse `ChangeOutcome`), `@Transactional` write, no JPA/Lombok.
- `riviera-frontend` — new shared recipe placement (`shared/amenities.ts` + `_glass.scss amenity-chip`
  mixin), one-way imports, the two-suite e2e split.
- `angular-developer` + angular-cli MCP (`search_documentation` v22) — `linkedSignal` for the editable
  amenity set seeded from the re-read venue, `computed` for the ≤3 card slice, Signal Forms for the
  metres field. *(Loaded at FE phases; recorded here.)*
- `playwright-cli` — the mocked (render-path) + real-backend (editor-save-path) e2e. *(Loaded at the e2e phase.)*
- `domain-modeling` — the `Amenity` catalogue as ubiquitous language; CONTEXT.md glossary + RESPONSIBILITIES.md
  venue-Job update at close-out. *(Loaded at close-out.)*

**Branch:** `feature/t7-venue-amenities` (cut off `origin/main` @ `aff0da0`; the cloud/remote
designated branch stands in for the literal `feature/<slug>` — this is a local session, branch created).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (migration constraints):** Given the V21 migration is applied, when a row is inserted into
  `venue_amenity` with an off-catalogue `amenity`, or `venue` is given `distance_to_water_m = 0` (or negative),
  then the DB rejects it (CHECK violation); a duplicate `(venue_id, amenity)` pair is rejected (PK); deleting a
  venue cascades its amenities. *Pinned by:* `VenueAmenityMigrationIT` (Testcontainers).
- [ ] **AC-2 (read views carry the fields):** Given a venue with amenities `{BEACH_BAR, FREE_PARKING, SHOWERS}`
  and `distance_to_water_m = 15`, when `GET /api/venues/{id}` and `GET /api/venues` are called, then each carries
  `amenities` (the codes, **catalogue-ordered**) and `distanceToWaterM = 15`. *Pinned by:*
  `VenueReadControllerIT.detailCarriesAmenitiesAndDistance`, `VenueListControllerIT.listCarriesAmenitiesAndDistance`.
- [ ] **AC-3 (absent renders as nothing):** Given a venue with no amenities and null distance (today's seed data),
  when the read APIs are called, then `amenities` is `[]` and `distanceToWaterM` is `null` — the existing card/map
  JSON is otherwise unchanged. *Pinned by:* `VenueReadControllerIT.absentAmenitiesAreEmptyAndNullDistance`.
- [ ] **AC-4 (edit is venue-scoped, non-owner → 403):** Given operator B who does **not** own venue V, when B calls
  `PATCH /api/venues/{V}` with any body, then `403 NOT_VENUE_OWNER` and no write occurs; the owner is not forbidden.
  *Pinned by:* `CrossVenueDenialIT.venueProfileEditByNonOwnerIs403` + `VenueAdminServiceTest.profileEditByANonOwnerIsDeniedBeforeAnyWrite`.
- [ ] **AC-5 (edit round-trips):** Given owner A of venue V, when A `PATCH`es `{ "amenities": ["BEACH_BAR","WIFI"],
  "distanceToWaterM": 20 }`, then `204`, and a subsequent `GET /api/venues/{V}` returns exactly those amenities
  (catalogue-ordered) and `distanceToWaterM = 20`; a second PATCH **replaces** the set. *Pinned by:*
  `VenueAdminControllerIT.profileEditRoundTripsThroughReadApi`.
- [ ] **AC-6 (unknown code / bad distance → 400):** Given owner A, when A PATCHes an unknown amenity code, or a
  non-positive/non-integer `distanceToWaterM`, then `400 INVALID_REQUEST` (RFC-7807 `ProblemDetail`) and no write.
  *Pinned by:* `VenueAdminControllerIT.unknownAmenityCodeIs400`, `.nonPositiveDistanceIs400`.
- [ ] **AC-7 (Discover card ≤3 + to-water):** Given a venue with >3 amenities and a distance, when the Discover card
  renders, then it shows the **first 3 in catalogue order** as chips plus a `"Xm to water"` chip; the chip text is
  reflected in the card's accessible name (`cardLabel`). *Pinned by:* `home.spec.ts` (`renders ≤3 amenity chips …`,
  inverting the current empty-slot guard) + `discovery-flow.e2e.ts`.
- [ ] **AC-8 (map header full row):** Given the same venue, when the beach-map header renders, then it shows **all**
  amenities (catalogue order) + the to-water chip, visible and accessible. *Pinned by:* `venue-map.spec.ts`
  (`renders the full amenity row + to-water`) + `discovery-flow.e2e.ts`.
- [ ] **AC-9 (chip AA both themes):** Given the amenity + to-water chip tokens, when composited, then ink meets WCAG
  AA (≥4.5:1) on its fill in both `riviera` and `porcelain`. *Pinned by:* `shared/amenities.contrast.spec.ts`.
- [ ] **AC-10 (operator save path, real backend):** Given an operator signed into the editor, when they toggle
  amenity chips + enter metres and save, then `PATCH /api/venues/{id}` persists, and navigating to `/venues/{id}`
  shows the chips. *Pinned by:* `frontend/e2e/real-backend/venue-editor.e2e.ts` (`sets commodities → tourist sees chips`).
- [ ] **AC-11 (coverage):** New-code coverage ≥ 80% (Sonar gate).

## Non-goals

- **Amenity filtering on Discover.** The join table *enables* it; no filter UI/endpoint ships here (a follow-up).
- **Venue photos** (deferred → #142); the operator "Photos" design section is not built here.
- **Glass-restyling the venue-editor.** It stays `legacySurface` (operator epic #141 restyles it) — the Commodities
  section uses the editor's *current* `--editor-*` tokens, not the glass mixins.
- **Setting amenities at venue-create time.** Amenities/metres are an **edit** operation (`PATCH`), not part of
  `CreateVenueRequest` — create has no ownership check (creator-owns deferred to #74); the AC requires the 403-checked edit path.
- **Amenity icons.** Text pill chips only (design shows text); an icon per code is a later polish.
- **The Find-a-booking nav / T8** (#148) — separate slice.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `V21` collides with a parallel slice's migration | low | high | Confirmed at grill: V20 is main's top, **no open PRs** claim V21. Whoever merges second renumbers. | Ivo | open |
| R-2 | Adding fields to `VenueSummaryView`/`VenueMapView` breaks a sibling consumer | low | med | Siblings consume `SetBookingFacts`/`VenueRates`, **not** the tourist read views (recon §7); additions are additive; `ModularityTests` + the read ITs guard. | agent | open |
| R-3 | Non-owner can edit amenities (BOLA, invariant #13) | med | high | `ownership.assertOwns(operator, VenueRef)` is **line 1** of the new service method (mirrors `addSet`); pinned by `CrossVenueDenialIT` + `VenueAdminServiceTest`. RV-BE-9 Blocker. | agent | open |
| R-4 | Off-catalogue amenity persisted | med | med | Two layers: DB `CHECK (amenity IN (…11…))` **and** app `Amenity.valueOf(code)` at the DTO edge → `400`. | agent | open |
| R-5 | Discover card a11y: chips are in `aria-hidden` inner content | med | med | The chip text is folded into `cardLabel()` (the card's `aria-label`), like the rest of the card; axe in the e2e. | agent | open |
| R-6 | `css:S7924` false-positive on translucent chips at the Sonar gate | med | low | Chips use **solid opaque fills** (the `status-chip` treatment), not rgba-over-glass; proven AA in a dedicated contrast spec. | agent | open |
| R-7 | Editor amenity model drifts from the re-read venue after save | low | med | Editable set is a `linkedSignal` seeded from `venue().amenities`; `safeReload()` after PATCH re-seeds. | agent | open |

## Open questions / Assumptions

> Work is NOT done while this has unresolved entries.

### Resolved

- **Amenity catalogue** — the **11-tag tourist-v3 / issue-#140 list** (operator-console-v2's "Sunset view"
  dropped). Codes: `BEACH_BAR, RESTAURANT, CAFE, FREE_PARKING, SHOWERS, WIFI, WATER_SPORTS, PET_FRIENDLY,
  SNACK_SHACK, SNORKELLING, QUIET_BAY`. *(User decision, this session.)*
- **Storage** — a **`venue_amenity` join table** (not `text[]`), to make future amenity-filtering a natural
  indexed query. *(User decision, this session.)*
- **Input model** — **fixed catalogue**; an unknown code is rejected `400`. *(User decision, this session.)*
- **Card display order** — **canonical catalogue order**: the card shows the first 3 present in catalogue order;
  the map header shows all in catalogue order; storage stays an order-insensitive set. *(User decision, this session.)*
- **Wire format** — amenities travel as **stable codes** (enum names), mirrored FE/BE; labels are FE-only.
  *(Architectural, from recon — mirrors `booking-status.ts`.)*
- **Edit seam** — a **new internal `EditVenueProfile` port** + `PATCH /api/venues/{venueId}`, `ownership.assertOwns`
  first; reuse `ChangeOutcome`. *(Architectural, from recon — mirrors `EditBeachMap`.)*

### Assumptions

- **Editor reachability:** the Commodities section renders once a venue is created/loaded in-session (the editor
  has no "load an arbitrary existing venue" flow yet; `venueId()` is set on create). — *Owner:* agent · *Resolves by:* Phase 5.
  Matches the design (Commodities lives in the "Venue details" edit tab) and the current per-set edit flow.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** Amenities + distance-to-water are static venue-**profile** display fields.
No write touches `availability(set_id, booking_date)`; no set is held/claimed; the beach-map *layout* (set positions)
is untouched. The migration adds a `venue_amenity` join table + a `venue` column only. Pool (#3) and cutoff (#4)
rules are unaffected.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` (conceptual: SQL + commands + read views) | Amenities + distance are **venue profile**; `venue` Job (RESPONSIBILITIES.md:73) "Own venue profiles". |

**Module-ownership table (§4a)**

| Capability the slice adds | Owner | Justification |
|---|---|---|
| Store the amenity set + distance-to-water per venue | `venue` | venue Job: "Own venue profiles, the beach map / layout, … pricing …". Not on any other module's **Not-My-Job** (availability = per-date state; booking = bookings; payment = money; payout = ledger; operator = who-owns-whom). |
| Validate amenity codes against the fixed catalogue (unknown → 400) | `venue` | Edge validation at venue's own `adapter/in` DTO + `venue.vocabulary.Amenity`; a venue-profile concern, no cross-module reach. |
| Authorize the venue-profile edit (operator owns `venueId`) | `venue` (check) + `operator` (mapping) | Invariant #13: the **check** runs in venue's application service (`VenueAdminService`), consulting `operator::api VenueOwnership` (id-based). The ownership **mapping** is `operator`'s Job; venue does not own "who owns whom". |

**Cross-module named interfaces (`api/` ports)** — **none added.** `Amenity` enum + the two new read-view fields are
additive to `venue::vocabulary` (already-granted surface; no sibling imports `Amenity`). The `EditVenueProfile` port,
`VenueProfileCommand`, and `UpdateVenueProfileRequest` DTO are **internal** (`application/` + `adapter/in`), like
`EditBeachMap`. No `VenueApiRoleSplitTests` change (no method added to `VenueCatalog`/`SetBookingFacts`/`VenueRates`).

**Domain events** — **none.** No cross-module state change; amenities/distance are display data read synchronously via
the existing `VenueCatalog` port. `N/A — no event in scope`.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves; no ledger effect.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/amenities.ts` + `shared/_glass.scss` (`amenity-chip` mixin) | new | pure vocab + SCSS mixin | — | — |
| FE-2 | `pages/home/home.ts` + `home.html` (Discover card chips) | modify | standalone component | `computed` (≤3 catalogue-ordered + to-water label) | — |
| FE-3 | `venue/venue-map.ts` + `venue-map.html` (map header chips) | modify | standalone component | `computed` (full row + to-water) | — |
| FE-4 | `venue-admin/venue-editor.ts` + `.html` (Commodities section, **legacy** styling) | modify | standalone component | `linkedSignal` (amenity set seeded from `venue()`) + `signal` (metres) | Signal Forms (metres field pattern) |
| FE-5 | `venue/venue.model.ts` | modify | types | — | — |
| FE-6 | `venue-admin/venue-admin.model.ts` + `venue-admin.service.ts` | modify | types + `@Service` | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`, `computed`/`linkedSignal`, native control
flow. Chips are **solid opaque fills** (a distinct pill-tag `amenity-chip` mixin, NOT the `status-chip` mixin).
Discover-card chip text is reflected in `cardLabel()` (inner content is `aria-hidden`); the map header renders chips as
visible+accessible content directly.

## FE↔BE contract

- **New endpoint:** `PATCH /api/venues/{venueId}` — body `{ "amenities": string[] (codes), "distanceToWaterM": number | null }`
  → `204` on success · `403 NOT_VENUE_OWNER` (non-owner) · `404 NO_SUCH_VENUE` · `400 INVALID_REQUEST` (unknown code /
  non-positive / non-integer distance). Authenticated operator surface (session cookie, role `OPERATOR`), ownership-checked.
- **Changed read DTOs (additive):** `GET /api/venues` items (`VenueSummaryView`) **and** `GET /api/venues/{id}`
  (`VenueMapView`) gain `amenities: string[]` (codes, **catalogue-ordered**) + `distanceToWaterM: number | null`.
  Absent → `[]` / `null`.
- **Client typing:** `VenueSummary` + `VenueMapView` gain `readonly amenities: readonly Amenity[]` (+ `distanceToWaterM:
  number | null`), where `Amenity` is the FE string-union mirror in `shared/amenities.ts`. New
  `venueAdmin.updateVenueProfile(venueId, { amenities, distanceToWaterM })`. No `as any`.
- **Codes, not labels, on the wire.** `shared/amenities.ts` owns the FE catalogue (code→label + display order),
  mirroring the BE `venue.vocabulary.Amenity` enum (like `booking-status.ts` mirrors `BookingStatus`).
- **Money/date:** unchanged. `distanceToWaterM` is a plain positive integer (metres), not money.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Migration V21 + migration IT | ✅ | V21 + VenueAmenityMigrationIT (6 constraint tests green) |
| 1 — BE read path (vocabulary + read views + JDBC reads) | ⏳ | |
| 2 — BE edit path (port + service + PATCH + ownership) | | |
| 3 — FE shared amenity-chip recipe | | |
| 4 — FE tourist chips (card + map header) + mocked e2e | | |
| 5 — FE editor Commodities + real-backend e2e | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase's code.

---

## File structure

**Backend**
- `platform/src/main/resources/db/migration/V21__venue_amenities_and_distance.sql` — new: `venue_amenity` join table + `distance_to_water_m` column + CHECKs.
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/Amenity.java` — new: the 11-code enum (declaration order = catalogue order).
- `platform/.../venue/vocabulary/VenueSummaryView.java` · `VenueMapView.java` — modify: add `List<Amenity> amenities` + `Integer distanceToWaterM`.
- `platform/.../venue/adapter/out/JdbcVenueCatalog.java` — modify: read amenities (catalogue-ordered) + distance in `findVenueMap` + `listVenues`.
- `platform/.../venue/application/EditVenueProfile.java` — new: internal port `ChangeOutcome updateProfile(OperatorId, VenueId, VenueProfileCommand)`.
- `platform/.../venue/application/VenueProfileCommand.java` — new: record `(Set<Amenity> amenities, Integer distanceToWaterM)` (validated).
- `platform/.../venue/application/Venues.java` — modify: add `int updateVenueProfile(VenueId, VenueProfileCommand)`.
- `platform/.../venue/application/VenueAdminService.java` — modify: `implements … EditVenueProfile`; `updateProfile` with `assertOwns` first.
- `platform/.../venue/adapter/out/JdbcVenues.java` — modify: `updateVenueProfile` (UPDATE venue distance + replace join rows).
- `platform/.../venue/adapter/in/UpdateVenueProfileRequest.java` — new: DTO with `toCommand()` (parses codes → 400).
- `platform/.../venue/adapter/in/VenueAdminController.java` — modify: `PATCH /api/venues/{venueId}`.

**Backend tests**
- `platform/src/test/java/ai/riviera/platform/venue/VenueAmenityMigrationIT.java` — new (AC-1).
- `VenueReadControllerIT.java` · `VenueListControllerIT.java` — modify (AC-2/3).
- `venue/application/VenueAdminServiceTest.java` — modify (AC-4).
- `venue/VenueAdminControllerIT.java` — modify (AC-5/6).
- `CrossVenueDenialIT.java` — modify (AC-4, 403 matrix).

**Frontend**
- `frontend/src/app/shared/amenities.ts` + `amenities.spec.ts` + `amenities.contrast.spec.ts` — new (FE-1, AC-9).
- `frontend/src/app/shared/_glass.scss` — modify: add `amenity-chip` mixin.
- `frontend/src/app/venue/venue.model.ts` — modify (FE-5).
- `frontend/src/app/pages/home/home.ts` · `home.html` · `home.scss` · `home.spec.ts` — modify (FE-2, AC-7).
- `frontend/src/app/venue/venue-map.ts` · `venue-map.html` · `venue-map.scss` · `venue-map.spec.ts` — modify (FE-3, AC-8).
- `frontend/src/app/venue-admin/venue-admin.model.ts` · `venue-admin.service.ts` — modify (FE-6).
- `frontend/src/app/venue-admin/venue-editor.ts` · `.html` · `.scss` · `.spec.ts` — modify (FE-4, AC-10).
- `frontend/e2e/discovery-flow.e2e.ts` — modify: fixtures + chip assertions (mocked, AC-7/8).
- `frontend/e2e/real-backend/venue-editor.e2e.ts` — modify: commodities save → read-back (AC-10).

---

## Phase 0 — Migration V21 + migration IT

**Files:** Create `V21__venue_amenities_and_distance.sql` · Test `VenueAmenityMigrationIT.java`

- [ ] **Step 1: Write the failing test** — `VenueAmenityMigrationIT` (Testcontainers, `@EnabledIfDockerAvailable`):
  inserting an off-catalogue amenity throws (CHECK); `distance_to_water_m = 0` throws (CHECK); duplicate
  `(venue_id, amenity)` throws (PK); `DELETE FROM venue WHERE id=…` removes the venue's `venue_amenity` rows (cascade).
- [ ] **Step 2: Verify it fails** — `./gradlew test --tests "*VenueAmenityMigrationIT*"` → FAIL (relation `venue_amenity` does not exist).
- [ ] **Step 3: Minimal implementation** — V21:

```sql
-- V21: venue amenities (fixed catalogue, order-insensitive) + optional distance to water (metres).
ALTER TABLE venue
    ADD COLUMN distance_to_water_m INTEGER
        CONSTRAINT venue_distance_to_water_positive
        CHECK (distance_to_water_m IS NULL OR distance_to_water_m > 0);

CREATE TABLE venue_amenity (
    venue_id BIGINT NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    amenity  TEXT   NOT NULL
        CONSTRAINT venue_amenity_catalogue_check
        CHECK (amenity IN ('BEACH_BAR', 'RESTAURANT', 'CAFE', 'FREE_PARKING', 'SHOWERS',
                           'WIFI', 'WATER_SPORTS', 'PET_FRIENDLY', 'SNACK_SHACK',
                           'SNORKELLING', 'QUIET_BAY')),
    PRIMARY KEY (venue_id, amenity)
);
-- The composite PK's leading column (venue_id) indexes the FK lookup + the IN (…) list read; no separate index needed.
```

- [ ] **Step 4: Verify it passes** — `./gradlew test --tests "*VenueAmenityMigrationIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — search other migrations for a `text[]`-vs-join precedent; record decision (join, per user).
- [ ] **Step 6: Commit** — `git commit -m "feat(db): V21 venue_amenity join table + distance_to_water_m (#140)"`
- [ ] **Step 7: Update execution status.**

## Phase 1 — BE read path (vocabulary + read views + JDBC reads)

**Files:** Create `Amenity.java` · Modify `VenueSummaryView.java`, `VenueMapView.java`, `JdbcVenueCatalog.java` ·
Test `VenueReadControllerIT`, `VenueListControllerIT`

- [ ] **Step 1: Failing tests** — `VenueReadControllerIT.detailCarriesAmenitiesAndDistance` (seed a venue with
  `{BEACH_BAR, FREE_PARKING, SHOWERS}` + distance 15 → assert `$.amenities` `["BEACH_BAR","FREE_PARKING","SHOWERS"]`
  catalogue-ordered + `$.distanceToWaterM == 15`), `.absentAmenitiesAreEmptyAndNullDistance` (existing seed → `$.amenities == []`,
  `$.distanceToWaterM` null), and `VenueListControllerIT.listCarriesAmenitiesAndDistance`.
- [ ] **Step 2: Verify fail** — `./gradlew test --tests "*VenueReadControllerIT*"` → FAIL (no such field).
- [ ] **Step 3: Implement** — `Amenity` enum (declaration order = catalogue order):

```java
package ai.riviera.platform.venue.vocabulary;

/** The fixed platform amenity catalogue (issue #140). Enum declaration order IS the canonical
 *  display/priority order — the Discover card shows the first N in this order. The wire code is the
 *  enum name; display labels are the frontend's concern (shared/amenities.ts mirrors this). */
public enum Amenity {
    BEACH_BAR, RESTAURANT, CAFE, FREE_PARKING, SHOWERS, WIFI,
    WATER_SPORTS, PET_FRIENDLY, SNACK_SHACK, SNORKELLING, QUIET_BAY
}
```

  Add to both views: `VenueMapView(… , List<Amenity> amenities, Integer distanceToWaterM, List<SetView> sets)` and
  `VenueSummaryView(… , List<Amenity> amenities, Integer distanceToWaterM, … availability)`. In `JdbcVenueCatalog`:
  `findVenueMap` adds `distance_to_water_m` to the venue SELECT and a second query
  `SELECT amenity FROM venue_amenity WHERE venue_id = :id` → `List<Amenity>` sorted by `Amenity.valueOf(code)` ordinal;
  `listVenues` adds `distance_to_water_m` to the summary SELECT and one batched
  `SELECT venue_id, amenity FROM venue_amenity WHERE venue_id IN (:ids)` grouped in memory, each list catalogue-sorted.
- [ ] **Step 4: Verify pass** — `./gradlew test --tests "*VenueReadControllerIT*" --tests "*VenueListControllerIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — both read paths (detail + list) must carry the fields; confirm no third read path.
- [ ] **Step 6: Commit** — `feat(venue): amenities + distance on the venue read views (#140)`
- [ ] **Step 7: Update status.**

## Phase 2 — BE edit path (port + service + PATCH + ownership)

**Files:** Create `EditVenueProfile.java`, `VenueProfileCommand.java`, `UpdateVenueProfileRequest.java` ·
Modify `Venues.java`, `VenueAdminService.java`, `JdbcVenues.java`, `VenueAdminController.java` ·
Test `VenueAdminServiceTest`, `VenueAdminControllerIT`, `CrossVenueDenialIT`

- [ ] **Step 1: Failing tests** — `VenueAdminServiceTest.profileEditByANonOwnerIsDeniedBeforeAnyWrite`
  (FakeOwnership denies → `assertThrows(NotVenueOwnerException)` + fake `Venues` records **no** write) and
  `.profileEditByOwnerReplacesAmenitiesAndDistance`; `VenueAdminControllerIT.profileEditRoundTripsThroughReadApi`,
  `.unknownAmenityCodeIs400`, `.nonPositiveDistanceIs400`; `CrossVenueDenialIT.venueProfileEditByNonOwnerIs403`
  (+ owner-not-forbidden) — modelled on `beachMapEditByNonOwnerIs403`.
- [ ] **Step 2: Verify fail** — `./gradlew test --tests "*VenueAdminServiceTest*"` → FAIL.
- [ ] **Step 3: Implement** — command with edge/domain validation, port, service, JDBC, controller:

```java
// application/VenueProfileCommand.java
public record VenueProfileCommand(Set<Amenity> amenities, Integer distanceToWaterM) {
    public VenueProfileCommand {
        amenities = amenities == null ? Set.of() : Set.copyOf(amenities);
        if (distanceToWaterM != null && distanceToWaterM <= 0) {
            throw new IllegalArgumentException("distanceToWaterM must be a positive integer");
        }
    }
}

// application/EditVenueProfile.java  (internal port, NOT api/)
public interface EditVenueProfile {
    ChangeOutcome updateProfile(OperatorId operator, VenueId venueId, VenueProfileCommand command);
}

// adapter/in/UpdateVenueProfileRequest.java  (edge parse → 400 via ApiErrorHandler)
public record UpdateVenueProfileRequest(List<String> amenities, Integer distanceToWaterM) {
    VenueProfileCommand toCommand() {
        Set<Amenity> parsed = (amenities == null ? List.<String>of() : amenities).stream()
                .map(UpdateVenueProfileRequest::parse)      // unknown code → IllegalArgumentException → 400
                .collect(Collectors.toUnmodifiableSet());
        return new VenueProfileCommand(parsed, distanceToWaterM);
    }
    private static Amenity parse(String code) {
        try { return Amenity.valueOf(code); }
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Unknown amenity: " + code); }
    }
}
```

  `VenueAdminService implements OnboardVenue, EditBeachMap, EditVenueProfile`; `updateProfile`:
  `ownership.assertOwns(operator, new VenueRef(venueId.value()))` **first**, then
  `int rows = venues.updateVenueProfile(venueId, command); return rows == 0 ? new ChangeOutcome.Rejected(SetRejection.NO_SUCH_VENUE) : ChangeOutcome.Applied.APPLIED;`
  `@Transactional`. `JdbcVenues.updateVenueProfile`: `UPDATE venue SET distance_to_water_m = :d WHERE id = :vid`
  (rows affected); if 0 → return 0; else `DELETE FROM venue_amenity WHERE venue_id = :vid` + batch INSERT the codes.
  Controller: `@PatchMapping("/{venueId}")` resolves `currentOperator.require(authentication)` → `editVenueProfile.updateProfile(...)`
  → reuse `toResponse(ChangeOutcome)` (Applied → 204, Rejected(NO_SUCH_VENUE) → 404).
- [ ] **Step 4: Verify pass** — `./gradlew test --tests "*VenueAdminServiceTest*" --tests "*VenueAdminControllerIT*" --tests "*CrossVenueDenialIT*" --tests "*ModularityTests*"` → PASS.
- [ ] **Step 5: Generalization-audit** — confirm every venue-scoped write asserts ownership first (grep `assertOwns`); the new method matches.
- [ ] **Step 6: Commit** — `feat(venue): PATCH /api/venues/{id} profile edit (amenities+distance), ownership-checked (#140)`
- [ ] **Step 7: Update status.**

## Phase 3 — FE shared amenity-chip recipe

**Files:** Create `shared/amenities.ts`, `amenities.spec.ts`, `amenities.contrast.spec.ts` · Modify `shared/_glass.scss`

- [ ] **Step 1: Failing tests** — `amenities.spec.ts`: `AMENITY_CATALOGUE` is the 11 codes in order; `labelFor('FREE_PARKING') === 'Free parking'`;
  `orderedAmenities(['WIFI','BEACH_BAR'])` returns catalogue order `['BEACH_BAR','WIFI']`; `distanceToWaterLabel(15) === '15m to water'`,
  `distanceToWaterLabel(null) === undefined`. `amenities.contrast.spec.ts`: chip ink meets `AA_NORMAL` on its fill (mirror `booking-status.contrast.spec.ts`).
- [ ] **Step 2: Verify fail** — `npm test -- --include='**/amenities.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** — `shared/amenities.ts`: the `Amenity` string union (mirror of the BE enum), `AMENITY_CATALOGUE`
  (ordered), `AMENITY_LABELS` (code→display label), `labelFor`, `orderedAmenities(codes)` (filter to catalogue order),
  `distanceToWaterLabel(m: number | null)`. `_glass.scss` `amenity-chip` mixin — a **distinct** solid-fill pill (neutral
  tag + an accent to-water variant), AA-proven; imported by pages via `@use '../shared/glass' as glass; @include glass.amenity-chip;`.
- [ ] **Step 4: Verify pass** — `npm test -- --include='**/amenities*.spec.ts'` → PASS.
- [ ] **Step 5: Generalization-audit** — this is consumed by 3 sites (card, map, editor state) — the rule-of-three extraction; record it.
- [ ] **Step 6: Commit** — `feat(fe): shared amenity-chip recipe (catalogue + labels + mixin) (#140)`
- [ ] **Step 7: Update status.**

## Phase 4 — FE tourist chips (card + map header) + mocked e2e

**Files:** Modify `venue.model.ts`, `home.ts/.html/.scss/.spec.ts`, `venue-map.ts/.html/.scss/.spec.ts`, `discovery-flow.e2e.ts`

- [ ] **Step 1: Failing tests** — invert `home.spec.ts:202` to `renders ≤3 amenity chips (catalogue order) + a to-water chip`
  and assert the chip text appears in `cardLabel`; `venue-map.spec.ts` `renders the full amenity row + to-water`;
  extend `home.contrast.spec.ts`/`venue-map.contrast.spec.ts` only if a page-glass-dependent token is introduced (it isn't — solid fills).
- [ ] **Step 2: Verify fail** — `npm test -- --include='**/home.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** — `venue.model.ts`: `VenueSummary` + `VenueMapView` gain `readonly amenities: readonly Amenity[]`
  + `readonly distanceToWaterM: number | null`. `home.ts`: a `cardAmenities(venue)` computed = `orderedAmenities(venue.amenities).slice(0,3)`
  + a `toWater(venue)` label; fold both into `cardLabel(venue)`. Fill `home.html` `.card-chips` slot with the to-water chip
  (`@if (toWater(venue))`) + `@for` chips. `venue-map.ts`/`.html`: full `orderedAmenities(v.amenities)` + to-water in `.head-chips`
  (visible+accessible). `@use` the `amenity-chip` mixin in both scss.
- [ ] **Step 4: Verify pass** — `npm test -- --include='**/home*.spec.ts' --include='**/venue-map*.spec.ts'` → PASS.
- [ ] **Step 5: mocked e2e** — extend `discovery-flow.e2e.ts` VENUES/VENUE_MAP fixtures with amenities + distance; assert
  `card-chips` shows ≤3 + `"15m to water"`, `venue-chips` shows the full row; axe at each state.
- [ ] **Step 6: Commit** — `feat(fe): amenity + to-water chips on Discover cards + beach-map header (#140)`
- [ ] **Step 7: Update status.**

## Phase 5 — FE editor Commodities + real-backend e2e

**Files:** Modify `venue-admin.model.ts`, `venue-admin.service.ts`, `venue-editor.ts/.html/.scss/.spec.ts`, `real-backend/venue-editor.e2e.ts`

- [ ] **Step 1: Failing tests** — `venue-editor.spec.ts`: once a venue is loaded, toggling an amenity chip + entering metres
  + save calls `admin.updateVenueProfile(venueId, { amenities: [...], distanceToWaterM })` then re-reads; the working set seeds
  from `venue().amenities`; an invalid metres value shows the edge error.
- [ ] **Step 2: Verify fail** — `npm test -- --include='**/venue-editor.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** — `venue-admin.model.ts`: `UpdateVenueProfileRequest { amenities: string[]; distanceToWaterM: number | null }`.
  `venue-admin.service.ts`: `updateVenueProfile(venueId, req): Observable<void>` (PATCH `/api/venues/{venueId}`), plus map any new error code.
  `venue-editor.ts`: `amenitySet = linkedSignal(() => new Set(this.venue()?.amenities ?? []))`, a `distanceModel` signal (string),
  `onToggleAmenity(code)` (flip local set), `onSaveCommodities()` (parse metres via `parseWholeNumber`; PATCH; `safeReload`).
  `venue-editor.html`: a "Commodities" section (chip toggle buttons over `AMENITY_CATALOGUE`, active/inactive styles from the
  **editor's** `--editor-*` tokens; a metres field like `commissionBps`) — rendered `@if (venue())`.
- [ ] **Step 4: Verify pass** — `npm test -- --include='**/venue-editor*.spec.ts'` → PASS.
- [ ] **Step 5: real-backend e2e** — extend `real-backend/venue-editor.e2e.ts`: after create, toggle amenity chips + fill metres +
  save, navigate `/venues/{id}`, assert `venue-chips` shows the persisted amenities + to-water (template: the "round-trips a
  laid-out map" test).
- [ ] **Step 6: Commit** — `feat(fe): venue-editor Commodities (amenity toggles + metres), PATCH profile (#140)`
- [ ] **Step 7: Update status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..6 (BE):** `./gradlew test --tests "*VenueAmenity*" --tests "*VenueRead*" --tests "*VenueList*" --tests "*VenueAdmin*" --tests "*CrossVenueDenialIT*" --tests "*Modularity*"` → all green (CI runs the full suite).
- [ ] **AC-7..9 (FE unit/contrast):** `npm test` → green (home, venue-map, amenities, editor specs).
- [ ] **AC-7/8 (mocked e2e):** `npm run test:e2e:a11y` → discovery-flow chip assertions + axe green.
- [ ] **AC-10 (real-backend e2e):** local only, against a running backend — not CI.
- [ ] **AC-11 (coverage):** Sonar new-code coverage ≥ 80% on the PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases (BE `Amenity` ↔ FE `Amenity` union; codes on the wire).
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section: justified N/A (no availability write).
- [ ] **Modulith** section filled; `Amenity`→`vocabulary`, edit port internal in `application/`, no cross-module `application.*`/`adapter.*` import; `ModularityTests` + `PackageShape*` + `PublishedSurfacePlacement*` + `VenueApiRoleSplit*` green.
- [ ] **Payment/payout** N/A.
- [ ] Ownership (#13) checked in the service, non-owner → 403; `CrossVenueDenialIT` extended (RV-BE-9).
- [ ] Flyway V21 present; catalogue + positive-distance CHECKs tested (invariant #12); V21 free on main + unclaimed (confirmed).
- [ ] Error contract: unknown code / bad distance → `400 INVALID_REQUEST` via `ApiErrorHandler` (§6b); no per-controller handler.
- [ ] **Frontend** standards met; no `as any`; Discover chips in `cardLabel` a11y; editor stays `legacySurface`.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions has only the Phase-5 assumption (resolved by build).
- [ ] Close-out: epic #133 T7 ticked; `riviera-docs-freshness` run → RESPONSIBILITIES.md venue-Job + CONTEXT.md glossary updated (amenities, distance-to-water).
