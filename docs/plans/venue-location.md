# Venue location Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A venue carries an optional latitude/longitude pin, owned by `venue`, validated
range-only, readable on the tourist list/map reads and the operator profile, and set, moved or
cleared by its owning operator by hand on the riviera map in the console.

**Architecture:** Location is two nullable decimal-degree columns on `venue` and a
`venue.vocabulary.VenueLocation` value record whose compact constructor is the Java mirror of the
`venue_location_check` CHECK (ADR-0018 §3) — both-present-or-both-absent and the two ranges are
enforced once, in the type, so every surface that carries a location inherits them. No new
endpoint and no new port: location rides the existing profile PATCH under its existing `version`
token and the existing catalogue reads under their existing visibility fence.

**Persistence:** JDBC only (invariant #1). One migration, `V58__venue_location.sql`, adding
`venue.latitude NUMERIC(8,6)` + `venue.longitude NUMERIC(9,6)` + `venue_location_check`. No new
table, no index (the epic's no-PostGIS/no-geo-query decision), no backfill.

**Source of intent:** GitHub issue #1099 (sub-issue of epic #806, whose spec is the issue body of
#806). Blocked-by #1098 — merged to `main` as `ceb53387` (PR #1102), verified at plan time.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
map-engine seam has no draggable marker, no drag event and no map-click event, so "reuse the seam"
is a seam *extension*; and that `toProfileUpdate` is a second writer to the profile PATCH) ·
`riviera-plan-doc` (this template — forced the module-ownership table, the seam per AC, and the
behavior-parity ledger judgement) · `tdd` (every phase red-first at the seams named below) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(**ran** over `origin/main..HEAD` — 5 staleness findings + 3 judgement calls, all patched in this PR) ·
`riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped `--tests` runs, `PW_CHROMIUM_EXECUTABLE`
for the mocked e2e; unshallowed the clone before any history claim) · `postgres` (NUMERIC over
float for an exact decimal-degree bound; `(a IS NULL) = (b IS NULL)` for both-or-neither, which is
two-valued and never NULL; no index — the epic's no-geo-query decision) · `riviera-modulith`
(`VenueLocation` belongs in `venue.vocabulary` because published read models carry it; no
`allowedDependencies` change — `operator::api` is already granted) · `riviera-java-conventions`
(validation in the compact canonical constructor; `InvalidApiRequestException.parsing` as the only
route to a 400; no Bean Validation) · `codebase-design` (rejected a `VenueLocations` port — one
writer, one row, the profile PATCH already owns it) · `domain-modeling` (confirmed `CONTEXT.md`'s
**venue location** entry against the shipped contract) · `riviera-frontend` (the pin placer is an
`operator/` field component beside `booking-mode-field.ts`; the map engine stays in `shared/`) ·
`angular-developer` + angular-cli MCP (signal `input()`/`output()`, Signal Forms, `effect` for the
marker sync) · `riviera-tailwind` (token-first map chrome, the 44px floor on the clear action) ·
`playwright-cli` (the mocked suite, `console-dark` double opt-in: file membership **and** a
`dark console` title; the review round added the keyboard and pin-tap legs) · `code-review` +
`riviera-review-overlay` (the review gate over `45e3ff1d..2db59dfe` — four Major findings, all
fixed and pinned; registers below) · `angular-developer` + the angular-cli MCP and the Tailwind v4
docs (verified the v22 signal APIs — `viewChild.required` timing, `model()` two-way onto a plain
`signal`, signal writes in `effect`, `OutputRef.subscribe` — and that `aria-disabled:`,
`size-11` = 44 px, `touch-manipulation` and the `classList.toggle`'d `cursor-grab` all survive v4's
source detection, proven by compiling the real stylesheet; the pass also caught F-15).

**Branch:** `claude/eloquent-meitner-hf4m23` — the cloud session's designated remote branch stands
in for `feature/venue-location` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the V58 migration has run, when a `venue` row is written with exactly one of
  `latitude`/`longitude`, then Postgres rejects it naming `venue_location_check`; both-absent and
  both-present-in-range are accepted, and every pre-existing venue reads both-null.
  *Seam:* the `venue` table under Flyway · *Pinned by:*
  `VenueLocationMigrationIT.checkRefusesAHalfPresentPair` / `.theBoundsThemselvesAreAccepted` / `.aWholePairInRangeIsAcceptedAndReadsBackAtSixDecimals` / `.existingVenuesCarryNoLocation`
- [ ] **AC-2:** Given the V58 migration has run, when a latitude outside −90…90 or a longitude
  outside −180…180 is written, then Postgres rejects it naming `venue_location_check`.
  *Seam:* the `venue` table under Flyway · *Pinned by:*
  `VenueLocationMigrationIT.checkRefusesALatitudeOutOfRange` / `.checkRefusesALongitudeOutOfRange`
- [ ] **AC-3:** Given a `VenueLocation` is constructed, when either coordinate is null or out of
  range, then it throws; when both are in range, it normalizes to scale 6 so a saved value equals
  the value read back. *Seam:* `venue.vocabulary.VenueLocation` (the published value type) ·
  *Pinned by:* `VenueLocationTest.eitherCoordinateAloneIsRefused` / `.aCoordinateOutOfRangeIsRefused` / `.theBoundsThemselvesAreInRange` / `.bothCoordinatesAreNormalisedToSixDecimals`, plus `VenueProfileCommandTest.aNullLocationIsAllowedAndMeansNoPin` / `.anOffShapeLocationIsRejectedByItsOwnType`
- [ ] **AC-4:** Given an operator owns a venue, when they PATCH the profile with a `location`, then
  `EditVenueProfile#updateProfile` answers `APPLIED` and a subsequent `ViewVenueProfile#profileFor`
  carries that location; when they PATCH with `location: null`, the profile reads back with none.
  *Seam:* `venue.application.EditVenueProfile` / `ViewVenueProfile` (the inner hexagon) ·
  *Pinned by:* `VenueAdminServiceTest.profileEditSetsAndThenClearsTheVenueLocation` (and end-to-end at the HTTP seam by `VenueAdminControllerIT.locationEditSetsAndThenClearsThePin`)
- [ ] **AC-5:** Given an operator who does **not** own the venue, when they PATCH a location, then
  ownership is asserted before any read or write and the request answers `403` (invariant #13).
  *Seam:* `PATCH /api/venues/{venueId}` · *Pinned by:*
  `VenueAdminControllerIT.locationEditUnownedVenueIs403`
- [ ] **AC-6:** Given an owning operator, when the PATCH body carries a half-present pair or an
  out-of-range coordinate, then the response is `400 application/problem+json` with
  `code = INVALID_REQUEST`; when it carries a stale `expectedVersion`, the response is still
  `409 STALE_WRITE`. *Seam:* `PATCH /api/venues/{venueId}` · *Pinned by:*
  `VenueAdminControllerIT.halfPresentLocationIs400` / `.outOfRangeLocationIs400` /
  `.staleLocationEditIs409`
- [ ] **AC-7:** Given a pinned and an unpinned venue, when a tourist reads the venue list and the
  venue map read, then the pinned venue carries `location.latitude`/`location.longitude` and the
  unpinned one carries `location: null` on both surfaces, and both remain listed.
  *Seam:* `GET /api/venues` and `GET /api/venues/{venueId}` · *Pinned by:*
  `VenueListControllerIT.theListCarriesAPinnedVenuesLocationAndNullForAnUnpinnedOne` and
  `VenueReadControllerIT.theVenueReadCarriesTheLocationAndNullWhenUnpinned`
- [ ] **AC-8:** Given a map handle with a draggable marker, when the marker is dragged, then the
  registered drag-end handler receives the marker id and the new `LngLat`; when the map surface is
  clicked, the registered click handler receives the clicked `LngLat`; and moving a marker keeps
  the same element (no destroy/recreate). *Seam:* the `MapHandle` seam (`shared/map-engine.ts`) ·
  *Pinned by:* `fake-map-engine.spec.ts` › `reports a drag-end with the marker id and its new position` /
  `turns a click on its surface into a map click inside the bounds` / `records whether a marker is
  draggable and moves one in place` / `puts the marker element on its surface and takes it off again` /
  `stops reporting clicks and drags once destroyed`
- [ ] **AC-9:** Given `RivieraMap` with `pinDraggable` armed, when a `pin` input is set, changed or
  cleared, then exactly one marker is fed to the handle, moved in place, and removed — and a map
  click or a marker drag-end emits `mapClick` / `pinMoved` with the position.
  *Seam:* the `app-riviera-map` component API · *Pinned by:* `riviera-map.spec.ts` › `feeds one labelled,
  draggable marker for the pin` / `feeds no marker when there is no pin` / `moves the marker in place
  when the pin changes, keeping its element` / `removes the marker when the pin is cleared` / `emits
  mapClick with the clicked position` / `emits pinMoved when the marker is dragged` / `takes a caller
  camera over the riviera default`
- [ ] **AC-10:** Given the operator's Venue tab for an unpinned venue, when the operator clicks the
  map, then a pin appears and the read-only coordinate read-out shows it; when they use Clear, the
  pin and the read-out go; and in both cases the tab's existing save sends the profile PATCH with
  the new `location` and the existing `expectedVersion`.
  *Seam:* the `app-venue-location-field` component API and `OperatorConsoleService#updateVenueProfile` ·
  *Pinned by:* `venue-location-field.spec.ts` › `drops a pin where the map was clicked and reads the
  coordinates back` / `follows the pin when it is dragged` / `clears the pin and tells the map to drop
  its marker` / `rounds what it stores to the six decimals the server keeps` / `keeps the read-out
  announced but never editable`, and `venue-tab.spec.ts` › `sends the pin the placer holds with the
  rest of the profile (#1099)` / `clears the pin through the same save (#1099)`
- [ ] **AC-11:** Given a venue with a location, when `toProfileUpdate` maps the loaded profile to a
  write body (the read-modify-write behind "Close online sales now"), then the location survives the
  round-trip. *Seam:* `operator-console.model.ts`'s `toProfileUpdate` ·
  *Pinned by:* `operator-console.model.spec.ts` › `carries the venue location through the full-replace body` /
  `carries no location for an unpinned venue`
- [ ] **AC-13:** Given an operator using only a keyboard, when they focus *Place pin at map centre*
  and press Enter, then the venue is pinned at the camera's centre; and clearing never disables the
  control that was pressed. *Seam:* the `app-venue-location-field` component API and the operator
  console over a mocked `/api` · *Pinned by:* `venue-location-field.spec.ts` › `places the pin at the
  map centre without a pointer` / `moves an existing pin to the map centre rather than refusing` /
  `never disables the control it was pressed on, so focus is not stranded`, and
  `operator-venue-location.e2e.ts` › `places and clears the pin from the keyboard alone, and saves it`
- [ ] **AC-14:** Given a pinned venue, when the operator taps the pin itself, then the venue does not
  move — the marker sits inside the surface the engine reads clicks from, and a tap on it is a grab,
  not a new position. *Seam:* the `app-venue-location-field` component API ·
  *Pinned by:* `venue-location-field.spec.ts` › `does not move the venue when the pin itself is
  tapped`, and `operator-venue-location.e2e.ts` › `does not move the venue when the pin itself is tapped`
- [ ] **AC-15:** Given a saved profile, when the operator then edits the pin, then the "Saved" notice
  goes — the pin is a draft with no handler of its own, so it joins the notice-clearing effect.
  *Seam:* the `app-venue-tab` component API · *Pinned by:* `venue-tab.spec.ts` › `drops the stale
  Saved notice when the pin is edited after a save (#1099)`
- [ ] **AC-12:** Given the mocked operator console, when the operator drops a pin, saves and
  reloads, then the pin is where it was left; when they clear, save and reload, there is no pin —
  and both run green under the `console-dark` project with axe, contrast and touch-target checks
  passing. *Seam:* the operator console over a mocked `/api` (Playwright) ·
  *Pinned by:* `frontend/e2e/operator-venue-location.e2e.ts` › `drops a pin, saves it, and finds it where it
  was left after a reload (+ axe)` / `clears the pin, saves, and reloads with the venue unpinned` /
  `paints the pin placer under porcelain and the dark console (#1099, + axe)`

## Non-goals

- **No tourist map pins.** The Discover map still renders no venue markers — that is #1101. This
  slice only puts `location` on the wire so #1101 can consume it.
- **No "near me" / geolocation** (#1100), no proximity sort, no distance arithmetic.
- **No new endpoint**, no `location`-only resource, no bulk pin import, no backfill.
- **No geocoding, address fields, PostGIS, spatial index, or geo-fence to a bounding box** — the
  epic's locked decisions; server validation is range-only.
- **Venue onboarding does not accept a location.** `CreateVenueRequest`/`NewVenueCommand` are
  untouched; a new venue is unpinned and the operator places the pin in the Venue tab.
- **No manual coordinate entry.** The read-out beside the map is read-only by AC; the pin is placed
  by hand on the map.
- **No multi-marker input on `RivieraMap`.** One optional `pin`, because that is what this slice
  needs; #1101 generalizes with its own evidence rather than this plan guessing its shape.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` Every surface this slice touches is widened, not retired:
the profile PATCH keeps all existing fields and semantics, the catalogue reads keep their shape and
their visibility fence, and `RivieraMap` keeps its current zero-argument usage working (`pin`
defaults to `null` and `pinDraggable` to `false`, so Discover's `<app-riviera-map />` is unchanged).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **`V58` collides with another branch's migration.** | low | high | Verified free on `main` (highest is `V57`) and unclaimed by every remote branch (`git ls-tree` sweep over all of `origin/*`; the one open PR, #1093, is a Dependabot npm bump with no migration). **This branch renumbers if it merges second** (the default in `riviera-sdlc`'s intake gate), which means a merge-from-main before ready-for-review and a rename of the file + the IT's constraint assertions. | this branch | open |
| R-2 | **`toProfileUpdate` silently clears the pin.** `closeOnlineSalesNow` (the daily view's "close online sales now" kill switch) does a read-modify-write through `toProfileUpdate`; the PATCH is a full replace, so a field missing from that mapper is written as null. | high if unguarded | high — an operator loses their pin by using an unrelated button | Add `location` to `VenueProfileUpdate` **and** `toProfileUpdate`, pinned by AC-11 as its own spec rather than left to the tab's own save path. | this branch | open |
| R-3 | **The map-engine seam cannot express a pin placer.** `MapMarker` has no `draggable`, `MapEventName` is only `load`/`error`, `on()`'s handler takes no payload so it cannot carry an `LngLat`, there is no map-click hook, and `addMarker` is a destructive remove-then-add upsert that would break a drag mid-gesture and drop the element's listeners. | certain | med — the slice is a seam change, not pure reuse | Extend the seam minimally and engine-agnostically: `draggable?` on `MapMarker`, plus `moveMarker(id, lngLat)`, `onMapClick(h)` and `onMarkerDragEnd(h)` on `MapHandle`. Both adapters implement them; the fake gains a `dragMarkerTo` driver for specs and translates a real DOM click on its stamped surface into a map click so the e2e is a genuine gesture. | this branch | open |
| R-4 | **Coordinate round-trip drift.** A `double` or an unnormalized `BigDecimal` makes "the pin is where it was left" assert against a value that differs in the last places, and `BigDecimal.equals` is scale-sensitive. | med | med — flaky ACs, a pin that appears to move on reload | `NUMERIC(8,6)`/`NUMERIC(9,6)` in the DB and `setScale(6, HALF_UP)` in `VenueLocation`'s compact constructor, so the value the server echoes is byte-for-byte the value a re-read returns (AC-3). | this branch | open |
| R-5 | **BOLA on a venue-scoped write** (invariant #13, RV-BE-9). | low | high | Location rides `VenueAdminService#updateProfile`, whose **first** statement is already `ownership.assertOwns(...)` via `operator.api.VenueOwnership`; no new entry point is added, and AC-5 pins the 403-before-read/write ordering. | this branch | open |
| R-6 | **Widening shared test helpers breaks unrelated tests.** `VenueProfileCommand` gains a component, so `VenueProfileConcurrencyIT.command(...)`, `VenueAdminControllerIT.profileBody(...)` and `VenueAdminServiceTest`'s fake `Venues` all stop compiling. | certain | low | Widen each in the same phase as the record; run the venue package's tests, not only the new class. | this branch | open |
| R-7 | **New request/response shape vs. the error contract** (`riviera-java-conventions` §6b). | low | med | No new code and no new handler: a bad location throws `IllegalArgumentException` from `VenueLocation`'s constructor, reaches the wire through the controller's existing `InvalidApiRequestException.parsing(request::toCommand)`, and is rendered by the one `ApiErrorHandler` as `400 INVALID_REQUEST`. AC-6 asserts the shape (`application/problem+json` + `code`), not just the status. | this branch | open |
| R-8 | **The `console-dark` e2e never runs.** That project matches on file membership in `CONSOLE_THEME_FILES` **and** a `dark console` title — satisfying only one silently skips the dark run. | med | low | Do both, and assert the dark-console paint in a test whose title contains `dark console` (AC-12). | this branch | open |

## Open questions / Assumptions

- **Assumption:** the wire shape is a nested, nullable `location: { latitude, longitude }` object on
  all three views and on the PATCH body, not two flat sibling fields — the issue says the views
  "carry a nullable `location`" and the PATCH takes it "as set (both coordinates) or cleared
  (null)", which a nested object expresses structurally; `seasonClosure` is the in-tree precedent
  for a nested nullable object on this exact profile surface. — *Owner:* this branch · *Resolves
  by:* phase 1 (fixed by AC-6/AC-7 once the ITs assert the shape)
- **Assumption:** six decimal places (~0.11 m) is ample precision for a beach venue's pin, so
  `NUMERIC(8,6)`/`NUMERIC(9,6)` costs nothing real and buys an exact, assertable round-trip. —
  *Owner:* this branch · *Resolves by:* phase 0
- **Assumption:** the pin placer needs no `@defer`. The Venue tab is already a lazy route and
  `MapLibreMapEngine` already `import()`s MapLibre and PMTiles inside `create()`, so the heavy
  chunk is fetched only when a map actually boots. Discover's `@defer` exists to let the venue list
  render first; the Venue tab has no such ordering requirement. — *Owner:* this branch ·
  *Resolves by:* phase 5

### Resolved

- **Open question:** is the seam gap in R-3 drift (reconcile here) or fog (escalate to
  `wayfinder`)? — **Resolved at plan time: drift.** The question is sharply stateable and fully
  answerable inside this slice, and #1099 explicitly directs the placer to reuse the riviera-map
  component and the map-engine seam, so extending that seam is the sanctioned reading rather than a
  cross-session decision. Recorded as R-3 with a named minimal extension.
- **Open question:** does `venue` own venue location, or does the map substrate? — **Resolved:
  `venue`.** `RESPONSIBILITIES.md` §`venue` Job covers venue profiles and the epic's implementation
  decisions say so outright; no module's Not-My-Job list claims it (see the module-ownership table).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` This slice writes only the `venue` row's two new columns; it
touches no `availability(set_id, booking_date)` row, no set position, no booking, no hold, and no
claim path. The one concurrency concern is the profile row's own optimistic lock, which is
pre-existing and unchanged: the write is `UPDATE venue SET … , version = version + 1 WHERE id = :id
AND version = :version`, zero rows affected means `STALE_WRITE` → `409`. `VenueProfileConcurrencyIT`
(a `@RepeatedTest(5)` race over that token) keeps proving exactly one writer wins once its command
factory is widened for the new component (R-6), and AC-6 pins that a stale location edit is still a
`409`. Invariants #3 and #4 are untouched — location is not a sales rule and gates nothing.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue` (two new columns) | `venue`'s Job is the venue profile and the catalogue read models; it is the sole writer of the `venue` table and already owns every other optional profile attribute (`distance_to_water_m`, `sales_close`, the season closure). |

No other module's code changes. `operator` is *consulted* through its already-granted `api` port,
not modified. `package-info.java`'s `allowedDependencies` is unchanged — `operator::api` and
`operator::vocabulary` are already listed.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `VenueOwnership#assertOwns(OperatorId, VenueRef)` — **existing, unchanged** | `VenueRef`, `NotVenueOwnerException` | `venue` (`VenueAdminService`, already calls it first) |
| NI-2 | `venue.vocabulary` | **new value type** `VenueLocation(BigDecimal latitude, BigDecimal longitude)` — carried by the existing `VenueSummaryView` and `VenueMapView` | `VenueLocation` | the platform edge (`VenueReadController` returns the views directly) |

No new port is introduced. A `VenueLocations` write port was considered and rejected
(`codebase-design`): there is one writer, one row and one transaction, and the profile PATCH's
existing `Venues#updateVenueProfile` already carries it — a second port would be a hypothetical
seam.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event.` Setting a pin changes no other module's state: `availability`, `booking`,
`payout` and `notification` have no interest in where a venue is, and the tourist surfaces read the
coordinate through the existing catalogue reads rather than a projection. The nine-event inventory
in `CLAUDE.md` is unchanged, so no Flyway `event_type` rewrite is due.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store a venue's lat/lng pin | `venue` | `venue` Job: "Own venue profiles … the beach map / layout … pricing"; it is the `venue` table's sole writer. No module lists venue geography on its Not-My-Job list, and epic #806's implementation decisions state "**The `venue` module owns venue location**". |
| Validate the coordinate pair (both-or-neither, ranges) | `venue` | A bound on `venue`'s own column. It is a *choice* (ADR-0018 §1 — a bound), so it is a rule, and it is pure, so it lives in `domain`/`vocabulary` rather than a service: `venue.vocabulary.VenueLocation`'s compact constructor, the legitimate Java mirror of `venue_location_check` (ADR-0018 §3). `vocabulary`, not `domain`, because published read models carry it across the module boundary. |
| Expose location on the tourist list/map reads | `venue` | `venue` Job: the tourist catalogue reads are its own, visibility-fenced in `JdbcVenueCatalog`. The fence is inherited unchanged — this adds a column to an existing SELECT, not a new read. |
| Decide the operator may set this venue's pin | `operator` (consulted), enforced in `venue` | `venue`'s Not-My-Job: "Deciding *which* venues an operator owns → `operator`". `venue` asks `operator.api.VenueOwnership#assertOwns` as the first statement of the service method (invariant #13); it never reads `operator_venue` itself. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, written, charged, refunded or accrued; no ledger
entry, no commission, no Stripe call. The profile PATCH continues to exclude `commissionBps` and
`payoutCurrency` (invariant #9), and this slice adds no field that could reach them.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/map-engine.ts` | existing | DI-token contract (abstract class + interfaces) | — | — |
| FE-2 | `shared/maplibre-map-engine.ts` | existing | real adapter | — | — |
| FE-3 | `shared/fake-map-engine.ts` | existing | fake adapter (+ spec driver) | — | — |
| FE-4 | `shared/riviera-map.ts` (+ `.html`) | existing | standalone component | Signals: new `options`/`pin`/`pinDraggable`/`pinLabel` `input()`s, `mapClick`/`pinMoved` `output()`s, an `effect` syncing the marker to the handle | — |
| FE-5 | `operator/venue-location-field.ts` | **new** | standalone component | Signals; `location` as a `model()` so the tab two-way binds it | Not a Signal-Form field — a `model()` draft beside the form, the `distanceDraft` precedent |
| FE-6 | `operator/venue-tab.ts` (+ `.html`) | existing | standalone component | new `locationDraft` signal seeded in `seed(profile)`, read in `onSave()` | Signal Forms (unchanged shape) |
| FE-7 | `operator/operator-console.model.ts` | existing | types + mappers | — | — |
| FE-8 | `shared/venue-views.ts` | existing | published API-view vocabulary | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()`
signal APIs. No `standalone: true` and no explicit `OnPush` (both are v22 defaults). The pin marker
element is created by the app (the seam's contract: "the caller owns the element **and** its
accessibility"), so it carries its own accessible name and the 44 px floor via `[appTouchTarget]`.
The Clear control is a `<button>` with `[appBusy]`, never `[disabled]`, and the coordinate read-out
is an `<output aria-live="polite">` — the `layout-last-change` precedent.

## FE↔BE contract

- **New/changed endpoints:** none. Three existing payloads gain one nullable member:
  - `GET /api/venues` (each item) and `GET /api/venues/{venueId}` →
    `"location": { "latitude": 40.146800, "longitude": 19.648200 } | null`
  - `GET /api/venues/{venueId}/profile` → the same member
  - `PATCH /api/venues/{venueId}` body → the same member; **absent or `null` clears the pin**,
    consistent with this PATCH's existing full-replace semantics (a null `amenities` clears them, a
    null `distanceToWaterM` clears the distance).
- **Client typing:** hand-written typed models, extended in place — `VenueLocation` in
  `shared/venue-views.ts` (the published view vocabulary) consumed by `VenueSummary`,
  `VenueMapView`, `VenueProfileView` and `VenueProfileUpdate`. No `as any`.
- **Money/date on the wire:** N/A — this payload carries neither. Coordinates are JSON numbers at
  scale 6 (serialized from `BigDecimal`), never strings.

## Execution status

**Stage pointer:** `implement (phase 7)`

**Next action:** Phase 7 — `RESPONSIBILITIES.md` §`venue` gains the location contract, confirm
`CONTEXT.md`'s entry, then the PR gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V58 migration + migration IT | ✅ | `d1e35001` (plan), `3949b0ea` |
| 1 — `VenueLocation` + profile read/write (command, view, DTOs, `JdbcVenues`) | ✅ | this commit |
| 2 — Tourist read models (`VenueSummaryView`, `VenueMapView`, `JdbcVenueCatalog`) | ✅ | this commit — structural net green |
| 3 — Map-engine seam: draggable marker, `moveMarker`, click + drag-end hooks | ✅ | this commit |
| 4 — `RivieraMap` pin inputs/outputs | ✅ | this commit |
| 5 — Operator pin placer + Venue-tab wiring + FE models | ✅ | this commit |
| 6 — Mocked Playwright e2e (incl. `console-dark`) | ✅ | this commit — 638/638 mocked e2e green, 3215/3215 unit |
| 7 — `RESPONSIBILITIES.md` location contract + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar | `java:S8491` MAJOR — dangling Javadoc at `JdbcVenueCatalog.java:275`: the new `locationOf` helper was inserted between `seasonClosureOf` and its doc comment | fixed — commit *Reattach the doc comments my inserted helpers orphaned* |
| F-5 | review gate (CLAUDE.md pass, confirmed by the overlay pass as RV-FE-9) | **Major** — *Clear pin* bound `[disabled]="!location()"` to its own click, so pressing it disabled the pressed control and stranded focus on `<body>` (WCAG 2.4.3). `check-focus-posture.mjs` is silent here: `!location()` is not in BUSY-1's curated vocabulary | fixed — `aria-disabled` + a no-op `clear()`, pinned by a spec and an e2e `toBeFocused()` leg |
| F-6 | review gate (CLAUDE.md pass, confirmed by the overlay pass as RV-FE-5) | **Major** — no keyboard path existed to place or adjust the pin (pointer click + pointer drag only), and the marker was a focusable `<button>` with no handler, announcing an action it could not perform. WCAG 2.1.1 is Level A; axe cannot see it | fixed — `MapHandle.view()` promoted to the seam, a *Place pin at map centre* button gives the keyboard twin, and the marker became a non-focusable `div role="img"` |
| F-7 | review gate (bug scan, confirmed by the history pass) | **Major** — the marker mounts inside the surface both engines read clicks from, so a tap on the pin bubbled to the map-click handler and re-placed the venue at the pointer: up to ~6 km at the default zoom, then saved. The obvious "grab the pin" gesture corrupted the value | fixed — the marker stops click propagation; pinned by a mutation-probed spec and an e2e leg |
| F-8 | review gate (comment pass, confirmed by the history pass) | **Major** — editing the pin after a save left the "Saved." banner and its live region asserting a pin the server had never seen, the exact "silent lost edit" the effect's own comment exists to prevent. `locationDraft` is a draft with no handler, and the effect tracked only `details()` | fixed — the effect tracks `locationDraft()` too; pinned by a mutation-probed spec |
| F-9 | review gate (comment pass) | Comments my own change falsified: `moveMarker`'s rationale said `addMarker` "recreates the element" (the caller owns it), the fake's doc said it stamps *the host* (it stamps a surface inside it) and called itself in-memory (it now owns DOM), the contrast spec filed a 20 px normal-weight glyph as AA-large, `toProfileUpdate` claimed both writers call it (only one does), and a touched block still carried "widened from…" decision history | all six reworded |
| F-10 | review gate (overlay pass, RV-PROC-2c counting sweep) | **Major** — ADR-0018 §3 says "Seven such mirrors exist" and enumerates them; `VenueLocation` cites §3 as its authority, making it an eighth the list did not know about. The docs-freshness sweep missed this one | fixed — count to eight, `VenueLocation` added, `Tier`'s "second published mirror" ordinal reworded |
| F-11 | review gate (overlay pass, RV-PROC-2c) | `CONTEXT.md`'s **riviera map** entry placed the map on the Discover page only; the same component now also renders in the operator console | fixed |
| F-12 | review gate (prior-PR pass) | `java.math.BigDecimal` inserted inside the `java.time` import run in `JdbcVenues` — the same slip a prior review caught one slice earlier in the sibling file | fixed |
| F-13 | review gate (prior-PR pass) | `VenueLocationMigrationIT` asserted a table-wide count of pinned venues, which couples it to whatever sibling ITs leave in the shared container (`VenueAdminControllerIT` has no `@AfterEach` and leaves a pinned venue) | fixed — scoped to the seeded row, which is also the semantically correct subject |
| F-14 | review gate (bug scan + history pass) | `syncPin` returned at the `moveMarker` branch before reading `pinDraggable()`, so the effect stopped tracking that input after the first add — latent today, a trap for #1101 | fixed — every input is read before the branch |
| F-15 | docs verification pass (Angular v22 + Tailwind v4 against the official docs) | My F-14 fix was **incomplete**: making the effect re-track `pinDraggable` updated the cursor class but never re-registered the marker, and an engine binds draggability at add time — so the flag stayed stale in the engine. Latent today (the one pinned consumer binds a literal `true`), a trap for #1101 | fixed — a changed flag removes and re-adds the marker; pinned by a mutation-probed spec. Also added the untested pre-boot guard case and made the marker's ARIA one style |
| F-3 | docs-freshness | `riviera-frontend` SKILL and ADR-0022 both called the operator pin-drop a later slice; `playwright.a11y.config.ts` still said "three console tabs" after the fourth joined `CONSOLE_THEME_FILES`; `riviera-map.contrast.spec.ts`'s chrome enumeration and glyph sizes omitted the pin | fixed — commit *Fold in the docs-freshness patches* |
| F-4 | docs-freshness (judgement calls, taken) | `CLAUDE.md`'s venue *Owns* cell and `domain-model.md`'s venue table omitted the new column pair; `VenueSummaryView`/`VenueMapView` documented every component except `location` | fixed — commit *Fold in the docs-freshness patches* |
| F-2 | own generalization sweep off F-1 | the same insertion mechanism broke two more sites Sonar does not analyse: `fake-map-engine.ts` stacked two doc comments on `placeElement`, and `clampUnit` carried a doc describing a different function | fixed — commit *Reattach the doc comments my inserted helpers orphaned* |

---

## File structure

- `docs/plans/venue-location.md` — this plan
- `RESPONSIBILITIES.md` — §`venue` gains the venue-location contract
- `platform/src/main/resources/db/migration/V58__venue_location.sql` — the two columns + `venue_location_check`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueLocation.java` — the published value type; the Java mirror of the CHECK
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueSummaryView.java` — tourist list item gains `location`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — tourist venue read gains `location`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — operator profile view gains `location`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileCommand.java` — the validated write command gains `location`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/UpdateVenueProfileRequest.java` — PATCH body gains a nested `location`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — profile response gains `location`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — profile SELECT/UPDATE carry the two columns
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — list + map SELECTs carry the two columns
- `platform/src/test/java/ai/riviera/platform/venue/VenueLocationMigrationIT.java` — AC-1, AC-2
- `platform/src/test/java/ai/riviera/platform/venue/vocabulary/VenueLocationTest.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueProfileCommandTest.java` — command-level validation cases
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-4
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-5, AC-6
- `platform/src/test/java/ai/riviera/platform/venue/VenueProfileConcurrencyIT.java` — command factory widened (R-6)
- `platform/src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — AC-7 (venue read)
- `platform/src/test/java/ai/riviera/platform/venue/VenueListControllerIT.java` — AC-7 (list)
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java` — its `VenueMapView` factory widened (R-6)
- `frontend/src/app/shared/map-engine.ts` — `draggable` marker, `moveMarker`, `onMapClick`, `onMarkerDragEnd`
- `frontend/src/app/shared/maplibre-map-engine.ts` — the real adapter implements them non-destructively
- `frontend/src/app/shared/fake-map-engine.ts` — the fake implements them + the `dragMarkerTo` spec driver and click translation
- `frontend/src/app/shared/fake-map-engine.spec.ts` — AC-8
- `frontend/src/app/shared/maplibre-map-engine.spec.ts` — pure-part coverage for anything added there
- `frontend/src/app/shared/riviera-map.ts|.html` — the pin inputs/outputs
- `frontend/src/app/shared/riviera-map.spec.ts` — AC-9
- `frontend/src/app/shared/riviera-map.a11y.spec.ts` — the pinned map stays axe-clean
- `frontend/src/app/shared/venue-views.ts` — `VenueLocation` + `location` on the tourist types
- `frontend/src/app/operator/venue-location-field.ts` — the pin placer (inline template; `.html` if it outgrows it)
- `frontend/src/app/operator/venue-location-field.html` — only if the template outgrows inline
- `frontend/src/app/operator/venue-location-field.spec.ts` — AC-10
- (no `venue-location-field.a11y.spec.ts` / `.contrast.spec.ts`: the placer renders inside the Venue tab, whose own `venue-tab.a11y.spec.ts` and `venue-tab.contrast.spec.ts` audit it — the `booking-mode-field` / `booking-cutoff-field` precedent, both spec-only for the same reason; the e2e adds the themed paint and the 44 px measurement)
- `frontend/src/app/operator/venue-tab.ts|.html` — hosts the placer inside the existing form + save
- `frontend/src/app/operator/venue-tab.spec.ts` — AC-10 (the save leg)
- `frontend/src/app/operator/venue-tab.a11y.spec.ts` — the widened tab stays axe-clean
- `frontend/src/app/operator/venue-tab.contrast.spec.ts` — the widened tab's contrast proof
- `frontend/src/app/operator/operator-console.model.ts` — `location` on the profile view/update + `toProfileUpdate`
- `frontend/src/app/operator/operator-console.model.spec.ts` — AC-11 (new file if absent)
- `frontend/e2e/operator-venue-location.e2e.ts` — AC-12
- `frontend/e2e/support/operator-console.mocks.ts` — the shared console profile fixture gains `location`
- `frontend/playwright.a11y.config.ts` — the new spec joins `CONSOLE_THEME_FILES` (and its "three console tabs" prose becomes four)

**Docs-freshness patches** (the staleness the slice created, folded in here rather than a follow-up):

- `CLAUDE.md` — the `venue` module table's *Owns* cell names venue location
- `docs/adr/ADR-0022-self-hosted-map-resources.md` — decision 2's "a later slice" is now shipped
- `docs/architecture/domain-model.md` — the `venue` table block gains `latitude, longitude`
- `docs/adr/ADR-0018-rule-layer-and-its-packaging.md` — §3's mirror count and enumeration (review finding F-10)
- `CONTEXT.md` — the **riviera map** entry is no longer Discover-only (review finding F-11)
- `.claude/skills/riviera-frontend/SKILL.md` — the map-engine seam's second consumer is no longer "later"
- `frontend/src/app/shared/riviera-map.contrast.spec.ts` — the map-chrome enumeration and glyph sizes include the pin

---

## Phase 0 — V58 migration + migration IT

**Files:** Create `platform/src/main/resources/db/migration/V58__venue_location.sql` · Test
`platform/src/test/java/ai/riviera/platform/venue/VenueLocationMigrationIT.java`

- [ ] **Step 1: Write the failing test** (mirrors `SeasonClosureMigrationIT`, the in-tree model for
  a multi-column CHECK: mutate the seeded venue, reset in `@AfterEach`, assert the constraint by name)

```java
package ai.riviera.platform.venue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

/** V58: the venue's optional lat/lng pin — both-or-neither, and each within its range. */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueLocationMigrationIT {

	private static final long MIRAMAR = 1L;
	private static final String CONSTRAINT = "venue_location_check";

	@Autowired
	private JdbcTemplate jdbc;

	@AfterEach
	void clearLocation() {
		jdbc.update("UPDATE venue SET latitude = NULL, longitude = NULL WHERE id = ?", MIRAMAR);
	}

	@Test
	void existingVenuesCarryNoLocation() {
		assertThat(jdbc.queryForObject(
				"SELECT COUNT(*) FROM venue WHERE latitude IS NOT NULL OR longitude IS NOT NULL",
				Long.class)).isZero();
	}

	@Test
	void acceptsBothAbsent() {
		assertThat(jdbc.update(
				"UPDATE venue SET latitude = NULL, longitude = NULL WHERE id = ?", MIRAMAR)).isOne();
	}

	@Test
	void acceptsBothPresentInRange() {
		assertThat(jdbc.update(
				"UPDATE venue SET latitude = 40.146800, longitude = 19.648200 WHERE id = ?",
				MIRAMAR)).isOne();
		assertThat(jdbc.queryForObject(
				"SELECT latitude::text FROM venue WHERE id = ?", String.class, MIRAMAR))
				.isEqualTo("40.146800");
	}

	@Test
	void rejectsHalfPresentPair() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 40.1468, longitude = NULL WHERE id = ?",
						MIRAMAR));
		assertThat(rejected.getMessage()).contains(CONSTRAINT);

		DataIntegrityViolationException mirrored = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = NULL, longitude = 19.6482 WHERE id = ?",
						MIRAMAR));
		assertThat(mirrored.getMessage()).contains(CONSTRAINT);
	}

	@Test
	void rejectsLatitudeOutOfRange() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 90.000001, longitude = 19.6482 WHERE id = ?",
						MIRAMAR));
		assertThat(rejected.getMessage()).contains(CONSTRAINT);
	}

	@Test
	void rejectsLongitudeOutOfRange() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 40.1468, longitude = -180.000001 WHERE id = ?",
						MIRAMAR));
		assertThat(rejected.getMessage()).contains(CONSTRAINT);
	}
}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew --console=plain test --tests "*VenueLocationMigrationIT*"` → FAIL with
  `ERROR: column "latitude" of relation "venue" does not exist`

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation**

```sql
-- #1099 (epic #806): the venue's optional location — its lat/lng pin on the riviera map, placed by
-- the operator by hand. NUMERIC, not a float: six decimal places (~0.11 m) is exact, so what the
-- operator drops is what every later read returns. No PostGIS, no spatial index, no geocoding —
-- proximity is client-side arithmetic over a double-digit venue list (epic decision, invariant #1).
-- Both columns are nullable and no existing row is touched: a venue with no pin is absent from the
-- riviera map and stays in the list, which is what lets the feature ship without a backfill.
-- The CHECK is the both-or-neither rule plus each coordinate's range; VenueLocation is the Java
-- mirror (ADR-0018 §3). Writing it as (a IS NULL) = (b IS NULL) keeps it two-valued — a NULL-vs-NULL
-- comparison would make the constraint pass by never being false.
-- Verified by VenueLocationMigrationIT.
ALTER TABLE venue
    ADD COLUMN latitude NUMERIC(8, 6),
    ADD COLUMN longitude NUMERIC(9, 6),
    ADD CONSTRAINT venue_location_check
        CHECK ((latitude IS NULL) = (longitude IS NULL)
           AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
           AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
```

- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew --console=plain test --tests "*VenueLocationMigrationIT*"` → PASS

> Scope (end-of-phase regression): broaden to the touched module's package.

- [ ] **Step 5: Generalization-audit pass** (after any bug fix / new pattern) — none expected in
  this phase; record "no defect fixed, no pattern introduced" if so.

- [ ] **Step 6: Commit** — `git commit -m "Add the venue location columns and their CHECK (#1099)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window. **Open the draft PR
  here** — CI fires on the `pull_request` event only, so the branch gets no CI until it exists.

---

## Phase 1 — `VenueLocation` + the operator profile read/write

**Files:** Create `venue/vocabulary/VenueLocation.java` · Modify `venue/application/VenueProfileCommand.java`,
`VenueProfileView.java`, `venue/adapter/in/UpdateVenueProfileRequest.java`, `VenueProfileResponse.java`,
`venue/adapter/out/JdbcVenues.java` · Test `venue/vocabulary/VenueLocationTest.java`,
`venue/application/VenueProfileCommandTest.java`, `venue/application/VenueAdminServiceTest.java`,
`venue/VenueAdminControllerIT.java`, `venue/VenueProfileConcurrencyIT.java`

- [ ] **Step 1: Write the failing test** — the value type first, because every other surface
  inherits its guarantees (AC-3)

```java
package ai.riviera.platform.venue.vocabulary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class VenueLocationTest {

	@Test
	void rejectsHalfPresentPair() {
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("40.1468"), null));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(null, new BigDecimal("19.6482")));
	}

	@Test
	void rejectsOutOfRange() {
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("90.000001"), new BigDecimal("19.6482")));
		assertThrows(IllegalArgumentException.class,
				() -> new VenueLocation(new BigDecimal("40.1468"), new BigDecimal("-180.000001")));
	}

	@Test
	void acceptsTheBounds() {
		assertThat(new VenueLocation(new BigDecimal("-90"), new BigDecimal("180")).latitude())
				.isEqualByComparingTo("-90");
	}

	@Test
	void normalizesToSixDecimals() {
		VenueLocation rounded =
				new VenueLocation(new BigDecimal("40.14681234"), new BigDecimal("19.6482"));
		assertThat(rounded.latitude().toPlainString()).isEqualTo("40.146812");
		assertThat(rounded.longitude().toPlainString()).isEqualTo("19.648200");
		assertThat(rounded).isEqualTo(
				new VenueLocation(new BigDecimal("40.146812"), new BigDecimal("19.648200")));
	}
}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew --console=plain test --tests "*VenueLocationTest*"` → FAIL, the type does not exist

- [ ] **Step 3: Minimal implementation**

```java
package ai.riviera.platform.venue.vocabulary;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * A venue's position on the riviera map, in decimal degrees (WGS84). A venue either has one or has
 * none — absence is a null {@code VenueLocation}, never a half-filled pair, which is why both
 * components are required here and the range bounds are enforced in the constructor: the Java
 * mirror of the {@code venue_location_check} CHECK (ADR-0018 §3), whose duplication is intended.
 *
 * <p>Both values are normalized to six decimal places (~0.11 m), the scale the columns store, so a
 * location echoed by a write equals the one a later read returns and {@code equals} is stable.
 *
 * <p>Rationale: RESPONSIBILITIES.md §venue.
 */
