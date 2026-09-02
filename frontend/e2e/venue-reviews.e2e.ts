import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render a11y + behaviour audit of reading a venue's reviews: the section below the beach map
 * lists the first page of commented reviews newest first, "Show more reviews" appends the next
 * page and steps aside when the list ends (focus landing on the first review just listed), a rated
 * venue whose reviews all came without a comment shows its score up top and a quiet empty state
 * down here, and a failed load offers a retry that recovers. The API is mocked (`page.route`), so
 * the suite is CI-safe with no backend; the page mock branches on the `cursor` param the way the
 * server does.
 */

/** A venue whose aggregate already moved — 4.3 over 12 reviews — so the header has a score. */
const RATED_VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 43,
  reviewsCount: 12,
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

function review(id: number, stars: number, displayName: string, comment: string) {
  return { id, stars, displayName, stayedIn: '2026-07', comment };
}

/** Ten reviews, ids 30 down to 21 — a full page, so a second page follows. */
const PAGE_ONE = {
  reviews: [
    review(30, 4, 'Ana', 'Great sunbeds, calm sea, and the umbrella actually shaded.'),
    ...Array.from({ length: 9 }, (_, i) =>
      review(29 - i, 5, `Guest ${29 - i}`, `Lovely day ${29 - i}.`),
    ),
  ],
  nextCursor: 21,
};

/** The two that remain — a short page, so the list ends here. */
const PAGE_TWO = {
  reviews: [review(20, 3, 'Ben', 'Fine, a little crowded.'), review(19, 5, 'Clara', 'Perfect.')],
  nextCursor: null,
};

const REVIEWS_ROUTE = /\/api\/venues\/1\/reviews(\?.*)?$/;

test.describe('reading a venue’s reviews', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
    );
    await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: RATED_VENUE }));
    await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [RATED_VENUE] }));
  });

  test('a tourist reads the first page and shows more until the list ends', async ({ page }) => {
    const cursors: (string | null)[] = [];
    await page.route(REVIEWS_ROUTE, (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      cursors.push(cursor);
      return route.fulfill({ json: cursor === '21' ? PAGE_TWO : PAGE_ONE });
    });

    await page.goto('/venues/1');

    const section = page.getByTestId('venue-reviews');
    await expect(section.getByRole('heading', { name: 'Guest reviews' })).toBeVisible();
    const entries = section.locator('[data-testid^="review-entry-"]');
    await expect(entries).toHaveCount(10);
    const first = entries.first();
    await expect(first.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible();
    await expect(first.getByTestId('review-name')).toHaveText('Ana');
    await expect(first.getByTestId('review-stay')).toHaveText('Stayed July 2026');
    await expect(first.getByTestId('review-comment')).toHaveText(
      'Great sunbeds, calm sea, and the umbrella actually shaded.',
    );
    // The header's aggregate anchors the section — the score up there, the words down here.
    await expect(page.locator('.map-head')).toContainText('4.3');
    await expect(page.locator('.map-head')).toContainText('12 reviews');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'venue page with the first page of reviews');

    const more = section.getByRole('button', { name: 'Show more reviews' });
    await more.click();

    await expect(entries).toHaveCount(12);
    await expect(entries.nth(10).getByTestId('review-name')).toHaveText('Ben');
    await expect(more).toHaveCount(0);
    await expect(section.getByTestId('review-entry-20')).toBeFocused();
    expect(cursors).toEqual([null, '21']);
    await expectNoSeriousAxeViolations(page, 'venue page with every review listed');
  });

  test('a rated venue with no written reviews shows its score and a quiet empty state', async ({
    page,
  }) => {
    await page.route(REVIEWS_ROUTE, (route) =>
      route.fulfill({ json: { reviews: [], nextCursor: null } }),
    );

    await page.goto('/venues/1');

    await expect(page.locator('.map-head')).toContainText('4.3');
    await expect(page.locator('.map-head').getByTestId('new-chip')).toHaveCount(0);
    const section = page.getByTestId('venue-reviews');
    await expect(section.getByTestId('venue-reviews-empty')).toContainText(
      'No written reviews yet',
    );
    await expect(section.locator('[data-testid^="review-entry-"]')).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Show more reviews' })).toHaveCount(0);
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'venue page with no written reviews');
  });

  test('a failed load offers a retry that recovers', async ({ page }) => {
    let failNext = true;
    await page.route(REVIEWS_ROUTE, (route) => {
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 500, json: { code: 'INTERNAL' } });
      }
      return route.fulfill({ json: PAGE_TWO });
    });

    await page.goto('/venues/1');

    const section = page.getByTestId('venue-reviews');
    await expect(section.getByTestId('venue-reviews-error')).toContainText('couldn’t be loaded');
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'venue page with the reviews failure line');

    await section.getByTestId('venue-reviews-retry').click();

    await expect(section.locator('[data-testid^="review-entry-"]')).toHaveCount(2);
    await expect(section.getByTestId('venue-reviews-error')).toHaveCount(0);
    await expect(section.getByTestId('review-entry-20')).toBeFocused();
  });
});
