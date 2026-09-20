import { CDPSession, expect, Locator, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { expectTouchManipulation } from './support/mobile-zoom';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The riviera map sheet on Discover behind `?map=sheet`: the map as the ground under the
 * glass header, the cards as a sheet with three resting heights, the head one row carrying the
 * query, the row the pin's preview, Near me's three arms. The fake engine draws the ground, so
 * the geometry is measured here in a real Chromium: the sheet rests at half with the first row
 * at y 493 at 390, 430, 768 and 820, and the flicks are real CDP touch, 10 steps over 150 ms.
 *
 * <p>What the flicks prove: a `snap-always` target holds a fling that has not yet passed it,
 * and cannot hold one the finger has already carried the sheet past — Chrome then snaps to the
 * position nearest the fling's natural end, whatever its speed. So a 200 px flick down from full
 * rests at half (the target is 263 px away), a slow 350 px drag rests at half (no fling: the
 * nearest rest wins from 87 px past it), and a 350 px flick down from full rests at peek. A
 * mid-gesture layout change is the one thing that cuts a fling short, and this sheet makes none.
 * Recorded, not asserted: the hard fling.
 */

const HEADER_PX = 73;
const HALF_TOP_PX = 380;
const FIRST_ROW_PX = 493;
const FULL_TOP_PX = 117;

/** The four phones and tablets the design record measured, plus the narrowest phone, with the tab bar each has. */
const VIEWPORTS = [
  { width: 320, height: 640, tabBar: 61 },
  { width: 390, height: 844, tabBar: 61 },
  { width: 430, height: 932, tabBar: 61 },
  { width: 768, height: 1024, tabBar: 0 },
  { width: 820, height: 1180, tabBar: 0 },
];
const PHONE = VIEWPORTS[1];

const ROME = { latitude: 41.9, longitude: 12.5 };
const TIRANA = { latitude: 41.33, longitude: 19.82 };
const ON_DHERMI = { latitude: 40.15, longitude: 19.64 };

/**
 * Himarë's four (Palasë closed for today), Durrës's two and Sarandë's one, all pinned: enough
 * rows for the list to scroll at full, and enough regions for the picker and the located arms.
 */
const VENUES = [
  venue(1, 'Palasa Sands', 'PALASE', 'HIMARE', 40.19, 19.58, 2000, false),
  venue(2, 'Aurora Bay', 'DHERMI', 'HIMARE', 40.1573, 19.6401, 3000),
  venue(3, 'Jalë Loungers', 'JALE', 'HIMARE', 40.117, 19.7, 2200),
  venue(4, 'Borsh Kilometre', 'BORSH', 'HIMARE', 40.06, 19.86, 1500),
  venue(7, 'Golem Beach Bar', 'GOLEM', 'DURRES', 41.24, 19.51, 1500),
  venue(8, 'Qerret Loungers', 'QERRET', 'DURRES', 41.21, 19.51, 1800),
  venue(9, 'Miramar Beach Club', 'KSAMIL', 'SARANDE', 39.7712, 20.0021, 2500),
];

function venue(
  id: number,
  name: string,
  beach: string,
  region: string,
  latitude: number,
  longitude: number,
  minorUnits: number,
  salesOpen = true,
): Record<string, unknown> {
  return {
    id,
    name,
    beach,
    region,
    ratingTenths: 42,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen,
    location: { latitude, longitude },
  };
}

async function mockApi(page: Page): Promise<() => number> {
  let venueRequests = 0;
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) => {
    venueRequests += 1;
    return route.fulfill({ json: VENUES });
  });
  return () => venueRequests;
}

async function openSheet(page: Page, viewport = PHONE): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/?map=sheet');
  await expect(page.getByTestId('venue-card')).toHaveCount(4);
  await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
  await expectDetent(page, 'half');
}

function scroller(page: Page): Locator {
  return page.getByTestId('sheet-scroller');
}

