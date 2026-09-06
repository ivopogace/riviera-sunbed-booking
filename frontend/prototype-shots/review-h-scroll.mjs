import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const theme of ['porcelain', 'riviera', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
  await page.route(/\/api\/.*/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/venues(\?.*)?$/, (r) =>
    r.fulfill({
      json: Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        name: `Beach ${i + 1}`,
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        ratingTenths: 45,
        reviewsCount: 10,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 2500, currency: 'EUR' },
        availability: { free: 5, total: 10 },
        salesOpen: true,
      })),
    }),
  );
  await page.goto('http://127.0.0.1:4200/?variant=h', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({
    header: getComputedStyle(document.querySelector('header')).position,
    shellPad: getComputedStyle(document.querySelector('app-root > div')).paddingBottom,
  }));
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const h = document.querySelector('header').getBoundingClientRect();
    const n = document.querySelector('nav[aria-label="Primary (phone)"]').getBoundingClientRect();
    return {
      headerBottom: h.bottom,
      stickyChrome: (h.bottom > 0 ? h.height : 0) + n.height,
      navBg: getComputedStyle(document.querySelector('nav[aria-label="Primary (phone)"]'))
        .backgroundColor,
    };
  });
  console.log(theme, JSON.stringify({ before, after }));
  await page.screenshot({ path: `/tmp/shots/h2/scrolled-${theme}.png` });
  await page.locator('nav[aria-label="Primary (phone)"] button').click();
  await page.waitForTimeout(300);
  const sheet = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="h-sheet"]')).bottom,
  );
  console.log('  sheet bottom (computed):', sheet);
  await ctx.close();
}
await browser.close();
