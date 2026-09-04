import { expect, test } from '@playwright/test';

import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';

/**
 * Widget-against-verifier on the two auth forms fenced after customer register: an operator
 * self-registers and a tourist requests a password reset, each by solving a REAL challenge in
 * Chromium — the endpoint mints it with the platform's HMAC secret at the shipped `cost`, the
 * widget's Web Workers brute-force it, and the edge verifies the solution and claims its nonce in
 * Postgres before the write. Nothing is mocked. Unique values per run, so a re-run never collides
 * with an earlier row.
 *
 * <p>The tourist register's own real-challenge proof is `register.e2e.ts`.
 */

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

test('an operator self-registers by solving a real proof-of-work challenge', async ({ page }) => {
  const auth = new OperatorSignInPage(page);
  const username = unique('e2e-op');

  await auth.gotoRegister();
  await expect(auth.challengeWidget).toBeVisible();

  await auth.username.focus();
  await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 30_000 });

  await auth.register(username, 'fresh-venue-pw-1', `${username}@venue.example`);

  // The 202 is session-less; the unfenced auto-sign-in that follows lands the PENDING operator.
  await expect(page).toHaveURL(/\/operator/, { timeout: 30_000 });
  await expect(page.getByTestId('auth-error')).toHaveCount(0);
});

test('a tourist requests a password reset by solving a real proof-of-work challenge', async ({
  page,
}) => {
  await page.goto('/account/forgot');
  await expect(page.getByTestId('challenge-widget')).toBeVisible();

  await page.getByTestId('forgot-email').focus();
  await expect(page.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
    timeout: 30_000,
  });

  // A neutral 204 either way (D-8), so an address with no account proves the fence, not the account.
  await page.getByTestId('forgot-email').fill(`${unique('e2e-forgot')}@example.com`);
  await page.getByTestId('forgot-submit').click();

  await expect(page.getByTestId('forgot-sent')).toContainText('If an account exists');
  await expect(page.getByTestId('forgot-error')).toHaveCount(0);
});
