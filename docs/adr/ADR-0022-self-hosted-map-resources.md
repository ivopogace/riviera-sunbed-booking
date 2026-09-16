# ADR-0022: Map resources are self-hosted — no third-party map hosts, no geocoding services

- **Status:** Accepted
- **Date:** 2026-09-14
- **Relates to:** the riviera-map epic #806 (its spec holds the user stories and the DSGVO
  paragraph this ADR records), ADR-0008 (venue photos: the same-origin posture for tourist-facing
  media this extends to map data), ADR-0011 and ADR-0016 (the DSGVO posture: no third-country
  processor where a self-hosted option exists), ADR-0004 (hosting: the single backend image also
  carries the map files). Surfaces: `RESPONSIBILITIES.md` § *Platform edge* → *Riviera map
  resources*; regeneration: `docs/runbooks/riviera-map-tiles.md`.

## Context

The Discover page gains a geographic map of the riviera — the **riviera map**, as distinct from a
venue's **beach map** — drawn in the tourist's browser by MapLibre GL. A web map needs four
resources at runtime: a style document, vector tiles, font glyphs and a sprite sheet. The
convenient way to get them is a hosted tile service (MapTiler, Mapbox, OpenFreeMap, the demo
tiles) plus the glyph and sprite hosts the open styles point at by default; OSM Liberty, the style
this slice ships, references three external hosts out of the box.

Every one of those hosts receives the visitor's IP address with every tile, glyph and sprite
request — the same flow German courts treated as unlawful without consent in the Google-Fonts line
of case law (LG München I, 3 O 17493/20), which is what makes a third-party map embed a
consent-banner question. The platform's stated privacy posture is "strictly necessary cookies
only, no advertising, analytics or cross-site tracking; Stripe.js on the payment surface only",
and it deliberately builds no consent-management machinery. The venue pins themselves are
business data under the operator contract (Art. 6(1)(b)); the only personal data a map leaks is
the visitor's IP to whoever serves the tiles.

The tiles are a few megabytes for the riviera, the glyphs and sprites a couple more, and the
PMTiles container lets a static file serve vector tiles by HTTP `Range` with no tile server.
Self-hosting is therefore cheap; what it costs is owning tile freshness and a first-load transfer
of a few same-origin megabytes. *(Amended: the extract now covers all of Albania and weighs ~60 MB;
a first load still fetches only the tiles in view — see the amendment log.)*

## Decision

1. **All four map resources are served by our own origin**, under `/map/**`, by the backend image
   that already serves the SPA and the venue photos: the style, the PMTiles archive, the glyph
   ranges and the sprites live in `platform/map/`, are copied to `/app/map/` on the image, and are
   served from that directory by a root-package resource handler with `Range` support. Every URL
   the shipped style names is a `/map/…` path. **No third-party map host is ever contacted from a
   tourist's browser**, and the engine is MapLibre GL (BSD, no telemetry, no token), bundled from
   npm, never a CDN.
