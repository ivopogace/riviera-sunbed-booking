import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
} from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the create-venue card. The card renders only on the porcelain
 * operator surface (`OperatorHome` pins the theme); it reuses the venue-tab form idiom: headings +
 * field labels + input values in `--riv-card-ink` on `appCardGlass`, sub-copy in
 * `--riv-card-ink-soft`, field/create errors in `--riv-error-ink`, and the submit CTA's solid white ink on
 * the AA-safe `--riv-cta-grad` teal stops. Values mirror the template + `tailwind.css`; a token edit
 * there must re-pass here.
 */

const ERROR_HEX = rgbToHex(ERROR_INK);
/** The AA-safe dark-teal CTA gradient stops (= --riv-cta-grad), carrying solid white ink. */
const CTA_STOPS = ['#0c7288', '#0a5f74'];

describe('VenueCreateCard porcelain contrast (WCAG AA, #278)', () => {
  it('heading + field labels + input values (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('sub-copy (--riv-card-ink-soft 0.78) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('field + create error ink (--riv-error-ink) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_HEX, rgbToHex(stop)),
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

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. */
describe.each(CONSOLE_THEMES)(
  'VenueCreateCard contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('heading, labels, sub-copy and the fields (card ink on the inset/60) meet AA', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.6, stop));
    });

    it('the field and create error ink (--riv-error-ink) meets AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => cardOver(theme, stop));
    });
  },
);
