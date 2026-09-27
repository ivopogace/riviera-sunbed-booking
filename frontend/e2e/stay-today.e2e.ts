import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render e2e for a stitched stay while it runs (design D13, story 23): the booking page leads
 * with the spot the guest holds today, dims the stops that have passed and marks the next move — on
 * the first day, on a move day, on the evening before a move and on the last day. The browser's clock
 * is fixed in Europe/Tirane's summer (UTC+2), the API is mocked, and axe runs on the move day.
 */

const CODE = 'TODAY34567';

/** Three stops: 10–11 Aug on spot 2, 12–13 Aug on spot 5, 14–15 Aug in the second row. */
const STAY = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row',
  positionNo: 2,
  bookingDate: '2026-08-10',
  lastDate: '2026-08-15',
  amount: { minorUnits: 27000, currency: 'EUR' },
  cancellable: false,
  withdrawable: false,
  beforeCutoff: false,
  refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
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
  stretches: [
    stop(11, 'Front row', 2, '2026-08-10', '2026-08-11'),
    stop(15, 'Front row', 5, '2026-08-12', '2026-08-13'),
    stop(21, 'Second row', 1, '2026-08-14', '2026-08-15'),
  ],
};

function stop(
  setId: number,
  rowLabel: string,
  positionNo: number,
  firstDate: string,
  lastDate: string,
) {
  return {
    setId,
    rowLabel,
    positionNo,
    firstDate,
    lastDate,
    amount: { minorUnits: 9000, currency: 'EUR' },
    status: 'CONFIRMED',
    move: null,
  };
}

/** `--riv-card-ink-faint` in porcelain: the dimmed ink a passed stop wears. */
const FAINT_INK = 'rgba(12, 42, 51, 0.72)';

async function openOn(page: import('@playwright/test').Page, tiraneMorning: string): Promise<void> {
  await page.clock.setFixedTime(new Date(`${tiraneMorning}T09:00:00+02:00`));
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: STAY }),
  );
  await page.goto(`/booking/${CODE}`);
}

test('on the first day the page leads with the first spot and marks the move to come', async ({
  page,
}) => {
  await openOn(page, '2026-08-10');

  await expect(page.getByTestId('booking-today')).toContainText('Your spot today');
  await expect(page.getByTestId('booking-today-spot')).toHaveText('Front row · spot 2');
  await expect(page.getByTestId('booking-today-note')).toHaveText(
    'Mon, 10 Aug · stop 1, until Tue, 11 Aug.',
  );
  const stops = page.getByTestId('view-stops').getByRole('listitem');
  await expect(stops).toHaveCount(3);
  await expect(stops.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(stops.nth(1).getByTestId('view-stop-next')).toHaveText('next');
  await expect(stops.nth(2).getByTestId('view-stop-next')).toHaveCount(0);
});

test('on a move day the page leads with today’s set, dims the stop that passed and marks the next (+ axe)', async ({
  page,
}) => {
  await openOn(page, '2026-08-12');

  await expect(page.getByTestId('booking-today-spot')).toHaveText('Front row · spot 5');
  const stops = page.getByTestId('view-stops').getByRole('listitem');
  await expect(stops.nth(0)).toHaveAttribute('data-stop-state', 'past');
  await expect(stops.nth(0)).toHaveCSS('color', FAINT_INK);
  await expect(stops.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(stops.nth(1).getByTestId('view-stop-today')).toHaveText('today');
  await expect(stops.nth(2).getByTestId('view-stop-next')).toHaveText('next');
  await expect(stops.nth(2)).not.toHaveCSS('color', FAINT_INK);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking view (stitched stay, move day)');
});

test('the evening before a move names tomorrow’s spot', async ({ page }) => {
  await openOn(page, '2026-08-13');

  await expect(page.getByTestId('booking-today-spot')).toHaveText('Front row · spot 5');
  await expect(page.getByTestId('booking-today-note')).toHaveText(
    'Thu, 13 Aug · stop 2. Tomorrow you move to Second row · spot 1.',
  );
  await expect(page.getByTestId('view-stops').getByTestId('view-stop-next')).toHaveText('tomorrow');
});

test('on the last day the page leads with the last spot and says the stay ends', async ({
  page,
}) => {
  await openOn(page, '2026-08-15');

  await expect(page.getByTestId('booking-today-spot')).toHaveText('Second row · spot 1');
  await expect(page.getByTestId('booking-today-note')).toHaveText(
    'Sat, 15 Aug · stop 3. Last day of your stay.',
  );
  const stops = page.getByTestId('view-stops').getByRole('listitem');
  await expect(stops.nth(0)).toHaveAttribute('data-stop-state', 'past');
  await expect(stops.nth(1)).toHaveAttribute('data-stop-state', 'past');
  await expect(stops.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('view-stop-next')).toHaveCount(0);
});
