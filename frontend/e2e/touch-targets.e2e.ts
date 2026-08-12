import { expect, test } from '@playwright/test';

import { mockWholeConsole, signInToConsole } from './support/operator-console.mocks';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The project's 44 px touch-target floor (#605), measured rather than asserted from class lists.
 * One test per surface, each sweeping EVERY visible interactive control on it — so a control added
 * to a covered surface later is covered too, which is the drift this suite exists to stop.
 *
 * <p>Surfaces are added here as each phase brings them to the floor; the phase that lands a surface
 * is the phase that un-skips it.
 */
test.describe('44px touch targets at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  // Phase 1 brings the console shell to the floor and un-skips this; phase 0 only proves the sweep.
  test.fixme('operator console — requests tab', async ({ page }) => {
    await page.goto('/operator/1/requests');
    await signInToConsole(page);

    // A surface that rendered its empty state has no controls to measure and would sweep vacuously.
    await expect(page.getByTestId('request-card').first()).toBeVisible();

    await expectTouchTargets(page, 'operator requests tab');
  });
});
