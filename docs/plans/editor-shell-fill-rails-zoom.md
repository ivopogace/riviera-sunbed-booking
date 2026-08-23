# Editor shell S5 — fill rails and zoom

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator two accelerators for complex venues on the bulk paint grid,
built on S2's armed-brush model: (1) **fill rails** — the row-code rail and a new
column-header strip become click/drag fill targets that paint a whole row or column with
the armed brush in one gesture; (2) **zoom** — a Fit/100% toggle on the canvas, where Fit
keeps today's measured-to-width tile size (already floored at 44px, #709) and 100% pins
tiles to their native size, overflowing on a wide venue and panning via a **dedicated
gesture** (space-drag on desktop, two-finger drag on touch) that never collides with the
editor's own click/drag-to-paint gesture.

**Architecture:** Both accelerators extend `BeachMapCanvas` (#672) — the shared chrome
already used by the tourist map, the layout editor, Daily view, and the per-set editor —
with new **opt-in** inputs/outputs, defaulting off so every other consumer (tourist map,
Daily view, `SetEditor`) renders byte-for-byte unchanged:

1. **Fill rails.** The row-code rail (already rendered by the canvas, today a decorative
   `aria-hidden` chip) becomes a real `<button>` when `rowRailInteractive()` is true,
   sized to the 44px floor, emitting `rowRailFill(rowIndex)` on click and on a
   mousedown→mouseenter drag-sweep across rail buttons (mirroring the cell drag-paint
   precedent in `layout-editor.ts`, but owned by the canvas so the sweep is free to any
   future consumer). A new column-header strip — nothing like it exists today — renders
   the same way when `colHeaderInteractive()` is true, sitting `sticky top-0` inside the
   horizontally-scrolling viewport (so it scrolls with the columns, stays pinned against
   the vertical wash scroll) and emits `colHeaderFill(colIndex)` on the same click/drag
   contract. Each accessible name is supplied by the consumer via a plain function input
   (`rowRailLabel`/`colHeaderLabel`), read live so it tracks the armed brush. `LayoutEditor`
   wires both fill events to a `fillRow`/`fillColumn` mutator that is `paintCell`
   generalized from one cell to a whole row/column array — same `grid` signal, same
   `dirtyCount`/`baselineGrid` diff, same single bulk PUT via the untouched `toRequest()`.
   No new write path (epic #708's own constraint).

   **Reconciling the issue's "with Select armed the rails do nothing destructive" AC
   against S2's actual architecture (grill finding):** arming Select does not leave the
   bulk canvas on screen with inert rails — S2 (#711) already switches the whole surface
   away to `<app-set-editor>` (`layout-editor.html:213-225`, `mode() === 'sets'`). The
   fill rails render only inside the bulk-canvas branch, which is only ever shown while
   a brush (not Select) is the resolved tool. So "the rails do nothing destructive" holds
   by construction — there is nothing to click — and no additional guard is needed in
   `fillRow`/`fillColumn` beyond that existing mode switch.

2. **Zoom.** A new `zoomControl` input renders the Fit/100% pill pair (top-right over the
   wash, per the design artboard) and an internal `zoomMode` signal (`'fit' | 'full'`)
   switches `tileSizeStyle` between the existing measured-fit value (untouched — Fit's
   44px floor is `measureFittedTile()`'s existing clamp, #709, not touched by this slice)
   and a fixed `FIT_MAX_TILE_PX` (56px — already the ceiling Fit itself never exceeds, so
   "100%" is literally what an unfitted tile would render at, not a new magic number).
   100% is deliberately independent of the general-purpose `dragPan` input (which means
   "any drag pans" for the tourist map): a **new**, always-gated pan gesture — armed only
   by a held Space key (tracked via `window:keydown.space`/`window:keyup.space` host
   bindings, the app's established `document:`-scoped host-listener idiom) while focus is
   not on a focusable control inside the canvas, or by a two-finger touch drag — activates
   only while `zoomControl() && zoomMode() === 'full'`, so it can never fire for a
   consumer that hasn't opted in and never conflicts with the editor's own plain-drag
   paint gesture.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no backend/DB change; the
bulk PUT body (`LayoutCellRequest[]`, `{ sets, expectedVersion }`) is byte-for-byte
unchanged (AC-6).

**Source of intent:** GitHub issue #713 (epic #708, S2 predecessor #711 merged as PR
#769, S3 #712 merged as PR #770); visual spec — the "paint state" artboard on the epic's
design artifact (`https://claude.ai/code/artifact/af8252b7-f0c5-4177-b65d-93716c911f77`,
`Main.dc.html`): a 14-column header strip and 5-row rail, both chip-styled, with column 7
and row E highlighted to match the armed Walk-in/Gap brush; a "Fit"/"100%" pill pair
top-right of the wash.

**Skills consulted:** `riviera-sdlc` (routing gate; issue-intake grill — confirmed #711
and #712 both merged and closed, no in-flight PR touches `beach-map-canvas.ts`/
`layout-editor.ts`, no Flyway collision since this is frontend-only) · `riviera-plan-doc`
(this doc) · `tdd` (specs extended per behavior before each class/template edit) ·
`riviera-review-overlay` (review gate at PR ready-for-review) · `riviera-docs-freshness`
(deferred to merge close-out — likely N/A, no substrate doc states today's decorative-rail
or Fit-only behavior) · `riviera-frontend` (no new folder — `BeachMapCanvas` stays in
`shared/`, `LayoutEditor` stays in `operator/`; no new cross-feature import) ·
`angular-developer` + angular-cli MCP, consulted **before** writing (`list_projects`
confirmed Angular 22 workspace; `get_best_practices` re-read — host bindings via the
`host` object not `@HostListener`, signals for local state, `computed()` for derived
state; `search_documentation` checked "host bindings" against v22 docs, confirming the
`window:`/`document:`-scoped host-listener syntax this plan reuses) and again **after**
implementation at the review-fix pass · `riviera-tailwind` (new fill-rail/column-header
buttons use `[appTouchTarget]`, `text-[14px]` not `text-sm`, no `@apply`; the Fit/100%
pills follow the existing pill/chip idiom already in the tool rail) · `playwright-cli`
(drove the mocked e2e suite locally while extending `layout-editor.e2e.ts` for fill/zoom
coverage).

**Branch:** designated cloud branch `claude/tailwind-angular-mcp-search-vqlwgn` stands in
for `feature/editor-shell-fill-rails-zoom` (remote-session addendum) — exists, is current
with `main` at branch-off.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a brush armed on the bulk paint grid, when the operator clicks a
      row-rail chip, then every cell in that row is painted with the armed brush, the
      tool counts update, and the save bar's dirty count increases by the number of cells
      that changed. *Pinned by:* `LayoutEditor.spec.ts` — "fillRow paints every cell in
      the row with the active brush" / "fillRow updates counts and dirty state".
- [ ] **AC-2:** Given a brush armed, when the operator clicks a column-header chip, then
      every cell in that column is painted with the armed brush and counts/dirty state
      update the same way. *Pinned by:* `LayoutEditor.spec.ts` — "fillColumn paints every
      cell in the column…".
- [ ] **AC-3:** Given a brush armed, when the operator presses the mouse down on one
      row-rail (or column-header) chip and drags across several without releasing, then
      every swept row/column is filled — a single release, one dirty-state update covering
      the whole band. *Pinned by:* `BeachMapCanvas.spec.ts` — "a mousedown→mouseenter
      sweep across rail buttons emits fill for every entered index" + `layout-editor.e2e.ts`
      "drag across row chips fills the swept band in one PUT".
- [ ] **AC-4:** Given Select is armed, the bulk canvas (and therefore the fill rails) is
      not rendered at all — `mode() === 'sets'` shows `SetEditor` instead (S2's existing
      switch) — so there is nothing destructive to click. *Pinned by:* existing
      `LayoutEditor.spec.ts` mode-switch coverage (unchanged) + a new assertion that no
      `row-code-fill`/`col-header-fill` testid exists while `mode() === 'sets'`.
- [ ] **AC-5:** Every fill target is a real, individually-labelled `<button>` — Enter/Space
      activates it via native click, `[appTouchTarget]` meets the 44×44px floor on both
      the row rail and the column header, and its accessible name is
      `"Fill row {code} with {brush label}"` / `"Fill column {n} with {brush label}"`,
      tracking the currently-armed brush. *Pinned by:* `BeachMapCanvas.spec.ts` — "row/col
      fill buttons carry the label the consumer supplies" + `touch-targets.e2e.ts`
      extended for the new controls.
- [ ] **AC-6:** Given the Fit/100% toggle, when Fit is active, tile sizing and the 44px
      floor are exactly today's `measureFittedTile()` behavior (unchanged); when 100% is
      active, tiles render at the fixed native size (`FIT_MAX_TILE_PX`, 56px — never below
      the floor) and the grid overflows/pans instead of shrinking further.
      *Pinned by:* `BeachMapCanvas.spec.ts` — "zoomMode 'full' pins tile size to
      FIT_MAX_TILE_PX regardless of measured fit".
- [ ] **AC-7:** At 100% zoom, a plain mouse drag over a cell still paints (never pans);
      holding Space and dragging pans the viewport (`scrollLeft`/`scrollTop` change) and
      paints nothing; releasing Space returns to plain-drag-paints-only. A two-finger touch
      drag pans; a single-finger touch is unaffected (unchanged, no regression). *Pinned
      by:* `layout-editor.e2e.ts` — "space-drag pans without painting at 100% zoom" /
      "plain drag paints, never pans, at 100% zoom" (e2e proves both, per the issue's own
      AC) + `BeachMapCanvas.spec.ts` unit coverage for the two-finger touch-pan math
      (browser-level multi-touch synthesis is unreliable in the mocked Playwright suite —
      see Risk register R-4).
- [ ] **AC-8:** Discard reverts an unsaved fill exactly like an unsaved single-cell paint
      (no new undo mechanism — S3's existing baseline-diff `discard()` already covers a
      whole-row/column mutation, since it diffs cell-by-cell). *Pinned by:*
      `LayoutEditor.spec.ts` — "discard reverts a row/column fill".
- [ ] **AC-9:** Layout-editor e2e extended for fills + zoom and green; axe clean; the
      existing single-PUT-payload and `LAYOUT_IN_USE`/`STALE_WRITE` assertions stay
      unweakened. *Pinned by:* `layout-editor.e2e.ts`, `npm run test:e2e:a11y`.

## Non-goals

- Batch select (a marquee/rectangle select tool) — S6, a later epic slice.
- Any change to the tool rail, Generate, Select/inspector, or the save bar beyond reading
  the same `grid`/`dirtyCount` state fills already feed (S2/S3, done).
- Any backend/API change — the bulk PUT payload shape is untouched.
- Touch drag-paint parity (single-finger touch painting a swept path of cells) — out of
  scope; today's drag-paint is mouse-only (`onCellDown`/`onCellEnter` bind `(mousedown)`/
  `(mouseenter)`), and this slice does not change that.
- Pinch-to-zoom or a continuous zoom slider — the design is explicitly a two-state
  Fit/100% toggle, not a magnification control.

## Behavior-parity ledger

N/A — purely additive. No existing surface is retired or replaced; every new input/output
on `BeachMapCanvas` defaults to today's behavior, and `LayoutEditor`'s existing paint/
Generate/Save/Discard paths are untouched.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Adding an interactive row rail / column header to the shared `BeachMapCanvas` regresses the tourist map, Daily view, or `SetEditor`, which all render the canvas's rails as decorative | low | high | Every new behavior is gated behind `rowRailInteractive()`/`colHeaderInteractive()`/`zoomControl()`, all defaulting `false`; existing specs for those three consumers run unmodified as the regression proof | this session | open — verify via full unit + a11y + mocked e2e suite before close-out |
| R-2 | The column header, sitting `sticky top-0` inside the horizontally-scrolling viewport, drifts out of alignment with the tile columns beneath it on some browser/zoom combination | med | med | Both the header and the tile grid read the same `mapCols()`/`--riv-tile` sizing and the same `gap-1.5`; a dedicated e2e measures each header chip's `getBoundingClientRect().left` against its column's first tile | this session | open — verify with a computed-style e2e assertion, not eyeballing |
| R-3 | Space-drag-to-pan swallows a legitimate Space keypress meant to activate a focused fill/cell button (native Space-activates-button semantics) | med | med | `onSpaceDown` only arms panning when `document.activeElement` is NOT a focusable control inside the canvas (checked via `closest('button, [tabindex]')`); a focused button's Space keypress is left alone and activates normally | this session | open — verify with a spec: "Space on a focused cell button paints, does not arm pan" |
| R-4 | Two-finger touch-pan cannot be reliably driven end-to-end in the mocked Playwright suite (multi-touch synthesis is limited/flaky in headless Chromium) | high | low | Cover the touch-pan math (delta tracking, threshold, scroll assignment) at the unit level (`BeachMapCanvas.spec.ts`, calling the handler with synthetic `TouchEvent`-shaped objects) instead of a full browser gesture; the desktop space-drag path — the higher-value, reliably-testable case — gets the full e2e proof the issue asks for | this session | resolved — proportionate coverage split, recorded here rather than silently thin |
| R-5 | `fillRow`/`fillColumn`'s drag-sweep re-fills an already-filled row/column on every `mouseenter` during the drag (no "already touched" set), wasting a signal update per re-entry | low | low | Accepted: filling the same row/column twice with the same brush is idempotent (identical resulting state), and `grid.update` a few extra times during one drag is negligible — same posture as the existing single-cell `onCellEnter`, which re-paints on every re-entry too | this session | resolved — accepted as designed, matches existing precedent |

## Open questions / Assumptions

### Resolved

- **Assumption:** "100%" zoom pins tiles to `FIT_MAX_TILE_PX` (56px) — the existing
  ceiling Fit itself never exceeds — rather than a new, separate constant. This is a
  discoverable engineering choice (reusing an existing, already-load-bearing constant),
  not a product decision: "100%" reads naturally as "the tile's native/uncompressed size",
  which is exactly what Fit already clamps toward before shrinking for width.
- **Assumption:** the fill rails need no explicit guard against Select being armed — see
  the Architecture section's grill-finding reconciliation. Confirmed by reading S2's
  actual `mode()`-switch template (`layout-editor.html:213-225`): the bulk canvas the
  rails live in is unrendered whenever Select is armed.
- **Assumption:** the column header lives inside the horizontally-scrolling viewport
  (`sticky top-0`), not as a second independently-scrolled element, to guarantee
  horizontal alignment by construction rather than by keeping two scroll positions in
  sync.
- **Assumption:** Space-drag pan is scoped to when focus is not on a canvas-internal
  control (Risk R-3) — resolves the only real conflict between the "dedicated gesture"
  requirement and native keyboard-activation semantics, without disabling Space-activate
  for keyboard users.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Fills and zoom are presentation/state-tracking only;
the write path (`replaceLayout`) and the `availability` table are untouched — a fill is
exactly a batch of `paintCell` calls feeding the same client-side `grid` signal that
already existed before this slice.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/shared/beach-map-canvas.ts` | existing | standalone component | new `rowRailInteractive`/`rowRailLabel`/`colHeaderInteractive`/`colHeaderLabel`/`zoomControl` inputs, `rowRailFill`/`colHeaderFill` outputs, internal `zoomMode`/`spaceHeld`/pan-gesture signals | N/A |
| FE-2 | `frontend/src/app/shared/beach-map-canvas.html` | existing | template | new interactive rail-button branch, new column-header row, new Fit/100% pill pair | — |
| FE-3 | `frontend/src/app/shared/beach-map-canvas.spec.ts` | existing | Vitest spec | — | — |
| FE-4 | `frontend/src/app/operator/layout-editor.ts` | existing | standalone component | new `fillRow`/`fillColumn` mutators, `rowFillLabel`/`colFillLabel` bound-function fields | unchanged |
| FE-5 | `frontend/src/app/operator/layout-editor.html` | existing | template | wire `rowRailInteractive`/`colHeaderInteractive`/`zoomControl` + the fill/label bindings on `<app-beach-map-canvas>` | — |
| FE-6 | `frontend/src/app/operator/layout-editor.spec.ts` | existing | Vitest spec | — | — |
| FE-7 | `frontend/e2e/layout-editor.e2e.ts` | existing | Playwright (mocked) | — | — |
| FE-8 | `frontend/e2e/touch-targets.e2e.ts` | existing | Playwright (mocked) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal `computed()`, host
bindings in the `host` object (never `@HostListener`). No new inputs/outputs beyond the
above; `LayoutEditor`'s existing public surface (none) is unchanged. No deviation from
`angular-developer`'s standards.

## FE↔BE contract

N/A — no contract change. `toRequest()`'s `LayoutCellRequest[]` shape and `replaceLayout`'s
`{ sets, expectedVersion }` body are untouched (AC-9).

## Execution status

**Stage pointer:** implementation done — ready for the review gate.

**Next action:** run `/code-review`, address findings, check the Sonar gate once CI is green,
then merge close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Interactive row rail (fill target + drag-sweep) on `BeachMapCanvas` | ✅ | `ac8f44c` |
| 1 — Column header strip (fill target + drag-sweep) on `BeachMapCanvas` | ✅ | `ac8f44c` |
| 2 — Wire `LayoutEditor`'s `fillRow`/`fillColumn` | ✅ | `ac4e67c` |
| 3 — Fit/100% zoom toggle on `BeachMapCanvas` | ✅ | `399d13e` |
| 4 — Space-drag (desktop) + two-finger (touch) pan gesture at 100% zoom | ✅ | `d1b1289` |
| 5 — e2e coverage + local verification + close-out | ✅ | `4175a0c` |

Local verification: `npm run lint`/`format:check` clean; full unit suite 1831/1831; a11y/contrast
suite 392/392; mocked e2e — `layout-editor.e2e.ts` 12/12, `touch-targets.e2e.ts` 11/11, full suite
278/280 (2 unrelated flakes — `customer-password.e2e.ts`, `operator-venue.e2e.ts`, neither touched
by this diff, both green on an isolated re-run). Touch-target/focus-posture/inline-comment/
plan-file-structure guards clean on every changed file.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review origin/main...HEAD`) | `onSpaceKeydown` only exempted a focused `<button>`, so at 100% zoom it stole Space from any other focusable control — e.g. the row-name text input beside the canvas — blocking a typed space character | fixed — exemption broadened to `button, input, textarea, select, [contenteditable]`; `BeachMapCanvas.spec.ts` "leaves Space alone while focus sits on a text field…" |
| F-2 | review (`/code-review origin/main...HEAD`) | A rail fill button bound both `(mousedown)` and `(click)`, so a plain mouse click emitted `rowRailFill`/`colHeaderFill` twice — masked only by `fillRow`/`fillColumn`'s idempotence | fixed — `onRailClick` ignores a mouse-originated click (`detail !== 0`); `BeachMapCanvas.spec.ts` "fills once on a real mouse click…" |
| F-3 | review (`/code-review origin/main...HEAD`) | New TSDoc cites issue numbers (`(#713)`), against `frontend/.claude/CLAUDE.md`'s "no issue numbers" rule | not fixed — false positive relative to this file's own dominant existing convention (22/13 pre-existing `(#NN)` TSDoc citations in `beach-map-canvas.ts`/`layout-editor.ts` respectively); fixing only the new additions would make this slice inconsistent with the file it's extending, not more compliant |

---

## File structure

- `frontend/src/app/shared/beach-map-canvas.ts` — new inputs/outputs for the interactive
  rail/header and zoom, internal drag-sweep + pan-gesture state.
- `frontend/src/app/shared/beach-map-canvas.html` — interactive rail-button branch, new
  column-header row, Fit/100% pill pair.
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — new specs per AC-3/5/6/7 (unit half).
- `frontend/src/app/operator/layout-editor.ts` — `fillRow`/`fillColumn`, label fields,
  wiring to the canvas's new outputs.
- `frontend/src/app/operator/layout-editor.html` — bind the new canvas inputs/outputs.
- `frontend/src/app/operator/layout-editor.spec.ts` — new specs per AC-1/2/4/8.
- `frontend/e2e/layout-editor.e2e.ts` — new specs per AC-3 (drag-sweep, one PUT) and AC-7
  (e2e half: space-drag pans, plain drag paints, at 100%).
- `frontend/e2e/touch-targets.e2e.ts` — extend for the new fill/header/zoom controls.

---

## Phase 0 — Interactive row rail on `BeachMapCanvas`

**Files:** `frontend/src/app/shared/beach-map-canvas.ts`, `beach-map-canvas.html`,
`beach-map-canvas.spec.ts`

- [ ] **Step 1: Write the failing tests** for AC-1/AC-5 (canvas half) — the row-code cell
      renders a `<button>` with the consumer's label and `appTouchTarget` only when
      `rowRailInteractive()` is true (default false renders today's `<span>` unchanged);
      click emits `rowRailFill(i)`; a mousedown on one rail button then mouseenter on
      another (primary button held) emits `rowRailFill` for each entered index; mouseup
      (or a document-level mouseup) ends the sweep.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- beach-map-canvas.spec.ts`.
- [ ] **Step 3: Minimal implementation** — the new inputs/outputs, the template branch,
      the drag-sweep state (mirrors `layout-editor.ts`'s existing `painting` flag/
      `onCellDown`/`onCellEnter`/document-mouseup precedent, owned by the canvas this time).
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — grep every existing `row-code` testid
      consumer (tourist map, Daily view, `SetEditor`) to confirm none sets
      `rowRailInteractive`, so all three keep rendering the decorative `<span>`.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 1 — Column header strip on `BeachMapCanvas`

**Files:** same as Phase 0

- [ ] **Step 1: Write the failing tests** for AC-2/AC-5 (canvas half) — a column-header
      row of `mapCols()` buttons renders only when `colHeaderInteractive()` is true, each
      labelled via `colHeaderLabel()`, `appTouchTarget`, click emits `colHeaderFill(i)`,
      drag-sweep mirrors Phase 0's row-rail mechanism.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — the header row markup (`sticky top-0` inside
      `#canvasViewport`, spacer widths matching the row rail / price rail so columns
      align), the sweep state (can share Phase 0's drag-tracking field, parameterized by
      rail kind).
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — same as Phase 0, for `colHeaderInteractive`.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Wire `LayoutEditor`'s fill rails

**Files:** `frontend/src/app/operator/layout-editor.ts`, `layout-editor.html`,
`layout-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** for AC-1/AC-2/AC-4/AC-8 — `fillRow(y)`/
      `fillColumn(x)` paint every cell in the line with `activeBrush()`, update
      `lastChange`/counts/`dirtyCount`; no `row-code-fill`/`col-header-fill` testid exists
      while `mode() === 'sets'`; `discard()` reverts a fill exactly like a single-cell paint.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — `fillRow`/`fillColumn` methods (generalizing
      `paintCell`'s single-cell mutation), `rowFillLabel`/`colFillLabel` bound-function
      fields reading `TOOL_LABEL[this.activeBrush()]`, template wiring
      `[rowRailInteractive]="true" [rowRailLabel]="rowFillLabel" (rowRailFill)="fillRow($event)"`
      and the column-header equivalent.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — grep `paintCell`/`lastChange` call sites to
      confirm `fillRow`/`fillColumn` follow the same clear-`savedNotice` /
      set-`lastChange` contract as every other grid mutator.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Fit/100% zoom toggle on `BeachMapCanvas`

**Files:** `frontend/src/app/shared/beach-map-canvas.ts`, `beach-map-canvas.html`,
`beach-map-canvas.spec.ts`, `frontend/src/app/operator/layout-editor.html`

- [ ] **Step 1: Write the failing tests** for AC-6 — the Fit/100% pill pair renders only
      when `zoomControl()` is true; `zoomMode() === 'full'` pins `tileSizeStyle()` to
      `FIT_MAX_TILE_PX` regardless of the measured fit; `zoomMode() === 'fit'` is
      byte-for-byte today's existing behavior (reuse the existing fit-measurement specs
      as the non-regression proof).
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — `zoomControl` input, internal `zoomMode`
      signal, the pill markup + click handlers, `tileSizeStyle` branching.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — confirm the tourist map / Daily view /
      `SetEditor` don't set `zoomControl` and so never render the pill pair.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Pan gesture at 100% zoom (space-drag desktop, two-finger touch)

**Files:** `frontend/src/app/shared/beach-map-canvas.ts`, `beach-map-canvas.html`,
`beach-map-canvas.spec.ts`, `frontend/e2e/layout-editor.e2e.ts`

- [ ] **Step 1: Write the failing tests** for AC-7 — `window:keydown.space` arms panning
      only when `zoomControl() && zoomMode() === 'full'` and `document.activeElement` is
      not a focusable control inside the canvas (Risk R-3); a two-finger touchstart arms
      the same pan state; the pan gesture updates `scrollLeft`/`scrollTop` via the
      existing pan-delta math, independent of the `dragPan` input.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — the space-held tracking + gated pan-arm logic,
      the touch handlers, reusing `onViewportMouseMove`'s delta math via a shared private
      helper.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — confirm the new pan path never engages for
      a consumer with `zoomControl()` false (tourist map, Daily view, `SetEditor` at Fit).
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — e2e coverage + local verification + close-out

**Files:** `frontend/e2e/layout-editor.e2e.ts`, `frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1:** Extend `layout-editor.e2e.ts` — click-fills a row/column in one PUT;
      drag-sweep fills a band in one PUT (existing single-PUT-payload assertion style,
      per AC-3); at 100% zoom a plain drag paints and never scrolls, Space+drag scrolls
      and never paints (AC-7's e2e half).
- [ ] **Step 2:** Extend `touch-targets.e2e.ts` for the new row-fill/column-header/
      Fit/100%-pill controls — the sweep is generic over every visible control, so this
      should need no dedicated addition beyond confirming the new controls render.
- [ ] **Step 3:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
      --config=playwright.a11y.config.ts` for `layout-editor.e2e.ts` and
      `touch-targets.e2e.ts`, then the full mocked suite; `npm run lint`, `npm run
      format:check`, `npm test`, `npm run test:a11y` — all green.
- [ ] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main`,
      `scripts/check-touch-target.mjs`, `scripts/check-focus-posture.mjs`,
      `scripts/check-inline-comments.mjs` over every changed file — clean.
- [ ] **Step 5: Commit + update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

*(filled at close-out)*

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced — N/A, no backend touched.
- [ ] **Availability** section filled (N/A, justified).
- [ ] Pool + cutoff rules honored — N/A, unaffected.
- [ ] **Modulith** section filled (N/A, frontend-only).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy — N/A.
- [ ] Timezone — N/A, unaffected.
- [ ] Booking codes — N/A.
- [ ] Flyway — N/A.
- [ ] **Frontend** standards met (see Angular section above).
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an
      issue #).
- [ ] **Close-out written in THIS PR.**
- [ ] **The review gate ran in full.**
