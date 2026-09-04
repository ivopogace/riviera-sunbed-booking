import { expect, test, type Page } from '@playwright/test';

import { mockCustomerAuthApi, mockChallengeFence } from './support/auth-mocks';
import { completeDialog } from './support/booking-dialog';
import { openShellOverlay } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The 44 px touch-target floor (#605) over the tourist, auth and booking surfaces — the third and
 * last sweep spec, after the operator and admin consoles.
 *
 * <p>The Stripe Payment Element itself is out of reach: it renders inside a cross-origin iframe the
 * sweep cannot descend into and we cannot restyle (a stated Non-goal). The chrome AROUND it is
 * ours, so `/booking/pay` is swept through the booking dialog — reaching it by URL alone renders
 * only the empty state.
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
  amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
  distanceToWaterM: 15,
  availability: { free: 4, total: 6 },
  coverPhoto: null,
  // A multi-photo slideshow so the home sweep measures the card's step controls.
  photos: ['/api/venues/1/photos/aa01', '/api/venues/1/photos/cc03', '/api/venues/1/photos/dd04'],
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

const BOOKING = {
  code: 'WXYZ345678',
  status: 'CONFIRMED',
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
  // The wire always carries a panel; a stay nobody checked in is the reason there is no form.
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

async function mockTourist(page: Page): Promise<void> {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [VENUE] }));
  // One listed review with a page behind it, so the sweep measures the "Show more" control.
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        reviews: [{ id: 41, stars: 4, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great.' }],
        nextCursor: 41,
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({
      // A 1×1 PNG so the slideshow <img>s genuinely load under the sweep.
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
      contentType: 'image/png',
    }),
  );
  await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
    route.fulfill({ json: BOOKING }),
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

test.describe('44px touch targets on the tourist surfaces at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
    // The register card's widget is swept on its own below; the dialog's is not this file's.
    await mockChallengeFence(page, 'off');
    await page.setViewportSize({ width: 390, height: 780 });
  });

  /**
   * The shell's sign-out warning renders only after a sign-out request fails, so no sweep of a
   * resting surface has ever measured its two controls — the blind-spot class #648 was filed about.
   */
  test('the sign-out failure notice', async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({
        json: { username: 'guest@example.com', principalType: 'CUSTOMER', emailVerified: true },
      }),
    );
    // Both the logout and its CSRF-rebootstrap retry fail, which is what raises the notice.
    await page.route(/\/api\/auth\/logout$/, (route) => route.abort('failed'));

    await page.goto('/');
    await openShellOverlay(page, 'menu-toggle');
    await page.getByTestId('nav-signout-mobile').click();
    await expect(page.getByTestId('sign-out-warning')).toBeVisible();

    await expectTouchTargets(page, 'sign-out failure notice');
  });

  test('home — discovery with its filter bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();

    await expectTouchTargets(page, 'tourist home');
  });

  test('venue detail — the beach map', async ({ page }) => {
    await page.goto('/venues/1');
    await expect(page.getByRole('button', { name: /Select to book/ }).first()).toBeVisible();

    await expectTouchTargets(page, 'venue detail');
  });

  test('the unified sign-in card', async ({ page }) => {
    await page.goto('/account/sign-in');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();

    await expectTouchTargets(page, 'sign-in card');
  });

  test('the tourist register card with the proof-of-work widget', async ({ page }) => {
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in?mode=register');
    await expect(page.getByTestId('challenge-widget').getByRole('checkbox')).toBeVisible();

    await expectTouchTargets(page, 'tourist register card');
  });

  test('forgot password', async ({ page }) => {
    await page.goto('/account/forgot');
    await expect(page.getByRole('button', { name: /send|reset/i }).first()).toBeVisible();

    await expectTouchTargets(page, 'forgot password');
  });

  test('my bookings — the signed-out prompt and its links', async ({ page }) => {
    await page.goto('/my-bookings');
    // NOT the back-link: it renders in the loading skeleton too, so it cannot prove the page settled.
    await expect(page.getByTestId('browse-beaches')).toBeVisible();

    await expectTouchTargets(page, 'my bookings');
  });

  test('the payment page chrome — the Stripe iframe is out of reach, ours is not', async ({
    page,
  }) => {
    // The deterministic gateway: without it the page never leaves its mounting state.
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ = true;
    });
    // Via the dialog: a direct /booking/pay visit renders only the empty state.
    await page.goto('/venues/1');
    await page
      .getByRole('button', { name: /Select to book/ })
      .first()
      .click();
    await completeDialog(page.getByRole('dialog'), 'Continue to payment');
    await expect(page).toHaveURL(/\/booking\/pay/);
    // pay-cancel also renders while mounting and on error; pay-button is what proves `ready`.
    await expect(page.getByTestId('pay-button')).toBeVisible();

    await expectTouchTargets(page, 'booking pay chrome');
  });

  test('booking detail — a confirmed booking', async ({ page }) => {
    await page.goto('/booking/WXYZ345678');
    await expect(page.getByTestId('booking-code')).toBeVisible();

    await expectTouchTargets(page, 'booking detail');
  });

  test('booking detail — a delivered stay offering the review form', async ({ page }) => {
    // Its own case: the radios and the two text fields exist only here.
    await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          ...BOOKING,
          status: 'COMPLETED',
          cancellable: false,
          reviewPanel: {
            kind: 'ELIGIBLE',
            windowClosesAt: '2026-07-31T16:00:00Z',
            nameSuggestion: 'Ana',
          },
        },
      }),
    );
    await page.goto('/booking/WXYZ345678');
    await expect(page.getByTestId('review-panel')).toBeVisible();

    await expectTouchTargets(page, 'booking detail with the review form');
  });

  test('booking detail — the guest’s own review, with its edit and remove controls', async ({
    page,
  }) => {
    await page.route(/\/api\/bookings\/WXYZ345678(\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          ...BOOKING,
          status: 'COMPLETED',
          cancellable: false,
          reviewPanel: {
            kind: 'ALREADY_REVIEWED',
            review: { stars: 4, comment: 'Great sunbeds', displayName: 'Ana' },
            windowClosesAt: '2026-07-31T16:00:00Z',
          },
        },
      }),
    );
    await page.goto('/booking/WXYZ345678');
    await page.getByTestId('start-delete-review').click();
    await expect(page.getByTestId('confirm-delete-review')).toBeVisible();

    await expectTouchTargets(page, 'booking detail with the review removal confirmation');
  });
  test('venue detail — the booking dialog open', async ({ page }) => {
    await page.goto('/venues/1');
    await page
      .getByRole('button', { name: /Select to book/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expectTouchTargets(page, 'booking dialog');
  });

  test('the mobile menu, and the find-a-booking dialog behind it', async ({ page }) => {
    await page.goto('/');
    // At 390px the desktop nav is hidden; the menu is the only route to these controls.
    await openShellOverlay(page, 'menu-toggle');
    await expect(page.getByTestId('find-open-mobile')).toBeVisible();
    await expectTouchTargets(page, 'tourist mobile menu');

    await openShellOverlay(page, 'find-open-mobile');
    await expect(page.getByRole('dialog')).toBeVisible();

    await expectTouchTargets(page, 'find a booking');
  });

  test('reset password — the no-token branch', async ({ page }) => {
    await page.goto('/account/reset');
    await expect(page.getByTestId('reset-no-token')).toBeVisible();

    await expectTouchTargets(page, 'reset password (no token)');
  });
});
