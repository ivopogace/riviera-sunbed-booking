import { expect, test } from '@playwright/test';

import { mockCustomerAuthApi, mockChallengeFence } from './support/auth-mocks';
import { completeDialog } from './support/booking-dialog';
import { openShellOverlay } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';
import { TOURIST_BOOKING, TOURIST_VENUE, mockTourist } from './support/tourist.mocks';

/**
 * The 44 px touch-target floor (#605) over the tourist, auth and booking surfaces — the third and
 * last sweep spec, after the operator and admin consoles.
 *
 * <p>The Stripe Payment Element itself is out of reach: it renders inside a cross-origin iframe the
 * sweep cannot descend into and we cannot restyle (a stated Non-goal). The chrome AROUND it is
 * ours, so `/booking/pay` is swept through the booking dialog — reaching it by URL alone renders
 * only the empty state.
 */

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

  test('home — the sheet at rest with its head, and the tab bar every phone surface lays out', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();
    // The head's three controls carry the whole query, so the sweep names them.
    await expect(page.getByTestId('head-place')).toBeVisible();
    await expect(page.getByTestId('head-beaches')).toBeVisible();
    await expect(page.getByTestId('head-day')).toBeVisible();
    await expect(page.getByTestId('sheet-grabber')).toBeVisible();
    // Below sm the bar renders on every tourist page, so every sweep in this file measures its tabs.
    await expect(page.getByTestId('tab-bar')).toBeVisible();

    await expectTouchTargets(page, 'tourist home, the sheet at rest');
  });

  test('home — the head with each of its two rails open', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();

    await page.getByTestId('head-beaches').click();
    await expect(page.locator('[role="group"][aria-label="Beach"] button').first()).toBeVisible();
    await expectTouchTargets(page, 'tourist home, the beach rail open');

    await page.getByTestId('head-day').click();
    await expect(page.locator('[role="group"][aria-label="Day"] button').first()).toBeVisible();
    await expectTouchTargets(page, 'tourist home, the day rail open');
  });

  test('home — the coast picker, the only coast chooser', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();

    await page.getByTestId('head-place').click();
    await expect(page.getByTestId('coast-picker')).toBeVisible();
    // Named so the sweep cannot quietly stop covering the picker's own controls.
    await expect(page.getByTestId('picker-close')).toBeVisible();
    await expect(page.getByTestId('picker-near-me')).toBeVisible();

    await expectTouchTargets(page, 'tourist home, the coast picker open');
  });

  test('home — the live map under the sheet, with Near me and the skip stop', async ({ page }) => {
    // The fake engine renders no canvas; the chrome around it is what the sweep measures.
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();
    // The poster holds the first paint; the live map swaps in the moment the camera has to move.
    await page.mouse.move(195, 200);
    await page.mouse.down();
    await expect(page.getByTestId('riviera-map-fake')).toBeVisible();
    await page.mouse.up();
    // Named so the sweep cannot quietly stop covering it; the skip stop only shows once focused.
    await expect(page.getByTestId('sheet-near-me')).toBeVisible();
    await page.getByTestId('map-skip').focus();

    await expectTouchTargets(page, 'tourist home, the live map under the sheet');
  });

  test('home — a place pill, and the narrowed head a press leaves', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    // Two venues on one spot: a crowd no zoom separates, so every face of the pill gets measured.
    const pinned = { ...TOURIST_VENUE, location: { latitude: 39.7712, longitude: 20.0021 } };
    const twin = { ...pinned, id: 2, name: 'Lori Beach' };
    await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [pinned, twin] }));
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();
    const pill = page.getByTestId('map-place-pill');
    await expect(pill).toBeVisible();
    await expectTouchTargets(page, 'tourist home, a place pill');

    await pill.click();
    await expect(pill).toHaveAttribute('data-here', '');
    // The head's beaches chip is the narrowing and the way back, in place of the old crumb.
    await expect(page.getByTestId('head-beaches')).toHaveAttribute('aria-current', 'true');
    await expectTouchTargets(page, 'tourist home, an inverted pill and the narrowed head');
  });

  test('home — the near-me failure answer with its dismiss control', async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    });
    await page.goto('/');
    await expect(page.getByTestId('venue-card').first()).toBeVisible();
    await page.getByTestId('sheet-near-me').click();
    // The answer lives in the head's rail slot, off the map, with its own dismiss.
    await expect(page.getByTestId('head-note')).toBeVisible();
    await expect(page.getByTestId('head-note-dismiss')).toBeVisible();

    await expectTouchTargets(page, 'tourist home, the near-me answer in the head');
  });

  test('venue detail — the beach map', async ({ page }) => {
    await page.goto('/venues/1');
    await expect(page.getByRole('button', { name: /Select to book/ }).first()).toBeVisible();

    await expectTouchTargets(page, 'venue detail');
  });

  test('venue detail — the photo lightbox, where the slide picker lives', async ({ page }) => {
    // The picker renders nowhere else — the band yields to the gallery grid at two photos.
    await page.goto('/venues/1');
    await page.getByTestId('gallery-photo-0').click();
    await expect(page.getByTestId('lightbox-dot-0')).toBeVisible();

    await expectTouchTargets(page, 'photo lightbox');
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
          ...TOURIST_BOOKING,
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
          ...TOURIST_BOOKING,
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

  test("the tab bar's sheet, and the find-a-booking dialog behind it", async ({ page }) => {
    await page.goto('/');
    // At 390px the desktop nav is hidden; the sheet is the only route to these controls.
    await openShellOverlay(page, 'menu-toggle');
    await expect(page.getByTestId('find-open-mobile')).toBeVisible();
    // Named so the sweep cannot go vacuous; the popover variant is measured in tourist-header.
    await expect(page.getByTestId('legal-privacy-row')).toBeVisible();
    await expect(page.getByTestId('legal-terms-row')).toBeVisible();
    await expectTouchTargets(page, 'tourist tab-bar sheet');

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