2. **No geocoding service, in either direction.** Venue positions are placed by hand on this same
   map in the operator console (shipped in #1099); no address is ever sent to a geocoder, and no
   visitor position is ever sent to us or to anyone (the "near me" control, also later, consumes
   the browser Geolocation API in the browser only).
3. **The archive lives on the file system, not the classpath.** A jar entry is deflated, so a
   `Range` read seeks by inflating everything before the offset — on every tile request. The
   directory is `riviera.map.dir` (`map/` beside the jar).
4. **The extract is a committed build artifact of a documented, repeatable script**
   (`scripts/build-riviera-map.sh`: Planetiler over Geofabrik Albania, a recorded bounding box,
   OSM Liberty rewritten to same-origin URLs, pinned versions, a manifest of upstream checksums).
   Regeneration is a runbook action, not automation, and nothing at build or deploy time fetches
   map data.
5. **Two machine locks hold the self-hosting rule.** `MapStyleSelfHostedTest` parses the shipped style and
   fails on any absolute host; the mocked Playwright suite runs the real MapLibre adapter against
   the committed resources and fails on any request that leaves our origin.
6. **Attribution** "© OpenMapTiles © OpenStreetMap contributors" is rendered permanently on the
   map — the credit the tiles' two licences require (the OpenMapTiles schema's CC-BY design licence,
   OSM's ODbL) — with each name a link to its licence page: the two outbound references, hyperlinks
   rather than requests, exactly as the ALTCHA widget's footer is. The style's vector source carries
   the same credit as plain text, never a URL. *(Amended: OpenMapTiles added — see the amendment
   log.)*
7. **The archive stays committed, sized against a yearly regeneration, until a trigger fires.**
   A regeneration is expected about once a year before the season, plus a rare one-off such as a
   wider bounding box; each adds a full copy of the archive to history, which every full-history
   clone (the CI guard and Sonar checkouts included) then carries. The storage decision is
   revisited, before the change that trips it merges, when:
   - **the archive exceeds 80 MB** (80,000,000 bytes) — `MapArchiveBudgetTest` fails the build,
     leaving headroom under GitHub's 100 MiB per-file push limit;
   - **a regeneration would be the third in 12 months** — the runbook counts before committing;
   - **the production deploy pipeline is chosen** — the Render service is the non-prod host
     (ADR-0004), the production host is not settled, and the repository may not stay public;
     a pipeline that builds its image in CI changes what the options below cost.

   At a revisit the size levers come first, in this order (measured on the committed archive: its
   tile directory, and every tile re-gzipped for the layer drop):

   | Lever | Archive | What the map loses |
   |---|---|---|
   | As built: all of Albania, max zoom 14, every layer | 60.36 MB | — |
   | 1. Drop the three layers the style never draws (`mountain_peak`, `housenumber`, `aerodrome_label`) | 56.99 MB | nothing visible |
   | 2. Max zoom 13 | 27.16 MB | POIs and most buildings, and street geometry turns coarse past zoom 13 — on the coast too, and the map zooms to 16 |
   | 3. Zoom 14 on the coast only, 13 inland | 48.80 MB (a coastal strip 60–90 km deep) · 30.96 MB (Vlorë to Ksamil only) | a second archive and source, every style layer duplicated, a seam where the two meet |

   *(Amended: storage decision and triggers added — see the amendment log.)*

## The review trap

This decision is deliberately made and cheap to reverse by accident. One pasted glyph URL, one
"let's just use the demo tiles for now", one sprite path pointing back at the style's upstream
host, and every visitor's IP flows to a third party again — silently, with the map looking
identical. That is why the two locks in Decision 5 exist, why the runbook repeats it, and why
a reviewer who sees a hostname in `platform/map/style.json`, in the map adapter, or in an `<img>`
or `<link>` the map chrome renders should treat it as a Blocker rather than a convenience.

## Considered options

- **A hosted tile service with an API key** (MapTiler, Mapbox) — rejected: a processor in the
  discovery path, a DPA, a transfer-impact question, a consent banner; also a token in the bundle
  and a per-request bill.
- **A free public tile host** (OpenFreeMap, the MapLibre demo tiles) — rejected for the same
  privacy reason; free changes nothing about where the IP goes.
- **Raster tiles with Leaflet** — rejected: raster needs a tile server or gigabytes of pre-rendered
  PNGs; PMTiles vector tiles are one small file and stay crisp at every zoom.
- **A release asset fetched at image build** — rejected while decision 7's triggers hold: every
  image build takes a network hop, local development needs a fetch step before the map draws, and
  a regeneration becomes upload-the-asset-then-bump-the-pin. A missing asset need not be silent —
  BuildKit's `ADD --checksum=sha256:…` fails the build on an absent or changed file, and the pin
  keeps the dependency visible in the tree — and a public repository needs no token, though a
  private one does (a secret in the image build). A candidate at a revisit, costed against the
  pipeline of the day.
- **Git LFS** — rejected: GitHub's free tier is 10 GiB of LFS bandwidth a month, the CD workflow
  redeploys after every green CI run on `main` (about eight a day when this was weighed), and at
  ~58 MiB a clone that exceeds the quota; past it LFS is blocked for the month and a build receives
  the pointer file in place of the archive. Render's feature tracker carries a request to *skip*
  LFS downloads during its clone, so its build appears to fetch LFS objects rather than lack LFS —
  not verified by a build of ours, and not what this rejection rests on. A production pipeline
  that builds in CI from a cached checkout could change the arithmetic, which is decision 7's
  third trigger.
- **Split archives, or zoom 14 on the coast only** — rejected: a PMTiles archive has one zoom
  range, and MapLibre draws a missing tile inside a source's zoom range blank rather than
  overzooming its parent, so coast-only detail needs two archives as two sources with every style
  layer duplicated and a seam where they meet — to save 11.6 MB (a coastal strip) or 29.4 MB
  (Vlorë to Ksamil). Kept as decision 7's third lever.

## Consequences

- We own tile freshness: coastlines and place names update only when the runbook is run.
- The first map load transfers a few same-origin megabytes — the tiles in view, fetched by `Range`,
  never the whole archive — so the map is lazily loaded and never blocks the venue list.
- The repository carries ~2 MB of style, sprites and glyphs and the ~60 MB archive; a regeneration
  adds another full copy to history, bounded by decision 7's triggers. GitHub's push warns about
  any file over 50 MiB, so every regeneration push prints a GH001 large-file warning; it is not an
  error below 100 MiB.
- If a Content-Security-Policy header is ever added, MapLibre's tile worker is a module worker
  spawned from a same-origin script URL the adapter names (`/vendor/maplibre-gl-worker.mjs`) — not
  a Blob URL, unlike ALTCHA's — so the policy needs `worker-src 'self'`
  (`docs/deploy/production-hardening.md`).
- The privacy policy can say, truthfully, that viewing the map sends nothing to a third party and
  that tile requests appear in our access logs like any page asset — and nowhere else.
- The network guard's first run found Stripe.js loading on Discover as a side effect of importing
  `@stripe/stripe-js`; the gateway now imports its `pure` entry, so Stripe.js is fetched only when
  a Payment Element mounts and the "payment surface only" posture holds by construction.

## Amendment log

- 2026-09-15, #1105 — the extract's bounding box widened from the riviera (Vlorë bay to Ksamil) to
  all of Albania, and the map's pan fence with it; the archive grew from ~7.6 MB to ~60 MB. The
  decision is unaffected: the first-load transfer stays a few megabytes because the browser fetches
  only the tiles in view.
- 2026-09-16, #1106 — decision 6's credit gained OpenMapTiles. The archive is built with
  Planetiler's OpenMapTiles profile, and the OpenMapTiles schema's design licence (CC-BY 4.0) asks
  maps made from it for a visible credit linking to openmaptiles.org, so the map now reads
  "© OpenMapTiles © OpenStreetMap contributors" with both names linked. The self-hosting rule is
  unaffected: a hyperlink is not a request, and the style names the credit in plain text.
- 2026-09-16, #1109 — decision 7 added: the archive stays committed, sized against a yearly
  regeneration, with three revisit triggers (over 80 MB, held by `MapArchiveBudgetTest`; a third
  regeneration in 12 months; the production deploy pipeline being chosen) and measured size
  levers, with zoom 14 kept everywhere. The rejected fetch-at-build option split into a release
  asset and Git LFS, re-weighed against facts the first text had wrong: the repository is public,
  so a release asset needs no token until it goes private; `ADD --checksum` makes a missing asset
  loud; and Render's clone appears to fetch LFS objects, so LFS is rejected on its bandwidth quota
  instead. Split archives were added as a rejected option.
