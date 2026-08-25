import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render e2e for the "Find a booking" flow: a guest opens the glass modal from
 * the nav, types their booking code, and is taken to the existing booking detail view — and an unknown
 * code shows an inline error WITHOUT navigating. The booking API is mocked (`page.route`), so the
 * suite is CI-safe like its siblings. Axe runs on the open modal in both themes.
 */

const CODE = 'ABCD234567';

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 18, total: 24 },
  },
];

const DETAIL = {
  code: CODE,
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
  requestExpiresAt: null,
  payment: null,
};

// Pin the OS scheme to dark so the boot theme is deterministic (headless defaults light → porcelain).
test.use({ colorScheme: 'dark' });

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
});

test('finds a booking by code and opens its detail view (+ axe, riviera)', async ({ page }) => {
  // The prefetch hand-off means one GET total — a second fetch could 429 near the rate-limit ceiling.
  let getCount = 0;
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) => {
    getCount += 1;
    return route.fulfill({ json: DETAIL });
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-option-riviera').click();
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

  // Open the modal from the desktop nav; the code input takes focus.
  await page.getByTestId('find-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('find-code')).toBeFocused();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'find modal (riviera)');

  await page.getByTestId('find-code').fill(CODE);
  await page.getByTestId('find-submit').click();

  // Lands on the existing /booking/:code detail (the modal closes on navigation).
  await expect(page).toHaveURL(new RegExp(`/booking/${CODE}`));
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The detail rendered from the primed hand-off — only the modal's own lookup hit the endpoint.
  expect(getCount).toBe(1);
});

test('audits the open find modal in the porcelain theme', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-option-porcelain').click();
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');

  await page.getByTestId('find-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'find modal (porcelain)');
});

test('shows an inline error for an unknown code and does not navigate (+ axe)', async ({
  page,
}) => {
  await page.route(/\/api\/bookings\/[A-Z0-9]+(\?.*)?$/, (route) =>
    route.fulfill({
      status: 404,
      json: { code: 'NO_SUCH_BOOKING', detail: 'No booking with this code.' },
    }),
  );

  await page.goto('/');
  await page.getByTestId('find-open').click();
  await page.getByTestId('find-code').fill('ZZZZ999999');
  await page.getByTestId('find-submit').click();

  await expect(page.getByTestId('find-error')).toContainText('No booking found for ZZZZ999999');
  // No navigation — still on the home route, modal still open.
  await expect(page).not.toHaveURL(/\/booking\//);
  await expect(page.getByRole('dialog')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'find modal error (dark)');
});
