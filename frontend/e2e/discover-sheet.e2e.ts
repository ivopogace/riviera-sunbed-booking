import { CDPSession, expect, Locator, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { mockMapResources } from './support/map-resources';
import { expectTouchManipulation } from './support/mobile-zoom';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The riviera map sheet — what Discover renders: the map as the ground under the
 * glass header, the cards as a sheet with three resting heights, the head one row carrying the
 * query, the row the pin's preview, Near me's three arms. The ground opens as the **map
 * poster** — a still under the pins, no engine — and the fake engine takes over when something
 * has to move the camera, so the geometry is measured here in a real Chromium: the sheet rests
 * at half with the first row at y 493 at 390, 430, 768 and 820, and the flicks are real CDP
 * touch, 10 steps over 150 ms. The first paint's cost is counted against the REAL adapter.
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

/** The ground: the poster on a phone or tablet, the fake's surface above the widest bucket or once woken. */
function ground(page: Page): Locator {
  return page.locator('[data-testid="sheet-poster"], [data-testid="riviera-map-fake"]').first();
}

async function openSheet(page: Page, viewport = PHONE): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await expect(page.getByTestId('venue-card')).toHaveCount(4);
  await expect(ground(page)).toBeVisible();
  await expectDetent(page, 'half');
}

/** Every pin's box, crowd members included, so a swap can be shown to move none of them. */
async function pinBoxes(page: Page): Promise<{ x: number; y: number }[]> {
  return page.locator('[data-pin]').evaluateAll((pins) =>
    pins.map((pin) => {
      const box = pin.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }),
  );
}

