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

/**
 * The horizontal half of the anti-jump contract (#749): the tile grid must not slide sideways
 * when the read lands, either.
 *
 * <p>The rail that carries the row names was as wide as its widest chip, so it was as wide as
 * whatever the read returned: a placeholder `A` measured 24px, `Front row` 63.14px, and the whole
 * grid moved 39px right on load. That is not a skeleton defect — it is a **loaded-map** defect the
 * skeleton merely made visible on every load, which is why the rail reserves its width in both
 * states rather than only sizing the placeholder. Sizing only the placeholder is strictly worse: a
 * venue whose rows are named `A` would then slide the grid the other way.
 *
 * <p><strong>These assert the mechanism, not a fixture.</strong> The reservation is a 54px
 * MINIMUM, so the residual slide is exactly `max(0, loadedRailWidth − 54)` — computed here from
 * the rail actually rendered rather than compared against a bound tuned to one venue, which is the
 * trap this file's own #744 header warns about. Before the fix the same quantity was
 * `loadedRailWidth − 24`, so the reservation removes 30px of slide from every venue on every
 * surface, and removes all of it wherever the loaded rail fits the reservation.
 *
 * <p><strong>Why a minimum and not the cap.</strong> Pinning the rail at the #724 cap would end
 * the slide outright, and the desktop map cannot afford it: the fits-whole guarantee
 * (`venue-map-pan.e2e.ts`, #700) clears its viewport by ~31px on a 14-column venue, and a
 * cap-sized rail spends 39px of it — measured, as a pan that map is not supposed to need. So the
 * residual survives, and these tests state its size rather than hide it: 0.00px wherever the rail
 * fits the reservation (every tourist phone case, since #724 caps the label there), 9.14px on the
 * `Front row` fixture, and as much as the label is wide on an operator rail, which renders labels
 * whole by that same #724 decision.
 *
 * <p>What the rail SAYS while loading is the unit specs' claim; what it MEASURES is only knowable
 * here.
 */
const RAIL_RESERVE_PX = 54;

/** The rail column the tile viewport sits beside — the element whose width moves the grid. */
function railWidthBeside(page: Page, viewportTestid: string): Promise<number> {
  return page
    .getByTestId(viewportTestid)
    .evaluate((el) => el.parentElement!.firstElementChild!.getBoundingClientRect().width);
}

/** The tile viewport's left edge — the pixel a widening rail pushes. */
async function leftEdgeOf(page: Page, testid: string): Promise<number> {
  const box = await page.getByTestId(testid).boundingBox();
  expect(box, `${testid} has a rendered box`).not.toBeNull();
  return box!.x;
}

/** The price rail beside the viewport — the trailing column, the one that pulls the right edge in. */
function priceRailBeside(page: Page, viewportTestid: string): Promise<number> {
  return page
    .getByTestId(viewportTestid)
    .evaluate((el) => el.parentElement!.lastElementChild!.getBoundingClientRect().width);
}

/** The tile viewport's right edge — the pixel a widening price rail pulls in. */
async function rightEdgeOf(page: Page, testid: string): Promise<number> {
  const box = await page.getByTestId(testid).boundingBox();
  expect(box, `${testid} has a rendered box`).not.toBeNull();
  return box!.x + box!.width;
}

/** Whether the pan viewport really overflows — a hint assertion is vacuous on a grid that fits. */
function overflowsHorizontally(page: Page, testid: string): Promise<boolean> {
  return page.getByTestId(testid).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
}

/**
 * The slide the reservation still allows, and the one it removed — both read off the rail that
 * actually rendered, so a longer row name changes the expectation instead of breaking the test.
 */
async function expectSlideIsWhatTheReservationAllows(
  page: Page,
  before: number,
  loadedViewportTestid: string,
  at: string,
): Promise<void> {
  const rail = await railWidthBeside(page, loadedViewportTestid);
  const after = await leftEdgeOf(page, loadedViewportTestid);
  const allowed = Math.max(0, rail - RAIL_RESERVE_PX);
  expect(
    Math.abs(after - before) - allowed,
    `at ${at} the grid slid only what a ${rail}px rail leaves over the reservation ` +
      `(${before} → ${after}; ${allowed}px allowed, ${rail - 24}px before the fix)`,
  ).toBeLessThan(1);
}

/**
 * The other extreme of the rail's own vocabulary: both names exactly 40 characters, the limit
 * `V43__set_position_row_label_length.sql` and the editor's `maxlength` allow. The uncapped
 * operator rail's worst case is a real number, not an adjective, and it belongs in the matrix.
 */
