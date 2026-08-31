import { AA_NORMAL, contrastRatio } from '../../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
} from '../../../testing/glass-tokens';

/**
 * Deterministic AA maths for the two draft legal pages' shared surface:
 * body/soft card inks on the card glass (constants from `glass-tokens.ts`, the one test-side
 * token mirror) over each theme's worst-case gradient stops, plus the solid amber draft
 * banner (the withheld-email-notice recipe — solid fill so the ratio is computable, not
 * surface-dependent).
 */
const BANNER_FILL = '#fcf0d9'; // solid amber (withheld-email-notice precedent)
const BANNER_INK = '#8a5410';

describe('Legal pages contrast (computed AA)', () => {
  for (const [theme, glass, stops, ink, inkBase] of [
    ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS, INK_DARK, CARD_INK],
    ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS, INK_DARK, CARD_INK],
    ['dark', DARK_CARD_GLASS, DARK_STOPS, DARK_CARD_INK, DARK_CARD_INK],
  ] as const) {
    it(`body ink meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(ink, 1, glass, stops);
    });

    it(`soft ink (headings meta) meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(inkBase, CARD_INK_SOFT_ALPHA, glass, stops);
    });
  }

  it('draft-banner ink meets AA on its solid amber fill', () => {
    expect(contrastRatio(BANNER_INK, BANNER_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
