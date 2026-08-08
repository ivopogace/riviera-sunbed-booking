import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Audit tab: an admin opens the
 * trail and reads who did what, to what, when, and on what grounds — including a failed attempt,
 * which renders like any other row with its status. The audit API is mocked so the spec is
 * self-contained and runs in CI (`npm run test:e2e:a11y`); that a mutating admin action actually
 * writes a row is proven against real Postgres by `AdminAuditTrailIT`.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

const ENTRIES = [
  {
    id: 12,
    occurredAt: '2026-06-15T09:30:00Z',
    actor: 'operator',
    method: 'DELETE',
    path: '/api/admin/venues/7/photos/cover',
    status: 204,
    reason: 'reported by email',
  },
  {
    id: 11,
    occurredAt: '2026-06-14T18:05:00Z',
    actor: 'operator',
    method: 'POST',
    path: '/api/admin/erasure',
    status: 400,
    reason: null,
  },
];

async function mockAuditApi(page: Page, entries: readonly (typeof ENTRIES)[number][]) {
  await page.route(/\/api\/admin\/audit$/, (route) => route.fulfill({ json: entries }));
}

/** Sign in as the platform admin and open the Audit tab. */
async function openAuditTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/audit');
}

test('an admin reads the recorded actions — who, what, when, outcome, grounds', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAuditApi(page, ENTRIES);
  await openAuditTab(page);

  const takedown = page.getByTestId('admin-audit-row-12');
  await expect(takedown).toContainText('operator');
  await expect(takedown).toContainText('DELETE /api/admin/venues/7/photos/cover');
  await expect(takedown).toContainText('204');
  await expect(takedown).toContainText('reported by email');
  // The moment reads in Europe/Tirane (09:30Z is 11:30 in summer), newest row first.
  await expect(takedown).toContainText('11:30');

  // A refused attempt is a row like any other — its status is the story.
  const failed = page.getByTestId('admin-audit-row-11');
  await expect(failed).toContainText('400');

  await expectNoSeriousAxeViolations(page, 'admin audit trail with recorded actions');
});

test('an empty trail says so plainly', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAuditApi(page, []);
  await openAuditTab(page);

  await expect(page.getByTestId('admin-audit-empty')).toBeVisible();
  await expect(page.getByTestId('admin-audit-table')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'admin audit trail empty');
});

test('the tab strip marks the Audit tab and reaches it from the console sections', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAuditApi(page, ENTRIES);
  await openAuditTab(page);

  const audit = page.getByTestId('admin-tab-audit');
  const operators = page.getByTestId('admin-tab-operators');
  await expect(audit).toHaveAttribute('aria-current', 'page');
  await expect(operators).not.toHaveAttribute('aria-current', 'page');

  await operators.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('admin-tab-audit')).not.toHaveAttribute('aria-current', 'page');
});

test('a signed-out visitor is shown no trail and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAuditApi(page, ENTRIES);

  await page.goto('/admin/audit');

  await expect(page.getByTestId('admin-audit-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-audit-table')).toHaveCount(0);
  await expect(page.getByTestId('admin-tab-audit')).toHaveCount(0);
});
