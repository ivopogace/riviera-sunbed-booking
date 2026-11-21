import { expect, type Page, test } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, refuseBookingAsTaken } from './support/booking-dialog';
import type { MockSetView, MockVenueMapView } from './support/venue-views';

/**
 * The two ways the venue page reloads under the visitor (#1810). An in-place route change: the
 * router reuses the page when the venue or the days in the URL change, the reset rebuilds everything
 * under the "All beaches" button, focus the reset would take lands on that button, and a plan's
 * booking dialog does not carry over. A date change: the old days' map stays on screen, dimmed, and
 * takes no tap and no focus until the read for the new days answers, while the availability line
 * says it is checking (#1815). And a reload the visitor asks for (#1816): "Try again" on the
 * failure panel, whose press destroys its own button for an inert skeleton. A real browser is the
 * proof here: it ignores `focus()` and clicks on an `inert` element, jsdom does not. Mocked API,
 * CI-safe.
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

/** The page's map card: the canvas from `sm` up, the row lens below. */
const mapCard = (page: Page) => page.locator('app-beach-map-canvas, app-beach-row-lens');

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

    /**
     * Open the page on a read that fails, then press "Try again" from the keyboard. The retry's read
     * is held until the returned function is called with how it answers.
     */
    async function retryWithHeldRead(page: Page): Promise<(answer: 'map' | 'down') => void> {
      let release: (answer: 'map' | 'down') => void = () => undefined;
      const held = new Promise<'map' | 'down'>((resolve) => (release = resolve));
      let reads = 0;
      await mockVenues(page);
      await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
        const answer = ++reads === 1 ? 'down' : await held;
        return answer === 'map'
          ? route.fulfill({ json: venue(1, FREE) })
          : route.fulfill({ status: 503, json: {} });
      });
      await page.goto(`/venues/1?${STAY}`);
      const retry = page.getByRole('button', { name: 'Try again' });
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('map-loading')).toBeAttached();
      return release;
    }

    test('"Try again" hands focus to "All beaches", which keeps it when the map lands', async ({
      page,
    }) => {
      const release = await retryWithHeldRead(page);
      await expect(back(page)).toBeFocused();

      release('map');

      await expect(venueName(page, 'Miramar Beach Club')).toBeVisible();
      await expect(back(page)).toBeFocused();
    });

    test('"Try again" takes focus back when its read fails again', async ({ page }) => {
      const release = await retryWithHeldRead(page);
      await expect(back(page)).toBeFocused();

      release('down');

      await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
    });

    /**
     * Shorten the no-cover stay to set 1's two days from its sheet. The stay's read answers at once;
     * the shortened stay's read is held until the returned release is called, then answers `sets`.
     */
    async function shortenWithHeldRead(page: Page, sets: MockSetView[]): Promise<() => void> {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await mockVenues(page);
      await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
        const shortened = new URL(route.request().url()).searchParams.get('lastDate') === MIDDLE;
        if (shortened) {
          await held;
        }
        return route.fulfill({ json: venue(1, shortened ? sets : NO_COVER) });
      });
      await page.goto(`/venues/1?${STAY}`);
      if (name === 'phone') {
        // No row has a free set, so the lens opens none: open the row the tiles are in.
        await page.locator('[data-lens-row="A"]').click();
      }
      await tile(page, 1).click();
      await page.getByTestId('shorten-stay').click();
      await expect(mapCard(page)).toHaveAttribute('inert', '');
      return release;
    }

    /** Where the availability line and the bar under it sit inside their card, and the line's height. */
    const lineBox = (page: Page): Promise<number[]> =>
      page.evaluate(() => {
        const box = (id: string) =>
          document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        const card = box('map-overview').top;
        return [
          box('availability').top - card,
          box('availability').height,
          box('availability-bar').top - card,
        ];
      });

    /** The shortened stay's read when someone took set 1's last day meanwhile: still partly free. */
    const STILL_PARTLY = [set(1, 'PARTLY_FREE', [MIDDLE]), ...NO_COVER.slice(1)];

    test('a shortened stay whose set is still not free hands focus from the date field to its tile', async ({
      page,
    }) => {
      const release = await shortenWithHeldRead(page, STILL_PARTLY);
      await expect(page.getByTestId('map-date')).toBeFocused();

      release();

      await expect(mapCard(page)).not.toHaveAttribute('inert');
      await expect(tile(page, 1)).toBeFocused();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('focus the visitor moved on while a shortened stay loaded is left alone', async ({
      page,
    }) => {
      const release = await shortenWithHeldRead(page, STILL_PARTLY);
      await back(page).focus();

      release();

      await expect(mapCard(page)).not.toHaveAttribute('inert');
      await expect(back(page)).toBeFocused();
    });

    test('while other days load, the old map is dimmed, takes no tap, and the line says it is checking', async ({
      page,
    }) => {
      const release = await shortenWithHeldRead(page, [set(1, 'FREE', []), ...NO_COVER.slice(1)]);

      // The old days' map is still drawn, under the new days in the header.
      await expect(page.getByTestId('map-date')).toHaveAttribute('data-last-date', MIDDLE);
      await expect(mapCard(page)).toHaveAttribute('inert', '');
      await expect(mapCard(page)).toHaveCSS('opacity', '0.5');
      // An inert node is not exposed, so a busy state on it would reach nobody.
      await expect(mapCard(page)).not.toHaveAttribute('aria-busy');
      // The line names the new days and no count; the banner states nothing from the old read.
      const days = (await page.getByTestId('map-date').innerText()).trim();
      await expect(page.getByTestId('availability')).toHaveText(
        `Checking availability for ${days}…`,
      );
      await expect(page.getByTestId('no-cover')).toHaveCount(0);
      const beforeMark = await lineBox(page);
      await expect(page.getByTestId('map-date')).toBeFocused();
      if (name === 'phone') {
        // Focus went up to the header; the page stayed down on the map.
        await expect(page.getByTestId('map-date')).not.toBeInViewport();
      }

      // The read is still held, so the progress mark arrives beside the line (its one-second threshold is the unit spec's, on fake timers).
      await expect(page.getByTestId('availability-wait')).toBeVisible();
      await expect(page.getByTestId('availability-wait')).toHaveCSS('animation-name', 'pay-spin');
      await expect(page.getByTestId('availability-wait')).toHaveCSS('width', '14px');
      // The mark's arrival moves neither the line nor the bar under it.
      expect(await lineBox(page)).toEqual(beforeMark);
      await expect(page.getByTestId('availability')).toHaveText(
        `Checking availability for ${days}…`,
      );

      // A tap where the other partly-free tile is drawn reaches nothing.
      const box = (await tile(page, 2).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      release();

      // A tap that had reached the old tile would leave its sheet open beside the dialog.
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByTestId('partly-free-sheet')).toHaveCount(0);
      await expect(mapCard(page)).not.toHaveAttribute('inert');
      await expect(mapCard(page)).toHaveCSS('opacity', '1');
      await expect(page.getByTestId('availability')).toContainText(
        '1 of 3 sets free for all 2 days',
      );
      await expect(page.getByTestId('availability-wait')).toHaveCount(0);
    });

    test('with reduced motion the progress mark stands still and the dim does not fade', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const release = await shortenWithHeldRead(page, [set(1, 'FREE', []), ...NO_COVER.slice(1)]);

      await expect(mapCard(page)).toHaveCSS('transition-property', 'none');
      await expect(page.getByTestId('availability-wait')).toHaveCSS('animation-name', 'none');
      release();
    });
  });
}

