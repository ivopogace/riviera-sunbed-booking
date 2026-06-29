import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render a11y audit of the Instant-Book flow (issue #6, AC-12/AC-13): beach map →
 * keyboard-select a free online set → booking dialog (focus trapped) → confirmation. Runs
 * axe at each step in a real browser — catching keyboard, focus-management and true
 * colour-contrast issues jsdom can't. The API is mocked, so the test is self-contained.
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
    { id: 1, rowLabel: 'Front row · Sea view', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'TAKEN' },
    { id: 2, rowLabel: 'Front row · Sea view', positionNo: 2, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 2, gridY: 1, availability: 'FREE' },
    { id: 3, rowLabel: 'Row 4 · Back', positionNo: 1, tier: 'STANDARD', pool: 'WALK_IN', price: { minorUnits: 2500, currency: 'EUR' }, gridX: 1, gridY: 2, availability: 'FREE' },
  ],
};

const CONFIRMATION = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
};

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/venues/1', (route) =>
    route.fulfill({ json: VENUE }),
  );
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );
});

test('booking flow is accessible end-to-end', async ({ page }) => {
  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'beach map');

  // Keyboard-select the free online set (the seat-picker must be operable by keyboard).
  const bookable = page.locator('.set-button').first();
  await bookable.focus();
  await expect(bookable).toBeFocused();
  await page.keyboard.press('Enter');

  // The dialog opens and focus is moved inside it (modal focus management).
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input').first()).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'booking dialog');

  // Complete the guest form and submit.
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Confirm booking' }).click();

  // Lands on the confirmation with the booking code.
  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('ABCD234567');
  await expectNoSeriousAxeViolations(page, 'booking confirmation');
});
