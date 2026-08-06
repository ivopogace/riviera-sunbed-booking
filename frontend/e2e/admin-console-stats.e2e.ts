import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's stat strip (A9, epic #348), at **360px**
 * — the project's small-screen bar and the only width where the strip's cost is in question.
 *
 * Two guards here exist to keep decisions decided, in the shape Q1's own e2e established:
 *
 *  - **The fold budget.** The strip's whole risk is that it pushes the console home's actual work
 *    below the fold. The shared operator chrome (#462) already spends 165px and the seven-tab strip
 *    another 137px, so the room left is small and shrinks with every tab. Asserting that the first
 *    content heading stays above a 740px fold fails CI on a fifth tile or a taller tile, instead of
 *    letting the page quietly become a masthead.
 *  - **The strip's scope.** A9 renders the stats on the console *home* only, because Q1 (PR #524)
 *    declined a layout component and pinned its revisit to a ninth tab. That is a decision, not an
 *    accident, so a later slice pasting the strip onto another tab should fail a test rather than
 *    silently reopen it.
 *
 * The admin reads are mocked here so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that `/api/admin/**` is genuinely ADMIN-gated —
 * is A4's, proven against a real Postgres by `AdminPayoutSecurityIT` and its siblings.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

/** The viewport the whole slice is argued at — and the fold the budget is measured against. */
test.use({ viewport: { width: 360, height: 740 } });

const PENDING = [
  { id: 21, username: 'ana', contactEmail: 'ana@v.example', registeredAt: '2026-07-18T00:00:00Z' },
  { id: 22, username: 'bes', contactEmail: 'bes@v.example', registeredAt: '2026-07-19T00:00:00Z' },
];

const ACCOUNTS = [
  { id: 1, username: 'operator', contactEmail: null, admin: true, suspended: false },
  { id: 2, username: 'cami', contactEmail: 'c@v.example', admin: false, suspended: false },
  { id: 3, username: 'drin', contactEmail: 'd@v.example', admin: false, suspended: false },
  { id: 4, username: 'eri', contactEmail: 'e@v.example', admin: false, suspended: true },
];

/** Rates chosen so the mean is not a whole percent — 1500/1000/1000 → 1166.67 → 1167 bps → 11.67%. */
const VENUES = [
  { venueId: 7, name: 'Bora Bora Beach', beach: 'Dhërmi', commissionBps: 1500, payoutCurrency: 'EUR' },
  { venueId: 9, name: 'Folie Marine', beach: 'Gjipe', commissionBps: 1000, payoutCurrency: 'EUR' },
  { venueId: 11, name: 'Kalypso', beach: 'Jal', commissionBps: 1000, payoutCurrency: 'EUR' },
];

/**
 * Sign in as the platform admin, then override the lifecycle mock's own admin reads with a fixture
 * rich enough for every tile to carry a distinct number — a strip where three tiles read `0` cannot
 * show a mislabelled tile.
 */
async function openConsole(page: Page, venues: unknown = VENUES): Promise<void> {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.route(/\/api\/admin\/operators$/, (route) => route.fulfill({ json: PENDING }));
  await page.route(/\/api\/admin\/operators\/accounts$/, (route) =>
    route.fulfill({ json: ACCOUNTS }),
  );
  await page.route(/\/api\/admin\/venues$/, (route) =>
    venues === null
      ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{}' })
      : route.fulfill({ json: { venues } }),
  );
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await page.getByTestId('admin-stats').waitFor();
}

/**
 * The measured budget, at HEAD: chrome 0–165, `h1` 205–241, seven-tab strip 261–398, stat strip
 * 418–659, first content heading 691–**718**. Twenty-two pixels of headroom, which is exactly why
 * this is a test and not a note in a plan doc.
 */
const FOLD = 740;

/** Distance from the top of the viewport to an element — what "above the fold" is measured on. */
function topOf(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().top),
    selector,
  );
}

function bottomOf(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) => Math.round(document.querySelector(sel)!.getBoundingClientRect().bottom),
    selector,
  );
}

test('reports the platform at a glance from the reads the console already makes', async ({
  page,
}) => {
  await openConsole(page);

  await expect(page.getByTestId('admin-stat-pending')).toHaveText('2');
  await expect(page.getByTestId('admin-stat-active')).toHaveText('3');
  await expect(page.getByTestId('admin-stat-suspended')).toHaveText('1');
  await expect(page.getByTestId('admin-stat-venues')).toHaveText('3');
});

test('names the mean as an average of rates, never as the platform take', async ({ page }) => {
  await openConsole(page);

  await expect(page.getByTestId('admin-stat-mean-rate')).toHaveText('mean rate 11.67%');
  await expect(page.getByTestId('admin-stats-mean-note')).toContainText(
    'averages venue rates equally',
  );
  await expect(page.getByTestId('admin-stats-mean-note')).toContainText('where bookings land');
});

test('a failed venue read dashes its own tile and leaves the rest standing', async ({ page }) => {
  await openConsole(page, null);

  await expect(page.getByTestId('admin-stat-venues')).toHaveText('—');
  await expect(page.getByTestId('admin-stat-mean-rate')).toHaveCount(0);
  await expect(page.getByTestId('admin-stats-mean-note')).toHaveCount(0);
  await expect(page.getByTestId('admin-stat-pending')).toHaveText('2');
});

test("the console home's first content heading survives the strip at 360px", async ({ page }) => {
  await openConsole(page);
  await expect(page.getByTestId('admin-stat-mean-rate')).toBeVisible();

  // Whole heading, not its top sliver: the strip earns its place only if the page's work is legible.
  expect(await bottomOf(page, '#admin-pending-title')).toBeLessThan(FOLD);

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);
});

test('sits below the tab strip, so the pills never move between tabs', async ({ page }) => {
  await openConsole(page);

  const tabsBottom = await page.evaluate(() =>
    Math.round(
      document
        .querySelector('nav[aria-label="Admin console sections"]')!
        .getBoundingClientRect().bottom,
    ),
  );
  expect(await topOf(page, '[data-testid="admin-stats"]')).toBeGreaterThanOrEqual(tabsBottom);

  const tabsTopOnHome = await topOf(page, '[data-testid="admin-tab-operators"]');
  await page.getByTestId('admin-tab-commissions').click();
  await expect(page).toHaveURL(/\/admin\/commissions/);
  expect(await topOf(page, '[data-testid="admin-tab-operators"]')).toBe(tabsTopOnHome);
});

test("the strip is the console home's, not every tab's", async ({ page }) => {
  await openConsole(page);

  await page.getByTestId('admin-tab-commissions').click();
  await expect(page).toHaveURL(/\/admin\/commissions/);
  await expect(page.getByTestId('admin-commissions-list')).toBeVisible();
  await expect(page.getByTestId('admin-stats')).toHaveCount(0);
});

test('the stat strip is accessible at 360px (+ real contrast over the porcelain glass)', async ({
  page,
}) => {
  await openConsole(page);
  await expect(page.getByTestId('admin-stat-mean-rate')).toBeVisible();

  await expectNoSeriousAxeViolations(page, 'admin console stat strip at 360px');
});
