import { chromium } from 'playwright';

/**
 * PROTOTYPE — throwaway. Every console-nav variant on the surfaces that discriminate between
 * them: the daily view, the beach map (the layout editor wants both axes), the requests queue,
 * the admin home and the admin audit tab (first and last tab — the overflow case), the /operator
 * landing, and a signed-out admin tab. Mocks mirror e2e/support/operator-console.mocks.ts,
 * e2e/support/admin-console.mocks.ts and e2e/operator-requests.e2e.ts.
 *
 *   node prototype-shots/shoot-console.mjs <outDir> [view]
 *   VARIANTS=current,b,d node prototype-shots/shoot-console.mjs <outDir>
 */

const OUT = process.argv[2];
const ONLY = process.argv[3];

const NO_MONEY = { minorUnits: 0, currency: 'EUR' };
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const PRINCIPAL = {
  username: 'ana.berisha@miramar.al',
  principalType: 'OPERATOR',
  operatorStatus: 'ACTIVE',
  admin: true,
};

const MINE = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 2, name: 'Aurora Bay', beach: 'Dhërmi' },
];

function seedSets() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: 10 + i,
    rowLabel: i < 12 ? 'A' : 'B',
    positionNo: (i % 12) + 1,
    tier: i < 12 ? 'PREMIUM' : 'STANDARD',
    pool: i % 12 >= 10 ? 'WALK_IN' : 'ONLINE',
    price: { minorUnits: i < 12 ? 4500 : 2500, currency: 'EUR' },
    gridX: (i % 12) + 1,
    gridY: i < 12 ? 1 : 2,
    availability: 'FREE',
  }));
}

const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'A quiet cove.',
  ratingTenths: 48,
  reviewsCount: 12,
  bookingMode: 'REQUEST',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['WIFI'],
  distanceToWaterM: 20,
  cutoffTime: '18:00',
  salesClose: '16:00',
  salesOpen: true,
  sets: seedSets(),
  setVersion: 0,
  coverPhoto: null,
};

function inHours(hours) {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function request(bookingId, setId, hours) {
  return {
    bookingId,
    setId,
    bookingDate: '2026-07-09',
    guestName: bookingId === 31 ? 'Ana Guest' : 'Bora Guest',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestedAt: '2026-07-08T09:00:00Z',
    requestExpiresAt: inHours(hours),
  };
}

const ADMIN_VENUES = [
  { venueId: 7, name: 'Miramar', beach: 'Dhërmi', commissionBps: 1500, payoutCurrency: 'EUR' },
  { venueId: 11, name: 'Kalypso', beach: 'Jal', commissionBps: 1000, payoutCurrency: 'EUR' },
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
  await page.route(/\/api\/.*/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/mine$/, (route) => route.fulfill({ json: MINE }));
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [request(31, 10, 3), request(32, 11, 30)] }),
  );
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ setId: 12, code: 'RIV7K2QX', status: 'CONFIRMED' }] }),
  );
  await page.route(/\/api\/venues\/1\/profile$/, (route) =>
    route.fulfill({
      json: {
        name: 'Miramar Beach Club',
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        description: 'A quiet cove.',
        bookingMode: 'REQUEST',
        bookingCutoff: '18:00',
        salesClose: '16:00',
        commissionBps: 1500,
        payoutCurrency: 'EUR',
        amenities: ['WIFI'],
        distanceToWaterM: 20,
        version: 0,
        photos: {
          cover: { previewUrl: '/api/venues/1/photos/cc03' },
          sunbeds: { previewUrl: null },
          bar: { previewUrl: null },
        },
      },
    }),
  );
  await page.route(/\/api\/venues\/\d+\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/jpeg' }),
  );
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 18000, currency: 'EUR' },
        net: { minorUnits: 15300, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        { setId: 12, state: 'BOOKED_ONLINE' },
        { setId: 14, state: 'STAFF_MARKED' },
      ],
    }),
  );
  await page.route(/\/api\/venues\/1\/payout-ledger$/, (route) =>
    route.fulfill({ json: { venueId: 1, currency: 'EUR', netOwedMinor: 3825, entries: [] } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));

  await page.route(/\/api\/admin\/operators$/, (route) =>
    route.fulfill({
      json: [
        {
          id: 91,
          username: 'nikos',
          contactEmail: 'nikos@example.com',
          registeredAt: '2026-08-01T09:00:00Z',
        },
      ],
    }),
  );
  await page.route(/\/api\/admin\/operators\/accounts$/, (route) =>
    route.fulfill({
      json: [
        { id: 12, username: 'ana', status: 'ACTIVE', contactEmail: 'ana@example.com' },
        { id: 13, username: 'ben', status: 'SUSPENDED', contactEmail: 'ben@example.com' },
      ],
    }),
  );
  await page.route(/\/api\/admin\/venues$/, (route) =>
    route.fulfill({ json: { venues: ADMIN_VENUES } }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) =>
    route.fulfill({
      json: ADMIN_VENUES.map((venue) => ({
        ...venue,
        id: venue.venueId,
        region: 'Vlorë',
        ratingTenths: 47,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: null,
        amenities: [],
        distanceToWaterM: null,
        availability: { free: 4, total: 10 },
        coverPhoto: null,
      })),
    }),
  );
  await page.route(/\/api\/admin\/audit$/, (route) =>
    route.fulfill({
      json: [
        {
          occurredAt: '2026-08-10T11:00:00Z',
          actor: 'ana.berisha@miramar.al',
          method: 'DELETE',
          path: '/api/admin/venues/7/photos/cover',
          status: 204,
          reason: 'reported by a guest',
        },
        {
          occurredAt: '2026-08-09T15:20:00Z',
          actor: 'ana.berisha@miramar.al',
          method: 'POST',
          path: '/api/admin/operators/91/approve',
          status: 204,
          reason: null,
        },
      ],
    }),
  );
  await page.route(/\/api\/admin\/mail-outbox$/, (route) =>
    route.fulfill({ json: { outstanding: 3, cooldownRemainingSeconds: 0 } }),
  );
  await page.route(/\/api\/admin\/refund-outbox$/, (route) =>
    route.fulfill({ json: { outstanding: 2, cooldownRemainingSeconds: 0 } }),
  );
  return page;
}

