import { expect, test } from '@playwright/test';

import { mockAuthApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Venue onboarding inside the operator console surface — the mocked, CI-safe successor to the
 * retired `/venue-admin` page's coverage. A first-time operator signs in, gets the create form
 * INLINE on `/operator` (zero state), submits it, and lands straight in the new venue's beach-map
 * tab. Also pins the one-release `/venue-admin` → `/operator?create=1` redirect from the outside.
 *
 * The auth + venue APIs are mocked statefully (`support/auth-mocks.ts` + local routes), so the spec
 * runs in CI (`npm run test:e2e:a11y`).
 */

const NEW_VENUE_ID = 31;

/** The freshly created venue as the console shell + beach-map tab read it (empty map, no bookings). */
async function mockNewVenueConsole(page: import('@playwright/test').Page): Promise<void> {
  await page.route(/\/api\/venues$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { id: NEW_VENUE_ID } })
      : route.fallback(),
  );
  await page.route(new RegExp(`/api/venues/${NEW_VENUE_ID}(\\?.*)?$`), (route) =>
    route.fulfill({
      json: {
        id: NEW_VENUE_ID,
        name: 'Sunset Bar',
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        description: 'Loungers on the shore.',
        ratingTenths: 0,
        reviewsCount: 0,
        bookingMode: 'INSTANT',
        fromPrice: null,
        sets: [],
        setVersion: 0,
      },
    }),
  );
  await page.route(new RegExp(`/api/venues/${NEW_VENUE_ID}/booking-requests(\\?.*)?$`), (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(new RegExp(`/api/venues/${NEW_VENUE_ID}/bookings(\\?.*)?$`), (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(new RegExp(`/api/venues/${NEW_VENUE_ID}/takings(\\?.*)?$`), (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
  await page.route(new RegExp(`/api/venues/${NEW_VENUE_ID}/availability(\\?.*)?$`), (route) =>
    route.fulfill({ json: [] }),
  );
}

test('a first-time operator creates their venue inline on /operator and lands in its beach-map tab (+ axe)', async ({
  page,
}) => {
  await mockAuthApi(page, { validPassword: 'good-pw', venues: [] });
  await mockNewVenueConsole(page);
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');

  // Zero state: the create form renders INLINE on /operator — no second page, one visual language.
  await expect(page).toHaveURL(/\/operator$/);
  await expect(page.getByTestId('venue-create-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'operator zero state — inline create form');

  await page.getByLabel('Name', { exact: true }).fill('Sunset Bar');
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();

  // Straight into the new console's beach-map tab — laying out the map is the next real step.
  await expect(page).toHaveURL(new RegExp(`/operator/${NEW_VENUE_ID}/beach-map`));
  await expect(page.getByTestId('oc-header')).toBeVisible();
});

test('the picker’s Add-another-venue link swaps to the create form and keeps keyboard focus anchored', async ({
  page,
}) => {
  await mockAuthApi(page, {
    validPassword: 'good-pw',
    venues: [
      { id: 7, name: 'Sereno', beach: 'Jal' },
      { id: 9, name: 'Miramar Beach Club', beach: 'Ksamil' },
    ],
  });
  await mockNewVenueConsole(page);
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');
  await expect(page.getByTestId('operator-home-picker')).toBeVisible();

  // The real in-app transition (not a goto): the focused link unmounts with the branch swap.
  await page.getByTestId('operator-home-add-venue').click();

  await expect(page).toHaveURL(/\/operator\?create=1/);
  await expect(page.getByTestId('venue-create-card')).toBeVisible();
  const title = page.getByRole('heading', { name: 'Add another venue' });
  await expect(title).toBeVisible();
  // WCAG 2.4.3 (the recurring stranded-focus class): focus re-anchors on the new title.
  await expect(title).toBeFocused();
});

test('a /venue-admin bookmark keeps working for one release — it forwards to the create state', async ({
  page,
}) => {
  await mockAuthApi(page, { validPassword: 'good-pw', venues: [] });

  await page.goto('/venue-admin');

  // The redirect resolves BEFORE the guard, so the sign-in returnUrl carries the create intent.
  await expect(page).toHaveURL(/\/account\/sign-in\?.*returnUrl=%2Foperator%3Fcreate%3D1/);
});
