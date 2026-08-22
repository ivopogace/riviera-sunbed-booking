# Beach-map canvas: a loading mode, and a rail that reserves its width

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `BeachMapCanvas` learns it is drawing a placeholder, so a skeleton rendered
through it stops stating row names nobody fetched, stops instructing a gesture it cannot
accept — and the left rail stops sliding the tile grid sideways when the real map lands.

**Architecture:** one input pair on the shared canvas, not a per-surface tweak. `loading`
suppresses the fabricated chrome (rail text, pan hint, grab cursor, the three decorative
testids); `railCodes` names what the rail's chips *are* — grid `letters`, whole `labels`,
or `capped-labels` — and that vocabulary, not the loading flag, decides how much width the
rail **reserves in both states**. Reserving in both is not a bonus half: a placeholder of
fixed width in front of a content-derived rail just moves the jump (a short-labelled venue
would slide the grid *left*), which is the shape of the reverted #748 fix (G-1).

**Persistence:** N/A — frontend-only, no schema and no query touched (invariant #1 unaffected).

**Source of intent:** GitHub issue #749 (deferred findings F-3, G-1, I-2 from PR #748 /
issue #744; their register is `docs/plans/skeleton-loading-surfaces.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the designated branch carried already-merged #744 history, restarted from `main`; and that
the ticket's item (4) is not an optional half) · `riviera-plan-doc` (this template — forced
the behavior-parity ledger, which is where the "the loaded rail may only *widen*" residual
got written down instead of discovered at review) · `tdd` (each phase red-first: canvas
unit specs before the template change, the e2e rail-stability matrix before the surfaces
were re-pointed) · `riviera-review-overlay` (review gate — ran twice on PR #750, over the slice and again over the fix range; 6 findings, F-1…F-3 and G-1…G-3) ·
`riviera-docs-freshness` (**ran** over `adc40d9..HEAD`, 0 findings: no substrate doc names the canvas's inputs or testids, and the slice adds no Nth-of-anything for the counting sweep) · `riviera-frontend` (placement: the change is wholly inside
`shared/` + its three consumers; no new file, no new cross-feature edge) ·
`riviera-tailwind` (the width tokens are arbitrary-value utilities computed in TS beside
`scrollbarChrome`, not `@apply`; kept the `data-testid` markers specs query) ·
`angular-developer` + angular-cli MCP (`input()` signal API, `computed()` for the derived
class strings, `@if` control flow — no `ngClass`) · `playwright-cli` (the measurement
harness: `getBoundingClientRect` either side of a held route, at both viewports).

**Branch:** cloud session — the designated remote branch `claude/issue-744-51n4oe` stands
in for `bugfix/map-canvas-loading-mode`, restarted from `origin/main` after PR #748 merged.

---

## The measurements this plan is built on (Chromium, mocked e2e fixtures)

Taken before any code changed, with the venue read held open, on the `Front row` / `Row 2`
fixture. `rail` is the left rail column's rendered width; `viewportX` is the tile viewport's
left edge — what a reader sees slide.

| Surface | Viewport | Rail, skeleton | Rail, loaded | Grid slide | Pan hint while loading |
|---|---|---|---|---|---|
| Tourist map | 1280 | 24.00 | 63.14 | **+39.14px** | no |
| Tourist map | 390 | 24.00 | 54.00 | **+30.00px** | **yes** |
| Daily view | 1280 | 24.00 | 63.14 | **+39.14px** | no |
| Daily view | 390 | 24.00 | 63.14 | **+39.14px** | **yes** |

**And one thing the fix itself had to be measured against.** Reserving the #724 cap outright
(102px from `sm`) does end the slide, and it costs 39px of tile viewport — which the desktop map
does not have. `venue-map-pan.e2e.ts`'s fits-whole guarantee (#700) clears its viewport by ~31px on
a 14-column venue, so the cap-sized rail put that map into a pan; CI caught it on the phase-1/2
commit, and the local mocked suite had caught it a few minutes earlier. The reservation is
therefore the **54px mobile cap as a minimum**: it holds the phone rail exactly where it lands
today and leaves ~13px of the fits-whole margin. Being a minimum, it removes a **flat 30px** of
slide (the placeholder chip's 24px becomes 54px) rather than all of it — measured across both
label extremes:

| Surface / viewport | Row names | Loaded rail | Slide before → after |
|---|---|---|---|
| Tourist, 1280 | `Front row` | 63.14px | 39.14 → **9.14px** |
| Tourist, 390 | `Front row` | 54.00px (capped) | 30.00 → **0.00px** |
| Tourist, 1280 | 30 chars | 102.00px (capped) | 78.00 → **48.00px** |
| Tourist, 390 | 30 chars | 54.00px (capped) | 30.00 → **0.00px** |
| Daily, 1280 | `Front row` | 63.14px | 39.14 → **9.14px** |
| Daily, 1280 | 30 chars | 188.64px (whole) | 164.64 → **134.64px** |

Zero everywhere is only buyable with the #724 caps themselves, which is a product call and a
Non-goal — and on the operator rails not even then, since #724 renders their labels whole.

Two things the issue did not state, both found here: the tourist rail's mobile jump stops
at 54px because the #724 cap truncates `Front row` (48px of text + 6px of chip padding) —
so on that surface a *fixed* rail is exactly today's worst case, not a new one. And the
**price** rail moves too (52px → up to 92/128px), which shrinks the viewport from the right
without sliding the tiles; out of scope, Non-goals.

## Acceptance criteria (testable)

- [x] **AC-1:** Given a canvas in `loading` mode, when it renders rows, then no element
      carries `data-testid="row-code"`, `price-col`, or `scroll-hint`, and no rail chip
      contains any text (both rails keep their columns under placeholder testids). *Pinned by:* `beach-map-canvas.spec.ts` › "a loading canvas states
      no row name, no price rail and no pan hint".
- [x] **AC-2:** Given a canvas in `loading` mode whose grid overflows its viewport, when the
      overflow is measured, then neither the pan hint nor a reserved line for it is rendered and
      the viewport carries no `cursor-grab` — while `.pannable` (the measured edge fade) still
      applies. *Pinned by:* `beach-map-canvas.spec.ts` › "offers no gesture its inert container
      cannot accept while loading (#749)".
- [x] **AC-3:** Given either label vocabulary, when the rail renders, then its column reserves
      `min-w-[54px]` in both the loading and the loaded state, and the loading chip fills exactly
      that reservation. *Pinned by:* `beach-map-canvas.spec.ts` › "reserves the same rail width
      loading and loaded, for either label vocabulary (#749)".
- [x] **AC-4:** Given `railCodes="letters"` (the default — the two editor surfaces), when the
      rail renders in either state, then it reserves nothing beyond the chip's own `min-w-6`,
      so a placeholder letter chip and a real letter chip are the same width. *Pinned by:*
      `beach-map-canvas.spec.ts` › "a letters rail reserves nothing, so the editors are
      unchanged".
- [x] **AC-5:** Given either surface, either viewport, and row names at either extreme of the
      length the editor allows, when the read lands, then the tile grid slides by exactly
      `max(0, loadedRailWidth − 54)` — 30px less than it did, whatever the venue. *Pinned by:*
      `loading-skeletons.e2e.ts` › "…rail holds its width across the load (#749)" ×8, each
      computing the expectation from the rail that actually rendered.
- [x] **AC-6:** Given the tourist beach map at 390 and the longest row name the editor allows,
      when the read lands, then the tile grid does not move at all (≤1px) — the one case the
      #724 cap closes outright. *Pinned by:* `loading-skeletons.e2e.ts` › "the tourist beach
      map's phone rail does not move at all (#749)".
- [x] **AC-7:** Given the tourist map and the Daily view while loading at 390, when the
      placeholder grid overflows, then no `scroll-hint` is on the page. *Pinned by:*
      `loading-skeletons.e2e.ts` › "no skeleton instructs a gesture its inert container
      cannot accept (#749)".

## Non-goals

- **The price (right) rail's own 52 → 92/128px widening.** It is real (measured above) but it
  shrinks the viewport from the trailing edge; it never slides a tile. Sizing it is the same
  ticket's shape and deserves its own, if anyone wants it.
- **Capping the operator rails.** #724 settled that operator surfaces render whole labels; a
  reservation is a *minimum*, so that stays true — which is exactly why the Daily view keeps a
  bounded residual on a phone rather than reaching zero.
- **Changing the #724 caps themselves** (48px / 96px of text). The reservation is derived from
  them so the tourist rail's worst case is unchanged, not widened.
- **The skeleton row count / tile count** (`MAP_SKELETON_ROWS` stays 4 × 6) and any other
  surface's skeleton geometry.
- **The `vScrollHint` vertical-overflow path** beyond suppressing its sentence while loading.

## Behavior-parity ledger

The canvas's rail is an existing surface whose behavior this slice changes; the loaded state
is not supposed to move except where the plan says it does.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Rail chip prints `row.code` on every surface | **changed** | unchanged when loaded; in `loading` mode the chip renders empty — a placeholder states shape, never content (F-3) |
| Rail column width is content-derived everywhere | **changed** | `letters` keeps it (editors unchanged, AC-4); `labels`/`capped-labels` reserve a width so the grid stops sliding (the ticket's item 4) |
| Tourist chip truncates at 48px / 96px of text | **preserved** | untouched; the reservation sits under the cap as a floor, it does not replace it |
| Operator chips render whole labels (#724) | **preserved** | `labels` reserves a **minimum**; a longer label still widens the rail and renders whole |
| Pan hint appears whenever either axis overflows | **changed** | unchanged when loaded; withheld while loading, where the container is `inert` and the gesture is unfollowable (I-2). Its line is deliberately **not** reserved — see G-1 |
| Viewport shows `cursor-grab` when `dragPan` | **changed** | suppressed while loading, for the same reason as the hint — same false-affordance class |
| `.pannable` (edge fade, `px-4`, `scroll-pl-4`) is applied from a live measurement | **preserved** | still measured in both states; it is the one piece of pan chrome that reports a fact rather than inviting an action |
| `scroll-hint` / `row-code` / `price-col` testids exist while loading | **dropped** | they named live chrome; the loading rail carries `row-code-placeholder` instead, so a spec can still find it |
| `truncateRailCodes` input | **changed** | folded into `railCodes` — the boolean and the new reservation are the same question (what is this rail's vocabulary?), and two inputs that must agree is a defect waiting |
| Frame's top edge holds across the load (#744) | **preserved** | untouched; the existing #744 e2e matrix still runs |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The reservation trades a horizontal jump for a permanently narrower tile viewport (the G-1 failure mode, in reverse) | med | med | **materialized** — the cap-sized reservation cost the 14-column desktop map its fits-whole guarantee (`venue-map-pan.e2e.ts`, #700). Re-sized to the 54px mobile cap as a minimum, which leaves ~13px of that margin | claude | fixed in phase 3 |
| R-2 | Suppressing the hint makes the map card *grow* on load (the hint is inside the frame), moving content below it | high | low | **accepted, and now argued rather than assumed** (G-1): reserving the line instead keys it to the placeholder's overflow, which does not predict the loaded map's, so it can make the card SHRINK — the direction #744 ruled out. Growth is the settle-down direction; stated beside the `@if` and in the e2e | claude | closed — `b83e79e` |
| R-3 | Class strings computed in TS are invisible to a naive Tailwind content scan | low | high | did not materialize — the browser measurements show the reservation actually rendering (54px, 63.14px, 102px), which is the proof a class-list read could not give | claude | closed — `d60219c` |
| R-4 | Replacing `truncateRailCodes` breaks a consumer or spec silently | low | med | did not materialize — the template compiler rejected every stale binding by name, which is how phases 1 and 2 became one commit | claude | closed — `09d67b6` |
| R-5 | A future surface renders a skeleton through the canvas and forgets `loading` | med | low | open by design — the canvas class doc names the trap, and a surface that forgets it renders fabricated row names its own spec would show. No further mitigation without a lint | claude | accepted — documented in `beach-map-canvas.ts` |

## Open questions / Assumptions

### Resolved

- **Assumption (resolved, phase 3):** the reservation is the #724 cap plus padding, at both
  tiers. **Wrong at `sm`** — measured, the desktop map has ~31px of fits-whole margin and the
  102px rail spends 39px of it. Settled at a single-tier `min-w-[54px]`: zero slide on the
  tourist phone, and elsewhere a residual of exactly `max(0, loadedRail − 54)` — a flat 30px
  less than before, on every venue.
- **Assumption (resolved, phase 1):** reserving in the loaded state is in scope. It is — a
  fixed-width placeholder in front of a content-derived rail slides the grid the other way.
- **Assumption (resolved, phase 5 / G-1):** what goes for the rail goes for the pan hint's
  line. **It does not.** The rail's width follows from the vocabulary, which is known before
  the read; the hint's need follows from the loaded map's overflow, which is not — and the
  placeholder's own overflow does not stand in for it. An unpredictable reservation can only
  be wrong upward, the direction #744 ruled out, so the line stays unreserved.

## Availability & concurrency (invariant #2)

N/A — presentation only. No booking, no availability write path, no reservation is reachable
from this change: the rail is `aria-hidden` decoration and the skeleton is `inert`.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The price rail's *chip text* is untouched (its width is a Non-goal).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/beach-map-canvas.ts` + `.html` | existing | standalone component | `input()` (`loading`, `railCodes`) + `computed()` class strings | none |
| FE-2 | `venue/venue-map.html` | existing | template | — | none |
| FE-3 | `operator/daily-view-tab.html` | existing | template | — | none |
| FE-4 | `operator/set-editor.html` | existing | template | — | none |

**Standards:** signal inputs, `computed()` for derived class strings, `@if` control flow,
`class`/`attr` bindings (never `ngClass`), no `changeDetection` or `standalone` declared.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `merge close-out`

**Next action:** none once PR #750 merges — the close-out's remaining items are GitHub-only
(confirm #749 closed, unsubscribe).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the canvas learns it is loading | ✅ | `827d634` |
| 1 — the rail reserves its width | ✅ | `0faec54` |
| 2 — the three surfaces adopt the modes | ✅ | `0faec54` (with phase 1 — see below) |
| 3 — measured in a real browser | ✅ | `6a9a201` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

Phases 1 and 2 landed in one commit on purpose: `railCodes` replaces `truncateRailCodes`,
so the tree does not compile between the canvas change and the consumers' adoption. The
red step still ran first (the canvas specs failed on the unknown input), and the surfaces'
own specs are the green step.

**Sonar gate (PR #750).** Pulled from the API, not the badge, and re-read cache-busted on the
final head: `new_lines` non-empty (90 there, 92 on the head before it), so an analysis really
ran and the false-clean read is ruled out. `issues/search` total **0**; `new_bugs` /
`new_vulnerabilities` / `new_code_smells` / `new_duplicated_blocks` all 0; new-code coverage
**100.0%**, duplication **0.0%**. Nothing to clear.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| C-1 | CI (frontend job, `09d67b6`) — and the local mocked suite, minutes earlier | The cap-sized rail reservation (`sm:w-[102px]`) spent 39px of tile viewport, tipping the 14-column desktop map out of its #700 fits-whole guarantee: `venue-map-pan.e2e.ts` × 2 red | fixed-in-`6a9a201` — reservation re-sized to a single-tier `min-w-[54px]`; risk R-1 closed with the measured margin |

---

## File structure

- `docs/plans/map-canvas-loading-mode.md` — this plan
- `frontend/src/app/shared/beach-map-canvas.ts` — the `loading` + `railCodes` inputs and the
  three computed class strings; `truncateRailCodes` retired
- `frontend/src/app/shared/beach-map-canvas.html` — the placeholder rail, the suppressed
  hint/cursor/testids, the reserved rail column
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — AC-1…AC-4
- `frontend/src/app/shared/map-skeleton.ts` — the codes are keys now, not text; doc only
- `frontend/src/app/shared/map-skeleton.spec.ts` — the uniqueness test says why it still matters
- `frontend/src/app/venue/venue-map.html` — `railCodes="capped-labels"` on both canvases,
  `loading` on the skeleton
- `frontend/src/app/operator/daily-view-tab.html` — `railCodes="labels"` on both, `loading`
  on the skeleton
- `frontend/src/app/operator/set-editor.html` — `loading` on the skeleton (letters is the default)
- `frontend/src/app/venue/venue-map.spec.ts` — the #724 cap assertion moves to the column
- `frontend/e2e/loading-skeletons.e2e.ts` — AC-5…AC-7, the rail-stability matrix

---

## Phase 0 — the canvas learns it is loading

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.ts|.html` · Test
`frontend/src/app/shared/beach-map-canvas.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-1 and AC-2 against a `loading` host.
- [x] **Step 2: Run them, verify they fail** — `npm test -- beach-map-canvas` → FAIL
      (`row-code` present, hint rendered).
- [x] **Step 3: Minimal implementation** — the `loading` input; the placeholder branch in the
      rail; `!loading()` on the hint, the grab cursor, and the price-rail testid.
- [x] **Step 4: Run them, verify they pass.**
- [x] **Step 5: Generalization-audit pass** — population: every surface that renders a
      skeleton *through* a shared component that also draws live chrome.
- [x] **Step 6: Commit.**
- [x] **Step 7: Update the plan-doc execution status** in the same commit window.

## Phase 1 — the rail reserves its width

**Files:** Modify `beach-map-canvas.ts|.html` · Test `beach-map-canvas.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-3, AC-4.
- [x] **Step 2: Run, verify fail.**
- [x] **Step 3:** `railCodes` replaces `truncateRailCodes`; the column/chip/placeholder class
      computeds.
- [x] **Step 4: Run, verify pass.**
- [x] **Step 5–7:** audit, commit, status.

## Phase 2 — the three surfaces adopt the modes

**Files:** Modify `venue-map.html`, `daily-view-tab.html`, `set-editor.html`,
`map-skeleton.ts|.spec.ts` · Test the three surfaces' existing specs

- [x] **Step 1–4:** re-point each canvas; run each surface's unit spec.
- [x] **Step 5–7:** audit, commit, status.

## Phase 3 — measured in a real browser

**Files:** Modify `frontend/e2e/loading-skeletons.e2e.ts`

- [x] **Step 1: Write the failing e2e** — AC-5…AC-7 (rail width + viewport x either side of
      the held read, both viewports, both surfaces).
- [x] **Step 2: Verify it fails on `origin/main`'s canvas** — the pre-fix numbers in the table
      above are that failure, recorded.
- [x] **Step 3–4:** run it green against the new canvas.
- [x] **Step 5–7:** audit, commit, status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | finding F-4 | Every file the red proof checked out of `origin/main` and back — the mechanism is "verified in the working tree, then overwritten", which resembles nothing and shows up in no test | `git show --stat` on the fix commit vs the files the proof touched: `git checkout origin/main -- <5 paths>` … `git checkout HEAD -- src/app/shared src/app/venue src/app/operator` | 5 paths at risk; 3 actually carried unstaged work (`beach-map-canvas.html`, `.ts`, `.spec.ts`) — the other 2 were already committed | All 3 restored in `c7507c9`. The rule this leaves: **commit before proving a test red against another ref**, or the proof silently owns the fix. Reading the commit's own diffstat is what caught it |
| 2026-08-22 | phase 0 | Every template that renders placeholder blocks *through* a shared component which also draws live chrome — the mechanism I-2 needs, not "things that look like skeletons" | `grep -rn "app-beach-map-canvas" --include=*.html frontend/src/app` cross-checked against `grep -rln "appSkeletonBlock" --include=*.html frontend/src/app` | 7 canvas call sites, 3 of them skeleton branches (`venue-map`, `daily-view-tab`, `set-editor`); the other skeleton surfaces (Requests, Payouts, booking, app shell) render blocks directly, with no shared live chrome to inherit | all 3 get `loading`; the rest need nothing — recorded so the next reader does not re-derive the population |

---

## Acceptance-criteria verification (final)

- [x] **AC-1…AC-4:** `npm test -- beach-map-canvas` → PASS.
- [x] **AC-5…AC-7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- loading-skeletons` → PASS.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A) (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled (N/A, frontend-only) (invariant #11).
- [x] **Payment/payout** section filled (N/A) (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — untouched.
- [x] Timezone correct (invariant #6) — untouched.
- [x] Booking codes unguessable (invariant #7) — untouched.
- [x] Flyway migration present for schema changes (invariant #12) — none.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #750`.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
