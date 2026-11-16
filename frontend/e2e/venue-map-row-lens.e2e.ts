import { expect, type Locator, type Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
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
  options: { theme?: Theme; query?: string } = {},
): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: venue }));
  await page.addInitScript(
    (id) => localStorage.setItem('riviera-theme', id),
    options.theme ?? 'porcelain',
  );
  await page.setViewportSize({ width: 390, height: 844 });
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
    await expect(bar).toContainText('B · spot 2 · €35');
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

  // The last row scrolls clear of the bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastRow = (await closedRow(page, 'I').boundingBox())!;
  const bar = (await page.getByTestId('pick-bar').boundingBox())!;
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(bar.y);
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
          // One CSS px of the ground on every side: the corner pixel is the wash itself.
          const shot = await page.screenshot({
            clip: { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 },
          });
          const strong = await page.evaluate(async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            const luminance = (i: number): number => {
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
            const ground = luminance(0);
            let pixels = 0;
            for (let i = 0; i < data.length; i += 4) {
              const l = luminance(i);
              const ratio = (Math.max(l, ground) + 0.05) / (Math.min(l, ground) + 0.05);
              if (ratio >= 3) {
                pixels++;
              }
            }
            return pixels;
          }, shot.toString('base64'));
          // A 12px box's 1.5px edge alone is ~130 device pixels at 2x; a speck is not a state.
          expect(strong, `${state} in ${theme}: device pixels at 3:1`).toBeGreaterThanOrEqual(40);
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