public record VenueLocation(BigDecimal latitude, BigDecimal longitude) {

	/** Decimal places stored, mirroring {@code NUMERIC(8,6)} / {@code NUMERIC(9,6)}. */
	private static final int SCALE = 6;
	private static final BigDecimal MIN_LATITUDE = new BigDecimal("-90");
	private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
	private static final BigDecimal MIN_LONGITUDE = new BigDecimal("-180");
	private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");

	public VenueLocation {
		latitude = required(latitude, "latitude");
		longitude = required(longitude, "longitude");
		requireWithin(latitude, MIN_LATITUDE, MAX_LATITUDE, "latitude");
		requireWithin(longitude, MIN_LONGITUDE, MAX_LONGITUDE, "longitude");
	}

	private static BigDecimal required(BigDecimal value, String field) {
		if (value == null) {
			throw new IllegalArgumentException(field + " is required when a location is given");
		}
		return value.setScale(SCALE, RoundingMode.HALF_UP);
	}

	private static void requireWithin(BigDecimal value, BigDecimal min, BigDecimal max, String field) {
		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException(field + " must be between " + min + " and " + max);
		}
	}
}
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew --console=plain test --tests "*VenueLocationTest*"` → PASS

- [ ] **Step 5: Widen the profile write path, red-first at each seam**
  - `VenueProfileCommand` gains `VenueLocation location` (nullable = no pin; the type enforces the
    rest, so `VenueFieldValidation` needs no new helper). Widen `VenueProfileCommandTest`.
  - `UpdateVenueProfileRequest` gains `LocationBody location` (a nested record of two raw
    `BigDecimal`s) and `toCommand()` maps it — `null` → `null`, otherwise
    `new VenueLocation(...)`, whose `IllegalArgumentException` the controller's existing
    `InvalidApiRequestException.parsing(request::toCommand)` turns into `400 INVALID_REQUEST`.
  - `VenueProfileView` and `VenueProfileResponse` gain `location`.
  - `JdbcVenues#findProfile` adds `latitude, longitude` to its SELECT and `ProfileRow`;
    `#updateVenueProfile` adds `latitude = :latitude, longitude = :longitude` to its SET clause.
    New bind-param constants beside the existing `COL_*`/`P_*` (Sonar S1192).
  - `VenueAdminServiceTest` gets AC-4; `VenueAdminControllerIT` gets AC-5 and AC-6 (widen
    `profileBody(...)`); `VenueProfileConcurrencyIT.command(...)` is widened (R-6).

