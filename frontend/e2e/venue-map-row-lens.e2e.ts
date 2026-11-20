import { expect, type Locator, type Page, test } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, refuseBookingAsTaken, settle } from './support/booking-dialog';
import { miramarMapVenue } from './support/miramar-map';
import { expectTouchTargets } from './support/touch-targets';
import type { MockVenueMapView } from './support/venue-views';
import { wideBeachVenue, withEveryState } from './support/wide-beach-map';

/**
 * The tourist beach map on a phone is the row lens (#1762): every row at overview scale, one row
 * open to 44px tiles, and a pick that a bottom bar books. Measured at 390px on the seeded Miramar
 * shape (row A 13 wide, B–I 7) and on made-up beaches at the layout editor's limits. Mocked API,
 * CI-safe. The lens's own contract is `shared/beach-row-lens.spec.ts`; the colours' maths is
 * `venue/venue-map-lens.contrast.spec.ts`, and this file proves they paint at 12px.
 */

const THEMES = ['porcelain', 'riviera', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** A stay two days out, so the every-state fixture's partly-free sets have a day to be free on. */
function stayDates(): { first: string; last: string } {
  const day = (offset: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  return { first: day(3), last: day(4) };
}

async function openMap(
  page: Page,
  venue: MockVenueMapView,
  options: { theme?: Theme; query?: string; width?: number } = {},
): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: venue }));
  await page.addInitScript(
    (id) => localStorage.setItem('riviera-theme', id),
    options.theme ?? 'porcelain',
  );
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  await page.goto(`/venues/1${options.query ?? ''}`);
  await expect(page.locator('html')).toHaveAttribute(
    'data-riv-theme',
    options.theme ?? 'porcelain',
  );
  await expect(page.getByTestId('row-lens')).toBeVisible();
  // The default open row animates in: nothing is measured before it has.
  await settle(page);
}

const closedRow = (page: Page, code: string): Locator => page.locator(`[data-lens-row="${code}"]`);
const openRow = (page: Page, code: string): Locator => page.locator(`[data-lens-open="${code}"]`);
const tile = (page: Page, row: string, spot: number): Locator =>
  page.getByRole('button', { name: new RegExp(`^${row} · spot ${spot},`) });

/** Each closed row's overview scroll offset, top to bottom. */
function overviewOffsets(page: Page): Promise<number[]> {
  return page
    .locator('[data-lens-cells]')
    .evaluateAll((scrollers) => scrollers.map((s) => Math.round(s.scrollLeft)));
}

/** The sizes of every overview cell in one closed row. */
function cellWidths(row: Locator): Promise<number[]> {
  return row
    .getByTestId('lens-cell')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
}

