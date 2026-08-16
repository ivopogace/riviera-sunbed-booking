# Beach-Map Canvas 2D Pan Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship issue #676 — extend the shared beach-map canvas's mouse drag-pan to the
vertical axis (2D pan): a drag also writes the wash scroller's `scrollTop`, the 6px
click-vs-pan threshold and the capture-phase consume-once suppression become
distance-based on either axis, and every existing horizontal pin holds verbatim.

**Architecture:** A one-component change. The canvas already owns both scrollers — the
vertical wash scroller (`overflow-y-auto`, `max-h-[532px]`, first `[data-riv-scroller]`)
and, inside it, the horizontal pan viewport (`#canvasViewport`) — so the drag handlers
on the viewport gain a `viewChild` to the wash scroller and track `clientY` alongside
`clientX`. The single most significant decision (D-1): **the vertical axis engages per
gesture only when the wash scroller actually overflows vertically**, measured at
`mousedown` — on a short map a sloppy 8px vertical wobble during a tap must keep
activating the tile, exactly as today. Horizontal behavior is untouched (its threshold
applies regardless of overflow, as shipped — every existing pin depends on it).

**Persistence:** N/A — frontend-only; no tables or migrations (invariant #1 unaffected).

**Source of intent:** GitHub issue #676 (origin: PR #674 follow-up conversation).
Horizontal-only was the ORIGINAL DESIGN of #672 slice 2, not a bug — this slice is an
additive gesture enhancement. Context chain: #672 slices 1–2 (PRs #673/#674,
`docs/plans/shared-map-canvas.md`), #677 set-editor migration (PR #678,
`docs/plans/set-editor-on-canvas.md`), #675 theme polish (PR #680 + #681 docs).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the issue matches main: four canvas surfaces, three with drag-pan on; only dependabot
PRs in flight; no Flyway in scope) · `riviera-plan-doc` (this template — forced D-1/D-2/D-3
to be decided and recorded, not left to the diff) · `tdd` (vertical slices: one
behavior-spec → implementation per cycle) · `riviera-review-overlay` (review gate — due
at ready-for-review) · `riviera-docs-freshness` (**ran** pre-push over
`origin/main...HEAD` — 1 finding: the canvas's own TSDoc said "horizontally pannable";
patched in the implementation commit; no substrate doc pins the pan to one axis) ·
`riviera-frontend` (placement — the change stays in `shared/beach-map-canvas`; new e2e
pins belong to the CI-safe mocked suite) · `angular-developer` + angular-cli MCP
(`get_best_practices` v22 — signals, `viewChild()`, host-object bindings; the component's
established `afterRenderEffect` measurement idiom extends to the wash scroller) ·
`playwright-cli` (e2e authoring; the paid-for traps: raw `page.mouse.*` doesn't
auto-scroll, sticky console header → `scrollIntoView({ block: 'center' })` before
coordinate drags; mocked suite runs with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`) ·
`riviera-local-debug` (scoped Vitest/Playwright recipe; loaded before the session's
first `npm`) · `riviera-tailwind` — N/A: no styling change (the template diff is a
reference variable and an `@if` condition; no class added or altered).

**Branch:** `claude/beach-map-canvas-2d-pan-u3nykc` — the session's designated remote
branch stands in for `feature/beach-map-2d-pan` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a map whose wash scroller overflows vertically, when the mouse
  drags the viewport vertically past 6px, then the wash scroller's `scrollTop` follows
  the drag (1:1, opposite sign) while the viewport's `scrollLeft` is unchanged.
  *Pinned by:* `beach-map-canvas.spec.ts` "pans the wash scroller vertically…" +
  `venue-map-pan.e2e.ts` vertical-drag test (scrollTop delta).
- [x] **AC-2:** Given a vertically overflowing map, when a mostly-vertical drag
  (dx ≤ 6px, dy > 6px) releases over a tile, then the tile's click is suppressed
  (capture-phase, consume-once) — a subsequent genuine click activates, and a keyboard
  activation (`detail === 0`) is never suppressed. *Pinned by:*
  `beach-map-canvas.spec.ts` either-axis suppression specs +
  `venue-map-pan.e2e.ts` (no dialog on vertical-drag release) +
  `operator-set-editing.e2e.ts` (no selection on vertical-drag release over a set-cell).
- [x] **AC-3 (D-1):** Given a map with NO vertical overflow, when the mouse drags
  vertically (any distance), then the wash scroller does not scroll and the following
  click is NOT suppressed — a sloppy tap still books. *Pinned by:*
  `beach-map-canvas.spec.ts` no-vertical-overflow spec.
- [x] **AC-4:** Given `dragPan` off (the bulk layout editor), when the mouse drags in
  any direction, then neither scroller moves and no click is suppressed — drag still
  paints. *Pinned by:* `beach-map-canvas.spec.ts` dragPan-off spec (extended to the
  vertical axis) + `layout-editor.e2e.ts` drag-paints-not-pans pin (verbatim).
- [x] **AC-5 (D-2):** Given a map that overflows only vertically, when it renders with
  `dragPan` on, then the "Drag or swipe to pan the map" hint shows; the `.pannable`
  class (edge fade, `scroll-pl`, snap padding — horizontal-only styling) stays keyed to
  horizontal overflow alone. *Pinned by:* `beach-map-canvas.spec.ts` vertical-hint spec
  + the existing `.pannable`/rest-offset pins holding verbatim.
- [x] **AC-6:** Given the shipped suites, when the slice completes, then the six
  `venue-map-pan.e2e.ts` pins (wash background-image, mask-image, scroll-snap-type,
  ≥16px rest offset, scrollLeft delta, rail x-stability) plus the box-shadow elevation
  pin hold verbatim, and the vertical analog holds: the row-code rail scrolls WITH the
  tiles vertically (it lives inside the wash scroller). *Pinned by:* those suites + the
  new vertical-drag test's rail-tracks-grid assertion.

## Non-goals

- **Vertical scroll-snap** (D-3): `snap-x snap-proximity` stays as shipped; no `snap-y`.
- **Touch/trackpad changes:** native overflow scrolling already works on both axes;
  only the mouse drag gesture is extended.
- **Gating the horizontal axis on overflow:** shipped behavior (threshold regardless of
  horizontal overflow) is pinned; not revisited.
- **Any per-surface opt-in/out beyond the existing `dragPan`:** the opt-out covers both
  axes; no new inputs.
- **Rail behavior changes:** rails stay aria-hidden, outside the pan viewport
  (x-stable), inside the wash scroller (scroll with the grid vertically) — both by the
  shipped design.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — additive gesture enhancement; no surface is retired or replaced. The preserved
horizontal contract is enumerated as AC-4/AC-6 and held by the existing pins verbatim.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Either-axis threshold swallows sloppy taps on short (non-overflowing) maps — a booking-conversion regression | med | high | D-1: the vertical axis (scroll write AND threshold contribution) engages only when the wash scroller actually overflows, measured at `mousedown`; AC-3 spec pins it | this slice | closed — `5b059e8` (AC-3 spec green) |
| R-2 | The new vertical writes break an existing horizontal pin (snap, fade, rest offset, rail x-stability) | low | med | Vertical writes target the wash scroller only; the viewport keeps `overflow-y-hidden`; full venue-map-pan + operator-daily + layout-editor + set-editor + touch-target suites run before push | this slice | closed — full mocked suite 216/216 at HEAD, pre-existing pins byte-identical |
| R-3 | e2e coordinate drags flake: raw `page.mouse.*` doesn't auto-scroll, the operator console header is sticky, a drag drifting over a rail leaves the viewport (`mouseleave` ends the pan) | med | med | The #674 recipe: anchor via `hover()`/`scrollIntoView({ block: 'center' })`, keep drag paths inside the tile grid, `PW_CHROMIUM_EXECUTABLE` set | this slice | closed — `afafcda` (both pins green on first run and on the post-format re-run) |
| R-4 | Set editor (drag-pan ON since #678, canvas default) gets vertical pan implicitly — a vertical drag must not select a set-cell | med | med | AC-2's set-editor e2e pin with a tall (12-row) fixture; the same consume-once suppression path as the tourist tile | this slice | closed — `afafcda` (operator-set-editing 7/7) |
| R-5 | Sonar new-code gate (0 issues, 0 duplication, ≥80% coverage) on the touched lines | low | low | Gesture logic is unit-specced directly (AC-1..AC-5); review the issue list at the gate | PR-time | open by design — Sonar analyzes PRs only; due with the review gate when the PR opens |

## Open questions / Assumptions

None open.

### Resolved

- **D-1 — gate vertical drag on actual vertical overflow?** Yes: measured per gesture at
  `mousedown` (`scrollHeight > clientHeight + 1` on the wash scroller). A short map
  never hijacks a drag and a sloppy tap never loses its click. Horizontal behavior
  deliberately unchanged. (Recorded here; the issue left this to the plan.)
- **D-2 — hint on vertical-only overflow?** Yes: the hint shows when either axis
  overflows (and `dragPan` is on) — after this slice the copy is fully true vertically.
  `.pannable` (edge fade + `scroll-pl` + snap padding, horizontal-only styling) stays
  keyed to horizontal overflow alone via the existing `scrollHint` signal; a new
  `vScrollHint` signal joins it for the hint condition only.
- **D-3 — vertical scroll-snap?** No: `snap-x` stays as shipped; rows have no snap
  alignment vertically and none is wanted.

## Availability & concurrency (invariant #2)

N/A — display-only gesture change. No availability channel is touched: booking,
mark/release and set-editing write paths are unmodified; the suppression contract
(AC-2/AC-3) only governs whether a mouse release counts as a tap. The server stays
authoritative for every claim.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

All in `shared/beach-map-canvas` (frontend `shared/` stratum) — the canvas already owns
both scrollers and the pan gesture; no boundary change, no new cross-feature edge
(RV-FE-8 ledger untouched).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beach-map-canvas.ts` + `.html` | existing | standalone component | new `viewChild` (wash scroller) + `vScrollHint` signal in the existing `afterRenderEffect`; per-gesture fields for the vertical axis | none |

**Standards:** standalone, signals, `viewChild()`, native control flow — no deviation.
Consumers (tourist map, daily view, set editor, layout editor) are untouched.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement complete — all local gates green; the PR-time gates (CI per #417, review per pr-gates §1, Sonar per §2) are due when the PR opens

**Next action:** open the PR for `claude/beach-map-canvas-2d-pan-u3nykc` (deliberately not created in-session — the task did not request one), run the review + Sonar gates there, and close #676 on merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 5b059e8 |
| 1 — vertical pan in the canvas (TDD) | ✅ | 5b059e8 (14 canvas specs; 217 across the surface suites; lint + format green) |
| 2 — e2e pins (tourist + set editor) | ✅ | afafcda (venue-map-pan 3/3 + operator-set-editing 7/7; operator-daily + layout-editor + touch-targets 43/43 — all pre-existing pins verbatim) |
| 3 — sweeps, hand verification, close-out | ✅ | this commit (unit 1441, a11y 347, mocked e2e 216/216, lint/format/plan-guard green; real-browser diagonal-drag verification with screenshots — both axes pan in one gesture, no dialog on a vertical release, no set-cell selection, genuine clicks still land; docs-freshness: 1 finding — the canvas TSDoc — patched in `5b059e8`) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `docs/plans/beach-map-2d-pan.md` — this plan
- `frontend/src/app/shared/beach-map-canvas.ts` — vertical axis in the drag handlers; wash-scroller `viewChild`; `vScrollHint`; TSDoc updated off "horizontally pannable"
- `frontend/src/app/shared/beach-map-canvas.html` — `#washScroller` ref; hint condition includes `vScrollHint()`
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — vertical pan/suppression/gating/hint specs; drag helper gains a `dy`
- `frontend/e2e/venue-map-pan.e2e.ts` — tall-venue vertical-drag test (scrollTop delta, no dialog, rail tracks the grid, one-shot suppression)
- `frontend/e2e/operator-set-editing.e2e.ts` — tall-map vertical-drag test (no selection on release, wash scrolled, genuine click still selects)

---

## Phase 1 — Vertical pan in the canvas (TDD)

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.ts`, `.html`, `.spec.ts`.

Behaviors, one red→green cycle each (jsdom measures 0, so specs seed overflow through
the DOM measurement seam — `Object.defineProperty(wash, 'scrollHeight'/'clientHeight')`
— before the gesture, mirroring the shipped `.pannable` spec):

- [ ] **1. Vertical scroll follows the drag** (AC-1): with wash overflow seeded and
  `scrollTop = 50`, `mousedown(clientY:100)` + `mousemove(clientY:60)` →
  `wash.scrollTop === 90`; `viewport.scrollLeft` unchanged.
- [ ] **2. Either-axis suppression** (AC-2): a dy-40/dx-0 drag over an overflowing wash
  swallows the next `detail > 0` click once; the next genuine click lands; a `detail
  === 0` activation right after a vertical pan is never swallowed.
- [ ] **3. No vertical overflow → no vertical pan, no suppression** (AC-3, D-1):
  without the seam, a dy-40 drag leaves `scrollTop` at 0 AND the following click
  activates.
- [ ] **4. dragPan off covers the vertical axis** (AC-4): extend the existing opt-out
  spec — seed wash overflow, drag dy-40 → no scroll, no suppression.
- [ ] **5. Hint on vertical-only overflow** (AC-5, D-2): seed wash overflow only →
  hint renders; `dragPan` off → gone; (existing spec already pins the horizontal arm).

Implementation (after the first red): `#washScroller` template ref on the wash div; a
`washScroller` `viewChild`; `vScrollHint` signal measured in the existing
`afterRenderEffect`; `panStartY`/`panStartScrollTop`/`panVertical` gesture fields set at
`mousedown` (D-1 measurement); `onViewportMouseMove` computes `dy` (0 when
`panVertical` is false), trips `panned` on either axis, writes `wash.scrollTop`; hint
`@if` becomes `(scrollHint() || vScrollHint()) && dragPan()`; TSDoc reworded off
"horizontally pannable".

- [ ] **Run:** `npm test -- beach-map-canvas` red→green per cycle; then
  `npm test -- venue-map daily-view layout-editor set-editor beach-map-canvas` +
  `npm run test:a11y` green; `npm run lint` + `npm run format:check`.
- [ ] **Commit** `Extend the beach-map canvas drag-pan to the vertical axis (#676)` with
  this plan doc; push (draft-PR step deferred — see Execution status).

## Phase 2 — e2e pins

**Files:** Modify `frontend/e2e/venue-map-pan.e2e.ts`, `frontend/e2e/operator-set-editing.e2e.ts`.

- [ ] **1. Tourist vertical pin** (`venue-map-pan.e2e.ts`): a `tallVenue()` fixture
  (12 rows × 20 positions, wash > 532px) on `/api/venues/2`; drag a mid-map tile
  upward ~120px (hover-anchored, path inside the grid): wash `scrollTop` delta > 0, NO
  dialog on release, the row-code chip's y-delta tracks the first tile's y-delta (rails
  scroll WITH the grid — the vertical analog of the x-stability pin), and a genuine
  click afterwards opens the dialog. The six existing pins + elevation pin: untouched.
- [ ] **2. Set-editor vertical pin** (`operator-set-editing.e2e.ts`): override the venue
  GET after `mockConsole` with a 12-row map; `scrollIntoView({ block: 'center' })` the
  anchor cell (sticky console header); mostly-vertical drag releasing over a set-cell →
  `set-panel-empty` still shown (no selection), wash `scrollTop` moved; a genuine click
  then selects.
- [ ] **Run** (mocked suite, cloud recipe):
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts venue-map-pan operator-set-editing operator-daily layout-editor touch-targets` → green.
- [ ] **Commit** `Pin the 2D pan's vertical guarantees in the tourist and set-editor e2e (#676)`.

## Phase 3 — Sweeps, hand verification, close-out

- [ ] **1.** Full `npm test`, `npm run test:a11y`, full mocked e2e suite
  (`PW_CHROMIUM_EXECUTABLE=… npm run test:e2e:a11y`), `npm run lint`,
  `npm run format:check`, `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **2. Hand verification in the real browser** (user-facing behavior change): serve
  the app, mock a tall venue, and with `playwright-cli` drag the map diagonally —
  confirm both axes pan together, a vertical-drag release over a free tile opens no
  dialog, and over a set-cell selects nothing.
- [ ] **3.** `riviera-docs-freshness` over `origin/main...HEAD`; patch findings.
- [ ] **4.** Finalize Execution status; push. PR + review/Sonar gates + closing #676
  happen at PR time (see Execution status — no PR was requested in-session).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | Phase 1 (either-axis suppression could swallow taps on non-overflowing maps) | every surface rendering `<app-beach-map-canvas>` with drag-pan on (inherits 2D pan + suppression) | `grep -rn "<app-beach-map-canvas" frontend/src/app` | venue-map, daily-view-tab, set-editor (dragPan default on) → covered by D-1 gating + AC-2/AC-3; layout-editor (dragPan off) → AC-4 | D-1 gates the axis; e2e pins on tourist + set editor; daily view covered by the same canvas specs + its suite re-run |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-5:** `npm test -- --include '**/beach-map-canvas.spec.ts'` → 14 PASS. Verified at `5b059e8`.
- [x] **AC-2 (e2e):** `npx playwright test -c playwright.a11y.config.ts venue-map-pan operator-set-editing` → 10 PASS. Verified at `afafcda` and re-verified after the phase-3 format pass.
- [x] **AC-4 (e2e):** `npx playwright test -c playwright.a11y.config.ts layout-editor` (with operator-daily + touch-targets) → 43 PASS. Verified at `afafcda`.
- [x] **AC-6:** full mocked e2e suite (`npm run test:e2e:a11y`) → 216/216 PASS; the pre-existing venue-map-pan pins are byte-identical in the diff. Verified at HEAD of this push.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1 — frontend-only).
- [x] **Availability** section justified N/A (display-only gesture).
- [x] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [x] **Modulith** N/A — frontend-only.
- [x] **Payment/payout** N/A.
- [x] Refund policy N/A.
- [x] Timezone N/A.
- [x] Booking codes N/A.
- [x] Flyway N/A.
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows (R-5 is open **by design** — the Sonar gate only exists at PR time); Open Questions empty.
- [x] **Close-out state committed in the final push** — cites the PR once one exists.
- [ ] **The review gate ran in full** — due at PR ready-for-review; not claimable in-session without a PR (recorded honestly in Execution status; left unticked per the pr-gates rule).
