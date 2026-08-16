# Shared Map Canvas (Tourist + Operator Surfaces) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship issue #672's **Slice 2** — one shared, purely presentational beach-map
canvas in `shared/` (frame + banners, sea→sand wash, row rails, pan viewport with
drag/snap/edge-fade, zone-gap layout), with the tourist map, the layout editor and the
daily view projecting their own tiles into it — a pure refactor kept honest by the
existing unit/contrast/e2e suites.

**Architecture:** Two shared primitives, not one mega-component. `BeachGridFrame` is
**promoted** from `operator/` to `shared/` unchanged in role (card + orientation
banners + `<ng-content>`) because it has a **third consumer the issue missed** —
`operator/set-editor.ts` — which stays on the frame. A new `BeachMapCanvas`
(`shared/`) composes the frame and adds everything the three map surfaces repeat:
the washed vertical scroller, the aria-hidden row-code and per-zone price rails, the
horizontally pannable viewport (mouse drag + `snap-x` + edge-fade mask, all gated on
actual overflow via `.pannable`, per #673's F-2), the zone-gap layout, and the
pan-release click suppression — with tile rows projected via a typed `ng-template`
so each surface keeps its own tile vocabulary and interaction (tourist:
tap-to-book; editor: paint tier/pool/gap; daily view: tap-to-mark). **Explicit
non-goal: mode flags** — the one behavioral configuration is the editor opting out
of drag-pan, because its mouse-drag gesture *is* paint (a genuine interaction
conflict, not a mode).

**Persistence:** N/A — frontend-only; no tables or migrations touched (invariant #1 unaffected).

**Source of intent:** GitHub issue #672 (Slice 2 section; reopened — PR #673's merge
auto-closed it while this slice was outstanding); Slice 1 plan doc
`docs/plans/beach-map-restyle.md`; design language `docs/design/` (Liquid Glass v3).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — found
the frame's third consumer `set-editor`, the auto-closed issue, the drag-paint vs
drag-pan conflict, and the scroller↔testid coupling in `touch-targets.e2e.ts`) ·
`riviera-plan-doc` (this template — the parity ledger surfaced the editor paint-end
re-homing and the AT visibility change of the editor's price column) · `tdd` (the
canvas is built red-green; each surface migration is preceded by its behavior pins) ·
`riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (due at phase 6 — will run over `origin/main...HEAD`
pre-merge; this parenthesis is finalized then) · `riviera-frontend` (placement: both primitives are
pure presentational `shared/` citizens — the `PhotoSlideshow` precedent; consuming
`operator/beach-grid-frame` from `venue/` would be a new RV-FE-8 Blocker edge, so
promotion is the legal move; RV-FE-8 ledger otherwise untouched) · `riviera-tailwind`
(utilities not `@apply`; keep `.set-tile`/`data-state`/`layout-cell` inert markers;
computed-style no-drift pins in e2e; surface directives carry no radius) ·
`angular-developer` + angular-cli MCP (`get_best_practices` v22 — signals,
`input()`/`contentChild()`, native control flow, `NgTemplateOutlet` projection with a
typed context directive) · `playwright-cli` (e2e re-pins at phases 3–5) ·
`riviera-local-debug` (scoped Vitest/Playwright runs; loaded before the session's
first `npm` invocation).

**Branch:** `claude/shared-map-canvas-t3cjo8` — the session's designated remote branch
stands in for `feature/shared-map-canvas` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given rows and a projected tile-row template, when `BeachMapCanvas`
  renders, then it renders the promoted frame (sea + promenade banners), the washed
  scroller, an aria-hidden row-code rail, an aria-hidden price rail with **one chip
  per price zone**, and the projected tile rows in row order. *Pinned by:*
  `beach-map-canvas.spec.ts` "renders the frame, rails and projected rows".
- [ ] **AC-2:** Given a non-first `zoneStart` row, when the canvas renders, then the
  zone-gap marker (`mt-3`) is present on that row's cell in **all three columns**
  (row-code cell, tile-row wrapper, price cell) and absent inside a zone. *Pinned by:*
  `beach-map-canvas.spec.ts` zone-gap spec + the venue-map alignment spec (updated to
  the canvas-owned wrapper).
- [ ] **AC-3:** Given a drag on the pan viewport crossing the 6px threshold, when the
  mouse is released over a tile, then the tile's click is suppressed (capture-phase,
  consume-once), while a keyboard activation (`detail === 0`) is **never** suppressed
  and a subsequent genuine click activates normally. *Pinned by:*
  `beach-map-canvas.spec.ts` suppression specs + `venue-map-pan.e2e.ts` (existing
  drag/keyboard/genuine-click pins, unchanged).
- [ ] **AC-4:** Given the tourist map on the canvas, when the full venue-map suites run
  (`venue-map.spec.ts`, `venue-map.contrast.spec.ts`, `venue-map.a11y.spec.ts`,
  `venue-map-pan.e2e.ts`), then all pass — with only the documented alignment-spec and
  banner-stop adjustments; the six e2e computed-style/geometry pins (wash
  background-image, mask-image, scroll-snap-type, ≥16px rest offset, scrollLeft delta,
  rail x-stability) hold verbatim. *Pinned by:* those suites.
- [ ] **AC-5:** Given the layout editor on the canvas (drag-pan opted out), when the
  operator clicks a cell, drags across cells, or releases anywhere, then cells paint
  with the active tool and painting ends on release — dragging across cells never pans
  the grid. *Pinned by:* `layout-editor.spec.ts` (paint + updated paint-end dispatch) +
  `layout-editor.e2e.ts` (unchanged) + a new drag-paints-not-pans e2e pin.
- [ ] **AC-6:** Given the daily view on the canvas, when it renders, then the
  `data-set-id` + BUTTON/SPAN actionable-vs-locked contract is unchanged, and
  `data-testid="daily-grid"` with `tabindex="0"` + `aria-label` sits on the element
  that actually overflows horizontally (the canvas viewport), the grid scrolls inside
  its frame, and the page never scrolls sideways. *Pinned by:* `daily-view-tab.spec.ts`
  + `operator-daily.e2e.ts` (`expectGridScrolls`, the `tabindex` pin, the
  page-overflow pin).
- [ ] **AC-7:** Given the wash's worst-case stops (`#cfeef6`, `#e7f5f1`, `#f6eedb`),
  when each operator tile ink/boundary is composited over them, then: the standard
  cell's `--riv-card-ink`-family inks over `white/85` meet AA 4.5:1; the daily FREE
  tile's **visible price glyph** (previously unproven) meets AA composited; the gap
  cell's dashed border meets 3:1 (1.4.11) — adjusting `beach-cell.ts`'s gap border if
  the current `#0c2a33/35` fails over the sand stop; banner white ink is proven over
  the unified gradient stops. *Pinned by:* `layout-editor.contrast.spec.ts` +
  `daily-view-tab.contrast.spec.ts` (+ `venue-map.contrast.spec.ts` stop refs).
