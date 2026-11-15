import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from '../support/admin-console.mocks';
import { mockChallengeFence, mockOwnedVenues } from '../support/auth-mocks';
import { expectNoSeriousAxeViolations } from '../support/axe';
import { settle } from '../support/booking-dialog';
import { awaitRoutedPage } from '../support/shell';
import { mockWholeConsole, signInAsOperator } from '../support/operator-console.mocks';
import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';
import { mockTourist } from '../support/tourist.mocks';

/**
 * The translated builds (ADR-0030), against the production build with the server's per-locale
 * fallback (`scripts/serve-locales.mjs`): every first-batch page renders in each translated locale,
 * axe-clean, its copy read from the translation files rather than restated here; the language row
 * switches and keeps the route; a first visit to `/` follows the stored choice, then the browser.
 */

type Locale = 'sq' | 'it' | 'de';
const LOCALES: readonly Locale[] = ['sq', 'it', 'de'];

/** `<source>` → `<target>` of a locale's plain-text messages, straight from its XLIFF file. */
function translationsOf(locale: Locale): Map<string, string> {
  const xlf = readFileSync(
    path.resolve(__dirname, `../../src/locale/messages.${locale}.xlf`),
    'utf8',
  );
  const pairs = new Map<string, string>();
  for (const [, source, target] of xlf.matchAll(
    /<source>([^<]*)<\/source>\s*<target[^>]*>([^<]*)<\/target>/g,
  )) {
    pairs.set(source, target);
  }
  return pairs;
}

const TRANSLATIONS = new Map(LOCALES.map((locale) => [locale, translationsOf(locale)]));

/** The locale's translation of a plain-text English message; throws if the file lacks it. */
function t(locale: Locale, english: string): string {
  const target = TRANSLATIONS.get(locale)!.get(english);
  if (target === undefined) {
    throw new Error(`messages.${locale}.xlf has no translation of "${english}"`);
  }
  return target;
}

async function expectLocalePage(page: Page, locale: Locale, title: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await awaitRoutedPage(page);
  await expect(page).toHaveTitle(t(locale, title));
}

test.beforeEach(async ({ page }) => {
  await mockTourist(page);
  await mockChallengeFence(page, 'off');
  await page.route(/\/api\/support-contact$/, (route) =>
    route.fulfill({
      json: {
        email: 'help@example.com',
        whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
        sameDayReply: true,
      },
    }),
  );
  await page.addInitScript(() => {
    const armed = window as unknown as {
      __RIVIERA_FAKE_MAP__?: boolean;
      __RIVIERA_FAKE_STRIPE__?: boolean;
    };
    armed.__RIVIERA_FAKE_MAP__ = true;
    armed.__RIVIERA_FAKE_STRIPE__ = true;
  });
});

