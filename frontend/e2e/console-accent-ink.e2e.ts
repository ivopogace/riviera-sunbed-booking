import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The operator console's accent ink paints from the token registry (#848) — the T-2 counterpart to
 * `operator-error-ink.e2e.ts`, and the same kind of proof for the opposite kind of token.
 *
 * <p><strong>These are guards, not red-first drivers.</strong> The twelve migrated positions moved
 * from `text-[#0a6e85]` to `text-riv-console-accent-ink`, and `--riv-console-accent-ink` IS
 * `#0a6e85`, so the computed value is identical before and after. What they catch is the one
 * failure the substitution can still produce, and that no unit spec can see: a token consumed
 * through a utility that was never generated — because the `@theme inline` row is missing. The
 * class lands in the markup, `color` silently keeps its inherited value, and only a resolved
 * computed style separates that from a working token.
 *
 * <p>Two tabs are driven rather than one. They are separately lazy-loaded route children, so one
 * resolving is not evidence about the other. Unlike #855's spec there is only one HOST: all twelve
 * sites are children of `operator-console`, and `operator-home` carries none of them — so the
 * second host that spec drives has no counterpart here.
 *
 * <p>The dark-theme test is the subtree-pinning proof, and it is worth being precise about what it
 * does and does not show. This token is declared ONCE, so it could not resolve differently under a
 * dark document theme even if the pin failed; the test therefore cannot, by itself, distinguish
 * this token from a themed one. What it does prove is the property the twelve sites actually
 * depend on — that nothing in the cascade repaints the console's ink when the document theme
 * changes — which is exactly what would break if a later slice gave the token a dark override and
 * the console stopped pinning porcelain. The declaration guard in
 * `operator/console-accent-token.contrast.spec.ts` is what watches the override itself.
 * Rationale: #848.
 */

/** `--riv-console-accent-ink` as the base block declares it — the console pin keeps it in force. */
const CONSOLE_ACCENT_INK = 'rgb(10, 110, 133)';

/** The utility the twelve sites are consumed through — it exists only if the `@theme inline` row does. */
const UTILITY = 'text-riv-console-accent-ink';

async function openConsoleTab(page: Page, tab: string): Promise<void> {
  await mockWholeConsole(page);
  await page.goto('/operator/1');
  await signInAsOperator(page);
  await page.goto(`/operator/1/${tab}`);
}

test.describe('the operator console accent ink paints from the token registry', () => {
  test('the token is declared and its utility is generated', async ({ page }) => {
    await openConsoleTab(page, 'payouts');

    const declared = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--riv-console-accent-ink')
        .trim(),
    );
    expect(declared, '--riv-console-accent-ink declared').toBe('#0a6e85');

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

  test('the payouts owed figure resolves to the registered token value', async ({ page }) => {
    await openConsoleTab(page, 'payouts');

    const owed = page.getByTestId('payout-owed');
    await expect(owed).toBeVisible();
    await expect(owed).toHaveClass(new RegExp(UTILITY));
    await expect(owed).toHaveCSS('color', CONSOLE_ACCENT_INK);
  });

  test('the pricing projected figure resolves to the registered token value', async ({ page }) => {
    await openConsoleTab(page, 'pricing');

    const projected = page.getByTestId('pricing-projected');
    await expect(projected).toBeVisible();
    await expect(projected).toHaveClass(new RegExp(UTILITY));
    await expect(projected).toHaveCSS('color', CONSOLE_ACCENT_INK);
  });

  test('the console keeps its porcelain accent ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openConsoleTab(page, 'payouts');

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.getByTestId('payout-owed')).toHaveCSS('color', CONSOLE_ACCENT_INK);
  });
});
