import { expect, test } from '@playwright/test';

import { openShellOverlay } from './support/shell';

/**
 * The tourist header's current-page marker on touch devices. Tailwind v4 compiles `hover:` under
 * `@media (hover: hover)`, so on a phone or tablet the header's hover recipes never paint and the
 * marker is the only cue a tourist gets. Each viewport first proves hover is unreachable there,
 * then measures the rendered marker
 * (`aria-current="page"` from `routerLinkActive`, styled through its compound selector). The
 * discovery API is mocked (`page.route`), so the spec is CI-safe like its siblings.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({ status: 401, json: {} }));
});

test.describe('phone: the hamburger sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('marks the current page in the sheet without any hover', async ({ page }) => {
    await page.goto('/my-bookings');
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);

    await openShellOverlay(page, 'menu-toggle');
    const sheet = page.getByTestId('mobile-menu');
    const current = sheet.getByRole('link', { name: 'My bookings' });
    const other = sheet.getByRole('link', { name: 'Beaches' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(other).not.toHaveAttribute('aria-current', 'page');

    // Porcelain (headless boots light): the accent ink over the hover fill, the rest untouched.
    await expect(current).toHaveCSS('color', 'rgb(10, 110, 133)');
    await expect(current).toHaveCSS('background-color', 'rgba(12, 42, 51, 0.06)');
    await expect(other).toHaveCSS('color', 'rgb(10, 42, 51)');
    await expect(other).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('never marks Sign in and Create an account together', async ({ page }) => {
    await page.goto('/account/sign-in?mode=register');
    await openShellOverlay(page, 'menu-toggle');
    await expect(page.getByTestId('nav-register-mobile')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-signin-mobile')).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('tablet: the inline nav', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test('marks the current page inline with full ink and an accent underline', async ({ page }) => {
    await page.goto('/my-bookings');
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);

    const nav = page.locator('.riv-nav-desktop');
    await expect(nav).toBeVisible();
    const current = nav.getByRole('link', { name: 'My bookings' });
    const other = nav.getByRole('link', { name: 'Beaches' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(other).not.toHaveAttribute('aria-current', 'page');

    await expect(current).toHaveCSS('color', 'rgb(10, 42, 51)');
    await expect(current).toHaveCSS('text-decoration-line', 'underline');
    // The underline takes the link's own ink: an accent token would vanish on riviera's dark glass.
    await expect(current).toHaveCSS('text-decoration-color', 'rgb(10, 42, 51)');
    await expect(current).toHaveCSS('font-weight', '600');
    await expect(other).toHaveCSS('color', 'rgba(12, 42, 51, 0.7)');
    await expect(other).toHaveCSS('text-decoration-line', 'none');
  });

  test('marks the current page inline with full ink and an underline in the riviera theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'riviera'));
    await page.goto('/my-bookings');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

    const nav = page.locator('.riv-nav-desktop');
    const current = nav.getByRole('link', { name: 'My bookings' });
    const other = nav.getByRole('link', { name: 'Beaches' });
    await expect(current).toHaveAttribute('aria-current', 'page');

    // Full white ink plus an underline in that ink: the accent ink alone vanishes on the dark glass.
    await expect(current).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(current).toHaveCSS('text-decoration-line', 'underline');
    await expect(current).toHaveCSS('text-decoration-color', 'rgb(255, 255, 255)');
    await expect(other).toHaveCSS('color', 'rgba(255, 255, 255, 0.86)');
    await expect(other).toHaveCSS('text-decoration-line', 'none');
  });

  test('marks Your account current inside the signed-in account menu', async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ json: { username: 'ana@example.com', principalType: 'CUSTOMER' } }),
    );
    await page.goto('/account/password');
    await openShellOverlay(page, 'nav-user');
    const link = page.getByTestId('nav-account-link');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveCSS('color', 'rgb(10, 110, 133)');
    await expect(link).toHaveCSS('background-color', 'rgba(12, 42, 51, 0.06)');
  });

  test('Beaches is current at the root only', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.riv-nav-desktop');
    await expect(nav.getByRole('link', { name: 'Beaches' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'My bookings' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