- [ ] **Step 6: Run the phase's tests** —
  `./gradlew --console=plain test --tests "*VenueLocation*" --tests "*VenueProfile*" --tests "*VenueAdmin*"` → PASS

- [ ] **Step 7: Commit** — `git commit -m "Carry the venue location on the operator profile read and write (#1099)"`
  and update the Execution status in the same commit window.

---

## Phase 2 — Tourist read models

**Files:** Modify `venue/vocabulary/VenueSummaryView.java`, `VenueMapView.java`,
`venue/adapter/out/JdbcVenueCatalog.java` · Test `venue/VenueListControllerIT.java`,
`venue/VenueReadControllerIT.java`

- [ ] **Step 1: Write the failing test** — AC-7, in `VenueListControllerIT`, using its existing
  self-seeding `IT_REGION` fixture so a pinned and an unpinned venue are both listed:

```java
	@Test
	void listCarriesLocationForPinnedAndNullForUnpinned() throws Exception {
		jdbc.sql("UPDATE venue SET latitude = 40.146800, longitude = 19.648200 WHERE id = :id")
				.param("id", pinnedVenueId)
				.update();

		mvc.perform(get("/api/venues").param("region", IT_REGION))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].location.latitude".formatted(pinnedVenueId))
						.value(40.146800))
				.andExpect(jsonPath("$[?(@.id == %d)].location.longitude".formatted(pinnedVenueId))
						.value(19.648200))
				.andExpect(jsonPath("$[?(@.id == %d)].location".formatted(unpinnedVenueId))
						.value((Object) null));
	}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew --console=plain test --tests "*VenueListControllerIT*"` → FAIL, `location` is absent

