import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { DARK_ERROR_INK, FORM_ERROR_FILL, FORM_ERROR_INK } from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the `--riv-form-error-*` pair (#850, class F-1 of the colour-literal audit) — the
 * skin the three tourist error banners wear (`booking-dialog`, `booking-pay`, `my-bookings`).
 *
 * <p>The pair is THEME-INVARIANT, and that is the whole point of it rather than an omission. The
 * fill does not theme, so a themed ink over it drifts: `--riv-error-ink` resolves `#ffa9a1` in the
 * dark theme, which lands at 1.54:1 on a fill that stays `#f6e8e7` — light on light. The second
 * test is that bound, kept in the tree so the reason survives the decision.
 *
 * <p>Which makes the invariance itself the thing to protect, and jsdom maths cannot see it: a dark
 * override added later would leave every ratio here passing. So the last four tests read
 * `src/tailwind.css` as text (the `core/theme-boot.spec.ts` drift-guard pattern) and assert the
 * declaration is single and sits in the base block, that its value is what this mirror says, and
 * that no component has kept a literal copy. The cross-theme proof against a real render —
 * where the cascade, not a regex, decides — is `e2e/form-error-token-skin.e2e.ts`.
 */

/** The pair, with the value `tailwind.css` is expected to declare for it. */
const PAIR = {
  '--riv-form-error-fill': rgbToHex(FORM_ERROR_FILL),
  '--riv-form-error-ink': rgbToHex(FORM_ERROR_INK),
} as const;

/**
 * This family's literals, matched **by role rather than by value**. `#f6e8e7` is the fill and
 * occurs nowhere else, so any form of it is ours. `#a3160e` is not ours alone: the audit's class R
 * paints it as a `bg-` fill under white ink (#854), and class O painted it as `/opacity` tints
 * until #852 moved those onto `--riv-alert-tint` — both deliberate Non-goals here, and the second
 * is now a token rather than a literal. Only the INK role belongs to this pair, so that is what
 * the sweep matches — a bare value match would fail on eight sites this slice must not touch.
 */
const LITERAL_ROLES = [/#f6e8e7/i, /text-\[#a3160e\]/i];

/**
 * Every component source still painting one of those roles — templates are inline `.ts` here, so
 * both extensions are swept. Paths, not sources: the assertion names the file to fix instead of
 * dumping the component that failed it.
 */
function componentsPaintingLiterals(): readonly string[] {
  const root = join(process.cwd(), 'src/app');
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'))
    .filter((path) => {
      const source = readFileSync(join(root, path), 'utf8');
      return LITERAL_ROLES.some((role) => role.test(source));
    });
}

describe('Form-error token pair (WCAG AA + theme invariance, #850)', () => {
  it('the pair clears AA', () => {
    expect(
      contrastRatio(rgbToHex(FORM_ERROR_INK), rgbToHex(FORM_ERROR_FILL)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the themed error ink would not — which is why the pair exists', () => {
    expect(contrastRatio(rgbToHex(DARK_ERROR_INK), rgbToHex(FORM_ERROR_FILL))).toBeLessThan(
      AA_NORMAL,
    );
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(PAIR)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares the pair in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(PAIR)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(PAIR)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('leaves no component painting the pair as a literal', () => {
    expect(componentsPaintingLiterals()).toEqual([]);
  });
});