- [ ] **AC-8:** Given all three surfaces on the canvas, when the axe + touch-target
  sweeps run (`npm run test:a11y`, `npm run test:e2e:a11y` incl.
  `touch-targets.e2e.ts`), then no serious/critical violations and every visible tile
  control measures ≥44×44. *Pinned by:* those suites.
- [ ] **AC-9:** Given the promotion, when the slice completes, then
  `shared/beach-grid-frame.ts` exists, `operator/beach-grid-frame.*` is gone,
  `set-editor` consumes the shared frame, and no new cross-feature edge exists
  (RV-FE-8 table untouched). *Pinned by:* `beach-grid-frame.spec.ts` (moved) +
  `set-editor` suites green + review-gate RV-FE-8 walk.

## Non-goals

- **One mega-component with mode flags** — the three tile vocabularies and
  interaction models stay with their surfaces (the `BeachGridFrame` / `PhotoSlideshow`
  judgement). The editor's drag-pan opt-out is a capability toggle forced by a real
  gesture conflict, not a mode.
- **Migrating `set-editor` onto the canvas.** Its grid is a per-set selection surface,
  not one of the issue's three map surfaces; it stays on the promoted frame. If a later
  slice wants it washed/pannable, that is its own decision.
- Changing any tile vocabulary, accessible-name string, glyph, or write path
  (mark/release, paint→save, book) — behavior stays where it lives today.
