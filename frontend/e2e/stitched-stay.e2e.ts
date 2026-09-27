import { expect, test, type Page } from '@playwright/test';

import { ChallengeFence, mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * Real-render journey of a stitched stay (design D6/D7/D13): no single set covers the stay, the
 * banner offers a one-move plan, the plan shows the day strip, the stops with the move's morning and
 * distance, the prices and the way not to move, the plan's sets are numbered on the map in the
 * stretch tokens, "Review & pay" books it as one stay with one code, and the partly-free sheet plans
 * around a tapped spot. The API is mocked; axe runs at each step.
 */

const FIRST = '2026-08-13';
const MIDDLE = '2026-08-14';
const LAST = '2026-08-15';

function set(
  id: number,
  positionNo: number,
  availability: 'FREE' | 'PARTLY_FREE' | 'TAKEN',
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
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  salesOpen: true,
};

/** Set 1 hosts the first two days, set 2 the last: no set covers the stay, one move does. */
const NO_COVER = {
  ...VENUE,
  sets: [
    set(1, 1, 'PARTLY_FREE', 2, [LAST]),
    set(2, 2, 'PARTLY_FREE', 1, [FIRST, MIDDLE]),
    set(3, 3, 'TAKEN', 0, [FIRST, MIDDLE, LAST]),
  ],
};

const PLAN = {
  moves: 1,
  stretches: [
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
  ],
  movesBetween: [{ onDate: LAST, rowsAway: 0, positionsAway: 1, towardSea: false }],
  total: { minorUnits: 13500, currency: 'EUR' },
};

const STAY = {
  code: 'STAY234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  firstDate: FIRST,
  lastDate: LAST,
  total: { minorUnits: 13500, currency: 'EUR' },
  stretches: PLAN.stretches.map((s) => ({
    setId: s.setId,
    rowLabel: s.rowLabel,
    positionNo: s.positionNo,
    firstDate: s.firstDate,
    lastDate: s.lastDate,
    amount: s.amount,
  })),
  emailWithheld: false,
};

/** The map for the stay, and the itinerary read answering the plan (anchored when asked). */
async function mockStay(page: Page): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: NO_COVER }));
  await page.route(/\/api\/venues\/1\/itinerary\?.*$/, (route) => {
    const anchor = new URL(route.request().url()).searchParams.get('anchorSetId');
    return route.fulfill({
      json: { maxMoves: 3, anchor: anchor === '2' ? 'END' : null, plan: PLAN },
    });
  });
  await page.route(/\/api\/venues\/1\/availability-calendar\?.*$/, (route) =>
    route.fulfill({ json: [] }),
  );
}

let fence: ChallengeFence;

/** The browser's clock is fixed here, so the fence must judge the challenge by the same instant. */
const NOW = new Date('2026-08-10T10:00:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  fence = await mockChallengeFence(page, 'on', () => NOW.getTime());
  await page.route('**/api/stays', (route) => {
    const refusal = fence.screen(route);
    return refusal ? route.fulfill(refusal) : route.fulfill({ status: 201, json: STAY });
  });
  await mockStay(page);
});

test('offers a one-move plan, shows it, numbers its sets on the map, and books it as one stay', async ({
  page,
}) => {
  await page.goto(`/venues/1?date=${FIRST}&lastDate=${LAST}`);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  // The banner leads with the plan; the longest run and other beaches stay as the ways out.
  const banner = page.getByTestId('no-cover');
  await expect(banner.getByTestId('no-cover-plan-line')).toContainText(
    'No single spot is free for all 3 days — see a 1-move plan.',
  );
  await expect(page.getByTestId('no-cover-run')).toContainText('spot 1');
  await expect(page.getByTestId('plan-number')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'the plan offer');

  await page.getByTestId('no-cover-plan').click();
  const plan = page.getByTestId('stay-plan');
  await expect(plan).toBeVisible();
  await expect(plan.getByTestId('stay-plan-kicker')).toHaveText('1 move · 2 spots');
  await expect(plan.getByTestId('stay-plan-strip').locator('li')).toHaveCount(3);
  await expect(plan.getByTestId('stay-plan-strip').locator('li[data-move]')).toHaveCount(1);
  await expect(plan.getByTestId('stay-plan-stop')).toHaveCount(2);
  await expect(plan.getByTestId('stay-plan-move')).toContainText('1 spot along');
  await expect(plan.getByTestId('stay-plan-price')).toContainText('€135');
  await expect(plan.getByTestId('stay-plan-shorten')).toContainText('Prefer not to move?');
  await expect(page.getByTestId('no-cover-plan')).toHaveCount(0);

  // The plan's sets wear their number in the stretch token — the paint proves the theme mapping.
  const numbers = page.getByTestId('plan-number');
  await expect(numbers).toHaveText(['1', '2']);
  await expect(numbers.first()).toHaveCSS('background-color', 'rgb(15, 111, 125)');
  await expect(numbers.nth(1)).toHaveCSS('background-color', 'rgb(154, 90, 10)');
  await expect(plan.getByTestId('stay-plan-strip').locator('li').first()).toHaveCSS(
    'background-color',
    'rgb(15, 111, 125)',
  );
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'the stitched plan');

  // Review & pay: the dialog books the plan as one stay.
  await plan.getByTestId('stay-plan-book').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('dialog-meta')).toContainText(
    '1 move · 2 spots · one code, one payment',
  );
  await expect(dialog.getByTestId('dialog-date')).toContainText('3 days');
  await expect(dialog.getByTestId('dialog-total')).toContainText('€135');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking dialog for a plan');

  const created = page.waitForRequest(
    (request) => request.url().endsWith('/api/stays') && request.method() === 'POST',
  );
  await completeDialog(dialog, 'Continue to payment');
  expect((await created).postDataJSON()).toMatchObject({
    stretches: [
      { setId: 1, firstDate: FIRST, lastDate: MIDDLE },
      { setId: 2, firstDate: LAST, lastDate: LAST },
    ],
  });

  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('STAY234567');
  await expect(page.locator('main')).toContainText('one code for every morning');
  await expect(page.getByTestId('confirmation-stops').locator('li')).toHaveCount(2);
  await expect(page.locator('main')).toContainText('€135');
  await expectNoSeriousAxeViolations(page, 'stay confirmation');
});

test('plans around a tapped partly-free spot: the read is anchored and the plan names the spot’s role', async ({
  page,
}) => {
  await page.goto(`/venues/1?date=${FIRST}&lastDate=${LAST}`);
  await page.locator('.set-tile[data-state="partly"] button[data-set-id="2"]').click();
  const sheet = page.getByTestId('partly-free-sheet');
  await expect(sheet.getByTestId('plan-around')).toContainText('Plan my stay around');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'partly-free sheet with the plan offer');

  const anchored = page.waitForRequest(
    (request) => request.url().includes('/itinerary') && request.url().includes('anchorSetId=2'),
  );
  await sheet.getByTestId('plan-around').click();
  await anchored;
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('stay-plan-intro')).toContainText(
    'Ends at Front row · Sea view · spot 2, the spot you picked.',
  );
  await page.getByTestId('stay-plan-close').click();
  await expect(page.getByTestId('stay-plan')).toHaveCount(0);
});

test('the stretch fills switch with the dark theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
  await page.goto(`/venues/1?date=${FIRST}&lastDate=${LAST}`);
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
  await page.getByTestId('no-cover-plan').click();

  const numbers = page.getByTestId('plan-number');
  await expect(numbers.first()).toHaveCSS('background-color', 'rgb(63, 184, 200)');
  await expect(numbers.first()).toHaveCSS('color', 'rgb(11, 20, 24)');
});
