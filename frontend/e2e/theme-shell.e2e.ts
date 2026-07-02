import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render e2e for the Liquid Glass shell (issue #134): theme switching + persistence
 * (AC-2), the mobile hamburger menu (AC-3), and the reduced-motion guard (AC-5) — with axe
 * sweeps in both themes (AC-4's real-browser half). The discovery API is mocked
 * (`page.route`), so the spec is CI-safe like its siblings.
 */

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 18, total: 24 },
  },
];

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual(
    [],
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
});

test.describe('theme persistence', () => {
  // Pin the OS scheme to dark so the boot theme is deterministic (headless defaults to light,
  // which would legitimately boot porcelain via the prefers-color-scheme fallback).
  test.use({ colorScheme: 'dark' });

  test('theme choice applies immediately and survives a reload (AC-2)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
  });
});

test('axe passes on the shell in both themes, including the open theme picker (AC-4)', async ({
  page,
}) => {
  await page.goto('/');
  await expectNoSeriousAxeViolations(page, 'riviera shell');

  await page.getByTestId('theme-toggle').click();
  // Let the pop-in animation finish — axe samples computed colours, and mid-fade opacity
  // reads as washed-out text (a false contrast failure).
  await page
    .locator('.riv-theme-pop')
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await expectNoSeriousAxeViolations(page, 'riviera shell, theme picker open');

  await page.getByTestId('theme-option-porcelain').click();
  await expectNoSeriousAxeViolations(page, 'porcelain shell');
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger menu opens, navigates, closes on Escape with focus returned (AC-3)', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.getByTestId('menu-toggle');
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId('theme-toggle')).toBeHidden(); // desktop nav collapsed

    await toggle.click();
    await expect(page.getByTestId('mobile-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-menu')).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await expectNoSeriousAxeViolations(page, 'mobile menu open');
    await page.getByRole('radio', { name: 'Porcelain' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expect(page.getByTestId('mobile-menu')).toBeHidden(); // selection closes the menu
  });
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('background blobs do not animate under prefers-reduced-motion (AC-5)', async ({ page }) => {
    await page.goto('/');

    const animation = await page
      .locator('.riv-blob-1')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });
});
