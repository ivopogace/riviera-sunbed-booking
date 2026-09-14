# Runbook: regenerating the riviera map's resources

The **riviera map** (ADR-0022) is drawn from four resources the platform hosts itself under
`/map/**`, all of them files in `platform/map/` produced by `scripts/build-riviera-map.sh`:

| Resource | Path | Produced by | Size |
|---|---|---|---|
| Style | `platform/map/style.json` | OSM Liberty (BSD-3, `maputnik/osm-liberty`) rewritten to `/map/…` URLs | ~50 kB |
| Sprites | `platform/map/sprites/osm-liberty{,@2x}.{json,png}` | fetched from the same repo | ~250 kB |
| Glyphs | `platform/map/glyphs/<font stack>/<range>.pbf` | `orangemug/font-glyphs` (Roboto, Apache-2.0): Roboto Regular, Roboto Medium, Roboto Condensed Italic × ranges 0–255 … 1024–1279 | ~1.2 MB |
| Tiles | `platform/map/riviera.pmtiles` | Planetiler 0.10.2 (OpenMapTiles profile) over Geofabrik Albania, bounds `19.30,39.55,20.20,40.55` (west, south, east, north — Vlorë bay to Ksamil), max zoom 14, PMTiles output | expected 10–20 MB |

`platform/map/MANIFEST.txt` lists the sha256, URL and fetch time of every upstream byte the
last run pulled — a regeneration that changes it is an upstream change, and the diff says which.

**Regeneration is a manual action, never automation.** Nothing in CI or the deploy fetches map
data: the files are committed, `platform/Dockerfile` copies `platform/map/` to `/app/map/`, and
`MapResourcesConfig` serves it (`riviera.map.dir`). The archive is deliberately not on the
classpath — it is read by HTTP `Range`, and a deflated jar entry cannot seek.

## When to regenerate

- Coastline or place-name changes worth showing (rare; a season at most).
- A style, sprite or glyph change upstream that we want (check the MANIFEST diff).
- A widening of the bounding box or of the glyph ranges (edit the pins in the script first).

## How

Prerequisites: a machine with open egress (the cloud session's proxy denies every OSM data host),
Java 21+, Node, `curl`, about 2 GB of free disk for Planetiler's source cache, ~5 minutes.

```bash
scripts/build-riviera-map.sh --assets   # style + sprites + glyphs; seconds
scripts/build-riviera-map.sh --tiles    # Planetiler; downloads ~1 GB of sources into a temp dir
# or both: scripts/build-riviera-map.sh --all
```

`RIVIERA_MAP_WORK=/some/dir` keeps Planetiler's downloads (the Geofabrik extract, water polygons,
Natural Earth, lake centrelines) between runs. Geofabrik serves `albania-latest.osm.pbf`, which
moves daily; the MANIFEST records the sha256 of the extract a run used, and exact reproduction is
possible only while Geofabrik still offers that day's file — otherwise a regeneration is a
refresh, which is the intended cadence.

Then verify and commit:

```bash
cd platform && ./gradlew test --tests "*MapStyleSelfHostedTest*" --tests "*MapResourcesTest*"
cd .. && git add platform/map && git commit -m "Regenerate the riviera map resources"
```

The first test parses the shipped style and fails on any absolute host — the review trap ADR-0022
names. Eyeball the result too: `./gradlew bootRun` from `platform/`, open the Discover page, switch
to the map, pan to Himara and Ksamil. Labels rendering as blank boxes mean a glyph range is missing
— extend `GLYPH_RANGES` in the script and re-run `--assets`.

## Where the pins live

All in `scripts/build-riviera-map.sh`: `OSM_LIBERTY_REF` and `FONT_GLYPHS_REF` (branch refs;
set a commit SHA to freeze upstream), `PLANETILER_VERSION`, `GEOFABRIK_AREA`, `BBOX`,
`MAX_ZOOM`, `FONT_STACKS`, `GLYPH_RANGES`. The three `/map/…` URL constants the rewrite writes
into the style are the same three the frontend's real adapter prefixes with the API origin in
development; changing the prefix means changing both.

## What must never change

Every URL in the style, and everything the frontend adapter asks for, stays on our origin: no
tile CDN, no glyph host, no sprite host, no geocoder. That is the whole point of self-hosting
(ADR-0022) and the privacy policy's "no third party" claim rests on it. A convenient external URL
pasted into `style.json` reverses it silently — which is why `MapStyleSelfHostedTest` and the
real-engine network guard in `frontend/e2e/discover-map.e2e.ts` both exist.
