import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The class-O tint tokens paint from the token registry (#852).
 *
 * <p><strong>These are guards, not red-first drivers.</strong> Rule B replaces the literal inside a
 * `/opacity` position with a token and leaves the modifier at the call site, so
 * `bg-[#2bb8d4]/20` and `bg-riv-select-tint/20` compile to the same
 * `color-mix(in oklab, …, transparent)` — measured byte-identical over five host colours. What
 * these tests catch is the one failure the substitution can still produce, and that no unit spec
 * can see: a token consumed through a utility that was never generated, because its `@theme inline`
 * row is missing. The class lands in the markup, the paint silently does not change, and only a
 * resolved computed style separates that from a working token.
 *
 * <p>The registry test drives all thirteen tokens at once rather than one element each. That is
 * deliberate: the failure it hunts is per-TOKEN (a missing `@theme inline` row), not per-element,
 * and thirteen navigations would prove the same thing thirteen times over while making the suite
 * the reason nobody adds the fourteenth.
 *
 * <p>The paint tests then drive real elements, because a generated utility is not yet a painted
 * pixel — the class has to reach the element and survive the cascade. The dark-theme test is the
 * subtree-pinning proof, and it is worth being precise about what it shows: every one of these
 * tokens is declared ONCE, so none could resolve differently under a dark document theme even if
 * the console's porcelain pin failed. What it proves is the property the sites actually depend
 * on — that nothing in the cascade repaints them when the document theme changes — which is what
 * would break if a later slice gave one a dark override. The declaration guard in
 * `shared/class-o-tint-tokens.contrast.spec.ts` is what watches the override itself.
 * Rationale: docs/plans/class-o-opacity-modifier-tokens.md.
 */

/** The registry as `tailwind.css`'s base block declares it. Mirrors `testing/glass-tokens.ts`. */
const CLASS_O_TINTS = {
  '--riv-console-tint': '#0c2a33',
  '--riv-console-scrim': '#061e28',
  '--riv-select-tint': '#2bb8d4',
  '--riv-select-edge': '#0e8aa8',
  '--riv-alert-tint': '#a3160e',
  '--riv-warn-edge': '#d9861a',
  '--riv-warn-tint': '#f0aa2e',
  '--riv-positive-tint': '#0e6e46',
  '--riv-premium-edge': '#b47814',
  '--riv-confirm-warn-edge': '#e0a03a',
  '--riv-confirm-warn-fill': '#fff4e0',
  '--riv-confirm-warn-ink': '#7a4a08',
} as const;

/**
 * What the browser computes for the armed tool's fill, captured from the LITERAL form before the
 * migration. Pinned as the resolved `oklab(…)` rather than a hex, because that is the value the
 * outgoing `bg-[#2bb8d4]/20` produced — asserting the token's own hex here would prove the token
 * resolves while saying nothing about whether the paint moved, which is the whole claim.
 */
const ARMED_TOOL_FILL = 'oklab(0.723426 -0.0974235 -0.0681883 / 0.2)';

async function openBeachMap(page: Page): Promise<void> {
  await mockWholeConsole(page);
  await page.goto('/operator/1');
  await signInAsOperator(page);
  await page.goto('/operator/1/beach-map');
}

test.describe('the class-O tint tokens paint from the token registry', () => {
  test('every token is declared, and every utility built on it is generated', async ({ page }) => {
    await openBeachMap(page);

    const declared = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement);
      return names.map((name) => [name, root.getPropertyValue(name).trim()] as const);
    }, Object.keys(CLASS_O_TINTS));

    expect(Object.fromEntries(declared)).toEqual(CLASS_O_TINTS);

    // `@theme inline` writes no :root alias, so the emitted rules are the only evidence.
    const generated = await page.evaluate(() => {
      const selectors = new Set<string>();
      const walk = (rules: CSSRuleList): void => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) selectors.add(rule.selectorText);
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested) walk(nested);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      return [...selectors].filter((selector) => selector.includes('riv-'));
    });

    const missing = Object.keys(CLASS_O_TINTS)
      .map((name) => name.replace('--riv-', 'riv-'))
      .filter((token) => !generated.some((selector) => selector.includes(token)));

    expect(missing, 'tokens with no generated utility').toEqual([]);
  });

  test('the armed tool’s tint is byte-identical to its pre-token paint', async ({ page }) => {
    await openBeachMap(page);

    const tool = page.getByTestId('layout-tool-walkin');
    await tool.click();

    await expect(tool).toHaveAttribute('aria-pressed', 'true');
    await expect(tool).toHaveCSS('background-color', ARMED_TOOL_FILL);
  });

  test('the class-O tints hold under a forced dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openBeachMap(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const tool = page.getByTestId('layout-tool-walkin');
    await tool.click();
    await expect(tool).toHaveCSS('background-color', ARMED_TOOL_FILL);

    const stillPorcelain = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement);
      return names.map((name) => [name, root.getPropertyValue(name).trim()] as const);
    }, Object.keys(CLASS_O_TINTS));

    expect(Object.fromEntries(stillPorcelain)).toEqual(CLASS_O_TINTS);
  });
});
