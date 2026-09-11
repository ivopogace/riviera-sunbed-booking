import type { Page } from '@playwright/test';

import { photoViews } from './photo-views';

/**
 * The tourist-facing API fixture the whole-surface sweeps share — the tourist twin of
 * `operator-console.mocks.ts` and `admin-console.mocks.ts`. One venue, one booking, and the routes
 * that make every tourist surface render its settled state rather than a skeleton or an error.
 *
 * <p>Shared rather than copied because a sweep is only as honest as the surface it renders: two
 * copies of this fixture would drift, and the sweep that kept the staler copy would quietly stop
 * measuring what it claims to. The consumers are `touch-targets-tourist.e2e.ts` (the 44px floor)
 * and `mobile-zoom-tourist.e2e.ts` (the 16px field floor + the double-tap opt-out).
 */

/** Deliberately multi-photo and multi-set: the slideshow's step controls and the map's set tiles
 *  only exist on a venue that has more than one of each. */
export const TOURIST_VENUE = {
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
  availability: { free: 4, total: 6 },
  coverPhoto: null,
  photos: photoViews([
    '/api/venues/1/photos/aa01',
    '/api/venues/1/photos/cc03',
    '/api/venues/1/photos/dd04',
  ]),
  sets: Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 3 ? 'Front row · Sea view' : 'Second row',
    positionNo: (i % 3) + 1,
    tier: i < 3 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: (i % 3) + 1,
    gridY: i < 3 ? 1 : 2,
    availability: 'FREE',
  })),
};

/** A confirmed, still-cancellable booking. The wire always carries a review panel; a stay nobody
 *  checked in is the reason this one offers no form — the review cases override it. */
export const TOURIST_BOOKING = {
  code: 'WXYZ345678',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

/**
 * Routes every tourist surface reads, signed out. A spec that needs a session (the account page) or
 * a stateful auth API layers `support/auth-mocks.ts` over this — the later `page.route` wins.
 */
export async function mockTourist(page: Page): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: TOURIST_VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [TOURIST_VENUE] }));
  // One listed review with a page behind it, so a sweep also measures the "Show more" control.
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        reviews: [{ id: 41, stars: 4, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great.' }],
        nextCursor: 41,
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({
      // A 1×1 PNG so the slideshow <img>s genuinely load under the sweep.
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
      contentType: 'image/png',
    }),
  );
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({ json: TOURIST_BOOKING }),
  );
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
}
