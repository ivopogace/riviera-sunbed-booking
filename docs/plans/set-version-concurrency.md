# Beach-map & pricing optimistic concurrency (`set_version`) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the #224 optimistic-concurrency guard from the venue-profile write to the two
`set_position` operator writes — beach-map replace (`PUT /api/venues/{id}/beach-map`) and per-row
reprice (`PUT /api/venues/{id}/rows/{rowLabel}/price`) — so a stale operator tab can never silently
clobber another writer's layout or prices; a mismatch is `409 STALE_WRITE` and the tab preserves
edits + offers Reload.

**Architecture:** The single most significant decision (owner-chosen at grill time): a **separate
`venue.set_version` aggregate counter**, bumped by `replaceLayout` + `repriceRow` only, kept
distinct from the #224 profile `version`. `set_position` carries `price_minor`/`price_currency`, so
map-replace (delete-all + insert-all, re-sends prices) and per-row reprice write **overlapping**
columns and must share one token — but neither overlaps the profile write (`venue` + `venue_amenity`
only), so a profile/amenity edit must **not** falsely invalidate an open layout or pricing tab. The
second load-bearing decision is **lock ordering**: both write paths take the **venue row first** (the
conditional `set_version` bump) before `lockSetsOfVenue`'s `FOR UPDATE` on `set_position`, so a
concurrent replace-vs-reprice on the same venue can never deadlock on opposite acquisition order.

