import { expect, test } from '@playwright/test';

import { settle } from './support/booking-dialog';

/**
 * The booking dialog's Back button paints its hover-only border from the token registry,
 * asserted against a real render (issue #839). The computed style is what is checked, never the
 * class list: a `--riv-wash-hover-border` declared without its `@theme inline` row generates no
 * utility at all, and nothing but the resolved value separates that from a working token — the
 * `admin-token-inks.e2e.ts` / `accent-token-inks.e2e.ts` pattern, applied here because this token
 * is the button's own WCAG 1.4.11 affordance boundary, not decorative chrome.
 */

const HOVER_BORDER = 'rgba(10, 79, 94, 0.6)';
const DARK_HOVER_BORDER = 'rgba(183, 223, 233, 0.55)';

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
    {
      id: 1,
      rowLabel: 'Front row · Sea view',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
});

/** Opens the dialog and advances to Review, where the Back button renders. */
async function openReviewStep(page: import('@playwright/test').Page) {
  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await settle(page);

  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  const back = dialog.getByTestId('dialog-back');
  await expect(back).toBeVisible();
  return back;
}

test('the Back button hover border resolves to the registered token value', async ({ page }) => {
  const back = await openReviewStep(page);

  await back.hover();
  await expect(back).toHaveCSS('border-top-color', HOVER_BORDER);
});

test('the Back button keeps its own dark hover border under a dark document theme', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
  const back = await openReviewStep(page);

  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

  await back.hover();
  await expect(back).toHaveCSS('border-top-color', DARK_HOVER_BORDER);
});
