import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the operator lifecycle: a prospective
 * operator self-registers and is auto-signed-in while still PENDING, creates its venue and works
 * the console under the pending-approval notice; a platform admin approves it and the notice
 * clears. The whole lifecycle API is mocked statefully (`support/auth-mocks.ts`), so the spec is
 * self-contained and runs in CI (`npm run test:e2e:a11y`); the server halves — the D-8
 * byte-identical 202, ownership resolution, and the tourist-visibility fence — are proven against
 * real Postgres by `PendingOperatorConsoleIT`/`OperatorRegistrationIT`.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const NEW_OP = { username: 'newop', password: 'newop-pw-123', contactEmail: 'newop@venue.example' };

async function register(
  page: import('@playwright/test').Page,
  op: { username: string; password: string; contactEmail: string },
): Promise<void> {
  await page.goto('/operator/register');
  await page.getByLabel('Username', { exact: true }).fill(op.username);
  await page.getByLabel('Contact email', { exact: true }).fill(op.contactEmail);
  await page.getByLabel('Password', { exact: true }).fill(op.password);
  await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();
}

test('a registering operator lands straight in the console and works it while PENDING', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const signIn = new OperatorSignInPage(page);

  // 1. Self-register → session-less 202 → auto-sign-in → the zero-state home, under the notice.
  await register(page, NEW_OP);
  await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await expect(page.getByTestId('pending-approval-banner')).toContainText('hidden from tourists');
  await expectNoSeriousAxeViolations(page, 'pending operator home with create card');

  // 2. Still PENDING, the operator creates its venue and lands in that console — notice included.
  await page.getByLabel('Name', { exact: true }).fill('Sunset Club');
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();
  await expect(page).toHaveURL(/\/operator\/100\/beach-map/);
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'pending operator console');

  // 3. The admin approves the registration; the queue reconciles from the server to empty.
  await page.getByTestId('oc-signout').click();
  await signIn.expectSignedOut();
  await signIn.signIn(ADMIN.username, ADMIN.password);
  await signIn.expectSignedInAs(ADMIN.username);
  await page.goto('/admin');
  await expect(page.getByTestId('admin-op-row')).toContainText(NEW_OP.username);
  await expect(page.getByTestId('admin-op-row')).toContainText(NEW_OP.contactEmail);
  await expectNoSeriousAxeViolations(page, 'admin pending queue');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('admin-ops-empty')).toBeVisible();

  // 4. The approved operator signs back in: same console, no pending notice any more.
  await page.goto('/operator');
  await signIn.signOut();
  await signIn.expectSignedOut();
  await signIn.signIn(NEW_OP.username, NEW_OP.password);
  await signIn.expectSignedInAs(NEW_OP.username);
  await expect(page.getByTestId('pending-approval-banner')).toHaveCount(0);
});

test('a duplicate username surfaces as a normal failed sign-in after the 202 (D-8)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const signIn = new OperatorSignInPage(page);

  // Take the username, then leave the session behind (the home wears the operator chrome).
  await register(page, NEW_OP);
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await signIn.signOut();
  await signIn.expectSignedOut();

  // The identical 202 (no oracle), then the auto-sign-in fails like any wrong-credential attempt.
  await register(page, { ...NEW_OP, password: 'a-different-pw-1' });
  await expect(signIn.error).toContainText('Sign-in failed');
  await expect(signIn.card).toBeVisible();
});
