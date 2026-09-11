import { expect, test, type Locator } from '@playwright/test';

import { bannerPhotoView } from './support/photo-views';

/**
 * Real-render CI-safe e2e for WHICH stored candidate the browser fetches on the venue page. The
 * `sizes` strings themselves are pinned in `discover-photos.e2e.ts` and `venue-map.spec.ts`; a
 * pinned string is a tautology, so the choice it drives is observed here instead — and only a real
 * engine makes that choice, which is why this is an e2e and not a jsdom spec.
 *
 * <p>Each case fixes a viewport AND a device-pixel ratio, because the candidate is picked from
 * `sizes × DPR`: a value that serves DPR 1 correctly can under-serve DPR 2, and the pair is the
 * whole behaviour. Axe is not re-run here — `discover-photos.e2e.ts` already sweeps these two
 * surfaces, and an image's `srcset` cannot move an axe result.
 */

/** A 1×1 PNG for the mocked serving endpoint — the `<img>`s genuinely load and settle on a choice. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const BANNER = bannerPhotoView('/api/venues/1/photos/bb02');
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
  coverPhoto: { card: BANNER, banner: BANNER },
  photos: [BANNER],
};

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+(@\d+)?$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/png' }),
  );
});

/**
 * The candidate the browser settled on, as its bare filename (`bb02` = the 720w baseline,
 * `bb02@1440` = the retina one). Polled, because `currentSrc` is empty until resource selection
 * runs.
 */
function candidate(img: Locator) {
  return expect.poll(() =>
    img.evaluate((el: HTMLImageElement) => el.currentSrc.replace(/^.*\/photos\//, '')),
  );
}

test.describe('the beach-map band at 1440 x 900, DPR 1', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('band picks the baseline candidate at DPR 1', async ({ page }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // An 1098 x 264 box, but object-contain paints a 16:9 photo only ~470 CSS px wide in it.
    await candidate(band).toBe('bb02');
  });
});

test.describe('the beach-map band at 1440 x 900, DPR 2', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('band still picks the retina candidate at DPR 2', async ({ page }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // The half of the fix that is a guard, not a win: ~940 device px needs the wider candidate.
    await candidate(band).toBe('bb02@1440');
  });
});

test.describe('the beach-map band at 900 x 800, DPR 2', () => {
  test.use({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });

  test('the short band stays on the baseline candidate at DPR 2', async ({ page }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // Below the 1024px step the band is 150px tall: ~534 device px even at DPR 2.
    await candidate(band).toBe('bb02');
  });
});
