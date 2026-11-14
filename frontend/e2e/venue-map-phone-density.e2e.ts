import { expect, type Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { miramarMapVenue } from './support/miramar-map';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The tourist beach map on a phone (#1732): the row rail is as wide as its letter and the zone
 * price sits in a header band above its zone, not in a column of its own, so a 390px phone shows
 * at least four whole tiles of a 7-wide row on the seeded Miramar shape. Mocked API, CI-safe.
 */

const THEMES = ['porcelain', 'riviera', 'dark'] as const;

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: miramarMapVenue() }),
  );
});

async function openMap(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((id) => localStorage.setItem('riviera-theme', id), theme);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/venues/1');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
  await expect(page.getByTestId('set-tile').first()).toBeVisible();
}

/** Tiles of row B (7 wide) wholly inside the pan viewport, outside its 16px edge fades. */
async function wholeTilesInSevenWideRow(page: Page): Promise<number> {
  return page.getByTestId('map-pan').evaluate((viewport) => {
    const FADE = 16;
    const box = viewport.getBoundingClientRect();
    const row = viewport.querySelectorAll('[data-map-row]')[1];
    const tiles = [...row.querySelectorAll('[data-testid="set-tile"]')];
    if (tiles.length !== 7) {
      throw new Error(`row B renders ${tiles.length} tiles, expected 7`);
    }
    return tiles.filter((tile) => {
      const t = tile.getBoundingClientRect();
      return t.left >= box.left + FADE - 0.5 && t.right <= box.right - FADE + 0.5;
    }).length;
  });
}

for (const theme of THEMES) {
  test(`a 390px phone shows at least four whole tiles of a 7-wide row — ${theme} (#1732)`, async ({
    page,
  }) => {
    await openMap(page, theme);

    expect(await wholeTilesInSevenWideRow(page)).toBeGreaterThanOrEqual(4);
    const tile = await page.getByTestId('set-tile').first().boundingBox();
    expect(tile?.width).toBeGreaterThanOrEqual(44);
    expect(tile?.height).toBeGreaterThanOrEqual(44);

    await expectTouchTargets(page, `tourist beach map at 390px, ${theme}`);
    await expectNoSeriousAxeViolations(page, `tourist beach map at 390px, ${theme}`);
  });

  test(`the zone price wears the proven chip tokens in its header band — ${theme} (#1732)`, async ({
    page,
  }) => {
    await openMap(page, theme);

    const prices = page.getByTestId('row-price');
    await expect(prices).toHaveText(['€35–€45', '€25–€35', '€20–€30', '€20–€25', '€20']);
    await expect(page.getByTestId('price-col')).toHaveCount(0);

    // venue-map.contrast.spec.ts proves rail ink on the chip fill over every wash stop: pin those.
    const paint = await prices.first().evaluate((chip) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.color = root.getPropertyValue('--riv-map-rail-ink');
      probe.style.backgroundColor = root.getPropertyValue('--riv-map-chip-fill');
      chip.parentElement?.append(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(chip);
      const result = {
        ink: [got.color, want.color],
        fill: [got.backgroundColor, want.backgroundColor],
      };
      probe.remove();
      return result;
    });
    expect(paint.ink[0]).toBe(paint.ink[1]);
    expect(paint.fill[0]).toBe(paint.fill[1]);

    // The band sits above its zone's first row and inside the card, never over a tile.
    const band = await prices.nth(1).boundingBox();
    const rowB = await page.locator('[data-map-row]').nth(1).boundingBox();
    expect(band && rowB && band.y + band.height <= rowB.y + 0.5).toBe(true);
  });
}

test('the price header band carries no accessible text of its own — tile names already say the price (#1732)', async ({
  page,
}) => {
  await openMap(page, 'porcelain');
  const hidden = await page
    .getByTestId('row-price')
    .first()
    .evaluate((chip) => chip.closest('[aria-hidden="true"]') !== null);
  expect(hidden).toBe(true);
  await expect(
    page.getByRole('button', { name: /^B · spot 1, standard, €35(\.00)?, .*Select to book\.$/ }),
  ).toHaveCount(1);
});
