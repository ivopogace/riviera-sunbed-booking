import { chromium } from 'playwright';

/**
 * PROTOTYPE — throwaway. Every header variant on the four surfaces the header actually has to
 * survive: the beach map (/venues/1), the find-a-booking modal, sign-in, and the pay page.
 * Mocks mirror e2e/discovery-flow.e2e.ts + e2e/touch-targets-tourist.e2e.ts.
 */

const OUT = process.argv[2];
const ONLY = process.argv[3];

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
  distanceToWaterM: 15,
  distanceToWater: 15,
  availability: { free: 14, total: 18 },
  coverPhoto: null,
  photos: [],
  salesOpen: true,
  salesClose: '16:00',
  sets: Array.from({ length: 18 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 6 ? 'Front row · Sea view' : i < 12 ? 'Second row' : 'Row 3 · Back',
    positionNo: (i % 6) + 1,
    tier: i < 6 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: i < 6 ? 4500 : 2500, currency: 'EUR' },
    gridX: (i % 6) + 1,
    gridY: Math.floor(i / 6) + 1,
    availability: i === 3 || i === 9 ? 'BOOKED' : 'FREE',
  })),
};

const VENUES = [
  VENUE,
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
  },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const shots = [];

async function newPage({ width, height, signedIn, theme }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
  await page.addInitScript(() => {
    window.__RIVIERA_FAKE_STRIPE__ = true;
  });
  await page.route(/\/api\/.*/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        reviews: [
          { id: 41, stars: 5, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great spot.' },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.route(/\/api\/challenge/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      status: 202,
      json: {
        code: 'WXYZ345678',
        status: 'AWAITING_PAYMENT',
        venueId: 1,
        venueName: 'Miramar Beach Club',
        setId: 2,
        rowLabel: 'Front row · Sea view',
        positionNo: 2,
        bookingDate: '2026-12-01',
        amount: { minorUnits: 4500, currency: 'EUR' },
        clientSecret: 'pi_123_secret_abc',
        paymentIntentId: 'pi_123',
      },
    }),
  );
  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({
          json: {
            username: 'sofia.kelmendi@example.com',
            principalType: 'CUSTOMER',
            emailVerified: true,
          },
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 401, code: 'UNAUTHENTICATED' }),
        }),
  );
  return page;
}

async function goto(page, path, variant) {
  const join = path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:4200${path}${join}variant=${variant}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('[data-testid="prototype-switcher"]');
  await page.waitForTimeout(500);
}

/** Opens the find-a-booking modal wherever the variant hides its trigger. */
async function openFind(page) {
  const direct = page.locator('button:visible', { hasText: /Find/i }).first();
  if ((await direct.count()) > 0) {
    await direct.click();
  } else {
    const disclosure = page
      .locator('button:visible')
      .filter({ has: page.locator('xxx-never') })
      .or(page.getByRole('button', { name: /menu|account|sign in and/i }))
      .first();
    await disclosure.click();
    await page.waitForTimeout(350);
    await page.locator('button:visible', { hasText: /Find/i }).first().click();
  }
  await page.waitForTimeout(450);
}

async function toPay(page) {
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(/\/booking\/pay/, { timeout: 15000 });
  await page.waitForTimeout(1200);
}

const VIEWS = {
  map: { path: '/venues/1', width: 1280, height: 900, signedIn: true, clip: 600 },
  'map-phone': { path: '/venues/1', width: 390, height: 844, signedIn: true, clip: 844 },
  find: { path: '/venues/1', width: 1280, height: 900, signedIn: false, clip: 900, find: true },
  'find-phone': {
    path: '/venues/1',
    width: 390,
    height: 844,
    signedIn: false,
    clip: 844,
    find: true,
  },
  signin: { path: '/account/sign-in', width: 1280, height: 900, signedIn: false, clip: 660 },
  pay: { path: '/venues/1', width: 1280, height: 900, signedIn: false, clip: 700, pay: true },
};

for (const variant of (process.env.VARIANTS ?? 'current,b,c,d,e,f,g,h').split(',')) {
  for (const [view, spec] of Object.entries(VIEWS)) {
    if (ONLY && ONLY !== view) continue;
    const page = await newPage({ ...spec, theme: 'porcelain' });
    const name = `${view}-${variant}.png`;
    try {
      await goto(page, spec.path, variant);
      if (spec.pay) await toPay(page);
      if (spec.find) await openFind(page);
      await page.screenshot({
        path: `${OUT}/${name}`,
        clip: { x: 0, y: 0, width: spec.width, height: Math.min(spec.height, spec.clip) },
      });
      shots.push(name);
    } catch (error) {
      console.error(`FAILED ${name}: ${error.message.split('\n')[0]}`);
    }
    await page.context().close();
  }
}

await browser.close();
console.log(shots.join('\n'));
