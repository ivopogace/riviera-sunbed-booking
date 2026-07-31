import { AA_NORMAL, contrastRatio } from '../../../testing/contrast';
import {
  CARD_INK,
  Glass,
  INK_DARK,
  PORCELAIN_STOPS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
} from '../../../testing/glass-tokens';

/**
 * Deterministic AA maths for the two draft legal pages' shared surface (#101 Slice 3):
 * body/soft card inks on the card glass over each theme's worst-case gradient stops, plus
 * the solid amber draft banner (the withheld-email-notice recipe — solid fill so the ratio
 * is computable, not surface-dependent).
 */
const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
const CARD_INK_SOFT_ALPHA = 0.78; // --riv-card-ink-soft

const BANNER_FILL = '#fcf0d9'; // solid amber (withheld-email-notice precedent)
const BANNER_INK = '#8a5410';

describe('Legal pages contrast (computed AA)', () => {
  for (const [theme, glass, stops] of [
    ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS],
    ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
  ] as const) {
    it(`body ink meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(INK_DARK, 1, glass, stops);
    });

    it(`soft ink (headings meta) meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, glass, stops);
    });
  }

  it('draft-banner ink meets AA on its solid amber fill', () => {
    expect(contrastRatio(BANNER_INK, BANNER_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
