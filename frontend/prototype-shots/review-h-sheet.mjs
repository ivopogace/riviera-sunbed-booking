import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const SD = process.argv[2];
const out = process.argv[3];
const names = process.argv.slice(4);
const img = (n) => `data:image/png;base64,${readFileSync(`${SD}/${n}.png`).toString('base64')}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
const cells = names
  .map(
    (n) =>
      `<div style="flex:0 0 auto"><div style="padding:4px 8px;background:#0f172a;color:#fff;font:700 13px system-ui">${n}</div><img src="${img(n)}" style="display:block"></div>`,
  )
  .join('');
await page.setContent(
  `<body style="margin:0;padding:8px;background:#334155"><div style="display:flex;gap:8px;align-items:flex-start">${cells}</div></body>`,
);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
