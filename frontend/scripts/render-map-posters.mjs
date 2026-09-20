/**
 * Renders the riviera map's posters — the stills the venue sheet opens on — from the committed
 * extract (ADR-0022) into `public/posters/`: one JPEG per catalogue region and beach, per width
 * bucket and device pixel ratio, exactly the set `src/app/pages/home/map-poster.ts` names. Run it
 * whenever the extract, the style or the catalogue changes (docs/runbooks/riviera-map-tiles.md
 * § Posters); `map-poster-set.spec.ts` fails CI on a set that is incomplete or stray.
 *
 *   npm run posters                # from frontend/; every poster
 *   npm run posters -- --key HIMARE --key beach-DHERMI   # a few
 *
 * The page's own module decides the camera: it is bundled with esbuild and imported here, so the
 * picture on disk and the pins projected over it come from one computation. The image's Chromium
 * draws it through MapLibre and the pmtiles protocol, served the style, sprites, glyphs and archive
 * straight from `platform/map/` with `Range` slicing, as the backend serves them.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import esbuild from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const MAP_DIR = path.resolve(FRONTEND, '../platform/map');
const OUT_DIR = path.join(FRONTEND, 'public/posters');
const MAPLIBRE_DIST = path.join(FRONTEND, 'node_modules/maplibre-gl/dist');
const PMTILES_UMD = path.join(FRONTEND, 'node_modules/pmtiles/dist/pmtiles.js');
/** A private origin the render page lives on; every request to it is answered from disk. */
const ORIGIN = 'http://posters.riviera.invalid';
const JPEG_QUALITY = 80;
const PARALLEL = 3;

const args = process.argv.slice(2);
const onlyKeys = args.flatMap((arg, i) => (arg === '--key' ? [args[i + 1]] : []));

async function posterSet() {
  const bundle = await esbuild.build({
    entryPoints: [path.join(FRONTEND, 'src/app/pages/home/map-poster.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const code = Buffer.from(bundle.outputFiles[0].text).toString('base64');
  const module = await import(`data:text/javascript;base64,${code}`);
  return module.POSTER_SET;
}

/** The render page: MapLibre over the pmtiles protocol at one camera, `window.__ready` once idle. */
function renderPage(camera, width, height) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/maplibre-gl.css">
<style>html,body{margin:0;background:#dfe9ef}#map{width:${width}px;height:${height}px}</style>
</head><body><div id="map"></div>
<script src="/pmtiles.js"></script>
<script type="module">
import * as maplibregl from '/maplibre-gl.mjs';
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
const absolute = (url) => url.startsWith('/map/') ? '${ORIGIN}' + url
  : url.startsWith('pmtiles:///map/') ? 'pmtiles://${ORIGIN}' + url.slice('pmtiles://'.length) : url;
const map = new maplibregl.Map({
  container: 'map',
  center: [${camera.center.lng}, ${camera.center.lat}],
  zoom: ${camera.zoom},
  interactive: false,
  attributionControl: false,
  fadeDuration: 0,
});
map.setStyle('${ORIGIN}/map/style.json', {
  transformStyle: (_previous, next) => ({
    ...next,
    sources: Object.fromEntries(Object.entries(next.sources).map(([id, source]) => [id,
      'url' in source ? { ...source, url: absolute(source.url) } : source])),
    sprite: typeof next.sprite === 'string' ? absolute(next.sprite) : next.sprite,
    glyphs: next.glyphs === undefined ? undefined : absolute(next.glyphs),
  }),
});
map.once('idle', () => { window.__ready = true; });
</script></body></html>`;
}

/** Answers the render page's origin from disk: the page, the libraries, and `/map/**` as the backend would. */
async function serve(page, html, archive) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname === '/') {
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (/^\/maplibre-gl(-shared|-worker)?\.mjs$/.test(pathname)) {
      return route.fulfill({
        path: path.join(MAPLIBRE_DIST, pathname.slice(1)),
        contentType: 'text/javascript',
      });
    }
    if (pathname === '/maplibre-gl.css') {
      return route.fulfill({ path: path.join(MAPLIBRE_DIST, 'maplibre-gl.css') });
    }
    if (pathname === '/pmtiles.js') {
      return route.fulfill({ path: PMTILES_UMD, contentType: 'text/javascript' });
    }
    if (pathname === '/map/riviera.pmtiles') {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()['range'] ?? '');
      if (!range) {
        return route.fulfill({ body: archive, contentType: 'application/octet-stream' });
      }
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), archive.length - 1) : archive.length - 1;
      return route.fulfill({
        status: 206,
        body: archive.subarray(start, end + 1),
        contentType: 'application/octet-stream',
        headers: {
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${archive.length}`,
        },
      });
    }
    if (pathname.startsWith('/map/')) {
      const file = path.resolve(MAP_DIR, pathname.slice('/map/'.length));
      if (!file.startsWith(MAP_DIR + path.sep) || !existsSync(file)) {
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({ path: file });
    }
    return route.fulfill({ status: 404 });
  });
}

async function render(browser, archive, poster) {
  const { width, height } = poster.bucket;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: poster.density,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await serve(page, renderPage(poster.camera, width, height), archive);
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    if (errors.length > 0) {
      throw new Error(`${poster.file}: ${errors.join(' | ')}`);
    }
    const file = path.join(OUT_DIR, poster.file);
    const bytes = await page.screenshot({
      type: 'jpeg',
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width, height },
    });
    writeFileSync(file, bytes);
    return statSync(file).size;
  } finally {
    await context.close();
  }
}

const set = (await posterSet()).filter(
  (poster) => onlyKeys.length === 0 || onlyKeys.includes(poster.key),
);
if (set.length === 0) {
  console.error(`no poster matches ${onlyKeys.join(', ')}`);
  process.exit(2);
}
mkdirSync(OUT_DIR, { recursive: true });
const archive = readFileSync(path.join(MAP_DIR, 'riviera.pmtiles'));
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
);
let total = 0;
let failed = 0;
const queue = [...set];
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let poster = queue.shift(); poster !== undefined; poster = queue.shift()) {
      try {
        const size = await render(browser, archive, poster);
        total += size;
        console.log(
          `${poster.file.padEnd(34)} zoom ${poster.camera.zoom.toFixed(2)}  ${(size / 1024).toFixed(0).padStart(4)} kB`,
        );
      } catch (error) {
        failed += 1;
        console.error(`FAILED ${error.message}`);
      }
    }
  }),
);
await browser.close();
console.log(`${set.length - failed}/${set.length} posters, ${(total / 1_048_576).toFixed(1)} MB`);
process.exit(failed === 0 ? 0 : 1);
