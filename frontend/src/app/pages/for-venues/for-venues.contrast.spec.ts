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
 * AA maths for the venue-owner page's card: the headings' body ink and the soft ink of the copy and
 * the 12px "At launch" label, over each theme's worst-case gradient stops. The registration link is
 * the shared primary CTA, proven at `shared/cta-border-token.contrast.spec.ts`.
 */
describe('ForVenues contrast (computed AA)', () => {
  it.each([
    ['riviera', RIVIERA_CARD_GLASS, RIVIERA_STOPS, INK_DARK, CARD_INK],
    ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS, INK_DARK, CARD_INK],
    ['dark', DARK_CARD_GLASS, DARK_STOPS, DARK_CARD_INK, DARK_CARD_INK],
  ] as const)(
    'heading and soft inks meet AA on the %s card glass',
    (_, glass, stops, ink, base) => {
      expectAaOverStops(ink, 1, glass, stops);
      expectAaOverStops(base, CARD_INK_SOFT_ALPHA, glass, stops);
    },
  );
});
