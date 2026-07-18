import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockCustomerRecoveryApi } from './support/auth-mocks';

/**
 * Real-render a11y + behaviour audit of the customer email-verification journey (S8 #113, AC-12):
 * following the emailed verification link marks the email verified; a bad/expired link is a clear
 * dead-end. The verification is a POST the page issues on load (the link itself is a plain GET — an
 * email scanner prefetching it never consumes the single-use token, R-6). The recovery API is mocked
 * statefully, so this runs in CI (`npm run test:e2e:a11y`).
 */

const VALID_TOKEN = 'valid-verify-token';

test('following the verification link verifies the email', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: 'ana@example.com',
    initialPassword: 'password123',
    validToken: VALID_TOKEN,
  });

  await page.goto(`/account/verify?token=${VALID_TOKEN}`);
  await expect(page.getByTestId('verify-success')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'email verified page');
});

test('an invalid or missing verification link is a clear dead-end', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: 'ana@example.com',
    initialPassword: 'password123',
    validToken: VALID_TOKEN,
  });

  await page.goto('/account/verify?token=wrong-token');
  await expect(page.getByTestId('verify-failed')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'verification failed page');

  await page.goto('/account/verify'); // no token
  await expect(page.getByTestId('verify-failed')).toBeVisible();
});