- [ ] **Step 3: Minimal implementation** — add the `VenueLocation location` component to
  `VenueSummaryView` and `VenueMapView`; add `latitude, longitude` to `JdbcVenueCatalog`'s
  `listVenues` and `findVenueMap` SELECT lists, to `SummaryRow`/`VenueRow`, and to `toSummary`,
  reading them with `rs.getBigDecimal(...)` and mapping a null pair to a null location (the
  `distanceToWaterM` boxed-nullable precedent). New `COL_LATITUDE`/`COL_LONGITUDE` constants.

- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew --console=plain test --tests "*VenueListControllerIT*" --tests "*VenueReadControllerIT*"` → PASS

- [ ] **Step 5: Run the structural net** (a published `vocabulary` type was added) —

```bash
./gradlew --console=plain test \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" \
  --tests "*PublishedSurfacePlacementArchitectureTests*" \
  --tests "*RetiredSetExclusionArchitectureTests*"
```

- [ ] **Step 6: Commit** — `git commit -m "Carry the venue location on the tourist list and venue reads (#1099)"`
  and update the Execution status.

---

## Phase 3 — Map-engine seam: a draggable marker it can actually place

**Files:** Modify `frontend/src/app/shared/map-engine.ts`, `maplibre-map-engine.ts`,
`fake-map-engine.ts` · Test `fake-map-engine.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-8 against the fake, whose recorders are the assertion
  surface (the house style in `riviera-map.spec.ts`):

