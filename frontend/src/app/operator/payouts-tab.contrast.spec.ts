import { AA_NORMAL, composite, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  INK_DARK,
  PORCELAIN_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the O7 Payouts tab (#173). The tab is always porcelain (console host);
 * surfaces use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading, ledger ink
 * (`#<bookingId>` reference, gross), period-total label and statement ink use `--riv-card-ink`; the
 * intro/dates/commission/empty sub-copy use `--riv-card-ink-soft` (0.78); the "Owed to you" label,
 * column headers and footnote use `--riv-card-ink-faint` (0.72). The owed figure + accrual net use the
 * console teal `#0a6e85`; reversal net + the reason chip use refund-red `#a3372a` (also over its own
 * `#a3372a`@0.12 tint); the load-error uses alert red `#a3160e`. Solid buttons put white on `#0a6e85`
 * (statement) and on a **darkened** amber `#9a6410` (weather confirm).
 *
 * <p>The design mock's amber `#d9861a`/`#f0aa2e` with white text fails AA on white; per the
 * `riviera-tailwind` "deviate-from-design-for-AA-with-a-note" rule the confirm **button** uses the
 * darker `#9a6410` (white passes), while the amber `#f0aa2e`@0.10 stays as a decorative **tint** behind
 * `--riv-card-ink` copy (dark ink, ample contrast). Values mirror the template; a colour edit re-passes here.
 */

const CARD_GLASS = { color: WHITE, alpha: 0.55 };
const TEAL = '#0a6e85';
const REVERSAL = '#a3372a';
const ALERT = '#a3160e';
const WEATHER_BTN = '#9a6410';
const REVERSAL_RGB = hexToRgb(REVERSAL);
const WEATHER_TINT = hexToRgb('f0aa2e');

/** The card-glass surface composited over a porcelain background stop. */
function cardSurface(stop: (typeof PORCELAIN_STOPS)[number]): string {
  return rgbToHex(surfaceOver(CARD_GLASS, stop));
}

describe('PayoutsTab porcelain contrast (WCAG AA, #173)', () => {
  it('heading + ledger ink + period-total label + statement ink (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('intro + dates + commission + empty sub-copy (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.78, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the "Owed to you" label + column headers + footnote (--riv-card-ink-faint 0.72) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.72, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the owed figure + accrual net (teal #0a6e85) meet AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(TEAL, cardSurface(stop)),
        `teal over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the reversal net (refund-red #a3372a) meets AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(REVERSAL, cardSurface(stop)),
        `reversal over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the reason-chip text (#a3372a) meets AA over its own #a3372a@0.12 tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chip = composite(REVERSAL_RGB, 0.12, surfaceOver(CARD_GLASS, stop));
      expect(
        contrastRatio(REVERSAL, rgbToHex(chip)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the load-error red (#a3160e) meets AA on the card glass (a fortiori over its white/70 panel)', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ALERT, cardSurface(stop)),
        `alert over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the weather-confirm copy (--riv-card-ink) meets AA over the #f0aa2e@0.10 confirm tint', () => {
    for (const stop of PORCELAIN_STOPS) {
      const tint = composite(WEATHER_TINT, 0.1, surfaceOver(CARD_GLASS, stop));
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(tint)),
        `ink over amber tint ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the solid buttons (white on teal #0a6e85 statement / darkened amber #9a6410 confirm) meet AA', () => {
    expect(contrastRatio('#ffffff', TEAL)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#ffffff', WEATHER_BTN)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
