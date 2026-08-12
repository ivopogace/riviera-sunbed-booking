import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The 44 px touch-target floor (#605) over the platform-admin console — the operator console's
 * sibling, and the surface whose own `admin-console-tabs` carried a code comment conceding its
 * pills were 40 px and under the figure.
 *
 * <p>Split from `touch-targets.e2e.ts` because the two consoles need different mocks and different
 * sign-in; the sweep helper and the content-marker rule are shared.
 */
test.describe('44px touch targets on the admin console at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  async function openAdmin(page: Page, path: string, marker: string): Promise<void> {
    await page.goto('/operator');
    await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
    await page.goto(path);
    await expect(page.getByTestId(marker).first()).toBeVisible();
  }

  const SURFACES = [
    { path: '/admin', marker: 'admin-op-row', label: 'admin operators' },
    { path: '/admin/commissions', marker: 'admin-commissions-list', label: 'admin commissions' },
    { path: '/admin/email', marker: 'admin-outbox-card', label: 'admin mail outbox' },
    { path: '/admin/refunds', marker: 'admin-refunds-card', label: 'admin refund outbox' },
    { path: '/admin/photos', marker: 'admin-photos-venue', label: 'admin venue photos' },
    { path: '/admin/privacy', marker: 'admin-privacy-form', label: 'admin privacy' },
    { path: '/admin/audit', marker: 'admin-audit-card', label: 'admin audit' },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label}`, async ({ page }) => {
      await openAdmin(page, surface.path, surface.marker);

      await expectTouchTargets(page, surface.label);
    });
  }
});

// A sweep of the resting surface cannot see a control that exists only once an editor/confirm opens.
test.describe('44px touch targets on the admin console — gated states', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  async function signIn(page: Page): Promise<void> {
    await page.goto('/operator');
    await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  }

  test('commissions — the rate editor open', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/commissions');
    await page.getByTestId('admin-commission-edit-7').click();
    await expect(page.getByTestId('admin-commission-editor-7')).toBeVisible();

    await expectTouchTargets(page, 'admin commissions (editor open)');
  });

  test('operators — the suspend confirm open', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin');
    await page.getByTestId('admin-suspend-12').click();
    await expect(page.getByTestId('admin-suspend-panel-12')).toBeVisible();

    await expectTouchTargets(page, 'admin operators (suspend confirm)');
  });

  test('venue photos — the takedown confirm open', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/photos');
    await expect(page.getByTestId('admin-photos-venue')).toBeVisible();

    await expectTouchTargets(page, 'admin venue photos (resting)');
  });
});
