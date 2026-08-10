# O3 — Beach-map Layout Editor (generate-grid + paint-tool) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]`.

**Goal:** Replace the operator console's beach-map placeholder with the designed Layout-editor tab —
generate an R×C grid in one action, paint tier/pool/gap per cell (click + drag), and persist the whole
grid through a single owner-asserted bulk write that never destroys availability/booking state; the
tourist beach map renders the edited layout unchanged.

**Architecture:** The single most significant decision is the **bulk full-layout replace** —
`PUT /api/venues/{venueId}/beach-map` takes the complete desired grid and, in one `@Transactional`
service method, replaces `set_position` for the venue **only when the venue is entirely unclaimed**
(no set has an availability hold on any date, no set has a booking of any status). A claimed venue is
rejected `409 LAYOUT_IN_USE` — chosen over cascade-delete (maintainer, this session) because the FK
reality (`booking.set_id` RESTRICT + `set_availability.set_id` CASCADE) makes any destructive replace
either hard-fail or silently drop invariant-#2 state. Generate and drag-paint are client-side edits
applied together by this one write; N single-set calls can't be atomic and would strand partial grids.

**Persistence:** JDBC only (invariant #1). **No schema change / no Flyway migration** — the replace
writes existing `set_position` columns; the two guard reads hit existing indexes (`booking_venue_id_idx`
V5:53, and `set_availability`'s `UNIQUE(set_id, booking_date)` leading column). V22 stays free.

**Source of intent:** GitHub issue **#172** (sub-issue of epic **#141**); design spec
`docs/design/riviera-operator-console-v2.dc.html` (Layout-editor section) + intake note
`docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted:** `riviera-sdlc` (SDLC loop + intake-grill gate); `riviera-plan-doc` (this template);
`riviera-modulith` (new `venue/spi/BookingPresence` driven port implemented by `booking` per the api-vs-spi
rule; `replaceLayout` added to the existing `EditBeachMap` port — same purposeful conversation, not a 5th
port; endpoint in `venue/adapter/in`; ModularityTests + WebSliceStubs stubbing for the new controller/SPI);
`postgres` (guard reads use existing FK indexes → no migration; batch insert + `DELETE … WHERE venue_id` in
one tx); `riviera-frontend` (editor lands in the `operator/` feature folder; write on `operator-console.service`;
`beach-map` child route lifts out of the `CONSOLE_TABS` factory; reuse shared `Tier/Pool/MoneyView` from
`venue.model` as the stats strip already does). Loaded at implement time: `riviera-java-conventions`
(records/sealed outcomes/JdbcClient/no-Lombok, `ProblemDetail` error contract), `angular-developer` +
angular-cli MCP (v22 signals + a11y), `riviera-tailwind` (glass/porcelain utilities), `playwright-cli`
(CI-safe mocked e2e), `riviera-local-debug` (scoped build/test recipe), `riviera-review-overlay` (review gate).

**Branch:** `feature/o3-layout-editor` → **substituted (cloud session)** by the designated remote branch
**`claude/o3-layout-editor-sdlc-xvhapq`**, restarted at `origin/main` tip (0 ahead/0 behind, clean) before
phase 0. (The handoff named `claude/next-sdlc-issue-pt57da`; that branch does not exist on origin and its
prior PRs are merged — the session-designated `…xvhapq` branch is already the fresh-from-main branch its
"restart from main" intent asks for.)

---

## Acceptance criteria (testable)

- [ ] **AC-1 (generate/replace):** Given an unclaimed venue, when `EditBeachMap.replaceLayout` is called
  with an R×C grid, then `set_position` holds exactly the requested sets with row **A** (grid_y = 1, sea-facing)
  tier `PREMIUM`/pool `ONLINE` and later rows `STANDARD`, and the write is all-or-nothing. *Pinned by:*
  `EditBeachMapReplaceTest.replacesLayoutForUnclaimedVenue`, `BeachMapReplaceIT.replaceThenTouristMapReflectsGrid`.
- [ ] **AC-2 (regenerate confirms + replaces):** Given a non-empty grid in the editor, when the operator
  clicks Generate, then a confirm is required and, on confirm, the grid is regenerated and one bulk PUT is
  sent. *Pinned by:* `layout-editor.spec.ts` (`regenerate asks confirm then replaces`), `layout-editor.e2e.ts`.
- [ ] **AC-3 (paint: tier/pool/gap, drag, accessible):** Given the grid, when the operator selects a tool and
  clicks or drags across cells, then each cell's tier/pool/gap toggles with a live per-tool count; every cell
  is a labelled `<button>` operable by keyboard (Enter/Space applies the active tool) with an AT-readable name.
  *Pinned by:* `layout-editor.spec.ts` (`paint toggles state`, `drag paints across cells`, `cell exposes accessible
  label`), `layout-editor.a11y.spec.ts`.
- [ ] **AC-4 (pool round-trips, rendered distinctly):** Given a saved layout with `WALK_IN` and `ONLINE` sets,
  when the tourist map and the editor render it, then the `WALK_IN` pool flag persists and is shown distinctly
  from `ONLINE` (invariant #3). *Pinned by:* `BeachMapReplaceIT.poolFlagPersistsAndReadsBack`, `layout-editor.spec.ts`
  (`walk-in cells render distinctly`).
- [ ] **AC-5 (owner-asserted; cross-venue → 403):** Given operator O1 authenticated, when O1 PUTs the beach-map
  layout of a venue owned by O2, then `403` and no write. *Pinned by:* `CrossVenueDenialIT.replaceBeachMapLayout`.
- [ ] **AC-6 (guard over claimed sets):** Given a venue where any set has a booking (any status) **or** an
  availability hold (any date), when `replaceLayout` is called, then it returns `LAYOUT_IN_USE` (`409`) and the
  existing sets **and** the availability holds are untouched. *Pinned by:* `BeachMapReplaceIT.rejectsWhenVenueHasBooking`,
  `BeachMapReplaceIT.rejectsWhenVenueHasWalkInHoldAndHoldSurvives`.
- [ ] **AC-7 (tourist map renders edited layout):** Given a replaced layout, when `VenueCatalog.findVenueMap`
  is queried, then it returns the new sets with correct tier/pool/price/grid coords. *Pinned by:*
  `BeachMapReplaceIT.replaceThenTouristMapReflectsGrid` (shared with AC-1).
- [ ] **AC-8 (CI-safe e2e + a11y/contrast):** The mocked Playwright spec drives generate→paint→save (asserting
  the PUT payload and the `LAYOUT_IN_USE` message), and the a11y + contrast specs pass. *Pinned by:*
  `frontend/e2e/layout-editor.e2e.ts`, `layout-editor.a11y.spec.ts`, `layout-editor.contrast.spec.ts`.

## Non-goals

- **Per-row price editing + projected take** — that is **O4 (#174, Pricing tab)**. O3 assigns *default* prices at
  generate (see Assumption) and displays per-row price read-only; it does not add price-edit UI.
- **Daily-view tap-to-mark / arrivals** — **O5 (#175)**; O5 extracts the shared grid from this component.
- **Retiring the single-set `POST/PATCH/DELETE …/sets` endpoints or the legacy VenueEditor** — **O8 (#177)**.
  The single-set endpoints stay live this slice.
- **Cascade/confirm destructive regenerate, soft-delete, or layout versioning** — rejected for v1 (maintainer).
- **A "venue is claimed" pre-warn probe endpoint** — the FE surfaces the server's `LAYOUT_IN_USE` after PUT.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Destructive replace silently drops availability holds (`set_availability.set_id` ON DELETE CASCADE) — invariant #2 state destroyed with no event | med | high | Explicit `anyClaims(setIds)` guard BEFORE any delete; replace barred on any claimed venue; **`lockSetsOfVenue` takes `SELECT … FOR UPDATE` before the probe so a concurrent walk-in mark/booking blocks on its FK `FOR KEY SHARE` (closes the review-found TOCTOU window)**; sequential IT proves the hold survives a rejected replace, `concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold` (@RepeatedTest) proves the race | agent | closed (review) |
| R-2 | Partial layout persisted on mid-write failure | low | high | Single `@Transactional` method; all-or-nothing delete+insert; IT | agent | open |
| R-3 | Duplicate grid cell / position within the submitted grid | med | med | `SetCommand` validation per cell + the two `set_position` UNIQUE constraints → `DUPLICATE_POSITION`/`CELL_TAKEN` (409); intra-batch check in the layout command | agent | open |
| R-4 | Cross-venue write (BOLA, OWASP #1, invariant #13) | med | high | `ownership.assertOwns(operator, VenueRef)` as the service method's **first statement**; `CrossVenueDenialIT` | agent | open |
| R-5 | New `venue/spi` port + new controller not stubbed → full-suite-only failure (bit O2 in CI, #206) | med | med | Stub the new controller in `WebSliceStubs` and the new SPI in the booking module-isolation test; run `*ModularityTests* *JdbcOnlyArchitectureTests* *PackageShapeArchitectureTests* *PublishedSurfacePlacementArchitectureTests*` | agent | open |
| R-6 | Repaint changes a set's pool ONLINE→WALK_IN while an online booking exists (invariant #3) | low | high | Replace is permitted only on an unclaimed venue, so no online booking can reference a repurposed set; documented + covered by AC-6 | agent | open |
| R-7 | Money as float / non-EUR at generate | low | med | Default prices are integer minor-unit EUR constants; `MoneyView{minorUnits,currency}` on the wire; `SetCommand.priceMinor` is `long` | agent | open |
| R-8 | Error body drifts from the centralized contract | low | low | Reuse `SetRejection`→`ProblemDetail` (`ApiProblem`) mapping; new `LAYOUT_IN_USE`/`EMPTY_LAYOUT` codes added to the same switch (riviera-java-conventions §6b) | agent | open |

## Open questions / Assumptions

- **Assumption (generate default prices):** generate assigns `PREMIUM` rows **€35.00** (`3500` minor EUR) and
  `STANDARD`/`WALK_IN` sets **€20.00** (`2000` minor EUR), as documented constants, fully editable later in the
  O4 Pricing tab. The Layout-editor displays them per-row read-only. — *Owner:* agent · *Resolves by:* phase 5
  (accepted as a placeholder; O4 owns real editing).
- **Assumption (FE claimed-venue UX):** the editor lets the operator paint/generate freely and surfaces the
  server's `LAYOUT_IN_USE` as a clear "layout locked — this venue has bookings or walk-in holds" message after
  the PUT; no client-side pre-check (no endpoint exists for it). — *Owner:* agent · *Resolves by:* phase 5.
  **Superseded by #600:** the message this slice shipped went on to say "layout changes are not possible
  while sets are in use", which stopped being true when #567 gave the per-set endpoints their guards. The
  tab is no longer bulk-only — it carries a mode toggle, and a live venue's map is edited one set at a
  time (`docs/plans/per-set-beach-map-editing.md`). The no-client-side-pre-check half still holds.

### Resolved

- **Guard policy for destructive regenerate** → **reject unless unclaimed** (`AskUserQuestion`, this session):
  bulk replace succeeds only when no set has a booking or availability hold; else `409 LAYOUT_IN_USE`. Incremental
  single-set edits remain for unclaimed sets. — **Amended by #567:** this last sentence described a policy
  this slice never enforced (the per-set endpoints had no claim probe at all). It is enforced now, and
  narrower than stated, along two axes: a set with any claim ever recorded refuses **removal** outright,
  while an **edit** is refused only when it would repool or reposition the set *and* a claim is still
  live (a hold dated today or later, a booking that can still be honoured). Price and tier edits are
  never refused. So "unclaimed" was never the right word for the edit half — dead history does not
  freeze the map. — **Amended again by #599:** the removal's *availability* arm was narrowed to the
  same live question, so dead history no longer freezes the delete either; only a booking of any
  status still refuses it, which the RESTRICT FK forces.
- **Bulk write shape** → **one full-replace `PUT` endpoint, single transaction** (engineering call): atomic,
  idempotent, matches "generate 72 sets in one action" + bulk repaint. Rejected N single-set calls (non-atomic).
- **Flyway version** → **none needed** (no schema change); V22 verified free on `main` + no open PR claims it.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** **none.** `replaceLayout` never writes
  `set_availability`. It only writes `set_position`, and only when the venue has **zero** availability rows —
  so no `(set, date)` hold is created, changed, or freed by this slice.
- **Interaction with the source of truth:** the destructive delete would, via `set_availability.set_id ON DELETE
  CASCADE`, silently erase holds. The guard **`SetAvailabilityLookup.anyClaims(venueSetIds)`** (extends the
  existing venue→availability SPI; availability remains the sole reader/writer of `set_availability`) is consulted
  **before** any delete; any hold → `LAYOUT_IN_USE`, nothing deleted. This is the highest-stakes line of the slice.
- **Uniqueness guarantee (unchanged):** `set_availability` `UNIQUE(set_id, booking_date)` still guards double-sell;
  `set_position` `UNIQUE(venue_id,row_label,position_no)` + `UNIQUE(venue_id,grid_x,grid_y)` guard the grid.
- **Concurrency strategy:** the replace is a single serialisable-enough transaction: read the venue's set ids →
  `anyClaims` + `BookingPresence.hasBookings` → if clear, `DELETE … WHERE venue_id` then batch-insert. A booking
  racing in *after* the guard read is still safe: it would insert a `set_availability`/`booking` row referencing
  an existing `set_id`; the concurrent `DELETE` on that `set_id` blocks on the row locks the racing insert holds
  (or fails the RESTRICT FK / cascade), and the transaction is atomic — worst case one side rolls back, never a
  half-replaced layout or an orphaned hold. Documented; covered by the guard IT (single-writer operator action,
  extremely low contention).
- **Pool rule (invariant #3):** the `WALK_IN`/`ONLINE` flag is written verbatim into `set_position.pool`; because
  replace runs only on an unclaimed venue, no online booking can target a set being made `WALK_IN`. Pinned by AC-4/AC-6.
- **Cutoff rule (invariant #4):** N/A — no booking is created; no cutoff arithmetic.
- **Pinning test:** `BeachMapReplaceIT.rejectsWhenVenueHasWalkInHoldAndHoldSurvives` — proves a replace over a
  venue with a `STAFF_MARKED` hold is rejected and the hold row still exists afterward.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns the beach map / set positions / pool assignment (CLAUDE.md table). The bulk layout write + its guard live here. |
| M-2 | `booking` | existing | `Booking` | Implements the new `venue/spi/BookingPresence` driven port (only `booking` may read the `booking` table). |
| M-3 | `availability` | existing | `SetAvailability` | Implements the extended `SetAvailabilityLookup.anyClaims` (sole reader of `set_availability`). |
| M-4 | `operator` | existing | `Operator` | `VenueOwnership.assertOwns` consulted by the new write (invariant #13). |

**Cross-module named interfaces (ports)**

| # | Surface | Port | Public types | Direction / consumers |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `BookingPresence#hasBookings(VenueId)` → `boolean` | `venue.vocabulary.VenueId` | **New driven port** (spi) — implemented by `booking` (`booking → venue::spi`, existing acyclic direction; grant `venue::spi` to `booking`). "Implement-me", so `spi/` not `api/`. |
| NI-2 | `venue.spi` | `SetAvailabilityLookup#anyClaims(Collection<SetId>)` → `boolean` | `venue.vocabulary.SetId` | **Extend existing** spi (already implemented by `availability`; grant unchanged). |
| NI-3 | `operator.api` | `VenueOwnership#assertOwns(OperatorId, VenueRef)` | existing | Consumed by `venue` (grant already present). |
| NI-4 | `venue.api` | `VenueCatalog#findVenueMap(...)` (unchanged) | `VenueMapView`/`SetView` | Read-back the replaced layout (AC-7). |

**Domain events**

| # | Event | Note |
|---|---|---|
| — | none | No event published/consumed. Layout is venue-owned state read live by the tourist map; replace runs only on an unclaimed venue, so no availability/booking/payout state changes → nothing to announce. |

### Module ownership (§4a)

| Capability (added/changed) | Owner module | Justification |
|---|---|---|
| Bulk beach-map layout replace + generate defaults | `venue` | `venue` **Job**: "venue profiles, the beach map / layout, set positions, online-vs-walk-in pool assignment, pricing." Not on any other module's Not-My-Job. |
| "Does this set have an availability hold?" | `availability` (via `venue::spi`) | `availability` **Job**: sole owner/reader of `set_availability`. `venue` must **not** read it directly (invariant #11) → dependency-inverted SPI. |
| "Does this venue have any booking?" | `booking` (via `venue::spi`) | `booking` **Job**: owns bookings. `venue` must not read `booking` → new `BookingPresence` SPI implemented by `booking`. Payload is the `VenueId` technical id (Need-To-Know). |
| Operator-owns-venue check | `operator` (via `operator::api`) | Existing ownership authority; invariant #13. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. Generate assigns display prices only (integer minor-unit EUR constants, invariant #5);
no charge, refund, commission, or payout is touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` (+ `.html`) | new | standalone component | Signals (`grid`, `activeTool`, `genRows/genCols`, `saving`, `errorCode`, `confirmRegen`), computed per-tool counts | plain number inputs (no Signal Form needed) |
| FE-2 | `operator/operator-console.service.ts` | modified | `@Service` | — | adds `replaceLayout(venueId, req)` → `PUT …/beach-map` + `layoutErrorOf(err)` |
| FE-3 | `operator/operator-console.model.ts` | modified | model | — | `BeachMapLayoutRequest` / `LayoutCellRequest` + `LayoutErrorCode` |
| FE-4 | `app.routes.ts` | modified | route | — | lift `beach-map` out of `CONSOLE_TABS` → `loadComponent` the editor |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`, `host: { 'data-riv-theme':'porcelain' }` inherited
from the console shell, glass via `appCardGlass`/`appPanelGlass`, money via `shared/money.ts`. Cells are real
`<button>`s in a `role="grid"` container with full `aria-label`s (keyboard + AT usable, AC-3). `:venueId` read from
`route.parent?.snapshot.paramMap` (emptyOnly inheritance, O1 finding).

## FE↔BE contract

- **New endpoint:** `PUT /api/venues/{venueId}/beach-map` — body `BeachMapLayoutRequest { sets: SetPositionRequest[] }`
  (each `{ rowLabel, positionNo, tier, pool, price:{minorUnits,currency}, gridX, gridY }`). Success `204 No Content`.
  Rejections (RFC-7807 `ProblemDetail`, `code`): `NO_SUCH_VENUE`→404, `LAYOUT_IN_USE`→409, `DUPLICATE_POSITION`→409,
  `CELL_TAKEN`→409, `EMPTY_LAYOUT`→400 (or malformed body→400); non-owner→403; auth→401.
- **Client typing:** hand-written typed `operator-console.service.ts` method + `operator-console.model.ts` types;
  reuse shared `Tier`/`Pool`/`MoneyView` from `venue.model.ts`. No `as any`.
- **Money/date on the wire:** amounts integer minor units + `currency: "EUR"`; no dates in this contract.

## Close-out

- **Merged:** PR #209 → `main` `15a88f6` (squash); issue #172 closed; epic #141 O3 box ticked.
- **CI:** all 10 check-runs green (Backend build+test, Frontend lint+test+build, CodeQL ×2, SonarCloud).
- **Review gate:** `riviera-review-overlay` + `/code-review` (high) — 1 invariant-#2 TOCTOU Blocker + 3 more
  findings fixed and re-verified (see the risk register R-1 + generalization-audit log).
- **Sonar gate:** 0 new issues, 0 duplication, 85.1% new-code coverage (8 first-pass smells all fixed in-code).
- **Docs-freshness** (`2e4ac2c..15a88f6`, 2 findings, both patched in the follow-up): `CLAUDE.md` operator-console
  status line (O3 now merged); `venue/spi/package-info.java` inventory (now holds `BookingPresence` too). No
  other substrate fact contradicted. Graph absent (gitignored) — code rebuilt via the post-commit hook.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `BookingPresence` SPI + `booking` adapter | ✅ | (backend commit) |
| 1 — `SetAvailabilityLookup.anyClaims` (availability) | ✅ | (backend commit) |
| 2 — `EditBeachMap.replaceLayout` + guard + `Venues` batch persistence | ✅ | (backend commit) |
| 3 — `PUT …/beach-map` controller + DTO + WebSliceStubs | ✅ | (backend commit) |
| 4 — Testcontainers ITs (replace/guard/tourist round-trip) + `CrossVenueDenialIT` | ✅ | (backend commit) |
| 5 — Angular Layout-editor (generate + paint + grid) + service + route | ✅ | (frontend commit) |
| 6 — a11y + contrast specs | ✅ | (frontend commit) |
| 7 — CI-safe mocked e2e | ✅ | (frontend commit) |

> Frontend verified in-session: `npm run lint` clean, `npm run build` clean, full Vitest suite
> **535/535** (incl. `layout-editor.spec` 8, `.a11y.spec` 3, `.contrast.spec` 8), and the CI-safe
> Playwright a11y suite green — `layout-editor.e2e` (generate→paint→save PUT payload + axe; LAYOUT_IN_USE
> lock) and the updated `operator-console.e2e` (beach-map tab now renders the editor).

> Backend verified in-session (scoped): `VenueAdminServiceTest` (guard branches + fail-closed ordering),
> the structural net (`ModularityTests`/`JdbcOnlyArchitectureTests`/`PackageShapeArchitectureTests`/
> `PublishedSurfacePlacementArchitectureTests`), and ITs `BeachMapReplaceIT` (replace round-trip, pool
> round-trip, regenerate-replaces, both guard branches with the hold surviving) + `CrossVenueDenialIT`
> (non-owner 403). CI owns the full suite.

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**
- `venue/spi/BookingPresence.java` — new driven port (`@NamedInterface("spi")`).
- `venue/spi/SetAvailabilityLookup.java` — add `anyClaims(Collection<SetId>)`.
- `venue/application/EditBeachMap.java` — add `replaceLayout(OperatorId, VenueId, LayoutCommand)`.
- `venue/application/LayoutCommand.java`, `ReplaceLayoutOutcome.java`, `ReplaceRejection.java` — new.
- `venue/application/VenueAdminService.java` — implement `replaceLayout` (assertOwns → guard → delete+batch-insert).
- `venue/application/Venues.java` + `venue/adapter/out/JdbcVenues.java` — add `deleteAllSets(VenueId)`,
  `insertSets(VenueId, List<SetCommand>)`, `findSetIds(VenueId)`.
- `venue/adapter/in/VenueAdminController.java` — add `PUT …/beach-map`; `BeachMapLayoutRequest.java` new DTO.
- `availability/adapter/out/JdbcSetAvailabilityLookup.java` — implement `anyClaims`.
- `booking/adapter/out/JdbcBookingPresence.java` — new adapter implementing `venue.spi.BookingPresence`.
- `booking/package-info.java` — add `venue::spi` to `allowedDependencies`.

**Backend tests (`platform/src/test/java/...`)**
- `venue/application/EditBeachMapReplaceTest.java` (unit, fakes), `venue/.../BeachMapReplaceIT.java`
  (`@SpringBootTest` Testcontainers), extend `CrossVenueDenialIT`, extend `WebSliceStubs` + the booking
  module-isolation/`@ApplicationModuleTest` stub.

**Frontend (`frontend/src/app/operator/`)**
- `layout-editor.ts` / `.html` / `.spec.ts` / `.a11y.spec.ts` / `.contrast.spec.ts` — new.
- `operator-console.service.ts`, `operator-console.model.ts`, `../../app.routes.ts` — modified.
- `frontend/e2e/layout-editor.e2e.ts` — new CI-safe mocked spec.

---

## Phase 0 — `venue/spi/BookingPresence` + `booking` adapter

**Files:** Create `venue/spi/BookingPresence.java`, `booking/adapter/out/JdbcBookingPresence.java`; Modify
`booking/package-info.java`; Test `booking/.../JdbcBookingPresenceIT.java`.

- [ ] **Step 1 — failing test** (`@SpringBootTest` + Testcontainers; skips without Docker):

```java
@Test
void reportsPresenceOfAnyBookingForVenue() {
  long venueId = fixtures.venueWithOneSet();
  assertThat(bookingPresence.hasBookings(new VenueId(venueId))).isFalse();
  fixtures.confirmedBooking(venueId);
  assertThat(bookingPresence.hasBookings(new VenueId(venueId))).isTrue();
}
```

- [ ] **Step 2 — verify fail:** `gradle test --tests "*JdbcBookingPresenceIT*"` → FAIL (no bean).
- [ ] **Step 3 — implement:** `public interface BookingPresence { boolean hasBookings(VenueId venueId); }` in
  `venue.spi` (javadoc: driven port, implemented by `booking`, mirrors `SetAvailabilityLookup` inversion).
  `JdbcBookingPresence` (`@Repository`, package-private): `SELECT EXISTS(SELECT 1 FROM booking WHERE venue_id = :v)`
  via `JdbcClient` (uses `booking_venue_id_idx`). Add `"venue::spi"` to `booking` `allowedDependencies`.
- [ ] **Step 4 — verify pass** + `gradle test --tests "*ModularityTests*"` (grant is acyclic).
- [ ] **Step 5 — generalization audit:** search for any other venue-side need to read booking → none (only the guard).
- [ ] **Step 6 — commit** `feat(venue): add BookingPresence spi implemented by booking (#172)`.
- [ ] **Step 7 — update execution status.**

## Phase 1 — `SetAvailabilityLookup.anyClaims`

**Files:** Modify `venue/spi/SetAvailabilityLookup.java`, `availability/adapter/out/JdbcSetAvailabilityLookup.java`;
Test `availability/.../JdbcSetAvailabilityLookupIT` (extend).

- [ ] **Step 1 — failing test:** seed a `STAFF_MARKED` row for one of two set ids; assert
  `anyClaims([s1,s2])` is `true`, `anyClaims([s2])` is `false`, `anyClaims([])` is `false` (no DB hit).
- [ ] **Step 3 — implement:** `boolean anyClaims(Collection<SetId> setIds)` →
  `SELECT EXISTS(SELECT 1 FROM set_availability WHERE set_id IN (:ids))` (empty → return `false` without a query).
- [ ] Steps 2/4–7 as template. Commit `feat(venue): anyClaims on SetAvailabilityLookup (#172)`.

## Phase 2 — `EditBeachMap.replaceLayout` + guard + batch persistence

**Files:** Create `LayoutCommand`, `ReplaceLayoutOutcome` (`sealed … permits Replaced, Rejected`),
`ReplaceRejection` (`enum { NO_SUCH_VENUE, LAYOUT_IN_USE, DUPLICATE_POSITION, CELL_TAKEN, EMPTY_LAYOUT }`);
Modify `EditBeachMap`, `VenueAdminService`, `Venues`, `JdbcVenues`; Test `EditBeachMapReplaceTest` (fakes).

- [ ] **Step 1 — failing unit test** (fake `Venues`, fake `SetAvailabilityLookup`, fake `BookingPresence`,
  stub `VenueOwnership`):

```java
@Test void replacesLayoutForUnclaimedVenue() {
  var out = service.replaceLayout(OWNER, VENUE, grid(2, 3));           // 2 rows × 3 cols
  assertThat(out).isInstanceOf(ReplaceLayoutOutcome.Replaced.class);
  assertThat(fakeVenues.setsOf(VENUE)).hasSize(6);
  assertThat(fakeVenues.setsOf(VENUE)).anyMatch(s -> s.rowLabel().equals("A") && s.tier().equals("PREMIUM"));
}
@Test void rejectsWhenVenueHasBooking() {
  fakeBookings.markHasBookings(VENUE);
  assertThat(service.replaceLayout(OWNER, VENUE, grid(2, 3)))
      .isEqualTo(new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_IN_USE));
  assertThat(fakeVenues.deleteAllCalled()).isFalse();                  // guard runs BEFORE delete
}
@Test void assertsOwnershipFirst() {                                   // BOLA
  doThrow(new NotVenueOwnerException()).when(ownership).assertOwns(any(), any());
  assertThatThrownBy(() -> service.replaceLayout(OTHER, VENUE, grid(2,3)))
      .isInstanceOf(NotVenueOwnerException.class);
  assertThat(fakeAvailability.anyClaimsCalled()).isFalse();            // fail closed before any read
}
```

- [ ] **Step 3 — implement** `@Transactional replaceLayout`: (1) `ownership.assertOwns(operator, new VenueRef(venueId.value()))`;
  (2) `venueExists` → else `NO_SUCH_VENUE`; (3) `command.isEmpty()` → `EMPTY_LAYOUT`; (4) `ids = venues.findSetIds(venueId)`;
  (5) `if (availability.anyClaims(ids) || bookingPresence.hasBookings(venueId)) return Rejected(LAYOUT_IN_USE);`
  (6) validate intra-batch uniqueness of `(rowLabel,positionNo)` and `(gridX,gridY)` → `DUPLICATE_POSITION`/`CELL_TAKEN`;
  (7) `venues.deleteAllSets(venueId); venues.insertSets(venueId, command.toSetCommands());` `Replaced`.
  `Venues`: `List<SetId> findSetIds(VenueId)`, `int deleteAllSets(VenueId)`, `long[] insertSets(VenueId, List<SetCommand>)`
  (JdbcClient batch). `LayoutCommand` builds `SetCommand`s (row `A`=PREMIUM/ONLINE default price, else STANDARD; each
  cell's pool/tier from the FE). Reuse the `SetCommand` compact-ctor validation (mirrors V2/V12 CHECKs).
- [ ] Steps 2/4 scoped to `*EditBeachMapReplaceTest*` then the `venue` package. Steps 5–7. Commit
  `feat(venue): bulk replaceLayout with reject-unless-unclaimed guard (#172)`.

## Phase 3 — `PUT /api/venues/{venueId}/beach-map` controller

**Files:** Modify `VenueAdminController`; Create `BeachMapLayoutRequest`; Modify `WebSliceStubs`;
Test `VenueAdminControllerLayoutTest` (`@WebMvcTest`).

- [ ] **Step 1 — failing slice test:** PUT a 2×3 layout → `204`; a `LAYOUT_IN_USE` outcome → `409` with
  `ProblemDetail` `code:"LAYOUT_IN_USE"`; a non-owner (`NotVenueOwnerException` from the stubbed service) → `403`.
- [ ] **Step 3 — implement** `@PutMapping("/{venueId}/beach-map")`: resolve `currentOperator.require(auth)`,
  map `BeachMapLayoutRequest.toCommand()`, switch `ReplaceLayoutOutcome` → `204` / `error(reason)`; extend the
  central `error(...)` switch with `LAYOUT_IN_USE`→409, `EMPTY_LAYOUT`→400 (reuse `ApiProblem`). Add the new
  controller/method to `WebSliceStubs` (R-5).
- [ ] Steps 2/4–7. Commit `feat(venue): PUT beach-map bulk layout endpoint (#172)`.

## Phase 4 — Integration tests (Testcontainers) + cross-venue denial

**Files:** Create `BeachMapReplaceIT`; Modify `CrossVenueDenialIT`; ensure the booking module-isolation test stubs
`BookingPresence`.

- [ ] `BeachMapReplaceIT` (`@SpringBootTest`, `@EnabledIfDockerAvailable`): `replaceThenTouristMapReflectsGrid`
  (AC-1/AC-7 — replace, then `VenueCatalog.findVenueMap` returns the new grid with row A premium/online);
  `poolFlagPersistsAndReadsBack` (AC-4); `rejectsWhenVenueHasBooking` (AC-6, 409, layout intact);
  `rejectsWhenVenueHasWalkInHoldAndHoldSurvives` (AC-6/R-1 — the `set_availability` row still exists after the 409).
- [ ] `CrossVenueDenialIT.replaceBeachMapLayout` (AC-5 — O1 PUTs O2's venue → 403, no write).
- [ ] Run `*ModularityTests* *JdbcOnlyArchitectureTests* *PackageShapeArchitectureTests*
  *PublishedSurfacePlacementArchitectureTests*` (structural net). Commit `test(venue): beach-map replace ITs (#172)`.

## Phase 5 — Angular Layout-editor (generate + paint + grid) + service + route

**Files:** Create `operator/layout-editor.ts` + `.html` + `.spec.ts`; Modify `operator-console.service.ts`,
`operator-console.model.ts`, `app.routes.ts`, `console-placeholder.spec.ts` (drop the beach-map assertion).

- [ ] Load `angular-developer` + angular-cli MCP (`get_best_practices`) + `riviera-tailwind` first.
- [ ] **Step 1 — failing unit specs** (`layout-editor.spec.ts`): generate builds an R×C grid with row A premium;
  regenerate over a non-empty grid sets `confirmRegen` and only replaces on confirm; paint toggles a cell's state;
  drag (down→enter→up) paints a run; save posts one `PUT` with the expected `sets` payload (gap cells omitted);
  a `409 LAYOUT_IN_USE` sets the locked-layout message; walk-in cells carry the distinct class + label.
- [ ] **Step 3 — implement** the component (signals: `grid`, `activeTool`, `genRows`, `genCols`, `painting`,
  `saving`, `errorCode`, `confirmRegen`; computed per-tool counts + per-row price + `genTotal`; `:venueId` from
  `route.parent`; loads current layout via `VenueService.getVenueMap` to seed the grid). Cells are `<button role>`
  in a `role="grid"`; `onCellDown/Enter/Up` for drag, Enter/Space applies the active tool; sea-facing banner top,
  Promenade banner bottom, legend, per-row price display. `operator-console.service.replaceLayout` → `PUT` +
  `layoutErrorOf`. Lift `beach-map` route to `loadComponent(() => import('./operator/layout-editor')…)`.
- [ ] Steps 4–7 (`npm test`, `npm run lint`). Commit `feat(operator): layout editor tab — generate + paint (#172)`.

## Phase 6 — a11y + contrast specs

- [ ] `layout-editor.a11y.spec.ts` (axe, `expectNoAxeViolations` across empty/generated/painted states) and
  `layout-editor.contrast.spec.ts` (mirror the O2 stats-strip pattern: `expectAaOverStops` over `PORCELAIN_STOPS`
  for cell labels, banners, legend, tool buttons; note any AA-raised token with a comment). `npm run test:a11y`.
  Commit `test(operator): layout editor a11y + contrast (#172)`.

## Phase 7 — CI-safe mocked e2e

- [ ] Load `playwright-cli`. `frontend/e2e/layout-editor.e2e.ts` under the CI-safe suite: stateful `page.route`
  (sign-in flips session; stub `GET …/venues/1` map, `PUT …/beach-map` → 204, plus a `LAYOUT_IN_USE` case → 409).
  Drive: sign in → beach-map tab → set rows/positions → Generate → paint a run (drag) → Save → assert the PUT body;
  second case asserts the locked-layout message. Axe via `expectNoSeriousAxeViolations` after `settle`. `getByTestId`
  selectors. Commit `test(operator): layout editor mocked e2e (#172)`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-07 | Review gate — F1 (invariant #2 TOCTOU) | other check-then-delete on `set_position` without a row lock | reviewed `venue` write paths | only the bulk `replaceLayout` has a claim window; single-set `removeSet` deletes one keyed row | fixed the one site (`FOR UPDATE`); single-set path unaffected — **superseded: this verdict was wrong.** Deleting one keyed row still CASCADE-drops that set's holds and still trips the booking FK; `editSet` also made `pool` mutable, breaking the claim's check-then-claim premise. Both per-set writes were guarded and the claim's pool read made locking in #567 (`docs/plans/per-set-layout-write-claim-guard.md`) |
| 2026-07-07 | Review gate — F4 (lossy price round-trip) | other lossy load→save collapses in the editor | reviewed `seedFrom`/`toRequest` | prices were the only lost field; walk-in-tier collapse is intentional (pool, not tier, is user-facing) | preserved prices via `priceByCoord` |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-7:** `gradle test --tests "*BeachMapReplaceIT*"` → `replaceThenTouristMapReflectsGrid` PASS.
- [ ] **AC-2/AC-3:** `npm test` → `layout-editor.spec.ts` PASS (generate/confirm, paint, drag, accessible label).
- [ ] **AC-4:** `BeachMapReplaceIT.poolFlagPersistsAndReadsBack` + `layout-editor.spec.ts` walk-in render PASS.
- [ ] **AC-5:** `gradle test --tests "*CrossVenueDenialIT*"` → `replaceBeachMapLayout` PASS.
- [ ] **AC-6:** `BeachMapReplaceIT` reject cases PASS (booking + walk-in-hold, layout/holds intact).
- [ ] **AC-8:** `npm run test:e2e:a11y` (layout-editor.e2e) + `npm run test:a11y` PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; the destructive-cascade guard is proven (invariant #2); no `set_availability` write.
- [ ] Pool rule honored (invariant #3); cutoff N/A (no booking).
- [ ] **Modulith** filled; new `venue/spi/BookingPresence` is `spi` not `api`; grants least-privilege; no cross-module
  `application.*`/`adapter.*` imports; payload is the `VenueId` id (invariant #11); `ModularityTests` green.
- [ ] Payment/payout **N/A** (no money moves); prices are integer minor units EUR (invariant #5).
- [ ] Timezone N/A (no dates on the wire).
- [ ] No Flyway migration (no schema change); existing invariant constraints unchanged (invariant #12).
- [ ] **Frontend** standards met; no `as any`; cells keyboard+AT operable (AC-3).
- [ ] `WebSliceStubs` + booking module-isolation stub updated (R-5, the full-suite-only class).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (or deferred with an issue #).