async function goto(page, path, variant) {
  const join = path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:4200${path}${join}variant=${variant}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('[data-testid="prototype-switcher"]');
  await page.waitForTimeout(700);
}

const DESK = { width: 1280, height: 900, signedIn: true };
const PHONE = { width: 390, height: 844, signedIn: true, clip: 844 };

export const VIEWS = {
  daily: { ...DESK, path: '/operator/1/daily', clip: 720 },
  'beach-map': { ...DESK, path: '/operator/1/beach-map', clip: 900 },
  requests: { ...DESK, path: '/operator/1/requests', clip: 720 },
  admin: { ...DESK, path: '/admin', clip: 720 },
  audit: { ...DESK, path: '/admin/audit', clip: 560 },
  landing: { ...DESK, path: '/operator', clip: 560 },
  'admin-out': { ...DESK, path: '/admin/audit', clip: 420, signedIn: false },
  'daily-phone': { ...PHONE, path: '/operator/1/daily' },
  'requests-phone': { ...PHONE, path: '/operator/1/requests' },
  'beach-phone': { ...PHONE, path: '/operator/1/beach-map' },
  'admin-phone': { ...PHONE, path: '/admin' },
  'audit-phone': { ...PHONE, path: '/admin/audit' },
  // The open states that discriminate: E's palette, F's current-aware More, C's phone More sheet.
  'palette-open': {
    ...DESK,
    path: '/admin',
    clip: 720,
    only: ['e'],
    open: '[data-testid="proto-title"]',
  },
  'more-open': {
    ...DESK,
    path: '/admin/audit',
    clip: 560,
    only: ['f'],
    open: '[data-testid="proto-more"]',
  },
  'sheet-open-phone': {
    ...PHONE,
    path: '/admin/audit',
    only: ['c'],
    open: '[data-testid="proto-bottom-bar"] button',
  },
  'venue-open': {
    ...DESK,
    path: '/operator/1/daily',
    clip: 560,
    only: ['c', 'd', 'f'],
    open: '[data-testid="proto-venue-switch"]',
  },
  'account-open': {
    ...DESK,
    path: '/operator/1/daily',
    clip: 560,
    only: ['b'],
    open: '[data-testid="proto-account"]',
  },
};

const variants = (process.env.VARIANTS ?? 'current,b,c,d,e,f').split(',');
const theme = process.env.THEME ?? 'porcelain';

for (const variant of variants) {
  for (const [view, spec] of Object.entries(VIEWS)) {
    if (ONLY && ONLY !== view) continue;
    if (spec.only && !spec.only.includes(variant)) continue;
    const page = await newPage({ ...spec, theme });
    const name = `${view}-${variant}.png`;
    try {
      await goto(page, spec.path, variant);
      if (spec.open) {
        await page.locator(spec.open).first().click();
        await page.waitForTimeout(400);
      }
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
