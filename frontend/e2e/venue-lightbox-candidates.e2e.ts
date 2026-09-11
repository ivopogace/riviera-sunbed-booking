import { expect, test, type Locator, type Page } from '@playwright/test';

import { bannerPhotoView, lightboxPhotoView } from './support/photo-views';

/**
 * Real-render CI-safe e2e for the candidate the lightbox fetches, and for the two surfaces that
 * must not move when it gains its own list. Only a real engine picks a candidate, which is why this
 * is an e2e rather than a jsdom spec; `venue-photo-candidates.e2e.ts` covers the band and gallery
 * on their own, and this file covers the modal viewer plus the no-regression half.
 *
 * <p>Both branches of the fallback are exercised from one page. A photo WITH a LIGHTBOX row
 * publishes exactly one candidate, because the surface is stored at scale 1 alone; a photo WITHOUT
 * one publishes the BANNER pair, which is the un-backfillable case (ADR-0008 discards the original,
 * so an existing photo never gains the row). Asserting only the first branch would pass against a
 * lightbox still wired to the banner list.
 *
 * <p>Density is fixed per `describe`, because the choice is made from `sizes × DPR`.
 */

/** A 1x1 PNG for the mocked serving endpoint — the `<img>`s genuinely load and settle on a choice. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Photo 1: re-uploaded since the surface landed, so it has a LIGHTBOX row. */
const FRESH_BANNER = bannerPhotoView('/api/venues/1/photos/bb02');
const FRESH_LIGHTBOX = lightboxPhotoView('/api/venues/1/photos/bb02');
/** Photos 2 and 3: stored before the surface existed, so their lightbox entry IS the banner view. */
const LEGACY_SECOND = bannerPhotoView('/api/venues/1/photos/cc03');
const LEGACY_THIRD = bannerPhotoView('/api/venues/1/photos/dd04');

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
  coverPhoto: { card: FRESH_BANNER, banner: FRESH_BANNER },
  photos: [FRESH_BANNER, LEGACY_SECOND, LEGACY_THIRD],
  lightboxPhotos: [FRESH_LIGHTBOX, LEGACY_SECOND, LEGACY_THIRD],
};

/** The single-photo path, where the header keeps its band instead of handing over to the grid. */
const BAND_VENUE = {
  ...VENUE_MAP,
  photos: [FRESH_BANNER],
  lightboxPhotos: [FRESH_LIGHTBOX],
};

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+(@\d+)?$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/png' }),
  );
});

/**
 * The lightbox's mounted slide. Only the slide the tourist opened on is in the DOM, and the
 * slideshow names the FIRST one `-img` and every other `-slide-img`, so opening past index 0
 * needs both hooks.
 */
function lightboxImg(page: Page): Locator {
  return page.locator('[data-testid="lightbox-img"], [data-testid="lightbox-slide-img"]');
}

/** The candidate the browser settled on, as its bare filename. Polled: `currentSrc` starts empty. */
function candidate(img: Locator) {
  return expect.poll(() =>
    img.evaluate((el: HTMLImageElement) => el.currentSrc.replace(/^.*\/photos\//, '')),
  );
}

test.describe('the lightbox at 1440 x 900, DPR 2', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('opens a re-uploaded photo on its own LIGHTBOX candidate', async ({ page }) => {
    await page.goto('/venues/1');
    await page.getByTestId('gallery-photo-0').click();

    // An 1100 x 792 box asking 2200 device px, which is exactly what the surface stores at 3:2.
    await candidate(lightboxImg(page)).toBe('bb02@2200');
  });

  test('falls back to the BANNER retina candidate for a photo stored before the surface', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    await page.getByTestId('gallery-photo-1').click();

    // No LIGHTBOX row exists and none can be minted (ADR-0008), so the banner pair is the list.
    await candidate(lightboxImg(page)).toBe('cc03@1440');
  });

  test('leaves the gallery hero and its side tiles on the candidates they fetch today', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    await page.getByTestId('gallery-tile').nth(1).scrollIntoViewIfNeeded();

    // The 2200w candidate is on a separate list, so no other surface can be offered it.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
    await candidate(page.getByTestId('gallery-tile').first()).toBe('cc03@1440');
    await candidate(page.getByTestId('gallery-tile').nth(1)).toBe('dd04@1440');
  });

  test('leaves the single-photo band on its own candidate while the lightbox takes the new one', async ({
    page,
  }) => {
    await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: BAND_VENUE }));
    await page.goto('/venues/1');

    await candidate(page.getByTestId('map-banner-img')).toBe('bb02@1440');

    await page.getByTestId('photo-band-view').click();

    await candidate(lightboxImg(page)).toBe('bb02@2200');
  });
});

test.describe('the lightbox at 390 x 844, DPR 2', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('serves the same single candidate on a phone, where the box is padding-bound', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    await page.getByTestId('gallery-photo-0').click();

    // A 358 CSS px box (100vw - 32, not 94vw): with one candidate there is no choice to make.
    await candidate(lightboxImg(page)).toBe('bb02@2200');
  });
});
