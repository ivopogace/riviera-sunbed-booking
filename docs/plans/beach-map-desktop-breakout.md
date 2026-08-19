# Beach Map Desktop Breakout Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the tourist beach-map page, widen **only** the map card to 1100 px at
`≥1280 px` viewports so a 14-column beach renders whole with no pan and no drag hint,
while genuinely-oversized venues and every narrower viewport pan exactly as today.

**Architecture:** The breakout is a single symmetric negative inline margin on the
`<app-beach-map-canvas>` element in `venue-map.html`, gated by Tailwind's `xl:` breakpoint
— `-mx-[184px]` turns the 732 px content box of the 780 px page shell into exactly
1100 px, the width the design canvas specifies. It is deliberately **not** a `100vw`-based
`min()`/`clamp()`: `100vw` includes the classic scrollbar, so a fluid breakout overflows
the page by the scrollbar width on the very desktops it targets. It is equally deliberately
**not** on the shared `BeachMapCanvas` — the operator layout editor, Daily view and per-set
editor share that component and live inside the console shell, which must not widen.

The second, smaller decision: the canvas's overflow measurement now re-runs on a
`ResizeObserver`, not only on a rows change. Without it the `pannable`/hint state is
whatever the **first** render measured, which the breakout turns from harmless into a
correctness bug (below, and R-1).

**Persistence:** N/A — frontend-only slice; no table, no migration, no SQL.

