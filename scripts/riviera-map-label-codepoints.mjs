#!/usr/bin/env node
// Prints the glyph ranges scripts/build-riviera-map.sh's GLYPH_RANGES must cover for the committed archive's labels. Usage: node scripts/riviera-map-label-codepoints.mjs (run `npm ci` in frontend/ first).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const { PMTiles } = await import(
  pathToFileURL(path.join(REPO_ROOT, 'frontend/node_modules/pmtiles/dist/esm/index.js'))
);
const { PbfReader: Pbf } = require(path.join(REPO_ROOT, 'frontend/node_modules/pbf/index.js'));
const { VectorTile } = require(
  path.join(REPO_ROOT, 'frontend/node_modules/@mapbox/vector-tile/index.js'),
);

const ARCHIVE_PATH = path.join(REPO_ROOT, 'platform/map/riviera.pmtiles');
const STYLE_PATH = path.join(REPO_ROOT, 'platform/map/style.json');

// The library ships only browser File-backed and fetch-backed sources; this is the Node one.
class NodeFileSource {
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
    return {
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  }
}

function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

// Derived from style.json's "text-field" layout property, so a new label layer is picked up automatically.
function labelFieldsBySourceLayer(style) {
  const bySourceLayer = new Map();
  for (const layer of style.layers) {
    const template = layer.layout && layer.layout['text-field'];
    const sourceLayer = layer['source-layer'];
    if (!template || !sourceLayer) continue;
    const fields = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const existing = bySourceLayer.get(sourceLayer) ?? new Set();
    for (const f of fields) existing.add(f);
    bySourceLayer.set(sourceLayer, existing);
  }
  return bySourceLayer;
}

function toGlyphRange(codepoint) {
  const start = Math.floor(codepoint / 256) * 256;
  return `${start}-${start + 255}`;
}

async function main() {
  const style = JSON.parse(fs.readFileSync(STYLE_PATH, 'utf8'));
  const fieldsBySourceLayer = labelFieldsBySourceLayer(style);

  const pmtiles = new PMTiles(new NodeFileSource(ARCHIVE_PATH));
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
        for (const [sourceLayerName, fields] of fieldsBySourceLayer) {
          const layer = tile.layers[sourceLayerName];
          if (!layer) continue;
          for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            featuresSeen++;
            for (const field of fields) {
              const value = feature.properties[field];
              if (typeof value !== 'string' || value.length === 0) continue;
              for (const ch of value) codepoints.add(ch.codePointAt(0));
            }
          }
        }
      }
    }
  }

  const ranges = [...new Set([...codepoints].map(toGlyphRange))].sort(
    (a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]),
  );

  console.error(
    `${tilesWithData} tiles decoded, ${featuresSeen} labeled features, ${codepoints.size} distinct codepoints`,
  );
  console.log(ranges.join(' '));
}

main();
