import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  INK_DARK,
  PORCELAIN_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the O8 Venue & commodities tab (#177). The tab is always porcelain
 * (console host); its cards use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs:
 * headings + field labels + input values use `--riv-card-ink`; sub-copy, soft labels and the
 * INACTIVE amenity chip use `--riv-card-ink-soft` (0.78) — an inactive chip sits on a lighter
 * `bg-white/50`, so `--riv-card-ink-soft` over the plain card glass is its worst case too. The
 * commission % + "Saved" notice use the AA-safe teal `#0a6e85`; the save/load error uses `#a3160e`;
 * the ACTIVE amenity chip's dark-teal ink `#0a4f5e` sits over a `#2bb8d4 @ 0.22` tint. Values mirror
 * the template + `styles.scss`; a token edit there must re-pass here.
 */

const CARD_GLASS = { color: WHITE, alpha: 0.55 };
/** The active amenity-chip tint (#2bb8d4 @ 0.22) from the design mock; its ink is #0a4f5e. */
const CHIP_TEAL: [number, number, number] = [43, 184, 212];
const CHIP_TEAL_ALPHA = 0.22;
const ACTIVE_CHIP_INK = '#0a4f5e';
const ACCENT_TEAL = '#0a6e85';
const ERROR_INK = '#a3160e';
/** The #224 stale-write banner: an amber wash (#f59e0b @ 0.14) over the card glass; ink is --riv-card-ink. */
const BANNER_TINT: [number, number, number] = [245, 158, 11];
const BANNER_TINT_ALPHA = 0.14;

describe('VenueTab porcelain contrast (WCAG AA, #177)', () => {
  it('headings + labels + input values (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('sub-copy + soft labels + inactive chip ink (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.78, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the active amenity chip ink (#0a4f5e) meets AA over the teal tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chipSurface = composite(CHIP_TEAL, CHIP_TEAL_ALPHA, surfaceOver(CARD_GLASS, stop));
      expect(
        contrastRatio(ACTIVE_CHIP_INK, rgbToHex(chipSurface)),
        `active chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('commission % + "Saved" notice (#0a6e85) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ACCENT_TEAL, rgbToHex(stop)),
        `accent over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('save/load error ink (#a3160e) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_INK, rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the stale-write banner ink (--riv-card-ink) meets AA over the amber tint on the card glass (#224)', () => {
    for (const stop of PORCELAIN_STOPS) {
      const bannerSurface = composite(BANNER_TINT, BANNER_TINT_ALPHA, surfaceOver(CARD_GLASS, stop));
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(bannerSurface)),
        `stale banner ink over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
