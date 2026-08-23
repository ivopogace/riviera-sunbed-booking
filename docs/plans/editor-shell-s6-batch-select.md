# Editor shell S6 — batch select: sweep a block, apply tier/pool/price once

> **For agentic workers:** to implement this plan use `implement` + `tdd`. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** With Select armed on the per-set beach-map editor, dragging sweeps a rectangular
block of sets; the docked inspector becomes a batch editor ("N sets selected") that applies
only the tier/pool/price fields the operator actually touches, via one existing bulk-layout
PUT, leaving every untouched field on every set as it was.

**Architecture:** The sweep gesture and the batch inspector live inside `SetEditor` (it
already owns the grid, cell clicks and the docked single-set panel), mirroring the
mousedown→mouseenter→document:mouseup drag-paint shape `LayoutEditor` already uses for its
bulk brush and `BeachMapCanvas`'s fill-rail sweep. The actual write goes through the SAME
`OperatorConsoleService.replaceLayout()` bulk PUT `LayoutEditor.onSave()` already drives —
`SetEditor` gets `expectedVersion` as a new input (no new endpoint) and builds the full
`LayoutCellRequest[]` snapshot from its own `sets` input, touched sets merged, everything
else passed through unchanged. `SetEditor` calls the PUT directly (it already calls the
per-set U7 endpoints the same way) and re-uses its `changed` output to trigger the parent's
re-read on success; on `STALE_WRITE` it emits a new `staleWrite` output so `LayoutEditor`
reuses its existing `StaleWriteBanner` + `reloadAfterStale()` recovery, now rendered in
`sets` mode too.

