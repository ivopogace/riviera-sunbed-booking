import { expect, Locator, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { hitTestId } from './support/hit-test';
import { mockMapResources } from './support/map-resources';
import { expectTouchManipulation } from './support/mobile-zoom';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The riviera map on Discover (ADR-0022). Two engines, on purpose: the fake (armed through
 * `window.__RIVIERA_FAKE_MAP__`) drives the switch, the chrome and the a11y checks
 * deterministically; the REAL MapLibre adapter, fed the committed style, sprites and glyphs from
 * `platform/map/` and a synthetic tile fixture, is what the two guards need — with the fake, no map
 * resource is ever requested and a pasted CDN URL would go unseen.
 */

/** A 1×1 PNG for the mocked serving endpoint — the preview's `<img>` genuinely loads. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const COVER_URL = '/api/venues/1/photos/aa01';

/**
 * Two pinned venues and one without a location. The unpinned one is the point of the third row:
 * it stays in the list and draws no pin, so "one pin per PINNED venue" is asserted against a list
 * that actually contains a counter-example.
 */
const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'KSAMIL',
    region: 'SARANDE',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 18, total: 24 },
    salesOpen: true,
    location: { latitude: 39.7712, longitude: 20.0021 },
    coverPhoto: {
      card: { url: COVER_URL, sources: [{ url: COVER_URL, width: 576 }] },
      banner: { url: COVER_URL, sources: [{ url: COVER_URL, width: 1440 }] },
    },
    photos: [{ url: COVER_URL, sources: [{ url: COVER_URL, width: 576 }] }],
  },
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'DHERMI',
    region: 'HIMARE',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
    location: { latitude: 40.1573, longitude: 19.6401 },
  },
  {
    id: 3,
    name: 'Palasa Sands',
    beach: 'PALASE',
    region: 'HIMARE',
    ratingTenths: 44,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2000, currency: 'EUR' },
    availability: { free: 4, total: 8 },
    salesOpen: true,
  },
];

/**
 * The three above plus a venue ~120 m from Miramar and two ~20 m from Aurora: at the riviera-wide
 * view Ksamil is a crowd of two and Dhërmi a crowd of three; the pair separates around zoom 15,
 * the trio never does inside the map's own fence — the maintainer's report.
 */
const CROWDED_VENUES = [
  ...VENUES,
  {
    id: 4,
    name: 'Lori Beach',
    beach: 'KSAMIL',
    region: 'SARANDE',
    ratingTenths: 40,
    reviewsCount: 15,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2100, currency: 'EUR' },
    availability: { free: 15, total: 25 },
    salesOpen: true,
    location: { latitude: 39.77227, longitude: 20.00317 },
  },
  {
    id: 5,
    name: 'Folie Marine',
    beach: 'DHERMI',
    region: 'HIMARE',
    ratingTenths: 39,
    reviewsCount: 40,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3900, currency: 'EUR' },
    availability: { free: 2, total: 34 },
    salesOpen: true,
    location: { latitude: 40.15747, longitude: 19.64026 },
  },
  {
    id: 6,
    name: 'Dhërmi Sun Club',
    beach: 'DHERMI',
    region: 'HIMARE',
    ratingTenths: 38,
    reviewsCount: 9,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 2400, currency: 'EUR' },
    availability: { free: 19, total: 22 },
    salesOpen: true,
    location: { latitude: 40.15718, longitude: 19.64038 },
  },
];

/**
 * The page's own origin plus the API origin the dev build points at — one origin in production
 * (Spring serves the SPA), two under `ng serve`. Anything else is a third party.
 */
const OUR_HOSTS = new Set(['localhost:4200', 'localhost:8080']);

/**
 * Sarandë, to six decimals. Deliberately unround: the no-leak guard greps every request, storage
 * entry and console line for these digits, and a round number could match something innocent.
 */
const VISITOR = { latitude: 39.874231, longitude: 20.007412 };

const PHONE = { width: 390, height: 780 };
/** Narrow enough that the map's credit takes two lines. */
const NARROWEST_PHONE = { width: 320, height: 640 };
const WIDE = { width: 1280, height: 900 };

/**
 * Let a surface finish fading in before axe or a colour is read: a half-faded element composites
 * its ink over the backdrop and reads as a contrast failure that is not there.
 */
async function settleAnimations(target: Locator): Promise<void> {
  await target.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

/** Every `/api/venues` request the page made, so a filter change can be shown to cost exactly one. */
function countVenueRequests(page: Page): () => number {
  let seen = 0;
  page.on('request', (request) => {
    if (/\/api\/venues(\?.*)?$/.test(request.url())) {
      seen += 1;
    }
  });
  return () => seen;
}

async function mockVenues(page: Page, delayMs = 0, list = VENUES): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  // Registered before the list route, so the more specific photo path wins where both could match.
  await page.route(/\/api\/venues\/\d+\/photos\/[0-9a-z]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/png' }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, async (route) => {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const beach = new URL(route.request().url()).searchParams.get('beach');
    await route.fulfill({ json: beach ? list.filter((v) => v.beach === beach) : list });
  });
}

