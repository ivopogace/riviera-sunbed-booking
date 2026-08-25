import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render e2e for the Liquid Glass shell: theme switching + persistence,
 * the mobile hamburger menu, and the reduced-motion guard — with axe
 * sweeps in both themes (the real-browser half of the contrast audit). The discovery API is
 * mocked (`page.route`), so the spec is CI-safe like its siblings.
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

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
});

test.describe('theme persistence', () => {
  // Pin the OS scheme to dark so the boot theme is deterministic (headless defaults to light,
  // which would legitimately boot porcelain via the prefers-color-scheme fallback).
  test.use({ colorScheme: 'dark' });

  test('theme choice applies immediately and survives a reload (AC-2)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    // Riviera is switcher-only now (never an OS resolution), so picking it proves persistence.
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
  });
});

test.describe('per-theme color-scheme (#675)', () => {
  // Pin the OS scheme to dark so the boot theme is the dark theme (headless defaults to light).
  test.use({ colorScheme: 'dark' });

  test('native-UI scheme follows the theme; the field scheme follows the field tokens (AC-1, AC-2)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    // Dark theme fields are dark-styled, so their native chrome is dark too (--riv-field-scheme).
    await expect(page.getByTestId('filter-date')).toHaveCSS('color-scheme', 'dark');

    // Riviera keeps LIGHT fields under its dark document — the per-field token opts them out.
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(page.getByTestId('filter-date')).toHaveCSS('color-scheme', 'light');

    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  });
});

test.describe('pre-paint theme seeding (#675)', () => {
  // A dark OS would boot the dark theme without the seed — exactly the FOUC the seed must beat.
  test.use({ colorScheme: 'dark' });

  test('a stored porcelain choice is applied before Angular boots (AC-3)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'porcelain'));
    // Withhold the app bundle: the attribute can then only have come from the index.html seed.
    await page.route('**/main*.js', (route) => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expect(page.locator('app-root')).toBeEmpty();
  });
});

test.describe('axe sweeps', () => {
  // Without this, headless (light) boots porcelain and the dark-theme sweep would silently
  // audit porcelain twice.
  test.use({ colorScheme: 'dark' });

  test('axe passes on the shell in all three themes, including the open theme picker (AC-4)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await expectNoSeriousAxeViolations(page, 'dark shell');

    await page.getByTestId('theme-toggle').click();
    // Let the pop-in animation finish — axe samples computed colours, and mid-fade opacity
    // reads as washed-out text (a false contrast failure).
    await page
      .locator('.riv-theme-pop')
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await expectNoSeriousAxeViolations(page, 'dark shell, theme picker open');

    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    await expectNoSeriousAxeViolations(page, 'riviera shell');

    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expectNoSeriousAxeViolations(page, 'porcelain shell');
  });
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

    // Containing-block pin: the dim backdrop must cover the viewport, not just
    // the header strip (backdrop-filter on the header itself once shrank it to the header).
    const centerHit = await page.evaluate(() => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.7);
      return hit?.getAttribute('data-testid') ?? hit?.className ?? null;
    });
    expect(centerHit).toBe('menu-backdrop');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-menu')).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await expectNoSeriousAxeViolations(page, 'mobile menu open');
    await page.getByRole('button', { name: 'Porcelain' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expect(page.getByTestId('mobile-menu')).toBeHidden(); // selection closes the menu
  });
});

/**
 * The signed-in account menu — the tourist's in-app entry point to `/account/password`.
 * Only `/api/auth/me` needs mocking: the shell's signed-in state is all these cases turn on.
 */
test.describe('account menu', () => {
  const EMAIL = 'ana@example.com';

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ json: { username: EMAIL, principalType: 'CUSTOMER', emailVerified: true } }),
    );
  });

  /** Open the menu and let the pop-in settle, so axe never samples a mid-fade colour. */
  async function openAccountMenu(page: import('@playwright/test').Page): Promise<void> {
    await page.getByTestId('nav-user').click();
    await page
      .locator('.riv-account-pop')
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  }

  test('the account menu closes on Escape and on the backdrop, restoring focus (#351)', async ({
    page,
  }) => {
    await page.goto('/');

    const trigger = page.getByTestId('nav-user');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();

    // The one new interactive control in the nav row must hover like its siblings.
    await expect(trigger).toHaveCSS('cursor', 'pointer');

    await openAccountMenu(page);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('nav-account-link')).toBeVisible();
    await expectNoSeriousAxeViolations(page, 'account menu open');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();
    await expect(trigger).toBeFocused();

    await openAccountMenu(page);
    await page.getByTestId('account-backdrop').click();
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  /**
   * Only one header popover is open at a time. Reached by KEYBOARD on purpose: an open popover
   * lays a full-viewport backdrop whose job is to swallow the next pointer click and close the
   * menu, so a mouse user can never activate the sibling trigger directly — they close, then
   * click. A keyboard user tabs straight to it and can, which is the path that would strand two
   * popovers open if the toggles stopped clearing each other.
   */
  test('activating the theme picker from the open account menu closes it (#351)', async ({
    page,
  }) => {
    await page.goto('/');

    await openAccountMenu(page);
    await expect(page.getByTestId('nav-account-menu')).toBeVisible();

    await page.getByTestId('theme-toggle').press('Enter');
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();
    await expect(page.getByTestId('theme-option-porcelain')).toBeVisible();

    await page.getByTestId('nav-user').press('Enter');
    await expect(page.getByTestId('theme-option-porcelain')).toBeHidden();
    await expect(page.getByTestId('nav-account-menu')).toBeVisible();
  });

  test('the backdrop swallows the click that closes the account menu (#351)', async ({ page }) => {
    await page.goto('/');
    await openAccountMenu(page);

    // The click lands on the backdrop, not the toggle under it — so the picker stays shut.
    await page.getByTestId('theme-toggle').click({ force: true });
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();
    await expect(page.getByTestId('theme-option-porcelain')).toBeHidden();
  });

  test('the account menu reaches the account page and closes on navigation (#351)', async ({
    page,
  }) => {
    await page.goto('/');

    await openAccountMenu(page);
    await page.getByTestId('nav-account-link').click();

    await expect(page).toHaveURL(/\/account\/password$/);
    await expect(page.getByTestId('setpw-email')).toContainText(EMAIL);
    // The popover must not survive its own navigation.
    await expect(page.getByTestId('nav-account-menu')).toBeHidden();
    await expect(page.getByTestId('nav-user')).toHaveAttribute('aria-expanded', 'false');
    // Focus must stay in the page, not fall to body; this destination then autofocuses its input.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('main')))
      .toBe(true);
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the mobile menu offers the same account destination (#351)', async ({ page }) => {
      await page.goto('/');

      await page.getByTestId('menu-toggle').click();
      await expect(page.getByTestId('nav-user-mobile')).toContainText(EMAIL);
      await expectNoSeriousAxeViolations(page, 'mobile menu with the account group');

      await page.getByTestId('nav-account-link-mobile').click();
      await expect(page).toHaveURL(/\/account\/password$/);
      await expect(page.getByTestId('mobile-menu')).toBeHidden();
    });
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
