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
- [x] **AC-9 (FE preserve-edits + reload):** Given the beach-map editor / pricing tab receives a
  `409 STALE_WRITE` on save, then the operator's in-progress edits are preserved and a "Reload latest"
  affordance is shown (no silent discard, no clobber). *Pinned by:* `layout-editor.spec.ts` ✅ (Phase 3) +
  `pricing-tab.spec.ts` ✅ (Phase 4, unit) and the mocked-a11y e2e — **co-located** in the existing
  `layout-editor.e2e.ts` ✅ (Phase 3) + `operator-pricing.e2e.ts` ✅ (Phase 4), matching #224's placement in
  `operator-venue.e2e.ts` (reuses each surface's `page.route` harness; see Findings F-2).

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
| R-1 | **Deadlock**: replace locks `set_position` (`lockSetsOfVenue`) then venue (bump); reprice locks venue (bump) then `set_position` (reprice UPDATE) → opposite order on the same two resources | med | high | Acquire the **venue row first in BOTH paths**: do the conditional `set_version` bump **before** `lockSetsOfVenue`. Consistent order (venue → its set rows) makes deadlock impossible; the second txn blocks on the venue row and re-reads a bumped `set_version` → `STALE_WRITE`. Proven by AC-3 (replace-vs-reprice race). | Ivo | **Resolved** — bump-first implemented in both writes; `VenueSetWriteConcurrencyIT` green (@RepeatedTest(6)). |
| R-2 | **Spurious `set_version` bump** on a `LAYOUT_IN_USE` (replace) or `NO_SUCH_ROW` (reprice) reject, since the bump preceded the in-use probe / the reprice UPDATE and the txn commits on a value-outcome | med | ~~low~~ **med** | ~~Accepted as safe~~ — **the review (F-4) showed it is NOT safe**: the acting tab advances its token only on success, so a reject that bumped the server token false-conflicts the operator's own next save. | Ivo | **Resolved (review-fix, F-4)** — the "extra pre-probe read" the plan deferred is now the design: `lockAndReadSetVersion` (FOR UPDATE, R-1 order) checks the version, and `incrementSetVersion` runs ONLY after the write commits. No spurious bump; regression ITs (`rejectsWhenVenueHasBooking`, `unknownRowIsNotFound`) assert `set_version` is unchanged on a reject. |
| R-3 | **Wire-contract break**: `expectedVersion` now **required** on two existing endpoints → `400` for a client that omits it | low | med | Same-slice FE update sends it; the SPA is same-origin & bundled with the backend (no external API consumers). `Long` (not primitive) so absent = `null` = 400, never a silent `0` (mirrors #224). | Ivo | **Resolved** — FE (Phases 3/4) sends `expectedVersion` on both writes; `…WithoutVersionIs400` ITs green. No external consumers. |
| R-4 | **Flyway collision** on `V23` | low | high | Verified `V23` free on `main` (latest is V22) **and** no open PRs claim it. If a parallel slice merges first, this branch renumbers (default: merges second) + merge-from-main before PR. | Ivo | **Resolved** — `V23__venue_set_version.sql` added; `git log` confirms latest on `main` is V22; migration IT green. Re-check before merge if a parallel Flyway slice lands first. |
| R-5 | **Invariant-#2 regression** from reordering: the `FOR UPDATE` claim-probe now runs after the venue-row lock | low | high | `lockSetsOfVenue` + the claim/bookings probe still run **before** any `deleteAllSets`; existing `BeachMapReplaceIT` invariant-#2 (concurrent-hold) scenarios must stay green (AC-8). | Ivo | **Resolved** — the claim probe still precedes `deleteAllSets`; `BeachMapReplaceIT` in-use + `concurrentWalkInMarkAndReplace…` (@RepeatedTest) stay green with the bump-first order. |
| R-6 | **BOLA / invariant #13** on the venue-scoped writes | low | high | Unchanged: `assertOwns` stays the first act of both `replaceLayout` and `repriceRow` (application service, not controller). The new map read carrying `setVersion` is the already-public tourist read (a non-sensitive counter) — no authz change. Pinned by existing `CrossVenueDenialIT`. | Ivo | **Resolved** — `assertOwns` unchanged as the first act; unit tests assert `bumpedSetVersions == 0` on a non-owner (fail-closed before the bump). `CrossVenueDenialIT` confirmed on CI (full suite). |
| R-7 | **Error-contract drift**: new 409s must be centralized `ProblemDetail` with `code = STALE_WRITE`, not a per-controller body (§6b) | low | med | Reuse `ApiProblem.response(CONFLICT, "STALE_WRITE", <friendly msg>)`; the FE reads `code` via `problemCodeOf` (not status alone), exactly as `venue-tab` does. | Ivo | **Resolved** — both 409 arms use `ApiProblem.response(CONFLICT, "STALE_WRITE", …)`; FE maps via `layoutErrorOf`/`repriceErrorOf` (`problemCodeOf`, not status). `ErrorContractArchitectureTests` green (CI). |

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
  2. **#226 (new, revised at the review gate — F-4):** `lockAndReadSetVersion()` =
     `SELECT set_version FROM venue WHERE id = :id FOR UPDATE` takes the venue PK-row write lock and reads
     the current token; the service compares it to `expectedVersion` (mismatch ⇒ STALE_WRITE). The token
     is advanced by a **separate** `incrementSetVersion()` (`UPDATE venue SET set_version = set_version + 1
     WHERE id`) **only on the success path** — so a rejected write (LAYOUT_IN_USE / NO_SUCH_ROW) never
     spuriously advances it and self-conflicts the acting tab's retry. (The original single conditional
     `UPDATE … WHERE set_version = :expected` bumped even on a reject — the R-2 defect the review caught.)
  - **Ordering rule (R-1):** `lockAndReadSetVersion` (venue row FOR UPDATE) is acquired **before**
    `lockSetsOfVenue` (set rows) in `replaceLayout`, matching `repriceRow`'s order (venue row first, then
    `set_position` via the reprice UPDATE). One consistent order → no deadlock. STALE_WRITE still holds
    under READ COMMITTED: the loser blocks on the venue FOR UPDATE lock, then reads the winner's advanced
    token → mismatch.
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

