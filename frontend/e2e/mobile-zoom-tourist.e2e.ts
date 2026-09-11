import { expect, test } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { expectNoFocusZoom, expectTouchManipulation } from './support/mobile-zoom';
import { openFindBooking } from './support/shell';
import { TOURIST_BOOKING, mockTourist } from './support/tourist.mocks';

/**
 * The tourist half of the two mobile-browser zoom bugs, measured rather than asserted from class
 * lists; `mobile-zoom.e2e.ts` is the operator and admin half and the helpers are shared.
 *
 * <p>Every tourist field already measures at or above the floor, so this sweep is green on its
 * first run — that is the point of it. The console half went in believed-correct too, and its sweep
 * found two fields still carrying the bug, one of them hidden from a by-hand audit because its size
 * arrived through a hoisted `cls` recipe rather than the tag's own `class` attribute. A belief that
 * nothing is broken is what a measurement replaces, not what excuses it.
 *
 * <p>**Auto-zoom-on-focus** is swept per surface: iOS Safari zooms the whole page in when a focused
 * field's computed `font-size` is under 16 px. Each surface names a content marker awaited before
 * the sweep and a `minFields` floor, so a surface that rendered its empty, loading or error state
 * fails instead of passing on nothing.
 *
 * <p>**Double-tap-to-zoom** is asserted per named control: `touch-action: manipulation` belongs
 * wherever a fast second tap is ordinary — a dense group, or a disclosure toggled open and shut.
 * On the tourist side that is the bottom tab bar, the most repeatedly tapped control on a phone,
 * and the header's three disclosure triggers. The theme swatch is the one that matters most: the
 * account chip and the menu button are `sm:flex`, so the swatch is the only header trigger a phone
 * renders at all, and the double-tap gesture is a phone gesture.
 *
 * <p>Viewport: the sweeps run once at the project's desktop width. No field in `src/` carries a
 * responsive text size, so a field's computed size is the same at every width. What IS
 * width-dependent is which chrome exists at all — the tab bar renders below `sm` and the header
 * chips from `sm` up — so each double-tap assertion sets the width it needs.
 */
const PHONE = { width: 390, height: 780 };
const DESKTOP = { width: 1280, height: 800 };

const SIGNED_IN_CUSTOMER = {
  username: 'ana@example.com',
  principalType: 'CUSTOMER',
  emailVerified: true,
};

test.describe('tourist UI — mobile zoom', () => {
  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
    // The register cards' proof-of-work widget is a checkbox, which cannot zoom; off keeps it quiet.
    await mockChallengeFence(page, 'off');
  });

  // `fields` is the FLOOR a surface must sweep at rest — counted from the source, not guessed.
  const SURFACES = [
    { path: '/', marker: 'venue-card', label: 'tourist home (the filter bar)', fields: 3 },
    { path: '/account/sign-in', marker: 'auth-identifier', label: 'the sign-in card', fields: 2 },
    {
      path: '/account/sign-in?mode=register',
      marker: 'auth-identifier',
      label: 'the tourist register card',
      fields: 2,
    },
    {
      // The one surface that renders `auth-contact-email`, so the only place it can be measured.
      path: '/account/sign-in?audience=operator&mode=register',
      marker: 'auth-contact-email',
      label: 'the operator register card',
      fields: 3,
    },
    { path: '/account/forgot', marker: 'forgot-email', label: 'forgot password', fields: 1 },
    {
      // Without a token the page renders its invalid-link branch and no form at all.
      path: '/account/reset?token=reset-token-abc',
      marker: 'reset-password',
      label: 'reset password (the token branch)',
      fields: 2,
    },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label} — no field zooms the page in on focus`, async ({ page }) => {
      await page.goto(surface.path);
      await expect(page.getByTestId(surface.marker).first()).toBeVisible();

      await expectNoFocusZoom(page, surface.label, surface.fields);
    });
  }

  test('the account page — no field zooms the page in on focus', async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({ json: SIGNED_IN_CUSTOMER }));
    await page.goto('/account/password');
    await expect(page.getByTestId('setpw-new')).toBeVisible();

    await expectNoFocusZoom(page, 'the account password page', 2);
  });

  test('the booking dialog open — no field zooms the page in on focus', async ({ page }) => {
    await page.goto('/venues/1');
    await page
      .getByRole('button', { name: /Select to book/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expectNoFocusZoom(page, 'the booking dialog', 3);
  });

  test('the review form on a delivered stay — no field zooms the page in on focus', async ({
    page,
  }) => {
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

    await expectNoFocusZoom(page, 'the review form', 2);
  });

  test('the find-a-booking modal — no field zooms the page in on focus', async ({ page }) => {
    await page.goto('/');
    await openFindBooking(page);
    await expect(page.getByTestId('find-code')).toBeVisible();

    await expectNoFocusZoom(page, 'the find-a-booking modal');
  });

  test('the tab bar keeps its double-tap', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.getByTestId('tab-bar')).toBeVisible();

    // Two <a>s and the sheet's <button>, all wearing the same TAB recipe.
    await expectTouchManipulation(
      page,
      '[data-testid="tab-bar"] a, [data-testid="tab-bar"] button',
      'the tourist tab bar',
    );
  });

  test('the header disclosure triggers keep their double-tap', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    // The round menu button signed out, the account chip signed in — never both at once.
    await page.goto('/');
    await expect(page.getByTestId('nav-menu')).toBeVisible();
    await expectTouchManipulation(
      page,
      '[data-testid="nav-menu"], [data-testid="theme-toggle"]',
      'the header menu button and theme swatch',
    );

    await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({ json: SIGNED_IN_CUSTOMER }));
    await page.reload();
    await expect(page.getByTestId('nav-user')).toBeVisible();

    await expectTouchManipulation(page, '[data-testid="nav-user"]', 'the account chip');
  });

  test('the theme swatch keeps its double-tap at a phone width too', async ({ page }) => {
    // The only header trigger below `sm`, so a desktop-width assertion would never reach it.
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.getByTestId('theme-toggle')).toBeVisible();

    await expectTouchManipulation(page, '[data-testid="theme-toggle"]', 'the theme swatch');
  });
});
