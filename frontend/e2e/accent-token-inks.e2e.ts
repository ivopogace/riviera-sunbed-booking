import { expect, test, type Page } from '@playwright/test';

import { ADMIN, mockWholeAdminConsole } from './support/admin-console.mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The accent teal family paints from the token registry, asserted against a real render (#835) —
 * the positive-state counterpart to `admin-token-inks.e2e.ts`.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-accent-*` declared
 * without its `@theme inline` row generates no utility at all: the class stays in the markup, the
 * paint silently does not change, and nothing but a resolved value separates that from a working
 * token. The first test catches it for **all seven** tokens at once by asking whether Tailwind
 * generated the utility at all — checking the emitted rules rather than a `--color-riv-*` alias,
 * because `inline` is precisely the mode in which no such alias is written to `:root`. That is what
 * lets the rest of the file stay on the two families that are cheap to drive.
 *
 * <p>The last test pins the subtree resolution the family's correctness rests on: the nine migrated
 * console sites are safe on a THEMED token only because their console pins porcelain, so their inks
 * must survive a `dark` document theme. The unit contrast spec proves porcelain only, and cannot
 * see that.
 */

const ACCENT_INK = 'rgb(8, 90, 110)';
const ACCENT_FILL = 'rgba(43, 184, 212, 0.12)';
const ACCENT_BORDER = 'rgba(14, 138, 168, 0.35)';

/** Every token the slice registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-accent-fill': 'rgba(43, 184, 212, 0.12)',
  '--riv-accent-border': 'rgba(14, 138, 168, 0.35)',
  '--riv-accent-chip-fill': 'rgba(43, 184, 212, 0.18)',
  '--riv-accent-chip-border': 'rgba(14, 138, 168, 0.75)',
  '--riv-accent-track': 'rgba(43, 184, 212, 0.25)',
  '--riv-accent-strong': '#0e8aa8',
  '--riv-solid-btn-ink': '#0a4f5e',
} as const;

/** The utility each token is consumed through, which only exists if its `@theme inline` row does. */
const UTILITIES = [
  'bg-riv-accent-fill',
  'border-riv-accent-border',
  'bg-riv-accent-chip-fill',
  'border-riv-accent-chip-border',
  'border-riv-accent-track',
  'border-t-riv-accent-strong',
  'text-riv-solid-btn-ink',
];

async function signIn(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
}

/** Drives the Privacy tab through to the erasure success panel, animation settled. */
async function openErasureDone(page: Page): Promise<void> {
  await page.route(/\/api\/admin\/erasure$/, (route) => route.fulfill({ status: 204 }));
  await page.goto('/admin/privacy');
  await page.getByTestId('admin-privacy-email').fill('ana@example.com');
  await page.getByTestId('admin-privacy-review').click();
  await page.getByTestId('admin-privacy-confirm').click();

  const panel = page.getByTestId('admin-privacy-done-panel');
  await expect(panel).toBeVisible();
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.describe('the accent teal family paints from the token registry', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeAdminConsole(page);
    await signIn(page);
  });

  test('every registered token is declared and generates its utility', async ({ page }) => {
    await page.goto('/admin');

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

  test('the console accent ink resolves to the registered token value', async ({ page }) => {
    await page.goto('/admin/privacy');

    await expect(page.getByTestId('admin-tab-privacy')).toHaveCSS('color', ACCENT_INK);
  });

  test('the erasure success panel paints its tint, boundary and heading from the accent tokens', async ({
    page,
  }) => {
    await openErasureDone(page);

    const panel = page.getByTestId('admin-privacy-done-panel');
    await expect(panel).toHaveCSS('background-color', ACCENT_FILL);
    await expect(panel).toHaveCSS('border-top-color', ACCENT_BORDER);

    await expect(page.locator('#admin-privacy-done-heading')).toHaveCSS('color', ACCENT_INK);
  });

  test('the console keeps its porcelain accent ink under a dark document theme', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openErasureDone(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    await expect(page.locator('#admin-privacy-done-heading')).toHaveCSS('color', ACCENT_INK);
    await expect(page.getByTestId('admin-privacy-done-panel')).toHaveCSS(
      'background-color',
      ACCENT_FILL,
    );
  });
});