**Persistence:** JDBC only (invariant #1). One new migration **V23** adds `venue.set_version BIGINT
NOT NULL DEFAULT 0`. No new tables. `set_position` unchanged.

**Source of intent:** GitHub issue **#226** (follow-up to #224 / PR #225; refs #172 replace, #174 reprice).

**Skills consulted (Skill-routing gate):**
- `riviera-plan-doc` — plan structure + testable-AC-at-the-inner-hexagon discipline.
- `postgres` — `set_version` as `BIGINT NOT NULL DEFAULT 0` (matches V22 `version`); conditional
  `UPDATE … WHERE id AND set_version = :expected` self-serializes on the PK row (no separate lock);
  consistent lock-acquisition order to avoid deadlock (venue row before its `set_position` rows).
- `riviera-modulith` — all changes stay inside the `venue` module; no new cross-module port/event; the
  existing `availability::spi` / `booking::spi` collaboration in `replaceLayout` is untouched.
- `riviera-frontend` — the two tabs live in the `operator/` feature folder; the token rides the existing
  `VenueMapView` read (`venue/venue.model.ts`); STALE_WRITE banner mirrors `venue-tab`'s.
- `riviera-java-conventions` (backend Java idioms), `angular-developer` + angular-cli MCP (v22 APIs),
  `playwright-cli` (mocked e2e for the two stale flows) — **to be loaded at implement stage per phase**.

**Branch:** `feature/set-version-concurrency` (exists).

---

## Acceptance criteria (testable)

- [x] **AC-1 (replace, headline race):** Given two operators both loaded a venue's layout at
  `set_version = V`, when both submit `replaceLayout`, then exactly one returns `Replaced` and the
  other `STALE_WRITE` (no exception, no double-clobber), and the row ends at `set_version = V+1`.
  *Pinned by:* `BeachMapReplaceConcurrencyIT.exactlyOneReplaceWins` ✅ (Phase 1)
- [x] **AC-2 (reprice race):** Given two operators loaded at `set_version = V`, when both submit
  `repriceRow` for the same row, then exactly one returns `APPLIED` and the other `STALE_WRITE`, and
  `set_version = V+1`. *Pinned by:* `VenueRepriceConcurrencyIT.exactlyOneRepriceWins` ✅ (Phase 2)
- [x] **AC-3 (shared token — cross-write race):** Given both loaded at `set_version = V`, when a
  `replaceLayout` and a `repriceRow` race, then exactly one applies and the other is `STALE_WRITE`
  (proving replace and reprice share one token). *Pinned by:*
  `VenueSetWriteConcurrencyIT.replaceAndRepriceCannotBothWin` ✅ (Phase 2)
- [x] **AC-4 (token independence):** Given a venue-profile write, when it commits, then `set_version`
  is unchanged; and given a `replaceLayout`/`repriceRow`, when it commits, then the profile `version`
  is unchanged. *Pinned by (IT equivalents):* `VenueAdminControllerIT.profileWriteLeavesSetVersion` +
  `VenueAdminControllerIT.setWriteLeavesProfileVersion` ✅ (Phase 2) — the real column-independence is a
  SQL fact, so proven end-to-end against Postgres, not the in-memory fake.
- [x] **AC-5 (token required):** Given a `replaceLayout`/`repriceRow` request with no
  `expectedVersion`, when submitted, then `400 INVALID_REQUEST` (never a silent `0`).
  *Pinned by:* `VenueAdminControllerIT.replaceWithoutVersionIs400` ✅ (Phase 1) +
  `…repriceWithoutVersionIs400` ✅ (Phase 2)
- [x] **AC-6 (stale → 409 with code):** Given a stale `expectedVersion`, when submitted to either
  write, then `409` with an RFC-7807 `ProblemDetail` whose `code` is `STALE_WRITE`.
  *Pinned by:* `BeachMapReplaceIT.staleReplaceIs409StaleWrite` ✅ (Phase 1) +
  `VenueRepriceIT.staleRepriceIs409StaleWrite` ✅ (Phase 2)
- [x] **AC-7 (read carries the token):** Given the venue map read, then the response carries
  `setVersion`. *Pinned by:* `VenueReadControllerIT.mapReadCarriesSetVersion` ✅ (Phase 0)
- [x] **AC-8 (invariant #2 preserved):** Given a `replaceLayout` on a venue with a booking or
  availability hold, then it is rejected `LAYOUT_IN_USE` (409) and the layout is unchanged — the
  reject-unless-unclaimed guard and its `FOR UPDATE` claim-probe are intact.
  *Pinned by:* existing `BeachMapReplaceIT` in-use scenarios (stay green with the bump-first order) ✅ (Phase 1).
- [ ] **AC-9 (FE preserve-edits + reload):** Given the beach-map editor / pricing tab receives a
  `409 STALE_WRITE` on save, then the operator's in-progress edits are preserved and a "Reload latest"
  affordance is shown (no silent discard, no clobber). *Pinned by:* `layout-editor.spec.ts` +
  `pricing-tab.spec.ts` (unit) and `beach-map-stale-write.e2e.ts` + `pricing-stale-write.e2e.ts` (mocked).

## Non-goals

- **Per-`set_position` row versions.** Owner chose a single venue-aggregate `set_version`; per-row
  tokens are explicitly not pursued (map-replace deletes+reinserts rows, so per-row tokens don't map).
- **Guarding the per-set `add/edit/remove` endpoints** (`POST/PATCH/DELETE …/sets/{setId}`). They are
  **dead from the FE** (the editor only ever saves via full `replaceLayout`), so they neither bump nor
  guard `set_version` in this slice. If ever re-surfaced they must bump it (see Open questions).
- **A dedicated operator layout read endpoint.** The token rides the existing map read (`VenueMapView`)
  as a version stamp; a separate operator-gated `/layout` read is deferred (see Open questions).
- **Retiring the pre-existing `operator/` → `venue/` model coupling** (the two tabs already import
  `VenueService`/`VenueMapView`). Out of scope; noted only.
- **Any change to availability (invariant #2)** or to the payment/payout flow. Prices are edited, but
  no money moves.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — additive hardening. No surface is retired or replaced; existing behaviors (LAYOUT_IN_USE,
NO_SUCH_VENUE/ROW, layout-integrity 409s, the invariant-#2 claim probe) are **preserved** and are
re-asserted by AC-8 and the existing `BeachMapReplaceIT`/`VenueRepriceIT` suites.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Deadlock**: replace locks `set_position` (`lockSetsOfVenue`) then venue (bump); reprice locks venue (bump) then `set_position` (reprice UPDATE) → opposite order on the same two resources | med | high | Acquire the **venue row first in BOTH paths**: do the conditional `set_version` bump **before** `lockSetsOfVenue`. Consistent order (venue → its set rows) makes deadlock impossible; the second txn blocks on the venue row and re-reads a bumped `set_version` → `STALE_WRITE`. Proven by AC-3 (replace-vs-reprice race). | Ivo | open |
| R-2 | **Spurious `set_version` bump** on a `LAYOUT_IN_USE` (replace) or `NO_SUCH_ROW` (reprice) reject, since the bump now precedes the in-use probe / the reprice UPDATE and the txn commits on a value-outcome | med | low | Accepted: safe (only makes other tabs reload) and rare (an error/blocked path). Documented. Zero-spurious-bump would need an extra pre-probe read; deferred unless review objects. | Ivo | open |
| R-3 | **Wire-contract break**: `expectedVersion` now **required** on two existing endpoints → `400` for a client that omits it | low | med | Same-slice FE update sends it; the SPA is same-origin & bundled with the backend (no external API consumers). `Long` (not primitive) so absent = `null` = 400, never a silent `0` (mirrors #224). | Ivo | open |
| R-4 | **Flyway collision** on `V23` | low | high | Verified `V23` free on `main` (latest is V22) **and** no open PRs claim it. If a parallel slice merges first, this branch renumbers (default: merges second) + merge-from-main before PR. | Ivo | open |
| R-5 | **Invariant-#2 regression** from reordering: the `FOR UPDATE` claim-probe now runs after the venue-row lock | low | high | `lockSetsOfVenue` + the claim/bookings probe still run **before** any `deleteAllSets`; existing `BeachMapReplaceIT` invariant-#2 (concurrent-hold) scenarios must stay green (AC-8). | Ivo | open |
| R-6 | **BOLA / invariant #13** on the venue-scoped writes | low | high | Unchanged: `assertOwns` stays the first act of both `replaceLayout` and `repriceRow` (application service, not controller). The new map read carrying `setVersion` is the already-public tourist read (a non-sensitive counter) — no authz change. Pinned by existing `CrossVenueDenialIT`. | Ivo | open |
| R-7 | **Error-contract drift**: new 409s must be centralized `ProblemDetail` with `code = STALE_WRITE`, not a per-controller body (§6b) | low | med | Reuse `ApiProblem.response(CONFLICT, "STALE_WRITE", <friendly msg>)`; the FE reads `code` via `problemCodeOf` (not status alone), exactly as `venue-tab` does. | Ivo | open |

## Open questions / Assumptions

- **Assumption:** No external API consumers of `PUT …/beach-map` or `PUT …/rows/{rowLabel}/price` —
  the SPA is same-origin, bundled, and updated in this slice — so making `expectedVersion` required is
  safe. *Owner:* Ivo · *Resolves by:* Phase 3/4 (FE sends it).
- **Assumption:** A spurious `set_version` bump on a `LAYOUT_IN_USE`/`NO_SUCH_ROW` reject is acceptable
  (safe, rare, error path). *Owner:* Ivo · *Resolves by:* review gate (revisit if RV flags it).
- **Open question:** Surface the token on the public map read (chosen) vs a dedicated operator-gated
  `/layout` read? Chose the map read for scope + atomicity (token travels with the exact snapshot);
  revisit if the review gate flags tourist-model pollution. *Owner:* Ivo · *Resolves by:* review gate.
- **Open question:** Should `add/edit/remove-set` also bump `set_version` for counter honesty? Not in
  this slice (FE-dead). *Owner:* Ivo · *Resolves by:* deferred; tracked as a Non-goal.

### Resolved

- **Version-token granularity** — *separate `set_version` counter* (not shared with profile `version`,
  not per-row). Owner decision at the intake grill (AskUserQuestion, this session). Rationale: profile
  writes never touch `set_position`, so a shared token would false-stale unrelated tabs; per-row tokens
  don't survive map-replace's delete+reinsert.

## Availability & concurrency (invariant #2)

> Mandatory — the slice touches the beach map and the `replaceLayout` path that guards availability.
> **#226 adds an orthogonal optimistic lock; it does not change invariant #2.**

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** `replaceLayout`
  only *reads* availability via the `availability::spi` claim probe (`anyClaims`) + `booking::spi`
  (`hasBookings`) to enforce reject-unless-unclaimed; it never writes the availability row. `repriceRow`
  touches only `set_position` price columns.
- **Uniqueness guarantee (unchanged):** `availability(set_id, booking_date)` UNIQUE (invariant #2) and
  the `set_position` layout-integrity constraints (V12) are untouched.
- **Concurrency strategy — two independent locks, correctly ordered:**
  1. **Invariant #2 (existing, preserved):** `lockSetsOfVenue()` `SELECT … FOR UPDATE` on the venue's
     `set_position` rows closes the check-then-delete window so a concurrent booking/availability insert
     can't be silently `ON DELETE CASCADE`-swept.
  2. **#226 (new):** the conditional `UPDATE venue SET set_version = set_version + 1 WHERE id = :id AND
     set_version = :expected` self-serializes operator layout/price edits on the venue PK row.
  - **Ordering rule (R-1):** the `set_version` bump (venue row) is acquired **before** `lockSetsOfVenue`
    (set rows) in `replaceLayout`, matching `repriceRow`'s order (venue row via bump, then `set_position`
    via the reprice UPDATE). One consistent order → no deadlock.
- **Pool rule (#3) / cutoff (#4):** N/A — not affected.
- **Pinning tests:** invariant #2 → existing `BeachMapReplaceIT` concurrent-hold scenarios (AC-8);
  the new `set_version` races → `BeachMapReplaceConcurrencyIT` / `VenueRepriceConcurrencyIT` /
  `VenueSetWriteConcurrencyIT` (AC-1/2/3), all `@RepeatedTest` + `CountDownLatch` start-gate against a
  real Postgres, mirroring `VenueProfileConcurrencyIT`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns venue profiles, the beach map / set positions, pricing, and (since #224) the optimistic-concurrency tokens. |

**Cross-module named interfaces (`api/` ports):** none added or changed. `replaceLayout` continues to
consult `availability::spi` (`SetAvailabilityLookup#anyClaims`) and `booking::spi` (`BookingPresence#hasBookings`) — unchanged.

**Domain events:** none. This slice publishes no event and subscribes to none.

### Module ownership (§4a)

All-in-`venue`, no boundary change. `set_version` (a column on `venue`), its bump on the two set-writes,
and its exposure on the map read are all within the `venue` module's **Job** (venue profiles, beach map,
set positions, pricing). Nothing lands on another module's Not-My-Job list; no capability is newly shared.
`assertOwns` (invariant #13) is consulted via `operator::api` exactly as today.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. Prices are *edited* (integer minor units + ISO currency preserved, invariant #5;
`repriceRow`'s money handling is unchanged), but no charge, refund, payout accrual, or Stripe interaction
is in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` (+ `.html`, `.spec.ts`) | existing | standalone component | signals; new `loadedSetVersion` signal + `errorCode` (STALE_WRITE) | N/A (grid painter) |
| FE-2 | `operator/pricing-tab.ts` (+ `.html`, `.spec.ts`) | existing | standalone component | signals; `loadedSetVersion` + per-row optimistic revert + STALE_WRITE banner | inline row inputs |
| FE-3 | `operator/operator-console.service.ts` | existing | `@Service` HTTP | — | — |
| FE-4 | `operator/operator-console.model.ts` | existing | request/response types | — | — |
| FE-5 | `venue/venue.model.ts` (`VenueMapView`) | existing | read model | — | — |

**Standards:** standalone, `inject()`, signals, `@if`/`@for`; STALE_WRITE detected via
`shared/api-error.ts#problemCodeOf` (the single wire-parse point), **not** status alone — mirroring
`venue-tab`. Token advanced `+1` locally on a successful save so a second consecutive save isn't
falsely rejected. Mocked-a11y e2e per user-facing flow (RV-FE-E2E) in `frontend/e2e/`.

## FE↔BE contract

- **Changed — `PUT /api/venues/{id}/beach-map`:** request body gains **required** `expectedVersion: number`
  (alongside `sets`). Stale → `409 { code: "STALE_WRITE" }`; absent → `400 INVALID_REQUEST`.
- **Changed — `PUT /api/venues/{id}/rows/{rowLabel}/price`:** request body gains **required**
  `expectedVersion: number` (alongside `price`). Stale → `409 STALE_WRITE`; absent → `400`.
- **Changed — `GET /api/venues/{id}` (`VenueMapView`):** response gains `setVersion: number` (the
  layout's optimistic-concurrency stamp; date-independent; tourists ignore it).
- **Client typing:** hand-written typed models in `operator-console.model.ts` / `venue.model.ts`; no `as any`.
- **Money/date on the wire:** unchanged — amounts integer minor units + ISO currency.

## Execution status

> Session-recovery anchor. Re-read before acting after any compaction/fresh session; update in the same
> commit window as the change it records, at every phase + stage boundary.

**Stage pointer:** `implement` — Phases 0 ✅ + 1 ✅ + 2 ✅ done (backend complete; AC-1..8 all pinned green);
Phase 3 next (FE beach-map editor), test-first. **Load the FE routing gate before writing** —
`riviera-frontend` + `angular-developer` + angular-cli MCP + `playwright-cli`.

**Next action:** Start Phase 3 — failing `layout-editor.spec.ts` (a `409 STALE_WRITE` on `replaceLayout`
sets the stale banner, preserves the grid, Reload re-loads; success advances the token `+1`); then add
`setVersion` to the FE `VenueMapView`, `expectedVersion` to the layout request (model + service), capture
`loadedSetVersion`, refuse save without it, STALE_WRITE banner + `reloadAfterStale()`, advance token on save;
mocked-a11y `beach-map-stale-write.e2e.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Migration `V23` + `setVersion` on the map read | ✅ | `feat: add venue.set_version + surface it on the map read (#226)` |
| 1 — Backend `replaceLayout` guard (`bumpSetVersion`, order, STALE_WRITE, required token) | ✅ | `feat: optimistic-lock the beach-map replace on set_version (#226)` |
| 2 — Backend `repriceRow` guard (+ cross-write race) | ✅ | `feat: optimistic-lock the per-row reprice on set_version (#226)` |
| 3 — FE beach-map editor (capture/echo/handle STALE_WRITE + reload) | | |
| 4 — FE pricing tab (same) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | Phase 1 local test run | `SetBookingInfoIT.resolvesBookingInfoForOnlineSet` was order-dependent — its `SELECT … WHERE pool='ONLINE' ORDER BY price_minor DESC LIMIT 1` took the GLOBAL max-priced ONLINE set (shared Testcontainers DB); the new `BeachMapReplaceConcurrencyIT` leaves ~7000-priced ONLINE sets (as would VenueRepriceIT's 5000 reprice), so a class-ordering shift picked one of theirs. | Fixed — scoped the query to `v.name = 'Miramar Beach Club'` (the venue the test already asserts on); order-independent. |

---

## File structure

**Backend (`platform/`)**
- `src/main/resources/db/migration/V23__venue_set_version.sql` — **new**: `ALTER TABLE venue ADD COLUMN
  set_version BIGINT NOT NULL DEFAULT 0` (mirror V22's comment/rationale).
- `venue/vocabulary/VenueMapView.java` — **modify**: add `long setVersion`.
- `venue/adapter/out/JdbcVenueCatalog.java` — **modify**: select `set_version`, map into `VenueMapView`.
- `venue/application/Venues.java` — **modify**: add `int bumpSetVersion(VenueId, long expectedVersion)`;
  widen `replaceLayout`/`repriceRow` port signatures (below) live on `EditBeachMap`.
- `venue/adapter/out/JdbcVenues.java` — **modify**: implement `bumpSetVersion` (conditional UPDATE).
- `venue/application/EditBeachMap.java` — **modify**: `replaceLayout(operator, venueId, expectedVersion,
  LayoutCommand)` and `repriceRow(operator, venueId, expectedVersion, RowPriceCommand)`.
- `venue/application/VenueAdminService.java` — **modify**: bump-first ordering + STALE_WRITE outcomes.
- `venue/application/ReplaceRejection.java` — **modify**: add `STALE_WRITE`.
- `venue/application/SetRejection.java` — **modify**: add `STALE_WRITE` (repriceRow-only, like `NO_SUCH_ROW`).
- `venue/adapter/in/BeachMapLayoutRequest.java` — **modify**: add `Long expectedVersion` + `requiredExpectedVersion()`.
- `venue/adapter/in/RowPriceRequest.java` — **modify**: add `Long expectedVersion` + `requiredExpectedVersion()`.
- `venue/adapter/in/VenueAdminController.java` — **modify**: pass `requiredExpectedVersion()`; map both
  new `STALE_WRITE` arms → `ApiProblem.response(CONFLICT, "STALE_WRITE", …)`.

**Backend tests**
- `venue/BeachMapReplaceConcurrencyIT.java`, `venue/VenueRepriceConcurrencyIT.java`,
  `venue/VenueSetWriteConcurrencyIT.java` — **new** (mirror `VenueProfileConcurrencyIT`).
- `venue/BeachMapReplaceIT.java`, `venue/VenueRepriceIT.java`, `venue/VenueAdminControllerIT.java`,
  `venue/VenueReadControllerIT.java`, `venue/application/VenueAdminServiceTest.java` — **modify**:
  400-missing-token, 409-STALE_WRITE, read-carries-setVersion, token-independence.
- A migration IT asserting `set_version` exists / defaults 0 (extend an existing venue migration IT).

**Frontend (`frontend/`)**
- `src/app/venue/venue.model.ts` — add `setVersion` to `VenueMapView`.
- `src/app/operator/operator-console.model.ts` — add `expectedVersion` to the layout + reprice requests.
- `src/app/operator/operator-console.service.ts` — thread `expectedVersion`; add STALE_WRITE to the error mappers.
- `src/app/operator/layout-editor.ts` / `.html` / `.spec.ts` — capture/echo/handle + reload banner.
- `src/app/operator/pricing-tab.ts` / `.html` / `.spec.ts` — same (per-row revert + banner).
- `e2e/beach-map-stale-write.e2e.ts`, `e2e/pricing-stale-write.e2e.ts` — **new** mocked-a11y specs.

---

## Phase 0 — Migration `V23` + `setVersion` on the map read

**Files:** Create `V23__venue_set_version.sql` · Modify `VenueMapView.java`, `JdbcVenueCatalog.java` · Test `VenueReadControllerIT`, migration IT

- [x] **Step 1:** Failing test — `VenueReadControllerIT.mapReadCarriesSetVersion` asserts `GET
  /api/venues/{seededId}` JSON has `setVersion` (0 for the Miramar seed). Migration assertion
  (`VenueSeedMigrationIT.seedsTheSetVersionOptimisticConcurrencyColumn`) asserts the column exists NOT
  NULL DEFAULT 0 (seed = 0; explicit NULL rejected).
- [x] **Step 2:** Ran the two targeted classes → FAIL (2 failed / 15: `$.setVersion` absent + PSQLException
  no `set_version` column).
- [x] **Step 3:** Added V23; added `long setVersion` to `VenueMapView` (version-last, mirroring
  `VenueProfileView`); selected `set_version` in `JdbcVenueCatalog.findVenueMap` and threaded it through.
- [x] **Step 4:** Two targeted classes → PASS; end-of-phase `--tests "*venue*"` module scope → BUILD SUCCESSFUL.
- [x] **Step 5:** Generalization pass — no new duplicated pattern; the read-model addition is a single site
  (only `JdbcVenueCatalog` constructs `VenueMapView`). The profile read (`findProfile`) deliberately does
  NOT carry `set_version` — the operator tabs source it from the map read (design). Logged.
- [x] **Step 6:** Commit `feat: add venue.set_version + surface it on the map read (#226)`.
- [x] **Step 7:** Update Execution status.

## Phase 1 — Backend `replaceLayout` guard

**Files:** Modify `Venues`, `JdbcVenues`, `EditBeachMap`, `VenueAdminService`, `ReplaceRejection`,
`BeachMapLayoutRequest`, `VenueAdminController` · Test `BeachMapReplaceConcurrencyIT` (new),
`BeachMapReplaceIT`, `VenueAdminControllerIT`

- [x] **Step 1:** Failing tests — `BeachMapReplaceConcurrencyIT.exactlyOneReplaceWins` (AC-1);
  `BeachMapReplaceIT.staleReplaceIs409StaleWrite` (AC-6); `VenueAdminControllerIT.replaceWithoutVersionIs400`
  (AC-5); plus unit `VenueAdminServiceTest.replaceWithStaleSetVersionIsStaleWrite`. Kept the existing
  invariant-#2 in-use scenarios (AC-8).
- [x] **Step 2:** RED confirmed — temporarily disabled the service guard, ran `VenueAdminServiceTest` →
  `replaceWithStaleSetVersionIsStaleWrite` FAILED (1/30), rest green; restored the guard.
- [x] **Step 3:** `bumpSetVersion` (conditional UPDATE on `set_version`); widened `replaceLayout` to take
  `expectedVersion`; **bump-first ordering** (assertOwns → validate → venueExists → duplicateWithin →
  `bumpSetVersion` [STALE_WRITE if 0] → `lockSetsOfVenue` + claim/bookings probe [LAYOUT_IN_USE] →
  delete+insert); added `STALE_WRITE` to `ReplaceRejection`; `requiredExpectedVersion()` on
  `BeachMapLayoutRequest`; controller 409 arm. Updated all `replaceLayout` callers (controller, service,
  `WebSliceStubs`, `VenueAdminServiceTest`/`BeachMapReplaceIT` bodies, `VenueRepriceIT.seedVenue`).
- [x] **Step 4:** Targeted classes → PASS; `--tests "*ModularityTests*" "*JdbcOnlyArchitectureTests*"
  "*PackageShapeArchitectureTests*" "*venue*"` → BUILD SUCCESSFUL (156 tests) after the isolation fix (F-1).
- [x] **Step 5:** Generalization pass — `bumpSetVersion` is one shared helper (replace + reprice both call
  it in Phase 2). `requiredExpectedVersion()` is intentionally duplicated per request record (matches
  #224's `UpdateVenueProfileRequest`); revisit extracting a shared helper in Phase 2 when the 3rd copy
  (`RowPriceRequest`) lands. Logged.
- [x] **Step 6:** Commit `feat: optimistic-lock the beach-map replace on set_version (#226)`.
- [x] **Step 7:** Update Execution status.

## Phase 2 — Backend `repriceRow` guard (+ cross-write race)

**Files:** Modify `EditBeachMap`, `VenueAdminService`, `SetRejection`, `RowPriceRequest`,
`VenueAdminController` · Test `VenueRepriceConcurrencyIT`, `VenueSetWriteConcurrencyIT` (new),
`VenueRepriceIT`, `VenueAdminControllerIT`, `VenueAdminServiceTest`

- [x] **Step 1:** Failing tests — `VenueRepriceConcurrencyIT.exactlyOneRepriceWins` (AC-2);
  `VenueSetWriteConcurrencyIT.replaceAndRepriceCannotBothWin` (AC-3);
  `VenueRepriceIT.staleRepriceIs409StaleWrite` (AC-6); `VenueAdminControllerIT.repriceWithoutVersionIs400`
  (AC-5); token-independence ITs (AC-4); unit `VenueAdminServiceTest.repriceWithStaleSetVersionIsStaleWrite`.
- [x] **Step 2:** RED confirmed — temporarily disabled the reprice guard, ran `VenueAdminServiceTest` →
  `repriceWithStaleSetVersionIsStaleWrite` FAILED (1/31), rest green; restored the guard.
- [x] **Step 3:** Widened `EditBeachMap.repriceRow` to take `expectedVersion` (the outbound
  `Venues.repriceRow` stays 2-arg — the bump is the shared `bumpSetVersion`); order assertOwns →
  venueExists → `bumpSetVersion` [STALE_WRITE if 0] → reprice UPDATE [NO_SUCH_ROW if 0]; added
  `STALE_WRITE` to `SetRejection`; `requiredExpectedVersion()` on `RowPriceRequest`; controller 409 arm.
  Updated callers (controller, `WebSliceStubs`, `VenueAdminServiceTest`, `VenueRepriceIT` bodies).
- [x] **Step 4:** Targeted classes → PASS; structural net (`ModularityTests`/`JdbcOnly`/`PackageShape`/
  `PublishedSurfacePlacement`) + `--tests "*venue*"` → BUILD SUCCESSFUL.
- [x] **Step 5:** Generalization pass — confirmed replace + reprice call ONE shared
  `Venues.bumpSetVersion` (grep: 2 call sites, both writes). `requiredExpectedVersion()` is now a 3rd
  identical copy (profile/layout/price requests) — left duplicated on purpose: a trivial null-check,
  records can't share a base, and it matches #224's per-record idiom; extracting a util would touch the
  #224 profile request for marginal gain. Logged.
- [x] **Step 6:** Commit `feat: optimistic-lock the per-row reprice on set_version (#226)`.
- [x] **Step 7:** Update Execution status.

## Phase 3 — FE beach-map editor

**Files:** Modify `venue.model.ts`, `operator-console.model.ts`, `operator-console.service.ts`,
`layout-editor.ts`/`.html`/`.spec.ts` · Create `e2e/beach-map-stale-write.e2e.ts`

> Load `angular-developer` + angular-cli MCP + `playwright-cli` before editing (routing gate).

- [ ] **Step 1:** Failing unit spec — `layout-editor.spec.ts`: a `409 STALE_WRITE` on `replaceLayout`
  sets the stale banner, preserves the grid, and Reload re-loads; success advances the token `+1`.
- [ ] **Step 2:** `npm test` (scoped) → FAIL.
- [ ] **Step 3:** Add `setVersion` to `VenueMapView`; add `expectedVersion` to `BeachMapLayoutRequest`
  (model + service); capture `loadedSetVersion` on load; refuse save without it; STALE_WRITE banner +
  `reloadAfterStale()` in `.html` (mirror `venue-tab`); advance token on success.
- [ ] **Step 4:** `npm test` (scoped) + `npm run test:a11y` → PASS. Author `beach-map-stale-write.e2e.ts`
  (mocked 409) → `npm run test:e2e` (targeted).
- [ ] **Step 5:** Generalization pass.
- [ ] **Step 6:** Commit `feat(fe): stale-write guard on the beach-map editor (#226)`.
- [ ] **Step 7:** Update Execution status.

## Phase 4 — FE pricing tab

**Files:** Modify `operator-console.service.ts`, `pricing-tab.ts`/`.html`/`.spec.ts` · Create
`e2e/pricing-stale-write.e2e.ts`

- [ ] **Step 1:** Failing unit spec — `pricing-tab.spec.ts`: a `409 STALE_WRITE` on `repriceRow` reverts
  the row's optimistic value, shows the banner, and Reload re-loads; a successful reprice advances the token.
- [ ] **Step 2:** `npm test` (scoped) → FAIL.
- [ ] **Step 3:** Thread `expectedVersion` into `repriceRow` (model + service body `{ price, expectedVersion }`);
  capture `loadedSetVersion`; map `STALE_WRITE` via `problemCodeOf`; banner + reload; advance token on success.
- [ ] **Step 4:** `npm test` + `npm run test:a11y` → PASS; author `pricing-stale-write.e2e.ts` → `npm run test:e2e` (targeted).
- [ ] **Step 5:** Generalization pass.
- [ ] **Step 6:** Commit `feat(fe): stale-write guard on the pricing tab (#226)`.
- [ ] **Step 7:** Update Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-11 | Phase 0 | `VenueMapView` construction sites | `grep "new VenueMapView("` | 1 (`JdbcVenueCatalog`) | None — single site; no duplication to fold. Profile read intentionally omits `set_version`. |
| 2026-07-11 | Phase 1 | `replaceLayout(` call sites (signature widen) | `grep "replaceLayout\("` | 6 test + 3 prod | All updated to the 4-arg signature (incl. `WebSliceStubs`). `bumpSetVersion` is one shared port method (reprice reuses in Phase 2); `requiredExpectedVersion()` left duplicated per record (matches #224). |
| 2026-07-11 | Phase 2 | `repriceRow(` call sites + `bumpSetVersion`/`requiredExpectedVersion` spread | `grep "repriceRow\("` / `grep "requiredExpectedVersion\|bumpSetVersion"` | `EditBeachMap.repriceRow` widened (5 call sites); `bumpSetVersion` = 1 shared method, 2 call sites (both writes); `requiredExpectedVersion()` = 3 identical copies | Widened all `repriceRow` callers. `bumpSetVersion` confirmed shared (no dup). `requiredExpectedVersion()` left duplicated (trivial null-check; matches #224 idiom; records can't share a base). |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..4** (concurrency + independence): `./gradlew test --tests "*ConcurrencyIT*" --tests "*VenueSetWrite*" --tests "*VenueAdminServiceTest*"` → PASS.
- [ ] **AC-5/6** (required + stale): `./gradlew test --tests "*VenueAdminControllerIT*" --tests "*BeachMapReplaceIT*" --tests "*VenueRepriceIT*"` → PASS.
- [ ] **AC-7** (read token): `./gradlew test --tests "*VenueReadControllerIT*"` → PASS.
- [ ] **AC-8** (invariant #2 preserved): existing `BeachMapReplaceIT` in-use scenarios → PASS.
- [ ] **AC-9** (FE): `npm test` + `npm run test:e2e` (the two stale-write specs) → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases (the widened `EditBeachMap` signatures).
- [ ] **No JPA** introduced (invariant #1) — `JdbcClient` + text-block SQL only.
- [ ] **Availability** section filled; invariant #2 unchanged and its concurrent-hold test stays green.
- [ ] Pool + cutoff rules unaffected (invariants #3, #4).
- [ ] **Modulith** section filled; all-in-`venue`, no cross-module `application.*`/`adapter.*` imports; `ModularityTests` green.
- [ ] **Payment/payout** N/A justified; money stays integer minor units (#5).
- [ ] Timezone unaffected (#6); booking codes unaffected (#7).
- [ ] Flyway `V23` present; the new column tested (invariant #12); number verified free.
- [ ] Per-venue authorization intact (invariant #13) — `assertOwns` first on both writes; `CrossVenueDenialIT` green.
- [ ] **Frontend** standards met; STALE_WRITE via `problemCodeOf`; no `as any`; mocked-a11y e2e for both flows.
- [ ] Execution status at HEAD matches reality; findings register has no undecided `open` row.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty or deferred with an issue #.