/** Midday in Tirane, mid-month: the calendar opens on one month, so on a month's last day tomorrow has no cell. */
const PINNED_NOW = new Date('2026-08-15T10:00:00Z');
const PINNED_TOMORROW = '2026-08-16';

/** The page's two closed panels; the reviews section raises alerts of its own. */
const closedAlert = (page: Page) =>
  page.locator('[data-testid="map-sales-closed"], [data-testid="map-closed-for-season"]');

/**
 * Open venue 1 on the pinned today with `first` as its read, pick tomorrow in the calendar and hold that read
 * open. Returns the function that answers it with `next`.
 */
async function pickTomorrowWithHeldRead(
  page: Page,
  first: Partial<MockVenueMapView>,
  next: Partial<MockVenueMapView>,
): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.clock.setFixedTime(PINNED_NOW);
  await mockVenues(page);
  let reads = 0;
  await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
    reads += 1;
    const later = reads > 1;
    if (later) {
      await held;
    }
    return route.fulfill({ json: { ...venue(1, FREE), ...(later ? next : first) } });
  });
  await page.goto('/venues/1');
  await expect(closedAlert(page)).toBeVisible();
  await page.getByTestId('map-date').click();
  await page
    .getByTestId('availability-calendar')
    .locator(`button[data-date="${PINNED_TOMORROW}"]`)
    .click();
  await expect(mapCard(page)).toHaveAttribute('inert', '');
  return release;
}

