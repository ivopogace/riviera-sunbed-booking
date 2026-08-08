import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of the Request-to-Book flow: REQUEST-mode beach map → 2-step
 * dialog whose Review step shows the "Send request" CTA + no-charge copy → 202 PENDING_REQUEST →
 * request-sent screen → the booking-by-code view through its request lifecycle (pending → accepted
 * "Pay now" → fake-Stripe payment → poll to CONFIRMED; plus the guest's own withdraw and the
 * DECLINED/EXPIRED terminal views). The API is mocked (`page.route`) and Stripe is the
 * deterministic fake (`__RIVIERA_FAKE_STRIPE__`), so the suite is CI-safe with no backend.
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
  withdrawable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: '2026-11-30T16:00:00Z',
  payment: null,
};

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

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'request dialog (Details)');

  // Fill Details and advance to Review — the mode-aware copy lives on Review now.
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(dialog).toContainText(/won.t be charged/);
  await expect(dialog.getByRole('button', { name: 'Send request' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'request dialog (Review)');
  await dialog.getByRole('button', { name: 'Send request' }).click();

  // Lands on the request-sent screen: the code, the deadline, the no-charge note.
  await expect(page).toHaveURL(/\/booking\/requested/);
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await expect(page.getByTestId('request-deadline')).not.toBeEmpty();
  await expect(page.getByText(/haven.t been charged/)).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'request-sent screen');

  // Check status by code: still pending — waiting copy + deadline (booking-view, unchanged).
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
  await expect(page.getByRole('heading', { name: /You.re booked/ })).toBeVisible();
  await expect(page.getByTestId('booking-code')).toContainText(CODE);
  await expectNoSeriousAxeViolations(page, 'payment page (confirmed)');
});

test('pay window closed mid-page: Pay now fails → honest terminal state + link back (#126)', async ({ page }) => {
  // Fake Stripe whose confirm fails like a dead PaymentIntent (the sweep cancelled it).
  await page.addInitScript(() => {
    const w = window as unknown as {
      __RIVIERA_FAKE_STRIPE__?: boolean;
      __RIVIERA_FAKE_STRIPE_FAIL__?: boolean;
    };
    w.__RIVIERA_FAKE_STRIPE__ = true;
    w.__RIVIERA_FAKE_STRIPE_FAIL__ = true;
  });
  // Stateful mock: accepted while the page loads; CANCELLED by the time the guest taps Pay.
  let phase: 'accepted' | 'cancelled' = 'accepted';
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
      json: { ...DETAIL_BASE, status: 'CANCELLED', withdrawable: false, requestExpiresAt: null },
    });
  });

  await page.goto(`/booking/${CODE}`);
  await page.getByTestId('pay-now').click();
  await expect(page).toHaveURL(/\/booking\/pay/);
  await expect(page.getByTestId('pay-button')).toBeVisible();

  // The pay-window sweep cancels the booking while the guest sits on the page.
  phase = 'cancelled';
  await page.getByTestId('pay-button').click();

  // The failure re-checks server truth and goes terminal — no retry loop on a dead intent.
  await expect(page.getByRole('heading', { name: /couldn.t be completed/ })).toBeVisible();
  await expect(page.getByTestId('pay-button')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'payment page (terminal, dead intent)');

  // The way back: the code-gated booking view has the authoritative status.
  await page.getByTestId('booking-status-link').click();
  await expect(page).toHaveURL(new RegExp(`/booking/${CODE}`));
});

test('a guest withdraws their pending request and the spot is freed (#123)', async ({ page }) => {
  let withdrawn = false;
  const withdrawCalls: string[] = [];
  await page.route(new RegExp(`/api/bookings/${CODE}/withdraw$`), (route) => {
    withdrawCalls.push(route.request().method());
    withdrawn = true;
    return route.fulfill({ json: { code: CODE, status: 'WITHDRAWN' } });
  });
  // The post-withdraw reload serves the new terminal state, exactly as the backend would.
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({
      json: withdrawn
        ? { ...DETAIL_BASE, status: 'WITHDRAWN', withdrawable: false, requestExpiresAt: null }
        : DETAIL_BASE,
    }),
  );

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('request-pending')).toContainText('Waiting for the venue');

  await page.getByTestId('withdraw-request').click();
  await expect(page.getByText('Withdraw this request?')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'booking view (withdraw confirmation)');

  await page.getByTestId('confirm-withdraw').click();

  await expect(page.getByTestId('booking-status')).toContainText('Withdrawn');
  expect(withdrawCalls).toEqual(['POST']);
  await expectNoSeriousAxeViolations(page, 'booking view (withdrawn request)');
});

test('the withdraw confirmation can be backed out of without calling the API', async ({ page }) => {
  let withdrawCalled = false;
  await page.route(new RegExp(`/api/bookings/${CODE}/withdraw$`), (route) => {
    withdrawCalled = true;
    return route.fulfill({ json: { code: CODE, status: 'WITHDRAWN' } });
  });
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: DETAIL_BASE }),
  );

  await page.goto(`/booking/${CODE}`);
  await page.getByTestId('withdraw-request').click();
  await page.getByRole('button', { name: 'Keep request' }).click();

  await expect(page.getByTestId('withdraw-request')).toBeVisible();
  expect(withdrawCalled).toBe(false);
});

test('an expired request shows terminal no-charge copy', async ({ page }) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: { ...DETAIL_BASE, status: 'EXPIRED', requestExpiresAt: null } }),
  );

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('request-expired')).toContainText('Request expired');
  await expect(page.getByTestId('request-expired')).toContainText('haven’t');
  await expectNoSeriousAxeViolations(page, 'booking view (expired request)');
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