function detent(page: Page): Promise<string | null> {
  return scroller(page).getAttribute('data-detent');
}

async function scrollTop(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.scrollTop);
}

/** The sheet has come to rest: the detent names it and the scroll position has stopped moving. */
async function expectDetent(page: Page, expected: string): Promise<void> {
  await expect.poll(() => detent(page), { timeout: 5_000 }).toBe(expected);
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await scrollTop(scroller(page));
        const settled = now === last;
        last = now;
        return settled;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function top(locator: Locator): Promise<number> {
  const box = (await locator.boundingBox())!;
  return Math.round(box.y);
}

/** A finger on the page: `steps` moves from `fromY` to `toY` over `ms`, at `x`. */
async function flick(
  cdp: CDPSession,
  page: Page,
  x: number,
  fromY: number,
  toY: number,
  ms: number,
): Promise<void> {
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  const steps = 10;
  await touch('touchStart', fromY);
  for (let step = 1; step <= steps; step += 1) {
    await touch('touchMove', fromY + ((toY - fromY) * step) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await touch('touchEnd', toY);
}

test.describe('Discover sheet — rests on measured chrome', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockApi(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`rests at half with the map from ${HEADER_PX} to ${HALF_TOP_PX} and the first row at y ${FIRST_ROW_PX} at ${viewport.width} × ${viewport.height}`, async ({
      page,
    }) => {
      await openSheet(page, viewport);

      const header = page.locator('header.riv-header');
      expect(Math.round((await header.boundingBox())!.height)).toBe(HEADER_PX);
      expect(await top(page.getByTestId('sheet'))).toBe(HALF_TOP_PX);
      expect(await top(page.getByTestId('venue-card').first())).toBe(FIRST_ROW_PX);

      // The tab bar is measured, never assumed: on a phone the sheet stops above it, from `sm` there is none.
      const bar = page.getByTestId('tab-bar');
      if (viewport.tabBar === 0) {
        await expect(bar).toBeHidden();
      } else {
        expect(Math.round((await bar.boundingBox())!.height)).toBe(viewport.tabBar);
      }
      // The scroller ends at the tab bar; the sheet is one snapport tall, so at half it runs under the clip.
      const outer = (await scroller(page).boundingBox())!;
      expect(Math.round(outer.y + outer.height)).toBe(viewport.height - viewport.tabBar);
      const sheet = (await page.getByTestId('sheet').boundingBox())!;
      expect(Math.round(sheet.height)).toBe(viewport.height - viewport.tabBar - FULL_TOP_PX);

      // The foot row: Near me and the credit on one row, 12 px over the sheet, the credit wrapped.
      const nearMe = (await page.getByTestId('sheet-near-me').boundingBox())!;
      const credit = (await page.getByTestId('map-attribution').boundingBox())!;
      expect(Math.round(nearMe.y + nearMe.height)).toBe(HALF_TOP_PX - 12);
      expect(Math.round(credit.y + credit.height)).toBe(HALF_TOP_PX - 12);
      expect(credit.width).toBeLessThanOrEqual(200);
      expect(credit.x + credit.width + 8).toBeLessThanOrEqual(nearMe.x);
      await expect(page.getByTestId('map-zoom-in')).toHaveCount(0);
      await expect(page.getByTestId('sheet-map-pill')).toHaveCount(0);

      // The tablet band lays the rows in two columns; a phone in one.
      const columns = await page
        .getByTestId('sheet-rows')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(viewport.width >= 600 ? 2 : 1);
    });
  }

  test('the flag off leaves today’s Discover: the filter bar and the switch, no sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(7);
    await expect(page.getByTestId('filter-beach')).toBeVisible();
    await expect(page.getByTestId('view-switch')).toBeVisible();
    await expect(page.getByTestId('sheet-scroller')).toHaveCount(0);
  });
});

