import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render coverage of the shared operator/admin shell chrome: every operator surface outside
 * the venue console (`/admin` tabs, venue onboarding, the password change) renders the porcelain
 * operator header + the shell footer — never the TOURIST header, whose auth state is the customer
 * session and so read "Sign in / Register" to a signed-in admin, and never no chrome at all (the
 * pre-fix `/account/operator-password`). APIs are mocked, so the suite is CI-safe.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

test('an admin on /admin gets the operator header + footer, not the tourist chrome', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);

  // The operator header: brand, session state, sign-out — and the Admin link, since this is an admin.
  await expect(page.getByTestId('opc-header')).toBeVisible();
  await expect(page.getByTestId('opc-signed-in-as')).toContainText(ADMIN.username);
  await expect(page.getByTestId('opc-admin-link')).toBeVisible();
  await expect(page.getByTestId('opc-signout')).toBeVisible();

  // The tourist chrome is gone: no tourist header, no customer "Register" link lying about the session.
  await expect(page.locator('.riv-header')).toHaveCount(0);
  await expect(page.getByTestId('nav-register')).toHaveCount(0);

  // The shell footer stays, porcelain-toned under the subtree pin.
  await expect(page.locator('.riv-footer')).toContainText('© Riviera Sunbed Booking');
  await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');

  await expectNoSeriousAxeViolations(page, 'admin page under the operator chrome');
});

test('the previously chromeless password page now carries the operator header + footer', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await new OperatorSignInPage(page).goto('/account/operator-password');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/account\/operator-password$/);

  await expect(page.getByTestId('opc-header')).toBeVisible();
  await expect(page.locator('.riv-footer')).toContainText('© Riviera Sunbed Booking');

  await expectNoSeriousAxeViolations(page, 'operator password page under the operator chrome');
});

test('Sign out in the operator header ends the session and lands on the operator sign-in', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('opc-signout')).toBeVisible();

  await page.getByTestId('opc-signout').click();

  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator/);
  // Back on the auth card, with the operator tab preselected.
  await expect(page.getByRole('radio', { name: 'Venue operator' })).toBeChecked();
});

test('a signed-out visitor on /admin is offered the operator sign-in from the header', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.goto('/admin');

  // Both sign-in links carry the operator audience AND the page as returnUrl (S9: outranks all).
  await expect(page.getByTestId('opc-signin')).toHaveAttribute(
    'href',
    '/account/sign-in?audience=operator&returnUrl=%2Fadmin',
  );
  await expect(page.getByTestId('admin-ops-signed-out').getByRole('link')).toHaveAttribute(
    'href',
    '/account/sign-in?audience=operator&returnUrl=%2Fadmin',
  );

  await expectNoSeriousAxeViolations(page, 'signed-out admin page under the operator chrome');
});
