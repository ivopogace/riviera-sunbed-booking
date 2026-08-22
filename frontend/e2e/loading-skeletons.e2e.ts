import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The anti-jump half of the skeleton contract (#744), in a real browser: on the two surfaces whose
 * loaded state is a **grid**, the beach-map frame is on screen while the read is in flight, and it
 * is still in the same place once the content lands.
 *
 * <p>The unit specs assert what the skeleton *contains*; only a real layout engine can say where it
 * sits. Both surfaces render their placeholder tiles through the same `BeachMapCanvas` the loaded
 * state uses, so the frame is one element across the transition — which is what makes its top edge
 * measurable either side of the release.
 *
 * <p>The tolerance is not "close enough": a skeleton mirrors block *shapes*, never the exact glyphs
 * nobody has fetched yet, so a real venue name that wraps to two lines legitimately moves the frame
 * a line. What the tolerance rules out is the regression this issue is about — a centred one-liner
 * standing in for a whole article, which moved the frame by hundreds of pixels because the frame did
 * not exist at all.
 */

/** Beyond this, the content below the fold has visibly re-flowed rather than settled. Measured
 *  shifts on these fixtures are ~10px (tourist map) and <1px (Daily view). */
const MAX_FRAME_SHIFT_PX = 32;

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['WIFI', 'SHOWERS'],
  distanceToWaterM: 20,
  sets: Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 12 ? 'Front row' : 'Row 2',
    positionNo: (i % 12) + 1,
    tier: i < 12 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: i < 12 ? 4500 : 3500, currency: 'EUR' },
    gridX: (i % 12) + 1,
    gridY: i < 12 ? 1 : 2,
    availability: 'FREE',
  })),
};

/** The viewport-relative top edge of a frame, which is what a layout jump moves. */
async function topOf(frame: Locator): Promise<number> {
  const box = await frame.boundingBox();
  expect(box, 'the frame has a rendered box').not.toBeNull();
  return box!.y;
}

async function expectFrameHeldItsPlace(page: Page, frame: Locator, before: number): Promise<void> {
  const after = await topOf(frame);
  expect(
    Math.abs(after - before),
    `the map frame stayed put across the load (${before} → ${after})`,
  ).toBeLessThan(MAX_FRAME_SHIFT_PX);
}

test('the tourist beach map holds its frame across the load (#744)', async ({ page }) => {
  // Hold the response open so the loading state is observable rather than raced past.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
    await held;
    await route.fulfill({ json: VENUE });
  });

  await page.goto('/venues/1');

  const loading = page.getByTestId('map-loading');
  await expect(loading).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
  // The sentence this replaced; the announcer, not the skeleton, carries the words (#741).
  await expect(loading).not.toContainText('Loading the beach map');
  await expectNoSeriousAxeViolations(page, 'Beach map, loading');

  const frame = page.getByTestId('beach-grid');
  const before = await topOf(frame);

  release();
  await expect(page.getByTestId('set-tile').first()).toBeVisible();
  await expect(page.getByTestId('map-loading')).toHaveCount(0);

  await expectFrameHeldItsPlace(page, frame, before);
});

test('the operator Daily view holds its grid frame across the load (#744)', async ({ page }) => {
  await mockWholeConsole(page);

  // Registered last, so it wins over the whole-console venue read and can be held open.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
    await held;
    await route.fulfill({ json: VENUE });
  });

  await page.goto('/operator/1/daily');
  await signInAsOperator(page);

  const loading = page.getByTestId('daily-loading');
  await expect(loading).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();
  await expect(loading).not.toContainText('Loading the daily view');
  await expectNoSeriousAxeViolations(page, 'Daily view, loading');

  const frame = page.getByTestId('daily-grid-frame');
  const before = await topOf(frame);

  release();
  await expect(page.getByTestId('daily-tile').first()).toBeVisible();
  await expect(page.getByTestId('daily-loading')).toHaveCount(0);

  await expectFrameHeldItsPlace(page, frame, before);
});
