import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render CI-safe e2e for the tourist cover-photo display: the Discover card
 * renders the cover's CARD variant when a venue has one and keeps the gradient placeholder (sun,
 * no image) when it does not; the beach-map banner renders the BANNER variant, the scrim stays
 * layered over both, and the retired "coming soon" pill never renders in either state. API mocked
 * via `page.route`; the content-addressed serving GET answers real image bytes; axe at each step.
 */

/** A 1×1 PNG for the mocked serving endpoint — the `<img>`s genuinely load. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const COVER = { card: '/api/venues/1/photos/aa01', banner: '/api/venues/1/photos/bb02' };

/** The three-slot slideshow, slot order (cover, sunbeds, bar) — the summary's `photos`. */
const SLIDESHOW = [
  '/api/venues/1/photos/aa01',
  '/api/venues/1/photos/cc03',
  '/api/venues/1/photos/dd04',
];

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
    coverPhoto: COVER,
    photos: SLIDESHOW,
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
    coverPhoto: null,
    photos: [],
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
  coverPhoto: COVER,
};

test.beforeEach(async ({ page }) => {
  // Registered first, so the more specific photo route below wins where both could match.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/jpeg' }),
  );
});

test('the Discover card shows the cover photo (scrim kept), the photo-less card keeps the gradient, and the map banner shows the cover — no "coming soon" anywhere (+ axe)', async ({
  page,
}) => {
  await page.goto('/');
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);

  // Venue 1 has a cover → its card renders the CARD variant; the scrim stays layered above it
  // (the location text's AA floor is computed in home.contrast.spec.ts — here we pin the layering).
  const coverImg = cards.first().getByTestId('card-photo-img');
  await expect(coverImg).toBeVisible();
  // The service resolves the wire's root-relative path against the API origin.
  await expect(coverImg).toHaveAttribute('src', /\/api\/venues\/1\/photos\/aa01$/);
  await expect(cards.first().locator('.photo-scrim')).toBeAttached();

  // Venue 2 has none → the gradient placeholder (no image) — the empty state, not a broken photo.
  await expect(cards.nth(1).getByTestId('card-photo-img')).toBeHidden();
  // …and a single- or no-photo card carries no slideshow chrome.
  await expect(cards.nth(1).locator('..').getByTestId('card-photo-next')).toBeHidden();
  await expect(page.getByText('coming soon')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'discovery with cover photos');

  // The beach map renders the BANNER variant in the photo band; the retired pill is gone.
  await cards.first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  const banner = page.getByTestId('map-banner-img');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('src', /\/api\/venues\/1\/photos\/bb02$/);
  await expect(page.getByText('coming soon')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'beach map with cover banner');
});

test('the Discover card slideshow crossfades through all three slots via the step controls (dots track, wrap both ways, + axe)', async ({
  page,
}) => {
  await page.goto('/');
  const item = page.getByTestId('venue-card').first().locator('..');
  const slides = item.locator('[data-testid="card-photo-img"], [data-testid="card-slide-img"]');
  await expect(slides).toHaveCount(3);
  await expect(item.getByTestId('card-photo-dots').locator('span')).toHaveCount(3);

  // First slide up (cover), the others faded out of the stack.
  await expect(slides.nth(0)).toHaveCSS('opacity', '1');
  await expect(slides.nth(1)).toHaveCSS('opacity', '0');

  const next = item.getByTestId('card-photo-next');
  const prev = item.getByTestId('card-photo-prev');
  await next.click();
  await expect(slides.nth(1)).toHaveCSS('opacity', '1');
  await expect(slides.nth(0)).toHaveCSS('opacity', '0');

  // Forward past the end wraps to the cover; back from the cover wraps to the last slot.
  await next.click();
  await next.click();
  await expect(slides.nth(0)).toHaveCSS('opacity', '1');
  await prev.click();
  await expect(slides.nth(2)).toHaveCSS('opacity', '1');

  // Stepping the slideshow must not navigate — the controls sit outside the card link.
  await expect(page).toHaveURL('/');

  // The toHaveCSS('opacity', '1') above already proved the crossfade settled (no mid-fade axe read).
  await expectNoSeriousAxeViolations(page, 'discovery with an active slideshow');
});