const LONG_LABEL_VENUE = {
  ...RICH_VENUE,
  sets: sets().map((s) => ({
    ...s,
    rowLabel:
      s.rowLabel === 'Front row'
        ? 'Front row · Sea view · Cabanas & parasol'
        : 'Row 2 · Promenade side · Shaded strips r',
  })),
};

for (const [labels, venue] of [
  ['short row names', RICH_VENUE],
  ['row names at the 40-character limit', LONG_LABEL_VENUE],
] as const) {
  for (const [size, viewport] of [
    ['desktop', DESKTOP],
    ['a phone', PHONE],
  ] as const) {
    test(`the tourist beach map’s rail holds its width across the load — ${labels}, ${size} (#749)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const release = await holdVenueRead(page, venue);

      await page.goto('/venues/1');
      await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
      const before = await leftEdgeOf(page, 'map-skeleton-grid');

      release();
      await expect(page.getByTestId('set-tile').first()).toBeVisible();

      await expectSlideIsWhatTheReservationAllows(page, before, 'map-pan', `${labels}, ${size}`);
    });

    test(`the Daily view’s rail holds its width across the load — ${labels}, ${size} (#749)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockWholeConsole(page);
      const release = await holdVenueRead(page, venue);

      await page.goto('/operator/1/daily');
      await signInAsOperator(page);
      await expect(page.getByTestId('daily-skeleton-tile').first()).toBeVisible();
      const before = await leftEdgeOf(page, 'daily-skeleton-grid');

      release();
      await expect(page.getByTestId('daily-tile').first()).toBeVisible();

      await expectSlideIsWhatTheReservationAllows(page, before, 'daily-grid', `${labels}, ${size}`);
    });
  }
}

/** The one case the #724 cap closes outright: a phone, where no label can exceed the reservation. */
test('the tourist beach map’s phone rail does not move at all (#749)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const release = await holdVenueRead(page, LONG_LABEL_VENUE);

  await page.goto('/venues/1');
  await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
  const before = await leftEdgeOf(page, 'map-skeleton-grid');

  release();
  await expect(page.getByTestId('set-tile').first()).toBeVisible();

  const after = await leftEdgeOf(page, 'map-pan');
  expect(
    Math.abs(after - before),
    `a 40-character label truncates to the reservation, so nothing moved (${before} → ${after})`,
  ).toBeLessThan(1);
});

for (const [surface, tileTestid, gridTestid, open] of [
  ['the tourist beach map', 'map-skeleton-tile', 'map-skeleton-grid', 'tourist'],
  ['the Daily view', 'daily-skeleton-tile', 'daily-skeleton-grid', 'operator'],
] as const) {
  test(`${surface}’s skeleton instructs no gesture its inert container can accept (#749)`, async ({
    page,
  }) => {
    // 390px is where the 4 × 6 placeholder grid overflows, which is what used to emit the hint.
    await page.setViewportSize(PHONE);
    if (open === 'operator') {
      await mockWholeConsole(page);
    }
    const release = await holdVenueRead(page, RICH_VENUE);

    await page.goto(open === 'operator' ? '/operator/1/daily' : '/venues/1');
    if (open === 'operator') {
      await signInAsOperator(page);
    }
    await expect(page.getByTestId(tileTestid).first()).toBeVisible();
    // What the rail says is the unit specs' claim (AC-1); what it MEASURES is only knowable here.
    await expect(page.getByTestId('row-code')).toHaveCount(0);
    await expect(page.getByTestId('row-code-placeholder').first()).toHaveText('');

    expect(
      await overflowsHorizontally(page, gridTestid),
      'the placeholder grid really does overflow, so the suppressed hint is the live case',
    ).toBe(true);
    await expect(page.getByTestId('scroll-hint')).toHaveCount(0);
    await expect(page.getByTestId(gridTestid)).not.toHaveClass(/cursor-grab/);

    release();
    await expect(
      page.getByTestId(open === 'operator' ? 'daily-tile' : 'set-tile').first(),
    ).toBeVisible();
    // The loaded map overflows the same phone, so the hint the skeleton withheld is now honest.
    await expect(page.getByTestId('scroll-hint')).toHaveCount(1);
    // The card grows by that line here: a settle DOWNWARD, which is the direction #744 chose.
  });
}

