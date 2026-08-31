import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The admin console tab strip's small-screen shape — a single scrolling row, matching the
 * operator console's own tab bar (`operator-console.html`, #710) rather than wrapping.
 *
 * The strip used to wrap (measured to stay within 3 rows at 360px through 8 tabs, never
 * scrolling), a decision made when its short, even-length labels never produced the ragged rows
 * that pushed the operator console to scroll instead. It was moved to match that mechanism
 * anyway, so the two navs behave the same rather than diverging on which one happened to draw
 * uneven labels — every pill still reachable, just via one scrolling row with an edge fade instead
 * of extra rows.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

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

test('the page never scrolls sideways at 360px — only the tab row does', async ({ page }) => {
  await openConsole(page);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  await expectNoSeriousAxeViolations(page, 'admin console tab strip at 360px');
});

test('every tab shares one row, and the row itself overflows horizontally', async ({ page }) => {
  await openConsole(page);

  const pills = tabPills(page);
  await expect(pills).not.toHaveCount(0);
  const tops = await pills.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);

  const nav = page.getByRole('navigation', { name: 'Admin console sections' });
  const [scrollWidth, clientWidth] = await nav.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

test('switching to an off-screen tab scrolls it into view, on click and on reload', async ({
  page,
}) => {
  await openConsole(page);

  const pills = tabPills(page);
  await pills.filter({ hasText: 'Audit' }).click();
  await expect(page).toHaveURL(/\/admin\/audit/);
  const active = tabPills(page).filter({ hasText: 'Audit' });
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expect(active).toBeInViewport();

  // Reload on that off-screen tab proves the ON-LOAD path too, not just the click.
  await page.reload();
  await page.getByTestId('admin-tab-audit').waitFor();
  const reloadedActive = tabPills(page).filter({ hasText: 'Audit' });
  await expect(reloadedActive).toHaveAttribute('aria-current', 'page');
  await expect(reloadedActive).toBeInViewport();
});

test('the open tab is still the only one marked current at 360px', async ({ page }) => {
  await openConsole(page);

  await expect(page.getByTestId('admin-tab-operators')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-audit')).not.toHaveAttribute('aria-current', 'page');
});