```ts
  it('drag-end reports the marker id and its new position', () => {
    const handle = new FakeMapHandle(host, OPTIONS);
    const moves: { id: string; at: LngLat }[] = [];
    handle.onMarkerDragEnd((id, at) => moves.push({ id, at }));
    handle.addMarker({ id: 'pin', lngLat: ORIGIN, element: marker, draggable: true });

    handle.dragMarkerTo('pin', { lng: 19.7, lat: 40.2 });

    expect(moves).toEqual([{ id: 'pin', at: { lng: 19.7, lat: 40.2 } }]);
    expect(handle.markers().get('pin')?.lngLat).toEqual({ lng: 19.7, lat: 40.2 });
  });

  it('moveMarker keeps the marker element', () => {
    const handle = new FakeMapHandle(host, OPTIONS);
    handle.addMarker({ id: 'pin', lngLat: ORIGIN, element: marker, draggable: true });
    handle.moveMarker('pin', { lng: 19.7, lat: 40.2 });
    expect(handle.markers().get('pin')?.element).toBe(marker);
  });
```

- [ ] **Step 2: Run it, verify it fails** —
  `npx vitest run src/app/shared/fake-map-engine.spec.ts` → FAIL, `onMarkerDragEnd is not a function`

- [ ] **Step 3: Minimal implementation** — the seam gains exactly four things, all
  engine-agnostic:
  - `MapMarker.draggable?: boolean`
  - `MapHandle.moveMarker(id: string, lngLat: LngLat): void` — moves in place; the existing
    `addMarker` upsert destroys and recreates the element, which would drop a drag mid-gesture
  - `MapHandle.onMapClick(handler: (at: LngLat) => void): () => void`
  - `MapHandle.onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void`

  `MapLibreMapEngine` passes `draggable` to `new maplibre.Marker({...})`, subscribes each
  draggable marker's `dragend` to read `pin.getLngLat()`, implements `moveMarker` via
  `pin.setLngLat(...)`, and forwards the map's own `click` as `{ lng, lat }`. `FakeMapEngine`
  records `draggable`, implements `moveMarker`, exposes `dragMarkerTo(id, lngLat)` for specs, and
  translates a real DOM click on its stamped surface into a map click by interpolating the click
  offset across `options.maxBounds` — so the e2e drops a pin with a genuine gesture rather than
  reaching into the component.

