import { expect, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render audit of the beach map's pan-vs-select distinction. A big
 * venue overflows the map viewport, so the tile grid pans horizontally by mouse drag. The pin:
 * a plain click on a free tile opens the booking dialog, but a drag-pan release does NOT — and
 * the row-code/price side columns stay fixed while the tiles pan. Also pins the #672 restyle as
 * rendered (computed styles, not class lists): the sea→sand wash, the edge fade mask + scroll
 * snap on the pan viewport, per-zone price chips, ghost-taken tiles, and the walk-in treatment.
 * The API is mocked (`page.route`), so the suite is CI-safe with no backend (like
 * booking-flow.e2e.ts). Runs axe over the map.
 */

const ROWS: {
  label: string;
  tier: string;
  pool: string;
  price: number;
  lastSetPrice?: number;
}[] = [
  { label: 'Front row · Sea view', tier: 'PREMIUM', pool: 'ONLINE', price: 5000 },
  { label: 'Row 2', tier: 'STANDARD', pool: 'ONLINE', price: 4000 },
  // Row 3 is mixed-price (one repriced set), so its rail chip must render the span (#689).
  { label: 'Row 3', tier: 'STANDARD', pool: 'ONLINE', price: 3500, lastSetPrice: 4500 },
  { label: 'Row 4 · Back', tier: 'STANDARD', pool: 'ONLINE', price: 3000 },
  { label: 'Row 5 · Walk-in', tier: 'STANDARD', pool: 'WALK_IN', price: 3000 },
];

interface MapSet {
  id: number;
  rowLabel: string;
  positionNo: number;
  tier: string;
  pool: string;
  price: { minorUnits: number; currency: string };
  gridX: number;
  gridY: number;
  availability: string;
}

function wideVenue() {
  const sets: MapSet[] = [];
  let id = 0;
  ROWS.forEach((row, r) => {
    for (let p = 1; p <= 20; p++) {
      id += 1;
      sets.push({
        id,
        rowLabel: row.label,
        positionNo: p,
        tier: row.tier,
        pool: row.pool,
        price: {
          minorUnits: p === 20 ? (row.lastSetPrice ?? row.price) : row.price,
          currency: 'EUR',
        },
        gridX: p,
        gridY: r + 1,
        availability: p % 7 === 0 ? 'TAKEN' : 'FREE', // a few taken per row; the rest free
      });
    }
  });
  return {
    id: 1,
    name: 'Panorama Bay',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'A wide beach — pan the map to see every set.',
    ratingTenths: 47,
    reviewsCount: 210,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

/**
 * A venue that FITS the #700 desktop breakout: 14 columns × 5 rows is the widest map the
 * 1100px card renders whole, and short enough that the wash scroller never overflows its
 * 532px cap — so "no hint" means no hint on either axis.
 */
function fitVenue() {
  const sets: MapSet[] = [];
  let id = 0;
  for (let r = 1; r <= 5; r++) {
    for (let p = 1; p <= 14; p++) {
      id += 1;
      sets.push({
        id,
        rowLabel: `Row ${r}`,
        positionNo: p,
        tier: r === 1 ? 'PREMIUM' : 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits: r === 1 ? 5000 : 3000, currency: 'EUR' },
        gridX: p,
        gridY: r,
        availability: 'FREE',
      });
    }
  }
  return {
    id: 3,
    name: 'Snug Cove',
    beach: 'Borsh',
    region: 'Albanian Riviera',
    description: 'A beach that fits a desktop screen whole.',
    ratingTenths: 46,
    reviewsCount: 34,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

/** The pan viewport's overflow state and the three affordances gated on it. */
async function panState(page: Page) {
  return page.getByTestId('map-pan').evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      overflows: el.scrollWidth > el.clientWidth + 1,
      masked: cs.maskImage !== 'none',
      scrollPaddingLeft: cs.scrollPaddingLeft,
    };
  });
}

/** A venue tall enough (12 rows) that the wash scroller overflows its 532px cap. */
function tallVenue() {
  const sets: MapSet[] = [];
  let id = 0;
  for (let r = 1; r <= 12; r++) {
    for (let p = 1; p <= 20; p++) {
      id += 1;
      sets.push({
        id,
        rowLabel: `Row ${r}`,
        positionNo: p,
        tier: r === 1 ? 'PREMIUM' : 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits: r === 1 ? 5000 : 3000, currency: 'EUR' },
        gridX: p,
        gridY: r,
        availability: 'FREE',
      });
    }
  }
  return {
    id: 2,
    name: 'Tall Bay',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    description: 'A deep beach — the map pans on both axes.',
    ratingTenths: 45,
    reviewsCount: 80,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: wideVenue() }));
  await page.route(/\/api\/venues\/2(\?.*)?$/, (route) => route.fulfill({ json: tallVenue() }));
  await page.route(/\/api\/venues\/3(\?.*)?$/, (route) => route.fulfill({ json: fitVenue() }));
});

