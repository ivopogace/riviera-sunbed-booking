import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const SD = process.argv[2];
const img = (n) => `data:image/png;base64,${readFileSync(`${SD}/${n}`).toString('base64')}`;
const rows = [
  ['E · Floating capsule', 'e-porcelain-1280.png', 'e-riviera-1280-in.png', 'e-porcelain-390.png', 'e-dark-390-in.png', 'e-porcelain-390-in-menu.png'],
  ['F · Search-first', 'f-porcelain-1280.png', 'f-riviera-1280-in.png', 'f-porcelain-390.png', 'f-dark-390-in.png', 'f-porcelain-1280-in-account.png'],
  ['G · Side rail', 'g-porcelain-1280.png', 'g-riviera-1280-in.png', 'g-porcelain-390.png', 'g-dark-390-in.png', 'g-porcelain-390-bottom.png'],
];
const html = `<body style="margin:0;background:#1f2937;font:600 15px system-ui;color:#fff;padding:16px;width:1400px">
${rows.map(([t, a, b, c, d, e]) => `<h2 style="margin:8px 0 6px">${t}</h2>
<img src="${img(a)}" style="width:1368px;display:block;margin-bottom:6px;border-radius:6px">
<img src="${img(b)}" style="width:1368px;display:block;margin-bottom:6px;border-radius:6px">
<div style="display:flex;gap:6px;margin-bottom:18px"><img src="${img(c)}" style="width:390px;border-radius:6px"><img src="${img(d)}" style="width:390px;border-radius:6px"><img src="${img(e)}" style="height:420px;border-radius:6px;max-width:560px;object-fit:contain;object-position:left top"></div>`).join('')}
</body>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: `${SD}/comparison-efg.png`, fullPage: true });
await browser.close();
