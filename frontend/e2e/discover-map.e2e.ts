import { expect, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { mockMapResources } from './support/map-resources';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The riviera map on Discover (ADR-0022). Two engines, on purpose: the fake (armed through
 * `window.__RIVIERA_FAKE_MAP__`) drives the switch, the chrome and the a11y checks
 * deterministically; the REAL MapLibre adapter, fed the committed style, sprites and glyphs from
 * `platform/map/` and a synthetic tile fixture, is what the two guards need — with the fake, no map
 * resource is ever requested and a pasted CDN URL would go unseen.
 */

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 18, total: 24 },
    salesOpen: true,
  },
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
  },
];

/**
 * The page's own origin plus the API origin the dev build points at — one origin in production
 * (Spring serves the SPA), two under `ng serve`. Anything else is a third party.
 */
const OUR_HOSTS = new Set(['localhost:4200', 'localhost:8080']);

const PHONE = { width: 390, height: 780 };
/** Narrow enough that the map's credit takes two lines. */
const NARROWEST_PHONE = { width: 320, height: 640 };
const WIDE = { width: 1280, height: 900 };

async function mockVenues(page: Page, delayMs = 0): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, async (route) => {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const beach = new URL(route.request().url()).searchParams.get('beach');
    await route.fulfill({ json: beach ? VENUES.filter((v) => v.beach === beach) : VENUES });
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
    await expect(page.getByTestId('venue-card')).toHaveCount(2);
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
    await expect(page.getByTestId('venue-card')).toHaveCount(2);
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

  test('shows the list and the map side by side on a wide screen, with no switch', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.getByTestId('venue-card')).toHaveCount(2);
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await expect(page.getByTestId('view-switch')).toBeHidden();

    const [list, map] = await Promise.all([
      page.getByTestId('list-panel').boundingBox(),
      page.getByTestId('map-panel').boundingBox(),
    ]);
    expect(list && map && map.x > list.x + list.width - 1).toBe(true);
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
    await expect(page.getByTestId('venue-card')).toHaveCount(2);
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

    expect(offOrigin, 'every map resource must come from our origin (ADR-0022)').toEqual([]);
    await expectNoSeriousAxeViolations(page, 'Discover with the real map rendered');
  });
});