/** Counts the WebGL contexts the page creates, one per canvas, from before any script runs. */
async function countWebGl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counted = new WeakSet<HTMLCanvasElement>();
    (window as unknown as { __glContexts: number }).__glContexts = 0;
    type GetContext = (this: HTMLCanvasElement, ...args: unknown[]) => unknown;
    const prototype = HTMLCanvasElement.prototype as unknown as Record<string, GetContext>;
    const original = prototype['getContext'];
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      const context = original.call(this, kind, ...rest);
      if (context && kind.includes('webgl') && !counted.has(this)) {
        counted.add(this);
        (window as unknown as { __glContexts: number }).__glContexts += 1;
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

function webGlContexts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __glContexts: number }).__glContexts);
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

      // The ground is the poster, centred and cropped to the pane with no fill either side, anchored at the top.
      await expect(page.getByTestId('sheet-poster')).toBeVisible();
      const poster = (await page.getByTestId('poster-image').boundingBox())!;
      expect(poster.x).toBeLessThanOrEqual(0);
      expect(poster.x + poster.width).toBeGreaterThanOrEqual(viewport.width);
      expect(Math.round(poster.y)).toBe(0);
      expect(poster.height).toBeGreaterThanOrEqual(viewport.height);
      await expect(page.getByTestId('riviera-map-fake')).toHaveCount(0);

      // The tablet band lays the rows in two columns; a phone in one.
      const columns = await page
        .getByTestId('sheet-rows')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(viewport.width >= 600 ? 2 : 1);
    });
  }

  test('no preview card is rendered on any Discover surface, and no parameter brings one back', async ({
    page,
  }) => {
    for (const viewport of [PHONE, { width: 1440, height: 900 }]) {
      for (const path of ['/', '/?map=off', '/?map=sheet']) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(path);
        await expect(
          page.getByTestId('sheet-rows').or(page.getByTestId('desk-rows')),
        ).toBeVisible();
        await expect(page.getByTestId('venue-preview')).toHaveCount(0);
        await expect(page.getByTestId('filter-beach')).toHaveCount(0);
        await expect(page.getByTestId('view-switch')).toHaveCount(0);
      }
    }
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

  /**
   * A phone fires `resize` in the middle of a gesture every time its URL bar or on-screen
   * keyboard moves, and the sheet re-measures its chrome on it. Resting on that scrolled the
   * sheet out from under the finger, and pulled the Map pill's own glide straight back into
   * full — a drag that fights back, and a Map button that does nothing.
   *
   * <p>Neither is visible at a fixed desktop viewport, so the browser chrome is played by
   * `setViewportSize` and the programmatic scrolls the sheet asks for are recorded: while the
   * finger is down there must be none, and the pill's glide must still land at half.
   */
  test('a re-measure never cuts a gesture short: the phone chrome that moves mid-drag', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __rests: unknown[] }).__rests = [];
      type ScrollTo = (this: Element, ...args: unknown[]) => void;
      const prototype = Element.prototype as unknown as Record<string, ScrollTo>;
      const original = prototype['scrollTo'];
      Element.prototype.scrollTo = function (this: HTMLElement, ...args: unknown[]) {
        if (this.dataset?.['testid'] === 'sheet-scroller') {
          (window as unknown as { __rests: unknown[] }).__rests.push(args[0]);
        }
        original.call(this, ...args);
      };
    });
    await openSheet(page);
    const cdp = await page.context().newCDPSession(page);
    const rests = () => page.evaluate(() => (window as unknown as { __rests: unknown[] }).__rests);
    const clearRests = () =>
      page.evaluate(() => {
        (window as unknown as { __rests: unknown[] }).__rests = [];
      });

    // A drag up from half, with the URL bar collapsing a third of the way through it.
    await clearRests();
    const head = (await page.getByTestId('sheet-head').boundingBox())!;
    const x = Math.round(PHONE.width / 2);
    const from = Math.round(head.y + 30);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    await touch('touchStart', from);
    for (let step = 1; step <= 12; step += 1) {
      await touch('touchMove', from - (220 * step) / 12);
      if (step === 4) {
        await page.setViewportSize({ width: PHONE.width, height: PHONE.height + 56 });
      }
      await page.waitForTimeout(25);
    }
    // Nothing the sheet scrolled for itself while the finger was down, and the flick still lands.
    expect(await rests(), 'a re-measure scrolled the sheet under the finger').toEqual([]);
    await touch('touchEnd', from - 220);
    await expectDetent(page, 'full');

    // The Map pill: its own glide is what moves the URL bar back, so the resize lands on top of it.
    await clearRests();
    await page.getByTestId('sheet-map-pill').click();
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await expectDetent(page, 'half');
    await expect(page.getByTestId('sheet-map-pill')).toHaveCount(0);
  });

  /**
   * Discover in sheet mode is pinned over the whole window, so the document cannot scroll: every
   * downward drag that misses the sheet — the header, the tab bar, a pin, Near me — chains all
   * the way to the viewport, where Chrome Android reads it as pull-to-refresh and reloads the
   * page out from under a tourist mid-query.
   *
   * <p>The containment is deliberately NOT app-wide: on a page that really scrolls, pull to
   * refresh means "get me fresh data" and is left alone. So both halves are asserted — contained
   * where the ground owns the viewport, untouched at a width where it does not. It must also sit
   * on the ROOT element, the only one `overscroll-behavior` propagates to the viewport from.
   */
  test('pull-to-refresh is off where the ground owns the viewport, and only there', async ({
    page,
  }) => {
    await openSheet(page);

    const rootOverscroll = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
    const documentScrolls = () =>
      page.evaluate(
        () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
      );

    await expect(page.getByTestId('sheet-ground')).toHaveClass(/riv-owns-viewport/);
    expect(await rootOverscroll()).toBe('contain');
    expect(await documentScrolls(), 'the document scrolls, so this is not the trapped case').toBe(
      false,
    );

    // Past the wide breakpoint the ground is gone, and the gesture comes back with it.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTestId('sheet-ground')).toHaveCount(0);
    expect(await rootOverscroll()).toBe('auto');
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

    // Aurora Bay's pin: the second row, which can reach the top (the last row cannot, as a scroller clamps). At the poster's zoom it is a crowd member, so the keyboard opens it.
    await page.locator('[data-pin="2"]').press('Enter');
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

/** The picker open on the sheet, its ribbon's map booted: every index beach has its dot. */
async function openPicker(page: Page, viewport = PHONE): Promise<Locator> {
  await openSheet(page, viewport);
  await page.getByTestId('head-place').click();
  const picker = page.getByTestId('coast-picker');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('ribbon-dot')).toHaveCount(7);
  await settle(page);
  return picker;
}

/** A leader's path as the picker writes it: `M x0 y0 H 144 L 158 rowY H 166`, in the body's px. */
function leaderEnds(d: string | null): { x0: number; y0: number; rowY: number; xEnd: number } {
  const match = /^M ([\d.-]+) ([\d.-]+) H [\d.-]+ L [\d.-]+ ([\d.-]+) H ([\d.-]+)$/.exec(d ?? '');
  expect(match, d ?? 'no path').not.toBeNull();
  const [, x0, y0, rowY, xEnd] = match!;
  return { x0: Number(x0), y0: Number(y0), rowY: Number(rowY), xEnd: Number(xEnd) };
}

test.describe('Discover sheet — the coast picker’s ribbon', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockApi(page);
  });

  test('opens the only map and closes it: the ground is a poster, so the fake surfaces count 0, 1, 0', async ({
    page,
  }) => {
    await openSheet(page);
    const maps = page.getByTestId('riviera-map-fake');
    await expect(maps).toHaveCount(0);

    await page.getByTestId('head-place').click();
    await expect(maps).toHaveCount(1);
    await expect(page.getByTestId('picker-ribbon').getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByTestId('picker-close').click();
    await expect(page.getByTestId('coast-picker')).toHaveCount(0);
    await expect(maps).toHaveCount(0);
    await expect(page.getByTestId('sheet-poster')).toBeVisible();
  });

  test('every beach has a dot in the ribbon and a leader from it to its row, clear of the row’s text', async ({
    page,
  }) => {
    await openPicker(page);
    const ribbon = (await page.getByTestId('picker-ribbon').boundingBox())!;
    expect(Math.round(ribbon.width)).toBe(150);
    const svg = (await page.getByTestId('picker-leaders').boundingBox())!;
    await expect(page.getByTestId('ribbon-leader')).toHaveCount(7);

    const centreY = new Map<string, number>();
    for (const beach of ['PALASE', 'DHERMI', 'JALE', 'BORSH', 'GOLEM', 'QERRET', 'KSAMIL']) {
      const dot = (await page
        .locator(`[data-testid="ribbon-dot"][data-beach="${beach}"]`)
        .boundingBox())!;
      expect(dot.x, beach).toBeGreaterThanOrEqual(ribbon.x);
      expect(dot.x + dot.width, beach).toBeLessThanOrEqual(ribbon.x + ribbon.width);
      expect(dot.y, beach).toBeGreaterThanOrEqual(ribbon.y);
      expect(dot.y + dot.height, beach).toBeLessThanOrEqual(ribbon.y + ribbon.height);
      centreY.set(beach, dot.y + dot.height / 2);

      const ends = leaderEnds(
        await page
          .locator(`[data-testid="ribbon-leader"][data-beach="${beach}"]`)
          .getAttribute('d'),
      );
      // The leader starts at the dot's edge, level with its middle …
      expect(Math.abs(svg.y + ends.y0 - (dot.y + dot.height / 2)), beach).toBeLessThanOrEqual(1);
      expect(Math.abs(svg.x + ends.x0 - (dot.x + dot.width / 2 + 5)), beach).toBeLessThanOrEqual(1);
      // … ends level with its row's middle, and short of the row's text.
      const row = (await page.locator(`[data-beach-row="${beach}"]`).boundingBox())!;
      expect(svg.y + ends.rowY, beach).toBeGreaterThanOrEqual(row.y);
      expect(svg.y + ends.rowY, beach).toBeLessThanOrEqual(row.y + row.height);
      const label = (await page.locator(`[data-beach-row="${beach}"] span`).first().boundingBox())!;
      expect(svg.x + ends.xEnd, beach).toBeLessThan(label.x);
    }
    // North to south down the ribbon, as the coast runs.
    expect(centreY.get('GOLEM')!).toBeLessThan(centreY.get('PALASE')!);
    expect(centreY.get('PALASE')!).toBeLessThan(centreY.get('KSAMIL')!);
  });

  test('at 320 the ribbon keeps its 150 px and the rows narrow to what is left', async ({
    page,
  }) => {
    await openPicker(page, VIEWPORTS[0]);

    expect(Math.round((await page.getByTestId('picker-ribbon').boundingBox())!.width)).toBe(150);
    const rows = await page.getByTestId('picker-row').all();
    for (const row of rows) {
      const box = (await row.boundingBox())!;
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
      // 320 − the ribbon − the gutter − the right inset, at most; a region row is the widest.
      expect(box.width).toBeLessThanOrEqual(320 - 150 - 20 - 12);
      expect(box.width).toBeGreaterThanOrEqual(100);
    }
    await expectTouchTargets(page, 'the coast picker at 320');
  });

  test('a held press lights the dot, focus lights the leader, and the release picks', async ({
    page,
  }) => {
    await openPicker(page);
    const row = page.locator('[data-beach-row="DHERMI"]');
    const dot = page.locator('[data-testid="ribbon-dot"][data-beach="DHERMI"]');
    const leader = page.locator('[data-testid="ribbon-leader"][data-beach="DHERMI"]');
    const stroke = () => leader.evaluate((el) => getComputedStyle(el).stroke);
    const width = () => leader.evaluate((el) => getComputedStyle(el).strokeWidth);
    const size = () => dot.evaluate((el) => getComputedStyle(el).width);
    const restingStroke = await stroke();
    const restingWidth = await width();
    expect(await size()).toBe('9px');

    await row.focus();
    await expect(leader).toHaveAttribute('data-lit', '');
    expect(await stroke()).not.toBe(restingStroke);
    expect(await width()).not.toBe(restingWidth);
    await row.blur();
    await expect(leader).not.toHaveAttribute('data-lit', '');
    expect(await stroke()).toBe(restingStroke);

    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + 24, box.y + box.height / 2);
    await expect(dot).toHaveAttribute('data-lit', '');
    await page.mouse.down();
    await expect(dot).toHaveAttribute('data-lit', '');
    await expect.poll(size).toBe('13px');
    await page.mouse.up();

    await expect(page.getByTestId('coast-picker')).toHaveCount(0);
    await expect(page.getByTestId('head-title')).toHaveText('Dhërmi');
  });

  test('is hidden from assistive technology, takes no pointer, and leaves the index’s names and tab order alone', async ({
    page,
  }) => {
    const picker = await openPicker(page);

    const ribbon = page.getByTestId('picker-ribbon');
    await expect(ribbon).toHaveAttribute('aria-hidden', 'true');
    await expect(ribbon).toHaveCSS('pointer-events', 'none');
    await expect(picker.getByRole('button')).toHaveCount(12);
    await expect(picker.getByRole('link')).toHaveCount(0);
    await expect(picker.getByRole('button').nth(0)).toHaveAccessibleName('Close');
    await expect(picker.getByRole('button').nth(1)).toHaveAccessibleName('Near me');
    await expect(picker.getByRole('button').nth(2)).toHaveAccessibleName(
      'Durrës 2 venues from €15',
    );

    // Tab walks Close, Near me, the first row: never into the ribbon.
    await expect(picker).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('picker-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('picker-near-me')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('picker-row').first()).toBeFocused();

    await expectNoSeriousAxeViolations(page, 'the coast picker with its ribbon');
    await expectTouchTargets(page, 'the coast picker with its ribbon');
  });
});

