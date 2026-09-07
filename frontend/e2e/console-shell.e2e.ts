import { expect, test } from '@playwright/test';

import { mockWholeAdminConsole } from './support/admin-console.mocks';
import { mockOperatorLifecycleApi, mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { mockWholeConsole } from './support/operator-console.mocks';
import { openOperatorAccountMenu, openPalette } from './support/shell';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { expectTouchTargets } from './support/touch-targets';

/**
 * Real-render coverage of the console shell every operator and admin route wears: the section
 * row (brand, the venue switcher as the venue-console section, `Admin` for admins, the ⌘K search
 * glyph from `sm` up, the account chip or `Sign in`) over the active section's rail, the ⌘K palette
 * the glyph and the chord open, the shell footer, the porcelain pin on the
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
  await openOperatorAccountMenu(page);
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

test('the password page and the landing wear the same shell: neither section current, no rail (#1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockOwnedVenues(page, TWO_VENUES);
  await new OperatorSignInPage(page).goto('/account/operator-password');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/account\/operator-password$/);

  for (const path of ['/account/operator-password', '/operator']) {
    await page.goto(path);
    await expect(page.getByTestId('oc-header')).toBeVisible();
    await expect(page.getByTestId('oc-venue-title')).toHaveText(/Your venues/);
    await expect(page.getByTestId('oc-section-venue')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('oc-section-admin')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav[aria-label$="console sections"]')).toHaveCount(0);
    await expect(page.locator('.riv-header')).toHaveCount(0);
    await expect(page.locator('.riv-footer')).toContainText('© Riviera Sunbed Booking');
    await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');
    await expectNoSeriousAxeViolations(page, `${path} under the console shell`);
  }
  // The landing's picker is the page; the chip's popover opens over it, axe clean.
  await expect(page.getByTestId('operator-home-picker')).toBeVisible();
  await openOperatorAccountMenu(page);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator landing with the account popover open');
});

/**
 * The shell's controls on the four routes, at a phone width and a laptop width: every visible
 * control measures the 44px floor, the row's buttons paint the 3px baseline ring, axe is clean.
 * The venue console is the daily view; the admin console its home; the mocks are the whole
 * console's plus the admin lifecycle's.
 */
for (const viewport of [
  { width: 390, height: 780 },
  { width: 1280, height: 900 },
]) {
  test(`the shell's controls meet the 44px floor and the 3px ring on the four routes at ${viewport.width}px, axe clean (#1011)`, async ({
    page,
  }) => {
    await mockWholeConsole(page);
    await mockWholeAdminConsole(page);
    await mockOwnedVenues(page, TWO_VENUES);
    await page.setViewportSize(viewport);
    await new OperatorSignInPage(page).goto('/operator/1/daily');
    await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);

    const routes = [
      { path: '/operator/1/daily', marker: 'daily-view-tab' },
      { path: '/admin', marker: 'admin-op-row' },
      { path: '/operator', marker: 'operator-home-picker' },
      { path: '/account/operator-password', marker: 'oppw-submit' },
    ];
    for (const { path, marker } of routes) {
      await page.goto(path);
      await expect(page.getByTestId(marker).first()).toBeVisible();
      await expect(page.getByTestId('oc-header')).toBeVisible();
      await expectTouchTargets(page, `${path} at ${viewport.width}px`);

      // The row's buttons: the venue switcher and the chip paint the baseline ring on keyboard focus.
      for (const id of ['oc-venue-title', 'oc-account']) {
        const control = page.getByTestId(id);
        await control.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(control).toBeFocused();
        await expect(control).toHaveCSS('outline-style', 'solid');
        await expect(control).toHaveCSS('outline-width', '3px');
      }
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${path} at ${viewport.width}px`);
    }
  });
}

test('Sign out from the chip on /admin ends the session and lands on the operator sign-in (#1011)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('oc-account')).toBeVisible();

  await openOperatorAccountMenu(page);
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
  // Nor the palette: no search glyph, and the chord opens nothing (#1013).
  await expect(page.getByTestId('oc-search')).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: 'Go to' })).toHaveCount(0);

  await expectNoSeriousAxeViolations(page, 'signed-out admin page under the console shell');
});

test('the account chip opens a popover on /admin — axe clean, one header row on a phone (#1008)', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockOwnedVenues(page, TWO_VENUES);
  await page.setViewportSize({ width: 390, height: 780 });
  await new OperatorSignInPage(page).goto('/admin');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);

  // One row: the brand, Your venues and the chip share it; below sm Admin lives in the More sheet.
  const brand = (await page.getByTestId('oc-brand').boundingBox())!;
  const chip = page.getByTestId('oc-account');
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.y).toBeLessThan(brand.y + brand.height);
  expect(chipBox.y + chipBox.height).toBeGreaterThan(brand.y);
  await expect(page.getByTestId('oc-section-admin')).toBeHidden();
  await expect(page.getByTestId('oc-search')).toBeHidden();
  // A second row would add at least the chip's 44px floor; one row stays under 80.
  const header = (await page.getByTestId('oc-header').boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(80);
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  await openOperatorAccountMenu(page);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'admin tab with the account popover open');
  await page.getByTestId('oc-account-backdrop').click();
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);
  await expect(chip).toBeFocused();

  // The glyph has left the row, but the chord still opens the palette, inside the viewport (#1013).
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('oc-palette-search')).toBeFocused();
  const dialogBox = (await dialog.boundingBox())!;
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'admin tab with the palette open on a phone');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(chip).toBeFocused();
});

test('the search glyph and ⌘K open the Go to dialog: focus legs, the field on the 3px ring, every control at the floor, axe clean, inside the viewport (#1013)', async ({
  page,
}) => {
  await mockWholeConsole(page);
  await mockWholeAdminConsole(page);
  await mockOwnedVenues(page, TWO_VENUES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await new OperatorSignInPage(page).goto('/operator/1/daily');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  const search = page.getByTestId('oc-search');
  await expect(search).toBeVisible();
  await expect(search).toHaveAccessibleName('Jump to a section or venue (⌘K)');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  const header = (await page.getByTestId('oc-header').boundingBox())!;
  const searchBox = (await search.boundingBox())!;
  expect(searchBox.y).toBeGreaterThanOrEqual(header.y);
  expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(header.y + header.height);

  // The glyph: the dialog under the row, inside the viewport, its field focused on the 3px ring.
  const dialog = await openPalette(page);
  const field = page.getByTestId('oc-palette-search');
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS('outline-style', 'solid');
  await expect(field).toHaveCSS('outline-width', '3px');
  const dialogBox = (await dialog.boundingBox())!;
  expect(dialogBox.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(1280);
  // The rows: six sections (Daily view current), two venues on the open tab, Admin console, Change password.
  const rows = dialog.getByRole('link');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toHaveAttribute('aria-current', 'page');
  await expect(rows.first()).toHaveAttribute('href', '/operator/1/daily');
  await expect(rows.nth(7)).toHaveAttribute('href', '/operator/2/daily');
  await expect(rows.nth(8)).toHaveAttribute('href', '/admin');
  await expect(rows.last()).toHaveAttribute('href', '/account/operator-password');
  await expectTouchTargets(page, 'the palette open at 1280px');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with the palette open');

  // Escape hands focus back to the glyph.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toBeFocused();

  // The chord: focus returns to the element that held it when the chord fired.
  await page.getByTestId('oc-brand').focus();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await page.getByTestId('oc-palette-backdrop').click({ position: { x: 10, y: 850 } });
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('oc-brand')).toBeFocused();
  await page.keyboard.press('Meta+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Meta+k');
  await expect(dialog).toBeHidden();

  // On the admin console: the eight tabs, the venues on the beach map, no Admin console row.
  await page.goto('/admin');
  await expect(page.getByTestId('admin-op-row').first()).toBeVisible();
  await openPalette(page);
  await expect(rows).toHaveCount(11);
  await expect(rows.first()).toHaveAttribute('href', '/admin');
  await expect(rows.first()).toHaveAttribute('aria-current', 'page');
  await expect(rows.nth(8)).toHaveAttribute('href', '/operator/1/beach-map');
  await expect(dialog.getByRole('link', { name: /Admin console/ })).toHaveCount(0);
  await expectTouchTargets(page, 'the admin palette open at 1280px');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'admin console with the palette open');
});
