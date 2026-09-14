# Riviera Map Substrate Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist opening the Discover page can switch to (or, on a wide screen, see beside
the list) a **riviera map** rendered by MapLibre GL from style, tiles, glyphs and sprites that the
backend image serves same-origin under `/map/**`, with the venue list rendered and interactive
before the first map resource is requested, zero requests to any other host, and the decision
recorded as ADR-0022.

**Architecture:** The four map resources are plain files in `platform/map/`, committed to the
repo and copied to `/app/map/` on the image, served by a root-package `MapResourcesConfig`
resource handler (`/map/**` → a `file:` location) so the PMTiles archive answers `Range` requests
by seeking, never by inflating a jar entry. The frontend talks to the engine through the
abstract-class DI token `MapEngine` (real `MapLibreMapEngine` behind a dynamic `import()`, so
MapLibre lives in a lazy chunk; `FakeMapEngine` for Vitest and the mocked Playwright suite via
`window.__RIVIERA_FAKE_MAP__`), wired in `app.config.ts` exactly like the Stripe gateway and the QR
scanner. The style is OSM Liberty rewritten to relative `/map/…` URLs; the real adapter's
`transformRequest` prefixes those with `environment.apiBaseUrl`, which is empty in production.

**Persistence:** JDBC only (invariant #1). No table, no migration — nothing in this slice
touches Postgres.

**Source of intent:** GitHub issue #1098 (slice) under epic #806 (spec: user stories 5, 6, 9,
12, 13, 19, the map-chrome half of 11, the map half of 18).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
sandbox's egress policy blocks every OSM data host, so the tile phase of the build script cannot
run in this session and the archive itself is a runbook run away, R-1; caught that OSM Liberty
references three external hosts the script must strip; confirmed no Flyway number is in play
and the only open PRs are Dependabot bumps) · `riviera-plan-doc` (this template — forced the
committed-vs-fetched decision into an Open Question resolved with rationale, and the AC seams
below) · `tdd` (each phase red first: the `Range` slice test against a temp-dir fixture, the
style-host test against the shipped style, the engine seam through the fake, the network guard
through the real engine) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (ran at close-out — see Execution status) · `riviera-local-debug`
(loaded before the session's first `./gradlew`/`npm`; `JAVA_HOME=/opt/jdk-25`, `git fetch
--unshallow` first, `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked suite; its
proxy note is what made the egress probe a step, not an assumption) · `grilling` (the intake
checklist — surfaced the deflated-jar `skip()` cost, the dev-origin rewrite, and the WebGL
question the guard depends on, answered by a probe: headless Chromium here renders WebGL via
SwiftShader with no flag) · `domain-modeling` (CONTEXT.md gains **riviera map** and **venue
location**; ADR-0022 passes the three-part test: hard to reverse once tiles ship, surprising —
"why not a tile CDN?", a real trade-off) · `codebase-design` (the engine seam is deep on purpose:
five operations behind `MapHandle`, the pmtiles protocol, worker setup, CSS and the origin
rewrite all hidden in the real adapter; two adapters make it a real seam) · `riviera-modulith`
(`MapResourcesConfig` is root-package edge config like `SpaWebConfig`, not a module — it
imports no module type, so `CompositionRootDisciplineTests` and the six structural-net tests are
unaffected; run after the change anyway) · `riviera-java-conventions` (records for nothing new —
the config is a `WebMvcConfigurer` with one constant-bound property; test assertions in the
surrounding Hamcrest/MockMvc style; §6c comment budget) · `riviera-frontend` (placement: the map
component and its engine seam live in `shared/` because `pages/home` may import only
`core`/`shared` and a second consumer — the operator pin-drop slice — is already named; the e2e
goes in the CI-safe mocked suite; the factory in `app.config.ts`) · `riviera-tailwind` (the map
chrome wears the theme-invariant `--riv-solid-btn-*` family — a fixed fill over a surface that
does not theme, the exact reason that family exists — so no new token and the AA proof already
stands; `[appTouchTarget]` on both zoom buttons and both switch buttons; rule 6 baseline ring
untouched; no SCSS) · `angular-developer` + angular-cli MCP (`get_best_practices` v22: signals,
`input()`, `@if`/`@for`, `@defer` for the in-page lazy chunk, `afterNextRender` for the
browser-only engine boot, `DeferBlockBehavior.Playthrough` in specs) · `playwright-cli` (the
mocked-suite specs: `page.route` from disk with a hand-rolled `Range` slice for the archive,
`page.on('request')` host counting, axe after animations settle) · Tailwind CSS v4 docs
(`@import` of a package stylesheet inside `tailwind.css`; `sr-only`/`not-sr-only` for the
focus-revealed skip control; `lg:` = 1024px is the breakpoint the `matchMedia` twin mirrors).

