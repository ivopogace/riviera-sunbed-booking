import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  collectFeatureCodepoints,
  collectTileCodepoints,
  labelFieldsBySourceLayer,
  lat2tile,
  lon2tile,
  NodeFileSource,
  scanArchive,
  sortedGlyphRanges,
  templateFields,
  toGlyphRange,
} from './riviera-map-label-codepoints.mjs';

test('lon2tile/lat2tile place the bbox corners in the expected tile at zoom 0', () => {
  assert.equal(lon2tile(-180, 0), 0);
  assert.equal(lon2tile(179.999, 0), 0);
  assert.equal(lat2tile(0, 0), 0);
});

test('templateFields extracts every {field} name in order, with no regex backtracking risk', () => {
  assert.deepEqual(templateFields('{name}'), ['name']);
  assert.deepEqual(templateFields('{name} ({ref})'), ['name', 'ref']);
  assert.deepEqual(templateFields('no fields here'), []);
  assert.deepEqual(templateFields('{unterminated'), []);
});

test('labelFieldsBySourceLayer reads every text-field layout property, keyed by source-layer', () => {
  const style = {
    layers: [
      { id: 'place_city', 'source-layer': 'place', layout: { 'text-field': '{name_en}' } },
      { id: 'poi_z14', 'source-layer': 'poi', layout: { 'text-field': '{name}' } },
      { id: 'poi_z15', 'source-layer': 'poi', layout: { 'text-field': '{name}' } },
      { id: 'background', type: 'background' },
      { id: 'road_shield', 'source-layer': 'transportation_name', layout: {} },
    ],
  };

  const result = labelFieldsBySourceLayer(style);

  assert.deepEqual([...result.get('place')], ['name_en']);
  assert.deepEqual([...result.get('poi')], ['name']);
  assert.equal(result.has('transportation_name'), false);
  assert.equal(result.has('background'), false);
});

test('toGlyphRange floors a codepoint to its 256-wide range', () => {
  assert.equal(toGlyphRange(0), '0-255');
  assert.equal(toGlyphRange(255), '0-255');
  assert.equal(toGlyphRange(0x2013), '8192-8447');
  assert.equal(toGlyphRange(0x5343), '21248-21503');
});

test('sortedGlyphRanges de-duplicates and sorts numerically, not lexicographically', () => {
  const codepoints = new Set([0x41, 0x2013, 0x42, 0x100]);
  assert.deepEqual(sortedGlyphRanges(codepoints), ['0-255', '256-511', '8192-8447']);
});

test('collectFeatureCodepoints adds every char of every named field, skipping empty/non-string values', () => {
  const codepoints = new Set();
  const feature = { properties: { name: 'Çorovodë', name_en: '', ref: 42 } };

  collectFeatureCodepoints(feature, ['name', 'name_en', 'ref'], codepoints);

  assert.deepEqual(
    [...codepoints].sort((a, b) => a - b),
    [...new Set([...'Çorovodë'].map((c) => c.codePointAt(0)))].sort((a, b) => a - b),
  );
});

test('collectTileCodepoints walks every matching source-layer and counts features, skipping layers the tile lacks', () => {
  const fakeLayer = (names) => ({
    length: names.length,
    feature: (i) => ({ properties: { name: names[i] } }),
  });
  const tile = { layers: { place: fakeLayer(['Vlorë', 'Fier']) } };
  const fieldsBySourceLayer = new Map([
    ['place', new Set(['name'])],
    ['poi', new Set(['name'])], // absent from this tile — must be skipped, not throw
  ]);
  const codepoints = new Set();

  const featuresSeen = collectTileCodepoints(tile, fieldsBySourceLayer, codepoints);

  assert.equal(featuresSeen, 2);
  assert.ok(codepoints.has('ë'.codePointAt(0)));
});

test('scanArchive walks the header-declared tile pyramid, skipping missing tiles', async () => {
  const header = { minLon: 0, minLat: 0, maxLon: 0.01, maxLat: 0.01, minZoom: 0, maxZoom: 1 };
  let getZxyCalls = 0;
  const pmtiles = {
    getHeader: async () => header,
    getZxy: async (z) => {
      getZxyCalls++;
      return z === 0 ? { data: new Uint8Array([1]) } : null; // z1 tiles are "missing"
    },
  };
  class FakePbf {
    constructor(data) {
      this.data = data;
    }
  }
  class FakeVectorTile {
    constructor() {
      this.layers = { place: { length: 1, feature: () => ({ properties: { name_en: 'Ab' } }) } };
    }
  }
  const fieldsBySourceLayer = new Map([['place', new Set(['name_en'])]]);

  const result = await scanArchive(pmtiles, fieldsBySourceLayer, FakePbf, FakeVectorTile);

  assert.ok(getZxyCalls >= 2, 'both zoom levels were walked');
  assert.equal(result.tilesWithData, 1, 'only the z0 tile counts — the z1 miss is skipped');
  assert.equal(result.featuresSeen, 1);
  assert.deepEqual(
    [...result.codepoints].sort((a, b) => a - b),
    [65, 98],
  );
});

test('NodeFileSource reads the exact byte range requested from a real file', async () => {
  const file = path.join(os.tmpdir(), `riviera-map-label-codepoints-test-${process.pid}.bin`);
  fs.writeFileSync(file, Buffer.from('hello world'));
  try {
    const source = new NodeFileSource(file);
    assert.equal(source.getKey(), file);
    const { data } = await source.getBytes(6, 5);
    assert.equal(Buffer.from(data).toString('utf8'), 'world');
  } finally {
    fs.rmSync(file);
  }
});
