import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The admin console tab strip's small-screen budget — the guard that keeps the strip's
 * group-vs-flat question answered once it has been answered.
 *
 * The question was whether the strip should group, overflow, or stay flat once Commissions,
 * Privacy and Payouts took it from five tabs to eight; Commissions and Privacy have since landed
 * the sixth and seventh. It was settled by measurement in favour of staying flat: at 360px the
 * wrap costs 2 rows at five tabs and **3 rows at six, seven and eight alike**, never clipping and
 * never scrolling horizontally at any width. Accepting eight is therefore only defensible while
 * those numbers hold, so they are asserted here rather than left in a plan doc — a ninth tab, or
 * a label long enough to force a fourth row, fails CI instead of quietly making the nav eat the
 * page.
 *
 * Row count is asserted rather than pixel height on purpose: it survives font-metric differences
 * between environments while still catching the thing that actually degrades the page.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

/** The measured eight-tab budget at 360px — the flat-strip decision's ceiling. */
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