for (const theme of THEMES) {
  test(`all nine Miramar rows show at 390px with one row open — ${theme}`, async ({ page }) => {
    await openMap(page, miramarMapVenue(), { theme });

    // The first row with a free set is open; the other eight are closed buttons.
    await expect(page.getByTestId('lens-open')).toHaveCount(1);
    await expect(openRow(page, 'A')).toBeVisible();
    const rows = page.getByTestId('lens-row');
    await expect(rows).toHaveCount(8);

    const lens = (await page.getByTestId('row-lens').boundingBox())!;
    for (const row of await rows.all()) {
      const box = (await row.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Full width: the wash's content box, its 12px padding a side.
      expect(box.width).toBeGreaterThanOrEqual(lens.width - 24 - 0.5);
      await expect(row).toHaveAttribute('aria-expanded', 'false');
    }
    // Only the row is pressable, never a cell, and nothing needs a sideways pan to be seen.
    await expect(page.locator('[data-lens-cells] :is(button, a)')).toHaveCount(0);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overview: [...document.querySelectorAll('[data-lens-cells]')].map(
        (s) => s.scrollWidth - s.clientWidth,
      ),
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(Math.max(...overflow.overview)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('lens-position')).toHaveCount(0);

    // A 13-wide open row pans inside the open row; its tiles keep the 44px floor.
    const pan = openRow(page, 'A').getByTestId('lens-pan');
    expect(await pan.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(44);
    const first = (await tile(page, 'A', 2).boundingBox())!;
    expect(first.width).toBeGreaterThanOrEqual(44);
    expect(first.height).toBeGreaterThanOrEqual(44);

    await expectTouchTargets(page, `tourist row lens with a row open at 390px, ${theme}`);
    await expectNoSeriousAxeViolations(page, `tourist row lens with a row open at 390px, ${theme}`);
  });

  test(`a 7-wide row fits at 44px and a tap picks a set — ${theme}`, async ({ page }) => {
    await openMap(page, miramarMapVenue(), { theme });
    await closedRow(page, 'B').click();
    // The open animation scales the row: measure once it has rendered and run.
    await expect(openRow(page, 'B')).toBeVisible();
    await settle(page);

    const pan = openRow(page, 'B').getByTestId('lens-pan');
    const tiles = openRow(page, 'B').getByTestId('set-tile');
    await expect(tiles).toHaveCount(7);
    expect(await pan.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const panBox = (await pan.boundingBox())!;
    for (const each of await tiles.all()) {
      const box = (await each.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(panBox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(panBox.x + panBox.width + 0.5);
    }

    await tile(page, 'B', 2).click();

    await expect(tile(page, 'B', 2)).toHaveAttribute('aria-pressed', 'true');
    // The pointer still rests on the tile: its hover wash must not pale the pick's solid fill.
    await tile(page, 'B', 2).hover();
    await settle(page);
    await expect(tile(page, 'B', 2)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const bar = page.getByTestId('pick-bar');
    await expect(bar).toContainText('B · spot 2 · €35 · full day');
    // The tick overhangs its tile; the pan viewport, which clips, has the headroom for all of it.
    const tick = (await page.getByTestId('pick-tick').boundingBox())!;
    const picked = (await tile(page, 'B', 2).boundingBox())!;
    // Measured afresh: the hover above may have scrolled the page.
    const view = (await pan.boundingBox())!;
    expect(tick.y).toBeLessThan(picked.y);
    expect(tick.y).toBeGreaterThanOrEqual(view.y);
    expect(tick.x + tick.width).toBeLessThanOrEqual(view.x + view.width);

    await expectTouchTargets(page, `tourist row lens with a pick at 390px, ${theme}`);
    await expectNoSeriousAxeViolations(page, `tourist row lens with a pick at 390px, ${theme}`);
  });
}

test('the bar books the pick: its action opens the dialog, and dismissing keeps the pick', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  await tile(page, 'A', 4).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByTestId('pick-book').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Spot 4 · Premium');

  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(tile(page, 'A', 4)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pick-book')).toBeFocused();

  // A second tap clears the pick and the bar.
  await tile(page, 'A', 4).click();
  await expect(page.getByTestId('pick-bar')).toHaveCount(0);
});

test('a pick the dialog reports just taken goes when the dialog closes: no bar, no solid cell, focus on the open row (#1809)', async ({
  page,
}) => {
  await refuseBookingAsTaken(page, await mockChallengeFence(page, 'on'));
  const venue = miramarMapVenue();
  await openMap(page, venue);
  // Every read after the first shows A4 as the server now has it.
  const sets = venue.sets.map((set) =>
    set.rowLabel === 'A' && set.positionNo === 4 ? { ...set, availability: 'TAKEN' as const } : set,
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...venue, sets } }),
  );
  await tile(page, 'A', 4).click();
  await page.getByTestId('pick-book').click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');
  await expect(dialog.getByRole('alert')).toContainText('someone just booked this set');

  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('pick-bar')).toHaveCount(0);
  await expect(tile(page, 'A', 4)).toHaveCount(0);
  await expect(page.locator('[data-testid="lens-cell"][data-state="pick"]')).toHaveCount(0);
  await expect(page.getByTestId('pick-status')).toHaveText('');
  // The bar's action held focus and went with the bar: the open row takes it and names its count.
  await expect(openRow(page, 'A')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'tourist row lens refreshed after a taken pick');
});

test('the pick stays solid on the overview while its row is closed, and every row clears the bar', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  await closedRow(page, 'F').click();
  await tile(page, 'F', 3).click();
  await closedRow(page, 'A').click();

  const picked = closedRow(page, 'F').locator('[data-state="pick"]');
  await expect(picked).toHaveCount(1);
  await expect(page.locator('[data-testid="lens-cell"][data-state="pick"]')).toHaveCount(1);
  // Solid: the fill is a border on ::after as wide as half the cell, in the cell's own colour.
  const solid = await picked.evaluate((cell) => {
    const after = getComputedStyle(cell, '::after');
    return {
      fill: Number.parseFloat(after.borderTopWidth) * 2,
      inner: cell.clientWidth,
      sameInk: after.borderTopColor === getComputedStyle(cell).color,
    };
  });
  expect(solid.fill).toBeGreaterThanOrEqual(solid.inner - 0.5);
  expect(solid.sameInk).toBe(true);

  // The page's content ends where the spacer starts: scrolled to the end, the bar covers none of it.
  const contentEnd = async (): Promise<number> => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return (await page.getByTestId('pick-bar-spacer').boundingBox())!.y;
  };
  const bar = page.getByTestId('pick-bar');
  expect(await contentEnd()).toBeLessThanOrEqual((await bar.boundingBox())!.y);

  // A longer translation on the narrowest phone, stood in for by a squeezed summary: three lines.
  const oneLine = (await bar.boundingBox())!.height;
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByTestId('pick-summary')).toContainText('€20 · full day');
  await page.getByTestId('pick-summary').evaluate((el) => (el.style.maxWidth = '72px'));
  await settle(page);
  expect((await bar.boundingBox())!.height).toBeGreaterThan(oneLine);
  expect(await contentEnd()).toBeLessThanOrEqual((await bar.boundingBox())!.y);
});

