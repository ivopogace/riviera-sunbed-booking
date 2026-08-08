import { expect, Page, test } from '@playwright/test';

import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';
import { OPERATOR_PASSWORD, OPERATOR_USERNAME } from './support/operator';

/**
 * Real-backend e2e for the per-row reprice. A real Chromium drives the operator
 * console's Pricing tab, which calls the REAL Spring Boot backend, which persists to a REAL
 * Flyway-migrated Postgres — nothing is mocked. Proves the full wired round-trip the unit/IT layers
 * can only prove in halves: reprice a row in the console → it survives a reload → and the SAME price
 * renders on the public tourist beach map + booking dialog. Local-only suite (never CI).
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

interface SetInput {
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly priceMinor: number;
  readonly gridX: number;
  readonly gridY: number;
  readonly pool: 'ONLINE' | 'WALK_IN';
  readonly tier: 'PREMIUM' | 'STANDARD';
}

async function addSet(page: Page, s: SetInput): Promise<void> {
  const before = await page.getByTestId('layout-row').count();
  await page.getByLabel('Row label').fill(s.rowLabel);
  await page.getByLabel('Position number').fill(String(s.positionNo));
  await page.getByTestId('set-tier').selectOption(s.tier);
  await page.getByTestId('set-pool').selectOption(s.pool);
  await page.getByLabel('Price (minor units)').fill(String(s.priceMinor));
  await page.getByLabel('Grid column (X)').fill(String(s.gridX));
  await page.getByLabel('Grid row (Y)').fill(String(s.gridY));
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await expect(page.getByTestId('layout-row')).toHaveCount(before + 1);
}

test.describe('O4 pricing — real backend, real Postgres', () => {
  test('reprices a row in the console; it survives reload and the tourist map + dialog show it', async ({
    page,
  }) => {
    // Lay out a venue with two ONLINE sets in row A at €35 via the legacy editor (bootstrap operator).
    await page.goto('/operator');
    await signIn(page);
    const id = await createVenue(page, venueName('pricing'));
    await addSet(page, { rowLabel: 'A', positionNo: 1, priceMinor: 3500, gridX: 1, gridY: 1, pool: 'ONLINE', tier: 'PREMIUM' });
    await addSet(page, { rowLabel: 'A', positionNo: 2, priceMinor: 3500, gridX: 2, gridY: 1, pool: 'ONLINE', tier: 'PREMIUM' });

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
