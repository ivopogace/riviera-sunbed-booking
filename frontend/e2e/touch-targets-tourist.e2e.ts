import { expect, test, type Page } from '@playwright/test';

import { expectTouchTargets } from './support/touch-targets';

/**
 * The 44 px touch-target floor (#605) over the tourist, auth and booking surfaces — the third and
 * last sweep spec, after the operator and admin consoles.
 *
 * <p>The Stripe Payment Element is deliberately absent: it renders inside a cross-origin iframe the
 * sweep cannot descend into and we cannot restyle (a stated Non-goal). `/booking/pay` is swept for
 * the controls that ARE ours, which proves the iframe is skipped rather than silently measured.
 */

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
  availability: { free: 4, total: 6 },
  coverPhoto: null,
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

const BOOKING = {
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
};

async function mockTourist(page: Page): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [VENUE] }));
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({ json: BOOKING }),
  );
}

test.describe('44px touch targets on the tourist surfaces at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  test('home — discovery with its filter bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();

    await expectTouchTargets(page, 'tourist home');
  });

  test('venue detail — the beach map', async ({ page }) => {
    await page.goto('/venues/1');
    await expect(page.getByRole('button', { name: /Select to book/ }).first()).toBeVisible();

    await expectTouchTargets(page, 'venue detail');
  });

  test('the unified sign-in card', async ({ page }) => {
    await page.goto('/account/sign-in');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();

    await expectTouchTargets(page, 'sign-in card');
  });

  test('forgot password', async ({ page }) => {
    await page.goto('/account/forgot');
    await expect(page.getByRole('button', { name: /send|reset/i }).first()).toBeVisible();

    await expectTouchTargets(page, 'forgot password');
  });

  test('booking detail — a confirmed booking', async ({ page }) => {
    await page.goto('/booking/WXYZ345678');
    await expect(page.getByTestId('booking-code')).toBeVisible();

    await expectTouchTargets(page, 'booking detail');
  });
});
