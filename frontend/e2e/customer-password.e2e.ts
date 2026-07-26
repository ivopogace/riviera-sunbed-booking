import { expect, test, type Page } from '@playwright/test';

import { mockCustomerRecoveryApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render CI-safe e2e for the signed-in customer's set/change-password page (S8 #113, issue #346) —
 * the last credential-rotation surface with no e2e at all, next to the reset, verify and operator-password
 * specs. It proves the rotation is REAL the way those do: after a successful change, sign out and show that
 * only the new password gets back in. The three failure branches each get their own render — a wrong current
 * password, a password under the policy minimum (caught client-side, so no request at all), and the 429 that
 * #326 made newly reachable and #342 mapped but never rendered.
 *
 * <p>The SSO-only account is the second test because it is why this page exists (closing the S4 F-1 gap):
 * with no stored credential it sets its first password with the current-password field left blank.
 *
 * <p>The auth API is mocked statefully (`support/auth-mocks.ts`), which is what makes the old/new password
 * assertions mean something. The account page has no in-app entry point — the tourist shell links only to
 * sign-out — so, like `erasure.e2e.ts`, the spec navigates to it directly.
 */

const EMAIL = 'ana@example.com';
const OLD_PASSWORD = 'old-customer-pw';
const NEW_PASSWORD = 'brand-new-customer-pw';

/** Sign in through the unified auth card (S9 #277); a signed-in tourist lands back on Discover. */
async function signIn(page: Page, password: string): Promise<void> {
  await page.goto('/account/sign-in');
  await page.getByTestId('auth-identifier').fill(EMAIL);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
}

test('a signed-in tourist changes their password, and the new credential replaces the old', async ({
  page,
}) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
  });

  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);

  await page.goto('/account/password');
  await expect(page.getByTestId('setpw-email')).toContainText(EMAIL);
  await expectNoSeriousAxeViolations(page, 'customer account page');

  // Wrong current password: a named error, and nothing is rotated.
  await page.getByTestId('setpw-current').fill('not-my-password');
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('current password is incorrect');
  await expect(page.getByTestId('setpw-notice')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'wrong current password');

  // Right current password: the change lands and both secrets leave the DOM.
  await page.getByTestId('setpw-current').fill(OLD_PASSWORD);
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-notice')).toContainText('Your password has been saved.');
  await expect(page.getByTestId('setpw-error')).toBeHidden();
  await expect(page.getByTestId('setpw-current')).toHaveValue('');
  await expect(page.getByTestId('setpw-new')).toHaveValue('');
  await expectNoSeriousAxeViolations(page, 'password saved');

  // The session doing the change SURVIVES — the server revokes every OTHER session, not this one.
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);

  // And the rotation was real: after signing out, only the new password gets back in.
  await page.getByTestId('nav-signout').click();
  await expect(page.getByTestId('nav-signin')).toBeVisible();

  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('auth-error')).toBeVisible();

  await signIn(page, NEW_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});

test('an SSO-only account sets its first password with no current password', async ({ page }) => {
  // No initialPassword: the S4 F-1 case — signed in via a provider, no local credential to prove.
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    signedIn: true,
    emailVerified: true,
  });

  let setPasswordRequests = 0;
  page.on('request', (request) => {
    if (/\/api\/me\/password$/.test(request.url())) {
      setPasswordRequests += 1;
    }
  });

  await page.goto('/account/password');
  await expect(page.getByTestId('setpw-verified')).toBeVisible();

  // Under the policy minimum: the client-side guard names the rule and spends no request.
  await page.getByTestId('setpw-new').fill('short');
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('8–72 characters');
  await expect(page.getByTestId('setpw-notice')).toBeHidden();
  expect(setPasswordRequests).toBe(0);
  await expectNoSeriousAxeViolations(page, 'password below the policy minimum');

  // Current password left blank, because there is none to supply.
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-notice')).toContainText('Your password has been saved.');
  expect(setPasswordRequests).toBe(1);

  // The account now has a credential: it signs in where it previously could not.
  await page.getByTestId('nav-signout').click();
  await expect(page.getByTestId('nav-signin')).toBeVisible();

  await signIn(page, NEW_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});

test('an exhausted change-password budget renders the rate-limit message', async ({ page }) => {
  // One attempt allowed, so the second meets the per-IP budget (#326) the way a flood would.
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
    signedIn: true,
    passwordChangeBudget: 1,
  });

  await page.goto('/account/password');
  await page.getByTestId('setpw-current').fill('not-my-password');
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('current password is incorrect');

  // Budget spent: the next attempt is refused before the controller sees it, however valid it is.
  await page.getByTestId('setpw-current').fill(OLD_PASSWORD);
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('Too many attempts');
  await expect(page.getByTestId('setpw-notice')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'rate-limited change attempt');

  // And nothing rotated: the original password still signs in.
  await page.getByTestId('nav-signout').click();
  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});
