#!/usr/bin/env bash
# Builds the riviera map's self-hosted resources into platform/map/ (ADR-0022): the OSM Liberty
# style rewritten to same-origin /map/… URLs, its sprites, the Roboto glyph ranges, and the PMTiles
# extract of the Albanian riviera. Repeatable by construction — pinned versions, a recorded bbox,
# and a MANIFEST of every upstream byte — and run by hand: docs/runbooks/riviera-map-tiles.md.
#
#   scripts/build-riviera-map.sh --assets   # style + sprites + glyphs (a few MB, seconds)
#   scripts/build-riviera-map.sh --tiles    # Planetiler over Geofabrik Albania (needs Java 21+, ~1 GB of downloads)
#   scripts/build-riviera-map.sh --all
#
# Every URL the shipped style names must stay a /map/… path — MapStyleSelfHostedTest holds it to that.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAP_DIR="$REPO_ROOT/platform/map"
MANIFEST="$MAP_DIR/MANIFEST.txt"

# --- pins ------------------------------------------------------------------------------------
# OSM Liberty (BSD-3-Clause, maputnik/osm-liberty). A branch ref tracks upstream; the MANIFEST
# records the sha256 of what was actually fetched, so a silent upstream change shows as a diff.
OSM_LIBERTY_REF="${OSM_LIBERTY_REF:-gh-pages}"
OSM_LIBERTY_RAW="https://raw.githubusercontent.com/maputnik/osm-liberty/$OSM_LIBERTY_REF"
# The glyph ranges OSM Liberty itself points at (orangemug/font-glyphs; Roboto is Apache-2.0).
FONT_GLYPHS_REF="${FONT_GLYPHS_REF:-gh-pages}"
FONT_GLYPHS_RAW="https://raw.githubusercontent.com/orangemug/font-glyphs/$FONT_GLYPHS_REF/glyphs"
FONT_STACKS=("Roboto Regular" "Roboto Medium" "Roboto Condensed Italic")
# Basic Latin, Latin-1, Latin Extended-A/B, IPA, Greek, Cyrillic — every script a riviera label uses.
GLYPH_RANGES=(0-255 256-511 512-767 768-1023 1024-1279)
# Planetiler (Apache-2.0) with its OpenMapTiles profile — the schema OSM Liberty is written for.
PLANETILER_VERSION="${PLANETILER_VERSION:-0.10.2}"
PLANETILER_JAR_URL="https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar"
GEOFABRIK_AREA="albania"
# west,south,east,north — Vlorë bay down to Ksamil, with sea room on both sides.
BBOX="19.30,39.55,20.20,40.55"
MAX_ZOOM=14

STYLE_SOURCE="pmtiles:///map/riviera.pmtiles"
STYLE_SPRITE="/map/sprites/osm-liberty"
STYLE_GLYPHS="/map/glyphs/{fontstack}/{range}.pbf"

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2; }

fetch() { # fetch <url> <dest>: download, then append "sha256  url  utc-timestamp" to the manifest
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  curl --fail --silent --show-error --location --output "$dest" "$url"
  printf '%s  %s  %s\n' "$(sha256sum "$dest" | cut -d' ' -f1)" "$url" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$MANIFEST"
}

build_assets() {
  echo "== assets → $MAP_DIR"
  mkdir -p "$MAP_DIR"
  : > "$MANIFEST"
  fetch "$OSM_LIBERTY_RAW/style.json" "$MAP_DIR/style.upstream.json"
  for f in osm-liberty.json osm-liberty.png osm-liberty@2x.json osm-liberty@2x.png; do
    fetch "$OSM_LIBERTY_RAW/sprites/$f" "$MAP_DIR/sprites/$f"
  done
  for stack in "${FONT_STACKS[@]}"; do
    for range in "${GLYPH_RANGES[@]}"; do
      fetch "$FONT_GLYPHS_RAW/${stack// /%20}/$range.pbf" "$MAP_DIR/glyphs/$stack/$range.pbf"
    done
  done

  # Rewrite the style: the vector source becomes our archive, the raster hillshade (an external
  # host) and its layer go, and sprite + glyphs become /map/… paths. Layers are otherwise untouched.
  STYLE_SOURCE="$STYLE_SOURCE" STYLE_SPRITE="$STYLE_SPRITE" STYLE_GLYPHS="$STYLE_GLYPHS" \
  node - "$MAP_DIR/style.upstream.json" "$MAP_DIR/style.json" <<'JS'
    const fs = require('node:fs');
    const [, , input, output] = process.argv;
    const style = JSON.parse(fs.readFileSync(input, 'utf8'));
    const vector = Object.entries(style.sources).filter(([, s]) => s.type === 'vector').map(([id]) => id);
    if (vector.length !== 1) throw new Error(`expected one vector source, found ${vector}`);
    const keep = vector[0];
    style.sources = {
      [keep]: { type: 'vector', url: process.env.STYLE_SOURCE, attribution: '© OpenStreetMap contributors' },
    };
    style.layers = style.layers.filter((l) => l.type === 'background' || l.source === keep);
    style.sprite = process.env.STYLE_SPRITE;
    style.glyphs = process.env.STYLE_GLYPHS;
    style.name = 'Riviera (OSM Liberty)';
    fs.writeFileSync(output, JSON.stringify(style, null, 2) + '\n');
JS
  rm "$MAP_DIR/style.upstream.json"
  echo "   style, $(ls "$MAP_DIR/sprites" | wc -l) sprite files, $(find "$MAP_DIR/glyphs" -name '*.pbf' | wc -l) glyph ranges"
}

build_tiles() {
  echo "== tiles → $MAP_DIR/riviera.pmtiles"
  command -v java >/dev/null || { echo "java 21+ is required" >&2; exit 1; }
  local work="${RIVIERA_MAP_WORK:-$(mktemp -d)}"
  local jar="$work/planetiler-$PLANETILER_VERSION.jar"
  [ -f "$jar" ] || fetch "$PLANETILER_JAR_URL" "$jar"
  # Planetiler downloads the Geofabrik extract plus its water-polygon, Natural Earth and lake
  # centreline sources into $work/data/ (~1 GB, cached across runs when RIVIERA_MAP_WORK is set).
  (cd "$work" && java -Xmx2g -jar "$jar" \
      --download --area="$GEOFABRIK_AREA" --bounds="$BBOX" --maxzoom="$MAX_ZOOM" \
      --output="$MAP_DIR/riviera.pmtiles" --force)
  for src in "$work"/data/sources/*.osm.pbf; do
    [ -f "$src" ] && printf '%s  %s  %s\n' "$(sha256sum "$src" | cut -d' ' -f1)" "geofabrik:$(basename "$src")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$MANIFEST"
  done
  echo "   $(du -h "$MAP_DIR/riviera.pmtiles" | cut -f1) — bbox $BBOX, maxzoom $MAX_ZOOM, planetiler $PLANETILER_VERSION"
}

[ $# -eq 1 ] || usage
case "$1" in
  --assets) build_assets ;;
  --tiles) build_tiles ;;
  --all) build_assets; build_tiles ;;
  *) usage ;;
esac
