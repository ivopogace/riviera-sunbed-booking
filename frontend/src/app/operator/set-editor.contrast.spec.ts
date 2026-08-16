import { AA_LARGE, AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  WASH_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the per-set beach-map editor (#600). Same porcelain host and
 * `appCardGlass` panel as the bulk editor beside it, so the shared ink pairs are re-proven here rather
 * than assumed; what is new is the destructive **Remove** ink and the armed-move surface. Grid cells
 * carry no text — state is colour AND a per-cell `aria-label` — so only the text pairs need AA. Since
 * #677 the grid sits on the shared canvas's sea→sand wash: the BeachCell fill/border pairs over the
 * wash are proven in `layout-editor.contrast.spec.ts` (the identical directive); what is new to THIS
 * surface is the selection outline, proven 3:1 (1.4.11) over every wash stop below.
 */

// --riv-cta-grad stops (the AA-safe darkened teal shared with every CTA); Save/Add sit on these.
const CTA_STOPS = ['#0c7288', '#0a5f74'];
// The refund-red the payouts ledger already uses, here as the Remove ink and the error message.
const DESTRUCTIVE_INK = '#a3160e';
// set-editor.html: `outline-[#0e8aa8]` on the selected cell — its identity is this outline alone.
const SELECTION_OUTLINE = '#0e8aa8';

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
      expect(contrastRatio('#0a6e85', hex), `saved notice over ${hex}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('the remove confirmation reads AA on its warning surface, in both directions it uses', () => {
    expect(contrastRatio('#7a4a08', '#fff4e0')).toBeGreaterThanOrEqual(AA_NORMAL);
    // "Remove set" is white on the solid destructive fill, not the outlined variant.
    expect(contrastRatio('#ffffff', DESTRUCTIVE_INK)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the selection outline marks the picked cell at 3:1 over every wash stop (WCAG 1.4.11, #677)', () => {
    for (const stop of WASH_STOPS) {
      expect(
        contrastRatio(SELECTION_OUTLINE, rgbToHex(stop)),
        `over wash stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the armed-move banner keeps card ink over its tinted surface', () => {
    // The banner tints the card glass with #2bb8d4 at 12%; that tint is what the ink composites over.
    expectAaOverStops(INK_DARK, 1, { color: [43, 184, 212], alpha: 0.12 }, PORCELAIN_STOPS);
  });
});
