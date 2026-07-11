import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O3 layout editor (#172). Drives the actual generate → confirm →
 * paint → save flow on the default beach-map tab, asserting the single bulk PUT payload, the
 * server-locked (`LAYOUT_IN_USE`) path, and the #226 stale-write conflict (409 STALE_WRITE keeps the
 * painted grid + offers Reload — co-located here as the venue tab does in operator-venue.e2e.ts). API
 * mocked via `page.route` (no backend), axe over the editor.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

// An empty venue so the editor starts from the empty state — the operator generates the grid (no
// seed→fill race). The generate-over-existing confirm flow is pinned by the unit spec.
const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  ratingTenths: 48,
  reviewsCount: 12,
  bookingMode: 'INSTANT',
  fromPrice: null,
  sets: [],
};

test.use({ colorScheme: 'dark' });

/**
 * Session + reads mock; `puts` collects the layout PUT payloads; `lock` makes that PUT 409 LAYOUT_IN_USE.
 * STATEFUL on the #226 `setVersion`: the map GET hands out the current token, the PUT enforces it (a
 * mismatch is 409 STALE_WRITE) and bumps it on success. `bump()` simulates a concurrent writer moving the
 * layout on behind the tab's back, so a subsequent stale save is genuinely rejected.
 */
async function mockEditor(page: Page, lock = false): Promise<{ puts: Request[]; bump: () => void }> {
  const puts: Request[] = [];
  let sessionLive = false;
  let serverSetVersion = 0;
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
  // The layout PUT — captured; 409 LAYOUT_IN_USE when locked; else the optimistic-concurrency guard
  // (#226): a stale expectedVersion is 409 STALE_WRITE, a match is 204 and bumps the server token.
  await page.route(/\/api\/venues\/1\/beach-map$/, (route) => {
    puts.push(route.request());
    if (lock) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'LAYOUT_IN_USE', detail: 'locked' },
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
  // The venue map (editor seed + shell header/stats) — carries the current setVersion; GET only, kept
  // below the PUT route.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { ...VENUE_MAP, setVersion: serverSetVersion } })
      : route.fallback(),
  );
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({ json: { gross: { minorUnits: 0, currency: 'EUR' }, net: { minorUnits: 0, currency: 'EUR' }, commissionBps: 1500, date: '2026-07-08' } }),
  );
  return { puts, bump };
}

async function signIn(page: Page): Promise<void> {
  await page.getByTestId('oc-user').fill('operator');
  await page.getByTestId('oc-pass').fill('pw');
  await page.getByTestId('oc-signin-submit').click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
}

test('generates a grid, paints a walk-in set, and saves the whole layout in one PUT (+ axe)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);

  // Default tab is the layout editor; the empty venue shows the empty state until we generate.
  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await expect(page.getByTestId('layout-empty')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor');

  // Generate a 2×3 grid in one action (no confirm — the venue has no layout yet).
  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('3');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(6);

  // Paint the first cell walk-in (select the tool, then click the cell — the keyboard/click path).
  await page.getByTestId('layout-tool-walkin').click();
  await page.getByTestId('layout-cell').first().click();
  await expect(page.getByTestId('layout-cell').first()).toHaveAttribute('data-state', 'walkin');
  await expect(page.getByTestId('layout-count-walkin')).toHaveText('1');

  // Save → exactly one PUT carrying all six sets, one of them WALK_IN, plus the loaded #226 token.
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  expect(puts).toHaveLength(1);
  const body = puts[0].postDataJSON() as { sets: { pool: string }[]; expectedVersion: number };
  expect(body.sets).toHaveLength(6);
  expect(body.sets.filter((s) => s.pool === 'WALK_IN')).toHaveLength(1);
  expect(body.expectedVersion).toBe(0); // the setVersion loaded from the map read
});

test('shows the layout-locked message when the venue has bookings (409 LAYOUT_IN_USE)', async ({
  page,
}) => {
  await mockEditor(page, true);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // Generate a minimal grid, then save — the server rejects it as in-use (the venue has bookings).
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(1);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-error')).toContainText(/locked/i);
});

test('a stale-tab save is rejected 409, keeps the painted grid, and Reload recovers (#226, + axe)', async ({
  page,
}) => {
  const { bump } = await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page); // the editor loads the map at setVersion 0

  // A concurrent writer moves the layout on (→ setVersion 1) behind this still-open tab.
  bump();

  // The operator generates + paints, then saves off the now-stale setVersion 0 → 409 STALE_WRITE.
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('2');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(2);
  await page.getByTestId('layout-tool-walkin').click();
  await page.getByTestId('layout-cell').first().click();
  await page.getByTestId('layout-save').click();

  // The conflict banner + Reload is shown; the painted grid is PRESERVED (never discarded), and neither
  // the generic error nor the saved notice fires.
  await expect(page.getByTestId('layout-stale-banner')).toBeVisible();
  await expect(page.getByTestId('layout-stale-reload')).toBeVisible();
  await expect(page.getByTestId('layout-cell')).toHaveCount(2);
  await expect(page.getByTestId('layout-cell').first()).toHaveAttribute('data-state', 'walkin');
  await expect(page.getByTestId('layout-error')).toBeHidden();
  await expect(page.getByTestId('layout-saved')).toBeHidden();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor stale-write banner');

  // Reload pulls the latest server layout (setVersion 1, an empty venue → the empty state) and clears
  // the banner; re-generating and saving now succeeds against the fresh token.
  await page.getByTestId('layout-stale-reload').click();
  await expect(page.getByTestId('layout-stale-banner')).toBeHidden();
  await expect(page.getByTestId('layout-empty')).toBeVisible();

  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
});
