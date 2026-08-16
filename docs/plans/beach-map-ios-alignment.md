# Beach-map iOS row alignment (#683) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On real iOS (WebKit), the beach-map row-code rail chips sit exactly beside
their tile rows all the way down a tall map, on all three affected surfaces (tourist
map, layout editor, set editor), by making tiles and rail cells compute height from the
identical `h-[var(--riv-tile)]` declaration.

**Architecture:** The canvas rail cells (`shared/beach-map-canvas.html`) are fixed-height
`h-[var(--riv-tile)]`; three surfaces' tiles instead derive height from the grid-track
width via `aspect-square` (+ a border). Blink resolves both identically; iOS WebKit
resolves `aspect-ratio` × border-box + subpixel snapping a couple px differently per row,
and since rail and tile column are independent flex stacks the error compounds down the
map. Fix = the daily-view pattern (`daily-view-tab.html:65`, already immune): swap
`aspect-square` for `h-[var(--riv-tile)]` on the three tile/cell elements. Squareness is
preserved by construction because all three grids use fixed tracks
`repeat(var(--riv-map-cols,1),var(--riv-tile))` (verified: `venue-map.html:148`,
`layout-editor.html:160`, `set-editor.html:227`).

**Persistence:** N/A — frontend-only styling fix; no backend, no schema.

**Source of intent:** GitHub issue #683 (maintainer diagnosis on a real iPhone,
2026-08-16; pre-existing bug surfaced by the #676/PR #682 2D-pan slice, not caused by it).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the three `aspect-square` sites and fixed grid tracks on `main`, no in-flight overlap:
only Dependabot PRs open, no spec pins `aspect-square`/`aspect-ratio`) ·
`riviera-plan-doc` (this template — forced the mechanism-pin AC shape and the
WebKit-verification split) · `tdd` (pins written red against the `aspect-square`
templates, then the class swap turns them green) · `riviera-review-overlay` (review gate
— at ready-for-review) · `riviera-docs-freshness` (N/A — no substrate doc states tile
height mechanics; `docs/plans/shared-map-canvas.md` history stands as history) ·
`riviera-frontend` (spec placement: per-surface unit specs, e2e stays in the mocked
suite) · `riviera-tailwind` (arbitrary-value idiom `h-[var(--riv-tile)]`; keep
`.set-tile`/testid markers inert; 44px floor — `--riv-tile` clamps at 47px ≥ 44, and
the rendered-box e2e sweep, not the class list, is the proof) · `angular-developer` +
angular-cli MCP (template-only change; class-contract pins in Vitest fixtures) ·
`playwright-cli` (scoped mocked-suite runs; no new e2e — a Chromium render pin cannot
see a WebKit-only divergence, so the pin lives at the class-contract level) ·
`riviera-local-debug` (Chromium at `/opt/pw-browsers/chromium` via
`PW_CHROMIUM_EXECUTABLE` for the mocked suite; scoped runs, CI owns the full suite).

