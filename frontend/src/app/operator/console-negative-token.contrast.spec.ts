import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CONSOLE_NEGATIVE_INK,
  DARK_ERROR_INK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  SOLID_BTN_DANGER_INK,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * Guard for `--riv-console-negative-ink` (#864, class R of the colour-literal audit) — the
 * operator console's negative ink: the reversal net and its reason chip on the Payouts tab, and
 * the failed-check-in notice on the Daily view. The `negative` pole of the `--riv-console-*-ink`
 * pair whose accent pole #848 registered.
 *
 * <p>The sibling of `console-accent-token.contrast.spec.ts`, and deliberately a SEPARATE file
 * rather than a second half of it: the two tokens share a host, a surface and a theme-invariance
 * ground, but their role-distinctness arguments have nothing in common — that one separates three
 * roles carrying `#0a6e85`, this one separates a console ink from the outline BUTTON's ink and from
 * the `/opacity` tints of the same value that stay #852's.
 *
 * <p>What this file owns is the part no per-tab AA spec can see — that the token is a token, and
 * stays the one it claims to be. The ink is THEME-INVARIANT by decision rather than by omission:
 * every consumer is a child of `operator-console`, whose host pins porcelain, so a dark branch
 * would be unreachable by construction — and jsdom maths cannot see a dark override added later,
 * since every ratio in the tree would still pass. So the declaration tests read `src/tailwind.css`
 * as text (the `core/theme-boot.spec.ts` drift-guard pattern) and assert the declaration is single
 * and sits in the base block. The chip tint's own AA proof — the LOWEST-contrast pair of the three
 * sites, and lower than any raw stop below — stays where the element is, in
 * `payouts-tab.contrast.spec.ts`. The cross-theme proof against a real render, where the cascade
 * rather than a regex decides, is `e2e/console-negative-ink.e2e.ts`.
 */

/** Vitest runs with cwd = `frontend/`. */
const STYLESHEET = readFileSync(join(process.cwd(), 'src/tailwind.css'), 'utf8');

const TOKEN = '--riv-console-negative-ink';

/** The base block — `:root, [data-riv-theme='porcelain']`, the only legal home for the token. */
function baseBlock(): string {
  const open = STYLESHEET.indexOf("\n:root,\n[data-riv-theme='porcelain'] {");
  if (open === -1) {
    throw new Error('src/tailwind.css no longer opens its base block as `:root, porcelain`');
  }
  return STYLESHEET.slice(open, STYLESHEET.indexOf('\n}', open));
}

/** Every `--name: value;` declaration of `name`, anywhere in the stylesheet. */
function declarationsOf(name: string): readonly string[] {
  const pattern = new RegExp(`^[ \\t]*${name}:\\s*([^;]+);`, 'gm');
  return [...STYLESHEET.matchAll(pattern)].map((match) => match[1].trim());
}

/**
 * The `@theme inline` row that turns the token into the `text-riv-console-negative-ink` utility.
 * Without it the class lands in the markup and the paint silently does not change — the one
 * failure this whole slice risks, and the reason `console-negative-ink.e2e.ts` exists. Asserted
 * here too, because a unit test names the missing line while a render only shows a wrong colour.
 */
function themeRow(): readonly string[] {
  return declarationsOf(`--color-riv-console-negative-ink`);
}

/** The card-glass surface composited over a porcelain background stop. */
function cardSurface(stop: (typeof PORCELAIN_STOPS)[number]): string {
  return rgbToHex(surfaceOver(PORCELAIN_CARD_GLASS, stop));
}

describe('Console negative-ink token (theme invariance + role distinctness, #864)', () => {
  it('clears AA over every porcelain stop the console paints it on', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(rgbToHex(CONSOLE_NEGATIVE_INK), rgbToHex(stop)),
        `console negative over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('declares the token exactly once, so no theme block can override it', () => {
    expect(declarationsOf(TOKEN), `${TOKEN} declarations`).toHaveLength(1);
  });

  it('declares the token in the base block, which the console pin resolves', () => {
    expect(baseBlock(), `${TOKEN} in the base block`).toContain(`${TOKEN}:`);
  });

  it('declares the value this test mirror carries', () => {
    expect(declarationsOf(TOKEN)[0], TOKEN).toBe(rgbToHex(CONSOLE_NEGATIVE_INK));
  });

  it('maps the token in `@theme inline`, without which the utility never generates', () => {
    expect(themeRow(), 'the @theme inline row').toEqual([`var(${TOKEN})`]);
  });

  /**
   * Same colour, different role and different surface: this one is a console ink on card glass,
   * that one the outline button's ink pinned to the button's own fixed `#f4f6f7` fill (#851).
   * The audit's class R exists for exactly this, so the equality is asserted rather than left to
   * coincidence — and the two declarations are asserted to be two.
   */
  it('shares a value with the outline button’s danger ink while staying a separate declaration', () => {
    expect(rgbToHex(CONSOLE_NEGATIVE_INK)).toBe(rgbToHex(SOLID_BTN_DANGER_INK));
    expect(declarationsOf('--riv-solid-btn-danger-ink')).toHaveLength(1);
  });

  /**
   * The other tempting reuse — one of the THEMED reds — would hand the console `#ffa9a1` in the
   * dark theme. It lands far under AA on the card glass the console actually renders, so the two
   * roles were never shared. Kept in the tree so the reason survives the decision.
   */
  it('stays theme-invariant: the themed reds would not clear AA on the console’s own surface', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(rgbToHex(DARK_ERROR_INK), cardSurface(stop)),
        `the themed red's dark value over ${rgbToHex(stop)}`,
      ).toBeLessThan(AA_NORMAL);
    }
  });
});
