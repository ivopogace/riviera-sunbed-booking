import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The project's 44 px touch-target floor (#605), measured rather than asserted from class lists.
 * One test per surface, each sweeping EVERY visible interactive control on it — so a control added
 * to a covered surface later is covered too, which is the drift this suite exists to stop.
 *
 * <p>Every surface asserts a **content marker** before sweeping: a surface that rendered its empty
 * or error state has no controls to measure and would pass vacuously.
 *
 * <p>Surfaces are added here as each phase brings them to the floor; the phase that lands a surface
 * is the phase that un-skips it.
 */
test.describe('44px touch targets at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  async function openConsoleTab(page: Page, path: string): Promise<void> {
    await page.goto(`/operator/1/${path}`);
    await signInAsOperator(page);
  }

  test('operator console — requests tab', async ({ page }) => {
    await openConsoleTab(page, 'requests');
    await expect(page.getByTestId('request-card').first()).toBeVisible();

    await expectTouchTargets(page, 'operator requests tab');
  });

  test('operator console — pricing tab', async ({ page }) => {
    await openConsoleTab(page, 'pricing');
    await expect(page.getByTestId('pricing-row').first()).toBeVisible();

    await expectTouchTargets(page, 'operator pricing tab');
  });

  test('operator console — payouts tab', async ({ page }) => {
    await openConsoleTab(page, 'payouts');
    await expect(page.getByTestId('statement-open')).toBeVisible();

    await expectTouchTargets(page, 'operator payouts tab');
  });

  test('operator console — venue & commodities tab', async ({ page }) => {
    await openConsoleTab(page, 'venue');
    await expect(page.getByTestId('venue-name')).toBeVisible();
    // The mock occupies one photo slot so the conditional Remove button is on screen to measure.
    await expect(page.getByTestId('photo-remove-cover')).toBeVisible();

    await expectTouchTargets(page, 'operator venue tab');
  });

  test('operator home — create-venue card', async ({ page }) => {
    await page.goto('/operator?create=1');
    await signInAsOperator(page);
    await expect(page.getByTestId('venue-create-name')).toBeVisible();

    await expectTouchTargets(page, 'operator home (create venue)');
  });

  // A sweep of the resting surface cannot see a control that exists only once a confirm/modal opens.
  test('operator console — requests tab, decline confirm open', async ({ page }) => {
    await openConsoleTab(page, 'requests');
    await page
      .getByRole('button', { name: /^Decline/ })
      .first()
      .click();
    await expect(page.getByTestId('decline-confirm').first()).toBeVisible();

    await expectTouchTargets(page, 'operator requests tab (decline confirm)');
  });

  test('operator console — payouts tab, weather confirm open', async ({ page }) => {
    await openConsoleTab(page, 'payouts');
    await page.getByTestId('weather-trigger').click();
    await expect(page.getByTestId('weather-confirm-btn')).toBeVisible();

    await expectTouchTargets(page, 'operator payouts tab (weather confirm)');
  });

  test('operator console — payouts tab, statement modal open', async ({ page }) => {
    await openConsoleTab(page, 'payouts');
    await page.getByTestId('statement-open').click();
    await expect(page.getByTestId('payout-statement')).toBeVisible();

    await expectTouchTargets(page, 'operator payout statement');
  });

  // Phase 2 gives both beach-map grids a 44px tile floor that scrolls in-frame, and un-skips these.
  test('operator console — daily view', async ({ page }) => {
    await openConsoleTab(page, 'daily');
    await expect(page.getByTestId('daily-tile').first()).toBeVisible();

    await expectTouchTargets(page, 'operator daily view');
  });

  test('operator console — beach map editor', async ({ page }) => {
    await openConsoleTab(page, 'beach-map');
    await expect(page.getByTestId('layout-mode-bulk')).toBeVisible();

    await expectTouchTargets(page, 'operator beach map editor');
  });
});
