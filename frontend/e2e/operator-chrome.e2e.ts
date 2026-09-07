import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi, mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { openOperatorAccountMenu } from './support/shell';
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

  // The operator header: brand + the account chip, whose popover holds the rows (Admin console: admin).
  await expect(page.getByTestId('opc-header')).toBeVisible();
  await expect(page.getByTestId('opc-account')).toHaveAccessibleName(`Account: ${ADMIN.username}`);
  await expect(page.getByTestId('opc-header')).not.toContainText('Signed in as');
  await openOperatorAccountMenu(page, 'opc');
  await expect(page.getByTestId('opc-account-identity')).toContainText(
    `Signed in as ${ADMIN.username}`,
  );
  await expect(page.getByTestId('opc-account-menu').getByRole('link')).toHaveText([
    'Admin console',
    'Change password',
  ]);
  await expect(page.getByTestId('opc-admin-link')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('opc-signout')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('opc-account-menu')).toHaveCount(0);

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
  await expect(page.getByTestId('opc-account')).toBeVisible();

  await openOperatorAccountMenu(page, 'opc');
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

  // Both sign-in links carry the operator audience AND the page as returnUrl (returnUrl outranks all).
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

test('the account chip opens a popover on /admin and on the landing — axe clean, one header row on a phone (#1008)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockOwnedVenues(page, [
    { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
    { id: 2, name: 'Sunset Lido', beach: 'Dhërmi' },
  ]);
  await page.setViewportSize({ width: 390, height: 780 });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);

  // One row: the brand and the chip share it.
  const brand = (await page.getByTestId('opc-brand').boundingBox())!;
  const chip = page.getByTestId('opc-account');
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.y).toBeLessThan(brand.y + brand.height);
  expect(chipBox.y + chipBox.height).toBeGreaterThan(brand.y);
  // A second row would add at least the chip's 44px floor; one row stays under 80.
  const header = (await page.getByTestId('opc-header').boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(80);

  await openOperatorAccountMenu(page, 'opc');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'admin tab with the account popover open');

  // The landing (the venue picker, two venues) wears the same chrome and the same chip.
  await page.getByTestId('opc-account-backdrop').click();
  await expect(page.getByTestId('opc-account-menu')).toHaveCount(0);
  await expect(chip).toBeFocused();
  await page.goto('/operator');
  await expect(page.getByTestId('opc-header')).toBeVisible();
  await openOperatorAccountMenu(page, 'opc');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator landing with the account popover open');
});