test.describe('Discover sheet — the browser’s own latching', () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockApi(page);
  });

  test('flicks rest at full and at half; the list scrolls only at full', async ({ page }) => {
    await openSheet(page);
    const cdp = await page.context().newCDPSession(page);
    const list = page.getByTestId('sheet-list');
    await expect(list).toHaveCSS('overflow-y', 'clip');

    // 400 px up from half in 150 ms: the sheet stops at full, the list at its top.
    await flick(cdp, page, 200, 700, 300, 150);
    await expectDetent(page, 'full');
    expect(await scrollTop(list)).toBe(0);
    await expect(list).toHaveCSS('overflow-y', 'auto');
    expect(await top(page.getByTestId('sheet'))).toBe(FULL_TOP_PX);

    // 200 px down from full in 100 ms, from the list's top: the half rest holds the fling.
    await flick(cdp, page, 200, 300, 500, 100);
    await expectDetent(page, 'half');
    expect(await top(page.getByTestId('sheet'))).toBe(HALF_TOP_PX);

    // A slow 350 px drag down from full rests at half: no fling, the nearest rest wins.
    await flick(cdp, page, 200, 700, 300, 150);
    await expectDetent(page, 'full');
    await flick(cdp, page, 200, 300, 650, 600);
    await expectDetent(page, 'half');

    // At full a drag on a list scrolled inside scrolls the list, never the sheet.
    await flick(cdp, page, 200, 700, 300, 150);
    await expectDetent(page, 'full');
    await flick(cdp, page, 200, 700, 400, 400);
    await expect.poll(() => scrollTop(list)).toBeGreaterThan(100);
    const scrolled = await scrollTop(list);
    await flick(cdp, page, 200, 400, 500, 400);
    await expect.poll(() => scrollTop(list)).toBeLessThan(scrolled);
    expect(await detent(page)).toBe('full');
  });

  test('the grabber cycles half and full; the Map pill returns to half and never covers the last row', async ({
    page,
  }) => {
    await openSheet(page);

    await page.getByTestId('sheet-grabber').click();
    await expectDetent(page, 'full');
    const pill = page.getByTestId('sheet-map-pill');
    await expect(pill).toBeVisible();
    const pillBox = (await pill.boundingBox())!;
    expect(Math.round(pillBox.y + pillBox.height)).toBe(PHONE.height - PHONE.tabBar - 12);

    // The list scrolled to its end: the last row ends above the pill.
    const list = page.getByTestId('sheet-list');
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = (await page.getByTestId('venue-card').last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(pillBox.y);

    await pill.click();
    await expectDetent(page, 'half');
    await expect(pill).toHaveCount(0);

    await page.getByTestId('sheet-grabber').click();
    await expectDetent(page, 'full');
    await page.getByTestId('sheet-grabber').click();
    await expectDetent(page, 'half');
  });

  test('a pin press lights its row and brings it to the top at half and at full, without a jump', async ({
    page,
  }) => {
    await openSheet(page);
    const list = page.getByTestId('sheet-list');

    // Aurora Bay's pin: the second row, which can reach the top (the last row cannot, as a scroller clamps).
    await page.locator('[data-pin="2"]').click();
    const row = page.locator('[data-venue-pin="2"]');
    await expect(row).toHaveAttribute('data-selected', '');
    await expect(row.getByTestId('venue-card')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('venue-preview')).toHaveCount(0);
    await expect.poll(async () => (await top(row)) - (await top(list))).toBe(8);
    await expect(page.getByTestId('sheet-grabber')).toBeVisible();

    // At full the lift becomes the list's own scroll: the row keeps its place under the head.
    await page.getByTestId('sheet-grabber').click();
    await expectDetent(page, 'full');
    await expect.poll(async () => (await top(row)) - (await top(list))).toBe(8);
    expect(await scrollTop(list)).toBeGreaterThan(0);

    // And back to half, the scroll becomes the lift again.
    await page.getByTestId('sheet-map-pill').click();
    await expectDetent(page, 'half');
    await expect.poll(async () => (await top(row)) - (await top(list))).toBe(8);
  });

  test('the rails open under the head, raise the sheet from peek, and a pick closes them', async ({
    page,
  }) => {
    const venueRequests = await mockApi(page);
    await openSheet(page);

    await page.getByTestId('head-day').click();
    const dayRail = page.getByRole('group', { name: 'Day' });
    await expect(dayRail).toBeVisible();
    await expect(dayRail.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(dayRail.getByRole('button', { name: 'Today' })).toBeInViewport();
    const before = venueRequests();
    await dayRail.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(dayRail).toHaveCount(0);
    await expect(page.getByTestId('head-day')).toHaveText(/Tomorrow/);
    await expect.poll(venueRequests).toBe(before + 1);

    // The beach chip: the region's beaches, a pick lights the chip and narrows the rows.
    await page.getByTestId('head-beaches').click();
    const beachRail = page.getByRole('group', { name: 'Beach' });
    await expect(beachRail).toBeVisible();
    await beachRail.getByRole('button', { name: /^Dhërmi/ }).click();
    await expect(beachRail).toHaveCount(0);
    await expect(page.getByTestId('head-beaches')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('venue-card')).toHaveCount(1);
    await expect(page.getByTestId('head-title')).toHaveText('Dhërmi');

    // At peek the rails have no room: a chip pressed there raises the sheet first.
    await scroller(page).evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await expectDetent(page, 'peek');
    await page.getByTestId('head-day').click();
    await expectDetent(page, 'half');
    await expect(page.getByRole('group', { name: 'Day' })).toBeVisible();
  });
});

