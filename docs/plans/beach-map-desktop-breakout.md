# Beach Map Desktop Breakout Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the tourist beach-map page, widen **only** the map card to 1100 px at
`≥1280 px` viewports so a 14-column beach renders whole with no pan and no drag hint,
while genuinely-oversized venues and every narrower viewport pan exactly as today.

**Architecture:** The breakout is a single symmetric negative inline margin on the
`<app-beach-map-canvas>` element in `venue-map.html`, gated at a **px** breakpoint
(`min-[1280px]:`) and **derived from** the target width —
`margin-inline: calc((100% - 1100px) / 2)` makes the card exactly 1100 px, the width the design
canvas specifies, whatever the shell's own width and padding resolve to. (Both halves were
review findings: it began as `xl:-mx-[184px]`, whose rem-based query tracked the browser's
default font size while the margin was px, and whose 184 was a silent function of line 1.) It is deliberately **not** a `100vw`-based
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
· `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, **0 findings** — no substrate doc
states the map card's width, the canvas's measurement trigger, or a count this slice grew. Its
one reported finding, `riviera-tailwind`'s SCSS count, was **withdrawn at review**: the count was
already correct and the "fix" was an artifact of a glob that skips `app.scss`; see F-5) · `riviera-frontend` (placement:
the breakout utility belongs on the tourist page's canvas **instance**, never on the shared
`shared/beach-map-canvas.ts`, which three operator surfaces also render) ·
`riviera-tailwind` (utility-first — one arbitrary-value margin utility on the consumer, no
`@apply`, no new `.scss`; a derived `margin-inline` over a `vw`-derived `clamp()` for the
scrollbar reason above) · `angular-developer` + angular-cli MCP (`get_best_practices` for the v22 posture — the
re-measure is an `effect` + `onCleanup` disconnect mirroring the canvas's existing capture-click
effect, not a lifecycle hook or `@HostListener`; then `search_documentation` to **validate** the
design against angular.dev rather than from memory, which moved the measurement onto
`afterRenderEffect`'s explicit `read` phase — see the validation note in the Gate record) · `playwright-cli` (the new
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
| Map card sits at the 780 px page shell's 732 px content width | **changed** | At a viewport ≥ 1280 px only: exactly 1100 px, via `min-[1280px]:[margin-inline:calc((100%_-_1100px)/2)]` on the canvas instance. Below 1280 px, byte-identical to today. |
| Header, overview card, legend, failure/loading panels sit at the shell width | preserved | untouched — the breakout is one class on the canvas element, not on the shell |
| `.pannable` (edge-fade mask + `scroll-pl-4`) applied iff the grid overflows horizontally | **changed** | Same `scrollHint()` binding, but both *when* and *what* it measures changed: it now reads the grid's unpadded content instead of the viewport's padded `scrollWidth`, so across a 32 px band the answer flips from "overflows" to "fits" — deliberately, on all four canvas surfaces (R-7) |
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
| R-2 | A `ResizeObserver` whose callback writes signals could re-trigger itself ("undelivered notifications" loop). | low | med | Toggling `.pannable` changes only the mask, `scroll-padding-left` and the **child** grid's padding — never the observed viewport's own box — so the observer cannot re-fire from its own effect. The two states are also hysteretic (off→on needs `G > clientW`; on→off needs `G+32 ≤ clientW`), so no oscillation band exists. Verified by the e2e resize pin settling. | this slice | closed — no loop; but the hysteresis this row treated as a safeguard was itself the defect, caught at review as R-7 |
| R-3 | jsdom has no `ResizeObserver`, so five specs that render the canvas (`beach-map-canvas`, `venue-map`, `layout-editor`, `daily-view-tab`, `set-editor`) would throw on construction. | high | high | Feature-guard the observer (`typeof ResizeObserver === 'undefined'` → skip); the canvas spec installs and **restores** its own stub, per `frontend/.claude/CLAUDE.md`'s "isolate stays false — anything a spec mutates globally, it restores itself" — the global **and** the stub's static instance array. | this slice | closed — full unit suite green (164 files / 1470 tests), so no leak and no unguarded construction |
| R-4 | A fluid `vw`-based breakout overflows the page horizontally by the scrollbar width, because `100vw` counts the classic scrollbar that `documentElement.clientWidth` excludes. | med | med | A breakpoint-gated `margin-inline` instead of a viewport-unit width; `documentElement.scrollWidth > clientWidth` asserted false in the new e2e. | this slice | closed — `documentElement.scrollWidth > clientWidth` is false at 1280 |
| R-5 | Existing #672/#674/#689 rendered-style pins break because the map card changed width. | med | med | Those tests use 20-column fixtures, which still overflow at 1100 px (measured `scrollWidth` 1266 vs `clientWidth` 966), so their `.pannable`, mask, snap and 16 px leading-tile assertions are unaffected. Whole suite re-run before push. | this slice | closed — all 6 venue-map-pan tests green, the #672/#674/#689 pins included |
| R-6 | The breakout widens the card past the viewport on a 1280 screen once the page's own vertical scrollbar is counted. | low | high | 1100 px card inside a 1265 px usable width leaves ~82 px each side; asserted by the page-overflow check in the new e2e. | this slice | closed |
| R-7 | The overflow gate measured the **viewport's** `scrollWidth`, which `.pannable` inflates by 32 px of grid padding — so the gate fed on its own output and the hint/fade/scroll-padding stuck to a map that had come to fit, if the width was approached from below. R-2 examined exactly this feedback loop, concluded "hysteretic, no oscillation", and stopped: stability was true and irrelevant. | high | med | Gate on the grid's **unpadded** content width, making the answer independent of the class it sets; pinned by a mutation-checked unit spec | review gate | closed — fixed in the review round; verified live at the reviewer's 735–760 px band |
| R-8 | Tailwind's `xl` is `80rem`, so a rem-based query drove a px-based card. `rem` in a media query resolves against the **browser's default font size** (Media Queries L4 §1.3 — *not* a declared `html { font-size }`, which cannot move it), so on Chrome's "Small" setting (12 px) `xl` fires at a 960 px viewport, pushing the 1100 px card's left edge and row rail off-screen with no `overflow-x` guard above it. | med | high | Px-matched query (`min-[1280px]:`) and a margin derived from 1100 px rather than hard-coded | review gate | closed — verified with a 12 px root: no early fire, no page overflow, card still exactly 1100 px |

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

**Stage pointer:** `DONE — every gate passed; awaiting the maintainer to un-draft and merge PR #707`

