# Venue-profile optimistic concurrency Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A venue-profile save from a stale operator tab is rejected with `409 STALE_WRITE`
instead of silently clobbering `booking_mode`/`booking_cutoff`; the read carries a monotonic
`version` token the write echoes back, and exactly one of two concurrent writes off the same
loaded version succeeds.

**Architecture:** Optimistic concurrency on the single-row `venue` write via a monotonic
`version BIGINT` column (Flyway V22). The write is a conditional
`UPDATE venue SET …, version = version + 1 WHERE id = :id AND version = :expectedVersion`;
0 rows-affected (with the venue still present) is the stale-write signal → a new
`ProfileUpdateOutcome.STALE_WRITE` → `409`. Ownership (invariant #13) is asserted **first**,
unchanged — the version guard is *in addition*. **Scope is the profile write only** (owner
decision): the two sibling last-write-wins writes (beach-map replace #172, per-row reprice
#174) mutate `set_position`, not `venue`, so a `venue.version` does not naturally guard them —
they are a deliberate follow-up (see Non-goals + the new follow-up issue).

**Persistence:** JDBC only (invariant #1). Tables/migrations touched: **`venue`** gets a
`version BIGINT NOT NULL DEFAULT 0` column via **`V22__venue_row_version.sql`** (V21 is HEAD;
V22 verified free on `main` and unclaimed — zero open PRs). No new table, no index (the write
already targets the PK).

**Source of intent:** GitHub issue **#224** (surfaced by the `/code-review high` gate on #177 /
O8, PR #223; epic #141 — now closed). #224 is a standalone follow-up, **not** an epic slice.

**Skills consulted (Skill-routing gate):**
- `riviera-sdlc` — routed the stages; issue-intake grill gate before planning.
- `riviera-plan-doc` — this template + the AC/risk/open-question discipline.
- `postgres` — the `version BIGINT` token + the conditional-UPDATE optimistic-lock pattern
  (READ COMMITTED re-evaluates the `WHERE version=:expected` qual after the winner commits →
  the loser updates 0 rows; no extra `FOR UPDATE` needed), `DEFAULT` back-fills existing rows.
- `riviera-modulith` — placement: `ProfileUpdateOutcome` is an internal `venue/application`
  enum (like `SetRejection`); no new `api/`/`spi/`/`events/`, no `allowedDependencies` change —
  all within `venue`.
- `riviera-java-conventions` — typed-outcome enum over exception; a **dedicated**
  `ProfileUpdateOutcome` rather than polluting the shared `SetRejection` (its other users —
  addSet/editSet/reprice/replace — can never be stale); JdbcClient text-block SQL; records.
- `riviera-frontend` — `venue-tab.ts` stays in the `operator/` feature folder; the version is
  a component signal, the STALE_WRITE code maps in the feature's `operator-console.service.ts`.
- `angular-developer` (+ angular-cli MCP at implement time) — signals for `loadedVersion`, the
  409 banner state; keep Signal Forms; the in-repo skill is authoritative on any MCP conflict.
- `playwright-cli` — the stale-write e2e (mocked CI-safe in `frontend/e2e/`, plus a local-only
  real-backend spec).
- `riviera-local-debug` — scoped-test discipline; watch the full-suite-only failure class
  (the `EditVenueProfile` signature change ripples into `WebSliceStubs`, an @WebMvcTest slice).

**Branch:** `feature/venue-profile-optimistic-concurrency` (exists; created off `main` — local
Windows session, so a real feature branch, not a cloud designated-branch substitution).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (stale write rejected, service):** Given the `venue` row's `version` has advanced
  to V+1 since the tab loaded it at V, when the owner calls `EditVenueProfile.updateProfile` with
  `expectedVersion = V`, then the outcome is `ProfileUpdateOutcome.STALE_WRITE` and no profile
  column is changed. *Pinned by:* `VenueAdminServiceTest.updateProfileWithStaleVersionIsStaleWrite`.
- [ ] **AC-2 (exactly one concurrent winner):** Given two writers both loaded the venue at
  `version = V`, when both call `updateProfile(…, expectedVersion = V, …)` concurrently, then
  exactly one returns `APPLIED` (the row ends at `version = V+1` holding that writer's values) and
  the other returns `STALE_WRITE`. *Pinned by:* `VenueProfileConcurrencyIT.exactlyOneWriteWins`.
- [ ] **AC-3 (read carries the token):** Given an owner, when they `GET /api/venues/{id}/profile`,
  then the response body includes the current integer `version`. *Pinned by:*
  `VenueAdminControllerIT.profileReadCarriesVersion`.
- [ ] **AC-4 (current version applies + bumps):** Given the owner loads `version = V`, when they
  `PATCH /api/venues/{id}` with `expectedVersion = V`, then `204` and a subsequent read shows
  `version = V+1` with the edited values. *Pinned by:*
  `VenueAdminControllerIT.profileWriteWithCurrentVersionSucceedsAndBumps`.
- [ ] **AC-5 (stale version → 409 code):** Given the owner loaded `version = V` and the venue has
  since moved to `V+1`, when they `PATCH` with `expectedVersion = V`, then `409` with RFC-7807
  `code = STALE_WRITE`, and `booking_mode`/`booking_cutoff` are unchanged. *Pinned by:*
  `VenueAdminControllerIT.staleVersionPatchIs409` (+ the mode-unchanged assertion covers the #224
  scenario directly).
- [ ] **AC-6 (missing version is 400, never silent v0):** Given a `PATCH` body without
  `expectedVersion`, then `400 INVALID_REQUEST` — it is never treated as `0` (which would match a
  fresh venue and re-open the LWW hole). *Pinned by:*
  `VenueAdminControllerIT.patchMissingExpectedVersionIs400`.
- [ ] **AC-7 (ownership still first):** Given a non-owner operator and a fully valid body (incl.
  `expectedVersion`), when they `PATCH`, then `403 NOT_VENUE_OWNER` — ownership is asserted before
  the version guard. *Pinned by:* `CrossVenueDenialIT.venueProfileEditByNonOwnerIs403` (body
  updated to carry `expectedVersion`) + `ownerCanEditItsOwnVenueProfile` (still `204`).
- [ ] **AC-8 (FE preserves edits on 409):** Given the tab receives `409 STALE_WRITE` on Save, when
  the failure is handled, then the operator's edits remain in the form and a "changed elsewhere —
  reload latest, then re-apply and Save" banner with a **Reload** action is shown (no silent
  discard). *Pinned by:* `venue-tab.spec.ts` (`shows the stale-write banner and keeps edits`) +
  `operator-venue.e2e.ts` (mocked 409).
- [ ] **AC-9 (FE reload re-seeds):** Given the stale banner is shown, when the operator clicks
  **Reload**, then the form re-seeds from the server (latest values + new `version`) and the banner
  clears. *Pinned by:* `venue-tab.spec.ts` (`reload re-seeds from the server`).

## Non-goals

- **Beach-map replace (#172) and per-row reprice (#174) optimistic concurrency.** Owner decision:
  profile-write only this slice. They mutate `set_position`, not `venue`, so they need a
  venue-aggregate version bumped on every child write — a bigger change. Filed as a **follow-up
  issue** (link recorded in Open Questions on creation).
- **Any change to the cutoff or booking-mode *logic*** (invariant #4). This slice only protects
  those fields from a stale-clobber; the reserve path still reads mode/cutoff live.
- **Any change to availability / walk-in semantics** (invariants #2/#3) — untouched.
- **Payment/payout, commission math, refund policy** (#5/#8/#9/#10) — untouched.
- **ETag/If-Match wire format** — owner chose a JSON body `version`/`expectedVersion` field + 409,
  consistent with the codebase (no endpoint uses ETag).
- **A merge/3-way UI** for the 409 — the chosen UX is preserve-edits + explicit Reload, not an
  automatic field-level merge.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — additive concurrency guard; retires/replaces no existing surface.` The profile
read/write endpoints, DTO fields, and FE tab all *gain* a field and a failure path; every existing
behavior (round-trip, replace-semantics, read-only commission, 403/404/400 paths) is preserved and
re-pinned by the existing tests (updated only to carry the new required `expectedVersion`).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two concurrent profile writes off the same version both succeed (double-clobber) | med | high | Conditional `UPDATE … WHERE id AND version=:expected` under READ COMMITTED — winner bumps version, loser re-evals qual → 0 rows → STALE_WRITE. `VenueProfileConcurrencyIT` (RepeatedTest, start-gate) proves exactly-one, mirroring `ConcurrentReservationIT` | Ivo | **resolved** — `VenueProfileConcurrencyIT.exactlyOneWriteWins` green ×5 (1 APPLIED / 1 STALE_WRITE, version→1, winner's name survives) |
| R-2 | 0-rows-affected is ambiguous (no-such-venue vs stale) → wrong status | med | med | Service checks `venueExists` **first** (matching the sibling `editSet`/`reprice` style); after that, `rows == 0` unambiguously means stale. A concurrent delete in the gap reports STALE_WRITE (tab reloads, finds it gone) — acceptable | Ivo | open |
| R-3 | A client omits `expectedVersion` → Jackson primitive default `0` matches a fresh venue → LWW hole re-opens | med | high | `expectedVersion` typed `Long`; `requiredExpectedVersion()` throws `IllegalArgumentException` → `400 INVALID_REQUEST` when null (AC-6) | Ivo | open |
| R-4 | Ownership bypass: version validation throws (400) before the ownership check (403) for a non-owner | low | med | Accepted parse-then-authorize contract (§6b; already how `toCommand()` behaves). A 400 leaks nothing about ownership. `CrossVenueDenialIT` sends a **valid** body (incl. `expectedVersion`) so the 403 genuinely comes from ownership (AC-7) | Ivo | open |
| R-5 | Full-suite-only failure: `EditVenueProfile` signature change (adds `expectedVersion`) breaks the `@WebMvcTest` slices via `WebSliceStubs` | high | med | Update the `WebSliceStubs.editVenueProfile()` stub to the new 4-arg signature + `ProfileUpdateOutcome` return in the same phase; run `*ModularityTests*` + the web-slice tests; confirm on the push's CI run (the O8 catch) | Ivo | open |
| R-6 | Flyway V22 collision (case history #122/#127) | low | high | V22 verified free on `main`; **zero open PRs**, so unclaimed. If a parallel slice merges first, whoever merges second renumbers | Ivo | resolved (no collision) |
| R-7 | Error-contract drift: hand-rolled 409 body instead of `ApiProblem` | low | low | Build the 409 via `ApiProblem.response(CONFLICT, "STALE_WRITE", …)`; `ErrorContractArchitectureTests` guards | Ivo | open |
| R-8 | Sequential-edit tests break (edit 1 bumps the version, edit 2 reuses stale) | high | low | The IT re-reads the version between edits via a `currentVersion(venue)` GET helper (mirrors the FE load-then-save); `profileEditRoundTripsThroughReadApi` updated | Ivo | open |

## Open questions / Assumptions

- **Assumption:** New venues start at `version = 0` (column `DEFAULT 0`; `insertVenue` doesn't set
  it), and the seed (V3 Miramar) back-fills to `0`. The read returns it; the FE echoes it. —
  *Owner:* Ivo · *Resolves by:* Phase 0 (verified by AC-3/AC-4).
- **Resolved:** The follow-up issue for extending optimistic concurrency to beach-map replace
  (#172) + per-row reprice (#174) is filed as **#226** (they mutate `set_position`, not `venue`, so
  they need a venue-aggregate version — a bigger change, deferred by owner decision). — *Owner:*
  Ivo · *Resolved:* 2026-07-11 at merge close-out.

## Availability & concurrency (invariant #2)

`N/A — does not touch availability(set_id, booking_date).` The concurrency here is on the
single-row `venue` write, a different table and a different concern (optimistic lock vs. the
availability claim's `INSERT … ON CONFLICT`). This slice adds **no** write path to
`set_availability`, changes **no** pool/cutoff logic, and cannot double-sell a set. The
`venue.version` guard and invariant #2 are independent. (The concurrency *test discipline* —
`RepeatedTest` + `CountDownLatch` start-gate, real Postgres — is borrowed from
`ConcurrentReservationIT`, but the invariant under test is #224's stale-write, not #2.)

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | Owns venue profiles + the `venue` table; the concurrency token is a column on that row. No other module is involved. |

**Cross-module named interfaces (`api/` ports)**

`N/A — no new/changed cross-module port.` `EditVenueProfile`/`ViewVenueProfile` stay internal
driving ports in `venue/application` (REST-only callers), per invariant #11 — exactly as O8 left
them. The ownership query still goes through `operator.api.VenueOwnership` (unchanged).

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published or consumed.` A stale-write rejection is a synchronous outcome the
caller acts on now (409), not an announced fact.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The `venue.version` concurrency token + version-bump-on-profile-write | `venue` | `venue` **Job:** "Own venue profiles … pricing, booking mode" — the token is a column of the profile row it already owns. Not on any other module's Not-My-Job list; `operator` owns *who may act* (ownership check), not the venue's own data. |
| `ProfileUpdateOutcome` (Applied / NO_SUCH_VENUE / STALE_WRITE) | `venue` | Internal `application`-layer typed outcome for the venue write; not published, not cross-module. |

All in `venue`, no boundary change. `allowedDependencies` unchanged (still
`operator::api` + `operator::vocabulary` for the ownership assert). `ModularityTests` /
`PackageShapeArchitectureTests` / `JdbcOnlyArchitectureTests` must stay green.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The slice touches no money field. Commission (`commission_bps`) and
payout currency remain **read-only and outside the write** (unchanged from O8); the version bump is
integer arithmetic on a counter, no currency/amount involved. Invariant #5 is not at risk.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab.ts` (+ `.html`) | existing | standalone component | Signals: new `loadedVersion` signal; `errorCode` gains `STALE_WRITE`; a `reloadAfterStale()` action | Signal Forms (unchanged) |
| FE-2 | `operator/operator-console.model.ts` | existing | models | — | — (add `version` to `VenueProfileView`, `expectedVersion` to `VenueProfileUpdate`, `STALE_WRITE` to `VenueProfileErrorCode`) |
| FE-3 | `operator/operator-console.service.ts` | existing | HTTP service | — | `venueProfileErrorOf` maps `STALE_WRITE` |
| FE-4 | `operator/venue-tab.spec.ts` / `.a11y.spec.ts` / `.contrast.spec.ts` | existing | specs | — | — (banner: unit + axe/contrast) |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals, no `as any` on the contract. The
409 banner is a plain `@if (errorCode() === 'STALE_WRITE')` block with a Reload `<button>`; the
Reload calls the existing private `load(venueId)` to re-seed. Edits are **not** touched on 409 —
only Reload re-seeds (preserve-edits UX). Contrast/axe specs cover the new banner surface.

## FE↔BE contract

- **Changed endpoints (shape only, no path change):**
  - `GET /api/venues/{venueId}/profile` response gains `version` (integer).
  - `PATCH /api/venues/{venueId}` request gains **required** `expectedVersion` (integer); new
    failure `409` with RFC-7807 `code = STALE_WRITE`.
- **Client typing:** hand-written typed models in `operator-console.model.ts`
  (`VenueProfileView.version: number`, `VenueProfileUpdate.expectedVersion: number`,
  `VenueProfileErrorCode` adds `'STALE_WRITE'`). No `as any`.
- **Money/date on the wire:** unchanged. `version`/`expectedVersion` are plain integers (a row
  counter, not money) — no currency, no minor-units concern.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc | ✅ | afa153f |
| 1 — Migration + read carries the token | ✅ | 4190650 |
| 2 — Conditional write + 409 STALE_WRITE (+ WebSliceStubs & IT bodies) | ✅ | (this commit) |
| 3 — Concurrency IT (headline) | ✅ | (this commit) |
| 4 — Frontend: send version, handle 409, preserve edits + Reload | ✅ | (this commit) |
| 5 — e2e (mocked CI-safe + real-backend) | ✅ | (this commit) |

> **Phase 5 note:** the mocked stale-write e2e (`operator-venue.e2e.ts`) is CI-safe and was run
> green locally (`test:e2e:a11y`, 3/3, + axe over the banner). The real-backend spec
> (`real-backend/venue.e2e.ts`, a two-page concurrent-writer flow) lives in the **local-only**
> suite (never wired into CI, per the two-suite split) — authored and type/lint-clean, executed
> against a running stack locally, not in this session.
>
> **FE behavior added (beyond the literal plan, for correctness):** on a successful save the tab
> advances `loadedVersion` by one (the conditional write bumps the row by exactly one), so the same
> operator saving twice in a row is not spuriously rejected as stale. Pinned by
> `venue-tab.spec.ts` (`a second consecutive save sends the bumped version without a reload`).

> **Sequencing note (execution):** the FE `VenueProfileView` model change (`version: number`)
> is consolidated into **Phase 4** with the rest of the frontend, rather than split into Phase 1
> — the field is not consumed until the tab sends `expectedVersion`, and this keeps Phase 1 a
> backend-only commit and loads the FE skills (`riviera-frontend` + `angular-developer` + the
> angular-cli MCP) once. No AC moves; AC-3 is still pinned by the Phase 1 backend IT.

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as
each phase's code.

**Merge close-out record (2026-07-11):**
- **CI:** green on the PR head (`dc5e76a`) — Backend build+test, Frontend lint+test+build, CodeQL
  (java + js), SonarCloud scan all `success`; the full backend suite passing in CI cleared R-5.
- **Review gate:** `riviera-review-overlay` walked (RV-BE/FE/CT + RV-PROC-1) + an independent
  adversarial correctness pass — **no findings**; `assertOwns`-first (RV-BE-9), JDBC-only, all in
  `venue`, stable `STALE_WRITE` code the FE branches on.
- **Sonar gate:** pulled from the API — new-code coverage **91.5%**, **0** duplicated blocks, **0**
  bugs/vulns/hotspots. One CRITICAL `java:S1192` (the third `"No such venue."` literal) was fixed
  by extracting `NO_SUCH_VENUE_DETAIL` (commit `dc5e76a`) → **0 new issues**.
- **riviera-docs-freshness** over `origin/main...HEAD`: **zero findings** — the venue write
  contract change is additive; no present-tense fact in `CLAUDE.md`/`CONTEXT.md`/`RESPONSIBILITIES.md`/
  ADRs/skills is contradicted (all identifier hits were in historical/current plan records).
- **Follow-up filed:** #226 (optimistic concurrency for beach-map replace #172 + reprice #174).

---

## File structure

- `platform/src/main/resources/db/migration/V22__venue_row_version.sql` — **new**: add
  `version BIGINT NOT NULL DEFAULT 0` to `venue`.
- `platform/…/venue/application/ProfileUpdateOutcome.java` — **new**: enum
  `{ APPLIED, NO_SUCH_VENUE, STALE_WRITE }`.
- `platform/…/venue/application/EditVenueProfile.java` — signature: add `long expectedVersion`;
  return `ProfileUpdateOutcome`.
- `platform/…/venue/application/VenueProfileView.java` — add `long version`.
- `platform/…/venue/application/Venues.java` — `updateVenueProfile(VenueId, long expectedVersion,
  VenueProfileCommand)`; `findProfile` doc note (returns version).
- `platform/…/venue/application/VenueAdminService.java` — assert ownership → `venueExists` →
  conditional update → map to `ProfileUpdateOutcome`.
- `platform/…/venue/adapter/out/JdbcVenues.java` — conditional `UPDATE … version = version + 1
  WHERE id AND version`; `findProfile` SELECTs `version`.
- `platform/…/venue/adapter/in/UpdateVenueProfileRequest.java` — add `Long expectedVersion` +
  `requiredExpectedVersion()`.
- `platform/…/venue/adapter/in/VenueProfileResponse.java` — add `long version`.
- `platform/…/venue/adapter/in/VenueAdminController.java` — pass version; `switch` →
  204 / 404 / 409 STALE_WRITE via `ApiProblem`.
- `platform/…/test/WebSliceStubs.java` — update `editVenueProfile()` stub (4-arg,
  `ProfileUpdateOutcome`).
- `platform/…/test/venue/application/VenueAdminServiceTest.java` — new stale/version cases; fake
  `Venues` gains version-aware `updateVenueProfile` + `findProfile` view arg.
- `platform/…/test/venue/VenueAdminControllerIT.java` — `version` in the round-trip; new
  stale/missing-version cases; `profileBody` gains `expectedVersion`; `currentVersion()` helper.
- `platform/…/test/venue/VenueProfileConcurrencyIT.java` — **new** headline concurrency IT.
- `platform/…/test/CrossVenueDenialIT.java` — `FULL_PROFILE_BODY` gains `expectedVersion`.
- `platform/…/test/venue/BookingModeSwitchIT.java` — PATCH body gains `expectedVersion`.
- `frontend/src/app/operator/operator-console.model.ts` — `version` / `expectedVersion` /
  `STALE_WRITE`.
- `frontend/src/app/operator/operator-console.service.ts` — map `STALE_WRITE`.
- `frontend/src/app/operator/venue-tab.ts` (+ `.html`) — `loadedVersion`, send `expectedVersion`,
  409 banner + `reloadAfterStale()`.
- `frontend/src/app/operator/venue-tab.spec.ts` (+ a11y/contrast) — banner + reload specs.
- `frontend/e2e/operator-venue.e2e.ts` — mocked 409 stale-write spec.
- `frontend/e2e/real-backend/venue.e2e.ts` — real-backend stale-write spec (load, bump via a
  second call, save stale → 409 banner).

---

## Phase 1 — Migration + read carries the token

**Files:** Create `V22__venue_row_version.sql` · Modify `VenueProfileView`, `Venues#findProfile`,
`JdbcVenues#findProfile`, `VenueProfileResponse`, FE `operator-console.model.ts` · Test
`VenueAdminControllerIT.profileReadCarriesVersion`

- [ ] **Step 1: Write the failing test** — `profileReadCarriesVersion`: create a venue, GET
  `/profile`, expect `$.version` == 0 (fresh).
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*VenueAdminControllerIT*"` →
  FAIL (no `version` field).
- [ ] **Step 3: Minimal implementation** — V22 migration; add `version` to `VenueProfileView`
  (record), `JdbcVenues.findProfile` SELECT + `ProfileRow` + view construction, `VenueProfileResponse`
  (+ `from`), and the FE `VenueProfileView` interface (`version: number`). Update the
  `VenueAdminServiceTest` fake `findProfile` view construction to pass a version.
- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*VenueAdminControllerIT*"
  --tests "*VenueAdminServiceTest*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — search other `new VenueProfileView(` sites.
- [ ] **Step 6: Commit** — `feat: venue profile read carries a version token (#224)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — Conditional write + 409 STALE_WRITE

**Files:** Create `ProfileUpdateOutcome` · Modify `EditVenueProfile`, `VenueAdminService`,
`Venues`, `JdbcVenues`, `UpdateVenueProfileRequest`, `VenueAdminController`, `WebSliceStubs`,
`VenueAdminServiceTest`, `VenueAdminControllerIT`, `CrossVenueDenialIT`, `BookingModeSwitchIT`

- [ ] **Step 1: Write the failing tests** — `VenueAdminServiceTest`:
  `updateProfileWithStaleVersionIsStaleWrite` (fake returns 0 rows, venue exists → STALE_WRITE),
  `updateProfileOnUnknownVenueIsNoSuchVenue` (venueExists false → NO_SUCH_VENUE),
  `updateProfileWithCurrentVersionApplies`; `VenueAdminControllerIT`:
  `staleVersionPatchIs409` (+ mode unchanged), `patchMissingExpectedVersionIs400`,
  `profileWriteWithCurrentVersionSucceedsAndBumps`.
- [ ] **Step 2: Run, verify fail** — scoped `--tests "*VenueAdminServiceTest*"
  --tests "*VenueAdminControllerIT*"`.
- [ ] **Step 3: Minimal implementation:**

```java
// venue/application/ProfileUpdateOutcome.java
package ai.riviera.platform.venue.application;

/**
 * The closed set of outcomes of {@link EditVenueProfile#updateProfile} (#224). Dedicated to the
 * profile write — unlike {@link ChangeOutcome}/{@link SetRejection}, it can be {@code STALE_WRITE}
 * (optimistic-concurrency loss), which the beach-map edits can never be. Exhaustive {@code switch}
 * in the controller: {@code APPLIED}→204, {@code NO_SUCH_VENUE}→404, {@code STALE_WRITE}→409.
 */
public enum ProfileUpdateOutcome { APPLIED, NO_SUCH_VENUE, STALE_WRITE }
```

```java
// VenueAdminService.updateProfile
@Override
@Transactional
public ProfileUpdateOutcome updateProfile(OperatorId operator, VenueId venueId,
        long expectedVersion, VenueProfileCommand command) {
    ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13, first & unchanged
    if (!venues.venueExists(venueId)) {
        return ProfileUpdateOutcome.NO_SUCH_VENUE;
    }
    // Conditional on the loaded version: 0 rows ⇒ another writer bumped it since load (stale tab),
    // so reject rather than silently clobber booking_mode/cutoff (#224). Of two writers off the
    // same version, the winner bumps version→+1; the loser's WHERE version=:expected then matches
    // nothing (READ COMMITTED re-evaluates the qual after the winner commits).
    int rows = venues.updateVenueProfile(venueId, expectedVersion, command);
    return rows == 0 ? ProfileUpdateOutcome.STALE_WRITE : ProfileUpdateOutcome.APPLIED;
}
```

```java
// JdbcVenues.updateVenueProfile — conditional UPDATE + version bump
int rows = jdbc.sql("""
        UPDATE venue
        SET name = :name, beach = :beach, region = :region, description = :description,
            booking_mode = :mode, booking_cutoff = :cutoff, distance_to_water_m = :distance,
            version = version + 1
        WHERE id = :id AND version = :version
        """)
        .param(COL_NAME, command.name()) /* … existing params … */
        .param("id", venueId.value())
        .param("version", expectedVersion)
        .update();
if (rows == 0) {
    return 0; // no version match (stale) — amenity set untouched
}
// existing delete-then-insert amenity replace, unchanged
```

```java
// UpdateVenueProfileRequest — add the token (required)
record UpdateVenueProfileRequest(String name, String beach, String region, String description,
        String bookingMode, String bookingCutoff, List<String> amenities, Integer distanceToWaterM,
        Long expectedVersion) {
    long requiredExpectedVersion() {
        if (expectedVersion == null) {
            throw new IllegalArgumentException("expectedVersion is required");
        }
        return expectedVersion;
    }
    // toCommand() unchanged (version is not a profile field)
}
```

```java
// VenueAdminController.updateProfile
@PatchMapping("/{venueId}")
ResponseEntity<?> updateProfile(Authentication authentication, @PathVariable long venueId,
        @RequestBody UpdateVenueProfileRequest request) {
    OperatorId operator = currentOperator.require(authentication);
    return switch (editVenueProfile.updateProfile(operator, new VenueId(venueId),
            request.requiredExpectedVersion(), request.toCommand())) {
        case APPLIED -> ResponseEntity.noContent().build();
        case NO_SUCH_VENUE -> ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_VENUE",
                "No such venue.");
        case STALE_WRITE -> ApiProblem.response(HttpStatus.CONFLICT, "STALE_WRITE",
                "This venue was changed by someone else. Reload and try again.");
    };
}
```

- [ ] Update `WebSliceStubs.editVenueProfile()` → `(_, _, _, _) -> ProfileUpdateOutcome.NO_SUCH_VENUE`.
- [ ] Update `CrossVenueDenialIT.FULL_PROFILE_BODY` and `BookingModeSwitchIT` PATCH body + all
  `VenueAdminControllerIT.profileBody(...)` call sites to carry `expectedVersion`; add a
  `currentVersion(venue)` GET helper and use it for the sequential-edit round-trip.
- [ ] **Step 4: Run, verify pass** — scoped venue tests + `*ModularityTests* *JdbcOnlyArchitectureTests*
  *PackageShapeArchitectureTests* *WebCorsConfigTest* *RateLimit*` (the web-slice surface).
- [ ] **Step 5: Generalization-audit** — grep every `updateProfile(` / `updateVenueProfile(` caller.
- [ ] **Step 6: Commit** — `feat: reject stale venue-profile writes with 409 STALE_WRITE (#224)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — Concurrency IT (headline)

**Files:** Create `VenueProfileConcurrencyIT`

- [ ] **Step 1: Write the failing test** — mirror `ConcurrentReservationIT`: seed a venue + an
  owning operator via SQL; two threads call `editVenueProfile.updateProfile(owner, venue, 0, cmd_i)`
  behind a `CountDownLatch`; assert exactly one `APPLIED` and one `STALE_WRITE`, final `version = 1`,
  and the surviving `name` is the winner's. `@RepeatedTest(5)`, `@EnabledIfDockerAvailable`.
- [ ] **Step 2: Run** (Docker required) — `gradle test --tests "*VenueProfileConcurrencyIT*"`.
- [ ] **Step 3–4:** implementation is Phase 2's guard — this IT should pass once Phase 2 lands;
  if it flakes, that's a real bug in the guard, diagnose with `diagnosing-bugs`.
- [ ] **Step 6: Commit** — `test: prove exactly-one concurrent venue-profile writer (#224)`.

## Phase 4 — Frontend: send version, handle 409, preserve edits + Reload

**Files:** Modify `operator-console.model.ts`, `operator-console.service.ts`, `venue-tab.ts`
(+ `.html`), `venue-tab.spec.ts` (+ a11y/contrast)

- [ ] **Step 1: Write the failing specs** — `venue-tab.spec.ts`:
  `shows the stale-write banner and keeps edits` (mock PATCH → 409 `{code:'STALE_WRITE'}`; assert
  banner shown, form model unchanged), `reload re-seeds from the server` (click Reload → second GET
  seeds new version + values, banner clears), and `save sends the loaded expectedVersion`.
- [ ] **Step 2: Run, verify fail** — `npm test -- venue-tab`.
- [ ] **Step 3: Minimal implementation** — add `version`/`expectedVersion`/`STALE_WRITE` to the
  models; map `STALE_WRITE` in `venueProfileErrorOf`; in `venue-tab.ts` add
  `loadedVersion = signal<number | null>(null)`, set it in `seed()`, include
  `expectedVersion: loadedVersion()!` in the `VenueProfileUpdate`, add a `reloadAfterStale()` that
  calls `load(venueId)` and clears `errorCode`; add the banner + copy in `errorMessage()`. On 409 do
  **not** touch the form (preserve edits).
- [ ] **Step 4: Run, verify pass** — `npm test -- venue-tab` + `npm run test:a11y` + `npm run lint`.
- [ ] **Step 6: Commit** — `feat(fe): venue tab sends version, handles 409 with reload (#224)`.

## Phase 5 — e2e (mocked CI-safe + real-backend)

**Files:** Modify `frontend/e2e/operator-venue.e2e.ts`, `frontend/e2e/real-backend/venue.e2e.ts`

- [ ] Mocked: load profile (version 7), edit a field, mock PATCH → 409 `STALE_WRITE`; assert the
  banner, edits preserved; click Reload → second GET (version 8) re-seeds; assert
  `expectNoSeriousAxeViolations` after the banner animation settles.
- [ ] Real-backend: log in, load `/profile` (version V), change mode via a second authenticated
  call (bumps to V+1), Save from the tab (still V) → 409 banner; Reload → V+1 shown; Save → 204.
- [ ] **Step 6: Commit** — `test(e2e): venue stale-write 409 + reload (#224)`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-11 | Phase 1 (VenueProfileView gains `version`) | `new VenueProfileView(` construction sites | `grep "new VenueProfileView\("` | 2 real (`JdbcVenues.findProfile`, `VenueAdminServiceTest` fake) + the plan doc | Both real sites updated to pass `version`; no other constructor. |
| 2026-07-11 | Phase 2 (`EditVenueProfile`/`Venues.updateVenueProfile` signature change) | every `updateProfile(` / `updateVenueProfile(` caller | `grep "updateProfile\(|updateVenueProfile\("` | port + impl + controller + service + `WebSliceStubs` stub + 4 `VenueAdminServiceTest` calls + fake | All updated to the 4-arg (`expectedVersion`) / 3-arg forms and `ProfileUpdateOutcome`; `WebSliceStubs` (the @WebMvcTest slice, R-5) confirmed green. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-2:** `gradle test --tests "*VenueAdminServiceTest*" --tests "*VenueProfileConcurrencyIT*"` → PASS.
- [ ] **AC-3..AC-7:** `gradle test --tests "*VenueAdminControllerIT*" --tests "*CrossVenueDenialIT*"` → PASS.
- [ ] **AC-8..AC-9:** `npm test -- venue-tab` + `npm run test:a11y` + the mocked e2e → PASS.
- [ ] Structural net: `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases (`EditVenueProfile` 4-arg,
  `ProfileUpdateOutcome`, `Venues#updateVenueProfile` 3-arg, `VenueProfileView`/`Response` version).
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (does not touch `set_availability`); a concurrency IT
  is present for the venue-row guard (invariant #2 discipline mirrored, not the invariant itself).
- [ ] Pool + cutoff *logic* untouched (invariants #3, #4) — only stale-clobber protection.
- [ ] **Modulith** section filled; all in `venue`; no cross-module `application.*`/`adapter.*`
  imports; no new published surface (invariant #11).
- [ ] **Payment/payout** N/A; money untouched; commission still read-only (invariants #5, #9).
- [ ] Timezone/cutoff logic unchanged (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] Flyway V22 present; `version` back-filled by `DEFAULT 0`; guard behavior tested by the
  concurrency IT + controller IT (invariant #12).
- [ ] **Frontend** standards met; no `as any`; edits preserved on 409; a11y/contrast for the banner.
- [ ] `WebSliceStubs` updated for the signature change; full-suite CI checked per push (R-5).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (follow-up issue # recorded).
