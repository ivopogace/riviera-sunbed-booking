import { expect, Page, test } from '@playwright/test';

import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';
import { OPERATOR_PASSWORD, OPERATOR_USERNAME } from './support/operator';

/**
 * Real-backend e2e for the Daily view. A real Chromium drives the operator console's
 * Daily view tab, which calls the REAL Spring Boot backend, which writes the REAL Flyway-migrated
 * Postgres `availability` table — nothing is mocked. Proves the wired round-trip the unit/IT layers
 * can only prove in halves: mark a walk-in in the console → it flips → and survives a reload because
 * it was persisted to the availability source of truth (invariant #2). Local-only suite (never CI).
 *
 * Each test creates its OWN venue (the DB persists across the run) so tests are order-free.
 */

function venueName(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function signIn(page: Page): Promise<void> {
  await new OperatorSignInPage(page).signIn(OPERATOR_USERNAME, OPERATOR_PASSWORD);
}

async function createVenue(page: Page, name: string): Promise<number> {
  await expect(page.getByRole('heading', { name: '1 · Create venue' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();
  const created = page.getByTestId('venue-created');
  await expect(created).toBeVisible();
  const id = Number((await created.textContent())?.match(/#(\d+)/)?.[1]);
  expect(Number.isInteger(id)).toBe(true);
  return id;
}

async function addOnlineSet(page: Page): Promise<void> {
  const before = await page.getByTestId('layout-row').count();
  await page.getByLabel('Row label').fill('A');
  await page.getByLabel('Position number').fill('1');
  await page.getByTestId('set-tier').selectOption('PREMIUM');
  await page.getByTestId('set-pool').selectOption('ONLINE');
  await page.getByLabel('Price (minor units)').fill('3000');
  await page.getByLabel('Grid column (X)').fill('1');
  await page.getByLabel('Grid row (Y)').fill('1');
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await expect(page.getByTestId('layout-row')).toHaveCount(before + 1);
}

test.describe('O5 daily view — real backend, real Postgres', () => {
  test('marks a walk-in in the console; it flips and survives a reload (availability persisted)', async ({
    page,
  }) => {
    // Lay out a venue with one ONLINE set via the legacy editor (bootstrap operator session).
    await page.goto('/operator');
    await signIn(page);
    const id = await createVenue(page, venueName('daily'));
    await addOnlineSet(page);

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
