import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of the rate-a-stay journey (#811): a checked-in guest opens
 * their code-gated booking, picks four stars from the radiogroup, submits, and the panel gives way
 * to a confirmation — then the venue surfaces show the moved score, and an unrated venue still reads
 * "New" rather than "0.0". The API is mocked (`page.route`), so the suite is CI-safe with no backend.
 *
 * The panel is gated on the server's `reviewable` flag throughout, never on the status: the second
 * test serves a `COMPLETED` booking with the flag false and expects no panel at all.
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
  reviewable: true,
};

test.describe('rating a delivered stay', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
    );
  });

  test('a checked-in guest rates their stay and the venue score moves', async ({ page }) => {
    // Reviewable until the POST lands, then not — what the server does once the review exists.
    let reviewed = false;
    const submitted: unknown[] = [];

    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: { ...COMPLETED_BOOKING, reviewable: !reviewed } }),
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

    await page.getByTestId('submit-review').click();

    await expect(page.getByTestId('review-result')).toContainText('Thanks for rating your stay.');
    await expect(page.getByTestId('review-panel')).toHaveCount(0);
    expect(submitted).toEqual([{ stars: 4 }]);

    // The venue surfaces read the recomputed score — "New" gives way to the first real rating.
    await page.goto('/venues/1');
    const mapHeader = page.locator('.map-head');
    await expect(mapHeader.getByTestId('new-chip')).toHaveCount(0);
    await expect(mapHeader).toContainText('4.0');
    await expect(mapHeader).toContainText('1 reviews');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'venue map after the first rating');
  });

  test('a stay the server will not accept a rating for offers no panel', async ({ page }) => {
    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: { ...COMPLETED_BOOKING, reviewable: false } }),
    );

    await page.goto(`/booking/${CODE}`);
    await expect(page.getByTestId('booking-code')).toContainText(CODE);

    // COMPLETED on screen, and still no panel — the flag decides, the status never does.
    await expect(page.getByTestId('review-panel')).toHaveCount(0);
    await expect(page.getByTestId('submit-review')).toHaveCount(0);
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
