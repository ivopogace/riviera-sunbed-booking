import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { openShellOverlay } from './support/shell';
import { settle } from './support/booking-dialog';

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

/** The three-slot slideshow, slot order (cover, sunbeds, bar) — the summary's card-sized `photos`. */
const CARD_SLIDESHOW = [
  '/api/venues/1/photos/aa01',
  '/api/venues/1/photos/cc03',
  '/api/venues/1/photos/dd04',
];

/** The same three slots banner-sized — the map read's `photos` (cover's BANNER variant first). */
const BANNER_SLIDESHOW = [
  '/api/venues/1/photos/bb02',
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
    photos: CARD_SLIDESHOW,
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
  photos: BANNER_SLIDESHOW,
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

  // The beach map's photo lead is the gallery grid once 2+ photos are set (#765).
  await cards.first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  const hero = page.getByTestId('gallery-hero');
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('src', /\/api\/venues\/1\/photos\/bb02$/);
  await expect(page.getByTestId('gallery-tile')).toHaveCount(2);
  await expect(page.getByText('coming soon')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'beach map with its gallery grid');
});

test('the venue banner is a media header — ≥260px on desktop, 150px on mobile, above the status card (#704)', async ({
  page,
}) => {
  // Below 2 photos so the header keeps its single-photo band, not the gallery grid (#765).
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...VENUE_MAP, photos: [COVER.banner] } }),
  );
  await page.goto('/venues/1');

  const band = page.locator('.photo-band');
  await expect(band).toBeVisible();
  // The identity zone, not the availability card: exactly one band, inside the venue header.
  await expect(page.locator('header .photo-band')).toHaveCount(1);

  // Measured boxes, never class lists — a responsive height is a rendered fact.
  const desktop = (await band.boundingBox())!;
  expect(desktop.height).toBeGreaterThanOrEqual(260);
  const status = (await page.getByTestId('availability').boundingBox())!;
  expect(desktop.y + desktop.height).toBeLessThanOrEqual(status.y);

  await page.setViewportSize({ width: 390, height: 844 });
  expect((await band.boundingBox())!.height).toBe(150);

  // The header clips the full-bleed band to its radius, so prove the clip costs no focus ring.
  const date = page.getByTestId('map-date');
  await date.focus();
  await expect(date).toHaveCSS('outline-width', '3px');
});

test('the slideshow chrome carries its own backing over the photo, in both themes (#704)', async ({
  page,
}) => {
  // Multi-photo step chrome now only ever renders inside the lightbox (#765, gallery grid at 2+).
  await page.goto('/venues/1');
  await page.getByTestId('gallery-photo-0').click();

  // The ratios are proven in photo-slideshow.contrast.spec.ts; that the paint ships is proven here.
  // First span in the rail is the pill painted BEHIND the dot buttons, which are transparent 44px boxes.
  const rail = page.getByTestId('lightbox-dots').locator('span').first();
  await expect(rail).toHaveCSS('background-color', 'rgba(13, 40, 40, 0.7)');
  const chip = page.getByTestId('lightbox-next').locator('span');
  await expect(chip).toHaveCSS('border-top-color', 'rgba(12, 42, 51, 0.6)');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'photo lightbox (default theme)');
  await page.getByTestId('lightbox-close').click();

  await openShellOverlay(page, 'theme-toggle');
  await page.getByTestId('theme-option-porcelain').click();
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
  await page.getByTestId('gallery-photo-0').click();
  // Theme-invariant on purpose: a photo is not themed, so the chrome must not move with the theme.
  await expect(rail).toHaveCSS('background-color', 'rgba(13, 40, 40, 0.7)');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'photo lightbox (porcelain)');
});

