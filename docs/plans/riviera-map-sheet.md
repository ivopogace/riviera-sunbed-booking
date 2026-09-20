# Riviera map sheet on measured chrome, with Near me's three arms — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Behind `?map=sheet`, the shipped Discover page below `lg` becomes Q · Shore's phone and
tablet layout: the live riviera map as the ground under the glass header, the venue cards on a
sheet with three resting heights built from two CSS scroll-snap scrollers, a one-row 78 px head
carrying place · beaches · day, the row as the pin's preview, the shipped chrome measured at
runtime (first row at y 493 at 390, 430, 768 and 820), and Near me with its three arms decided by
the shipped fence rule — while the flag off leaves today's Discover byte-for-byte untouched.

**Architecture:** Nothing from `claude/map-design-prototype-417sh1` is promoted; the seams are
rebuilt as small signal components under `pages/home/` fed by the very cards the list already
renders. The sheet is its own component (`discover-sheet.ts`) owning the two scrollers, the
measured chrome and the detent; the head is its own (`discover-head.ts`); the geometry (rest
points, detent from `scrollTop`, the preview lift's clamp), the camera fit and the located-state
rules are pure, unit-tested helpers, because jsdom cannot lay out a snap scroller. Sheet mode
keeps the shipped whole-coast fetch per date and narrows to the region client-side, so the
head's chips and the coast picker can count every beach without a second request.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1157 (epic #1156); design record
`frontend/src/app/pages/prototype-map/README.md` @ `2cf675da` (PR #1155, never merged) —
§ *Q · Shore*, § *Measured*, § *What Q rests on*, Round 7 § 2, Round 11 § 1–2, Round 14.

**Skills consulted:** `riviera-sdlc` (routing + the intake gate — the gate found three drifts:
there is no coast picker in the shipped tree although the issue calls it "existing" (A-1); the
head's `8 of 11 selling today` needs no clock because the shipped `VenueSummary.salesOpen` is the
server's per-date verdict for invariant #4; the pin's dusk belongs to #1159's "dusk per crowd"
while the row's dusk is this slice's (A-4); in flight: only dependabot bumps and the never-merged
prototype draft #1155, no shared frontend file claimed, no Flyway number in play) ·
`riviera-plan-doc` (this template — forced the behaviour-parity ledger for the flag-on surface
and the geometry ACs to name a pure seam each) · `tdd` (each phase red first at the named seam:
the pure helpers by literal worked examples from the README's tables, the components by DOM
state, the geometry in Chromium by the e2e) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**to run** at close-out over the PR range:
`CONTEXT.md` gains sheet/detent/head; `RESPONSIBILITIES.md` states nothing about Discover's
layout) · `riviera-local-debug` (unshallowed the clone before reading history; Playwright's
Chromium at `/opt/pw-browsers/chromium` via `PW_CHROMIUM_EXECUTABLE`, 2 workers) ·
`riviera-frontend` (every new file is flat under `pages/home/`, pure helpers beside their
component; `withinBounds` and the near-me words are promoted to exports of
`shared/riviera-map.ts`, no new cross-feature edge; the e2e is the mocked suite with the fake
engine armed by `window.__RIVIERA_FAKE_MAP__`, geolocation driven for real through Playwright's
permissions) · `riviera-tailwind` (no `@apply`; the head and the picker rows wear the field skin
`bg-riv-field-fill`/`text-riv-card-ink`, the sheet `appPanelGlass` with its own radius, the
foot's Near me the fixed `--riv-solid-btn-*` pair over imagery; every control `[appTouchTarget]`,
the grabber `data-touch-exempt` because the whole head is the drag surface; dusk is
`saturate-0`, never opacity) · `angular-developer` + angular-cli MCP `get_best_practices` (v22:
signals, `input()`/`output()`, `host` bindings, native control flow, no `standalone: true`) ·
angular-cli MCP `search_documentation` v22 — **`animate.leave`**: applied on the leaving element,
holds it until the longest transition ends, classes given as a string; pair transitions with
`@starting-style` for the enter side; TestBed disables animations by default, so specs assert
removal synchronously — **`afterRenderEffect`**: phases `earlyRead → write → mixedReadWrite →
read`, runs only when its signal dependencies are dirty, browser only, at least once; used for
the chrome measurement (`earlyRead`) and the rest/scroll writes (`write`) — **`linkedSignal`**:
`{source, computation(source, previous)}` resets the value when the source changes, keeping a
spec-visible previous value; used for the dismissed note (source: the position) and the lit row
(source: the pins) — **`viewChild`**: signal query returning `undefined` until the child exists,
read inside effects so a deferred child is followed · tailwindcss.com (Tailwind 4) —
**scroll-snap-type**: `snap-y` = `scroll-snap-type: y var(--tw-scroll-snap-strictness)` and needs
`snap-mandatory`/`snap-proximity` — **scroll-snap-align**: `snap-start` =
`scroll-snap-align: start` — **scroll-snap-stop**: `snap-always` = `scroll-snap-stop: always` —
**overflow**: `overflow-clip` = `overflow: clip`, `overflow-y-auto` = `overflow-y: auto` —
**scroll-behavior**: `scroll-smooth` = `scroll-behavior: smooth` (the CSSOM applies it to
`scrollTo` without an explicit `behavior`; the initial rest passes `behavior: 'instant'`) —
**overscroll-behavior**: `overscroll-contain` = `overscroll-behavior: contain` — **variants**:
`starting:` = `@starting-style`, `motion-safe:` = `@media (prefers-reduced-motion:
no-preference)`, bare `data-foo:` = `[data-foo]`, `aria-[current]` arbitrary, `sm` =
`@media (width >= 40rem)` (so the tab bar's `sm:hidden` hides at 640 and the tablet band
reserves nothing), `group-aria-[…]`, `[&_x]` arbitrary descendant variants ·
`playwright-cli` (the mocked suite: CDP `Input.dispatchTouchEvent` in 10 steps over 150 ms as
the prototype's driver did; `context.setGeolocation` + `grantPermissions(['geolocation'])` for
the three arms; axe via `expectNoSeriousAxeViolations` after animations settle;
`expectTouchTargets` at half, full and with a rail open).

**Branch:** `claude/riviera-map-sheet-1157-7uy3r5` (the session's designated remote branch
stands in for `feature/riviera-map-sheet`).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (rest points on measured chrome):** Given a viewport 844 px tall, a header measured
  at 73 and a tab bar at 61, when the rest points are computed, then full is 117, half is 380,
  peek is 705 and the sheet is 666 px tall; given a tab bar measured at 0 (from `sm`), peek is
  766 and the sheet 727. *Seam:* `pages/home/sheet-geometry.ts#sheetTops` · *Pinned by:*
  `sheet-geometry.spec.ts` ("rests the sheet on the measured chrome"); in Chromium at 390 × 844,
  430 × 932, 768 × 1024 and 820 × 1180 the first card's top is at y 493 and the map shows from 73
  to 380 — `discover-sheet.e2e.ts` ("the sheet rests at half with the first row at y 493 on every
  phone and tablet").
- [ ] **AC-2 (the browser's own latching):** Given the sheet at half, when a CDP touch flicks
  400 px up in 150 ms, then the outer scroller rests at full and the list's `scrollTop` is 0;
  given full, a 200 px flick down in 100 ms rests at half (the half rest is 263 px away and holds
  a fling that has not passed it), a slow 350 px drag (600 ms) rests at half (no fling: the
  nearest rest wins from 87 px past it), and at full a drag on a list scrolled inside scrolls the
  list, never the sheet; below full the list's `overflow` is `clip`. **Rewritten on evidence**
  (F-1): the issue's "350 px down from full rests at half" and the record's "held to about
  3 px/ms" were the prototype's list flipping its overflow mid-gesture, a layout change that cut
  the touch sequence short; a static page with the same scrollers shows Chrome snaps a fling to
  the position nearest its natural end and cannot hold one the finger has already carried past —
  so a 350 px flick down from full rests at peek, by the specification. The hard fling stays
  recorded, not asserted. *Seam:* the outer scroller (`data-testid="sheet-scroller"`,
  `data-detent`) · *Pinned by:* `discover-sheet.e2e.ts` ("flicks rest at full and at half; the
  list scrolls only at full").
- [ ] **AC-3 (grabber and Map pill):** Given half, when the grabber is pressed, then the sheet
  goes to full; pressed again, to half; peek is never a press's target. Given full, the `Map`
  pill is rendered 12 px above the measured tab bar, pressing it rests at half, and the list's
  bottom padding is 68 px so the last card ends above it. *Seam:*
  `DiscoverSheet.detent()` / `go()` and the rendered pill · *Pinned by:* `discover-sheet.spec.ts`
  ("the grabber cycles half and full only", "the Map pill shows at full and returns to half"),
  `discover-sheet.e2e.ts` ("the Map pill never covers the last row").
- [ ] **AC-4 (the rails):** Given the head with rails shown, when `Today ▾` is pressed, then the
  day rail opens with today's chip `aria-current` and scrolled into view, a pick emits the ISO day
  and closes the rail; the beach chip likewise opens the beach rail (`All` + the region's beaches
  with counts), a pick emits the code; given rails hidden (peek), a press emits `railOpened` and
  the page raises the sheet to half before the rail is shown. *Seam:* `DiscoverHead`'s inputs and
  outputs · *Pinned by:* `discover-head.spec.ts` ("the day chip opens its rail…", "the beach
  chip…", "a chip pressed at peek asks for the sheet first"), `home.spec.ts` ("a chip pressed at
  peek raises the sheet to half").
- [ ] **AC-5 (the row is the preview):** Given the sheet at half and a pin pressed, when the
  layer emits `chosen`, then the venue's card carries `aria-current="true"` and `data-selected`,
  the list is lifted so the card is at the list's top (a translate below full, clamped as a
  scroller clamps; the list's real `scrollTop` at full), and no preview card is rendered; a map
  press clears it. *Seam:* `VenuePinLayer.chosen` → `Home` → `DiscoverSheet.revealRow(id)` ·
  *Pinned by:* `home.spec.ts` ("a pin press lights its row and lifts it to the top, no preview
  card"), `sheet-geometry.spec.ts` ("the lift is clamped as a scroller clamps"),
  `discover-sheet.e2e.ts` ("a pin press scrolls its row to the top at half and at full").
- [ ] **AC-6 (Near me's three arms):** Given a position outside `RIVIERA_MAP_OPTIONS.maxBounds`,
  when Near me answers, then the focus, camera and list are unchanged and the shipped `off-map`
  words stand in the head's rail slot until dismissed, raising the sheet from peek; given a
  position inside the fence and farther than 3 km from the nearest beach (Tirana), the title is
  the region of the nearest venue (`Durrës`), the groups are nearest-first with `km` captions and
  the camera fit includes the position; given a position within 3 km of a beach, the beach is the
  title. Denied/unavailable/timeout show the shipped words for each. *Seam:*
  `pages/home/place-groups.ts` (`nearestRegion`, `groupByBeach`, `placeTitle`),
  `shared/riviera-map.ts#withinBounds` + `NEAR_ME_MESSAGES`, `GeolocationGateway` · *Pinned by:*
  `place-groups.spec.ts`, `riviera-map.spec.ts` ("withinBounds is the fence rule"),
  `home.spec.ts` ("Near me from Rome…", "…from Tirana…", "…on Dhërmi…"),
  `discover-sheet.e2e.ts` ("Near me's three arms").
- [ ] **AC-7 (the camera is derived):** Given three pins spanning 0.4° of longitude in a
  390-wide window 251 px tall, when the fit is computed, then the zoom is the tighter of the
  Mercator fits on both axes over 512 px tiles, capped at 14, never below the fence floor, and the
  centre is shifted so the pins land in the window between the header and the foot row, not in
  the viewport's middle under the sheet. *Seam:* `pages/home/camera-fit.ts#fitPins`,
  `#fitInWindow` · *Pinned by:* `camera-fit.spec.ts`.
- [ ] **AC-8 (contrast):** Given the porcelain, riviera and dark stops, when the head's inks on
  the sheet's head glass, the chips' ink on the field fill, the `Map` pill's ink on the accent,
  the foot's Near me on the fixed fill and the dusk row's inks are composited, then every pair is
  ≥ 4.5:1. *Seam:* the token mirrors in `testing/glass-tokens.ts` · *Pinned by:*
  `discover-head.contrast.spec.ts`, `discover-sheet.contrast.spec.ts`, `home.contrast.spec.ts`.
- [ ] **AC-9 (a11y and the flag):** Given the flag on at half, full, with a rail open and with the
  picker open, when axe runs, then no serious/critical violation; every control is 44 × 44
  (`[appTouchTarget]`), the grabber exempt with its reason; given the flag absent, the DOM is the
  shipped Discover (no sheet, the filter bar and the switch present). *Seam:* the rendered
  `Home` · *Pinned by:* `discover-sheet.a11y.spec.ts`, `discover-head.a11y.spec.ts`,
  `coast-picker.a11y.spec.ts`, `home.a11y.spec.ts` ("sheet mode is axe clean"),
  `home.spec.ts` ("without ?map=sheet the page is today's Discover"), `discover-sheet.e2e.ts`
  (axe + `expectTouchTargets`).

## Non-goals

- The poster and the 0-request first paint (#1158): the ground is the live map from the first paint.
- Pill placement around the chrome, the lone-pin side swap, dusk per crowd on the pins, the
  desktop panel from `lg` (#1159): from `lg` the flag shows the shipped layout.
- The header's `data.wide` route flag; removing `/prototype/map` (#1156 follow-ups).
- The coast picker's ribbon map (a second WebGL context); this slice ships the picker as the
  coast index alone (A-1).
- Cards on the desktop panel, whole-coast map states (built and cut in rounds 8–10).

## Behavior-parity ledger

The flag-off surface is untouched. The flag-on surface replaces, below `lg`, the hero, the filter
bar, the List/Map switch and the preview card:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Hero + headline above the list | dropped (flag on) | the map is the first screen; the epic's stated problem |
| Beach / region `<select>`s | changed | the head's place button → coast picker (regions and beaches as rows); the beach chip → beach rail |
| Date `<input type=date>` with `min` and clamp | changed | the day rail offers today + 6 days; the route's `?date` still seeds and is shown as the chip's word when outside the seven |
| Filter change → one request with the filter | changed | one unfiltered request per date; region and beach narrow client-side (the chips and the picker need every count) |
| `?date` route param seeds the day and re-counts on navigation | preserved | the same subscription |
| Live result count `N venues · date` | changed | the head's `8 of 11 selling today` (the shipped `salesOpen` verdict), `N venues` on another day |
| Loading skeletons, empty and error states, Retry | preserved | the same blocks render inside the sheet's list |
| List/Map switch below `lg` | dropped (flag on) | the sheet's three heights replace the switch |
| Preview card over the map on a pin press | dropped (flag on) | the row is the preview: lit and scrolled to the top |
| Beach crumb on the map after a crowd press narrowed the list | changed | the lit beach chip in the head is the way back (`All`) |
| Map's own Near me + zoom column + top-right credit | changed | Near me is the page's, at the foot row; no zoom column (a pinch zooms); the credit at the foot's other side, wrapped to 200 px |
| Escape closes the preview | changed | Escape clears the lit row and closes an open rail |
| Card link → `/venues/:id?date=` | preserved | the same `<li>` template |
| `@defer` the map chunk until the list settled | preserved | the ground defers on the same trigger; a skeleton pane until then |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Nested scroll-snap latching (outer sheet, inner list at `overflow: clip` below full) behaves differently outside Chromium | med | med | the mocked e2e proves Chromium; the mechanism is standard CSS (`scroll-snap-stop: always` on zero-height targets); WebKit noted as unverified in the PR | session | closed — Chromium proven at 390/430/768/820; the record's speed threshold shown to be an artefact (F-1), the e2e asserts only what the specification promises; WebKit stays unverified, stated in the PR |
| R-2 | jsdom lays nothing out, so a component spec cannot prove a rest point or a lift | high | med | geometry lives in pure helpers with literal expected values from the README's tables; the e2e measures the rendered page | session | closed — `sheet-geometry.spec.ts` + the e2e's four viewports |
| R-3 | The chrome is measured through the shell's `.riv-header` / `.riv-tab-bar` class names, a contract across `app.html` and `pages/home` | low | med | one spec pins the two selectors against `app.html` (`app.spec.ts` already queries `.riv-header`); a missing element measures 0, which is the tablet's correct answer | session | closed — `app.spec.ts` ("carries the class names the Discover sheet measures its chrome by") |
| R-4 | CDP touch flicks flake on the CI runner | med | med | 10 steps over 150 ms as the prototype's driver; `expect.poll` on the scroller's `data-detent`; the suite's `retries: 1`; a hard fling is recorded, not asserted | session | open — the flicks assert only rests the specification guarantees regardless of velocity (a 200 px flick cannot pass a rest 263 px away; a slow drag has no fling); watched on CI |
| R-5 | Extracting the card `<li>` into an `ng-template` changes the shipped DOM | low | high | the 1,498-line `home.spec.ts` suite runs untouched and green; `ng-template` + `NgTemplateOutlet` keep the markup byte-identical | session | closed — the shipped describes pass unchanged (only the geolocation fake was added to two providers lists, since the page now injects the gateway); the flag-off e2e case pins the filter bar and switch |
| R-6 | Sonar counts the sheet's list and the grid as duplicated blocks | med | low | one template for the card; the sheet reuses the shipped loading/empty/error blocks | session | open |
| R-7 | The measured rest lands before the DOM has the measured geometry (Round 11's tablet gap) | med | med | the rest is repeated on the next frame when `scrollTop` did not land; pinned at 768 and 820 by the e2e | session | closed — two mechanisms found and fixed (F-2): Chrome's scroll anchoring carried the sheet to full when the spacer's height landed (`overflow-anchor: none`), and a first layout with every rest at offset 0 made the sheet Chrome's tracked snap target (the scroller renders only once the chrome is measured; the rest is confirmed on the next frame) |
| R-8 | Timezone: the head's "today" | low | med | `defaultBookingDate(new Date())` is the shipped Tirane day (#6); the Vitest clock is frozen at Monday 2026-06-15 | session | closed — `discover-head.spec.ts` names the week from the frozen clock |
| R-9 | A focus stranded by a transition (the picker closing, the note dismissed, the Map pill leaving at half) | med | med | `focusMover()` on each leg; axe + the keyboard walk in the e2e | session | open |

## Open questions / Assumptions

- **Assumption A-1:** the issue's "existing coast picker" does not exist in the shipped tree (only
  `prototype-coast-picker.ts` on the never-merged branch); this slice builds the picker as the
  coast index — region rows with their beaches, counts and from-prices, Near me on top, no
  `Whole coast` — and defers the ribbon map (a second WebGL context) to a follow-up issue filed at
  close-out. — *Owner:* maintainer · *Resolves by:* PR review.
- **Assumption A-2:** the flag is the query parameter `?map=sheet` on `/` (no build-time or
  storage flag exists in the tree; a route-data flag cannot vary on one route). — *Owner:*
  maintainer · *Resolves by:* PR review.
- **Assumption A-3:** sheet mode keeps one unfiltered request per date and narrows client-side
  (the prototype's `focus`), so no API change. — *Owner:* session · *Resolves by:* phase 3.
- **Assumption A-4:** the pin's dusk is #1159's ("dusk per crowd"); this slice desaturates the
  row and keeps the shipped `Sales closed` chip on the card. — *Owner:* maintainer · *Resolves
  by:* PR review.
- **Assumption A-5:** the rows are the shipped cards (the issue: "the rows stay cards on the
  sheet"); the README's compact rows are not rebuilt. — *Owner:* session · *Resolves by:* phase 3.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no write, no booking path; the per-venue counts are the
shipped list response, read only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behaviour added or moved.

## Payment & payout

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/home.ts` + `home.html` | existing | page | signals; `sheetMode` from the route's `?map`; `focus` (region/beach/located) computed; `here` + `problem` signals | none |
| FE-2 | `pages/home/discover-sheet.ts` | new | component (`app-discover-sheet`) | `viewport`, `chrome` (measured), `scrolled`, `listShift` signals; `detent` computed; `afterRenderEffect` phases | none |
| FE-3 | `pages/home/discover-head.ts` | new | component (`app-discover-head`) | inputs/outputs; `dayOpen`/`beachesOpen` signals | none |
| FE-4 | `pages/home/coast-picker.ts` | new | component (`app-coast-picker`, dialog) | inputs/outputs | none |
| FE-5 | `pages/home/sheet-geometry.ts`, `camera-fit.ts`, `place-groups.ts` | new | pure functions | — | — |
| FE-6 | `shared/riviera-map.ts` + `.html` | existing | component | `foot` input (phone chrome); `withinBounds`, `NEAR_ME_MESSAGES` exported | none |

## FE↔BE contract

N/A — no contract change; `GET /api/venues?date=` as today.

## Execution status

**Stage pointer:** `implement (phase 5 — gates)`

**Next action:** merge `origin/main`, ready for review, the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — pure helpers + the map's exports | ✅ | `Add the sheet's geometry, camera fit and place helpers (#1157)` |
| 1 — the sheet component | ✅ | `Add the discover sheet: two snap scrollers on measured chrome (#1157)` |
| 2 — the head and the coast picker | ✅ | `Add the one-row head and the coast picker (#1157)` |
| 3 — Home behind the flag: ground, foot chrome, rows, pins, Near me | ✅ | `Put the riviera map under the sheet on Discover behind ?map=sheet (#1157)` |
| 4 — the mocked e2e | ✅ | `Prove the sheet in Chromium: flicks, rails, pins, Near me (#1157)` |
| 5 — gates and close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | the e2e (Chromium) | a 350 px flick down from full rests at peek, not half: Chrome cannot hold a snap position the finger has already passed; the record's speed threshold was the prototype's mid-gesture overflow flip | fixed-in-phase-4 — AC-2 rewritten on the evidence, the e2e asserts the specification's rests |
| F-2 | the e2e (Chromium) | the sheet opened at full on every viewport: scroll anchoring on the spacer's late height, and a first layout with all rests at offset 0 | fixed-in-phase-4 — `overflow-anchor: none`; the scroller renders after the first measurement; the rest confirmed next frame |
| F-3 | the e2e (Chromium) | the credit intercepted Near me: the shipped `max-w-[calc(100%-24px)]` and `text-[12px]` out-ranked the foot's utilities by stylesheet order | fixed-in-phase-4 — both placements are one `[class]` value, no competing utilities |
| F-4 | the e2e (Chromium) | the dot kept its pre-fit projection: the fit effect's `onCleanup` dropped the map's move subscription on its second run | fixed-in-phase-4 — the subscription in its own effect; `home.spec.ts` asserts the dot against a fresh projection |
| F-5 | the e2e (Chromium) | the lift at half could exceed the list's own overflow at full, so the handoff jumped | fixed-in-phase-4 — the lift clamps to the list's overflow at full (the real scroller's clamp) |

---

## File structure

- `docs/plans/riviera-map-sheet.md` — this plan
- `frontend/src/app/pages/home/sheet-geometry.ts|.spec.ts` — rest points from measured chrome, detent from `scrollTop`, the lift's clamp
- `frontend/src/app/pages/home/camera-fit.ts|.spec.ts` — Mercator fit of pins (+ the dot) into the window between header and foot, capped at 14
- `frontend/src/app/pages/home/place-groups.ts|.spec.ts` — distance, nearest region, beach groups nearest-first, the title rule
- `frontend/src/app/pages/home/discover-sheet.ts|.spec.ts|.a11y.spec.ts|.contrast.spec.ts` — the two scrollers, measured chrome, grabber, Map pill
- `frontend/src/app/pages/home/discover-head.ts|.spec.ts|.a11y.spec.ts|.contrast.spec.ts` — the one-row head, its rails, the note slot
- `frontend/src/app/pages/home/coast-picker.ts|.spec.ts|.a11y.spec.ts` — the coast index dialog
- `frontend/src/app/pages/home/home.ts|.html|.spec.ts|.a11y.spec.ts|.contrast.spec.ts` — the flag, the sheet layout, Near me's arms, the card template shared with the grid
- `frontend/src/app/shared/riviera-map.ts|.html|.spec.ts` — `withinBounds` + `NEAR_ME_MESSAGES` exported; the `foot` chrome input
- `frontend/src/app/app.spec.ts` — pins the two chrome selectors the sheet measures
- `frontend/e2e/discover-sheet.e2e.ts` — the mocked e2e at 390, 430, 768, 820
- `CONTEXT.md` — glossary: sheet, detent, head, foot row

---

## Phase 0 — Pure helpers and the map's exports

**Files:** Create `sheet-geometry.ts`, `camera-fit.ts`, `place-groups.ts` + specs · Modify `shared/riviera-map.ts` (exports) · Test `riviera-map.spec.ts`

- [ ] Red: `sheet-geometry.spec.ts` — `sheetTops({viewportH: 844, header: 73, tabBar: 61})` →
  `{full: 117, half: 380, peek: 705, sheetHeight: 666}`; tab bar 0 → peek 766; `detentAt(0)` peek,
  `detentAt(offsetFor('half'))` half, `detentAt(max)` full, the midpoints decide;
  `clampLift(shift, listHeight, room)` clamps 0…max.
- [ ] Red: `camera-fit.spec.ts` — a lone pin gets 12.5; a span wider than tall picks the
  longitude fit; 20 m apart caps at 14; the fence floor wins over a wide pane;
  `fitInWindow` shifts the centre south by the window's offset from the pane's middle.
- [ ] Red: `place-groups.spec.ts` — `distanceKm` Tirana→Golem ≈ 30; `groupByBeach` north→south
  unlocated, nearest-first located with `km`; `placeTitle`: within 3 km → the beach, else the region.
- [ ] Red: `riviera-map.spec.ts` — `withinBounds` accepts a corner, refuses one step outside.
- [ ] Green, `npm test -- --include=src/app/pages/home/*.spec.ts --include=src/app/shared/riviera-map.spec.ts --watch=false`.
- [ ] Commit `Add the sheet's geometry, camera fit and place helpers (#1157)`; open the draft PR.

## Phase 1 — The sheet component

- [ ] Red: `discover-sheet.spec.ts` — renders the outer scroller with `data-detent="half"` after
  the rest; the grabber cycles half ↔ full (spy on `scrollTo`); the Map pill exists at full only
  and rests at half; `revealRow` lifts by the row's offset below full and hands it to the list's
  `scrollTop` at full; the list wears `overflow-clip` below full and `overflow-y-auto` at full;
  `pb-[68px]` on the list.
- [ ] Red: `discover-sheet.a11y.spec.ts` (axe over the sheet with a head and rows projected),
  `discover-sheet.contrast.spec.ts` (grabber bar on the head glass, Map pill ink on the accent).
- [ ] Green; commit `Add the discover sheet: two snap scrollers on measured chrome (#1157)`.

## Phase 2 — The head and the coast picker

- [ ] Red: `discover-head.spec.ts` — title/subtitle; the located glyph; the beach chip's label
  (`⛱ 6` compact, `⛱ All beaches 6 ▾` spelled) and lit state with the beach's count; the day
  rail opens with today current and closes on a pick; the beach rail; `railsShown=false` →
  `railOpened` emitted and nothing rendered; the note in the rail slot with its dismiss.
- [ ] Red: `coast-picker.spec.ts` — rows: Near me, each region with its beaches and counts, no
  `Whole coast`; pick emits; Escape/backdrop close; focus lands in the dialog and back.
- [ ] a11y + contrast specs. Green; commit `Add the one-row head and the coast picker (#1157)`.

## Phase 3 — Home behind the flag

- [ ] Red: `home.spec.ts` — `?map=sheet` renders the sheet and no filter bar; absent → shipped
  DOM; the region defaults to Himarë (or the first present region); the head counts
  `salesOpen === false` as dusk; a pin press lights its row; a chip pressed at peek raises the
  sheet; Near me's three arms with `FakeGeolocationGateway`; a crowd press narrows the beach.
- [ ] Red: `riviera-map.spec.ts` — `foot` input hides the zoom column and puts the credit at the
  foot's left, wrapped to 200 px.
- [ ] Green; commit `Put the riviera map under the sheet on Discover behind ?map=sheet (#1157)`.

## Phase 4 — The mocked e2e

- [ ] `discover-sheet.e2e.ts`: AC-1 at the four viewports; AC-2 flicks; AC-3; AC-4; AC-5; AC-6
  with `setGeolocation`; axe at half/full/rail/picker; `expectTouchTargets`; the network guard
  (no third-party host, no position in any request).
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-sheet.e2e.ts`
- [ ] Commit `Prove the sheet in Chromium: flicks, rails, pins, Near me (#1157)`.

## Phase 5 — Gates and close-out

- [ ] Guards: `node scripts/check-plan-file-structure.mjs --diff origin/main`, inline comments,
  focus posture, touch target; lint, format, `npm test`, `npm run test:a11y`, build.
- [ ] Merge `origin/main`; ready for review; review gate (§1); Sonar gate (§2); close-out (§3).

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-20 | F-3 | a `[class]` binding adding utilities beside static utilities for the same property (`max-w-*`, `text-[..px]`), resolved by stylesheet order | `grep -rn '\[class\]=' frontend/src/app --include=*.html --include=*.ts` then read each for a static twin of the bound property | `riviera-map.html` (the credit — fixed); `home.html` card location `right-[82px]`/`truncate` (no static twin); the head's chips (`CHIP + …`, no static class attr) | one fix; the rest carry no competing static utility |
| 2026-09-20 | F-4 | an effect that subscribes with `onCleanup` while guarding the subscription by identity, so a re-run unsubscribes without re-subscribing | `grep -rn 'onCleanup(' frontend/src/app --include=*.ts` | `venue-pin-layer.ts` (subscribes on every run — correct), `home.ts` (fixed) | one fix |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-9:** to be filled with the commands and the commit at verification.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A.
- [ ] Pool + cutoff honoured (#3, #4 rendered from `salesOpen`). Money minor units (#5, the cards). `Europe/Tirane` reasoned (#6).
- [ ] Modulith section N/A — frontend-only.
- [ ] Payment section N/A.
- [ ] Flyway N/A.
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
