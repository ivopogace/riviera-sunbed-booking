import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the operator console shell (issue #170, epic #141 foundation). Drives
 * the sign-in gate → porcelain shell → tab switching → sign-out lifecycle, the reload-survival of the
 * session, the always-porcelain theme override, and a narrow-viewport responsive tab row — with the
 * API mocked via `page.route` (no backend, like the sibling a11y specs). Axe runs on the signed-out
 * gate and the signed-in shell (real colour contrast over the porcelain surfaces).
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

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

// Pin the OS scheme to dark so the tourist shell boots the riviera (dark) theme deterministically —
// letting the porcelain-override assertion be meaningful (headless defaults to light → porcelain).
test.use({ colorScheme: 'dark' });

/**
 * Mock the console's endpoints with a stateful session: GET /me is 401 until a login POST flips it,
 * so a reload after signing in restores the session (as the real HttpOnly cookie would); logout flips
 * it back. The venue-title + Requests-badge reads are stubbed too.
 */
async function mockConsole(page: import('@playwright/test').Page, pending = 0): Promise<void> {
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
}

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('oc-user').fill('operator');
  await page.getByTestId('oc-pass').fill('pw');
  await page.getByTestId('oc-signin-submit').click();
}

test('signs in, renders the console, switches tabs, and signs out (+ axe)', async ({ page }) => {
  await mockConsole(page, 3);
  await page.goto('/operator/1');

  // Signed out: the glass sign-in card, not the shell.
  await expect(page.getByTestId('oc-signin-title')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator sign-in card');

  // Sign in → the porcelain shell, with the venue title and a Requests badge of 3.
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('oc-venue-title')).toContainText('Miramar Beach Club');
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('3');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console shell');

  // Default tab is Beach map; switching to Daily view updates the URL and the active tab. Scope to
  // the tab nav — the daily placeholder also renders an "Open the current daily view" link.
  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  const tabs = page.getByTestId('oc-tabs');
  await tabs.getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(tabs.getByRole('link', { name: 'Daily view' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Sign out → back to the sign-in card.
  await page.getByTestId('oc-signout').click();
  await expect(page.getByTestId('oc-signin-title')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
});

test('keeps the operator signed in across a reload (session restored from /me)', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  await page.reload();
  // /me now returns the principal → the shell renders without re-entering credentials.
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('oc-signin-title')).toHaveCount(0);
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