**Branch:** `claude/riviera-map-substrate-1098-c5kwmy` — the session's designated remote branch
stands in for `feature/riviera-map-substrate`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the map resources at the configured `file:` location, when a client GETs
  `/map/riviera.pmtiles` with `Range: bytes=10-19`, then the response is `206`, carries
  `Content-Range: bytes 10-19/<size>` and `Accept-Ranges: bytes`, and its body is exactly those
  ten bytes; a full GET is `200` with the whole file; `/map/style.json` is `200
  application/json`; a missing map path is `404`, never the SPA shell. *Seam:* the HTTP
  resource route `/map/**` (MockMvc, `@WebMvcTest` slice with `SecurityConfig` + `SpaWebConfig` +
  `MapResourcesConfig`) · *Pinned by:* `MapResourcesTest.rangeRequestIsAnsweredWithTheByteSlice`,
  `.wholeArchiveIsServedOnAPlainGet`, `.styleIsServedAsJson`, `.missingMapPathIs404NotTheShell`
- [x] **AC-2:** Given the shipped `platform/map/style.json`, when its `sources.*.url`,
  `sources.*.tiles[]`, `glyphs` and `sprite` entries are read, then every one is a `/map/…`
  path (optionally behind the `pmtiles://` scheme) and none names a host. *Seam:* the committed
  style file (the review trap's machine lock) · *Pinned by:*
  `MapStyleSelfHostedTest.everyStyleUrlStaysOnOurOrigin`
- [x] **AC-3:** Given `window.__RIVIERA_FAKE_MAP__` is unset, when `appConfig`'s `MapEngine`
  factory runs, then it yields a `MapLibreMapEngine`; given the flag is `true`, a
  `FakeMapEngine`. *Seam:* the `MapEngine` provider in `app.config.ts` · *Pinned by:*
  `app.config.spec.ts` › `appConfig MapEngine factory`
- [x] **AC-4:** Given the real adapter's style transform and the map origin (the API origin in
  development, the page's own in production), when the shipped style's `/map/…` sprite, glyph and
  source URLs (and the `pmtiles:///map/…` form) are transformed, then each becomes absolute on that
  origin — MapLibre validates a style's sprite URL as absolute before any request hook runs — and
  any other URL passes through untouched. *Seam:* `absoluteMapStyle` / `absoluteMapUrl` (exported
  pure functions of `shared/maplibre-map-engine.ts`) · *Pinned by:* `maplibre-map-engine.spec.ts`
- [x] **AC-5:** Given `RivieraMap` rendered with the fake engine, when the view boots, then the
  engine is asked to create a map on the component's host with the `/map/style.json` style, the
  riviera centre and zoom; the zoom buttons call `zoomIn`/`zoomOut`; destroying the component
  destroys the handle; an engine that rejects renders the "map unavailable" text instead of an
  empty box; "© OpenStreetMap contributors" is in the DOM in every state. *Seam:* the `MapEngine`
  token (overridden with the fake) and the component's DOM · *Pinned by:* `riviera-map.spec.ts`
- [x] **AC-6:** Given the Discover page below the `lg` breakpoint, when it renders, then the list
  is shown, the map region is not, and the "Map" switch button is unpressed; when "Map" is
  pressed the map region renders (the `@defer` block resolves) and the list hides; at or above
  `lg` both render and the switch is hidden. The defer block never resolves before the venue
  request has settled. *Seam:* `Home`'s DOM under `DeferBlockBehavior.Playthrough`, the
  `matchMedia` stub · *Pinned by:* `home.spec.ts` › `Home (list/map switch)`
- [x] **AC-7:** Given the mocked suite with the **real** engine and `/map/**` fulfilled from
  `platform/map/` (archive from the e2e fixture, `Range`-sliced), when Discover loads with a
  delayed `/api/venues` and the map is opened, then the venue cards are visible and a filter
  change works **before** any `/map/**` request is observed, and afterwards style, sprite,
  glyph and tile requests are observed. *Seam:* the page's network (`page.on('request')`) ·
  *Pinned by:* `discover-map.e2e.ts` › `the list renders and works before the map asks for
  anything`
- [x] **AC-8:** Given the same real-engine setup, when the map has loaded and been panned and
  zoomed, then every request the page made went to the page origin or the configured API
  origin (`localhost:8080`, the mocked suite's stand-in for same-origin), and the test fails
  naming any other host. *Seam:* the page's network · *Pinned by:* `discover-map.e2e.ts` › `the
  map open on Discover makes no request to a third party`
- [x] **AC-9:** Given the fake engine on a phone viewport, when the map is opened, then
  "© OpenStreetMap contributors" is visible, the zoom buttons are labelled and measure ≥ 44 × 44,
  the "Skip map" control is reachable by Tab and moves focus past the map, and axe reports no
  serious violation with the map open; the switch buttons meet the floor on `phone` and `fold`.
  *Seam:* the rendered page (Playwright + axe + `expectTouchTargets`) · *Pinned by:*
  `discover-map.e2e.ts` › `map chrome is labelled, skippable and axe-clean`,
  `touch-targets-tourist.e2e.ts` › `Discover with the map open`
- [x] **AC-10:** Given `/legal/privacy`, when it renders, then a section names the self-hosted map,
  OpenStreetMap, that tile requests hit our own origin and that no third party sees them; the
  legal-pages e2e and the privacy a11y spec stay green. *Seam:* the page's DOM · *Pinned by:*
  `privacy-policy.spec.ts` › `describes the self-hosted map`
- [x] **AC-11:** Given the repo, then `docs/adr/ADR-0022-self-hosted-map-resources.md` exists with
  the DSGVO rationale and the review trap; `docs/deploy/production-hardening.md`'s CSP note names
  MapLibre's Blob-URL workers beside Altcha's; `CONTEXT.md` defines **riviera map** and **venue
  location**; `RESPONSIBILITIES.md` § *Platform edge* names the map resources as self-hosted;
  `docs/runbooks/riviera-map-tiles.md` records source, bbox, tool versions, location and expected
  size. *Seam:* the docs tree · *Pinned by:* review (RV-PROC) — no test; `riviera-docs-freshness`
  at close-out.

## Non-goals

- No venue pins, no `venue location` column, no operator pin-drop — the next slice; this one
  ships the seam (`addMarker`/`removeMarker` exist on the handle, unused).
- No "near me" control, no Geolocation API use.
- No pin previews, no filter↔map consistency logic (nothing to be consistent yet).
- No map on the venue page; the **beach map** (sunbed layout) is untouched.
- No CSP header; only the note.
- No automated tile refresh; no Docker-build-time fetch (see Resolved Q-1).
- No change to the privacy policy beyond the map paragraph.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The Discover list keeps every state (loading skeleton,
empty, error + retry, filters, route-carried date); the switch only decides which panel is
visible below `lg`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The sandbox cannot reach any OSM data host (Geofabrik, osmdata, Protomaps builds, Overpass all 403 at the proxy), so the PMTiles archive cannot be generated in this session; a deploy from this PR serves `404` for the archive and the map shows the style's background only | certain | med | The tile phase of `scripts/build-riviera-map.sh` is written against Planetiler's documented CLI and the runbook says exactly how to run it on a network-capable machine; the missing archive is a visible absence in the tree, never a silent config default; the frontend degrades to background + attribution, never an error page; the e2e exercises the real path with a tiny fixture archive | slice | deferred → issue #1103 (the archive is a one-time runbook run on a machine with egress; the code path is proven by the fixture) |
| R-2 | A jar-nested archive would make every tile request inflate up to the offset | high (if classpath) | high | File-system location `file:map/` (`riviera.map.location`), `COPY platform/map/ /app/map/`; AC-1 proves `206` slicing through the framework's `ResourceRegionHttpMessageConverter` on a `FileSystemResource` | slice | closed |
| R-3 | MapLibre in the initial bundle blows the budget (baseline initial is already 590 kB against a 500 kB warning, 1 MB error) | high | high | `await import('maplibre-gl')` + `import('pmtiles')` inside the real adapter only; the map component sits in a `@defer` block; AC-7 proves ordering; the build's initial-size line is recorded in Execution status before/after | slice | closed |
| R-4 | A relative style URL resolves against the SPA's origin, which in dev (`:4200 → :8080`) and the mocked e2e is not the backend — and MapLibre refuses a relative sprite URL outright ("must be absolute", found by the real-engine e2e) | high | med | The adapter absolutises the style URL and, through MapLibre's `transformStyle` hook, every `/map/…` URL inside the loaded style against `environment.apiBaseUrl` or the page origin (AC-4); the committed style stays host-free; dev CORS already maps `/**` for the allowed origin | slice | closed |
| R-5 | Headless Chromium has no WebGL → the real-engine e2e is vacuous | low | high | Probed: the pinned Chromium renders WebGL2 via SwiftShader with default flags; the guard test additionally asserts the style, a sprite, a glyph and a tile were actually requested, so a WebGL-less run fails loudly instead of passing empty | slice | closed |
| R-6 | The pmtiles reader refuses a `200` answer to a `Range` request ("Check that your storage backend supports HTTP Byte Serving") | high (in e2e) | med | The e2e route slices the fixture by the `Range` header and answers `206` + `Content-Range`; the backend does this natively (AC-1) | slice | closed |
| R-7 | The review trap: a future style tweak points glyphs/sprites/tiles at a CDN | med | high | AC-2 (backend style test) + AC-8 (real-engine network guard) + ADR-0022 naming it | slice | closed |
| R-8 | OSM Liberty's raster hillshade source and MapTiler tile URL survive the rewrite | med | high | The script deletes the raster source and its layer and rewrites the vector source to `pmtiles:///map/riviera.pmtiles`; AC-2 fails on any host | slice | closed |
| R-9 | Glyph coverage: only ranges 0–1279 ship per font stack; a label with a character outside them renders blank | low | low | Riviera labels are Latin/Latin-Extended (Albanian ë/ç) with Greek as a minority; the runbook names the ranges and how to widen | slice | closed |
| R-10 | Focus and a11y: the map canvas is a focusable, keyboard-panning `tabindex=0` element that a screen-reader user could get stuck in | med | med | "Skip map" control before the canvas moves focus to the anchor after the region; the region is `aria-label`led; the list precedes the map in DOM order; AC-9 | slice | closed |
| R-11 | `@defer (when …)` never reverts, so toggling back to the list must hide, not unload | low | low | The switch drives `hidden` on the panels; the map handle survives and MapLibre's own ResizeObserver resizes on unhide | slice | closed |
| R-12 | The map chrome floats over imagery of unknown luminance | high | med | Opaque `--riv-solid-btn-fill` + `--riv-solid-btn-ink` (6.17:1, theme-invariant by design) for zoom buttons and the attribution pill; `riviera-map.contrast.spec.ts` recomputes the pair | slice | closed |
| R-13 | MapLibre 6 spawns its tile worker as a module script resolved beside its own chunk via `import.meta.url` — a URL neither the dev server's dependency optimizer nor the production bundle serves, so the map silently never reaches `load` (found by the real-engine e2e, not by any unit spec) | certain | high | The adapter calls `setWorkerUrl('/vendor/maplibre-gl-worker.mjs')` and `angular.json` copies the worker and its shared chunk beside the stylesheet; the CSP note and ADR-0022 say `worker-src 'self'` (the issue's "Blob-URL workers like Altcha's" premise held for MapLibre ≤ 5 and is corrected) | slice | closed |

## Open questions / Assumptions

- **Deferred → issue #1103:** Planetiler 0.10.2 (`java -jar planetiler.jar --download
  --area=albania --bounds=… --output=….pmtiles`) produces an OpenMapTiles-schema archive the OSM
  Liberty layers read; the flags are from Planetiler's README/PLANET.md, not from a run here
  (R-1). Verified by the first runbook run, which is that issue.

### Resolved

- **Licences** (was an assumption): OSM Liberty's `LICENSE.md` on the fetched branch states the
  style JSON is BSD (derived from Mapbox OSM Bright, same licence); the glyph ranges are built by
  `orangemug/font-glyphs` from the Roboto font — Roboto is Google's Apache-2.0 typeface, and that
  repository's README defers to each font's own licence under its `fonts/` directory; OpenStreetMap
  attribution (ODbL) is the runtime obligation the map chrome meets. Resolved at phase 8 by reading
  the upstream licence statements.

- **Q-1 Committed or fetched at image build?** → **Committed** in `platform/map/`. A build-time
  fetch needs a network hop in every Render build and a published home for the artifact (a
  release asset, which a private repo cannot fetch without a token); Git LFS is not supported by
  Render's git builds; and an absent artifact would then be a silent config default rather than
  a visible gap in the tree. The cost is repo history growth per regeneration, bounded by the
  bbox and `--maxzoom=14` (expected ≈ 10–20 MB; regeneration is rare). Resolved at plan time.
- **Q-2 Classpath or file system?** → **File system**, `riviera.map.location` = `file:map/`
  (cwd-relative: `platform/` under `bootRun`, `/app` on the image). A `bootJar` stores
  `BOOT-INF/classes` entries deflated, so `InputStream.skip(offset)` — what the framework's
  `ResourceRegionHttpMessageConverter` does for a `Range` — would inflate the archive up to the
  offset on every tile request. A `FileSystemResource` seeks. Resolved at plan time.
- **Q-3 Tool chain and style?** → Planetiler (OpenMapTiles profile) over Geofabrik Albania,
  bounds `19.30,39.55,20.20,40.55` (Vlorë bay to Ksamil), `--maxzoom=14`, PMTiles output; style
  OSM Liberty with its own sprites; glyphs Roboto Regular / Roboto Medium / Roboto Condensed
  Italic, ranges 0–1279. Protomaps' `pmtiles extract` from a planet build was the alternative
  (no tiler, no ancillary downloads) but its basemap schema is not OpenMapTiles and its source
  host is equally unreachable here; Planetiler keeps the style ecosystem the issue asked for.
  Resolved at plan time.
- **Q-4 Which e2e engine?** → Both. The fake engine (flag) for the switch, phone/fold sweeps and
  axe; the **real** engine for the ordering and network-guard tests, because with the fake no
  map resource is ever requested and a pasted CDN URL would go unseen. Resolved at plan time
  after the WebGL probe.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Nothing writes or reads `set_availability`; the beach map
(sunbed layout) and the booking spine are untouched. The **riviera map** is a static-resource
surface plus a frontend view.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | The change is root-package edge config (`MapResourcesConfig`, next to `SpaWebConfig`), not a module. |

**Cross-module named interfaces (`api/` ports)** — none.

**Domain events** — none.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Serve the four map resources same-origin with `Range` support | the platform edge (root package) | RESPONSIBILITIES.md § *Platform edge*: app-wide web concerns — the SPA shell, CORS, security — sit in the root; the map files are page assets like the SPA bundle, not venue data. **Not** `venue` (its Job is the venue profile and beach map; a tourist page asset is on nobody's Not-My-Job list because no module claims static assets). `CompositionRootDisciplineTests` is unaffected: the class imports nothing from any module. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/map-engine.ts` | new | abstract class token + `MapHandle`/`MapEngineOptions` types | — | — |
| FE-2 | `shared/maplibre-map-engine.ts` | new | real adapter (dynamic `import('maplibre-gl')`, `import('pmtiles')`) + exported `sameOriginMapRequest` | — | — |
| FE-3 | `shared/fake-map-engine.ts` | new | deterministic fake, records calls | — | — |
| FE-4 | `shared/riviera-map.ts` + `.html` | new | standalone component (`app-riviera-map`) | Signals (`status`), `afterNextRender` boot, `DestroyRef` teardown | — |
| FE-5 | `pages/home/home.ts` + `.html` | modify | the list/map switch, the `@defer` map region, the wide-screen twin of `lg:` | Signals (`view`, `wide`, `mapOpen`, `listShown`, `listSettled`) | — |
| FE-6 | `app.config.ts` | modify | `MapEngine` factory (flag `__RIVIERA_FAKE_MAP__`) | — | — |
| FE-7 | `pages/legal/privacy-policy.html` | modify | the map paragraph | — | — |
| FE-8 | `src/tailwind.css` | modify | `@import 'maplibre-gl/dist/maplibre-gl.css'` (canvas/marker layout rules; the chrome is ours) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`/`@defer`, signals; no new images.
Deviation: the map host `<div>` is handed to a third-party library that owns its subtree — the
component never reads inside it.

## FE↔BE contract

- **New endpoints:** `GET /map/style.json`, `GET /map/riviera.pmtiles` (`Range`), `GET
  /map/sprites/osm-liberty{,@2x}.{json,png}`, `GET /map/glyphs/{fontstack}/{range}.pbf` — static
  resources under one prefix; anonymous (the SPA filter chain); `Cache-Control: public,
  max-age=3600`.
- **Client typing:** none — MapLibre consumes them; the SPA names only `/map/style.json`.
- **Money/date on the wire:** N/A.

## Execution status

**Stage pointer:** `CI gate → PR (phase 8)`

**Next action:** push, check the CI run on PR #1102, merge `origin/main` in, mark ready for review, then the review gate per `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | `1ddf391f`, PR #1102 |
| 1 — backend `/map/**` handler with `Range`, Dockerfile, gitattributes, RESPONSIBILITIES note | ✅ | `899a1a8a` |
| 2 — map assets: build script (assets phase run here), style rewrite, glyphs, sprites, runbook, style-host test | ✅ | phase-2 commit |
| 3 — frontend engine seam: token, real + fake adapters, `app.config` factory, deps, CSS | ✅ | phase-3 commit |
| 4 — `riviera-map` component + unit/a11y/contrast specs | ✅ | phase-4 commit |
| 5 — Discover list/map switch + `@defer` + home specs | ✅ | phase-5 commit |
| 6 — mocked e2e: switch/a11y/touch (fake), ordering + network guard (real), fixture archive | ✅ | phase-6 commit |
| 7 — ADR-0022, privacy paragraph + spec, CONTEXT.md, CSP note | ✅ | `e5935128` (+ the worker/Stripe corrections in the phase-6 commit) |
| 8 — gates: CI green, merge main, ready-for-review, review + Sonar, docs-freshness | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Bundle** — before phase 3: initial total 589.97 kB (already over the 500 kB warning; 1 MB error
budget). After phase 3: initial total 592.70 kB (+2.7 kB, the factory and the adapter shell);
`maplibre-gl` is a 1.06 MB lazy chunk (235 kB compressed) and `vendor/maplibre-gl.css` an asset.
After phase 6: initial total 601.89 kB (144.13 kB compressed; +9 kB for the Stripe `pure` entry and
the style transform the eager `app.config` factory pulls in), the lazy chunk unchanged, and
`vendor/` carries the stylesheet plus MapLibre's worker and shared chunk. The budget itself
(500 kB warning / 1 MB error) is unchanged.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | the network guard (AC-8), first real-engine run | `https://js.stripe.com/dahlia/stripe.js` is requested on Discover: importing `@stripe/stripe-js` injects the script as a side effect of the app booting, on every page — contradicting the "Stripe.js on the payment surface only" posture the privacy policy states | fixed — `booking/stripe-payment.gateway.ts` imports `loadStripe` from `@stripe/stripe-js/pure`, so the script loads only when a Payment Element mounts (phase-6 commit) |

---

## File structure

- `docs/plans/riviera-map-substrate.md` — this plan
- `platform/src/main/java/ai/riviera/platform/MapResourcesConfig.java` — `/map/**` → `riviera.map.location` with cache control; root-package edge config
- `platform/src/main/resources/application.properties` — `riviera.map.location=file:map/`
- `platform/src/test/java/ai/riviera/platform/MapResourcesTest.java` — AC-1 (`@WebMvcTest` + temp-dir fixture)
- `platform/src/test/java/ai/riviera/platform/MapStyleSelfHostedTest.java` — AC-2 over the shipped style
- `platform/` — its `Dockerfile` (a direct child): `COPY platform/map/ /app/map/` in the runtime stage
- `platform/map/style.json` — OSM Liberty rewritten to `/map/…`
- `platform/map/sprites/osm-liberty.json`, `platform/map/sprites/osm-liberty.png`, `platform/map/sprites/osm-liberty@2x.json`, `platform/map/sprites/osm-liberty@2x.png` — sprites
- `platform/map/glyphs/**/*.pbf` — Roboto glyph ranges (three stacks × five ranges)
- `platform/map/MANIFEST.txt` — upstream URLs, fetch date, sha256 per fetched file (written by the script)
- `platform/map/riviera.pmtiles` — the extract (absent until the runbook runs, R-1)
- `scripts/build-riviera-map.sh` — the repeatable build: `--assets` (style/sprites/glyphs) and `--tiles` (Planetiler)
- `.gitattributes` — `*.pmtiles binary`, `*.pbf binary`
- `docs/runbooks/riviera-map-tiles.md` — regeneration runbook
- `docs/adr/ADR-0022-self-hosted-map-resources.md` — the decision
- `docs/deploy/production-hardening.md` — CSP note names MapLibre
- `RESPONSIBILITIES.md` — § *Platform edge* gains the map-resources paragraph
- `CONTEXT.md` — **Riviera map**, **Venue location**
- `frontend/package.json`, `frontend/package-lock.json` — `maplibre-gl`, `pmtiles`
- `frontend/angular.json` — copies MapLibre's stylesheet to `vendor/` as an asset
- `frontend/src/tailwind.css` — the MapLibre stylesheet import
- `frontend/src/app/shared/map-engine.ts` — token + types
- `frontend/src/app/shared/maplibre-map-engine.ts`, `frontend/src/app/shared/maplibre-map-engine.spec.ts` — real adapter + AC-4
- `frontend/src/app/shared/fake-map-engine.ts`, `frontend/src/app/shared/fake-map-engine.spec.ts` — fake
- `frontend/src/app/shared/riviera-map.ts`, `frontend/src/app/shared/riviera-map.html`, `frontend/src/app/shared/riviera-map.spec.ts`, `frontend/src/app/shared/riviera-map.a11y.spec.ts`, `frontend/src/app/shared/riviera-map.contrast.spec.ts` — the component
- `frontend/src/app/app.config.ts`, `frontend/src/app/app.config.spec.ts` — AC-3
- `frontend/src/app/booking/stripe-payment.gateway.ts` — F-1: `loadStripe` from the `pure` entry, so Stripe.js loads on the payment surface only
- `frontend/src/app/pages/home/home.ts`, `frontend/src/app/pages/home/home.html`, `frontend/src/app/pages/home/home.spec.ts`, `frontend/src/app/pages/home/home.a11y.spec.ts`, `frontend/src/app/pages/home/home.contrast.spec.ts` — AC-6 and the switch's contrast pair
- `frontend/src/app/pages/legal/privacy-policy.html`, `frontend/src/app/pages/legal/privacy-policy.spec.ts`, `frontend/src/app/pages/legal/privacy-policy.ts` — AC-10
- `frontend/e2e/discover-map.e2e.ts` — AC-7, AC-8, AC-9
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the map-open sweep
- `frontend/e2e/support/map-resources.ts` — `mockMapResources(page)`: serves `platform/map/` + the fixture archive with `Range` slicing
- `frontend/e2e/support/map-fixture/riviera-fixture.pmtiles` — a tiny OpenMapTiles-schema archive (z0–z6, water + one place label)
- `frontend/e2e/support/map-fixture/make-fixture.py` — how the fixture was produced
- `frontend/e2e/support/map-fixture/README.md` — provenance and regeneration of the fixture

---

## Phase 0 — Plan doc + draft PR

- [x] Write this doc; commit `docs: plan the riviera map substrate slice (#1098)`; push; open the draft PR.

## Phase 1 — Backend `/map/**` handler

**Files:** Create `MapResourcesConfig.java`, `MapResourcesTest.java` · Modify `application.properties`, `Dockerfile`, `.gitattributes`, `RESPONSIBILITIES.md`

- [ ] **Step 1: failing test** — `MapResourcesTest` (`@WebMvcTest`, `@Import({SecurityConfig.class,
  WebCorsConfig.class, SpaWebConfig.class, MapResourcesConfig.class, WebSliceStubs.class})`,
  `@DynamicPropertySource` pointing `riviera.map.location` at a `@TempDir` holding a 64-byte
  `riviera.pmtiles` and a `style.json`): AC-1's four cases.
- [ ] **Step 2:** `./gradlew test --tests "*MapResourcesTest*"` → FAIL (no handler: `/map/x` falls
  into the SPA resolver → 404 for the asset paths, but the `Range` case fails on status).
- [ ] **Step 3:** `MapResourcesConfig implements WebMvcConfigurer`: `addResourceHandler("/map/**")
  .addResourceLocations(location).setCacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())`.
- [ ] **Step 4:** the test passes; then the structural net + `SpaShellTest` + `CompositionRootDisciplineTests`.
- [ ] **Step 5:** Generalization audit — population "every static-resource handler" → `grep -rn
  addResourceHandler platform/src/main` → `SpaWebConfig` only → no other handler needs `Range`.
- [ ] **Step 6:** Commit `Serve the riviera map resources same-origin with Range support (#1098)`.

## Phase 2 — Map assets + runbook

- [ ] `scripts/build-riviera-map.sh --assets` fetches OSM Liberty (style + 4 sprite files) and 15
  glyph ranges, rewrites the style (drop `natural_earth_shaded_relief` + its layer and the
  `building-3d` layer, set the vector source to `pmtiles:///map/riviera.pmtiles`, `sprite` to
  `/map/sprites/osm-liberty`, `glyphs` to `/map/glyphs/{fontstack}/{range}.pbf`), writes
  `MANIFEST.txt`. `--tiles` runs Planetiler 0.10.2 (documented, not run here — R-1).
- [ ] Failing test first: `MapStyleSelfHostedTest` over `platform/map/style.json` (AC-2) — red
  against the upstream file, green after the rewrite.
- [ ] Runbook `docs/runbooks/riviera-map-tiles.md`.
- [ ] Commit `Add the riviera map style, sprites and glyphs with their build script (#1098)`.

## Phase 3 — Engine seam

- [ ] `npm i maplibre-gl@6.9.1 pmtiles@4.5.0`; `@import` the stylesheet in `tailwind.css`.
- [ ] Red: `app.config.spec.ts` factory cases (AC-3); `maplibre-map-engine.spec.ts` (AC-4);
  `fake-map-engine.spec.ts` (records create/zoom/markers/destroy).
- [ ] Green: `map-engine.ts`, `maplibre-map-engine.ts`, `fake-map-engine.ts`, the factory.
- [ ] `npm run build` — record the initial-bundle line; MapLibre must be a lazy chunk.
- [ ] Commit `Put the map engine behind a DI seam with a lazy MapLibre adapter (#1098)`.

## Phase 4 — `riviera-map` component

- [ ] Red: `riviera-map.spec.ts` (AC-5), `riviera-map.a11y.spec.ts`, `riviera-map.contrast.spec.ts`.
- [ ] Green: the component — host box, engine host `<div>`, "Skip map" control, zoom buttons,
  attribution pill, unavailable state.
- [ ] Commit `Add the riviera map component with labelled chrome and attribution (#1098)`.

## Phase 5 — Discover switch

- [ ] Red: `home.spec.ts` (AC-6) under `DeferBlockBehavior.Playthrough` with a `matchMedia` stub.
- [ ] Green: the switch, the `@defer (when mapDefer())` region, the `lg:` grid.
- [ ] Commit `Give Discover a list/map switch with a lazily loaded map (#1098)`.

## Phase 6 — Mocked e2e

- [ ] Fixture archive + generator + README; `support/map-resources.ts`.
- [ ] `discover-map.e2e.ts`: AC-7, AC-8, AC-9; the tourist touch sweep gains the map-open case.
- [ ] Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config
  playwright.a11y.config.ts e2e/discover-map.e2e.ts e2e/touch-targets-tourist.e2e.ts e2e/discovery-flow.e2e.ts e2e/legal-pages.e2e.ts`.
- [ ] Commit `Guard the Discover map against third-party requests in the mocked e2e (#1098)`.

## Phase 7 — Decision and policy

- [ ] ADR-0022; privacy paragraph (red spec first); CONTEXT.md; CSP note.
- [ ] Commit `Record ADR-0022 and describe the self-hosted map in the privacy policy (#1098)`.

## Phase 8 — Gates

- [ ] CI green on the draft; merge `origin/main`; mark ready; review gate per
  `references/pr-gates.md` §1; Sonar list; `riviera-docs-freshness`; close-out in the last
  code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-14 | phase 6, F-1 | every module whose import injects a third-party script or opens a third-party connection as a side effect (the mechanism the guard caught) | `grep -rn "from '@stripe/stripe-js'\|from 'altcha'\|from 'jsqr'\|from 'qrcode'" frontend/src/app` | `@stripe/stripe-js` (side-effect script insertion on import — the only one; `altcha`, `jsqr`, `qrcode` are pure modules and the widget's own network calls go to our challenge endpoint) | the `pure` entry point; the guard now runs green with a strict same-origin set, no allow-list entry for Stripe |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `cd platform && ./gradlew test --tests "*MapResourcesTest*"` → 5/5 (206 slice, 200 whole, style JSON, 404s, anonymous). Verified at `899a1a8a`.
- [x] **AC-2:** `./gradlew test --tests "*MapStyleSelfHostedTest*"` → 2/2 over the shipped `platform/map/style.json`. Verified at `96c8595`.
- [x] **AC-3:** `npx ng test --watch=false --include="src/app/app.config.spec.ts"` → the two `MapEngine` factory cases. Verified at `31edd7fc`.
- [x] **AC-4:** `--include="src/app/shared/maplibre-map-engine.spec.ts"` → `absoluteMapUrl` / `absoluteMapStyle` / `ensureStylesheet`, 6/6. Verified at `d8915494`.
- [x] **AC-5:** `--include="src/app/shared/riviera-map.spec.ts"` → 7/7 (+ a11y 2/2, contrast 2/2). Verified at `dc09d2f5`.
- [x] **AC-6:** `--include="src/app/pages/home/home.spec.ts"` → `Home (list/map switch)` 4/4 (47/47 in the file). Verified at `896c8595`.
- [x] **AC-7, AC-8, AC-9:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts e2e/touch-targets-tourist.e2e.ts` → 4/4 + the phone/fold sweeps; the guard's strict same-origin set passes with Stripe.js deferred (F-1). Verified at `d8915494`.
- [x] **AC-10:** `--include="src/app/pages/legal/*.spec.ts"` → 19/19 incl. `describes the self-hosted map`; `e2e/legal-pages.e2e.ts` green. Verified at `e5935128`.
- [x] **AC-11:** ADR-0022, the CSP note, CONTEXT.md, RESPONSIBILITIES.md § *Platform edge*, `docs/runbooks/riviera-map-tiles.md` — review-checked (RV-PROC), docs-freshness run recorded above.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
