/**
 * PROTOTYPE — throwaway. The screenshot + measurement driver the README's shots and cost tables
 * come from.
 *
 *   node src/app/pages/prototype-map/shoot.mjs [--only Q] [--out shots/]   (from frontend/, with
 *   `npm start` serving :4200)
 *
 * playwright-core from node_modules, the image's Chromium (never `playwright install`), `/map/**`
 * served from `platform/map/` with the archive range-sliced as the backend does, and every fixture
 * photo answered with a ~1.4 kB SVG stand-in — judge photo mass, not the pictures. Per shot it
 * records the first screen's cost (map style/sprite/glyph requests, tile ranges, live WebGL
 * contexts, photos) and the geometry of the pieces the README argues from.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP_DIR = path.resolve(HERE, '../../../../../platform/map');
const ARCHIVE = readFileSync(path.join(MAP_DIR, 'riviera.pmtiles'));
const BASE = process.env.BASE ?? 'http://127.0.0.1:4200';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const OUT = args.includes('--out')
  ? path.resolve(args[args.indexOf('--out') + 1])
  : path.join(HERE, 'shots');
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844 };
const TALL = { width: 430, height: 932 };
const LAPTOP = { width: 1440, height: 900 };
const DESK = { width: 1920, height: 1080 };

const HERE_DHERMI = '19.641,40.147';

const NARROW = { width: 1024, height: 768 };
const MID = { width: 1100, height: 800 };
const WIDE_MID = { width: 1200, height: 800 };

/**
 * The shot list: name → url + viewport + optional actions (`click` a selector, `pin` an index or
 * 'lone', `scroll` the list, `theme` = data-riv-theme on <html>, `swipe` = a touchscreen flick
 * `[x, fromY, toY, ms]` dispatched through CDP as real touch events).
 */
