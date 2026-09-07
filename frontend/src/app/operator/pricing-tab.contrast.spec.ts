import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  CONSOLE_ACCENT_INK,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_STOPS,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
} from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the Pricing tab. The tab wears the operator's console theme (porcelain by default; the themed block at the foot proves both),
 * its panel uses `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading + row
 * label chip + € input value use `--riv-card-ink`; the subheader, tier descriptions, € symbol and
 * projected label use `--riv-card-ink-soft` (0.78); the projected figure + "Saved" notice use the
 * console accent ink `--riv-console-accent-ink`; the reprice error uses `--riv-error-ink`. The number inputs sit on a lighter
 * `bg-riv-console-inset/60`, so `--riv-card-ink` over the plain card glass is the worst case for them too.
 * Values mirror the template + `tailwind.css`; a token edit there must re-pass here.
 */

const ERROR_HEX = rgbToHex(ERROR_INK);

describe('PricingTab porcelain contrast (WCAG AA, #174)', () => {
  it('heading + input value (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('subheader + tier descriptions + € symbol (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the row label chip ink (--riv-card-ink) meets AA over the chip tint on the card glass', () => {
    // The chip is a second glass layer: --riv-chip-bg (CARD_INK @ 0.05) over the card glass over the stop.
    for (const stop of PORCELAIN_STOPS) {
      const chipSurface = composite(
        PORCELAIN_CHIP.color,
        PORCELAIN_CHIP.alpha,
        surfaceOver(PORCELAIN_CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(chipSurface)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('projected figure + "Saved" notice (--riv-console-accent-ink) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(rgbToHex(CONSOLE_ACCENT_INK), rgbToHex(stop)),
        `accent over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('reprice error ink (--riv-error-ink) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_HEX, rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. */
describe.each(CONSOLE_THEMES)(
  'PricingTab contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('heading, tier descriptions and the price field (card ink on the inset/60) meet AA', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.6, stop));
    });

    it('the projected figure and the Saved notice (--riv-console-accent-ink) and the reprice error meet AA', () => {
      expectAaOnSurfaces(theme, theme.accentInk, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => cardOver(theme, stop));
    });
  },
);