**Stage pointer:** `CI` ✅ **green** — PR #228, run 2 (`ec9c2a9`): Backend + Frontend + CodeQL +
SonarCloud all `success`. Sonar strict merge bar met (queried directly): **0 new issues** (0 blocker/
critical/major/hotspots), **0.0% new duplicated lines**, **89.53% new-code coverage** (≥80%), 0 unresolved
PR issues, 310 new lines. Run 1 caught F-3 (`CrossVenueDenialIT`) — fixed + re-pushed. Lesson: run
`*CrossVenueDenialIT*` (+ cross-cutting `platform`-package ITs) whenever a venue-scoped request contract
changes — the `*venue*` filter doesn't match them.

**Stage: `review` ✅ done** — `/code-review` high (workflow, 16 agents) + `riviera-review-overlay`. 6
correctness findings, 0 refuted (F-4). Owner chose "fix all 4": backend increment-on-success (no spurious
bump, R-2 resolved) + 3 FE robustness fixes (reload-then-replace, load-failed feedback, pricing
serialization) + regression tests. All green locally (unit + concurrency/reject ITs + structural net + FE
unit/lint/build/e2e). Open item (setVersion on the public map read): the review did NOT object — a
non-sensitive counter on the already-public read; kept. Cleanup findings (triplicated banner/helper,
unreachable CONFLICT) deferred with rationale. **Next: re-push → re-green CI → squash-merge PR #228 + close #226.**

