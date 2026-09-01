import { AA_LARGE, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CTA_BORDER,
  CTA_GRAD_STOPS,
  DARK_CARD_BORDER,
  DIALOG_CLOSE_FILL,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-cta-border` (#853, class R row 1 of the colour-literal audit) — the white
 * hairline bevel on the primary CTA button, worn at 16 positions across `auth/`, `booking/` and
 * `shared/`.
 *
 * <p><strong>Why its own token and not `--riv-inset-fill`.</strong> The value coincides exactly,
 * the role does not: that one is a FILL, and it resolves `rgba(255,255,255,0.08)` in the dark
 * theme. Pointing a border at it would be the role confusion class R exists to name, and it would
 * move the dark-theme paint of every one of these buttons.
 *
 * <p><strong>Why theme-invariant, against the issue's own suggestion.</strong> #853 proposed
 * `--riv-card-border` as the precedent for "how such a border themes". It is not: that token
 * themes because the card glass UNDER it themes. Every surface here is fixed — `--riv-cta-grad`
 * is declared once in the base block and inherited by all three themes, and `booking-dialog`'s
 * close button sits on a `#31798a` literal. So the class-F rule applies in the usual direction:
 * a fixed surface pins everything painted on it. The themed-alternative test carries the measured
 * bound that makes this a decision rather than an omission.
 *
 * <p><strong>Why the family includes the close button.</strong> Grouped by FORM, not by value or
 * by component — a white hairline bevel on a fixed teal action surface. Both grounds for
 * invariance are the same, so one token rather than two one-hyphen-apart names (#864's argument).
 *
 * <p>What jsdom maths cannot see is a dark override added later — every ratio here would still
 * pass. So the declaration tests read `src/tailwind.css` as text via `testing/stylesheet-tokens`.
 * The proof where the cascade rather than a regex decides is `e2e/cta-border-token-skin.e2e.ts`.
 */
const REGISTRY = {
  '--riv-cta-border': 'rgba(255, 255, 255, 0.4)',
} as const;

/** Every fixed surface the hairline lands on: the CTA gradient's two stops, then the close button. */
const FIXED_FILLS = [
  ['--riv-cta-grad top stop', CTA_GRAD_STOPS[0]],
  ['--riv-cta-grad bottom stop', CTA_GRAD_STOPS[1]],
  ['booking-dialog close button', DIALOG_CLOSE_FILL],
] as const;

/** The hairline as it actually paints: composited over the opaque fill it sits on. */
function borderOver(fill: readonly [number, number, number], alpha: number): number {
  const painted = composite([255, 255, 255], alpha, fill);
  return contrastRatio(rgbToHex(painted), rgbToHex(fill));
}

describe('--riv-cta-border — the CTA hairline (#853)', () => {
  it('is declared exactly once, so no theme can override it', () => {
    for (const name of Object.keys(REGISTRY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('is declared in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(REGISTRY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the value this test mirror carries', () => {
    for (const [name, value] of Object.entries(REGISTRY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('sits on a gradient that is itself declared once — the ground for invariance', () => {
    expect(declarationsOf('--riv-cta-grad')).toHaveLength(1);
  });

  it('is decorative chrome, measured rather than assumed exempt', () => {
    for (const [surface, fill] of FIXED_FILLS) {
      const ratio = borderOver(fill, CTA_BORDER.alpha);
      expect(ratio, `${surface}: above the 1.4.11 floor`).toBeLessThan(AA_LARGE);
      expect(ratio, `${surface}: below the measured band`).toBeGreaterThan(2);
    }
  });

  it('is not the affordance boundary — the fill carries it, in both light themes', () => {
    const glasses = [
      ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
      ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS],
    ] as const;

    for (const [theme, glass, stops] of glasses) {
      for (const stop of stops) {
        const behind = surfaceOver(glass, stop);
        for (const fill of CTA_GRAD_STOPS) {
          expect(
            contrastRatio(rgbToHex(fill), rgbToHex(behind)),
            `${theme} over stop ${rgbToHex(stop)}`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        }
      }
    }
  });

  it('a themed border would fade over fills that do not theme', () => {
    for (const [surface, fill] of FIXED_FILLS) {
      expect(borderOver(fill, DARK_CARD_BORDER.alpha), surface).toBeLessThanOrEqual(1.5);
    }
  });
});
