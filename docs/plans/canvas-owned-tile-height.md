# Canvas-Owned Tile Height Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Make tile-row height identical to rail-cell height for every `appBeachMapRow`
consumer by construction — the canvas's own `[data-map-row]` wrapper carries the fixed
`h-[var(--riv-tile)]` and consumers size cells `h-full` — collapsing the four per-surface
#683 pins into one canvas-level contract.

**Architecture:** The #683 fix left the tile-height-equals-rail-height invariant enforced
by per-surface convention + per-surface spec pins; a future fifth consumer sizing tiles
any other way (e.g. `aspect-square`) would get no pin, render aligned in Chromium CI, and
reintroduce the iOS WebKit rail drift. Moving the fixed height onto the canvas's own row
wrapper makes the row rhythm canvas-owned: rails and row wrappers size from the *identical*
`h-[var(--riv-tile)]` declaration, so no consumer markup can desynchronize them. Consumers
fill the canvas-owned row with an explicit `h-full` chain (grid → cell), the shape the
Daily view's inner buttons already use.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables or migrations.

**Source of intent:** GitHub issue #685 (born from the review gate on PR #684 / issue #683).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue matches HEAD exactly, no in-flight overlap: open PRs are Dependabot-only) ·
`riviera-plan-doc` (this template — forced the parity ledger for a "refactor only" claim) ·
`tdd` (both contract specs written red before the template edits) · `riviera-review-overlay`
(review gate — at ready-for-review) · `riviera-docs-freshness` (ran over the slice diff —
0 findings: no substrate doc states the per-surface pin mechanism; #683's plan doc is
historical record, not current-state) · `riviera-frontend` (placement: canvas + reduced
helper stay in `shared/` and `src/testing/`; e2e suite split — mocked suite is the CI
net) · `riviera-tailwind` (utility idioms; keep `.set-tile`/marker classes inert for
specs+e2e; drift proven by rendered boxes, not class lists) · `riviera-local-debug`
(cloud recipes: Vitest scoped runs, `PW_CHROMIUM_EXECUTABLE` for the mocked Playwright
suite) · `angular-developer` + angular-cli MCP (v22 posture — template-only change, no
API surface touched) · `playwright-cli` N/A — no e2e spec is authored or modified; the
acceptance is that the existing nets hold verbatim.

**Branch:** `claude/issue-685-urxq1l` — the session's designated remote branch stands in
for `feature/canvas-owned-tile-height` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the canvas renders any consumer's rows, when the row wrappers, row-code
  rail cells, and price rail cells render, then every one of them carries the identical fixed
  `h-[var(--riv-tile)]` class and never `aspect-square` — so tile-row height equals rail-cell
  height for every consumer, by construction. *Pinned by:* `beach-map-canvas.spec.ts` — new
  test `sizes every row wrapper and rail cell from the identical fixed --riv-tile height (#685)`.
- [ ] **AC-2:** Given each of the four consumer surfaces renders its map, when its cells render,
  then every cell — and every element between the cell and the canvas's `[data-map-row]`
  wrapper — sizes via `h-full`, carrying no height mechanism of its own (no `aspect-square`,
  no per-cell `h-[var(--riv-tile)]`). *Pinned by:* the reduced shared helper
  `expectCellsFillCanvasRow` (`src/testing/beach-map-height.ts`), called from
  `venue-map.spec.ts`, `daily-view-tab.spec.ts`, `layout-editor.spec.ts`, `set-editor.spec.ts`.
- [ ] **AC-3:** Given the mechanism moves to the canvas, when the existing e2e nets run, then
  they hold verbatim — `venue-map-pan` (tile boundingBox pan math), `touch-targets`
  (daily view, per-set mode, bulk paint mode), `touch-targets-tourist` (venue-detail beach
  map) all measure the same rendered geometry. *Pinned by:* the unmodified specs passing in
  the mocked suite (locally + CI).

## Non-goals

