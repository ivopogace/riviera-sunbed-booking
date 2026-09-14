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
of a few same-origin megabytes.

## Decision

1. **All four map resources are served by our own origin**, under `/map/**`, by the backend image
   that already serves the SPA and the venue photos: the style, the PMTiles archive, the glyph
   ranges and the sprites live in `platform/map/`, are copied to `/app/map/` on the image, and are
   served from that directory by a root-package resource handler with `Range` support. Every URL
   the shipped style names is a `/map/…` path. **No third-party map host is ever contacted from a
   tourist's browser**, and the engine is MapLibre GL (BSD, no telemetry, no token), bundled from
   npm, never a CDN.
2. **No geocoding service, in either direction.** Venue positions are placed by hand on this same
   map in the operator console (a later slice); no address is ever sent to a geocoder, and no
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
5. **Two machine locks hold the decision.** `MapStyleSelfHostedTest` parses the shipped style and
   fails on any absolute host; the mocked Playwright suite runs the real MapLibre adapter against
   the committed resources and fails on any request that leaves our origin.
6. **Attribution** "© OpenStreetMap contributors" is rendered permanently on the map (ODbL), as a
   link to the licence page — the one outbound reference, and a hyperlink rather than a request,
   exactly as the ALTCHA widget's footer is.

## The review trap

This decision is deliberately made and cheap to reverse by accident. One pasted glyph URL, one
"let's just use the demo tiles for now", one sprite path pointing back at the style's upstream
host, and every visitor's IP flows to a third party again — silently, with the map looking
identical. That is why the two locks in Decision 5 exist, why the runbook says it in bold, and why
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
- **Fetching the archive at image build** (a release asset, Git LFS) — rejected for now: Render's
  git build has no LFS, a release asset needs a network hop in every build and a token for a
  private repo, and an absent artifact would become a silent config default instead of a visible
  gap in the tree. Revisit if regeneration frequency makes the repo growth matter.

## Consequences

- We own tile freshness: coastlines and place names update only when the runbook is run.
- The first map load transfers a few same-origin megabytes, so the map is lazily loaded and never
  blocks the venue list.
- The repository carries ~2 MB of style, sprites and glyphs and, once generated, the archive; a
  regeneration adds another copy to history.
- If a Content-Security-Policy header is ever added, MapLibre's Web Workers are spawned from Blob
  URLs like ALTCHA's, so the policy needs `worker-src blob:` (`docs/deploy/production-hardening.md`).
- The privacy policy can say, truthfully, that viewing the map sends nothing to a third party and
  that tile requests appear in our access logs like any page asset — and nowhere else.
