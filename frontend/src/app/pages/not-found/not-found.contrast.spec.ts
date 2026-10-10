import { Rgb } from '../../../testing/contrast';
import {
  ACCENT_INK,
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
} from '../../../testing/glass-tokens';

/**
 * WCAG-AA for the not-found card: card-glass over the bare themed gradient, each ink composited
 * over the theme's worst-case stops (the booking-view state-card pattern).
 */
const THEMES: readonly [string, Glass, readonly Rgb[], Rgb, Rgb, Rgb][] = [
  ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS, INK_DARK, CARD_INK, ACCENT_INK],
  ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS, INK_DARK, CARD_INK, ACCENT_INK],
  ['dark', DARK_CARD_GLASS, DARK_STOPS, DARK_CARD_INK, DARK_CARD_INK, DARK_ACCENT_INK],
];

describe.each(THEMES)(
  'Not-found card contrast — %s theme (WCAG AA)',
  (_, glass, stops, ink, inkBase, accent) => {
    it('card ink (heading) meets AA on the card glass', () => {
      expectAaOverStops(ink, 1, glass, stops);
    });

    it('card ink-soft (lead) meets AA on the card glass', () => {
      expectAaOverStops(inkBase, CARD_INK_SOFT_ALPHA, glass, stops);
    });

    it('accent ink (the back link) meets AA on the card glass', () => {
      expectAaOverStops(accent, 1, glass, stops);
    });
  },
);