- [ ] **Step 4: Run it, verify it passes** —
  `npx vitest run src/app/shared/fake-map-engine.spec.ts src/app/shared/maplibre-map-engine.spec.ts` → PASS

- [ ] **Step 5: Generalization-audit pass** — population: *every implementation of the `MapHandle`
  interface* (a seam widened in one adapter and not the other compiles only until a consumer calls
  it). Enumerate with `rg -l "implements MapHandle" frontend/src`. Fix all members.

- [ ] **Step 6: Commit** — `git commit -m "Give the map-engine seam a draggable marker and its events (#1099)"`

---

## Phase 4 — `RivieraMap` learns to carry one pin

**Files:** Modify `frontend/src/app/shared/riviera-map.ts|.html` · Test `riviera-map.spec.ts`,
`riviera-map.a11y.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-9, in `riviera-map.spec.ts`'s existing
  `render(engine)` idiom.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/riviera-map.spec.ts` → FAIL
- [ ] **Step 3: Minimal implementation** — `options = input(RIVIERA_MAP_OPTIONS)`,
  `pin = input<LngLat | null>(null)`, `pinDraggable = input(false)`, `pinLabel = input('Venue location')`,
  `mapClick = output<LngLat>()`, `pinMoved = output<LngLat>()`. An `effect` syncs the single marker
  to the handle once `status() === 'ready'`: add on first pin, `moveMarker` on a change, `removeMarker`
  on clear. Discover's `<app-riviera-map />` keeps working unchanged — every input has a default.
