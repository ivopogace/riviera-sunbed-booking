import { AA_NORMAL, contrastRatio, rgbToHex } from '../../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  INK_DARK,
  NOTICE_BANNER_FILL,
  NOTICE_BANNER_INK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
} from '../../../testing/glass-tokens';

/**
 * Deterministic AA maths for the two draft legal pages' shared surface:
 * body/soft card inks on the card glass (constants from `glass-tokens.ts`, the one test-side
 * token mirror) over each theme's worst-case gradient stops, plus the solid amber draft banner —
 * the `--riv-notice-banner-*` pair (#868), whose own AA proof, themed-ink bound and declaration
 * guards live at `booking/withheld-email-notice.contrast.spec.ts` so this spec only reads the
 * mirror rather than restating the literal.
 */

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
    expect(
      contrastRatio(rgbToHex(NOTICE_BANNER_INK), rgbToHex(NOTICE_BANNER_FILL)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