test('opening a row keeps it where it was, closes the other and focuses its first free tile', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  // Scrolled into view first: a click scrolls its target there, which is not the lens moving it.
  await closedRow(page, 'F').scrollIntoViewIfNeeded();
  const before = (await closedRow(page, 'F').boundingBox())!;

  await closedRow(page, 'F').click();

  await expect(openRow(page, 'F')).toBeVisible();
  await expect(openRow(page, 'A')).toHaveCount(0);
  await settle(page);
  const after = (await openRow(page, 'F').boundingBox())!;
  // Row A closing above took ~70px out of the page; the tapped row did not move with it.
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(6);
  // F1 is taken on this fixture: the first free tile is F2.
  await expect(tile(page, 'F', 2)).toBeFocused();

  await openRow(page, 'F').getByTestId('lens-close').click();

  await expect(page.getByTestId('lens-open')).toHaveCount(0);
  await expect(page.getByTestId('lens-tap-hint')).toHaveText(
    'Tap a row to open it and pick a set.',
  );
  await expect(closedRow(page, 'F')).toBeFocused();
});

test('an open row starts at its first free set when none shows from position 1, and at the pick when it holds it', async ({
  page,
}) => {
  const venue = miramarMapVenue();
  await openMap(page, {
    ...venue,
    // Row A's first nine sets are taken: nothing free shows in the seven tiles from position 1.
    sets: venue.sets.map((set) =>
      set.rowLabel === 'A' ? { ...set, availability: set.positionNo <= 9 ? 'TAKEN' : 'FREE' } : set,
    ),
  });

  const pan = openRow(page, 'A').getByTestId('lens-pan');
  await expect.poll(() => pan.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const inView = async (locator: Locator): Promise<boolean> => {
    const box = (await locator.boundingBox())!;
    const view = (await pan.boundingBox())!;
    return box.x >= view.x - 0.5 && box.x + box.width <= view.x + view.width + 0.5;
  };
  expect(await inView(tile(page, 'A', 10))).toBe(true);

  // Pick the last set, leave the row and come back: the row opens on the pick.
  await pan.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await tile(page, 'A', 13).click();
  await closedRow(page, 'B').click();
  await closedRow(page, 'A').click();
  await expect(tile(page, 'A', 13)).toHaveAttribute('aria-pressed', 'true');
  expect(await inView(tile(page, 'A', 13))).toBe(true);
  // Focus lands on the tile in view, not on the first free tile scrolled out of it.
  await expect(tile(page, 'A', 13)).toBeFocused();
});

test.describe('the open row’s edges', () => {
  /** Miramar with every set of row A free, so any of its 13 tiles can be picked; row A opens first. */
  async function openRowA(page: Page, width = 390): Promise<Locator> {
    const venue = miramarMapVenue();
    await openMap(
      page,
      {
        ...venue,
        sets: venue.sets.map((set) =>
          set.rowLabel === 'A' ? { ...set, availability: 'FREE' as const } : set,
        ),
      },
      { width },
    );
    // Mid-screen, clear of the page's fixed bars: a click that had to scroll to its tile would pan the row.
    await openRow(page, 'A').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    return openRow(page, 'A').getByTestId('lens-pan');
  }
  /** The lens answers a resize from an observer, a frame or two after the viewport changes. */
  async function resize(page: Page, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    await settle(page);
  }
  /** Polled: the lens moves the row a render, or a resize observer's turn, after the cause. */
  async function inside(pan: Locator, part: Locator, what: string): Promise<void> {
    await expect(async () => {
      const box = (await part.boundingBox())!;
      const view = (await pan.boundingBox())!;
      expect(box.x, `${what}: inside the leading edge`).toBeGreaterThanOrEqual(view.x - 0.5);
      expect(box.x + box.width, `${what}: inside the trailing edge`).toBeLessThanOrEqual(
        view.x + view.width + 0.5,
      );
    }).toPass({ timeout: 5000 });
  }
  /** The last spot whose tile lies wholly inside the pan viewport. */
  function lastWhole(pan: Locator): Promise<number> {
    return pan.evaluate((el) => {
      const view = el.getBoundingClientRect();
      const whole = [...el.querySelectorAll('[data-testid="set-tile"]')].map((tile) => {
        const box = tile.getBoundingClientRect();
        return box.left >= view.left && box.right <= view.right;
      });
      return whole.lastIndexOf(true) + 1;
    });
  }
  async function pick(page: Page, spot: number, options?: { position: { x: number; y: number } }) {
    await tile(page, 'A', spot).click(options);
    await expect(tile(page, 'A', spot)).toHaveAttribute('aria-pressed', 'true');
    await settle(page);
  }

  // Widths where a tile's far edge lands on, beside and well inside the viewport's.
  for (const width of [360, 374, 376, 377, 378, 390, 412]) {
    test(`at ${width}px nothing fades, and the last whole tile is picked with its tick whole`, async ({
      page,
    }) => {
      const pan = await openRowA(page, width);
      expect(await pan.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(1);
      expect(await pan.evaluate((el) => getComputedStyle(el).maskImage)).toBe('none');

      const spot = await lastWhole(pan);
      expect(spot).toBeGreaterThanOrEqual(5);
      await pick(page, spot);

      await expect(tile(page, 'A', spot)).toHaveAttribute('aria-pressed', 'true');
      await inside(pan, tile(page, 'A', spot), `picked tile ${spot}`);
      await inside(pan, pan.getByTestId('pick-tick'), `the tick on tile ${spot}`);
    });
  }

  test('a tile cut by the far edge is brought in whole when it is picked', async ({ page }) => {
    const pan = await openRowA(page);
    const cut = (await lastWhole(pan)) + 1;
    const cutBox = (await tile(page, 'A', cut).boundingBox())!;
    const edge = await pan.boundingBox().then((view) => view!.x + view!.width);
    expect(cutBox.x + 4, 'the tile shows enough to tap').toBeLessThan(edge);
    expect(cutBox.x + cutBox.width, 'the tile is cut').toBeGreaterThan(edge);

    await pick(page, cut, { position: { x: 4, y: 22 } });

    await expect(tile(page, 'A', cut)).toHaveAttribute('aria-pressed', 'true');
    await inside(pan, tile(page, 'A', cut), `picked tile ${cut}`);
    await inside(pan, pan.getByTestId('pick-tick'), `the tick on tile ${cut}`);
  });

  test('a row reopened on its last set shows the pick and its tick whole at the far end', async ({
    page,
  }) => {
    const pan = await openRowA(page);
    await pan.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await settle(page);
    await pick(page, 13);
    await closedRow(page, 'B').click();
    await closedRow(page, 'A').click();
    await expect(openRow(page, 'A')).toBeVisible();
    await settle(page);

    expect(await pan.evaluate((el) => el.scrollLeft)).toBeGreaterThan(1);
    expect(await pan.evaluate((el) => getComputedStyle(el).maskImage)).toBe('none');
    await inside(pan, tile(page, 'A', 13), 'the pick');
    await inside(pan, pan.getByTestId('pick-tick'), 'the tick');
  });

  test('a narrower viewport that pushes the pick out brings it back in', async ({ page }) => {
    const pan = await openRowA(page, 430);
    const spot = await lastWhole(pan);
    await pick(page, spot);
    expect((await tile(page, 'A', spot).boundingBox())!.x).toBeGreaterThan(320);

    await resize(page, 320);

    expect(await lastWhole(pan)).toBeLessThan(13);
    await inside(pan, tile(page, 'A', spot), `picked tile ${spot}`);
    await inside(pan, pan.getByTestId('pick-tick'), 'the tick');
  });

  test('a row panned away from its pick stays there on a resize, until a wider one shows the pick', async ({
    page,
  }) => {
    const pan = await openRowA(page, 428);
    await pick(page, 2);
    await pan.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await settle(page);
    const panned = await pan.evaluate((el) => el.scrollLeft);

    await resize(page, 427);
    expect(await pan.evaluate((el) => el.scrollLeft)).toBeGreaterThanOrEqual(panned);

    // Wide enough that the row's far end leaves the pick partly in view.
    await resize(page, 600);
    await inside(pan, tile(page, 'A', 2), 'the pick a wider viewport brought back');
  });

  test('where a tile’s edge lands on the viewport’s, the thumb says the row pans', async ({
    page,
  }) => {
    const pan = await openRowA(page, 428);
    const thumb = openRow(page, 'A').getByTestId('lens-open-thumb');
    const span = async (): Promise<{ left: number; width: number }> => {
      const track = (await openRow(page, 'A').getByTestId('lens-open-track').boundingBox())!;
      const box = (await thumb.boundingBox())!;
      return { left: (box.x - track.x) / track.width, width: box.width / track.width };
    };
    const shown = await pan.evaluate((el) => el.clientWidth / el.scrollWidth);
    expect(shown).toBeLessThan(0.75);
    expect((await span()).left).toBeCloseTo(0, 2);
    expect((await span()).width).toBeCloseTo(shown, 2);

    await pan.evaluate((el) => (el.scrollLeft = el.scrollWidth));

    await expect.poll(async () => (await span()).left).toBeCloseTo(1 - shown, 2);
  });
});

test('a focused tile’s ring fits inside the open row’s viewport, below and beside it', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  const pan = openRow(page, 'A').getByTestId('lens-pan');
  /** The 3px focus ring at its 2px offset. */
  const RING = 5;
  // Tab along the row, as a keyboard does: each tile is shown whole, and its ring with it.
  await tile(page, 'A', 2).focus();
  for (const spot of [2, 3, 4, 5, 7, 8, 9, 10, 12, 13]) {
    await expect(tile(page, 'A', spot)).toBeFocused();
    await settle(page);
    const view = (await pan.boundingBox())!;
    const box = (await tile(page, 'A', spot).boundingBox())!;
    expect(box.y - RING, `tile ${spot}: ring top`).toBeGreaterThanOrEqual(view.y - 0.5);
    expect(box.y + box.height + RING, `tile ${spot}: ring bottom`).toBeLessThanOrEqual(
      view.y + view.height + 0.5,
    );
    expect(box.x - RING, `tile ${spot}: ring left`).toBeGreaterThanOrEqual(view.x - 0.5);
    expect(box.x + box.width + RING, `tile ${spot}: ring right`).toBeLessThanOrEqual(
      view.x + view.width + 0.5,
    );
    await page.keyboard.press('Tab');
  }
  // The 7-wide rows fit: no thumb there.
  await closedRow(page, 'B').click();
  await settle(page);
  await expect(page.getByTestId('lens-open-thumb')).toHaveCount(0);
});

test('a closed row is named with its row, price and free count; what it draws is hidden from a screen reader', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());

  // Row B on the fixture: €35 ×6 and €25 ×1, position 5 taken.
  await expect(
    page.getByRole('button', { name: 'Row B, €25–€35, 6 of 7 free', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  for (const testid of ['lens-band', 'lens-cell', 'lens-chevron', 'lens-row-note']) {
    const exposed = await page
      .getByTestId(testid)
      .evaluateAll((els) => els.filter((el) => el.closest('[aria-hidden="true"]') === null).length);
    expect(exposed, testid).toBe(0);
  }

  // Bands: price and "N of M free" per zone; rows sharing a band state their own count.
  // Row A is open and alone under its band, so its head carries that band: it leads the list.
  await expect(page.getByTestId('lens-band-title')).toHaveText([
    '€35–€45',
    '€25–€35',
    '€20–€30',
    '€20–€25',
    '€20',
  ]);
  await expect(page.getByTestId('lens-band-note')).toHaveText([
    '· 10 of 13 free',
    '· 6 of 7 free',
    '· 6 of 7 free',
    '· 6 of 7 free',
    '· 28 of 35 free',
  ]);
  await expect(page.getByTestId('lens-row-note')).toHaveText([
    '5 free',
    '5 free',
    '6 free',
    '6 free',
    '6 free',
  ]);
  await expect(openRow(page, 'A').getByTestId('lens-band')).toContainText('€35–€45');
});

test('a row note too long for its spare columns is cut short and never makes the overview pan', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  const note = closedRow(page, 'E').getByTestId('lens-row-note');
  const scroller = closedRow(page, 'E').locator('[data-lens-cells]');
  await expect(note).toHaveText('5 free');

  // A longer translation on a narrower phone, stood in for by a long text: a note that widened
  // the scroller would hide itself as "panning", fit again, reappear, and so on for ever.
  await note.evaluate((el) => (el.textContent = 'a note far too long for six spare columns'));

  expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('lens-position')).toHaveCount(0);
  await expect(note).toBeVisible();
  const cut = await note.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(cut).toBe(true);
});

