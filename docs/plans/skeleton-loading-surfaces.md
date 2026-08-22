# Skeleton Loading Surfaces: the Four That Still Show a Sentence Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The four loading surfaces that still render a centred one-line sentence — the
tourist beach map, the operator Daily view, Requests and Payouts — render a pulsing
skeleton that mirrors their loaded layout instead, so the app has one loading treatment
rather than a split decided by which slice happened to restyle what.

**Architecture:** The repeated three-utility recipe (`animate-pulse` +
`bg-(--riv-card-track)` + `motion-reduce:animate-none`) becomes one attribute directive,
`shared/skeleton-block.ts` (`appSkeletonBlock`) — so "every skeleton element is
motion-reduce safe" is guaranteed structurally rather than by ~30 hand-copies, which is
exactly the acceptance criterion #744 states. The two **grid** surfaces render their
placeholder tiles *through* `BeachMapCanvas` (the `set-editor.html` precedent), so the
tile size stays the canvas's own `--riv-tile` and cannot drift; the 4 × 6 placeholder
geometry that `set-editor.ts` already carries is promoted to `shared/map-skeleton.ts` so
the third and fourth copies are never written.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only; no tables, no migrations.

**Source of intent:** GitHub issue #744 (raised by the maintainer while reviewing #741 /
PR #743, which normalised the *announcement* on all eight loading surfaces and
deliberately did not touch what they *show*).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced
G-2, the `viewportTabindex` that would put a focusable node inside `aria-hidden`, and
G-5, the one-line rule applying to added `.html` comments) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger, which is what fixed the scope of "mirrors
its loaded layout" per surface) · `tdd` (each surface's skeleton spec written red before
its template branch) · `riviera-review-overlay` (review gate — run at ready-for-review) ·
`riviera-docs-freshness` (**ran** over the slice's own range at merge close-out) ·
`riviera-frontend` (placement: the shared directive + the map-geometry constants belong
in `shared/`, the e2e in the mocked CI suite) · `riviera-tailwind` (rule 1 — share at the
directive layer, never `@apply`; rule 3 — the directive carries no `border-radius`, each
call site sets its own) · `angular-developer` + angular-cli MCP (v22 posture: `host` object
over `@HostBinding`, no explicit `OnPush`, `@for` over a component-owned constant rather
than a template array literal) · `playwright-cli` (the mocked-suite spec that holds a
response open and measures the frame's box either side of the load) · `riviera-local-debug`
(scoped Vitest runs; `PW_CHROMIUM_EXECUTABLE` for the mocked e2e in a cloud session).

**Branch:** `claude/issue-744-51n4oe` — the cloud session's designated remote branch,
standing in for `feature/skeleton-loading-surfaces` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the beach-map read is in flight, when the tourist map renders, then
      it shows a skeleton header panel, overview card and `BeachMapCanvas` tile grid — and
      no `Loading the beach map…` sentence. *Pinned by:* `venue-map.spec.ts` › "renders a
      skeleton mirroring the loaded map while the read is in flight (#744)".
- [x] **AC-2:** Given the Daily-view read is in flight, when the tab renders, then it shows
      a skeleton date/summary card, `BeachMapCanvas` tile grid and arrivals card.
      *Pinned by:* `daily-view-tab.spec.ts` › "renders a skeleton mirroring the loaded day
      while the read is in flight (#744)".
- [x] **AC-3:** Given the Requests read is in flight, when the tab renders, then it shows
      three skeleton request cards. *Pinned by:* `requests-tab.spec.ts` › "renders skeleton
      request cards while the read is in flight (#744)".
- [x] **AC-4:** Given the Payouts read is in flight, when the tab renders, then it shows a
      skeleton hero plus skeleton ledger rows. *Pinned by:* `payouts-tab.spec.ts` ›
      "renders a skeleton hero and ledger rows while the read is in flight (#744)".
- [x] **AC-5:** Given any element carrying `appSkeletonBlock`, when it renders, then its
      class list contains both `animate-pulse` and `motion-reduce:animate-none`.
      *Pinned by:* `skeleton-block.spec.ts` › "pulses, and stops pulsing under
      reduced motion"; re-asserted per surface over every rendered block by each surface's
      "…skeleton is decorative and motion-reduce safe (#744)" spec.
- [x] **AC-6:** Given a loading surface, when it renders, then the skeleton container is
      `aria-hidden="true"` and carries no `aria-live`, and the `#741` announcer specs on
      all four surfaces pass **unmodified**. *Pinned by:* the four existing "announces
      through one region that survives loading → loaded (#741)" specs, untouched by this diff.
- [x] **AC-7:** Given a loading surface, when axe runs over it, then there are no
      violations — in particular no `aria-hidden-focus` (no focusable node inside the
      skeleton). *Pinned by:* a "has no axe violations while the read is in flight (#744)"
      case in each of `venue-map.a11y.spec.ts`, `daily-view-tab.a11y.spec.ts`,
      `requests-tab.a11y.spec.ts`, `payouts-tab.a11y.spec.ts`.
- [x] **AC-8:** Given a held API response in Chromium, when the response is released on
      each of the two grid surfaces, then the beach-map frame is present **both** before
      and after, and its top edge moves by less than the tolerance the spec states.
      *Pinned by:* `frontend/e2e/loading-skeletons.e2e.ts`.

## Non-goals

- **`auth/set-password.ts` keeps its `Loading…` line.** Decided in #744: it is a
  sub-second session restore, where a skeleton reads as a flicker rather than as structure.
- **The three surfaces that already have skeletons** (`pages/home/home.html`,
  `operator/set-editor.html`, `booking/my-bookings.ts`) are the *reference*, not the target.
  They are not restyled, and only `set-editor.ts` is touched — to consume the promoted
  `shared/map-skeleton.ts` constants instead of its own copy.
- **No change to any load, retry, error or empty state**, or to what any surface fetches.
- **No new design token.** Skeletons fill on the existing `--riv-card-track`.
- **`appSkeletonBlock` is not retrofitted onto the pulsing-but-unfilled containers**
  (`home.html`'s card, `set-editor.html`'s panel): the directive means *filled* block, and
  widening it to mean "anything that pulses" would make it two things.

## Behavior-parity ledger (retirement / replacement slices only)

The replaced surface is the centred one-line loading paragraph on four templates.

| Old behavior | Verdict | Note |
|---|---|---|
| Renders visible copy naming what is loading | **dropped** | Deliberate: since #741 the copy is duplicated by `app-load-announcer`, and the paragraph is already `aria-hidden="true"` — so nothing was reading it out. The skeleton's *shape* carries what is coming. |
| `aria-hidden="true"` on the loading node | **preserved** | Moves to the skeleton container; RV-FE-10 / AC-6. |
| `data-testid="<surface>-loading"` on the loading node | **preserved** | Kept verbatim on the new container, which is what lets the four #741 announcer specs pass unmodified. |
| Occupies the loading branch of the surface's `@if` chain | **preserved** | Same branch, same condition; only its contents change. |
| Error / not-found / empty branches | **preserved** | Untouched. |
| `set-editor.ts`'s `skeletonRows` / `skeletonTiles` fields | **changed** | Same values, sourced from `shared/map-skeleton.ts`; `set-editor.spec.ts` and `layout-editor.spec.ts` pass unmodified. |

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | A focusable node inside `aria-hidden="true"` (axe `aria-hidden-focus`) — the Daily view's loaded canvas sets `[viewportTabindex]="0"` | Medium | High (a11y regression) | The skeleton canvas passes no `viewportTabindex`; AC-7 runs axe on the loading state of all four. |
| R-2 | The skeleton misses the loaded layout badly enough that the jump it was meant to remove stays | Medium | Medium | AC-8 measures the frame's box either side of a held response in a real browser. |
| R-3 | Touching four templates breaks the #741 announcer specs, hiding an announcement regression behind a styling change | Low | High | AC-6: those four specs must pass **unmodified**; the testids are preserved for exactly this. |
| R-4 | The new `appSkeletonBlock` becomes a second spelling of a recipe three surfaces already inline | Low | Low | The directive's host classes are byte-identical to the inlined recipe, so the rendered DOM has one spelling; the Non-goals fix where it does and does not apply. |
| R-5 | An added multi-line `.html` comment fails `check-inline-comments.mjs` | Medium | Low | Every comment this diff adds is one line; the guard runs as a `PostToolUse` hook and in CI. |

## Open questions / Assumptions

- **A-1:** "Mirrors its loaded layout" is read per surface as *the blocks the loaded branch
  renders, at their real sizes* — not a pixel replica of content nobody has fetched yet.
  The parity ledger and AC-1…AC-4 fix what that means for each of the four.
- **A-2:** Payouts' skeleton mirrors the **hero + ledger rows**, not only rows as #744's
  one-line scope sketch says. The hero is the tallest block in the loaded branch and the
  one that reflows hardest; leaving it out would reproduce the jump the issue is about.
  Recorded as a widening of the sketch, within its stated rationale.

### Resolved

- **Q-1 (grill, resolved from the code):** do the #741 announcer specs constrain the
  markup? Yes — all four assert `[data-testid="<surface>-loading"]` exists and is
  `aria-hidden="true"`. Keeping the testid on the skeleton container satisfies #744's
  "keep passing unmodified" directly. → AC-6.
- **Q-2 (grill, resolved from the code):** is anything else in flight that touches these
  files? No — every open PR is Dependabot; no Flyway number is at stake (frontend-only).

## Availability & concurrency (invariant #2)

N/A — presentation only. No surface in this diff reads, writes, or renders a different
`availability(set_id, booking_date)` answer; the loaded branches are untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file, port, event, or module boundary is touched.

### Module ownership (§4a)

N/A — no backend behavior is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. The Payouts tab's **loading** branch gains a skeleton; every rendered
amount stays the server's own (invariant #9), and the skeleton renders no figure at all.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/skeleton-block.ts` | new | attribute directive | none (host classes only) | — |
| FE-2 | `shared/map-skeleton.ts` | new | constants | none (frozen literals) | — |
| FE-3 | `venue/venue-map.html` + `.ts` | existing | standalone component | signals | — |
| FE-4 | `operator/daily-view-tab.html` + `.ts` | existing | standalone component | signals | — |
| FE-5 | `operator/requests-tab.html` + `.ts` | existing | standalone component | signals | — |
| FE-6 | `operator/payouts-tab.html` + `.ts` | existing | standalone component | signals | — |
| FE-7 | `operator/set-editor.ts` | existing | standalone component | signals | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, host bindings in the `host` object. The placeholder slot counts are component-owned
`readonly` constants, never array literals in the template (a literal allocates per
change-detection tick and defeats `@for`'s tracking).

## FE↔BE contract

N/A — no contract change. No request, response shape, or endpoint is touched.

## Execution status

**Stage pointer:** `CI gate — draft PR #748 open`

**Next action:** watch PR #748's CI to green, then mark it ready for review, which is
what makes the review gate (`/code-review` + `riviera-review-overlay`) and the Sonar
gate due.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the shared skeleton primitives | ✅ | |
| 1 — the two grid surfaces | ✅ | |
| 2 — the two list surfaces | ✅ | |
| 3 — mocked e2e for the grid surfaces | ✅ | |
| — post-implement: drop the copied `.map-head` marker | ✅ | `425733f` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none raised | — |

---

## File structure

- `docs/plans/skeleton-loading-surfaces.md` — this plan
- `frontend/src/app/shared/skeleton-block.ts` — the `appSkeletonBlock` directive · `skeleton-block.spec.ts`
- `frontend/src/app/shared/map-skeleton.ts` — the shared 4 × 6 placeholder geometry · `map-skeleton.spec.ts`
- `frontend/src/app/venue/venue-map.html` — skeleton replaces the centred line
- `frontend/src/app/venue/venue-map.ts` — the placeholder rows the skeleton renders
- `frontend/src/app/venue/venue-map.spec.ts` · `frontend/src/app/venue/venue-map.a11y.spec.ts` — AC-1, AC-5, AC-7
- `frontend/src/app/operator/daily-view-tab.html` · `.ts` · `.spec.ts` · `.a11y.spec.ts` — AC-2, AC-5, AC-7
- `frontend/src/app/operator/requests-tab.html` · `.ts` · `.spec.ts` · `.a11y.spec.ts` — AC-3, AC-5, AC-7
- `frontend/src/app/operator/payouts-tab.html` · `.ts` · `.spec.ts` · `.a11y.spec.ts` — AC-4, AC-5, AC-7
- `frontend/src/app/operator/set-editor.ts` — consumes `shared/map-skeleton.ts` instead of its own copy
- `frontend/e2e/loading-skeletons.e2e.ts` — AC-8, the mocked-suite anti-jump proof

---

## Phase 0 — The shared skeleton primitives

**Files:** Create `frontend/src/app/shared/skeleton-block.ts` · `skeleton-block.spec.ts` ·
`map-skeleton.ts` · `map-skeleton.spec.ts` · Modify `frontend/src/app/operator/set-editor.ts`

- [ ] **Step 1:** Write `skeleton-block.spec.ts` red — a host element with
      `appSkeletonBlock` carries `animate-pulse`, `bg-(--riv-card-track)` and
      `motion-reduce:animate-none`, and carries **no** `rounded-*` (riviera-tailwind rule 3).
- [ ] **Step 2:** Run `npx vitest run src/app/shared/skeleton-block.spec.ts` → FAIL (no module).
- [ ] **Step 3:** Implement the directive (host `class` string only).
- [ ] **Step 4:** Write `map-skeleton.spec.ts` red — `MAP_SKELETON_ROWS` is 4 rows whose
      `tileCount` equals `MAP_SKELETON_TILES.length`, each with a unique `code`, no
      `priceLabel`, and `zoneStart` true.
- [ ] **Step 5:** Implement `map-skeleton.ts`; point `set-editor.ts` at it.
- [ ] **Step 6:** `npx vitest run src/app/shared/ src/app/operator/set-editor.spec.ts src/app/operator/layout-editor.spec.ts` → green, both existing specs unmodified.

## Phase 1 — The two grid surfaces

**Files:** Modify `venue-map.html` · `venue-map.ts` · `daily-view-tab.html` · `daily-view-tab.ts`
· Test `venue-map.spec.ts` · `venue-map.a11y.spec.ts` · `daily-view-tab.spec.ts` · `daily-view-tab.a11y.spec.ts`

- [ ] **Step 1:** Red specs for AC-1, AC-2, AC-5, AC-7 (per surface).
- [ ] **Step 2:** Replace each centred `<p>` with the skeleton branch — same
      `data-testid`, same `aria-hidden`, `BeachMapCanvas` + `appBeachMapRow` for the tiles,
      **no `viewportTabindex`** (R-1).
- [ ] **Step 3:** `npx vitest run src/app/venue src/app/operator/daily-view-tab.spec.ts src/app/operator/daily-view-tab.a11y.spec.ts` → green, incl. the untouched #741 specs.

## Phase 2 — The two list surfaces

**Files:** Modify `requests-tab.html` · `.ts` · `payouts-tab.html` · `.ts` · Test their specs

- [ ] **Step 1:** Red specs for AC-3, AC-4, AC-5, AC-7.
- [ ] **Step 2:** Replace each centred `<p>` with skeleton cards / hero + rows.
- [ ] **Step 3:** `npx vitest run src/app/operator/requests-tab.spec.ts src/app/operator/requests-tab.a11y.spec.ts src/app/operator/payouts-tab.spec.ts src/app/operator/payouts-tab.a11y.spec.ts` → green.

## Phase 3 — The mocked-suite anti-jump proof

**Files:** Create `frontend/e2e/loading-skeletons.e2e.ts`

- [ ] **Step 1:** Hold the venue and console reads open with `page.route`; assert the frame
      renders with skeleton tiles and the old sentence is gone.
- [ ] **Step 2:** Measure the frame's box, release, re-measure, assert the top edge moved
      less than the stated tolerance; run `expectNoSeriousAxeViolations` on the loading state.
- [ ] **Step 3:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts loading-skeletons` → green.

---

## Generalization-audit log

| # | Trigger | Mechanism-named population + the command that found it | Decision |
|---|---|---|---|
| G-1 | #744 itself is a generalization: three surfaces had a skeleton, five did not | Population = every template branch whose only content is a centred loading sentence — `grep -rn 'Loading' frontend/src/app --include=*.html --include=*.ts \| grep -i 'testid=.*loading'` | Five found; four in scope, `set-password.ts` excluded by the issue with a stated reason. |
| G-2 | The pulse recipe is inlined per element | Population = every element carrying `animate-pulse` — `grep -rn 'animate-pulse' frontend/src/app` | The four surfaces in scope take the directive; the three reference surfaces keep their inlined recipe (Non-goals) — the directive's host classes render byte-identically, so the DOM has one spelling either way. |
| G-3 | `set-editor.ts` owns a 4 × 6 placeholder geometry this slice needs twice more | Population = every reference to `BeachMapCanvasRow` outside the canvas — `grep -rln 'BeachMapCanvasRow' frontend/src/app` | Promoted to `shared/map-skeleton.ts`; four consumers, one definition. |

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `venue-map.spec.ts` › "renders a skeleton mirroring the loaded map…" | ✅ |
| AC-2 | `daily-view-tab.spec.ts` › "renders a skeleton mirroring the loaded day…" | ✅ |
| AC-3 | `requests-tab.spec.ts` › "renders skeleton request cards…" | ✅ |
| AC-4 | `payouts-tab.spec.ts` › "renders a skeleton hero and ledger rows…" | ✅ |
| AC-5 | `skeleton-block.spec.ts` (3 cases) + the four per-surface "…decorative and motion-reduce safe (#744)" specs | ✅ |
| AC-6 | the four #741 announcer specs — byte-unchanged in the diff | ✅ |
| AC-7 | the loading-state axe case in each of the four `*.a11y.spec.ts` | ✅ |
| AC-8 | `e2e/loading-skeletons.e2e.ts` — measured shift 10.2px (tourist map), 0.75px (Daily view); tolerance 32px | ✅ |

Full frontend suite: 1632 tests / 178 files green; `npm run lint`, `npm run format:check`
and `npm run build` clean; the two new mocked-suite e2e specs green in Chromium.

## Self-review checklist (before merge / PR)

- [x] Every AC ticked, with its pin naming a test that exists
- [x] The four #741 announcer specs are byte-unchanged in the diff
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean (plan doc staged)
- [x] `node scripts/check-inline-comments.mjs`, `check-touch-target.mjs`, `check-focus-posture.mjs` clean
- [x] `npm run lint` + `npm run format:check` clean
- [x] No fresh `.scss`; no `@apply`
- [x] Open questions empty or each citing a follow-up issue
