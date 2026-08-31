import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * The withheld-confirmation-email notice, on both post-payment surfaces — real browser, API
 * mocked, so the suite stays CI-safe and hermetic.
 *
 * <p>The suppression list's invariant is *no send to a suppressed address*, so a guest whose address
 * hard-bounced books and pays normally while the confirmation mail is silently dropped. For a guest
 * that is severe: the code on screen is their only record (ADR-0006). These tests prove the app says
 * so instead of promising a mail that was never sent — and, because the notice is a tinted surface
 * carrying real text, that it clears axe in a real browser rather than only in the jsdom maths.
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
    {
      id: 2,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
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
  emailWithheld: false,
};

// Mirrors the real `AwaitingPaymentView` EXACTLY — in particular it has no `emailWithheld`, because
// the backend deliberately does not answer that question before payment (D-8). Spreading CONFIRMED
// here would make the mock a superset of the contract and hide a regression that read the flag off
// the pre-payment hand-off.
const AWAITING = {
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
};

const AWAITING_DETAIL = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  // Mirrors what ViewBookingService actually returns for AWAITING_PAYMENT: cancellable is
  // status == CONFIRMED (so false here), and the open intent's credentials ARE populated for
  // exactly this status.
  cancellable: false,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: null,
  payment: { clientSecret: 'pi_123_secret_abc', paymentIntentId: 'pi_123' },
  // Present but false before payment: BookingDetailView always carries the field, and the backend
  // never even consults the port unless the booking is CONFIRMED.
  emailWithheld: false,
  // The wire always carries a panel; a stay nobody checked in is the reason there is no form.
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
});

async function bookThroughDialog(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await completeDialog(page.getByRole('dialog'), 'Continue to payment');
}

test('a suppressed guest is told no email is coming and to save the code (instant profile)', async ({
  page,
}) => {
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: { ...CONFIRMATION, emailWithheld: true } }),
  );

  await bookThroughDialog(page);

  await expect(page).toHaveURL(/\/booking\/confirmation/);
  const notice = page.getByTestId('email-withheld');
  await expect(notice).toContainText('We couldn’t email you.');
  await expect(notice).toContainText('save it or take a screenshot');
  // The code stays the point of the screen.
  await expect(page.getByTestId('booking-code')).toContainText('ABCD234567');
  // And the page must not promise a mail that was never sent.
  await expect(page.getByTestId('booking-code')).not.toContainText('emailed it to you');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'confirmation with the withheld-email notice');
});

test('a deliverable guest keeps the emailed-it copy and sees no notice', async ({ page }) => {
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );

  await bookThroughDialog(page);

  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('We’ve also emailed it to you.');
  await expect(page.getByTestId('email-withheld')).toHaveCount(0);
});

test('the notice reaches the stripe-profile payment surface once the booking confirms', async ({
  page,
}) => {
  // The surface actually reached in production: the 202 → pay → webhook-confirmed poll path.
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
  });
  await page.route('**/api/bookings', (route) => route.fulfill({ status: 202, json: AWAITING }));
  let polls = 0;
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({
      json:
        polls++ === 0
          ? AWAITING_DETAIL
          : {
              ...AWAITING_DETAIL,
              status: 'CONFIRMED',
              cancellable: true,
              payment: null,
              emailWithheld: true,
            },
    }),
  );

  await bookThroughDialog(page);

  await expect(page).toHaveURL(/\/booking\/pay/);
  await page.getByTestId('pay-button').click();

  await expect(page.getByRole('heading', { name: 'You’re booked.' })).toBeVisible();
  await expect(page.getByTestId('email-withheld')).toContainText('We couldn’t email you.');
  // The page's ONE persistent live region announces it — a region created together with the done
  // panel would never announce its initial text.
  await expect(page.getByTestId('pay-status')).toContainText('save your booking code');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'payment done panel with the withheld-email notice');
});
