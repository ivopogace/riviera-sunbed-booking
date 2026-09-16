#!/usr/bin/env node
// Prints the glyph ranges scripts/build-riviera-map.sh's GLYPH_RANGES must cover for the committed archive's labels. Usage: node scripts/riviera-map-label-codepoints.mjs (run `npm ci` in frontend/ first).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const ARCHIVE_PATH = path.join(REPO_ROOT, 'platform/map/riviera.pmtiles');
const STYLE_PATH = path.join(REPO_ROOT, 'platform/map/style.json');

// The library ships only browser File-backed and fetch-backed sources; this is the Node one.
export class NodeFileSource {
  constructor(filePath) {
    this.path = filePath;
    this.fd = fs.openSync(filePath, 'r');
  }
  getKey() {
    return this.path;
  }
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length);
    fs.readSync(this.fd, buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }
}

export function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function lat2tile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

// A template's {field} names, e.g. "{name} ({ref})" -> ["name", "ref"]. No regex: avoids S8786.
export function templateFields(template) {
  const fields = [];
  let start = template.indexOf('{');
  while (start !== -1) {
    const end = template.indexOf('}', start + 1);
    if (end === -1) break;
    fields.push(template.slice(start + 1, end));
    start = template.indexOf('{', end + 1);
  }
  return fields;
}

// Derived from style.json's "text-field" layout property, so a new label layer is picked up automatically.
export function labelFieldsBySourceLayer(style) {
  const bySourceLayer = new Map();
  for (const layer of style.layers) {
    const template = layer.layout?.['text-field'];
    const sourceLayer = layer['source-layer'];
    if (!template || !sourceLayer) continue;
    const existing = bySourceLayer.get(sourceLayer) ?? new Set();
    for (const field of templateFields(template)) existing.add(field);
    bySourceLayer.set(sourceLayer, existing);
  }
  return bySourceLayer;
}

export function toGlyphRange(codepoint) {
  const start = Math.floor(codepoint / 256) * 256;
  return `${start}-${start + 255}`;
}

// Adds every codepoint <feature>'s <fields> render to <codepoints>.
export function collectFeatureCodepoints(feature, fields, codepoints) {
  for (const field of fields) {
    const value = feature.properties[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    for (const ch of value) codepoints.add(ch.codePointAt(0));
  }
}

// Adds every codepoint a decoded <tile>'s label layers render to <codepoints>; returns the feature count seen.
export function collectTileCodepoints(tile, fieldsBySourceLayer, codepoints) {
  let featuresSeen = 0;
  for (const [sourceLayerName, fields] of fieldsBySourceLayer) {
    const layer = tile.layers[sourceLayerName];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      collectFeatureCodepoints(layer.feature(i), fields, codepoints);
      featuresSeen++;
    }
  }
  return featuresSeen;
}

export function sortedGlyphRanges(codepoints) {
  return [...new Set([...codepoints].map(toGlyphRange))].sort(
    (a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]),
  );
}

// Walks the header's whole tile pyramid, decoding each tile and collecting every label codepoint.
export async function scanArchive(pmtiles, fieldsBySourceLayer, Pbf, VectorTile) {
  const header = await pmtiles.getHeader();
  const { minLon, minLat, maxLon, maxLat, minZoom, maxZoom } = header;
  const codepoints = new Set();
  let tilesWithData = 0;
  let featuresSeen = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tile(minLon, z);
    const xMax = lon2tile(maxLon, z);
    const yMin = lat2tile(maxLat, z);
    const yMax = lat2tile(minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const result = await pmtiles.getZxy(z, x, y);
        if (!result) continue;
        tilesWithData++;
        const tile = new VectorTile(new Pbf(result.data));
        featuresSeen += collectTileCodepoints(tile, fieldsBySourceLayer, codepoints);
      }
    }
  }
  return { codepoints, tilesWithData, featuresSeen };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const { PMTiles } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'frontend/node_modules/pmtiles/dist/esm/index.js'))
  );
  const { PbfReader: Pbf } = require(path.join(REPO_ROOT, 'frontend/node_modules/pbf/index.js'));
  const { VectorTile } = require(
    path.join(REPO_ROOT, 'frontend/node_modules/@mapbox/vector-tile/index.js'),
  );

  const style = JSON.parse(fs.readFileSync(STYLE_PATH, 'utf8'));
  const fieldsBySourceLayer = labelFieldsBySourceLayer(style);
  const pmtiles = new PMTiles(new NodeFileSource(ARCHIVE_PATH));

  const { codepoints, tilesWithData, featuresSeen } = await scanArchive(
    pmtiles,
    fieldsBySourceLayer,
    Pbf,
    VectorTile,
  );

  console.error(
    `${tilesWithData} tiles decoded, ${featuresSeen} labeled features, ${codepoints.size} distinct codepoints`,
  );
  console.log(sortedGlyphRanges(codepoints).join(' '));
}
