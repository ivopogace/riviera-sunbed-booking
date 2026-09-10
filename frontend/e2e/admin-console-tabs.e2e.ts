import { expect, Page, test } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';
import { expectPhoneRailFits, openMoreSheet, openPalette } from './support/shell';

/**
 * The admin console's rail in its two shapes. From `sm` up: a single scrolling row of underlined
 * text tabs on one hairline (`shared/tab-rail.ts`), matching the operator console's own rail
 * rather than wrapping — every tab still reachable, via one row that wears no edge mask (the tab
 * cut off at the edge is the overflow cue), hairline dividers at the group boundaries stopping nine
 * destinations reading as nine peers. Below `sm`: the phone rail — Operators · Email · Refunds
 * as glyph-over-label slots and a More slot that names the current secondary and carries its
 * `aria-current`, so the current page is never hidden inside a closed menu; More opens the grouped
 * sheet with `Your venues` at its foot. From `sm` up the ⌘K palette is the accelerator over the rail.
 */

/** Sign in as the platform admin and open the console at `path`. */
async function openConsole(page: Page, path = '/admin'): Promise<void> {
  await mockWholeAdminConsole(page);
  await mockOwnedVenues(page, [{ id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' }]);
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto(path);
  await expect(page.getByTestId('oc-header')).toBeVisible();
}

test.describe('from sm up: one scrolling row', () => {
  test.use({ viewport: { width: 640, height: 900 } });

  /** The rail's tabs, located the way assistive tech finds them — by landmark role and its name. */
  function railTabs(page: Page) {
    return page.getByRole('navigation', { name: 'Admin console sections' }).getByRole('link');
  }

  test('the page never scrolls sideways at sm — only the tab row may', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('admin-tab-operators').waitFor();

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(1);

    await expectNoSeriousAxeViolations(page, 'admin console tab strip at 640px');
  });

  test('every tab shares one row, and the row itself scrolls rather than wraps', async ({
    page,
  }) => {
    await openConsole(page);

    const tabs = railTabs(page);
    await expect(tabs).toHaveCount(9);
    const tops = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);

    const nav = page.getByRole('navigation', { name: 'Admin console sections' });
    await expect(nav).toHaveCSS('flex-wrap', 'nowrap');
    const [scrollWidth, clientWidth] = await nav.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test('switching to the last tab keeps it in view, on click and on reload', async ({ page }) => {
    await openConsole(page);

    await railTabs(page).filter({ hasText: 'Audit' }).click();
    await expect(page).toHaveURL(/\/admin\/audit/);
    const active = railTabs(page).filter({ hasText: 'Audit' });
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toBeInViewport();

    // Reload on that tab proves the ON-LOAD path too, not just the click.
    await page.reload();
    await page.getByTestId('admin-tab-audit').waitFor();
    const reloadedActive = railTabs(page).filter({ hasText: 'Audit' });
    await expect(reloadedActive).toHaveAttribute('aria-current', 'page');
    await expect(reloadedActive).toBeInViewport();
  });

  test('the open tab is still the only one marked current at sm', async ({ page }) => {
    await openConsole(page);

    await expect(page.getByTestId('admin-tab-operators')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('admin-tab-audit')).not.toHaveAttribute('aria-current', 'page');
  });

  test('⌘K: typing aud leaves Audit, Enter opens it and closes the dialog; Nothing matches. holds the dialog (#1013)', async ({
    page,
  }) => {
    await openConsole(page);
    await expect(page.getByTestId('admin-op-row').first()).toBeVisible();
    // At sm the glyph joins the row without pushing the chip onto a second one (a second row would add the chip's 44px floor).
    await expect(page.getByTestId('oc-search')).toBeVisible();
    expect((await page.getByTestId('oc-header').boundingBox())!.height).toBeLessThanOrEqual(80);

    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: 'Go to' });
    await expect(dialog).toBeVisible();
    const field = page.getByTestId('oc-palette-search');
    await expect(field).toBeFocused();
    await expect(dialog.getByRole('link')).toHaveCount(11);

    // No hit: the status line, and Enter leaves the dialog and the page alone.
    await field.fill('zzz');
    await expect(dialog.getByRole('link')).toHaveCount(0);
    await expect(dialog.getByRole('status')).toHaveText('Nothing matches.');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);

    await field.fill('aud');
    const rows = dialog.getByRole('link');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Audit');
    await expect(rows.first()).toContainText('Records');
    await expect(rows.first()).toHaveAttribute('data-hit', '');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(dialog).toBeHidden();
    await expect(railTabs(page).filter({ hasText: 'Audit' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The glyph is in the row from sm up and reopens the dialog on the new page, Audit now current.
    await openPalette(page);
    await expect(dialog.getByRole('link', { name: /^Audit/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the rail wears no edge mask and draws a divider at each of the four group boundaries (#1007)', async ({
    page,
  }) => {
    await openConsole(page);

    const nav = page.getByRole('navigation', { name: 'Admin console sections' });
    await expect(nav).toHaveCSS('mask-image', 'none');
    await expect(nav).toHaveCSS('overflow-x', 'auto');

    const dividers = nav.locator(':scope > span[aria-hidden="true"]');
    await expect(dividers).toHaveCount(4);
    // Operators | Email · Refunds | Photos · Reviews | Commissions · Venue changes | Privacy · Audit
    const sequence = await nav.evaluate((el) =>
      [...el.children].map((child) => (child.tagName === 'A' ? child.textContent.trim() : '|')),
    );
    expect(sequence).toEqual([
      'Operators',
      '|',
      'Email',
      'Refunds',
      '|',
      'Photos',
      'Reviews',
      '|',
      'Commissions',
      'Venue changes',
      '|',
      'Privacy',
      'Audit',
    ]);
  });
});

test.describe('below sm: the phone rail', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  function phoneRail(page: Page) {
    return page.getByRole('navigation', { name: 'Admin console sections (phone)' });
  }

  test('below sm the phone rail replaces the rail: Operators · Email · Refunds · More (#1012)', async ({
    page,
  }) => {
    await openConsole(page);
    await expect(page.getByTestId('admin-op-row').first()).toBeVisible();

    await expectPhoneRailFits(page, 'Admin console sections (phone)');
    const rail = phoneRail(page);
    await expect(rail.getByRole('link')).toHaveText(['Operators', 'Email', 'Refunds']);
    await expect(rail.getByRole('link', { name: 'Operators' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(rail.locator('svg')).toHaveCount(4);
    const more = page.getByTestId('oc-more');
    await expect(more).toHaveAccessibleName('More');
    await expect(more).not.toHaveAttribute('aria-current', 'page');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    // The section row: Admin has left it; the More sheet is the phone's route between consoles.
    await expect(page.getByTestId('oc-section-admin')).toBeHidden();
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'admin console with the phone rail');

    await page.goto('/admin/audit');
    await expect(page.getByTestId('admin-audit-card').first()).toBeVisible();
    await expect(more).toHaveAccessibleName('Audit');
    await expect(more).toHaveAttribute('aria-current', 'page');
    await expect(rail.getByRole('link', { name: 'Operators' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'admin audit with the phone rail');
  });

  test('More opens the grouped sheet with Your venues at its foot; a row navigates and closes it, Escape and the backdrop return focus (#1012)', async ({
    page,
  }) => {
    await openConsole(page, '/admin/audit');
    await expect(page.getByTestId('admin-audit-card').first()).toBeVisible();
    const more = page.getByTestId('oc-more');
    const sheet = page.getByTestId('oc-more-sheet');

    await openMoreSheet(page);
    await expect(sheet.locator('p')).toHaveText(['Moderation', 'Money', 'Records', 'Operator']);
    const rows = sheet.getByRole('link');
    expect((await rows.allInnerTexts()).map((text) => text.split('\n')[0])).toEqual([
      'Photos',
      'Reviews',
      'Commissions',
      'Venue changes',
      'Privacy',
      'Audit',
      'Your venues',
    ]);
    await expect(rows.filter({ hasText: 'Audit' })).toHaveAttribute('aria-current', 'page');
    await expect(rows.filter({ hasText: 'Privacy' })).not.toHaveAttribute('aria-current', 'page');
    await expect(rows.filter({ hasText: 'Your venues' })).toHaveAttribute('href', '/operator');
    await expect(rows.first()).toBeFocused();
    await settle(page);
    await expectNoSeriousAxeViolations(page, 'admin audit with the More sheet open');

    // Escape closes it and hands focus back to More.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();

    // The backdrop too.
    await openMoreSheet(page);
    await page.getByTestId('oc-more-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    // A row navigates, closes the sheet, and the More slot now names the page it opened.
    await openMoreSheet(page);
    await rows.filter({ hasText: 'Photos' }).click();
    await expect(page).toHaveURL(/\/admin\/photos/);
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    await expect(more).toHaveAccessibleName('Photos');
    await expect(more).toHaveAttribute('aria-current', 'page');
  });
});
