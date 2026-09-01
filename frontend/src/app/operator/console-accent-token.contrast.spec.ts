import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CONSOLE_ACCENT_INK,
  DARK_POP_ACCENT,
  PORCELAIN_STOPS,
  SOLID_FILL_BRAND,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-console-accent-ink` (#848, class T of the colour-literal audit) — the operator
 * console's accent ink: prices, projected takings, the owed/net payout figures, the commission
 * chip and the per-tab "Saved" notices, twelve positions across eight console files.
 *
 * <p>The AA maths per surface is NOT here: the six operator `*.contrast.spec.ts` files already
 * assert it tab by tab, and now read this token from the shared mirror. A seventh consolidated
 * copy would restate six passing assertions. What this file owns is the part none of them can
 * see — that the token is a token, and stays the one it claims to be.
 *
 * <p>Which is three separate claims. First, the ink is THEME-INVARIANT by decision rather than by
 * omission: every consumer is a child of `operator-console`, whose host pins porcelain, so a dark
 * branch would be unreachable by construction — and jsdom maths cannot see a dark override added
 * later, since every ratio in the tree would still pass. So the declaration tests read
 * `src/tailwind.css` as text (the `core/theme-boot.spec.ts` drift-guard pattern, as
 * `booking/form-error-tokens.contrast.spec.ts` applies it) and assert the declaration is single
 * and sits in the base block. Second, that its value is what this mirror says. Third — the reason
 * the token exists at all — that it stays DISTINGUISHABLE from the two registered tokens carrying
 * the same value in different roles: `--riv-solid-fill-brand` (a fill under fixed white ink,
 * #854/#861) and `--riv-pop-accent` (the popover accent, which themes to `#7cd7e8`). Same value,
 * three roles. The cross-theme proof against a real render — where the cascade, not a regex,
 * decides — is `e2e/console-accent-ink.e2e.ts`.
 */

const TOKEN = '--riv-console-accent-ink';

/**
 * The `@theme inline` row that turns the token into the `text-riv-console-accent-ink` utility.
 * Without it the class lands in the markup and the paint silently does not change — the one
 * failure this whole slice risks, and the reason `console-accent-ink.e2e.ts` exists. Asserted
 * here too, because a unit test names the missing line while a render only shows a wrong colour.
 */
function themeRow(): readonly string[] {
  return declarationsOf(`--color-riv-console-accent-ink`);
}

/**
 * This token's literal, matched **by role rather than by value**. `#0a6e85` is emphatically not
 * ours alone — it is `--riv-solid-fill-brand`'s and `--riv-pop-accent`'s declared value, it paints
 * `app.html`'s popover accent, and the audit's class O carries it as `/opacity` selection chrome
 * (#852). Only the plain INK role in `operator/` belongs to this token, so that is what the sweep
 * matches: a bare value match would fail on sites this slice must not touch.
 */
const LITERAL_ROLE = /text-\[#0a6e85\]/i;

/**
 * Every console source still painting that role — templates are inline `.ts` here, so both
 * extensions are swept. Paths, not sources: the assertion names the file to fix instead of
 * dumping the component that failed it.
 */
function consoleFilesPaintingTheLiteral(): readonly string[] {
  const root = join(process.cwd(), 'src/app/operator');
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'))
    .filter((path) => LITERAL_ROLE.test(readFileSync(join(root, path), 'utf8')));
}

describe('Console accent-ink token (theme invariance + role distinctness, #848)', () => {
  it('clears AA over every porcelain stop the console paints it on', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(rgbToHex(CONSOLE_ACCENT_INK), rgbToHex(stop)),
        `console accent over ${rgbToHex(stop)}`,
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
    expect(declarationsOf(TOKEN)[0], TOKEN).toBe(rgbToHex(CONSOLE_ACCENT_INK));
  });

  it('maps the token in `@theme inline`, without which the utility never generates', () => {
    expect(themeRow(), 'the @theme inline row').toEqual([`var(${TOKEN})`]);
  });

  it('leaves no console file painting the ink as a literal', () => {
    expect(consoleFilesPaintingTheLiteral()).toEqual([]);
  });

  /**
   * Option B — widening `--riv-pop-accent` — would have handed the console this ink in the dark
   * theme. It lands well under AA on the porcelain stops the console actually renders, so the
   * coincidence was never a shared role. Kept in the tree so the reason survives the decision.
   */
  it('stays its own token: the popover accent it coincides with themes away, and this must not', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(rgbToHex(DARK_POP_ACCENT), rgbToHex(stop)),
        `the popover accent's dark value over ${rgbToHex(stop)}`,
      ).toBeLessThan(AA_NORMAL);
    }
  });

  /**
   * Same colour, opposite roles: this one is an ink ON porcelain, that one a fill UNDER white. The
   * audit's class R exists for exactly this, so the equality is asserted rather than left to
   * coincidence — and the two declarations are asserted to be two.
   */
  it('shares a value with the solid-fill brand while staying a separate declaration', () => {
    expect(rgbToHex(CONSOLE_ACCENT_INK)).toBe(rgbToHex(SOLID_FILL_BRAND));
    expect(declarationsOf('--riv-solid-fill-brand')).toHaveLength(1);
  });
});
