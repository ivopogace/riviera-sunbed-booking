import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { openHeaderMenu, openShellOverlay, openThemePicker } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';

/**
 * Real-render e2e for the venue-owner page (#1736): the tourist menus and footer reach it, it is
 * axe-clean in all three themes with every control at the touch floor, and its call to action opens
 * the operator registration card. No API is called beyond the shell's own restore, so nothing is mocked.
 */

test.describe('the venue-owner page', () => {
  // Pin dark so the first audit really runs the dark theme (headless defaults light → porcelain).
  test.use({ colorScheme: 'dark' });

  test('renders axe-clean in all three themes, at the touch floor', async ({ page }) => {
    await page.goto('/for-venues');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Riviera for beach venues');
    await expect(page.getByTestId('for-venues-at-launch')).toHaveText('At launch');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'for venues (dark)');
    await expectTouchTargets(page, 'for venues');

    for (const theme of ['riviera', 'porcelain'] as const) {
      await openThemePicker(page);
      await page.getByTestId(`theme-option-${theme}`).click();
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
      await settle(page);
      await expectNoSeriousAxeViolations(page, `for venues (${theme})`);
    }
  });
});

test('the desktop header menu opens the page, and its call to action opens the operator registration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/my-bookings');
  await openHeaderMenu(page);
  await page.getByTestId('nav-for-venues').click();

  await expect(page).toHaveURL(/\/for-venues$/);
  await expect(page).toHaveTitle('For venues — Riviera');
  await expect(page.getByTestId('nav-account-menu')).toHaveCount(0);

  await page.getByTestId('for-venues-register').click();
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator&mode=register$/);
  await expect(page.getByLabel('Contact email', { exact: true })).toBeVisible();
});

test('the phone menu sheet and the footer both link to the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/my-bookings');
  await openShellOverlay(page, 'menu-toggle');
  await page.getByTestId('nav-for-venues-mobile').click();
  await expect(page).toHaveURL(/\/for-venues$/);
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);

  await page.goto('/my-bookings');
  await page.locator('.riv-footer').getByRole('link', { name: 'For venues' }).click();
  await expect(page).toHaveURL(/\/for-venues$/);
});