- [ ] **Step 4: Run it, verify it passes** —
  `npx vitest run src/app/shared/riviera-map.spec.ts src/app/shared/riviera-map.a11y.spec.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "Let the riviera map carry and report one pin (#1099)"`

---

## Phase 5 — The operator's pin placer

**Files:** Create `frontend/src/app/operator/venue-location-field.ts` (+ specs) · Modify
`venue-tab.ts|.html`, `operator-console.model.ts`, `shared/venue-views.ts` · Test
`venue-location-field.spec.ts`, `venue-tab.spec.ts`, `operator-console.model.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-10 (the placer: click drops, Clear removes, the
  read-out announces) and AC-11 (`toProfileUpdate` carries the location — R-2's guard, written as
  its own spec so the trap is pinned independently of the tab).
- [ ] **Step 2: Run them, verify they fail** —
  `npx vitest run src/app/operator/venue-location-field.spec.ts src/app/operator/operator-console.model.spec.ts` → FAIL
- [ ] **Step 3: Minimal implementation** — `VenueLocation` joins `shared/venue-views.ts` and the
  tourist types; `VenueProfileView`, `VenueProfileUpdate` **and `toProfileUpdate`** gain `location`;
  `venue-location-field.ts` wraps `<app-riviera-map [pin] [pinDraggable]="true" (mapClick) (pinMoved)>`
  with a `<output aria-live="polite">` read-out and a Clear `<button>`; `venue-tab` seeds a
  `locationDraft` signal in `seed(profile)` and reads it in `onSave()`, inside the existing
  `expectedVersion` path so the stale-write banner needs no change.
- [ ] **Step 4: Run them, verify they pass** — `npx vitest run src/app/operator` → PASS
- [ ] **Step 5: Generalization-audit pass** — population: *every producer of a
  `VenueProfileUpdate` body* (a full-replace PATCH silently nulls any field a producer forgets).
  Enumerate with `rg -n "VenueProfileUpdate|toProfileUpdate" frontend/src`. Judge each site.
- [ ] **Step 6: Commit** — `git commit -m "Place, move and clear the venue pin in the operator console (#1099)"`

---

## Phase 6 — Mocked Playwright e2e

**Files:** Create `frontend/e2e/operator-venue-location.e2e.ts` · Modify
`frontend/playwright.a11y.config.ts`, `frontend/e2e/support/operator-console.mocks.ts`

- [ ] **Step 1: Write the failing test** — AC-12, modelled on `operator-venue.e2e.ts`'s stateful
  `mockVenue(page)` (closure `profile`/`serverVersion`, a `patches` recorder, `bump()` for the
  stale case), arming `__RIVIERA_FAKE_MAP__` via `page.addInitScript`. Three tests: drop → save →
  reload → pin present at the dropped position; clear → save → reload → no pin; and a
  `dark console` titled test asserting the placer's paint plus `expectNoSeriousAxeViolations`.
- [ ] **Step 2: Run it, verify it fails** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts operator-venue-location` → FAIL
- [ ] **Step 3: Minimal implementation** — add the spec file to `CONSOLE_THEME_FILES` in
  `playwright.a11y.config.ts` (R-8: membership **and** the `dark console` title are both required),
  and give the shared console profile fixture a `location`.
