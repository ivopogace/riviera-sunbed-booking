import { expect, test, type Page } from '@playwright/test';

import { ChallengeFence, mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, mockFencedBookingCreate, settle } from './support/booking-dialog';

/**
 * Real-render journey of a stay of several days at an Instant venue: pick a first and a last day,
 * read the three tile states — free for every day, partly free (a 2px dotted border with the
 * free-day badge, in every theme), taken — see which days a partly-free set covers, book a set
 * for the whole stay at the total, and land on a confirmation naming the days. The API is mocked;
 * axe runs at each step.
 */

/** Inside the month the fixed clock opens the calendar on. */
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

/** One day: every set free. */
const ONE_DAY = {
  ...VENUE,
  sets: [set(1, 1, 'FREE', 1, []), set(2, 2, 'FREE', 1, []), set(3, 3, 'FREE', 1, [])],
};

/** The stay FIRST..LAST: set 1 free throughout, set 2 free until the last day, set 3 taken. */
const STAY = {
  ...VENUE,
  sets: [
    set(1, 1, 'FREE', 3, []),
    set(2, 2, 'PARTLY_FREE', 2, [LAST]),
    set(3, 3, 'TAKEN', 0, [FIRST, MIDDLE, LAST]),
  ],
};

/** The same stay when no set covers it: set 1 is taken on the last day too. */
const NO_COVER = {
  ...VENUE,
  sets: [
    set(1, 1, 'PARTLY_FREE', 2, [LAST]),
    set(2, 2, 'PARTLY_FREE', 1, [FIRST, MIDDLE]),
    set(3, 3, 'TAKEN', 0, [FIRST, MIDDLE, LAST]),
  ],
};

/** The map re-read for the two days set 1 can host. */
const SHORTENED = {
  ...VENUE,
  sets: [
    set(1, 1, 'FREE', 2, []),
    set(2, 2, 'TAKEN', 0, [FIRST, MIDDLE]),
    set(3, 3, 'TAKEN', 0, [FIRST, MIDDLE]),
  ],
};

const CONFIRMATION = {
  code: 'STAY234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 1,
  rowLabel: 'Front row · Sea view',
  positionNo: 1,
  bookingDate: FIRST,
  lastDate: LAST,
  amount: { minorUnits: 13500, currency: 'EUR' },
};

function calendarDays(from: string, to: string) {
  const days: { date: string; free: number; total: number; salesOpen: boolean }[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    days.push({ date: iso, free: 2, total: 3, salesOpen: true });
    if (iso === to) break;
  }
  return days;
}

/** Route the map read on its query: one day, the stay, or — when asked — a stay nothing covers. */
async function mockMap(page: Page, stay: typeof STAY, shortened = SHORTENED): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const lastDate = url.searchParams.get('lastDate');
    if (lastDate === null) {
      return route.fulfill({ json: ONE_DAY });
    }
    return route.fulfill({ json: lastDate === LAST ? stay : shortened });
  });
  await page.route(/\/api\/venues\/1\/availability-calendar\?.*$/, (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: calendarDays(url.searchParams.get('from')!, url.searchParams.get('to')!),
    });
  });
}

async function pickStay(page: Page): Promise<void> {
  await page.getByTestId('map-date').click();
  const calendar = page.getByTestId('availability-calendar');
  await expect(calendar).toBeVisible();
  await calendar.getByTestId('calendar-mode-stay').click();
  await calendar.locator(`button[data-date="${FIRST}"]`).click();
  await expect(calendar.getByTestId('calendar-stay-hint')).toContainText('tap your last day');
  await calendar.locator(`button[data-date="${LAST}"]`).click();
  await expect(page.getByTestId('map-date')).toContainText('3 days');
}

let fence: ChallengeFence;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-10T10:00:00Z'));
  fence = await mockChallengeFence(page, 'on');
  await mockFencedBookingCreate(page, fence, (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );
});

