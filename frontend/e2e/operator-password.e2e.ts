import { expect, test } from '@playwright/test';

import { mockAuthApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render CI-safe e2e for the operator's self-service password change. Drives the
 * whole gesture the way an operator meets it — sign in, reach the page from the console header link
 * rather than a typed URL, get the wrong current password wrong, then succeed — and then proves the
 * rotation was REAL by signing out and showing that only the new credential gets back in. The auth
 * API is mocked statefully (`support/auth-mocks.ts`), which is what lets the old/new password
 * assertion mean something; the same discipline the password-reset spec uses.
 *
 * <p>The bootstrap admin's refusal gets its own test: it is the one branch with no customer
 * analogue, and the point of rendering it (rather than hiding the link) is that the operator is
 * TOLD why — which only a real-render spec can check.
 */

const OLD_PASSWORD = 'old-operator-pw';
const NEW_PASSWORD = 'brand-new-operator-pw';

test('operator changes its own password from the console, and the new credential replaces the old', async ({
  page,
}) => {
  await mockAuthApi(page, { validPassword: OLD_PASSWORD });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', OLD_PASSWORD);
  await signIn.expectSignedInAs('operator');

  // The entry point is the console header link — not a URL only a maintainer would know.
  await page.getByTestId('oc-change-password').click();
  await expect(page.getByTestId('oppw-username')).toContainText('operator');
  await expectNoSeriousAxeViolations(page, 'operator change-password form');

  // Wrong current password: a named error, and nothing is rotated.
  await page.getByTestId('oppw-current').fill('not-my-password');
  await page.getByTestId('oppw-new').fill(NEW_PASSWORD);
  await page.getByTestId('oppw-submit').click();
  await expect(page.getByTestId('oppw-error')).toContainText('current password is incorrect');
  await expect(page.getByTestId('oppw-notice')).toHaveText('');
  await expectNoSeriousAxeViolations(page, 'wrong current password');

  // Right current password: the confirmation must name the other-devices sign-out.
  await page.getByTestId('oppw-current').fill(OLD_PASSWORD);
  await page.getByTestId('oppw-new').fill(NEW_PASSWORD);
  await page.getByTestId('oppw-submit').click();
  await expect(page.getByTestId('oppw-notice')).toContainText(
    'Any other devices signed in as you have been signed out',
  );
  await expect(page.getByTestId('oppw-error')).toHaveText('');
  await expectNoSeriousAxeViolations(page, 'password changed');

  // Both secrets are cleared from the DOM once the change lands.
  await expect(page.getByTestId('oppw-current')).toHaveValue('');
  await expect(page.getByTestId('oppw-new')).toHaveValue('');

  // The session doing the change SURVIVES — the revocation targets every other session, not this one.
  await page.getByTestId('oppw-to-console').click();
  await expect(page.getByTestId('oc-signed-in-as')).toContainText('operator');

  // And the rotation was real: after signing out, only the new password gets back in.
  await page.getByTestId('oc-signout').click();
  await signIn.expectSignedOut();

  await signIn.signIn('operator', OLD_PASSWORD);
  await expect(signIn.error).toContainText('Sign-in failed');

  await signIn.signIn('operator', NEW_PASSWORD);
  await signIn.expectSignedInAs('operator');
});

test('the env-managed bootstrap admin is told why it cannot self-serve', async ({ page }) => {
  await mockAuthApi(page, { validPassword: OLD_PASSWORD, envManaged: true });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', OLD_PASSWORD);
  await signIn.expectSignedInAs('operator');

  await page.getByTestId('oc-change-password').click();
  await page.getByTestId('oppw-current').fill(OLD_PASSWORD);
  await page.getByTestId('oppw-new').fill(NEW_PASSWORD);
  await page.getByTestId('oppw-submit').click();

  await expect(page.getByTestId('oppw-error')).toContainText(
    'managed by the deployment environment',
  );
  await expect(page.getByTestId('oppw-notice')).toHaveText('');
  await expectNoSeriousAxeViolations(page, 'bootstrap admin refusal');
});
