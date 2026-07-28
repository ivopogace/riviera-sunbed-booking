import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockCustomerRecoveryApi } from './support/auth-mocks';

/**
 * Real-render a11y + behaviour audit of the customer email-verification journey (S8 #113, AC-12):
 * following the emailed verification link marks the email verified; a bad/expired link is a clear
 * dead-end. The verification is a POST the page issues on load (the link itself is a plain GET — an
 * email scanner prefetching it never consumes the single-use token, R-6). The recovery API is mocked
 * statefully, so this runs in CI (`npm run test:e2e:a11y`).
 *
 * The two resend tests are AC-8 of #400: the account page must not tell an unverified customer a mail
 * is on its way when the do-not-email list withheld it. Each asserts both halves — the right copy
 * appears AND the other one is absent — because a caveat bolted onto "sent" would be the same lie.
 */

const VALID_TOKEN = 'valid-verify-token';
const EMAIL = 'ana@example.com';
const PASSWORD = 'password123';

test('following the verification link verifies the email', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: PASSWORD,
    validToken: VALID_TOKEN,
  });

  await page.goto(`/account/verify?token=${VALID_TOKEN}`);
  await expect(page.getByTestId('verify-success')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'email verified page');
});

test('the resend says no email was sent when the address is suppressed', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: PASSWORD,
    signedIn: true,
    emailVerified: false,
    verificationMailWithheld: true,
  });

  await page.goto('/account/password');
  await page.getByTestId('setpw-resend').click();

  await expect(page.getByTestId('setpw-notice')).toContainText("couldn't send");
  await expect(page.getByTestId('setpw-notice')).not.toContainText('Verification email sent');
  await expectNoSeriousAxeViolations(page, 'account page with a withheld verification email');
});

test('the resend keeps the sent copy for a deliverable address', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: PASSWORD,
    signedIn: true,
    emailVerified: false,
  });

  await page.goto('/account/password');
  await page.getByTestId('setpw-resend').click();

  await expect(page.getByTestId('setpw-notice')).toContainText('Verification email sent. Check your inbox.');
});

test('an invalid or missing verification link is a clear dead-end', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: PASSWORD,
    validToken: VALID_TOKEN,
  });

  await page.goto('/account/verify?token=wrong-token');
  await expect(page.getByTestId('verify-failed')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'verification failed page');

  await page.goto('/account/verify'); // no token
  await expect(page.getByTestId('verify-failed')).toBeVisible();
});
