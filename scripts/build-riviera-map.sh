#!/usr/bin/env bash
# Builds the riviera map's self-hosted resources into platform/map/ (ADR-0022): the OSM Liberty
# style rewritten to same-origin /map/… URLs, its sprites, the Roboto glyph ranges, and the PMTiles
# extract of Albania. Repeatable by construction — pinned versions, a recorded bbox,
# and a MANIFEST of every upstream byte — and run by hand: docs/runbooks/riviera-map-tiles.md.
#
#   scripts/build-riviera-map.sh --assets   # style + sprites + glyphs (a few MB, seconds)
#   scripts/build-riviera-map.sh --tiles    # Planetiler over Geofabrik Albania (needs Java 21+, ~1.5 GB of downloads)
#   scripts/build-riviera-map.sh --all
#
# Every URL the shipped style names must stay a /map/… path — MapStyleSelfHostedTest holds it to that.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAP_DIR="$REPO_ROOT/platform/map"
MANIFEST="$MAP_DIR/MANIFEST.txt"
# MANIFEST.txt is split into two sections, one per run mode, so re-running one mode replaces
# only its own lines and never the other mode's.
MANIFEST_ASSETS_HEADER="# assets"
MANIFEST_TILES_HEADER="# tiles"

# --- pins ------------------------------------------------------------------------------------
# OSM Liberty (BSD-3-Clause, maputnik/osm-liberty). A branch ref tracks upstream; the MANIFEST
# records the sha256 of what was actually fetched, so a silent upstream change shows as a diff.
OSM_LIBERTY_REF="${OSM_LIBERTY_REF:-gh-pages}"
OSM_LIBERTY_RAW="https://raw.githubusercontent.com/maputnik/osm-liberty/$OSM_LIBERTY_REF"
# The glyph ranges OSM Liberty itself points at (orangemug/font-glyphs; Roboto is Apache-2.0).
FONT_GLYPHS_REF="${FONT_GLYPHS_REF:-gh-pages}"
FONT_GLYPHS_RAW="https://raw.githubusercontent.com/orangemug/font-glyphs/$FONT_GLYPHS_REF/glyphs"
FONT_STACKS=("Roboto Regular" "Roboto Medium" "Roboto Condensed Italic")
# Basic Latin, Latin-1, Latin Extended-A/B, IPA, Greek, Cyrillic, General Punctuation (en/em
# dash, curly quotes), and the two CJK blocks the archive's few Chinese POI names use — every
# codepoint a label in the committed archive actually renders. Recomputed with
# scripts/riviera-map-label-codepoints.mjs (docs/runbooks/riviera-map-tiles.md § glyph ranges).
GLYPH_RANGES=(0-255 256-511 512-767 768-1023 1024-1279 8192-8447 21248-21503 33536-33791)
# Planetiler (Apache-2.0) with its OpenMapTiles profile — the schema OSM Liberty is written for.
PLANETILER_VERSION="${PLANETILER_VERSION:-0.10.2}"
PLANETILER_JAR_URL="https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar"
# Planetiler's own compiled-in default source URLs (v0.10.2), used as a manifest fallback when
# a run reuses a cached source with no sidecar yet to read the real origin from — a
# PLANETILER_VERSION bump is a deliberate, reviewed pin change, so a drift here only shows up
# as a stale URL on a cache-hit run, and only until the next fresh download writes a sidecar.
WATER_POLYGONS_URL="https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip"
NATURAL_EARTH_URL="https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip"
LAKE_CENTERLINES_URL="https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip"
GEOFABRIK_AREA="albania"
# west,south,east,north — all of Albania, Sazan to Lake Prespa and Konispol to Vërmosh, with sea room.
BBOX="19.00,39.50,21.20,42.80"
MAX_ZOOM=14

STYLE_SOURCE="pmtiles:///map/riviera.pmtiles"
STYLE_SPRITE="/map/sprites/osm-liberty"
STYLE_GLYPHS="/map/glyphs/{fontstack}/{range}.pbf"

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2; }

