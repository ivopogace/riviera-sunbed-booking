import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the full operator lifecycle (S6 #115, AC-10): a prospective
 * operator self-registers → a PENDING account that CANNOT sign in → a platform admin approves it → the
 * approved operator signs in → creates a venue (which it owns, creator-owns-on-create). The whole
 * lifecycle API is mocked statefully (`support/auth-mocks.ts`), so the spec is self-contained and runs
 * in CI (`npm run test:e2e:a11y`); the create + ownership are proven end-to-end against the real backend
 * by `CrossVenueDenialIT`/`OperatorApprovalIT`.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const NEW_OP = { username: 'newop', password: 'newop-pw-123', contactEmail: 'newop@venue.example' };

test('operator registers, is approved by an admin, then signs in and creates a venue', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const signIn = new OperatorSignInPage(page);

  // 1. The prospective operator self-registers → PENDING; it sees the approval notice, not a session.
  //    Since S9 (#277) /operator/register redirects into the unified card's operator+register tab.
  await page.goto('/operator/register');
  await page.getByLabel('Username', { exact: true }).fill(NEW_OP.username);
  await page.getByLabel('Contact email', { exact: true }).fill(NEW_OP.contactEmail);
  await page.getByLabel('Password', { exact: true }).fill(NEW_OP.password);
  await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();
  await expect(page.getByTestId('auth-pending')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'operator registration pending');

  // 2. A PENDING operator cannot sign in yet — approval is required (generic failure, D-8).
  await page.goto('/operator');
  await signIn.signIn(NEW_OP.username, NEW_OP.password);
  await expect(signIn.error).toContainText('Sign-in failed');
  await signIn.expectSignedOut();

  // 3. The admin signs in, opens the approval surface, and approves the pending registration; the
  //    queue RECONCILES from the server to empty (never a local-only card removal).
  await signIn.signIn(ADMIN.username, ADMIN.password);
  await signIn.expectSignedInAs(ADMIN.username);

  await page.goto('/admin');
  await expect(page.getByTestId('admin-op-row')).toContainText(NEW_OP.username);
  await expect(page.getByTestId('admin-op-row')).toContainText(NEW_OP.contactEmail);
  await expectNoSeriousAxeViolations(page, 'admin pending queue');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('admin-ops-empty')).toBeVisible();

  // 4. The admin signs out; the newly-approved operator can now sign in (approval enabled its login).
  await page.goto('/operator');
  await signIn.signOut();
  await signIn.expectSignedOut();
  await signIn.signIn(NEW_OP.username, NEW_OP.password);
  await signIn.expectSignedInAs(NEW_OP.username);

  // 5. The approved operator creates a venue on the inline /operator form and lands in its console (#278).
  await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Sunset Club');
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();
  await expect(page).toHaveURL(/\/operator\/100\/beach-map/);
});
