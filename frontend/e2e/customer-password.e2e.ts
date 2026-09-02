import { expect, test, type Page } from '@playwright/test';

import { openAccountMenu } from './support/shell';
import { mockCustomerRecoveryApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render CI-safe e2e for the signed-in customer's set/change-password page. It proves the rotation is
 * REAL the way the reset, verify and operator-password specs do: after a successful change, sign out and
 * show that only the new password gets back in. The four failure branches each get their own render — a
 * wrong current password, a current password omitted by an account that has one (`MISSING_CURRENT_PASSWORD`
 * — the branch this page alone can reach, since it cannot know whether the account has a local password), a
 * password under the policy minimum (caught client-side, so no request at all), and the 429 from the
 * change-password budget.
 *
 * <p>The SSO-only account is the second test because it is why this page exists — an account signed up via
 * a provider has no local credential: it sets its first password with the current-password field left blank.
 *
 * <p>The auth API is mocked statefully (`support/auth-mocks.ts`), which is what makes the old/new password
 * assertions mean something. The page has an in-app entry point, so the spec reaches it the way
 * a tourist does — through the header's account menu — rather than by URL.
 */

const EMAIL = 'ana@example.com';
const OLD_PASSWORD = 'old-customer-pw';
const NEW_PASSWORD = 'brand-new-customer-pw';

/** Sign in through the unified auth card; a signed-in tourist lands back on Discover. */
async function signIn(page: Page, password: string): Promise<void> {
  await page.goto('/account/sign-in');
  await page.getByTestId('auth-identifier').fill(EMAIL);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
}

/** Reach the account page through the shell's account menu, not by URL. */
async function gotoAccount(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByTestId('nav-account-link').click();
}

/** Sign out — the control lives inside the account menu. */
async function signOut(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByTestId('nav-signout').click();
}

test('a signed-in tourist changes their password, and the new credential replaces the old', async ({
  page,
}) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
  });

  await signIn(page, OLD_PASSWORD);
  // Let the post-sign-in redirect land first: its NavigationEnd closes any menu opened before it.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);

  await gotoAccount(page);
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
  await signOut(page);
  await expect(page.getByTestId('nav-signin')).toBeVisible();

  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('auth-error')).toBeVisible();

  await signIn(page, NEW_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});

test('an SSO-only account sets its first password with no current password', async ({ page }) => {
  // No initialPassword: the SSO-only case — signed in via a provider, no local credential to prove.
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    signedIn: true,
    emailVerified: true,
  });

  let setPasswordRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/me/password')) {
      setPasswordRequests += 1;
    }
  });

  await page.goto('/');
  await gotoAccount(page);
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
  await signOut(page);
  await expect(page.getByTestId('nav-signin')).toBeVisible();

  await signIn(page, NEW_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});

test('a blank current password is reported as missing, not incorrect', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
    signedIn: true,
  });

  await page.goto('/');
  await gotoAccount(page);

  // This account has a password, so the blank field is an omission the server must name, not a wrong guess.
  await page.getByTestId('setpw-new').fill(NEW_PASSWORD);
  await page.getByTestId('setpw-submit').click();
  await expect(page.getByTestId('setpw-error')).toContainText('Enter your current password.');
  await expect(page.getByTestId('setpw-notice')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'omitted current password');

  // And nothing rotated: the original password still signs in.
  await signOut(page);
  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});

test('an exhausted change-password budget renders the rate-limit message', async ({ page }) => {
  // One attempt allowed, so the second meets the per-IP budget the way a flood would.
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: OLD_PASSWORD,
    signedIn: true,
    passwordChangeBudget: 1,
  });

  await page.goto('/');
  await gotoAccount(page);
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
  await signOut(page);
  await signIn(page, OLD_PASSWORD);
  await expect(page.getByTestId('nav-user')).toContainText(EMAIL);
});