test.describe('Discover sheet — Near me’s three arms', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockApi(page);
    await context.grantPermissions(['geolocation']);
  });

  test('off the fence: nothing moves and the map’s own words stand in the head', async ({
    page,
    context,
  }) => {
    await context.setGeolocation(ROME);
    await openSheet(page);
    const pinsBefore = await page
      .locator('[data-pin]')
      .evaluateAll((pins) => pins.map((pin) => (pin as HTMLElement).style.left));

    await page.getByTestId('sheet-near-me').click();

    await expect(page.getByTestId('head-note')).toHaveText(
      'You don’t seem to be on the Albanian riviera — the map hasn’t moved.',
    );
    await expect(page.getByTestId('head-title')).toHaveText('Himarë');
    await expect(page.getByTestId('venue-card')).toHaveCount(4);
    await expect(page.getByTestId('here-dot')).toHaveCount(0);
    expect(
      await page
        .locator('[data-pin]')
        .evaluateAll((pins) => pins.map((pin) => (pin as HTMLElement).style.left)),
    ).toEqual(pinsBefore);

    await page.getByTestId('head-note-dismiss').click();
    await expect(page.getByTestId('head-note')).toHaveCount(0);
    await expect(page.getByTestId('head-day')).toBeFocused();
  });

  test('inside the fence: the dot is in the frame and the list is nearest first, titled by the region', async ({
    page,
    context,
  }) => {
    await context.setGeolocation(TIRANA);
    const leaks: string[] = [];
    page.on('request', (request) => {
      const body = `${request.url()} ${request.postData() ?? ''}`;
      if (body.includes('41.33') || body.includes('19.82')) {
        leaks.push(body);
      }
    });
    await openSheet(page);

    await page.getByTestId('sheet-near-me').click();

    await expect(page.getByTestId('head-title')).toHaveText('Durrës');
    await expect(page.getByTestId('head-located')).toBeVisible();
    await expect(page.getByTestId('sheet-group').first()).toHaveText(/Golem 28 km/);
    await expect(page.getByTestId('venue-card').first()).toHaveAttribute(
      'aria-label',
      /Golem Beach Bar/,
    );
    const dot = page.getByTestId('here-dot');
    await expect(dot).toBeVisible();
    const dotBox = (await dot.boundingBox())!;
    expect(dotBox.y).toBeGreaterThanOrEqual(HEADER_PX);
    expect(dotBox.y + dotBox.height).toBeLessThanOrEqual(HALF_TOP_PX);
    await expect(page.getByTestId('sheet-near-me')).toHaveText(/You are here/);
    expect(leaks).toEqual([]);
  });

  test('keeps the credit clear of You are here on the narrowest phone', async ({
    page,
    context,
  }) => {
    await context.setGeolocation(ON_DHERMI);
    await openSheet(page, VIEWPORTS[0]);

    await page.getByTestId('sheet-near-me').click();
    await expect(page.getByTestId('sheet-near-me')).toHaveText(/You are here/);

    const nearMe = (await page.getByTestId('sheet-near-me').boundingBox())!;
    const credit = (await page.getByTestId('map-attribution').boundingBox())!;
    expect(credit.x + credit.width + 8).toBeLessThanOrEqual(nearMe.x);
    expect(credit.x).toBeGreaterThanOrEqual(12);
  });

  test('on the beach: the beach is the title', async ({ page, context }) => {
    await context.setGeolocation(ON_DHERMI);
    await openSheet(page);

    await page.getByTestId('sheet-near-me').click();

    await expect(page.getByTestId('head-title')).toHaveText('Dhërmi');
    await expect(page.getByTestId('sheet-group').first()).toHaveText(/Dhërmi 0\.\d km/);
    await expect(page.getByTestId('here-dot')).toBeVisible();
  });
});