- No rendered-geometry change: `--riv-tile: clamp(47px, 11vw, 56px)` and the tile box a user
  sees are identical before/after — this is a mechanism move, not a restyle.
- No behavior change on any surface (booking, painting, panning, keyboard, focus).
- No new e2e specs and no edits to existing ones (AC-3 is "hold verbatim").
- No change to the canvas's public API (`BeachMapCanvasRow`, `BeachMapRowDef`, inputs).
- Not touching the walk-in/premium/taken tile variants or any color/token.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice replaces the per-surface height *mechanism* — a "refactor only, no behavior
> change" claim, verified behavior-by-behavior:

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Rail cell and tile row render at the same height on every browser (#683) | preserved (strengthened) | rails AND row wrappers now share the one `h-[var(--riv-tile)]` declaration on the canvas; consumers can no longer diverge |
| Tile rendered box = `var(--riv-tile)` square (width from `grid-cols-[repeat(…,var(--riv-tile))]`, height fixed) | preserved | height now flows wrapper → `h-full` grid → `h-full` cell; same computed px |
| Tourist tile scroll-snap (`snap-start` on the `li`) | preserved | class untouched on the `li` |
| Zone gap (`mt-3`) applied identically to rails and rows | preserved | untouched — lives on the canvas wrapper + rail cells as before |
| `.set-tile` (+ `premium`/`walkin`/`taken`) marker classes queried by unit + e2e specs | preserved | inert markers stay on the same elements (riviera-tailwind rule 2) |
| 44 × 44 px touch floor on actionable tiles (`[appTouchTarget]` + measured sweeps) | preserved | directives untouched; rendered height unchanged; sweeps re-measure in AC-3 |
| Daily-view inner button/span `h-full w-full` fill | preserved | unchanged — it is the reference shape the whole slice adopts |
| Per-surface unit pin: cells use the fixed-height mechanism, never aspect-ratio (#683) | changed (reduced) | drift invariant moves to the canvas contract spec (AC-1); the per-surface pin shrinks to "cell fills the canvas-owned row" (AC-2) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `h-full` chain breaks somewhere (grid element left without a definite height) and cells collapse to content height | med | med | AC-2's helper walks the *whole* ancestor chain cell→wrapper asserting `h-full`; AC-3's touch-target sweeps measure the rendered box ≥ 44 px in a real browser | session | open |
| R-2 | WebKit resolves the new chain differently than Chromium (the #683 failure class re-entering) | low | high | the only fixed-height declaration left is the *identical* `h-[var(--riv-tile)]` class on rails and wrappers — the #683 root cause (two different sizing mechanisms) is structurally gone; no `aspect-ratio` remains anywhere in the map path | session | open |
| R-3 | An intermediate commit leaves a surface half-migrated (fixed wrapper + fixed cells, or neither) | low | low | phase order is additive: Phase 1 adds the wrapper height while cells still carry their own (equal heights, harmless); Phase 2 flips all four consumers + the helper in one commit | session | open |
| R-4 | A fifth mechanism consumer exists that the grep missed | low | med | negative confirmed per CLAUDE.md §Searching: `git ls-files` + grep for `appBeachMapRow` → exactly 4 consumer templates + canvas + canvas spec | session | closed — verified at plan time |

## Open questions / Assumptions

- **Assumption:** grid-item percentage heights (`h-full`) resolve identically across engines
  once the containing chain is definite (wrapper fixed → grid `h-full` → cell `h-full`) — the
  Daily view's inner buttons have shipped this exact shape since #683 with no WebKit report.
  — *Owner:* session · *Resolves by:* Phase 3 (e2e sweeps green) / real-device check by
  maintainer post-merge if desired.

## Availability & concurrency (invariant #2)

N/A — the slice touches the beach map's *rendering mechanism* only: no write path, no
availability read, no booking flow change. `availability(set_id, booking_date)` is not in
scope; no channel that writes it is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

All in the Angular frontend; no backend module touched, no boundary change. Within the
frontend taxonomy (riviera-frontend): the mechanism lands in `shared/beach-map-canvas.html`
(the canvas owns the shared chrome — height rhythm is chrome), the reduced pin helper stays
in `src/testing/` (shared test helper home), consumers keep only their own templates/specs.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beach-map-canvas.html` (+ `.spec.ts`) | existing | shared canvas template | none (class-only change) | N/A |
| FE-2 | `venue/venue-map.html` (+ `.spec.ts`) | existing | feature template | none (class-only change) | N/A |
| FE-3 | `operator/daily-view-tab.html` (+ `.spec.ts`) | existing | feature template | none (class-only change) | N/A |
| FE-4 | `operator/layout-editor.html` (+ `.spec.ts`) | existing | feature template | none (class-only change) | N/A |
| FE-5 | `operator/set-editor.html` (+ `.spec.ts`) | existing | feature template | none (class-only change) | N/A |
| FE-6 | `src/testing/beach-map-height.ts` | existing | shared spec helper | N/A | N/A |

**Standards:** template-only utility-class changes; no component API, signal, or form is
touched. Tailwind idioms per `riviera-tailwind` (arbitrary value `h-[var(--riv-tile)]`,
`h-full`; marker classes kept inert).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement (phase 2)

**Next action:** Phase 2 — rewrite `beach-map-height.ts` as the reduced
`expectCellsFillCanvasRow` (red), then flip the four consumer templates to `h-full`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | e649a30 |
| 1 — canvas-level height contract | ✅ | (this commit) |
| 2 — consumers to `h-full` + reduced helper | | |
| 3 — verification sweep + gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/canvas-owned-tile-height.md` — this plan.
- `frontend/src/app/shared/beach-map-canvas.html` — the `[data-map-row]` wrapper gains
  `h-[var(--riv-tile)]` (the canvas-owned row height).
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — the canvas-level contract spec (AC-1).
- `frontend/src/testing/beach-map-height.ts` — `expectCellsMatchRailHeight` becomes the
  reduced `expectCellsFillCanvasRow` (AC-2 chain walk).
- `frontend/src/app/venue/venue-map.html` — grid `h-full`; `li.set-tile`
  `h-[var(--riv-tile)]` → `h-full`.
- `frontend/src/app/venue/venue-map.spec.ts` — pin call + title updated to the reduced contract.
- `frontend/src/app/operator/daily-view-tab.html` — grid `h-full`; `li.set-tile`
  `h-[var(--riv-tile)]` → `h-full`.
- `frontend/src/app/operator/daily-view-tab.spec.ts` — pin call + title updated.
- `frontend/src/app/operator/layout-editor.html` — grid `h-full`; cell button
  `h-[var(--riv-tile)]` → `h-full`.
- `frontend/src/app/operator/layout-editor.spec.ts` — pin call + title updated.
- `frontend/src/app/operator/set-editor.html` — grid `h-full`; cell button
  `h-[var(--riv-tile)]` → `h-full`.
- `frontend/src/app/operator/set-editor.spec.ts` — pin call + title updated.

---

## Phase 1 — Canvas-level height contract

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.spec.ts` ·
Modify `frontend/src/app/shared/beach-map-canvas.html:43`

- [ ] **Step 1: Write the failing test** — in `beach-map-canvas.spec.ts`, assert every
  `[data-map-row]` wrapper, every row-code rail cell (the `row-code` chip's parent), and
  every price rail cell (`price-col` child) carries `h-[var(--riv-tile)]` and never
  `aspect-square`.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run --project frontend
  src/app/shared/beach-map-canvas.spec.ts` (or `npm test -- <filter>`) → FAIL on the
  wrapper assertion.
- [ ] **Step 3: Minimal implementation** — `beach-map-canvas.html` line 43: the
  `[data-map-row]` div gains `class="h-[var(--riv-tile)]"`. (Additive: consumer cells still
  carry their own equal fixed height, so nothing changes visually and the four #683 pins
  still pass.)
- [ ] **Step 4: Run it, verify it passes** — same command → PASS; then the four consumer
  specs (venue-map, daily-view-tab, layout-editor, set-editor) → still PASS.
- [ ] **Step 5: Generalization-audit pass** — N/A, no bug fixed (mechanism introduction;
  the population sweep happened at plan time, R-4).
- [ ] **Step 6: Commit** — `Own the beach-map tile-row height on the canvas wrapper (#685)`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Consumers fill the canvas-owned row; reduced helper

**Files:** Modify `frontend/src/testing/beach-map-height.ts` · the four consumer templates ·
their four specs.

- [ ] **Step 1: Write the failing test** — rewrite the helper as
  `expectCellsFillCanvasRow(host, cellSelector)`: rails still carry `h-[var(--riv-tile)]`
  (unchanged canvas fact); every matched cell carries `h-full`, and neither `aspect-square`
  nor `h-[var(--riv-tile)]`; every element strictly between the cell and its enclosing
  `[data-map-row]` wrapper carries `h-full`. Update the four spec call sites + test titles
  (`#683` → `#685` reduced-contract wording).
- [ ] **Step 2: Run it, verify it fails** — the four consumer specs → FAIL (cells still
  carry the old fixed height, grids lack `h-full`).
- [ ] **Step 3: Minimal implementation** — flip the four templates: each consumer's grid
  element (`ul`/`div`) gains `h-full`; each cell's `h-[var(--riv-tile)]` becomes `h-full`
  (venue-map `li`, daily-view `li`, layout-editor button, set-editor button). Inner
  daily-view/venue-map buttons already `h-full` — untouched.
- [ ] **Step 4: Run it, verify it passes** — the four consumer specs + canvas spec → PASS;
  then the full unit suite once (`npm test`) as the end-of-phase regression.
- [ ] **Step 5: Generalization-audit pass** — population: every `appBeachMapRow` consumer
  template (mechanism: projects a tile row into the canvas). Enumerate:
  `git grep -l appBeachMapRow -- 'frontend/src/**'` → canvas + 4 templates (+ canvas spec).
  Decision: all 4 flipped in this phase; log below.
- [ ] **Step 6: Commit** — `Fill the canvas-owned row height from every map surface (#685)`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 3 — Verification sweep + gates

- [ ] `npm run lint` + `npm run format:check` green.
- [ ] Full unit suite green (`npm test`).
- [ ] Mocked e2e (cloud recipe `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
  npm run test:e2e:a11y -- <spec>`): `venue-map-pan`, `touch-targets`,
  `touch-targets-tourist`, `layout-editor`, `operator-daily`, `operator-set-editing` —
  all verbatim-green (AC-3).
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` green (plan staged).
- [ ] Draft PR → CI green → ready for review → review gate (`/code-review` +
  `riviera-review-overlay`) → Sonar gate (issue list pulled, not just pass/fail) →
  merge close-out per `references/pr-gates.md`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | plan (R-4) | templates projecting a tile row into the canvas (`appBeachMapRow`) | `git grep -l appBeachMapRow -- frontend/src` | canvas + venue-map, daily-view-tab, layout-editor, set-editor (+ canvas spec host) | all four flipped in Phase 2; no fifth consumer exists |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run the canvas spec → the #685 contract test passes. Verified at commit `<sha>`.
- [ ] **AC-2:** Run the four consumer specs → the reduced pin passes on all four. Verified at commit `<sha>`.
- [ ] **AC-3:** Run the listed mocked e2e specs unmodified → green. Verified at commit `<sha>` + the PR's CI run.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (no data path touched).
- [ ] Pool + cutoff rules honored — N/A, rendering only.
- [ ] **Modulith** section N/A — frontend-only.
- [ ] **Payment/payout** N/A.
- [ ] Refund policy — N/A.
- [ ] Timezone — N/A.
- [ ] Booking codes — N/A.
- [ ] Flyway — N/A.
- [ ] **Frontend** standards met; no `as any`; marker classes kept inert.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — invocation ladder + `riviera-review-overlay`.
