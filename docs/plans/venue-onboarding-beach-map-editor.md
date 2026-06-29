# U7 — Venue Onboarding & Beach-Map Editor Implementation Plan

> Execute with `implement` + `tdd`. Steps use `- [ ]` for tracking.

**Goal:** A venue operator can create a venue (commission rate, booking mode, payout
currency) and lay out its beach map (rows + set positions with tier, pool, price in
minor units, grid coordinates) via authenticated write endpoints in the `venue`
module; the persisted layout round-trips unchanged through the U1 read API
(`GET /api/venues/{id}`), and an Angular editor drives it.

**Architecture:** New **write surface in the `venue` module**. The read side stays a
collapsed query adapter; the write side earns a modest hexagon (`application.in` ports
→ `VenueAdminService` → `application.out.Venues` writer → `infrastructure.out.JdbcVenues`)
because it carries genuine command logic (input validation + conflict→outcome mapping),
not pass-through. **Incremental per-set CRUD** (the editor saves individual set
positions), and operator write endpoints sit behind **httpBasic** auth (the read API
stays public). The single most significant decision: enforce the editor's
**coordinate integrity** (one set per grid cell, positive coordinates) in a new Flyway
migration + the write path — the read-only seed never collided, a visual editor can.

**Persistence:** JDBC only (invariant #1). Tables touched: `venue`, `set_position`
(both exist since V2). New migration **V12** adds `UNIQUE(venue_id, grid_x, grid_y)` and
positive-coordinate CHECKs to `set_position`. No new columns needed — V2/V10 already
carry every field the ACs require.

**Source of intent:** GitHub issue **#7** (U7). Blocked-by #4 (merged). Unblocks #10 (U8).

**Skills consulted:** `postgres` (grid-cell UNIQUE + coordinate CHECKs on `set_position`;
verified seed won't violate them; constraints tested by a migration IT), `riviera-modulith`
(write side as a real hexagon vs the collapsed read side; `application.in` ports vs `api/`;
`allowedDependencies` stays `{}` — no cross-module deps), `riviera-java-conventions`
(records for commands/DTOs/outcomes, sealed `SetOutcome`, package-private service/adapter,
constructor injection, typed-outcome over exceptions, ISO-4217 + token validation, JdbcClient
text-block SQL), `codebase-design` (the `Venues` writer-port seam; pre-check-for-outcome with
the DB unique constraint as the hard backstop), `angular-developer` + angular-cli MCP (Signal
Forms editor, Basic-auth interceptor, signals, a11y/axe + contrast specs), `riviera-plan-doc`
(this doc), `tdd` (red-green per phase). `riviera-stripe-payments` — N/A, no money *moves*
(prices are configured, not charged).

**Branch:** `claude/venue-beach-map-editor-u7-iat8gd` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (create venue):** Given a valid create-venue request (name, beach, region,
  description, `bookingMode`, `commissionBps`, `payoutCurrency`, `bookingCutoff`), when
  `OnboardVenue.onboard` runs, then a `venue` row is inserted with `rating_tenths=0`,
  `reviews_count=0`, and the returned `VenueId` resolves via `VenueCatalog.findVenueMap`.
  *Pinned by:* `VenueAdminControllerIT.createsVenueThenReadable`.
- [ ] **AC-2 (lay out sets):** Given an existing venue, when sets are added via
  `EditBeachMap.addSet` (rowLabel, positionNo, tier, pool, price{minorUnits,currency},
  gridX, gridY), then each set is persisted and appears in `GET /api/venues/{id}` with the
  same field values. *Pinned by:* `VenueAdminControllerIT.addedSetsRoundTripThroughReadApi`.
- [ ] **AC-3 (one set per pool, editable split):** Given a set in the ONLINE pool, when
  `editSet` changes its pool to WALK_IN, then the read API reflects WALK_IN; a `pool` value
  outside {ONLINE, WALK_IN} is rejected `400`. A set always carries exactly one pool
  (single NOT-NULL column + CHECK — invariant #3). *Pinned by:*
  `VenueAdminControllerIT.poolSplitIsEditable` + `.rejectsUnknownPool`.
- [ ] **AC-4 (money is minor units, invariant #5):** Given a price `{minorUnits:4500,
  currency:"EUR"}`, when added and read back, then `price.minorUnits=4500` and
  `price.currency="EUR"` exactly (no float); a non-ISO currency is rejected `400`.
  *Pinned by:* `VenueAdminControllerIT.priceIsIntegerMinorUnits` + `.rejectsNonIsoCurrency`.
- [ ] **AC-5 (coordinate integrity, invariant #12):** Given a venue with a set at
  `(gridX,gridY)=(2,1)`, when another set is added at `(2,1)`, then it is rejected `409`
  CELL_TAKEN; the DB also rejects it (`set_position_grid_uniq`). Coordinates `< 1` are
  rejected `400`. *Pinned by:* `VenueAdminControllerIT.rejectsDuplicateGridCell` +
  `BeachMapLayoutMigrationIT.gridCellUniquePerVenue`.
- [ ] **AC-6 (auth gate):** Given no/invalid credentials, when a write endpoint is called,
  then `401`; the public `GET /api/venues/**` still returns `200`. *Pinned by:*
  `VenueAdminControllerIT.writeRequiresOperatorAuth` + `.readStaysPublic`.
- [ ] **AC-7 (FE round-trip):** Given the Angular editor creates a venue and adds sets,
  when it then loads the venue, then the rendered map equals what was entered. *Pinned by:*
  `venue-editor.spec.ts` (component, mocked HTTP) + `venue-editor.a11y.spec.ts` (axe).

## Non-goals

- No venue **listing/search/update-profile** endpoints (only create + per-set CRUD).
- No real operator-identity model (roles/users beyond a single configured operator
  credential); the staff/admin auth model remains a later concern.
- No availability writes — onboarding configures the *static layout*, never
  `set_availability` (that is U2/U8).
- No same-day/cutoff logic, no payment/charge (prices are configured, not collected).
- No delete-venue or cascade-management UI beyond removing individual sets.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Editor places two sets on one grid cell → broken read map | med | high | `UNIQUE(venue_id, grid_x, grid_y)` (V12) + pre-check CELL_TAKEN + `@ExceptionHandler(DataIntegrityViolationException)→409` backstop; `BeachMapLayoutMigrationIT` | agent | open |
| R-2 | Float/locale creeps into price on the write path (breaks #5) | low | high | DTO carries integer `minorUnits` + ISO currency string; `Currency.getInstance` validation; round-trip IT asserts exact ints | agent | open |
| R-3 | Pool/tier/mode free-text drifts from DB CHECK tokens | med | med | Named constants in lockstep with SQL tokens; validate against allowed set → 400; DB CHECK backstop | agent | open |
| R-4 | New migration breaks the existing Miramar seed (V3) | low | high | Seed sets distinct `(grid_x,grid_y)` per venue and all coords ≥1 — verified; `BeachMapLayoutMigrationIT` runs full Flyway incl. seed | agent | open |
| R-5 | Write endpoints accidentally left public / CSRF blocks Basic API | med | high | SecurityConfig: `hasRole(OPERATOR)` on write matchers, GET public, CSRF-ignore the stateless API paths; `VenueAdminControllerIT` asserts 401 + 200 | agent | open |
| R-6 | Module boundary leak from the new write packages | low | med | `application.*`/`infrastructure.*` package-private; no other-module imports; `ModularityTests` green | agent | open |

## Open questions / Assumptions

- **Assumption:** new venues start at `rating_tenths=0`, `reviews_count=0` (no reviews
  yet); operators don't set them. — *Owner:* agent · *Resolves by:* Phase 1.
- **Assumption:** the FE operator credential is entered in the editor (a credentials
  panel) and attached via a Basic-auth interceptor; no session/JWT in v1. — *Owner:* agent
  · *Resolves by:* Phase 4.

### Resolved

- **Auth posture** → require httpBasic now (operator surface). *(user decision, grill gate)*
- **Layout write semantics** → incremental per-set CRUD. *(user decision, grill gate)*
- **Payout currency** → per-venue ISO 4217, default EUR. *(user decision, grill gate)*

## Availability & concurrency (invariant #2)

**N/A for `set_availability` — onboarding never writes the availability source of truth.**
It writes the *static layout* (`venue`, `set_position`) only; availability rows are created
per `(set, date)` at booking/staff-mark time (U2/U8). The one concurrency concern here is
*layout* integrity, not double-booking: two sets must not occupy one grid cell or one
`(row_label, position_no)`. That is guarded by **DB UNIQUE constraints** (`set_position_cell_uniq`
existing, `set_position_grid_uniq` new in V12) — the same "DB constraint is the concurrency
primitive" stance as invariant #2, applied to layout. Pool rule (invariant #3): a set's `pool`
is a single NOT-NULL column with `CHECK IN ('ONLINE','WALK_IN')` — structurally exactly one pool;
the write path validates the token. No cutoff (#4) logic in scope.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | venue owns profiles, the beach map / layout, pool assignment, pricing, booking mode (CLAUDE.md) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | none new | — | — | The write surface is **module-internal** (REST-only). No other module calls it, so the ports live in `venue.application.in`, not `api/`. The read `VenueCatalog` (api) is unchanged. |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | none | — | — | — | — | N/A — onboarding is a self-contained write; no other module reacts in this slice. |

**New internal packages in `venue`:** `application.in` (`OnboardVenue`, `EditBeachMap`,
commands, `SetOutcome`), `application` (`VenueAdminService`), `application.out` (`Venues`),
`infrastructure.out` (`JdbcVenues`), `infrastructure.in` (`VenueAdminController`, request DTOs).
`allowedDependencies` stays `{}`. `ModularityTests` must stay green.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money *moves*.** Prices are *configured* on set positions (integer minor units +
ISO currency, invariant #5 honored in the DTO and DB), but nothing is charged, refunded, or
accrued in this slice. No Stripe, no payout ledger effect.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue-admin/venue-editor.ts` | new | standalone component | Signals + `computed` | Signal Forms (`@angular/forms/signals`) |
| FE-2 | `venue-admin/venue-admin.service.ts` | new | service (`providedIn:'root'`) | — | — |
| FE-3 | `venue-admin/venue-admin.model.ts` | new | typed DTOs | — | — |
| FE-4 | `core/operator-auth.ts` + interceptor | new | service + `HttpInterceptorFn` | Signal holds Basic token | — |
| FE-5 | route `venues/:id/edit` (+ `venues/new`) | new | lazy `loadComponent` | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`, no `ngClass`/`ngStyle`,
Signal Forms, OnPush/zoneless defaults. Editor mirrors the existing `venue-map` grid styling so the
preview matches U1. a11y: axe-clean + WCAG-AA contrast specs like `venue-map.a11y.spec.ts`.

## FE↔BE contract

- **New endpoints (operator auth required; JSON):**
  - `POST /api/venues` → `201 {id}` (+ `Location`). Body: `{name, beach, region, description,
    bookingMode, commissionBps, payoutCurrency, bookingCutoff}`.
  - `POST /api/venues/{venueId}/sets` → `201 {id}`. Body: `{rowLabel, positionNo, tier, pool,
    price:{minorUnits,currency}, gridX, gridY}`.
  - `PATCH /api/venues/{venueId}/sets/{setId}` → `200`. Body: same set shape.
  - `DELETE /api/venues/{venueId}/sets/{setId}` → `204`.
  - Errors: `400` invalid input, `401` unauth, `404` no such venue/set, `409` CELL_TAKEN /
    DUPLICATE_POSITION, `{ "error": "<CODE>" }` body.
- **Client typing:** hand-written typed `venue-admin.model.ts` reusing the U1 `MoneyView` shape;
  no `any`. Read path reuses the existing `VenueService`/`VenueMapView` for the round-trip.
- **Money/date on the wire:** price as integer `minorUnits` + ISO `currency`; `bookingCutoff`
  as `HH:mm` string (Europe/Tirane local, invariant #6); no floats.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V12 migration + migration IT | ✅ | V12 + BeachMapLayoutMigrationIT (5 tests green) |
| 1 — Backend create-venue (port→service→writer→adapter→controller) | ✅ | VenueAdminService/Controller + JdbcVenues |
| 2 — Backend per-set add/edit/remove + outcomes | ✅ | EditBeachMap + VenueAdminControllerIT (16 green) |
| 3 — Operator httpBasic auth + SecurityConfig | ✅ | OPERATOR role + CSRF-exempt write paths |
| 4 — Angular editor + service + Basic-auth interceptor + a11y | ⏳ | |
| 5 — CI green + Review gate | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Backend (new)**
- `platform/src/main/resources/db/migration/V12__beach_map_layout_constraints.sql` — grid-cell UNIQUE + coord CHECKs.
- `…/venue/application/in/OnboardVenue.java`, `EditBeachMap.java`, `NewVenueCommand.java`, `NewSetCommand.java`, `EditSetCommand.java`, `SetOutcome.java`.
- `…/venue/application/VenueAdminService.java`.
- `…/venue/application/out/Venues.java`.
- `…/venue/infrastructure/out/JdbcVenues.java`.
- `…/venue/infrastructure/in/VenueAdminController.java`, `CreateVenueRequest.java`, `SetPositionRequest.java`.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — modify (operator role + write matchers + CSRF).
- New config: operator credential via `application.properties` + a small `@ConfigurationProperties` or in-memory user.

**Backend (tests)**
- `…/venue/BeachMapLayoutMigrationIT.java`, `VenueAdminControllerIT.java`, `application/VenueAdminServiceTest.java` (pure, mocked writer).

**Frontend (new)**
- `frontend/src/app/venue-admin/venue-admin.model.ts`, `venue-admin.service.ts`, `venue-editor.ts` (+ `.html`/`.scss`), specs (`.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`).
- `frontend/src/app/core/operator-auth.ts` (+ spec), interceptor registered in `app.config.ts`.
- `frontend/src/app/app.routes.ts` — modify (add editor routes).

---

## Phase plan (TDD per phase)

- **Phase 0:** Write `BeachMapLayoutMigrationIT` (grid-cell uniqueness rejected; coord<1 rejected;
  seed still loads 24 sets) → red → add V12 → green. `--tests "*BeachMapLayoutMigrationIT*"`.
- **Phase 1:** `VenueAdminServiceTest` (create maps command→writer; validation throws) +
  `VenueAdminControllerIT.createsVenueThenReadable` → red → ports/service/`Venues`/`JdbcVenues`/
  controller create path → green.
- **Phase 2:** add/edit/remove outcomes (round-trip, pool edit, duplicate cell/position,
  not-found) → red → `EditBeachMap` impl + controller switch → green.
- **Phase 3:** auth ITs (401 unauth write, 200 public read, 200 authed write) → red →
  SecurityConfig operator role + matchers + CSRF-ignore → green.
- **Phase 4:** Angular editor specs (component round-trip via mocked HTTP, axe, contrast) → red →
  model/service/interceptor/component/routes → green; `npm test`, `npm run lint`, `npm run build`.
- **Phase 5:** full `./gradlew test` + FE build green; push; Review gate (riviera-review-overlay +
  /code-review) on the diff; resolve findings through the loop.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

## Acceptance-criteria verification (final)

- [ ] AC-1..6: `./gradlew test --tests "*venue*"` green.
- [ ] AC-7: `cd frontend && npm test` green (editor + a11y specs).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No JPA; persistence is `JdbcClient` + SQL (invariant #1).
- [ ] Availability section justified N/A (layout, not `set_availability`); layout uniqueness via DB constraint.
- [ ] Pool rule honored (#3); money in minor units + ISO currency (#5); coords/constraints via Flyway (#12).
- [ ] Modulith section filled; no cross-module internal imports; `allowedDependencies` correct; `ModularityTests` green.
- [ ] Payment/payout N/A justified.
- [ ] Timezone: `bookingCutoff` reasoned in `Europe/Tirane`; timestamps TIMESTAMPTZ (#6).
- [ ] Frontend standards met; no `as any` on the contract; axe + contrast specs pass.
- [ ] Execution-status table matches reality; Open Questions empty or deferred with an issue #.
