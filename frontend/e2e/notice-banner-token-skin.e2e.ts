import { expect, test } from '@playwright/test';

/**
 * The amber notice-banner skin paints from the token registry, asserted against a real render
 * (#868) — the `--riv-form-error-*` / `--riv-medallion-*` precedent applied to the
 * `--riv-notice-banner-*` pair.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-notice-banner-*`
 * declared without its `@theme inline` row generates no utility at all: the class stays in the
 * markup, the paint silently does not change, and nothing but a resolved value separates that
 * from a working token. The first test catches that for both tokens by asking whether Tailwind
 * emitted the rule.
 *
 * <p>The last test is the one this slice exists for. The pair is theme-INVARIANT — the fill does
 * not theme, so a themed ink over it would resolve `#ffa9a1` at 1.63:1, light on light. The unit
 * spec (`booking/withheld-email-notice.contrast.spec.ts`) proves that by reading `tailwind.css` as
 * text, which is a regex over a stylesheet; here the cascade itself decides, under a real `dark`
 * document theme. `pages/legal/privacy` is the cheapest render of the pair — the banner needs no
 * booking state — and both legal pages plus `withheld-email-notice` wear the identical skin.
 */

const FILL = 'rgb(252, 240, 217)';
const INK = 'rgb(138, 84, 16)';

/** Every token the slice registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-notice-banner-fill': '#fcf0d9',
  '--riv-notice-banner-ink': '#8a5410',
} as const;

/** The utility each token is consumed through, which only exists if its `@theme inline` row does. */
const UTILITIES = ['bg-riv-notice-banner-fill', 'text-riv-notice-banner-ink'];

test.describe('the notice-banner skin paints from the token registry', () => {
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

  test('the legal draft banner paints the registered pair', async ({ page }) => {
    await page.goto('/legal/privacy');

    const banner = page.getByTestId('legal-draft-banner');
    await expect(banner).toHaveCSS('background-color', FILL);
    await expect(banner).toHaveCSS('color', INK);
  });

  test('the pair does not move under a dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await page.goto('/legal/privacy');

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const banner = page.getByTestId('legal-draft-banner');
    await expect(banner).toHaveCSS('background-color', FILL);
    await expect(banner).toHaveCSS('color', INK);
  });
});
