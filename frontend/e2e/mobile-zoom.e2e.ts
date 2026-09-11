import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { mockOwnedVenues } from './support/auth-mocks';
import { expectNoFocusZoom, expectTouchManipulation } from './support/mobile-zoom';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { openPalette } from './support/shell';

/**
 * The two mobile-browser zoom bugs on the staff-facing consoles, measured rather than asserted
 * from class lists. The tourist UI carries the same pair; these are the operator and admin halves.
 *
 * <p>**Auto-zoom-on-focus** is swept per surface: iOS Safari zooms the whole page in when a focused
 * field's computed `font-size` is under 16 px, so every field the surface renders is measured, and
 * a field added to a covered surface later is measured too. The sweep sees the RESTING surface
 * only, which is why the gated-states half opens every editor, confirm and panel this console
 * keeps a field behind — that is where most of these fields live.
 *
 * <p>**Double-tap-to-zoom** is asserted per named cluster instead, because there is no mechanical
 * rule for which controls want it: `touch-action: manipulation` belongs on a dense or adjacent
 * group tapped in quick succession — a tile grid, a chip row, a rail of tabs — and the layout
 * editor's paint cells deliberately want `touch-none` for their own drag gesture.
 *
 * <p>Viewport: the project runs this file once under `chromium`, at that project's desktop width.
 * No field in `src/` carries a responsive text size, so a field's computed size is the same at
 * every width and one pass measures it. What IS width-dependent is which chrome exists at all, and
 * the two rails sit on opposite sides of `sm` — the text rail above it, the phone rail below — so
 * each rail assertion sets the width it needs rather than inheriting the project's.
 */
