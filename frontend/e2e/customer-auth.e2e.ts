import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockCustomerAuthApi } from './support/auth-mocks';
import { CustomerAuthPage } from './support/pages/customer-auth.page';

/**
 * Real-render a11y + behaviour audit of the customer auth flow (S2 #111, epic #108, AC-11): register
 * from the header → auto-signed-in state that SURVIVES a reload (restored from `GET /api/auth/me`,
 * never a held credential — D-1) → sign out returns to the signed-out header; and a returning tourist
 * signs in, with a wrong password answered by one generic message (no enumeration — D-8). The auth API
 * is mocked statefully (`support/auth-mocks.ts`), so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). Selectors live in the Page Object (`support/pages/customer-auth.page.ts`).
 */

test('a tourist registers, stays signed in across a reload, and signs out', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'password123' });
  const auth = new CustomerAuthPage(page);

  await page.goto('/');
  await auth.expectSignedOut(); // header offers Sign in / Register

  // Register a fresh account from the header.
  await auth.gotoRegister();
  await expect(page).toHaveURL(/\/account\/register$/);
  await expectNoSeriousAxeViolations(page, 'register page');

  await auth.register('ana@example.com', 'password123');

  // Fresh email → auto-signed-in; the header (having navigated home) reflects it.
  await auth.expectSignedInAs('ana@example.com');

  // Reload: no credential is held in the browser — the state comes back from GET /api/auth/me.
  await page.reload();
  await auth.expectSignedInAs('ana@example.com');
  await expectNoSeriousAxeViolations(page, 'signed-in header after reload');

  // Sign out: the server session dies and the header returns to Sign in / Register.
  await auth.signOut();
  await auth.expectSignedOut();
});

test('a returning tourist signs in; a wrong password is a generic failure (D-8)', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'password123' });
  const auth = new CustomerAuthPage(page);

  await page.goto('/');
  await auth.gotoSignIn();
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expectNoSeriousAxeViolations(page, 'sign-in page');

  // Wrong password: server-validated, generic (no enumeration), accessible — and no navigation.
  await auth.signIn('ana@example.com', 'wrong-pw');
  await expect(auth.error).toContainText('Sign-in failed');
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expectNoSeriousAxeViolations(page, 'generic sign-in failure');

  // Right password: the session is established and the header flips.
  await auth.signIn('ana@example.com', 'password123');
  await auth.expectSignedInAs('ana@example.com');
});
