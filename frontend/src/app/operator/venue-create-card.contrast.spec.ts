import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the create-venue card. The card renders only on the porcelain
 * operator surface (`OperatorHome` pins the theme); it reuses the venue-tab form idiom: headings +
 * field labels + input values in `--riv-card-ink` on `appCardGlass`, sub-copy in
 * `--riv-card-ink-soft`, field/create errors in `#a3160e`, and the submit CTA's solid white ink on
 * the AA-safe `--riv-cta-grad` teal stops. Values mirror the template + `styles.scss`; a token edit
 * there must re-pass here.
 */

const ERROR_INK = '#a3160e';
/** The AA-safe dark-teal CTA gradient stops (= --riv-cta-grad), carrying solid white ink. */
const CTA_STOPS = ['#0c7288', '#0a5f74'];

describe('VenueCreateCard porcelain contrast (WCAG AA, #278)', () => {
  it('heading + field labels + input values (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('sub-copy (--riv-card-ink-soft 0.78) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('field + create error ink (#a3160e) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_INK, rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the Create venue CTA (white) meets AA on both --riv-cta-grad stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `white over ${stop}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });
});
