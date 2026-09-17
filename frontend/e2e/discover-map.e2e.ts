import { expect, Locator, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
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

test.describe('Discover map — fake engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page);
  });

  test('map chrome is labelled, skippable and axe-clean; the switch alternates the panels on a phone', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    await expect(page.getByTestId('view-list')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('map-panel')).toBeHidden();

    await page.getByTestId('view-map').click();
    await expect(page.getByTestId('view-map')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await expect(page.getByTestId('venue-card').first()).toBeHidden();
    await expect(page.getByTestId('map-attribution')).toHaveText(
      '© OpenMapTiles © OpenStreetMap contributors',
    );
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();

    // The skip control is the region's first stop: invisible until focused, then a real button.
    const skip = page.getByTestId('map-skip');
    await skip.focus();
    await expect(skip).toBeVisible();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('map-end')).toBeFocused();

    await expectTouchTargets(page, 'Discover with the map open');
    await expectNoSeriousAxeViolations(page, 'Discover with the map open');

    await page.getByTestId('view-list').click();
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    await expect(page.getByTestId('map-panel')).toBeHidden();
  });

  test('keeps the credit inset inside the map on the narrowest phone, where it wraps', async ({
    page,
  }) => {
    await page.setViewportSize(NARROWEST_PHONE);
    await page.goto('/');
    await page.getByTestId('view-map').click();
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    const map = (await page.locator('app-riviera-map').boundingBox())!;
    const credit = (await page.getByTestId('map-attribution').boundingBox())!;
    // The pill's own 12 px (right-3) inset, kept on both sides once the credit outgrows one line.
    expect(credit.x - map.x).toBeGreaterThanOrEqual(12);
    expect(map.x + map.width - (credit.x + credit.width)).toBeGreaterThanOrEqual(12);
    expect(map.y + map.height - (credit.y + credit.height)).toBeGreaterThanOrEqual(12);
  });

  test('centres on a granted position and marks the spot', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(VISITOR);
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByRole('button', { name: 'Near me' }).click();

    // The fake engine lays its markers out across the map's own fence, so a real box means a real centre.
    const here = page.getByTestId('map-here');
    await expect(here).toBeVisible();
    await expect(here).toHaveAttribute('aria-label', 'You are here');
    await expect(page.getByTestId('map-near-me-message')).toHaveCount(0);
  });

  test('reports a declined permission and leaves the map where it was', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByRole('button', { name: 'Near me' }).click();

    await expect(page.getByTestId('map-near-me-message')).toHaveText(
      'Location permission was declined. The map hasn\u2019t moved.',
    );
    await expect(page.getByTestId('map-here')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Near me' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expectNoSeriousAxeViolations(page, 'Discover with a declined near-me');
  });

  test('the near-me message is dismissible and stays gone until pressed again', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.getByTestId('map-near-me-message')).toBeVisible();

    await page.getByTestId('map-near-me-dismiss').click();

    await expect(page.getByTestId('map-near-me-message')).toHaveCount(0);
    await expect(page.getByTestId('map-here')).toHaveCount(0);
    // The teardown takes the dismiss button itself, which just held focus (WCAG 2.4.3).
    await expect(page.getByRole('button', { name: 'Near me' })).toBeFocused();

    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.getByTestId('map-near-me-message')).toBeVisible();
  });

  test('draws a pin per pinned venue, priced on its face, and none for the venue without a location', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(2);
    // The from-price the list card shows, read straight off the pin — and off its name.
    await expect(pins.nth(0)).toHaveText('€25');
    await expect(pins.nth(0)).toHaveAttribute('aria-label', 'Miramar Beach Club, from €25');
    await expect(pins.nth(1)).toHaveText('€30');
    await expect(pins.nth(1)).toHaveAttribute('aria-label', 'Aurora Bay, from €30');

    // A pill, not a disc: it widened for the price and kept the 44 px floor on both axes.
    const box = (await pins.nth(0).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(box.height);
  });

  test('a pin opens its preview, which leads to the beach map with the date carried', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    const date = await page.getByTestId('filter-date').inputValue();

    await page.getByTestId('map-venue-pin').first().click();

    const preview = page.getByTestId('venue-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId('preview-name')).toHaveText('Miramar Beach Club');
    await expect(preview.getByTestId('preview-location')).toHaveText('Ksamil · Sarandë');
    await expect(preview.getByTestId('preview-rating')).toContainText('4.8');
    await expect(preview.getByTestId('preview-price')).toContainText('€25');
    // The cover really renders: a broken <img> would report zero natural width.
    await expect
      .poll(() =>
        preview
          .getByTestId('preview-photo-img')
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    await preview.getByTestId('preview-link').click();
    await expect(page).toHaveURL(new RegExp(`/venues/1\\?date=${date}$`));
  });

  test('shows one preview at a time, and closes it on Escape with focus back on the pin', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    const pins = page.getByTestId('map-venue-pin');

    await pins.nth(0).click();
    // The open card covers the lower map, as any bottom sheet does; Tab still reaches the pin.
    await pins.nth(1).press('Enter');

    await expect(page.getByTestId('venue-preview')).toHaveCount(1);
    await expect(page.getByTestId('preview-name')).toHaveText('Aurora Bay');
    await expect(pins.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(pins.nth(0)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('venue-preview')).toHaveCount(0);
    await expect(pins.nth(1)).toBeFocused();
  });

  test('closes the preview when the map itself is tapped', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByTestId('map-venue-pin').first().click();
    await expect(page.getByTestId('venue-preview')).toBeVisible();

    await page.getByTestId('riviera-map-fake').click({ position: { x: 8, y: 8 } });

    await expect(page.getByTestId('venue-preview')).toHaveCount(0);
  });

  test('marks the selected venue’s card in the list beside the map', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByTestId('map-venue-pin').nth(1).click();

    const cards = page.getByTestId('venue-card');
    await expect(cards.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(cards.nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(cards.nth(2)).not.toHaveAttribute('aria-current', 'true');
  });

  test('re-feeds the pins from one further request when a filter changes, and drops the preview', async ({
    page,
  }) => {
    const venueRequests = countVenueRequests(page);
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await expect(page.getByTestId('map-venue-pin')).toHaveCount(2);

    await page.getByTestId('map-venue-pin').first().click();
    await expect(page.getByTestId('venue-preview')).toBeVisible();
    const before = venueRequests();

    await page.getByTestId('filter-beach').selectOption('Dhërmi');

    await expect(page.getByTestId('venue-card')).toHaveCount(1);
    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(1);
    await expect(pins.first()).toHaveAttribute('aria-label', 'Aurora Bay, from €30');
    await expect(page.getByTestId('venue-preview')).toHaveCount(0);
    // The map asks for nothing of its own: one list request answered both surfaces.
    expect(venueRequests() - before).toBe(1);
  });

  test('venue pins keep their double-tap on a map whose own gesture is double-tap-to-zoom', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await page.getByTestId('view-map').click();
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await expectTouchManipulation(page, '[data-testid="map-venue-pin"]', 'the venue pins');
  });

  test('pins and an open preview stay accessible, and leave the tile credit visible', async ({
    page,
  }) => {
    await page.setViewportSize(NARROWEST_PHONE);
    await page.goto('/');
    await page.getByTestId('view-map').click();
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    // Here this pin sits under the opaque credit pill: panning frees a tap, Tab works regardless.
    await page.getByTestId('map-venue-pin').first().press('Enter');
    const preview = page.getByTestId('venue-preview');
    await expect(preview).toBeVisible();
    await settleAnimations(preview);

    // The tiles' licences need the credit legible, so the card clears it even where it wraps.
    const credit = (await page.getByTestId('map-attribution').boundingBox())!;
    const card = (await preview.boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(credit.y);

    await expectTouchTargets(page, 'Discover with a pin preview open');
    await expectNoSeriousAxeViolations(page, 'Discover with a pin preview open');
  });

  test('shows the list and the map side by side on a wide screen, with no switch', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await expect(page.getByTestId('view-switch')).toBeHidden();

    const [list, map] = await Promise.all([
      page.getByTestId('list-panel').boundingBox(),
      page.getByTestId('map-panel').boundingBox(),
    ]);
    expect(list && map && map.x > list.x + list.width - 1).toBe(true);
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
 * Crowded pins: venues whose pins bury each other at the current camera become one place
 * pill, and every venue stays reachable — by pointer through the pill, by keyboard through its own
 * button. The fake engine projects Web Mercator around its camera, so the fit is real here.
 */
test.describe('Discover map — crowded pins, fake engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await mockVenues(page, 0, CROWDED_VENUES);
  });

  test('groups pins that bury each other into a place pill naming the beach, its lowest price and count', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await expect(page.getByTestId('venue-card')).toHaveCount(6);

    const pills = page.getByTestId('map-place-pill');
    await expect(pills).toHaveCount(2);
    await expect(pills.nth(0)).toHaveText('Ksamil from €21 2');
    await expect(pills.nth(0)).toHaveAttribute(
      'aria-label',
      '2 venues at Ksamil, from €21; press to zoom to them',
    );
    await expect(pills.nth(1)).toHaveText('Dhërmi from €24 3');
    // No venue is lost: the crowds' other members are real buttons, one per venue, in feed order.
    await expect(page.getByTestId('map-venue-pin')).toHaveCount(0);
    await expect(page.getByTestId('map-crowd-member')).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'Lori Beach, 2 of 2 venues at Ksamil' }),
    ).toHaveCount(1);

    await expectTouchTargets(page, 'Discover with place pills');
    await expectNoSeriousAxeViolations(page, 'Discover with place pills');
    // Pressed again and again to walk a crowd: the pill keeps its double-tap, like a lone pin.
    await expectTouchManipulation(page, '[data-testid="map-place-pill"]', 'the place pills');
  });

  test('press a place to go there: the pins separate, the Beach filter follows, the crumb is the way back', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    const ksamil = page.getByTestId('map-place-pill').filter({ hasText: 'Ksamil' });

    await ksamil.click();

    await expect(page.getByTestId('filter-beach')).toHaveValue('KSAMIL');
    await expect(page.getByTestId('venue-card')).toHaveCount(2);
    const crumb = page.getByTestId('map-beach-crumb');
    await expect(crumb).toHaveText('Ksamil ×');
    await expect(crumb).toHaveAttribute(
      'aria-label',
      'Showing Ksamil only; press to show all beaches',
    );
    // Where the members separate they are production's own priced pins, prices side by side.
    const pins = page.getByTestId('map-venue-pin');
    await expect(pins).toHaveCount(2);
    await expect(pins.nth(0)).toHaveAttribute('aria-label', 'Miramar Beach Club, from €25');
    await expect(pins.nth(1)).toHaveAttribute('aria-label', 'Lori Beach, from €21');
    const [a, b] = await Promise.all([pins.nth(0).boundingBox(), pins.nth(1).boundingBox()]);
    expect(disjoint(a!, b!)).toBe(true);
    // The pressed pill became the first pin's button and never left the page: focus is still on it.
    await expect(pins.nth(0)).toBeFocused();
    await expectTouchTargets(page, 'Discover narrowed to a beach from the map');

    await crumb.click();

    await expect(page.getByTestId('filter-beach')).toHaveValue('');
    await expect(page.getByTestId('venue-card')).toHaveCount(6);
    await expect(crumb).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Near me' })).toBeFocused();
  });

  test('where nowhere is closer, press through the venues: the pill inverts, then walks the previews', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    const pill = page.getByTestId('map-place-pill').filter({ hasText: 'Dhërmi' });

    // One press: the camera goes as far in as the map allows, and that still does not separate them.
    await pill.click();
    await expect(pill).toHaveAttribute('data-here', '');
    await expect(pill).toHaveText('Dhërmi See each venue 3');
    await expect(pill).toHaveAttribute(
      'aria-label',
      '3 venues at Dhërmi, from €24; press to open Aurora Bay',
    );
    await expect(page.getByTestId('filter-beach')).toHaveValue('DHERMI');
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    await settleAnimations(pill);
    await expectNoSeriousAxeViolations(page, 'Discover with an inverted place pill');

    // The next press opens the first venue; the pill becomes that venue's.
    await pill.click();
    const preview = page.getByTestId('venue-preview');
    await expect(preview.getByTestId('preview-name')).toHaveText('Aurora Bay');
    await expect(preview).toBeFocused();
    const open = page.getByTestId('map-place-pill');
    await expect(open).toHaveText('Aurora Bay from €30 1/3');
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    await expect(open).toHaveAttribute(
      'aria-label',
      'Aurora Bay, 1 of 3 venues at Dhërmi; press again for Folie Marine',
    );

    // Press again: the next venue at the spot, and the map never left the screen.
    await open.click();
    await expect(preview.getByTestId('preview-name')).toHaveText('Folie Marine');
    await expect(open).toHaveText('Folie Marine from €39 2/3');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await settleAnimations(preview);
    await expectTouchTargets(page, 'Discover pressed through a crowd');
    await expectNoSeriousAxeViolations(page, 'Discover pressed through a crowd');

    // The card's own stepper walks the same crowd: the pressed chevron keeps focus, the pill follows.
    const stepper = preview.getByRole('group', { name: '3 venues at Dhërmi' });
    await expect(stepper).toBeVisible();
    const next = preview.getByRole('button', { name: 'Next venue at Dhërmi' });
    const prev = preview.getByRole('button', { name: 'Previous venue at Dhërmi' });
    const position = preview.getByTestId('preview-stack-position');
    await expect(position).toHaveText('2 of 3 here, Folie Marine');
    await expect(preview.getByTestId('preview-availability')).toHaveText('2 of 34 free');
    // Pressed again and again to walk the crowd: the chevrons keep their double-tap, like the pill.
    await expectTouchManipulation(
      page,
      '[data-testid="preview-stack-prev"], [data-testid="preview-stack-next"]',
      "the stepper's chevrons",
    );

    await next.click();
    await expect(preview.getByTestId('preview-name')).toHaveText('Dhërmi Sun Club');
    await expect(open).toHaveText('Dhërmi Sun Club from €24 3/3');
    await expect(position).toHaveText('3 of 3 here, Dhërmi Sun Club');
    await expect(preview.getByTestId('preview-availability')).toHaveText('19 of 22 free');
    await expect(next).toBeFocused();

    // Wrapping at both ends, as the pill does.
    await next.click();
    await expect(preview.getByTestId('preview-name')).toHaveText('Aurora Bay');
    await expect(position).toHaveText('1 of 3 here, Aurora Bay');
    await prev.click();
    await expect(preview.getByTestId('preview-name')).toHaveText('Dhërmi Sun Club');
    await expect(open).toHaveText('Dhërmi Sun Club from €24 3/3');

    await page.keyboard.press('Escape');

    // Focus goes back to the venue's own button; with nothing open the pill is the first venue's again.
    await expect(preview).toHaveCount(0);
    const sunClub = page.getByRole('button', { name: 'Dhërmi Sun Club, 3 of 3 venues at Dhërmi' });
    await expect(sunClub).toBeFocused();
    await expect(sunClub).toHaveCSS('opacity', '1');
    await expect(open).toHaveText('Dhërmi See each venue 3');
  });

  test('a keyboard still reaches every venue in a crowd, in feed order', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();

    await page.getByTestId('map-place-pill').filter({ hasText: 'Ksamil' }).focus();
    await page.keyboard.press('Tab');

    const lori = page.getByRole('button', { name: 'Lori Beach, 2 of 2 venues at Ksamil' });
    await expect(lori).toBeFocused();
    // Invisible until focused, then a disc naming its venue — and the 44 px box was there all along.
    await expect(lori).toHaveCSS('opacity', '1');
    const box = (await lori.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Enter');

    await expect(page.getByTestId('venue-preview').getByTestId('preview-name')).toHaveText(
      'Lori Beach',
    );
    await expect(lori).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(lori).toBeFocused();
  });
});