test('the Discover card slideshow crossfades through all three slots via the step controls (dots track, wrap both ways, + axe)', async ({
  page,
}) => {
  await page.goto('/');
  const item = page.getByTestId('venue-card').first().locator('..');
  const slides = item.locator(
    '[data-testid="card-photo-img"], [data-testid="card-photo-slide-img"]',
  );
  // Only the cover is mounted up front — an opacity-0 slide would still be fetched.
  await expect(slides).toHaveCount(1);
  const dots = item.getByTestId('card-photo-dots');
  await expect(dots.locator('span')).toHaveCount(3);

  // Measured, because the location's reservation is a literal that cannot follow a rail retune.
  const rail = (await dots.boundingBox())!;
  const location = (await item.locator('.photo-location').boundingBox())!;
  expect(location.x + location.width).toBeLessThanOrEqual(rail.x);

  const shown = item.locator(
    '[data-testid="card-photo-img"]:not(.opacity-0), [data-testid="card-photo-slide-img"]:not(.opacity-0)',
  );
  const position = item.getByTestId('card-photo-position');
  await expect(position).toHaveText('Photo 1 of 3');

  const next = item.getByTestId('card-photo-next');
  const prev = item.getByTestId('card-photo-prev');
  await next.click();
  await expect(position).toHaveText('Photo 2 of 3');
  await expect(shown).toHaveCSS('opacity', '1');
  // Mounted on demand, and — one step in — its paint warms the neighbours, so the set follows.
  await expect(slides).toHaveCount(3);

  // Forward past the end wraps to the cover; back from the cover wraps to the last slot.
  await next.click();
  await next.click();
  await expect(position).toHaveText('Photo 1 of 3');
  await prev.click();
  await expect(position).toHaveText('Photo 3 of 3');

  // Stepping the slideshow must not navigate — the controls sit outside the card link.
  await expect(page).toHaveURL('/');

  // The toHaveCSS('opacity', '1') above already proved the crossfade settled (no mid-fade axe read).
  await expect(shown).toHaveCSS('opacity', '1');
  await expectNoSeriousAxeViolations(page, 'discovery with an active slideshow');
});

test('a horizontal swipe steps the Discover card without following the card link', async ({
  page,
}) => {
  await page.goto('/');
  const item = page.getByTestId('venue-card').first().locator('..');
  const band = item.locator('app-photo-slideshow');
  const position = item.getByTestId('card-photo-position');
  await expect(position).toHaveText('Photo 1 of 3');

  const swipe = async (dx: number) => {
    for (const [type, x] of [
      ['pointerdown', 200],
      ['pointerup', 200 + dx],
    ] as const) {
      await band.dispatchEvent(type, { clientX: x, clientY: 300, pointerType: 'touch' });
    }
  };

  // The band IS the card's <a>, so the click the swipe synthesises must not reach the router.
  await swipe(-80);
  await expect(position).toHaveText('Photo 2 of 3');
  await expect(page).toHaveURL('/');

  await swipe(80);
  await expect(position).toHaveText('Photo 1 of 3');

  // A tap that never travelled is still a tap: the card navigates.
  await band.click();
  await expect(page).toHaveURL(/\/venues\/1/);
});

test('the lightbox picker jumps to a slide, and the arrow keys step from the close button (+ axe)', async ({
  page,
}) => {
  await page.goto('/venues/1');
  await page.getByTestId('gallery-photo-0').click();

  const position = page.getByTestId('lightbox-position');
  await expect(position).toHaveText('Photo 1 of 3');
  await expect(page.getByTestId('lightbox-dot-0')).toHaveAttribute('aria-current', 'true');

  // Focus opens on the close button, which is the slideshow's sibling — the dialog is what listens.
  await expect(page.getByTestId('lightbox-close')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(position).toHaveText('Photo 2 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(position).toHaveText('Photo 1 of 3');

  await page.getByTestId('lightbox-dot-2').click();
  await expect(position).toHaveText('Photo 3 of 3');
  await expect(page.getByTestId('lightbox-dot-2')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('lightbox-dot-0')).not.toHaveAttribute('aria-current', 'true');

  // The state cue is a SHAPE, so only a measured width proves it — a class list cannot.
  const dotPaint = (i: number) => page.getByTestId(`lightbox-dot-${i}`).locator('span');
  await expect(dotPaint(2)).toHaveCSS('width', '18px');
  await expect(dotPaint(0)).toHaveCSS('width', '8px');
  await expect(dotPaint(2)).toHaveCSS('height', '8px');
  // Every dot's own hit box still measures the floor, pill or not.
  for (const i of [0, 1, 2]) {
    const box = (await page.getByTestId(`lightbox-dot-${i}`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'photo lightbox with the slide picker');
});