test('books one set for a stay: three tile states, the covered days, the total, one confirmation', async ({
  page,
}) => {
  await mockMap(page, STAY);
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  await pickStay(page);
  await expect(page.getByTestId('availability')).toContainText('1 of 3 sets free for all 3 days');
  await expect(page.getByTestId('availability')).toContainText('1 partly free');
  await expectNoSeriousAxeViolations(page, 'beach map for a stay');

  // The three states, and the partly-free tile's badge and name.
  const partly = page.locator('.set-tile[data-state="partly"]');
  await expect(partly).toHaveCount(1);
  await expect(partly.getByTestId('free-days-badge')).toHaveText('2');
  await expect(page.locator('.set-tile[data-state="taken"]')).toHaveCount(1);
  const partlyButton = partly.getByRole('button');
  await expect(partlyButton).toHaveAccessibleName(/free 2 of 3 days/);
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Partly free');

  // Tapping it names the days; keeping the dates returns focus to the tile.
  await partlyButton.click();
  const sheet = page.getByTestId('partly-free-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('partly-free-days').locator('li')).toHaveCount(3);
  await expect(sheet.getByTestId('partly-free-days').locator('li').nth(2)).toContainText('taken');
  await expect(sheet.getByTestId('shorten-stay')).toContainText('2 days');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'partly-free sheet');
  await sheet.getByTestId('keep-dates').click();
  await expect(sheet).toHaveCount(0);
  await expect(partlyButton).toBeFocused();

  // Book the set free for every day: the dialog quotes per day and in total.
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('dialog-date')).toContainText('3 days');
  await expect(dialog.getByTestId('dialog-price')).toContainText('€45 per day × 3 days');
  await expect(dialog.getByTestId('dialog-total')).toContainText('€135');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking dialog for a stay');

  const created = page.waitForRequest(
    (request) => request.url().endsWith('/api/bookings') && request.method() === 'POST',
  );
  await completeDialog(dialog, 'Continue to payment');
  expect((await created).postDataJSON()).toMatchObject({
    setId: 1,
    bookingDate: FIRST,
    lastDate: LAST,
  });

  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('STAY234567');
  await expect(page.locator('main')).toContainText('3 days');
  await expect(page.locator('main')).toContainText('€135');
  await expectNoSeriousAxeViolations(page, 'stay confirmation');
});

test('offers the longest one-spot run when no set covers the stay, and shortening books it', async ({
  page,
}) => {
  await mockMap(page, NO_COVER);
  await page.goto('/venues/1');
  await pickStay(page);

  const banner = page.getByTestId('no-cover');
  await expect(banner).toContainText('No single spot is free for all 3 days');
  await expect(page.getByTestId('no-cover-run')).toContainText('spot 1');
  await expect(page.getByTestId('no-cover-others')).toHaveAttribute('href', `/?date=${FIRST}`);
  await expectNoSeriousAxeViolations(page, 'no set covers the stay');

  await page.getByTestId('no-cover-shorten').click();
  await expect(page.getByTestId('map-date')).toContainText('2 days');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('dialog-date')).toContainText('2 days');
  await expect(dialog.getByTestId('dialog-total')).toContainText('€90');
});

for (const theme of ['porcelain', 'riviera', 'dark'] as const) {
  test(`the partly-free tile wears a 2px dotted border and the badge in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
    await mockMap(page, STAY);
    await page.goto('/venues/1');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
    await pickStay(page);

    const partly = page.locator('.set-tile[data-state="partly"]');
    await expect(partly).toHaveCSS('border-top-style', 'dotted');
    await expect(partly).toHaveCSS('border-top-width', '2px');
    const taken = page.locator('.set-tile[data-state="taken"]');
    await expect(taken).toHaveCSS('border-top-style', 'dashed');
    const swatch = page.locator('ul[aria-label="Legend"] [data-state="partly"]');
    await expect(swatch).toHaveCSS('border-top-width', '2px');
    await expect(partly.getByTestId('free-days-badge')).toBeVisible();
    // The border colour is not the taken one: the two hairline styles never share a colour either.
    const partlyColor = await partly.evaluate((el) => getComputedStyle(el).borderTopColor);
    const takenColor = await taken.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(partlyColor).not.toBe(takenColor);
  });
}