for (const locale of LOCALES) {
  test.describe(`the ${locale} build`, () => {
    test('Discover, the venue map, the booking dialog and payment', async ({ page }) => {
      await page.goto(`/${locale}/`);
      await expectLocalePage(page, locale, 'Riviera — Sunbed Booking');
      const venue = page.getByTestId('venue-row').first();
      await expect(venue).toBeVisible();
      // Chromium carries no Albanian locale data: an English date here means the CLDR fallback broke.
      await expect(venue).not.toHaveAccessibleName(/Nov 14|Sat 14/);
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} Discover`);

      await page.goto(`/${locale}/venues/1`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      // A loaded venue names the page (#1733): the venue and its beach, then the brand.
      await expect(page).toHaveTitle(/^Miramar Beach Club, .+ — Riviera$/);
      const free = page.locator('button.set-button[data-set-id]').first();
      await expect(free).toBeVisible();
      await expectNoSeriousAxeViolations(page, `${locale} venue map`);

      await free.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} booking dialog (Details)`);

      await dialog.getByLabel(t(locale, 'Full name')).fill('Holiday Guest');
      await dialog.getByLabel(t(locale, 'Email')).fill('guest@example.com');
      await dialog.getByLabel(t(locale, 'Phone')).fill('+355699000');
      await dialog.getByTestId('dialog-primary').click();
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} booking dialog (Review)`);
      await dialog.getByTestId('dialog-primary').click();

      await expect(page).toHaveURL(new RegExp(`/${locale}/booking/pay`));
      await expect(page.getByTestId('pay-button')).toBeVisible();
      await expectLocalePage(page, locale, 'Complete payment — Riviera');
      await expectNoSeriousAxeViolations(page, `${locale} payment`);
    });

    test('the confirmation after a confirmed booking, booked in the build locale', async ({
      page,
    }) => {
      let postedLocale: unknown;
      await page.route('**/api/bookings', (route) => {
        postedLocale = (route.request().postDataJSON() as { locale?: unknown }).locale;
        return route.fulfill({
          json: {
            code: 'ABCD234567',
            status: 'CONFIRMED',
            venueId: 1,
            venueName: 'Miramar Beach Club',
            setId: 2,
            rowLabel: 'Front row · Sea view',
            positionNo: 2,
            bookingDate: '2026-12-01',
            amount: { minorUnits: 4500, currency: 'EUR' },
          },
        });
      });
      await page.goto(`/${locale}/venues/1`);
      await page.locator('button.set-button[data-set-id]').first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(t(locale, 'Full name')).fill('Holiday Guest');
      await dialog.getByLabel(t(locale, 'Email')).fill('guest@example.com');
      await dialog.getByLabel(t(locale, 'Phone')).fill('+355699000');
      await dialog.getByTestId('dialog-primary').click();
      await dialog.getByTestId('dialog-primary').click();

      await expect(page).toHaveURL(new RegExp(`/${locale}/booking/confirmation`));
      // The booking stores the guest's language, so every later mail for it is written in it (#1770).
      expect(postedLocale).toBe(locale);
      await expect(page.getByTestId('booking-code')).toContainText('ABCD234567');
      await expectLocalePage(page, locale, 'Booking confirmed — Riviera');
      await expectNoSeriousAxeViolations(page, `${locale} confirmation`);
    });

    test('the booking view, /for-venues and /help, each by deep link', async ({ page }) => {
      await page.goto(`/${locale}/booking/WXYZ345678`);
      await expectLocalePage(page, locale, 'Your booking — Riviera');
      await expect(page.getByTestId('booking-code')).toBeVisible();
      await expectNoSeriousAxeViolations(page, `${locale} booking view`);

      await page.goto(`/${locale}/for-venues`);
      await expectLocalePage(page, locale, 'For venues — Riviera');
      await expectNoSeriousAxeViolations(page, `${locale} for venues`);

      await page.goto(`/${locale}/help`);
      await expectLocalePage(page, locale, 'Help — Riviera');
      await expect(page.getByTestId('help-promise')).toHaveText(
        t(locale, 'We answer the same day, 08:00–20:00, May to October.'),
      );
      await expectNoSeriousAxeViolations(page, `${locale} help`);
    });

    test('the operator console: pricing, payouts and the account menu', async ({ page }) => {
      await mockWholeConsole(page);
      await page.goto('/operator/1/pricing');
      await signInAsOperator(page);
      await expect(page.getByTestId('oc-header')).toBeVisible();

      await page.goto(`/${locale}/operator/1/pricing`);
      await expectLocalePage(page, locale, 'Pricing — Operator console');
      await expect(
        page.getByRole('navigation', { name: t(locale, 'Operator console sections') }),
      ).toBeVisible();
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} operator pricing`);

      await page.getByTestId('oc-account').click();
      await expect(page.locator('#oc-contact-label')).toHaveText(t(locale, 'Contact Riviera'));
      await expect(page.getByTestId('oc-change-password')).toHaveText(t(locale, 'Change password'));
      await expectNoSeriousAxeViolations(page, `${locale} operator account menu`);
      await page.keyboard.press('Escape');

      await page.goto(`/${locale}/operator/1/payouts`);
      await expectLocalePage(page, locale, 'Payouts — Operator console');
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} operator payouts`);
    });

    test('the admin console: the operators tab', async ({ page }) => {
      await mockWholeAdminConsole(page);
      await mockOwnedVenues(page, [{ id: 1, name: 'Miramar Beach Club', beach: 'KSAMIL' }]);
      await page.goto('/operator');
      await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);

      await page.goto(`/${locale}/admin`);
      await expectLocalePage(page, locale, 'Operators — Riviera');
      await expect(
        page.getByRole('navigation', { name: t(locale, 'Admin console sections') }),
      ).toBeVisible();
      await expect(page.getByTestId('admin-tab-operators')).toBeVisible();
      await settle(page);
      await expectNoSeriousAxeViolations(page, `${locale} admin operators`);
    });

    test('the not-found page and the sign-in card, each by deep link', async ({ page }) => {
      await page.goto(`/${locale}/no-such-page`);
      await expectLocalePage(page, locale, 'Page not found — Riviera');
      await expect(page.getByTestId('not-found-home')).toHaveText(t(locale, 'Back to the beaches'));
      await expectNoSeriousAxeViolations(page, `${locale} not found`);

      await page.goto(`/${locale}/account/sign-in`);
      await expectLocalePage(page, locale, 'Sign in — Riviera');
      await expect(page.getByTestId('sso-google')).toHaveText(t(locale, 'Continue with Google'));
      await expectNoSeriousAxeViolations(page, `${locale} sign-in`);
    });

    test('a server error on sign-in renders translated copy keyed on its code, never the detail', async ({
      page,
    }) => {
      await page.route(/\/api\/auth\/me$/, (route) =>
        route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
      );
      const detail = 'An English server sentence.';
      await page.route(/\/api\/auth\/customer\/login$/, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ code: 'SOME_FUTURE_CODE', detail }),
        }),
      );
      await page.goto(`/${locale}/account/sign-in`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.getByTestId('auth-identifier').fill('ana@example.com');
      await page.getByTestId('auth-password').fill('passphrase-123');
      await page.getByTestId('auth-submit').click();

      const error = page.getByTestId('auth-error');
      await expect(error).toHaveText(
        t(locale, 'Something went wrong signing in. Please try again.'),
      );
      await expect(error).not.toContainText(detail);
    });
  });
}

test.describe('choosing a language', () => {
  test('the language row loads the same route in Albanian and the choice survives a first visit to /', async ({
    page,
  }) => {
    await page.goto('/help');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await awaitRoutedPage(page);
    await page.getByTestId('nav-menu').click();
    await page.getByTestId('language-row').click();
    await page.getByTestId('language-option-sq').click();

    await expect(page).toHaveURL(/\/sq\/help$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'sq');

    await page.goto('/');
    await expect(page).toHaveURL(/\/sq\/$/);

    await awaitRoutedPage(page);
    await page.getByTestId('nav-menu').click();
    await page.getByTestId('language-row').click();
    await page.getByTestId('language-option-en').click();
    await expect(page).toHaveURL(/:4300\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the operator console’s language rows save the pick as the operator’s own, then load the console in it', async ({
    page,
  }) => {
    await mockWholeConsole(page);
    let saved: unknown;
    await page.route(/\/api\/auth\/operator\/locale$/, (route) => {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: '' });
    });
    await page.goto('/operator/1/pricing');
    await signInAsOperator(page);
    await expect(page.getByTestId('oc-header')).toBeVisible();

    await page.getByTestId('oc-account').click();
    await page.getByTestId('oc-language-sq').click();

    await expect(page).toHaveURL(/\/sq\/operator\/1\/pricing$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'sq');
    // The approval notice is written in the operator's stored language (#1785).
    expect(saved).toEqual({ locale: 'sq' });
  });

  test.describe('an SSO sign-in', () => {
    // The provider round trip, collapsed: authorize answers with the callback's own fixed 302 to `/`.
    test.beforeEach(async ({ page }) => {
      await page.route(/\/api\/auth\/sso\/google\/authorize$/, (route) =>
        route.fulfill({ status: 302, headers: { location: '/' } }),
      );
    });

    test('started on /it/ returns to /it/', async ({ page }) => {
      await page.goto('/it/account/sign-in');
      await awaitRoutedPage(page);
      await page.getByTestId('sso-google').click();

      await expect(page).toHaveURL(/\/it\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    });

    test('started in English returns to English, over a stored Albanian choice', async ({
      page,
    }) => {
      await page.goto('/account/sign-in');
      await page.evaluate(() => localStorage.setItem('riviera-locale', 'sq'));
      await awaitRoutedPage(page);
      await page.getByTestId('sso-google').click();

      await expect(page).toHaveURL(/:4300\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('with an Italian browser and nothing stored', () => {
    test.use({ locale: 'it-IT' });

    test('a first visit to / goes to /it/, a deep link stays where it points', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/it\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'it');

      await page.goto('/venues/1');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('with a German browser and nothing stored', () => {
    test.use({ locale: 'de-DE' });

    test('a first visit to / goes to /de/', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/de\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    });
  });
});
