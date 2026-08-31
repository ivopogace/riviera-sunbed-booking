import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  ACCENT_CHIP_FILL,
  ACCENT_INK,
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  CONSOLE_ACCENT_INK,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Venue & commodities tab. The tab is always porcelain
 * (console host); its cards use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs:
 * headings + field labels + input values use `--riv-card-ink`; sub-copy, soft labels and the
 * INACTIVE amenity chip use `--riv-card-ink-soft` (0.78) — an inactive chip sits on a lighter
 * `bg-white/50`, so `--riv-card-ink-soft` over the plain card glass is its worst case too. The
 * commission % + "Saved" notice use `--riv-console-accent-ink`; the save/load error uses `--riv-error-ink`;
 * the ACTIVE amenity chip reads both its ink and its tint from the `--riv-accent-*` registry (#835).
 * Values mirror the template + `tailwind.css`; a token edit there must re-pass here.
 */

const ACCENT_TEAL = rgbToHex(CONSOLE_ACCENT_INK);
const ERROR_HEX = rgbToHex(ERROR_INK);
/** The stale-write banner: an amber wash (#f59e0b @ 0.14) over the card glass; ink is --riv-card-ink. */
const BANNER_TINT: [number, number, number] = [245, 158, 11];
const BANNER_TINT_ALPHA = 0.14;

describe('VenueTab porcelain contrast (WCAG AA, #177)', () => {
  it('headings + labels + input values (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('sub-copy + soft labels + inactive chip ink (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the active amenity chip ink meets AA over the accent chip tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chipSurface = composite(
        ACCENT_CHIP_FILL.color,
        ACCENT_CHIP_FILL.alpha,
        surfaceOver(PORCELAIN_CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(ACCENT_INK), rgbToHex(chipSurface)),
        `active chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('commission % + "Saved" notice (--riv-console-accent-ink) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ACCENT_TEAL, rgbToHex(stop)),
        `accent over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('save/load error ink (--riv-error-ink) meets AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_HEX, rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the stale-write banner ink (--riv-card-ink) meets AA over the amber tint on the card glass (#224)', () => {
    for (const stop of PORCELAIN_STOPS) {
      const bannerSurface = composite(
        BANNER_TINT,
        BANNER_TINT_ALPHA,
        surfaceOver(PORCELAIN_CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(bannerSurface)),
        `stale banner ink over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
