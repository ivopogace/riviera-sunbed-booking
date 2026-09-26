import { expect, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render journey of a stay on the discovery page: the day rail's last chip opens the range
 * calendar, the picked days re-read the coast, every card says whether its venue can host the stay
 * and why not, the ones that can't sink in their beach group and wear dusk, a lone pin for one
 * hollows by shape, the venue link carries the stay, and a single day is exactly today's page.
 * The API is mocked; axe runs on the stay page.
 */

const NOW = new Date('2026-08-10T10:00:00Z');
const FIRST = '2026-08-13';
const LAST = '2026-08-16';
const PHONE = { width: 390, height: 844 };

const DHERMI = { latitude: 40.1573, longitude: 19.6401 };
const BORSH = { latitude: 40.0619, longitude: 19.8611 };

function venue(id: number, name: string, ratingTenths: number, location: typeof DHERMI) {
  return {
    id,
    name,
    beach: 'DHERMI',
    region: 'HIMARE',
    ratingTenths,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
    location,
  };
}

/** Server order (rating): the one that can't host first, so the sheet's re-order is visible. */
const VENUES = [
  venue(12, 'Borsh Cove', 47, BORSH),
  venue(11, 'Aurora Bay', 45, DHERMI),
  venue(13, 'Capped Sands', 40, { latitude: 40.15747, longitude: 19.64026 }),
];

const STAY = {
  12: { verdict: 'CANNOT_HOST', sameSetCount: 0, longestRunDays: 3, maxStayDays: null },
  11: { verdict: 'SAME_SET', sameSetCount: 2, longestRunDays: 4, maxStayDays: null },
  13: { verdict: 'CANNOT_HOST', sameSetCount: 1, longestRunDays: 4, maxStayDays: 2 },
} as const;

async function mockCoast(page: Page): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) => {
    const stay = new URL(route.request().url()).searchParams.has('lastDate');
    return route.fulfill({
      json: VENUES.map((v) => (stay ? { ...v, stay: STAY[v.id as keyof typeof STAY] } : v)),
    });
  });
}

function cardNames(page: Page) {
  return page.getByTestId('venue-card').locator('.card-name');
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
  });
  await mockCoast(page);
});

test('picks a stay from the rail, reads every venue’s verdict, and carries the stay into the venue', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByTestId('sheet-rows')).toBeVisible();
  await expect(cardNames(page)).toHaveText(['Borsh Cove', 'Aurora Bay', 'Capped Sands']);
  await expect(page.getByTestId('card-stay')).toHaveCount(0);
  await expect(page.getByTestId('card-availability').first()).toContainText('5 of 10 free');

  let calendarReads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/availability-calendar')) {
      calendarReads += 1;
    }
  });

  // The rail ends in the stay chip; the picker it opens asks no venue for its counts.
  await page.getByTestId('head-day').click();
  const chips = page.locator('[role="group"][aria-label="Day"] button');
  await expect(chips).toHaveCount(8);
  await expect(chips.last()).toHaveText('Several days…');
  await page.getByTestId('head-stay').click();
  const calendar = page.getByTestId('availability-calendar');
  await expect(calendar).toBeVisible();
  await expect(calendar.getByTestId('day-bar').first()).toBeHidden();
  await expect(calendar.getByTestId('calendar-stay-rule')).toHaveCount(0);

  // Escape hands focus back to the chip that opened it (WCAG 2.4.3).
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(page.getByTestId('head-day')).toBeFocused();

  await page.getByTestId('head-day').click();
  await page.getByTestId('head-stay').click();
  await calendar.getByTestId('calendar-mode-stay').click();
  await expect(calendar.getByTestId('calendar-stay-rule')).toHaveText(
    'Stays of any length this season.',
  );
  const coastRead = page.waitForRequest(
    (request) =>
      request.url().includes('/api/venues?') && request.url().includes(`lastDate=${LAST}`),
  );
  await calendar.locator(`button[data-date="${FIRST}"]`).click();
  await calendar.locator(`button[data-date="${LAST}"]`).click();
  const request = await coastRead;
  expect(new URL(request.url()).searchParams.get('date')).toBe(FIRST);
  expect(calendarReads).toBe(0);

  // The chip names the stay; the hosts lead their beach; each card says why it can or can't.
  await expect(page.getByTestId('head-day')).toHaveText('13 – 16 Aug · 4 days');
  await expect(cardNames(page)).toHaveText(['Aurora Bay', 'Borsh Cove', 'Capped Sands']);
  const cards = page.getByTestId('venue-card');
  await expect(cards.nth(0).getByTestId('card-stay')).toHaveText('Same set all 4 days · 2 sets');
  await expect(cards.nth(1).getByTestId('card-stay')).toHaveText(
    'Can’t host 4 days · up to 3 days in a row',
  );
  await expect(cards.nth(2).getByTestId('card-stay')).toHaveText('Stays of up to 2 days here');
  await expect(page.getByTestId('card-availability')).toHaveCount(0);
  await expect(cards.nth(0)).toHaveCSS('filter', 'none');
  await expect(cards.nth(1)).toHaveCSS('filter', 'saturate(0)');
  await expect(cards.nth(0)).toHaveAttribute('aria-label', /Same set all 4 days, 2 sets for/);
  await expect(cards.nth(0)).toHaveAttribute('href', `/venues/11?date=${FIRST}&lastDate=${LAST}`);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'discovery with a stay');
});

test('a lone pin for a venue that can’t host hollows by shape; a crowd with a host stays filled', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto(`/?date=${FIRST}&lastDate=${LAST}`);
  await expect(page.getByTestId('sheet-rows')).toBeVisible();
  await expect(page.getByTestId('head-day')).toHaveText('13 – 16 Aug · 4 days');

  // Borsh sits 20 km off on its own; Aurora and Capped share one crowd at Dhërmi.
  const pin = page.getByTestId('map-venue-pin');
  await expect(pin).toHaveAttribute('data-cant-host', '');
  await expect(pin).toHaveAttribute('aria-label', /Borsh Cove, from €25; Can’t host 4 days/);
  await expect(pin).toHaveCSS('border-top-style', 'dashed');
  const pill = page.getByTestId('map-place-pill');
  await expect(pill).not.toHaveAttribute('data-cant-host', '');
  await expect(pill).toHaveCSS('border-top-style', 'solid');
});

test('a single day is today’s page: the day alone is asked for, the free counts stay, nothing moves', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const coastRead = page.waitForRequest((request) => request.url().includes('/api/venues?'));
  await page.goto(`/?date=${FIRST}`);
  const request = await coastRead;
  expect(new URL(request.url()).searchParams.has('lastDate')).toBe(false);
  await expect(page.getByTestId('sheet-rows')).toBeVisible();
  await expect(cardNames(page)).toHaveText(['Borsh Cove', 'Aurora Bay', 'Capped Sands']);
  await expect(page.getByTestId('card-stay')).toHaveCount(0);
  await expect(page.getByTestId('card-availability')).toHaveCount(3);
  await expect(page.getByTestId('venue-card').first()).toHaveCSS('filter', 'none');
  await expect(page.getByTestId('venue-card').first()).toHaveAttribute(
    'href',
    `/venues/12?date=${FIRST}`,
  );
});
