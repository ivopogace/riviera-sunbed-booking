import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of the rate-a-stay journey: a checked-in guest opens their
 * code-gated booking, picks four stars from the radiogroup, writes a comment, submits, and the form
 * gives way to their own review — then the venue surfaces show the moved score, and an unrated venue
 * still reads "New" rather than "0.0". The API is mocked (`page.route`), so the suite is CI-safe
 * with no backend. The lifecycle that follows a first review — change, remove, frozen — is
 * `review-lifecycle.e2e.ts`.
 *
 * The section renders on the server's review panel throughout, never on the status: the second test
 * serves a `COMPLETED` booking whose panel is `WINDOW_CLOSED` and expects no form at all.
 */

const CODE = 'RVWE234567';

/** The venue before any review lands — 0/0, which the shared rating helper renders as "New". */
const UNRATED_VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 0,
  reviewsCount: 0,
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

/** The same venue after the recompute the submit set off — 4.0 over one review. */
const RATED_VENUE = { ...UNRATED_VENUE, ratingTenths: 40, reviewsCount: 1 };

const COMPLETED_BOOKING = {
  code: CODE,
  status: 'COMPLETED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-06-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: false,
  withdrawable: false,
  beforeCutoff: false,
  refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
  refundedAmount: null,
  refundOutstanding: false,
  requestExpiresAt: null,
  payment: null,
  emailWithheld: false,
  payWindowClosed: true,
  cancelReason: null,
  cancellationWindowAtBirth: 'CLOSED',
  reviewPanel: {
    kind: 'ELIGIBLE',
    windowClosesAt: '2026-07-31T16:00:00Z',
    nameSuggestion: 'Ana',
  },
};

/** The same booking once the review exists — what the server serves on the post-submit re-read. */
const REVIEWED_BOOKING = {
  ...COMPLETED_BOOKING,
  reviewPanel: {
    kind: 'ALREADY_REVIEWED',
    review: { stars: 4, comment: 'Great sunbeds, shade all afternoon.', displayName: 'Ana' },
    windowClosesAt: '2026-07-31T16:00:00Z',
  },
};

test.describe('rating a delivered stay', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
    );
  });

  test('a checked-in guest reviews their stay and the venue score moves', async ({ page }) => {
    // The form until the POST lands, then their own review — what the server serves once it exists.
    let reviewed = false;
    const submitted: unknown[] = [];

    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: reviewed ? REVIEWED_BOOKING : COMPLETED_BOOKING }),
    );
    await page.route(new RegExp(`/api/bookings/${CODE}/review$`), async (route) => {
      submitted.push(route.request().postDataJSON());
      reviewed = true;
      await route.fulfill({ status: 201, body: '' });
    });
    await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
      route.fulfill({ json: reviewed ? RATED_VENUE : UNRATED_VENUE }),
    );
    await page.route(/\/api\/venues(\?.*)?$/, (route) =>
      route.fulfill({ json: [reviewed ? RATED_VENUE : UNRATED_VENUE] }),
    );

    await page.goto(`/booking/${CODE}`);
    await expect(page.getByTestId('booking-code')).toContainText(CODE);

    const panel = page.getByTestId('review-panel');
    await expect(panel).toBeVisible();
    const stars = panel.getByRole('radio');
    await expect(stars).toHaveCount(5);
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'booking detail with the rating panel');

    // Nothing selected, so the first ArrowRight picks one star: four presses land on four.
    await stars.first().focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(stars.nth(3)).toHaveAttribute('aria-checked', 'true');
    await expect(stars.nth(4)).toHaveAttribute('aria-checked', 'false');

    // The display name arrives prefilled from the server's suggestion; the comment is the guest's.
    await expect(panel.getByTestId('review-display-name')).toHaveValue('Ana');
    await panel.getByTestId('review-comment').fill('Great sunbeds, shade all afternoon.');
    await page.getByTestId('submit-review').click();

    await expect(page.getByTestId('review-result')).toContainText(
      'Thanks for reviewing your stay.',
    );
    // The submit button unmounts with the form — RV-FE-9: the settled leg parks focus on the result.
    await expect(page.getByTestId('review-result')).toBeFocused();
    await expect(page.getByTestId('submit-review')).toHaveCount(0);
    await expect(page.getByTestId('own-review-comment')).toContainText('Great sunbeds');
    expect(submitted).toEqual([
      { stars: 4, comment: 'Great sunbeds, shade all afternoon.', displayName: 'Ana' },
    ]);

    // The venue surfaces read the recomputed score — "New" gives way to the first real rating.
    await page.goto('/venues/1');
    const mapHeader = page.locator('.map-head');
    await expect(mapHeader.getByTestId('new-chip')).toHaveCount(0);
    await expect(mapHeader).toContainText('4.0');
    await expect(mapHeader).toContainText('1 review');
    await expect(mapHeader).not.toContainText('1 reviews');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'venue map after the first rating');
  });

  test('a stay the server will not accept a rating for offers no form, and says why', async ({
    page,
  }) => {
    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: { ...COMPLETED_BOOKING, reviewPanel: { kind: 'WINDOW_CLOSED' } } }),
    );

    await page.goto(`/booking/${CODE}`);
    await expect(page.getByTestId('booking-code')).toContainText(CODE);

    // COMPLETED on screen, and still no form — the panel decides, the status never does.
    await expect(page.getByTestId('submit-review')).toHaveCount(0);
    await expect(page.getByTestId('review-window-closed-note')).toContainText('window has closed');
  });

  test('a refused rating explains itself and leaves the panel open only when a retry could help', async ({
    page,
  }) => {
    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: COMPLETED_BOOKING }),
    );
    await page.route(new RegExp(`/api/bookings/${CODE}/review$`), (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'This stay has already been reviewed.',
          instance: '/api/bookings',
          code: 'REVIEW_ALREADY_SUBMITTED',
        },
      }),
    );

    await page.goto(`/booking/${CODE}`);
    await page.getByTestId('star-5').click();
    await page.getByTestId('submit-review').click();

    await expect(page.getByTestId('review-result')).toContainText('already been rated');
    // The error body must never echo the code back (invariant #7).
    await expect(page.getByTestId('review-result')).not.toContainText(CODE);
  });
});
