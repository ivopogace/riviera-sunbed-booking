import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O4 Pricing tab (#174). Drives sign-in → open the Pricing tab →
 * see one row per label with its tier description and price → edit a row's € input → assert the
 * owner-asserted per-row reprice PUT (path + integer-minor-unit body) and the recomputed projected
 * take. Also the cross-venue (403) failure copy. API mocked via `page.route` (no backend); axe over
 * the tab.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

function seat(
  id: number,
  rowLabel: string,
  positionNo: number,
  tier: 'PREMIUM' | 'STANDARD',
  pool: 'ONLINE' | 'WALK_IN',
  minorUnits: number,
  gridX: number,
  gridY: number,
) {
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool,
    price: { minorUnits, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}

// Row A: two ONLINE premium (3500) + one WALK_IN (3500); Row B: one ONLINE standard (2000).
// Projected (online only) = 3500 + 3500 + 2000 = 9000 → €90.
const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  ratingTenths: 48,
  reviewsCount: 12,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2000, currency: 'EUR' },
  sets: [
    seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 1, 1),
    seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 3500, 2, 1),
    seat(3, 'A', 3, 'PREMIUM', 'WALK_IN', 3500, 3, 1),
    seat(4, 'B', 1, 'STANDARD', 'ONLINE', 2000, 1, 2),
  ],
};

test.use({ colorScheme: 'dark' });

/** Session + shell reads mocked; `puts` collects the reprice PUTs; `deny` makes the reprice 403. */
async function mockPricing(page: Page, deny = false): Promise<{ puts: Request[] }> {
  const puts: Request[] = [];
  let sessionLive = false;
  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PRINCIPAL });
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    sessionLive = false;
    return route.fulfill({ status: 204, body: '' });
  });
  // The per-row reprice PUT — captured; 204 normally, 403 NOT_VENUE_OWNER when denied.
  await page.route(/\/api\/venues\/1\/rows\/[^/]+\/price$/, (route) => {
    puts.push(route.request());
    return deny
      ? route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          json: { code: 'NOT_VENUE_OWNER', detail: '' },
        })
      : route.fulfill({ status: 204, body: '' });
  });
  // The venue map (tab source + shell header/stats). Keep below the reprice route (disjoint anyway).
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
  return { puts };
}

async function signInAndOpenPricing(page: Page): Promise<void> {
  await page.getByTestId('oc-user').fill('operator');
  await page.getByTestId('oc-pass').fill('pw');
  await page.getByTestId('oc-signin-submit').click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/pricing/);
  await expect(page.getByTestId('pricing-tab')).toBeVisible();
}

test('lists rows, projects the online-only take, and commits a minor-unit reprice (+ axe)', async ({
  page,
}) => {
  const { puts } = await mockPricing(page);
  await page.goto('/operator/1');
  await signInAndOpenPricing(page);

  // Two rows, each with its label + tier description; row A priced €35, projected €90 (online only).
  await expect(page.getByTestId('pricing-row')).toHaveCount(2);
  await expect(page.getByTestId('pricing-row').first()).toContainText('Front row');
  await expect(page.getByTestId('pricing-row').first()).toContainText('3 sets');
  await expect(page.getByTestId('pricing-input-A')).toHaveValue('35');
  await expect(page.getByTestId('pricing-projected')).toHaveText('€90');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'pricing tab');

  // Edit row A to €42.50 and commit (blur fires change) → one owner-asserted PUT with integer minor units.
  await page.getByTestId('pricing-input-A').fill('42.5');
  await page.getByTestId('pricing-input-A').blur();
  await expect(page.getByTestId('pricing-saved-A')).toBeVisible();

  expect(puts).toHaveLength(1);
  expect(puts[0].url()).toMatch(/\/api\/venues\/1\/rows\/A\/price$/);
  expect(puts[0].postDataJSON()).toEqual({ price: { minorUnits: 4250, currency: 'EUR' } });

  // Projected recomputes from the new online prices: 4250 + 4250 + 2000 = 10500 → €105.
  await expect(page.getByTestId('pricing-projected')).toHaveText('€105');
});

test('shows the not-owner message and reverts the projection when the reprice is 403', async ({
  page,
}) => {
  await mockPricing(page, true);
  await page.goto('/operator/1');
  await signInAndOpenPricing(page);

  await page.getByTestId('pricing-input-A').fill('99');
  await page.getByTestId('pricing-input-A').blur();

  await expect(page.getByTestId('pricing-error-A')).toContainText(/manage/i);
  // Reverted: the projection is back to the original €90, not the optimistic €200.
  await expect(page.getByTestId('pricing-projected')).toHaveText('€90');
});
