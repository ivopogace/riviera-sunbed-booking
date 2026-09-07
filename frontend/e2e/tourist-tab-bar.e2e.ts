import { expect, test, type Page } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { completeDialog } from './support/booking-dialog';
import { awaitRoutedPage, openShellOverlay } from './support/shell';

/**
 * The phone bottom tab bar's rendered-only rules: below `sm` the top bar scrolls away and
 * the bar is the only sticky chrome; nothing on a page sits under the bar; the payment page has no
 * bar and `Pay €45` stays wholly in view; the header popovers' backdrop covers the bar (it is
 * rendered before the header for exactly that); the bar paints its own near-opaque token per
 * theme; and the sheet clears the bar and moves focus in and back out. All of it reads computed
 * boxes and styles, which jsdom cannot paint — the declarations and the focus legs are pinned in
 * `app.spec.ts`, the token maths in `app.contrast.spec.ts`. The API is mocked (`page.route`), so
 * the spec is CI-safe like its siblings.
 */

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['SHOWERS'],
  distanceToWaterM: 15,
  availability: { free: 4, total: 6 },
  coverPhoto: null,
  photos: [],
  sets: Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 3 ? 'Front row · Sea view' : 'Second row',
    positionNo: (i % 3) + 1,
    tier: i < 3 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: (i % 3) + 1,
    gridY: i < 3 ? 1 : 2,
    availability: 'FREE',
  })),
};

/** Enough venue cards that the home page scrolls at 390×844, so the top bar can scroll away. */
const VENUES = Array.from({ length: 8 }, (_, i) => ({
  ...VENUE,
  id: i + 1,
  name: `Beach ${i + 1}`,
}));

/** The bar's height: 60px tabs plus the 1px top border; the shell pads the page by the same. */
const BAR_HEIGHT = 61;

async function mockTourist(page: Page): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (route) =>
    route.fulfill({ json: { reviews: [], nextCursor: null } }),
  );
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      status: 202,
      json: {
        code: 'WXYZ345678',
        status: 'AWAITING_PAYMENT',
        venueId: 1,
        venueName: 'Miramar Beach Club',
        setId: 2,
        rowLabel: 'Front row · Sea view',
        positionNo: 2,
        bookingDate: '2026-12-01',
        amount: { minorUnits: 4500, currency: 'EUR' },
        clientSecret: 'pi_123_secret_abc',
        paymentIntentId: 'pi_123',
      },
    }),
  );
}

