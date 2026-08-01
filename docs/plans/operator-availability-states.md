# Operator per-set availability states (fix the walk-ins over-count) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The operator console stops mislabeling an unpaid online hold as a walk-in — the
Daily-view tile for a `BOOKED_ONLINE` hold renders locked (never ✓ tap-to-release) and the
stats strip's Walk-ins tile counts exactly the `STAFF_MARKED` rows — by giving the owner an
authoritative per-set state read for a `(venue, date)` (issue #207).

**Architecture:** Extend the existing dependency-inverted `venue.spi.SetAvailabilityLookup`
(declared in `venue`, implemented by `availability` — the #44 seam) with a per-state lookup,
and let `venue` compose it with the set list it owns into a new **operator-only, owner-asserted**
read `GET /api/venues/{venueId}/availability?date=` — mirroring how `findVenueMap` already
overlays availability onto the layout. The issue's literal "server-side STAFF_MARKED count"
under-fixes: the Daily view classifies **individual tiles**, so the read must be per-set, and a
count is then a client-side `filter().length` over exact states, not a heuristic. The tourist
map read stays byte-identical (`FREE`/`TAKEN` — hold-type never leaks to the public surface).

**Persistence:** JDBC only (invariant #1). **No schema change, no Flyway migration** — one new
read on `set_availability`, served by the existing `UNIQUE(set_id, booking_date)` index.

**Source of intent:** GitHub issue #207 (bug, area:fullstack); interim degradation shipped in
#171 (O2); `docs/plans/o2-console-stats-strip.md` R-7 deferred the precise read to this slice.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
staff-daily is retired and the second surface is now `shared/availability-grid.ts` via the O5
Daily view, and that a bare count endpoint cannot fix per-tile classification) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger for the tile-semantics
change) · `tdd` (each phase red-green at the smallest seam) · `riviera-review-overlay` (review
gate — runs at ready-for-review) · `riviera-docs-freshness` (ran over the merge range at
close-out — 1 finding: the RESPONSIBILITIES.md `venue`/`availability` §s needed the new SPI
method + read recorded, patched in the PR) · `riviera-modulith` (placed the read: SPI extension
on the existing #44 inversion, composition + endpoint in `venue`, no new grants — both
`availability → venue::spi` and `venue → operator::api` edges already exist) ·
`codebase-design` (kept one deep seam — extended `SetAvailabilityLookup` instead of a new
port/api surface; two adapters already sit at it) · `postgres` (confirmed the state read is
covered by the existing `(set_id, booking_date)` unique index — no new index) ·
`riviera-frontend` (placement: service method + model in `operator/`, derivation stays in
`shared/availability-grid.ts`, spec in the CI-safe mocked e2e suite) · `riviera-java-conventions`
(records for views, package-private adapters/controllers, typed-outcome reads; loaded at
implement before Java was written) · `angular-developer` + angular-cli MCP (v22 signals idioms
for the changed components; loaded at the FE phase) · `playwright-cli` (the mocked-suite spec
authoring; loaded at the e2e phase) · `riviera-local-debug` (cloud-session gradle/npm recipe +
scoped-test discipline; loaded before the first build).

**Branch:** `claude/sdlc-207-staleness-check-1es4yd` — the session's designated remote branch
stands in for `bugfix/operator-availability-states` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given set S of venue V is claimed `BOOKED_ONLINE` for date D (its booking still
  `AWAITING_PAYMENT` or `PENDING_REQUEST`), when the availability lookup is asked for the states
  of V's sets on D, then S maps to `BOOKED_ONLINE` and a staff-marked set maps to `STAFF_MARKED`
  and a free set is absent. *Pinned by:* `AvailabilityLookupIT.statesOnReportsPerSetState`
- [ ] **AC-2:** Given operator O owns venue V with a booked-online hold, a staff mark, and a free
  set on date D, when O asks the venue read model for V's daily availability on D, then exactly
  the two held sets are returned with their states. *Pinned by:*
  `DailyAvailabilityServiceTest.returnsPerSetStatesForOwnedVenue`
- [ ] **AC-3:** Given operator O does **not** own venue V, when O asks for V's daily availability,
  then the read is rejected `NOT_VENUE_OWNER` (403) **before any venue-existence disclosure**.
  *Pinned by:* `CrossVenueDenialIT` (new endpoint row) +
  `DailyAvailabilityServiceTest.deniesNonOwnerBeforeExistenceCheck`
- [ ] **AC-4:** Given no authenticated operator session, when `GET /api/venues/{id}/availability`
  is called, then it is denied by the role gate (401), never served publicly. *Pinned by:*
  `EndpointRoleGateCoverageTest` (matcher coverage) + `VenueAdminControllerIT.dailyAvailabilityRequiresOperator`
- [ ] **AC-5:** Given the Daily view shows a set held `BOOKED_ONLINE` whose booking is unpaid,
  when the grid derives tile state from the server states, then the tile is locked "booked
  online" (dot glyph, no tap action) — not ✓ walk-in. *Pinned by:*
  `availability-grid.spec.ts` (deriveTileStates from states map) + `daily-view-tab.spec.ts`
- [ ] **AC-6:** Given the stats strip's availability read resolves with one `STAFF_MARKED` and
  two `BOOKED_ONLINE` rows, when the Walk-ins tile renders, then it shows exactly 1; given the
  read fails, it renders "—", never a phantom count. *Pinned by:* `console-stats-strip.spec.ts`
- [ ] **AC-7:** The tourist map response is byte-identical (`FREE`/`TAKEN`, no state tokens).
  *Pinned by:* existing `VenueReadControllerIT` (unchanged, still green; no diff on the tourist path)
- [ ] **AC-8:** Given the mocked e2e console with an unpaid hold, a walk-in mark, and free sets,
  when the operator opens the Daily view, then the hold tile is locked, the marked tile is
  releasable, and the strip's Walk-ins count is exact. *Pinned by:*
  `frontend/e2e/operator-console-daily.e2e.ts` (extended)

## Non-goals

- No change to the tourist map read/shape (`GET /api/venues/{id}?date=`) — hold-type stays private.
- No change to any `set_availability` **write** path (claim, mark, release) or to invariant-#2 machinery.
- No TTL/sweep changes — the drift *window* (15m Instant / up-to-24h Request) is bounded elsewhere (#51/#98).
- No "Booked online" tile semantic change: it stays the **CONFIRMED** count (money-adjacent, correct today).
- No `ConsoleVenueMap` (#486) snapshot redesign — the Free tile keeps its existing map source.
- No backfill of `walkIns = taken − booked` anywhere else; the derivation is deleted, not relocated.

## Behavior-parity ledger (replacement of the client-side derivation)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Daily view: TAKEN set with a CONFIRMED booking renders `BOOKED_ONLINE` (locked) | preserved | server state `BOOKED_ONLINE` → same tile |
| Daily view: TAKEN set **without** a CONFIRMED booking renders `STAFF_MARKED` (✓, tap-to-release) | **changed — the bug** | unpaid online holds now render `BOOKED_ONLINE` locked; genuine staff marks still `STAFF_MARKED` (server state) |
| Daily view: optimistic override wins until reconcile | preserved | `deriveTileStates` keeps overrides as the first clause; reconcile re-reads map + bookings **+ states** |
| Daily view: mis-tap release on an online-held tile is a safe server no-op | preserved (now unreachable) | server still deletes only `STAFF_MARKED` rows; the UI no longer offers the tap at all |
| Daily view: arrivals card lists CONFIRMED bookings with codes | preserved | `dailyBookings` read unchanged |
| Strip: walk-ins `= max(0, total − free − bookedOnline)` | **changed — the bug** | `walkIns = states.filter(s ⇒ s.state === 'STAFF_MARKED').length` from the new read |
| Strip: walk-ins renders "—" until/unless the backing read resolves | preserved | same guard, now keyed on the states read instead of the bookings read |
| Strip: Free today `{free}/{total}` from the shell's shared map snapshot | preserved | untouched (#486 design) |
| Strip: Booked online = CONFIRMED count; takings server-computed | preserved | reads unchanged |
| Strip: venue-switch epoch guard resets tiles (#180) | preserved | new read joins the same epoch pattern |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The new operator GET falls through to the public `GET /api/venues/**` `permitAll` (the #316/#317/#328 failure class) | med | high | matcher `/api/venues/*/availability` registered **before** the public venue GET; `EndpointRoleGateCoverageTest` fails the build if unlisted; explicit 401 IT | agent | open |
| R-2 | BOLA: a non-owner reads another venue's hold pattern (invariant #13) | med | high | `assertOwns` first statement of the application service, **before** existence check (`403` outranks `404`); `CrossVenueDenialIT` row | agent | open |
| R-3 | FE: map read and states read race → tile flicker/misclassification between reads | low | med | both reads join the existing `forkJoin` (loaded flips once **all** settle); states are the sole classification source; reconcile re-reads all three | agent | open |
| R-4 | Strip shows walk-ins from a fresh read beside a Free tile from the #486 cached snapshot → momentary cross-tile inconsistency | med | low | accepted + documented in the strip's TSDoc: each tile names its source; walk-ins correctness is the issue's point; Free-tile freshness unchanged from today | agent | open |
| R-5 | Sonar gate: <80% new-code coverage or duplication on the twin FE load paths | med | med | unit specs per changed file; IT per backend class; pull the Sonar issue list via API before merge (pr-gates §2) | agent | open |
| R-6 | Mocked e2e fixtures drift from the new endpoint (suite fails or silently mocks 404) | med | med | extend the console e2e support mocks with the `/availability` route in the same phase as the spec | agent | open |
| R-7 | Error contract drift: new endpoint invents a per-controller error body | low | med | RFC-7807 via `ApiProblem`/`ApiErrorHandler` like the sibling reads; 404 `NO_SUCH_VENUE` via Optional-empty mapping (§6b) | agent | open |

## Open questions / Assumptions

- **Assumption:** the sparse wire shape (only held sets returned; absent ⇒ free) is sufficient
  for both consumers — the map supplies the full set list. — *Owner:* agent · *Resolves by:* phase 3 (FE consumes it)
- **Assumption:** `VenueAdminController` is the right host for the endpoint (it already serves the
  owner-scoped profile GET); no new controller needed. — *Owner:* agent · *Resolves by:* phase 2
- **Open question:** none.

## Availability & concurrency (invariant #2)

**Read-only slice.** No new writer of `availability(set_id, booking_date)`; every write path
(online claim, staff mark/release, cancellation release, request decline/expiry/withdraw
release, abandoned-payment sweep) is untouched.

- **Write paths in scope:** none.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)`.
- **Concurrency strategy:** the new read is a plain snapshot `SELECT set_id, state … WHERE
  booking_date = :date AND set_id IN (:ids)` — no locks; display-consistency is reconciled
  client-side exactly as the existing map read is (the O5 optimistic-but-reconciled pattern).
- **Pool rule (#3) / cutoff rule (#4):** not in scope — no booking is created or claimed here.
- **Pinning test:** N/A for double-sell (no write); `AvailabilityLookupIT` pins the read's truth.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `availability` | existing | `SetAvailability` | sole owner/reader of `set_availability`; answers the per-`(set,date)` **state** facts |
| M-2 | `venue` | existing | `Venue`, `BeachMap` | owns the set list + map read composition (#44 precedent); hosts the owner-asserted endpoint |

**Cross-module named interfaces**

| # | Surface | Port | Change | Consumers/Implementor |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `SetAvailabilityLookup` | **add** `Map<SetId, String> statesOn(Collection<SetId>, LocalDate)` | declared by `venue`, implemented by `availability` (existing #44 inversion; grants unchanged) |
| NI-2 | `operator.api` | `VenueOwnership#assertOwns` | consumed (existing) | `venue` application service (invariant #13) |

No `api/` change, no new grants: `availability` already lists `venue::spi`; `venue` already
lists `operator::api`. **Domain events:** none — a synchronous query read (the caller needs the
answer now; nothing is announced).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Answer per-`(set,date)` **state** tokens for a list of sets | `availability` | its Job: "own the single source-of-truth state per (set, date) — free / booked-online / staff-marked"; not venue's (`venue` Not-My-Job: "knowing whether a specific set is free on a date → availability") |
| Compose the venue's set list with those states into the owner's daily view; assert ownership; serve the endpoint | `venue` | its Job: the beach map **read model** (#44: "the map assembly stays in venue"); set listing is venue's (`availability` Not-My-Job: "which sets exist → venue"); `assertOwns` lives in the application service (invariant #13) |
| Decide which sessions may call it (role gate) | platform edge (`SecurityConfig`) | login/role machinery stays at the edge (RV-BE-11) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; the strip's money tiles are untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.service.ts` | existing | `@Service()` HTTP | Observable read `dailyAvailability(venueId, date)` | — |
| FE-2 | `operator/operator-console.model.ts` | existing | model | `SetDayState` type | — |
| FE-3 | `shared/availability-grid.ts` | existing | pure derivation | `deriveTileStates(sets, states, overrides)` — classification from server states | — |
| FE-4 | `operator/daily-view-tab.ts` | existing | standalone component | third read joins the `forkJoin`; signals unchanged | — |
| FE-5 | `operator/console-stats-strip.ts` | existing | standalone component | `walkIns` computed from the states signal | — |
| FE-6 | `frontend/e2e/operator-console-daily.e2e.ts` + support mocks | existing | mocked e2e | — | — |

**Standards:** standalone components, signals, `inject()`, native control flow — all files
already comply; the diff keeps the idiom. No new UI element, so no new axe surface; existing
a11y/contrast specs re-run (tile accessible names already carry the state).

## FE↔BE contract

- **New endpoint:** `GET /api/venues/{venueId}/availability?date=YYYY-MM-DD` (operator session,
  owner-asserted). `200` → `[{ "setId": 123, "state": "BOOKED_ONLINE" | "STAFF_MARKED" }]`,
  **sparse** (a free set is absent). `400 INVALID_REQUEST` (missing/bad date) ·
  `401` (no operator session) · `403 NOT_VENUE_OWNER` · `404 NO_SUCH_VENUE` (owned check first).
- **Client typing:** hand-written `SetDayState` in `operator-console.model.ts`; no `as any`.
- **Date on the wire:** ISO `LocalDate` string (`Europe/Tirane` civil day, invariant #6) — the
  same `date` param shape as the sibling `/bookings` and `/takings` reads.

## Execution status

**Stage pointer:** implement — phase 4 done; awaiting CI green, then gates (phase 5)

**Next action:** verify the CI run on the phase-4 push, then mark PR #501 ready-for-review and run the review gate

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc committed, draft PR opened | ✅ | c77c2db (PR #501, draft) |
| 1 — `statesOn` on the SPI + JDBC impl (`AvailabilityLookupIT` red-green) | ✅ | 00ae354 |
| 2 — venue read service + endpoint + role gate (+ `CrossVenueDenialIT`, coverage test) | ✅ | 30f02c0 |
| 3 — FE: service + grid derivation + daily view + stats strip (Vitest red-green) | ✅ | 695cfa7 |
| 4 — mocked e2e + a11y re-run (117/117 locally) | ✅ | (this commit) |
| 5 — gates: CI green, ready-for-review, review, Sonar, merge close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run on 695cfa7) | 3 mocked e2e red — the strip's new `/availability` read was unmocked in `operator-console`/`operator-daily` specs (phase 3 pushed ahead of phase 4 by design) | fixed in phase 4 commit (mocks + unpaid-hold fixture) |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — add `statesOn`
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — implement it
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java` — pin AC-1
- `platform/src/main/java/ai/riviera/platform/venue/application/ViewDailyAvailability.java` — new driving port
- `platform/src/main/java/ai/riviera/platform/venue/application/SetDayState.java` — new view record
- `platform/src/main/java/ai/riviera/platform/venue/application/DailyAvailabilityService.java` — new service (assertOwns → sets → statesOn)
- `platform/src/test/java/ai/riviera/platform/venue/application/DailyAvailabilityServiceTest.java` — pin AC-2/AC-3
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — add the GET
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — gate the path before the public venue GET
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — endpoint IT (200/401/404 + shape)
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — 403 row (AC-3)
- `frontend/src/app/operator/operator-console.model.ts` — `SetDayState`
- `frontend/src/app/operator/operator-console.service.ts` — `dailyAvailability`
- `frontend/src/app/shared/availability-grid.ts` (+ spec) — states-based `deriveTileStates`
- `frontend/src/app/operator/daily-view-tab.ts` (+ spec) — third read in the forkJoin
- `frontend/src/app/operator/console-stats-strip.ts` (+ `.html`, spec) — walk-ins from states
- `frontend/e2e/` console daily spec + support mocks — AC-8

---

## Phase 1 — `statesOn` on the SPI seam

**Files:** Modify `SetAvailabilityLookup.java`, `JdbcSetAvailabilityLookup.java` · Test `AvailabilityLookupIT.java`

- [ ] Step 1: failing test — in `AvailabilityLookupIT`, seed one `BOOKED_ONLINE` row, one
  `STAFF_MARKED` row, one free set for date D; assert `statesOn` returns exactly
  `{onlineSet → "BOOKED_ONLINE", markedSet → "STAFF_MARKED"}` and `statesOn(List.of(), D)` is empty without a query.
- [ ] Step 2: `./gradlew test --tests "*AvailabilityLookupIT*"` → FAIL (no such method)
- [ ] Step 3: minimal implementation —
  ```java
  @Override
  public Map<SetId, String> statesOn(Collection<SetId> setIds, LocalDate date) {
      if (setIds.isEmpty()) {
          return Map.of();
      }
      List<Long> ids = setIds.stream().map(SetId::value).toList();
      return jdbc.sql("""
              SELECT set_id, state
              FROM set_availability
              WHERE booking_date = :date
                AND set_id IN (:ids)
              """)
              .param("date", date).param("ids", ids)
              .query((rs, i) -> Map.entry(new SetId(rs.getLong("set_id")), rs.getString("state")))
              .list().stream().collect(toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
  }
  ```
- [ ] Step 4: same scoped run → PASS; broaden to `--tests "*ai.riviera.platform.availability*"`
- [ ] Step 5: generalization audit — other SPI consumers wanting states? (`takenOn` callers stay
  state-agnostic on purpose — record decision)
- [ ] Step 6–7: commit `Add per-set state lookup to the availability SPI (#207)` + status update

## Phase 2 — the owner-asserted venue read + endpoint

**Files:** Create `ViewDailyAvailability`, `SetDayState`, `DailyAvailabilityService` (+ unit test) · Modify `VenueAdminController`, `SecurityConfig` · Test `VenueAdminControllerIT`, `CrossVenueDenialIT`

- [ ] Step 1: failing tests — service unit test (mocked `VenueOwnership`, `Venues`/set source,
  `SetAvailabilityLookup`): owner gets the two held sets (AC-2); non-owner → `NotVenueOwnerException`
  with **zero** interactions with the set source (AC-3 ordering). Controller IT: 200 shape, 401
  anonymous, 404 unknown-but-owned venue id.
- [ ] Step 2: scoped runs → FAIL
- [ ] Step 3: implement — service `assertOwns` first, then venue's sets, then `statesOn`, map to
  `List<SetDayState>`; `Optional.empty` for no-such-venue. Controller GET mirrors the profile
  read. SecurityConfig: `DAILY_AVAILABILITY_PATH = "/api/venues/*/availability"`, OPERATOR-gated
  GET registered with the sibling operator reads (before the public venue GET).
- [ ] Step 4: scoped tests + the structural net
  (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`,
  `*EndpointRoleGateCoverageTest*`) → PASS
- [ ] Step 5: generalization audit — the #316/#317/#328 fall-through class: confirm the coverage
  test sees the new matcher.
- [ ] Step 6–7: commit `Serve owner-asserted per-set availability states for a venue day (#207)` + status

## Phase 3 — frontend truth swap

**Files:** Modify `operator-console.model.ts`, `operator-console.service.ts`, `availability-grid.ts`, `daily-view-tab.ts`, `console-stats-strip.ts`(+html) · Tests: their specs

- [ ] Step 1: failing Vitest specs — grid: `deriveTileStates` classifies from a states map
  (override → server state → FREE); daily view: unpaid-hold fixture renders locked tile; strip:
  walk-ins = STAFF_MARKED count, "—" on read failure (AC-5/AC-6).
- [ ] Step 2: `npm test` (scoped via the changed spec files) → FAIL
- [ ] Step 3: implement — `dailyAvailability()` in the service; grid signature
  `deriveTileStates(sets, states: ReadonlyMap<number, TileState>, overrides)`; daily view adds the
  states read to `forkJoin` + reconcile; strip loads states with the same epoch guard and computes
  `walkIns` from it (drop the `total − free − booked` remainder + its limitation comment).
- [ ] Step 4: scoped specs, then the full `npm test` + `npm run lint` → PASS
- [ ] Step 5: generalization audit — grep for other `taken − confirmed` derivations (`git grep -n
  "bookedOnline\|walkIns"`) → confirm none remain.
- [ ] Step 6–7: commit `Derive operator tiles and walk-ins from server availability states (#207)` + status

## Phase 4 — mocked e2e + a11y

- [ ] Extend the console e2e support mocks with `GET /api/venues/*/availability` and the daily
  spec with an unpaid-hold fixture: hold tile locked, marked tile releasable, strip walk-ins
  exact (AC-8). Re-run `npm run test:e2e:a11y` + `npm run test:a11y`.
- [ ] Commit `Cover hold-vs-walk-in tiles in the mocked console e2e (#207)` + status

## Phase 5 — gates

- [ ] CI green on the PR; mark ready-for-review; run the review gate (`/code-review` ladder +
  `riviera-review-overlay`); Sonar gate incl. the API issue list; findings re-enter at Implement;
  merge close-out (epic tick N/A — no epic; issue #207 closes; `riviera-docs-freshness` over the
  merge range; final plan-doc state in the PR's last commit citing `merged via PR #NN`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | phase 1 (statesOn) | other `takenOn`/state-blind consumers that need states | `grep -rn "takenOn" platform/src/main` | `JdbcVenueCatalog` (tourist map) | skip — the tourist read is state-agnostic **by design** (no hold-type leak); only the operator read graduates |
| 2026-08-01 | phase 2 (role gate) | the #316/#317/#328 GET fall-through class on the new endpoint | `EndpointRoleGateCoverageTest` run | matcher registered before the public venue GET; coverage test green (and red before the matcher landed — it genuinely probes the new endpoint) | fixed by construction |
| 2026-08-01 | phase 3 (FE truth swap) | any remaining `taken − confirmed` remainder / `onlineHeldSetIds` heuristic | `grep -rn "- bookedOnline\|onlineHeldSetIds\|walkIns" frontend/src/app` | none outside the new states-based `walkIns` | heuristic fully deleted, not relocated |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** scoped gradle runs of the named tests → PASS. Verified at commit `<sha>`.
- [ ] **AC-5..AC-6:** `npm test` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** tourist-path diff is empty; `VenueReadControllerIT` green.
- [ ] **AC-8:** `npm run test:e2e:a11y` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; read-only, no concurrency change (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** N/A honest — no money path touched.
- [ ] Timezone: date param is the `Europe/Tirane` civil day, like the sibling reads (invariant #6).
- [ ] Booking codes: none touched (invariant #7).
- [ ] No Flyway migration needed — verified no schema change (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** citing `merged via PR #NN`.
- [ ] **The review gate ran in full** (invocation ladder + overlay).