**Persistence:** N/A — frontend-only; the existing `PUT /api/venues/{id}/beach-map` and its
`LayoutCommand` invariants are unchanged (invariant #1: no backend code touched).

**Source of intent:** #714 (parent epic #708; blocked-by #712, merged).

**Skills consulted:** `riviera-sdlc` (routing — an `area:frontend` slice, no backend/DB/money
surface beyond the existing bulk-PUT contract) · `riviera-plan-doc` (this template) ·
`tdd` (unit specs written alongside the sweep/merge logic before the e2e) ·
`riviera-review-overlay` (review gate — runs at PR ready-for-review) ·
`riviera-docs-freshness` (N/A — no substrate doc states a fact this slice changes; the
S3/S5 TSDoc already says "the docked-inspector merge is a later slice") · `riviera-frontend`
(confirmed placement: everything stays in the existing `operator/` feature folder, no new
top-level surface) · `riviera-tailwind` (the batch panel reuses the single-set panel's
existing utility classes/tokens — no SCSS, no new directive) · `angular-developer` + the
angular-cli MCP (`get_best_practices` — signals/`linkedSignal`/`input()`/`output()` posture;
`search_documentation` for `output()`/`EventEmitter` semantics before writing the new
`staleWrite` output, and again after implementation to double-check the `linkedSignal`
"account for previous state" shape used for `sweepIds`) · `playwright-cli` (placement: the
new sweep/apply coverage belongs in the existing CI-safe mocked suite,
`frontend/e2e/operator-set-editing.e2e.ts`, alongside the drag-gesture precedent it replaces).

**Branch:** `claude/tailwind-angular-mcp-search-xsqi6b` (this session's designated remote
branch stands in for `feature/editor-shell-s6-batch-select`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given Select is armed and the operator drags from one cell to another,
  when the drag covers more than one cell, then every set whose `(gridX, gridY)` falls
  inside the drag's bounding rectangle is marked selected and the panel shows "N sets
  selected" with a row/position range. *Pinned by:* `SetEditor (#714).sweeps a rectangular
  block of sets on a multi-cell drag`.
- [ ] **AC-2:** Given N sets are batch-selected, when the operator sets only the price field
  and applies, then the PUT's `sets` payload changes `price` on exactly those N sets and
  leaves `tier`/`pool` at each set's own saved value — same for tier-only and pool-only.
  *Pinned by:* `SetEditor (#714).applies only the touched field, per field`.
- [ ] **AC-3:** Given the batch apply is in flight, when the PUT resolves, then it was one
  `PUT /api/venues/{id}/beach-map` request carrying `expectedVersion` and the venue's whole
  set snapshot. *Pinned by:* `operator-set-editing.e2e.ts › batch-select sweeps a block,
  applies price only, in one PUT`.
- [ ] **AC-4:** Given a batch apply gets `409 STALE_WRITE`, when the error lands, then the
  batch selection and draft are kept and a Reload control is offered; a successful Reload
  re-seeds the sets and clears the conflict. *Pinned by:* `SetEditor (#714).a STALE_WRITE
  batch apply keeps the selection and offers Reload`.
- [ ] **AC-5:** Given a batch selection is open, when the operator presses Escape or clicks
  Clear, then the selection empties and focus returns to a tile on the canvas (never
  stranded on `<body>`). *Pinned by:* `SetEditor (#714).Escape and Clear both empty the
  sweep and move focus back to the canvas`.
- [ ] **AC-6:** Given Select is armed, when the operator taps (not drags) one cell, then
  exactly that one set is selected and the existing single-set inspector (S3) renders with
  Move/Remove — unchanged from today. *Pinned by:* the existing `SetEditor (#600)` suite,
  which keeps passing unmodified.
- [ ] **AC-7:** The batch panel, its live "N selected" announcement, and the sweep-selected
  cell state are axe-clean, and every batch control meets the 44px floor. *Pinned by:*
  `SetEditor a11y (#600 / #714)` + `operator-set-editing.e2e.ts`'s existing 44px sweep +
  `expectNoSeriousAxeViolations`.

## Non-goals

- A new backend endpoint — the batch apply composes through the existing bulk PUT.
- Keyboard-driven rectangle selection (shift-click range, arrow-key extend) — the issue
  scopes this to the drag gesture; single-tap keyboard selection is unchanged (AC-6).
- Cross-row/column "select all" shortcuts, or selecting across a scrolled-off viewport.
- Editing anything other than tier/pool/price in batch (e.g. no batch move/remove).

## Behavior-parity ledger (retirement / replacement slices only)

> The slice changes one existing behavior: dragging on the per-set grid.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A mouse drag on the per-set grid pans the map (`dragPan` default `true`; #676) | **changed** | Select's own drag gesture is now the rectangle sweep, exactly the precedent `LayoutEditor`'s paint brush already set (`[dragPan]="false"` there too, #672). Panning by mouse-drag is no longer available while Select is armed; native touch/trackpad scrolling and the canvas's own slim scrollbar (shown whenever `dragPan` is off, per `BeachMapCanvas.scrollbarChrome`) remain. Two superseded e2e specs are rewritten to assert the new behavior instead: `operator-set-editing.e2e.ts`'s drag-pans test (now a sweep test) and `layout-editor.e2e.ts`'s `a drag-pannable map keeps its hidden scrollbar and its own hint wording` (now asserts the same `scrollbar-width: thin` + `cursor: auto` chrome the bulk paint grid already carries) — the latter was caught only by CI (#772), not the local scoped run, since it lived in a sibling spec file the initial change didn't touch. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A batch apply silently overwrites an untouched field on an unselected set because the PUT snapshot was built from stale/local state instead of the server's own `sets`. | low | high | The snapshot is built from the `sets` **input** (the parent's last map read), not from any locally-mutated copy; only ids in the swept selection get their touched fields overridden — unit-tested per field (AC-2). | agent | fixed-in-commit (this phase) |
| R-2 | The rectangle sweep and the bulk paint's own drag-paint gesture both listen on `document:mouseup`/`mousedown` and interfere when both editors mount (they don't — `mode()` renders exactly one of `SetEditor`/the paint grid). | low | low | `SetEditor`'s host listeners are scoped to `SetEditor`'s own instance; `LayoutEditor`'s stay on its own host; Angular's `@Component` host bindings are per-instance, not global. | agent | N/A — not a real risk, confirmed by reading both hosts |
| R-3 | Turning off `dragPan` on the per-set canvas regresses the #676 pan-then-click-suppression proof. | med | low | The click-suppression lives in `BeachMapCanvas` and only arms when `mouseDragPanAllowed()` is true; with `dragPan=false` it never arms, so the sweep's own click handling (not the canvas's) owns the distinction — proven by the rewritten e2e. | agent | fixed-in-commit (this phase) |
| R-4 | `expectedVersion` becomes a new **required** input on `SetEditor`; every existing test/call site that doesn't set it breaks the build. | high (by design) | low | Fixed at implementation: `layout-editor.html` passes `[expectedVersion]="loadedSetVersion()"`; every `SetEditor` spec's `render()` helper gets an `expectedVersion` parameter (defaulted) so existing suites keep compiling. | agent | fixed-in-commit (this phase) |

## Open questions / Assumptions

- **Assumption:** the batch selection persists (rather than auto-clearing) after a
  successful apply, mirroring the single-set inspector's own post-save behavior (the
  operator stays in the panel to make another change). The issue's ACs don't require
  auto-clear either way. — *Owner:* agent · *Resolves by:* this phase; revisit if review
  disagrees.
- **Assumption:** "row/position range" in the batch heading is derived from the swept
  rectangle's grid bounds (`Row A–B · positions 1–2`), not from the individual selected
  sets' own row labels, since a sweep can cross renamed rows. — *Owner:* agent · *Resolves
  by:* this phase.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice only changes how the operator edits a
venue's beach-map layout (tier/pool/price/position), never `set_availability` rows.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. The existing `venue` module's `PUT …/beach-map` endpoint,
`LayoutCommand` validation and `expectedVersion` optimistic-concurrency guard are reused
unchanged; no Java changes in scope.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` / `.html` | existing, extended | standalone component | signals + a new `linkedSignal` (`sweepIds`, keyed on `sets`, the same "account for previous state" shape as `selection`) | plain signal-bound inputs for the batch draft (tier/pool toggle buttons, a price text input) — not Signal Forms, matching the existing tier/pool toggle buttons beside it |
| FE-2 | `operator/layout-editor.ts` / `.html` | existing, extended | standalone component | new `[expectedVersion]` binding to `SetEditor`; new `(staleWrite)` handler reusing the existing `errorCode`/`reloadAfterStale()` machinery | N/A |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs — matches the surrounding code exactly, no deviation.

## FE↔BE contract

N/A — no contract change. The batch apply is a `PUT /api/venues/{id}/beach-map` request
built and sent exactly like `LayoutEditor.onSave()`'s existing one (`BeachMapLayoutRequest`:
`{ sets: LayoutCellRequest[], expectedVersion: number }`), just assembled from `SetEditor`'s
own `sets` input instead of the bulk paint grid.

## Execution status

**Stage pointer:** implement (phase 0 done) — ready for CI + review gate

**Next action:** commit, push to the designated branch, open the PR (draft), watch CI, then
run the review gate per `riviera-sdlc` `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Sweep gesture + batch apply + tests | ✅ | (this session's commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (`layout-editor.e2e.ts:613`) | Pre-existing test still asserted the per-set canvas was drag-pannable (hidden scrollbar + grab cursor); `[dragPan]="false"` now applies there too. | fixed-in-`658ab37` |
| F-2 | Sonar (quality gate) | New-code coverage 79.6% (< 80% required) + one MAJOR code smell (nested ternary in `sweepAnnouncement`). | fixed-in-`adf8ff5` (extracted the ternary, removed two provably-dead branches, added ~14 unit specs covering the sweep guard clauses and every batch-error-message branch) |
| F-3 | `/code-review` | `applyBatch()`'s completion handlers only guarded against a venue switch, not against the sweep having been cleared/replaced while the PUT was in flight — a stale response could stomp a newer, unsaved sweep. | fixed (added a `sweepIds() !== ids` check alongside the venue-switch guard on both the success and error paths; regression spec added) |
| F-4 | `/code-review` | `batchErrorMessage()` re-implements `LayoutEditor.errorMessage()`'s code→copy mapping rather than sharing it. | deferred — the two switch statements share a code but deliberately diverge on copy (batch points at editing one set at a time; the bulk save points at arming Select), so a blanket extraction would need to take the differing strings as parameters without reducing real complexity. A TSDoc note on `batchErrorMessage()` records why it stays separate. |

---

## File structure

- `frontend/src/app/operator/set-editor.ts` — sweep gesture, `sweepIds`/`batchDraft` state,
  `applyBatch()`/`clearSweep()`, `expectedVersion` input, `staleWrite` output.
- `frontend/src/app/operator/set-editor.html` — batch panel markup, sweep pointer handlers on
  the cell buttons, `[dragPan]="false"`, the sweep-count live region.
- `frontend/src/app/operator/layout-editor.ts` — `[expectedVersion]` wiring, `onBatchStaleWrite()`.
- `frontend/src/app/operator/layout-editor.html` — passes `[expectedVersion]`, binds
  `(staleWrite)`, renders `<app-stale-write-banner>` in `sets` mode too.
- `frontend/src/app/operator/set-editor.spec.ts` — `render()` gets an `expectedVersion` param;
  new sweep/batch-apply/escape/clear unit specs.
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — `render()` gets an `expectedVersion`
  param; a batch-panel axe state added.
- `frontend/e2e/operator-set-editing.e2e.ts` — rewrites the superseded pan-drag test into a
  sweep test; adds a batch-apply-in-one-PUT e2e + a STALE_WRITE-keeps-selection e2e.
- `frontend/e2e/layout-editor.e2e.ts` — rewrites the superseded drag-pannable-scrollbar test for
  the per-set canvas (`[dragPan]="false"` now applies there too).
- `docs/plans/editor-shell-s6-batch-select.md` — this plan doc.

---

## Phase 0 — Sweep gesture, batch apply, tests

**Files:** as listed in File structure.

- [ ] **Step 1: Write the failing unit specs** for the sweep-rectangle computation, the
  touched-field-only merge, and the STALE_WRITE keep-selection behavior in
  `set-editor.spec.ts`.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run set-editor` (from `frontend/`) →
  FAIL (new tests reference not-yet-added members).
- [ ] **Step 3: Minimal implementation** — the sweep gesture, `sweepIds`/`batchDraft`
  `linkedSignal`s, `applyBatch()`/`clearSweep()`, the batch panel template, the
  `expectedVersion` input + `staleWrite` output, and `LayoutEditor`'s wiring.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run set-editor layout-editor` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population "every `SetEditor`/a11y spec's
  `render()` helper" → enumerated via
  `git grep -n "function render(" frontend/src/app/operator/set-editor*.spec.ts` → 2 sites
  (`set-editor.spec.ts`, `set-editor.a11y.spec.ts`) → both given an `expectedVersion` param.
- [ ] **Step 6: Commit** — `git commit -m "Editor shell S6: batch select — sweep a block,
  apply tier/pool/price once (#714)"`.
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-23 | Phase 0 | Every spec that renders `SetEditor` and must now supply the new required `expectedVersion` input | `git grep -n "function render(" frontend/src/app/operator/set-editor*.spec.ts` | 2 (`set-editor.spec.ts`, `set-editor.a11y.spec.ts`) | both fixed in this phase's commit |
| 2026-08-23 | PR #772 CI (`layout-editor.e2e.ts:613` failed: expected `scrollbar-width: none`, got `thin`) | Every e2e assertion on the per-set canvas (`data-testid="set-grid"`) that still asserts the OLD `dragPan=true` chrome (hidden scrollbar / grab cursor), now that Select's canvas is `[dragPan]="false"` | `grep -rn "set-grid'" frontend/e2e frontend/src` then manually checked each hit for a scrollbar/cursor assertion | 1 (`layout-editor.e2e.ts`'s `a drag-pannable map keeps its hidden scrollbar…` test; the two other `set-grid` hits — `touch-targets.e2e.ts`, `set-editor.spec.ts` — assert only visibility/cell-count, not chrome) | rewritten to assert the new `scrollbar-width: thin` / `cursor: auto` chrome; verified locally (`layout-editor.e2e.ts` 12/12, `touch-targets*.e2e.ts` 32/32) before push |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-7:** verified by the specs/e2e named above. Locally: `npx ng test
  --watch=false` (1841/1841 passed, incl. the new `SetEditor (#714)` unit specs and the
  batch-panel axe spec) and `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright
  test -c playwright.a11y.config.ts operator-set-editing` (10/10 passed, incl. the two new
  batch-apply/STALE_WRITE e2e specs and the rewritten sweep e2e). CI re-runs both on the PR.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] No JPA introduced — N/A, no backend change.
- [x] Availability section filled (N/A, justified).
- [x] Pool + cutoff rules — N/A, no backend/availability change.
- [x] Modulith section filled (N/A, justified); no cross-module imports (frontend-only).
- [x] Payment/payout — N/A.
- [x] Frontend standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions resolved or explicitly assumed.
- [ ] Close-out written in THIS PR — pending merge; the PR's own last commit finalizes this.
- [ ] The review gate ran in full per the invocation ladder — pending: runs at PR
      ready-for-review per `riviera-sdlc` `references/pr-gates.md` §1.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
