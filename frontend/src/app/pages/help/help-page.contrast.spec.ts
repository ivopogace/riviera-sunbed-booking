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
 * AA maths for the help page's card: the body ink (headings and the channel links, which inherit it)
 * and the soft prose ink on the card glass over each theme's worst-case gradient stops.
 */
describe('HelpPage contrast (computed AA)', () => {
  for (const [theme, glass, stops, ink, inkBase] of [
    ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS, INK_DARK, CARD_INK],
    ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS, INK_DARK, CARD_INK],
    ['dark', DARK_CARD_GLASS, DARK_STOPS, DARK_CARD_INK, DARK_CARD_INK],
  ] as const) {
    it(`body and link ink meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(ink, 1, glass, stops);
    });

    it(`soft prose ink meets AA on the ${theme} card glass over every stop`, () => {
      expectAaOverStops(inkBase, CARD_INK_SOFT_ALPHA, glass, stops);
    });
  }
});
