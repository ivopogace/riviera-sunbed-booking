import { type Page } from '@playwright/test';

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };
const NO_MONEY = { minorUnits: 0, currency: 'EUR' };
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A whole-console API mock: every endpoint the shell and all six tabs read on mount, so one spec can
 * walk the console route by route. Deliberately read-only and stateless — the touch-target sweep
 * measures rendered geometry and never writes.
 *
 * <p>It does not replace the per-spec mocks (`mockRequests`, `mockPayouts`, …), which are stateful
 * and tailored to their tab's writes; this is the breadth-first counterpart to their depth.
 */
export async function mockWholeConsole(page: Page): Promise<void> {
  let sessionLive = false;

  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PRINCIPAL });
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    sessionLive = false;
    return route.fulfill({ status: 204, body: '' });
  });

  await page.route(/\/api\/venues\/mine$/, (route) =>
    route.fulfill({ json: [{ id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' }] }),
  );

  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [request(31), request(32)] }),
  );
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ setId: 10, code: 'RIV7K2QX', status: 'CONFIRMED' }] }),
  );
  await page.route(/\/api\/venues\/1\/profile$/, (route) => route.fulfill({ json: profile() }));
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/jpeg' }),
  );
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: { gross: NO_MONEY, net: NO_MONEY, commissionBps: 1500, date: '2026-07-08' },
    }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1\/payout-ledger$/, (route) =>
    route.fulfill({
      json: { venueId: 1, currency: 'EUR', netOwedMinor: 3825, entries: [accrual(11, 3825)] },
    }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Miramar Beach Club',
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        description: 'A quiet cove.',
        ratingTenths: 48,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 2000, currency: 'EUR' },
        amenities: ['WIFI'],
        distanceToWaterM: 20,
        cutoffTime: '18:00',
        sets: seedSets(),
        setVersion: 0,
        coverPhoto: null,
      },
    }),
  );
}

/**
 * Signs in through the guard-driven card, which `returnUrl` then bounces back to the requested
 * surface. It waits for nothing itself — the console shell and the operator home render different
 * chrome, so the caller's own content marker is the wait.
 */
export async function signInAsOperator(page: Page): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
}

/** Two rows of twelve: wide enough that a 390px viewport cannot fit a 44px tile per column. */
function seedSets() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: 10 + i,
    rowLabel: i < 12 ? 'A' : 'B',
    positionNo: (i % 12) + 1,
    tier: i < 12 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX: (i % 12) + 1,
    gridY: i < 12 ? 1 : 2,
  }));
}

function request(bookingId: number) {
  return {
    bookingId,
    setId: 10,
    bookingDate: '2026-07-09',
    guestName: 'Ana Berisha',
    amount: { minorUnits: 2000, currency: 'EUR' },
    requestedAt: '2026-07-08T09:00:00Z',
    requestExpiresAt: '2026-07-08T21:00:00Z',
  };
}

function accrual(bookingId: number, netMinor: number) {
  return {
    type: 'ACCRUAL',
    bookingId,
    grossMinor: 4500,
    commissionMinor: 675,
    netMinor,
    currency: 'EUR',
    reason: null,
    createdAt: '2026-07-01T09:00:00Z',
    runningNetMinor: netMinor,
  };
}

function profile() {
  return {
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'A quiet cove.',
    bookingMode: 'INSTANT',
    bookingCutoff: '18:00',
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
  };
}