**Branch:** designated cloud-session branch `claude/beach-map-ios-alignment-7qphbc`
(stands in for `bugfix/beach-map-ios-alignment` per the riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

> WebKit note: CI's Playwright is Chromium-only, and Blink renders the two height
> mechanisms identically — a rendered-alignment e2e pin in CI is structurally unable to
> catch this bug or its regression. The pins therefore assert the **mechanism** (tile and
> rail cell carry the identical fixed-height class, and the derive-from-width class is
> gone); real-WebKit rendering is verified outside CI (see Open questions → maintainer
> verification).

- [ ] **AC-1:** Given the tourist venue map is rendered, when its set tiles are
  inspected, then every `[data-testid="set-tile"]` carries `h-[var(--riv-tile)]` — the
  same fixed-height token as the row-code rail cells in the same fixture — and does not
  carry `aspect-square`. *Pinned by:* `venue-map.spec.ts` › "sizes set tiles with the
  rail cells' fixed --riv-tile height, never aspect-ratio (#683)"
- [ ] **AC-2:** Given the layout editor's bulk grid is rendered, when its cells are
  inspected, then every `[data-testid="layout-cell"]` carries `h-[var(--riv-tile)]`
  (same token as the rail cells) and not `aspect-square`. *Pinned by:*
  `layout-editor.spec.ts` › "sizes bulk cells with the rail cells' fixed --riv-tile
  height, never aspect-ratio (#683)"
- [ ] **AC-3:** Given the per-set editor grid is rendered, when its cells are inspected,
  then every `[data-testid="set-cell"]` carries `h-[var(--riv-tile)]` (same token as the
  rail cells) and not `aspect-square`. *Pinned by:* `set-editor.spec.ts` › "sizes set
  cells with the rail cells' fixed --riv-tile height, never aspect-ratio (#683)"
- [ ] **AC-4:** Given the daily view (the reference implementation, template unchanged),
  when its tiles are inspected, then every `[data-testid="set-tile"]` carries
  `h-[var(--riv-tile)]` and not `aspect-square`, so a future regression to
  `aspect-square` fails loudly on all four surfaces, not just the three fixed here.
  *Pinned by:* `daily-view-tab.spec.ts` › "sizes tiles with the rail cells' fixed
  --riv-tile height, never aspect-ratio (#683)"
- [ ] **AC-5:** Given the class swap, when the existing nets run, then they hold
  verbatim: `venue-map-pan.e2e.ts` (ghost alpha, dashed border, scrollLeft/scrollTop
  deltas), `touch-targets*.e2e.ts` (three files — `--riv-tile` clamps at 47px ≥ the 44px
  floor), `layout-editor.e2e.ts`, `operator-set-editing.e2e.ts`, `operator-daily.e2e.ts`,
  and the a11y/contrast suites (fills/borders unchanged → no contrast re-proof).
  *Pinned by:* the existing suites, unmodified.

## Non-goals

- No change to `daily-view-tab.html` — it is the reference implementation (spec-only
  addition there, AC-4).
- No change to `shared/beach-map-canvas.html` rail cells — they are already correct.
- No rendered-alignment e2e in CI (Chromium cannot express the WebKit divergence); no
  WebKit CI job (out of scope for this slice, noted as an open question → resolved).
- No visual restyle: fills, borders, radii, gaps, snap behavior, pan behavior all stay
  byte-identical; only the height *mechanism* changes.
- No SCSS migration triggered: none of the touched components carries component SCSS.

## Behavior-parity ledger

N/A — no surface retired or replaced; a one-class height-mechanism swap per surface with
squareness preserved by construction (fixed grid tracks). Parity is pinned by AC-5's
untouched suites.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A spec pins the old class string and breaks on the swap (the #672 `PRE_MOVE_CELL_CLASS` trap, F-CI-1 in `docs/plans/shared-map-canvas.md`) | low | med | Grepped `frontend/` for `aspect-square` and `aspect-ratio` before editing: only the three template sites exist; `PRE_MOVE_CELL_CLASS` pins state-variant colors, not geometry. No pin update needed | session | closed — grep evidence, plan time |
| R-2 | Removing `aspect-square` breaks squareness where tracks aren't fixed | low | high | All three grids verified fixed-track `repeat(var(--riv-map-cols,1),var(--riv-tile))` (incl. layout-editor, the one the issue asked to verify) | session | closed — template evidence, plan time |
| R-3 | Height swap dips a control under the 44px touch floor | low | med | `--riv-tile: clamp(47px, 11vw, 56px)` (`beach-map-canvas.ts:85`) floors at 47px ≥ 44; proven by the rendered-box sweep `touch-targets*.e2e.ts`, run scoped locally + full in CI | session | open — closes at Phase 2 |
| R-4 | Chromium-only CI cannot prove the iOS rendering is fixed | certain | med | Pin the mechanism (AC-1…4); real-WebKit proof is a dev-machine `npx playwright install webkit` run and/or the maintainer's post-deploy iPhone check (issue #683 verification note) | maintainer | open — post-deploy hand check |

## Open questions / Assumptions

### Resolved

- **Assumption:** identical fixed-height declarations on rail cells and tiles cannot
  drift under any engine — *resolved:* this is the daily-view pattern shipped and
  verified on-device since #672; the issue's diagnosis confirms daily view is immune.
- **Open question:** should CI gain a WebKit Playwright job? — *resolved:* out of scope
  for this slice; the cloud sandbox ships Chromium only and the mocked suite is
  Chromium-pinned. If recurring WebKit-only regressions appear, that's a new issue.
- **Open question:** how is the real-device fix proven? — *resolved:* maintainer
  post-deploy check on the reporting iPhone (any browser — all iOS browsers are WebKit):
  open a tall venue, scroll to the last rows, confirm row Z's chip sits beside row Z and
  the final walk-in row has its chip. Recorded in R-4 and the PR description.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: styling-only change to how beach-map tiles compute
their height; no booking, availability, or data path is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` (li.set-tile, line 152) | existing | template class edit | none | none |
| FE-2 | `operator/layout-editor.html` (bulk cell, line 173) | existing | template class edit | none | none |
| FE-3 | `operator/set-editor.html` (set cell, line 243) | existing | template class edit | none | none |
| FE-4 | `venue/venue-map.spec.ts`, `operator/layout-editor.spec.ts`, `operator/set-editor.spec.ts`, `operator/daily-view-tab.spec.ts` | existing | unit-spec mechanism pins | none | none |

**Standards:** template-only; markers (`.set-tile`, testids) stay inert per
`riviera-tailwind` rule 2; `snap-start`/`min-w-0` retained on the tourist tile.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement (phase 1 — pins red, then the class swap)

**Next action:** write the four mechanism pins, verify AC-1/2/3 red on the current
templates, then swap the class on the three templates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ⏳ | |
| 1 — pins red → class swap green | | |
| 2 — verification (units, lint/format, guards, scoped e2e) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/beach-map-ios-alignment.md` — this plan
- `frontend/src/app/venue/venue-map.html` — tourist tile: `aspect-square` → `h-[var(--riv-tile)]`
- `frontend/src/app/venue/venue-map.spec.ts` — AC-1 mechanism pin
- `frontend/src/app/operator/layout-editor.html` — bulk cell: `aspect-square` → `h-[var(--riv-tile)]`
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-2 mechanism pin
- `frontend/src/app/operator/set-editor.html` — set cell: `aspect-square` → `h-[var(--riv-tile)]`
- `frontend/src/app/operator/set-editor.spec.ts` — AC-3 mechanism pin
- `frontend/src/app/operator/daily-view-tab.spec.ts` — AC-4 regression pin (template untouched)

---

## Phase 0 — Plan doc

**Files:** Create `docs/plans/beach-map-ios-alignment.md`

- [ ] **Step 1: Commit the plan doc** — `git commit -m "Plan the beach-map iOS row-alignment fix (#683)"`

## Phase 1 — Mechanism pins red, class swap green

**Files:** Modify the four spec files (pins), then the three templates (swap).

- [ ] **Step 1: Write the failing pins.** One `it` per surface spec, shaped per surface
  (each fixture already renders the canvas rail):

```ts
it('sizes set tiles with the rail cells’ fixed --riv-tile height, never aspect-ratio (#683)', () => {
  const tiles = [...el().querySelectorAll('[data-testid="set-tile"]')];
  const rail = el().querySelector('[data-testid="row-code"]')!.parentElement!;
  expect(tiles.length).toBeGreaterThan(0);
  expect(rail.classList.contains('h-[var(--riv-tile)]')).toBe(true);
  for (const tile of tiles) {
    expect(tile.classList.contains('h-[var(--riv-tile)]')).toBe(true);
    expect(tile.classList.contains('aspect-square')).toBe(false);
  }
});
```

- [ ] **Step 2: Run, verify red** — scoped Vitest run over the four spec files →
  AC-1/2/3 pins FAIL on the current classes (`aspect-square` present, no fixed height);
  AC-4 (daily view) passes immediately — it is a regression pin on the reference
  surface, not new behavior.
- [ ] **Step 3: Minimal implementation** — in the three templates replace the single
  class token `aspect-square` with `h-[var(--riv-tile)]`; keep every other token
  (tourist tile keeps `set-tile snap-start … min-w-0` and its 1.5px border).
- [ ] **Step 4: Run, verify green** — same scoped Vitest run → PASS.
- [ ] **Step 5: Generalization-audit pass** — see log below.
- [ ] **Step 6: Commit** — `git commit -m "Fix beach-map rail drift on iOS by sizing tiles with the rail's fixed height (#683)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Verification net

- [ ] `npm test` (full unit run incl. a11y/contrast specs) → green
- [ ] `npm run lint` + `npm run format:check` → green
- [ ] `node scripts/check-touch-target.mjs --files <3 templates>` (declaration guard) and
  `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged first)
  → green
- [ ] Scoped mocked e2e (Chromium): `venue-map-pan`, `layout-editor`,
  `operator-set-editing`, `operator-daily`, `touch-targets`, `touch-targets-tourist`,
  `touch-targets-admin` → green (`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx
  playwright test --config=playwright.a11y.config.ts <files>`)
- [ ] CI full suite green on the PR

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | Phase 1 (the #683 fix) | Every element projected as row content into `beach-map-canvas` rows — the mechanism is "tile height must equal rail-cell height per row", so the population is every `appBeachMapRow` consumer, not "templates that look like the reported one" | `grep -rn "appBeachMapRow" frontend/src` | 4 (venue-map, layout-editor, set-editor, daily-view-tab) | Fix the 3 `aspect-square` sites; pin all 4 (daily view gets the regression pin, template untouched) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-4:** scoped Vitest run → the four #683 pins pass. Verified at commit `<sha>`.
- [ ] **AC-5:** scoped mocked e2e + full unit suite green locally; CI full suite green on the PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, frontend-only.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy N/A (invariant #10).
- [ ] Timezone N/A (invariant #6).
- [ ] Booking codes N/A (invariant #7).
- [ ] Flyway N/A (invariant #12).
- [ ] **Frontend** standards met: template-only class swap, markers inert, pins in
  Vitest, no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
  findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state committed here,
  citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
  `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
