import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render proof for the Fit/100% zoom toggle's per-theme tokens (#870, class F) — the
 * class-F counterpart to `fixed-fill-state-skins.e2e.ts`, for a family that themes rather than
 * staying invariant. Two failures live here and nowhere else (that file's header explains why):
 * a token declared without its `@theme inline` row generates no utility at all, and the cascade
 * under a REAL theme is not something the unit contrast spec — which reads `tailwind.css` as
 * text — can see.
 *
 * <p>The toggle's only current consumer is `operator/layout-editor.html`, inside the always-
 * porcelain operator console (`operator-console.ts`'s own `data-riv-theme="porcelain"` host
 * pin), so the dark branch is never reachable through a real render today. The first test proves
 * the dark declaration exists and resolves correctly at the document root regardless — the same
 * proof the shared canvas's own doc comment relies on ("the wash's colours are the `--riv-map-*`
 * theme tokens… declared per theme"); the second proves the real, reachable porcelain render.
 */

const REGISTRY = {
  porcelain: {
    '--riv-map-zoom-selected-fill': 'rgba(255, 255, 255, 0.8)',
    '--riv-map-zoom-selected-border': '#0e7a89',
    '--riv-map-zoom-selected-ink': '#0a2a33',
    '--riv-map-zoom-idle-fill': 'rgba(255, 255, 255, 0.6)',
    '--riv-map-zoom-idle-border': 'rgba(12, 42, 51, 0.55)',
    '--riv-map-zoom-idle-ink': '#0a4f5e',
  },
  dark: {
    '--riv-map-zoom-selected-fill': 'rgba(255, 255, 255, 0.16)',
    '--riv-map-zoom-selected-border': '#8fd6e2',
    '--riv-map-zoom-selected-ink': '#8fd6e2',
    '--riv-map-zoom-idle-fill': 'rgba(255, 255, 255, 0.1)',
    '--riv-map-zoom-idle-border': 'rgba(255, 255, 255, 0.45)',
    '--riv-map-zoom-idle-ink': '#9adde8',
  },
} as const;

type TokenName = keyof (typeof REGISTRY)['porcelain'];

const UTILITIES = [
  'bg-riv-map-zoom-selected-fill',
  'border-riv-map-zoom-selected-border',
  'text-riv-map-zoom-selected-ink',
  'bg-riv-map-zoom-idle-fill',
  'border-riv-map-zoom-idle-border',
  'text-riv-map-zoom-idle-ink',
];

async function forceTheme(page: Page, theme: 'porcelain' | 'dark'): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('riviera-theme', value), theme);
}

for (const theme of ['porcelain', 'dark'] as const) {
  test(`the zoom-toggle tokens are declared and generate their utilities under ${theme} (#870)`, async ({
    page,
  }) => {
    await forceTheme(page, theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);

    const declared = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return names.map((name) => [name, style.getPropertyValue(name).trim()] as const);
    }, Object.keys(REGISTRY[theme]));

    for (const [name, value] of declared) {
      expect(value, `${name} declared`).toBe(REGISTRY[theme][name as TokenName]);
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
}

test('the zoom toggle paints the registered porcelain pair on a real render, both states (#870)', async ({
  page,
}) => {
  await mockWholeConsole(page);
  await page.goto('/operator/1/beach-map');
  await signInAsOperator(page);
  // The zoom toggle lives on the brush-paint canvas, not the default Select-tool one.
  await page.getByTestId('layout-tool-walkin').click();

  const fit = page.getByTestId('zoom-fit');
  const full = page.getByTestId('zoom-100');
  await expect(fit).toBeVisible();

  // Fit is selected by default.
  await expect(fit).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.8)');
  await expect(fit).toHaveCSS('border-color', 'rgb(14, 122, 137)');
  await expect(fit).toHaveCSS('color', 'rgb(10, 42, 51)');
  await expect(full).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.6)');
  await expect(full).toHaveCSS('border-color', 'rgba(12, 42, 51, 0.55)');
  await expect(full).toHaveCSS('color', 'rgb(10, 79, 94)');

  // The pair moves whole to the other state, not one branch of the ternary at a time.
  await full.click();
  await expect(full).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.8)');
  await expect(full).toHaveCSS('border-color', 'rgb(14, 122, 137)');
  await expect(full).toHaveCSS('color', 'rgb(10, 42, 51)');
  await expect(fit).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.6)');
  await expect(fit).toHaveCSS('border-color', 'rgba(12, 42, 51, 0.55)');
  await expect(fit).toHaveCSS('color', 'rgb(10, 79, 94)');
});
