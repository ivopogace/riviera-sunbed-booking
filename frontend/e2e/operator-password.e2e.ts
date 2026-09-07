import { expect, test } from '@playwright/test';

import { mockAuthApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { openOperatorAccountMenu } from './support/shell';

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
 *
 * <p>It also carries a margin assertion on the silent notice, which looks out of place and is not:
 * `cls.notice` used to end in `empty:mb-0`, and #828 deleted it as **dead code, not a restyle**.
 * Angular leaves a whitespace text node inside an interpolated `<p>`, and `:empty` matches only an
 * element whose children are all *empty* text nodes — so the utility never once applied. No unit
 * spec can pin that: jsdom's nwsapi and Chromium disagree about `:empty` in opposite directions
 * (nwsapi calls a zero-length text node non-empty; Chromium calls it empty). Only a real render
 * settles it, so the proof that the margin did not move lives here.
 */

const OLD_PASSWORD = 'old-operator-pw';
const NEW_PASSWORD = 'brand-new-console-pw';

test('operator changes its own password from the console, and the new credential replaces the old', async ({
  page,
}) => {
  await mockAuthApi(page, { validPassword: OLD_PASSWORD });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', OLD_PASSWORD);
  await signIn.expectSignedInAs('operator');

  // The entry point is the console header's account chip — not a URL only a maintainer would know.
  await openOperatorAccountMenu(page);
  await page.getByTestId('oc-change-password').click();
  await expect(page.getByTestId('oppw-username')).toContainText('operator');
  // On the page itself, the same shell's chip marks the row as the current page.
  await openOperatorAccountMenu(page);
  await expect(page.getByTestId('oc-change-password')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('oc-account-menu').locator('[aria-current="page"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);
  // Pins the deleted `empty:mb-0` as a no-op, not a restyle (#828) — see this file's header.
  await expect(page.getByTestId('oppw-notice')).toHaveCSS('margin-bottom', '20px');
  await expectNoSeriousAxeViolations(page, 'operator change-password form');

  // Wrong current password: a named error, and nothing is rotated.
  await page.getByTestId('oppw-current').fill('not-my-password');
  await page.getByTestId('oppw-new').fill(NEW_PASSWORD);
  await page.getByTestId('oppw-submit').click();
  await expect(page.getByTestId('oppw-error')).toContainText('current password is incorrect');
  await expect(page.getByTestId('oppw-notice')).toHaveText('');
  // RV-FE-9 in a real browser: the failure arm keeps focus off the silent notice above the form.
  await expect(page.getByTestId('oppw-error')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'wrong current password');

  // Right current password: the confirmation must name the other-devices sign-out.
  await page.getByTestId('oppw-current').fill(OLD_PASSWORD);
  await page.getByTestId('oppw-new').fill(NEW_PASSWORD);
  await page.getByTestId('oppw-submit').click();
  await expect(page.getByTestId('oppw-notice')).toContainText(
    'Any other devices signed in as you have been signed out',
  );
  await expect(page.getByTestId('oppw-error')).toHaveCount(0);
  await expect(page.getByTestId('oppw-notice')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'password changed');

  // Both secrets are cleared from the DOM once the change lands.
  await expect(page.getByTestId('oppw-current')).toHaveValue('');
  await expect(page.getByTestId('oppw-new')).toHaveValue('');

  // The session doing the change SURVIVES — the revocation targets every other session, not this one.
  await page.getByTestId('oppw-to-console').click();
  await expect(page.getByTestId('oc-account')).toHaveAccessibleName('Account: operator');

  // And the rotation was real: after signing out, only the new password gets back in.
  await openOperatorAccountMenu(page);
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

  await openOperatorAccountMenu(page);
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
