import { type Page } from '@playwright/test';

import { mockOperatorLifecycleApi } from './auth-mocks';

export const ADMIN = { username: 'operator', password: 'admin-pw' };

const VENUES = [
  { venueId: 7, name: 'Miramar', beach: 'Dhërmi', commissionBps: 1500, payoutCurrency: 'EUR' },
  { venueId: 11, name: 'Kalypso', beach: 'Jal', commissionBps: 1000, payoutCurrency: 'EUR' },
];

/**
 * Every `/api/admin/**` read the seven console routes make on mount, on top of the shared operator
 * lifecycle mock. Breadth-first and read-only, the admin twin of `operator-console.mocks.ts`: the
 * touch-target sweep walks each route and measures, it never writes.
 */
export async function mockWholeAdminConsole(page: Page): Promise<void> {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });

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
      json: [{ id: 12, username: 'ana', status: 'ACTIVE', contactEmail: 'ana@example.com' }],
    }),
  );
  await page.route(/\/api\/admin\/venues$/, (route) => route.fulfill({ json: { venues: VENUES } }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) =>
    route.fulfill({
      json: VENUES.map((venue) => ({
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
  await page.route(/\/api\/admin\/venues\/(\d+)\/photos$/, (route) =>
    route.fulfill({
      json: {
        venueId: 7,
        photos: {
          cover: { previewUrl: null },
          sunbeds: { previewUrl: null },
          bar: { previewUrl: null },
        },
      },
    }),
  );
  await page.route(/\/api\/admin\/audit$/, (route) =>
    route.fulfill({
      json: [
        {
          at: '2026-08-10T11:00:00Z',
          actor: 'operator',
          method: 'DELETE',
          path: '/api/admin/venues/7/photos/cover',
          status: 204,
          reason: 'reported by a guest',
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
}
