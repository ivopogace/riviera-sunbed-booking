import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  DARK_ERROR_INK,
  DARK_POP_ACCENT,
  SOLID_FILL_ACTION,
  SOLID_FILL_ACTION_HOVER,
  SOLID_FILL_BRAND,
  SOLID_FILL_DANGER,
  SOLID_FILL_INK,
} from '../../testing/glass-tokens';

/**
 * Guard for the `--riv-solid-fill-*` family (#854, class R-2 of the colour-literal audit) — the
 * nine solid button/badge fills that carry fixed white ink, across `operator/` and two `shared/`
 * components.
 *
 * <p>The family is grouped by FORM, not by value: three different literals doing one job. Grouping
 * by value is what the issue's first cut did, and it both split this family across two tickets and
 * swept in four `text-` inks that are a different class entirely.
 *
 * <p>THEME-INVARIANT, and that is the decision rather than an omission. The ink is Tailwind's named
 * `text-white`, which cannot theme, so a fill under it may not either. Both coincidental tokens do
 * theme, which is precisely why neither is the answer: `--riv-error-ink` carries the same value as
 * the danger fill and resolves `#ffa9a1` in the dark theme, and `--riv-pop-accent` carries the
 * action fill's value and resolves `#7cd7e8`. White on either is light on light — the second test
 * measures both, so the reason survives the decision (the shape #850 and #851 established).
 *
 * <p>Which makes the invariance itself the thing to protect, and jsdom maths cannot see it: a dark
 * override added later would leave every ratio here passing. So the declaration tests read
 * `src/tailwind.css` as text (the `core/theme-boot.spec.ts` drift-guard pattern) and assert each
 * token is declared once, in the base block, at the value this mirror carries. The cross-theme
 * proof against a real render — where the cascade, not a regex, decides — is
 * `e2e/solid-fill-token-skin.e2e.ts`.
 *
 * <p>One member owes no contrast assertion: `operator/daily-view-tab.html`'s legend swatch is an
 * `aria-hidden` 13px square with no text at all. It takes the same fill token because it is the
 * same colour doing the same job, but there is no ink to pair it with, so none is invented for it.
 */

/** Vitest runs with cwd = `frontend/`. */
const STYLESHEET = readFileSync(join(process.cwd(), 'src/tailwind.css'), 'utf8');

/** The whole family, with the value `tailwind.css` is expected to declare for it. */
const FAMILY = {
  '--riv-solid-fill-action': rgbToHex(SOLID_FILL_ACTION),
  '--riv-solid-fill-action-hover': rgbToHex(SOLID_FILL_ACTION_HOVER),
  '--riv-solid-fill-brand': rgbToHex(SOLID_FILL_BRAND),
  '--riv-solid-fill-danger': rgbToHex(SOLID_FILL_DANGER),
} as const;

/** The base block — `:root, [data-riv-theme='porcelain']`, the only legal home for the family. */
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

const APP = join(process.cwd(), 'src/app');

function componentSources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

function read(path: string): string {
  return readFileSync(join(APP, path), 'utf8');
}

/**
 * The family's literals in their FILL form only. `bg-` is the discriminator that makes this sweep
 * safe to run tree-wide: all three values also appear as `text-` inks, `ring-`s, `border-`s and
 * gradient stops, which are other classes of the audit and other slices' work.
 *
 * <p>The trailing `(?!\/)` is the second discriminator: `bg-[#a3160e]/10` is `requests-tab`'s
 * urgency-chip tint, class O, whose `/opacity` modifier compiles to `color-mix()` — tokenising it
 * would change the computed value, so it is #852's and must survive this sweep untouched.
 */
const FILL_ROLES = [
  /bg-\[#0a6e85\](?!\/)/i,
  /bg-\[#0a5e72\](?!\/)/i,
  /bg-\[#0a5f74\](?!\/)/i,
  /bg-\[#a3160e\](?!\/)/i,
];

/**
 * The same three values in NON-fill roles, by file. Asserted POSITIVELY: the sweep proving the
 * family moved is only half the claim, and this is the half that proves it did not overreach — the
 * over-claim the issue was re-cut to avoid. Each entry is a file that must STILL paint that value
 * after this slice, in a role that is not a solid fill.
 */
const SURVIVORS: readonly (readonly [string, string])[] = [
  // `#0a6e85` as a `text-` ink — class F, and the four `operator/` sites #848 is settling.
  ['operator/set-editor.html', '#0a6e85'],
  ['operator/payout-statement.ts', '#0a6e85'],
  ['operator/layout-editor.html', '#0a6e85'],
  ['operator/requests-tab.html', '#0a6e85'],
  ['operator/pricing-tab.html', '#0a6e85'],
  ['operator/payouts-tab.ts', '#0a6e85'],
  ['operator/venue-tab.html', '#0a6e85'],
  ['operator/payouts-tab.html', '#0a6e85'],
  // `#0a5f74` as a `text-` ink, a selection `ring-`, and the dialog head's gradient stop.
  ['shared/amenity-chip.ts', '#0a5f74'],
  ['operator/set-editor.html', '#0a5f74'],
  ['operator/layout-editor.html', '#0a5f74'],
  ['booking/booking-dialog.ts', '#0a5f74'],
  ['booking/booking-pay.ts', '#0a5f74'],
  ['booking/booking-confirmation.ts', '#0a5f74'],
  // `#a3160e` as `/opacity` tints and borders — class O, #852's.
  ['operator/set-editor.html', '#a3160e'],
  ['operator/requests-tab.html', '#a3160e'],
  ['operator/payouts-tab.html', '#a3160e'],
  ['operator/daily-view-tab.html', '#a3160e'],
];

describe('Solid fill token family (WCAG AA + theme invariance, #854)', () => {
  it('white ink clears AA on every fill in the family', () => {
    // The legend swatch has no row: `aria-hidden`, no text, so no ink to pair it with (see header).
    for (const fill of [
      SOLID_FILL_ACTION,
      SOLID_FILL_ACTION_HOVER,
      SOLID_FILL_BRAND,
      SOLID_FILL_DANGER,
    ]) {
      expect(
        contrastRatio(rgbToHex(SOLID_FILL_INK), rgbToHex(fill)),
        `white on ${rgbToHex(fill)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the coincidental tokens would not survive theming — which is why the family exists', () => {
    // Substituting either would put white text on a pale pink or a pale cyan button.
    for (const themed of [DARK_ERROR_INK, DARK_POP_ACCENT]) {
      expect(
        contrastRatio(rgbToHex(SOLID_FILL_INK), rgbToHex(themed)),
        `white on the dark resolution ${rgbToHex(themed)}`,
      ).toBeLessThan(AA_NORMAL);
    }
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(FAMILY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares the family in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(FAMILY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(FAMILY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('leaves no component painting the family as a literal', () => {
    const painting = componentSources().filter((path) =>
      FILL_ROLES.some((role) => role.test(read(path))),
    );

    expect(painting).toEqual([]);
  });

  it('leaves the non-fill roles of the same three values untouched', () => {
    const stillPainting = SURVIVORS.filter(([path, value]) => read(path).includes(value));

    expect(stillPainting).toEqual(SURVIVORS);
  });
});
