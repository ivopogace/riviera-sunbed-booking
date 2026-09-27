import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render e2e for a booking a remodel re-seated: the guest opens their booking by code and
 * reads that the spot changed — where from, where to, how far — with the free-exit deadline the
 * server named; the refund terms promise the full refund; cancelling takes it through the same
 * two-step cancel, and the cancelled panel says the guest took that exit. The "My bookings" row
 * carries the change too. A stitched stay names the stop that moved and marks it in its stop list.
 * The API is mocked (`page.route`), so the suite is CI-safe; axe runs on the moved and the
 * cancelled states and on the moved stay.
 */

const CODE = 'MOVE234567';

/** 13:00Z on a CET date → 14:00 Europe/Tirane on the page. */
const MOVED_DETAIL = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row',
  positionNo: 7,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  withdrawable: false,
  beforeCutoff: false,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  refundOutstanding: false,
  requestExpiresAt: null,
  payment: null,
  emailWithheld: false,
  payWindowClosed: false,
  cancelReason: null,
  cancellationWindowAtBirth: 'FREE',
  reviewPanel: { kind: 'NOT_COMPLETED' },
  move: {
    fromRowLabel: 'Front row',
    fromPositionNo: 2,
    rowsAway: 0,
    positionsAway: 5,
    movedAt: '2026-11-29T13:00:00Z',
    freeExitUntil: '2026-11-30T13:00:00Z',
  },
};

const CANCELLED_DETAIL = {
  ...MOVED_DETAIL,
  status: 'CANCELLED',
  cancellable: false,
  refundedAmount: { minorUnits: 4500, currency: 'EUR' },
  cancelReason: 'VENUE_CHANGE',
};

test('a moved booking explains the change and the free exit, and cancelling takes the full refund (+ axe)', async ({
  page,
}) => {
  let cancelled = false;
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: cancelled ? CANCELLED_DETAIL : MOVED_DETAIL }),
  );
  const cancels: string[] = [];
  await page.route(`**/api/bookings/${CODE}/cancel`, (route) => {
    cancels.push(route.request().method());
    cancelled = true;
    return route.fulfill({
      json: {
        code: CODE,
        status: 'CANCELLED',
        refund: { minorUnits: 4500, currency: 'EUR' },
        tier: 'FULL',
      },
    });
  });

  await page.goto(`/booking/${CODE}`);

  const notice = page.getByTestId('booking-moved');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Your spot changed');
  await expect(notice).toContainText(
    'Miramar Beach Club rearranged its beach map, so your set moved from Front row · spot 2 to Front row · spot 7 (5 positions along the row). Your booking code, price and date are unchanged.',
  );
  await expect(page.getByTestId('booking-free-exit')).toContainText(
    /full refund until\s+Mon, 30 Nov, 14:00/,
  );
  await expect(page.getByTestId('refund-terms')).toContainText(
    'Because the venue moved your spot, you can cancel for a full refund until Mon, 30 Nov, 14:00 — you’ll be refunded €45 in full.',
  );
  // The notice wears the teal info banner: fixed fill and ink, by computed style.
  await expect(notice).toHaveCSS('background-color', 'rgb(221, 244, 248)');
  await expect(notice.getByRole('heading')).toHaveCSS('color', 'rgb(10, 94, 122)');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (moved, free exit open)');

  await page.getByTestId('start-cancel').click();
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('cancel-result')).toContainText(
    'Booking cancelled. €45 will be refunded to your card.',
  );
  expect(cancels).toEqual(['POST']);
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  await expect(notice).toBeHidden();
  const panel = page.getByTestId('booking-cancelled');
  await expect(panel).toContainText('You cancelled this booking after the venue moved your spot.');
  await expect(panel).toContainText('€45 will be refunded to your card.');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (cancelled after a move)');
});

test('the My bookings row of a moved booking says the spot changed', async ({ page }) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: MOVED_DETAIL }),
  );
  await page.addInitScript(
    ([key, code]) => {
      window.localStorage.setItem(key, JSON.stringify([code]));
    },
    ['riviera.bookings.v1', CODE] as const,
  );

  await page.goto('/my-bookings');

  const row = page.getByTestId('booking-row');
  await expect(row).toContainText(CODE);
  await expect(row.getByTestId('row-status')).toHaveText('Confirmed');
  await expect(row.getByTestId('row-subline')).toHaveText(
    'Spot changed by the venue · see details',
  );
});

const STAY_CODE = 'MVST234567';

/** A stitched stay whose second stop moved; its exit runs to the stay's first midnight (23:00Z → 00:00 CET). */
const MOVED_STAY_DETAIL = {
  ...MOVED_DETAIL,
  code: STAY_CODE,
  positionNo: 2,
  lastDate: '2026-12-07',
  amount: { minorUnits: 31500, currency: 'EUR' },
  refundIfCancelledNow: { minorUnits: 31500, currency: 'EUR' },
  beforeCutoff: true,
  move: null,
  stretches: [
    {
      setId: 11,
      rowLabel: 'Front row',
      positionNo: 2,
      firstDate: '2026-12-01',
      lastDate: '2026-12-03',
      amount: { minorUnits: 13500, currency: 'EUR' },
      status: 'CONFIRMED',
      move: null,
    },
    {
      setId: 13,
      rowLabel: 'Front row',
      positionNo: 7,
      firstDate: '2026-12-04',
      lastDate: '2026-12-07',
      amount: { minorUnits: 18000, currency: 'EUR' },
      status: 'CONFIRMED',
      move: {
        fromRowLabel: 'Front row',
        fromPositionNo: 4,
        rowsAway: 0,
        positionsAway: 3,
        movedAt: '2026-11-20T13:00:00Z',
        freeExitUntil: '2026-11-30T23:00:00Z',
      },
    },
  ],
};

test('a stitched stay names the stop that moved, its exit, and marks it in the stop list (+ axe)', async ({
  page,
}) => {
  await page.route(new RegExp(`/api/bookings/${STAY_CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: MOVED_STAY_DETAIL }),
  );

  await page.goto(`/booking/${STAY_CODE}`);

  const notice = page.getByTestId('booking-moved');
  await expect(notice).toContainText('Your spot changed');
  await expect(notice).toContainText(
    'Miramar Beach Club rearranged its beach map, so your set for stop 2 (4 – 7 Dec · 4 days) moved from Front row · spot 4 to Front row · spot 7 (3 positions along the row).',
  );
  await expect(notice).toContainText('Your booking code, price and dates are unchanged.');
  await expect(page.getByTestId('booking-free-exit')).toContainText(
    /cancel the stay below until\s+Tue, 1 Dec, 00:00\s+and stop 2 is refunded in full\./,
  );
  const stops = page.getByTestId('view-stops').getByRole('listitem');
  await expect(stops).toHaveCount(2);
  await expect(stops.nth(0).getByTestId('view-stop-moved')).toHaveCount(0);
  await expect(stops.nth(1).getByTestId('view-stop-moved')).toHaveText(
    'moved from Front row · spot 4',
  );
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (stitched stay, one stop moved)');
});
