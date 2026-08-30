import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The admin console's negative state paints from the token registry, proven against a real render
 * (#829). The class list is deliberately NOT what is asserted: a `text-riv-error-ink` that never
 * generated a utility, or a `--riv-danger-*` declared without its `@theme inline` row, would leave
 * the class in place and the paint unchanged — only the computed style can tell those apart.
 *
 * <p>One representative element per family, since a token resolves the same way everywhere: the
 * error ink, the danger panel's fill and border, and the danger ink on the action inside it.
 *
 * <p>The last test is what makes the registry entry load-bearing rather than cosmetic. `@theme
 * inline` emits `var(--riv-*)` into each utility instead of resolving it once on `:root`, so a
 * subtree that pins its own `data-riv-theme` re-resolves the value. The console pins porcelain
 * (`admin-console.ts`), so its inks must survive a `dark` document theme unchanged.
 */

const ERROR_INK = 'rgb(163, 22, 14)';
const DANGER_INK = 'rgb(143, 44, 34)';
const DANGER_FILL = 'rgba(179, 54, 43, 0.06)';
const DANGER_BORDER = 'rgba(179, 54, 43, 0.35)';
const DANGER_ACTION_FILL = 'rgba(179, 54, 43, 0.1)';

async function signIn(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
}

/** Drives the Privacy tab from the email form to the erasure confirmation, animation settled. */
async function openErasureConfirmation(page: Page): Promise<void> {
  await page.goto('/admin/privacy');
  await page.getByTestId('admin-privacy-email').fill('ana@example.com');
  await page.getByTestId('admin-privacy-review').click();

  const panel = page.getByTestId('admin-privacy-confirm-panel');
  await expect(panel).toBeVisible();
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.describe('the admin console paints its inks from the token registry', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
    await signIn(page);
  });

  test('the error ink resolves to the registered token value', async ({ page }) => {
    await page.route(/\/api\/admin\/audit$/, (route) => route.fulfill({ status: 500 }));
    await page.goto('/admin/audit');

    await expect(page.getByTestId('admin-audit-error')).toHaveCSS('color', ERROR_INK);
  });

  test('the destructive affordances take the same error ink on border and label', async ({
    page,
  }) => {
    await page.route(/\/api\/admin\/operators\/accounts$/, (route) =>
      route.fulfill({
        json: [
          {
            id: 12,
            username: 'ana',
            admin: false,
            suspended: false,
            contactEmail: 'ana@example.com',
          },
        ],
      }),
    );
    await page.goto('/admin');
    await page.getByTestId('admin-suspend-12').click();

    const confirm = page.getByTestId('admin-suspend-confirm-12');
    await expect(confirm).toHaveCSS('color', ERROR_INK);
    await expect(confirm).toHaveCSS('border-top-color', ERROR_INK);
  });

  test('the erasure panel paints its tints and ink from the danger tokens', async ({ page }) => {
    await openErasureConfirmation(page);

    const panel = page.getByTestId('admin-privacy-confirm-panel');
    await expect(panel).toHaveCSS('background-color', DANGER_FILL);
    await expect(panel).toHaveCSS('border-top-color', DANGER_BORDER);

    await expect(page.locator('#admin-privacy-confirm-heading')).toHaveCSS('color', DANGER_INK);

    const erase = page.getByTestId('admin-privacy-confirm');
    await expect(erase).toHaveCSS('color', DANGER_INK);
    await expect(erase).toHaveCSS('background-color', DANGER_ACTION_FILL);
  });

  test('the console keeps its porcelain inks under a dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openErasureConfirmation(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    await expect(page.getByTestId('admin-privacy-confirm-panel')).toHaveCSS(
      'background-color',
      DANGER_FILL,
    );
    await expect(page.getByTestId('admin-privacy-confirm')).toHaveCSS('color', DANGER_INK);

    await page.getByTestId('admin-privacy-cancel').click();
    await page.getByTestId('admin-privacy-email').fill('nope');
    await page.getByTestId('admin-privacy-review').click();
    await expect(page.getByTestId('admin-privacy-email-error')).toHaveCSS('color', ERROR_INK);
  });
});