test('a plain click on a free tile opens the booking dialog (and the map is accessible)', async ({
  page,
}) => {
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Panorama Bay' })).toBeVisible();
  // A venue wider than the viewport shows the drag-to-pan hint.
  await expect(page.getByTestId('scroll-hint')).toBeVisible();

  // The glass header actually renders its surface — guards the shared-partial extraction: a
  // stripped background drops white header ink onto the bare gradient below AA, which neither the
  // token-based contrast spec nor axe-over-a-gradient can detect.
  const headBg = await page
    .locator('.map-head')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(headBg).not.toBe('transparent');

  // The row-code side labels (A–D) render as the v3 design's subtle chips — a filled, rounded pill,
  // not bare text (design-comparison follow-up). Guards that the chip fill/radius isn't dropped.
  const chip = await page
    .getByTestId('row-code')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) };
    });
  expect(chip.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(chip.bg).not.toBe('transparent');
  expect(chip.radius).toBeGreaterThan(0);

  // Spatial order (v3 design): the photo band (the sea view) sits ABOVE the "▲ Facing the sea"
  // banner, which labels the front-row edge of the grid — sea ↑ / promenade ↓.
  const photoY = (await page.locator('.photo-band').boundingBox())!.y;
  const bannerY = (await page.locator('.sea-banner').boundingBox())!.y;
  expect(photoY).toBeLessThan(bannerY);

  // The sea→sand wash actually paints the map scroller (#672) — computed style, not class list.
  const wash = await page
    .locator('[data-riv-scroller]')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(wash).toContain('linear-gradient');

  // The grid card keeps its elevation (#674: the frame swap silently dropped the drop shadow).
  const frameShadow = await page
    .getByTestId('beach-grid')
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(frameShadow).toContain('rgba(7, 42, 58, 0.28)');

  // One chip per zone (rows 4+5 share €30, #672); mixed Row 3 chips its span, not set 1 (#689).
  await expect(page.getByTestId('row-price')).toHaveText(['€50', '€40', '€35–€45', '€30']);

  // Taken sets are ghosts (#672): translucent FILL + dashed outline — group opacity broke AA.
  const ghost = await page
    .locator('.set-tile.taken')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, borderStyle: cs.borderTopStyle };
    });
  // Last number before ')' is the alpha in rgba()/oklab()/color() alike; an opaque rgb() fails.
  const ghostAlpha = Number(/([\d.]+)\)$/.exec(ghost.bg)?.[1] ?? '1');
  expect(ghostAlpha).toBeLessThan(0.5);
  expect(ghost.borderStyle).toBe('dashed');

  // Free walk-in sets: distinct tiles, never tap targets, and named in the legend (#672).
  const walkins = page.locator('.set-tile.walkin');
  await expect(walkins).toHaveCount(18); // row 5's 20 sets minus its 2 taken ones
  await expect(walkins.first().locator('button')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Walk-in only');

  await expectNoSeriousAxeViolations(page, 'beach map (wide, pannable)');

  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a drag-pan release over a tile pans the map but does NOT open the dialog; side columns stay put', async ({
  page,
}) => {
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Panorama Bay' })).toBeVisible();

  const pan = page.getByTestId('map-pan');
  const rowCode = page.getByTestId('row-code').first();
  const codeXBefore = (await rowCode.boundingBox())!.x;
  const scrollBefore = await pan.evaluate((el) => el.scrollLeft);

  // The #672 edge fade + scroll snap are applied — the drag below proves they don't break panning.
  const viewport = await pan.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { mask: cs.maskImage, snap: cs.scrollSnapType };
  });
  expect(viewport.mask).toContain('linear-gradient');
  expect(viewport.snap).toContain('x');

  // At rest the leading tile sits PAST the 16px fade (inner padding), not half-faded inside it.
  const panBox = (await pan.boundingBox())!;
  const firstTileBox = (await page.locator('.set-tile').first().boundingBox())!;
  expect(firstTileBox.x - panBox.x).toBeGreaterThanOrEqual(16);

  // Drag horizontally across the tile grid (down → move → up), well past the 6px threshold and
  // staying inside the scroller (a drag off its edge would end the pan early via mouseleave).
  // Anchor on a real tile a few columns in — hover() for reliable positioning — then drag left
  // ~120px past the 6px threshold, staying inside the scroller.
  const anchor = page.getByRole('button', { name: /Select to book/ }).nth(4);
  await anchor.hover();
  const box = (await anchor.boundingBox())!;
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.down();
  await page.mouse.move(startX - 40, y, { steps: 6 });
  await page.mouse.move(startX - 120, y, { steps: 12 });
  await page.mouse.up();

  // The tiles panned...
  const scrollAfter = await pan.evaluate((el) => el.scrollLeft);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  // ...the pan-release did NOT open the booking dialog...
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // ...and the row-code column tracked its rows (it sits outside the horizontal scroller).
  const codeXAfter = (await rowCode.boundingBox())!.x;
  expect(Math.abs(codeXAfter - codeXBefore)).toBeLessThan(2);

  // A genuine click afterwards still opens the dialog (the pan suppression is one-shot).
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a vertical drag pans the wash scroller — rails ride along — and its release opens no dialog (#676)', async ({
  page,
}) => {
  await page.goto('/venues/2');
  await expect(page.getByRole('heading', { name: 'Tall Bay' })).toBeVisible();

  // The wash scroller (the OUTER [data-riv-scroller]) is the vertical axis's scroll target.
  const wash = page.locator('[data-riv-scroller]').first();
  await expect.poll(() => wash.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);

  // Anchor mid-map (row H = 8 of 12); hover() scrolls it into view, so measure baselines afterwards.
  const anchor = page.getByRole('button', { name: /^Set H11, Row 8/ });
  await anchor.hover();
  const scrollBefore = await wash.evaluate((el) => el.scrollTop);
  const chipYBefore = (await page.getByTestId('row-code').first().boundingBox())!.y;

  // Drag mostly-vertically (x fixed): up 120px past the 6px threshold, staying inside the map.
  const box = (await anchor.boundingBox())!;
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.down();
  await page.mouse.move(x, startY - 40, { steps: 6 });
  await page.mouse.move(x, startY - 120, { steps: 12 });
  await page.mouse.up();

  // The wash scrolled down...
  const scrollAfter = await wash.evaluate((el) => el.scrollTop);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  // ...the vertical-drag release over a tile did NOT open the booking dialog...
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // ...and the row-code rail scrolled WITH the tiles — it lives inside the wash scroller.
  const chipYAfter = (await page.getByTestId('row-code').first().boundingBox())!.y;
  expect(Math.abs(chipYBefore - chipYAfter - (scrollAfter - scrollBefore))).toBeLessThan(2);

  // A genuine click afterwards still opens the dialog (the suppression is one-shot).
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a 14-column map fits whole at a desktop viewport — no pan, no hint (#700)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/venues/3');
  await expect(page.getByRole('heading', { name: 'Snug Cove' })).toBeVisible();
  // Wait for the grid itself: the pan state is only meaningful once tiles have laid out.
  await expect(page.getByTestId('set-tile').first()).toBeVisible();

  // The whole point of the breakout: the grid renders inside its viewport, so nothing pans...
  const state = await panState(page);
  expect(state.overflows).toBe(false);
  // ...and none of the three pan affordances is applied to a map that doesn't pan.
  await expect(page.getByTestId('scroll-hint')).toHaveCount(0);
  expect(state.masked).toBe(false);
  expect(state.scrollPaddingLeft).toBe('auto');

  // Only the map card breaks out: the header and the legend keep the 780px page shell's width.
  const card = (await page.getByTestId('beach-grid').boundingBox())!;
  const head = (await page.locator('.map-head').boundingBox())!;
  const legend = (await page.getByRole('list', { name: 'Legend' }).boundingBox())!;
  expect(card.width).toBeGreaterThan(head.width);
  expect(legend.width).toBeCloseTo(head.width, 0);

  // A symmetric breakout, not a shift — the wider card stays centred on the header's axis.
  expect(card.x + card.width / 2).toBeCloseTo(head.x + head.width / 2, 0);

  // A vw-derived width would overrun the page by the scrollbar's width; this one must not.
  const pageOverflowsX = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflowsX).toBe(false);

  await expectNoSeriousAxeViolations(page, 'beach map (fits whole, desktop breakout)');

  // The map still books: fitting the screen changes layout, never the tile interaction.
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a venue too wide for the breakout still pans at a desktop viewport (#700)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Panorama Bay' })).toBeVisible();

  // The hint first — it shares the measurement with `.pannable`, so its arrival un-races the read.
  await expect(page.getByTestId('scroll-hint')).toBeVisible();

  // 20 columns outgrow even the widened card, so the pan affordances stay exactly as before.
  const state = await panState(page);
  expect(state.overflows).toBe(true);
  expect(state.masked).toBe(true);
  expect(state.scrollPaddingLeft).toBe('16px');
});

test('the pan affordances follow the viewport across the breakout breakpoint (#700)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/venues/3');
  await expect(page.getByRole('heading', { name: 'Snug Cove' })).toBeVisible();
  await expect(page.getByTestId('scroll-hint')).toHaveCount(0);

  // Below the breakpoint the card drops back to the shell width, so the same map now overflows.
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByTestId('scroll-hint')).toBeVisible();
  await expect.poll(async () => (await panState(page)).overflows).toBe(true);
  await expect.poll(async () => (await panState(page)).masked).toBe(true);
  await expect.poll(async () => (await panState(page)).scrollPaddingLeft).toBe('16px');

  // Mobile: unchanged behaviour — the map pans and says so.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('scroll-hint')).toBeVisible();
  await expect.poll(async () => (await panState(page)).overflows).toBe(true);

  // Widening back past the breakpoint fits the map again, and the cue goes away with the need.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId('scroll-hint')).toHaveCount(0);
  await expect.poll(async () => (await panState(page)).overflows).toBe(false);
  await expect.poll(async () => (await panState(page)).masked).toBe(false);
});
