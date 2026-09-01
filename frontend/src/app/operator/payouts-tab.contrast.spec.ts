import { AA_NORMAL, composite, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  CONSOLE_ACCENT_INK,
  CONSOLE_NEGATIVE_INK,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  SOLID_FILL_BRAND,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Payouts tab. The tab is always porcelain (console host);
 * surfaces use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading, ledger ink
 * (`#<bookingId>` reference, gross), period-total label and statement ink use `--riv-card-ink`; the
 * intro/dates/commission/empty sub-copy use `--riv-card-ink-soft` (0.78); the "Owed to you" label,
 * column headers and footnote use `--riv-card-ink-faint` (0.72). The owed figure + accrual net use the
 * console accent ink `--riv-console-accent-ink`; reversal net + the reason chip use the console's negative ink
 * `--riv-console-negative-ink` (the chip also over its own tint of that same value at 0.10, 0.12 before the ladder (#879) — the lowest
 * pair that ink lands in anywhere, which is why the measurement lives here; the tab's own lowest is the weather
 * button's white on `#9a6410` at 4.99:1); the load-error uses the alert red `--riv-error-ink`.
 * Solid buttons put white on `--riv-solid-fill-brand`
 * (statement) and on a **darkened** amber `#9a6410` (weather confirm).
 *
 * <p>The design mock's amber `#d9861a`/`#f0aa2e` with white text fails AA on white; per the
 * `riviera-tailwind` "deviate-from-design-for-AA-with-a-note" rule the confirm **button** uses the
 * darker `#9a6410` (white passes), while the amber `#f0aa2e`@0.10 stays as a decorative **tint** behind
 * `--riv-card-ink` copy (dark ink, ample contrast). Values mirror the template; a colour edit re-passes here.
 */

const TEAL = rgbToHex(CONSOLE_ACCENT_INK);
const REVERSAL = rgbToHex(CONSOLE_NEGATIVE_INK);
const ALERT = rgbToHex(ERROR_INK);
const WEATHER_BTN = '#9a6410';
const REVERSAL_RGB = CONSOLE_NEGATIVE_INK;
const WEATHER_TINT = hexToRgb('f0aa2e');

/** The card-glass surface composited over a porcelain background stop. */
function cardSurface(stop: (typeof PORCELAIN_STOPS)[number]): string {
  return rgbToHex(surfaceOver(PORCELAIN_CARD_GLASS, stop));
}

describe('PayoutsTab porcelain contrast (WCAG AA, #173)', () => {
  it('heading + ledger ink + period-total label + statement ink (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('intro + dates + commission + empty sub-copy (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the "Owed to you" label + column headers + footnote (--riv-card-ink-faint 0.72) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the owed figure + accrual net (--riv-console-accent-ink) meet AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(TEAL, cardSurface(stop)),
        `teal over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the reversal net (--riv-console-negative-ink) meets AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(REVERSAL, cardSurface(stop)),
        `reversal over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the reason-chip text (--riv-console-negative-ink) meets AA over its own @0.10 tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chip = composite(REVERSAL_RGB, 0.1, surfaceOver(PORCELAIN_CARD_GLASS, stop));
      expect(
        contrastRatio(REVERSAL, rgbToHex(chip)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the load-error red (--riv-error-ink) meets AA on the card glass (a fortiori over its white/70 panel)', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ALERT, cardSurface(stop)),
        `alert over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the weather-confirm copy (--riv-card-ink) meets AA over the #f0aa2e@0.10 confirm tint', () => {
    for (const stop of PORCELAIN_STOPS) {
      const tint = composite(WEATHER_TINT, 0.1, surfaceOver(PORCELAIN_CARD_GLASS, stop));
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(tint)),
        `ink over amber tint ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the solid buttons (white on --riv-solid-fill-brand statement / darkened amber #9a6410 confirm) meet AA', () => {
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#ffffff', WEATHER_BTN)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
