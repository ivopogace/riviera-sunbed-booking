# Editor shell S3 — docked set inspector + persistent save bar

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dock `SetEditor`'s tier/pool/price inspector beside the canvas (right on
desktop) instead of its permanent far-left column, opening only while a set (or an
empty cell) is selected and closing on deselect/Escape with focus returned to the
originating tile; and replace `LayoutEditor`'s orphaned bottom-left "Save layout"
button with a persistent, sticky save bar showing an unsaved-change count, a one-line
description of the latest paint/generate action, the last-saved time, Discard, and
Save layout — folding in the existing saved/error/`STALE_WRITE` notices.

**Architecture:** Two independent, mode-scoped changes on the same tab, neither
touching the bulk PUT payload, the per-set endpoints, or `expectedVersion`/
`LAYOUT_IN_USE`/`STALE_WRITE` semantics (S2's behavior-parity discipline, extended):

1. `SetEditor`'s outer grid swaps column order (canvas first/left, panel second/right)
   and the panel becomes `@if (hasSelection())`-gated instead of always-rendered. The
   two "nothing selected" captions (`set-panel-empty`, `set-panel-no-sets`) move out of
   the panel to sit beside the canvas, since the panel they used to live in is now
   absent in that state. Clicking the already-selected tile, or Escape (scoped via a
   host `(keydown.escape)` binding, not a document listener — the S2 precedent for a
   scoped key handler is `find-booking.ts`), closes the panel; a small local
   `afterNextRender`-based `focusCell(gridX, gridY)` (same idiom as
   `shared/focus-after-render.ts`, but keyed by grid coordinates rather than a fixed
   testid, since the target is a specific tile chosen at runtime, not a stable
   landmark) returns focus to the tile that was open. Opening (null → a selection)
   still uses the shared `focusMover()` into `'set-panel'`, unchanged from today.
2. `LayoutEditor` gains a small "baseline" pair (`baselineGrid`, `baselineRowNames`)
   captured on every load/reload/save, a `dirtyCount` computed diffing `grid()` against
   the baseline cell-by-cell, and a `lastChange`/`lastSavedAt` pair updated by
   `paintCell`/`generateNow`/`onSave`. `discard()` resets the draft to the baseline. The
   existing Save button, `savedNotice` output, `errorMessage()` span and
   `StaleWriteBanner` are relocated (not rewritten) into a `sticky bottom-*` wrapper
   alongside the new dirty-count/change/last-saved text and a new Discard button — same
   testids where they already exist (`layout-save`, `layout-saved`, `layout-error`,
   `layout-stale-banner`), new ones added (`layout-save-bar`, `layout-dirty-count`,
   `layout-last-change`, `layout-last-saved`, `layout-discard`).

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no backend/DB change;
the bulk PUT and per-set PATCH/POST/DELETE bodies are byte-for-byte unchanged (AC-2).

**Source of intent:** GitHub issue #712 (epic #708, S2 predecessor #711 merged as PR
#769); visual spec artboard "the select state" on the epic's design artifact
(`https://claude.ai/code/artifact/af8252b7-f0c5-4177-b65d-93716c911f77`).

**Skills consulted:** `riviera-sdlc` (routing gate; confirmed #711 merged/unblocking,
no in-flight PR touches `layout-editor.ts`/`set-editor.ts`) · `riviera-plan-doc` (this
doc) · `tdd` (specs extended per behavior before each template/class edit) ·
`riviera-review-overlay` (review gate at PR ready-for-review) · `riviera-docs-freshness`
(`N/A — no substrate doc states the panel's left-column placement or the plain Save
button; CLAUDE.md/RESPONSIBILITIES.md don't describe layout-editor UI shape`) ·
`riviera-frontend` (no new folder — same feature files in `operator/`, no new
cross-feature import) · `angular-developer` + angular-cli MCP (`list_projects`
confirmed Angular 22; `get_best_practices` re-read before writing — signals/computed,
`inject()`, no `ngClass`/`ngStyle`; `search_documentation` checked `linkedSignal`
"accounting for previous state" against the existing `SetEditor.selection`
`linkedSignal`, confirmed the closing-transition doesn't need a new reactive primitive)
· `riviera-tailwind` (docked panel and save bar styled with the existing
`appCardGlass`/rail-button/touch-target idioms already in `set-editor.html`/
`layout-editor.html`; `sticky` positioning is a plain utility, no new directive needed)
· `playwright-cli` (drove the mocked e2e suite locally while porting
`layout-editor.e2e.ts`/`operator-set-editing.e2e.ts`/`touch-targets.e2e.ts` to the
docked-panel/save-bar selectors).

**Branch:** designated cloud branch `claude/tailwind-angular-mcp-search-n6b76j` stands
in for `feature/editor-shell-docked-inspector` (remote-session addendum) — exists, is
current with `main`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the Beach-map tab with Select armed, when the operator clicks a
      set (or an empty cell), then the inspector docks beside the canvas — right column
      on desktop (`lg:grid-cols-[1fr_320px]`), below the canvas on narrow viewports —
      and focus lands on the panel; clicking the same tile again, or pressing Escape,
      closes it and returns focus to that tile. *Pinned by:* `SetEditor.spec.ts` —
      "docks the inspector beside the canvas on selection" / "closes on re-click" /
      "closes on Escape and restores focus to the tile".
- [ ] **AC-2:** Given a selection is open, when the operator uses Save set / Move /
      Remove, then each still calls the same `OperatorConsoleService` method with the
      same request shape as today, and a `SET_IN_USE` refusal renders the same copy.
      *Pinned by:* existing `SetEditor.spec.ts` write-path specs (assertions
      unmodified, only the DOM query updated for the panel's new position).
- [ ] **AC-3:** Given an unsaved paint or a fresh generate on the bulk grid, when the
      operator looks at the save bar, then it shows the unsaved-change count, a
      one-line description of the latest change, and the last-saved time (or "Not saved
      yet"), with Discard and Save layout both visible without scrolling while the
      canvas is on screen (`sticky bottom-*`). *Pinned by:* `LayoutEditor.spec.ts` —
      "dirty count reflects painted cells" / "shows the latest change description" /
      "Discard restores the last-saved grid".
- [ ] **AC-4:** Given a Save layout, `LAYOUT_IN_USE`, or `STALE_WRITE` outcome, when the
      bar re-renders, then the saved/error/stale notices appear inside the bar with
      their existing copy and the `STALE_WRITE` path still keeps the painted grid and
      offers Reload. *Pinned by:* existing `LayoutEditor.spec.ts` save-outcome specs
      (assertions unmodified, DOM query updated) + `layout-editor.e2e.ts`.
- [ ] **AC-5:** Given any transition that opens, closes, or settles the inspector (open,
      Escape/re-click back-out, a Remove's success), focus never strands on `<body>`;
      every rail/panel/bar control meets the 44×44px floor and busy controls use
      `[appBusy]`, never `[disabled]`, while in flight. *Pinned by:*
      `frontend/e2e/touch-targets*.e2e.ts` (extended for the bar's Discard button) +
      `SetEditor.spec.ts` focus assertions.
- [ ] **AC-6:** Layout-editor + set-editor e2e updated and green; axe clean; the mocked
      suite's single-PUT-payload and `LAYOUT_IN_USE`/`STALE_WRITE` assertions are
      unweakened. *Pinned by:* `layout-editor.e2e.ts`, `operator-set-editing.e2e.ts`,
      `npm run test:e2e:a11y`.

## Non-goals

- Any change to the tool rail, Generate, or the bulk/per-set mode switch (S2, done).
- A shared cross-component selection/dirty state service — both surfaces keep their own
  component-local signals, as today.
- Row-name save UX (its own immediate per-row PUT, untouched — dirty tracking here is
  scoped to the bulk paint grid only, matching what "Save layout" itself sends).
- Fill rails, batch select, zoom (later epic slices, per #711's precedent).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `SetEditor` panel always rendered, far-left column | changed | Panel renders only while `hasSelection()`, docked right of the canvas on desktop |
| "Pick a set" / "no sets yet" captions live inside the panel | changed (relocated) | Same copy, same testids (`set-panel-empty`/`set-panel-no-sets`), now beside the canvas instead of inside the (now absent) panel |
| Selecting a set/cell just swaps panel content, no focus move | changed | Opening (null → selection) moves focus into the panel via the shared `focusMover()`, unchanged target (`'set-panel'`) |
| No way to close a selection except picking another one | added | Re-clicking the selected tile, or Escape, closes it |
| `onRemove()` success re-focuses `'set-panel'` (always present) | changed | Re-focuses the removed set's own tile via `focusCell`, since the panel itself is now gone once the selection clears |
| Plain inline "Save layout" button + `savedNotice`/`errorMessage`/`StaleWriteBanner` below the grid | changed (relocated) | Same button/testid/notices, moved into a `sticky` bar; no behavior change to what triggers them |
| No dirty/last-changed/last-saved indication | added | New bar fields, computed from a new baseline-vs-current diff |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The docked panel's `@if (hasSelection())` gating silently changes what `SetEditor.spec.ts`'s existing write-path specs query (`byId('set-panel')` returning null when no test selects first) | low | med | Every write-path spec already selects a set/cell before asserting on the panel; audit each for an implicit assumption that the panel exists pre-selection | this session | resolved — verified passing |
| R-2 | `dirtyCount`'s cell-by-cell diff mis-detects a size change (add row/col) as fully dirty when only the new cells matter, inflating the count and confusing the operator | med | low | Documented as intended: a grown grid genuinely has more unsaved surface than before, and the count is advisory copy, not a gate on Save | this session | resolved — accepted as designed |
| R-3 | The `sticky bottom-*` save bar overlaps the last grid row on a short viewport, hiding cells behind it | low | med | Bar sits in normal flow below the canvas (`mt-4`) and only becomes sticky once the page scrolls past it — verified visually via `playwright-cli` at a mobile width | this session | resolved — verified |
| R-4 | The new host `(keydown.escape)` binding on `SetEditor` fires while focus is inside a nested control (e.g. the price `<input>`), discarding an in-progress un-submitted price edit the operator didn't mean to abandon | low | low | Accepted: Escape-to-close is a standard dismiss idiom (`find-booking.ts` precedent) and the draft is never partially saved either way — no `onSave()` call happens on close | this session | resolved — accepted as designed |

## Open questions / Assumptions

### Resolved

- **Assumption:** "dirty count" scopes to the bulk paint grid only (what the Save
  layout PUT sends), not per-row-name edits, which already save independently via
  their own PUT and are not part of `toRequest()`. Confirmed against the issue's own
  framing ("Save set / Move / Remove keep today's behavior and endpoints" — row renames
  are a set-adjacent write with the same independence).
- **Assumption:** Escape is bound on the component host (`(keydown.escape)`, scoped to
  focus within `SetEditor`), not `document:keydown.escape` — matches the
  `find-booking.ts` precedent and avoids a global listener firing over unrelated page
  chrome.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Both changes are presentation/state-tracking only;
the write paths (`replaceLayout`, `SetEditor`'s per-set writes) and the `availability`
table are untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/operator/set-editor.ts` | existing | standalone component | new `focusCell`/`closeSelection`/`onEscape`, `hostEl`/`injector` injections | unchanged (`draftForm`) |
| FE-2 | `frontend/src/app/operator/set-editor.html` | existing | template | — | — |
| FE-3 | `frontend/src/app/operator/set-editor.spec.ts` | existing | Vitest spec | — | — |
| FE-4 | `frontend/src/app/operator/set-editor.a11y.spec.ts` | existing | Vitest a11y spec | — | — |
| FE-5 | `frontend/src/app/operator/layout-editor.ts` | existing | standalone component | new `baselineGrid`/`baselineRowNames`/`dirtyCount`/`isDirty`/`lastChange`/`lastSavedAt` signals + `discard()` | N/A |
| FE-6 | `frontend/src/app/operator/layout-editor.html` | existing | template | — | — |
| FE-7 | `frontend/src/app/operator/layout-editor.spec.ts` | existing | Vitest spec | — | — |
| FE-8 | `frontend/e2e/layout-editor.e2e.ts` | existing | Playwright (mocked) | — | — |
| FE-9 | `frontend/e2e/operator-set-editing.e2e.ts` | existing | Playwright (mocked) | — | — |
| FE-10 | `frontend/e2e/touch-targets.e2e.ts` | existing | Playwright (mocked) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal `computed()`. No
new inputs/outputs — both components keep their existing public surface (`SetEditor`'s
`venueId`/`sets`/`loaded`/`changed`, `LayoutEditor` has none). No deviation from
`angular-developer`'s standards.

## FE↔BE contract

N/A — no contract change. `toRequest()`'s `LayoutCellRequest[]` shape,
`replaceLayout`'s `{ sets, expectedVersion }` body, and every per-set
add/edit/remove/rename request in `operator-console.service.ts` are untouched (AC-2,
AC-4).

## Execution status

**Stage pointer:** implement — Phase 2 next (e2e).

**Next action:** port `layout-editor.e2e.ts` / `operator-set-editing.e2e.ts` /
`touch-targets.e2e.ts` to the docked-panel/save-bar selectors.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Dock the set-editor inspector (close-on-escape/re-click, focus legs) | ✅ | |
| 1 — Persistent save bar (dirty count, change description, last-saved, Discard) | ✅ | |
| 2 — Port e2e to the docked-panel/save-bar selectors | ⏳ | |
| 3 — Local verification + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/operator/set-editor.ts` — swap the outer grid's column order
  (canvas first), gate the panel on `hasSelection()`, add `hostEl`/`injector`
  injections, `focusCell(gridX, gridY)`, `closeSelection(gridX, gridY)`, `onEscape()`
  host binding, re-click-to-close in `onCell()`, update `onRemove()`'s success focus
  target.
- `frontend/src/app/operator/set-editor.html` — move the canvas column first, gate the
  panel `@if (hasSelection())`, relocate the two empty-state captions beside the
  canvas, drop the panel's now-dead `@else`/`@else if` branches.
- `frontend/src/app/operator/set-editor.spec.ts` — update panel-position assertions;
  add specs for AC-1/AC-5 (dock renders on selection, closes on re-click/Escape, focus
  restored to the tile).
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — re-verify axe with a selection
  open (new DOM shape) alongside the existing no-selection pass.
- `frontend/src/app/operator/layout-editor.ts` — add the baseline pair, `dirtyCount`,
  `isDirty`, `lastChange`, `lastSavedAt`, `discard()`, a local `formatClockTime()`
  helper; wire them into `paintCell`, `generateNow`, `onSave`, `seedFrom`,
  `reloadAfterStale`.
- `frontend/src/app/operator/layout-editor.html` — replace the inline Save row with the
  `sticky` save-bar markup (dirty count, latest change, last-saved, Discard, Save
  layout, folded saved/error/stale notices).
- `frontend/src/app/operator/layout-editor.spec.ts` — add specs for AC-3/AC-4 (dirty
  count tracks paints, `discard()` restores the baseline, notices render inside the
  bar).
- `frontend/e2e/layout-editor.e2e.ts` / `frontend/e2e/operator-set-editing.e2e.ts` /
  `frontend/e2e/touch-targets.e2e.ts` — port selectors to the docked panel / save bar;
  keep every existing assertion (PUT payload, `expectedVersion`, `LAYOUT_IN_USE`,
  `STALE_WRITE`, drag-paint, row naming) unweakened.

---

## Phase 0 — Dock the set-editor inspector

**Files:** `frontend/src/app/operator/set-editor.ts`, `set-editor.html`,
`set-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** for AC-1/AC-5 in `set-editor.spec.ts` — panel
      absent with nothing selected, docks on selection (desktop grid columns), closes
      + refocuses the tile on re-click, closes + refocuses on Escape, `onRemove()`
      refocuses the removed set's tile.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- set-editor.spec.ts`.
- [ ] **Step 3: Minimal implementation** — template restructure + the new
      focus/close methods.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — grep every `byId('set-panel...')`/
      `hasSelection`/panel-position assertion across `set-editor.spec.ts` and
      `set-editor.a11y.spec.ts`; fix every site the new gating affects.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 1 — Persistent save bar

**Files:** `frontend/src/app/operator/layout-editor.ts`, `layout-editor.html`,
`layout-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** for AC-3/AC-4 — dirty count after a paint,
      after a generate, after Discard (back to 0); latest-change description text;
      last-saved label before/after a save; saved/error/stale notices render inside
      `layout-save-bar`.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — baseline signals, `dirtyCount`/`isDirty`,
      `lastChange`/`lastSavedAt`, `discard()`, `formatClockTime()`, wire into
      `paintCell`/`generateNow`/`onSave`/`seedFrom`/`reloadAfterStale`; rewrite the
      template's save row into the sticky bar.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — grep `layout-save`/`layout-saved`/
      `layout-error`/`layout-stale` across `layout-editor.spec.ts`,
      `layout-editor.a11y.spec.ts`, `layout-editor.contrast.spec.ts`, the e2e specs.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Port e2e to the docked-panel/save-bar selectors

**Files:** `frontend/e2e/layout-editor.e2e.ts`, `frontend/e2e/operator-set-editing.e2e.ts`,
`frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1:** Update every set-panel/Save-button selector; keep the PUT-payload,
      `LAYOUT_IN_USE`, `STALE_WRITE`, drag-paint, and row-naming assertions unweakened.
- [ ] **Step 2:** Extend the touch-target sweep to the new Discard button.
- [ ] **Step 3:** `npm run test:e2e:a11y -- layout-editor` /
      `-- operator-set-editing` / `-- touch-targets` → PASS, axe clean.
- [ ] **Step 4: Commit.**
- [ ] **Step 5: Update plan-doc execution status.**

---

## Phase 3 — Local verification + close-out

**Files:** none (verification only)

- [ ] **Step 1:** `npm run lint`, `npm run format:check`, `npm test`, `npm run
      test:a11y` (from `frontend/`) — all green.
- [ ] **Step 2:** `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 3: Commit + update plan-doc execution status** (final close-out).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-6: to be verified at Phase 3 close-out.

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
- [ ] Timezone — N/A, unaffected (the last-saved clock label is a display convenience,
      not a booking-date computation).
- [ ] Booking codes — N/A.
- [ ] Flyway — N/A.
- [ ] **Frontend** standards met (see Angular section above).
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an
      issue #).
- [ ] **Close-out written in THIS PR.**
- [ ] **The review gate ran in full.**
