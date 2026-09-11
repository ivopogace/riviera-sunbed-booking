import { expect, test, type Locator, type Page } from '@playwright/test';

import { bannerPhotoView } from './support/photo-views';

/**
 * Real-render CI-safe e2e for WHICH stored candidate the browser fetches on the venue page. The
 * `sizes` strings themselves are pinned in `discover-photos.e2e.ts` and `venue-map.spec.ts`; a
 * pinned string is a tautology, so the choice it drives is observed here instead — and only a real
 * engine makes that choice, which is why this is an e2e and not a jsdom spec.
 *
 * <p>Each case fixes a viewport AND a device-pixel ratio, because the candidate is picked from
 * `sizes × DPR`: a value that serves DPR 1 correctly can under-serve DPR 2. DPR 3 is deliberately
 * uncovered: the values are tuned to DPR 1 and 2, and the tracker carries what that leaves. Axe is
 * not re-run here — `discover-photos.e2e.ts` already sweeps these two
 * surfaces, and an image's `srcset` cannot move an axe result.
 */

/** A 1×1 PNG for the mocked serving endpoint — the `<img>`s genuinely load and settle on a choice. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const BANNER = bannerPhotoView('/api/venues/1/photos/bb02');
/** The same band photo uploaded at 16:9, which stores a wider pair: 853w and 1707w. */
const WIDE_BANNER = bannerPhotoView('/api/venues/1/photos/ee05', 16 / 9);
const SECOND = bannerPhotoView('/api/venues/1/photos/cc03');
const THIRD = bannerPhotoView('/api/venues/1/photos/dd04');
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

/** The 2+ photo path, where the header hands its photo lead to the gallery grid, not the band. */
const GALLERY_VENUE = { ...VENUE_MAP, photos: [BANNER, SECOND, THIRD] };
/** The same page whose hero is the 16:9 upload, which stores 853w/1707w rather than 720w/1440w. */
const WIDE_GALLERY_VENUE = { ...VENUE_MAP, photos: [WIDE_BANNER, SECOND, THIRD] };

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

    // An 1098 x 264 box, but object-contain paints this 3:2 photo only ~396 CSS px wide in it.
    await candidate(band).toBe('bb02');
  });
});

test.describe('the beach-map band at 1440 x 900, DPR 2', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('band still picks the retina candidate at DPR 2', async ({ page }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // The half of the fix that is a guard, not a win: ~792 device px needs the wider candidate.
    await candidate(band).toBe('bb02@1440');
  });
});

test.describe('the beach-map band at 900 x 800, DPR 2', () => {
  test.use({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });

  test('the short band stays on the baseline candidate at DPR 2', async ({ page }) => {
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // Below the 1024px step the band is 150px tall: ~450 device px even at DPR 2.
    await candidate(band).toBe('bb02');
  });
});

/** The 2+ photo page, scrolled until the lazy side tiles have chosen a candidate. */
async function openGallery(page: Page, venue: object = GALLERY_VENUE) {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: venue }));
  await page.goto('/venues/1');
  await expect(page.getByTestId('gallery-hero')).toBeVisible();
  await page.getByTestId('gallery-tile').nth(1).scrollIntoViewIfNeeded();
}

test.describe('the gallery grid at 1440 x 900, DPR 1', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('every contain-fitted gallery tile picks the baseline candidate at DPR 1', async ({
    page,
  }) => {
    await openGallery(page);
    const tiles = page.getByTestId('gallery-tile');

    await candidate(page.getByTestId('gallery-hero')).toBe('bb02');
    await candidate(tiles.first()).toBe('cc03');
    await candidate(tiles.nth(1)).toBe('dd04');
  });
});

test.describe('the gallery grid at 1920 x 900, DPR 1', () => {
  test.use({ viewport: { width: 1920, height: 900 }, deviceScaleFactor: 1 });

  test('the hero keeps the baseline candidate on a wide desktop', async ({ page }) => {
    await openGallery(page);

    // The grid stops at the 1100px breakout, so the hero still paints ~540 CSS px here.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02');
  });
});

test.describe('the gallery grid at 1100 x 800, DPR 1', () => {
  test.use({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });

  test('the hero picks the baseline candidate on the narrower breakout', async ({ page }) => {
    await openGallery(page);

    // Below 1280 the grid drops to the 730px breakout, and the hero is width-bound at 485 px.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02');
  });
});

test.describe('the gallery grid at 1440 x 900, DPR 2', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('the hero still takes the retina candidate at DPR 2', async ({ page }) => {
    await openGallery(page);

    // The guard on the two cases above: ~1080 device px is more than the baseline carries.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
  });
});

