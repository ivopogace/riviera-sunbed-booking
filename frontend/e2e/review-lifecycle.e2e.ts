import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of what happens to a review after it exists (#812): the guest
 * changes it, removes it — which returns the venue to "New" — and, once the 60-day window has
 * closed, reads it without being able to touch it. The two remaining panel states, which carry no
 * review at all, are covered here too: a stay still ahead of its check-in is invited to rate later,
 * and one that ended otherwise is offered nothing.
 *
 * The API is mocked (`page.route`) with the stateful flip the slice-1 spec established, so the
 * re-read after each write serves what the server would. First-review submission itself is
 * `review-a-stay.e2e.ts`.
 */

const CODE = 'RVWL234567';
const CLOSES_AT = '2026-07-31T16:00:00Z';

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 40,
  reviewsCount: 1,
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

/** The venue once its only review is gone — 0/0, which the shared rating helper renders as "New". */
const UNRATED_VENUE = { ...VENUE, ratingTenths: 0, reviewsCount: 0 };

const STAY = {
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
  reviewPanel: { kind: 'ELIGIBLE', windowClosesAt: CLOSES_AT, nameSuggestion: 'Ana' },
};

/** The write body all three review verbs share, as the mocks read it back off the request. */
interface ReviewBody {
  stars: number;
  comment: string | null;
  displayName: string;
}

const OWN: ReviewBody = { stars: 4, comment: 'Great sunbeds', displayName: 'Ana' };

const REVIEWED = {
  ...STAY,
  reviewPanel: { kind: 'ALREADY_REVIEWED', review: OWN, windowClosesAt: CLOSES_AT },
};

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
});

test('a guest changes their own review, and the page shows the new one', async ({ page }) => {
  let review: ReviewBody = OWN;
  const puts: unknown[] = [];

  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({
      json: { ...REVIEWED, reviewPanel: { ...REVIEWED.reviewPanel, review } },
    }),
  );
  await page.route(new RegExp(`/api/bookings/${CODE}/review$`), async (route) => {
    const body = route.request().postDataJSON() as ReviewBody;
    puts.push([route.request().method(), body]);
    review = body;
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('own-review-stars')).toHaveAttribute(
    'aria-label',
    '4 out of 5 stars',
  );
  await expect(page.getByTestId('own-review-comment')).toContainText('Great sunbeds');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking detail showing the guest’s own review');

  await page.getByTestId('edit-review').click();
  // The form opens seeded from the stored review, so a change is an edit rather than a re-type.
  await expect(page.getByTestId('review-comment')).toHaveValue('Great sunbeds');
  await expect(page.getByTestId('review-display-name')).toHaveValue('Ana');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking detail editing the review');

  await page.getByTestId('star-2').click();
  await page.getByTestId('review-comment').fill('Windier than I hoped');
  await page.getByTestId('submit-review').click();

  await expect(page.getByTestId('review-result')).toContainText('Your review has been updated.');
  await expect(page.getByTestId('review-result')).toBeFocused();
  await expect(page.getByTestId('own-review-stars')).toHaveAttribute(
    'aria-label',
    '2 out of 5 stars',
  );
  await expect(page.getByTestId('own-review-comment')).toContainText('Windier than I hoped');
  expect(puts).toEqual([
    ['PUT', { stars: 2, comment: 'Windier than I hoped', displayName: 'Ana' }],
  ]);
});

test('a guest removes their review, and the venue returns to "New"', async ({ page }) => {
  let removed = false;
  const methods: string[] = [];

  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: removed ? STAY : REVIEWED }),
  );
  await page.route(new RegExp(`/api/bookings/${CODE}/review$`), async (route) => {
    methods.push(route.request().method());
    removed = true;
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: removed ? UNRATED_VENUE : VENUE }),
  );

  await page.goto(`/booking/${CODE}`);
  await page.getByTestId('start-delete-review').click();

  // The confirmation takes focus, so a keyboard guest lands on the destructive choice (WCAG 2.4.3).
  await expect(page.getByTestId('confirm-delete-review')).toBeFocused();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking detail confirming the review removal');

  // Backing out returns focus to the control that opened it.
  await page.getByTestId('keep-review').click();
  await expect(page.getByTestId('start-delete-review')).toBeFocused();

  await page.getByTestId('start-delete-review').click();
  await page.getByTestId('confirm-delete-review').click();

  await expect(page.getByTestId('review-result')).toContainText('Your review has been removed.');
  await expect(page.getByTestId('review-result')).toBeFocused();
  await expect(page.getByTestId('own-review')).toHaveCount(0);
  // The form is back: removing a review inside the window leaves the stay reviewable again.
  await expect(page.getByTestId('submit-review')).toBeVisible();
  expect(methods).toEqual(['DELETE']);

  await page.goto('/venues/1');
  const mapHeader = page.locator('.map-head');
  await expect(mapHeader.getByTestId('new-chip')).toBeVisible();
  await expect(mapHeader).not.toContainText('4.0');
});

test('a frozen review is readable but no longer changeable', async ({ page }) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: { ...STAY, reviewPanel: { kind: 'FROZEN', review: OWN } } }),
  );

  await page.goto(`/booking/${CODE}`);

  await expect(page.getByTestId('own-review-comment')).toContainText('Great sunbeds');
  await expect(page.getByTestId('review-frozen-note')).toContainText('60 days');
  await expect(page.getByTestId('edit-review')).toHaveCount(0);
  await expect(page.getByTestId('start-delete-review')).toHaveCount(0);
  await expect(page.getByTestId('submit-review')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking detail with a frozen review');
});

test('a stay still ahead of its check-in is told when it can be rated', async ({ page }) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({
      json: { ...STAY, status: 'CONFIRMED', reviewPanel: { kind: 'NOT_COMPLETED' } },
    }),
  );

  await page.goto(`/booking/${CODE}`);

  await expect(page.getByTestId('review-not-completed-note')).toContainText('checked you in');
  await expect(page.getByTestId('submit-review')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'confirmed booking with the check-in note');
});

test('a stay that ended without a check-in is offered no review section at all', async ({
  page,
}) => {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({
      json: {
        ...STAY,
        status: 'CANCELLED',
        refundedAmount: { minorUnits: 4500, currency: 'EUR' },
        reviewPanel: { kind: 'NOT_COMPLETED' },
      },
    }),
  );

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');

  // Inviting a review here would be noise: there was no stay to rate and never will be.
  await expect(page.getByTestId('review-panel')).toHaveCount(0);
});
