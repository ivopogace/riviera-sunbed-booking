import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The operator console's negative ink paints from the token registry (#864) — the class-R sibling
 * of `console-accent-ink.e2e.ts`, and the same kind of proof for the other pole of the
 * `--riv-console-*-ink` pair.
 *
 * <p><strong>These are guards, not red-first drivers.</strong> The three migrated positions moved
 * from `text-[#a3372a]` to `text-riv-console-negative-ink`, and `--riv-console-negative-ink` IS
 * `#a3372a`, so the computed value is identical before and after. What they catch is the one
 * failure the substitution can still produce, and that no unit spec can see: a token consumed
 * through a utility that was never generated, because the `@theme inline` row is missing. The
 * class lands in the markup, `color` silently keeps its inherited value, and only a resolved
 * computed style separates that from a working token.
 *
 * <p>Two tabs are driven rather than one. They are separately lazy-loaded route children, so one
 * resolving is not evidence about the other — and here the two sites are also reached differently:
 * the payouts net needs a ledger carrying a REVERSAL, while the daily-view notice is reached
 * without any server call at all, by submitting something that is not a booking code.
 *
 * <p>The dark-theme test is the subtree-pinning proof, and it is worth being precise about what it
 * does and does not show. This token is declared ONCE, so it could not resolve differently under a
 * dark document theme even if the pin failed; the test therefore cannot, by itself, distinguish
 * this token from a themed one. What it does prove is the property the three sites actually depend
 * on — that nothing in the cascade repaints the console's negative ink when the document theme
 * changes — which is exactly what would break if a later slice gave the token a dark override and
 * the console stopped pinning porcelain. Both sites carry their own dark-theme test, for the same
 * reason the porcelain ones are separate: independent lazy route children. The declaration guard in
 * `operator/console-negative-token.contrast.spec.ts` is what watches the override itself.
 * Rationale: docs/plans/console-negative-ink-token.md.
 */

/** `--riv-console-negative-ink` as the base block declares it — the console pin keeps it in force. */
const CONSOLE_NEGATIVE_INK = 'rgb(163, 55, 42)';

/** The utility the three sites are consumed through — it exists only if the `@theme inline` row does. */
const UTILITY = 'text-riv-console-negative-ink';

/** Not a booking code, so the panel reports it without reaching the server (`daily-view-tab.ts`). */
const NOT_A_BOOKING_CODE = 'https://example.com/not-a-booking';

/** The shared console mock serves an accrual-only ledger; the negative ink needs a REVERSAL row. */
async function mockReversalLedger(page: Page): Promise<void> {
  await page.route(/\/api\/venues\/1\/payout-ledger$/, (route) =>
    route.fulfill({
      json: {
        venueId: 1,
        currency: 'EUR',
        netOwedMinor: 1000,
        entries: [
          {
            type: 'REVERSAL',
            bookingId: 13,
            grossMinor: 2500,
            commissionMinor: 375,
            netMinor: 2125,
            currency: 'EUR',
            reason: 'WEATHER',
            createdAt: '2026-07-03T09:00:00Z',
            runningNetMinor: 1000,
          },
        ],
      },
    }),
  );
}

async function openConsoleTab(page: Page, tab: string): Promise<void> {
  await mockWholeConsole(page);
  await mockReversalLedger(page);
  await page.goto('/operator/1');
  await signInAsOperator(page);
  await page.goto(`/operator/1/${tab}`);
}

test.describe('the operator console negative ink paints from the token registry', () => {
  test('the token is declared and its utility is generated', async ({ page }) => {
    await openConsoleTab(page, 'payouts');

    const declared = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--riv-console-negative-ink')
        .trim(),
    );
    expect(declared, '--riv-console-negative-ink declared').toBe('#a3372a');

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

  test('the reversal net resolves to the registered token value', async ({ page }) => {
    await openConsoleTab(page, 'payouts');

    const net = page.getByTestId('ledger-net');
    await expect(net).toBeVisible();
    await expect(net).toHaveClass(new RegExp(UTILITY));
    await expect(net).toHaveCSS('color', CONSOLE_NEGATIVE_INK);
  });

  test('the reversal reason chip keeps its own tints while its ink resolves from the token', async ({
    page,
  }) => {
    await openConsoleTab(page, 'payouts');

    const chip = page.getByTestId('ledger-reason');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveCSS('color', CONSOLE_NEGATIVE_INK);

    // v4 renders `/opacity` as `color-mix(in oklab, …)` on hex or token alike — pin #852's alpha.
    const tint = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tint, 'the chip tint').toMatch(/\/ 0\.12\)$/);
  });

  test('the failed check-in notice resolves to the registered token value', async ({ page }) => {
    await openConsoleTab(page, 'daily');

    await page.getByTestId('checkin-code-input').fill(NOT_A_BOOKING_CODE);
    await page.getByTestId('checkin-submit').click();

    const notice = page.getByTestId('checkin-result');
    await expect(notice).toContainText('booking code');
    await expect(notice).toHaveCSS('color', CONSOLE_NEGATIVE_INK);
  });

  test('the payouts net keeps its porcelain negative ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openConsoleTab(page, 'payouts');

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await expect(page.getByTestId('ledger-net')).toHaveCSS('color', CONSOLE_NEGATIVE_INK);
  });

  test('the check-in notice keeps its porcelain negative ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openConsoleTab(page, 'daily');

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
    await page.getByTestId('checkin-code-input').fill(NOT_A_BOOKING_CODE);
    await page.getByTestId('checkin-submit').click();

    await expect(page.getByTestId('checkin-result')).toHaveCSS('color', CONSOLE_NEGATIVE_INK);
  });
});
