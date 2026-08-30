import { expect, Page, test } from '@playwright/test';

import { createVenue, signInOperator, venueName } from './support/operator';

/**
 * Real-backend e2e for the Daily view. A real Chromium drives the operator console's
 * Daily view tab, which calls the REAL Spring Boot backend, which writes the REAL Flyway-migrated
 * Postgres `availability` table — nothing is mocked. Proves the wired round-trip the unit/IT layers
 * can only prove in halves: mark a walk-in in the console → it flips → and survives a reload because
 * it was persisted to the availability source of truth (invariant #2). Local-only suite (never CI).
 *
 * Each test creates its OWN venue (the DB persists across the run) so tests are order-free.
 */

/**
 * Lay out one sea-facing set on the console's beach-map tab. A 1×1 generate is the whole gesture:
 * generated cells are ONLINE by default (the walk-in tool is what makes one WALK_IN), so this is the
 * shortest real layout a tourist can book against.
 */
async function addOnlineSet(page: Page, venueId: number): Promise<void> {
  await page.goto(`/operator/${venueId}/beach-map`);
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(1);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
}

test.describe('O5 daily view — real backend, real Postgres', () => {
  test('marks a walk-in in the console; it flips and survives a reload (availability persisted)', async ({
    page,
  }) => {
    // Onboard a fresh venue via the shared onboarding helper, then lay out one ONLINE set.
    await page.goto('/operator?create=1');
    await signInOperator(page);
    const id = await createVenue(page, venueName('daily'));
    await addOnlineSet(page, id);

    // Open the console Daily view tab (the editor sign-in cookie carries the real session).
    await page.goto(`/operator/${id}/daily`);
    await expect(page.getByTestId('daily-view-tab')).toBeVisible();

    // The set starts FREE; tap it to mark a walk-in → real owner-asserted POST → real availability row.
    const tile = page.locator('[data-set-id]').first();
    await expect(tile).toHaveAttribute('data-state', 'FREE');
    await tile.click();
    await expect(page.locator('[data-set-id]').first()).toHaveAttribute(
      'data-state',
      'STAFF_MARKED',
    );

    // Survives reload — the state is re-read from Postgres, not local optimistic state.
    await page.reload();
    await expect(page.locator('[data-set-id]').first()).toHaveAttribute(
      'data-state',
      'STAFF_MARKED',
    );

    // Release it again → back to FREE, also persisted.
    await page.locator('[data-set-id]').first().click();
    await expect(page.locator('[data-set-id]').first()).toHaveAttribute('data-state', 'FREE');
    await page.reload();
    await expect(page.locator('[data-set-id]').first()).toHaveAttribute('data-state', 'FREE');
  });
});
