import { expect, type Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render coverage of the route gates on `/operator/:venueId`. `venueIdGuard` redirects a
 * segment that does not spell a venue to the venue-not-found page, which is what makes the
 * invalid-link surface reachable by a navigation at all: while the console shell's template owned
 * it, no Playwright spec in either suite could drive it. `venueAccessGuard` sends a venue the
 * owner's read refuses to the same page (#1526).
 *
 * <p>APIs are mocked, so the suite is CI-safe.
 */

const NOT_FOUND = '/operator/venue-not-found';

test('a malformed venue id lands on the venue-not-found page', async ({ page }) => {
  await mockWholeConsole(page);

  await page.goto('/operator/not-a-venue');
  await signInAsOperator(page);

  const card = page.getByTestId('oc-invalid-venue-card');
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${NOT_FOUND}$`));
  await expect(page.getByTestId('oc-invalid-venue')).toHaveText('Venue not found');
  // Both destinations the retired copies disagreed about, on the one surface that owns the answer.
  await expect(card.getByTestId('oc-venue-list')).toHaveAttribute('href', '/operator');
  await expect(card.getByTestId('oc-invalid-create-venue')).toHaveAttribute(
    'href',
    '/operator?create=1',
  );
  // A `plain` route has no rail: the six tab links would have no venue to interpolate.
  await expect(page.getByTestId('oc-tabs')).toHaveCount(0);
  await expect(page.getByTestId('oc-phone-rail')).toHaveCount(0);

  await expectNoSeriousAxeViolations(page, NOT_FOUND);
});

test('a tab deep link under a malformed venue id is redirected too, and a real one is not', async ({
  page,
}) => {
  await mockWholeConsole(page);

  await page.goto('/operator/0/pricing');
  await signInAsOperator(page);
  await expect(page.getByTestId('oc-invalid-venue-card')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${NOT_FOUND}$`));

  // The gate does not over-reject: a real id opens the tab it names.
  await page.goto('/operator/1/pricing');
  await expect(page.getByTestId('pricing-tab')).toBeVisible();
  await expect(page).toHaveURL(/\/operator\/1\/pricing$/);
});

/**
 * The owner's beach-map read refusing the venue. A venue the operator does not own and an id that
 * does not exist both answer `403 NOT_VENUE_OWNER` (ownership is asserted before any existence probe,
 * invariant #13); `404 NO_SUCH_VENUE` stands for a venue that vanished after the grant.
 */
async function refuseVenue(
  page: Page,
  venueId: number,
  status: number,
  code: string,
): Promise<void> {
  await page.route(new RegExp(`/api/venues/${venueId}/beach-map$`), (route) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      json: { type: 'about:blank', title: 'Refused', status, code },
    }),
  );
}

test('a venue the owner’s read refuses lands on the venue-not-found page — 403 and 404 alike, told apart by nothing', async ({
  page,
}) => {
  await mockWholeConsole(page);
  await refuseVenue(page, 999, 403, 'NOT_VENUE_OWNER');
  await refuseVenue(page, 998, 404, 'NO_SUCH_VENUE');

  await page.goto('/operator/999/daily');
  await signInAsOperator(page);

  const card = page.getByTestId('oc-invalid-venue-card');
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${NOT_FOUND}$`));
  // A guard decided before activation: no rail, no stats strip, no Daily alert offering a retry that cannot succeed.
  await expect(page.getByTestId('oc-tabs')).toHaveCount(0);
  await expect(page.getByTestId('oc-stats')).toHaveCount(0);
  await expect(page.getByTestId('daily-load-error')).toHaveCount(0);
  const notOwnersPage = await card.innerText();

  await page.goto('/operator/998/pricing');

  await expect(card).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${NOT_FOUND}$`));
  // Same URL, same copy: an operator probing ids learns nothing the API would not also tell (invariant #13).
  expect(await card.innerText()).toBe(notOwnersPage);
});

test('a read that fails for any other reason still mounts the console with its retry', async ({
  page,
}) => {
  await mockWholeConsole(page);
  await page.route(/\/api\/venues\/999\/beach-map$/, (route) =>
    route.fulfill({ status: 503, body: '' }),
  );

  await page.goto('/operator/999/daily');
  await signInAsOperator(page);

  // Today's path, deliberately kept: a blip must not become a dead end.
  await expect(page.getByTestId('daily-load-error')).toBeVisible();
  await expect(page).toHaveURL(/\/operator\/999\/daily$/);
  await expect(page.getByTestId('oc-invalid-venue-card')).toHaveCount(0);
});
