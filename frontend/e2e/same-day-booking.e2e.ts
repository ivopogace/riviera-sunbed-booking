import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * Real-render a11y audit of the same-day booking journey: the homepage's date picker now
 * offers today, and an Instant Book venue can be booked for today up to its sales close. Fixed
 * before that close (`page.clock.setFixedTime`, per `availability-calendar.e2e.ts`) so the
 * scenario is deterministic. The API is mocked via `page.route`, so the test is self-contained.
 */

const TODAY = '2026-08-30';
/** 12:00 Europe/Tirane in August (CEST, UTC+2) — well before the venue's default 16:00 close. */
const BEFORE_CLOSE = new Date(`${TODAY}T10:00:00Z`);
/** 17:00 Europe/Tirane — after a 16:00 close, before a 23:59 one (#793). */
const AFTER_CLOSE = new Date(`${TODAY}T15:00:00Z`);
const TOMORROW = '2026-08-31';

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 4500, currency: 'EUR' },
    availability: { free: 1, total: 1 },
  },
];

const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  sets: [
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

const AWAITING = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: TODAY,
  amount: { minorUnits: 4500, currency: 'EUR' },
  clientSecret: 'pi_123_secret_abc',
  paymentIntentId: 'pi_123',
};

const AWAITING_DETAIL = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: TODAY,
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(BEFORE_CLOSE);
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
});

test('today journey: homepage → map → dialog → pay → confirmed', async ({ page }) => {
  // Swap in the deterministic fake gateway (no js.stripe.com) for this run.
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
  });
  await page.route('**/api/bookings', (route) => route.fulfill({ status: 202, json: AWAITING }));
  let polls = 0;
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({
      json: { ...AWAITING_DETAIL, status: polls++ === 0 ? 'AWAITING_PAYMENT' : 'CONFIRMED' },
    }),
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your spot on the Riviera' })).toBeVisible();

  // The homepage picker offers today (#791) — its floor and default selection are both TODAY.
  const dateInput = page.getByTestId('filter-date');
  expect(await dateInput.evaluate((el: HTMLInputElement) => el.min)).toBe(TODAY);
  expect(await dateInput.inputValue()).toBe(TODAY);
  await expectNoSeriousAxeViolations(page, 'discovery list (today)');

  await page.getByTestId('venue-card').first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking dialog (today, Details)');
  await completeDialog(dialog, 'Continue to payment');

  await expect(page).toHaveURL(/\/booking\/pay/);
  await expect(page.getByTestId('pay-button')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'payment page (today, ready)');

  await page.getByTestId('pay-button').click();
  await expect(page.getByRole('heading', { name: /You.re booked/ })).toBeVisible();
  await expect(page.getByTestId('booking-code')).toContainText('WXYZ345678');
  await expectNoSeriousAxeViolations(page, 'payment page (today, confirmed)');
});

test("browse today after a venue's close shows the badge and the closed-map path", async ({
  page,
}) => {
  await page.clock.setFixedTime(AFTER_CLOSE);
  // Later-registered routes win: one closed 16:00 venue beside one still-open 23:59 venue.
  await page.route(/\/api\/venues(\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        { ...VENUES[0], salesOpen: false },
        {
          id: 3,
          name: 'Luna Palasë',
          beach: 'Palasë',
          region: 'Albanian Riviera',
          ratingTenths: 44,
          reviewsCount: 102,
          bookingMode: 'INSTANT',
          fromPrice: { minorUnits: 3000, currency: 'EUR' },
          availability: { free: 6, total: 10 },
          salesOpen: true,
        },
      ],
    }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...VENUE_MAP, salesOpen: false } }),
  );

  await page.goto('/');
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);

  // The badge sits on the closed card only; the open venue stays badge-free (AC-8).
  const closedCard = cards.filter({ has: page.locator('.sales-closed-chip') });
  await expect(closedCard).toHaveCount(1);
  await expect(closedCard).toContainText('Miramar Beach Club');
  await expect(closedCard.locator('.sales-closed-chip')).toContainText('Sales closed for today');
  await expect(closedCard).toHaveAccessibleName(/online sales for today have closed/);
  await expectNoSeriousAxeViolations(page, 'discovery list (after a close, badged)');

  // The closed card stays navigable — no dead-end: the map shows the closed state instead.
  await closedCard.click();
  await expect(page).toHaveURL(/\/venues\/1/);
  await expect(page.getByTestId('map-sales-closed')).toBeVisible();
  await expect(page.getByTestId('map-sales-closed')).toContainText(
    'Online sales for today have closed',
  );
  await expect(page.getByRole('button', { name: /Select to book/ })).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'venue map (sales closed)');
});

test("deep link to a closed venue's map shows the closed state, and tomorrow recovers", async ({
  page,
}) => {
  await page.clock.setFixedTime(AFTER_CLOSE);
  // The verdict is per selected date: closed for today, open for tomorrow (the rule alone).
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    const date = new URL(route.request().url()).searchParams.get('date');
    return route.fulfill({ json: { ...VENUE_MAP, salesOpen: date === TOMORROW } });
  });
  await page.route(/\/api\/venues\/\d+\/availability-calendar\?.*$/, (route) => {
    const url = new URL(route.request().url());
    const days: { date: string; free: number; total: number }[] = [];
    for (
      let day = new Date(`${url.searchParams.get('from')}T00:00:00Z`);
      ;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const iso = day.toISOString().slice(0, 10);
      days.push({ date: iso, free: 10, total: 30 });
      if (iso === url.searchParams.get('to')) break;
    }
    return route.fulfill({ json: days });
  });

  await page.goto(`/venues/1?date=${TODAY}`);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();
  await expect(page.getByTestId('map-sales-closed')).toBeVisible();
  await expect(page.getByRole('button', { name: /Select to book/ })).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'venue map (closed deep link)');

  // Recovery is the existing per-date refetch: pick tomorrow → a bookable map again.
  await page.getByTestId('map-date').click();
  await page
    .locator(`[data-testid="availability-calendar"] button[data-date="${TOMORROW}"]`)
    .click();
  await expect(page.getByTestId('map-sales-closed')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Select to book/ }).first()).toBeVisible();
});

test('a today-dated BOOKING_CLOSED refusal is recoverable', async ({ page }) => {
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      json: {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'The sales window for that date has closed.',
        code: 'BOOKING_CLOSED',
      },
    }),
  );

  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');

  // The dialog stays open on Review and announces the today-specific copy (invariant #4).
  await expect(dialog.getByRole('alert')).toContainText('Online sales for today have closed');
  await expect(page).not.toHaveURL(/\/booking\/pay/);
  await expect(page).not.toHaveURL(/\/booking\/confirmation/);
  await expectNoSeriousAxeViolations(page, 'booking dialog (today, BOOKING_CLOSED error)');
});
