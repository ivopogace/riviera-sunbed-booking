import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the operator console shell. Drives
 * the sign-in gate → porcelain shell → tab switching → sign-out lifecycle, the reload-survival of the
 * session, the always-porcelain theme override, and a narrow-viewport responsive tab row — with the
 * API mocked via `page.route` (no backend, like the sibling a11y specs). Axe runs on the signed-out
 * gate and the signed-in shell (real colour contrast over the porcelain surfaces).
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

function seat(id: number, availability: 'FREE' | 'TAKEN', pool: 'ONLINE' | 'WALK_IN' = 'ONLINE') {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'STANDARD',
    pool,
    price: { minorUnits: 4000, currency: 'EUR' },
    gridX: id,
    gridY: 0,
    availability,
  };
}

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
  // 5 sets, 2 free / 3 taken — the stats strip's "Free today 2 / 5" tile.
  sets: [
    seat(1, 'FREE'),
    seat(2, 'FREE'),
    seat(3, 'TAKEN'),
    seat(4, 'TAKEN'),
    seat(5, 'TAKEN', 'WALK_IN'),
  ],
};

// The daily online-takings figure the strip renders (gross + server-computed net after commission).
const TAKINGS = {
  gross: { minorUnits: 11000, currency: 'EUR' },
  net: { minorUnits: 9350, currency: 'EUR' },
  commissionBps: 1500,
  date: '2026-07-08',
};

// Pin the OS scheme to dark so the tourist shell boots the riviera (dark) theme deterministically —
// letting the porcelain-override assertion be meaningful (headless defaults to light → porcelain).
test.use({ colorScheme: 'dark' });

/**
 * Mock the console's endpoints with a stateful session: GET /me is 401 until a login POST flips it,
 * so a reload after signing in restores the session (as the real HttpOnly cookie would); logout flips
 * it back. The venue-title + Requests-badge reads are stubbed too.
 */
async function mockConsole(
  page: import('@playwright/test').Page,
  pending = 0,
  booked = 0,
  heldStates: { setId: number; state: string }[] = [],
): Promise<void> {
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
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: Array.from({ length: pending }, (_, i) => ({ bookingId: i + 1 })) }),
  );
  // The stats strip's three reads: confirmed bookings, takings, availability states.
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: Array.from({ length: booked }, (_, i) => ({ setId: i + 1, code: 'X' })) }),
  );
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) => route.fulfill({ json: TAKINGS }));
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: heldStates }),
  );
}

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
}

test('signs in, renders the console, switches tabs, and signs out (+ axe)', async ({ page }) => {
  await mockConsole(page, 3);
  await page.goto('/operator/1');

  // Signed out: the guard redirects to the unified auth card's operator tab, never the shell.
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator&returnUrl=/);
  await expect(page.getByTestId('auth-form')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'unified auth card (operator redirect)');

  // Sign in → the porcelain shell, with the venue title and a Requests badge of 3.
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('oc-venue-title')).toContainText('Miramar Beach Club');
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('3');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console shell');

  // Default tab is Beach map; the layout editor renders (not a placeholder). It reads :venueId
  // from the PARENT route (child routes don't inherit it) — a real browser exercises that
  // inheritance, which a mocked ActivatedRoute unit spec can't; the editor loads the
  // venue map for that id and seeds its grid.
  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // Switching to Daily view updates the URL and the active tab, rendering the daily view tab
  // (not a placeholder). It reads :venueId from the PARENT route (child routes don't inherit it) —
  // a real browser exercises that inheritance, which a mocked ActivatedRoute unit spec can't.
  const tabs = page.getByTestId('oc-tabs');
  await tabs.getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(tabs.getByRole('link', { name: 'Daily view' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  // Sign out → the console leaves for the unified auth card (the guard gates on activation).
  await page.getByTestId('oc-signout').click();
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator$/);
  await expect(page.getByTestId('auth-form')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
});

test('shows the stats strip with live free/total, walk-ins and takings, across a tab switch (#171)', async ({
  page,
}) => {
  await mockConsole(page, 0, 2, [
    { setId: 3, state: 'BOOKED_ONLINE' },
    { setId: 4, state: 'BOOKED_ONLINE' },
    { setId: 5, state: 'STAFF_MARKED' },
  ]); // 2 confirmed online bookings today
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  // Four live tiles: 5 sets (2 free), 2 booked, 1 STAFF_MARKED, €110 gross / €93.50 net.
  await expect(page.getByTestId('oc-stat-free')).toHaveText(/2\s*\/\s*5/);
  await expect(page.getByTestId('oc-stat-booked')).toHaveText('2');
  await expect(page.getByTestId('oc-stat-walkins')).toHaveText('1');
  await expect(page.getByTestId('oc-stat-takings')).toHaveText('€110');
  await expect(page.getByTestId('oc-stat-net')).toContainText('€93.50 after 15% commission');

  // The strip lives in the shell, not a tab — it survives a tab switch.
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(page.getByTestId('oc-stat-takings')).toHaveText('€110');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with stats strip');
});

test('keeps the operator signed in across a reload (session restored from /me)', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  await page.reload();
  // /me returns the principal → the guard awaits the restore instead of bouncing us to sign-in.
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page).toHaveURL(/\/operator\/1/);
});

test('renders porcelain over the tourist theme with a responsive tab row (#170)', async ({
  page,
}) => {
  await mockConsole(page);

  // Establish the dark riviera tourist theme first.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  // The console is always porcelain (scoped to its host); the document theme stays riviera.
  await expect(page.locator('app-operator-console')).toHaveAttribute('data-riv-theme', 'porcelain');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');

  // No horizontal page overflow on a narrow viewport — the pill tab row wraps.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console (narrow, porcelain over riviera)');
});