/**
 * The trailing-edge half of the same contract (#751): the tile viewport must not narrow from the
 * right when the read lands, either.
 *
 * <p>The price rail carried a `min-w-[52px]` cell floor and nothing else, so a skeleton — which
 * renders no chip at all — measured 52px while the loaded rail measured whatever its widest zone
 * chip did, up to the #724 cap. Nothing slid: the rail is at the **trailing** edge, so tile
 * positions never moved. What moved was how much of the map you could see, by as much as 76px.
 *
 * <p><strong>The right edge, not the width.</strong> The viewport's width answers to both rails at
 * once, and the left one has its own reservation and its own residual (#749). Its right edge
 * answers to this rail alone, which is what makes the expectation below arithmetic rather than a
 * tolerance.
 *
 * <p><strong>These assert the mechanism, not a fixture.</strong> The reservation is a 92px
 * MINIMUM, so the residual is exactly `max(0, loadedPriceRail − 92)`, computed here from the rail
 * that actually rendered. Before the fix the same quantity was `loadedPriceRail − 52`, so the
 * reservation removes 40px of narrowing from every venue that reaches its cap. At 390 the
 * reservation and the #724 phone cap are the same number, so the allowance is 0 for **every**
 * venue — the one viewport where this closes outright.
 *
 * <p>Why 92 and not the desktop cap: a 14-column venue at 1280 has ~125.6px for this rail before
 * that map has to pan, and `venue-map-pan.e2e.ts` holds the far side of that line.
 */
const PRICE_RAIL_RESERVE_PX = 92;

/** One zone, one bare amount: the chip is 40.97px, so this venue's rail IS the reservation. */
const BARE_PRICE_VENUE = {
  ...RICH_VENUE,
  sets: sets().map((s) => ({
    ...s,
    tier: 'STANDARD',
    price: { minorUnits: 3000, currency: 'EUR' },
  })),
};

/**
 * The other extreme: a four-digit min–max span plus a qualifier, which ellipsizes at either cap.
 *
 * <p>The prices alternate WITHIN each row on purpose. Priced uniformly per row — which is what
 * this fixture used to do — `rowPriceLabel` renders one amount and the span never appears, so the
 * widest chip the rail can carry went unexercised while the docstring claimed it. Alternating
 * makes the row's sets differ, which is `formatMoneyRange`'s own condition for a span: the chip
 * renders `€125–€9,995 · Front row` and measures the full 128px desktop cap.
 */
const WIDE_PRICE_VENUE = {
  ...RICH_VENUE,
  sets: sets().map((s, i) => ({
    ...s,
    tier: 'PREMIUM',
    price: { minorUnits: i % 2 === 0 ? 12500 : 999500, currency: 'EUR' },
  })),
};

for (const [prices, venue, chip] of [
  ['bare amounts, under the reservation', BARE_PRICE_VENUE, /^€30$/],
  ['price phrases past the cap', WIDE_PRICE_VENUE, /^€125–€9,995 · Front row$/],
] as const) {
  for (const [size, viewport] of [
    ['desktop', DESKTOP],
    ['a phone', PHONE],
  ] as const) {
    test(`the tourist beach map’s price rail holds its width across the load — ${prices}, ${size} (#751)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const release = await holdVenueRead(page, venue);

      await page.goto('/venues/1');
      await expect(page.getByTestId('map-skeleton-tile').first()).toBeVisible();
      const before = await rightEdgeOf(page, 'map-skeleton-grid');

      release();
      await expect(page.getByTestId('set-tile').first()).toBeVisible();

      // The fixture renders the vocabulary it claims; a docstring cannot notice when it stops.
      await expect(page.getByTestId('row-price').first()).toHaveText(chip);

      const rail = await priceRailBeside(page, 'map-pan');
      const after = await rightEdgeOf(page, 'map-pan');
      // The reservation itself: on a narrow-chip venue the arithmetic below reads only 0 == 0.
      expect(
        rail,
        `at ${prices}, ${size} the loaded rail is at least the reservation`,
      ).toBeGreaterThan(PRICE_RAIL_RESERVE_PX - 1);

      // Signed, and an equality: an unsigned ceiling passes a zero reading and a widening alike.
      const narrowed = before - after;
      const allowed = Math.max(0, rail - PRICE_RAIL_RESERVE_PX);
      expect(
        Math.abs(narrowed - allowed),
        `at ${prices}, ${size} the viewport narrowed by exactly what a ${rail}px rail leaves ` +
          `over the reservation (${before} → ${after}; ${allowed}px expected, ${narrowed} seen)`,
      ).toBeLessThan(1);
    });
  }
}
