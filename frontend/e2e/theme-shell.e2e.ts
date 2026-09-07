import { expect, test } from '@playwright/test';

import { mockWholeAdminConsole } from './support/admin-console.mocks';
import { mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { mockWholeConsole } from './support/operator-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import {
  awaitRoutedPage,
  openAccountMenu as openMenu,
  openOperatorAccountMenu,
  openShellOverlay,
} from './support/shell';

/**
 * Real-render e2e for the Liquid Glass shell: theme switching + persistence,
 * the phone tab bar's sheet, the reduced-motion guard, and what the shell paints before the
 * first route lands — with axe sweeps in both themes (the real-browser half of the contrast
 * audit). The discovery API is mocked (`page.route`), so the spec is CI-safe like its siblings.
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
    await openShellOverlay(page, 'theme-toggle');
    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
  });
});

test.describe('hero scrim token', () => {
  test.use({ colorScheme: 'dark' });

  // The real-browser half of home.contrast.spec.ts's scrim maths (--riv-hero-scrim, tailwind.css).
  test('paints the hero in riviera only, none in porcelain and dark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    const heroBg = () =>
      page.locator('.hero').evaluate((hero) => getComputedStyle(hero).backgroundImage);

    expect(await heroBg()).toBe('none');

    await openShellOverlay(page, 'theme-toggle');
    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    const rivieraBg = await heroBg();
    expect(rivieraBg).toContain('linear-gradient');
    expect(rivieraBg).toContain('rgba(8, 38, 52, 0.72) 34px');
    expect(rivieraBg).toContain('calc(100% - 40px)');

    await openShellOverlay(page, 'theme-toggle');
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    expect(await heroBg()).toBe('none');
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
    await openShellOverlay(page, 'theme-toggle');
    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(page.getByTestId('filter-date')).toHaveCSS('color-scheme', 'light');

    await openShellOverlay(page, 'theme-toggle');
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

test.describe('pre-navigation shell paint (#992)', () => {
  test('<main> adds no surface of its own before the route chunk lands (AC-2)', async ({
    page,
  }) => {
    let withheld = 0;
    // Withhold the one lazy chunk carrying the Beaches page, matched on content: its name is hashed.
    await page.route(/chunk-[A-Z0-9]+\.js/i, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes('filter-beach')) {
        withheld++;
        return;
      }
      await route.fulfill({ response, body });
    });

    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.riv-header')).toBeVisible();

    // Exactly one chunk withheld: the window below is held open, not merely unpainted yet.
    await expect.poll(() => withheld).toBe(1);
    await expect(page.getByTestId('filter-beach')).toHaveCount(0);
    // jsdom cannot show a paint, so the shell's own background is only assertable here.
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.riv-bg')).toBeAttached();
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

    await openShellOverlay(page, 'theme-toggle');
    // Let the pop-in animation finish — axe samples computed colours, and mid-fade opacity
    // reads as washed-out text (a false contrast failure).
    await page
      .locator('.riv-theme-pop')
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await expectNoSeriousAxeViolations(page, 'dark shell, theme picker open');

    await page.getByTestId('theme-option-riviera').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    await expectNoSeriousAxeViolations(page, 'riviera shell');

    await openShellOverlay(page, 'theme-toggle');
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expectNoSeriousAxeViolations(page, 'porcelain shell');
  });
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Menu tab opens the sheet, navigates, closes on Escape with focus returned (AC-3, #1003)', async ({
    page,
  }) => {
    await page.goto('/');

    // The sheet's trigger is the bar's third tab; the desktop nav and its menu button are collapsed.
    const toggle = page.getByTestId('tab-bar').getByTestId('menu-toggle');
    await expect(toggle).toBeVisible();
    await expect(page.locator('.riv-nav-desktop')).toBeHidden();
    await expect(page.getByTestId('nav-menu')).toBeHidden();

    await openShellOverlay(page, 'menu-toggle');
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

    await openShellOverlay(page, 'menu-toggle');
    await expectNoSeriousAxeViolations(page, 'tab-bar sheet open');

    // The swatch stays in the bar at phone width; picking a theme closes the open sheet too.
    await page.getByTestId('theme-toggle').press('Enter');
    await expect(page.getByTestId('mobile-menu')).toBeHidden();
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expect(page.getByTestId('theme-option-porcelain')).toBeHidden(); // selection closes the picker
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
    await openMenu(page);
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

    test('the phone sheet offers the same account destination (#351)', async ({ page }) => {
      await page.goto('/');

      await openShellOverlay(page, 'menu-toggle');
      await expect(page.getByTestId('nav-user-mobile')).toContainText(EMAIL);
      await expectNoSeriousAxeViolations(page, 'phone sheet with the account group');

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

/**
 * The console shell under a tourist theme: every operator and admin route renders the operator's
 * own console theme on the app shell's host whatever the document theme, the document attribute
 * is left alone, and the header, rail, page and footer composite to the same colours under every
 * tourist theme — the pin has no seam, and `riviera` never reaches the console.
 */
