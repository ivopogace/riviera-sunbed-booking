import { expect, test, type Page } from '@playwright/test';

import { completeDialog } from './support/booking-dialog';

/**
 * The form-error skin paints from the token registry, asserted against a real render (#850) — the
 * tourist-facing counterpart to `accent-token-inks.e2e.ts`, one audit class earlier.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-form-error-*` declared
 * without its `@theme inline` row generates no utility at all: the class stays in the markup, the
 * paint silently does not change, and nothing but a resolved value separates that from a working
 * token. The first test catches that for both tokens by asking whether Tailwind emitted the rule.
 *
 * <p>The last test is the one this slice exists for. The pair is theme-INVARIANT — the fill does not
 * theme, so a themed ink over it would resolve `#ffa9a1` at 1.54:1, light on light. The unit spec
 * (`booking/form-error-tokens.contrast.spec.ts`) proves that by reading `tailwind.css` as text, which
 * is a regex over a stylesheet; here the cascade itself decides, under a real `dark` document theme.
 * Both halves are asserted, because a drift in either one breaks the pair.
 */

const FILL = 'rgb(246, 232, 231)';
const INK = 'rgb(163, 22, 14)';

/** Every token the slice registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-form-error-fill': '#f6e8e7',
  '--riv-form-error-ink': '#a3160e',
} as const;

/** The utility each token is consumed through, which only exists if its `@theme inline` row does. */
const UTILITIES = ['bg-riv-form-error-fill', 'text-riv-form-error-ink'];

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  sets: [
    {
      id: 2,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
  ],
};

/**
 * Drives the booking dialog to its error banner. A `SET_TAKEN` 409 on the RFC-7807 contract is the
 * cheapest of the three banners to reach — `booking-flow.e2e.ts` already pins the same rejection —
 * and all three wear the identical pair, so one rendered banner proves the skin.
 */
async function openErrorBanner(page: Page): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'The set is already taken for this date.',
        code: 'SET_TAKEN',
      },
    }),
  );

  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await completeDialog(page.getByRole('dialog'), 'Continue to payment');
  await expect(page.getByTestId('dialog-error')).toBeVisible();
}

test.describe('the form-error skin paints from the token registry', () => {
  test('every registered token is declared and generates its utility', async ({ page }) => {
    await page.goto('/');

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

  test('the banner paints the registered pair', async ({ page }) => {
    await openErrorBanner(page);

    const banner = page.getByTestId('dialog-error');
    await expect(banner).toHaveCSS('background-color', FILL);
    await expect(banner).toHaveCSS('color', INK);
  });

  test('the pair does not move under a dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openErrorBanner(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const banner = page.getByTestId('dialog-error');
    await expect(banner).toHaveCSS('background-color', FILL);
    await expect(banner).toHaveCSS('color', INK);
  });
});
