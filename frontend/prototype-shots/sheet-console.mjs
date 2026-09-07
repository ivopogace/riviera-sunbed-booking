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
const VARIANTS = (process.env.VARIANTS ?? 'current,b,c,d,e,f').split(',');
const NAMES = {
  current: 'CURRENT · shipped pill strips',
  b: 'B · Tab rail',
  c: 'C · Sidebar',
  d: 'D · One shell (section bar + tab rail)',
  e: 'E · Palette',
  f: 'F · Ranked rail + current-aware More',
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
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const { view, crop, stack, width } of SHEETS) {
  const cell = (v) => `
    <div style="${stack ? '' : 'flex:0 0 auto;'}">
      <div style="padding:5px 8px;background:#0f172a;color:#fff;font:700 15px system-ui">${NAMES[v]}</div>
      <div style="width:${width}px;height:${crop}px;overflow:hidden;background:#000">
        <img src="${img(`${view}-${v}.png`)}" style="width:${width}px;display:block">
      </div>
    </div>`;
  const body = stack
    ? `<div style="display:flex;flex-direction:column;gap:10px">${VARIANTS.map(cell).join('')}</div>`
    : `<div style="display:flex;gap:10px;align-items:flex-start">${VARIANTS.map(cell).join('')}</div>`;
  const sheetWidth = stack ? width + 20 : VARIANTS.length * (width + 10) + 20;
  const page = await browser.newPage({
    viewport: { width: sheetWidth, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;padding:10px;background:#334155;width:${sheetWidth - 20}px">${body}</body>`,
  );
  await page.screenshot({
    path: `${OUT}/${process.env.SHEET ?? 'sheet'}-${view}.png`,
    fullPage: true,
  });
  await page.close();
  console.log(`sheet-${view}.png`);
}

await browser.close();
