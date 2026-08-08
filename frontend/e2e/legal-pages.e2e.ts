import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render e2e for the legal surfaces: the two draft documents at
 * `/legal/*` (privacy axe-audited in both themes; terms shares the identical surface recipe,
 * audited once), the checkout agreement links on the booking dialog's Review step, and the
 * standing footer links — every legal link opens a new tab so checkout/console state survives
 * the read. The API is mocked (`page.route`), so the spec is CI-safe.
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
  sets: [
    { id: 2, rowLabel: 'Front row · Sea view', positionNo: 2, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 2, gridY: 1, availability: 'FREE' },
  ],
};

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

test.describe('legal documents', () => {
  // Pin dark so the riviera sweep really audits riviera (headless defaults light → porcelain).
  test.use({ colorScheme: 'dark' });

  test('privacy page renders the draft document, axe-clean in both themes', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByTestId('legal-draft-banner')).toContainText('Draft');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'privacy page (riviera)');

    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-option-porcelain').click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'privacy page (porcelain)');
  });

  test('terms page renders the draft document with the cancellation rule, axe-clean', async ({
    page,
  }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByTestId('legal-draft-banner')).toContainText('Draft');
    await expect(page.getByTestId('terms-cancellation')).toContainText('evening before');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'terms page');
  });
});

test('checkout Review step links open the terms in a new tab, keeping the dialog alive', async ({
  page,
}) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));

  await page.goto('/venues/1');
  await page.getByRole('button', { name: /Select to book/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  const agreement = dialog.getByTestId('legal-agreement');
  await expect(agreement).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking dialog (Review) with agreement');

  const popupPromise = page.waitForEvent('popup');
  await agreement.getByTestId('legal-terms-link').click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/legal\/terms$/);
  await expect(popup.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();

  // The checkout state survived the read: the dialog is still on Review in the original tab.
  await expect(dialog.getByTestId('dialog-primary')).toHaveText('Continue to payment');
});

test('footer carries the standing legal links, opening in a new tab', async ({ page }) => {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));

  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.locator('.riv-footer').getByRole('link', { name: 'Privacy' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/legal\/privacy$/);
  await expect(popup.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  // The originating page never navigated — footer links must not tear down app state.
  await expect(page).toHaveURL(/\/$/);
});
