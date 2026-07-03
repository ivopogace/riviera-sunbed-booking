import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of the device-local "My bookings" list (issue #139): a booking
 * made in this browser is remembered on-device (no account), appears in the list fetched live by
 * code, opens the T5 detail, and — after a server-truth cancellation — reflects Cancelled on return.
 * The API is mocked (`page.route`), so the suite is CI-safe with no backend. Axe runs on the list in
 * both themes (the Liquid Glass card glass + status chip must clear AA over each theme's gradient).
 */

const CODE = 'ABCD234567';

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
  sets: [
    { id: 1, rowLabel: 'Front row · Sea view', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'TAKEN' },
    { id: 2, rowLabel: 'Front row · Sea view', positionNo: 2, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 2, gridY: 1, availability: 'FREE' },
  ],
};

const CONFIRMATION = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
};

const CONFIRMED_DETAIL = {
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

const CANCELLED_DETAIL = {
  ...CONFIRMED_DETAIL,
  status: 'CANCELLED',
  cancellable: false,
  refundedAmount: { minorUnits: 4500, currency: 'EUR' },
};

test('a booking made here appears in My bookings, and a cancellation reflects there (a11y both themes)', async ({
  page,
}) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route('**/api/bookings', (route) => route.fulfill({ status: 201, json: CONFIRMATION }));

  // The per-code detail: CONFIRMED until cancelled, then CANCELLED (server-truth) on the next fetch.
  let cancelled = false;
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: cancelled ? CANCELLED_DETAIL : CONFIRMED_DETAIL }),
  );
  await page.route(`**/api/bookings/${CODE}/cancel`, (route) => {
    cancelled = true;
    route.fulfill({
      json: { code: CODE, status: 'CANCELLED', refund: { minorUnits: 4500, currency: 'EUR' }, tier: 'FULL' },
    });
  });

  // Book an instant set (writes the code into the device-local store on success).
  await page.goto('/venues/1');
  await page.getByRole('button', { name: /Select to book/ }).first().click();
  await completeDialog(page.getByRole('dialog'), 'Continue to payment');
  await expect(page).toHaveURL(/\/booking\/confirmation/);

  // The remembered booking now shows under My bookings, fetched live by code.
  await page.getByRole('link', { name: 'My bookings' }).first().click();
  await expect(page).toHaveURL(/\/my-bookings/);
  const row = page.getByTestId('booking-row');
  await expect(row).toContainText('Miramar Beach Club');
  await expect(row).toContainText(CODE);
  await expect(row.getByTestId('row-status')).toHaveText('Confirmed');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'my bookings list (riviera)');

  // Both themes: switch to porcelain and re-audit the list.
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-option-porcelain').click();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'my bookings list (porcelain)');

  // Open the row → T5 detail → cancel it.
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/booking/${CODE}`));
  await page.getByTestId('start-cancel').click();
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');

  // Back on the list, the row reflects the server's Cancelled status (re-fetched by code).
  await page.getByRole('link', { name: 'My bookings' }).first().click();
  await expect(page).toHaveURL(/\/my-bookings/);
  await expect(page.getByTestId('booking-row').getByTestId('row-status')).toHaveText('Cancelled');
});

test('the empty My bookings state is accessible (no bookings on this device)', async ({ page }) => {
  await page.goto('/my-bookings');
  await expect(page.getByTestId('my-bookings-empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No booking yet' })).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'my bookings empty state');
});
