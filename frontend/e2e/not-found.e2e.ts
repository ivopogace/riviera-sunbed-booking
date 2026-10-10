import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { awaitRoutedPage } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';
import { mockTourist } from './support/tourist.mocks';

/**
 * The app-wide `**` route (#1523): an unmatched URL renders the tourist shell's "Page not found"
 * card instead of an empty outlet, keeps the typed URL, raises no NG04002, and links back home.
 * The API is mocked (`page.route`), so the spec is CI-safe.
 */

test.beforeEach(async ({ page }) => {
  await mockTourist(page);
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
  });
});

for (const path of ['/does-not-exist', '/venues', '/admin/whatever', '/operator/1/nope']) {
  test(`${path} renders the not-found page and keeps the URL`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(path);
    await awaitRoutedPage(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveURL(path);
    await expect(page).toHaveTitle('Page not found — Riviera');
    expect(errors.filter((e) => e.includes('NG04002'))).toEqual([]);
  });
}

for (const theme of ['porcelain', 'riviera', 'dark']) {
  test(`the not-found page is axe-clean in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
    await page.goto('/does-not-exist');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
    await expect(page.getByTestId('not-found-home')).toBeVisible();
    await expectNoSeriousAxeViolations(page, `not-found (${theme})`);
  });
}

test('at a phone width the tab bar stays and every control meets the touch floor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/does-not-exist');
  await expect(page.getByTestId('not-found-home')).toBeVisible();
  // The shell's own way out besides the card link: no tab lit, but the bar is there.
  await expect(page.getByTestId('tab-bar')).toBeVisible();
  await expect(page.getByTestId('tab-beaches')).not.toHaveAttribute('aria-current', 'page');
  await expectTouchTargets(page, 'not-found');
});

test('"Back to the beaches" opens the home page', async ({ page }) => {
  await page.goto('/does-not-exist');
  await page.getByTestId('not-found-home').click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toHaveCount(0);
});
