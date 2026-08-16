# Daily-View Tile Position Numbers Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every daily-view tile shows its set's position number so an operator can locate
"B4" at a glance (row from the rail chip, position from the tile), with the state
glyph (`✓`/`●`) still visibly distinguishing marked/locked tiles.

**Architecture:** Tile content only — the tourist map's affordance (`positionNo` on the
tile, price on the per-zone rail chip) applied to the daily view, whose canvas already
renders the same rails. The FREE tile's visible price glyph (#672) is replaced by the
position number; the price stays visible on the zone rail and audible in the tile's
`aria-label`. The state glyph becomes a nullable prefix (`stateGlyph`) rendered beside
the always-present number, so state stays glyph + fill, never colour-only.

**Persistence:** N/A — frontend-only; no table, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #686 (maintainer request, alongside the #683 close-out).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
stale "blank when free" premise: FREE tiles show the price since #672, and confirmed #685
already merged, so the canvas height contract is inherited untouched) · `riviera-plan-doc`
(this template — forced the parity ledger row that makes the price-glyph replacement an
explicit decision, and the locked-tile contrast obligation) · `tdd` (unit assertions on
tile text go red first) · `riviera-review-overlay` (review gate — at ready-for-review) ·
`riviera-docs-freshness` (N/A — no substrate doc states the tile glyph vocabulary; checked
CLAUDE.md/RESPONSIBILITIES.md) · `riviera-frontend` (placement: all edits stay in the
`operator/` feature folder + its CI-safe e2e; no new files, no import-direction change) ·
`riviera-tailwind` (number at `text-[12.5px] font-bold` mirroring the tourist tile; kept
`.set-tile` + `data-state` test hooks; no new SCSS) · `angular-developer` + angular-cli
MCP (v22 posture: signals untouched, `@if` prefix rendering, aria-hidden visual +
accessible-name pattern preserved) · `riviera-local-debug` (scoped Vitest runs; mocked e2e
via `PW_CHROMIUM_EXECUTABLE`) · `playwright-cli` (e2e assertion authoring in the existing
CI-safe `operator-daily.e2e.ts`).

**Branch:** `claude/issue-686-grrm4y` — the cloud session's designated remote branch
stands in for `feature/daily-tile-position-numbers` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the daily grid is loaded, when a set is FREE, then its tile's
  visible text is the set's position number (and no longer the price — the price remains
  on the zone rail chip and in the tile's accessible name). *Pinned by:*
  `daily-view-tab.spec.ts` — "shows each set's position number on its tile (#686)".
- [ ] **AC-2:** Given a set is STAFF_MARKED, when its tile renders, then the tile shows
  the `✓` state glyph AND the position number. *Pinned by:* same spec, marked-tile
  assertion.
- [ ] **AC-3:** Given a set is BOOKED_ONLINE (locked), when its tile renders, then the
  tile shows the `●` state glyph AND the position number, and the sr-only accessible name
  still names the state (not colour-only). *Pinned by:* same spec, locked-tile assertion +
  `daily-view-tab.a11y.spec.ts` (axe, unchanged).
- [ ] **AC-4:** Given the locked tile's number is meaningful ink over the striped fill,
  when composited over the wash's worst-case stops, then it meets WCAG AA. *Pinned by:*
  `daily-view-tab.contrast.spec.ts` — new locked-tile-number test.
- [ ] **AC-5:** Given a wide venue on a 390px viewport, when the daily grid renders with
  numbers, then every actionable tile still meets the 44px touch-target floor and the
  grid still scrolls in-frame. *Pinned by:* `operator-daily.e2e.ts` (#605 tests, must stay
  green) + `touch-targets.e2e.ts` daily-view sweep.

## Non-goals

