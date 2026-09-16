#!/usr/bin/env bash
# Unit tests for build-riviera-map.sh's MANIFEST.txt mechanism: --assets and --tiles must each
# own their own section and never touch the other's, fetch() must reuse an unchanged line
# byte-for-byte, and a pre-header legacy file must be refused rather than silently truncated.
# No network or JVM needed — file_url()'s file:// URLs and temp MANIFEST files stand in.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Source the script's functions without running its CLI dispatch — the script guards that
# behind `[[ "${BASH_SOURCE[0]}" == "${0}" ]]` precisely so it can be sourced for testing.
# shellcheck source=build-riviera-map.sh
source "$REPO_ROOT/scripts/build-riviera-map.sh"

pass=0
fail=0

assert_eq() { # <expected> <actual> <message>
  local expected="$1" actual="$2" message="$3"
  if [[ "$expected" == "$actual" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL: $message"
    echo "  expected: $expected"
    echo "  actual:   $actual"
  fi
}

with_temp_manifest() { # <test-fn>: runs $1 with $MANIFEST pointed at a fresh temp file
  local test_fn="$1" tmp
  tmp="$(mktemp)"
  rm -f "$tmp" # write_manifest_section must work with no pre-existing file too
  MANIFEST="$tmp" "$test_fn"
  rm -f "$tmp"
}

test_write_manifest_section_creates_new_file() {
  local lines; lines="$(mktemp)"
  printf 'sha1  url1  ts1\n' > "$lines"
  write_manifest_section "$MANIFEST_ASSETS_HEADER" "$lines"
  rm -f "$lines"
  assert_eq "$MANIFEST_ASSETS_HEADER
sha1  url1  ts1" "$(cat "$MANIFEST")" "write_manifest_section creates a fresh file with its header + lines"
}

test_write_manifest_section_leaves_other_section_untouched() {
  local assets_lines tiles_lines
  assets_lines="$(mktemp)"; tiles_lines="$(mktemp)"
  printf 'sha-a  url-a  ts-a\n' > "$assets_lines"
  printf 'sha-t  url-t  ts-t\n' > "$tiles_lines"

  write_manifest_section "$MANIFEST_ASSETS_HEADER" "$assets_lines"
  write_manifest_section "$MANIFEST_TILES_HEADER" "$tiles_lines"
  rm -f "$assets_lines" "$tiles_lines"

  assert_eq "sha-a  url-a  ts-a" "$(manifest_section "$MANIFEST_ASSETS_HEADER")" \
    "the assets section survives a later --tiles write (AC-3, order: assets then tiles)"
  assert_eq "sha-t  url-t  ts-t" "$(manifest_section "$MANIFEST_TILES_HEADER")" \
    "the tiles section is present after its own write"
}

test_write_manifest_section_reverse_order() {
  local assets_lines tiles_lines
  assets_lines="$(mktemp)"; tiles_lines="$(mktemp)"
  printf 'sha-t  url-t  ts-t\n' > "$tiles_lines"
  printf 'sha-a  url-a  ts-a\n' > "$assets_lines"

  write_manifest_section "$MANIFEST_TILES_HEADER" "$tiles_lines"
  write_manifest_section "$MANIFEST_ASSETS_HEADER" "$assets_lines"
  rm -f "$assets_lines" "$tiles_lines"

  assert_eq "sha-t  url-t  ts-t" "$(manifest_section "$MANIFEST_TILES_HEADER")" \
    "the tiles section survives a later --assets write (AC-3, reverse order)"
  assert_eq "sha-a  url-a  ts-a" "$(manifest_section "$MANIFEST_ASSETS_HEADER")" \
    "the assets section is present after its own write"
}

test_write_manifest_section_replaces_own_section_without_duplicating() {
  local first second
  first="$(mktemp)"; second="$(mktemp)"
  printf 'sha-old  url-old  ts-old\n' > "$first"
  printf 'sha-new  url-new  ts-new\n' > "$second"

  write_manifest_section "$MANIFEST_TILES_HEADER" "$first"
  write_manifest_section "$MANIFEST_TILES_HEADER" "$second"
  rm -f "$first" "$second"

  assert_eq "sha-new  url-new  ts-new" "$(manifest_section "$MANIFEST_TILES_HEADER")" \
    "re-running the same mode replaces its section wholesale, no duplicate lines (AC-3)"
}

test_manifest_section_absent_returns_empty() {
  assert_eq "" "$(manifest_section "$MANIFEST_TILES_HEADER")" \
    "reading a section from a file that doesn't exist yet returns nothing"
}

test_write_manifest_section_refuses_a_headerless_legacy_manifest() {
  printf 'sha-legacy  url-legacy  ts-legacy\n' > "$MANIFEST" # pre-#1112 format: no header at all
  local lines; lines="$(mktemp)"
  printf 'sha-new  url-new  ts-new\n' > "$lines"

  local status=0
  write_manifest_section "$MANIFEST_ASSETS_HEADER" "$lines" 2>/dev/null || status=$?
  rm -f "$lines"

  assert_eq "1" "$status" \
    "write_manifest_section must refuse (not silently drop) a MANIFEST with no section headers"
  assert_eq "sha-legacy  url-legacy  ts-legacy" "$(cat "$MANIFEST")" \
    "a refused write must leave the legacy file untouched"
}

# Run on Git Bash on Windows, this is a real MSYS path-mangling regression check, not just a logic check.
test_rewrite_style_preserves_map_paths() {
  local input output
  input="$(mktemp)"; output="$(mktemp)"
  cat > "$input" <<'JSON'
{
  "sources": { "openmaptiles": { "type": "vector" } },
  "layers": [
    { "id": "background", "type": "background" },
    { "id": "water", "type": "fill", "source": "openmaptiles" },
    { "id": "hillshade", "type": "raster", "source": "hillshade-source" }
  ]
}
JSON

  rewrite_style "$input" "$output" "pmtiles:///map/riviera.pmtiles" \
    "/map/sprites/osm-liberty" "/map/glyphs/{fontstack}/{range}.pbf"

  # $output is passed as argv, not embedded in the -e source string, so node can open it directly.
  local read_field='const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(process.argv[2].split(".").reduce((o,k)=>o[k],s))'
  assert_eq "/map/sprites/osm-liberty" "$(node -e "$read_field" "$output" sprite)" \
    "rewrite_style must write the literal sprite path, unmangled by MSYS path conversion"
  assert_eq "/map/glyphs/{fontstack}/{range}.pbf" "$(node -e "$read_field" "$output" glyphs)" \
    "rewrite_style must write the literal glyphs path, unmangled by MSYS path conversion"
  assert_eq "pmtiles:///map/riviera.pmtiles" "$(node -e "$read_field" "$output" sources.openmaptiles.url)" \
    "rewrite_style must write the literal source URL"

  rm -f "$input" "$output"
}

# The credit the tiles' licences require (OpenMapTiles CC-BY, OSM ODbL) — plain text, never a URL:
# ADR-0022 treats any hostname in the shipped style as a Blocker.
test_rewrite_style_credits_openmaptiles_and_osm() {
  local input output credit="© OpenMapTiles © OpenStreetMap contributors"
  input="$(mktemp)"; output="$(mktemp)"
  printf '{ "sources": { "openmaptiles": { "type": "vector" } }, "layers": [] }\n' > "$input"

  rewrite_style "$input" "$output" "pmtiles:///map/riviera.pmtiles" \
    "/map/sprites/osm-liberty" "/map/glyphs/{fontstack}/{range}.pbf"

  local read_attribution='const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(s.sources.openmaptiles.attribution)'
  assert_eq "$credit" "$(node -e "$read_attribution" "$output")" \
    "rewrite_style must credit OpenMapTiles and OpenStreetMap contributors"
  assert_eq "$credit" "$(node -e "$read_attribution" "$REPO_ROOT/platform/map/style.json")" \
    "the committed style must carry the credit rewrite_style writes — regenerate with --assets"

  rm -f "$input" "$output"
}

# file:// URLs let fetch() run end-to-end (download + manifest-line decision) with no network —
# curl needs an absolute path, and `pwd -W` gives one on Git Bash/MSYS where plain `pwd` doesn't.
file_url() { # file_url <dir>
  local dir="$1"
  printf 'file:///%s' "$(cd "$dir" && pwd -W 2>/dev/null || pwd)"
}


test_fetch_reuses_old_line_byte_for_byte_when_content_unchanged() {
  local dir dest lines url old_sha
  dir="$(mktemp -d)"
  printf 'unchanged content\n' > "$dir/src.pbf"
  dest="$dir/dest.pbf"; lines="$(mktemp)"
  url="$(file_url "$dir")/src.pbf"
  old_sha="$(sha256sum "$dir/src.pbf" | cut -d' ' -f1)"

  fetch "$url" "$dest" "$lines" "$old_sha  $url  2020-01-01T00:00:00Z"

  assert_eq "$old_sha  $url  2020-01-01T00:00:00Z" "$(cat "$lines")" \
    "fetch reuses the old manifest line verbatim, timestamp included, when the sha256 still matches"
  rm -rf "$dir" "$lines"
}

test_fetch_writes_a_fresh_line_when_content_drifted() {
  local dir dest lines url new_sha
  dir="$(mktemp -d)"
  printf 'new content\n' > "$dir/src.pbf"
  dest="$dir/dest.pbf"; lines="$(mktemp)"
  url="$(file_url "$dir")/src.pbf"
  new_sha="$(sha256sum "$dir/src.pbf" | cut -d' ' -f1)"

  fetch "$url" "$dest" "$lines" "stale-sha-from-a-prior-run  $url  2020-01-01T00:00:00Z"

  assert_eq "$new_sha" "$(awk '{print $1}' "$lines")" \
    "fetch writes a fresh sha256 (not the stale recorded one) when upstream content drifted"
  rm -rf "$dir" "$lines"
}

test_fetch_writes_a_fresh_line_when_theres_no_prior_entry() {
  local dir dest lines url new_sha
  dir="$(mktemp -d)"
  printf 'brand new range\n' > "$dir/src.pbf"
  dest="$dir/dest.pbf"; lines="$(mktemp)"
  url="$(file_url "$dir")/src.pbf"
  new_sha="$(sha256sum "$dir/src.pbf" | cut -d' ' -f1)"

  fetch "$url" "$dest" "$lines" "some-other-sha  file:///elsewhere/other.pbf  2020-01-01T00:00:00Z"

  assert_eq "$new_sha $url" "$(awk '{print $1, $2}' "$lines")" \
    "fetch writes a fresh line for a url the old section has no entry for"
  rm -rf "$dir" "$lines"
}

with_temp_manifest test_write_manifest_section_creates_new_file
with_temp_manifest test_write_manifest_section_leaves_other_section_untouched
with_temp_manifest test_write_manifest_section_reverse_order
with_temp_manifest test_write_manifest_section_replaces_own_section_without_duplicating
with_temp_manifest test_manifest_section_absent_returns_empty
with_temp_manifest test_write_manifest_section_refuses_a_headerless_legacy_manifest
test_rewrite_style_preserves_map_paths
test_rewrite_style_credits_openmaptiles_and_osm
test_fetch_reuses_old_line_byte_for_byte_when_content_unchanged
test_fetch_writes_a_fresh_line_when_content_drifted
test_fetch_writes_a_fresh_line_when_theres_no_prior_entry

echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