const PHONE = { width: 390, height: 780 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('operator console — mobile zoom', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeConsole(page);
  });

  async function openConsoleTab(page: Page, path: string, marker: string): Promise<void> {
    await page.goto(`/operator/1/${path}`);
    await signInAsOperator(page);
    await expect(page.getByTestId(marker).first()).toBeVisible();
  }

  // `fields` is the FLOOR a surface must sweep at rest — 0 says "none" out loud, not by silence.
  const SURFACES = [
    { path: 'daily', marker: 'daily-view-tab', label: 'operator daily view', fields: 1 },
    { path: 'requests', marker: 'request-card', label: 'operator requests', fields: 0 },
    { path: 'pricing', marker: 'pricing-row', label: 'operator pricing', fields: 1 },
    { path: 'payouts', marker: 'statement-open', label: 'operator payouts', fields: 1 },
    { path: 'venue', marker: 'venue-name', label: 'operator venue & commodities', fields: 1 },
    { path: 'beach-map', marker: 'set-grid', label: 'operator beach map', fields: 1 },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label} — no field zooms the page in on focus`, async ({ page }) => {
      await openConsoleTab(page, surface.path, surface.marker);
      await expectNoFocusZoom(page, surface.label, surface.fields);
    });
  }

  test('operator home, create-venue card — no field zooms the page in on focus', async ({
    page,
  }) => {
    await page.goto('/operator?create=1');
    await signInAsOperator(page);
    await expect(page.getByTestId('venue-create-name')).toBeVisible();

    await expectNoFocusZoom(page, 'operator create-venue card', 5);
  });

  test('the command palette — no field zooms the page in on focus', async ({ page }) => {
    await openConsoleTab(page, 'daily', 'daily-view-tab');
    await openPalette(page);
    await expect(page.getByTestId('oc-palette-search')).toBeVisible();

    await expectNoFocusZoom(page, 'the command palette');
  });

  test('beach map, a set selected — no field zooms the page in on focus', async ({ page }) => {
    await openConsoleTab(page, 'beach-map', 'set-grid');
    await page.getByTestId('set-cell').first().click();
    await expect(page.getByTestId('set-price')).toBeVisible();

    await expectNoFocusZoom(page, 'operator beach map (per-set panel)');
  });

  test('beach map, a sweep selection — no field zooms the page in on focus', async ({ page }) => {
    await openConsoleTab(page, 'beach-map', 'set-grid');
    // The bulk panel's price opens on a drag-sweep across cells, not on a tool click.
    const cells = page.getByTestId('set-cell');
    const from = (await cells.nth(0).boundingBox())!;
    const to = (await cells.nth(2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId('batch-price')).toBeVisible();

    await expectNoFocusZoom(page, 'operator beach map (sweep selection)');
  });

  test('beach map, bulk paint mode — no field zooms the page in on focus', async ({ page }) => {
    await openConsoleTab(page, 'beach-map', 'set-grid');
    await page.getByTestId('layout-tool-premium').click();
    await expect(page.getByTestId('layout-row-name').first()).toBeVisible();

    await expectNoFocusZoom(page, 'operator beach map (bulk paint)');
  });

  test('payouts, the weather confirm open — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openConsoleTab(page, 'payouts', 'statement-open');
    await page.getByTestId('weather-trigger').click();
    await expect(page.getByTestId('weather-date')).toBeVisible();

    await expectNoFocusZoom(page, 'operator payouts (weather confirm)');
  });

  test('venue tab, the season close armed — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openConsoleTab(page, 'venue', 'venue-name');
    await page.getByTestId('venue-season-close').click();
    await expect(page.getByTestId('venue-season-reopen-on')).toBeVisible();

    await expectNoFocusZoom(page, 'operator venue tab (season close armed)');
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

  test('the header disclosure triggers keep their double-tap', async ({ page }) => {
    // The venue name is only a disclosure button on two or more owned venues.
    await mockOwnedVenues(page, [
      { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
      { id: 2, name: 'Sereno', beach: 'Jal' },
    ]);
    await openConsoleTab(page, 'daily', 'daily-view-tab');

    await expectTouchManipulation(
      page,
      'button[data-testid="oc-venue-title"], [data-testid="oc-account"]',
      'the venue switcher and account chip',
    );
  });

  test('the console rail tabs and the phone rail slots keep their double-tap', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
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

  // All nine rail destinations, so a raised field on any of them is measured.
  const SURFACES = [
    { path: '/admin', marker: 'admin-op-row', label: 'admin operators', fields: 0 },
    {
      path: '/admin/commissions',
      marker: 'admin-commissions-list',
      label: 'admin commissions',
      fields: 0,
    },
    { path: '/admin/email', marker: 'admin-outbox-card', label: 'admin mail outbox', fields: 1 },
    {
      path: '/admin/refunds',
      marker: 'admin-refunds-card',
      label: 'admin refund outbox',
      fields: 0,
    },
    { path: '/admin/photos', marker: 'admin-photos-venue', label: 'admin venue photos', fields: 1 },
    { path: '/admin/reviews', marker: 'admin-reviews-venue', label: 'admin reviews', fields: 1 },
    {
      path: '/admin/venue-changes',
      marker: 'admin-venue-change-fee-card',
      label: 'admin venue changes',
      fields: 0,
    },
    { path: '/admin/privacy', marker: 'admin-privacy-form', label: 'admin privacy', fields: 1 },
    { path: '/admin/audit', marker: 'admin-audit-card', label: 'admin audit', fields: 0 },
  ];

  for (const surface of SURFACES) {
    test(`${surface.label} — no field zooms the page in on focus`, async ({ page }) => {
      await openAdmin(page, surface.path, surface.marker);
      await expectNoFocusZoom(page, surface.label, surface.fields);
    });
  }

  test('commissions, the rate editor open — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openAdmin(page, '/admin/commissions', 'admin-commissions-list');
    await page.getByTestId('admin-commission-edit-7').click();
    await expect(page.getByTestId('admin-commission-editor-7')).toBeVisible();

    await expectNoFocusZoom(page, 'admin commissions (rate editor)', 2);
  });

  test('venue changes, the fee editor open — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openAdmin(page, '/admin/venue-changes', 'admin-venue-change-fee-card');
    await page.getByTestId('admin-venue-change-fee-edit').click();
    await expect(page.getByTestId('admin-venue-change-fee-editor')).toBeVisible();

    await expectNoFocusZoom(page, 'admin venue changes (fee editor)', 2);
  });

  test('privacy, the erasure confirm open — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openAdmin(page, '/admin/privacy', 'admin-privacy-form');
    await page.getByTestId('admin-privacy-email').fill('guest@example.com');
    await page.getByTestId('admin-privacy-review').click();
    await expect(page.getByTestId('admin-privacy-reason')).toBeVisible();

    await expectNoFocusZoom(page, 'admin privacy (erasure confirm)');
  });

  test('operators, the suspend confirm open — no field zooms the page in on focus', async ({
    page,
  }) => {
    await openAdmin(page, '/admin', 'admin-op-row');
    await page.getByTestId('admin-suspend-12').click();
    await expect(page.getByTestId('admin-suspend-reason-12')).toBeVisible();

    await expectNoFocusZoom(page, 'admin operators (suspend confirm)');
  });

  test('the admin rail tabs keep their double-tap', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openAdmin(page, '/admin/audit', 'admin-audit-card');

    await expectTouchManipulation(
      page,
      'nav[aria-label="Admin console sections"] a',
      'the admin rail tabs',
    );
  });
});