/** The shell root's computed bottom padding — the bar's clearance, or none where the bar is gone. */
function shellPaddingBottom(page: Page): Promise<string> {
  return page.locator('app-root > div').evaluate((shell) => getComputedStyle(shell).paddingBottom);
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
  });

  test('the top bar is relative and scrolls away; the bar is the only sticky chrome below sm', async ({
    page,
  }) => {
    await page.goto('/');
    await awaitRoutedPage(page);
    const header = page.locator('header');
    const bar = page.getByTestId('tab-bar');
    await expect(header).toHaveCSS('position', 'relative');
    await expect(bar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 600));
    const chrome = await page.evaluate(() => {
      const header = document.querySelector('header')!.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="tab-bar"]')!.getBoundingClientRect();
      return { headerBottom: header.bottom, barTop: bar.top, barBottom: bar.bottom };
    });
    // Scrolled off the top; pinned to the bottom edge, 61px tall.
    expect(chrome.headerBottom).toBeLessThanOrEqual(0);
    expect(chrome.barBottom).toBe(844);
    expect(chrome.barTop).toBe(844 - BAR_HEIGHT);
    expect(await shellPaddingBottom(page)).toBe(`${BAR_HEIGHT}px`);
  });

  test('nothing on the beach map is occluded by the bar', async ({ page }) => {
    await page.goto('/venues/1');
    await expect(page.getByRole('button', { name: /Select to book/ }).first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const boxes = await page.evaluate(() => {
      const barTop = document.querySelector('[data-testid="tab-bar"]')!.getBoundingClientRect().top;
      const lastBottom = Math.max(
        ...[...document.querySelectorAll('a, button, input, select, textarea')]
          .filter((el) => !el.closest('[data-testid="tab-bar"]'))
          .map((el) => el.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => rect.bottom),
      );
      return { barTop, lastBottom };
    });
    // The page's last control (a footer legal link) ends above the bar's top edge.
    expect(boxes.lastBottom).toBeLessThanOrEqual(boxes.barTop);
  });

  test('the payment page has no bar and Pay €45 is fully visible', async ({ page }) => {
    await mockChallengeFence(page, 'off');
    // The deterministic gateway: without it the page never leaves its mounting state.
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
    });
    // Via the dialog: a direct /booking/pay visit renders only the empty state.
    await page.goto('/venues/1');
    await expect(page.getByTestId('tab-bar')).toBeVisible();
    await page
      .getByRole('button', { name: /Select to book/ })
      .first()
      .click();
    await completeDialog(page.getByRole('dialog'), 'Continue to payment');
    await expect(page).toHaveURL(/\/booking\/pay/);
    await expect(page.getByTestId('pay-button')).toBeVisible();

    // No thumb-reach exit under the Pay button: the bar and its clearance are both gone.
    await expect(page.getByTestId('tab-bar')).toHaveCount(0);
    await expect(page.locator('nav', { hasText: 'Beaches' })).toBeHidden();
    expect(await shellPaddingBottom(page)).toBe('0px');
    await page.getByTestId('pay-button').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('pay-button')).toBeInViewport({ ratio: 1 });
  });

  test("the theme popover's backdrop covers the tab bar", async ({ page }) => {
    await page.goto('/');
    await openShellOverlay(page, 'theme-toggle');
    await expect(page.getByTestId('theme-option-riviera')).toBeVisible();

    const hit = await page.evaluate(() => {
      const tab = document.querySelector('[data-testid="tab-beaches"]')!.getBoundingClientRect();
      return document
        .elementFromPoint(tab.left + tab.width / 2, tab.top + tab.height / 2)
        ?.getAttribute('data-testid');
    });
    // The bar is an EARLIER z-20 sibling of the header, so the header's backdrop paints over it.
    expect(hit).toBe('theme-backdrop');
  });

  for (const { theme, background } of [
    { theme: 'porcelain', background: 'rgba(255, 255, 255, 0.85)' },
    { theme: 'riviera', background: 'rgba(10, 44, 63, 0.92)' },
    { theme: 'dark', background: 'rgba(15, 23, 42, 0.92)' },
  ]) {
    test(`the bar paints its own near-opaque token in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
      await page.goto('/venues/1');
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);

      const bar = page.getByTestId('tab-bar');
      await expect(bar).toHaveCSS('background-color', background);
      // Its own token, not a second coat of the header glass.
      await expect(bar).toHaveClass(/bg-riv-tabbar-glass/);
      await expect(bar).not.toHaveClass(/bg-riv-header-glass/);
    });
  }

  test('the sheet clears the bar, takes focus on open and hands it back on Escape and on the backdrop', async ({
    page,
  }) => {
    await page.goto('/');
    await openShellOverlay(page, 'menu-toggle');
    const sheet = page.getByTestId('mobile-menu');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('nav-signin-mobile')).toBeFocused();

    const gap = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="mobile-menu"]')!.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="tab-bar"]')!.getBoundingClientRect();
      return { sheetBottom: sheet.bottom, barTop: bar.top };
    });
    expect(gap.sheetBottom).toBeLessThan(gap.barTop);
    // env(safe-area-inset-bottom) is 0 here: Chromium cannot emulate an inset, so the calc reads 76px.
    await expect(sheet).toHaveCSS('bottom', '76px');

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('menu-toggle')).toBeFocused();

    await page.getByTestId('menu-toggle').click();
    await expect(page.getByTestId('nav-signin-mobile')).toBeFocused();
    await page.mouse.click(195, 200);
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('menu-toggle')).toBeFocused();
  });
});

test.describe('tablet: the inline nav, no bar', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('the header sticks and the bar is not laid out', async ({ page }) => {
    await mockTourist(page);
    await page.goto('/');
    await awaitRoutedPage(page);

    await expect(page.locator('header')).toHaveCSS('position', 'sticky');
    await expect(page.getByTestId('tab-bar')).toBeHidden();
    await expect(page.locator('.riv-nav-desktop')).toBeVisible();
    expect(await shellPaddingBottom(page)).toBe('0px');
  });
});
