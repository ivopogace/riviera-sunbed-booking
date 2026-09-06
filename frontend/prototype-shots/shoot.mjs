import { chromium } from 'playwright';

const OUT = process.argv[2];
const VENUES = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil', region: 'Albanian Riviera', ratingTenths: 48, reviewsCount: 326, bookingMode: 'INSTANT', fromPrice: { minorUnits: 2500, currency: 'EUR' }, amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'], distanceToWaterM: 15, availability: { free: 18, total: 24 }, salesOpen: true },
  { id: 2, name: 'Aurora Bay', beach: 'Dhërmi', region: 'Albanian Riviera', ratingTenths: 41, reviewsCount: 88, bookingMode: 'REQUEST', fromPrice: { minorUnits: 3000, currency: 'EUR' }, availability: { free: 5, total: 10 }, salesOpen: true },
  { id: 3, name: 'Gjipe Cove Club', beach: 'Gjipe', region: 'Albanian Riviera', ratingTenths: 45, reviewsCount: 12, bookingMode: 'INSTANT', fromPrice: { minorUnits: 2000, currency: 'EUR' }, availability: { free: 0, total: 8 }, salesOpen: true },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const shots = [];

async function shoot({ variant, theme, width, height, signedIn, open, bottom }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route(/\/api\/.*/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username: 'sofia.kelmendi@example.com', principalType: 'CUSTOMER', emailVerified: true } })
      : route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ status: 401, code: 'UNAUTHENTICATED' }) }),
  );
  await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
  await page.goto(`http://127.0.0.1:4200/?variant=${variant}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="prototype-switcher"]');
  await page.waitForTimeout(400);
  if (open === 'account') {
    await page.locator('button[aria-label^="Account"]').first().click();
    await page.waitForTimeout(300);
  }
  if (open === 'menu') {
    await page.locator('button[aria-label="Menu"]').first().click();
    await page.waitForTimeout(300);
  }
  const name = `${variant}-${theme}-${width}${signedIn ? '-in' : ''}${open ? '-' + open : ''}${bottom ? '-bottom' : ''}.png`;
  const clip = bottom ? { x: 0, y: height - 200, width, height: 200 } : { x: 0, y: 0, width, height: Math.min(height, 420) };
  await page.screenshot({ path: `${OUT}/${name}`, clip });
  shots.push(name);
  await context.close();
}







for (const variant of ['current', 'b', 'c', 'd', 'e', 'f', 'g']) {
  await shoot({ variant, theme: 'porcelain', width: 1280, height: 720, signedIn: false });
  await shoot({ variant, theme: 'riviera', width: 1280, height: 720, signedIn: true });
  await shoot({ variant, theme: 'porcelain', width: 390, height: 844, signedIn: false });
  await shoot({ variant, theme: 'dark', width: 390, height: 844, signedIn: true });
}
await shoot({ variant: 'e', theme: 'porcelain', width: 390, height: 844, signedIn: true, open: 'menu' });
await shoot({ variant: 'f', theme: 'porcelain', width: 1280, height: 720, signedIn: true, open: 'account' });
await shoot({ variant: 'g', theme: 'porcelain', width: 390, height: 844, signedIn: false, bottom: true });
await browser.close();
console.log(shots.join('\n'));
