import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Reviews tab, and the one journey the
 * epic accepts on: an admin hides a review and the venue's PUBLIC surfaces move — the header's
 * score and count, the review list — then un-hides it and both come back; hiding the only review
 * returns the venue to "New".
 *
 * The API is mocked statefully below: a hide flips the row in the mock, and the public venue reads
 * are DERIVED from the same rows (mean of the visible stars, visible commented reviews), which is the
 * backend's own behaviour — proven for real by `ReviewModerationFlowIT` / `VenueRatingRecomputeIT`
 * — so "the venue page moved" is an honest assertion about what the console drove, not a local edit.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

const VENUES = [
  { id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' },
  { id: 9, name: 'Folie Marine', beach: 'Gjipe' },
];

interface MockReview {
  readonly id: number;
  readonly stars: number;
  readonly displayName: string | null;
  readonly stayedIn: string;
  readonly comment: string | null;
  readonly createdAt: string;
  hiddenAt: string | null;
}

/** Venue 7 before any moderation: 5★ + 4★ = 4.5 over 2 reviews, both commented. */
function freshReviews(): Record<number, MockReview[]> {
  return {
    7: [
      {
        id: 31,
        stars: 5,
        displayName: 'Ana',
        stayedIn: '2026-07',
        comment: 'Great sunbeds, calm sea.',
        createdAt: '2026-07-02T08:00:00Z',
        hiddenAt: null,
      },
      {
        id: 30,
        stars: 4,
        displayName: 'Ben',
        stayedIn: '2026-07',
        comment: 'Fine, a little crowded.',
        createdAt: '2026-07-01T18:00:00Z',
        hiddenAt: null,
      },
    ],
    9: [],
  };
}

/** The venue's public aggregate, exactly as the backend recomputes it: half-up mean in tenths. */
function aggregateOf(reviews: MockReview[]): { ratingTenths: number; reviewsCount: number } {
  const visible = reviews.filter((review) => review.hiddenAt === null);
  if (visible.length === 0) {
    return { ratingTenths: 0, reviewsCount: 0 };
  }
  const sum = visible.reduce((total, review) => total + review.stars, 0);
  return {
    ratingTenths: Math.floor((10 * sum + Math.floor(visible.length / 2)) / visible.length),
    reviewsCount: visible.length,
  };
}

function venueDetail(reviews: MockReview[]) {
  return {
    id: 7,
    name: 'Bora Bora Beach',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    description: 'Loungers on the Dhërmi shore.',
    ...aggregateOf(reviews),
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    sets: [
      {
        id: 2,
        rowLabel: 'Front row',
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
}

/** The admin moderation API and the public venue reads, all served from one set of rows. */
async function mockReviewModeration(page: Page): Promise<Record<number, MockReview[]>> {
  const rows = freshReviews();

  await page.route(/\/api\/admin\/venues$/, (route) =>
    route.fulfill({
      json: {
        venues: VENUES.map((venue) => ({
          venueId: venue.id,
          name: venue.name,
          beach: venue.beach,
          commissionBps: 500,
          payoutCurrency: 'EUR',
        })),
      },
    }),
  );

  await page.route(/\/api\/admin\/venues\/(\d+)\/reviews(\?.*)?$/, (route) => {
    const venueId = Number(/venues\/(\d+)\/reviews/.exec(route.request().url())![1]);
    return route.fulfill({ json: { reviews: rows[venueId] ?? [], nextCursor: null } });
  });

  await page.route(/\/api\/admin\/reviews\/(\d+)\/(hide|unhide)$/, (route) => {
    const [, id, verb] = /reviews\/(\d+)\/(hide|unhide)/.exec(route.request().url())!;
    const review = Object.values(rows)
      .flat()
      .find((each) => each.id === Number(id));
    if (!review) {
      return route.fulfill({ status: 404, json: { code: 'NO_SUCH_REVIEW' } });
    }
    review.hiddenAt = verb === 'hide' ? '2026-08-01T10:00:00Z' : null;
    return route.fulfill({ status: 204, body: '' });
  });

  // The public surfaces: the venue page header and its review list, derived from the same rows.
  await page.route(/\/api\/venues\/7(\?.*)?$/, (route) =>
    route.fulfill({ json: venueDetail(rows[7]) }),
  );
  await page.route(/\/api\/venues\/7\/reviews(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        reviews: rows[7]
          .filter((review) => review.hiddenAt === null && review.comment !== null)
          .map(({ id, stars, displayName, stayedIn, comment }) => ({
            id,
            stars,
            displayName,
            stayedIn,
            comment,
          })),
        nextCursor: null,
      },
    }),
  );
  return rows;
}

/** Sign in as the platform admin and open the Reviews tab. */
async function openReviewsTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/reviews');
}

async function pickVenue(page: Page, id: number): Promise<void> {
  await page.getByTestId('admin-reviews-venue').selectOption(String(id));
  await expect(page.getByTestId('admin-reviews-list')).toBeVisible();
}

test('hiding a review takes it off the venue page and out of the score; un-hiding restores both', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockReviewModeration(page);
  await openReviewsTab(page);

  await expectNoSeriousAxeViolations(page, 'admin reviews tab before a venue is picked');
  await pickVenue(page, 7);
  await expect(page.getByTestId('admin-review-31')).toBeVisible();
  await expect(page.getByTestId('admin-review-hidden-30')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'admin reviews tab showing a venue’s reviews');

  // The first press only asks — the question names the guest and the venue, and is reversible.
  await page.getByTestId('admin-review-hide-30').click();
  const prompt = page.getByTestId('admin-review-confirm-prompt-30');
  await expect(prompt).toContainText('Ben');
  await expect(prompt).toContainText('Bora Bora Beach');
  await expect(prompt).not.toContainText('cannot be undone');
  await expect(page.getByTestId('admin-review-confirm-30')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'admin reviews tab with the hide confirmation open');

  await page.getByTestId('admin-review-reason-30').fill('reported by the venue');
  await page.getByTestId('admin-review-confirm-30').click();

  await expect(page.getByTestId('admin-reviews-notice')).toContainText(
    'Hid Ben’s review of Bora Bora Beach.',
  );
  await expect(page.getByTestId('admin-review-hidden-30')).toContainText('Hidden since');
  await expect(page.getByTestId('admin-review-unhide-30')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin reviews tab after a hide');

  // The public surfaces: 5.0 over 1 review, and Ben's words are gone from the list.
  await page.goto('/venues/7');
  const score = page.getByLabel('Rated 5.0 out of 5');
  await expect(score).toBeVisible();
  await expect(score.locator('..')).toContainText('1 review');
  await expect(page.getByTestId('review-entry-31')).toBeVisible();
  await expect(page.getByTestId('review-entry-30')).toBeHidden();

  // Hiding the only remaining review returns the venue to "New".
  await page.goto('/admin/reviews');
  await pickVenue(page, 7);
  await page.getByTestId('admin-review-hide-31').click();
  await page.getByTestId('admin-review-confirm-31').click();
  await expect(page.getByTestId('admin-review-hidden-31')).toBeVisible();

  await page.goto('/venues/7');
  await expect(page.getByTestId('new-chip')).toBeVisible();
  await expect(page.getByTestId('review-entry-31')).toBeHidden();

  // Un-hiding puts a review back on both surfaces.
  await page.goto('/admin/reviews');
  await pickVenue(page, 7);
  await page.getByTestId('admin-review-unhide-31').click();
  await expect(page.getByTestId('admin-reviews-notice')).toContainText(
    'Ana’s review is back in public view.',
  );
  await expect(page.getByTestId('admin-review-hide-31')).toBeVisible();

  await page.goto('/venues/7');
  await expect(page.getByLabel('Rated 5.0 out of 5')).toBeVisible();
  await expect(page.getByTestId('review-entry-31')).toBeVisible();
});

test('the hide survives re-reading the venue — the server really flipped it', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockReviewModeration(page);
  await openReviewsTab(page);

  await pickVenue(page, 7);
  await page.getByTestId('admin-review-hide-30').click();
  await page.getByTestId('admin-review-confirm-30').click();
  await expect(page.getByTestId('admin-review-hidden-30')).toBeVisible();

  await page.getByTestId('admin-reviews-venue').selectOption('9');
  await expect(page.getByTestId('admin-reviews-empty')).toBeVisible();
  await pickVenue(page, 7);

  await expect(page.getByTestId('admin-review-hidden-30')).toBeVisible();
  await expect(page.getByTestId('admin-review-hidden-31')).toBeHidden();
});