- Legend unification — each surface's legend describes its own vocabulary.
- Backend/API changes; theme-token work (tile + wash colours stay literals, as
  settled in Slice 1).
- Fixing the pre-existing `operator/ → venue/` service edges (RV-FE-8 ledger — frozen,
  out of scope).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| **Tourist:** mouse drag-pan with 6px click-vs-pan threshold; pan-release never opens the dialog; keyboard activation (detail 0) never swallowed | **preserved (mechanism changed)** | Threshold + suppression move from `VenueMap.select()`'s `panned` flag into the canvas: a capture-phase click listener on the viewport swallows the one pointer click after a pan (`detail > 0` only, consume-once). e2e pins (drag, no dialog, later genuine click, keyboard) unchanged |
| **Tourist:** `.pannable` gating — edge fade, `px-4` inner padding and `scroll-pl` only while the grid actually overflows (#673 F-2) | preserved | Canvas owns `scrollHint` (afterRenderEffect measure) + `[class.pannable]`; rest-offset e2e pin (≥16px) unchanged |
| **Tourist:** wash on the vertical scroller; 532px cap; hidden scrollbars; rails outside the pan viewport (x-stable) | preserved | Canvas-owned markup, classes moved verbatim; e2e rail-x pin unchanged |
| **Tourist:** zone chips once per zone; `mt-3` zone gap on all three columns, on the `ul.set-row` itself | **preserved (DOM detail changed)** | Gap moves to a canvas-owned row wrapper `<div>` around the projected `ul` (the canvas owns zone layout); alignment spec updated to query the wrapper — behavior (aligned gaps, one chip per zone) identical |
| **Tourist:** sea-banner gradient `#0e7a89→#0c6675`; card padding `px-4` | **preserved / changed (cosmetic)** | The unified frame adopts the tourist (restyle) gradient; card padding becomes the frame's `px-[18px]`. No spec/e2e pins either literal on the tourist side; mask/rest-offset coupling (16px ↔ inner `px-4`) is viewport-internal and kept |
| **Tourist:** scroll hint on overflow; "Tap any free set…" tagline; legend; date picker; dialog flows; availability summary | preserved | Hint is canvas-owned (same copy); tagline projected into the canvas's below-viewport slot; the rest stays in `venue-map.html` untouched |
| **Editor:** paint one cell per click (keyboard Enter/Space included); drag-paint via `mousedown`+`mouseenter`; paint ends on `mouseup`/`mouseleave` of the grid container | **preserved (paint-end re-homed)** | Cell handlers untouched. The grid container is canvas-owned now, so paint-end becomes a `document:mouseup` host listener — release *anywhere* ends painting (superset of the old grid-scoped end; `mouseleave` no longer needed). Spec's paint-end dispatch updated accordingly |
| **Editor:** mouse drag = paint, never pan | preserved | The editor sets the canvas's drag-pan opt-out; native touch/trackpad overflow scrolling still works; a drag-across-cells e2e pin is added |
| **Editor:** visible per-row price string readable by AT | **changed — deliberately** | Prices render as per-zone chips in the canvas's aria-hidden rail. The bulk editor's prices are display of tier defaults / preserved set prices (the Pricing tab owns pricing); sighted parity kept via zone chips. Cell aria-labels unchanged |
| **Editor:** row label `<span>` visible inline per row | **changed (cosmetic)** | Row codes render as canvas rail chips (aria-hidden); each cell's aria-label already carries "Row A position N" so AT loses nothing |
| **Editor:** empty state ("Generate a layout to begin…") inside the frame | preserved | Canvas renders a fallback `<ng-content>` when `rows` is empty (no rails/wash around nothing) |
| **Editor:** `LAYOUT_IN_USE`/stale-write/save/reload flows | preserved | Untouched — outside the grid chrome |
| **Daily:** tap FREE → mark, tap STAFF_MARKED → release, BOOKED_ONLINE locked; optimistic + reconcile; pending disables | preserved | Tile template + handlers move verbatim into the projected row template; `data-set-id`, `data-state`, BUTTON/SPAN split unchanged |
| **Daily:** `daily-grid` is the scrolling element, `tabindex="0"` + `aria-label="Beach map"` for the all-locked keyboard case | preserved | Canvas viewport takes the surface-supplied testid + tabindex + label via inputs; `expectGridScrolls` and the tabindex e2e pin hold |
| **Daily:** fluid `minmax(44px, 1fr)` tile widths per row, full-width rows | **changed — deliberately** | Tiles adopt the canvas's uniform `--riv-tile` fixed columns (aligned across rows, pans on overflow) — the restyle inheritance the issue asks for; touch-target e2e still measures ≥44px |
| **Daily:** no price column | **changed — deliberately** | Gains the canvas's aria-hidden per-zone price rail (prices already visible on FREE tiles + in aria-labels; no new information, no AT change) |
| **Daily:** arrivals card, check-in, QR scan, date change reset | preserved | Untouched — outside the grid chrome |
| **Set-editor:** frame chrome + its own selection grid | preserved | Import path moves to `shared/beach-grid-frame`; banner gradient unifies (cosmetic); grid untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Canvas capture-phase click suppression swallows a legitimate activation (tourist book-tap, daily mark-tap) or misses the pan-release case | low | high | Consume-once + `detail > 0` guard replicated from the proven `select()` logic; unit specs on the canvas; existing e2e pins (drag→no dialog, later click→dialog, keyboard never swallowed) re-run per surface | this slice | open |
| R-2 | Drag-pan (even opted out) or the moved scroller breaks editor drag-paint | low | high | Editor opts out of drag-pan entirely (no mousedown/mousemove handlers attached); paint-end re-homed to `document:mouseup`; drag-paint spec + new e2e pin | this slice | open |
| R-3 | Operator tiles fail AA/1.4.11 composited over the wash — most likely the gap cell's dashed `#0c2a33/35` border over the sand stop `#f6eedb` | high | med | Compute ratios first in the contrast specs (venue-map composited pattern); darken the gap border (and any other failing literal) in `beach-cell.ts` in the same phase — visual-only, no vocabulary change | this slice | open |
| R-4 | Scroller/testid coupling: `daily-grid`/`layout-grid` must name the element that actually overflows or `operator-daily.e2e.ts:38-41,320` and `touch-targets.e2e.ts:22-33` fail | high | med | Canvas takes the viewport testid (+ optional tabindex/aria-label) as inputs; each surface passes its established testid; run the coupled e2e specs per migration phase | this slice | open |
| R-5 | Daily FREE tile's price glyph (`€20.00`) overflows the fixed `--riv-tile` square | med | low | 47–56px tile at `text-[10.5px]` fits ~7 chars; verify in the real-browser e2e + porcelain screenshot; fallback: nudge glyph size, never the 44px floor | this slice | open |
| R-6 | The frame move silently breaks its third consumer (`set-editor`) or its touch-target sweep (`set-grid`) | low | med | `set-editor` import updated in the same commit as the move; its spec/a11y/contrast suites + `touch-targets.e2e.ts` run in phase 1 | this slice | open |
| R-7 | Sonar new-code gate (0 issues, 0 duplication, ≥80% coverage) on a template-heavy refactor | med | med | The canvas *is* the dedup (three copies → one); canvas logic unit-tested directly; review the Sonar issue list at the gate, not just pass/fail | this slice | open |
| R-8 | Page-level horizontal overflow from the mask/negative-margin geometry on operator pages | low | med | `operator-daily.e2e.ts:286-290` pins `documentElement.scrollWidth`; run per phase | this slice | open |

## Open questions / Assumptions

- **Assumption:** unifying the banner gradient on the tourist stops
  (`#0e7a89→#0c6675`) is the intended "operator surfaces inherit the restyle";
  `layout-editor.contrast.spec.ts`'s `SEA_BANNER_STOPS` update proves white AA over
  the new stops. — *Owner:* this slice · *Resolves by:* phase 1 (spec math).
- **Assumption:** the editor's per-row price becoming an aria-hidden per-zone chip is
  an acceptable AT change (prices there are tier defaults/preserved display; the
  Pricing tab owns pricing). Recorded in the parity ledger for the review gate to
  challenge. — *Owner:* this slice · *Resolves by:* review gate.
- **Assumption:** the canvas viewport's focusability stays surface-configured
  (daily view passes `tabindex=0` + label as today; tourist/editor don't add a tab
  stop) — uniform focusability would change pinned tab order for no a11y gain, since
  those grids always contain buttons. — *Owner:* this slice · *Resolves by:* phase 2.

## Availability & concurrency (invariant #2)

N/A — display-only chrome refactor. No availability channel is touched: the daily
view's mark/release service calls, the editor's layout PUT, and the tourist booking
flow move template homes but keep their handlers, guards and reconcile logic
byte-identical. Invariant #3 display parity is preserved: `bookable = FREE && ONLINE`
(tourist) and the FREE/STAFF_MARKED/BOOKED_ONLINE actionable split (daily) are
untouched; the server stays authoritative for every claim.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner | Justification |
|---|---|---|
| `BeachGridFrame` (frame + banners) | `shared/` (promoted from `operator/`) | Pure, stateless, presentational, multi-feature (`venue/` + `operator/`) — the `PhotoSlideshow` precedent; consuming it from `venue/` while operator-owned would be a new RV-FE-8 Blocker edge |
| `BeachMapCanvas` (wash, rails, viewport, zone layout, pan) | `shared/` (new) | Same bar: pure presentational primitive, no HTTP, no app state; consumed by two features |
| Tile vocabularies + interactions (book / paint / mark) | `venue/`, `operator/` (unchanged) | Behavior stays with its feature — the issue's explicit non-goal guards this |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (Prices rendered remain `MoneyView` integer minor units via
the shared `formatMoney`, invariant #5 as today.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beach-grid-frame.ts` | moved (from `operator/`) | standalone component | `input()` testid + optional label | none |
| FE-2 | `shared/beach-map-canvas.ts` + `.html` | new | standalone component + a typed row-template directive | `input()` rows/testids/dragPan; `computed()` cols; `signal` scrollHint via `afterRenderEffect` | none |
| FE-3 | `venue/venue-map.ts` + `.html` | existing | standalone component | pan gesture + hint state **removed** (canvas-owned); rows gain nothing new | none |
| FE-4 | `operator/layout-editor.ts` + `.html` | existing | standalone component | paint-end → `host` `document:mouseup`; canvas rows `computed()` | none |
| FE-5 | `operator/daily-view-tab.ts` + `.html` | existing | standalone component | canvas rows `computed()` from `SetRow`s | none |
| FE-6 | `operator/set-editor.ts` | existing | import-path update only | — | none |

**Standards:** standalone, signals, native control flow, `input()`/`contentChild()`,
`NgTemplateOutlet` with a context-guard directive for typed row projection — no
deviation. No new images.

## FE↔BE contract

N/A — no contract change (`VenueMapView`/`SetView` consumed as-is).

## Execution status

**Stage pointer:** implement (phase 4)

**Next action:** move the layout editor onto the canvas (phase 4, contrast math first).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 9907ffb (draft PR #674 opened) |
| 1 — promote BeachGridFrame to shared/ (+ banner unification) | ✅ | this commit |
| 2 — BeachMapCanvas (TDD, unit-spec complete) | ✅ | this commit |
| 3 — tourist map onto the canvas | ✅ | this commit (unit 76 + e2e venue-map-pan 2/2 green) |
| 4 — layout editor onto the canvas | | |
| 5 — daily view onto the canvas | | |
| 6 — sweeps, porcelain check, gates, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/shared-map-canvas.md` — this plan
- `frontend/src/app/shared/beach-grid-frame.ts` — the promoted frame (banner gradient unified to the tourist stops; optional `label` input)
- `frontend/src/app/shared/beach-grid-frame.spec.ts` — moved with it
- `frontend/src/app/operator/beach-grid-frame.ts` — deleted (moved)
- `frontend/src/app/operator/beach-grid-frame.spec.ts` — deleted (moved)
- `frontend/src/app/shared/beach-map-canvas.ts` — the canvas component + the typed tile-row template directive
- `frontend/src/app/shared/beach-map-canvas.html` — canvas template (frame + wash + rails + viewport + slots)
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — canvas unit spec (AC-1..AC-3)
- `frontend/src/app/venue/venue-map.ts` — pan gesture/hint state removed; rows mapped to the canvas contract
- `frontend/src/app/venue/venue-map.html` — grid card replaced by `<app-beach-map-canvas>` with projected tile rows
- `frontend/src/app/venue/venue-map.spec.ts` — alignment spec updated to the canvas wrapper
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — banner-stop refs updated
- `frontend/src/app/operator/layout-editor.ts` — canvas rows computed; paint-end re-homed to `document:mouseup`
- `frontend/src/app/operator/layout-editor.html` — grid block replaced by the canvas (drag-pan opted out)
- `frontend/src/app/operator/layout-editor.spec.ts` — paint-end dispatch updated
- `frontend/src/app/operator/layout-editor.contrast.spec.ts` — `SEA_BANNER_STOPS` update + composited-over-wash tile pairs
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — re-run (axe over the new structure)
- `frontend/src/app/operator/beach-cell.ts` — gap-border (and any other failing literal) contrast fix if AC-7's math demands it
- `frontend/src/app/operator/daily-view-tab.ts` — canvas rows computed
- `frontend/src/app/operator/daily-view-tab.html` — grid block replaced by the canvas (testid/tabindex/label on the viewport)
- `frontend/src/app/operator/daily-view-tab.spec.ts` — only if a selector needs rescoping
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — composited-over-wash pairs incl. the FREE price glyph
- `frontend/src/app/operator/daily-view-tab.a11y.spec.ts` — re-run
- `frontend/src/app/operator/set-editor.ts` — frame import path update
- `frontend/e2e/venue-map-pan.e2e.ts` — pins expected to hold; touch only if a selector needs rescoping
- `frontend/e2e/layout-editor.e2e.ts` — add the drag-paints-not-pans pin
- `frontend/e2e/operator-daily.e2e.ts` — pins expected to hold (scroller testid rides the viewport); chrome pins added
- `RESPONSIBILITIES.md` — only if the docs-freshness sweep finds a stale frame-ownership statement

---

## Phase 0 — Plan doc

- [ ] **Step 1:** Commit this plan; push; open the **draft PR** (CI vehicle, #417).

## Phase 1 — Promote `BeachGridFrame` to `shared/`

**Files:** Move `operator/beach-grid-frame.ts` + `.spec.ts` → `shared/`; modify
`layout-editor.ts`, `daily-view-tab.ts`, `set-editor.ts` imports;
`layout-editor.contrast.spec.ts` banner stops.

- [ ] **Step 1:** `git mv` both files; update the three consumer imports; unify the
  banner gradient to the tourist stops (`#0e7a89→#0c6675`) and add the optional
  `label` input (`aria-label` on the section, for the tourist card's
  "Beach map — {name}").
- [ ] **Step 2:** Update `SEA_BANNER_STOPS` in `layout-editor.contrast.spec.ts`;
  verify white AA over both new stops (pre-checked: white/#0e7a89 already proven in
  `venue-map.contrast.spec.ts:202`).
- [ ] **Step 4:** Scoped run: frame + layout-editor + daily-view + set-editor unit
  suites → PASS. `npm run lint`.
- [ ] **Step 6:** Commit `Promote BeachGridFrame to shared/ and unify the sea-banner gradient (#672)`.
- [ ] **Step 7:** Update Execution status.

## Phase 2 — `BeachMapCanvas` (TDD)

**Files:** Create `shared/beach-map-canvas.ts`, `.html`, `.spec.ts`.

- [ ] **Step 1:** Write the failing canvas spec first: AC-1 chrome + projection,
  AC-2 zone gaps/chips (all three columns), AC-3 suppression (pan over threshold →
  next `detail>0` click swallowed once; `detail 0` never; below threshold never),
  empty-state fallback slot, `.pannable` gating (mocked overflow), drag-pan opt-out
  (no scroll mutation on mousemove when off).
- [ ] **Step 2:** `npm test -- beach-map-canvas` → FAIL (component doesn't exist).
- [ ] **Step 3:** Implement: canvas contract
  `{ code: string; priceLabel: string | null; zoneStart: boolean; tiles: number }`;
  inputs `rows`, `label`, `frameTestid`, `viewportTestid`, `viewportTabindex`,
  `viewportLabel`, `dragPan` (default true); tile rows via
  `ng-template[appMapRows]` (context-guarded, `$implicit` row + `index`); wash
  scroller, rails, viewport markup moved verbatim from `venue-map.html`; pan gesture +
  `scrollHint` + capture-phase suppression moved from `venue-map.ts`; below-viewport
  `<ng-content>` slot; empty fallback slot.
- [ ] **Step 4:** `npm test -- beach-map-canvas` → PASS.
- [ ] **Step 6:** Commit `Grow the shared beach-map canvas: wash, rails, pan viewport, zone layout (#672)`.
- [ ] **Step 7:** Update Execution status.

## Phase 3 — Tourist map onto the canvas

**Files:** Modify `venue-map.ts`, `venue-map.html`, `venue-map.spec.ts` (alignment
spec), `venue-map.contrast.spec.ts` (banner stop refs).

- [ ] **Step 1:** Replace the grid card in `venue-map.html` with the canvas; project
  the tile `ul` rows (testids `set-tile`, `set-button`, classes preserved); delete the
  pan/hint state from `venue-map.ts` (and the now-canvas-owned `select()` suppression);
  keep `rows()`/`toTile()` as-is, mapping to the canvas contract in a `computed()`.
- [ ] **Step 2/4:** `npm test -- venue-map` → PASS (alignment spec updated to the
  canvas wrapper in the same commit); `npm run test:a11y` → PASS.
- [ ] **Step 5:** Generalization audit — if a fix emerges, log it below.
- [ ] **Step 6:** Commit `Move the tourist beach map onto the shared canvas (#672)`.
- [ ] **Step 7:** `npx playwright test venue-map-pan` (mocked suite) → PASS. Update
  Execution status; check the CI run.

## Phase 4 — Layout editor onto the canvas

**Files:** Modify `layout-editor.ts`, `.html`, `.spec.ts`, `.contrast.spec.ts`,
(`beach-cell.ts` if AC-7 math demands), `frontend/e2e/layout-editor.e2e.ts`.

- [ ] **Step 1:** Compute the contrast math first (composited tile pairs over the wash
  stops) — write the failing contrast specs; fix `beach-cell.ts` literals if needed.
- [ ] **Step 2:** Replace the grid block with the canvas (`dragPan` off,
  `viewportTestid="layout-grid"`); rows `computed()` (label, per-zone `priceLabel`
  from `rowPriceStr`, `zoneStart` derived); paint-end → `host`
  `'(document:mouseup)': 'onPaintEnd()'`; update the spec's paint-end dispatch; keep
  `layout-cell` order (row-major, one subtree).
- [ ] **Step 4:** `npm test -- layout-editor` + `npm run test:a11y` → PASS;
  `npx playwright test layout-editor touch-targets` → PASS incl. the new
  drag-paints-not-pans pin.
- [ ] **Step 6:** Commit `Move the layout editor onto the shared canvas (#672)`.
- [ ] **Step 7:** Update Execution status; check CI.

## Phase 5 — Daily view onto the canvas

**Files:** Modify `daily-view-tab.ts`, `.html`, `.contrast.spec.ts`,
(`daily-view-tab.spec.ts` only if a selector rescopes),
`frontend/e2e/operator-daily.e2e.ts` (chrome pins).

- [ ] **Step 1:** Contrast math first: FREE price glyph + tile fills composited over
  wash stops → failing specs → fixes if needed.
- [ ] **Step 2:** Replace the grid block with the canvas
  (`viewportTestid="daily-grid"`, `viewportTabindex=0`,
  `viewportLabel="Beach map"`); rows `computed()` from `groupSetsByRow` output
  (priceLabel from `sets[0].price`, `zoneStart` derived); tile template projected with
  the BUTTON/SPAN + `data-set-id`/`data-state` contract byte-identical.
- [ ] **Step 4:** `npm test -- daily-view` + `npm run test:a11y` → PASS;
  `npx playwright test operator-daily touch-targets` → PASS (grid-scrolls, tabindex,
  page-overflow pins).
- [ ] **Step 6:** Commit `Move the daily view onto the shared canvas (#672)`.
- [ ] **Step 7:** Update Execution status; check CI.

## Phase 6 — Sweeps, porcelain check, gates, close-out

- [ ] **Step 1:** Full `npm test`, `npm run test:a11y`, `npm run test:e2e:a11y`,
  `npm run lint`, `npm run format:check`,
  `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 2:** Porcelain visual check: drive the operator console (mocked) with
  Playwright, screenshot layout editor + daily view under `data-riv-theme='porcelain'`;
  eyeball wash/rails/chips; attach findings here.
- [ ] **Step 3:** Merge latest `origin/main`; mark PR ready for review; run the
  Review gate (`/code-review` ladder + `riviera-review-overlay` RV-FE walk) and the
  Sonar gate (issue list, not pass/fail) per `references/pr-gates.md`.
- [ ] **Step 4:** `riviera-docs-freshness` over `origin/main...HEAD`; patch findings.
- [ ] **Step 5:** Close-out: finalize Execution status (`merged via PR #NN`), tick the
  self-review checklist, close #672 with a slice-2 comment.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3:** `npm test -- beach-map-canvas` → PASS. Verified at `<sha>`.
- [ ] **AC-4:** `npm test -- venue-map` + `npx playwright test venue-map-pan` → PASS. Verified at `<sha>`.
- [ ] **AC-5:** `npm test -- layout-editor` + `npx playwright test layout-editor` → PASS. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- daily-view` + `npx playwright test operator-daily` → PASS. Verified at `<sha>`.
- [ ] **AC-7:** `npm run test:a11y` → PASS. Verified at `<sha>`.
- [ ] **AC-8:** `npm run test:e2e:a11y` → PASS. Verified at `<sha>`.
- [ ] **AC-9:** `git ls-files` shows the frame under `shared/` only; review-gate RV-FE-8 walk clean. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1 — frontend-only).
- [ ] **Availability** section justified N/A; invariant #3 display parity preserved.
- [ ] Pool + cutoff rules honored (invariants #3, #4 — display untouched).
- [ ] **Modulith** N/A — frontend-only.
- [ ] **Payment/payout** N/A.
- [ ] Refund policy N/A.
- [ ] Timezone N/A — no date logic touched.
- [ ] Booking codes N/A (arrival codes render as today).
- [ ] Flyway N/A.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (resolved above).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — invocation ladder + `riviera-review-overlay` RV-FE walk.
