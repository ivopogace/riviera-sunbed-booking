import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

/**
 * PROTOTYPE — throwaway. One labelled contact sheet per surface shot by `shoot-console.mjs`, so
 * the six nav variants can be compared in one image per view. Desktop views stack; phone views
 * sit side by side.
 *
 *   node prototype-shots/sheet-console.mjs <shotDir> [outDir]
 *   VARIANTS=current,d,f SHEET=focus node prototype-shots/sheet-console.mjs <shotDir>
 */

const SD = process.argv[2];
const OUT = process.argv[3] ?? SD;
const VARIANTS = (process.env.VARIANTS ?? 'current,b,c,d,e,f,g').split(',');
const NAMES = {
  current: 'CURRENT · shipped pill strips',
  b: 'B · Tab rail',
  c: 'C · Sidebar',
  d: 'D · One shell (section bar + tab rail)',
  e: 'E · Palette',
  f: 'F · Ranked rail + current-aware More',
  g: 'G · Decided shape (D as answered)',
  'g-dark': 'G · Decided shape — dark console theme',
};

const img = (n) => `data:image/png;base64,${readFileSync(`${SD}/${n}`).toString('base64')}`;

const SHEETS = [
  { view: 'daily', crop: 460, stack: true, width: 1280 },
  { view: 'beach-map', crop: 900, stack: true, width: 1280 },
  { view: 'requests', crop: 460, stack: true, width: 1280 },
  { view: 'admin', crop: 560, stack: true, width: 1280 },
  { view: 'audit', crop: 420, stack: true, width: 1280 },
  { view: 'landing', crop: 420, stack: true, width: 1280 },
  { view: 'admin-out', crop: 320, stack: true, width: 1280 },
  { view: 'daily-phone', crop: 844, stack: false, width: 390 },
  { view: 'requests-phone', crop: 844, stack: false, width: 390 },
  { view: 'beach-phone', crop: 844, stack: false, width: 390 },
  { view: 'admin-phone', crop: 844, stack: false, width: 390 },
  { view: 'audit-phone', crop: 844, stack: false, width: 390 },
  // G only: the Galaxy Fold cover screen, the open states, and the dark console theme.
  { view: 'daily-fold', crop: 882, stack: false, width: 344, variants: ['g'] },
  { view: 'requests-fold', crop: 882, stack: false, width: 344, variants: ['g'] },
  { view: 'admin-fold', crop: 882, stack: false, width: 344, variants: ['g'] },
  { view: 'audit-fold', crop: 882, stack: false, width: 344, variants: ['g'] },
  { view: 'more-open-fold', crop: 882, stack: false, width: 344, variants: ['g'] },
  { view: 'more-open-phone', crop: 844, stack: false, width: 390, variants: ['g'] },
  { view: 'palette-open', crop: 720, stack: true, width: 1280, variants: ['e', 'g'] },
  { view: 'venue-open', crop: 560, stack: true, width: 1280, variants: ['c', 'd', 'f', 'g'] },
  { view: 'theme-open', crop: 560, stack: true, width: 1280, variants: ['g'] },
  {
    view: 'daily',
    crop: 460,
    stack: true,
    width: 1280,
    variants: ['g', 'g-dark'],
    name: 'daily-themes',
  },
  {
    view: 'beach-map',
    crop: 900,
    stack: true,
    width: 1280,
    variants: ['g', 'g-dark'],
    name: 'beach-map-themes',
  },
  {
    view: 'admin',
    crop: 560,
    stack: true,
    width: 1280,
    variants: ['g', 'g-dark'],
    name: 'admin-themes',
  },
  {
    view: 'requests-phone',
    crop: 844,
    stack: false,
    width: 390,
    variants: ['g', 'g-dark'],
    name: 'requests-phone-themes',
  },
  {
    view: 'landing',
    crop: 420,
    stack: true,
    width: 1280,
    variants: ['g', 'g-dark'],
    name: 'landing-themes',
  },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const { view, crop, stack, width, variants = VARIANTS, name = view } of SHEETS) {
  const cell = (v) => `
    <div style="${stack ? '' : 'flex:0 0 auto;'}">
      <div style="padding:5px 8px;background:#0f172a;color:#fff;font:700 15px system-ui">${NAMES[v]}</div>
      <div style="width:${width}px;height:${crop}px;overflow:hidden;background:#000">
        <img src="${img(`${view}-${v}.png`)}" style="width:${width}px;display:block">
      </div>
    </div>`;
  const body = stack
    ? `<div style="display:flex;flex-direction:column;gap:10px">${variants.map(cell).join('')}</div>`
    : `<div style="display:flex;gap:10px;align-items:flex-start">${variants.map(cell).join('')}</div>`;
  const sheetWidth = stack ? width + 20 : variants.length * (width + 10) + 20;
  const page = await browser.newPage({
    viewport: { width: sheetWidth, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;padding:10px;background:#334155;width:${sheetWidth - 20}px">${body}</body>`,
  );
  await page.screenshot({
    path: `${OUT}/${process.env.SHEET ?? 'sheet'}-${name}.png`,
    fullPage: true,
  });
  await page.close();
  console.log(`sheet-${name}.png`);
}

await browser.close();
