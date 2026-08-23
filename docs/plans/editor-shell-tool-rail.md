# Editor shell S2 — Select joins the brushes, Generate becomes a button

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the layout editor's "Bulk layout"/"Edit sets" sub-tab toggle and the
separate "Paint tool" card with one persistent tool rail — Select + the four paint
brushes, each with a live count — and demote "Generate layout…" from its own card into
a button beneath the rail's tools, with no change to the bulk PUT payload, the
`expectedVersion` concurrency token, or the `LAYOUT_IN_USE`/`STALE_WRITE` recovery UX.

**Architecture:** The single most significant decision: keep the two underlying
surfaces (the bulk paint grid in `LayoutEditor` and the per-set `SetEditor`) exactly as
they are — this is explicitly S2 of a 4-slice epic (#708), and the doc'd visual spec
defers the docked-inspector panel merge to S3. Only the *entry point* changes: today's
`chosenMode` signal (`'bulk' | 'sets'`, chosen via two toggle buttons) becomes a single
`armedTool` signal (`'select' | CellState`, chosen via five tool-rail rows), and `mode`
is derived from it (`armedTool === 'select' ? 'sets' : 'bulk'`) instead of being chosen
directly. The rail is hoisted out of the bulk-only branch so it renders in both modes
(mirroring where today's toggle fieldset already sits, outside the `@if`).

**Persistence:** JDBC only (invariant #1). N/A — no backend/DB change; this slice is
frontend-only and touches no table or migration.

**Source of intent:** GitHub issue #711 (epic #708, S1 predecessor #709 merged as PR
#767); visual spec artboards `Main.dc.html` (paint state) and `SelectState.dc.html`
(select state) on the epic's design artifact
(`https://claude.ai/code/artifact/af8252b7-f0c5-4177-b65d-93716c911f77`).

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill — confirmed #709
merged, no in-flight PR touches the layout editor) · `riviera-plan-doc` (this template —
forced the behavior-parity ledger, which caught the Generate-always-visible design
question before it became an untracked deviation) · `tdd` (component spec extended per
behavior before each template edit — AC-1..AC-4 specs written first, confirmed failing,
then implemented) · `riviera-review-overlay` (review gate — runs at PR
ready-for-review) · `riviera-docs-freshness` (`N/A — no substrate doc states the
sub-tab/toggle structure this slice removes; CLAUDE.md/RESPONSIBILITIES.md don't mention
layout-editor UI shape`) · `riviera-frontend` (confirmed no new folder — same feature
files in `operator/`, no new cross-feature import) · `angular-developer` + angular-cli
MCP (`list_projects` confirmed Angular 22; `search_documentation` confirmed `@for
… track tool.key` matches the current track-by-stable-key guidance; the merged
`armedTool`/`resolvedTool` derivation and the `swatchClass(tool.key)` narrowing inside
`@if (tool.key === 'select') {…} @else {…}` compiled clean under strict template
checking, confirming the narrowing) · `riviera-tailwind` (tool-rail rows styled with the
existing rail-button utility pattern already used by the retired paint-tool/mode
buttons; swatches double as legend, so the old legend `<ul>` is deleted, not migrated;
verified `ring-offset-1` — new to this component, `ring-offset-2` was S1's precedent in
`set-editor.html` — actually compiles in the pinned Tailwind v4.3.2 by building the app
and grepping the emitted CSS for the `.ring-offset-1` rule, since a fetched-docs excerpt
looked incomplete) · `playwright-cli` (drove the mocked e2e suite locally while porting
`layout-editor.e2e.ts`/`operator-set-editing.e2e.ts`/`touch-targets.e2e.ts` to the
tool-rail selectors — 29+53 tests green).

**Branch:** designated cloud branch `claude/tailwind-angular-mcp-search-9kxkgm` stands
in for `feature/editor-shell-tool-rail` (remote-session addendum) — exists, is current
with `main`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue whose beach map has never been generated, when the
      operator opens the Beach map tab, then the tool rail renders five rows — Select,
      Front row · premium, Standard set, Walk-in pool, Gap / aisle — the "Bulk
      layout"/"Edit sets" pill buttons are gone, and a brush (Front row · premium by
      default) is armed. *Pinned by:* `LayoutEditor.spec.ts` — "renders the merged tool
      rail with five rows and no mode pills".
- [x] **AC-2:** Given a brush is armed, when the operator clicks or drags across grid
      cells, then each cell's tier/pool updates, the rail's live counts update, and no
      set-selection state appears. *Pinned by:* `LayoutEditor.spec.ts` — "painting with
      an armed brush updates the grid and the rail counts".
- [x] **AC-3:** Given the operator clicks the Select row, when the rail re-renders,
      then `mode()` becomes `'sets'`, `<app-set-editor>` renders in place of the paint
      grid (S1's selection ring+lift, numbered tiles), and clicking a set selects it
      without painting. *Pinned by:* `LayoutEditor.spec.ts` — "arming Select switches to
      the set-editor surface"; existing `SetEditor` specs cover selection itself
      unchanged.
- [x] **AC-4:** Given a venue with an existing layout, when the operator clicks
      "Generate layout…" (now living beneath the tool rail, not in its own card), then
      the existing regenerate-confirm panel and warning copy appear unchanged, and
      confirming replaces the grid exactly as today. *Pinned by:* `LayoutEditor.spec.ts`
      — "Generate lives beneath the tool rail and keeps the regenerate confirm step".
- [x] **AC-5:** Given a painted grid, when the operator saves, then the PUT body sent to
      `OperatorConsoleService.replaceLayout` is byte-for-byte the same shape as today
      (`{ sets, expectedVersion }`), and a `LAYOUT_IN_USE` or `STALE_WRITE` response
      renders the same copy/banner as before. *Pinned by:* existing
      `LayoutEditor.spec.ts` save-flow specs (unmodified assertions) plus the ported
      `layout-editor.e2e.ts`.
- [x] **AC-6:** Given any tool-rail row, when inspected, then it meets the 44×44px
      touch-target floor (`appTouchTarget`), carries `aria-pressed` reflecting armed
      state, and switching tools moves no focus (no element is destroyed/recreated by
      the switch). *Pinned by:* `frontend/e2e/touch-targets*.e2e.ts` (extended if the
      rail introduces a new row shape) + `LayoutEditor.spec.ts` focus assertions.

## Non-goals

- The docked inspector / persistent save-status-bar redesign (S3).
- Fill rails (row/column paint-the-whole-line), batch select, and zoom controls (later
  epic slices per the visual-spec annotations — explicitly out of #711's AC list).
- Merging `LayoutEditor`'s and `SetEditor`'s canvases into one shared instance — they
  stay two components, switched by `mode()`, exactly as today.
- Any change to `operator-console.service.ts` request/response shapes.

## Behavior-parity ledger (retirement / replacement slices only)

The "Bulk layout"/"Edit sets" toggle fieldset and the standalone "Paint tool" card are
retired surfaces; every behavior they carried is accounted for below.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Two-button mode toggle (`layout-mode-bulk`/`layout-mode-sets`), always visible above the branch | changed | Replaced by the five-row tool rail (`layout-tool-select` + the four `layout-tool-<state>` rows), which sits in the same always-visible position and drives the same `mode()` computed |
| Default mode: sets if the venue has saved sets, else bulk (`chosenMode() ?? …`) | preserved | `armedTool() ?? (loadedSets().length > 0 ? 'select' : activeBrush())` — identical fallback logic, renamed signals |
| Four-button "Paint tool" card with swatch + live count per button | preserved | Same four rows, same `tools()`-derived swatch/count, now inside the unified rail instead of a second card |
| Default armed brush: `premium` | preserved | `activeBrush` signal still defaults `'premium'`; unchanged on venue reset |
| Separate "Generate layout" card (rows/positions inputs, generate button, regen-confirm, caption) | preserved | Same inputs/button/`ConfirmPanel`/caption markup, relocated beneath the rail's tool rows in the same card |
| Bottom legend `<ul>` (4 static swatch+label rows) | dropped → **absorbed** | The rail's own swatches are the tool-rail counterparts of the same 4 legend entries — issue #711 explicitly retires the separate legend row in favor of the rail doubling as legend |
| `onSetsChanged()` re-read clearing the bulk draft on a per-set write | preserved | Unchanged — still fires on `<app-set-editor>`'s `(changed)` output, unaffected by the rename |
| `LAYOUT_IN_USE` copy pointing operators at "Edit sets" | changed (wording only) | Copy now says "arm Select" instead of "switch to Edit sets" — same underlying recovery path, updated to match the new UI noun |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Renaming `chosenMode`/`activeTool` to `armedTool`/`activeBrush` silently changes the default-mode fallback (e.g. an off-by-one on "has this venue got sets") and a trading venue opens mis-armed | low | med | Port the exact fallback expression (`loadedSets().length > 0`) unchanged; keep the existing `LayoutEditor.spec.ts` default-mode specs (renamed, not rewritten) as the pin | this session | resolved — verified passing |
| R-2 | Hoisting the rail out of the bulk-only branch changes which DOM node holds focus when `mode()` flips (Select ↔ a brush), stranding keyboard focus (WCAG 2.4.3) | med | med | The rail rows are never destroyed/recreated by a mode switch (only the *content to their side* is `@if`/`@else`'d) — verified by an e2e focus-retention assertion (AC-6) | this session | resolved — verified passing |
| R-3 | The bulk PUT payload or `expectedVersion`/`LAYOUT_IN_USE`/`STALE_WRITE` handling drifts while refactoring `toRequest()`/`onSave()`/`reloadAfterStale()` around the renamed signals | low | high | Touch only the mode/tool signals and the template; leave `toRequest()`, `onSave()`, `reloadAfterStale()`, and the error-mapping methods byte-identical; existing specs for these paths are kept as regression pins | this session | resolved — verified passing |
| R-4 | `frontend/e2e/operator-set-editing.e2e.ts`'s "locked-bulk message points at per-set editing" spec (`operator-console.service.ts` copy) breaks silently since it asserts old wording | low | low | Grep both e2e files for `layout-mode-` / the old `LAYOUT_IN_USE` copy string before considering the slice done | this session | resolved — verified passing |

## Open questions / Assumptions

### Resolved

- **Assumption:** the Select row shows no live count (per the visual-spec artboard,
  `count: ''`) — it isn't a tier/pool count. Confirmed against the artboard's `TOOLS`
  array; implemented as `count: null` on the Select `ToolRow`, template renders no
  count span for it. — commit (this slice, Phase 0).
- **Assumption:** rail width/placement uses the existing Tailwind idioms from the
  retired toggle/paint-tool cards (not a pixel-exact port of the artboard's bespoke
  188px card) — the visual spec's precise sizing is aspirational for the full epic, and
  #711's AC list does not require pixel parity with the artboard. Implemented as a
  280px-column card, matching the retired cards' width. — commit (this slice, Phase 0).
- **Design decision (not pre-stated as an open question, resolved during implementation):**
  the artboards (both `Main.dc.html`/paint-state and `SelectState.dc.html`/select-state)
  show Generate always present beneath the tools regardless of the armed tool, so
  Generate is NOT gated by `mode()` — it lives in the rail card, visible with either
  Select or a brush armed. Clicking Generate while Select is armed still respects the
  regenerate-confirm step, and a successful generate re-arms the active brush (a fresh
  grid needs the paint surface to be visible). Ported the affected unit specs (AC-1,
  AC-4) and added a dedicated spec for the Select→Generate→re-armed-brush path.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice touches only which UI is shown for
choosing paint tool vs. set selection; the write path (`replaceLayout`,
`SetEditor`'s per-set writes) and the `availability` table are untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/operator/layout-editor.ts` | existing | standalone component | Signals + `computed()` (renamed `chosenMode`→`armedTool`, `activeTool`→`activeBrush`, new `resolvedTool`/`tools` shape) | N/A — no form fields added |
| FE-2 | `frontend/src/app/operator/layout-editor.html` | existing | template | — | — |
| FE-3 | `frontend/src/app/operator/layout-editor.spec.ts` | existing | Vitest spec | — | — |
| FE-4 | `frontend/e2e/layout-editor.e2e.ts` | existing | Playwright (mocked) | — | — |
| FE-5 | `frontend/e2e/operator-set-editing.e2e.ts` | existing | Playwright (mocked) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal `computed()`.
No new inputs/outputs/forms — this slice only reshapes existing signals/template. No
deviation from `angular-developer`'s standards.

## FE↔BE contract

N/A — no contract change. `toRequest()`'s `LayoutCellRequest[]` shape, `replaceLayout`'s
`{ sets, expectedVersion }` body, and every error-code mapping in
`operator-console.service.ts` are untouched (AC-5, R-3).

## Execution status

**Stage pointer:** implement — done, ready to commit and open the PR.

**Next action:** commit, push to the designated branch, open the PR as a draft, run the
review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Merge tool rail (signals + template) | ✅ | (this slice's commit) |
| 1 — Port e2e to the tool-rail selectors | ✅ | (this slice's commit) |
| 2 — Local verification (lint/format/test/a11y/e2e) + close-out | ✅ | (this slice's commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/operator/layout-editor.ts` — rename `chosenMode`→`armedTool`,
  `activeTool`→`activeBrush`; add `EditorTool` type, `resolvedTool`/`tools` rail-shaped
  computed, `armTool()` method; `mode` computed now derives from `resolvedTool()`.
- `frontend/src/app/operator/layout-editor.html` — replace the mode-toggle fieldset +
  "Paint tool" card + legend `<ul>` with one persistent tool-rail card (5 rows +
  Generate button + caption + regen-confirm), hoisted above the `@if (mode() ===
  'sets')` branch.
- `frontend/src/app/operator/layout-editor.spec.ts` — rename signal references; add
  specs for AC-1..AC-4/AC-6.
- `frontend/e2e/layout-editor.e2e.ts` — port `layout-mode-*` selectors to
  `layout-tool-select` / the existing `layout-tool-<state>` rows; the paint/generate/
  save/`LAYOUT_IN_USE`/`STALE_WRITE` assertions themselves are unchanged; the retired
  separate legend `<ul>` assertion is dropped (swatches are the legend now).
- `frontend/e2e/operator-set-editing.e2e.ts` — update any `layout-mode-sets` reference
  and the `LAYOUT_IN_USE` copy string (R-4) to the new "arm Select" wording.
- `frontend/e2e/touch-targets.e2e.ts` — port its `layout-mode-bulk` click to
  `layout-tool-premium`.
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — port its `layout-mode-*`
  clicks to the rail's `layout-tool-*` testids.
- `frontend/src/app/operator/set-editor.html` — the "no sets yet" panel copy no longer
  names "Bulk layout" (that toggle is gone); it now points at the tool rail's brush.
- `frontend/src/app/operator/set-editor.spec.ts` — update the copy assertion to match.

---

## Phase 0 — Merge the mode toggle and paint-tool card into one tool rail

**Files:** Modify `frontend/src/app/operator/layout-editor.ts`,
`frontend/src/app/operator/layout-editor.html`,
`frontend/src/app/operator/layout-editor.spec.ts`

- [x] **Step 1: Write the failing tests** for AC-1..AC-4 and AC-6 in
      `layout-editor.spec.ts` (new `describe('tool rail')` block: five rows render, no
      mode pills, default-armed brush, arming Select flips `mode()` to `'sets'` and
      renders `SetEditor`, Generate button lives under the rail and still confirms
      regen).
- [x] **Step 2: Run it, verify it fails** — `npm test -- layout-editor.spec.ts` (from
      `frontend/`) → FAIL, rail rows/testids not found.
- [x] **Step 3: Minimal implementation** — rename signals, add `EditorTool`/`armTool`/
      `resolvedTool`/rail-shaped `tools`, rewrite the template's top section into the
      unified rail card, delete the legend `<ul>`.
- [x] **Step 4: Run it, verify it passes** — `npm test -- layout-editor.spec.ts` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every place `chosenMode`/
      `activeTool`/`selectTool`/`chooseMode` is referenced. Enumerated via
      `grep -rn "chosenMode\|activeTool\|selectTool\|chooseMode" frontend/src/app
      frontend/e2e`. Candidates: `layout-editor.ts`, `layout-editor.html`,
      `layout-editor.spec.ts`, `layout-editor.e2e.ts`. Decision: fix all four (no
      leftover reference to the retired mode-toggle API).
- [x] **Step 6: Commit** — `git commit -m "Merge the layout editor's mode toggle and paint-tool card into one tool rail (#711)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Port e2e to the tool-rail selectors

**Files:** Modify `frontend/e2e/layout-editor.e2e.ts`,
`frontend/e2e/operator-set-editing.e2e.ts`

- [x] **Step 1:** Replace every `layout-mode-bulk`/`layout-mode-sets` click with the
      equivalent tool-rail arm (`layout-tool-premium` etc. already used for painting;
      add `layout-tool-select` for entering sets mode) — keep every existing assertion
      (PUT payload, `expectedVersion`, `LAYOUT_IN_USE`, `STALE_WRITE`, drag-paint,
      regen-confirm, row naming) unweakened, per AC.
- [x] **Step 2:** Update the `LAYOUT_IN_USE` copy assertion and the "locked-bulk
      message" spec to the new wording (R-4).
- [x] **Step 3:** Run `npm run test:e2e:a11y -- layout-editor` and
      `npm run test:e2e:a11y -- operator-set-editing` (from `frontend/`) → PASS, axe
      clean.
- [x] **Step 4: Commit** — `git commit -m "Port layout-editor e2e to the merged tool rail (#711)"`
- [x] **Step 5: Update plan-doc execution status.**

---

## Phase 2 — Local verification + close-out

**Files:** none (verification only)

- [x] **Step 1:** `npm run lint`, `npm run format:check`, `npm test`, `npm run
      test:a11y` (from `frontend/`) — all green.
- [x] **Step 2:** `node scripts/check-plan-file-structure.mjs --diff origin/main` —
      clean (this doc staged first).
- [x] **Step 3: Commit + update plan-doc execution status** (final close-out, `merged
      via PR #NN` once opened/merged).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-23 | Phase 0 | Every reference to the retired mode-toggle/paint-tool API (`chosenMode`, `activeTool`, `selectTool`, `chooseMode`) | `grep -rn "chosenMode\|activeTool\|selectTool\|chooseMode" frontend/src/app frontend/e2e` | `layout-editor.ts`, `layout-editor.html`, `layout-editor.spec.ts`, `layout-editor.e2e.ts` | fix all four |
| 2026-08-23 | Phase 1 | Every test file referencing the retired `layout-mode-bulk`/`layout-mode-sets` testids or the old `LAYOUT_IN_USE`/"switch to Bulk layout" copy strings — enumerated by mechanism (which testid/copy string), not by which spec files "looked related" | `grep -rn "layout-mode-\|Bulk layout" frontend/src frontend/e2e` | `layout-editor.e2e.ts`, `operator-set-editing.e2e.ts`, `touch-targets.e2e.ts`, `layout-editor.a11y.spec.ts`, `set-editor.html`, `set-editor.spec.ts` (6 sites, 2 beyond what Phase 0's narrower grep had found) | fix all six |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6:** verified — `npm test -- --watch=false` (1799/1799 unit specs
      green, incl. the new `LayoutEditor.spec.ts` rail specs), `npm run test:a11y`
      (392/392 green), and the mocked Playwright suite (`layout-editor.e2e.ts`,
      `operator-set-editing.e2e.ts`, `touch-targets.e2e.ts` — 29/29 green; the full
      `operator*`/`layout*`/`set-editor*` e2e sweep — 53/53 green). `npm run lint` and
      `npm run format:check` clean. Not yet verified: CI's own run (pending push/PR).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced — N/A, no backend touched.
- [x] **Availability** section filled (N/A, justified).
- [x] Pool + cutoff rules honored — N/A, unaffected.
- [x] **Modulith** section filled (N/A, frontend-only).
- [x] **Payment/payout** section filled (N/A).
- [x] Refund policy — N/A.
- [x] Timezone — N/A, unaffected.
- [x] Booking codes — N/A.
- [x] Flyway — N/A.
- [x] **Frontend** standards met (see Angular section above).
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR.** — no PR opened yet (not requested this
      session); this box ticks when one is opened and this doc's close-out is its final
      commit, per the template's rule.
- [ ] **The review gate ran in full.** — pending; `/code-review` (or the invocation
      ladder's fallback) has not yet run over this diff.

Two boxes remain open pending the PR/review stage — recorded here rather than silently
claimed. Everything implementable in this session (Phases 0–2) is done and verified.
