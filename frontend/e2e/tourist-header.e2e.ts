import { expect, test, type Page } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { completeDialog } from './support/booking-dialog';
import { awaitRoutedPage } from './support/shell';

/**
 * The tourist header's two rendered-only rules: nothing in the bar wears the page's primary-button
 * skin — on `/booking/pay`, where `Pay €45` must be the one teal primary on screen — and the bare
 * theme swatch keeps its ring, the only WCAG 1.4.11 boundary a label-less control has. Both read
 * computed styles, which jsdom cannot paint; the maths behind the ring is `app.contrast.spec.ts`.
 * The API is mocked (`page.route`), so the spec is CI-safe like its siblings.
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

const SIGNED_IN = { username: 'ana@example.com', principalType: 'CUSTOMER', emailVerified: true };

async function mockTourist(page: Page, signedIn: boolean): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: SIGNED_IN })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [VENUE] }));
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

/** Reaches `/booking/pay` the only way it renders its pay button: through the booking dialog. */
async function gotoPayPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
  });
  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await completeDialog(page.getByRole('dialog'), 'Continue to payment');
  await expect(page).toHaveURL(/\/booking\/pay/);
  await expect(page.getByTestId('pay-button')).toBeVisible();
}

/** Every header descendant's class list and computed background image, against the pay button's. */
async function headerCtaWearers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const payGradient = getComputedStyle(
      document.querySelector('[data-testid="pay-button"]')!,
    ).backgroundImage;
    return [...document.querySelectorAll('header *')]
      .filter(
        (el) =>
          el.className.toString().includes('riv-cta-grad') ||
          getComputedStyle(el).backgroundImage === payGradient,
      )
      .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? ''}]`);
  });
}

test.describe('no header control wears the CTA gradient on the pay page', () => {
  test.beforeEach(async ({ page }) => {
    await mockChallengeFence(page, 'off');
  });

  test('signed out', async ({ page }) => {
    await mockTourist(page, false);
    await gotoPayPage(page);

    expect(await headerCtaWearers(page)).toEqual([]);
  });

  test('signed in — the avatar included', async ({ page }) => {
    await mockTourist(page, true);
    await gotoPayPage(page);
    await expect(page.getByTestId('nav-user')).toBeVisible();

    expect(await headerCtaWearers(page)).toEqual([]);
  });
});

test.describe('the theme swatch', () => {
  test.beforeEach(async ({ page }) => {
    await mockTourist(page, false);
  });

  /** The ring lives on the swatch pseudo-element, as a box-shadow `--riv-ink-soft` wide 1.5px. */
  async function swatchRing(page: Page): Promise<string> {
    await awaitRoutedPage(page);
    return page
      .getByTestId('theme-toggle')
      .evaluate((el) => getComputedStyle(el, '::before').boxShadow);
  }

  test('carries a 1.5px ink-soft ring in the porcelain theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    expect(await swatchRing(page)).toContain('rgba(12, 42, 51, 0.7) 0px 0px 0px 1.5px');
  });

  test('carries a 1.5px ink-soft ring in the riviera theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'riviera'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    expect(await swatchRing(page)).toContain('rgba(255, 255, 255, 0.86) 0px 0px 0px 1.5px');
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('stays in the bar beside the hamburger, one tap from any page', async ({ page }) => {
      await page.goto('/');
      await awaitRoutedPage(page);
      await expect(page.getByTestId('theme-toggle')).toBeVisible();
      await expect(page.getByTestId('menu-toggle')).toBeVisible();
      await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName(/^Color theme: /);

      await page.getByTestId('theme-toggle').click();
      await page.getByTestId('theme-option-dark').click();
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    });
  });
});