- [ ] **Step 4: Run it, verify it passes** — the same command, plus the `console-dark` project → PASS
- [ ] **Step 5: Commit** — `git commit -m "Cover the operator pin placer in the mocked e2e suite (#1099)"`

---

## Phase 7 — The written contract + close-out

**Files:** Modify `RESPONSIBILITIES.md`, `docs/plans/venue-location.md`

- [ ] **Step 1:** `RESPONSIBILITIES.md` §`venue` gains the venue-location contract: owned by
  `venue`; validation is range-only (−90…90 / −180…180, both-present-or-both-absent), mirrored by
  `VenueLocation` over `venue_location_check`; **null means "not on the riviera map, still in the
  list"** — the contract #1101 relies on to omit a venue client-side, so no operator is forced
  through a backfill; the write is the ownership-fenced profile PATCH under the `version` token,
  never a resource of its own.
- [ ] **Step 2:** Confirm `CONTEXT.md`'s **venue location** entry (added by #1098) still describes
  what shipped; correct it if not.
- [ ] **Step 3:** Run `riviera-docs-freshness` over `origin/main..HEAD` and record the findings.
- [ ] **Step 4:** Finalize the Execution status **in this PR's last code-touching commit** — stage
  pointer, phase rows ✅ with commits, ACs verified, risk rows closed, Open Questions empty.
- [ ] **Step 5:** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | sonar gate — `java:S8491` "dangling Javadoc" at `JdbcVenueCatalog.java:275` | every member this slice inserted by text anchor (an anchor on a member's declaration line lands *between* that member and its doc comment, orphaning it — the compiler and every test stay green) | `git diff origin/main -- '*.java' '*.ts' \| grep -n -B6 'locationOf\|placeElement\|clampUnit'`, then read each insertion site whole | 4 sites: `JdbcVenueCatalog.locationOf` (orphaned `seasonClosureOf`'s doc), `fake-map-engine.placeElement` (stacked two doc comments on one member), `clampUnit` (took a doc describing a different function), `JdbcVenues.locationOf` (correct — anchored above the doc) | the three broken sites repaired; Sonar saw only the Java one, so the two TypeScript ones would have shipped |
| 2026-09-16 | phase 6 — the fake engine recorded markers but never rendered them, so the e2e could not see a dropped pin | every `MapHandle` member whose real adapter has a DOM side effect the fake omits (an in-memory-only fake passes a unit spec that asserts only its own recorder) | read `addMarker`/`moveMarker`/`removeMarker`/`destroy` in `maplibre-map-engine.ts` against their `fake-map-engine.ts` twins | 4 members: add (appends), move (repositions), remove (detaches), destroy (detaches all) | all four given the DOM effect and pinned by a unit assertion on `element.parentElement`, so the gap cannot reopen unseen |
| 2026-09-16 | phase 5 — an invented `--riv-card-ink-muted` would have shipped unstyled ink | every `*-riv-*` Tailwind utility this diff adds (a utility naming an undeclared token compiles and paints nothing) | `git diff --cached origin/main -- 'frontend/src/**/*.{ts,html}' \| grep '^+' \| grep -oE '\b(bg\|text\|border\|outline\|shadow\|fill\|stroke\|ring\|from\|to\|via)-riv-[a-z0-9-]+'`, each checked against `--<token>:` in `tailwind.css` | 7 tokens across `riviera-map.ts` and `venue-location-field.ts` | the one miss fixed (`-muted` → `-soft`); the other six verified declared |
| 2026-09-16 | phase 5 — `VenueTab` gained a child that injects `MapEngine` | every TestBed that mounts `VenueTab` (a new injection in a child breaks its parent's contexts, not its own spec) | `grep -rn "VenueTab" frontend/src --include=*.spec.ts -l` | `venue-tab.spec.ts`, `venue-tab.a11y.spec.ts`, `venue-tab.contrast.spec.ts`, `app.spec.ts` | the two constructing their own TestBed got the fake engine; the other two already resolve it and pass |
| 2026-09-16 | phase 3 — the seam grew three members | every implementation of the `MapHandle` interface (a widened seam compiles in one adapter and not the other only until a consumer calls it) | `grep -rln "implements MapHandle" frontend/src frontend/e2e` | `maplibre-map-engine.ts`, `fake-map-engine.ts` | both implemented; the two `extends MapEngine` spec-local doubles (`riviera-map.spec.ts`, `riviera-map.a11y.spec.ts`) override `create` only and need no change |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*VenueLocationMigrationIT*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*VenueLocationMigrationIT*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "*VenueLocationTest*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*VenueAdminServiceTest*"` → PASS.
- [ ] **AC-5:** `./gradlew test --tests "*VenueAdminControllerIT*"` → PASS.
- [ ] **AC-6:** `./gradlew test --tests "*VenueAdminControllerIT*"` → PASS.
- [ ] **AC-7:** `./gradlew test --tests "*VenueListControllerIT*" --tests "*VenueReadControllerIT*"` → PASS.
- [ ] **AC-8:** `npx vitest run src/app/shared/fake-map-engine.spec.ts` → PASS.
- [ ] **AC-9:** `npx vitest run src/app/shared/riviera-map.spec.ts` → PASS.
- [ ] **AC-10:** `npx vitest run src/app/operator` → PASS.
- [ ] **AC-11:** `npx vitest run src/app/operator/operator-console.model.spec.ts` → PASS.
- [ ] **AC-12:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS
  (incl. the `console-dark` project).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
