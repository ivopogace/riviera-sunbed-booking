import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { expectPhoneRailFits, openMoreSheet, openOperatorAccountMenu } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The 44 px touch-target floor over the platform-admin console — the operator console's
 * sibling, and the surface whose own `admin-console-tabs` carried a code comment conceding its
 * pills were 40 px and under the figure.
 *
 * <p>Split from `touch-targets.e2e.ts` because the two consoles need different mocks and different
 * sign-in; the sweep helper and the content-marker rule are shared, and so is the viewport rule:
 * the project sets it (`phone` at 390px, `fold` at 344px), this file never does.
 */
test.describe('44px touch targets on the admin console at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
  });

  async function openAdmin(page: Page, path: string, marker: string): Promise<void> {
    await page.goto('/operator');
    await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
    await page.goto(path);
    await expect(page.getByTestId(marker).first()).toBeVisible();
  }

  test('admin audit — the phone rail fits one row, every slot at the floor, the More sheet too (#1012)', async ({
    page,
  }) => {
    const width = page.viewportSize()!.width;
    await openAdmin(page, '/admin/audit', 'admin-audit-card');

    await expectPhoneRailFits(page, 'Admin console sections (phone)');
    await expectTouchTargets(page, `admin audit with the phone rail at ${width}px`);
    await settle(page);
    await expectNoSeriousAxeViolations(page, `admin audit at ${width}px`);

    await openMoreSheet(page);
    await expectTouchTargets(page, `admin audit with the More sheet open at ${width}px`);
    await settle(page);
    await expectNoSeriousAxeViolations(page, `admin audit, More sheet open, at ${width}px`);
  });

  const SURFACES = [
    { path: '/admin', marker: 'admin-op-row', label: 'admin operators' },
    { path: '/admin/commissions', marker: 'admin-commissions-list', label: 'admin commissions' },
    { path: '/admin/email', marker: 'admin-outbox-card', label: 'admin mail outbox' },
    { path: '/admin/refunds', marker: 'admin-refunds-card', label: 'admin refund outbox' },
    { path: '/admin/photos', marker: 'admin-photos-venue', label: 'admin venue photos' },
    { path: '/admin/reviews', marker: 'admin-reviews-venue', label: 'admin reviews' },
    { path: '/admin/privacy', marker: 'admin-privacy-form', label: 'admin privacy' },
    { path: '/admin/audit', marker: 'admin-audit-card', label: 'admin audit' },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label}`, async ({ page }) => {
      await openAdmin(page, surface.path, surface.marker);

      await expectTouchTargets(page, surface.label);
    });
  }

  test('operators — the account menu open (#1008)', async ({ page }) => {
    await openAdmin(page, '/admin', 'admin-op-row');
    await openOperatorAccountMenu(page);
    await expect(page.getByTestId('oc-signout')).toBeVisible();

    await expectTouchTargets(page, 'admin operators with the account popover open');
  });
});

// A sweep of the resting surface cannot see a control that exists only once an editor/confirm opens.
test.describe('44px touch targets on the admin console — gated states', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
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

  test('reviews — a venue’s rows with Hide, Un-hide and Show more, then the hide confirm', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/admin/reviews');
    await page.getByTestId('admin-reviews-venue').selectOption('7');
    await expect(page.getByTestId('admin-review-hide-31')).toBeVisible();

    // Measure Hide, Un-hide and Show more BEFORE opening the confirm, which replaces Hide.
    await expectTouchTargets(page, 'admin reviews (rows)');

    await page.getByTestId('admin-review-hide-31').click();
    await expect(page.getByTestId('admin-review-confirm-panel-31')).toBeVisible();

    await expectTouchTargets(page, 'admin reviews (hide confirm)');
  });

  test('venue photos — an occupied slot, then its takedown confirm', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/photos');
    // The slots load only once a venue is picked; the mock then occupies its cover slot.
    await page.getByTestId('admin-photos-venue').selectOption('7');
    await expect(page.getByTestId('admin-photo-remove-cover')).toBeVisible();

    // Measure Remove BEFORE opening the confirm, which replaces it.
    await expectTouchTargets(page, 'admin venue photos (slot occupied)');

    await page.getByTestId('admin-photo-remove-cover').click();
    await expect(page.getByTestId('admin-photo-confirm-panel-cover')).toBeVisible();

    await expectTouchTargets(page, 'admin venue photos (takedown confirm)');
  });
});
