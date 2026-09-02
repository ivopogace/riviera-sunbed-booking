import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render proof for the focus-ring baseline (#890): the `@layer base` rule in `tailwind.css`
 * that paints the project's 3px ring on every `<button>`'s `:focus-visible`. Three things only a
 * browser can show, which is why they are not in `app/shared/focus-ring-baseline.spec.ts`:
 *
 * <p>(1) that the rule paints at all on a button carrying no `focus-visible:` utility — the class
 * list is not the proof, because `:focus-visible` compiles to a compound selector the unit sweep
 * cannot match; (2) that a site naming its own ring colour still wins — the cascade-layer claim
 * the whole seam rests on, which a text guard can read but not execute; (3) that the gallery tile,
 * clipped by its `overflow-hidden` grid, paints its ring inset and white.
 *
 * <p>Focus is moved with `.focus()` after a plain navigation, the posture `discover-photos.e2e.ts`
 * already relies on: Chromium matches `:focus-visible` on script focus when no pointer interaction
 * preceded it. The console test cannot use that posture alone — signing in clicks, and after a
 * pointer interaction Chromium treats script focus as pointer-driven — so it steps off the button
 * and back with the keyboard, which always matches. Each assertion first pins the resting state,
 * so the ring is proven to be the FOCUSED paint and not a constant.
 */

/** A 1×1 PNG for the mocked serving endpoint — the `<img>`s genuinely load. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const PHOTOS = [
  '/api/venues/1/photos/bb02',
  '/api/venues/1/photos/cc03',
  '/api/venues/1/photos/dd04',
];

/** The three-photo venue, which is what makes the header render the gallery grid (2+ photos). */
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
  coverPhoto: { card: '/api/venues/1/photos/aa01', banner: '/api/venues/1/photos/bb02' },
  photos: PHOTOS,
};

/** `--riv-accent-ink` in porcelain, as Chromium reports it. */
const ACCENT_INK = 'rgb(8, 90, 110)';
const WHITE = 'rgb(255, 255, 255)';

async function mockVenueWithGallery(page: Page): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/jpeg' }),
  );
}

test('a button with no focus utility paints the baseline ring (#890)', async ({ page }) => {
  await mockWholeConsole(page);
  await page.goto('/operator/1/beach-map');
  await signInAsOperator(page);

  const signOut = page.getByTestId('oc-signout');
  await expect(signOut).toBeVisible();
  await expect(signOut).toHaveCSS('outline-style', 'none');

  await signOut.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(signOut).toBeFocused();
  await expect(signOut).toHaveCSS('outline-style', 'solid');
  await expect(signOut).toHaveCSS('outline-width', '3px');
  await expect(signOut).toHaveCSS('outline-color', ACCENT_INK);
  await expect(signOut).toHaveCSS('outline-offset', '2px');
});

test('a site that names its own ring colour still wins — the utilities layer beats base (#890)', async ({
  page,
}) => {
  await mockVenueWithGallery(page);
  await page.goto('/venues/1');

  const hero = page.getByTestId('gallery-photo-0');
  await hero.focus();
  await page.keyboard.press('Enter');

  const close = page.getByTestId('lightbox-close');
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS('outline-width', '3px');
  await expect(close).toHaveCSS('outline-color', WHITE);
  await expect(close).toHaveCSS('outline-offset', '2px');
});

test('the clipped gallery tile paints its ring inset, in white over the photo (#890)', async ({
  page,
}) => {
  await mockVenueWithGallery(page);
  await page.goto('/venues/1');

  const hero = page.getByTestId('gallery-photo-0');
  await expect(hero).toBeVisible();
  await expect(hero).toHaveCSS('outline-style', 'none');

  await hero.focus();
  await expect(hero).toHaveCSS('outline-style', 'solid');
  await expect(hero).toHaveCSS('outline-width', '3px');
  await expect(hero).toHaveCSS('outline-offset', '-3px');
  await expect(hero).toHaveCSS('outline-color', WHITE);
});
