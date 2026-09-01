import { expect, test, type Page } from '@playwright/test';

/**
 * The three suns paint from one `--riv-sun-grad`, proved where the cascade decides rather than
 * where a regex does: all three computed `background-image`s equal, the card opaque, and the band
 * byte-identical to the literal it carried before the merge.
 *
 * <p>Companion to `shared/sun-token.contrast.spec.ts`, which owns what the stylesheet says. A
 * token consumed through a class that never reaches the element leaves that one green.
 */

/** Both venues photo-less, so the card empty state renders; the map read is photo-less too. */
const NO_PHOTOS = { coverPhoto: null, photos: [] };

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
    amenities: [],
    distanceToWaterM: 15,
    availability: { free: 18, total: 24 },
    ...NO_PHOTOS,
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
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: [],
  distanceToWaterM: 15,
  sets: [
    {
      id: 1,
      rowLabel: 'Front row',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    },
  ],
  ...NO_PHOTOS,
};

/** The app shell's brand mark — the decorative disc beside the wordmark, on every route. */
const BRAND_SUN = '[data-testid="brand-home"] span[aria-hidden="true"]';

/** The map band's fill exactly as it stood before the merge — the source of the adopted values. */
const PRE_MERGE_BAND =
  'radial-gradient(circle at 38% 30%, #fff6da 0%, #ffd97a 42%, #f6b23f 76%, #e89a26 100%)';

function backgroundImage(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundImage);
}

/**
 * The pre-merge literal as **this browser** serializes it. Pinning the expected string by hand
 * would test the guess rather than the value — Chromium rewrites hex stops to `rgb(…)` and may
 * normalise the position keywords, so the comparison has to run through the same serializer the
 * live element's computed style came out of.
 */
function resolved(page: Page, image: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.backgroundImage = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return computed;
  }, image);
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
});

test('all three suns resolve one computed background-image', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('venue-card')).toHaveCount(1);

  const brand = await backgroundImage(page, BRAND_SUN);
  const card = await backgroundImage(page, '.photo-sun');

  await page.goto('/venues/1');
  await expect(page.getByTestId('map-banner-empty')).toBeVisible();
  const band = await backgroundImage(page, '[data-testid="map-banner-empty"]');

  expect(brand, 'the brand mark resolves a real gradient, not `none`').toContain('radial-gradient');
  expect(card, 'the card sun matches the brand mark').toBe(brand);
  expect(band, 'the map band matches the brand mark').toBe(brand);
});

test('the card sun is opaque, so it cannot composite against the sea', async ({ page }) => {
  await page.goto('/');
  const sun = page.locator('.photo-sun');
  await expect(sun).toBeVisible();

  const image = await backgroundImage(page, '.photo-sun');
  const opacity = await sun.evaluate((el) => getComputedStyle(el).opacity);

  expect(image, 'every stop opaque — an alpha stop reads pale green over the cyan').not.toContain(
    'rgba(',
  );
  expect(opacity, 'an opaque fill behind 85% opacity is still 85% composited').toBe('1');
});

test('the band does not move — the merged value is the one it already had', async ({ page }) => {
  await page.goto('/venues/1');
  await expect(page.getByTestId('map-banner-empty')).toBeVisible();

  const band = await backgroundImage(page, '[data-testid="map-banner-empty"]');

  expect(band).toBe(await resolved(page, PRE_MERGE_BAND));
});
