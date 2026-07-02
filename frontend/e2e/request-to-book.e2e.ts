import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render a11y + behaviour audit of the Request-to-Book flow (issue #98): REQUEST-mode beach
 * map → dialog with the "Request to book" CTA → 202 PENDING_REQUEST → request-sent screen → the
 * booking-by-code view through its request lifecycle (pending → accepted "Pay now" → fake-Stripe
 * payment → poll to CONFIRMED; plus the DECLINED terminal view). The API is mocked (`page.route`,
 * stateful status like booking-flow.e2e.ts) and Stripe is the deterministic fake
 * (`__RIVIERA_FAKE_STRIPE__`), so the suite is CI-safe with no backend.
 */

const CODE = 'RQST234567';

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'REQUEST',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  sets: [
    { id: 1, rowLabel: 'Front row · Sea view', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'TAKEN' },
    { id: 2, rowLabel: 'Front row · Sea view', positionNo: 2, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 2, gridY: 1, availability: 'FREE' },
  ],
};

const REQUESTED = {
  code: CODE,
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: '2026-11-30T16:00:00Z',
};

const DETAIL_BASE = {
  code: CODE,
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: false,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: '2026-11-30T16:00:00Z',
  payment: null,
};

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
});

test('request-to-book: request dialog → 202 PENDING_REQUEST → request-sent → pending view', async ({ page }) => {
  await page.route('**/api/bookings', (route) => route.fulfill({ status: 202, json: REQUESTED }));
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: DETAIL_BASE }),
  );

  await page.goto('/venues/1');
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();
  await page.getByRole('button', { name: /Select to book/ }).first().click();

  // The dialog is mode-aware: request CTA + no-charge copy.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Request this set' })).toBeVisible();
  await expect(dialog).toContainText('won’t be charged unless the venue accepts');
  await expectNoSeriousAxeViolations(page, 'request dialog');

  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Request to book' }).click();

  // Lands on the request-sent screen: the code, the deadline, the only-pay-if-accepted note.
  await expect(page).toHaveURL(/\/booking\/requested/);
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await expect(page.getByTestId('request-deadline')).not.toBeEmpty();
  await expect(page.getByText('you’ll only pay if the venue accepts')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'request-sent screen');

  // Check status by code: still pending — waiting copy + deadline.
  await page.getByTestId('status-link').click();
  await expect(page).toHaveURL(new RegExp(`/booking/${CODE}`));
  await expect(page.getByTestId('request-pending')).toContainText('Waiting for the venue');
  await expectNoSeriousAxeViolations(page, 'booking view (pending request)');
});

test('accepted request: Pay now → fake Stripe → poll to CONFIRMED (invariant #8)', async ({ page }) => {
  // Deterministic fake Stripe (no js.stripe.com) for the pay-on-accept step.
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
  });
  // Stateful booking-by-code mock: the (mocked) webhook flips the status once the card is paid.
  let phase: 'accepted' | 'paid' = 'accepted';
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) => {
    if (phase === 'accepted') {
      return route.fulfill({
        json: {
          ...DETAIL_BASE,
          status: 'AWAITING_PAYMENT',
          payment: { clientSecret: 'pi_123_secret_abc', paymentIntentId: 'pi_123' },
        },
      });
    }
    return route.fulfill({
      json: { ...DETAIL_BASE, status: 'CONFIRMED', requestExpiresAt: null },
    });
  });

  // The guest returns to their booking after the venue accepted → "Pay now" is offered.
  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('request-accepted')).toContainText('Request accepted');
  await expectNoSeriousAxeViolations(page, 'booking view (request accepted)');
  await page.getByTestId('pay-now').click();

  // The existing pay page takes over on the fetched clientSecret (fake Stripe).
  await expect(page).toHaveURL(/\/booking\/pay/);
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible();
  await expect(page.getByTestId('pay-button')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'payment page (ready)');

  // Pay → the page polls the backend and only then shows confirmed (invariant #8).
  phase = 'paid';
  await page.getByTestId('pay-button').click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await expectNoSeriousAxeViolations(page, 'payment page (confirmed)');
});

test('a declined request shows terminal no-charge copy', async ({ page }) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: { ...DETAIL_BASE, status: 'DECLINED', requestExpiresAt: null } }),
  );

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('request-declined')).toContainText('Request declined');
  await expect(page.getByTestId('request-declined')).toContainText('haven’t been charged');
  await expect(page.getByTestId('booking-status')).toContainText('Declined');
  await expectNoSeriousAxeViolations(page, 'booking view (declined request)');
});