test.describe('Discover sheet — accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockApi(page);
  });

  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`is axe clean with every control at the touch floor at half, with a rail, with the picker and at full (${viewport.width})`, async ({
      page,
    }) => {
      await openSheet(page, viewport);
      await settle(page);
      await expectTouchTargets(page, 'the sheet at half');
      await expectNoSeriousAxeViolations(page, 'the sheet at half');
      // Every control on the map or the sheet drops the double-tap: one is pressed twice in quick succession.
      await expectTouchManipulation(
        page,
        '[data-testid="sheet-grabber"], [data-testid="head-place"], [data-testid="head-beaches"], [data-testid="head-day"], [data-testid="sheet-near-me"]',
        'the head and the foot',
      );

      await page.getByTestId('head-beaches').click();
      await expect(page.getByRole('group', { name: 'Beach' })).toBeVisible();
      await settle(page);
      await expectTouchTargets(page, 'the sheet with the beach rail open');
      await expectNoSeriousAxeViolations(page, 'the sheet with the beach rail open');
      await expectTouchManipulation(
        page,
        '[role="group"][aria-label="Beach"] button',
        'the beach rail',
      );

      await page.getByTestId('head-day').click();
      await expect(page.getByRole('group', { name: 'Day' })).toBeVisible();
      await settle(page);
      await expectTouchManipulation(
        page,
        '[role="group"][aria-label="Day"] button',
        'the day rail',
      );

      await page.getByTestId('head-place').click();
      const picker = page.getByTestId('coast-picker');
      await expect(picker).toBeVisible();
      await expect(picker).toBeFocused();
      await expect(picker).not.toContainText('Whole coast');
      await settle(page);
      await expectTouchTargets(page, 'the coast picker');
      await expectNoSeriousAxeViolations(page, 'the coast picker');
      await expectTouchManipulation(
        page,
        '[data-testid="picker-row"], [data-testid="picker-near-me"], [data-testid="picker-close"]',
        'the coast picker',
      );
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await expect(page.getByTestId('head-place')).toBeFocused();

      await page.getByTestId('sheet-grabber').click();
      await expectDetent(page, 'full');
      await settle(page);
      await expectTouchTargets(page, 'the sheet at full');
      await expectNoSeriousAxeViolations(page, 'the sheet at full');
      await expectTouchManipulation(page, '[data-testid="sheet-map-pill"]', 'the Map pill');
    });
  }
});
