import { expect, test, type Page } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The admin-issued operator reset (#1737) through the real console and reset page, the lifecycle API
 * mocked statefully (`support/auth-mocks.ts`): an admin issues a one-time link, the operator opens it
 * signed out, chooses a new password and signs in with it while the old one fails. Server-side token
 * rules and session revocation are `OperatorPasswordResetIT`'s.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const OP = { username: 'zoe', password: 'venue-key-12345', contactEmail: 'zoe@venue.example' };
const NEW_PASSWORD = 'a-fresh-passphrase-9';

/** Register + approve, leaving the admin signed in on /admin. */
async function seedApprovedOperator(page: Page): Promise<void> {
  const signIn = new OperatorSignInPage(page);
  await page.goto('/operator/register');
  await page.getByLabel('Username', { exact: true }).fill(OP.username);
  await page.getByLabel('Contact email', { exact: true }).fill(OP.contactEmail);
  await page.getByLabel('Password', { exact: true }).fill(OP.password);
  await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await signIn.signOut();

  await page.goto('/operator');
  await signIn.signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('admin-ops-empty')).toBeVisible();
}

test('an admin hands an operator a one-time reset link and the operator sets a new password', async ({
  page,
  baseURL,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const signIn = new OperatorSignInPage(page);
  await seedApprovedOperator(page);

  const row = page.getByTestId('admin-account-row').filter({ hasText: OP.username });
  await row.getByRole('button', { name: 'Reset link' }).click();

  const link = row.getByLabel(`One-time reset link for ${OP.username}`);
  await expect(link).toBeFocused();
  await expect(link).toHaveValue(`${baseURL}/account/operator-reset?token=reset-token-1`);
  await expect(row.getByText('It works once, until')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin reset link shown');

  // Issuing again retires the first link: only the newest one is shown, and only it redeems.
  await row.getByRole('button', { name: 'Reset link' }).click();
  await expect(link).toHaveValue(/reset-token-2$/);
  const url = await link.inputValue();

  await row.getByRole('button', { name: 'Done' }).click();
  await expect(link).toBeHidden();
  await expect(row.getByRole('button', { name: 'Reset link' })).toBeFocused();

  await page.goto('/operator');
  await signIn.signOut();

  await page.goto('/account/operator-reset?token=reset-token-1');
  await page.getByTestId('reset-password').fill(NEW_PASSWORD);
  await page.getByTestId('reset-confirm').fill(NEW_PASSWORD);
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-error')).toContainText('Ask your platform admin');

  await page.goto(url);
  await expectNoSeriousAxeViolations(page, 'operator reset page');
  await page.getByTestId('reset-password').fill(NEW_PASSWORD);
  await page.getByTestId('reset-confirm').fill(NEW_PASSWORD);
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();
  await expect(page.getByTestId('reset-to-signin')).toHaveAttribute(
    'href',
    '/account/sign-in?audience=operator',
  );

  await page.goto('/operator');
  await signIn.signIn(OP.username, OP.password);
  await expect(signIn.error).toContainText('Sign-in failed');
  await signIn.signIn(OP.username, NEW_PASSWORD);
  await signIn.expectSignedInAs(OP.username);
});

test('the admin is offered no reset link on its own row', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await seedApprovedOperator(page);

  const ownRow = page.getByTestId('admin-account-row').filter({ hasText: ADMIN.username });
  await expect(ownRow.getByRole('button', { name: 'Reset link' })).toHaveCount(0);
});

test('an operator with a dead link is sent to the admin', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });

  await page.goto('/account/operator-reset');

  await expect(page.getByTestId('reset-no-token')).toContainText('Ask your platform admin');
  await expect(page.getByTestId('reset-to-forgot')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'operator reset page without a token');
});
