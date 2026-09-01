import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The solid button/badge fills paint from the token registry, asserted against a real render (#854)
 * — the third of the audit's theme-invariant families, after `form-error-token-skin.e2e.ts` and
 * `solid-btn-token-skin.e2e.ts`.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-solid-fill-*` declared
 * without its `@theme inline` row generates no utility at all: the class stays in the markup, the
 * paint silently does not change, and nothing but a resolved value separates that from a working
 * token. The first test catches that for the whole family by asking whether Tailwind emitted the rule.
 *
 * <p><strong>Where the forced-dark proof lives, and why not on the confirm button.</strong> The
 * issue asks for the cross-theme assertion on a rendered confirm button, because `ConfirmPanel`
 * lives in `shared/` and its host theme varies with whoever mounts it. Today it does not vary:
 * every mount (including the `warn`-tone pair added at #881) is inside `operator-console`, which
 * pins `data-riv-theme="porcelain"` on its own host and so re-scopes every `--riv-*` token for
 * that subtree. A confirm button asserted under a
 * forced `dark` document would therefore hold its fill EVEN IF the token had a dark override —
 * proof of the pin, not of the family.
 *
 * <p>So the forced-dark assertion goes where the same token is mounted on a surface that does
 * follow the document theme: `semantic-chip`, the family's other `shared/` consumer, on the
 * discovery cards. That test can actually die, and was mutation-checked against a dark override
 * before landing. The console keeps its own assertions in the light — what they prove is that the
 * fills paint from the tokens at all, which is the other half.
 */

/** One teal since #861, so the console button and the discovery chip assert the SAME triple. */
const BRAND = 'rgb(10, 110, 133)';
const BRAND_HOVER = 'rgb(10, 94, 114)';
const DANGER = 'rgb(163, 22, 14)';
/** The console confirm buttons' darkened amber (#881) — `shared/confirm-panel`'s `warn` tone. */
const WARN = 'rgb(154, 100, 16)';
const WHITE = 'rgb(255, 255, 255)';

/** Every token the family registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-solid-fill-brand': '#0a6e85',
  '--riv-solid-fill-brand-hover': '#0a5e72',
  '--riv-solid-fill-danger': '#a3160e',
  '--riv-solid-fill-warn': '#9a6410',
} as const;

/**
 * The utility each token is consumed through, which only exists if its `@theme inline` row does.
 * The hover fill is deliberately absent: it compiles to `.hover\:bg-…:hover`, not a bare class
 * selector, so it is proven where it actually matters — the hovered box, in the console test.
 */
const UTILITIES = ['bg-riv-solid-fill-brand', 'bg-riv-solid-fill-danger', 'bg-riv-solid-fill-warn'];

/** One venue card, enough for the discovery grid to render its semantic mode chip. */
const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    amenities: ['WIFI'],
    distanceToWaterM: 15,
    availability: { free: 18, total: 24 },
    salesOpen: true,
  },
];

async function openDiscovery(page: Page): Promise<void> {
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.goto('/');
  await expect(page.getByTestId('venue-card').first()).toBeVisible();
}

async function openConsoleTab(page: Page, tab: string): Promise<void> {
  await page.goto(`/operator/1/${tab}`);
  await signInAsOperator(page);
}

test.describe('the solid fill family paints from the token registry', () => {
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

  test('the brand fill paints the semantic chip on a theme-following surface', async ({ page }) => {
    await openDiscovery(page);

    const chip = page.getByTestId('venue-card').first().locator('.mode-chip');
    await expect(chip).toHaveCSS('background-color', BRAND);
    await expect(chip).toHaveCSS('color', WHITE);
  });

  test('and does not move under a dark document theme', async ({ page }) => {
    // The falsifiable one: nothing pins this subtree, so a dark override on the token lands here.
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openDiscovery(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const chip = page.getByTestId('venue-card').first().locator('.mode-chip');
    await expect(chip).toHaveCSS('background-color', BRAND);
    await expect(chip).toHaveCSS('color', WHITE);
  });

  test('the console paints the brand fill, hover included', async ({ page }) => {
    await mockWholeConsole(page);
    await openConsoleTab(page, 'requests');

    const accept = page.getByRole('button', { name: /Accept/ }).first();
    await expect(accept).toHaveCSS('background-color', BRAND);
    await expect(accept).toHaveCSS('color', WHITE);

    await page.goto('/operator/1/payouts');

    // The hover fill is the one position no bare class selector proves — it needs the hovered box.
    const statement = page.getByTestId('statement-open');
    await expect(statement).toHaveCSS('background-color', BRAND);
    await statement.hover();
    await expect(statement).toHaveCSS('background-color', BRAND_HOVER);
  });

  test('the console paints the danger fill and the shared confirm panel the brand fill', async ({
    page,
  }) => {
    await mockWholeConsole(page);
    await openConsoleTab(page, 'requests');

    await page
      .getByRole('button', { name: /Decline/ })
      .first()
      .click();
    const confirmDecline = page.getByRole('button', { name: 'Confirm decline' });
    await expect(confirmDecline).toHaveCSS('background-color', DANGER);
    await expect(confirmDecline).toHaveCSS('color', WHITE);

    // ConfirmPanel itself, mounted by the layout editor on its `primary` tone.
    await page.goto('/operator/1/beach-map');
    await expect(page.getByTestId('layout-editor')).toBeVisible();
    await page.getByTestId('layout-gen-rows').fill('1');
    await page.getByTestId('layout-gen-cols').fill('1');
    await page.getByTestId('layout-generate').click();

    const confirmRegen = page.getByTestId('layout-confirm-yes');
    await expect(confirmRegen).toHaveCSS('background-color', BRAND);
    await expect(confirmRegen).toHaveCSS('color', WHITE);
  });

  test('the shared confirm panel paints the warn fill on the close-sales confirm (#881)', async ({
    page,
  }) => {
    await mockWholeConsole(page);
    await openConsoleTab(page, 'daily');

    await page.getByTestId('daily-close-sales').click();
    const confirmClose = page.getByTestId('daily-close-sales-confirm');
    await expect(confirmClose).toHaveCSS('background-color', WARN);
    await expect(confirmClose).toHaveCSS('color', WHITE);
  });
});