test('a 20-column beach fits a 390px phone with cells of at least 12px and no overview pan', async ({
  page,
}) => {
  await openMap(page, wideBeachVenue('wide20'));
  await openRow(page, 'A').getByTestId('lens-close').click();

  const widths = await cellWidths(closedRow(page, 'A'));
  expect(widths).toHaveLength(20);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(12);
  const scroller = closedRow(page, 'A').locator('[data-lens-cells]');
  expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('lens-position')).toHaveCount(0);
  await expect(page.getByTestId('lens-swipe-hint')).toHaveCount(0);
  // A narrower row lines up under the widest row's columns.
  const left = (row: string, nth: number) =>
    closedRow(page, row)
      .getByTestId('lens-cell')
      .nth(nth)
      .evaluate((cell) => cell.getBoundingClientRect().left);
  expect(await left('H', 13)).toBeCloseTo(await left('A', 13), 0);
});

test('a 40-column beach keeps 12px cells and pans every closed row as one block', async ({
  page,
}) => {
  await openMap(page, wideBeachVenue('wide40'));

  const widths = await cellWidths(closedRow(page, 'B'));
  expect(widths).toHaveLength(40);
  expect(Math.min(...widths)).toBeCloseTo(12, 1);
  expect(Math.max(...widths)).toBeCloseTo(12, 1);
  await expect(page.getByTestId('lens-swipe-hint')).toBeVisible();

  const text = page.getByTestId('lens-position-text');
  const thumb = page.getByTestId('lens-position-thumb');
  const span = async (): Promise<{ first: number; last: number }> => {
    const [, first, last] = /^(\d+)–(\d+) of 40$/.exec((await text.textContent())!.trim())!;
    return { first: Number(first), last: Number(last) };
  };
  expect((await span()).first).toBe(1);

  // Pan one closed row: every closed row moves by the same offset, and the bar says where.
  await closedRow(page, 'E')
    .locator('[data-lens-cells]')
    .evaluate((el) => (el.scrollLeft = 182));
  await expect.poll(() => overviewOffsets(page)).toEqual(Array<number>(9).fill(182));
  // 182px at a 14px pitch is 13 columns in.
  const panned = await span();
  expect(panned.first).toBe(14);
  expect(panned.last - panned.first).toBeGreaterThanOrEqual(19);
  const bar = await thumb.evaluate((el) => ({
    left: Number.parseFloat(el.style.left),
    width: Number.parseFloat(el.style.width),
  }));
  expect(bar.left).toBeCloseTo(((panned.first - 1) / 40) * 100, 1);
  expect(bar.width).toBeCloseTo(((panned.last - panned.first + 1) / 40) * 100, 1);
  // The columns the bar names are the ones on screen.
  const visible = await closedRow(page, 'E')
    .locator('[data-lens-cells]')
    .evaluate((scroller) => {
      const view = scroller.getBoundingClientRect();
      return [...scroller.querySelectorAll('[data-testid="lens-cell"]')]
        .map((cell, i) => ({ i: i + 1, box: cell.getBoundingClientRect() }))
        .filter(({ box }) => box.left >= view.left - 0.5 && box.right <= view.right + 0.5)
        .map(({ i }) => i);
    });
  expect(visible).toContain(panned.first);
  expect(visible).toContain(panned.last);

  // The overview follows the open row: panning it to its far end brings the last columns in view.
  await openRow(page, 'A')
    .getByTestId('lens-pan')
    .evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await expect.poll(async () => (await span()).last).toBe(40);
  const offsets = await overviewOffsets(page);
  expect(new Set(offsets).size).toBe(1);
  expect(offsets[0]).toBeGreaterThan(182);
});

