import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockCustomerSsoApi } from './support/auth-mocks';
import { CustomerAuthPage } from './support/pages/customer-auth.page';

/**
 * Mocked (CI-safe) audit of the customer SSO flow (S4 #112, AC-6): the "Continue with Google / Continue
 * with Apple" buttons on the sign-in and register cards run the redirect/callback dance through to a
 * signed-in tourist — a different provider signs in as a different account. The SSO API is mocked
 * statefully (`support/auth-mocks.ts`) — the button's real full-page navigation is intercepted and 302'd
 * back to the SPA root, exactly as the backend would. Runs in CI via `npm run test:e2e:a11y`.
 */

const GOOGLE_EMAIL = 'google.tourist@example.com';
const APPLE_EMAIL = 'apple.tourist@example.com';

test('Continue with Google signs the tourist in from the sign-in card', async ({ page, baseURL }) => {
  await mockCustomerSsoApi(page, { baseURL: baseURL!, google: GOOGLE_EMAIL, apple: APPLE_EMAIL });
  const auth = new CustomerAuthPage(page);

  await page.goto('/');
  await auth.gotoSignIn();
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  // The SSO buttons must not introduce an a11y regression on the card.
  await expectNoSeriousAxeViolations(page, 'sign-in page with SSO buttons');

  await auth.continueWithGoogle();

  await auth.expectSignedInAs(GOOGLE_EMAIL);
});

test('Continue with Apple signs the tourist in from the register card', async ({ page, baseURL }) => {
  await mockCustomerSsoApi(page, { baseURL: baseURL!, google: GOOGLE_EMAIL, apple: APPLE_EMAIL });
  const auth = new CustomerAuthPage(page);

  await page.goto('/');
  await auth.gotoRegister();
  await expect(page).toHaveURL(/\/account\/sign-in\?mode=register$/);
  await expectNoSeriousAxeViolations(page, 'register page with SSO buttons');

  await auth.continueWithApple();

  await auth.expectSignedInAs(APPLE_EMAIL);
});