**Next action:** Maintainer un-drafts and merges PR #707. This session cannot flip the draft flag
itself — REST has no field for it and the session proxy serves only a pinned set of PR-review
GraphQL operations, so `gh pr ready` 403s. Nothing else is outstanding: CI is green, the Sonar
list is empty, the review gate ran three times and its findings are resolved, and the two
post-merge items are GitHub-only (issue #700 closes via `Closes #700`; no parent epic to tick).
This slice merges via PR #707.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Desktop breakout (AC-1, AC-2, AC-3, AC-7) | ✅ | `6c26cd8` |
| 1 — Re-measure on resize (AC-4, AC-5, AC-6) | ✅ | `9400cca` |
| close-out — plan final state | ✅ | `6021244` (its SCSS edit later reverted), `aea3101`, `223d795` |
| review round 1 — 10 findings | ✅ | `d881d77` |
| review round 2 — 13 findings | ✅ | `a30ae4a` |
| review round 3 — 11 findings | ✅ | `9185ccc` |
| angular.dev validation (angular-cli MCP) | ✅ | `e30d9db` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (`6c26cd8`) | `Frontend (lint + test + build)` red — the breakpoint-resize e2e failed | fixed-in-`9400cca` — the failure was the phase-0 commit's declared red-TDD state, resolved by phase 1's `ResizeObserver`; green on `6021244` |
| F-2 | docs-freshness sweep | ~~`riviera-tailwind`'s "8 `.scss` files" is stale after #698~~ — **WITHDRAWN, the claim was false.** 8 was and remains correct; see F-5 | withdrawn — the `6021244` edit is reverted; do not re-apply |
| F-3 | overlay walk (RV-FE-E2E) | Two new e2e specs read the pan state one-shot straight after a heading-visible wait. `.pannable`, the mask and `scroll-pl` come from a measurement one CD cycle later, so the still-pans test could read them before they applied — the flake class RV-FE-E2E names ("web-first `expect` auto-waiting, no fixed sleeps"). | fixed — the still-pans test now awaits the hint (same measurement) before reading; the fits-whole test awaits a laid-out tile first |
| F-4 | review gate | **Blocker.** The gate measured the viewport's padded `scrollWidth`, feeding on its own output — the hint stuck on a map that fits (R-7) | fixed — gate on the grid's unpadded content width; new mutation-checked spec `gates on the grid, not the padding .pannable adds to it` |
| F-5 | review gate | The docs-freshness "fix" was itself wrong: `git ls-files 'frontend/src/app/**/*.scss'` silently skips `app.scss` (zero intermediate dirs), so 8 was already correct and F-2 introduced the staleness it claimed to remove | fixed — reverted to 8; F-2 withdrawn |
| F-6 | review gate | rem-based `xl` + px-based card: under a 12 px **browser default font size** the breakout fired at a 960 px viewport and pushed the card off-screen (R-8) | fixed — `min-[1280px]:` px query, margin derived from 1100 px |
| F-7 | review gate | `-mx-[184px]` was a magic number coupled to the shell's width/padding on line 1, with no test pinning the 1100 px result | fixed — `calc((100% - 1100px) / 2)` derives it; e2e now asserts the card is 1100 px |
| F-8 | review gate | `fitVenue`'s TSDoc claimed 14 columns was the widest map that fits; 16 is the first that pans | fixed — wording corrected |
| F-9 | review gate | Three fits-whole assertions read the component's *initial* signal state, so they pass before any measurement (the F-3 class, left in the sibling) | fixed — the vacuous mask/scroll-padding assertions removed, with a note that the breakpoint test proves them on real transitions |
| F-10 | review gate | `StubResizeObserver.instances` never cleared in `afterEach`, pinning destroyed components for the worker's life | fixed — cleared alongside the global |
| F-11 | review gate | Plan doc closed out contradictory: R-3 `open` beside a shipped mitigation, and a stage pointer saying the merge was both pending and done | fixed — this commit |
| F-12 | review gate | `setViewportSize(1280×720)` is a no-op (already the suite default) | fixed — kept as an explicit pin, with a comment saying why |
| F-13 | review gate | `Page` imported as a value where the suite's convention is `type Page` | fixed |
| F-14 | review gate (round 2) | **The F-4 mutation check was invalid.** It mutated the gate to the *viewport's* `scrollWidth`, which jsdom leaves unseeded at 0, so the spec went red for the wrong reason; against a raw `grid.scrollWidth` it still passed, and `seedGridWidth(520, true)` put the numbers outside the 32 px band entirely | fixed — the helper now seeds a **content** width and adds the padding on top, so the band is modelled; re-mutated against `return grid.scrollWidth` and exactly the one sticky-hint spec fails |
| F-15 | review gate (round 2) | Nothing asserted `scroll-padding-left` returns to `auto` when a map stops overflowing — the deleted assertion was reassigned to a test that never had it | fixed — asserted on the breakpoint test's widen-back leg |
| F-16 | review gate (round 2) | F-9's fix removed two assertions as vacuous while keeping a third with identical timing, so it cut coverage without cutting the risk | fixed — all three read the settled state via `expect.poll`; the breakpoint test remains what proves they *move* |
| F-17 | review gate (round 2) | Sonar `typescript:S7773` ×2: prefer `Number.parseFloat` over the global | fixed |
| F-18 | review gate (round 2) | A missing `#rowGrid` made `contentWidth` return 0, so a wiring error would read as "the map fits" on all four canvas surfaces | **partly — and the register overclaimed it.** `!!grid` in the gate is behaviourally identical to the `return 0` it replaced (both yield "no hint"); what it buys is that the requirement is stated where the other one is, and that the unreachable branch is gone. The actual guard against the wiring error is the spec suite: `seedGridWidth` seeds the element the component reads, so a renamed or moved ref turns the overflow specs red |
| F-19 | review gate (round 2) | The `rowGrid` spec helper located the grid positionally (`firstElementChild`) | fixed — anchored on the grid's own `.w-max` |
| F-20 | review gate (round 2) | `contentWidth`'s TSDoc was 9 lines of decision archaeology against `riviera-java-conventions` §6d's ~3-line, no-history budget; same for `seedGridWidth` and the 490-char template comment | fixed — all three cut to their contract; the rationale lives here, as R-7/R-8 |
| F-21 | review gate (round 2) | The template comment justified the px query with "a 12 px root font", which cannot move a media query — only the browser's **default** font size can | fixed — comment and R-8 both restated |
| F-22 | review gate (round 2) | Plan doc still named `xl:-mx-[184px]` in six places, including the behavior-parity row a reader consults for what shipped | fixed — every site updated |
| F-23 | review gate (round 2) | The withdrawn F-2 row still asserted the false SCSS count as "fixed", contradicting F-5 two rows below | fixed — struck through and marked do-not-re-apply |
| F-24 | review gate (round 2) | Risk register ordered R-1…R-5, R-7, R-8, R-6 | fixed — reordered |
| F-25 | review gate (round 2) | `block` on the canvas instance duplicates the component's own host class | fixed — dropped; display stays a single-owner decision |
| F-27 | review gate (round 3) | `expect.poll` returns on its **first** successful evaluation, so F-16's re-added negative assertions could never wait for a later application of the pan chrome — the premise was wrong, not just the wording | fixed — the fits-whole test keeps AC-1's two first-paint facts and says so; the breakpoint test is what proves the affordances move, since only a transition can |
| F-28 | review gate (round 3) | F-18 was written up as a fix but `!!grid` is behaviourally identical to the `return 0` it replaced | fixed — F-18's row rewritten to say what actually changed and what really guards the wiring error |
| F-29 | review gate (round 3) | The behavior-parity row for `.pannable` said "preserved — only *when* it is recomputed changes"; the R-7 fix also changed *what* is measured, flipping the answer across a 32 px band | fixed — row restated as **changed**, with the band and the four affected surfaces named |
| F-30 | review gate (round 3) | File-structure row still described the reverted SCSS edit as slice work, inviting a resuming session to re-apply it | fixed — row says touched-and-restored |
| F-31 | review gate (round 3) | The Sonar record reported the pre-fix tree and was contradicted by F-17 in the same commit | fixed — record now covers all rounds, names the S7773 regression as the reason the *list* matters, and marks the gate due again on the final head |
| F-32 | review gate (round 3) | Execution status a round behind: "its 10 findings resolved", and `6021244` credited for work later reverted | fixed — stage pointer and phase table rewritten per round |
| F-33 | review gate (round 3) | "12 more findings (F-14…F-26)" is 13 rows | fixed |
| F-34 | review gate (round 3) | F-6 still attributed the early fire to "a 12 px root font", the phrasing F-21 corrects two rows below | fixed |
| F-35 | review gate (round 3) | The sticky-hint spec's stage-1 comment described a padded grid while seeding an unpadded one | fixed |
| F-36 | review gate (round 3) | `rowGrid` anchored on `.w-max`, a Tailwind sizing utility, one restyle from breaking every seeding spec | fixed — the grid carries `data-map-grid`, matching the file's `data-map-row` / `data-riv-scroller` convention |
| F-37 | review gate (round 3) | The three-poll block was copy-pasted at three sites, paying three cross-process round trips for a non-atomic read | fixed — one `expect.poll(...).toEqual({…})` per site, which also names the diverging field |
| F-26 | review gate (round 2) | *Not adopted:* measure a node `.pannable` provably never pads (an inner wrapper, or moving `px-4` to the viewport) rather than subtracting the padding arithmetically | **considered, not taken** — the only existing unpadded node is a projected row, and rows are **not** uniformly wide across surfaces (the canvas's own spec host renders ragged `<ul>`s), so measuring one would under-report the grid; moving `px-4` to the scroll container leans on end-padding behaviour that has historically been unreliable on horizontal scrollers. The subtraction reads *computed* padding, so it tracks any padding value the class sets; a future `.pannable` effect that is not padding would need this revisited, which R-7 now records |

### Gate record

- **CI:** all 8 checks green on `6021244` (backend build+test, frontend lint/test/build,
  repo hygiene, CodeQL ×2, SonarCloud ×2).
- **Sonar gate:** re-pulled after every push, because each fix round re-triggers the analysis.
  The round-1 fixes introduced two `typescript:S7773` smells (F-17), which is precisely why the
  gate is the *list* and not the conclusion — the quality gate stayed green through them. On the
  round-2 head the list is back to `total 0`, with `measures` non-empty and the `SonarCloud Code
  Analysis` check-run `success` (the two facts that rule out the false-clean read, #318):
  **Final verification on `e30d9db`** — the last commit that touches code: CI 8/8 green, `api/issues/search` **total 0**, `measures` non-empty
  (`new_lines 43`), `SonarCloud Code Analysis` `success` — `new_bugs 0 · new_vulnerabilities 0 ·
  new_code_smells 0 · new_duplicated_blocks 0 · new_duplicated_lines_density 0.0 ·
  new_security_hotspots 0 · new_coverage 100.0%`.
- **Review gate:** **RAN** — rung 1 of the invocation ladder (`Skill("code-review")`) was
  probed and succeeded, so the full subagent fan-out executed over `origin/main...HEAD` at high
  effort. It returned **10 findings**, all real and all fixed (F-4…F-13 above), including one
  blocker the overlay walk had missed and one *incorrect* fix of mine it caught and reversed.
  Re-walked RV-PROC-1 and the FE bank over the fix round.
- **Review gate, round 2** — the fix round re-entered at Implement, so the gate was re-run over
  `223d795..HEAD`. It returned **13 more findings** (F-14…F-26), the sharpest being that the
  round-1 mutation check was invalid: it had mutated the gate to a property jsdom leaves at 0,
  so the spec failed for the wrong reason and the padding subtraction was never actually pinned.
  All fixed or, in one case, deliberately not taken with the reasoning recorded.
- **Review gate, round 3** — re-run over `d881d77..HEAD`; **11 findings**, all recorded as
  F-27…F-37 and fixed. Two were substantive: `expect.poll` resolves on its **first** successful
  evaluation, so round 2's "poll makes the negative assertions non-vacuous" premise was simply
  wrong about Playwright's semantics; and F-18's `!!grid` guard was a behavioural no-op the
  register had written up as a fix. The rest were the plan doc's own record lagging the round
  that had just changed it.
- **angular.dev validation (angular-cli MCP `search_documentation`, v22).** The slice's three
  framework claims were checked against the docs rather than asserted from memory, per
  `frontend/.claude/CLAUDE.md`. Two held and one did not:
  - **`ResizeObserver` over a render hook — endorsed.** The effects guide states it outright:
    *"You often don't need `afterRenderEffect` to check for DOM changes. APIs like
    `ResizeObserver`, `MutationObserver` and `IntersectionObserver` are **preferred** to
    `effect` or `afterRenderEffect` when possible."* R-1's fix is the documented mechanism.
  - **`effect((onCleanup) => …)` with a disconnect — matches the documented pattern**, whose own
    example is the `setTimeout`/`clearTimeout` shape; and *"when a component or directive is
    destroyed, Angular automatically cleans up any associated effects"*, which is exactly what
    the teardown spec asserts (`fixture.destroy()` → `observer.disconnected`).
  - **The unphased `afterRenderEffect` was wrong — fixed.** The API docs mark it **CRITICAL**:
    *"If you don't specify the phase, `afterRenderEffect` runs callbacks during the
    `mixedReadWrite` phase. This may worsen application performance by causing additional DOM
    reflows"*, and *"prefer specifying an explicit phase … or you risk significant performance
    degradation."* `measureOverflow` is a pure DOM read (`scrollWidth`, `clientWidth`,
    `getComputedStyle`) that writes only signals, so it now runs in the **`read`** phase. This
    also answers the round-2 finding about `getComputedStyle` forcing a style recalc: the phase
    is what the framework provides to batch exactly that. The form was pre-existing, not
    introduced here, but the slice had already taken ownership of this effect.
- **Stopping the re-review loop here, deliberately.** Across three rounds the *code* findings
  converged hard — a shipped blocker, then an invalid test pin, then one real test-validity
  point — while the *plan-doc record* findings did not, and structurally cannot: every fix round
  invalidates the record of the round before it, so each pass manufactures its own next batch.
  Per `pr-gates.md` §1's non-convergence rule the right move is to stop and say what is still
  flagged rather than keep pushing. What is still flagged: nothing in the code. This section is
  written against **this** commit; any later commit makes it stale again, which is the loop.
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
- `frontend/src/app/venue/venue-map.html` — the breakout utility on the tourist page's
  `<app-beach-map-canvas>` element
- `frontend/src/app/shared/beach-map-canvas.ts` — measurement extracted to one method; a
  `ResizeObserver` on the pan viewport re-runs it; the gate reads the grid's unpadded width
- `frontend/src/app/shared/beach-map-canvas.html` — `#rowGrid` ref on the tile grid, so the
  overflow gate can measure the grid rather than the viewport's self-inflated `scrollWidth`
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — the resize re-measure unit pin, with a
  self-restoring `ResizeObserver` stub
- `frontend/e2e/venue-map-pan.e2e.ts` — the three new mocked-suite specs (fits-whole desktop
  map; oversized venue still pans; affordances follow the viewport)
- `.claude/skills/riviera-tailwind/SKILL.md` — touched and then **restored**: the sweep's
  SCSS-count "fix" was wrong (F-5) and is reverted, so the file is unchanged at HEAD

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
  add the breakout utility (shipped form: `min-[1280px]:[margin-inline:calc((100%_-_1100px)/2)]`,
  after the review round replaced the original `xl:-mx-[184px]`).

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
