import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render e2e for a stay after a weather refund of one of its days (issue #1210): the booking page
 * lists the day the storm gave back with its amount, says the spot stays the guest's, and the stay's
 * stops and money are otherwise unchanged. The API is mocked; the clock sits before the stay so no
 * stop reads as today.
 */

const CODE = 'STORM34567';

const STAY = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row',
  positionNo: 2,
  bookingDate: '2026-08-10',
  lastDate: '2026-08-13',
  amount: { minorUnits: 18000, currency: 'EUR' },
  cancellable: true,
  withdrawable: false,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 13500, currency: 'EUR' },
  refundedAmount: null,
  refundOutstanding: false,
  requestExpiresAt: null,
  payment: null,
  emailWithheld: false,
  payWindowClosed: false,
  cancelReason: null,
  cancellationWindowAtBirth: 'FREE',
  reviewPanel: { kind: 'NOT_COMPLETED' },
  move: null,
  stretches: [],
  refundedDays: [{ day: '2026-08-11', amount: { minorUnits: 4500, currency: 'EUR' } }],
};

test('the booking page lists a refunded day, its amount, and keeps the spot (+ axe)', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-08-01T09:00:00+02:00'));
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: STAY }),
  );
  await page.goto(`/booking/${CODE}`);

  const days = page.getByTestId('view-refunded-days');
  await expect(days.getByRole('listitem')).toHaveCount(1);
  await expect(days).toContainText('11 Aug');
  await expect(days).toContainText('€45');
  await expect(page.getByTestId('view-refunded-days-note')).toContainText('Your spot stays yours');
  await expect(page.getByTestId('refunded-amount')).toHaveCount(0); // not a cancellation
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (stay with a refunded day)');
});
