import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The admin console tab strip's small-screen budget — the guard that keeps epic #348's open
 * question Q1 answered once it has been answered.
 *
 * Q1 asked whether the strip should group, overflow, or stay flat once Commissions (A8), Privacy
 * (A3) and Payouts (A6) take it from five tabs to eight. It was settled by measurement in favour of
 * staying flat: at 360px the wrap costs 2 rows at five tabs and **3 rows at both seven and eight**,
 * never clipping and never scrolling horizontally at any width. Accepting eight is therefore only
 * defensible while those numbers hold, so they are asserted here rather than left in a plan doc —
 * a ninth tab, or a label long enough to force a fourth row, fails CI instead of quietly making the
 * nav eat the page.
 *
 * Row count is asserted rather than pixel height on purpose: it survives font-metric differences
 * between environments while still catching the thing that actually degrades the page.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

/** The measured eight-tab budget at 360px — see the Q1 decision on #348. */
const MAX_ROWS_AT_360 = 3;

test.use({ viewport: { width: 360, height: 740 } });

/** Sign in as the platform admin and open the console home, where the strip renders. */
async function openConsole(page: Page): Promise<void> {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await page.getByTestId('admin-tab-operators').waitFor();
}

/** The strip's pills, located the way assistive tech finds them — by landmark role and its name. */
function tabPills(page: Page) {
  return page.getByRole('navigation', { name: 'Admin console sections' }).getByRole('link');
}

/** Distinct pill top-offsets = the number of wrapped rows the strip occupies. */
function tabRows(page: Page): Promise<number> {
  return tabPills(page).evaluateAll(
    (pills) => new Set(pills.map((p) => Math.round(p.getBoundingClientRect().top))).size,
  );
}

test('every console tab is reachable at 360px without a horizontal scroll', async ({ page }) => {
  await openConsole(page);

  const pills = tabPills(page);
  await expect(pills).not.toHaveCount(0);
  for (const pill of await pills.all()) {
    await expect(pill).toBeVisible();
  }

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);

  await expectNoSeriousAxeViolations(page, 'admin console tab strip at 360px');
});

test('the tab strip stays within its three-row budget at 360px', async ({ page }) => {
  await openConsole(page);

  expect(await tabRows(page)).toBeLessThanOrEqual(MAX_ROWS_AT_360);
});

test('the open tab is still the only one marked current at 360px', async ({ page }) => {
  await openConsole(page);

  await expect(page.getByTestId('admin-tab-operators')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-audit')).not.toHaveAttribute('aria-current', 'page');
});