test('the tab strip marks Reviews and reaches it from the console sections', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockReviewModeration(page);
  await openReviewsTab(page);

  await expect(page.getByTestId('admin-tab-reviews')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-photos')).not.toHaveAttribute('aria-current', 'page');

  await page.getByTestId('admin-tab-photos').click();

  await expect(page).toHaveURL(/\/admin\/photos$/);
  await expect(page.getByTestId('admin-tab-reviews')).not.toHaveAttribute('aria-current', 'page');
});

test('a signed-out visitor is shown no picker and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockReviewModeration(page);

  await page.goto('/admin/reviews');

  await expect(page.getByTestId('admin-reviews-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-reviews-venue')).toBeHidden();
  await expect(page.getByTestId('admin-tab-reviews')).toBeHidden();
});

test('a failed hide lands focus on the notice and changes nothing', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockReviewModeration(page);
  await page.route(/\/api\/admin\/reviews\/30\/hide$/, (route) => route.fulfill({ status: 500 }));
  await openReviewsTab(page);

  await pickVenue(page, 7);
  await page.getByTestId('admin-review-hide-30').click();
  await expect(page.getByTestId('admin-review-confirm-30')).toBeFocused();

  await page.getByTestId('admin-review-confirm-30').click();

  const notice = page.getByTestId('admin-reviews-notice');
  await expect(notice).toContainText('Could not hide');
  await expect(notice).toBeFocused();
  await expect(page.getByTestId('admin-review-hidden-30')).toBeHidden();
  await expect(page.getByTestId('admin-review-hide-30')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin reviews after a failed hide');
});
