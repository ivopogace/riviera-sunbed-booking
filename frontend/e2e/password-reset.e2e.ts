import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockCustomerRecoveryApi } from './support/auth-mocks';

/**
 * Real-render a11y + behaviour audit of the customer password-reset journey: a tourist
 * requests a reset link, follows the (simulated) emailed link to set a new password, and then signs in
 * with the new password while the old one is rejected. A bad/missing token is a clear dead-end. The
 * recovery API is mocked statefully (`support/auth-mocks.ts`), so this runs in CI (`npm run test:e2e:a11y`).
 */

const VALID_TOKEN = 'valid-reset-token';

test('a tourist resets their password from the emailed link and signs in with the new one', async ({
  page,
}) => {
  await mockCustomerRecoveryApi(page, {
    email: 'ana@example.com',
    initialPassword: 'oldpassword1',
    validToken: VALID_TOKEN,
  });

  // Request a reset link: neutral confirmation (reveals nothing about account existence, D-8).
  await page.goto('/account/forgot');
  await expectNoSeriousAxeViolations(page, 'forgot-password page');
  await page.getByTestId('forgot-email').fill('ana@example.com');
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('forgot-sent')).toBeVisible();

  // Follow the emailed link (simulated) and set a new password.
  await page.goto(`/account/reset?token=${VALID_TOKEN}`);
  await expectNoSeriousAxeViolations(page, 'reset-password page');
  await page.getByTestId('reset-password').fill('brandnewpass2');
  await page.getByTestId('reset-confirm').fill('brandnewpass2');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();

  // Sign in: the OLD password is now rejected, the NEW one works.
  await page.goto('/account/sign-in');
  await page.getByTestId('auth-identifier').fill('ana@example.com');
  await page.getByTestId('auth-password').fill('oldpassword1');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();

  await page.getByTestId('auth-password').fill('brandnewpass2');
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/$/); // signed in → navigated home
});

test('a mismatched confirmation and an invalid token are clear dead-ends', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: 'ana@example.com',
    initialPassword: 'oldpassword1',
    validToken: VALID_TOKEN,
  });

  // Missing token → no form, a pointer back to requesting a link.
  await page.goto('/account/reset');
  await expect(page.getByTestId('reset-no-token')).toBeVisible();

  // Mismatched confirmation is caught client-side before any request.
  await page.goto(`/account/reset?token=${VALID_TOKEN}`);
  await page.getByTestId('reset-password').fill('brandnewpass2');
  await page.getByTestId('reset-confirm').fill('different-2');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-error')).toContainText('do not match');

  // A wrong/expired token → the neutral invalid-token message.
  await page.goto('/account/reset?token=wrong-token');
  await page.getByTestId('reset-password').fill('brandnewpass2');
  await page.getByTestId('reset-confirm').fill('brandnewpass2');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-error')).toContainText('invalid or has expired');
});
