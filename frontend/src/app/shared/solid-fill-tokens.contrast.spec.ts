import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  DARK_ERROR_INK,
  DARK_POP_ACCENT,
  SOLID_FILL_BRAND,
  SOLID_FILL_BRAND_HOVER,
  SOLID_FILL_DANGER,
  SOLID_FILL_INK,
  SOLID_FILL_WARN,
} from '../../testing/glass-tokens';
import { STYLESHEET, baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the `--riv-solid-fill-*` family (#854) — the ten solid button/badge fills carrying
 * fixed white ink, across `operator/` and two `shared/` components.
 *
 * <p>Ten sites, three values since #881: seven wear `-brand`, two wear `-danger`, one wears
 * `-warn` — `shared/confirm-panel.ts`'s own tone map, the only place the class string is written;
 * its two consumers (the console's close-sales and weather-refund confirms) select it via the
 * `tone="warn"` input, never the class directly. The retired `-action` name is swept for below,
 * prose included — a class naming a token that no longer exists paints nothing, silently, which no
 * ratio here can see.
 *
 * <p>The sweep keys on the `bg-` form, not the bare value: all three literals — the merged-away
 * #0a5f74 included — also appear as `text-` inks, `ring-`s and gradient stops, which are other
 * audit classes and other slices' work.
 *
 * <p>The declaration tests read `src/tailwind.css` as TEXT (the `core/theme-boot.spec.ts` pattern)
 * rather than doing maths, because jsdom cannot see the thing worth protecting: a dark override
 * added later would leave every ratio here passing. The cross-theme proof against a real render is
 * `e2e/solid-fill-token-skin.e2e.ts`.
 *
 * <p>One member owes no contrast assertion: `operator/daily-view-tab.html`'s legend swatch is an
 * `aria-hidden` square with no text, so there is no ink to pair it with. WCAG 1.4.11 does not bite
 * either — the `<li>` it sits in reads "Walk-in marked" beside it, so colour is not the sole
 * carrier.
 */

/** The whole family, with the value `tailwind.css` is expected to declare for it. */
const FAMILY = {
  '--riv-solid-fill-brand': rgbToHex(SOLID_FILL_BRAND),
  '--riv-solid-fill-brand-hover': rgbToHex(SOLID_FILL_BRAND_HOVER),
  '--riv-solid-fill-danger': rgbToHex(SOLID_FILL_DANGER),
  '--riv-solid-fill-warn': rgbToHex(SOLID_FILL_WARN),
} as const;

const APP = join(process.cwd(), 'src/app');

function componentSources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

/** This file, the one source that may legitimately name the retired token — it is the sweep. */
const SELF = 'shared/solid-fill-tokens.contrast.spec.ts';

/** Every source under `src/app`, specs included: a retired name rots in prose as well as in code. */
function everySource(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && path.replaceAll('\\', '/') !== SELF,
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
 * <p>The trailing `(?!\/)` is the second discriminator: `bg-[#a3160e]/10` was `requests-tab`'s
 * urgency-chip tint, class O and #852's, which had to survive this sweep untouched. It still must,
 * and the lookahead still earns its place — but not for the reason written here originally. That
 * read "tokenising it would change the computed value", and #852 measured otherwise: the literal
 * form ALREADY compiles to `color-mix()`, the token form compiles to the same expression, and the
 * two composite byte-identically. The real ground is the one this whole constant rests on — a
 * tint is not a FILL, so it belongs to a different token (`--riv-alert-tint`) whichever way it is
 * written.
 */
const FILL_ROLES = [
  /bg-\[#0a6e85\](?!\/)/i,
  /bg-\[#0a5e72\](?!\/)/i,
  /bg-\[#0a5f74\](?!\/)/i,
  /bg-\[#a3160e\](?!\/)/i,
  /bg-\[#9a6410\](?!\/)/i,
];

/**
 * The same three values in NON-fill roles, by file. Asserted POSITIVELY: the sweep proving the
 * family moved is only half the claim, and this is the half that proves it did not overreach — the
 * over-claim the issue was re-cut to avoid. Each entry is a file that must STILL paint that value
 * after this slice, in a role that is not a solid fill.
 *
 * <p>`#0a6e85` had eight rows here — the `operator/` console inks this list was written to prove
 * #854 had not swept. #848 has since tokenised them onto `--riv-console-accent-ink`, so they are
 * gone as LITERALS, not as paint: the ink is still there, and `--riv-solid-fill-brand` is still a
 * separate declaration of the same value in a different role. Read the shrunk list as that slice
 * landing, never as #854 having over-reached after all; the ink's own guard is
 * `operator/console-accent-token.contrast.spec.ts`.
 *
 * <p>`#0a5f74` shrinks the same way and for the same reason: #858 moved the two booking OUTCOME
 * MEDALLIONS onto `--riv-medallion-positive-ink` and the amenity chip's water variant onto
 * `--riv-amenity-water-ink`. `booking-dialog.ts` stays — its remaining `#0a5f74` is the header
 * gradient's stop, which is `--riv-cta-grad`'s own duplication and nobody's ink. Those tokens'
 * guard is `shared/fixed-fill-token-skins.contrast.spec.ts`.
 *
 * <p>`#a3160e` is the third, and now the list holds no rows at all for it: #852 moved its four
 * class-O tint files onto `--riv-alert-tint`. `--riv-solid-fill-danger` remains a separate
 * declaration of the same value in the fill role, which is what the `FILL_ROLES` sweep above
 * still proves; the tints' guard is `shared/class-o-tint-tokens.contrast.spec.ts`. An EMPTY list
 * is the one state this constant cannot distinguish from a vacuous pass, so the test below
 * asserts it is non-empty as well — the day the last survivor migrates, that assertion is the
 * prompt to retire the list rather than let it quietly stop checking anything.
 */
const SURVIVORS: readonly (readonly [string, string])[] = [
  // `#0a6e85`'s eight console-ink rows left with #848 — see this list's header.
  // `#0a5f74` as two selection `ring-`s and the dialog head's gradient stop.
  ['operator/set-editor.html', '#0a5f74'],
  ['operator/layout-editor.html', '#0a5f74'],
  ['booking/booking-dialog.ts', '#0a5f74'],
  // `#a3160e`'s four class-O rows left with #852 — see this list's header.
];

describe('Solid fill token family (WCAG AA + theme invariance, #854)', () => {
  it('white ink clears AA on every fill in the family', () => {
    // The legend swatch has no row: `aria-hidden`, no text, so no ink to pair it with (see header).
    for (const fill of [
      SOLID_FILL_BRAND,
      SOLID_FILL_BRAND_HOVER,
      SOLID_FILL_DANGER,
      SOLID_FILL_WARN,
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

  it('retires the -action name and the question it deferred (#861)', () => {
    // The merge's own failure mode: a class outliving its token paints nothing, silently.
    expect(STYLESHEET).not.toMatch(/--(color-)?riv-solid-fill-action/);
    expect(everySource().filter((path) => read(path).includes('riv-solid-fill-action'))).toEqual(
      [],
    );

    // And the declaration comment now answers #861 rather than deferring to it.
    expect(STYLESHEET).not.toContain('#861 settles whether');
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

    expect(SURVIVORS.length, 'an empty survivor list would pass vacuously').toBeGreaterThan(0);
    expect(stillPainting).toEqual(SURVIVORS);
  });
});
