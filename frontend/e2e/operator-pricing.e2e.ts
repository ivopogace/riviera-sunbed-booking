import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O4 Pricing tab (#174). Drives sign-in → open the Pricing tab →
 * see one row per label with its tier description and price → edit a row's € input → assert the
 * owner-asserted per-row reprice PUT (path + integer-minor-unit body + #226 token) and the recomputed
 * projected take. Also the cross-venue (403) failure copy and the #226 stale-write conflict (409
 * STALE_WRITE reverts the row + offers Reload — co-located here as the venue tab does in
 * operator-venue.e2e.ts). API mocked via `page.route` (no backend); axe over the tab.
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

/**
 * Session + shell reads mocked; `puts` collects the reprice PUTs; `deny` makes the reprice 403. STATEFUL
 * on the #226 `setVersion`: the map GET hands out the current token, the reprice PUT enforces it (a
 * mismatch is 409 STALE_WRITE) and bumps it on success. `bump()` simulates a concurrent writer moving the
 * prices on behind the tab's back, so a subsequent stale reprice is genuinely rejected.
 */
async function mockPricing(
  page: Page,
  deny = false,
): Promise<{ puts: Request[]; bump: () => void; mapReads: () => number }> {
  const puts: Request[] = [];
  let sessionLive = false;
  let serverSetVersion = 0;
  let mapReads = 0;
  const bump = () => {
    serverSetVersion += 1;
  };
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
  // The per-row reprice PUT — captured; 403 NOT_VENUE_OWNER when denied; else the optimistic-concurrency
  // guard (#226): a stale expectedVersion is 409 STALE_WRITE, a match is 204 and bumps the server token.
  await page.route(/\/api\/venues\/1\/rows\/[^/]+\/price$/, (route) => {
    puts.push(route.request());
    if (deny) {
      return route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: { code: 'NOT_VENUE_OWNER', detail: '' },
      });
    }
    const body = route.request().postDataJSON() as { expectedVersion?: number };
    if (body.expectedVersion !== serverSetVersion) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: '' },
      });
    }
    serverSetVersion += 1;
    return route.fulfill({ status: 204, body: '' });
  });
  // The venue map (tab source + shell header/stats) — carries the current setVersion. Keep below the
  // reprice route (disjoint anyway).
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    mapReads += 1;
    return route.fulfill({ json: { ...VENUE_MAP, setVersion: serverSetVersion } });
  });
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
  return { puts, bump, mapReads: () => mapReads };
}

async function signInAndOpenPricing(page: Page): Promise<void> {
  // S9 (#277): the guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
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
  // The body carries the price AND the #226 token loaded from the map read (0 for the fresh mock).
  expect(puts[0].postDataJSON()).toEqual({
    price: { minorUnits: 4250, currency: 'EUR' },
    expectedVersion: 0,
  });

  // Projected recomputes from the new online prices: 4250 + 4250 + 2000 = 10500 → €105.
  await expect(page.getByTestId('pricing-projected')).toHaveText('€105');
});

test('opens the Pricing tab on ONE venue-map read, not two (#486)', async ({ page }) => {
  const { puts, mapReads } = await mockPricing(page);

  // Deep-link straight to the tab so only the shell and the Pricing tab mount: landing on /operator/1
  // would redirect to the beach-map default child, whose layout editor does its own (deliberately
  // uncached) read and would blur the count this test exists to make.
  await page.goto('/operator/1/pricing');
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();

  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('pricing-tab')).toBeVisible();
  // The rows prove the tab really got the map — a cache hit, not a skipped read.
  await expect(page.getByTestId('pricing-input-A')).toHaveValue('35');

  expect(mapReads()).toBe(1);

  // The shared snapshot carried the #226 token too: a reprice off it is accepted, not falsely stale.
  await page.getByTestId('pricing-input-A').fill('40');
  await page.getByTestId('pricing-input-A').blur();
  await expect.poll(() => puts.length).toBe(1);
  await expect(page.getByTestId('pricing-stale-banner')).toHaveCount(0);
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

test('a stale reprice is rejected 409, reverts the row + shows Reload, then recovers (#226, + axe)', async ({
  page,
}) => {
  const { bump } = await mockPricing(page);
  await page.goto('/operator/1');
  await signInAndOpenPricing(page); // the tab loads the map at setVersion 0

  // A concurrent writer moves the prices on (→ setVersion 1) behind this still-open tab.
  bump();

  // The operator edits row A off the now-stale setVersion 0 → 409 STALE_WRITE.
  await page.getByTestId('pricing-input-A').fill('99');
  await page.getByTestId('pricing-input-A').blur();

  // The conflict banner + Reload is shown; the optimistic value reverts (projection back to €90), and
  // the per-row inline error does NOT fire (a venue-level conflict, not a per-row failure).
  await expect(page.getByTestId('pricing-stale-banner')).toBeVisible();
  await expect(page.getByTestId('pricing-stale-reload')).toBeVisible();
  await expect(page.getByTestId('pricing-input-A')).toHaveValue('35');
  await expect(page.getByTestId('pricing-projected')).toHaveText('€90');
  await expect(page.getByTestId('pricing-error-A')).toBeHidden();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'pricing tab stale-write banner');

  // Reload pulls the latest map (setVersion 1) and clears the banner; re-applying now succeeds.
  await page.getByTestId('pricing-stale-reload').click();
  await expect(page.getByTestId('pricing-stale-banner')).toBeHidden();

  await page.getByTestId('pricing-input-A').fill('42.5');
  await page.getByTestId('pricing-input-A').blur();
  await expect(page.getByTestId('pricing-saved-A')).toBeVisible();
});