test('on a beach that pans, Tab walks the row buttons and nothing hidden; axe is clean', async ({
  page,
}) => {
  await openMap(page, wideBeachVenue('wide40'));
  await openRow(page, 'A').getByTestId('lens-close').click();
  await expect(closedRow(page, 'A')).toBeFocused();

  // Each closed row holds a scroller that overflows: none of them may take a tab stop.
  for (const code of ['B', 'C', 'D']) {
    await page.keyboard.press('Tab');
    await expect(closedRow(page, code)).toBeFocused();
  }

  await expectNoSeriousAxeViolations(page, 'tourist row lens, 40 columns, no row open');
  await expectTouchTargets(page, 'tourist row lens, 40 columns, no row open');
});

test('a 26-row beach scrolls with the page: the lens has no vertical scroller of its own', async ({
  page,
}) => {
  await openMap(page, wideBeachVenue('deep26'));

  await expect(page.getByTestId('lens-row')).toHaveCount(25);
  const nested = await page.getByTestId('beach-grid').evaluate(
    (frame) =>
      [frame, ...frame.querySelectorAll('*')].filter((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        return (
          (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1
        );
      }).length,
  );
  expect(nested).toBe(0);
  const lens = (await page.getByTestId('row-lens').boundingBox())!;
  expect(lens.height).toBeGreaterThan(844);
  // The last row is reached by scrolling the page, nothing else.
  await closedRow(page, 'Z').scrollIntoViewIfNeeded();
  await expect(closedRow(page, 'Z')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test.describe('how the overview states paint', () => {
  const STATES = ['available', 'premium', 'partly', 'walkin', 'taken', 'pick'] as const;

  /** The 40-column beach for a stay, every state on it, B2 picked, and rows A and B closed again. */
  async function openEveryState(page: Page, theme: Theme): Promise<void> {
    const { first, last } = stayDates();
    await openMap(page, withEveryState(wideBeachVenue('wide40'), first), {
      theme,
      query: `?date=${first}&lastDate=${last}`,
    });
    await closedRow(page, 'B').click();
    await tile(page, 'B', 2).click();
    await closedRow(page, 'J').click();
    await expect(openRow(page, 'J')).toBeVisible();
    await settle(page);
  }

  /** One closed-row cell per state, at the 12px floor. */
  function cellOf(page: Page, state: (typeof STATES)[number]): Locator {
    return page
      .locator(state === 'premium' ? '[data-lens-row="A"]' : '[data-lens-row]')
      .locator(`[data-testid="lens-cell"][data-state="${state}"]`)
      .first();
  }

  test.describe('at 12px, on a 2x screen', () => {
    test.use({ deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`every state paints at 3:1 against the wash around it — ${theme}`, async ({ page }) => {
        await openEveryState(page, theme);
        for (const state of STATES) {
          const cell = cellOf(page, state);
          await cell.scrollIntoViewIfNeeded();
          const box = (await cell.boundingBox())!;
          expect(box.width, `${state} cell width`).toBeCloseTo(12, 1);
          const shot = await page.screenshot({
            clip: { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 },
          });
          // The wash is read 6px clear of the cell, in its own row: the pick's halo reaches the clip's corner.
          const clear = box.y >= 8 ? box.y - 6 : box.y + box.height + 6;
          const wash = await page.screenshot({
            clip: { x: box.x + box.width / 2, y: clear, width: 1, height: 1 },
          });
          const strong = await page.evaluate(
            async ([cell, around]) => {
              const read = async (base64: string): Promise<Uint8ClampedArray> => {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d')!;
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height).data;
              };
              const data = await read(cell);
              const luminance = (i: number, from = data): number => {
                const channel = (v: number): number => {
                  const c = v / 255;
                  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                };
                return (
                  0.2126 * channel(from[i]) +
                  0.7152 * channel(from[i + 1]) +
                  0.0722 * channel(from[i + 2])
                );
              };
              const ground = luminance(0, await read(around));
              let pixels = 0;
              for (let i = 0; i < data.length; i += 4) {
                const l = luminance(i);
                const ratio = (Math.max(l, ground) + 0.05) / (Math.min(l, ground) + 0.05);
                if (ratio >= 3) {
                  pixels++;
                }
              }
              return pixels;
            },
            [shot.toString('base64'), wash.toString('base64')],
          );
          // A 12px box's 1.5px edge alone is ~130 device pixels at 2x; a speck is not a state.
          expect(strong, `${state} in ${theme}: device pixels at 3:1`).toBeGreaterThanOrEqual(40);
        }
      });
    }
  });

  test.describe('a stay plan’s ring at 12px, on a 2x screen', () => {
    test.use({ deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`each plan set’s ring paints at 3:1 against the wash — ${theme}`, async ({ page }) => {
        const { first, last } = stayDates();
        const beach = wideBeachVenue('wide40');
        // Nothing covers the stay: B2 hosts the first day and C1 the second, so the plan is those two.
        const hosts = [
          { set: beach.sets.find((s) => s.rowLabel === 'B' && s.positionNo === 2)!, day: first },
          { set: beach.sets.find((s) => s.rowLabel === 'C' && s.positionNo === 1)!, day: last },
        ];
        await page.route(/\/api\/venues\/1\/itinerary\?.*$/, (route) =>
          route.fulfill({
            json: {
              maxMoves: 3,
              anchor: null,
              plan: {
                moves: 1,
                stretches: hosts.map(({ set, day }) => ({
                  setId: set.id,
                  rowLabel: set.rowLabel,
                  positionNo: set.positionNo,
                  gridX: set.gridX,
                  gridY: set.gridY,
                  tier: set.tier,
                  firstDate: day,
                  lastDate: day,
                  days: 1,
                  pricePerDay: set.price,
                  amount: set.price,
                })),
                movesBetween: [{ onDate: last, rowsAway: 1, positionsAway: 1, towardSea: false }],
                total: { minorUnits: 6000, currency: 'EUR' },
              },
            },
          }),
        );
        await page.route(/\/api\/venues\/1\/availability-calendar\?.*$/, (route) =>
          route.fulfill({ json: [] }),
        );
        await openMap(
          page,
          {
            ...beach,
            sets: beach.sets.map((set) => {
              const host = hosts.find((h) => h.set.id === set.id);
              return host
                ? {
                    ...set,
                    availability: 'PARTLY_FREE' as const,
                    freeDays: 1,
                    takenDates: [host.day === first ? last : first],
                  }
                : { ...set, availability: 'TAKEN' as const, freeDays: 0 };
            }),
          },
          { theme, query: `?date=${first}&lastDate=${last}` },
        );
        await page.getByTestId('no-cover-plan').click();
        const ringed = page.locator('[data-lens-cells] [data-ring]');
        // The rings show while the plan is open, and it opens in the page, not over the map.
        await expect(ringed).toHaveCount(2);
        await settle(page);

        for (const [index, cell] of (await ringed.all()).entries()) {
          await cell.scrollIntoViewIfNeeded();
          const box = (await cell.boundingBox())!;
          expect(box.width, `plan set ${index + 1} cell width`).toBeCloseTo(12, 1);
          // The cell with 2px around it, on whole device pixels; the wash is read from above the cell.
          const clip = {
            x: Math.floor((box.x - 2) * 2) / 2,
            y: Math.floor((box.y - 2) * 2) / 2,
            width: 17,
            height: 17,
          };
          const shot = await page.screenshot({ clip });
          const wash = await page.screenshot({
            clip: {
              x: box.x + box.width / 2,
              y: box.y >= 8 ? box.y - 6 : box.y + box.height + 6,
              width: 1,
              height: 1,
            },
          });
          const painted = await page.evaluate(
            async ({ shot, wash }) => {
              const read = async (base64: string) => {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d')!;
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height);
              };
              const luminance = (data: Uint8ClampedArray, i: number): number => {
                const channel = (v: number): number => {
                  const c = v / 255;
                  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                };
                return (
                  0.2126 * channel(data[i]) +
                  0.7152 * channel(data[i + 1]) +
                  0.0722 * channel(data[i + 2])
                );
              };
              const ground = luminance((await read(wash)).data, 0);
              const { data, width, height } = await read(shot);
              // The box of everything at 3:1, short of the next cell, which starts 4 device pixels on.
              const reach = { left: width, right: -1, top: height, bottom: -1 };
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width - 3; x++) {
                  const l = luminance(data, (y * width + x) * 4);
                  if ((Math.max(l, ground) + 0.05) / (Math.min(l, ground) + 0.05) >= 3) {
                    reach.left = Math.min(reach.left, x);
                    reach.right = Math.max(reach.right, x);
                    reach.top = Math.min(reach.top, y);
                    reach.bottom = Math.max(reach.bottom, y);
                  }
                }
              }
              return { width: reach.right - reach.left + 1, height: reach.bottom - reach.top + 1 };
            },
            { shot: shot.toString('base64'), wash: wash.toString('base64') },
          );
          // The cell is 24 device pixels at 2x and the ring paints 2 a side, 28 in all: a side cut off is 26.
          expect(
            painted.width,
            `plan set ${index + 1} in ${theme}: ring left to right`,
          ).toBeGreaterThanOrEqual(27);
          expect(
            painted.height,
            `plan set ${index + 1} in ${theme}: ring top to bottom`,
          ).toBeGreaterThanOrEqual(27);
        }
      });
    }
  });

  test('under forced colours free, partly free, walk-in, taken and the pick stay told apart', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openEveryState(page, 'porcelain');

    const shapes = new Map<string, string>();
    for (const state of ['available', 'partly', 'walkin', 'taken', 'pick'] as const) {
      const shape = await cellOf(page, state).evaluate((cell) => {
        const own = getComputedStyle(cell);
        const after = getComputedStyle(cell, '::after');
        const drawn = after.content !== 'none';
        const visible = (color: string): boolean => !/rgba\(.*,\s*0\)$|transparent/.test(color);
        return {
          // The edge survives: a real border in a system colour.
          edge: Number.parseFloat(own.borderTopWidth) > 0 && visible(own.borderTopColor),
          // What the state draws inside, by the borders that draw it (0 where it draws nothing).
          top: drawn && visible(after.borderTopColor) ? after.borderTopWidth : '0px',
          bottom: drawn && visible(after.borderBottomColor) ? after.borderBottomWidth : '0px',
          left: drawn && visible(after.borderLeftColor) ? after.borderLeftWidth : '0px',
          rotated: drawn && after.rotate !== 'none',
        };
      });
      expect(shape.edge, `${state} keeps its edge`).toBe(true);
      shapes.set(state, JSON.stringify(shape));
    }
    // Free draws nothing inside; each other state draws its own shape.
    expect(shapes.get('available')).toContain('"top":"0px","bottom":"0px","left":"0px"');
    expect(new Set(shapes.values()).size).toBe(5);
  });
});

