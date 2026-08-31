import { expect, test, type Page } from '@playwright/test';

import { mockAuthApi } from './support/auth-mocks';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The operator console's error ink paints from the token registry (#855) — the operator-side
 * counterpart to `admin-token-inks.e2e.ts` and `accent-token-inks.e2e.ts`.
 *
 * <p><strong>These are guards, not red-first drivers, and deliberately so.</strong> The 32 migrated
 * positions moved from `text-[#a3160e]` to `text-riv-error-ink`, and `--riv-error-ink` IS `#a3160e`
 * under the porcelain pin — so the computed value is identical before and after. That identity is
 * exactly what made the family safe to sweep mechanically; it also means no assertion here could
 * have gone red on the old markup. What these tests DO catch is the one failure the substitution can
 * still produce, and that no unit spec can see: a token consumed through a utility that was never
 * generated. The class lands in the markup, `color` silently keeps its inherited value, and only a
 * resolved computed style separates that from a working token.
 *
 * <p>The last two tests pin the resolution the whole slice rests on. These 32 sites are safe on a
 * THEMED token (`#a3160e` light, `#ffa9a1` dark) ONLY because their host pins porcelain — so the ink
 * must survive a `dark` DOCUMENT theme. The unit contrast specs prove porcelain and cannot see this.
 * Both hosts are driven, because `operator-console.ts` and `operator-home.ts` pin porcelain through
 * two SEPARATE host bindings: one passing is not evidence about the other. (#835 closed the
 * equivalent risk on a single host and had to reopen it — recorded there as F-4.)
 */

/** `--riv-error-ink` as the light themes declare it, which the porcelain pin keeps in force. */
const ERROR_INK = 'rgb(163, 22, 14)';

/** The utility the 32 sites are consumed through — it exists only if the `@theme inline` row does. */
const UTILITY = 'text-riv-error-ink';

/** Drives the console's Venue tab to its load-error state, whose heading is a migrated position. */
async function openVenueLoadError(page: Page): Promise<void> {
  await mockWholeConsole(page);
  await page.route(/\/api\/venues\/1\/profile$/, (route) =>
    route.fulfill({ status: 500, json: { code: 'INTERNAL' } }),
  );
  await page.goto('/operator/1');
  await signInAsOperator(page);
  await page.goto('/operator/1/venue');
}

/** Drives the operator home's inline create card to its submit-error state — the other host. */
async function openCreateError(page: Page): Promise<void> {
  await mockAuthApi(page, { validPassword: 'good-pw', venues: [] });
  await page.route(/\/api\/venue-defaults$/, (route) =>
    route.fulfill({ json: { commissionBps: 500 } }),
  );
  await page.route(/\/api\/venues$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { code: 'INTERNAL' } })
      : route.fallback(),
  );

  const signIn = new OperatorSignInPage(page);
  await signIn.goto();
  await signIn.signIn('operator', 'good-pw');

  await expect(page.getByTestId('venue-create-card')).toBeVisible();
  await page.getByTestId('venue-create-name').fill('Sunset Bar');
  await page.getByTestId('venue-create-beach').fill('Ksamil');
  await page.getByTestId('venue-create-region').fill('Albanian Riviera');
  await page.getByTestId('venue-create-description').fill('Loungers on the shore.');
  await page.getByTestId('venue-create-submit').click();
}

test.describe('the operator console error ink paints from the token registry', () => {
  test('the token is declared and its utility is generated', async ({ page }) => {
    await mockWholeConsole(page);
    await page.goto('/operator/1');
    await signInAsOperator(page);

    const declared = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--riv-error-ink').trim(),
    );
    expect(declared, '--riv-error-ink declared').toBe('#a3160e');

    // `@theme inline` writes no :root alias, so the emitted rules are the only evidence.
    const generated = await page.evaluate((name) => {
      const selectors = new Set<string>();
      const walk = (rules: CSSRuleList): void => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) selectors.add(rule.selectorText);
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested) walk(nested);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      return selectors.has(`.${name}`);
    }, UTILITY);

    expect(generated, `${UTILITY} generated`).toBe(true);
  });

  test('the venue load error resolves to the registered token value', async ({ page }) => {
    await openVenueLoadError(page);

    const error = page.getByTestId('venue-load-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveClass(new RegExp(UTILITY));
    await expect(error).toHaveCSS('color', ERROR_INK);
  });

  test('the console keeps its porcelain error ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openVenueLoadError(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.getByTestId('venue-load-error')).toHaveCSS('color', ERROR_INK);
  });

  test('the operator home keeps its porcelain error ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openCreateError(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const error = page.getByTestId('venue-create-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveCSS('color', ERROR_INK);
  });
});
