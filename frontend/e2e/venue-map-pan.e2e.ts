import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render audit of the beach map's pan-vs-select distinction (issue #136, AC-7/AC-8). A big
 * venue overflows the map viewport, so the tile grid pans horizontally by mouse drag. The pin:
 * a plain click on a free tile opens the booking dialog, but a drag-pan release does NOT — and
 * the row-code/price side columns stay fixed while the tiles pan. The API is mocked (`page.route`),
 * so the suite is CI-safe with no backend (like booking-flow.e2e.ts). Runs axe over the map.
 */

const ROWS = [
  { label: 'Front row · Sea view', tier: 'PREMIUM', price: 5000 },
  { label: 'Row 2', tier: 'STANDARD', price: 4000 },
  { label: 'Row 3', tier: 'STANDARD', price: 3500 },
  { label: 'Row 4 · Back', tier: 'STANDARD', price: 3000 },
];

function wideVenue() {
  const sets = [];
  let id = 0;
  ROWS.forEach((row, r) => {
    for (let p = 1; p <= 20; p++) {
      id += 1;
      sets.push({
        id,
        rowLabel: row.label,
        positionNo: p,
        tier: row.tier,
        pool: 'ONLINE',
        price: { minorUnits: row.price, currency: 'EUR' },
        gridX: p,
        gridY: r + 1,
        availability: p % 7 === 0 ? 'TAKEN' : 'FREE', // a few taken; the rest bookable
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

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: wideVenue() }));
});

test('a plain click on a free tile opens the booking dialog (and the map is accessible)', async ({ page }) => {
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Panorama Bay' })).toBeVisible();
  // A venue wider than the viewport shows the drag-to-pan hint.
  await expect(page.getByTestId('scroll-hint')).toBeVisible();

  // The glass header actually renders its surface — guards the shared-partial extraction: a
  // stripped background drops white header ink onto the bare gradient below AA, which neither the
  // token-based contrast spec nor axe-over-a-gradient can detect.
  const headBg = await page.locator('.map-head').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(headBg).not.toBe('transparent');

  await expectNoSeriousAxeViolations(page, 'beach map (wide, pannable)');

  await page.getByRole('button', { name: /Select to book/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a drag-pan release over a tile pans the map but does NOT open the dialog; side columns stay put', async ({ page }) => {
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Panorama Bay' })).toBeVisible();

  const pan = page.getByTestId('map-pan');
  const rowCode = page.getByTestId('row-code').first();
  const codeXBefore = (await rowCode.boundingBox())!.x;
  const scrollBefore = await pan.evaluate((el) => el.scrollLeft);

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
  await page.getByRole('button', { name: /Select to book/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
