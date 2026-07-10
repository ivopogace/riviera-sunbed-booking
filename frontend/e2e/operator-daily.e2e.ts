import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O5 Daily view tab (#175). Drives sign-in → open the Daily view tab
 * → see the three tile states (free / booked-online-locked) + the arrivals code chips → tap a free
 * set to mark a walk-in → assert the owner-asserted mark POST and that the tile flips to walk-in
 * marked after the reconcile. API mocked via `page.route` (no backend); axe over the tab.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

// A1 free, A2 held by a confirmed online booking (locked), A3 free.
const BOOKINGS = [{ setId: 2, code: 'ABC12345' }];

function seat(
  id: number,
  positionNo: number,
  pool: 'ONLINE' | 'WALK_IN',
  availability: 'FREE' | 'TAKEN',
) {
  return {
    id,
    rowLabel: 'A',
    positionNo,
    tier: 'PREMIUM' as const,
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability,
  };
}

/** Session + shell reads mocked; a `marked` set makes the mark/release round-trip survive reconcile. */
async function mockDaily(page: Page): Promise<void> {
  const marked = new Set<number>();
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
  // Mark / release a walk-in — mutate `marked`, 204. (POST marks, DELETE releases.)
  await page.route(/\/api\/venues\/1\/sets\/(\d+)\/availability(\?.*)?$/, (route) => {
    const id = Number(/\/sets\/(\d+)\//.exec(route.request().url())![1]);
    if (route.request().method() === 'POST') {
      marked.add(id);
    } else {
      marked.delete(id);
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: BOOKINGS }));
  // The venue map: set 2 is always TAKEN (online-booked); a marked set reads TAKEN too.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Miramar Beach Club',
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        description: 'Loungers on the shore.',
        ratingTenths: 48,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 3000, currency: 'EUR' },
        sets: [1, 2, 3].map((id) =>
          seat(id, id, id === 3 ? 'WALK_IN' : 'ONLINE', id === 2 || marked.has(id) ? 'TAKEN' : 'FREE'),
        ),
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) => route.fulfill({ json: [] }));
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
}

test.use({ colorScheme: 'dark' });

async function signInAndOpenDaily(page: Page): Promise<void> {
  await page.getByTestId('oc-user').fill('operator');
  await page.getByTestId('oc-pass').fill('pw');
  await page.getByTestId('oc-signin-submit').click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();
}

test('shows tile states + arrival codes, and marks a walk-in that survives the reconcile (+ axe)', async ({
  page,
}) => {
  await mockDaily(page);
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  // Tile states: set 1 free, set 2 booked online (locked), set 3 free.
  await expect(page.locator('[data-set-id="1"]')).toHaveAttribute('data-state', 'FREE');
  await expect(page.locator('[data-set-id="2"]')).toHaveAttribute('data-state', 'BOOKED_ONLINE');

  // Arrivals: one row with the display-only booking code chip.
  await expect(page.getByTestId('daily-arrival-row')).toHaveCount(1);
  await expect(page.getByTestId('daily-arrival-code')).toHaveText('ABC12345');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view tab');

  // Tap the free set 1 → mark walk-in; after the reconcile it stays walk-in marked.
  await page.locator('[data-set-id="1"]').click();
  await expect(page.locator('[data-set-id="1"]')).toHaveAttribute('data-state', 'STAFF_MARKED');
});