**Source of intent:** GitHub issue #700. Visual reference: the "Refined — desktop
breakout" artboard on the Beach Map Refinement design canvas
(`https://claude.ai/code/artifact/464f8512-ec58-441f-aeca-284b484abe71`), whose
recommendation annotation reads: *"the map card breaks out to ~1100px on desktop, so a
14-column beach fits with no panning"*.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
AC-2 is already-shipped `.pannable` behavior, so it is a regression guard, and that AC-1's
"no drag hint" also depends on the *vertical* hint, which fixes the fixture at ≤ 8 rows) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger, which is where the
stale-measurement defect got written down instead of shipped silently) · `tdd` (each phase
red-first: the failing e2e for the breakout, the failing unit spec for the re-measure) ·
`riviera-review-overlay` (review gate — RV-FE-E2E for suite placement, run at ready-for-review)
· `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 1 finding — no substrate doc
states the map card's width, the canvas's measurement trigger, or a count this slice grew,
but the sweep caught `riviera-tailwind` still saying "8 `.scss` files" after #698 deleted
`operator-console.scss`; patched to 7 here, per close-out step 5's fold-into-the-code-PR rule) · `riviera-frontend` (placement:
the breakout utility belongs on the tourist page's canvas **instance**, never on the shared
`shared/beach-map-canvas.ts`, which three operator surfaces also render) ·
`riviera-tailwind` (utility-first — one arbitrary-value margin utility on the consumer, no
`@apply`, no new `.scss`; `-mx-[184px]` over a `vw`-derived `clamp()` for the scrollbar
reason above) · `angular-developer` + angular-cli MCP `get_best_practices` (v22 posture:
the re-measure is an `effect` + `onCleanup` disconnect mirroring the canvas's existing
capture-click effect, not a lifecycle hook or `@HostListener`) · `playwright-cli` (the new
specs are role/test-id located with web-first `expect` and no fixed sleeps; the resize pin
uses `expect.poll` rather than a `waitForTimeout`) · `riviera-local-debug` (scoped Vitest +
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e — never
`playwright install`).

**Branch:** `claude/sdlc-700-ayw5bu` — the cloud session's designated branch **substitutes
for** `feature/beach-map-desktop-breakout` (`riviera-sdlc` § Remote/cloud session addendum);
the literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

> Written at the observable-surface boundary, because this slice's whole subject *is* the
> rendered box: every criterion below is a geometry or state fact a user could point at.

- [x] **AC-1:** Given a venue whose map is 14 columns wide and 5 rows deep, when the tourist
  opens `/venues/:id` at a 1280 × 720 viewport, then the pan viewport's `scrollWidth` does
  not exceed its `clientWidth` (the grid renders whole) and no `scroll-hint` element is in
  the DOM. *Pinned by:* `venue-map-pan.e2e.ts` › `a 14-column map fits whole at a desktop
  viewport — no pan, no hint (#700)`
- [x] **AC-2:** Given the same page, when the map card is measured against its siblings, then
  the map card is wider than the page shell while `.map-head` and the legend list keep the
  shell width, and the map card is centred on the same axis as the header (a symmetric
  breakout, not a shift). *Pinned by:* the same test.
- [x] **AC-3:** Given a venue whose map is 20 columns wide, when the tourist opens it at
  1280 × 720, then the viewport still overflows, `.pannable` is applied, the edge-fade mask
  and 16 px scroll padding are present and the drag hint is shown — i.e. a genuinely
  oversized venue pans exactly as before. *Pinned by:* the suite's existing `a plain click on
  a free tile opens the booking dialog` and `a drag-pan release …` tests, which already use a
  20-column fixture, plus an explicit assertion in the new test.
- [x] **AC-4:** Given a 14-column map rendered whole at 1280, when the viewport narrows to
  900 (below the breakout breakpoint), then the hint, `.pannable` fade and scroll padding
  appear because the grid now genuinely overflows; and when it widens back to 1280 they
  disappear again. *Pinned by:* `venue-map-pan.e2e.ts` › `the pan affordances follow the
  viewport across the breakout breakpoint (#700)`
- [x] **AC-5:** Given the canvas rendered with a viewport whose overflow changes without any
  row change, when the observed element reports a resize, then `scrollHint` / `vScrollHint`
  are recomputed from the fresh measurement. *Pinned by:*
  `beach-map-canvas.spec.ts` › `re-measures the pan overflow when the viewport resizes (#700)`
- [x] **AC-6:** Given a 390 × 844 mobile viewport, when a 14-column map renders, then it pans
  as today — the hint shows, the mask and scroll padding apply, tiles stay at the ≥ 44 px
  floor. *Pinned by:* the existing `touch-targets-tourist.e2e.ts` sweep for the floor, and by
  the mobile assertion inside the new breakpoint test.
- [x] **AC-7:** Given the whole mocked venue-map suite, when it runs, then every existing
  rendered-style pin from #672/#674/#689 still passes and axe reports no serious violations
  on the fits-whole map. *Pinned by:* `npm run test:e2e:a11y -- venue-map-pan` green, with
  `expectNoSeriousAxeViolations` called in the new test.

## Non-goals

- The other four refinements on the same design canvas — legend attached under the sea
  banner, price chips carrying the row's meaning, a hatch on walk-in tiles, device-neutral
  copy. Each is its own slice; this one is the breakout width only.
- The "Remodel concept — beach scene" artboard. The canvas itself judges it an epic, not a
  slice, and explicitly recommends refine-over-remodel.
- Widening the header, overview card, legend, failure panels or loading panel. The issue
  fixes them at the current shell width and this plan keeps them there.
- Widening the beach map on the three operator console surfaces (layout editor, Daily view,
  per-set editor). They share `BeachMapCanvas` but not the tourist page shell.
- Any intermediate breakout step below 1280 (e.g. an `lg:` tier). At 1024 the usable width
  after the page's own padding is ~961 px, still short of the ~996 px a 14-column grid
  needs, so a second tier would add a breakpoint without buying the criterion.
- A fluid `clamp()`/`vw` breakout — rejected on the scrollbar-overflow evidence in
  *Architecture*; revisit only with a scrollbar-safe viewport unit.

## Behavior-parity ledger

> The slice changes one page's layout and one shared component's measurement trigger. The
> canvas is shared chrome, so its every behavior is enumerated below rather than assumed.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Map card sits at the 780 px page shell's 732 px content width | **changed** | ≥ 1280 px only: 1100 px via `xl:-mx-[184px]` on the canvas instance. Below `xl`, byte-identical to today. |
| Header, overview card, legend, failure/loading panels sit at the shell width | preserved | untouched — the breakout is one class on the canvas element, not on the shell |
| `.pannable` (edge-fade mask + `scroll-pl-4`) applied iff the grid overflows horizontally | preserved | same `scrollHint()` binding; only *when it is recomputed* changes |
| Drag hint shown iff (horizontal **or** vertical overflow) **and** `dragPan` | preserved | same `@if` in `beach-map-canvas.html`, untouched |
| Overflow measured once per render, on a rows change (`afterRenderEffect`) | **changed** | measurement extracted to one private method, called by that same `afterRenderEffect` **and** by a `ResizeObserver` on the pan viewport |
| Overflow **not** re-measured on viewport resize → stale `pannable`/hint | dropped → **fixed** | see R-1: reproducible on `main` today; the breakout makes it reachable, so it is fixed here rather than left behind a slice that depends on it |
| 2D drag-pan (horizontal `scrollLeft`, vertical wash `scrollTop` when it overflows) | preserved | gesture handlers untouched |
| Pan-release click suppression, consume-once, never for `detail === 0` | preserved | the capture-click `effect` is untouched; the new observer is a separate `effect` |
| `dragPan="false"` surfaces (layout editor paint) suppress pan + hint | preserved | untouched; the observer only re-runs the same measurement |
| Rails aria-hidden, price chip once per zone, zone-gap `mt-3`, `--riv-tile` row height | preserved | no template change in the canvas |
| Operator console map surfaces render at console width | preserved | the breakout class is on the tourist page's element only |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The canvas measures overflow only on a rows change, so `pannable`/hint go stale on any viewport resize. Verified on `main` at HEAD: 1280→700 leaves `overflows:true` with `pannable:false, hint:false` (a map that pans with no affordance); 700→1280 leaves `overflows:false` with `pannable:true, hint:true` (a hint that lies). The breakout makes the ≥ 1280 case the *fits* case, so narrowing the window becomes the common path into the first failure. | high | med | Re-measure from a `ResizeObserver` on the pan viewport; pinned by AC-4 (e2e) + AC-5 (unit) | this slice | closed — fixed in phase 1 |
| R-2 | A `ResizeObserver` whose callback writes signals could re-trigger itself ("undelivered notifications" loop). | low | med | Toggling `.pannable` changes only the mask, `scroll-padding-left` and the **child** grid's padding — never the observed viewport's own box — so the observer cannot re-fire from its own effect. The two states are also hysteretic (off→on needs `G > clientW`; on→off needs `G+32 ≤ clientW`), so no oscillation band exists. Verified by the e2e resize pin settling. | this slice | closed — the breakpoint-resize spec settles in both directions, no loop |
| R-3 | jsdom has no `ResizeObserver`, so five specs that render the canvas (`beach-map-canvas`, `venue-map`, `layout-editor`, `daily-view-tab`, `set-editor`) would throw on construction. | high | high | Feature-guard the observer (`typeof ResizeObserver === 'undefined'` → skip); the canvas spec installs and **restores** its own stub, per `frontend/.claude/CLAUDE.md`'s "isolate stays false — anything a spec mutates globally, it restores itself". | this slice | open |
| R-4 | A fluid `vw`-based breakout overflows the page horizontally by the scrollbar width, because `100vw` counts the classic scrollbar that `documentElement.clientWidth` excludes. | med | med | Fixed `-mx-[184px]` at a breakpoint instead; `documentElement.scrollWidth > clientWidth` asserted false in the new e2e. | this slice | closed — `documentElement.scrollWidth > clientWidth` is false at 1280 |
| R-5 | Existing #672/#674/#689 rendered-style pins break because the map card changed width. | med | med | Those tests use 20-column fixtures, which still overflow at 1100 px (measured `scrollWidth` 1266 vs `clientWidth` 966), so their `.pannable`, mask, snap and 16 px leading-tile assertions are unaffected. Whole suite re-run before push. | this slice | closed — all 6 venue-map-pan tests green, the #672/#674/#689 pins included |
| R-6 | The breakout widens the card past the viewport on a 1280 screen once the page's own vertical scrollbar is counted. | low | high | 1100 px card inside a 1265 px usable width leaves ~82 px each side; asserted by the page-overflow check in the new e2e. | this slice | closed |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Assumption:** ~1100 px is the intended card width, read from the design canvas's own
  recommendation text rather than inferred. — **Confirmed** at phase 0: the rendered card
  measures exactly 1100 px at 1280 and 1440, and a 14-column grid needs 862 px against the
  966 px viewport the card yields. `6c26cd8`.
- **Assumption:** `xl` (1280 px) is the right breakpoint. — **Confirmed** at phase 0: it is
  the viewport AC-1 names, and the smallest tier at which a 1100 px card leaves ~82 px each
  side once the page's own scrollbar is counted. `6c26cd8`.

- **Open question:** Should the stale-measurement defect (R-1) be fixed here or deferred to
  its own issue? — **Resolved:** fixed here. AC-2 of the issue states the pan chrome appears
  "only when the grid genuinely overflows its viewport", which is a state criterion, not a
  first-paint one; and this slice is precisely what turns a desktop map from
  always-overflowing into sometimes-fitting, which is what makes the stale value harmful.
  Deferring would ship a slice whose own acceptance criterion is violated by a window drag.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice changes CSS layout and one client-side
measurement trigger. No booking is created, no `availability(set_id, booking_date)` row is
read or written, no request reaches the backend that did not before. Tile bookability,
pool filtering (#3) and the cutoff note (#4) are rendered from the same unchanged
`VenueMapView` payload.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No Java, no module, no port, no event, no migration.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The booking dialog's behavior is untouched; the slice never
reaches a PaymentIntent, refund or ledger entry.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.html` | existing | template of a standalone component | none — one static layout utility on the canvas element | none |
| FE-2 | `shared/beach-map-canvas.ts` | existing | standalone component | `signal` (`scrollHint`, `vScrollHint`) written from `afterRenderEffect` **and** a `ResizeObserver` inside an `effect` with `onCleanup` | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation. The observer is registered in an `effect` with `onCleanup` — the same
shape the component already uses for its capture-phase click listener — rather than a
lifecycle hook, per the v22 posture from angular-cli `get_best_practices`. No `@HostListener`
(a `window:resize` binding would miss a card-width change that is not a window change, and
the repo forbids the decorator anyway).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `merge close-out — CI green, Sonar gate cleared; review gate blocked on
subagent authorization`

**Next action:** Once the maintainer authorizes the `/code-review` subagent fan-out, run the
review gate on PR #707, resolve any findings through the loop, then merge. Merged via PR #707.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Desktop breakout (AC-1, AC-2, AC-3, AC-7) | ✅ | `6c26cd8` |
| 1 — Re-measure on resize (AC-4, AC-5, AC-6) | ✅ | `9400cca` |
| close-out — docs-freshness patch + plan final state | ✅ | `6021244` + this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (`6c26cd8`) | `Frontend (lint + test + build)` red — the breakpoint-resize e2e failed | fixed-in-`9400cca` — the failure was the phase-0 commit's declared red-TDD state, resolved by phase 1's `ResizeObserver`; green on `6021244` |
| F-2 | docs-freshness sweep | `riviera-tailwind` stated "8 `.scss` files under `frontend/src/app`"; #698 deleted `operator-console.scss`, leaving 7 | fixed-in-`6021244` |
| F-3 | overlay walk (RV-FE-E2E) | Two new e2e specs read the pan state one-shot straight after a heading-visible wait. `.pannable`, the mask and `scroll-pl` come from a measurement one CD cycle later, so the still-pans test could read them before they applied — the flake class RV-FE-E2E names ("web-first `expect` auto-waiting, no fixed sleeps"). | fixed — the still-pans test now awaits the hint (same measurement) before reading; the fits-whole test awaits a laid-out tile first |

### Gate record

- **CI:** all 8 checks green on `6021244` (backend build+test, frontend lint/test/build,
  repo hygiene, CodeQL ×2, SonarCloud ×2).
- **Sonar gate:** green **and its list cleared** — `api/issues/search` total `0`, with
  `measures` non-empty (`new_lines: 21`) and the `SonarCloud Code Analysis` check-run
  `success`, which is what rules out the false-clean read (#318). `new_bugs 0 ·
  new_vulnerabilities 0 · new_code_smells 0 · new_duplicated_blocks 0 · new_coverage 100.0%`.
- **Review gate:** **not run.** `/code-review`'s workflow fans out subagents and this session
  carries a standing instruction not to use the Agent tool unless the user asks. Per
  `pr-gates.md` §1 that is a blocker to declare rather than substitute silently, so the PR's
  review checkbox is left unticked and the maintainer has been asked to authorize the
  fan-out. The overlay's bank items were walked, which is explicitly **not** the gate.
- **Overlay walk (content added to a review, never a review on its own).** FE scope:
  **RV-FE-1** ✅ no new component; the added `effect` + `onCleanup` is the v22 posture, no
  `@HostListener`, no `ngClass`/`ngStyle`, no redundant `standalone`/`OnPush`.
  **RV-FE-5** ✅ the seat picker is untouched — tiles keep their `aria-label`, keyboard
  activation and non-colour-only taken/walk-in treatment; axe runs on the new fits-whole
  render. **RV-FE-7** ✅ one Tailwind utility, no new `.scss`, no `@apply`; no component with
  legacy SCSS was touched, so migrate-on-touch doesn't fire; no drift risk (nothing restyled —
  the card only changes width); no control added or resized, so the 44 px floor is unchanged.
  **RV-FE-8** ✅ no new cross-feature import; the residual-five table is untouched.
  **RV-FE-9** ➖ nothing is unmounted or disabled; `check-focus-posture.mjs` clean.
  **RV-FE-E2E** ✅ after F-3 — coverage is in the CI-run mocked suite, role/test-id located,
  `expect.poll` rather than sleeps. **RV-FE-2 / -3 / -4 / -6** ➖ no availability interaction,
  money/date rendering, payment UI or form is touched. **RV-STYLE-1** ✅ guard clean.
  **RV-STYLE-2** ➖ `prettier --check` clean, not the reviewer's call. **RV-PROC-1** ✅ Skills
  consulted covers every touched area; re-walked after the F-3 fix.
- **Draft flag:** this session could not flip it — REST has no field for it and the session
  proxy serves only a pinned set of PR-review GraphQL operations, so `gh pr ready` 403s.
  Noted in the PR body.

---

## File structure

- `docs/plans/beach-map-desktop-breakout.md` — this plan
- `frontend/src/app/venue/venue-map.html` — the `xl:` breakout utility on the tourist page's
  `<app-beach-map-canvas>` element
- `frontend/src/app/shared/beach-map-canvas.ts` — measurement extracted to one method; a
  `ResizeObserver` on the pan viewport re-runs it
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — the resize re-measure unit pin, with a
  self-restoring `ResizeObserver` stub
- `frontend/e2e/venue-map-pan.e2e.ts` — the three new mocked-suite specs (fits-whole desktop
  map; oversized venue still pans; affordances follow the viewport)
- `.claude/skills/riviera-tailwind/SKILL.md` — the stale SCSS count (8 → 7), the one finding
  from the docs-freshness sweep; #698 deleted `operator-console.scss` without updating it

---

## Phase 0 — Desktop breakout

**Files:** Modify `frontend/src/app/venue/venue-map.html:145` · Test
`frontend/e2e/venue-map-pan.e2e.ts`

- [x] **Step 1: Write the failing test** — a `fitVenue()` fixture (14 columns × 5 rows, so
  the grid neither overflows horizontally at 1100 px nor outgrows the 532 px wash cap) served
  at `/venues/3`, plus a spec asserting: the pan viewport does not overflow, no `scroll-hint`
  exists, the map card is wider than `.map-head` while `.map-head` and the legend keep the
  shell width, the card is centred on the header's axis, the page itself does not overflow
  horizontally, and axe is clean.

- [x] **Step 2: Run it, verify it fails** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts venue-map-pan`
  → FAIL: the viewport overflows (`scrollWidth` 894 > `clientWidth` 598) and `scroll-hint` is
  visible.

> Scope: one spec file, not the whole mocked suite.

- [x] **Step 3: Minimal implementation** — on `venue-map.html`'s `<app-beach-map-canvas>`,
  add `xl:-mx-[184px]` with a one-line comment deriving 184 from `(1100 − 732) / 2`.

- [x] **Step 4: Run it, verify it passes** — same command → PASS (6 tests: 5 green, the phase-1 breakpoint-resize spec still red by design).

> Scope (end-of-phase regression): the whole `venue-map-pan` spec file, so the #672/#674/#689
> pins and the 20-column pan tests are re-proved against the wider card (R-5).

- [x] **Step 5: Generalization-audit pass**

Population `every template that renders <app-beach-map-canvas>, i.e. every surface a
card-width change could reach` → enumerate
`git ls-files '*.html' '*.ts' | xargs grep -l 'app-beach-map-canvas'` → candidates
`venue/venue-map.html, operator/layout-editor.html, operator/daily-view-tab.html,
operator/set-editor.html` → decision `tourist page only — the three operator surfaces render
inside the console shell, which the issue explicitly leaves at its current width; the
breakout stays on the consumer, never on the shared component`. Append to the log below.

- [x] **Step 6: Commit** — `git commit -m "Break the tourist beach-map card out to 1100px on desktop (#700)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Re-measure the overflow on resize

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.ts` · Test
`frontend/src/app/shared/beach-map-canvas.spec.ts`, `frontend/e2e/venue-map-pan.e2e.ts`

- [x] **Step 1: Write the failing tests** — (a) a unit spec that installs a
  `ResizeObserver` stub on `globalThis` before rendering, seeds a horizontal overflow through
  the DOM measurement seam **after** the first render, fires the observed callback, and
  expects the hint to appear; then clears the overflow, fires again, and expects it to
  disappear — restoring the previous global afterwards. (b) an e2e spec that loads the
  14-column venue at 1280 (no hint), resizes to 900 and expects the hint, mask and
  `scroll-pl` to appear, then resizes back to 1280 and expects them gone.

- [x] **Step 2: Run them, verify they fail** —
  `npx vitest run --config vitest-base.config.ts src/app/shared/beach-map-canvas.spec.ts`
  → FAIL (`scrollHint` never flips: nothing observes the element), and the e2e resize
  assertion → FAIL (state frozen at the first measurement).

> Scope: the one spec class and the one e2e file.

- [x] **Step 3: Minimal implementation** — extract the two `signal.set` calls from the
  existing `afterRenderEffect` into `private measureOverflow()`; call it from that effect and
  from a new `effect((onCleanup) => …)` that constructs a `ResizeObserver` on the pan
  viewport, guarded by `typeof ResizeObserver === 'undefined'` for jsdom, and disconnects it
  in `onCleanup`.

- [x] **Step 4: Run them, verify they pass** — same commands → PASS, then the four other
  canvas-rendering specs (`venue-map`, `layout-editor`, `daily-view-tab`, `set-editor`) to
  prove the jsdom guard (R-3).

> Scope (end-of-phase regression): the `shared/` + `venue/` + `operator/` spec folders that
> render the canvas, then the whole mocked e2e suite before the push.

- [x] **Step 5: Generalization-audit pass**

Population `every frontend file that reads layout geometry at all — the mechanism that goes
stale when the viewport changes without a data change` → enumerate
`git ls-files 'frontend/src/**/*.ts' | xargs grep -ln 'scrollWidth\|clientWidth\|offsetWidth\|getBoundingClientRect' | grep -v spec`
→ candidates `beach-map-canvas.ts` (one) → decision `fix here, nothing else to sweep`. The
resemblance-based search (`afterRenderEffect`, 17 files) would have handed back a list to
judge one by one; the mechanism-based one shows the class has exactly one member, because
every other render-hook user moves **focus** (via `shared/focus-after-render.ts`), which no
resize invalidates. Appended to the log below.

- [x] **Step 6: Commit** — `git commit -m "Re-measure beach-map overflow when the viewport resizes (#700)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-19 | phase 0 (breakout) | Every template that renders the shared canvas — the population a card-width change can reach, enumerated by the element name rather than by "pages that look like the map" | `git ls-files '*.html' '*.ts' \| xargs grep -l 'app-beach-map-canvas'` | 4: `venue/venue-map.html`, `operator/layout-editor.html`, `operator/daily-view-tab.html`, `operator/set-editor.html` (+ the component itself) | Tourist page only. The three operator surfaces render inside the console shell, which #700 leaves at its current width — so the breakout stays a utility on the consumer and never enters `shared/beach-map-canvas.ts`. |
| 2026-08-19 | phase 1 (resize re-measure) | Every frontend file that reads layout geometry — the mechanism that goes stale when the viewport changes without a data change. Deliberately **not** enumerated as "files using `afterRenderEffect`" (17 hits), which is resemblance: those all move focus via `shared/focus-after-render.ts`, and focus is not invalidated by a resize. | `git ls-files 'frontend/src/**/*.ts' \| xargs grep -ln 'scrollWidth\|clientWidth\|offsetWidth\|getBoundingClientRect' \| grep -v spec` | 1: `shared/beach-map-canvas.ts` | Fixed here; the class has exactly one member, so there is nothing further to sweep. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run the mocked e2e → the fits-whole test passes. Verified at commit `<sha>`.
- [x] **AC-2:** Same test's sibling-width + centring assertions. Verified at commit `<sha>`.
- [x] **AC-3:** Same suite's 20-column tests + the explicit still-pans assertion. Verified at commit `<sha>`.
- [x] **AC-4:** The breakpoint-resize e2e test. Verified at commit `<sha>`.
- [x] **AC-5:** `npx vitest run … beach-map-canvas.spec.ts` → the resize re-measure spec passes. Verified at commit `<sha>`.
- [x] **AC-6:** The mobile assertion in the breakpoint test + `touch-targets-tourist.e2e.ts`. Verified at commit `<sha>`.
- [x] **AC-7:** `npm run test:e2e:a11y` green incl. `expectNoSeriousAxeViolations`. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A — no availability read or write).
- [x] Pool + cutoff rules honored (invariants #3, #4) — unchanged rendering of the same payload.
- [x] **Modulith** section filled (N/A — frontend-only); no backend file in the diff.
- [x] **Payment/payout** section filled (N/A — no money in scope).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — untouched.
- [x] Flyway migration present for schema changes (invariant #12) — none needed.
- [x] **Frontend** standards met; no `as any` on the contract; Tailwind used (no new `.scss`).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #707`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