manifest_line() { # manifest_line <file> <url-or-label> → "sha256  url  utc-timestamp"
  local file="$1" label="$2"
  printf '%s  %s  %s\n' "$(sha256sum "$file" | cut -d' ' -f1)" "$label" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# Read the named section's body (its lines, header excluded) from MANIFEST.txt, or nothing
# if the file or the section doesn't exist yet.
manifest_section() { # manifest_section <header>
  local header="$1"
  [[ -f "$MANIFEST" ]] || return 0
  awk -v header="$header" '
    $0 == header { insec = 1; next }
    insec && /^# / { exit }
    insec { print }
  ' "$MANIFEST"
}

# Replace the named section wholesale with the lines in <lines-file>, rewriting MANIFEST.txt
# with both sections in a fixed order — the other section (if any) is carried over verbatim,
# so re-running one mode never touches or duplicates the other mode's lines.
write_manifest_section() { # write_manifest_section <header> <lines-file>
  local header="$1" lines_file="$2"
  local other_header other_body
  if [[ "$header" == "$MANIFEST_ASSETS_HEADER" ]]; then other_header="$MANIFEST_TILES_HEADER"
  else other_header="$MANIFEST_ASSETS_HEADER"; fi
  other_body="$(manifest_section "$other_header")"
  {
    if [[ "$header" == "$MANIFEST_ASSETS_HEADER" ]]; then
      echo "$MANIFEST_ASSETS_HEADER"; cat "$lines_file"
      [[ -n "$other_body" ]] && { echo "$MANIFEST_TILES_HEADER"; printf '%s\n' "$other_body"; }
    else
      [[ -n "$other_body" ]] && { echo "$MANIFEST_ASSETS_HEADER"; printf '%s\n' "$other_body"; }
      echo "$MANIFEST_TILES_HEADER"; cat "$lines_file"
    fi
  } > "$MANIFEST.new"
  mv "$MANIFEST.new" "$MANIFEST"
}

# Returns (on stdout) the previous manifest line for <url> in <old-section>, but only if the
# freshly-fetched <dest> still hashes to that line's recorded sha256 — i.e. upstream did not
# drift. Exit 1 (nothing printed) when there's no prior line for <url>, or its content changed.
reuse_manifest_line() { # reuse_manifest_line <dest> <url> <old-section>
  local dest="$1" url="$2" old_section="$3"
  local old_line; old_line="$(awk -v url="$url" '$2 == url { print; exit }' <<<"$old_section")"
  [[ -n "$old_line" ]] || return 1
  local old_sha; old_sha="$(awk '{ print $1 }' <<<"$old_line")"
  [[ "$old_sha" == "$(sha256sum "$dest" | cut -d' ' -f1)" ]] || return 1
  printf '%s\n' "$old_line"
}

fetch() { # fetch <url> <dest> <lines-file> [<old-section>]: download, then append a manifest
  # line — the exact previous line, unchanged, when <old-section> has one for <url> whose
  # sha256 still matches (so re-running --assets to add a glyph range leaves every other line,
  # timestamp included, byte-for-byte untouched); a fresh line (new sha256/timestamp) otherwise,
  # which is also how real upstream drift on a mutable branch ref shows up in the MANIFEST diff.
  local url="$1" dest="$2" lines_file="$3" old_section="${4:-}"
  mkdir -p "$(dirname "$dest")"
  curl --fail --silent --show-error --location --output "$dest" "$url"
  local reused
  if [[ -n "$old_section" ]] && reused="$(reuse_manifest_line "$dest" "$url" "$old_section")"; then
    printf '%s\n' "$reused" >> "$lines_file"
  else
    manifest_line "$dest" "$url" >> "$lines_file"
  fi
}

build_assets() {
  echo "== assets → $MAP_DIR"
  mkdir -p "$MAP_DIR"
  local lines; lines="$(mktemp)"
  local old_assets; old_assets="$(manifest_section "$MANIFEST_ASSETS_HEADER")"
  fetch "$OSM_LIBERTY_RAW/style.json" "$MAP_DIR/style.upstream.json" "$lines" "$old_assets"
  for f in osm-liberty.json osm-liberty.png osm-liberty@2x.json osm-liberty@2x.png; do
    fetch "$OSM_LIBERTY_RAW/sprites/$f" "$MAP_DIR/sprites/$f" "$lines" "$old_assets"
  done
  for stack in "${FONT_STACKS[@]}"; do
    for range in "${GLYPH_RANGES[@]}"; do
      fetch "$FONT_GLYPHS_RAW/${stack// /%20}/$range.pbf" "$MAP_DIR/glyphs/$stack/$range.pbf" "$lines" "$old_assets"
    done
  done
  write_manifest_section "$MANIFEST_ASSETS_HEADER" "$lines"
  rm -f "$lines"

  rewrite_style "$MAP_DIR/style.upstream.json" "$MAP_DIR/style.json" \
    "$STYLE_SOURCE" "$STYLE_SPRITE" "$STYLE_GLYPHS"
  rm "$MAP_DIR/style.upstream.json"
  echo "   style, $(ls "$MAP_DIR/sprites" | wc -l) sprite files, $(find "$MAP_DIR/glyphs" -name '*.pbf' | wc -l) glyph ranges"
}

rewrite_style() { # <input-style> <output-style> <source-url> <sprite> <glyphs>
  local input="$1" output="$2" source="$3" sprite="$4" glyphs="$5" params
  params="$(mktemp)"
  # Bash writes these as file content, never as an env var or argv string a native exe like node.exe would see — MSYS2 mangles a path-shaped value handed either way, but not one read back from a file.
  printf '{"source":"%s","sprite":"%s","glyphs":"%s"}' "$source" "$sprite" "$glyphs" > "$params"

  # Rewrite the style: the vector source becomes our archive, the raster hillshade (an external
  # host) and its layer go, and sprite + glyphs become /map/… paths. Layers are otherwise untouched.
  node - "$input" "$output" "$params" <<'JS'
    const fs = require('node:fs');
    const [, , input, output, paramsPath] = process.argv;
    const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
    const style = JSON.parse(fs.readFileSync(input, 'utf8'));
    const vector = Object.entries(style.sources).filter(([, s]) => s.type === 'vector').map(([id]) => id);
    if (vector.length !== 1) throw new Error(`expected one vector source, found ${vector}`);
    const keep = vector[0];
    style.sources = {
      [keep]: { type: 'vector', url: params.source, attribution: '© OpenStreetMap contributors' },
    };
    style.layers = style.layers.filter((l) => l.type === 'background' || l.source === keep);
    style.sprite = params.sprite;
    style.glyphs = params.glyphs;
    style.name = 'Riviera (OSM Liberty)';
    fs.writeFileSync(output, JSON.stringify(style, null, 2) + '\n');
JS
  rm -f "$params"
}

# A tiny sidecar file beside a cached Planetiler source, recording the exact URL (or, for the
# OSM extract, just the dated basename) it was last fetched from. Planetiler logs nothing at
# all on a cache hit — verified by running --tiles twice against a warm RIVIERA_MAP_WORK — so
# this sidecar is the only way a later cache-hit run still knows what it's reusing.
origin_sidecar() { local file="$1"; printf '%s.origin-url' "$file"; }

# The stable (pre-redirect) URL Planetiler's own log says it downloaded <name> from this run,
# or nothing if <name> wasn't freshly downloaded (a cache hit produces no log line for it).
# Deliberately never the redirect target: naciscdn.org/osmdata.openstreetmap.de don't redirect,
# and GitHub release assets redirect to a signed, expiring blob URL that is useless to record.
planetiler_stable_url() { # planetiler_stable_url <log> <name>
  local log="$1" name="$2" raw
  raw="$(sed -n "s/.*\[download:$name\] - Downloading \(.*\) to .*/\1/p" "$log" | tail -1)"
  [[ -n "$raw" ]] || return 1
  printf '%s\n' "${raw%% (redirected to *}"
}

# The dated basename Geofabrik's "-latest" redirect targeted this run (e.g.
# "albania-260914.osm.pbf"), or nothing if the extract wasn't freshly downloaded this run.
osm_dated_basename() { # osm_dated_basename <log>
  local log="$1" raw
  raw="$(sed -n "s/.*\[download:osm\] - Downloading \(.*\) to .*/\1/p" "$log" | tail -1)"
  [[ -n "$raw" ]] || return 1
  [[ "$raw" == *" (redirected to "* ]] || { printf '%s\n' "$(basename "$raw")"; return 0; }
  local redirected="${raw#*\(redirected to }"
  basename "${redirected%)}"
}

# Records a Planetiler-managed source (water polygons / Natural Earth / lake centrelines):
# the URL Planetiler's log says it fetched from this run, else the sidecar from a past fresh
# download, else the documented static default — recorded whether reused from cache or not.
record_planetiler_source() { # record_planetiler_source <log> <name> <fallback-url> <file> <lines-file>
  local log="$1" name="$2" fallback="$3" file="$4" lines_file="$5"
  [[ -f "$file" ]] || return 0
  local sidecar url
  sidecar="$(origin_sidecar "$file")"
  if url="$(planetiler_stable_url "$log" "$name")"; then
    printf '%s' "$url" > "$sidecar"
  elif [[ -f "$sidecar" ]]; then
    url="$(cat "$sidecar")"
  else
    url="$fallback"
  fi
  manifest_line "$file" "$url" >> "$lines_file"
}

# Records the OSM extract under its dated Geofabrik name (e.g. "geofabrik:albania-260914.osm.pbf"),
# same fresh/sidecar/fallback precedence as record_planetiler_source — the fallback here is the
# old undated local basename, since there is no dateless "static default" for a moving file.
record_planetiler_extract() { # record_planetiler_extract <log> <file> <lines-file>
  local log="$1" file="$2" lines_file="$3"
  [[ -f "$file" ]] || return 0
  local sidecar name
  sidecar="$(origin_sidecar "$file")"
  if name="$(osm_dated_basename "$log")"; then
    printf '%s' "$name" > "$sidecar"
  elif [[ -f "$sidecar" ]]; then
    name="$(cat "$sidecar")"
  else
    name="$(basename "$file")"
  fi
  manifest_line "$file" "geofabrik:$name" >> "$lines_file"
}

build_tiles() {
  echo "== tiles → $MAP_DIR/riviera.pmtiles"
  command -v java >/dev/null || { echo "java 21+ is required" >&2; exit 1; }
  local work="${RIVIERA_MAP_WORK:-$(mktemp -d)}"
  local jar="$work/planetiler-$PLANETILER_VERSION.jar"
  local lines; lines="$(mktemp)"
  if [[ -f "$jar" ]]; then
    manifest_line "$jar" "$PLANETILER_JAR_URL" >> "$lines"
  else
    fetch "$PLANETILER_JAR_URL" "$jar" "$lines"
  fi
  # Planetiler downloads the Geofabrik extract plus its water-polygon, Natural Earth and lake
  # centreline sources into $work/data/ (~1.5 GB, cached across runs when RIVIERA_MAP_WORK is set).
  # RIVIERA_OSM_PBF=<file> supplies the extract instead, so --area never contacts Geofabrik and
  # only the other three sources are fetched — for an environment whose egress cannot reach
  # Geofabrik but reaches the rest (docs/runbooks/riviera-map-tiles.md § Egress).
  local -a osm_source
  if [[ -n "${RIVIERA_OSM_PBF:-}" ]]; then
    [[ -f "$RIVIERA_OSM_PBF" ]] || { echo "RIVIERA_OSM_PBF is not a file: $RIVIERA_OSM_PBF" >&2; exit 1; }
    osm_source=(--osm_path="$RIVIERA_OSM_PBF")
  else
    osm_source=(--area="$GEOFABRIK_AREA")
  fi
  local planetiler_log; planetiler_log="$(mktemp)"
  # Planetiler parses --output as a URI, so an absolute Windows path (C:/…) reads as the scheme "C";
  # a name relative to $work parses on every OS, and the move keeps a failed run off the committed archive.
  # The log is tee'd (not just captured) so the run stays as visible as before; pipefail (set -o
  # pipefail, above) still fails the build on a non-zero Planetiler exit, not just a tee failure.
  (cd "$work" && java -Xmx2g -jar "$jar" \
      --download "${osm_source[@]}" --bounds="$BBOX" --maxzoom="$MAX_ZOOM" \
      --output=riviera.pmtiles --force) 2>&1 | tee "$planetiler_log"
  mv "$work/riviera.pmtiles" "$MAP_DIR/riviera.pmtiles"

  if [[ -n "${RIVIERA_OSM_PBF:-}" ]]; then
    manifest_line "$RIVIERA_OSM_PBF" "supplied:$(basename "$RIVIERA_OSM_PBF")" >> "$lines"
  else
    for src in "$work"/data/sources/*.osm.pbf; do
      record_planetiler_extract "$planetiler_log" "$src" "$lines"
    done
  fi
  record_planetiler_source "$planetiler_log" water_polygons "$WATER_POLYGONS_URL" \
    "$work/data/sources/water-polygons-split-3857.zip" "$lines"
  record_planetiler_source "$planetiler_log" natural_earth "$NATURAL_EARTH_URL" \
    "$work/data/sources/natural_earth_vector.sqlite.zip" "$lines"
  record_planetiler_source "$planetiler_log" lake_centerlines "$LAKE_CENTERLINES_URL" \
    "$work/data/sources/lake_centerline.shp.zip" "$lines"

  write_manifest_section "$MANIFEST_TILES_HEADER" "$lines"
  rm -f "$lines" "$planetiler_log"
  echo "   $(du -h "$MAP_DIR/riviera.pmtiles" | cut -f1) — bbox $BBOX, maxzoom $MAX_ZOOM, planetiler $PLANETILER_VERSION"
}

main() {
  [[ $# -eq 1 ]] || usage
  case "$1" in
    --assets) build_assets ;;
    --tiles) build_tiles ;;
    --all) build_assets; build_tiles ;;
    *) usage ;;
  esac
}

# Guards the CLI dispatch so the script can be `source`d for its functions — see
# scripts/build-riviera-map.test.sh — without running `main` (and its `usage`/`exit 2`).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
