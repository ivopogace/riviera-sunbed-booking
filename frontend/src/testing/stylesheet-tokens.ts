import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads `src/tailwind.css` **as text**, for the token guards that have to see what jsdom cannot.
 *
 * <p>A theme-invariant token is a decision, not an omission, and the decision is only kept by the
 * declaration staying single: a dark override added later would leave every contrast ratio in the
 * guarding spec passing, because those ratios are computed from the mirror rather than the cascade.
 * So the guards assert over the stylesheet source — the `core/theme-boot.spec.ts` drift-guard
 * pattern. The complementary proof, where the cascade itself decides, is always a mocked e2e.
 *
 * <p>Extracted at the sixth byte-identical copy (#858): `form-error-tokens`, `solid-btn-tokens`,
 * `solid-fill-tokens`, `console-accent-token` and `console-negative-token` each carried their own.
 */

/** Vitest runs with cwd = `frontend/`. */
export const STYLESHEET = readFileSync(join(process.cwd(), 'src/tailwind.css'), 'utf8');

/**
 * The base block — `:root, [data-riv-theme='porcelain']`, the only legal home for a token that must
 * resolve identically in all three themes. Throws rather than silently matching nothing if the
 * stylesheet is restructured, so a guard cannot pass by looking at an empty string.
 */
export function baseBlock(): string {
  const open = STYLESHEET.indexOf("\n:root,\n[data-riv-theme='porcelain'] {");
  if (open === -1) {
    throw new Error('src/tailwind.css no longer opens its base block as `:root, porcelain`');
  }
  return STYLESHEET.slice(open, STYLESHEET.indexOf('\n}', open));
}

/**
 * A theme's override block — `[data-riv-theme='<theme>'] { … }` — where a themed token declares
 * the value that theme paints. Throws rather than matching nothing if the block is missing.
 */
export function themeBlock(theme: 'riviera' | 'dark'): string {
  const open = STYLESHEET.indexOf(`\n[data-riv-theme='${theme}'] {`);
  if (open === -1) {
    throw new Error(`src/tailwind.css declares no [data-riv-theme='${theme}'] block`);
  }
  return STYLESHEET.slice(open, STYLESHEET.indexOf('\n}', open));
}

/** Every `--name: value;` declaration of `name`, anywhere in the stylesheet. */
export function declarationsOf(name: string): readonly string[] {
  const pattern = new RegExp(String.raw`^[ \t]*${name}:\s*([^;]+);`, 'gm');
  return [...STYLESHEET.matchAll(pattern)].map((match) => match[1].trim());
}

/**
 * The `@layer base { … }` block, where the stylesheet's element defaults live. Brace-counted,
 * because the block nests rules; throws rather than matching nothing if the block is missing.
 */
export function baseLayerBlock(): string {
  const open = STYLESHEET.indexOf('\n@layer base {');
  if (open === -1) {
    throw new Error('src/tailwind.css declares no `@layer base` block');
  }
  let depth = 0;
  for (let i = STYLESHEET.indexOf('{', open); i < STYLESHEET.length; i++) {
    if (STYLESHEET[i] === '{') depth++;
    if (STYLESHEET[i] === '}' && --depth === 0) {
      return STYLESHEET.slice(open, i + 1);
    }
  }
  throw new Error('src/tailwind.css leaves its `@layer base` block unclosed');
}
