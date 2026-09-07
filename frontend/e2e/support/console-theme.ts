import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * The console's two themes in the mocked suite. The `console-dark` project (`playwright.a11y.config.ts`)
 * seeds the console's storage key through its `storageState`, so the same themed-paint test runs
 * under `chromium` expecting porcelain's values and under `console-dark` expecting dark's — one
 * test proves both "differs" and "unchanged".
 */
export type ConsoleThemeName = 'porcelain' | 'dark';

export const CONSOLE_DARK_PROJECT = 'console-dark';

/** The console theme the running project seeded: dark under `console-dark`, porcelain elsewhere. */
export function consoleThemeOf(testInfo: TestInfo): ConsoleThemeName {
  return testInfo.project.name === CONSOLE_DARK_PROJECT ? 'dark' : 'porcelain';
}

/** `--riv-console-inset` per theme — the base behind every `bg-riv-console-inset/α` fill. */
const INSET_BASE: Record<ConsoleThemeName, string> = { porcelain: '#ffffff', dark: '#020a16' };

/** `--riv-card-ink` per theme, as Chromium serializes an opaque colour. */
export const CARD_INK: Record<ConsoleThemeName, string> = {
  porcelain: 'rgb(10, 42, 51)',
  dark: 'rgb(242, 247, 250)',
};

/** `--riv-error-ink` per theme. */
export const ERROR_INK: Record<ConsoleThemeName, string> = {
  porcelain: 'rgb(163, 22, 14)',
  dark: 'rgb(255, 169, 161)',
};

/** `--riv-premium-ink` per theme — the numeral over the premium cell's gold. */
export const PREMIUM_INK: Record<ConsoleThemeName, string> = {
  porcelain: 'rgb(10, 42, 51)',
  dark: 'rgb(242, 212, 140)',
};

/** `--riv-select-tint` per theme — the armed tool chip's fill base. */
export const SELECT_TINT: Record<ConsoleThemeName, string> = {
  porcelain: '#2bb8d4',
  dark: '#7cd7e8',
};

/**
 * A colour expression's computed value, resolved by the browser running the test rather than
 * pinned as a string: Chromium serializes `color-mix(in oklab, …)` as `oklab(L a b / α)` with
 * build-dependent float precision, so a captured snapshot is not portable across Chromium builds.
 */
export async function probePaint(page: Page, expression: string): Promise<string> {
  return page.evaluate((literal) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = literal;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, expression);
}

/** What `bg-riv-<token>/<alpha>` paints for a given base colour, resolved by the browser under test. */
export async function tintPaint(page: Page, base: string, alphaPercent: number): Promise<string> {
  return probePaint(page, `color-mix(in oklab, ${base} ${alphaPercent}%, transparent)`);
}

/** Asserts a `bg-riv-console-inset/<alpha>` fill paints the running theme's inset. */
export async function expectInsetFill(
  page: Page,
  locator: Locator,
  alphaPercent: number,
  theme: ConsoleThemeName,
): Promise<void> {
  await expect(locator).toHaveCSS(
    'background-color',
    await tintPaint(page, INSET_BASE[theme], alphaPercent),
  );
}

/** Asserts the console host — the app shell — wears the given console theme. */
export async function expectConsoleTheme(page: Page, theme: ConsoleThemeName): Promise<void> {
  await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', theme);
}
