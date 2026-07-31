import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_STOPS,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the O5 Daily view tab (#175). The tab is always porcelain (console
 * host); its date + arrivals panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text
 * pairs: the headings, row/date labels, arrivals labels and the availability strong counts use
 * `--riv-card-ink`; the helper/availability text uses `--riv-card-ink-soft` (0.78); the "Date"
 * mini-label uses `--riv-card-ink-faint` (0.72); the write-failure notice + load-error use `#a3160e`.
 * The arrival-code chip ink (`--riv-card-ink`) sits over `--riv-chip-bg` over the card glass. Tile
 * glyphs are `aria-hidden` decorative (state is conveyed by the tile's `aria-label`), so only the
 * filled STAFF_MARKED tile — white glyph on the `#0a6e85` teal, also its legend swatch — is asserted.
 * Values mirror the template + `styles.scss`; a token edit there must re-pass here.
 */

describe('DailyViewTab porcelain contrast (WCAG AA, #175)', () => {
  it('headings + labels + arrivals + availability counts (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('helper + availability text (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the "Date" mini-label (--riv-card-ink-faint 0.72) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.72, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the arrival-code chip ink (--riv-card-ink) meets AA over the chip tint on the card glass', () => {
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

  it('the marked-tile glyph + legend swatch (white on #0a6e85) meet AA', () => {
    expect(contrastRatio('#ffffff', '#0a6e85')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the write-failure notice + load-error ink (#a3160e) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio('#a3160e', rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
