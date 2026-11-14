import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { hitTestId } from './support/hit-test';
import { openShellOverlay, openThemePicker } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';

/**
 * The help page and its ways in (#1735): the configured support channels from `/api/support-contact`
 * (mocked), the same-day promise only in season, no contact section with nothing configured, and the
 * menu row and footer link that open it in a new tab like the legal rows.
 */

const BOTH = {
  email: 'help@example.com',
  whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
  sameDayReply: true,
};

async function mockSupport(page: Page, body: object): Promise<void> {
  await page.route(/\/api\/support-contact$/, (route) => route.fulfill({ json: body }));
}

test.describe('help page', () => {
  test.use({ colorScheme: 'dark' });

  test('names both channels and the in-season promise, axe-clean in all three themes', async ({
    page,
  }) => {
    await mockSupport(page, BOTH);
    await page.goto('/help');

    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
    const contact = page.getByTestId('help-contact');
    await expect(contact.getByTestId('support-email')).toHaveAttribute(
      'href',
      'mailto:help@example.com',
    );
    await expect(contact.getByTestId('support-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/355691234567',
    );
    await expect(page.getByTestId('help-promise')).toHaveText(
      'We answer the same day, 08:00–20:00, May to October.',
    );
    await expectTouchTargets(page, 'help page');

    for (const theme of ['dark', 'riviera', 'porcelain'] as const) {
      if (theme !== 'dark') {
        await openThemePicker(page);
        await page.getByTestId(`theme-option-${theme}`).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
      await settle(page);
      await expectNoSeriousAxeViolations(page, `help page (${theme})`);
    }
  });
});

test('outside the season the page names the channels with no time promise', async ({ page }) => {
  await mockSupport(page, { ...BOTH, sameDayReply: false });
  await page.goto('/help');

  await expect(page.getByTestId('support-email')).toBeVisible();
  await expect(page.getByTestId('help-promise')).toHaveCount(0);
});

test('with no channel configured the page shows no contact section and no placeholder', async ({
  page,
}) => {
  await mockSupport(page, { email: null, whatsapp: null, sameDayReply: true });
  await page.goto('/help');

  await expect(page.getByTestId('help-booking')).toBeVisible();
  await expect(page.getByTestId('help-contact')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('@');
});

test('the footer Help link opens the help page in a new tab', async ({ page }) => {
  await mockSupport(page, BOTH);
  await page.goto('/legal/terms');

  const popupPromise = page.waitForEvent('popup');
  await page.locator('.riv-footer').getByRole('link', { name: 'Help' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/help$/);
  await expect(popup.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/legal\/terms$/);
});

test('the phone menu sheet carries the Help row, reachable and opening a new tab', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupport(page, BOTH);
  await page.goto('/legal/terms');
  await openShellOverlay(page, 'menu-toggle');

  await expect(page.getByTestId('help-row')).toBeVisible();
  expect(await hitTestId(page, 'help-row')).toBe('help-row');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('help-row').click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/help$/);
});
