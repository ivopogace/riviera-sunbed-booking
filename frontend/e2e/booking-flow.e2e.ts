import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';

/**
 * Real-render a11y audit of the Instant-Book flow: beach map →
 * keyboard-select a free online set → 2-step booking dialog (Details → Review, focus trapped) →
 * confirmation. Runs axe at each step in a real browser — catching keyboard, focus-management and
 * true colour-contrast issues jsdom can't. The API is mocked, so the test is self-contained.
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
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
};

/** A terminal CANCELLED detail as an arriving guest sees it — the cases differ only in these. */
function cancelledDetail(over: {
  refundedAmount: unknown;
  cancelReason: string | null;
  refundOutstanding?: boolean;
}) {
  return {
    ...AWAITING_DETAIL,
    status: 'CANCELLED',
    cancellable: false,
    withdrawable: false,
    requestExpiresAt: null,
    payment: null,
    emailWithheld: false,
    payWindowClosed: false,
    refundOutstanding: false,
    ...over,
  };
}

test.beforeEach(async ({ page }) => {
  // Match with or without the `?date=` query the map appends.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
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
  const bookable = page.getByRole('button', { name: /Select to book/ }).first();
  await bookable.focus();
  await expect(bookable).toBeFocused();
  await page.keyboard.press('Enter');

  // The dialog opens on Details and focus is moved inside it (modal focus management).
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input').first()).toBeFocused();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking dialog (Details)');

  // Stacking pin: the modal scrim must paint ABOVE the sticky glass header —
  // a stacking context on <main> once trapped it below, leaving the header clickable.
  const headerHit = await page.evaluate(() => {
    const header = document.querySelector('.riv-header') as HTMLElement;
    const rect = header.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit ? { insideHeader: header.contains(hit), tag: hit.tagName } : null;
  });
  expect(headerHit, 'header center should be covered by the modal layer').not.toBeNull();
  expect(headerHit!.insideHeader).toBe(false);

  // Advance to Review, audit it, then submit (INSTANT → "Continue to payment").
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByTestId('dialog-primary')).toHaveText('Continue to payment');
  await expectNoSeriousAxeViolations(page, 'booking dialog (Review)');
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();

  // Lands on the confirmation with the booking code.
  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('ABCD234567');
  await expectNoSeriousAxeViolations(page, 'booking confirmation');
});

test('booking dialog stays laptop-friendly at a ~700px viewport (#188, guards the #186 regression)', async ({ page }) => {
  // The dialog is compacted so step-1 sits above the fold on laptop viewports; this locks it in.
  const VIEWPORT_HEIGHT = 700;
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT });

  await page.goto('/venues/1');
  await page.getByRole('button', { name: /Select to book/ }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Step 1 (Details) is the tallest step and the one the compaction was measured on.
  await expect(page.getByTestId('step-1')).toHaveAttribute('aria-current', 'step');
  await settle(page);

  // Panel is NOT clamped to its `max-height: calc(100vh - 40px)` — step-1 renders at its natural height.
  const panel = await dialog.boundingBox();
  expect(panel, 'panel box').not.toBeNull();
  expect(panel!.height).toBeLessThan(VIEWPORT_HEIGHT - 40);

  // The scroll body doesn't overflow, so every field and the Continue button show without scrolling.
  const bodyOverflow = await page.evaluate(() => {
    const body = document.querySelector('.dialog-body') as HTMLElement;
    return body.scrollHeight - body.clientHeight;
  });
  expect(bodyOverflow).toBeLessThanOrEqual(1);
});

test('a taken-set rejection surfaces an accessible error in the dialog', async ({ page }) => {
  // Overrides the beforeEach 201 route: the API rejects on the RFC-7807 contract —
  // application/problem+json whose stable identity is the `code` extension.
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'The set is already taken for this date.',
        code: 'SET_TAKEN',
      },
    }),
  );

  await page.goto('/venues/1');
  await page.getByRole('button', { name: /Select to book/ }).first().click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');

  // The dialog stays open on Review and announces the mapped failure (role=alert), keyed off the code.
  await expect(dialog.getByRole('alert')).toContainText('someone just booked this set');
  await expect(page).not.toHaveURL(/\/booking\/confirmation/);
  await expectNoSeriousAxeViolations(page, 'booking dialog (SET_TAKEN error)');
});

