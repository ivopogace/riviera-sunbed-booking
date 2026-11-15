import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import { mockAuthApi } from './support/auth-mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Mocked (CI-safe) operator SSO, link-only (#276): an unlinked Google identity is refused on the operator tab
 * with no session; a signed-in operator links Google from the password page with its current password, then
 * signs in with it and lands in its console; unlinking hands the provider back. The IdP round trip is
 * collapsed into one 302 by `support/auth-mocks.ts`, as the backend completes it server-side.
 */

const USERNAME = 'sereno';
const PASSWORD = 'good-operator-pw';

test('an operator links Google from the console, then signs in with it', async ({
  page,
  baseURL,
}) => {
  await mockAuthApi(page, { username: USERNAME, validPassword: PASSWORD, ssoBaseURL: baseURL! });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await page.getByTestId('sso-google').click();
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator&sso=failed$/);
  await expect(page.getByTestId('auth-error')).toContainText("isn't linked to an operator account");
  await expectNoSeriousAxeViolations(page, 'operator tab after a refused SSO sign-in');

  await signIn.signIn(USERNAME, PASSWORD);
  await expect(page).toHaveURL(/\/operator\/1\/daily$/);

  await page.goto('/account/operator-password');
  await expect(page.getByTestId('osm-link-google')).toBeVisible();
  await page.getByTestId('osm-link-google').click();
  await expect(page.getByTestId('osm-error')).toContainText('current password');
  await page.getByTestId('osm-current').fill('not-my-password');
  await page.getByTestId('osm-link-google').click();
  await expect(page.getByTestId('osm-error')).toContainText('incorrect');

  await page.getByTestId('osm-current').fill(PASSWORD);
  await page.getByTestId('osm-link-google').click();
  await expect(page).toHaveURL(/\/account\/operator-password\?sso=linked$/);
  await expect(page.getByTestId('osm-notice')).toContainText('Linked.');
  await expect(page.getByTestId('osm-unlink-google')).toBeVisible();
  await expect(page.getByTestId('osm-link-apple')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'operator sign-in methods after a link');

  await signIn.signOut();
  await signIn.goto();
  await page.getByTestId('sso-google').click();
  await expect(page).toHaveURL(/\/operator\/1\/daily$/);
  await signIn.expectSignedInAs(USERNAME);
});

test('unlinking hands the provider back to the link button', async ({ page, baseURL }) => {
  await mockAuthApi(page, { username: USERNAME, validPassword: PASSWORD, ssoBaseURL: baseURL! });
  const signIn = new OperatorSignInPage(page);
  await signIn.goto();
  await signIn.signIn(USERNAME, PASSWORD);
  await expect(page).toHaveURL(/\/operator\/1\/daily$/);
  await page.goto('/account/operator-password');
  await page.getByTestId('osm-current').fill(PASSWORD);
  await page.getByTestId('osm-link-apple').click();
  await expect(page.getByTestId('osm-unlink-apple')).toBeVisible();

  await page.getByTestId('osm-unlink-apple').click();

  await expect(page.getByTestId('osm-notice')).toContainText('signed out');
  await expect(page.getByTestId('osm-link-apple')).toBeVisible();
});