const SHOTS = [
  // Q — the page
  { name: 'Q-shore-phone', v: PHONE, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-phone-subtitle', v: PHONE, url: 'variant=Q&head=subtitle&now=10:30' },
  { name: 'Q-shore-phone-riviera', v: PHONE, url: 'variant=Q&now=10:30', theme: 'riviera' },
  { name: 'Q-shore-phone-dark', v: PHONE, url: 'variant=Q&now=10:30', theme: 'dark' },
  {
    name: 'Q-shore-phone-flick-up',
    v: PHONE,
    url: 'variant=Q&now=10:30',
    swipe: [195, 700, 300, 150],
  },
  {
    name: 'Q-shore-phone-flick-down',
    v: PHONE,
    url: 'variant=Q&sheet=full&now=10:30',
    swipe: [195, 400, 750, 150],
  },
  { name: 'Q-shore-phone-full', v: PHONE, url: 'variant=Q&sheet=full&now=10:30' },
  {
    name: 'Q-shore-phone-full-scrolled',
    v: PHONE,
    url: 'variant=Q&sheet=full&now=10:30',
    scroll: 700,
  },
  { name: 'Q-shore-phone-pin', v: PHONE, url: 'variant=Q&now=10:30', pin: 1 },
  {
    name: 'Q-shore-phone-pin-lone',
    v: PHONE,
    url: 'variant=Q&region=SARANDE&now=10:30',
    pin: 'lone',
  },
  { name: 'Q-shore-phone-here', v: PHONE, url: `variant=Q&here=${HERE_DHERMI}&now=10:30` },
  {
    name: 'Q-shore-phone-here-pin',
    v: PHONE,
    url: `variant=Q&here=${HERE_DHERMI}&now=10:30`,
    pin: 0,
  },
  { name: 'Q-shore-phone-sarande', v: PHONE, url: 'variant=Q&region=SARANDE&now=10:30' },
  { name: 'Q-shore-phone-himare', v: PHONE, url: 'variant=Q&region=HIMARE&now=10:30' },
  { name: 'Q-shore-phone-beach', v: PHONE, url: 'variant=Q&beach=DHERMI&now=10:30' },
  { name: 'Q-shore-phone-1630', v: PHONE, url: 'variant=Q&now=16:30' },
  {
    name: 'Q-shore-phone-picker',
    v: PHONE,
    url: 'variant=Q&now=10:30',
    click: '[data-open-picker]',
  },
  { name: 'Q-shore-phone-day', v: PHONE, url: 'variant=Q&now=10:30', click: '[data-ctl="day"]' },
  {
    name: 'Q-shore-phone-beaches',
    v: PHONE,
    url: 'variant=Q&now=10:30',
    click: '[data-ctl="beaches"]',
  },
  {
    name: 'Q-shore-phone-beach-chosen',
    v: PHONE,
    url: 'variant=Q&beach=DHERMI&now=10:30',
    click: '[data-ctl="beaches"]',
  },
  { name: 'Q-shore-phone-peek', v: PHONE, url: 'variant=Q&sheet=peek&now=10:30' },
  { name: 'Q-shore-phone-peek-pin', v: PHONE, url: 'variant=Q&sheet=peek&now=10:30', pin: 1 },
  { name: 'Q-shore-phone-live', v: PHONE, url: 'variant=Q&live=1&now=10:30' },
  { name: 'Q-shore-tall', v: TALL, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-tall-peek', v: TALL, url: 'variant=Q&sheet=peek&now=10:30' },
  { name: 'Q-shore-1024', v: NARROW, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-1100', v: MID, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-1200', v: WIDE_MID, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-1440', v: LAPTOP, url: 'variant=Q&now=10:30' },
  { name: 'Q-shore-1440-pin', v: LAPTOP, url: 'variant=Q&region=HIMARE&now=10:30', pin: 'lone' },
  { name: 'Q-shore-1440-himare', v: LAPTOP, url: 'variant=Q&region=HIMARE&now=10:30' },
  {
    name: 'Q-shore-1440-himare-free',
    v: LAPTOP,
    url: 'variant=Q&region=HIMARE&pane=free&now=10:30',
  },
  { name: 'Q-shore-1440-here', v: LAPTOP, url: `variant=Q&here=${HERE_DHERMI}&now=10:30` },
  { name: 'Q-shore-1920', v: DESK, url: 'variant=Q&now=10:30' },
  // round 8: the line desk — a region in the pane, the coast as a line over the panel
  { name: 'Q-shore-1440-line', v: LAPTOP, url: 'variant=Q&desk=line&now=10:30' },
  {
    name: 'Q-shore-1440-line-sarande',
    v: LAPTOP,
    url: 'variant=Q&desk=line&region=SARANDE&now=10:30',
  },
  {
    name: 'Q-shore-1440-line-beach',
    v: LAPTOP,
    url: 'variant=Q&desk=line&beach=DHERMI&now=10:30',
  },
  {
    name: 'Q-shore-1440-line-picker',
    v: LAPTOP,
    url: 'variant=Q&desk=line&now=10:30',
    click: '[data-open-picker]',
  },
  { name: 'Q-shore-1200-line', v: WIDE_MID, url: 'variant=Q&desk=line&now=10:30' },
  { name: 'Q-shore-1024-line', v: NARROW, url: 'variant=Q&desk=line&now=10:30' },
  { name: 'Q-shore-1920-line', v: DESK, url: 'variant=Q&desk=line&now=10:30' },
];

function svgPhoto(id) {
  const hue = 170 + ((id * 37) % 40);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="576" height="384" viewBox="0 0 576 384">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,55%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue + 10},60%,28%)"/></linearGradient></defs>` +
    `<rect width="576" height="384" fill="url(#g)"/>` +
    `<ellipse cx="288" cy="330" rx="420" ry="90" fill="hsl(45,70%,80%)" opacity=".85"/>` +
    `<circle cx="470" cy="80" r="34" fill="hsl(45,95%,70%)"/>` +
    `<text x="24" y="60" font-family="sans-serif" font-size="28" fill="rgba(255,255,255,.7)">venue ${id}</text></svg>`
  );
}

