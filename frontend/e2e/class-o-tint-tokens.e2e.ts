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
 * <p>The registry test drives every token at once rather than one element each. That is deliberate:
 * the failure it hunts is per-TOKEN (a missing `@theme inline` row), not per-element, so one
 * navigation per token would prove the same thing N times over while making the suite the reason
 * nobody adds the next one. Counted in the map rather than in this sentence on purpose — #879 took
 * the registry from twelve tokens to ten by merging the ambers, which would have falsified a
 * spelled-out number here.
 *
 * <p>The paint tests then drive real elements, because a generated utility is not yet a painted
 * pixel — the class has to reach the element and survive the cascade. The dark-theme test is the
 * subtree-pinning proof, and it is worth being precise about what it shows: every one of these
 * tokens is declared ONCE, so none could resolve differently under a dark document theme even if
 * the console's porcelain pin failed. What it proves is the property the sites actually depend
 * on — that nothing in the cascade repaints them when the document theme changes — which is what
 * would break if a later slice gave one a dark override. The declaration guard in
 * `shared/class-o-tint-tokens.contrast.spec.ts` is what watches the override itself.
 * Rationale: #852 (PR #878).
 */

/** The registry as `tailwind.css`'s base block declares it. Mirrors `testing/glass-tokens.ts`. */
const CLASS_O_TINTS = {
  '--riv-console-tint': '#0c2a33',
  '--riv-console-scrim': '#061e28',
  '--riv-select-tint': '#2bb8d4',
  '--riv-select-edge': '#0e8aa8',
  '--riv-alert-tint': '#a3160e',
  /**
   * The merged amber family (#879): `--riv-warn-tint` and `--riv-confirm-warn-*` collapsed into
   * these, together with class F-4's `--riv-notice-banner-*`. Its own AA, invariance and
   * retired-name proofs are `shared/warn-token-skin.contrast.spec.ts` + `e2e/warn-token-skin.e2e.ts`;
   * what it owes HERE is only what every class-O token owes — a declaration and a generated utility.
   */
  '--riv-warn-edge': '#e0a03a',
  '--riv-warn-fill': '#fff4e0',
  '--riv-warn-ink': '#7a4a08',
  '--riv-positive-tint': '#0e6e46',
  '--riv-premium-edge': '#b47814',
} as const;

/** The exact expression the armed tool carried before the migration: `bg-[#2bb8d4]/20`. */
const OUTGOING_LITERAL = 'color-mix(in oklab, #2bb8d4 20%, transparent)';

/**
 * The outgoing literal's computed value, resolved by **the browser running this test** rather than
 * pinned as a string. That distinction is the test, not a detail: Chromium serializes a
 * `color-mix(in oklab, …)` as `oklab(L a b / α)` with full float precision, and the digits differ
 * between builds — a value captured on one Chromium reads
 * `oklab(0.723426 -0.0974235 -0.0681883 / 0.2)` and on another
 * `oklab(0.723439 -0.0974177 -0.068208 / 0.2)`. Both are the same colour; neither is portable.
 *
 * <p>Comparing against a live probe asserts what the slice actually claims — that the token form
 * paints what the literal form painted — in whatever browser is asked, instead of asserting that
 * one build's float formatting has not changed. Pinning the snapshot cost a red CI run first.
 */
async function probePaint(page: Page, expression: string): Promise<string> {
  return page.evaluate((literal) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = literal;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, expression);
}

async function outgoingLiteralPaint(page: Page): Promise<string> {
  return probePaint(page, OUTGOING_LITERAL);
}

/**
 * What `bg-riv-<token>/<alpha>` paints, resolved by the browser under test — the same live-probe
 * discipline as `outgoingLiteralPaint`, generalized so the ladder's before/after pairs can both be
 * asked for. Never pin either side as a string: Chromium serializes `color-mix(in oklab, …)` with
 * build-dependent float precision, so a captured snapshot is not portable across Chromium builds.
 */
async function tintPaint(page: Page, base: string, alphaPercent: number): Promise<string> {
  return probePaint(page, `color-mix(in oklab, ${base} ${alphaPercent}%, transparent)`);
}

