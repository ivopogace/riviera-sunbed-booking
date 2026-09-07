import { AA_NORMAL, Rgb, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
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
  SOLID_FILL_WARN,
  WARN_FILL,
  WARN_INK,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
  tintOver,
} from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the Payouts tab. The tab wears the operator's console theme (porcelain by default; the themed block at the foot proves both);
 * surfaces use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading, ledger ink
 * (`#<bookingId>` reference, gross), period-total label and statement ink use `--riv-card-ink`; the
 * intro/dates/commission/empty sub-copy use `--riv-card-ink-soft` (0.78); the "Owed to you" label,
 * column headers and footnote use `--riv-card-ink-faint` (0.72). The owed figure + accrual net use the
 * console accent ink `--riv-console-accent-ink`; reversal net + the reason chip use the console's negative ink
 * `--riv-console-negative-ink` (the chip also over its own tint of that same value at 0.10, 0.12 before the ladder (#879) — the lowest
 * pair that ink lands in anywhere, which is why the measurement lives here; the tab's own lowest is the weather
 * button's white on `--riv-solid-fill-warn` at 4.99:1); the load-error uses the alert red `--riv-error-ink`.
 * Solid buttons put white on `--riv-solid-fill-brand`
 * (statement) and on `--riv-solid-fill-warn` (weather confirm).
 *
 * <p>Since #881 the weather confirm renders via `shared/confirm-panel`'s `warn` tone: the button
 * fill is the registered `--riv-solid-fill-warn` token (still the darkened amber `#9a6410` — white
 * passes AA where the design mock's `#d9861a`/`#f0aa2e` would not), and the confirm copy's ink is
 * the component's own `--riv-warn-ink` over `--riv-warn-fill`, the exact pairing #879 measured at
 * 6.86:1. Values mirror the token registry; a token edit there re-passes here.
 */

const TEAL = rgbToHex(CONSOLE_ACCENT_INK);
const REVERSAL = rgbToHex(CONSOLE_NEGATIVE_INK);
const ALERT = rgbToHex(ERROR_INK);
const WEATHER_BTN = rgbToHex(SOLID_FILL_WARN);
const REVERSAL_RGB = CONSOLE_NEGATIVE_INK;

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

  it('the weather-confirm copy (--riv-warn-ink) meets AA over its own --riv-warn-fill (#881)', () => {
    // Rendered via shared/confirm-panel since #881 — the same pairing #879 proved at 6.86:1.
    expect(contrastRatio(rgbToHex(WARN_INK), rgbToHex(WARN_FILL))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('the solid buttons (white on --riv-solid-fill-brand statement / --riv-solid-fill-warn confirm) meet AA', () => {
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#ffffff', WEATHER_BTN)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. The statement panel is the opaque inset — white in porcelain, the slate in
 *  dark — so its rows composite over that rather than the card. */
describe.each(CONSOLE_THEMES)(
  'PayoutsTab contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('heading, ledger ink, dates and the column headers meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_FAINT_ALPHA, (stop) => cardOver(theme, stop));
    });

    it('the owed figure and the accrual net (--riv-console-accent-ink) meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.accentInk, 1, (stop) => cardOver(theme, stop));
    });

    it('the reversal net and its reason chip (--riv-console-negative-ink, over its own /10 tint) meet AA', () => {
      expectAaOnSurfaces(theme, theme.negativeInk, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.negativeInk, 1, (stop) =>
        tintOver(theme, theme.negativeInk, 0.1, stop),
      );
    });

    it('the load-error notice (--riv-error-ink on the inset/70) and the period control (card ink on the inset/60) meet AA', () => {
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => insetOver(theme, 0.7, stop));
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.6, stop));
    });

    it('the statement’s inks meet AA on the opaque inset panel: card ink, soft ink, the accent chip and the total row', () => {
      const panel = theme.inset;
      const ratio = (ink: Rgb, alpha: number, over: Rgb) =>
        contrastRatio(rgbToHex(composite(ink, alpha, over)), rgbToHex(over));
      expect(ratio(theme.ink, 1, panel), `${theme.name}: statement ink`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(
        ratio(theme.ink, CARD_INK_SOFT_ALPHA, panel),
        `${theme.name}: statement soft ink`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      const header = composite(theme.tint, 0.05, panel);
      expect(
        ratio(theme.ink, CARD_INK_SOFT_ALPHA, header),
        `${theme.name}: table header`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(
        ratio(theme.accentRing, 1, header),
        `${theme.name}: period chip`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      const total = composite(theme.selectTint, 0.05, panel);
      expect(ratio(theme.ink, 1, total), `${theme.name}: total row`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  },
);
