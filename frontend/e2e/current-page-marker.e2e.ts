import { expect, test } from '@playwright/test';

import { awaitRoutedPage, openShellOverlay } from './support/shell';

/**
 * The tourist header's current-page marker on touch devices. Tailwind v4 compiles `hover:` under
 * `@media (hover: hover)`, so on a phone or tablet the header's hover recipes never paint and the
 * marker is the only cue a tourist gets. Each viewport first proves hover is unreachable there,
 * then measures the rendered marker (`aria-current="page"` — from `routerLinkActive` on the
 * desktop links, from the route's section data on the phone tabs — styled through its compound
 * selector). The discovery API is mocked (`page.route`), so the spec is CI-safe like its siblings.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({ status: 401, json: {} }));
});

test.describe('phone: the bottom tab bar', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /**
   * The current tab is a SHAPE cue in full ink — a 3px bar at the top edge (the tab's `::before`)
   * and a 1.5px `currentColor` ring round the icon pill — plus the full-ink label: no tint the
   * token set offers clears 1.4.11's 3:1 on the bar (#1003). The other tabs wear the soft ink with
   * the bar at opacity 0 and no ring.
   */
  for (const { theme, ink, soft } of [
    { theme: 'porcelain', ink: 'rgb(10, 42, 51)', soft: 'rgba(12, 42, 51, 0.7)' },
    { theme: 'riviera', ink: 'rgb(255, 255, 255)', soft: 'rgba(255, 255, 255, 0.86)' },
    { theme: 'dark', ink: 'rgb(255, 255, 255)', soft: 'rgba(255, 255, 255, 0.86)' },
  ]) {
    test(`marks the current tab with a full-ink shape cue in ${theme} (#1003)`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
      await page.goto('/my-bookings');
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);

      const current = page.getByTestId('tab-bookings');
      const other = page.getByTestId('tab-beaches');
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(other).not.toHaveAttribute('aria-current', 'page');

      await expect(current).toHaveCSS('color', ink);
      await expect(other).toHaveCSS('color', soft);
      const marker = (tab: typeof current) =>
        tab.evaluate((el) => {
          const bar = getComputedStyle(el, '::before');
          return { opacity: bar.opacity, height: bar.height };
        });
      expect(await marker(current)).toEqual({ opacity: '1', height: '3px' });
      expect(await marker(other)).toMatchObject({ opacity: '0' });
      // The ring sits on the icon pill, in the tab's own ink.
      await expect(current.locator('span').first()).toHaveCSS(
        'box-shadow',
        new RegExp(`${ink.replaceAll('(', '\\(').replaceAll(')', '\\)')} 0px 0px 0px 1.5px`),
      );
      await expect(other.locator('span').first()).toHaveCSS('box-shadow', 'none');
    });
  }

  test('lights a tab by section, not by exact path: a venue page is Beaches, a booking page My bookings', async ({
    page,
  }) => {
    await page.goto('/venues/1');
    await awaitRoutedPage(page);
    await expect(page.getByTestId('tab-beaches')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tab-bookings')).not.toHaveAttribute('aria-current', 'page');

    await page.goto('/booking/ABCD234567');
    await awaitRoutedPage(page);
    await expect(page.getByTestId('tab-bookings')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tab-beaches')).not.toHaveAttribute('aria-current', 'page');

    // Outside every section: nothing lit.
    await page.goto('/legal/privacy');
    await awaitRoutedPage(page);
    await expect(page.getByTestId('tab-bar').locator('[aria-current="page"]')).toHaveCount(0);
  });

  test('lights the Account tab on the account section only while signed in', async ({ page }) => {
    await page.goto('/account/password');
    await awaitRoutedPage(page);
    await expect(page.getByTestId('tab-bar').locator('[aria-current="page"]')).toHaveCount(0);

    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ json: { username: 'ana@example.com', principalType: 'CUSTOMER' } }),
    );
    await page.goto('/account/password');
    await awaitRoutedPage(page);
    const tab = page.getByTestId('menu-toggle');
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(tab).toHaveAccessibleName('Account: ana@example.com');
  });

  test('never marks Sign in and Create an account together in the sheet', async ({ page }) => {
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
