# The coast picker's ribbon map beside the index — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Behind `?map=sheet`, the shipped coast picker (`app-coast-picker`) gains a 150 px map
ribbon down its left edge — the whole coast fitted tall, one dot per index beach, a leader from
each beach row to its dot, re-laid on scroll and resize — as a second `app-riviera-map` created
with the picker and destroyed with it, while the index stays the accessible structure and the
flag off leaves Discover byte-for-byte untouched.

**Architecture:** The ribbon is the shipped `RivieraMap` in a new bare `ribbon` mode (no skip
control, no control column, no unavailable notice, the credit at its foot at 10 px with its links
out of the tab order, the engine non-interactive); the picker owns the dots and the leaders as
an overlay over the ribbon, projected through `RivieraMap.handle` exactly as the pin layer does,
and one `relayout()` reads the rows' boxes and writes one geometry signal on scroll, resize, camera
move and index change. The ribbon's camera is `fitPins` over the whole catalogue with a dot-sized
pad, never the venues, so the coast's shape is the same whichever beaches have a venue. Nothing
from `claude/map-design-prototype-417sh1` is promoted; the seams are rebuilt.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1161 (epic #1156, follow-up of #1157 / PR #1160); design
record `frontend/src/app/pages/prototype-map/README.md` @ `2cf675da` (PR #1155, never merged)
— § *Q · Shore* (the picker paragraph), § *What Q rests on* item 3 (the result set's own aspect),
Round 8 (the desktop's picker), the file table's `prototype-coast-picker.ts` row.

**Skills consulted:** `riviera-sdlc` (routing + the intake gate — the gate found: (D-1) the
picker mounts only in sheet mode, which the page defines as the flag on **and below `lg`**, so
the popover form under a place button cannot be opened on any shipped surface until #1159's
desktop panel exists — the `lg:` popover skin is added to the component and pinned by class, its
Chromium proof is #1159's; (D-2) the fake engine records creations but exposes nothing on
`window`, so the context count is read as the fake surfaces in the DOM and the release as the
handle's `destroyed()` at the unit seam; (D-3) `fitPins` pads for 44 px pins, and a 150 px ribbon
of 9 px dots needs its own pad; in flight: dependabot bumps and the never-merged prototype draft
#1155 only, no shared frontend file claimed, no Flyway number in play; #1157's close-out is done
and its plan doc is retired here) · `riviera-plan-doc` (this template — forced the ACs to name
the `RivieraMap.handle`/`MapEngine` seams and the e2e geometry, and a parity ledger for the
picker as shipped by #1157) · `tdd` (each phase red first at the named seam: the map mode by DOM
state in `riviera-map.spec.ts`, the pad by a worked example in `camera-fit.spec.ts`, the
picker's ribbon, dots, lit states and teardown by DOM state and the fake handle in
`coast-picker.spec.ts`, the geometry in Chromium by the e2e) · `riviera-review-overlay` (review
gate **ran** at ready-for-review over `565d83cb..01f3a338` via `code-review:code-review` +
the overlay's frontend items: F-1, F-2) · `riviera-docs-freshness` (**ran** over `565d83cb..HEAD`: step
2a found no present-tense contradiction — the glossary's riviera-map entry and ADR-0022's credit
decision hold, the ribbon's credit keeps its links; step 2b's counting sweep found no "the two
maps / contexts" claim; `CONTEXT.md`'s coast-picker entry gains the ribbon and the leader via
`domain-modeling`; 0 other findings) · `domain-modeling` (the glossary edit) · `riviera-local-debug` (unshallowed the clone; Vitest runs
through `ng test --include`, not bare `vitest`; Playwright's Chromium at
`/opt/pw-browsers/chromium` via `PW_CHROMIUM_EXECUTABLE`, 2 workers) · `riviera-frontend` (the
ribbon mode stays in `shared/riviera-map.ts`, the dots and leaders in `pages/home/`; no new
cross-feature edge; the e2e in the mocked suite) · `riviera-tailwind` (the ribbon's `w-[150px]
shrink-0`, the `data-lit:` variant for the lit dot and leader, tokens only — the dot wears the
theme-invariant solid-button pair the here dot wears because it sits on imagery; no `@apply`;
proof by computed geometry in Playwright) · `angular-developer` + angular-cli MCP
(`get_best_practices` v22; `search_documentation`: `afterRenderEffect` phases — the relayout
reads boxes and writes a signal, so it runs as a callback after render and from the DOM events,
never in a `computed`; `viewChild` signal queries; effect `onCleanup` for the camera-move
subscription) · Tailwind docs (`hover-focus-and-other-states`: `data-*` variants and `group`;
`responsive-design`: `lg` = 64rem; `aspect-ratio` and `adding-custom-styles`: `calc()` arbitrary
values) · `playwright-cli` (the mocked e2e: the fake surfaces counted, leader geometry measured
by `getBBox`, a real pointer press held with `mouse.down`).

**Branch:** `claude/tailwindcss-angular-docs-0be79b` (cloud: the designated branch stands in for
`feature/coast-picker-ribbon`; exists before phase 0).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the picker is closed on the sheet page, when it opens, then exactly one
  more map is created and, when it closes, that map's handle is destroyed. *Seam:* `MapEngine`
  (the fake's `created` and the handle's `destroyed()`) · *Pinned by:* `coast-picker.spec.ts`
  › "creates its ribbon map with the picker and destroys it with it"; in Chromium
  `discover-sheet.e2e.ts` › "the picker opens one more map and closes it: the fake surfaces count
  1, 2, 1".
- [ ] **AC-2:** Given the index has beach rows, when the ribbon's map has booted, then there is
  one dot per index beach at its catalogue centre and one leader per beach row, none for a
  region row. *Seam:* `RivieraMap.handle` (`project`) + the picker's DOM · *Pinned by:*
  `coast-picker.spec.ts` › "draws one dot per index beach and one leader per beach row".
- [ ] **AC-3:** Given the picker at 390 × 844 with the sheet fixture, when the ribbon has fitted,
  then every dot lies inside the ribbon's box, every leader's row end lies within its row's box
  and its rightmost x is left of the row's text, and at 320 wide the ribbon is 150 px, every row
  is ≥ 44 px tall and narrower than at 390. *Seam:* the rendered geometry · *Pinned by:*
  `discover-sheet.e2e.ts` › "every beach has a dot in the ribbon and a leader that reaches its
  row" and › "at 320 the ribbon keeps 150 px and the rows narrow".
- [ ] **AC-4:** Given a beach row, when the pointer is over it, it has focus, or it is pressed,
  then its dot and its leader are lit, and a region row lights its beaches' dots; leaving cools
  them; a press still emits the pick. *Seam:* the picker's DOM (`data-lit`) and its `picked`
  output · *Pinned by:* `coast-picker.spec.ts` › "lights a row's dot and leader on hover, focus and
  press, and still picks"; in Chromium `discover-sheet.e2e.ts` › "a held press lights the dot,
  focus lights the leader, and the release picks".
- [ ] **AC-5:** Given the ribbon, then it is `aria-hidden`, takes no pointer, renders no control,
  and the dialog's accessible name set is the shipped one (Close, Near me, the rows); axe and the
  touch-target sweep stay clean. *Seam:* `RivieraMap`'s ribbon mode + the picker's DOM · *Pinned
  by:* `riviera-map.spec.ts` › "in ribbon mode …", `coast-picker.a11y.spec.ts`,
  `discover-sheet.e2e.ts` (the existing picker a11y block + the name-set assertion).
- [ ] **AC-6:** Given the flag off, then Discover renders no picker and no second map; given
  `lg`, the picker's panel carries the popover skin at the same 150 px ribbon. *Seam:* the
  route + the picker's DOM · *Pinned by:* `discover-sheet.e2e.ts` › "the flag off …" (existing),
  `coast-picker.spec.ts` › "wears the popover skin from lg" (class pin — D-1).

## Non-goals

- The poster (#1158), the pin layer's chrome placement and the desktop panel (#1159); the place
  button at `lg` that mounts the popover is #1159's.
- A `Whole coast` map state (cut in the record's rounds 8–10).
- Dots for catalogue beaches without a venue (no row to lead to; the fit still spans the whole
  catalogue so the coast's shape never changes).

## Behavior-parity ledger (retirement / replacement slices only)

The picker as #1157 shipped it is extended, not replaced; every shipped behaviour is preserved:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Named dialog, focus on open, close by button / backdrop / Escape | preserved | untouched; the ribbon is inside the same panel |
| Rows: region + beaches, counts, from-prices, `aria-current`, `picker-row` test ids, 44 px | preserved | untouched markup; the rows' `<ul>` becomes the body's right column and narrows on a narrow phone |
| Near me on top, `aria-pressed` | preserved | untouched |
| No `Whole coast` | preserved | untouched |
| The credit's links focusable | changed (ribbon only) | the ribbon's credit links get `tabindex="-1"`: focusable content inside `aria-hidden` is an axe violation; the ground map's credit keeps its links |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A second WebGL context leaks: the ribbon's handle outlives the picker | low | high (a context per open on a phone) | `RivieraMap` already destroys its handle on `DestroyRef`; AC-1 pins it at the fake handle and the DOM count in Chromium | agent | open |
| R-2 | Focusable content inside the `aria-hidden` ribbon (MapLibre's canvas is `tabindex=0`, the credit's links) | high | medium (axe `aria-hidden-focus`, a keyboard stop on nothing) | ribbon mode passes `interactive: false` to the engine (MapLibre then adds no tabindex) and sets the credit links' `tabindex="-1"`; the a11y specs and the e2e axe run cover the fake, the option pin covers the real engine | agent | open |
| R-3 | The coast does not fit the ribbon on a short body: at the map's `minZoom` 7 the coast is ~500 px tall | medium | low (Velipojë/Ksamil dots clipped on a 320 × 640 phone) | the fit is dot-padded (28 px) and the body takes the sheet's whole height (`flex-basis` of the coast's aspect × 150); AC-3 pins 390 × 844, the record's phone; 320 pins the widths only | agent | open |
| R-4 | Leaders re-laid on every scroll frame cost | low | low | a handful of rows; one `getBoundingClientRect` per row per frame, one signal write | agent | open |
| R-5 | The `lg:` popover skin drifts unproven (D-1) | medium | low (no shipped surface renders it) | class pin now; #1159's e2e proves it in Chromium when the place button exists at `lg` — recorded on #1159 at close-out | agent | open |
| R-6 | Leaders cross a row's text on a dense index | low | medium | leaders end at the gutter (`RIBBON + 16`), the rows' text starts at `RIBBON + 32`; AC-3 asserts every leader's max x < the row's text left | agent | open |

## Open questions / Assumptions

- **Assumption A-1:** the dots are the index's beaches (the ones with a row), positioned at the
  catalogue's hand-recorded centre, and the ribbon's fit spans the whole catalogue — "one dot per
  beach of the catalogue" read as *where the dot's position comes from*, since a dot without a
  row has no leader. — *Owner:* agent · *Resolves by:* review.
- **Assumption A-2 (D-1):** the `lg:` popover skin is the record's (`absolute`, 8 px under the
  anchor, 420 px wide, `min(760px, 100dvh − 140px)` tall, 22 px corners, transparent backdrop)
  and is mounted by #1159 inside a `relative` anchor under the place button; this slice pins the
  classes only. — *Owner:* agent · *Resolves by:* #1159.
- **Assumption A-3 (D-2):** the e2e counts live maps as `riviera-map-fake` surfaces in the DOM
  rather than a `window` counter — the flag arms the fake, the fake mounts one surface per
  creation, and a destroyed picker takes its surface with it. — *Owner:* agent · *Resolves by:*
  review.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the ribbon is a chooser's decoration; no booking path, no
`availability` read or write, no beach-map (venue set) surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| The ribbon mode of the riviera map | `frontend/shared/riviera-map.ts` | the map's own chrome is its own (`riviera-frontend`: `shared/` primitives); the mode is a chrome choice like `foot` |
| Dots + leaders | `frontend/pages/home/coast-picker.ts` | Discover's overlay over the map, as the pin layer is; nothing venue-shaped crosses the map seam |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/riviera-map.ts` + `.html` | existing | component | `ribbon` input; `creditPlacement`/`effectiveOptions` computed | — |
| FE-2 | `shared/map-engine.ts`, `shared/maplibre-map-engine.ts` | existing | port + adapter | `MapEngineOptions.interactive?` passed to MapLibre | — |
| FE-3 | `pages/home/camera-fit.ts` | existing | pure helper | `fitPins(..., pad)` | — |
| FE-4 | `pages/home/coast-picker.ts` | existing | component | `hot` signal, `layout` signal set by `relayout()`, `dots`/`leaders` computed with lit states; `viewChild(RivieraMap)`; `afterRenderEffect` + scroll/resize/`onMove` triggers | — |
| FE-5 | `frontend/e2e/discover-sheet.e2e.ts` | existing | mocked e2e | new describe: the ribbon | — |

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `review gate — findings fixed; Sonar gate next`

**Next action:** CI on the fix push, then the Sonar new-issue list for PR #1162.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the map's ribbon mode + `interactive` | ✅ | `30239420` |
| 1 — `fitPins` pad | ✅ | `b0dcea8b` |
| 2 — the picker's ribbon: mount, teardown, fit | ✅ | phases 2–4 in one commit (one component, one red set) |
| 3 — dots, leaders, lit states | ✅ | same |
| 4 — the popover skin from `lg` | ✅ | same |
| 5 — the mocked e2e: contexts, geometry, press, names | ✅ | (this commit) — 21/21 in `discover-sheet.e2e.ts` locally |
| 6 — close-out: CONTEXT.md, retire the #1157 plan, docs-freshness | ⏳ | docs committed; final state at the last code commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review gate (overlay RV-FE-7, prior-PR reviewer; scored 75) | the lit dot and leader wore the themed accent over map imagery; the map's marks wear the fixed solid-button pair and invert it when lit | fixed — the dot inverts the pair, the leader lights to the full fixed ink; proven by `riviera-map.contrast.spec.ts` › "the inverted pair clears AA", pinned in `coast-picker.spec.ts` |
| F-2 | review gate (code-comment reviewer; scored 50) | `RivieraMap`'s class doc listed the skip control and zoom buttons unconditionally | fixed — the doc names the ribbon's exception |

---

## File structure

- `docs/plans/coast-picker-ribbon.md` — this plan
- `docs/plans/riviera-map-sheet.md` — retired (#1157 merged via PR #1160)
- `CONTEXT.md` — the coast-picker entry gains the ribbon
- `frontend/src/app/shared/map-engine.ts` — `MapEngineOptions.interactive?`
- `frontend/src/app/shared/maplibre-map-engine.ts` — passes `interactive` to MapLibre
- `frontend/src/app/shared/riviera-map.ts|.html` — the `ribbon` mode
- `frontend/src/app/shared/riviera-map.spec.ts` — ribbon-mode pins
- `frontend/src/app/pages/home/camera-fit.ts|.spec.ts` — the `pad` parameter
- `frontend/src/app/pages/home/coast-picker.ts` — the ribbon, dots, leaders, lit states, popover skin
- `frontend/src/app/pages/home/coast-picker.spec.ts` — the pins above
- `frontend/src/app/pages/home/coast-picker.a11y.spec.ts` — providers for the ribbon's map
- `frontend/src/app/pages/home/home.spec.ts` — only if the picker's new providers surface there
- `frontend/e2e/discover-sheet.e2e.ts` — the ribbon describe

---

## Phase 0 — The map's ribbon mode + `interactive`

**Files:** Modify `shared/map-engine.ts`, `shared/maplibre-map-engine.ts`, `shared/riviera-map.ts`,
`shared/riviera-map.html` · Test `shared/riviera-map.spec.ts`

- [ ] **Step 1: Write the failing tests** — "in ribbon mode renders no control and no skip, the
  credit at the foot's left with its links out of the tab order", "in ribbon mode asks the engine
  for a non-interactive map", "in ribbon mode shows no unavailable notice".
- [ ] **Step 2: Run, verify red** — `npx ng test --watch=false --include='**/riviera-map.spec.ts'`
- [ ] **Step 3: Minimal implementation** — `ribbon = input(false)`; `effectiveOptions`;
  `creditPlacement` gains the ribbon arm (and takes the padding/leading with it so no two
  utilities compete); the template gates the skip button, the control column and the notice on
  `!ribbon()`; MapLibre gets `interactive: options.interactive ?? true`.
- [ ] **Step 4: Run, verify green** — same command; then `--include='**/shared/*.spec.ts'`.
- [ ] **Step 5: Generalization-audit** — mechanism: focusable content inside `aria-hidden`;
  population: `grep -rn 'aria-hidden="true"' frontend/src/app --include=*.html --include=*.ts`
  read for descendants that are controls.
- [ ] **Step 6: Commit** — `Give the riviera map a bare ribbon mode (#1161)`
- [ ] **Step 7: Update Execution status**

## Phase 1 — `fitPins` pad

**Files:** Modify `pages/home/camera-fit.ts` · Test `pages/home/camera-fit.spec.ts`

- [ ] Red: "fits the whole catalogue into a 150 × 618 ribbon at a 28 px pad" (worked example:
  `zoomForLng = log2(360·(150−28)/(512·0.65))`, the tighter of the two, ≥ 7).
- [ ] Green: `fitPins(at, width, height, ceiling = FIT_MAX_ZOOM, pad = PAD_PX)`.
- [ ] Commit — `Let fitPins take the pad its dots need (#1161)`.

## Phase 2 — The picker's ribbon: mount, teardown, fit

**Files:** Modify `pages/home/coast-picker.ts` · Test `pages/home/coast-picker.spec.ts`,
`coast-picker.a11y.spec.ts`

- [ ] Red: AC-1 (one creation, `interactive: false`, destroyed with the fixture); the ribbon
  wrapper `aria-hidden`, `pointer-events-none`, 150 px class; the a11y spec with the providers.
- [ ] Green: the body as a row flex (`flex-basis` = 150 × 4.51), the ribbon column with
  `<app-riviera-map [ribbon]="true" />`, the fit on handle arrival and body resize
  (`ResizeObserver`, as the pin layer does).
- [ ] Commit — `Put the coast ribbon down the picker's left edge (#1161)`.

## Phase 3 — Dots, leaders, lit states

**Files:** Modify `pages/home/coast-picker.ts` · Test `pages/home/coast-picker.spec.ts`

- [ ] Red: AC-2 (dot and leader counts, `data-beach`), AC-4 (hover/focus/press lights; region
  lights its beaches; leave cools; press still picks).
- [ ] Green: `hot` signal on the rows' pointer/focus events; `relayout()` on render, scroll,
  resize, `onMove`; the SVG overlay `aria-hidden pointer-events-none`; `data-lit:` utilities.
- [ ] Commit — `Tie every index row to its beach's dot with a leader (#1161)`.

## Phase 4 — The popover skin from `lg`

- [ ] Red: AC-6's class pin. Green: the `lg:` classes on the panel and the backdrop.
- [ ] Commit — `Wear the popover skin from lg on the coast picker (#1161)`.

## Phase 5 — The mocked e2e

**Files:** Modify `frontend/e2e/discover-sheet.e2e.ts`

- [ ] Red (Chromium): the four tests named in AC-1, AC-3, AC-4, AC-5 —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/discover-sheet.e2e.ts`.
- [ ] Green; then the whole `discover-sheet.e2e.ts` and `touch-targets-tourist.e2e.ts`.
- [ ] Commit — `Prove the ribbon's contexts, geometry and press in Chromium (#1161)`.

## Phase 6 — Close-out

- [x] `CONTEXT.md` coast-picker entry; `git rm docs/plans/riviera-map-sheet.md`; docs-freshness
  over the resolved range.
- [ ] The epic checklist; the plan's final state in the last code commit.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-20 | phase 0: focusable content inside an `aria-hidden` box (the ribbon's canvas and credit links) | every `aria-hidden="true"` element in the frontend templates read for a control among its descendants | `grep -rn -A3 'aria-hidden="true"' frontend/src/app --include=*.html --include=*.ts \| grep -E '<button\|<a \|tabindex="0"\|routerLink'` | 4 hits, all icon spans beside a control, none a wrapper | none beyond the ribbon (`interactive: false`, `tabindex="-1"`) |
| 2026-09-20 | phase 3: a signal-write layout read from the DOM after render | overlays projected through `RivieraMap.handle` | `grep -rln 'handle()' frontend/src/app/pages/home` | `venue-pin-layer.ts` (a `computed` over `project`, no DOM read), `coast-picker.ts` | the pin layer needs no DOM read, so its `computed` stands; the picker's row boxes force a `relayout()` after render |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npx ng test --watch=false --include='**/coast-picker.spec.ts'` + the e2e → PASS.
- [ ] **AC-2:** same spec → PASS.
- [ ] **AC-3:** the e2e at 390 and 320 → PASS.
- [ ] **AC-4:** the spec + the e2e → PASS.
- [ ] **AC-5:** `riviera-map.spec.ts`, `coast-picker.a11y.spec.ts`, the e2e a11y block → PASS.
- [ ] **AC-6:** the e2e flag-off test + the class pin → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
