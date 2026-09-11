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

test.describe('the beach-map band', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('fetches the retina candidate at DPR 1, sized by its box and not by its letterboxed image', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // Characterization of #1069: 70vw of 1440 asks for 1008px, so the browser takes the 1440w
    // candidate — while `object-contain` paints the image ~470px wide inside that 1100 × 264 box.
    await candidate(band).toBe('bb02@1440');
  });
});