- No change to the tile height mechanism (#685 owns it — canvas-level contract inherited).
- No change to availability semantics, tap behavior, or any write path (invariants #2/#3
  untouched — display only).
- No change to the tourist map, layout editor, or per-set editor tiles.
- No re-introduction of a per-tile price text anywhere (the zone rail owns visible price).

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| FREE tile renders the formatted price as its glyph (#672) | changed | Renders the position number instead — the issue's desired affordance is the tourist map's, where the tile carries the number and the per-zone rail chip carries the price; the daily canvas renders that same price rail, and the `aria-label` keeps price for AT. Surfaced explicitly in the PR for maintainer veto. |
| STAFF_MARKED tile renders `✓` (white on `#0a6e85`) | preserved | `✓` stays, now beside the number; same fill/ink, existing contrast test covers it. |
| BOOKED_ONLINE tile renders `●` on the striped fill | preserved | `●` stays, now beside the number; stays `aria-hidden` decorative. |
| Locked tile's sr-only text names the state (not colour-only) | preserved | Untouched — `tileLabel` unchanged; number spans are `aria-hidden`. |
| Actionable tile is a labelled `<button>` with `aria-label` = row, position, tier, price, action | preserved | `tileLabel` unchanged. |
| `.set-tile`, `data-testid="daily-tile"`, `data-set-id`, `data-state` test hooks | preserved | Untouched (riviera-tailwind rule 2). |
| 44px touch-target floor via `appTouchTarget` | preserved | Button attrs untouched; e2e sweeps re-measure. |
| Tile fills the canvas-owned row height (#685) | preserved | No height/layout mechanism touched; `expectCellsFillCanvasRow` spec still pins it. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Locked-tile number fails AA over the striped fill's dark stripe on a wash stop | low | med | Prove by composited-contrast test (worst-case stripe `rgba(12,42,51,0.28)` over every `WASH_STOPS` entry) before shipping | session | open |
| R-2 | Dropping the FREE-tile price reads as a regression to the maintainer | low | low | Parity-ledger row + explicit PR callout; price remains on the rail + aria-label; trivially revertable | session | open |
| R-3 | Two text nodes (glyph + number) disturb centering/fit in the 47–56px tile | low | low | Flex + gap on both tile variants; number at 12.5px matches the tourist tile that fits the same `--riv-tile` box; e2e touch/clip sweeps re-measure | session | open |

## Open questions / Assumptions

- **Assumption:** The maintainer intends the tourist-map affordance literally — number on
  the tile, price on the rail — so the FREE tile's price glyph is replaced, not joined.
  Grounds: issue #686 "same affordance the tourist map already has"; the issue's premise
  that free tiles are blank shows the price glyph was not a considered constraint. —
  *Owner:* session · *Resolves by:* PR description surfaces it for cheap veto.

## Availability & concurrency (invariant #2)

N/A — display-only change to tile content; no write path, claim, or state derivation is
touched. `deriveTileStates`, `tileTapAction`, mark/release round-trips all untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (Visible price moves off the FREE tile, but pricing data,
formatting (`formatMoney`), and every money computation are untouched.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/daily-view-tab.ts` + `.html` | existing | standalone component | signals (untouched); `stateGlyph` replaces `tileGlyph` | none |

**Standards:** no deviation — template-only rendering change with `@if` alias binding;
`aria-hidden` visual text + accessible-name pattern preserved.

## FE↔BE contract

N/A — no contract change (`SetView.positionNo` already delivered and consumed).

## Execution status

> **This section is the session-recovery anchor.**

**Stage pointer:** implement (phase 2)

**Next action:** extend `operator-daily.e2e.ts` with tile-number assertions
(load `playwright-cli` first), then run the scoped checks.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc committed | ✅ | `88e789c` |
| 1 — tile content (unit + contrast TDD, template + component) | ✅ | see phase-1 commit |
| 2 — e2e assertions + full frontend verification | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/daily-tile-position-numbers.md` — this plan.
- `frontend/src/app/operator/daily-view-tab.html` — tile content: state-glyph prefix +
  position number on both tile variants; flex/gap centering.
- `frontend/src/app/operator/daily-view-tab.ts` — `tileGlyph` → nullable `stateGlyph`;
  TSDoc updated.
- `frontend/src/app/operator/daily-view-tab.spec.ts` — new tile-text assertions; doc
  comment updated.
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — FREE-tile test re-scoped
  to the number (same pair); new locked-tile-number AA test; header comment updated.
- `frontend/e2e/operator-daily.e2e.ts` — tile-number assertions in the tile-states test.

---

## Phase 1 — Tile content (TDD)

**Files:** Modify `daily-view-tab.html`, `daily-view-tab.ts`, `daily-view-tab.spec.ts`,
`daily-view-tab.contrast.spec.ts`

- [ ] **Step 1: Write the failing unit test** — tile text per state (number always;
  `✓`/`●` prefix for marked/locked; no `€` on the FREE tile).
- [ ] **Step 2: Run it, verify it fails** — scoped Vitest run on
  `daily-view-tab.spec.ts` → FAIL on the new assertions.
- [ ] **Step 3: Minimal implementation** — `stateGlyph` + template spans + classes.
- [ ] **Step 4: Run the operator daily-view specs (unit + contrast + a11y), verify pass.**
- [ ] **Step 5: Generalization-audit pass** — sweep the "surface projects tiles into
  `app-beach-map-canvas`" population for missing tile identity; record below.
- [ ] **Step 6: Commit** — `git commit -m "<imperative subject> (#686)"`.
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — e2e + verification

- [ ] **Step 1: Extend `operator-daily.e2e.ts`** tile-states test with number assertions
  (load `playwright-cli` first).
- [ ] **Step 2: Run scoped checks** — lint, format:check, unit tests, mocked e2e
  (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`, scoped to the
  operator-daily + touch-targets specs).
- [ ] **Step 3: `node scripts/check-plan-file-structure.mjs --diff origin/main`** → pass.
- [ ] **Step 4: Commit + push; PR ready for review.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | Phase 1 (pattern: on-tile set identity) | Every surface projecting tiles into the shared canvas | `grep -rl "app-beach-map-canvas" src/app --include='*.html'` | `venue-map` (has numbers), `daily-view-tab` (this slice), `layout-editor` + `set-editor` (cells render no visible text; identity via `title`/aria-label) | this slice only — the editors are paint/design surfaces where cells may hold no set yet; a numbering affordance there is a separate product call, not this defect class |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** scoped Vitest run over the operator daily-view specs → pass.
- [ ] **AC-5:** mocked e2e `operator-daily.e2e.ts` + `touch-targets.e2e.ts` → pass.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — frontend-only.
- [ ] **Availability** section justified N/A (display-only; invariant #2 untouched).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section N/A — frontend-only (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change (invariant #12).
- [ ] **Frontend** standards met; no `as any`.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or resolved section).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder + `riviera-review-overlay`.