**Next action:** Push `feature/set-version-concurrency` + open the PR (refs #226; follow-up to #224/PR #225).
Watch CI: (1) the full backend suite may surface a shared-state failure a scoped run can't (riviera-local-debug);
(2) confirm the mocked e2e passes headless in CI (the local runs hit a Windows ng-serve teardown port squat,
not a code issue). At the review gate, surface the deliberate design choices in Open questions (public map
read carries `setVersion`; accepted spurious bump on LAYOUT_IN_USE/NO_SUCH_ROW; per-component FE banner).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Migration `V23` + `setVersion` on the map read | ✅ | `feat: add venue.set_version + surface it on the map read (#226)` |
| 1 — Backend `replaceLayout` guard (`bumpSetVersion`, order, STALE_WRITE, required token) | ✅ | `feat: optimistic-lock the beach-map replace on set_version (#226)` |
| 2 — Backend `repriceRow` guard (+ cross-write race) | ✅ | `feat: optimistic-lock the per-row reprice on set_version (#226)` |
| 3 — FE beach-map editor (capture/echo/handle STALE_WRITE + reload) | ✅ | `feat(fe): stale-write guard on the beach-map editor (#226)` |
| 4 — FE pricing tab (same) | ✅ | `feat(fe): stale-write guard on the pricing tab (#226)` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | Phase 1 local test run | `SetBookingInfoIT.resolvesBookingInfoForOnlineSet` was order-dependent — its `SELECT … WHERE pool='ONLINE' ORDER BY price_minor DESC LIMIT 1` took the GLOBAL max-priced ONLINE set (shared Testcontainers DB); the new `BeachMapReplaceConcurrencyIT` leaves ~7000-priced ONLINE sets (as would VenueRepriceIT's 5000 reprice), so a class-ordering shift picked one of theirs. | Fixed — scoped the query to `v.name = 'Miramar Beach Club'` (the venue the test already asserts on); order-independent. |
| F-2 | Phase 3 (planning deviation) | The plan's File-structure lists new `beach-map-stale-write.e2e.ts` / `pricing-stale-write.e2e.ts`. #224 instead co-located its stale-write e2e in the surface's existing spec (`operator-venue.e2e.ts`), reusing its `page.route` mock harness. A separate file would duplicate the whole sign-in + venue-map + PUT mock. | Deviation accepted — co-located the stale-write test in `layout-editor.e2e.ts` (Phase 3) and will do the same in `operator-pricing.e2e.ts` (Phase 4). Made each `mock*` harness stateful on `setVersion` (a `bump()`), mirroring #224. No new e2e files. |
| F-3 | CI (backend full suite, PR #228 run 1) | `CrossVenueDenialIT.beachMapLayoutReplaceByNonOwnerIs403` + `.rowRepriceByNonOwnerIs403` FAILED (2/542): their non-owner bodies omit `expectedVersion`, so `requiredExpectedVersion()` throws **400** before the service's `assertOwns` (parse-then-authorize) → the test's expected **403** never fires. `CrossVenueDenialIT` is in the `platform` package, so my `*venue*` scoped runs missed it (the plan named it as the #13 pin — my miss). | Fixed — added `"expectedVersion":0` to both bodies so they parse and the 403 is genuinely from ownership, mirroring `#224`'s `FULL_PROFILE_BODY`. `CrossVenueDenialIT` green locally; grep confirmed only 4 test files hit these endpoints (the other 3 already updated). Re-pushed. |
| F-4 | Review gate (`/code-review` high, workflow) | 6 correctness findings (0 refuted). **Dominant:** the bump-first-then-reject (R-2) persisted the `set_version` bump on a `LAYOUT_IN_USE`/`NO_SUCH_ROW` reject (the `@Transactional` method commits on the value-return), and the FE advances its token only on success — so the **acting operator's own next save** falsely 409s STALE_WRITE (R-2's "only makes other tabs reload" was wrong). Plus FE: `reloadAfterStale` cleared the grid before the async reload (data loss on a failed reload), Save silently no-op'd on a null token (failed initial load), and the pricing tab had no in-flight guard (rapid two-row edits race). Also cleanup (triplicated banner/helper, unreachable CONFLICT). | **Fixed all 4** (owner chose "fix all"): backend now **increments `set_version` only on the success path** (`lockAndReadSetVersion` FOR UPDATE first for R-1 order + version check, `incrementSetVersion` after the write) — no spurious bump; regression ITs assert a reject leaves `set_version` unchanged. FE: `reloadAfterStale` reloads-then-replaces (keeps grid + token + banner on failure, retry hint), Save surfaces a load-failed message on a null token, pricing serializes reprices (inputs disabled in-flight + guard). Cleanup deferred (documented). Re-pushed. |

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

- [x] **Step 1:** Failing unit spec — `layout-editor.spec.ts`: a `409 STALE_WRITE` on `replaceLayout`
  sets the stale banner, preserves the grid, and Reload re-loads; success advances the token `+1`. Also
  asserted `expectedVersion` in the save PUT.
- [x] **Step 2:** Ran scoped `layout-editor.spec.ts` → FAIL (3/10: expectedVersion undefined, stale-banner
  null, token-advance undefined).
- [x] **Step 3:** Added optional `setVersion` to the FE `VenueMapView`; required `expectedVersion` to
  `BeachMapLayoutRequest` + `STALE_WRITE` to `LayoutErrorCode`/`layoutErrorOf`; captured `loadedSetVersion`
  on load (refuse save without it); STALE_WRITE banner + `reloadAfterStale()` in `.html` (mirrors
  `venue-tab`); advance token on success.
- [x] **Step 4:** `layout-editor.spec.ts` → PASS (10); whole `operator/**` folder → 194 PASS (incl.
  a11y/contrast + service spec); `npm run lint` clean; `npm run build` clean. Stale-write mocked-a11y e2e
  authored in `layout-editor.e2e.ts` (co-located, F-2) → `test:e2e:a11y` (targeted) → 3 PASS incl. axe.
- [x] **Step 5:** Generalization pass — the FE stale-write shape (`loadedVersion`/`errorCode` signals +
  `reloadAfterStale()` + the amber banner markup) is now in `venue-tab` + `layout-editor` (pricing = 3rd
  in Phase 4). Left per-component (matches #224's `venue-tab`; banner copy differs per surface). A shared
  `<app-stale-write-banner>` with a projected message is a candidate if the 3rd copy makes it worth it —
  revisit in Phase 4. Logged.
- [x] **Step 6:** Commit `feat(fe): stale-write guard on the beach-map editor (#226)`.
- [x] **Step 7:** Update Execution status.

## Phase 4 — FE pricing tab

**Files:** Modify `operator-console.service.ts`, `pricing-tab.ts`/`.html`/`.spec.ts` · Create
`e2e/pricing-stale-write.e2e.ts`

- [x] **Step 1:** Failing unit spec — `pricing-tab.spec.ts`: a `409 STALE_WRITE` on `repriceRow` reverts
  the row's optimistic value, shows the banner, and Reload re-loads; a successful reprice advances the
  token. Also asserted `expectedVersion` in the reprice PUT body.
- [x] **Step 2:** Ran scoped `pricing-tab.spec.ts` → FAIL (3/12: exact body missing `expectedVersion`,
  stale-banner null, token-advance undefined).
- [x] **Step 3:** Threaded `expectedVersion` into `repriceRow` (service body `{ price, expectedVersion }`;
  `RepriceErrorCode` + `repriceErrorOf` gain `STALE_WRITE`); captured `loadedSetVersion` from the map read;
  a `STALE_WRITE` sets a venue-level `staleConflict` banner (not the per-row inline error) and reverts the
  row; `reloadAfterStale()` re-loads prices + token; advance token on success.
- [x] **Step 4:** `pricing-tab.spec.ts` → 12 PASS; whole `operator/**` → 196 PASS (incl. a11y/contrast);
  `npm run lint` clean; `npm run build` clean. Stale-write mocked-a11y e2e co-located in
  `operator-pricing.e2e.ts` (F-2) → `test:e2e:a11y` (targeted) → 3 PASS incl. axe.
- [x] **Step 5:** Generalization pass — the FE stale-write shape is now in 3 components (venue-tab,
  layout-editor, pricing-tab). Left per-component (banner copy + reload handler differ per surface; a
  shared `<app-stale-write-banner>` would touch #224's venue-tab). Logged as a deferred refactor candidate.
- [x] **Step 6:** Commit `feat(fe): stale-write guard on the pricing tab (#226)`.
- [x] **Step 7:** Update Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-11 | Phase 0 | `VenueMapView` construction sites | `grep "new VenueMapView("` | 1 (`JdbcVenueCatalog`) | None — single site; no duplication to fold. Profile read intentionally omits `set_version`. |
| 2026-07-11 | Phase 1 | `replaceLayout(` call sites (signature widen) | `grep "replaceLayout\("` | 6 test + 3 prod | All updated to the 4-arg signature (incl. `WebSliceStubs`). `bumpSetVersion` is one shared port method (reprice reuses in Phase 2); `requiredExpectedVersion()` left duplicated per record (matches #224). |
| 2026-07-11 | Phase 2 | `repriceRow(` call sites + `bumpSetVersion`/`requiredExpectedVersion` spread | `grep "repriceRow\("` / `grep "requiredExpectedVersion\|bumpSetVersion"` | `EditBeachMap.repriceRow` widened (5 call sites); `bumpSetVersion` = 1 shared method, 2 call sites (both writes); `requiredExpectedVersion()` = 3 identical copies | Widened all `repriceRow` callers. `bumpSetVersion` confirmed shared (no dup). `requiredExpectedVersion()` left duplicated (trivial null-check; matches #224 idiom; records can't share a base). |
| 2026-07-11 | Phase 3 | FE stale-write shape (`loadedVersion` signal + `reloadAfterStale()` + amber banner) | reviewed `venue-tab` vs `layout-editor` | 2 copies (venue-tab, layout-editor); pricing-tab = 3rd in Phase 4 | Left per-component (matches #224's `venue-tab`; per-surface copy). Candidate: a shared `<app-stale-write-banner>` with a projected message — revisit in Phase 4 if the 3rd copy warrants it. |
| 2026-07-11 | Phase 4 | FE stale-write banner (now 3 copies) + e2e `mock*` setVersion-stateful harness | reviewed the 3 tabs + 2 e2e mocks | 3 banner copies (venue-tab/layout-editor/pricing-tab); 2 stateful e2e mocks (mockEditor/mockPricing mirror mockVenue) | Banner left per-component — deferred `<app-stale-write-banner>` extraction to a follow-up (touches #224's venue-tab; per-surface copy + revert semantics differ: layout keeps the grid, pricing reverts the row). The e2e `bump()` pattern is intentionally mirrored per-surface (each owns its `page.route` harness), matching #224. |

---

## Acceptance-criteria verification (final)

All run locally (Docker available, so the Testcontainers ITs executed); CI re-runs the full suite.

- [x] **AC-1..4** (concurrency + independence): `*ConcurrencyIT*` (`BeachMapReplace`/`VenueReprice`/
  `VenueProfile`), `*VenueSetWriteConcurrencyIT*`, `*VenueAdminServiceTest*`, token-independence in
  `*VenueAdminControllerIT*` → PASS.
- [x] **AC-5/6** (required + stale): `*VenueAdminControllerIT*` (`replace`/`repriceWithoutVersionIs400`),
  `*BeachMapReplaceIT*` (`staleReplaceIs409StaleWrite`), `*VenueRepriceIT*` (`staleRepriceIs409StaleWrite`) → PASS.
- [x] **AC-7** (read token): `*VenueReadControllerIT*` (`mapReadCarriesSetVersion`) + `*VenueSeedMigrationIT*` → PASS.
- [x] **AC-8** (invariant #2 preserved): existing `BeachMapReplaceIT` in-use + concurrent-hold scenarios (stay green with the bump-first order) → PASS.
- [x] **AC-9** (FE): `npm test` (`layout-editor.spec.ts` 10, `pricing-tab.spec.ts` 12; operator folder 196) +
  `npm run test:e2e:a11y` (the two co-located stale-write specs, incl. axe) → PASS.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-1..9 pinned; see AC-verification-final).
- [x] No placeholders / TODO / TBD in the doc.
- [x] Type & method-signature consistency across phases (widened `EditBeachMap.replaceLayout`/`repriceLayout`
  + FE `repriceRow`; all callers updated, backend compiles + FE builds clean).
- [x] **No JPA** introduced (invariant #1) — `JdbcClient` + text-block SQL only (`JdbcOnlyArchitectureTests` green).
- [x] **Availability** section filled; invariant #2 unchanged and its concurrent-hold test (`concurrentWalkInMarkAndReplace…`) stays green.
- [x] Pool + cutoff rules unaffected (invariants #3, #4).
- [x] **Modulith** section filled; all-in-`venue`, no cross-module `application.*`/`adapter.*` imports; `ModularityTests`/`PackageShape`/`PublishedSurfacePlacement` green.
- [x] **Payment/payout** N/A justified; money stays integer minor units (#5).
- [x] Timezone unaffected (#6); booking codes unaffected (#7).
- [x] Flyway `V23` present; the new column tested (`VenueSeedMigrationIT`, invariant #12); number verified free (latest on `main` is V22).
- [x] Per-venue authorization intact (invariant #13) — `assertOwns` first on both writes (unit: no bump on non-owner); `CrossVenueDenialIT` green (CI full suite).
- [x] **Frontend** standards met; STALE_WRITE via `problemCodeOf` (the `*ErrorOf` mappers); no `as any` (lint clean); mocked-a11y e2e for both flows.
- [x] Execution status at HEAD matches reality; findings register has no undecided `open` row (F-1 fixed, F-2 accepted).
- [x] Risk register has no stale `open` rows (R-1..R-7 all Resolved/Accepted); Open Questions: the map-read-vs-`/layout` choice is **deferred to the review gate** (to flag), not an issue # — the rest are resolved/non-goals.
