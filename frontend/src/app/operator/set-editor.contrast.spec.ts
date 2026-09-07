import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  CONSOLE_ACCENT_INK,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  WASH_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
  tintOver,
} from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the per-set beach-map editor. Same porcelain pin and
 * `appCardGlass` panel as the bulk editor beside it, so the shared ink pairs are re-proven here rather
 * than assumed; what is new is the destructive **Remove** ink and the armed-move surface. Since
 * the grid sits on the shared canvas's sea→sand wash: the BeachCell fill/border pairs over the
 * wash, and the tile-number ink over every cell kind's own fill, are proven once in
 * `layout-editor.contrast.spec.ts` (the identical directive + template pattern) — not re-proven
 * here. What is new to THIS surface is the selection ring, distinct from keyboard focus,
 * proven 3:1 (1.4.11) below over every wash stop AND every occupied tile's own worst fill — a
 * selected cell is never a bare gap.
 */

// --riv-cta-grad stops (the AA-safe darkened teal shared with every CTA); Save/Add sit on these.
const CTA_STOPS = ['#0c7288', '#0a5f74'];
// --riv-error-ink, here as the Remove ink and the error message (the payouts refund-red is #a3372a).
const DESTRUCTIVE_INK = rgbToHex(ERROR_INK);
// set-editor.html: `ring-[#0a5f74]` on the selected cell — not the design's brighter #0e8aa8, which fails 3:1 on the premium tile's own gold fill.
const SELECTION_RING = '#0a5f74';
// beach-cell.ts CELL_CLASS: the premium tile's own gradient — a selected premium set sits on this.
const PREMIUM_FILL_STOPS = ['#ffe3a3', '#f4c05a'];
// beach-cell.ts CELL_CLASS: the standard tile's white @ 0.85 over the wash.
const STANDARD_FILL_ALPHA = 0.85;
/** `tailwind.css` `--riv-walkin-hatch`: the hatch's two band alphas (#879). Asserted over BOTH
 *  rather than over a nominated "worst case" — which band is worst depends on the ink being
 *  measured, and a spec that picks one is one refactor away from measuring the wrong surface.
 *  Before #879 these were per-site (30/12 here, 35/12 at the layout editor, 28/10 on the Daily
 *  view); they are now one declaration, so one constant pair serves every consumer. */
const WALKIN_BAND_ALPHAS = [0.3, 0.1] as const;

describe('SetEditor porcelain contrast (WCAG AA, #600)', () => {
  it('panel heading, selection line and toggle labels (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('field legends (--riv-card-ink-faint 0.72) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('helper text and the pricing-override hint (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('Save set / Add set here (white) meet AA on both CTA gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the Remove ink and the write-error ink meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const hex = rgbToHex(stop);
      expect(contrastRatio(DESTRUCTIVE_INK, hex), `destructive over ${hex}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(
        contrastRatio(rgbToHex(CONSOLE_ACCENT_INK), hex),
        `saved notice over ${hex}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the remove confirmation reads AA on its warning surface, in both directions it uses', () => {
    expect(contrastRatio('#7a4a08', '#fff4e0')).toBeGreaterThanOrEqual(AA_NORMAL);
    // "Remove set" is white on the solid destructive fill, not the outlined variant.
    expect(contrastRatio('#ffffff', DESTRUCTIVE_INK)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the selection ring marks the picked cell at 3:1 over every wash stop and tile fill (WCAG 1.4.11, #709)', () => {
    for (const stop of WASH_STOPS) {
      const wash = rgbToHex(stop);
      expect(contrastRatio(SELECTION_RING, wash), `over wash stop ${wash}`).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
      const standard = rgbToHex(composite([255, 255, 255], STANDARD_FILL_ALPHA, stop));
      expect(
        contrastRatio(SELECTION_RING, standard),
        `over standard tile on ${wash}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
      for (const band of WALKIN_BAND_ALPHAS) {
        const walkin = rgbToHex(composite(CARD_INK, band, stop));
        expect(
          contrastRatio(SELECTION_RING, walkin),
          `over walk-in tile (band ${band}) on ${wash}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    }
    for (const stop of PREMIUM_FILL_STOPS) {
      expect(
        contrastRatio(SELECTION_RING, stop),
        `over premium tile fill ${stop}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the armed-move banner keeps card ink over its tinted surface', () => {
    // The banner tints the card glass with #2bb8d4 at 12%; that tint is what the ink composites over.
    expectAaOverStops(INK_DARK, 1, { color: [43, 184, 212], alpha: 0.12 }, PORCELAIN_STOPS);
  });
});

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. */
describe.each(CONSOLE_THEMES)(
  'SetEditor contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('panel heading, legends and helper text meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_FAINT_ALPHA, (stop) => cardOver(theme, stop));
    });

    it('a tier / pool button’s label meets AA idle (card ink on the inset/45) and selected (card ink on --riv-select-tint/20)', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.45, stop));
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) =>
        tintOver(theme, theme.selectTint, 0.2, stop),
      );
    });

    it('the price field (card ink on the inset/60) meets AA', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.6, stop));
    });

    it('the Remove button (--riv-error-ink beside its --riv-alert-tint/40 edge) meets AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => cardOver(theme, stop));
    });

    it('the armed-move banner keeps card ink over its --riv-select-tint/10 surface', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) =>
        tintOver(theme, theme.selectTint, 0.1, stop),
      );
    });

    it('the selection ring (--riv-accent-ink) marks the picked cell at 3:1 over every wash stop and tile fill', () => {
      const ring = rgbToHex(theme.accentRing);
      for (const stop of theme.washStops) {
        const wash = rgbToHex(stop);
        expect(
          contrastRatio(ring, wash),
          `${theme.name}: over wash ${wash}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
        const standard = rgbToHex(composite(theme.inset, STANDARD_FILL_ALPHA, stop));
        expect(
          contrastRatio(ring, standard),
          `${theme.name}: over standard on ${wash}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
        for (const band of WALKIN_BAND_ALPHAS) {
          const walkin = rgbToHex(composite(theme.tint, band, stop));
          expect(
            contrastRatio(ring, walkin),
            `${theme.name}: over walk-in (band ${band}) on ${wash}`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        }
      }
      for (const stop of theme.premiumStops) {
        expect(
          contrastRatio(ring, rgbToHex(stop)),
          `${theme.name}: over premium ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    });
  },
);
