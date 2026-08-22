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
 * <p><strong>The fixtures are the point.</strong> A skeleton mirrors block shapes, so its error is
 * whatever the shapes cannot predict: the tourist header's description and amenity chips are both
 * conditional, and a phone wraps rows a desktop keeps on one line. So the tourist case runs over
 * both extremes of that content (a venue with both, a venue with neither) at both a desktop and a
 * phone viewport — measuring only the rich desktop case is how a skeleton tuned to one fixture
 * passes while jumping for everyone else.
 */

/**
 * The bound is **directional, and that is the contract** — not a tolerance picked for comfort.
 *
 * <p>The tourist header carries two conditional blocks (a description, an amenity row) worth ~65px
 * together, and no fixed skeleton can know whether a venue has them: mirroring both makes the frame
 * jump UP by that much on a venue with neither, mirroring neither makes it settle DOWN by that much
 * on a venue with both. So the skeleton mirrors only what the header *always* renders, which buys a
 * guarantee worth more than a symmetric ±33px band: the frame never rises, it only ever settles
 * downward as real content lands.
 *
 * <p>`MAX_RISE_PX` is therefore tight — it is the whole claim, and a skeleton that starts
 * overshooting the minimal header trips it immediately. `MAX_SETTLE_PX` is the loose half: it only
 * has to sit above the conditional content's own height, which is what the frame settles by when a
 * venue turns out to carry all of it, and it keeps a wide margin so font-metric drift on a browser
 * bump cannot turn the half that carries no claim amber.
 *
 * <p><strong>The guarantee covers the frame's own top edge, and deliberately stops there.</strong>
 * What sits *below* the map card moves with the map's real size, and that is unknowable before the
 * read: the placeholder grid is four rows because that is what the bulk generator makes, so a
 * two-row venue lifts the Daily view's arrivals card ~114px, and a venue with no layout at all
 * renders an empty-state panel instead of a grid. Both were measured; neither is a defect a
 * skeleton can design away, and asserting otherwise would encode a promise this cannot keep.
 *
 * <p>The three venue shapes are chosen to bracket the conditional content rather than to sample it:
 * one carrying every optional block, one carrying none, and one whose owner has drawn no layout at
 * all — the last is what catches a skeleton that reserves height for the availability bar or the
 * grid, both of which that venue's loaded page does not render. Measured settle, no rise anywhere:
 * 89.2 / 155.3px (rich, desktop / phone), 23.6 / 89.7px (bare), 11.1 / 53.2px (no layout).
 *
 * <p>Neither bound is what catches the regression #744 fixed: under the sentence these replaced
 * there is no frame to measure at all, so `topOf` fails before either is consulted.
 */
const MAX_RISE_PX = 4;
const MAX_SETTLE_PX = 180;

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

function sets() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 12 ? 'Front row' : 'Row 2',
    positionNo: (i % 12) + 1,
    tier: i < 12 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: i < 12 ? 4500 : 3500, currency: 'EUR' },
    gridX: (i % 12) + 1,
    gridY: i < 12 ? 1 : 2,
    availability: 'FREE',
  }));
}

/** Everything the header can optionally carry: a description AND an amenity row. */
const RICH_VENUE = {
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
  sets: sets(),
};

/** The other extreme: no description, no amenities, no distance-to-water chip, never rated. */
const BARE_VENUE = {
  ...RICH_VENUE,
  description: null,
  amenities: [],
  distanceToWaterM: null,
  ratingTenths: null,
  reviewsCount: 0,
};

/**
 * The third shape, and the one that catches an over-reserving skeleton: a venue whose owner has
 * not drawn a layout yet (#717). Its overview card drops the availability bar and its map card
 * drops the grid for the empty-state slot, so any placeholder the skeleton draws for either is
 * height the frame loses on load.
 */
const EMPTY_VENUE = { ...BARE_VENUE, sets: [], fromPrice: null };

/** The viewport-relative top edge of a frame, which is what a layout jump moves. */
async function topOf(frame: Locator): Promise<number> {
  const box = await frame.boundingBox();
  expect(box, 'the frame has a rendered box').not.toBeNull();
  return box!.y;
}

async function expectFrameHeldItsPlace(frame: Locator, before: number, at: string): Promise<void> {
  const after = await topOf(frame);
  const shift = after - before;
  expect(
    shift,
    `the map frame did not rise when content landed at ${at} (${before} → ${after})`,
  ).toBeGreaterThan(-MAX_RISE_PX);
  expect(shift, `the map frame settled only slightly at ${at} (${before} → ${after})`).toBeLessThan(
    MAX_SETTLE_PX,
  );
}

/** Hold a route open, handing back the release. */
async function holdVenueRead(page: Page, json: object): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
    await held;
    await route.fulfill({ json });
  });
  return release;
}

