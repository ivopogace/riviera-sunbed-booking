import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Page } from '@playwright/test';

/** The committed map resources the backend serves in production (ADR-0022). */
const MAP_DIR = path.resolve(__dirname, '../../../platform/map');
/** A synthetic stand-in for the extract — `map-fixture/README.md`. */
const FIXTURE_ARCHIVE = path.resolve(__dirname, 'map-fixture/riviera-fixture.pmtiles');

/**
 * Serves `/map/**` from disk so the REAL MapLibre adapter can run under the mocked suite: the
 * style, sprites and glyphs straight from `platform/map/`, and the tile archive from the fixture,
 * sliced by the `Range` header exactly as the backend does — the pmtiles reader refuses a `200`
 * answer to a range request.
 */
export async function mockMapResources(page: Page): Promise<void> {
  await page.route(/\/map\/.+$/, (route) => {
    const relative = decodeURIComponent(
      new URL(route.request().url()).pathname.slice('/map/'.length),
    );
    const file = path.resolve(MAP_DIR, relative);
    if (!file.startsWith(MAP_DIR + path.sep) || !existsSync(file)) {
      return route.fulfill({ status: 404 });
    }
    return route.fulfill({ path: file, headers: { 'cache-control': 'no-store' } });
  });
  // Registered last, so it wins for the archive.
  await page.route(/\/map\/riviera\.pmtiles$/, (route) => {
    const bytes = readFileSync(FIXTURE_ARCHIVE);
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()['range'] ?? '');
    if (!range) {
      return route.fulfill({
        status: 200,
        body: bytes,
        contentType: 'application/octet-stream',
        headers: { 'accept-ranges': 'bytes' },
      });
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return route.fulfill({
      status: 206,
      body: bytes.subarray(start, end + 1),
      contentType: 'application/octet-stream',
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  });
}
