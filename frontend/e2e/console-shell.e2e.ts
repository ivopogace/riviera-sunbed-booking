import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi, mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { openOperatorAccountMenu } from './support/shell';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render coverage of the console shell every operator and admin route wears: the section
 * row (brand, the venue switcher as the venue-console section, `Admin` for admins, the account
 * chip or `Sign in`) over the active section's rail, the shell footer, the porcelain pin on the
 * app shell — never the TOURIST header, whose auth state is the customer session and so read
 * "Sign in / Register" to a signed-in admin. APIs are mocked, so the suite is CI-safe. The venue
 * console's own cases are `operator-console.e2e.ts`'s.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const TWO_VENUES = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 2, name: 'Sunset Lido', beach: 'Dhërmi' },
];

test('an admin on /admin gets the section row with Your venues, Admin current and the chip, over the admin rail (#1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockOwnedVenues(page, TWO_VENUES);
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);

  // The section row: brand, the venue switcher reading Your venues, Admin current, the chip.
  const header = page.getByTestId('oc-header');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('oc-brand')).toHaveAttribute('href', '/operator');
  const sections = page.getByRole('navigation', { name: 'Sections' });
  await expect(sections.getByTestId('oc-venue-title')).toHaveText(/Your venues/);
  await expect(page.getByTestId('oc-section-venue')).not.toHaveAttribute('aria-current', 'page');
  await expect(sections.getByTestId('oc-section-admin')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('oc-account')).toHaveAccessibleName(`Account: ${ADMIN.username}`);
  await expect(header).not.toContainText('Signed in as');

  // The admin rail sits under the row, outside the page's 860px section.
  const rail = page.getByRole('navigation', { name: 'Admin console sections' });
  await expect(rail.getByRole('link')).toHaveCount(8);
  await expect(rail.getByRole('link', { name: 'Operators' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const headerBox = (await header.boundingBox())!;
  const railBox = (await rail.boundingBox())!;
  expect(railBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  await expect(rail).toHaveCSS('position', 'static');

  // The venue switcher off the console: the owned list, each row into that console.
  await sections.getByTestId('oc-venue-title').click();
  const rows = page.getByTestId('oc-venue-menu').getByRole('link');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('href', '/operator/1');
  await expect(rows.nth(1)).toHaveAttribute('href', '/operator/2');
  await expect(page.getByTestId('oc-venue-menu').locator('[aria-current="page"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('oc-venue-menu')).toHaveCount(0);

  // The chip: identity, Change password, Sign out — Admin is a section now, not a row.
  await openOperatorAccountMenu(page, 'oc');
  await expect(page.getByTestId('oc-account-identity')).toContainText(
    `Signed in as ${ADMIN.username}`,
  );
  await expect(page.getByTestId('oc-account-menu').getByRole('link')).toHaveText([
    'Change password',
  ]);
  await expect(page.getByTestId('oc-signout')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);

  // The tourist chrome is gone: no tourist header, no customer "Register" link lying about the session.
  await expect(page.locator('.riv-header')).toHaveCount(0);
  await expect(page.getByTestId('nav-register')).toHaveCount(0);

  // The shell footer stays, porcelain-toned under the subtree pin.
  await expect(page.locator('.riv-footer')).toContainText('© Riviera Sunbed Booking');
  await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');
  await expect(page.locator('app-admin-console')).not.toHaveAttribute('data-riv-theme');

  await expectNoSeriousAxeViolations(page, 'admin page under the console shell');
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

test('Sign out from the chip on /admin ends the session and lands on the operator sign-in (#1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('oc-account')).toBeVisible();

  await openOperatorAccountMenu(page, 'oc');
  await page.getByTestId('oc-signout').click();

  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator/);
  // Back on the auth card, with the operator tab preselected.
  await expect(page.getByRole('radio', { name: 'Venue operator' })).toBeChecked();
});

test('a signed-out visitor on /admin/audit sees the section row with Sign in and no tab link anywhere (#1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.goto('/admin/audit');

  // Both sign-in links carry the operator audience AND the page as returnUrl (returnUrl outranks all).
  await expect(page.getByTestId('oc-signin')).toHaveAttribute(
    'href',
    '/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Faudit',
  );
  await expect(page.getByTestId('admin-audit-signed-out').getByRole('link')).toHaveAttribute(
    'href',
    '/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Faudit',
  );
  // Nothing names an admin surface: no rail, no Admin section link, no venue slot, no chip.
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Admin console sections' })).toHaveCount(0);
  await expect(page.getByTestId('oc-section-admin')).toHaveCount(0);
  await expect(page.getByTestId('oc-venue-title')).toHaveCount(0);
  await expect(page.getByTestId('oc-account')).toHaveCount(0);

  await expectNoSeriousAxeViolations(page, 'signed-out admin page under the console shell');
});

test('the account chip opens a popover on /admin — axe clean, one header row on a phone (#1008, #1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockOwnedVenues(page, TWO_VENUES);
  await page.setViewportSize({ width: 390, height: 780 });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);

  // One row: the brand, Your venues, Admin and the chip share it.
  const brand = (await page.getByTestId('oc-brand').boundingBox())!;
  const chip = page.getByTestId('oc-account');
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.y).toBeLessThan(brand.y + brand.height);
  expect(chipBox.y + chipBox.height).toBeGreaterThan(brand.y);
  const admin = (await page.getByTestId('oc-section-admin').boundingBox())!;
  expect(admin.y).toBeLessThan(brand.y + brand.height);
  // A second row would add at least the chip's 44px floor; one row stays under 80.
  const header = (await page.getByTestId('oc-header').boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(80);
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  await openOperatorAccountMenu(page, 'oc');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'admin tab with the account popover open');
  await page.getByTestId('oc-account-backdrop').click();
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);
  await expect(chip).toBeFocused();
});
