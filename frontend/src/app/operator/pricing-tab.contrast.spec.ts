import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  INK_DARK,
  PORCELAIN_CHIP,
  PORCELAIN_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the O4 Pricing tab (#174). The tab is always porcelain (console host),
 * its panel uses `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading + row
 * label chip + € input value use `--riv-card-ink`; the subheader, tier descriptions, € symbol and
 * projected label use `--riv-card-ink-soft` (0.78); the projected figure + "Saved" notice use the
 * AA-safe teal `#0a6e85`; the reprice error uses `#a3160e`. The number inputs sit on a lighter
 * `bg-white/60`, so `--riv-card-ink` over the plain card glass is the worst case for them too.
 * Values mirror the template + `styles.scss`; a token edit there must re-pass here.
 */

const CARD_GLASS = { color: WHITE, alpha: 0.55 };

describe('PricingTab porcelain contrast (WCAG AA, #174)', () => {
  it('heading + input value (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('subheader + tier descriptions + € symbol (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.78, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the row label chip ink (--riv-card-ink) meets AA over the chip tint on the card glass', () => {
    // The chip is a second glass layer: --riv-chip-bg (CARD_INK @ 0.05) over the card glass over the stop.
    for (const stop of PORCELAIN_STOPS) {
      const chipSurface = composite(
        PORCELAIN_CHIP.color,
        PORCELAIN_CHIP.alpha,
        surfaceOver(CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(chipSurface)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('projected figure + "Saved" notice (#0a6e85) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio('#0a6e85', rgbToHex(stop)),
        `accent over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('reprice error ink (#a3160e) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio('#a3160e', rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