/**
 * Three venues in the region Discover opens on, since the sheet shows one region and never the
 * whole coast: two pinned and far enough apart to stay separate pins, one with no location at all.
 * The unpinned one is the point of the third row — it stays in the list and draws no pin, so "one
 * pin per PINNED venue" is asserted against a list that actually contains a counter-example.
 */
const SHEET_VENUES = [
  {
    ...VENUES[0],
    beach: 'PALASE',
    region: 'HIMARE',
    location: { latitude: 40.175, longitude: 19.607 },
  },
  {
    ...VENUES[1],
    beach: 'BORSH',
    region: 'HIMARE',
    location: { latitude: 40.06, longitude: 19.86 },
  },
  { ...VENUES[2], beach: 'DHERMI', region: 'HIMARE' },
];

/** The sheet's own Near me, and the panel's from `lg` — the map's is off on both arms. */
function nearMe(page: Page, viewport: { width: number }): Locator {
  return page.getByTestId(viewport.width >= 1024 ? 'desk-near-me' : 'sheet-near-me');
}

/** The row a venue wears on the arm this viewport renders: a card in the sheet, a row in the panel. */
function rows(page: Page, viewport: { width: number }): Locator {
  return page.getByTestId(viewport.width >= 1024 ? 'venue-row' : 'venue-card');
}

/** The one row the page has lit: the riviera map's preview, on either arm. */
function litRow(page: Page): Locator {
  return page.locator('[data-testid="venue-row"][aria-current="true"]');
}

async function openDiscover(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(rows(page, viewport).first()).toBeVisible();
  await settle(page);
}

/**
 * The live map replaces the poster the moment the camera has to move, so a test that needs the
 * engine's own DOM asks for it by starting a drag on the ground rather than waiting for a swap
 * that the poster's whole point is to avoid.
 */
async function wakeGround(page: Page): Promise<void> {
  const ground = (await page.getByTestId('sheet-ground').boundingBox())!;
  const x = ground.x + ground.width / 2;
  const y = ground.y + ground.height * 0.26;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // A real movement, not just a press: what swaps the poster out is the camera having to move.
  await page.mouse.move(x - 40, y - 30, { steps: 5 });
  await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
  await page.mouse.up();
  await settle(page);
}