async function wire(page, cost) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 404, body: '{}', contentType: 'application/json' }),
  );
  await page.route(/\/api\/venues\/\d+\/photos\//, (route) => {
    const id = Number(/venues\/(\d+)\//.exec(route.request().url())?.[1] ?? 0);
    const body = svgPhoto(id);
    cost.photos += 1;
    cost.photoBytes += body.length;
    return route.fulfill({ status: 200, body, contentType: 'image/svg+xml' });
  });
  await page.route(/\/map\/.+$/, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice('/map/'.length));
    const file = path.resolve(MAP_DIR, rel);
    if (!file.startsWith(MAP_DIR + path.sep) || !existsSync(file))
      return route.fulfill({ status: 404 });
    const bytes = readFileSync(file);
    cost.map += 1;
    cost.mapBytes += bytes.length;
    return route.fulfill({ path: file, headers: { 'cache-control': 'no-store' } });
  });
  await page.route(/\/map\/riviera\.pmtiles$/, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()['range'] ?? '');
    if (!range) {
      cost.tiles += 1;
      cost.tileBytes += ARCHIVE.length;
      return route.fulfill({ status: 200, body: ARCHIVE, contentType: 'application/octet-stream' });
    }
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), ARCHIVE.length - 1) : ARCHIVE.length - 1;
    const slice = ARCHIVE.subarray(start, end + 1);
    cost.tiles += 1;
    cost.tileBytes += slice.length;
    return route.fulfill({
      status: 206,
      body: slice,
      contentType: 'application/octet-stream',
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${ARCHIVE.length}`,
      },
    });
  });
}

const GEOMETRY = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const all = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
  const bbox = (els) => { if (!els.length) return null; let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9; for (const e of els) { const b=e.getBoundingClientRect(); x1=Math.min(x1,b.left); y1=Math.min(y1,b.top); x2=Math.max(x2,b.right); y2=Math.max(y2,b.bottom);} return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2-x1), h: Math.round(y2-y1), n: els.length }; };
  const canvases = all('canvas').map(r);
  return {
    page: Math.round(document.documentElement.scrollHeight),
    scrollY: Math.round(window.scrollY),
    canvases,
    pins: bbox(all('[data-pin]')),
    pinButtons: all('[data-pin]').filter((e) => getComputedStyle(e).opacity !== '0').map((e) => ({ t: e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24), ...r(e) })),
    rows: all('[data-row]').slice(0, 4).map(r),
    firstRow: r(document.querySelector('[data-row]')),
    tabBar: r(document.querySelector('.riv-tab-bar')),
    strip: r(document.querySelector('[data-strip]')),
    header: r(document.querySelector('header')),
    sheet: r(document.querySelector('[data-detent]')),
    poster: r(document.querySelector('[data-poster]')),
    controls: all('[data-ctl]').map((e) => ({ t: e.dataset.ctl, ...r(e) })),
    gutter: all('[data-gutter] button').map((e) => ({ t: e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24), ...r(e) })),
    pane: r(document.querySelector('app-riviera-map')?.parentElement ?? null),
    listScroll: document.querySelector('[data-body]')?.scrollTop ?? null,
    webgl: window.__glContexts ?? null,
  };
})()`;

async function shoot(browser, shot) {
  const cost = { map: 0, mapBytes: 0, tiles: 0, tileBytes: 0, photos: 0, photoBytes: 0 };
  const context = await browser.newContext({
    viewport: shot.v,
    deviceScaleFactor: 1,
    isMobile: shot.v.width < 600,
    hasTouch: shot.v.width < 600,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  if (shot.theme) {
    await page.addInitScript((theme) => {
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.setAttribute('data-riv-theme', theme),
      );
    }, shot.theme);
  }
  await page.addInitScript(() => {
    window.__glContexts = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      const ctx = orig.call(this, kind, ...rest);
      if (ctx && /webgl/.test(kind) && !this.__counted) {
        this.__counted = true;
        window.__glContexts += 1;
      }
      return ctx;
    };
  });
  await wire(page, cost);
  await page.goto(`${BASE}/prototype/map?${shot.url}`, {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });
  await page.waitForTimeout(1200);
  if (shot.theme) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-riv-theme', theme),
      shot.theme,
    );
    await page.waitForTimeout(400);
  }
  if (shot.swipe) {
    const [x, fromY, toY, ms] = shot.swipe;
    const cdp = await context.newCDPSession(page);
    const touch = (type, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    const steps = 10;
    await touch('touchStart', fromY);
    for (let i = 1; i <= steps; i += 1) {
      await touch('touchMove', fromY + ((toY - fromY) * i) / steps);
      await page.waitForTimeout(ms / steps);
    }
    await touch('touchEnd', toY);
    await page.waitForTimeout(2500);
  }
  if (shot.click) {
    await page
      .click(shot.click, { timeout: 5000 })
      .catch((e) => console.warn(`  click ${shot.click}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(1400);
  }
  if (shot.pin !== undefined) {
    // The pins that can be pressed: painted (a crowd's members are opacity-0) and, for 'lone', a single venue's.
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('[data-pin]')]
        .filter(
          (e) =>
            getComputedStyle(e).opacity !== '0' && getComputedStyle(e).pointerEvents !== 'none',
        )
        .map((e) => {
          const b = e.getBoundingClientRect();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2, text: e.textContent.trim() };
        }),
    );
    const pick =
      shot.pin === 'lone' ? targets.find((t) => /^€\d+$/.test(t.text)) : targets[shot.pin];
    if (pick) {
      await page.mouse.click(pick.x, pick.y);
      await page.waitForTimeout(1800);
    } else {
      console.warn(`  pin: none for ${shot.pin} among ${targets.map((t) => t.text).join(' | ')}`);
    }
  }
  if (shot.scroll) {
    await page.evaluate((y) => {
      const sheet = document.querySelector('[data-detent]');
      if (sheet) sheet.scrollTo(0, sheet.scrollTop + y);
      else window.scrollTo(0, y);
    }, shot.scroll);
    await page.waitForTimeout(600);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
  const geometry = await page.evaluate(GEOMETRY);
  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await context.close();
  return {
    name: shot.name,
    url: shot.url,
    viewport: `${shot.v.width}×${shot.v.height}`,
    cost,
    geometry,
  };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/** `--posters`: render Q's still posters — one per region and beach with venues — into public/. */
if (args.includes('--posters')) {
  const POSTER_DIR = path.resolve(HERE, '../../../../public/prototype-posters');
  mkdirSync(POSTER_DIR, { recursive: true });
  const REGIONS = ['SHKODER', 'LEZHE', 'DURRES', 'VLORE', 'HIMARE', 'SARANDE'];
  const BEACHES = [
    'VELIPOJE',
    'SHENGJIN',
    'LALEZ',
    'CURRILA',
    'GOLEM',
    'QERRET',
    'ZVERNEC',
    'RADHIME',
    'PALASE',
    'DRYMADES',
    'DHERMI',
    'JALE',
    'LIVADHI',
    'BORSH',
    'KSAMIL',
    'PASQYRA',
  ];
  const keys = args.includes('--key')
    ? [args[args.indexOf('--key') + 1]]
    : [...REGIONS, ...BEACHES.map((b) => `beach-${b}`)];
  for (const key of keys) {
    const context = await browser.newContext({
      viewport: { width: 480, height: 420 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await wire(page, { map: 0, mapBytes: 0, tiles: 0, tileBytes: 0, photos: 0, photoBytes: 0 });
    await page.goto(`${BASE}/prototype/map?variant=Q&poster=${key}`, {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });
    await page
      .waitForFunction(() => window.__rivPosterReady === true, null, { timeout: 60_000 })
      .catch(() => console.warn(`  ${key}: not ready`));
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
    const file = path.join(POSTER_DIR, `${key}.jpg`);
    await page.screenshot({
      path: file,
      type: 'jpeg',
      quality: 84,
      clip: { x: 0, y: 0, width: 440, height: 380 },
    });
    console.log(`${key} → ${(statSync(file).size / 1024).toFixed(0)} kB`);
    await context.close();
  }
  await browser.close();
  process.exit(0);
}

const results = [];
for (const shot of SHOTS) {
  if (only && !shot.name.startsWith(only)) continue;
  process.stdout.write(`${shot.name} … `);
  try {
    const r = await shoot(browser, shot);
    results.push(r);
    const c = r.cost;
    const g = r.geometry;
    console.log(
      `map ${c.map}/${(c.mapBytes / 1024).toFixed(0)}kB tiles ${c.tiles}/${(c.tileBytes / 1024).toFixed(0)}kB ` +
        `photos ${c.photos}/${(c.photoBytes / 1024).toFixed(0)}kB gl ${g.webgl} canvases ${g.canvases.length} page ${g.page}px ` +
        `pins ${g.pins ? `${g.pins.w}×${g.pins.h}@${g.pins.x},${g.pins.y}` : '-'} firstRow ${g.firstRow ? `y${g.firstRow.y} h${g.firstRow.h}` : '-'}` +
        (g.pane && g.pins
          ? ` fill ${Math.round((100 * g.pins.w) / g.pane.w)}%×${Math.round((100 * g.pins.h) / g.pane.h)}%`
          : '') +
        (g.sheet ? ` sheet ${g.sheet.y}` : ''),
    );
  } catch (e) {
    console.log(`FAILED ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
if (args.includes('--json')) {
  writeFileSync(
    path.join(OUT, `measurements${only ? '-' + only : ''}.json`),
    JSON.stringify(results, null, 2),
  );
}
