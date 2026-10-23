import { expect, test, type Locator, type Page } from '@playwright/test';

import { mockAuthApi, mockCustomerAuthApi } from './support/auth-mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * No-drift proof for `shared/primary-cta.ts` (#1542): every `[appPrimaryCta]` call site resolves
 * the same skin, read as computed style, never the class list. The sites span the shapes the
 * directive meets: a tourist submit button, a routed link projected into an outcome card, and an
 * operator-console button. The highlight is an `inset-shadow-*`, so each site's own drop shadow
 * must survive beside it.
 */

const SKIN = {
  'border-top-width': '1px',
  'border-top-color': 'rgba(255, 255, 255, 0.4)',
  'background-image': 'linear-gradient(rgb(12, 114, 136), rgb(10, 95, 116))',
  color: 'rgb(255, 255, 255)',
} as const;

const INSET_HIGHLIGHT = 'rgba(255, 255, 255, 0.5) 0px 1px 0px 0px inset';

async function expectSkin(cta: Locator, dropShadow: string): Promise<void> {
  await expect(cta).toHaveAttribute('appprimarycta', '');
  for (const [property, value] of Object.entries(SKIN)) {
    await expect(cta, property).toHaveCSS(property, value);
  }
  const shadow = await cta.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow, 'the inset highlight').toContain(INSET_HIGHLIGHT);
  expect(shadow, "the call site's own drop shadow").toContain(dropShadow);
}

async function openOperatorCreateCard(page: Page): Promise<Locator> {
  await mockAuthApi(page, { validPassword: 'good-pw', venues: [] });
  await page.route(/\/api\/venue-defaults$/, (route) =>
    route.fulfill({ json: { commissionBps: 500 } }),
  );
  const signIn = new OperatorSignInPage(page);
  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');
  await expect(page.getByTestId('venue-create-card')).toBeVisible();
  return page.getByTestId('venue-create-submit');
}

test.describe('the [appPrimaryCta] skin resolves identically at every call site', () => {
  test('the tourist sign-in submit button', async ({ page }) => {
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in');

    await expectSkin(page.getByTestId('auth-submit'), 'rgba(11, 120, 150, 0.5) 0px 10px 26px 0px');
  });

  test('the signed-in card link', async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ json: { username: 'tourist@example.com', principalType: 'CUSTOMER' } }),
    );
    await page.goto('/account/sign-in');

    await expectSkin(
      page.getByTestId('auth-signed-in-cta'),
      'rgba(11, 120, 150, 0.5) 0px 10px 26px 0px',
    );
  });

  test('the operator create-venue button', async ({ page }) => {
    const submit = await openOperatorCreateCard(page);

    await expectSkin(submit, 'rgba(11, 120, 150, 0.35) 0px 8px 22px 0px');
  });

  test('the hover lift skips a disabled control and lifts an enabled one', async ({ page }) => {
    const submit = await openOperatorCreateCard(page);
    await expect(submit).toBeDisabled();

    await submit.hover({ force: true });
    await expect(submit).toHaveCSS('filter', 'none');

    await page.getByTestId('venue-create-name').fill('Sunset Bar');
    await page.getByTestId('venue-create-beach').selectOption('KSAMIL');
    await page.getByTestId('venue-create-description').fill('Loungers on the shore.');
    await expect(submit).toBeEnabled();

    await submit.hover();
    await expect(submit).toHaveCSS('filter', 'brightness(1.06)');
  });
});