test.describe('Discover map — the sheet, fake engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page, 0, SHEET_VENUES);
  });

  test('map chrome is labelled, skippable and axe-clean under the sheet', async ({ page }) => {
    await openDiscover(page, PHONE);
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    // The poster carries the credit until the map component stands, which brings the same pill.
    await expect(page.getByTestId('map-attribution')).toHaveText(
      '© OpenMapTiles © OpenStreetMap contributors',
    );
    await wakeGround(page);

    // The skip control is the region's first stop: invisible until focused, then a real button.
    const skip = page.getByTestId('map-skip');
    await skip.focus();
    await expect(skip).toBeVisible();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('map-end')).toBeFocused();

    await expectTouchTargets(page, 'Discover under the sheet');
    await expectNoSeriousAxeViolations(page, 'Discover under the sheet');
  });

  test('keeps the credit inset inside the map on the narrowest phone, where it wraps', async ({
    page,
  }) => {
    await openDiscover(page, NARROWEST_PHONE);

    const map = (await page.getByTestId('sheet-ground').boundingBox())!;
    const credit = (await page.getByTestId('map-attribution').boundingBox())!;
    // The pill's own 12 px (right-3) inset, kept on both sides once the credit outgrows one line.
    expect(credit.x - map.x).toBeGreaterThanOrEqual(12);
    expect(map.x + map.width - (credit.x + credit.width)).toBeGreaterThanOrEqual(12);
  });

  test('centres on a granted position and marks the spot', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(VISITOR);
    await openDiscover(page, WIDE);

    await nearMe(page, WIDE).click();

    // The fake engine lays its markers out across the map's own fence, so a real box means a real centre.
    await expect(page.getByTestId('here-dot')).toBeVisible();
    await expect(page.getByTestId('head-note')).toHaveCount(0);
  });

  test('reports a declined permission and leaves the map where it was', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await openDiscover(page, WIDE);

    await nearMe(page, WIDE).click();

    // The answer lives in the head's rail slot, off the map, in the map's own words.
    await expect(page.getByTestId('head-note')).toHaveText(
      'Location permission was declined. The map hasn’t moved.',
    );
    await expect(page.getByTestId('here-dot')).toHaveCount(0);
    await expect(nearMe(page, WIDE)).not.toHaveAttribute('aria-disabled', 'true');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'Discover with a declined near-me');
  });

  test('the near-me answer is dismissible and stays gone until pressed again', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await openDiscover(page, WIDE);

    await nearMe(page, WIDE).click();
    await expect(page.getByTestId('head-note')).toBeVisible();

    await page.getByTestId('head-note-dismiss').click();

    await expect(page.getByTestId('head-note')).toHaveCount(0);
    await expect(page.getByTestId('here-dot')).toHaveCount(0);

    await nearMe(page, WIDE).click();
    await expect(page.getByTestId('head-note')).toBeVisible();
  });

  test('draws a pin per pinned venue, priced on its face, and none for the venue without a location', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);

    await expect(rows(page, WIDE)).toHaveCount(3);
    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(2);
    // The from-price the row shows, read straight off the pin — and off its name.
    await expect(pins.nth(0)).toHaveText('€25');
    await expect(pins.nth(0)).toHaveAttribute('aria-label', 'Miramar Beach Club, from €25');
    await expect(pins.nth(1)).toHaveText('€30');
    await expect(pins.nth(1)).toHaveAttribute('aria-label', 'Aurora Bay, from €30');

    // A pill, not a disc: it widened for the price and kept the 44 px floor on both axes.
    const box = (await pins.nth(0).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(box.height);
  });

  test('a pin lights its row, which leads to the beach map with the date carried', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);
    const row = rows(page, WIDE).filter({ hasText: 'Miramar Beach Club' });
    const date = new URL((await row.getAttribute('href'))!, page.url()).searchParams.get('date')!;

    await page.getByTestId('map-venue-pin').first().click();

    // The ROW is the preview, on both surfaces: it lights and comes into view, and no card opens.
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(row).toContainText('Miramar Beach Club');
    await expect(row).toHaveAttribute('aria-label', /Palasë · Himarë/);
    await expect(page.getByTestId('venue-preview')).toHaveCount(0);

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/venues/1\\?date=${date}$`));
  });

  test('lights one row at a time, and lets go on Escape with focus back on the pin', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);
    const pins = page.getByTestId('map-venue-pin');
    const all = rows(page, WIDE);

    await pins.nth(0).click();
    await pins.nth(1).press('Enter');

    await expect(all.filter({ hasText: 'Aurora Bay' })).toHaveAttribute('aria-current', 'true');
    await expect(all).toHaveCount(3);
    await expect(all.filter({ has: page.locator('[aria-current="true"]') })).toHaveCount(0);
    await expect(pins.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(pins.nth(0)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Escape');

    await expect(all.filter({ hasText: 'Aurora Bay' })).not.toHaveAttribute('aria-current', 'true');
    await expect(pins.nth(1)).toBeFocused();
  });

  test('marks the selected venue’s row in the list beside the map', async ({ page }) => {
    await openDiscover(page, WIDE);

    await page.getByTestId('map-venue-pin').nth(1).click();

    const all = rows(page, WIDE);
    await expect(all.filter({ hasText: 'Aurora Bay' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-testid="venue-row"][aria-current="true"]')).toHaveCount(1);
  });

  test('narrows to a beach from the head, and the map follows without a further request', async ({
    page,
  }) => {
    const venueRequests = countVenueRequests(page);
    await openDiscover(page, WIDE);
    await expect(page.getByTestId('map-venue-pin')).toHaveCount(2);

    await page.getByTestId('map-venue-pin').first().click();
    const before = venueRequests();

    await page.getByTestId('head-beaches').click();
    await page.locator('[role="group"][aria-label="Beach"] button', { hasText: 'Borsh' }).click();

    await expect(rows(page, WIDE)).toHaveCount(1);
    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(1);
    await expect(pins.first()).toHaveAttribute('aria-label', 'Aurora Bay, from €30');
    // One whole-coast response, narrowed inside: no request, where the old select cost exactly one.
    expect(venueRequests()).toBe(before);
  });

  test('venue pins keep their double-tap on a map whose own gesture is double-tap-to-zoom', async ({
    page,
  }) => {
    await openDiscover(page, PHONE);
    await wakeGround(page);

    await expectTouchManipulation(page, '[data-testid="map-venue-pin"]', 'the venue pins');
  });

  test('pins and a lit row stay accessible, and leave the tile credit visible', async ({
    page,
  }) => {
    await openDiscover(page, PHONE);

    await page.getByTestId('map-venue-pin').first().click();
    await expect(
      page.getByTestId('venue-card').filter({ hasText: 'Miramar Beach Club' }),
    ).toHaveAttribute('aria-current', 'true');
    await settle(page);

    // The sheet rose to half to show the lit row; the credit on the map's foot is still readable.
    await expect(page.getByTestId('map-attribution')).toBeVisible();
    await expectTouchTargets(page, 'Discover with a lit row');
    await expectNoSeriousAxeViolations(page, 'Discover with a lit row');
  });
});

/** Two boxes that share no pixel — what separated pins have to be, whatever their widths. */
function disjoint(
  a: { x: number; y: number; width: number; height: number },
  b: typeof a,
): boolean {
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  );
}

/**
 * The crowds, gathered into the one region the sheet opens on: a Qeparo pair that separates once
 * the camera is on it, and a Dhërmi trio ~20 m apart that never separates inside the map's own
 * fence. Same two behaviours as the retired whole-coast fixture, moved into one region.
 */
const CROWDED_REGION = [
  CROWDED_VENUES[1],
  CROWDED_VENUES[4],
  CROWDED_VENUES[5],
  {
    ...CROWDED_VENUES[0],
    beach: 'QEPARO',
    region: 'HIMARE',
    location: { latitude: 40.06, longitude: 19.81 },
  },
  {
    ...CROWDED_VENUES[3],
    beach: 'QEPARO',
    region: 'HIMARE',
    location: { latitude: 40.0648, longitude: 19.8162 },
  },
];

/**
 * Crowded pins: venues whose pins bury each other at the current camera become one place
 * pill, and every venue stays reachable — by pointer through the pill, by keyboard through its own
 * button. The fake engine projects Web Mercator around its camera, so the fit is real here.
 */
test.describe('Discover map — crowded pins, fake engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page, 0, CROWDED_REGION);
  });

  test('groups pins that bury each other into a place pill naming the beach, its lowest price and count', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);

    const pills = page.getByTestId('map-place-pill');
    await expect(pills).toHaveCount(2);
    await expect(pills.nth(0)).toHaveText('Dhërmi from €24 3');
    await expect(pills.nth(0)).toHaveAttribute(
      'aria-label',
      '3 venues at Dhërmi, from €24; press to zoom to them',
    );
    await expect(pills.nth(1)).toHaveText('Qeparo from €21 2');
    // Nothing is left drawn on its own: both places are crowds at this camera.
    await expect(page.getByTestId('map-venue-pin')).toHaveCount(0);
    // Only the trio, which no zoom separates, keeps a button per buried venue for the keyboard.
    await expect(page.getByTestId('map-crowd-member')).toHaveCount(3);

    await expectTouchTargets(page, 'Discover with crowded pins');
    await expectNoSeriousAxeViolations(page, 'Discover with crowded pins');
  });

  test('press a place to go there: the pins separate and the head is the way back', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);

    await page.getByTestId('map-place-pill').filter({ hasText: 'Qeparo' }).click();

    // The narrowing is the head's beach and client-side; no crumb is drawn on the riviera map.
    await expect(page.getByTestId('head-beaches')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('venue-row')).toHaveCount(2);
    await settle(page);

    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(2);
    await expect(page.getByTestId('map-place-pill')).toHaveCount(0);
    const boxes = await pins.evaluateAll((all: Element[]) =>
      all.map((pin) => {
        const { x, y, width, height } = pin.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(disjoint(boxes[0], boxes[1]), 'the pair separates once the camera is on it').toBe(true);

    // The beaches chip is the way back: All restores the region, and both crowds with it.
    await page.getByTestId('head-beaches').click();
    await page.locator('[role="group"][aria-label="Beach"] button', { hasText: 'All' }).click();
    await expect(page.getByTestId('map-place-pill')).toHaveCount(2);
  });

  test('where nowhere is closer, press through the venues: the pill inverts, then walks the rows', async ({
    page,
  }) => {
    await openDiscover(page, WIDE);

    // One press takes the camera to the beach and narrows the head to it.
    await page.getByTestId('map-place-pill').filter({ hasText: 'Dhërmi' }).click();
    await expect(page.getByTestId('head-beaches')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('venue-row')).toHaveCount(3);

    // The next press is the map saying it can go no closer: the pill inverts and offers the venues.
    const open = page.getByTestId('map-place-pill');
    await open.click();
    await expect(open).toHaveAttribute('data-here', '');
    await expect(open).toHaveText('Dhërmi See each venue 3');
    await expect(open).toHaveAttribute(
      'aria-label',
      '3 venues at Dhërmi, from €24; press to open Aurora Bay',
    );
    await settleAnimations(open);
    await expectNoSeriousAxeViolations(page, 'Discover with an inverted place pill');

    // The next press opens the first venue — and the ROW is the preview, so no card opens.
    await open.click();
    await expect(open).toHaveText('Aurora Bay from €30 1/3');
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    await expect(open).toHaveAttribute(
      'aria-label',
      'Aurora Bay, 1 of 3 venues at Dhërmi; press again for Folie Marine',
    );
    await expect(litRow(page)).toContainText('Aurora Bay');
    await expect(page.getByTestId('venue-preview')).toHaveCount(0);

    // Press again: the next venue at the spot, and the map never left the screen.
    await open.click();
    await expect(open).toHaveText('Folie Marine from €39 2/3');
    await expect(litRow(page)).toContainText('Folie Marine');
    await settle(page);
    await expectTouchTargets(page, 'Discover pressed through a crowd');
    await expectNoSeriousAxeViolations(page, 'Discover pressed through a crowd');
  });

  test('a keyboard still reaches every venue in a crowd, in feed order', async ({ page }) => {
    await openDiscover(page, WIDE);
    await page.getByTestId('map-place-pill').filter({ hasText: 'Dhërmi' }).focus();

    await page.keyboard.press('Tab');
    const member = page.locator(':focus');
    await expect(member).toHaveAttribute('data-testid', 'map-crowd-member');
    // Invisible but reachable, and at the touch floor: a crowd member is a real button.
    const box = (await member.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Enter');
    await expect(litRow(page)).toHaveCount(1);
  });
});

test.describe('Discover map — real engine', () => {
  test.beforeEach(async ({ page }) => {
    await mockMapResources(page);
  });

  test('the map fills its panel under the engine’s own stylesheet', async ({ page }) => {
    await mockVenues(page, 0, SHEET_VENUES);
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.locator('app-riviera-map')).toHaveAttribute('data-status', 'ready', {
      timeout: 20_000,
    });

    const heights = await page.getByTestId('riviera-map-canvas').evaluate((container) => ({
      host: container.closest('app-riviera-map')!.clientHeight,
      container: container.clientHeight,
      canvas: container.querySelector('canvas')!.clientHeight,
    }));
    expect(heights.host).toBeGreaterThan(0);
    expect(heights).toEqual({ host: heights.host, container: heights.host, canvas: heights.host });
  });

  test('the list renders and works before the map asks for anything', async ({ page }) => {
    await mockVenues(page, 1200, SHEET_VENUES);
    let venuesAnsweredAt: number | undefined;
    let firstMapRequestAt: number | undefined;
    page.on('response', (response) => {
      if (/\/api\/venues(\?.*)?$/.test(response.url())) {
        venuesAnsweredAt ??= Date.now();
      }
    });
    page.on('request', (request) => {
      if (request.url().includes('/map/')) {
        firstMapRequestAt ??= Date.now();
      }
    });

    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('venue-row')).toHaveCount(3);
    expect(venuesAnsweredAt).toBeDefined();
    expect(firstMapRequestAt === undefined || firstMapRequestAt >= venuesAnsweredAt!).toBe(true);

    await expect(page.locator('app-riviera-map')).toHaveAttribute('data-status', 'ready', {
      timeout: 20_000,
    });
    expect(firstMapRequestAt).toBeDefined();
    expect(firstMapRequestAt! >= venuesAnsweredAt!).toBe(true);
  });

  test('credits the tiles exactly as the committed style does', async ({ page }) => {
    await mockVenues(page, 0, SHEET_VENUES);
    const styleResponse = page.waitForResponse(
      (response) => response.url().endsWith('/map/style.json'),
      {
        timeout: 20_000,
      },
    );
    await page.setViewportSize(WIDE);
    await page.goto('/');

    // The style the engine actually loaded, not a copy read beside it.
    const style = (await (await styleResponse).json()) as {
      sources: Record<string, { attribution?: string }>;
    };
    const credits = Object.values(style.sources).map((source) => source.attribution ?? '');
    expect(credits).toHaveLength(1);
    await expect(page.getByTestId('map-attribution')).toHaveText(credits[0]);
  });

  test('the map open on Discover makes no request to a third party', async ({ page }) => {
    await mockVenues(page, 0, SHEET_VENUES);
    const offOrigin: string[] = [];
    const seen = { style: false, sprite: false, glyph: false, tile: false };
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!/^https?:$/.test(url.protocol)) {
        return;
      }
      if (!OUR_HOSTS.has(url.host)) {
        offOrigin.push(request.url());
      }
      const p = url.pathname;
      seen.style ||= p.endsWith('/map/style.json');
      seen.sprite ||= p.includes('/map/sprites/');
      seen.glyph ||= p.includes('/map/glyphs/');
      seen.tile ||= p.endsWith('/map/riviera.pmtiles');
    });

    await page.setViewportSize(WIDE);
    await page.goto('/');
    const map = page.locator('app-riviera-map');
    await expect(map).toHaveAttribute('data-status', 'ready', { timeout: 20_000 });

    // Exercise the engine the way a tourist would: zoom, then pan across the coast.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const canvas = page.getByTestId('riviera-map-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 80, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => Object.values(seen).every(Boolean), { timeout: 20_000 }).toBe(true);

    // Then a lit row, whose cover photo is the one image here; by keyboard, per the credit pill.
    await page.getByTestId('map-venue-pin').first().press('Enter');
    const lit = page.locator('[data-testid="venue-row"][aria-current="true"]');
    await expect(lit).toHaveCount(1);
    await settle(page);
    await page.waitForLoadState('networkidle');

    expect(offOrigin, 'every map resource must come from our origin (ADR-0022)').toEqual([]);
    await expectNoSeriousAxeViolations(page, 'Discover with the real map rendered');
  });

  /**
   * The same-origin guard above, extended past the map's own resources to the one thing on this
   * page that is personal: where the visitor is. A granted near-me must reach the camera and nothing else — not
   * a URL, not a header, not a body, not a stored value, not a console line. The position's digits
   * are unround on purpose, so a match is a leak rather than a coincidence.
   */
  test('a granted near-me sends the position nowhere', async ({ page, context }) => {
    await mockVenues(page, 0, SHEET_VENUES);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(VISITOR);

    const offOrigin: string[] = [];
    const carrying: string[] = [];
    const digits = [
      String(VISITOR.latitude),
      String(VISITOR.longitude),
      VISITOR.latitude.toFixed(4),
      VISITOR.longitude.toFixed(4),
    ];
    const leaks = (text: string): boolean => digits.some((digit) => text.includes(digit));

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!/^https?:$/.test(url.protocol)) {
        return;
      }
      if (!OUR_HOSTS.has(url.host)) {
        offOrigin.push(request.url());
      }
      const headers = Object.entries(request.headers())
        .map(([name, value]) => `${name}: ${value}`)
        .join('\n');
      const body = request.postData() ?? '';
      if (leaks(request.url()) || leaks(headers) || leaks(body)) {
        carrying.push(`${request.method()} ${request.url()}`);
      }
    });
    const console_: string[] = [];
    page.on('console', (message) => console_.push(message.text()));

    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.locator('app-riviera-map')).toHaveAttribute('data-status', 'ready', {
      timeout: 20_000,
    });

    await page.getByTestId('desk-near-me').click();
    await expect(page.getByTestId('here-dot')).toBeVisible();
    await expect(page.getByTestId('head-note')).toHaveCount(0);
    // Let the engine finish fetching whatever the new camera position needs.
    await page.waitForLoadState('networkidle');

    expect(carrying, 'the visitor’s position must not ride any request').toEqual([]);
    expect(offOrigin, 'every request must stay same-origin (ADR-0022)').toEqual([]);

    const stored = await page.evaluate(() => {
      const dump = (store: Storage): string =>
        Object.keys(store)
          .map((key) => `${key}=${store.getItem(key) ?? ''}`)
          .join('|');
      return `${dump(localStorage)}|${dump(sessionStorage)}`;
    });
    expect(leaks(stored), `nothing may store the position — found in: ${stored}`).toBe(false);
    expect(console_.filter(leaks), 'nothing may log the position').toEqual([]);
  });
});

/**
 * Six venues over two regions. Himarë's four northern ones are a CHAIN up the shore: each is clear
 * of the first by more than a pill's width but not of the pair's running mean, so they group into
 * one `Palasë & Dhërmi` pill under the mean rule and would have split under the old first-member
 * one. Borsh sits alone 20 km south-east, closed for the day — the dusk case beside a crowd whose
 * own closed member must not grey it.
 */
const MAP_VENUES = [
  mapVenue(21, 'Palasa Sands', 'PALASE', 'HIMARE', 40.18, 19.58, 2000, false),
  mapVenue(22, 'Palasa Pine', 'PALASE', 'HIMARE', 40.178, 19.583, 2200),
  mapVenue(23, 'Aurora Bay', 'DHERMI', 'HIMARE', 40.176, 19.586, 3000),
  mapVenue(24, 'Folie Marine', 'DHERMI', 'HIMARE', 40.174, 19.589, 3900),
  mapVenue(25, 'Borsh Kilometre', 'BORSH', 'HIMARE', 40.06, 19.86, 1500, false),
  mapVenue(26, 'Miramar Beach Club', 'KSAMIL', 'SARANDE', 39.7712, 20.0021, 2500),
];

function mapVenue(
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
    ratingTenths: 46,
    reviewsCount: 143,
    bookingMode: 'REQUEST',
    amenities: ['BEACH_BAR', 'SNORKELLING'],
    fromPrice: { minorUnits, currency: 'EUR' },
    availability: { free: 11, total: 26 },
    salesOpen,
    location: { latitude, longitude },
  };
}

/** Every width the design record measured the pins at, phone through desktop. */
const PIN_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

/** A tourist on Dhërmi: the located arm that puts the dot among the pins. */
const ON_DHERMI = { latitude: 40.15, longitude: 19.64 };

/**
 * Every drawn pin face sitting on a piece of the page's map chrome, named so a failure says which.
 * Crowd members are left out on purpose: they are invisible discs at the crowd's own point, and
 * the pill drawn for them is what a tourist can actually see covered.
 */
const DRAWN_FACES = '[data-testid="map-place-pill"], [data-testid="map-venue-pin"]';
const MAP_CHROME =
  '[data-testid="sheet-near-me"], [data-testid="desk-near-me"], ' +
  '[data-testid="map-attribution"], [data-testid="map-zoom-in"], [data-testid="map-zoom-out"]';

async function chromeHits(
  page: Page,
  chrome = MAP_CHROME,
  faceSelector = DRAWN_FACES,
): Promise<string[]> {
  return page.evaluate(
    ({ faces, pieces }) => {
      const hits: string[] = [];
      for (const face of document.querySelectorAll(faces)) {
        const a = face.getBoundingClientRect();
        for (const piece of document.querySelectorAll(pieces)) {
          const b = piece.getBoundingClientRect();
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
            hits.push(
              `${face.textContent?.replace(/\s+/g, ' ').trim()} on ${piece.getAttribute('data-testid')}`,
            );
          }
        }
      }
      return hits;
    },
    { faces: faceSelector, pieces: chrome },
  );
}

async function openMap(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.locator(DRAWN_FACES).first()).toBeVisible();
  await settle(page);
}

/**
 * The riviera map's pins and the desktop panel from `lg`. The pin layer places its
 * pills from values the page measures — the chrome's boxes and the window the sheet leaves — so
 * what is proven here is the thing only a browser can answer: that after the fit and the placement
 * pass, nothing a tourist can see is covered, at every width the design record measured.
 */
test.describe('Discover map — the riviera map’s pins keep off the chrome', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page, 0, MAP_VENUES);
  });

  for (const viewport of PIN_VIEWPORTS) {
    test(`no pin face sits on the map chrome at ${viewport.width} × ${viewport.height}, placed or not`, async ({
      page,
      context,
    }) => {
      await openMap(page, viewport);
      expect(await chromeHits(page)).toEqual([]);

      await context.grantPermissions(['geolocation']);
      await context.setGeolocation(ON_DHERMI);
      await page.getByTestId(viewport.width >= 1024 ? 'desk-near-me' : 'sheet-near-me').click();
      await expect(page.getByTestId('here-dot')).toBeVisible();
      await settle(page);

      expect(await chromeHits(page)).toEqual([]);
    });
  }

  test('the tourist’s dot paints over the pins, for the case no pill can be moved off it', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(ON_DHERMI);
    await openMap(page, PIN_VIEWPORTS[0]);
    await page.getByTestId('sheet-near-me').click();
    await expect(page.getByTestId('here-dot')).toBeVisible();
    await settle(page);

    // A dot on a crowd's own point buries all nine spots, so the paint order is what always holds.
    const [dot, pins] = await Promise.all([
      page.getByTestId('here-dot').evaluate((el) => Number(getComputedStyle(el).zIndex)),
      page.locator('app-venue-pin-layer').evaluate((el) => Number(getComputedStyle(el).zIndex)),
    ]);
    expect(dot).toBeGreaterThan(pins);
  });

  test('a crowd keeps its colour while one member still sells, and a closed lone pin greys', async ({
    page,
  }) => {
    await openMap(page, PIN_VIEWPORTS[4]);

    // Palasa Sands has closed inside the crowd of four; Borsh has closed on its own.
    await expect(page.getByTestId('map-place-pill')).not.toHaveAttribute('data-dusk', '');
    await expect(page.getByTestId('map-venue-pin')).toHaveAttribute('data-dusk', '');
  });
});

/** The desktop panel's own geometry, which only a browser lays out. */
test.describe('Discover map — the desktop panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page, 0, MAP_VENUES);
  });

  async function box(locator: Locator): Promise<DOMRect> {
    return locator.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  }

  test('the desk frame takes no pointer events where it paints nothing', async ({ page }) => {
    await openMap(page, { width: 1280, height: 900 });

    // 6px in: inside the frame's own 12px padding, outside both children.
    const gutter = await page.getByTestId('desk-frame').evaluate((frame) => {
      const box = frame.getBoundingClientRect();
      return document
        .elementFromPoint(box.left + 6, box.top + 6)
        ?.closest('[data-testid]')
        ?.getAttribute('data-testid');
    });
    // Nothing marked sits behind the frame there, so the answer is exact, not merely not-frame.
    expect(gutter).toBeUndefined();

    // And a leaf the frame's children do paint stays reachable; the rows, this file's WIDE cases.
    expect(await hitTestId(page, 'desk-near-me')).toBe('desk-near-me');
  });

  for (const [width, panelPx, panePx] of [
    [1024, 420, 568],
    [1440, 540, 864],
    [1920, 540, 1344],
  ] as const) {
    test(`at ${width} the panel is ${panelPx} and the map takes the remaining ${panePx}`, async ({
      page,
    }) => {
      await openMap(page, { width, height: 900 });

      const panel = await box(page.getByTestId('desk-panel'));
      const map = await box(page.getByTestId('desk-map'));
      expect(Math.round(panel.width)).toBe(panelPx);
      expect(Math.round(map.width)).toBe(panePx);
      // 12 px off every edge, panel and map alike, with 12 px between them.
      expect(Math.round(panel.left)).toBe(12);
      expect(Math.round(map.left - panel.right)).toBe(12);
      expect(Math.round(width - map.right)).toBe(12);
      expect(Math.round(900 - map.bottom)).toBe(12);
      expect(Math.round(panel.top)).toBe(Math.round(map.top));
    });
  }

  test('the panel opens on its head with the first row where the phone’s sheet puts it', async ({
    page,
  }) => {
    await openMap(page, { width: 1440, height: 900 });

    // 73 header + 12 gutter + 1 panel border + 78 head + 27 running head and its rule.
    const first = await box(page.getByTestId('venue-row').first());
    expect(Math.round(first.top)).toBe(191);
    expect(Math.round(first.height)).toBe(92);
  });

  test('the map’s corners match the panel’s at 22 px, on all four', async ({ page }) => {
    await openMap(page, { width: 1440, height: 900 });

    for (const testId of ['desk-panel', 'desk-map']) {
      const radii = await page
        .getByTestId(testId)
        .evaluate((el) => [
          getComputedStyle(el).borderTopLeftRadius,
          getComputedStyle(el).borderTopRightRadius,
          getComputedStyle(el).borderBottomRightRadius,
          getComputedStyle(el).borderBottomLeftRadius,
        ]);
      expect(radii).toEqual(['22px', '22px', '22px', '22px']);
    }
  });

  test('the selected row expands, and no other row moves or leaves the panel', async ({ page }) => {
    await openMap(page, { width: 1440, height: 900 });
    const rows = page.getByTestId('venue-row');
    /** Whole rows inside the panel's own scroller, which is what "visible" means here. */
    const visible = async (): Promise<number> =>
      page.getByTestId('desk-rows').evaluate((list) => {
        const box = list.getBoundingClientRect();
        return [...list.querySelectorAll('[data-testid="venue-row"]')].filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top >= box.top && rect.bottom <= box.bottom;
        }).length;
      });
    const heights = async (): Promise<number[]> =>
      rows.evaluateAll((all) => all.map((row) => Math.round(row.getBoundingClientRect().height)));

    const before = await heights();
    const seen = await visible();
    expect(new Set(before)).toEqual(new Set([92]));

    await page.getByTestId('map-venue-pin').click();
    await expect(rows.filter({ hasText: 'Borsh' })).toHaveAttribute('aria-current', 'true');
    await settle(page);

    // 29, not the record's 26: the shipped amenity chip is 26 px tall where the prototype's was 23.
    const after = await heights();
    expect(after.filter((height) => height !== 92)).toEqual([121]);
    expect(await visible()).toBe(seen);
  });

  test('a row under the pointer lights its venue’s face, and lets go when the pointer leaves', async ({
    page,
  }) => {
    await openMap(page, { width: 1440, height: 900 });
    // The crowd's pill, not the lone Borsh pin: dusk already paints that one the hover fill.
    const pill = page.getByTestId('map-place-pill');
    const fill = async (): Promise<string> =>
      pill.evaluate((face) => getComputedStyle(face).backgroundColor);
    const resting = await fill();

    await page.getByTestId('venue-row').filter({ hasText: 'Aurora Bay' }).hover();
    await expect(pill).toHaveAttribute('data-hover', '');
    // The fill is a 0.15s transition, so poll it rather than catching it mid-flight.
    await expect.poll(fill).not.toBe(resting);

    // Off the list, not onto the map: a hover inside its 22 px corner can hit the pane instead.
    await page.mouse.move(0, 0);
    await expect(pill).not.toHaveAttribute('data-hover', '');
    await expect.poll(fill).toBe(resting);
  });

  test('the shore’s chain groups into one pill, which the first-member rule would have split', async ({
    page,
  }) => {
    await openMap(page, { width: 1024, height: 768 });

    // Four venues up the shore, each clear of the first but not of the crowd's running mean.
    const pills = page.getByTestId('map-place-pill');
    await expect(pills).toHaveCount(1);
    await expect(pills).toContainText('Palasë & Dhërmi');
    await expect(page.getByTestId('map-venue-pin')).toHaveCount(1);
  });

  test('the coast picker opens as a popover under the place button, with its ribbon', async ({
    page,
  }) => {
    await openMap(page, { width: 1440, height: 900 });
    await page.getByTestId('head-place').click();

    const panel = page.getByTestId('coast-picker');
    await expect(panel).toBeVisible();
    await settleAnimations(panel);
    const anchor = await box(page.getByTestId('head-place'));
    const popover = await box(panel);
    expect(Math.round(popover.width)).toBe(420);
    expect(Math.round(popover.top - anchor.bottom)).toBe(8);
    expect(Math.round((await box(page.getByTestId('picker-ribbon'))).width)).toBe(150);
  });

  test('is axe clean with every control at the touch floor, listing and with the picker open', async ({
    page,
  }) => {
    await openMap(page, { width: 1440, height: 900 });
    await settleAnimations(page.getByTestId('desk-panel'));
    await expectNoSeriousAxeViolations(page);
    await expectTouchTargets(page, 'the desktop panel');

    await expectTouchManipulation(page, '[data-testid="desk-near-me"]', 'the panel’s Near me');

    await page.getByTestId('head-place').click();
    await expect(page.getByTestId('coast-picker')).toBeVisible();
    await settleAnimations(page.getByTestId('coast-picker'));
    await expectNoSeriousAxeViolations(page);
    await expectTouchTargets(page, 'the desktop panel with its coast picker');
  });
});
