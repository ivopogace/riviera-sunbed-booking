import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { expectNoFocusZoom, expectTouchManipulation } from './support/mobile-zoom';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The two mobile-browser zoom bugs on the staff-facing consoles, measured rather than asserted
 * from class lists. The tourist UI carries the same pair; these are the operator and admin halves.
 *
 * <p>**Auto-zoom-on-focus** is swept generically per surface: iOS Safari zooms the whole page in
 * when a focused field's computed `font-size` is under 16 px, so every visible field on every
 * console surface is measured, and a field added to a covered surface later is measured too.
 *
 * <p>**Double-tap-to-zoom** is asserted per named cluster instead, because there is no mechanical
 * rule for which controls want it: `touch-action: manipulation` belongs on a dense or adjacent
 * group tapped in quick succession — a tile grid, a chip row, a rail of tabs — and the layout
 * editor's paint cells deliberately want `touch-none` for their own drag gesture.
 *
 * <p>Viewport: this file sets its own, unlike the two touch-target sweeps the project runs at
 * `phone` and `fold`. Neither font-size nor `touch-action` varies with width, so one pass is the
 * whole proof; the one width-dependent case is the console's phone rail, which renders only below
 * `sm` and gets a phone viewport of its own.
 */
const PHONE = { width: 390, height: 780 };

test.describe('operator console — mobile zoom', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeConsole(page);
  });

  async function openConsoleTab(page: Page, path: string, marker: string): Promise<void> {
    await page.goto(`/operator/1/${path}`);
    await signInAsOperator(page);
    await expect(page.getByTestId(marker).first()).toBeVisible();
  }

  const SURFACES = [
    { path: 'daily', marker: 'daily-view-tab', label: 'operator daily view' },
    { path: 'requests', marker: 'request-card', label: 'operator requests' },
    { path: 'pricing', marker: 'pricing-row', label: 'operator pricing' },
    { path: 'payouts', marker: 'statement-open', label: 'operator payouts' },
    { path: 'venue', marker: 'venue-name', label: 'operator venue & commodities' },
    { path: 'beach-map', marker: 'set-grid', label: 'operator beach map' },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label} — no field zooms the page in on focus`, async ({ page }) => {
      await openConsoleTab(page, surface.path, surface.marker);
      await expectNoFocusZoom(page, surface.label);
    });
  }

  test('operator home, create-venue card — no field zooms the page in on focus', async ({
    page,
  }) => {
    await page.goto('/operator?create=1');
    await signInAsOperator(page);
    await expect(page.getByTestId('venue-create-name')).toBeVisible();

    await expectNoFocusZoom(page, 'operator create-venue card');
  });

  test('beach map — the set-tile grid and the tier/pool chips keep their double-tap', async ({
    page,
  }) => {
    await openConsoleTab(page, 'beach-map', 'set-grid');

    await expectTouchManipulation(page, '[data-testid="set-cell"]', 'the set-tile grid');

    await page.getByTestId('set-cell').first().click();
    await expect(page.getByTestId('set-panel')).toBeVisible();
    await expectTouchManipulation(
      page,
      '[data-testid^="set-tier-"], [data-testid^="set-pool-"]',
      'the tier and pool chips',
    );
  });

  test('beach map — the layout editor tool rail keeps its double-tap', async ({ page }) => {
    await openConsoleTab(page, 'beach-map', 'set-grid');
    await expect(page.getByTestId('layout-tool-premium')).toBeVisible();

    await expectTouchManipulation(
      page,
      'button[data-testid^="layout-tool-"]',
      'the tool-chip rail',
    );
  });

  test('daily view — the arrivals tiles keep their double-tap', async ({ page }) => {
    await openConsoleTab(page, 'daily', 'daily-view-tab');

    await expectTouchManipulation(page, 'button[data-set-id]', 'the daily arrivals tiles');
  });

  test('venue tab — the amenity chips keep their double-tap', async ({ page }) => {
    await openConsoleTab(page, 'venue', 'venue-name');
    await expect(page.getByTestId('amenity-toggle-WIFI')).toBeVisible();

    await expectTouchManipulation(page, '[data-testid^="amenity-toggle-"]', 'the amenity chips');
  });

  test('the console rail tabs and the phone rail slots keep their double-tap', async ({ page }) => {
    await openConsoleTab(page, 'daily', 'daily-view-tab');
    await expectTouchManipulation(page, '[data-testid="oc-tabs"] a', 'the console rail tabs');

    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('oc-phone-rail')).toBeVisible();
    await expectTouchManipulation(page, '[data-testid="oc-phone-rail"] a', 'the phone rail slots');
  });
});

test.describe('admin console — mobile zoom', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
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
    { path: '/admin/reviews', marker: 'admin-reviews-venue', label: 'admin reviews' },
    { path: '/admin/privacy', marker: 'admin-privacy-form', label: 'admin privacy' },
    { path: '/admin/audit', marker: 'admin-audit-card', label: 'admin audit' },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label} — no field zooms the page in on focus`, async ({ page }) => {
      await openAdmin(page, surface.path, surface.marker);
      await expectNoFocusZoom(page, surface.label);
    });
  }

  test('the admin rail tabs keep their double-tap', async ({ page }) => {
    await openAdmin(page, '/admin/audit', 'admin-audit-card');

    await expectTouchManipulation(
      page,
      'nav[aria-label="Admin console sections"] a',
      'the admin rail tabs',
    );
  });
});
