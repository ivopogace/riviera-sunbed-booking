import { expect, test } from '@playwright/test';

import { mockCustomerAuthApi } from './support/auth-mocks';

/**
 * The CTA hairline paints from the token registry, asserted against a real render (#853) — the
 * `--riv-warn-*` / `--riv-form-error-*` precedent applied to `--riv-cta-border` (that first
 * family was `--riv-notice-banner-*` when this was written; #879 merged it into `--riv-warn-*`).
 *
 * <p>The computed style is what is checked, never the class list. A token declared without its
 * `@theme inline` row generates no utility at all: the class stays in the markup, the paint
 * silently does not change, and nothing but a resolved value separates that from a working token.
 * The first test catches that by asking whether Tailwind emitted the rule.
 *
 * <p>The last test is the one this slice exists for. The token is theme-INVARIANT because every
 * surface it lands on is fixed — `--riv-cta-grad` is declared once and `booking-dialog`'s close
 * button sits on a `#31798a` literal — so a themed border would fade over a fill that never moves
 * (the dark `--riv-card-border` measures 1.35–1.46:1 there). The unit spec
 * (`shared/cta-border-token.contrast.spec.ts`) proves that by reading `tailwind.css` as text, which
 * is a regex over a stylesheet; here the cascade itself decides, under a real `dark` document
 * theme. `/account/sign-in` is the cheapest render of the skin — two of the sixteen sites, the
 * submit button and the signed-in card's CTA, on one route with no booking state.
 *
 * <p>One test here does what no other proof in this family can. The migration is BYTE-IDENTICAL —
 * the literal and the token resolve to the same colour in every theme — so a plain `toHaveCSS`
 * cannot tell an element that consumes the token from one that still carries the literal. Re-pointing
 * `--riv-cta-border` at a sentinel colour at the document root separates them: only a consumer
 * follows.
 */

const BORDER = 'rgba(255, 255, 255, 0.4)';

/** Every token the slice registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-cta-border': 'rgba(255, 255, 255, 0.4)',
} as const;

/** The utility the token is consumed through, which only exists if its `@theme inline` row does. */
const UTILITIES = ['border-riv-cta-border'];

test.describe('the CTA hairline paints from the token registry', () => {
  test('every registered token is declared and generates its utility', async ({ page }) => {
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in');

    const declared = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return names.map((name) => [name, style.getPropertyValue(name).trim()] as const);
    }, Object.keys(REGISTRY));

    for (const [name, value] of declared) {
      expect(value, `${name} declared`).toBe(REGISTRY[name as keyof typeof REGISTRY]);
    }

    const generated = await page.evaluate((classes) => {
      const selectors = new Set<string>();
      const walk = (rules: CSSRuleList): void => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) selectors.add(rule.selectorText);
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested) walk(nested);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      return classes.filter((name) => selectors.has(`.${name}`));
    }, UTILITIES);

    expect(generated.sort()).toEqual([...UTILITIES].sort());
  });

  test('the sign-in submit button paints the registered hairline', async ({ page }) => {
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in');

    await expect(page.getByTestId('auth-submit')).toHaveCSS('border-color', BORDER);
  });

  test('the signed-in card CTA paints the same hairline', async ({ page }) => {
    await page.route(/\/api\/auth\/me$/, (route) =>
      route.fulfill({ json: { username: 'tourist@example.com', principalType: 'CUSTOMER' } }),
    );

    await page.goto('/account/sign-in');

    await expect(page.getByTestId('auth-signed-in-cta')).toHaveCSS('border-color', BORDER);
  });

  test('the hairline does not move under a dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in');

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    await expect(page.getByTestId('auth-submit')).toHaveCSS('border-color', BORDER);
  });

  test('the button follows the token rather than a literal of the same value', async ({ page }) => {
    await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
    await page.goto('/account/sign-in');

    await page.evaluate(() =>
      document.documentElement.style.setProperty('--riv-cta-border', 'rgb(255, 0, 0)'),
    );

    await expect(page.getByTestId('auth-submit')).toHaveCSS('border-color', 'rgb(255, 0, 0)');
  });
});
