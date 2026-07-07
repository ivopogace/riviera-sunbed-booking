import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O3 layout editor (#172). Drives the actual generate → confirm →
 * paint → save flow on the default beach-map tab, asserting the single bulk PUT payload, and the
 * server-locked (`LAYOUT_IN_USE`) path. API mocked via `page.route` (no backend), axe over the editor.
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

/** Session + reads mock; `putBody` collects the layout PUT payload; `lock` makes that PUT 409. */
async function mockEditor(page: Page, lock = false): Promise<{ puts: Request[] }> {
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
  // The layout PUT — captured; 204 normally, 409 LAYOUT_IN_USE when locked.
  await page.route(/\/api\/venues\/1\/beach-map$/, (route) => {
    puts.push(route.request());
    return lock
      ? route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          json: { code: 'LAYOUT_IN_USE', detail: 'locked' },
        })
      : route.fulfill({ status: 204, body: '' });
  });
  // The venue map (editor seed + shell header/stats); GET only — keep it below the PUT route.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: VENUE_MAP }) : route.fallback(),
  );
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({ json: { gross: { minorUnits: 0, currency: 'EUR' }, net: { minorUnits: 0, currency: 'EUR' }, commissionBps: 1500, date: '2026-07-08' } }),
  );
  return { puts };
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

  // Save → exactly one PUT carrying all six sets, one of them WALK_IN.
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  expect(puts).toHaveLength(1);
  const body = puts[0].postDataJSON() as { sets: { pool: string }[] };
  expect(body.sets).toHaveLength(6);
  expect(body.sets.filter((s) => s.pool === 'WALK_IN')).toHaveLength(1);
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
