# Per-set beach-map editing in the operator console — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Beach map tab a per-set editing mode — add, edit (tier/pool/price), move
and remove one set at a time through the U7 endpoints — so a venue that has taken its first
booking can still change its map, which today is impossible through the app.

**Architecture:** The tab gains an explicit **mode toggle** — *Bulk layout* (today's
generate/paint, server-locked once the venue is claimed) vs *Edit sets* (new, per-set, works
on a live venue). The per-set mode is its own component (`SetEditor`) rendering the **server's**
sets by id rather than a painted `CellState` grid, because the three endpoints address a set by
`setId` and a painted cell has no identity. `LayoutEditor` stays the owner of the venue-map read
and hands the sets down, so the tab still issues one GET per load.

**Persistence:** JDBC only (invariant #1). **No migration, no backend change** — `POST/PATCH/DELETE
/api/venues/{venueId}/sets[/{setId}]`, their ownership assertion and their `409 SET_IN_USE`
contract all shipped in #567/#599.

**Source of intent:** GitHub issue #600.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that #601
narrowed the DELETE guard to *live* holds one hour before this slice started, and that #598 is
already closed with a two-part reopen condition) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what surfaced the `set_version` non-participation as a real
coherence risk rather than a footnote) · `tdd` (each phase is a red-then-green unit spec at the
component boundary before the template exists) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (`N/A — pending; due at merge close-out step 5`) ·
`riviera-frontend` (placement: `SetEditor` is a sibling inside the existing `operator/` feature
folder, not a new folder; the shared cell styling becomes an `operator/`-local variant directive,
not a `shared/` promotion, because only this feature renders a beach cell) · `riviera-tailwind`
(rule 1 — the reused grid-cell element becomes the `appBeachCell` **variant directive**, never an
`@apply`; rule 2 — `data-state` is retained as the inert test hook the existing e2e already
queries) · `angular-developer` + **angular-cli MCP** (`get_best_practices` + `search_documentation`
for v22: `linkedSignal` is the documented primitive for "draft state derived from a source that
must stay user-editable", which replaced the `effect`-syncs-selection-to-draft shape this would
otherwise have grown — the docs call that an explicit anti-pattern; Signal Forms for the price
field per the v22 forms guidance, matching `venue-create-card.ts`) · `playwright-cli` (e2e
authored as a stateful `page.route` mock so add → edit → remove round-trips against a fake
server rather than asserting one request in isolation).

**Branch:** `feature/per-set-beach-map-editing`

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue whose map is loaded, when the operator selects a set in *Edit sets*
      mode and changes its pool from Online to Walk-in, then exactly one
      `PATCH /api/venues/{v}/sets/{setId}` is issued carrying the **full** set body (row label,
      position, tier, pool, price, gridX, gridY) and the tab re-reads the map on success.
      *Pinned by:* `SetEditorSpec.patchesTheWholeSetBodyOnSave`
- [ ] **AC-2:** Given the server refuses that edit `409 SET_IN_USE`, when the response arrives,
      then the panel shows the set-is-in-use copy, the set's rendered state is **unchanged**
      (no optimistic flip left behind), and no re-read is issued.
      *Pinned by:* `SetEditorSpec.keepsTheSetUnchangedOnSetInUse`
- [ ] **AC-3:** Given a grid with no free cell, when the operator adds a position (or a row) and
      clicks the new empty cell, then the Add panel opens for that cell and confirming issues
      `POST /api/venues/{v}/sets` with the row label and position number **derived from the grid
      cell** by the same rule the bulk editor uses (`rowLabel = A+y`, `positionNo = x+1`).
      *Pinned by:* `SetEditorSpec.addsASetIntoAGrownGridCell`
- [ ] **AC-4:** Given a selected set, when the operator confirms Remove, then
      `DELETE /api/venues/{v}/sets/{setId}` is issued, the selection clears, and the map re-reads.
      A `409 SET_IN_USE` instead leaves the set on the grid with the booked-or-held explanation.
      *Pinned by:* `SetEditorSpec.removesASet` / `SetEditorSpec.explainsARefusedRemove`
- [ ] **AC-5:** Given a selected set and Move armed, when the operator clicks an empty cell, then
      one `PATCH` is issued whose body carries the **new** coordinates and derived row/position and
      whose tier, pool and price are byte-identical to the loaded set.
      *Pinned by:* `SetEditorSpec.movesASetToAnEmptyCell`
- [ ] **AC-6:** Given a venue with saved sets, when the Beach map tab loads, then the mode is
      *Edit sets*; given a venue with none, then it is *Bulk layout*. Switching modes is
      operator-driven and never resets the other mode's in-progress work.
      *Pinned by:* `LayoutEditorSpec.defaultsToTheModeTheVenueNeeds`
- [ ] **AC-7:** Given the bulk save is refused `LAYOUT_IN_USE`, when the message renders, then it
      states the venue is live **and points at Edit sets** — it no longer claims "layout changes
      are not possible".
      *Pinned by:* `LayoutEditorSpec.pointsALockedLayoutAtPerSetEditing`
- [ ] **AC-8:** Given the per-set surface at a 390 px viewport, when it renders, then the panel
      stacks under the grid, every control is a ≥44 px touch target, and the page does not scroll
      horizontally; axe reports no serious violations in either mode.
      *Pinned by:* `set-editor.a11y.spec.ts` + `operator-set-editing.e2e.ts`

## Non-goals

- **No backend change.** No new endpoint, no pre-warn "is this set movable" probe — explicitly
  rejected in O3 (#172) and re-affirmed by #600. The guard stays discovered reactively via `409`.
- **No `expectedVersion` on the per-set writes.** They do not participate in the `set_version`
  token today (#567's deliberate choice); adding them to it is a backend change and out of scope.
  Recorded as R-3 instead.
- **No drag-to-move.** Move is arm-then-click-a-cell, so it is keyboard-operable; drag would be an
  extra affordance on top, not the primitive.
- **No bulk per-set operations** (multi-select, "remove this whole row"). One set at a time.
- **Not re-opening #598.** Its reopen condition is *a shipped remove button **and** real
  `DataIntegrityViolationException` noise in the logs* — this slice satisfies only the first half.
- **No change to the Pricing tab.** Row-level repricing stays where it is.

## Behavior-parity ledger

> The slice **adds** a mode beside the existing bulk editor; it retires nothing. The one existing
> behavior it changes is the `LAYOUT_IN_USE` copy, and the ledger is filled for the bulk editor
> because the mode toggle re-hosts every one of its behaviors inside a branch.

| Old-surface behavior (bulk editor, today) | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| Generate R×C grid, confirm-before-regenerate | preserved | untouched; lives inside the *Bulk layout* branch |
| Paint by click and by drag; keyboard paint via native button click | preserved | untouched |
| Seeds the grid from the server map, preserving each set's loaded price | preserved | untouched; the same read now also feeds `SetEditor` |
| Captures `setVersion`; Save echoes it; `409 STALE_WRITE` → keep grid + Reload banner | preserved | untouched — per-set writes never touch that token (R-3) |
| `loadFailed` → Save refuses and prompts a refresh instead of a silent no-op | preserved | untouched. **Per-set mode is deliberately NOT gated on the token** — it needs no `expectedVersion`, so a failed read blocks per-set editing only by leaving no sets to edit |
| Epoch guard drops a superseded venue-switch continuation (#180) | preserved | `SetEditor` gets its own epoch guard over each write |
| `venueMap.reset()` after a successful bulk save | preserved, **extended** | now also after every successful per-set write, or the other tabs render a set this tab just removed |
| `LAYOUT_IN_USE` copy: "Layout changes are not possible while sets are in use." | **changed** | factually wrong since #567. Now: the venue is live, so the whole-map replace is locked — edit sets one at a time instead, with the toggle right there |
| Cell rendering via the component-local `CELL_CLASS` map | changed (mechanical) | moved to the `appBeachCell` variant directive so both modes render the identical cell; pinned byte-for-byte against the old strings by `beach-cell.spec.ts` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A per-set write lands but the tab keeps rendering the pre-write map, so the operator repeats it or reads a stale grid | high | med | every successful write calls `venueMap.reset()` **and** re-reads the map through the parent; the panel's draft is a `linkedSignal` over the selected set, so a re-read re-seeds it rather than leaving a phantom draft | Claude | open |
| R-2 | A `409 SET_IN_USE` leaves an optimistic UI change applied, so the map shows a move/repool the server refused | med | high | **no optimistic apply on the per-set writes at all** — the grid re-renders only from a server re-read. Cheap here (one set, one round-trip), unlike the Pricing tab's per-row optimism | Claude | open |
| R-3 | Per-set writes do not bump `set_version`, so a bulk-layout tab open elsewhere keeps a token that looks fresh, and a per-set price edit can be silently overwritten by a later row reprice | med | low | out of scope to fix (backend); documented in the panel's TSDoc and surfaced to the operator as "row pricing overrides this". The bulk write is anyway impossible on the live venues where per-set editing is the point — the overlap window is a clean venue only | Claude | open |
| R-4 | Growing the grid lets the operator add a set beyond the server's layout maxima (26 rows × 40 positions), producing an avoidable `400` | med | low | clamp the grow buttons to the same `MAX_ROWS`/`MAX_COLS` the bulk editor already enforces, shared from one constant | Claude | open |
| R-5 | Two sets end up on one cell because the tab's view of "empty" is stale | low | med | the server's `CELL_TAKEN`/`DUPLICATE_POSITION` `409` is the authority and is surfaced verbatim; the tab never resolves the collision itself | Claude | open |
| R-6 | Visual drift when the cell styling moves out of `layout-editor.ts` into a directive | med | low | `beach-cell.spec.ts` asserts the emitted class string per state equals the strings the component used before the move; the existing e2e still asserts `data-state` | Claude | open |
| R-7 | Money handled as float in the per-set price field (invariant #5) | low | high | the euros↔minor conversion is `shared/money.ts`'s `eurosToMinorUnits`/`minorUnitsToEuros` — the one existing edge helper; a cleared/invalid field is "no change", never €0 | Claude | open |
| R-8 | Per-venue authorization (invariant #13) | low | high | server-asserted in `EditBeachMap` before any read/write; the tab only surfaces `403 NOT_VENUE_OWNER` as copy. No FE-side authorization is claimed | Claude | open |
| R-9 | Making DELETE reachable turns #598's closed race into user-visible `500`s | low | low | accepted, per #598's own closing note; this slice satisfies only half its reopen condition. Re-check the logs after deploy | Claude | open |

## Open questions / Assumptions

- **Assumption:** the operator wants per-set price editing (the issue names "a set created … at the
  wrong price"), accepting that a later Pricing-tab row reprice overwrites it — *Owner:* Ivo ·
  *Resolves by:* **resolved at plan time**, see Resolved.
- **Assumption:** a grid grown in the UI but never used (operator adds a row, adds nothing, leaves)
  needs no persistence — the grid extent is derived from the sets, so the extra row simply vanishes
  on reload. *Owner:* Claude · *Resolves by:* phase 3.

### Resolved

- **Mode model** — explicit toggle, default chosen by whether the venue already has sets
  (maintainer, 2026-08-10, pre-phase-0).
- **Per-set price** — editable in the panel (maintainer, 2026-08-10, pre-phase-0).
- **Adding into a full grid** — grid may be grown by row/position (maintainer, 2026-08-10,
  pre-phase-0).

## Availability & concurrency (invariant #2)

The slice writes **nothing** to `availability(set_id, booking_date)` — it is a frontend surface over
three existing endpoints. What it changes is that those endpoints, and the claim guards behind them,
become reachable from a browser for the first time. So the section is about what the UI must **not**
undermine:

- **Write paths to `availability(set_id, booking_date)`:** unchanged — online booking claim, staff
  tap-to-mark, cancellation/decline/expiry release, weather refund. **This slice adds none.** A
  `DELETE` may `CASCADE` away a `set_availability` row, but only one the server has already ruled
  non-load-bearing (a hold whose day has passed, #599).
- **Uniqueness guarantee:** unchanged — `set_availability_uniq` on `(set_id, booking_date)`.
- **Concurrency strategy:** entirely server-side and already shipped (#567) — `editSet`/`removeSet`
  take the set row `FOR UPDATE` before probing, and the online claim reads the pool under
  `FOR KEY SHARE`. **The UI must not attempt to pre-empt it:** no client-side "this set looks
  movable" prediction (explicitly a non-goal), no optimistic apply (R-2). The tab's whole
  contribution to invariant #2 is *surfacing the server's refusal honestly and re-reading*.
- **Pool rule (invariant #3):** the panel offers a pool flip, and the server refuses it on a set
  carrying a live claim (`SET_IN_USE`) precisely so a repool cannot strand an online booking on
  walk-in inventory. The tab renders that refusal; it never retries or works around it.
- **Cutoff rule (invariant #4):** not engaged — no booking is created or cancelled here.
- **Pinning test:** the invariant itself is pinned server-side by
  `VenueAdminControllerIT` / `VenueAdminServiceTest` (#567, #599). This slice's contribution is
  `SetEditorSpec.keepsTheSetUnchangedOnSetInUse` — proving the client leaves the refused change
  unapplied rather than diverging from the server.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file is in scope; no module, port or event changes.

### Module ownership (§4a)

`N/A — frontend-only`; no backend capability is added or moved. The three capabilities this slice
exposes are already owned by `venue` (`EditBeachMap#addSet`/`editSet`/`removeSet`), and
`RESPONSIBILITIES.md` §`venue` already records them.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves. The one money-adjacent surface is the per-set **price**
field, which is display-and-edit only: euros ↔ integer minor units convert at the edge through
`shared/money.ts` (invariant #5), and a set's price never retroactively alters a booking's charge —
that was snapshotted at reserve time, which is exactly why the server allows a price edit on a
claimed set at all.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` + `.html` | new | standalone component | Signals; `linkedSignal` for the draft over the selected set and for the selection over the sets input; `computed` grid | Signal Forms for the price field |
| FE-2 | `operator/beach-cell.ts` | new | variant directive (`appBeachCell`) | `input()` state → `computed()` class string | — |
| FE-3 | `operator/layout-editor.ts` + `.html` | existing | standalone component | adds a `mode` signal + a `linkedSignal` default over the loaded sets | — |
| FE-4 | `operator/operator-console.service.ts` + `.model.ts` | existing | `@Service()` HTTP | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
`host` object over `@HostBinding`, no `ngClass`/`ngStyle`. Per the angular-cli MCP best-practices
guide, **no `effect()` is used to sync the draft to the selection** — that is the documented
anti-pattern; `linkedSignal` does it. `OnPush`/`standalone` are not set explicitly (v22 defaults).

**Responsive + buttons (explicit ask).** Tailwind only, no new SCSS:
- The tab's two-column shell stays `grid-cols-1 lg:grid-cols-[280px_1fr]` — the panel is the first
  column on desktop and stacks **above** the grid on mobile, so a selection is visible without
  scrolling back up.
- The grid frame scrolls inside its own `overflow-x-auto` container; the page body never scrolls
  horizontally. Cells keep a floor size so a 40-position row is pannable rather than unreadably thin.
- Every action is a real `<button>` with `min-h-[44px]` and `px-4`, wrapped in `flex flex-wrap
  gap-2` so the Save/Move/Remove trio wraps instead of overflowing; the destructive Remove takes the
  refund-red ink already used by the payouts ledger, not a new colour.
- Tier/pool are `aria-pressed` toggle-button pairs (the `layout-tool-*` pattern already in this
  tab), not a `<select>` — a 2-value choice with a visible swatch reads better on a phone.
- Sizes are `text-[…px]` per `riviera-tailwind` (never `text-sm`); tokens `--riv-card-*` do the
  theming, so the component names no theme.

## FE↔BE contract

- **New/changed endpoints:** none. Newly *consumed*:
  - `POST /api/venues/{venueId}/sets` → `201 {id}` · body `{rowLabel, positionNo, tier, pool, price:{minorUnits,currency}, gridX, gridY}`
  - `PATCH /api/venues/{venueId}/sets/{setId}` → `204` · **same full body** (partial → `400`)
  - `DELETE /api/venues/{venueId}/sets/{setId}` → `204`
  - Failures (RFC-7807 `code`): `SET_IN_USE`, `CELL_TAKEN`, `DUPLICATE_POSITION` (`409`),
    `NO_SUCH_SET`, `NO_SUCH_VENUE` (`404`), `NOT_VENUE_OWNER` (`403`), `INVALID_REQUEST` (`400`).
- **Client typing:** a hand-written `SetWriteRequest` in `operator-console.model.ts` reusing the
  shared `Tier`/`Pool`/`MoneyView` contract types, and a `SetWriteErrorCode` union mapped by
  `setWriteErrorOf` — the established `layoutErrorOf`/`repriceErrorOf` shape. No `as any`.
- **Money/date on the wire:** amounts as integer minor units + ISO currency. No dates on these three.

## Execution status

**Stage pointer:** `implement — phase 2`

**Next action:** Phase 2 — red spec for Remove: confirm → `DELETE`, selection clears, `changed`
emitted; and the `409 SET_IN_USE` path leaving the set on the grid.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — HTTP surface (service, model, error mapper) | ✅ | `<phase-0>` |
| 1 — `SetEditor`: select + edit tier/pool/price; mode toggle; `LAYOUT_IN_USE` copy | ✅ | `<phase-1>` |
| 2 — Remove, with confirm and `SET_IN_USE` copy | | |
| 3 — Add (grow the grid) and Move | | |
| 4 — a11y + contrast specs, responsive pass, e2e | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/per-set-beach-map-editing.md` — this plan
- `frontend/src/app/operator/operator-console.model.ts` — `SetWriteRequest`, `SetWriteErrorCode`
- `frontend/src/app/operator/operator-console.service.ts` — `addSet` / `editSet` / `removeSet` / `setWriteErrorOf`
- `frontend/src/app/operator/operator-console.service.spec.ts` — specs for the three writes + the mapper
- `frontend/src/app/operator/beach-cell.ts` — the `appBeachCell` variant directive (shared cell styling)
- `frontend/src/app/operator/beach-cell.spec.ts` — pins the per-state class strings (no-drift proof)
- `frontend/src/app/operator/set-editor.ts` — the per-set editing component
- `frontend/src/app/operator/set-editor.html` — its template
- `frontend/src/app/operator/set-editor.spec.ts` — unit spec (select/edit/add/move/remove + failures)
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — axe over the per-set surface
- `frontend/src/app/operator/set-editor.contrast.spec.ts` — AA proof for the panel inks
- `frontend/src/app/operator/layout-editor.ts` — mode toggle, default-mode rule, corrected copy
- `frontend/src/app/operator/layout-editor.html` — the toggle + the `SetEditor` branch
- `frontend/src/app/operator/layout-editor.spec.ts` — mode-default + copy specs
- `frontend/e2e/operator-set-editing.e2e.ts` — CI-safe mocked e2e for the per-set flow
- `docs/plans/o3-layout-editor.md` — the O3 plan states the tab is bulk-only; corrected here

---

## Phase 0 — HTTP surface

**Files:** Modify `frontend/src/app/operator/operator-console.model.ts` ·
`frontend/src/app/operator/operator-console.service.ts` ·
Test `frontend/src/app/operator/operator-console.service.spec.ts`

- [ ] **Step 1: Write the failing test** — three request-shape specs (`POST` body + URL, `PATCH`
      URL carries `setId`, `DELETE` URL) plus `setWriteErrorOf` mapping `SET_IN_USE`, `CELL_TAKEN`,
      `NOT_VENUE_OWNER`, a bare `401`, and an unknown code → `UNKNOWN`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- operator-console.service` → FAIL,
      `addSet is not a function`
- [ ] **Step 3: Minimal implementation** — the three methods over `HttpClient`, `SetWriteRequest`
      reusing `Tier`/`Pool`/`MoneyView`, `SetWriteErrorCode` union + `setWriteErrorOf` in the
      `layoutErrorOf` shape.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- operator-console.service` → PASS
- [ ] **Step 5: Generalization-audit pass** — check whether any other console write still lacks a
      typed error mapper; record the answer.
- [ ] **Step 6: Commit** — `git commit -m "Add the per-set beach-map write surface (#600)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `SetEditor`: select and edit; the mode toggle

**Files:** Create `set-editor.ts` · `set-editor.html` · `set-editor.spec.ts` · `beach-cell.ts` ·
`beach-cell.spec.ts` · Modify `layout-editor.ts` · `layout-editor.html` · Test `layout-editor.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-1, AC-2, AC-6, AC-7 as unit specs; `beach-cell.spec.ts`
      asserting each state's class string equals the pre-move `CELL_CLASS` value.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- set-editor` → FAIL, component absent
- [ ] **Step 3: Minimal implementation** — `SetEditor` with `venueId`/`sets` inputs and a `changed`
      output; `selectedSetId` and the draft as `linkedSignal`s (selection survives a re-read when
      the set still exists, and the draft re-seeds when it doesn't); `PATCH` on Save with the full
      body; no optimistic apply. `LayoutEditor` gains the mode toggle, the default-mode
      `linkedSignal`, the `SetEditor` branch, the re-read on `changed`, and the corrected
      `LAYOUT_IN_USE` copy.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- set-editor layout-editor beach-cell` → PASS
- [ ] **Step 5: Generalization-audit pass** — the epoch-guard pattern (#180): confirm `SetEditor`'s
      writes carry it, and check whether any other console write path still lacks it.
- [ ] **Step 6: Commit** — `git commit -m "Let an operator edit one beach-map set (#600)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Remove

**Files:** Modify `set-editor.ts` · `set-editor.html` · Test `set-editor.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-4: confirm-then-`DELETE`, selection clears, `changed`
      emitted; and the `409 SET_IN_USE` path leaving the set on the grid with the booked-or-held copy.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- set-editor` → FAIL, no remove control
- [ ] **Step 3: Minimal implementation** — a two-step destructive control mirroring the bulk
      editor's regenerate confirm (`role="alertdialog"`), then `removeSet`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- set-editor` → PASS
- [ ] **Step 5: Generalization-audit pass** — destructive-confirm affordances across the console:
      is this the same shape as regenerate and the admin photo takedown?
- [ ] **Step 6: Commit** — `git commit -m "Let an operator remove a beach-map set (#600)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Add and Move

**Files:** Modify `set-editor.ts` · `set-editor.html` · Test `set-editor.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-3 (grow, click the new cell, `POST` with derived
      row/position) and AC-5 (arm Move, click an empty cell, `PATCH` with new coordinates and
      unchanged tier/pool/price), plus the grow clamp at 26×40 (R-4).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- set-editor` → FAIL, no add/move controls
- [ ] **Step 3: Minimal implementation** — `extraRows`/`extraCols` signals clamped against the
      shared maxima; an empty cell opens the Add panel; Move arms a target mode whose next empty-cell
      click issues the `PATCH`. `CELL_TAKEN`/`DUPLICATE_POSITION` are surfaced, never resolved locally.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- set-editor` → PASS
- [ ] **Step 5: Generalization-audit pass** — the `MAX_ROWS`/`MAX_COLS` constants: one home, or two
      copies drifting between the bulk and per-set surfaces?
- [ ] **Step 6: Commit** — `git commit -m "Let an operator add and move a beach-map set (#600)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — a11y, responsive, e2e

**Files:** Create `set-editor.a11y.spec.ts` · `set-editor.contrast.spec.ts` ·
`frontend/e2e/operator-set-editing.e2e.ts` · Modify `set-editor.html` · `docs/plans/o3-layout-editor.md`

- [ ] **Step 1: Write the failing test** — AC-8: axe over both modes; the contrast proof for the
      panel inks; an e2e driving sign-in → Edit sets → edit → add → move → remove against a
      **stateful** `page.route` mock, at a 390 px viewport, asserting no horizontal page scroll.
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- operator-set-editing` → FAIL
- [ ] **Step 3: Minimal implementation** — the responsive/touch-target pass described above; fix
      whatever axe reports.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:a11y` and
      `npm run test:e2e:a11y -- operator-set-editing` → PASS
- [ ] **Step 5: Generalization-audit pass** — 44 px touch targets: do the sibling console tabs meet
      it, or is this slice the first? Record, fix here only if trivial and in-file.
- [ ] **Step 6: Commit** — `git commit -m "Cover per-set beach-map editing end to end (#600)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | Phase 1 — `SetEditor` guards an in-flight write by re-reading `venueId` instead of the siblings' epoch counter | Console surfaces whose async continuations survive an in-place venue switch (#180) | `rg 'private epoch = 0\|this\.epoch !== epoch' frontend/src/app` | 9 files, 34 sites — every venue-scoped console tab plus the tourist map | keep the deliberate difference, do not generalize the epoch here. The epoch exists to protect a **venue-scoped draft** that outlives the switch (a painted grid, an optimistic row price). `SetEditor` holds none: selection and draft are `linkedSignal`s over the `sets` input, which the parent replaces on switch, so the only thing a superseded continuation could damage is an outcome flag — which the `venueId` value check already drops. Recorded in the component's TSDoc so review reads it as a decision, not an omission |
| 2026-08-10 | Phase 0 — added `setWriteErrorOf` | An operator write path with no typed RFC-7807 error mapper (an untyped `catch` reading `error.error.code` inline, or a raw `HttpErrorResponse` reaching a template) | `rg 'export function \w+ErrorOf' frontend/src/app/operator` vs `rg 'this\.http\.(post\|patch\|put\|delete)' frontend/src/app/operator` | 11 mappers over 14 write call sites; the 3 unmatched are the two accept/decline POSTs (`requestErrorOf`) and the reprice PUT (`repriceErrorOf`), both already covered — every write is mapped | skip — no gap to generalize; the pattern was already universal and this slice joins it rather than introducing it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- set-editor` → `patchesTheWholeSetBodyOnSave` passes. Verified at `<sha>`.
- [ ] **AC-2:** `npm test -- set-editor` → `keepsTheSetUnchangedOnSetInUse` passes. Verified at `<sha>`.
- [ ] **AC-3:** `npm test -- set-editor` → `addsASetIntoAGrownGridCell` passes. Verified at `<sha>`.
- [ ] **AC-4:** `npm test -- set-editor` → `removesASet` + `explainsARefusedRemove` pass. Verified at `<sha>`.
- [ ] **AC-5:** `npm test -- set-editor` → `movesASetToAnEmptyCell` passes. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- layout-editor` → `defaultsToTheModeTheVenueNeeds` passes. Verified at `<sha>`.
- [ ] **AC-7:** `npm test -- layout-editor` → `pointsALockedLayoutAtPerSetEditing` passes. Verified at `<sha>`.
- [ ] **AC-8:** `npm run test:a11y` + `npm run test:e2e:a11y -- operator-set-editing` → PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — trivially held, no backend file in scope.
- [ ] **Availability** section filled; the client applies nothing optimistically and re-reads on
      every success (invariant #2).
- [ ] Pool rule honored: the repool refusal is surfaced, never worked around (invariant #3).
      Cutoff not engaged (invariant #4).
- [ ] **Modulith** section filled (`N/A — frontend-only`, justified).
- [ ] **Payment/payout** section filled (`N/A`, justified); the price field converts at the edge in
      integer minor units (invariant #5).
- [ ] Invariant #13: no FE-side authorization claimed; `403 NOT_VENUE_OWNER` surfaced as copy.
- [ ] Flyway: none needed — no schema change (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract; no `effect()` used to sync state.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder *plus*
      `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
