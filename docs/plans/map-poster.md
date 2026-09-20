# The riviera map poster: one still per region, beach and width bucket, and the live map's swap-in — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Behind `?map=sheet` on a phone or tablet, Discover's first paint draws the region's map
as one committed JPEG (0 requests under `/map/**`, 0 WebGL contexts) with the shipped pin layer
live over it through a still-image `MapHandle`, and the live map swaps in at the poster's exact
camera the first time anything has to move the camera.

**Architecture:** **Rendering path — build-time posters from the committed extract, not a runtime
renderer.** The extract is a committed, versioned file (`platform/map/`, ADR-0022 decision 4) and
the catalogue that names every region and beach is a committed file too (`shared/beaches.ts`), so
everything a poster depends on is known before any request: a renderer script
(`frontend/scripts/render-map-posters.mjs`, the shipped form of the prototype's
`shoot.mjs --posters`) drives the image's Chromium over MapLibre + the pmtiles protocol fed from
`platform/map/` and screenshots one JPEG per catalogue entry × width bucket × device pixel ratio
into `frontend/public/posters/`, which the SPA build ships as static files served by
`SpaWebConfig` — under `/posters/**`, never `/map/**`, so the first paint's map-request count is
exactly what the AC asserts. A runtime renderer (a headless browser or a server-side raster
renderer per request) was the alternative: it would add a rendering service to the deploy for a
picture that only changes when the extract does, and it cannot beat "one static file" on the
first paint. The posters are regenerated with the extract (runbook), and a Vitest spec fails CI
when a catalogue entry has no poster.