/**
 * One ladder move (#879): a position's computed paint must equal its NEW alpha and differ from its
 * OLD one. Asserting both halves is what makes this a before/after diff rather than a restatement
 * of the source — an assertion that only checked the new value would pass just as well against a
 * site nobody moved, and the whole proof class O owed for option C is that the pixels moved where
 * the ledger says they moved and nowhere else.
 */
async function expectLadderMove(
  page: Page,
  locator: ReturnType<Page['locator']>,
  property: string,
  base: string,
  { from, to }: { from: number; to: number },
): Promise<void> {
  await expect(locator).toHaveCSS(property, await tintPaint(page, base, to));
  expect(await tintPaint(page, base, from)).not.toBe(await tintPaint(page, base, to));
}

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
    await expect(tool).toHaveCSS('background-color', await outgoingLiteralPaint(page));
  });

  /**
   * The ladder's before/after diff on the payout statement (#879) — the surface that carried the
   * worst of the drift rule B preserved: five of the nine off-ladder positions were in this one
   * modal, at `/4 /7 /12 /14` of `--riv-console-tint` plus `/6` of `--riv-select-tint`.
   *
   * <p>Selected by semantic structure (`thead`, `tbody tr`, the wrapper that has the table) rather
   * than by adding six `data-testid`s to a table that needs none — the elements a statement is made
   * of are stable in a way an added hook would only restate.
   */
  test('the ladder-moved positions paint their new alpha on the payout statement', async ({
    page,
  }) => {
    await mockWholeConsole(page);
    await page.goto('/operator/1');
    await signInAsOperator(page);
    await page.goto('/operator/1/payouts');

    await page.getByTestId('statement-open').click();
    const statement = page.getByTestId('payout-statement');
    await expect(statement).toBeVisible();

    const tint = CLASS_O_TINTS['--riv-console-tint'];

    await expectLadderMove(page, page.getByTestId('statement-close'), 'border-top-color', tint, {
      from: 14,
      to: 15,
    });
    await expectLadderMove(page, statement.locator('div:has(> table)'), 'border-top-color', tint, {
      from: 12,
      to: 15,
    });
    await expectLadderMove(page, statement.locator('thead tr'), 'background-color', tint, {
      from: 4,
      to: 5,
    });
    await expectLadderMove(page, statement.locator('tbody tr').first(), 'border-top-color', tint, {
      from: 7,
      to: 10,
    });

    const totalRow = statement.locator('tbody tr').last();
    await expectLadderMove(page, totalRow, 'border-top-color', tint, { from: 14, to: 15 });
    await expectLadderMove(page, totalRow, 'background-color', CLASS_O_TINTS['--riv-select-tint'], {
      from: 6,
      to: 5,
    });
  });

  /**
   * The Requests tab's accepted medallion, the ladder's one move outside the console's neutral and
   * selection chrome (#879). Its border is `/30` and stays — only the fill moved — which is the
   * shape the ladder is meant to produce: a position moves because its alpha was invented, not
   * because its neighbour moved.
   */
  test('the ladder-moved medallion fill paints its new alpha', async ({ page }) => {
    await mockWholeConsole(page);
    await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto('/operator/1');
    await signInAsOperator(page);
    await page.goto('/operator/1/requests');

    const medallion = page.getByTestId('requests-empty').locator('span.rounded-full').first();
    await expect(medallion).toBeVisible();

    const positive = CLASS_O_TINTS['--riv-positive-tint'];
    await expectLadderMove(page, medallion, 'background-color', positive, { from: 12, to: 10 });
    await expect(medallion).toHaveCSS('border-top-color', await tintPaint(page, positive, 30));
  });

  test('the class-O tints hold under a forced dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openBeachMap(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const tool = page.getByTestId('layout-tool-walkin');
    await tool.click();
    await expect(tool).toHaveCSS('background-color', await outgoingLiteralPaint(page));

    const stillPorcelain = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement);
      return names.map((name) => [name, root.getPropertyValue(name).trim()] as const);
    }, Object.keys(CLASS_O_TINTS));

    expect(Object.fromEntries(stillPorcelain)).toEqual(CLASS_O_TINTS);
  });
});
