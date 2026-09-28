import { expect, test } from '@playwright/test';

import { ChallengeFence, mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { fillDetailsAndContinue, settle } from './support/booking-dialog';

/**
 * Real-render journey of a stitched stay at a Request-to-Book venue (#1267): no single set covers the
 * stay, the banner offers the plan as one request, "Review & request" sends it through the dialog's
 * request copy, and the request-sent screen names every stop. The API is mocked; axe runs at each step.
 */

const FIRST = '2026-08-13';
const MIDDLE = '2026-08-14';
const LAST = '2026-08-15';

function set(
  id: number,
  positionNo: number,
  availability: 'PARTLY_FREE' | 'TAKEN',
  freeDays: number,
  takenDates: readonly string[],
) {
  return {
    id,
    rowLabel: 'Front row · Sea view',
    positionNo,
    tier: 'PREMIUM',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability,
    freeDays,
    takenDates,
  };
}

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'KSAMIL',
  region: 'SARANDE',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'REQUEST',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  salesOpen: true,
  sets: [
    set(1, 1, 'PARTLY_FREE', 2, [LAST]),
    set(2, 2, 'PARTLY_FREE', 1, [FIRST, MIDDLE]),
    set(3, 3, 'TAKEN', 0, [FIRST, MIDDLE, LAST]),
  ],
};

const STRETCHES = [
  {
    setId: 1,
    rowLabel: 'Front row · Sea view',
    positionNo: 1,
    gridX: 1,
    gridY: 1,
    tier: 'PREMIUM',
    firstDate: FIRST,
    lastDate: MIDDLE,
    days: 2,
    pricePerDay: { minorUnits: 4500, currency: 'EUR' },
    amount: { minorUnits: 9000, currency: 'EUR' },
  },
  {
    setId: 2,
    rowLabel: 'Front row · Sea view',
    positionNo: 2,
    gridX: 2,
    gridY: 1,
    tier: 'PREMIUM',
    firstDate: LAST,
    lastDate: LAST,
    days: 1,
    pricePerDay: { minorUnits: 4500, currency: 'EUR' },
    amount: { minorUnits: 4500, currency: 'EUR' },
  },
];

const PLAN = {
  moves: 1,
  stretches: STRETCHES,
  movesBetween: [{ onDate: LAST, rowsAway: 0, positionsAway: 1, towardSea: false }],
  total: { minorUnits: 13500, currency: 'EUR' },
};

const REQUESTED = {
  code: 'STAYRQ3456',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  firstDate: FIRST,
  lastDate: LAST,
  total: { minorUnits: 13500, currency: 'EUR' },
  stretches: STRETCHES.map((s) => ({
    setId: s.setId,
    rowLabel: s.rowLabel,
    positionNo: s.positionNo,
    firstDate: s.firstDate,
    lastDate: s.lastDate,
    amount: s.amount,
  })),
  emailWithheld: false,
  requestExpiresAt: '2026-08-11T16:00:00Z',
};

let fence: ChallengeFence;

/** The browser's clock is fixed here, so the fence must judge the challenge by the same instant. */
const NOW = new Date('2026-08-10T10:00:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  fence = await mockChallengeFence(page, 'on', () => NOW.getTime());
  await page.route('**/api/stays', (route) => {
    const refusal = fence.screen(route);
    return refusal ? route.fulfill(refusal) : route.fulfill({ status: 202, json: REQUESTED });
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues\/1\/itinerary\?.*$/, (route) =>
    route.fulfill({ json: { maxMoves: 3, anchor: null, plan: PLAN } }),
  );
  await page.route(/\/api\/venues\/1\/availability-calendar\?.*$/, (route) =>
    route.fulfill({ json: [] }),
  );
});

test('offers the plan as one request, sends it, and names every stop on the request-sent screen', async ({
  page,
}) => {
  await page.goto(`/venues/1?date=${FIRST}&lastDate=${LAST}`);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  const banner = page.getByTestId('no-cover');
  await expect(banner.getByTestId('no-cover-plan-line')).toContainText('see a 1-move plan');
  await expect(banner.getByTestId('no-cover-request')).toContainText('one request');
  await expectNoSeriousAxeViolations(page, 'the plan offered as a request');

  await page.getByTestId('no-cover-plan').click();
  const plan = page.getByTestId('stay-plan');
  await expect(plan.getByTestId('stay-plan-stop')).toHaveCount(2);
  const book = plan.getByTestId('stay-plan-book');
  await expect(book).toContainText('Review & request');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'the stitched plan at a Request-to-Book venue');

  await book.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('dialog-total')).toContainText('€135');

  const created = page.waitForRequest(
    (request) => request.url().endsWith('/api/stays') && request.method() === 'POST',
  );
  await fillDetailsAndContinue(dialog);
  await expect(dialog.locator('.mode-note.request')).toContainText('The spots aren’t held');
  await expect(dialog.locator('.mode-note.request')).toContainText('whole stay');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'request dialog for a plan');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  expect((await created).postDataJSON()).toMatchObject({
    stretches: [
      { setId: 1, firstDate: FIRST, lastDate: MIDDLE },
      { setId: 2, firstDate: LAST, lastDate: LAST },
    ],
  });

  await expect(page).toHaveURL(/\/booking\/requested/);
  await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
  await expect(page.getByTestId('booking-code')).toContainText('STAYRQ3456');
  await expect(page.getByTestId('request-stops').locator('li')).toHaveCount(2);
  await expect(page.locator('main')).toContainText('accepts or declines your whole stay');
  await expect(page.locator('main')).toContainText('€135');
  await expectNoSeriousAxeViolations(page, 'stay request sent');
});