test.describe('Discover map — real engine', () => {
  test.beforeEach(async ({ page }) => {
    await mockMapResources(page);
  });

  test('the map fills its panel under the engine’s own stylesheet', async ({ page }) => {
    await mockVenues(page);
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
    await mockVenues(page, 1200);
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
    await expect(page.getByTestId('venue-card')).toHaveCount(3);
    expect(venuesAnsweredAt).toBeDefined();
    expect(firstMapRequestAt === undefined || firstMapRequestAt >= venuesAnsweredAt!).toBe(true);

    await expect(page.locator('app-riviera-map')).toHaveAttribute('data-status', 'ready', {
      timeout: 20_000,
    });
    expect(firstMapRequestAt).toBeDefined();
    expect(firstMapRequestAt! >= venuesAnsweredAt!).toBe(true);
  });

  test('credits the tiles exactly as the committed style does', async ({ page }) => {
    await mockVenues(page);
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
    await mockVenues(page);
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

    // Then a preview, whose cover photo is the one image here; by keyboard, per the credit pill.
    await page.getByTestId('map-venue-pin').first().press('Enter');
    const preview = page.getByTestId('venue-preview');
    await expect(preview).toBeVisible();
    await settleAnimations(preview);
    await expect
      .poll(() =>
        preview.getByTestId('preview-photo-img').evaluate((img: HTMLImageElement) => img.complete),
      )
      .toBe(true);
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
    await mockVenues(page);
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

    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.getByTestId('map-here')).toBeVisible();
    await expect(page.getByTestId('map-near-me-message')).toHaveCount(0);
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
