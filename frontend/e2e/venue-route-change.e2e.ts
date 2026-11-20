import { expect, type Page, test } from '@playwright/test';

import type { MockSetView, MockVenueMapView } from './support/venue-views';

/**
 * An in-place route change on the venue page (#1810): the router reuses the page when the venue or
 * the days in the URL change, and the reset rebuilds everything under the "All beaches" button.
 * Focus that the reset would take lands on that button, and a plan's booking dialog does not carry
 * over. A real browser is the proof here: it ignores `focus()` on an `inert` element, jsdom does not.
 * Mocked API, CI-safe.
 */

function isoDay(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const FIRST = isoDay(10);
const MIDDLE = isoDay(11);
const LAST = isoDay(12);
const STAY = `date=${FIRST}&lastDate=${LAST}`;

function set(
  id: number,
  availability: MockSetView['availability'],
  takenDates: readonly string[],
): MockSetView {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'PREMIUM',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: id,
    gridY: 1,
    availability,
    freeDays: 3 - takenDates.length,
    takenDates,
  };
}

function venue(id: number, sets: MockSetView[]): MockVenueMapView {
  return {
    id,
    name: id === 1 ? 'Miramar Beach Club' : 'Riviera Blue',
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: 'Loungers on the Ksamil shoreline.',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 4500, currency: 'EUR' },
    salesOpen: true,
    sets,
  };
}

const FREE = [set(1, 'FREE', []), set(2, 'FREE', []), set(3, 'TAKEN', [FIRST, MIDDLE, LAST])];
/** No set covers the stay: set 1 hosts the first two days, set 2 the last. */
const NO_COVER = [
  set(1, 'PARTLY_FREE', [LAST]),
  set(2, 'PARTLY_FREE', [FIRST, MIDDLE]),
  set(3, 'TAKEN', [FIRST, MIDDLE, LAST]),
];

const stretch = (setId: number, firstDate: string, lastDate: string, days: number) => ({
  setId,
  rowLabel: 'A',
  positionNo: setId,
  gridX: setId,
  gridY: 1,
  tier: 'PREMIUM',
  firstDate,
  lastDate,
  days,
  pricePerDay: { minorUnits: 4500, currency: 'EUR' },
  amount: { minorUnits: 4500 * days, currency: 'EUR' },
});
const PLAN = {
  moves: 1,
  stretches: [stretch(1, FIRST, MIDDLE, 2), stretch(2, LAST, LAST, 1)],
  movesBetween: [{ onDate: LAST, rowsAway: 0, positionsAway: 1, towardSea: false }],
  total: { minorUnits: 13500, currency: 'EUR' },
};

/** Both venues answer; `sets` picks each one's map, so a test can make either a no-cover beach. */
async function mockVenues(
  page: Page,
  sets: (venueId: number) => MockSetView[] = () => FREE,
): Promise<void> {
  await page.route(/\/api\/venues\/(\d+)(\?.*)?$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ json: venue(id, sets(id)) });
  });
  await page.route(/\/api\/venues\/\d+\/itinerary\?.*$/, (route) =>
    route.fulfill({ json: { maxMoves: 3, anchor: null, plan: PLAN } }),
  );
  await page.route(/\/api\/venues\/\d+\/availability-calendar\?.*$/, (route) =>
    route.fulfill({ json: [] }),
  );
}

/**
 * Change the route in place, as the browser's Back does between two same-document entries: the
 * router hears the traversal and reuses the page. A `page.goto` would load a fresh document.
 */
async function traverseTo(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    history.pushState(null, '', `${target}#ahead`);
    history.back();
  }, url);
}

const back = (page: Page) => page.getByRole('button', { name: 'All beaches' });
const venueName = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });
const tile = (page: Page, spot: number) =>
  page.getByRole('button', { name: new RegExp(`^A · spot ${spot},`) });

const WIDTHS = [
  { name: 'desktop', width: 1280 },
  { name: 'phone', width: 390 },
] as const;

for (const { name, width } of WIDTHS) {
  test.describe(`at ${name} width`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('the open calendar closes and focus lands on "All beaches"', async ({ page }) => {
      await mockVenues(page);
      await page.goto(`/venues/1?${STAY}`);
      await page.getByTestId('map-date').click();
      await expect(page.getByTestId('availability-calendar')).toBeVisible();

      await traverseTo(page, `/venues/2?${STAY}`);

      await expect(venueName(page, 'Riviera Blue')).toBeVisible();
      await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
      await expect(back(page)).toBeFocused();
    });

    test('the open booking dialog closes and focus lands on "All beaches"', async ({ page }) => {
      await mockVenues(page);
      await page.goto(`/venues/1?${STAY}`);
      await tile(page, 1).click();
      if (name === 'phone') {
        await page.getByTestId('pick-book').click();
      }
      await expect(page.getByRole('dialog')).toBeVisible();

      await traverseTo(page, `/venues/2?${STAY}`);

      await expect(venueName(page, 'Riviera Blue')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(back(page)).toBeFocused();
    });

    test('a plan’s booking dialog does not reopen under the next venue', async ({ page }) => {
      // Venue 2 is a no-cover beach too: its banner must offer its own plan, with no dialog open.
      await mockVenues(page, () => NO_COVER);
      await page.goto(`/venues/1?${STAY}`);
      await page.getByTestId('no-cover-plan').click();
      await page.getByTestId('stay-plan-book').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await traverseTo(page, `/venues/2?${STAY}`);

      await expect(venueName(page, 'Riviera Blue')).toBeVisible();
      await expect(page.getByTestId('no-cover-plan')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(back(page)).toBeFocused();
    });

    test('focus on a tile lands on "All beaches" when the days change', async ({ page }) => {
      await mockVenues(page);
      await page.goto(`/venues/1?${STAY}`);
      await tile(page, 2).focus();
      await expect(tile(page, 2)).toBeFocused();

      await traverseTo(page, `/venues/1?date=${isoDay(20)}&lastDate=${isoDay(21)}`);

      await expect(page.getByTestId('map-date')).toHaveAttribute('data-date', isoDay(20));
      await expect(back(page)).toBeFocused();
    });
  });
}

test('on a phone, focus on the pick bar’s action lands on "All beaches"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockVenues(page);
  await page.goto(`/venues/1?${STAY}`);
  await tile(page, 1).click();
  await page.getByTestId('pick-book').focus();
  await expect(page.getByTestId('pick-book')).toBeFocused();

  await traverseTo(page, `/venues/2?${STAY}`);

  await expect(venueName(page, 'Riviera Blue')).toBeVisible();
  await expect(page.getByTestId('pick-bar')).toHaveCount(0);
  await expect(back(page)).toBeFocused();
});

test('focus outside the page stays where it is', async ({ page }) => {
  await mockVenues(page);
  await page.goto(`/venues/1?${STAY}`);
  await expect(venueName(page, 'Miramar Beach Club')).toBeVisible();
  const help = page.getByRole('contentinfo').getByRole('link', { name: 'Help' });
  await help.focus();

  await traverseTo(page, `/venues/2?${STAY}`);

  await expect(venueName(page, 'Riviera Blue')).toBeVisible();
  await expect(help).toBeFocused();
});