test('crossing sm swaps the lens and the grid, and focus on a tile follows its set', async ({
  page,
}) => {
  await openMap(page, miramarMapVenue());
  await tile(page, 'A', 2).focus();

  await page.setViewportSize({ width: 800, height: 844 });
  await expect(page.getByTestId('row-lens')).toHaveCount(0);
  await expect(page.getByTestId('map-pan')).toBeVisible();
  await expect(tile(page, 'A', 2)).toBeFocused();

  // A tile of a row the lens does not have open: coming back opens that row for it.
  await tile(page, 'F', 2).focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(openRow(page, 'F')).toBeVisible();
  await expect(tile(page, 'F', 2)).toBeFocused();
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true });

  test('a sideways swipe on a closed row pans every row and does not open it', async ({ page }) => {
    await openMap(page, wideBeachVenue('wide40'));
    const row = closedRow(page, 'C');
    await row.scrollIntoViewIfNeeded();
    const box = (await row.locator('[data-lens-cells]').boundingBox())!;
    const y = box.y + box.height / 2;
    let x = box.x + box.width - 40;

    // Raw touch points: the browser turns them into the native scroll a real swipe is.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 0; step < 15; step++) {
      x -= 10;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(async () => (await overviewOffsets(page))[0]).toBeGreaterThan(60);
    await expect.poll(async () => new Set(await overviewOffsets(page)).size).toBe(1);
    await expect(openRow(page, 'C')).toHaveCount(0);
    await expect(openRow(page, 'A')).toBeVisible();
  });
});