for (const { name, width } of WIDTHS) {
  test.describe(`the closed alerts while other days load, at ${name} width (#1822)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test('the sales-closed alert is withheld, and returns worded for the new day if it is closed too', async ({
      page,
    }) => {
      const release = await pickTomorrowWithHeldRead(
        page,
        { salesOpen: false },
        { salesOpen: false },
      );

      // Nothing on the page gives the old day's verdict under the new day.
      await expect(page.getByTestId('availability')).toContainText('Checking availability for');
      await expect(closedAlert(page)).toHaveCount(0);

      release();

      await expect(page.getByTestId('map-sales-closed')).toHaveText(
        'Online sales for that date have closed at this venue. Pick a later day.',
      );
      await expect(page.getByTestId('map-sales-closed')).toHaveRole('alert');
      await expectNoSeriousAxeViolations(page, 'venue page, sales closed on the day just picked');
    });

    test('the sales-closed alert does not return for a day that sells', async ({ page }) => {
      const release = await pickTomorrowWithHeldRead(page, { salesOpen: false }, {});
      await expect(closedAlert(page)).toHaveCount(0);

      release();

      await expect(mapCard(page)).not.toHaveAttribute('inert');
      await expect(closedAlert(page)).toHaveCount(0);
      await expect(tile(page, 1)).toBeVisible();
    });

    test('the closed-for-season notice stays in place between two closed days', async ({
      page,
    }) => {
      const season = { salesOpen: false, closedForSeason: true, reopensOn: '2026-09-24' };
      const release = await pickTomorrowWithHeldRead(page, season, season);
      const notice = page.getByTestId('map-closed-for-season');
      await notice.evaluate((node) => node.setAttribute('data-kept', ''));
      const text = await notice.innerText();

      await expect(page.getByTestId('availability')).toContainText('Checking availability for');
      await expect(closedAlert(page)).toHaveText(text);
      release();

      await expect(mapCard(page)).not.toHaveAttribute('inert');
      // The same node throughout: an alert that is not rebuilt is not announced again.
      await expect(notice).toHaveAttribute('data-kept', '');
      await expect(notice).toHaveText(text);
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

test('a refresh that turns the focused tile partly free keeps focus on that set (#1817)', async ({
  page,
}) => {
  await refuseBookingAsTaken(page, await mockChallengeFence(page, 'on'));
  await mockVenues(page);
  let reads = 0;
  // Someone took set 1's last day while the dialog was open: every read after the first says so.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    reads += 1;
    const sets = reads > 1 ? [set(1, 'PARTLY_FREE', [LAST]), ...FREE.slice(1)] : FREE;
    return route.fulfill({ json: venue(1, sets) });
  });
  await page.goto(`/venues/1?${STAY}`);
  await tile(page, 1).click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');
  await expect(dialog.getByRole('alert')).toBeVisible();

  await page.keyboard.press('Escape');

  // The "book" button is gone and a "which days" button stands in its place: focus is on it, not on the map card.
  await expect(tile(page, 1)).toHaveAccessibleName(/Select to see which days/);
  await expect(tile(page, 1)).toBeFocused();
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

test('on a phone, a refresh that drops the pick lands focus the bar held on the open row without scrolling (#1821)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await refuseBookingAsTaken(page, await mockChallengeFence(page, 'on'));
  await mockVenues(page);
  let reads = 0;
  // A deep beach, so the page scrolls its first row off a phone's screen.
  const deeper = 'BCDEFGHIJKLMNOPQRST'.split('').map((rowLabel, index) => ({
    ...set(10 + index, 'FREE', []),
    rowLabel,
    positionNo: 1,
    gridX: 1,
    gridY: 2 + index,
  }));
  // Someone took set 1 while the dialog was open: every read after the first says so.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    reads += 1;
    const rowA = reads > 1 ? [set(1, 'TAKEN', [FIRST, MIDDLE, LAST]), ...FREE.slice(1)] : FREE;
    return route.fulfill({ json: venue(1, [...rowA, ...deeper]) });
  });
  await page.goto(`/venues/1?${STAY}`);
  await tile(page, 1).click();
  // The bar is fixed to the viewport: the visitor reads on, and the open row leaves the screen.
  const spacer = page.getByTestId('pick-bar-spacer');
  await expect(spacer).toBeVisible();
  // Stop the spacer's height short of the bottom: it leaves with the bar, and the browser would clamp the scroll.
  const scrolledTo = await spacer.evaluate((room) => {
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, bottom - room.getBoundingClientRect().height);
    return window.scrollY;
  });
  await page.getByTestId('pick-book').click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');
  await expect(dialog.getByRole('alert')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('pick-bar')).toHaveCount(0);
  const openRow = page.getByTestId('lens-open');
  await expect(openRow).toBeFocused();
  await expect(openRow).not.toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);
});