test('stripe-profile payment flow is accessible end-to-end (Stripe mocked)', async ({ page }) => {
  // Swap in the deterministic fake gateway (no js.stripe.com) for this run.
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
  });
  // POST /api/bookings now returns 202 AWAITING_PAYMENT (overrides the beforeEach 201 route).
  await page.route('**/api/bookings', (route) => route.fulfill({ status: 202, json: AWAITING }));
  // The status poll: AWAITING_PAYMENT first, then CONFIRMED once the (mocked) webhook lands.
  let polls = 0;
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...AWAITING_DETAIL, status: polls++ === 0 ? 'AWAITING_PAYMENT' : 'CONFIRMED' } }),
  );

  await page.goto('/venues/1');
  await page.getByRole('button', { name: /Select to book/ }).first().click();
  const dialog = page.getByRole('dialog');
  await completeDialog(dialog, 'Continue to payment');

  // Lands on the dedicated payment page (NOT the confirmation screen) with the card form ready.
  await expect(page).toHaveURL(/\/booking\/pay/);
  await expect(page.getByRole('heading', { name: 'Complete your payment' })).toBeVisible();
  await expect(page.getByTestId('pay-button')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'payment page (ready)');

  // Pay → the page polls the backend and only then shows confirmed (invariant #8).
  await page.getByTestId('pay-button').click();
  await expect(page.getByRole('heading', { name: /You.re booked/ })).toBeVisible();
  await expect(page).toHaveURL(/\/booking\/pay/); // confirmation is in-place, driven by the poll
  await expect(page.getByTestId('booking-code')).toContainText('WXYZ345678');
  await expectNoSeriousAxeViolations(page, 'payment page (confirmed)');
});

/**
 * The abandoned-payment sweep's guest lands here, on a terminal `CANCELLED` booking, with no email
 * to explain it — the sweep publishes no event. The panel is their only channel, so it is asserted
 * in a real browser alongside the axe run.
 */
test('a swept booking explains itself and never claims the guest paid', async ({ page }) => {
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({ json: cancelledDetail({ refundedAmount: null, cancelReason: null }) }),
  );

  await page.goto('/booking/WXYZ345678');

  const panel = page.getByTestId('booking-cancelled');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('haven’t been charged');
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  // Never charged, so the amount row must not read "Paid".
  await expect(page.locator('dt', { hasText: /^Paid$/ })).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'booking view (cancelled, never charged)');
});

/** A storm the venue called is not the guest's doing — the copy must not say they cancelled. */
test('a weather-refunded booking is attributed to the venue', async ({ page }) => {
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({
      json: cancelledDetail({
        refundedAmount: { minorUnits: 4500, currency: 'EUR' },
        cancelReason: 'WEATHER',
      }),
    }),
  );

  await page.goto('/booking/WXYZ345678');

  const panel = page.getByTestId('booking-cancelled');
  await expect(panel).toContainText('Miramar Beach Club');
  await expect(panel).toContainText('weather');
  await expect(panel).not.toContainText('You cancelled');
  await expectNoSeriousAxeViolations(page, 'booking view (weather refund)');
});

/**
 * A refund stuck in the refund outbox: the money has not moved, so the panel says the refund is
 * being processed and must not claim it is on its way to the card.
 */
test('a stuck refund says it is being processed, not on its way', async ({ page }) => {
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({
      json: cancelledDetail({
        refundedAmount: { minorUnits: 4500, currency: 'EUR' },
        cancelReason: 'POLICY',
        refundOutstanding: true,
      }),
    }),
  );

  await page.goto('/booking/WXYZ345678');

  const panel = page.getByTestId('booking-cancelled');
  await expect(panel).toContainText('is being processed');
  await expect(panel).not.toContainText('on its way');
  await expect(panel).not.toContainText('to your card');
  await expectNoSeriousAxeViolations(page, 'booking view (refund outstanding)');
});