for (const [shape, venue, settled] of [
  ['a venue carrying every optional header block', RICH_VENUE, 'set-tile'],
  ['a venue carrying none of them', BARE_VENUE, 'set-tile'],
  ['a venue with no layout drawn yet', EMPTY_VENUE, 'map-empty'],
] as const) {
  for (const [size, viewport] of [
    ['desktop', DESKTOP],
    ['a phone', PHONE],
  ] as const) {
    test(`the tourist beach map holds its frame across the load — ${shape}, ${size} (#744)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const release = await holdVenueRead(page, venue);

      await page.goto('/venues/1');

      const loading = page.getByTestId('map-loading');
      await expect(loading).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
      // The sentence this replaced; the announcer, not the skeleton, carries the words (#741).
      await expect(loading).not.toContainText('Loading the beach map');

      const frame = page.getByTestId('beach-grid');
      const before = await topOf(frame);

      release();
      await expect(page.getByTestId(settled).first()).toBeVisible();
      await expect(page.getByTestId('map-loading')).toHaveCount(0);

      await expectFrameHeldItsPlace(frame, before, `${shape}, ${size}`);
    });
  }
}

/**
 * Tab through the page and report whether focus ever lands inside the skeleton.
 *
 * <p>The unit specs assert the `inert` attribute is present; only a browser can say it works. This
 * is the case that needs it: an overflowing scroll container is keyboard-focusable in Chromium with
 * no `tabindex` at all, so a skeleton carrying only `aria-hidden` puts a tab stop inside content
 * hidden from assistive tech — and axe's `aria-hidden-focus` rule does not see implicit scroller
 * focusability either.
 */
async function tabReachesSkeleton(page: Page, testId: string, steps = 12): Promise<boolean> {
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      // `!= null`: with focus nowhere `?.` yields undefined, which `!==` would read as "inside".
      (id) => document.activeElement?.closest(`[data-testid="${id}"]`) != null,
      testId,
    );
    if (inside) {
      return true;
    }
  }
  return false;
}

test('no tab stop hides inside the tourist skeleton (#744)', async ({ page }) => {
  // The phone width is where the tile grid overflows, which is what makes the viewport focusable.
  await page.setViewportSize(PHONE);
  const release = await holdVenueRead(page, RICH_VENUE);
  await page.goto('/venues/1');
  await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();

  expect(await tabReachesSkeleton(page, 'map-loading')).toBe(false);

  release();
  await expect(page.getByTestId('set-tile').first()).toBeVisible();
});

test('no tab stop hides inside the Daily view skeleton (#744)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockWholeConsole(page);
  const release = await holdVenueRead(page, RICH_VENUE);

  await page.goto('/operator/1/daily');
  await signInAsOperator(page);
  await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();

  expect(await tabReachesSkeleton(page, 'daily-loading')).toBe(false);

  release();
  await expect(page.getByTestId('daily-tile').first()).toBeVisible();
});

test('the tourist beach map’s loading state is axe-clean (#744)', async ({ page }) => {
  const release = await holdVenueRead(page, RICH_VENUE);
  await page.goto('/venues/1');

  await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Beach map, loading');

  release();
  await expect(page.getByTestId('set-tile').first()).toBeVisible();
});

for (const [size, viewport] of [
  ['desktop', DESKTOP],
  ['a phone', PHONE],
] as const) {
  test(`the operator Daily view holds its grid frame across the load — ${size} (#744)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockWholeConsole(page);
    // Registered last, so it wins over the whole-console venue read and can be held open.
    const release = await holdVenueRead(page, RICH_VENUE);

    await page.goto('/operator/1/daily');
    await signInAsOperator(page);

    const loading = page.getByTestId('daily-loading');
    await expect(loading).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();
    await expect(loading).not.toContainText('Loading the daily view');

    const frame = page.getByTestId('daily-grid-frame');
    const before = await topOf(frame);
    release();
    await expect(page.getByTestId('daily-tile').first()).toBeVisible();
    await expect(page.getByTestId('daily-loading')).toHaveCount(0);

    await expectFrameHeldItsPlace(frame, before, size);
  });
}

test('the Daily view’s grid frame holds for a venue with no mapped sets (#744)', async ({
  page,
}) => {
  await mockWholeConsole(page);
  const release = await holdVenueRead(page, EMPTY_VENUE);

  await page.goto('/operator/1/daily');
  await signInAsOperator(page);
  await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();

  const frame = page.getByTestId('daily-grid-frame');
  const before = await topOf(frame);

  release();
  await expect(page.getByTestId('daily-map-empty')).toBeVisible();

  await expectFrameHeldItsPlace(frame, before, 'no mapped sets');
});

test('the operator Daily view’s loading state is axe-clean (#744)', async ({ page }) => {
  await mockWholeConsole(page);
  const release = await holdVenueRead(page, RICH_VENUE);

  await page.goto('/operator/1/daily');
  await signInAsOperator(page);

  await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'Daily view, loading');

  release();
  await expect(page.getByTestId('daily-tile').first()).toBeVisible();
});
