import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of the device-local "My bookings" list: a booking
 * made in this browser is remembered on-device (no account), appears in the list fetched live by
 * code, opens the booking detail, and — after a server-truth cancellation — reflects Cancelled on return.
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
    {
      id: 1,
      rowLabel: 'Front row · Sea view',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'TAKEN',
    },
    {
      id: 2,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
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
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );

  // The per-code detail: CONFIRMED until cancelled, then CANCELLED (server-truth) on the next fetch.
  let cancelled = false;
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: cancelled ? CANCELLED_DETAIL : CONFIRMED_DETAIL }),
  );
  await page.route(`**/api/bookings/${CODE}/cancel`, async (route) => {
    cancelled = true;
    await route.fulfill({
      json: {
        code: CODE,
        status: 'CANCELLED',
        refund: { minorUnits: 4500, currency: 'EUR' },
        tier: 'FULL',
      },
    });
  });

  // Book an instant set (writes the code into the device-local store on success).
  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
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

  // Open the row → the booking detail → cancel it.
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

test('the cancel confirmation moves focus in and back out (WCAG 2.4.3)', async ({ page }) => {
  let cancelled = false;
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: cancelled ? CANCELLED_DETAIL : CONFIRMED_DETAIL }),
  );
  await page.route(`**/api/bookings/${CODE}/cancel`, async (route) => {
    cancelled = true;
    await route.fulfill({
      json: {
        code: CODE,
        status: 'CANCELLED',
        refund: { minorUnits: 4500, currency: 'EUR' },
        tier: 'FULL',
      },
    });
  });

  await page.goto(`/booking/${CODE}`);
  await page.getByTestId('start-cancel').click();
  await expect(page.getByTestId('confirm-cancel')).toBeFocused();

  // Backing out destroys the confirm button, so Cancel booking must take focus back.
  await page.getByTestId('keep-booking').click();
  await expect(page.getByTestId('start-cancel')).toBeFocused();

  await page.getByTestId('start-cancel').click();
  await page.getByTestId('confirm-cancel').click();

  // A completed cancellation takes the whole section with it — only the outcome is left to hold focus.
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  await expect(page.getByTestId('start-cancel')).toHaveCount(0);
  await expect(page.getByTestId('cancel-result')).toBeFocused();

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (cancelled, focus parked on the outcome)');
});

test('the empty My bookings state is accessible (no bookings on this device)', async ({ page }) => {
  await page.goto('/my-bookings');
  await expect(page.getByTestId('my-bookings-empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No booking yet' })).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'my bookings empty state');
});

// Signed-in union + dedupe. DEVICE_CODE is device-only; SHARED_CODE is on this device AND
// in the account list (booked while signed in → shown once); ACCT_CODE is account-only (another
// device → the account list ADDS it). Device codes render per-code (device rows show immediately);
// the account list contributes only codes this device doesn't already have.
const DEVICE_CODE = 'DEVICE99999';
const SHARED_CODE = 'SHARED11111';
const ACCT_CODE = 'ACCTONLY111';

const ACCOUNT_ROWS = [
  {
    code: SHARED_CODE,
    status: 'CONFIRMED',
    venueId: 1,
    venueName: 'Miramar Beach Club',
    rowLabel: 'Front row · Sea view',
    positionNo: 2,
    bookingDate: '2026-12-01',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestExpiresAt: null,
  },
  {
    code: ACCT_CODE,
    status: 'CONFIRMED',
    venueId: 2,
    venueName: 'Sunset Bar',
    rowLabel: 'Back row',
    positionNo: 3,
    bookingDate: '2026-12-05',
    amount: { minorUnits: 5000, currency: 'EUR' },
    requestExpiresAt: null,
  },
];

function deviceDetail(
  code: string,
  venueName: string,
  positionNo: number,
  bookingDate = '2026-12-01',
) {
  return {
    code,
    status: 'CONFIRMED',
    venueId: 1,
    venueName,
    rowLabel: 'Front row · Sea view',
    positionNo,
    bookingDate,
    amount: { minorUnits: 4500, currency: 'EUR' },
    cancellable: true,
    beforeCutoff: true,
    refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
    refundedAmount: null,
    requestExpiresAt: null,
    payment: null,
  };
}

test("signed in: My bookings unions the account list with this device's codes, deduped (a11y)", async ({
  page,
}) => {
  // A CUSTOMER session: /api/auth/me returns a customer principal, so the app restores signed-in.
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ json: { username: 'tourist@example.com', principalType: 'CUSTOMER' } }),
  );
  // The account's server list: SHARED_CODE (also on this device) + ACCT_CODE (only on the account).
  await page.route(/\/api\/me\/bookings(\?.*)?$/, (route) => route.fulfill({ json: ACCOUNT_ROWS }));
  // This device's codes, fetched live by code.
  // Device-only booking is oldest (11-20), so the newest-first global sort must put the account row on top.
  await page.route(new RegExp(`/api/bookings/${DEVICE_CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: deviceDetail(DEVICE_CODE, 'Device Bar', 9, '2026-11-20') }),
  );
  await page.route(new RegExp(`/api/bookings/${SHARED_CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: deviceDetail(SHARED_CODE, 'Miramar Beach Club', 2) }),
  );

  // Seed this device's remembered codes (device-only + the shared one), then open My bookings signed in.
  await page.goto('/');
  await page.evaluate(
    (codes) => localStorage.setItem('riviera.bookings.v1', JSON.stringify(codes)),
    [DEVICE_CODE, SHARED_CODE],
  );
  await page.goto('/my-bookings');

  const rows = page.getByTestId('booking-row');
  await expect(rows).toHaveCount(3); // DEVICE_CODE + SHARED_CODE (once) + ACCT_CODE (merged from the account)
  await expect(rows.filter({ hasText: SHARED_CODE })).toHaveCount(1); // deduped across device + account
  await expect(rows.filter({ hasText: DEVICE_CODE })).toHaveCount(1);
  await expect(rows.filter({ hasText: ACCT_CODE })).toHaveCount(1); // account-only, merged in
  await expect(page.getByText('Sunset Bar')).toBeVisible();
  // Global order, newest first: account 12-05 above shared 12-01 above device 11-20.
  await expect(rows.nth(0)).toContainText(ACCT_CODE);
  await expect(rows.nth(1)).toContainText(SHARED_CODE);
  await expect(rows.nth(2)).toContainText(DEVICE_CODE);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'my bookings signed-in union');
});