The poster's camera is slice 1's fit function (`fitInWindow`) over the **catalogue's own
geometry** — the region's beach centres, or the one beach's centre — into the pin window between
the header and the foot row (73 → 324 px at half), so the renderer and the page compute the same
camera from the same committed inputs, with no manifest file between them. The runtime venue set
is not knowable at build time, so the poster frames the catalogue and the page checks that every
pin and the tourist's dot project inside the poster's window; when any falls outside, the ground
is the live map from the first paint. `PosterHandle` (`shared/poster-handle.ts`) is the
`MapHandle` over the still: `project` is Web Mercator arithmetic for the poster's camera;
`easeTo`/`zoomIn`/`zoomOut` report the wanted move to the page, which swaps the live map in.
Two width buckets cover the sheet layout's whole range (`< lg`): 440 × 960 (phones 320–440,
fitted for 390) and 834 × 1210 (tablets 441–834, fitted for 768); above 834 the ground is live
from the first paint. Each at 2× and 3×, chosen by `srcset` density descriptors.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1158 (epic #1156, slice 2, after #1157 / PR #1160 and #1161 /
PR #1162); design record `frontend/src/app/pages/prototype-map/README.md` @ `2cf675da` (PR
#1155, never merged) — § *Q · Shore* (the poster paragraph), § *Measured: geometry and cost*
(the phone and tablet cost tables), § Round 11 § 1 (the ground goes live above 440) and § 4 (the
seam at full, ΔRGB 15.3), § Round 14 § 1 (the fit above the foot row, `posterCamera`) and § 2
(the located state on the poster); `prototype-poster.ts` (`PosterHandle`, `posterCamera`),
`shoot.mjs --posters` (the renderer).

**Skills consulted:** `riviera-sdlc` (routing + the intake gate — the gate found: (D-1) the
prototype's posters were fitted to fixture venues, which a build-time renderer cannot know, so
the poster camera is the catalogue's fit and the page guards the pins and the dot against the
frame; (D-2) the issue's "rendered at the sheet's full height" is read as the viewport's whole
height under the sheet, so each bucket carries a height that covers its tallest device and the
poster is top-anchored — a probe render from the real extract measured 61–81 kB (2×) and
110–145 kB (3×) for Himarë at 440 × 960, and pre-blurring the under-sheet band saved only ~20 %,
so the posters are rendered sharp; (D-3) MapLibre 6.9's `dist/` ships an ESM bundle with named
exports only and validates a style's sprite URL as absolute before any request hook, so the
renderer imports `* as maplibregl` and rewrites the style with `transformStyle` exactly as the
shipped adapter does; (D-4) the `?live=1`-style control is the swap itself: the pins' boxes are
measured on the poster and again on the live map that took over at the same camera — no
production flag; in flight: dependabot bumps (#1145–#1154) and the never-merged prototype draft
#1155 only, no shared frontend file claimed, no Flyway number in play; #1161's close-out is
done — epic checklist ticked, issue closed; its plan doc is retired here) · `riviera-plan-doc`
(this template — forced the ACs to name `MapHandle`, `MapEngine`, the route and the file set as
seams, and the parity ledger for the sheet's ground as #1157 shipped it) · `tdd` (each phase red
first at the named seam: the still handle by projection arithmetic against the fake engine's,
the poster set by the catalogue, the page's swap by the fake engine's `created` and the pins'
positions, the cost in Chromium by the e2e) · `riviera-review-overlay` (review gate: due at
ready-for-review) · `riviera-docs-freshness` (**ran** over `197f0fb5..HEAD`: step 2a found one present-tense fact — the runbook § *Where the pins live* placed `RIVIERA_MAP_OPTIONS.maxBounds` in `riviera-map.ts`, now `riviera-map-options.ts`, patched in place; step 2b's counting sweep: ADR-0022's "two locks" and "two outbound references" still hold, `map-engine.ts`'s "a real and a fake adapter" counts engines, not handles; the retired ribbon plan is cited nowhere outside `docs/plans/`; 0 other findings) · `riviera-local-debug`
(unshallowed the clone; Vitest through `npx ng test --include`; Playwright's Chromium at
`/opt/pw-browsers/chromium` via `PW_CHROMIUM_EXECUTABLE`, 2 workers; the renderer uses the same
binary) · `riviera-frontend` (the still handle is a pure Mercator adapter → `shared/`; the poster
catalogue, buckets and the swap are Discover's → `pages/home/`; the credit pill becomes a
`shared/` primitive both the map and the poster ground render; the renderer is build tooling
under `frontend/scripts/`; the e2e stays in the mocked suite) · `riviera-tailwind` (the poster is
a top-anchored, horizontally centred `<img>` with `max-w-none -translate-x-1/2 select-none`; the
ground button `touch-none cursor-grab`; the fade `motion-safe:transition-opacity duration-300`
under `animate.leave`; tokens only — the credit keeps the fixed solid-button pair; the touch
floor via `[appTouchTarget]`) · `angular-developer` + angular-cli MCP (`get_best_practices` v22;
`search_documentation`: `@defer (when …)` is one-shot and its dependencies load only on the
trigger, so the live map's chunk is never fetched while the poster covers; `animate.leave` keeps
the element until the longest transition on it ends and removes it, so the poster fades out and
leaves the DOM without a timer; `afterRenderEffect` phases — the camera effect writes to the
engine and reads nothing from the DOM, so it stays in the `write`-free callback form slice 1
used; `effect(onCleanup)` for the handle's `onMove` subscription; `linkedSignal` keeps the
selection linked to the pin set; `NgOptimizedImage`'s default loader returns `src` unchanged for
every `ngSrcset` candidate, so distinct per-density files need a plain `<img srcset>` — recorded
as the deviation from "NgOptimizedImage for static images", with `fetchpriority="high"` and
`loading="eager"` set by hand since the poster is the LCP element) · Tailwind docs
(`max-width`: `max-w-none` → `max-width: none`; `translate`: `-translate-x-1/2` →
`translate: calc(1/2 * -100%) var(--tw-translate-y)`; `touch-action`: `touch-none` →
`touch-action: none`; `transition-property`: `transition-opacity` with `duration-300`;
`hover-focus-and-other-states`: `motion-safe` = `@media (prefers-reduced-motion: no-preference)`,
`data-*` variants; `pointer-events`; `user-select`: `select-none`) · `playwright-cli` (the mocked
e2e: the request count under `/map/**` and the WebGL-context count from an init script that
wraps `HTMLCanvasElement.prototype.getContext`, the REAL adapter fed by `mockMapResources` so a
mounted map would show up in both counts; CDP touch for the drag and the peek pull) · `grilling`
(the intake interrogation, answered from the tree: D-1…D-4 above and A-1…A-3 below).

**Branch:** `claude/sunbed-poster-rendering-labg98` (cloud: the designated branch stands in for
`feature/map-poster`; exists before phase 0).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the sheet flag at 390 × 844 and a venue list on Himarë, when Discover first
  paints, then the page makes 0 requests under `/map/**`, creates 0 WebGL contexts and loads
  exactly one image under `/posters/`, and the pin layer draws the region's pins over it.
  *Seam:* the route (`/?map=sheet`) + the network + `HTMLCanvasElement.getContext` · *Pinned
  by:* `discover-sheet.e2e.ts` › "the first paint is a poster: 0 map requests, 0 WebGL contexts,
  one image" (real adapter, `mockMapResources`); `home.spec.ts` › "opens on the poster: no
  engine created, the pins drawn through the still handle".
- [ ] **AC-2:** Given the poster on screen, when the live map takes over at the poster's camera,
  then every pin's bounding box on the live map equals its box on the poster within 1 px.
  *Seam:* `MapHandle.project` (the still handle against the fake engine's Mercator) ·
  *Pinned by:* `poster-handle.spec.ts` › "projects where the fake engine projects for the live
  view it hands over"; `discover-sheet.e2e.ts` › "a drag on the ground swaps the live map in
  with the pins where they were".
- [ ] **AC-3:** Given the poster, when a crowd pill is pressed, a finger goes down on the ground,
  or the sheet is pulled below half, then the live map is created with the poster's camera as
  its view, the poster leaves once the map has loaded, and afterwards the crowd's move is
  replayed / nothing moves / the fit for the window the sheet leaves eases in respectively.
  *Seam:* `MapEngine.create` (the fake's `created[].options.view`) + `MapHandle.view()` ·
  *Pinned by:* `home.spec.ts` › "a crowd press wakes the live map at the poster's camera and
  replays the press", › "a finger on the ground wakes the live map and moves nothing", › "the
  sheet pulled below half wakes the live map and fits the window it leaves";
  `discover-sheet.e2e.ts` › "a crowd press, a drag and a peek pull each swap the live map in
  at the poster's camera".
- [ ] **AC-4:** Given the catalogue, then a poster file exists for every region and every beach
  at both buckets and both densities (172 files), and the set weighs under its budget.
  *Seam:* `POSTER_SET` (the catalogue → file names) + the file system · *Pinned by:*
  `map-poster-set.spec.ts` › "every catalogue entry has its posters" and › "the set stays under
  budget".
- [ ] **AC-5:** Given a viewport wider than the widest bucket (835–1023) or taller than its
  bucket, then no poster is shown and the live map is the ground from the first paint; given a
  narrower one, the poster is centred with no pane fill either side. *Seam:* `posterFor()` +
  the route · *Pinned by:* `map-poster.spec.ts` › "picks the narrowest bucket that covers the
  viewport, none above the widest"; `home.spec.ts` › "above the widest bucket the live map is
  the ground from the first paint"; `discover-sheet.e2e.ts` › "at 900 wide the ground is live
  from the first paint" and the 320/430/768/820 first-paint block (poster present, no fill).
- [ ] **AC-6:** Given located at Dhërmi or at Tirana, then the poster stays (Himarë's / Durrës's)
  and the dot is drawn on it through the still handle; given located inside the fence where the
  nearest region's poster does not frame the dot, then the live map opens at the fit that
  includes the dot. *Seam:* `MapHandle.project` + `MapEngine.create` · *Pinned by:*
  `home.spec.ts` › "located at Tirana keeps the Durrës poster and draws the dot on it", › "located
  off the poster opens the live map at the fit that holds the dot".
- [ ] **AC-7:** Given the poster, then the OpenMapTiles and OpenStreetMap credit stands on the
  foot row with both links. *Seam:* the ground's DOM (`map-attribution`) · *Pinned by:*
  `home.spec.ts` › "carries the tiles' credit over the poster"; the e2e first-paint block's
  foot-row assertions (unchanged).

## Non-goals

- Pill placement around the chrome, the lone-pin side swap and the desktop panel (#1159); the
  desktop's ground is always live.
- A poster for a viewport above 834 px wide or taller than its bucket (live from the first paint).
- A runtime renderer; a poster manifest file; a `?live=1` production flag.
- Re-fitting the poster to the runtime venue set (the poster frames the catalogue; a venue outside
  the frame makes the ground live).

## Behavior-parity ledger (retirement / replacement slices only)

The sheet's ground as #1157 shipped it (the live map from the first paint) is replaced on a phone
and tablet by the poster until the first camera move; every shipped behaviour is preserved:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| The pins crowd, price, press and narrow the list | preserved | the same `VenuePinLayer`, projected through `PosterHandle` (Mercator for the poster's camera) until the swap |
| The fit into the window between the header and the foot row | preserved | the poster is rendered at that fit; after a swap the fit effect runs only when the detent, the targets or the viewport changed since the poster framed them |
| Near me's three arms | preserved | the dot projects through the still handle; the poster is kept while it frames the dot, else the live map opens at the fit that holds it |
| The foot row: Near me right, the credit left | preserved | both stand outside the deferred map block now; the credit is `app-map-credit`, the same markup the map renders |
| A tap on the map closes the lit row | preserved | the ground button's click clears the selection (and its pointerdown wakes the map) |
| The map placeholder skeleton while the chunk loads | changed | shown only when the ground is live from the first paint; under the poster there is nothing to wait for |
| Map click → `closePreview` on the live map | preserved | unchanged once the live map is up |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The pins jump at the swap: the live map's camera differs from the poster's | medium | high (the whole point of the poster) | the live view is `PosterHandle.liveView(pane)` — the geography at the pane's centre — and the camera effect skips a fit whose key (detent, targets, viewport) the poster already framed; AC-2/AC-3 pin it at the fake engine and in Chromium | agent | closed — `home.spec.ts` › "a finger on the ground …" and the e2e › "a drag on the ground …": every pin within 1 px |
| R-2 | A poster with pane fill either side (the round-11 tablet defect) | low | medium | buckets cover 320–834; `posterFor` returns none above; AC-5 | agent | closed — the first-paint block asserts the poster's box spans the pane at 320/390/430/768/820; 900 is live |
| R-3 | The poster set's weight in the repository (172 JPEGs per regeneration) | medium | medium (history grows per regeneration, like the archive) | measured before committing; a budget in `map-poster-set.spec.ts`; the runbook counts regenerations with the archive's; ADR-0022 amendment records the size and the levers (tablet 3× first) | agent | measured: 21.6 MB at quality 80, budget 40 MB in the spec; the amendment and runbook are phase 6 |
| R-4 | The renderer drifts from the page (a different camera, tile size or window) | low | high | one module (`map-poster.ts`) computes the camera for both; the renderer bundles it with esbuild rather than re-implementing it; `map-poster.spec.ts` pins the worked example | agent | closed — the renderer imports the esbuild bundle of `map-poster.ts`; no second camera exists |
| R-5 | The `/map/**` count is asserted with the fake engine, which never requests anything | medium | high (a wrong green) | the cost test runs the REAL adapter under `mockMapResources`, and proves the counter by waking the map and seeing both counts rise | agent | closed — `discover-sheet.e2e.ts` › "the first paint is a poster …": 0/0 before the wake, >0 and 1 after |
| R-6 | `animate.leave` in jsdom: no transition events, the poster never leaves | low | low | TestBed disables animations by default (docs), so the element is removed at once in specs; Chromium proves the fade | agent | closed — the specs see the poster gone after the load; the e2e sees it leave after the fade |
| R-7 | Sprites missing on the posters (the absolute-URL validation) | high | medium (icons blank) | `transformStyle` in the render page, as the adapter does; verified by eye on a render | agent | closed — the render page rewrites the style; road shields drawn on the Himarë render |

## Open questions / Assumptions

- **Assumption A-1:** the poster's camera is the catalogue's fit (a region's beach centres; a
  beach's centre at the lone-pin town scale of 12.5), not the runtime venues' — the only camera a
  build-time renderer and the page can both compute. A region whose venues sit at three of its
  fourteen beaches is shown at the region's scale, wider than slice 1's live fit of the three.
  — *Owner:* agent · *Resolves by:* the review gate (no objection → stands).
- **Assumption A-2:** "rendered at the sheet's full height" means the poster covers the viewport's
  whole height under the sheet at half and at full: 960 px for the phone bucket, 1210 for the
  tablet bucket, top-anchored, with the live camera derived from the pane's centre by
  `unproject`. — *Owner:* agent · *Resolves by:* the review gate.
- **Assumption A-3:** the ground swaps to the live map as soon as the sheet moves below its half
  rest (the first pixel of a pull toward peek), not only once the detent reads peek: the under-
  sheet band is then revealed live rather than as a still. — *Owner:* agent · *Resolves by:* the
  review gate.

Resolved entries move under `### Resolved` with outcome + SHA.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: a still of the map under the pins; no booking path, no
`availability` read or write, no beach-map (venue set) surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. The posters are SPA static assets (`frontend/public/posters/`), served by
`SpaWebConfig`'s `classpath:/static/` handler like every other asset; nothing under
`platform/` changes.

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| The still-image `MapHandle` | `frontend/shared/poster-handle.ts` | a pure Mercator adapter of the map-engine seam, no app state (`riviera-frontend`: `shared/`) |
| The poster catalogue: buckets, keys, cameras, URLs, the frame test | `frontend/pages/home/map-poster.ts` | Discover's own (it composes the sheet's window and the beach catalogue), as `camera-fit.ts` is |
| The credit pill | `frontend/shared/map-credit.ts` | a presentational primitive the map and the poster ground both render |
| The swap: poster ↔ live | `frontend/pages/home/home.ts` | the page owns the ground, as #1157 left it |
| The renderer | `frontend/scripts/render-map-posters.mjs` | build tooling; reads `platform/map/` and writes `frontend/public/posters/` |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/poster-handle.ts` | new | class implementing `MapHandle` | move handlers; `liveView(pane)`; `unproject` | — |
| FE-2 | `pages/home/map-poster.ts` | new | pure module | `POSTER_BUCKETS`, `POSTER_SET`, `posterFor()`, `posterCamera()`, `posterFrames()` | — |
| FE-3 | `shared/riviera-map-options.ts` | new (moved out of `riviera-map.ts`) | pure constants | `RIVIERA_MAP_OPTIONS` | — |
| FE-4 | `shared/map-credit.ts` | new (extracted from `riviera-map.html`) | component | inputs `placement`, `bottom`, `linksFocusable` | — |
| FE-5 | `shared/riviera-map.ts` + `.html` | existing | component | `loaded` computed made public; renders `app-map-credit` | — |
| FE-6 | `pages/home/home.ts` + `.html` | existing | component | `poster`, `posterHandle`, `posterShown`, `woken`, `pendingMove` signals; `groundHandle` computed; the camera effect's framed-key skip; the live map's `[options]` | — |
| FE-7 | `pages/home/map-poster-set.spec.ts` | new | Vitest (reads the file system) | — | — |
| FE-8 | `frontend/e2e/discover-sheet.e2e.ts` | existing | mocked e2e | the poster describe blocks | — |
| FE-9 | `frontend/scripts/render-map-posters.mjs` | new | node script | — | — |

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `review gate — running`

**Next action:** the review gate over the resolved range, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `RIVIERA_MAP_OPTIONS` to its own module; `PosterHandle` | ✅ | this commit |
| 1 — the poster catalogue: buckets, cameras, keys, URLs, the frame test | ✅ | this commit |
| 2 — the credit as a shared pill; `RivieraMap.loaded` | ✅ | this commit |
| 3 — the page: the poster ground, the pins through the still handle, the swap | ✅ | this commit |
| 4 — the renderer, the poster set, the completeness spec | ✅ | this commit — 172 files, 21.6 MB at quality 80 |
| 5 — the mocked e2e: cost, parity, swaps, buckets | ✅ | this commit — 26/26 in `discover-sheet.e2e.ts` locally |
| 6 — close-out: runbook, ADR-0022 amendment, CONTEXT.md, retire the #1161 plan, docs-freshness | ✅ | `825dd8bb`; the freshness patch in this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/map-poster.md` — this plan
- `docs/plans/coast-picker-ribbon.md` — retired (#1161 merged via PR #1162)
- `docs/runbooks/riviera-map-tiles.md` — § *Posters*: regenerate with the extract
- `docs/adr/ADR-0022-self-hosted-map-resources.md` — amendment: the posters
- `CONTEXT.md` — the **map poster** entry
- `RESPONSIBILITIES.md` — the riviera map resources line names the posters
- `frontend/package.json` — the `posters` script
- `frontend/scripts/render-map-posters.mjs` — the renderer
- `frontend/public/posters/` — the poster set (`<KEY>-<bucket>@<dpr>x.jpg`)
- `frontend/src/app/shared/riviera-map-options.ts` — `RIVIERA_MAP_OPTIONS`, moved
- `frontend/src/app/shared/web-mercator.ts` — the one Web Mercator the fake engine, the fit and the still handle share
- `frontend/src/app/shared/riviera-map.ts|.html|.spec.ts` — imports the options; `loaded`; the credit component
- `frontend/src/app/shared/map-credit.ts` — the credit pill
- `frontend/src/app/shared/poster-handle.ts|.spec.ts` — the still-image `MapHandle`
- `frontend/src/app/shared/fake-map-engine.ts` — projects through `web-mercator.ts`
- `frontend/src/app/pages/home/camera-fit.ts|.spec.ts` — imports the options
- `frontend/src/app/pages/home/map-poster.ts|.spec.ts` — the poster catalogue
- `frontend/src/app/pages/home/map-poster-set.spec.ts` — completeness + budget
- `frontend/src/app/pages/home/home.ts|.html|.spec.ts|.a11y.spec.ts|.contrast.spec.ts` — the ground, the swap
- `frontend/src/app/pages/home/venue-pin-layer.spec.ts` — imports the options
- `frontend/src/app/pages/home/venue-pin-layer.a11y.spec.ts` — imports the options
- `frontend/src/app/pages/home/discover-sheet.ts` — `opened` as a signal, so the page wakes the map only on the tourist's own pull
- `frontend/e2e/discover-sheet.e2e.ts` — the poster describes
- `frontend/e2e/support/map-resources.ts` — only if the cost test needs a request hook

---

## Phase 0 — `RIVIERA_MAP_OPTIONS` to its own module; `PosterHandle`

**Files:** Create `shared/riviera-map-options.ts`, `shared/poster-handle.ts` · Modify
`shared/riviera-map.ts`, `pages/home/camera-fit.ts` and the importing specs · Test
`shared/poster-handle.spec.ts`

- [x] **Step 1: Write the failing tests** — "projects a point where the fake engine projects it for
  the live view it hands over" (a FakeMapHandle on a 390 × 844 box at `liveView({390, 844})`
  against the still handle on a 390 px pane, 960 px poster: same x, y within 1e-6 for the
  catalogue's Himarë beaches and Tirana), "reports a crowd's ease and a zoom as a wanted move
  instead of moving", "fires onMove on a pane resize", "answers load at once, holds markers
  without drawing them".
- [x] **Step 2: Run, verify red** — `npx ng test --watch=false --include='**/poster-handle.spec.ts'`
- [x] **Step 3: Minimal implementation** — the options module (a move; every importer re-pointed);
  `PosterHandle(camera, paneWidth, posterHeight, onWanted)`; `project`/`unproject` with the
  shared Mercator; `liveView(pane)`.
- [x] **Step 4: Run, verify green** — same; then `--include='**/shared/*.spec.ts'` and
  `--include='**/camera-fit.spec.ts'`.
- [x] **Step 5: Generalization-audit** — mechanism: Mercator arithmetic duplicated across
  adapters; population: `grep -rln 'mercator\|mercY\|mercX' frontend/src/app`.
- [x] **Step 6: Commit** — `Add the still-image map handle for the poster (#1158)`
- [x] **Step 7: Update Execution status**

## Phase 1 — The poster catalogue

**Files:** Create `pages/home/map-poster.ts` · Test `pages/home/map-poster.spec.ts`

- [x] Red: "one poster per catalogue region and beach at both buckets and densities: 172, keyed
  `HIMARE-440@2x.jpg` / `beach-DHERMI-834@3x.jpg`", "a region's camera is the fit of its beach
  centres into the 390 × 251 window of a 960 px pane (worked example: Himarë ≈ 8.59)", "a beach's
  camera is town scale at its centre", "picks the narrowest bucket that covers the viewport, none
  above 834 or taller than the bucket", "frames a point inside the window, not one outside".
- [x] Green: `POSTER_BUCKETS`, `posterKey`, `posterCamera`, `posterUrl`, `POSTER_SET`,
  `posterFor(region, beach, viewport)`, `posterFrames(handle, points, viewportW)`.
- [x] Commit — `Catalogue the posters: buckets, cameras and files (#1158)`.

## Phase 2 — The credit as a shared pill; `RivieraMap.loaded`

**Files:** Create `shared/map-credit.ts` · Modify `shared/riviera-map.ts|.html` · Test
`shared/riviera-map.spec.ts`

- [x] Red: "exposes loaded once the style has loaded"; the existing credit expectations stand
  (`expectCredit`) as the pin for the extraction.
- [x] Green: `app-map-credit` with the placement class, the bottom offset and the ribbon's
  `tabindex="-1"`; `RivieraMap.loaded`.
- [x] Commit — `Lift the tiles' credit into a shared pill (#1158)`.

## Phase 3 — The page: the poster ground and the swap

**Files:** Modify `pages/home/home.ts|.html` · Test `pages/home/home.spec.ts`,
`home.a11y.spec.ts`

- [x] Red (viewport stubbed to 390 × 844): AC-1's unit pin, AC-3's three, AC-5's unit pin, AC-6's
  two, AC-7.
- [x] Green: `poster`/`posterHandle`/`posterShown`/`woken`/`pendingMove`; `groundHandle`; the
  `@defer` condition; the ground button; the pin layer, the dot and Near me outside the block;
  the camera effect's framed key; `[options]` on the live map.
- [x] Commit — `Open the sheet on a poster and swap the live map in at its camera (#1158)`.

## Phase 4 — The renderer, the poster set, the completeness spec

**Files:** Create `frontend/scripts/render-map-posters.mjs`, `frontend/public/posters/*.jpg`,
`pages/home/map-poster-set.spec.ts` · Modify `frontend/package.json`

- [x] Red: "every catalogue entry has its posters", "the set stays under budget".
- [x] Green: the renderer (esbuild-bundled `map-poster.ts` for the set; Chromium over MapLibre +
  pmtiles fed from `platform/map/` with `Range` slicing; `transformStyle`; JPEG q80); run it;
  commit the set.
- [x] Commit — `Render the poster set from the extract and hold it complete in CI (#1158)`.

## Phase 5 — The mocked e2e

**Files:** Modify `frontend/e2e/discover-sheet.e2e.ts`

- [x] Red (Chromium): the tests named in AC-1, AC-2, AC-3, AC-5 —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/discover-sheet.e2e.ts`.
- [x] Green; then the whole file (`touch-targets-tourist.e2e.ts` never visits the sheet route).
- [x] Commit — `Prove the poster's first paint costs nothing under /map and swaps without a jump (#1158)`.

## Phase 6 — Close-out

- [x] Runbook § *Posters*; ADR-0022 amendment; `CONTEXT.md`; `RESPONSIBILITIES.md`;
  `git rm docs/plans/coast-picker-ribbon.md`; docs-freshness over the resolved range (one runbook path patched).
- [ ] The plan's final state; the epic checklist is ticked after the merge.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-20 | phase 3: the fake engine's handle and its `load` land in one tick, so an effect keyed on "the live map arrived under the poster" never sees that state | every effect that reads a state the fake collapses (booting → loaded) | `grep -rn "loaded()\|status() === 'ready'" frontend/src/app --include=*.ts` | `home.ts` (the camera effect) only | the poster records what it framed while it shows (`framedByPoster`), not when the handle appears |
| 2026-09-20 | phase 3: a beach's venues lie a kilometre off the catalogue centre, outside a lone-pin fit's window | every poster camera fitted to catalogue points | `posterCamera` (one function) | the beach arm; the one-beach region (Shkodër) | every catalogue point gets `REACH_DEG` of reach before the fit |
| 2026-09-20 | phase 0: a third copy of the Web Mercator arithmetic (the fake engine's, the camera fit's, the still handle's) | every module doing `512 · 2^zoom` projection | `grep -rln 'mercator\|mercY\|mercX\|2 \*\* .*zoom' frontend/src/app --include=*.ts` | `fake-map-engine.ts`, `camera-fit.ts` (+ the new handle) | one `shared/web-mercator.ts`; all three project through it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `<command>` → `<expected>`. Verified at commit `<sha>`.

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
