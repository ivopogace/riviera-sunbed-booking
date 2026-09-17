import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render coverage of the route gate on `/operator/:venueId`. `venueIdGuard` redirects a
 * segment that does not spell a venue to the venue-not-found page, which is what makes the
 * invalid-link surface reachable by a navigation at all: while the console shell's template owned
 * it, no Playwright spec in either suite could drive it.
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
