import { expect, test } from '@playwright/test';

import { CustomerAuthPage } from '../support/pages/customer-auth.page';
import { uniqueSuffix } from './support/operator';

/**
 * The one end-to-end proof of widget-against-verifier: a tourist registers on the real backend by
 * solving a REAL challenge in Chromium — the endpoint mints it with the platform's HMAC secret at
 * the shipped `cost`, the widget's Web Workers brute-force it, and the edge verifies the solution,
 * claims its nonce in Postgres and creates the account. Nothing is mocked. A unique email per run,
 * so a re-run never collides with an earlier row's "already registered" branch.
 */
test('a tourist registers by solving a real proof-of-work challenge', async ({ page }) => {
  const auth = new CustomerAuthPage(page);
  const email = `e2e-register-${uniqueSuffix()}@example.com`;

  await page.goto('/account/sign-in?mode=register');
  await expect(auth.challengeWidget).toBeVisible();

  await auth.email.focus();
  await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 30_000 });

  await auth.register(email, 'passphrase-123');
  await auth.expectSignedInAs(email);

  // A reload restores the session from the server, never from a held credential or solution.
  await page.reload();
  await auth.expectSignedInAs(email);
});
