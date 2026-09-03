import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

import {
  mockAuthApi,
  mockCustomerAuthApi,
  mockOperatorLifecycleApi,
  mockOwnedVenues,
} from './support/auth-mocks';
import { CustomerAuthPage } from './support/pages/customer-auth.page';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The unified auth card — all four flows on one surface, plus the operator landing
 * rules. Replaces the four retired specs' coverage of `auth/sign-in`, `auth/register` and
 * `operator/operator-register`, which no longer exist as pages.
 *
 * The auth API is mocked statefully (`support/auth-mocks.ts`), so the spec is self-contained and
 * runs in CI (`npm run test:e2e:a11y`). Selectors live in the two Page Objects.
 */

const AUTH_URL = /\/account\/sign-in/;

test('the audience toggle is a keyboard-operable radiogroup', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
  await page.goto('/account/sign-in');

  const options = page.getByRole('radio');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('auth-identifier-label')).toHaveText('Email');

  // Arrow keys move selection AND focus — the radiogroup pattern, not a plain button row.
  await options.first().focus();
  await page.keyboard.press('ArrowRight');

  await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(options.nth(1)).toBeFocused();
  await expect(page.getByTestId('auth-identifier-label')).toHaveText('Username');

  await expectNoSeriousAxeViolations(page, 'unified auth card — operator tab');
});

test('a tourist signs in from the unified card; a wrong password is generic (D-8)', async ({
  page,
}) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
  const auth = new CustomerAuthPage(page);

  await page.goto('/account/sign-in');
  await expectNoSeriousAxeViolations(page, 'unified auth card — tourist sign-in');

  await auth.signIn('ana@example.com', 'wrong-pw');
  await expect(auth.error).toContainText('Sign-in failed');
  await expect(page).toHaveURL(AUTH_URL); // no navigation on failure

  await auth.signIn('ana@example.com', 'passphrase-123');
  await auth.expectSignedInAs('ana@example.com');
  await expect(page).toHaveURL(/\/$/); // tourists land on Discover
});

test('a tourist registers from the same card and is signed in', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
  const auth = new CustomerAuthPage(page);

  await page.goto('/account/sign-in?mode=register');
  await expectNoSeriousAxeViolations(page, 'unified auth card — tourist register');

  await auth.register('ana@example.com', 'passphrase-123');

  await auth.expectSignedInAs('ana@example.com');
  await expect(page).toHaveURL(/\/$/);
});

test('the header Register / Sign-in links switch the card mode via soft nav (#300)', async ({
  page,
}) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });

  await page.goto('/account/sign-in');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  // A query-param-only soft nav (NOT a fresh page load): the reused component must still switch.
  await page.getByTestId('nav-register').click();
  await expect(page).toHaveURL(/\/account\/sign-in\?mode=register$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'unified auth card — register via header link');

  // Symmetric: the header Sign-in link returns to the sign-in view.
  await page.getByTestId('nav-signin').click();
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('an operator signs in and lands in its only venue’s console', async ({ page }) => {
  await mockAuthApi(page, {
    validPassword: 'good-pw',
    venues: [{ id: 7, name: 'Sereno', beach: 'Jal' }],
  });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.expectSignedOut();

  await signIn.signIn('operator', 'wrong-pw');
  await expect(signIn.error).toContainText('Sign-in failed');
  await expect(page).toHaveURL(AUTH_URL);

  await signIn.signIn('operator', 'good-pw');
  // Exactly one owned venue skips the picker entirely.
  await expect(page).toHaveURL(/\/operator\/7/);
});

test('a multi-venue operator picks a venue on the /operator home', async ({ page }) => {
  await mockAuthApi(page, {
    validPassword: 'good-pw',
    venues: [
      { id: 7, name: 'Sereno', beach: 'Jal' },
      { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
    ],
  });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');

  await expect(page).toHaveURL(/\/operator$/);
  const picker = page.getByTestId('operator-home-picker');
  await expect(picker).toContainText('Sereno');
  await expect(picker).toContainText('Miramar Beach Club');
  await expectNoSeriousAxeViolations(page, 'operator venue picker');

  await picker.getByRole('link', { name: /Miramar/ }).click();
  await expect(page).toHaveURL(/\/operator\/12/);
});

test('an operator with no venue lands on the inline create form (#278)', async ({ page }) => {
  await mockAuthApi(page, { validPassword: 'good-pw', venues: [] });
  const signIn = new OperatorSignInPage(page);

  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');

  await expect(page).toHaveURL(/\/operator$/);
  await expect(page.getByTestId('venue-create-card')).toBeVisible();
});

test('a returnUrl outranks the venue-count rule', async ({ page }) => {
  await mockAuthApi(page, {
    validPassword: 'good-pw',
    venues: [{ id: 7, name: 'Sereno', beach: 'Jal' }],
  });
  const signIn = new OperatorSignInPage(page);

  // What the guard produces when an operator deep-links into a console tab while signed out.
  await signIn.goto('/operator/12/payouts');
  await signIn.signIn('operator', 'good-pw');

  await expect(page).toHaveURL(/\/operator\/12\/payouts/);
});

test('an operator registration auto-signs-in and lands under the pending notice', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: { username: 'admin', password: 'admin-pw' } });

  await page.goto('/account/sign-in?audience=operator&mode=register');

  await page.getByLabel('Username', { exact: true }).fill('sereno');
  await page.getByLabel('Contact email', { exact: true }).fill('ops@sereno.al');
  await page.getByLabel('Password', { exact: true }).fill('passphrase-123');
  await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();

  // The 202 is session-less; the card then signs in with the same credentials and lands us home.
  await expect(page).toHaveURL(/\/operator$/);
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'operator home after register auto-sign-in');
});

test('the retired auth routes still land somewhere live', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
  await mockOwnedVenues(page, []);

  await page.goto('/account/register');
  await expect(page).toHaveURL(/\/account\/sign-in\?mode=register$/);
  await expect(page.getByTestId('auth-form')).toBeVisible();

  await page.goto('/operator/register');
  await expect(page).toHaveURL(/audience=operator&mode=register$/);
  await expect(page.getByTestId('auth-identifier-label')).toHaveText('Username');
});

test('an operator surface visited while signed out redirects to the operator tab', async ({
  page,
}) => {
  await mockAuthApi(page, { validPassword: 'good-pw' });

  await page.goto('/operator/12/payouts');

  // The guard awaits the session restore before deciding, then redirects with the return address.
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator&returnUrl=/);
  await expect(page.getByTestId('auth-identifier-label')).toHaveText('Username');
});