test.describe('Discover sheet — the poster', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('the first paint is a poster: 0 map requests, 0 WebGL contexts, one image — and the counters are live', async ({
    page,
  }) => {
    // The REAL adapter, fed the committed resources: a mounted map would show in both counts.
    await countWebGl(page);
    await mockMapResources(page);
    let mapRequests = 0;
    let posterRequests = 0;
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/map/')) mapRequests += 1;
      if (pathname.startsWith('/posters/')) posterRequests += 1;
    });
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(4);
    await expectDetent(page, 'half');
    const image = page.getByTestId('poster-image');
    await expect(image).toHaveAttribute('src', '/posters/HIMARE-440@2x.jpg');
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator('[data-pin]')).toHaveCount(4);
    await expect(page.getByTestId('map-attribution')).toHaveText(
      '© OpenMapTiles © OpenStreetMap contributors',
    );
    await expect(page.getByTestId('map-attribution').getByRole('link')).toHaveCount(2);

    expect(mapRequests).toBe(0);
    expect(posterRequests).toBe(1);
    expect(await webGlContexts(page)).toBe(0);
    await expect(page.getByTestId('riviera-map-canvas')).toHaveCount(0);

    // A finger on the ground wakes the real map, which costs what a live map costs.
    await page.mouse.move(195, 200);
    await page.mouse.down();
    await expect(page.locator('[data-testid="riviera-map-canvas"] canvas')).toHaveCount(1);
    await expect.poll(() => mapRequests).toBeGreaterThan(0);
    await expect.poll(() => webGlContexts(page)).toBe(1);
    await page.mouse.up();
  });

  /**
   * The epic's first user story, as geometry: a tourist opening Discover sees the region's map
   * with priced pins on the first screen. The counts above prove the poster is drawn and cheap;
   * this proves it is drawn WHERE a tourist can see it, with no scroll and no gesture.
   */
  test('the default route paints the poster and a priced pin inside the first screen', async ({
    page,
  }) => {
    await mockMapResources(page);
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(4);

    // The ground IS the first screen — not a pane below a hero, which is what the epic filed.
    const ground = await page.getByTestId('sheet-ground').boundingBox();
    expect(ground).toEqual({ x: 0, y: 0, width: PHONE.width, height: PHONE.height });

    // Centre-cropped, so it overhangs: a box INSIDE the viewport would mean a gap.
    await expect(page.getByTestId('poster-image')).toBeVisible();
    const poster = await page.getByTestId('poster-image').boundingBox();
    expect(poster!.y).toBeLessThanOrEqual(0);
    expect(poster!.x).toBeLessThanOrEqual(0);
    expect(poster!.y + poster!.height).toBeGreaterThanOrEqual(PHONE.height);
    expect(poster!.x + poster!.width).toBeGreaterThanOrEqual(PHONE.width);

    // A pin carrying a price, not a bare dot: the story is "priced pins", not "pins".
    const priced = page.locator('[data-pin] .pin-price').first();
    await expect(priced).toBeVisible();
    await expect(priced).toHaveText(/€/);
    const pin = await priced.boundingBox();
    expect(pin!.y).toBeGreaterThanOrEqual(0);
    expect(pin!.y + pin!.height).toBeLessThanOrEqual(PHONE.height);

    // Laid out is not seen: the sheet rests over the same ground, so ask what is painted there.
    const painted = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-pin]') !== null,
      [pin!.x + pin!.width / 2, pin!.y + pin!.height / 2],
    );
    expect(painted, 'the priced pin is the thing at its own centre, not the sheet').toBe(true);
  });

  test.describe('fake engine', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
      });
    });

    test('a drag on the ground swaps the live map in with the pins where they were', async ({
      page,
    }) => {
      await openSheet(page);
      await expect(page.getByTestId('riviera-map-fake')).toHaveCount(0);
      const before = await pinBoxes(page);
      expect(before).toHaveLength(4);

      await page.mouse.move(195, 200);
      await page.mouse.down();

      await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
      await expect(page.getByTestId('sheet-poster')).toHaveCount(0);
      // The press focused the poster's button; the map that took its place holds focus now (WCAG 2.4.3).
      await expect(page.getByTestId('sheet-map')).toBeFocused();
      await expect(page.getByTestId('map-attribution')).toHaveCount(1);
      await settle(page);
      const after = await pinBoxes(page);
      expect(after).toHaveLength(before.length);
      for (const [index, box] of after.entries()) {
        expect(Math.abs(box.x - before[index].x), `pin ${index} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y - before[index].y), `pin ${index} y`).toBeLessThanOrEqual(1);
      }
      await page.mouse.up();
    });

    test('a crowd press swaps the live map in and separates the crowd', async ({ page }) => {
      await openSheet(page);
      // Palasë, Dhërmi and Jalë crowd on the pair's own mean, where their pill is drawn; Borsh alone.
      await expect(page.getByTestId('map-place-pill')).toHaveCount(1);
      await expect(page.getByTestId('map-venue-pin')).toHaveCount(1);

      await page.getByTestId('map-place-pill').click();

      await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
      await expect(page.getByTestId('sheet-poster')).toHaveCount(0);
      await expect(page.getByTestId('map-place-pill')).toHaveCount(0);
      await expect(page.getByTestId('map-venue-pin')).toHaveCount(4);
      await expect(page.getByTestId('head-title')).toHaveText('Himarë');
    });

    test('at 900 wide, above the widest bucket, the ground is live from the first paint', async ({
      page,
    }) => {
      await openSheet(page, { width: 900, height: 1100, tabBar: 0 });

      await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
      await expect(page.getByTestId('sheet-poster')).toHaveCount(0);
      await expect(page.getByTestId('poster-image')).toHaveCount(0);
    });
  });

  test.describe('fake engine, touch', () => {
    test.use({ hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
      });
    });

    test('the sheet pulled to peek swaps the live map in and fits the window it leaves', async ({
      page,
    }) => {
      await openSheet(page);
      await expect(page.getByTestId('riviera-map-fake')).toHaveCount(0);
      const cdp = await page.context().newCDPSession(page);

      await flick(cdp, page, 200, 400, 750, 150);

      await expectDetent(page, 'peek');
      await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
      await expect(page.getByTestId('sheet-poster')).toHaveCount(0);
      // The pins are fitted into the window the sheet leaves: the header to the foot row above peek.
      const peekTop = PHONE.height - PHONE.tabBar - 78;
      const boxes = await page
        .locator('[data-pin]')
        .evaluateAll((pins) => pins.map((pin) => pin.getBoundingClientRect().toJSON() as DOMRect));
      expect(boxes.length).toBe(4);
      for (const box of boxes) {
        expect(box.y).toBeGreaterThanOrEqual(HEADER_PX);
        expect(box.y + box.height).toBeLessThanOrEqual(peekTop - 56);
      }
    });
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