test.describe('console routes under a tourist theme', () => {
  const ROUTES = [
    { path: '/operator/1/daily', marker: 'daily-view-tab' },
    { path: '/admin', marker: 'admin-op-row' },
    { path: '/operator', marker: 'operator-home-picker' },
    { path: '/account/operator-password', marker: 'oppw-submit' },
  ];

  /** The composited colours of the chrome and the page, as Chromium paints them. */
  async function paint(page: import('@playwright/test').Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
      const style = (selector: string, property: string) => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el).getPropertyValue(property) : 'absent';
      };
      return {
        header: style('[data-testid="oc-header"]', 'background-color'),
        headerBorder: style('[data-testid="oc-header"]', 'border-bottom-color'),
        brand: style('[data-testid="oc-brand"]', 'color'),
        admin: style('[data-testid="oc-section-admin"]', 'color'),
        rail: style('nav[aria-label$="console sections"]', 'box-shadow'),
        page: style('main', 'color'),
        bg: style('.riv-bg', 'background-image'),
        footer: style('.riv-footer', 'background-color'),
      };
    });
  }

  test('every console route renders its own console theme under a dark and a riviera tourist theme, with no seam', async ({
    page,
  }) => {
    await mockWholeConsole(page);
    await mockWholeAdminConsole(page);
    await mockOwnedVenues(page, [
      { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
      { id: 2, name: 'Sunset Lido', beach: 'Dhërmi' },
    ]);
    await new OperatorSignInPage(page).goto('/operator/1/daily');
    await new OperatorSignInPage(page).signIn('operator', 'admin-pw');

    for (const { path, marker } of ROUTES) {
      const consoleRuns: Record<string, Record<string, string>> = {};
      for (const consoleTheme of ['porcelain', 'dark']) {
        await page.evaluate(
          (id) => localStorage.setItem('riviera-console-theme', id),
          consoleTheme,
        );
        const runs: Record<string, Record<string, string>> = {};
        for (const theme of ['porcelain', 'dark', 'riviera']) {
          await page.evaluate((id) => localStorage.setItem('riviera-theme', id), theme);
          await page.goto(path);
          await expect(page.getByTestId(marker).first()).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
          await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', consoleTheme);
          runs[theme] = await paint(page);
        }
        expect(runs['dark'], `${path}, ${consoleTheme} console under dark`).toEqual(
          runs['porcelain'],
        );
        expect(runs['riviera'], `${path}, ${consoleTheme} console under riviera`).toEqual(
          runs['porcelain'],
        );
        consoleRuns[consoleTheme] = runs['porcelain'];
      }
      // The two console themes are two paints — the pin, not the document, decides.
      expect(consoleRuns['dark']['header'], `${path}: the dark console's header`).not.toBe(
        consoleRuns['porcelain']['header'],
      );
    }
    await page.evaluate(() => {
      localStorage.removeItem('riviera-theme');
      localStorage.removeItem('riviera-console-theme');
    });
  });

  /** Every console route under the dark console: the sweep the Daily view's page-level legend fell
   *  to (light ink on the page, which axe composites as white), run over every tab and page so a
   *  surface-less text anywhere in the console is found here rather than by an operator. */
  test('every console route is axe clean in the dark console (#1010)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-console-theme', 'dark'));
    await mockWholeConsole(page);
    await mockWholeAdminConsole(page);
    await mockOwnedVenues(page, [
      { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
      { id: 2, name: 'Sunset Lido', beach: 'Dhërmi' },
    ]);
    await new OperatorSignInPage(page).goto('/operator/1/daily');
    await new OperatorSignInPage(page).signIn('operator', 'admin-pw');

    const paths = [
      '/operator/1/daily',
      '/operator/1/requests',
      '/operator/1/beach-map',
      '/operator/1/pricing',
      '/operator/1/venue',
      '/operator/1/payouts',
      '/admin',
      '/admin/email',
      '/admin/refunds',
      '/admin/photos',
      '/admin/reviews',
      '/admin/commissions',
      '/admin/privacy',
      '/admin/audit',
      '/operator',
      '/account/operator-password',
    ];
    for (const path of paths) {
      await page.goto(path);
      await awaitRoutedPage(page);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'dark');
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${path} in the dark console`);
    }
    await page.evaluate(() => localStorage.removeItem('riviera-console-theme'));
  });

  test("the account chip's Dark row flips the console host only, survives a reload, and Porcelain flips it back (#1010)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'riviera'));
    await mockWholeConsole(page);
    await mockOwnedVenues(page, [{ id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' }]);
    await new OperatorSignInPage(page).goto('/operator/1/daily');
    await new OperatorSignInPage(page).signIn('operator', 'admin-pw');
    await expect(page.getByTestId('daily-view-tab')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');
    const porcelain = await paint(page);

    await openOperatorAccountMenu(page);
    const group = page.getByRole('group', { name: 'Console theme' });
    await expect(group.getByRole('button', { name: 'Porcelain' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await group.getByRole('button', { name: 'Dark' }).click();

    // The row closes the popover and hands focus back; the host flips, the document does not.
    await expect(page.getByTestId('oc-account')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('oc-account')).toBeFocused();
    await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    const dark = await paint(page);
    expect(dark['header']).not.toBe(porcelain['header']);
    expect(dark['page']).not.toBe(porcelain['page']);
    await expectNoSeriousAxeViolations(page, 'the daily view in the dark console under riviera');

    // The choice is on the device: a reload boots dark, and the row reads pressed.
    await page.reload();
    await expect(page.getByTestId('daily-view-tab')).toBeVisible();
    await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    await openOperatorAccountMenu(page);
    await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group.getByRole('button', { name: 'Porcelain' }).click();
    await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');
    expect(await paint(page)).toEqual(porcelain);

    await page.evaluate(() => {
      localStorage.removeItem('riviera-theme');
      localStorage.removeItem('riviera-console-theme');
    });
  });
});
