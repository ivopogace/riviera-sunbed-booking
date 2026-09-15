# Runbook: regenerating the riviera map's resources

The **riviera map** (ADR-0022) is drawn from four resources the platform hosts itself under
`/map/**`, all of them files in `platform/map/` produced by `scripts/build-riviera-map.sh`:

| Resource | Path | Produced by | Size |
|---|---|---|---|
| Style | `platform/map/style.json` | OSM Liberty (BSD-3, `maputnik/osm-liberty`) rewritten to `/map/…` URLs | ~75 kB |
| Sprites | `platform/map/sprites/osm-liberty{,@2x}.{json,png}` | fetched from the same repo | ~150 kB |
| Glyphs | `platform/map/glyphs/<font stack>/<range>.pbf` | `orangemug/font-glyphs` (Roboto, Apache-2.0): Roboto Regular, Roboto Medium, Roboto Condensed Italic × ranges 0–255 … 1024–1279 | ~1.4 MB |
| Tiles | `platform/map/riviera.pmtiles` | Planetiler 0.10.2 (OpenMapTiles profile) over Geofabrik Albania, bounds `19.00,39.50,21.20,42.80` (west, south, east, north — all of Albania, with sea room), max zoom 14, PMTiles output | ~60 MB |

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

Prerequisites: egress to the five hosts in § *Egress* below, Java 21+, Node, `curl`, about 3.5 GB
of free disk (the work directory peaks at ~3.2 GB: ~1.5 GB of sources plus Planetiler's scratch
files), and ~6 minutes cold — mostly downloads — or under two minutes once `RIVIERA_MAP_WORK` holds them.

```bash
scripts/build-riviera-map.sh --assets   # style + sprites + glyphs; seconds
scripts/build-riviera-map.sh --tiles    # Planetiler; downloads ~1.5 GB of sources into a temp dir
# or both: scripts/build-riviera-map.sh --all
```

`RIVIERA_MAP_WORK=/some/dir` keeps Planetiler's downloads (the Geofabrik extract, water polygons,
Natural Earth, lake centrelines) between runs. `RIVIERA_OSM_PBF=/path/to/albania-latest.osm.pbf`
supplies the extract instead of downloading it — see § *Egress*. Geofabrik serves
`albania-latest.osm.pbf`, which moves daily; the MANIFEST records the sha256 of the extract a run
used, and exact reproduction is possible only while Geofabrik still offers that day's file —
otherwise a regeneration is a refresh, which is the intended cadence.

Then verify and commit:

```bash
cd platform && ./gradlew test --tests "*MapStyleSelfHostedTest*" --tests "*MapResourcesTest*"
cd .. && git add platform/map && git commit -m "Regenerate the riviera map resources"
```

The first test parses the shipped style and fails on any absolute host — the review trap ADR-0022
names. Eyeball the result too: `./gradlew bootRun` from `platform/`, open the Discover page, switch
to the map, pan to Himarë, Dhërmi and Ksamil. A missing glyph range does not draw blank boxes: MapLibre
draws the character in a local font, and the tells are a `404` for `/map/glyphs/<stack>/<range>.pbf` and
the console warning "Unable to load glyph range … Rendering codepoint … locally instead" — extend
`GLYPH_RANGES` in the script and re-run `--assets`.

## Egress

The tile build reaches exactly five hosts. A cloud session's proxy allows four of them; the
Geofabrik one is the standing obstacle, and it is the only source with no reachable substitute.

| Host | Wanted for | Cloud session (checked 2026-09-15) |
|---|---|---|
| `raw.githubusercontent.com` | style, sprites, glyphs (`--assets`) | reachable |
| `github.com` → `release-assets.githubusercontent.com` | `planetiler.jar`; lake centrelines, which Planetiler 0.10.2 takes from `acalcutt/osm-lakelines` | reachable |
| `osmdata.openstreetmap.de` | water polygons (~886 MB) | reachable |
| `naciscdn.org` | Natural Earth (~414 MB) | reachable |
| `download.geofabrik.de` | `index-v1-nogeom.json` (resolves `--area`) and the OSM extract | **fails** |

So `--assets` runs in a cloud session today; `--tiles` does not, and stops at the first Geofabrik
call — `Geofabrik.getAndCacheIndex` throwing `SocketException: Connection reset`, before any of the
~1.5 GB is fetched. Planetiler honours the JVM proxy settings, so this is not a tool-configuration
gap: the proxy accepts the `CONNECT` for `download.geofabrik.de` (it is allowlisted) and the
upstream connection is then reset during the TLS handshake. That distinction matters — the proxy's
`__agentproxy/status` logs it as `ws_closed_mid_exchange`, not the `connect_rejected` it reports for
a host the policy actually denies, so **adding Geofabrik to an allowlist fixes nothing**. Raise the
reset with the proxy's operators instead.

Alternative extract mirrors do not help: `download.openstreetmap.fr`, `osm.download.movisda.io`,
`planet.openstreetmap.org`, `download.bbbike.org` and `dev.maptiler.download` are all denied
outright (`connect_rejected`).

The way through is to bring the extract in yourself, from a machine with open egress:

```bash
# on a laptop, or anywhere that can reach Geofabrik
curl -fLO https://download.geofabrik.de/europe/albania-latest.osm.pbf

# then, wherever the build runs
RIVIERA_OSM_PBF=/path/to/albania-latest.osm.pbf scripts/build-riviera-map.sh --tiles
```

`RIVIERA_OSM_PBF` passes Planetiler `--osm_path` in place of `--area`, so Geofabrik is never
contacted and the other three sources download normally. The MANIFEST records the supplied file's
sha256 under a `supplied:` prefix rather than `geofabrik:`, which is what tells a later reader the
extract came in by hand — pair it with the upstream filename so the day it names stays legible.

## Where the pins live

All in `scripts/build-riviera-map.sh`: `OSM_LIBERTY_REF` and `FONT_GLYPHS_REF` (branch refs;
set a commit SHA to freeze upstream), `PLANETILER_VERSION`, `GEOFABRIK_AREA`, `BBOX`,
`MAX_ZOOM`, `FONT_STACKS`, `GLYPH_RANGES`. `BBOX` has a twin in the frontend: the map's pan fence,
`RIVIERA_MAP_OPTIONS.maxBounds` in `frontend/src/app/shared/riviera-map.ts`, is the same box —
widen both together. The three `/map/…` URL constants the rewrite writes into the style are the
same three the frontend's real adapter prefixes with the API origin in development; changing the
prefix means changing both.

## What must never change

Every URL in the style, and everything the frontend adapter asks for, stays on our origin: no
tile CDN, no glyph host, no sprite host, no geocoder. That is the whole point of self-hosting
(ADR-0022) and the privacy policy's "no third party" claim rests on it. A convenient external URL
pasted into `style.json` reverses it silently — which is why `MapStyleSelfHostedTest` and the
real-engine network guard in `frontend/e2e/discover-map.e2e.ts` both exist.
