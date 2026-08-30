import { expect, Page } from '@playwright/test';

import { OperatorSignInPage } from '../../support/pages/operator-sign-in.page';

/**
 * The operator credential the real-backend e2e suite signs in with. The same value is fed to the
 * backend `webServer` as `RIVIERA_OPERATOR_PASSWORD` (see `playwright.config.ts`), which
 * provisions the bootstrap operator's DB-backed hash at startup (`OperatorCredentialInitializer`)
 * — so the session login (`POST /api/auth/operator/login`) accepts exactly this
 * credential, keeping the launcher and the tests in lock-step from one source. Local-only test
 * data, never a real secret.
 */
export const OPERATOR_USERNAME = 'operator';
export const OPERATOR_PASSWORD = 'e2e-operator-secret';

/** A unique-enough venue name per test, so a re-run never reads back a stale neighbour's venue. */
export function venueName(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Establish a REAL operator session via the shared sign-in Page Object: the form POSTs
 * the credential once, the backend verifies the DB-backed hash and answers with the session cookie
 * + CSRF token every later write rides.
 */
export async function signInOperator(
  page: Page,
  password: string = OPERATOR_PASSWORD,
): Promise<void> {
  await new OperatorSignInPage(page).signIn(OPERATOR_USERNAME, password);
}

/**
 * Create a venue on the operator home's create state:
 * open `/operator?create=1` (deterministic whatever the operator already owns), fill the
 * "Venue details" form (defaults stand for commission/currency/cutoff) and submit; returns the real
 * venue id parsed from the beach-map console URL the app navigates into. Must be signed in first —
 * and the caller must have navigated to `/operator?create=1` before signing in, so the app's
 * post-login redirect lands back on that create state (the reference shape: `page.goto`, then
 * `signInOperator`, then call this).
 */
export async function createVenue(page: Page, name: string): Promise<number> {
  // signInOperator only submits: awaiting the landing heading HERE, before navigating again, is what settles the session round-trip.
  await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  await page.goto('/operator?create=1');
  await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();

  await expect(page).toHaveURL(/\/operator\/\d+\/beach-map/);
  const id = Number(/\/operator\/(\d+)\/beach-map/.exec(page.url())?.[1]);
  expect(Number.isInteger(id)).toBe(true);
  return id;
}
