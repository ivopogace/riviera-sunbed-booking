import { expect, Locator, test } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';
import { mockTourist } from './support/tourist.mocks';

/**
 * The rendered box of each icon a call site resizes with `[&_svg]:size-[Npx]` (`riviera-tailwind`
 * ICON-4): the utility is global, so only a real browser proves it reaches the svg and outranks
 * the icon's own presentation attributes — jsdom lays nothing out. A surface another spec already
 * drives pins its icon there instead (`fixed-fill-state-skins`, `review-a-stay`, `operator-daily`,
 * `operator-requests`, `operator-registration`, `request-to-book`, `suppressed-confirmation`,
 * `accent-token-inks`).
 */
async function expectBox(svg: Locator, px: number): Promise<void> {
  await expect(svg).toHaveCSS('width', `${px}px`);
  await expect(svg).toHaveCSS('height', `${px}px`);
}

test.describe('icon sizes on the tourist surfaces at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
  });

  test('the Discover head: the beaches umbrella, the chevrons, the coast picker’s cross', async ({
    page,
  }) => {
    await page.goto('/');
    await expectBox(page.getByTestId('head-beaches').locator('app-umbrella-icon svg'), 15);
    await expectBox(page.getByTestId('head-day').locator('svg'), 11);
    await expectBox(page.getByTestId('head-place').locator('app-chevron-down-icon svg'), 12);

    await page.getByTestId('head-place').click();
    await expectBox(page.getByTestId('picker-close').locator('svg'), 14);
  });

  test('the venue map: the back arrow, the orientation triangles, the review stars', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    await expectBox(page.locator('.back-pill svg'), 14);
    await expectBox(page.locator('.sea-banner svg'), 9);
    await expectBox(page.locator('.promenade svg'), 9);
    await expectBox(page.getByTestId('review-stars').first().locator('svg').first(), 15);
  });

  test('the booking dialog’s and the lightbox’s close crosses', async ({ page }) => {
    await page.goto('/venues/1');
    await page.getByTestId('gallery-photo-0').click();
    await expectBox(page.getByTestId('lightbox-close').locator('svg'), 18);
    await page.getByTestId('lightbox-close').click();

    await page
      .getByRole('button', { name: /Select to book/ })
      .first()
      .click();
    await expectBox(page.getByTestId('dialog-close').locator('svg'), 14);
  });

  test('My bookings’ back arrow', async ({ page }) => {
    await page.goto('/my-bookings');
    await expectBox(page.getByRole('link', { name: 'All beaches' }).locator('svg'), 14);
  });
});

test('the spelled beaches chip’s chevron where the sheet is wide', async ({ page }) => {
  await mockTourist(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expectBox(page.getByTestId('head-beaches').locator('app-chevron-down-icon svg'), 11);
});

test('the operator’s weather-refund rain cloud', async ({ page }) => {
  await mockWholeConsole(page);
  await page.goto('/operator/1/payouts');
  await signInAsOperator(page);
  await expectBox(page.getByTestId('weather-trigger').locator('svg'), 15);
});