test.describe('the gallery grid at 900 x 800, DPR 2', () => {
  test.use({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });

  test('the hero stays on the baseline candidate where its short box cannot need more', async ({
    page,
  }) => {
    await openGallery(page);

    // 220 x 2 fits the 480px BANNER box, so no upload up to 8:3 can out-paint the baseline.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02');
  });
});

test.describe('the beach-map band at 1280 x 900, DPR 2', () => {
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  test('a wider upload still reaches its own retina candidate', async ({ page }) => {
    await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
      route.fulfill({ json: { ...VENUE_MAP, photos: [WIDE_BANNER] } }),
    );
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // A 16:9 upload stores a wider pair, which a value tuned to 3:2 alone clears and misses.
    await candidate(band).toBe('ee05@1707');
  });
});

test.describe('the beach-map band at 1024 x 800, DPR 2', () => {
  test.use({ viewport: { width: 1024, height: 800 }, deviceScaleFactor: 2 });

  test('the middle clause buys the retina candidate at the step it starts on', async ({ page }) => {
    await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
      route.fulfill({ json: { ...VENUE_MAP, photos: [WIDE_BANNER] } }),
    );
    await page.goto('/venues/1');
    const band = page.getByTestId('map-banner-img');
    await expect(band).toBeVisible();

    // The clause's tightest point: 45vw asks 922 device px against a 16:9 baseline of 853.
    await candidate(band).toBe('ee05@1707');
  });
});

test.describe('the gallery hero at 360 x 900, DPR 3', () => {
  test.use({ viewport: { width: 360, height: 900 }, deviceScaleFactor: 3 });

  test('a 3:2 upload stays on its baseline below the DPR-3 window', async ({ page }) => {
    await openGallery(page);

    // 3:2 fixture: a measured 205 x 220 box paints 205 CSS px, so DPR 3 asks 616 - inside the
    // 720w baseline this upload stores. The guard that the capped clause is a cap, not a
    // blanket switch to retina on every phone.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02');
  });
});

test.describe('the gallery hero at 430 x 900, DPR 3', () => {
  test.use({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 3 });

  test('a 3:2 upload takes the retina candidate at the low end of the DPR-3 window', async ({
    page,
  }) => {
    await openGallery(page);

    // 3:2 fixture: a measured 252 x 220 box is still width-bound, so it paints 252 CSS px and
    // DPR 3 asks 756 - past this upload's 720w baseline by 5%.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
  });
});

test.describe('the gallery hero at 560 x 900, DPR 3', () => {
  test.use({ viewport: { width: 560, height: 900 }, deviceScaleFactor: 3 });

  test('a 3:2 upload takes the retina candidate where the paint caps', async ({ page }) => {
    await openGallery(page);

    // 3:2 fixture: a measured 339 x 220 box is height-bound, so the paint caps at 220 x 1.5 =
    // 330 CSS px and DPR 3 asks 990 - the worst point of this upload's window, 27% past 720w.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
  });
});

test.describe('the gallery hero at 673 x 900, DPR 3', () => {
  test.use({ viewport: { width: 673, height: 900 }, deviceScaleFactor: 3 });

  test('a 3:2 upload takes the retina candidate at the top of the DPR-3 window', async ({
    page,
  }) => {
    await openGallery(page);

    // 3:2 fixture: a measured 414 x 220 box, still capped at a 330 CSS px paint and still
    // asking 990. The last width at which a 3:2 upload is short; from 686 up the widest
    // clause already bought retina before this slice.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
  });
});

test.describe('the gallery hero at 800 x 900, DPR 3', () => {
  test.use({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 3 });

  test("a 16:9 upload's DPR-3 window runs wider than a 3:2 upload's", async ({ page }) => {
    await openGallery(page, WIDE_GALLERY_VENUE);

    // 16:9 fixture: the measured 485 x 220 box is height-bound, so it paints 220 x 16/9 = 391
    // CSS px and DPR 3 asks 1173 - past the 853w baseline a 16:9 upload stores.
    await candidate(page.getByTestId('gallery-hero')).toBe('ee05@1707');
  });

  test('while a 3:2 upload at the same width needed no help', async ({ page }) => {
    await openGallery(page);

    // 3:2 fixture, same box: it paints only 220 x 1.5 = 330 CSS px and asks 990, which the
    // widest clause already covered. The control on the case above - the two aspects diverge
    // here because their paints and their stored ladders both differ, never one alone.
    await candidate(page.getByTestId('gallery-hero')).toBe('bb02@1440');
  });
});
