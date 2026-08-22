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
were re-pointed) · `riviera-review-overlay` (review gate — due when the PR is marked ready) ·
`riviera-docs-freshness` (due at close-out over `adc40d9..HEAD`) · `riviera-frontend` (placement: the change is wholly inside
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

Two things the issue did not state, both found here: the tourist rail's mobile jump stops
at 54px because the #724 cap truncates `Front row` (48px of text + 6px of chip padding) —
so on that surface a *fixed* rail is exactly today's worst case, not a new one. And the
**price** rail moves too (52px → up to 92/128px), which shrinks the viewport from the right
without sliding the tiles; out of scope, Non-goals.

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a canvas in `loading` mode, when it renders rows, then no element
      carries `data-testid="row-code"`, `price-col`, or `scroll-hint`, and no rail chip
      contains any text (both rails keep their columns under placeholder testids). *Pinned by:* `beach-map-canvas.spec.ts` › "a loading canvas states
      no row name, no price rail and no pan hint".
- [ ] **AC-2:** Given a canvas in `loading` mode whose grid overflows its viewport, when the
      overflow is measured, then the pan hint is absent and the viewport carries no
      `cursor-grab` — while `.pannable` (the measured edge fade) still applies.
      *Pinned by:* `beach-map-canvas.spec.ts` › "a loading canvas offers no gesture it cannot
      accept".
- [ ] **AC-3:** Given `railCodes="capped-labels"`, when the rail renders, then its column
      width is fixed (`w-[54px] sm:w-[102px]`) in both the loading and the loaded state, and
      the chip ellipsizes inside it. *Pinned by:* `beach-map-canvas.spec.ts` › "a
      capped-label rail reserves the same width loading and loaded".
- [ ] **AC-4:** Given `railCodes="letters"` (the default — the two editor surfaces), when the
      rail renders in either state, then it reserves nothing beyond the chip's own `min-w-6`,
      so a placeholder letter chip and a real letter chip are the same width. *Pinned by:*
      `beach-map-canvas.spec.ts` › "a letters rail reserves nothing, so the editors are
      unchanged".
- [ ] **AC-5:** Given the tourist beach map at 1280 and at 390, when the venue read lands,
      then the tile viewport's left edge has not moved (≤1px). *Pinned by:*
      `loading-skeletons.e2e.ts` › "the tourist beach map's rail holds its width across the
      load (#749)".
- [ ] **AC-6:** Given the operator Daily view at 1280, when the read lands, then the tile
      viewport's left edge has not moved (≤1px); at 390 it moves by at most the residual the
      whole-label rule allows (≤12px, was 39.14px). *Pinned by:* `loading-skeletons.e2e.ts` ›
      "the Daily view's rail holds its width across the load (#749)".
- [ ] **AC-7:** Given the tourist map and the Daily view while loading at 390, when the
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
| Tourist chip truncates at 48px / 96px of text | **preserved** | the cap moves from the text span's `max-w-12 sm:max-w-[96px]` to `max-w-full` inside a column fixed at exactly those values + the chip's 6px padding — same rendered cap, now also a floor |
| Operator chips render whole labels (#724) | **preserved** | `labels` reserves a **minimum**; a longer label still widens the rail and renders whole |
| Pan hint appears whenever either axis overflows | **changed** | unchanged when loaded; suppressed while loading, where the container is `inert` and the gesture is unfollowable (I-2) |
| Viewport shows `cursor-grab` when `dragPan` | **changed** | suppressed while loading, for the same reason as the hint — same false-affordance class |
| `.pannable` (edge fade, `px-4`, `scroll-pl-4`) is applied from a live measurement | **preserved** | still measured in both states; it is the one piece of pan chrome that reports a fact rather than inviting an action |
| `scroll-hint` / `row-code` / `price-col` testids exist while loading | **dropped** | they named live chrome; the loading rail carries `row-code-placeholder` instead, so a spec can still find it |
| `truncateRailCodes` input | **changed** | folded into `railCodes` — the boolean and the new reservation are the same question (what is this rail's vocabulary?), and two inputs that must agree is a defect waiting |
| Frame's top edge holds across the load (#744) | **preserved** | untouched; the existing #744 e2e matrix still runs |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The reservation trades a horizontal jump for a permanently narrower tile viewport (the G-1 failure mode, in reverse) | med | med | reserve exactly the #724 cap, so the tourist worst case is unchanged; measure the viewport width either side of the load at both viewports and record it in the e2e's header | claude | open |
| R-2 | Suppressing the hint makes the map card *grow* on load (the hint is inside the frame), moving content below it | high | low | the #744 contract is the frame's **top** edge, which the hint cannot move; the existing matrix still asserts it. Accepted and stated in the e2e | claude | open |
| R-3 | Class strings computed in TS are invisible to a naive Tailwind content scan | low | high | v4 scans the whole source tree; `scrollbarChrome` is the in-repo precedent. Proven by the browser measurement, not by reading the class list (RV-FE / rule 4) | claude | open |
| R-4 | Replacing `truncateRailCodes` breaks a consumer or spec silently | low | med | it has exactly two references outside the canvas (`venue-map.html`, `beach-map-canvas.spec.ts`); the compiler rejects an unknown input on a signal-input component | claude | open |
| R-5 | A future surface renders a skeleton through the canvas and forgets `loading` | med | low | the placeholder path is a canvas concern now, so the mistake shows as fabricated row names in that surface's own spec; noted in the canvas class doc | claude | open |

## Open questions / Assumptions

- **Assumption:** reserving the rail in the **loaded** state as well is in scope, not a
  separate ticket. The issue leaves it open ("worth deciding at the same time"); the design
  forces it — a fixed-width placeholder in front of a content-derived rail slides the grid
  *left* on a short-labelled venue, which is G-1 again. — *Owner:* claude · *Resolves by:*
  phase 1 (the e2e measures it either way).
- **Assumption:** `54px` / `102px` (from `sm`) is the right reservation, because it is the
  #724 cap plus the chip's own 6px of padding — i.e. the width the tourist rail can already
  reach today. — *Owner:* claude · *Resolves by:* phase 1.

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

**Stage pointer:** `implement (phase 3)`

**Next action:** write the phase-3 e2e (AC-5…AC-7) — rail width and viewport x either
side of the held read, both surfaces, both viewports.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the canvas learns it is loading | ✅ | `827d634` |
| 1 — the rail reserves its width | ✅ | `0faec54` |
| 2 — the three surfaces adopt the modes | ✅ | `0faec54` (with phase 1 — see below) |
| 3 — measured in a real browser | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

Phases 1 and 2 landed in one commit on purpose: `railCodes` replaces `truncateRailCodes`,
so the tree does not compile between the canvas change and the consumers' adoption. The
red step still ran first (the canvas specs failed on the unknown input), and the surfaces'
own specs are the green step.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

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

- [ ] **Step 1: Write the failing specs** — AC-1 and AC-2 against a `loading` host.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- beach-map-canvas` → FAIL
      (`row-code` present, hint rendered).
- [ ] **Step 3: Minimal implementation** — the `loading` input; the placeholder branch in the
      rail; `!loading()` on the hint, the grab cursor, and the price-rail testid.
- [ ] **Step 4: Run them, verify they pass.**
- [ ] **Step 5: Generalization-audit pass** — population: every surface that renders a
      skeleton *through* a shared component that also draws live chrome.
- [ ] **Step 6: Commit.**
- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

## Phase 1 — the rail reserves its width

**Files:** Modify `beach-map-canvas.ts|.html` · Test `beach-map-canvas.spec.ts`

- [ ] **Step 1: Write the failing specs** — AC-3, AC-4.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3:** `railCodes` replaces `truncateRailCodes`; the column/chip/placeholder class
      computeds.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5–7:** audit, commit, status.

## Phase 2 — the three surfaces adopt the modes

**Files:** Modify `venue-map.html`, `daily-view-tab.html`, `set-editor.html`,
`map-skeleton.ts|.spec.ts` · Test the three surfaces' existing specs

- [ ] **Step 1–4:** re-point each canvas; run each surface's unit spec.
- [ ] **Step 5–7:** audit, commit, status.

## Phase 3 — measured in a real browser

**Files:** Modify `frontend/e2e/loading-skeletons.e2e.ts`

- [ ] **Step 1: Write the failing e2e** — AC-5…AC-7 (rail width + viewport x either side of
      the held read, both viewports, both surfaces).
- [ ] **Step 2: Verify it fails on `origin/main`'s canvas** — the pre-fix numbers in the table
      above are that failure, recorded.
- [ ] **Step 3–4:** run it green against the new canvas.
- [ ] **Step 5–7:** audit, commit, status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | phase 0 | Every template that renders placeholder blocks *through* a shared component which also draws live chrome — the mechanism I-2 needs, not "things that look like skeletons" | `grep -rn "app-beach-map-canvas" --include=*.html frontend/src/app` cross-checked against `grep -rln "appSkeletonBlock" --include=*.html frontend/src/app` | 7 canvas call sites, 3 of them skeleton branches (`venue-map`, `daily-view-tab`, `set-editor`); the other skeleton surfaces (Requests, Payouts, booking, app shell) render blocks directly, with no shared live chrome to inherit | all 3 get `loading`; the rest need nothing — recorded so the next reader does not re-derive the population |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-4:** `npm test -- beach-map-canvas` → PASS.
- [ ] **AC-5…AC-7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- loading-skeletons` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A) (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled (N/A, frontend-only) (invariant #11).
- [ ] **Payment/payout** section filled (N/A) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — untouched.
- [ ] Flyway migration present for schema changes (invariant #12) — none.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
