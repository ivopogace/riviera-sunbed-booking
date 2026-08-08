import { expect, Page, test } from '@playwright/test';

import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';
import { OPERATOR_PASSWORD, OPERATOR_USERNAME } from './support/operator';

/**
 * Real-backend e2e for the Payouts tab. A real Chromium drives the operator console's
 * Payouts tab, which calls the REAL Spring Boot backend + REAL Flyway-migrated Postgres — nothing is
 * mocked. It proves the wired, owner-asserted round-trip the unit/IT layers only prove in halves:
 * the `GET /api/venues/{id}/payout-ledger` read and the `POST /api/venues/{id}/weather-refund` action
 * are reachable through the session cookie and render correctly.
 *
 * <p><strong>Coverage boundary.</strong> A payout <em>accrual</em> only exists after a booking is
 * CONFIRMED (a signature-verified Stripe webhook, invariant #8) — which this UI suite cannot drive — so
 * a fresh venue's ledger is legitimately EMPTY and its weather refund a no-op. That is exactly what
 * this proves end-to-end: the ledger renders "nothing owed" (owed €0) and the per-date weather refund
 * round-trips to the no-op outcome, both owner-asserted (invariant #13). The accrual/reversal money
 * math is pinned by the backend ITs (`PayoutLedgerViewIT`, `PayoutReversalIT`, `WeatherRefundServiceIT`);
 * the full populated ledger + reversal UI is pinned by the CI-safe mocked `operator-payouts.e2e.ts`.
 * Local-only suite (never CI); each test creates its OWN venue so tests are order-free.
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

test.describe('O7 payouts — real backend, real Postgres', () => {
  test('a fresh venue shows an empty ledger (owed €0) and its weather refund round-trips to a no-op', async ({
    page,
  }) => {
    // Create a venue via the legacy editor (bootstrap operator session), then open the Payouts tab —
    // the editor sign-in cookie carries the real owner-asserted session.
    await page.goto('/operator');
    await signIn(page);
    const id = await createVenue(page, venueName('payouts'));

    await page.goto(`/operator/${id}/payouts`);
    await expect(page.getByTestId('payouts-tab')).toBeVisible();

    // The ledger read is wired + owner-asserted: a fresh venue owes nothing (no confirmed bookings yet).
    await expect(page.getByTestId('payout-owed')).toContainText('€0');
    await expect(page.getByTestId('payouts-empty')).toBeVisible();

    // The per-date weather refund round-trips to the real endpoint; with no confirmed bookings it is a
    // valid no-op — proving the owner-asserted POST is reachable and the outcome renders (invariant #10).
    await page.getByTestId('weather-trigger').click();
    await expect(page.getByTestId('weather-confirm')).toBeVisible();
    await page.getByTestId('weather-confirm-btn').click();
    await expect(page.getByTestId('payouts-notice')).toContainText('No confirmed bookings');
  });
});
