# Set Editor on the Shared Beach-Map Canvas Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship issue #677 — project `operator/set-editor`'s selection grid into
`shared/beach-map-canvas` (the fourth surface), keeping its tile vocabulary and
interaction byte-identical, so the Beach-map tab's two modes (Bulk layout ↔ Edit sets)
read as one surface — a pure refactor kept honest by the existing unit/a11y/contrast/e2e
suites.

**Architecture:** No new primitives — the canvas (#674) already takes everything this
slice needs through its inputs (`frameTestid`/`viewportTestid`, `dragPan`) and the typed
`appBeachMapRow` projection. The set-editor's `rows` computed grows the four
`BeachMapCanvasRow` contract fields (matching the bulk editor's #674 F-2 posture:
every row `zoneStart: true`, per-row price chips), its cell `<button>`s move verbatim
into the projected template, and the bare `BeachGridFrame` + `overflow-x-auto` scroller
it used are retired from this surface. **The one design decision the issue left to plan
time — `dragPan` — is ON** (the canvas default); rationale in Resolved below.

**Persistence:** N/A — frontend-only; no tables or migrations touched (invariant #1 unaffected).

**Source of intent:** GitHub issue #677 (maintainer-raised post-#674); the #674 plan doc
`docs/plans/shared-map-canvas.md` (the canvas contract + findings F-1..F-10, esp. F-2);
design language `docs/design/` (Liquid Glass v3).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
no in-flight overlap, surfaced the two additions the issue missed: the selection-outline
1.4.11 pair over the wash, and the #674 generalization-audit `min-w-0` rule applying to
the set-editor's `1fr` grid column) · `riviera-plan-doc` (this template — the parity
ledger separates the byte-identical vocabulary from the deliberate restyle inheritances)
· `tdd` (chrome pins written red before the migration; the existing suites are the
behavior net) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (due at close-out over `origin/main...HEAD` — #674's plan
Non-goals names the set-editor cut this slice reverses; checked as a stated-fact
candidate) · `riviera-frontend` (placement: no file moves — the canvas is already
`shared/`, the editor stays `operator/`; RV-FE-8 ledger untouched) · `riviera-tailwind`
(utilities not `@apply`; keep `set-cell` hooks inert; tile geometry via the canvas's
`--riv-tile` + `aspect-square`; the 44px floor stays measured, not asserted) ·
`angular-developer` + angular-cli MCP (`get_best_practices` v22 — signals/`computed()`,
typed template projection, native control flow) · `playwright-cli` (e2e re-runs +
porcelain screenshots at phase 2) · `riviera-local-debug` (scoped Vitest/Playwright
runs; loaded before the session's first `npm` invocation).

**Branch:** `claude/set-editor-beach-map-canvas-t7yy8f` — the session's designated
remote branch stands in for `feature/set-editor-on-canvas` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue's sets, when the set editor renders, then the shared
  canvas chrome is present — `set-grid-frame` on the frame, `set-grid` on the canvas
  pan viewport (the element that actually overflows), an aria-hidden `row-code` chip
  per row, and an aria-hidden `row-price` chip on **every row that has a set**
  (`formatMoney` of the row's first set; none for a set-less row). *Pinned by:*
  `set-editor.spec.ts` "renders on the shared canvas…" specs (new).
- [ ] **AC-2:** Given the migrated grid, when cells render and are activated, then the
  tile vocabulary is byte-identical: `set-cell` testid, `data-set-id`/`data-grid-x`/
  `data-grid-y`/`data-state`, `aria-pressed` selection + outline classes, per-cell
  `aria-label`/`title`, `[disabled]` on occupied cells while a move is armed — and
  every select/add/move/remove/error flow behaves as today. *Pinned by:* the existing
  `set-editor.spec.ts` + `set-editor.a11y.spec.ts` suites green with zero behavioral
  edits.
- [ ] **AC-3:** Given a phone-width viewport, when the per-set surface renders, then
  every visible control measures ≥44×44, the `set-grid` element is scrollable when the
  grid overflows (never clipped), and the page never scrolls sideways. *Pinned by:*
  `touch-targets.e2e.ts` "beach map, per-set mode" + `operator-set-editing.e2e.ts`
  "stays inside its own scroll…" (existing, unchanged).
- [ ] **AC-4:** Given the wash's worst-case stop (`#f6eedb` sand), when the selection
  outline (`#0e8aa8`) is measured over every wash stop, then it meets 3:1 (WCAG
  1.4.11); the BeachCell fill/border pairs are already proven over the wash in
  `layout-editor.contrast.spec.ts` and are referenced, not re-derived. *Pinned by:*
  `set-editor.contrast.spec.ts` selection-outline spec (new).
- [ ] **AC-5:** Given the operator console's pinned porcelain theme, when both
  Beach-map tab modes are screenshotted, then Bulk layout and Edit sets read as one
  surface (wash, rails, chips, tile rhythm). *Pinned by:* the phase-2 porcelain
  screenshot eyeball (visual, recorded in Execution status).

## Non-goals

- **Changing any write path or interaction** — select, add, move, remove, the
  `SET_IN_USE` refusal copy, the no-optimistic-apply rule, and the re-read-on-`changed`
  contract stay byte-identical (the #672 seam rule: share the canvas, never the behavior).
- **Moving the grow affordances into the canvas** — add row / add position stay outside
  the frame, as today (the issue says so explicitly).
- **A `viewportTabindex`/`viewportLabel` for this surface** — the grid always contains
  buttons (min 1×1 with a gap cell), so no extra tab stop is needed (the tourist/editor
  posture from #674, not the daily view's all-locked case).
- **Canvas changes.** The canvas already serves this surface as-is; any gap found would
  be its own finding, not a silent extension.
- Legend work, theme-token work, backend/API changes.

## Behavior-parity ledger (retirement / replacement slices only)

The old surface is the set-editor's bare-frame grid block (`set-editor.html` lines
224–260); the panel, confirm flows and grow buttons around it are untouched.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Click a cell → select its set / offer add on empty / move-target while armed (`onCell`) | preserved | The cell `<button>` with its `(click)` handler moves verbatim into the projected `appBeachMapRow` template |
| Occupied cells `[disabled]` while a move is armed (validity-disabled — legitimate per the busy-vs-disabled table) | preserved | Same `[disabled]="cell.disabled"` binding on the projected button |
| Selection outline (`outline-2 outline-offset-2 outline-[#0e8aa8]`) + `aria-pressed` | preserved | Same class bindings; the outline now composites over the wash, so its 1.4.11 pair is newly proven (AC-4) |
| Per-cell `aria-label`/`title` ("Row A position 1, …"), `data-set-id`/`data-grid-x/y`, `set-cell` testid | preserved | Attributes move verbatim with the button |
| Visible inline row-label `<span>` (`w-5`, per row) | **changed — deliberately** | Row codes become the canvas's aria-hidden `row-code` rail chips (the #674 editor ledger row: every cell's aria-label already carries "Row A position N", so AT loses nothing) |
| No price display on this surface | **changed — deliberately** | Gains the canvas's aria-hidden per-row `row-price` chips (`zoneStart: true` every row — the bulk editor's F-2 posture, so the tab's two modes read identically; label = `formatMoney` of the row's first set, `null` for a set-less row; prices are already in the panel when a set is selected, so no new information for AT to lose) |
| Fixed `h-11 w-11` cells, `gap-1`, `mb-1.5` row spacing, `rounded-[8px]`, hover scale | **changed — deliberately (geometry only)** | Tiles adopt the canvas's `--riv-tile` columns + `aspect-square min-w-0` and the canvas's `gap-1.5` rhythm — the restyle inheritance the issue asks for; `rounded-[8px]` + hover scale + `[transition]` stay (BeachCell carries no geometry, the consumer keeps its own); the 44px floor is measured by `touch-targets.e2e.ts` (`--riv-tile` floors at 47px) |
| Plain `overflow-x-auto` scroller carrying `data-testid="set-grid"` | **changed — deliberately** | The canvas pan viewport takes `viewportTestid="set-grid"` — the testid stays on the element that actually overflows, so `expectNoClippedCells` keeps measuring the right box; the surface gains wash, edge-fade, snap, and mouse drag-pan (decision below) |
| Mouse drag on the grid: selected text / no-op | **changed — deliberately** | Drag now pans (dragPan ON); the canvas's capture-phase pan-release suppression (proven in #674, R-1 closed) guarantees a pan never selects a cell; keyboard activation (`detail === 0`) is never suppressed |
| Empty venue still renders a 1×1 grid (one gap cell) | preserved | `rowCount`/`colCount` floor at 1 is untouched; rows are never empty, so the canvas's `canvasEmpty` slot is not wired |
| Page never scrolls sideways at phone width | preserved | Canvas viewport geometry + `min-w-0` on the map column (the #674 audit rule for canvas-in-`1fr`-track hosts); pinned by the existing e2e |
| Frame chrome (`set-grid-frame` testid, sea/promenade banners) | preserved | Via the canvas's `frameTestid` input — the canvas composes the same promoted frame |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Scroller/testid coupling: `set-grid` must name the element that actually overflows or `touch-targets.e2e.ts:121-128` fails / passes vacuously | med | med | `viewportTestid="set-grid"` (the canvas input built for exactly this, #674 R-4); run the per-set touch-targets test in phase 1 | this slice | open |
| R-2 | Canvas hosted in the `lg:grid-cols-[300px_1fr]` `1fr` track keeps `min-width: auto` and blows the column out instead of scrolling (the #674 generalization-audit mechanism — this site did not exist when that audit ran) | high | med | `min-w-0` on the map-column wrapper; verified by the existing page-overflow e2e pin + the phase-2 screenshots | this slice | open |
| R-3 | Selection outline `#0e8aa8` fails 1.4.11 (3:1) over a wash stop | low | med | Pre-checked at plan time: worst case (sand `#f6eedb`) computes ≈3.48:1 — passes; pinned by the new contrast spec so it can't drift | this slice | open |
| R-4 | dragPan ON swallows a legitimate selection click (pan-release suppression misfires) | low | high | The suppression is canvas-owned and already pinned (#674 R-1: consume-once, `detail > 0` only, keyboard never); the existing set-editor e2e clicks cells through the viewport and stays green | this slice | open |
| R-5 | AT regression from moving the visible row labels into the aria-hidden rail | low | low | Every cell's `aria-label` already carries row + position (a11y spec pins the exact strings); axe re-runs over the migrated structure in `set-editor.a11y.spec.ts` | this slice | open |
| R-6 | Sonar new-code gate (0 issues, 0 duplication, ≥80% coverage) on a template-heavy refactor | low | med | The slice deletes chrome rather than adding logic; the one new mapping lives in the existing `rows` computed and is unit-pinned; review the Sonar issue list at the gate | this slice | open |

## Open questions / Assumptions

### Resolved

- **dragPan: ON** (the canvas default). Selection is click-only, so there is no
  gesture conflict (unlike the bulk editor, whose drag IS paint — a forced opt-out,
  not a mode, per #674). ON matches three of the four canvas surfaces; OFF would
  strand mouse users on a wide map with hidden scrollbars and no pan affordance —
  the bulk editor accepts that cost only because its drag gesture is taken. The
  resulting asymmetry (drag pans in Edit sets, paints in Bulk layout) is inherent
  to paint and already true everywhere else in the app. The canvas's pan-release
  click suppression (proven, #674 R-1) keeps a pan from ever selecting a cell.
  Decided at plan time as the issue requested. (this doc)
- **Assumption, verified at plan time:** no spec or e2e queries the visible inline
  row-label `<span>` or asserts `overflow-x-auto` on `set-grid`'s current `<div>` —
  `set-grid` is queried only by `touch-targets.e2e.ts` (which reads computed
  `overflow-x`, satisfied by the canvas viewport) and the template itself.

## Availability & concurrency (invariant #2)

N/A — display-chrome refactor of the per-set editor's grid. No availability channel
is touched: the three U7 writes (`POST`/`PATCH`/`DELETE …/sets`), the
no-optimistic-apply rule, and the parent re-read on `changed` keep their handlers,
guards and copy byte-identical (pinned by the untouched `set-editor.spec.ts` flows).
The server stays authoritative for every claim guard (`SET_IN_USE`).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner | Justification |
|---|---|---|
| Set-editor rows mapped to the canvas contract + projected tile template | `operator/` (existing) | Behavior stays with its feature (the #672 seam rule); the canvas is consumed via its published inputs/directive only |
| Beach-map chrome (wash, rails, viewport, pan) | `shared/beach-map-canvas` (existing, unchanged) | Already promoted in #674; this slice adds a consumer, not a capability |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (The new price chips render `MoneyView` integer minor units
via the shared `formatMoney`, invariant #5 as today; the per-set price *editing* flow
is untouched.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` | existing | standalone component | the `rows` `computed()` grows the four contract fields (`code`, `priceLabel`, `zoneStart`, `tileCount`); imports swap `BeachGridFrame` → `BeachMapCanvas` + `BeachMapRowDef` | untouched (Signal Forms price field stays) |
| FE-2 | `operator/set-editor.html` | existing | template | grid block → `<app-beach-map-canvas>` with the projected tile template; `min-w-0` on the map column | none |

**Standards:** standalone, signals, native control flow, typed `ng-template`
projection via the canvas's context-guard directive — no deviation. No new images.

## FE↔BE contract

N/A — no contract change (`SetView` consumed as-is).

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** phase 1 — write the failing chrome pins, then migrate the template.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ⏳ | |
| 1 — pins red → set-editor onto the canvas → scoped suites green | | |
| 2 — e2e + porcelain visual check | | |
| 3 — sweeps, gates, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/set-editor-on-canvas.md` — this plan
- `frontend/src/app/operator/set-editor.ts` — `rows` computed grows the canvas-contract fields; import swap
- `frontend/src/app/operator/set-editor.html` — grid block replaced by the canvas; `min-w-0` on the map column
- `frontend/src/app/operator/set-editor.spec.ts` — new chrome pins (AC-1); existing flows untouched
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — re-run over the migrated structure (touch only if a selector rescopes)
- `frontend/src/app/operator/set-editor.contrast.spec.ts` — wash-stop refs + the selection-outline 1.4.11 pin (AC-4)

---

## Phase 0 — Plan doc

- [ ] **Step 1:** Commit this plan; push; open the **draft PR** (CI vehicle, #417).

## Phase 1 — Pins red → set-editor onto the canvas → scoped suites green

**Files:** Modify `set-editor.ts`, `set-editor.html`, `set-editor.spec.ts`,
`set-editor.contrast.spec.ts` (+ `set-editor.a11y.spec.ts` only if a selector rescopes).

- [ ] **Step 1:** Write the failing chrome pins in `set-editor.spec.ts` (AC-1): the
  canvas viewport carries `data-testid="set-grid"`; one aria-hidden `row-code` chip
  per row; a `row-price` chip per row-with-a-set (`€35.00` for row A, `€20.00` for
  row B in the standard fixture) and none for a grown set-less row; the frame testid
  `set-grid-frame` present. Write the AC-4 contrast pin in
  `set-editor.contrast.spec.ts` (selection outline `#0e8aa8` ≥3:1 composited over
  each wash stop, referencing the pairs proven in `layout-editor.contrast.spec.ts`
  rather than re-deriving the cell fills).
- [ ] **Step 2:** `npm test -- set-editor` → the new chrome pins FAIL (no canvas yet);
  the contrast pin passes (pure math — it pins against drift, it was never red).
- [ ] **Step 3:** Implement: extend the `rows` computed with `code` (= the existing
  label), `priceLabel` (`formatMoney` of the row's first set, `null` when none),
  `zoneStart: true`, `tileCount` (= the row's cell count); swap the imports; replace
  the grid block with `<app-beach-map-canvas frameTestid="set-grid-frame"
  viewportTestid="set-grid">` + the projected tile template (cell buttons verbatim,
  `h-11 w-11` → `aspect-square min-w-0` in the canvas's `--riv-tile` grid columns);
  `min-w-0` on the map column wrapper (R-2).
- [ ] **Step 4:** `npm test -- set-editor` → PASS (all four suites);
  `npm run test:a11y` → PASS; `npm run lint` + `npm run format:check`.
- [ ] **Step 5:** Generalization audit — if a fix emerges, log it below.
- [ ] **Step 6:** Commit `Move the per-set editor onto the shared beach-map canvas (#677)`.
- [ ] **Step 7:** Update Execution status; check the push's CI run.

## Phase 2 — e2e + porcelain visual check

- [ ] **Step 1:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
  operator-set-editing touch-targets --config playwright.a11y.config.ts` → PASS
  (AC-3; the coupled `set-grid` + page-overflow + 44px pins).
- [ ] **Step 2:** Porcelain visual check: drive the operator console (mocked) with
  Playwright, screenshot the Beach-map tab in **both** modes under the console's
  pinned `data-riv-theme='porcelain'`; eyeball that Bulk layout and Edit sets read
  as one surface (AC-5); record findings here.
- [ ] **Step 3:** Commit anything the check forces (else no commit); update Execution
  status; check CI.

## Phase 3 — Sweeps, gates, close-out

- [ ] **Step 1:** Full `npm test`, `npm run test:a11y`, `npm run test:e2e:a11y`,
  `npm run lint`, `npm run format:check`,
  `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 2:** Merge latest `origin/main`; mark the PR ready for review; run the
  Review gate (`/code-review` ladder + `riviera-review-overlay` RV-FE walk) and the
  Sonar gate (issue list, not pass/fail) per `references/pr-gates.md`.
- [ ] **Step 3:** `riviera-docs-freshness` over `origin/main...HEAD` (the #674 plan's
  Non-goals names this cut — final-state plan docs are history, not stale facts, but
  check the counting sweep: "three surfaces on the canvas" statements anywhere).
- [ ] **Step 4:** Close-out: finalize Execution status (`merged via PR #NN`), tick the
  self-review checklist, close #677.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- set-editor` → the new chrome pins PASS. Verified at `<sha>`.
- [ ] **AC-2:** `npm test -- set-editor` → the pre-existing flow specs PASS unmodified. Verified at `<sha>`.
- [ ] **AC-3:** `npx playwright test operator-set-editing touch-targets` (mocked config) → PASS. Verified at `<sha>`.
- [ ] **AC-4:** `npm test -- set-editor.contrast` → PASS. Verified at `<sha>`.
- [ ] **AC-5:** Porcelain screenshots of both modes eyeballed; result recorded in Execution status. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1 — frontend-only).
- [ ] **Availability** section justified N/A; no write path touched.
- [ ] Pool + cutoff rules honored (invariants #3, #4 — display untouched).
- [ ] **Modulith** N/A — frontend-only.
- [ ] **Payment/payout** N/A.
- [ ] Refund policy N/A.
- [ ] Timezone N/A — no date logic touched.
- [ ] Booking codes N/A.
- [ ] Flyway N/A.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (resolved above).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
