import { expect, Page, test } from '@playwright/test';

import { createVenue, signInOperator, venueName } from './support/operator';

/**
 * Real-backend e2e for the per-row reprice. A real Chromium drives the operator
 * console's Pricing tab, which calls the REAL Spring Boot backend, which persists to a REAL
 * Flyway-migrated Postgres — nothing is mocked. Proves the full wired round-trip the unit/IT layers
 * can only prove in halves: reprice a row in the console → it survives a reload → and the SAME price
 * renders on the public tourist beach map + booking dialog. Local-only suite (never CI).
 *
 * Each test creates its OWN venue (the DB persists across the run) so tests are order-free.
 */

/**
 * Add one set at an empty grid cell via the per-set editor: row 1 (the sea-facing row) defaults to
 * ONLINE · PREMIUM · €35 (`draftForNewCell`), exactly the fixture this suite reprices.
 */
async function addOnlineSetAt(page: Page, gridX: number, gridY: number): Promise<void> {
  await page
    .locator(`[data-testid="set-cell"][data-grid-x="${gridX}"][data-grid-y="${gridY}"]`)
    .click();
  await expect(page.getByTestId('set-panel')).toBeVisible();
  await page.getByTestId('set-add').click();
  await expect(page.getByTestId('set-saved')).toBeVisible();
}

test.describe('O4 pricing — real backend, real Postgres', () => {
  test('reprices a row in the console; it survives reload and the tourist map + dialog show it', async ({
    page,
  }) => {
    // Onboard a fresh venue, then lay out two ONLINE sets in row A at €35 via the per-set editor.
    await page.goto('/operator?create=1');
    await signInOperator(page);
    const id = await createVenue(page, venueName('pricing'));

    // A fresh venue with no sets opens on the paint brush — arm Select to reach the per-set editor.
    await page.getByTestId('layout-tool-select').click();
    await expect(page.getByTestId('set-editor')).toBeVisible();
    await addOnlineSetAt(page, 1, 1);
    await page.getByTestId('set-add-col').click();
    await addOnlineSetAt(page, 2, 1);

    // Open the console Pricing tab (the editor sign-in cookie carries the real session).
    await page.goto(`/operator/${id}/pricing`);
    await expect(page.getByTestId('pricing-tab')).toBeVisible();
    await expect(page.getByTestId('pricing-input-A')).toHaveValue('35');

    // Reprice row A to €50.50 and commit → real owner-asserted PUT → real per-row UPDATE.
    await page.getByTestId('pricing-input-A').fill('50.5');
    await page.getByTestId('pricing-input-A').blur();
    await expect(page.getByTestId('pricing-saved-A')).toBeVisible();

    // Survives reload — the value is re-read from Postgres, not local state.
    await page.reload();
    await expect(page.getByTestId('pricing-input-A')).toHaveValue('50.5');

    // The public tourist beach map reflects it — open an A set, the dialog shows €50.50.
    await page.goto(`/venues/${id}`);
    await expect(page.getByTestId('set-tile').first()).toBeVisible();
    await page.getByTestId('set-tile').first().click();
    await expect(page.getByTestId('dialog-price')).toHaveText('€50.50');
  });
});
