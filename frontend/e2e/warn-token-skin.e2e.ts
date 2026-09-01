import { expect, test } from '@playwright/test';

/**
 * The merged amber WARN skin paints from the token registry, asserted against a real render
 * (#879, absorbing #868's `--riv-notice-banner-*`) — the `--riv-form-error-*` / `--riv-medallion-*`
 * precedent applied to `--riv-warn-{edge,fill,ink}`.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-warn-*` declared without
 * its `@theme inline` row generates no utility at all: the class stays in the markup, the paint
 * silently does not change, and nothing but a resolved value separates that from a working token.
 * The first test catches that for all three tokens by asking whether Tailwind emitted the rule.
 *
 * <p>The dark-theme test is the one this file exists for, and #879 made it matter MORE rather than
 * less. The family is theme-INVARIANT because its fill is fixed, so a themed ink over it would
 * resolve `#ffa9a1` at 1.63:1, light on light. Before the merge, the console half of this family
 * could lean on a second argument — every consumer sat under the porcelain-pinned
 * `operator-console`, so a dark branch was unreachable. After the merge that argument is gone: the
 * legal pages and `withheld-email-notice` are tourist surfaces that really do render under `dark`.
 * The fixed-fill argument is the only one left, and this is where the cascade rather than a regex
 * proves it. `pages/legal/privacy` is the cheapest render — the banner needs no booking state — and
 * both legal pages plus `withheld-email-notice` wear the identical skin.
 */

const FILL = 'rgb(255, 244, 224)';
const INK = 'rgb(122, 74, 8)';

/** Every token the family registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-warn-edge': '#e0a03a',
  '--riv-warn-fill': '#fff4e0',
  '--riv-warn-ink': '#7a4a08',
} as const;

/** The utility each token is consumed through, which only exists if its `@theme inline` row does. */
const UTILITIES = ['bg-riv-warn-fill', 'text-riv-warn-ink'];

test.describe('the merged warn skin paints from the token registry', () => {
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
