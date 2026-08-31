import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_INK,
  DARK_DIALOG_GLASS,
  DARK_ERROR_INK,
  DARK_FIELD_BORDER,
  DARK_FIELD_FILL,
  DARK_STOPS,
  DARK_WASH_FILL,
  ERROR_INK,
  FIELD_BORDER_ALPHA,
  FIELD_FILL_ALPHA,
  FORM_ERROR_FILL,
  FORM_ERROR_INK,
  Glass,
  INK_DARK,
  PORCELAIN_STOPS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass booking dialog. The dialog is a
 * modal that floats over a dark scrim + the theme background, so every pair is the EFFECTIVE
 * colour: the panel glass composited over the theme's worst-case gradient stops, then each ink
 * composited over that (the `venue-map.contrast.spec.ts` pattern). This table mirrors every
 * text-bearing colour in `booking-dialog.ts`'s inline template (Tailwind utilities since #679);
 * a colour edit there must re-pass here.
 *
 * Deviations from the design file, on purpose: the gradient header
 * uses the AA-safe `--riv-cta-grad` teal with SOLID white ink (the design's brighter teal + opacity
 * whites fail AA); the panel is white 0.82 (design 0.72) so dark inks clear AA over the darkest
 * stop; input borders are the dark `--riv-field-border` (a white border fails the 3:1 boundary).
 *
 * Deliberately excluded (1.4.11 redundant / decorative): the step-number circles and the ✕ close
 * chip (aria-hidden — the step label / "Close" name carries the meaning) and the decorative
 * panel/mode-note borders. Those chips now use SOLID composited teal fills (not translucent white)
 * so static CSS contrast analysis computes their real colour; white on that chip still clears AA.
 */

// tailwind.css booking-dialog surfaces (light values; the dark theme swaps the tokens).
const DIALOG_GLASS: Glass = { color: WHITE, alpha: 0.82 }; // --riv-dialog-glass
const BACK_FILL: Glass = { color: WHITE, alpha: 0.5 }; // --riv-wash-fill (.btn-back)
const ACCENT = '#085a6e'; // --riv-accent-ink (price, total)
const BACK_INK = '#0a4f5e'; // --riv-back-ink (.btn-back text)
const DARK_BACK_INK = '#b7dfe9';
const BACK_HOVER_FILL: Glass = { color: WHITE, alpha: 0.75 }; // --riv-wash-hover (.btn-back:hover)
const DARK_BACK_HOVER_FILL: Glass = { color: WHITE, alpha: 0.16 };
// --riv-wash-hover-border: the button's own affordance boundary, tuned per theme to clear 3:1 (#839).
const BACK_HOVER_BORDER: Glass = { color: hexToRgb(BACK_INK.slice(1)), alpha: 0.6 };
const DARK_BACK_HOVER_BORDER: Glass = { color: hexToRgb(DARK_BACK_INK.slice(1)), alpha: 0.55 };

// The AA-safe dark-teal header gradient stops (= --riv-cta-grad), carrying solid white ink — used
// by the header AND the primary CTA. Theme-independent (the header teal does not vary by theme).
const TEAL_STOPS = ['#0c7288', '#0a5f74'];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly panel: Glass; // --riv-dialog-glass
  readonly ink: Rgb; // --riv-card-ink
  readonly inkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
  readonly error: Rgb; // --riv-error-ink
  readonly fieldFill: Glass; // --riv-field-fill over the panel
  readonly fieldBorder: Glass; // --riv-field-border over the field
  readonly backFill: Glass; // --riv-wash-fill under the Back button
  readonly backInk: string; // --riv-back-ink
  readonly backHoverFill: Glass; // --riv-wash-hover under the Back button on hover
  readonly backHoverBorder: Glass; // --riv-wash-hover-border on hover
}
const LIGHT_SURFACES = {
  panel: DIALOG_GLASS,
  ink: INK_DARK,
  inkBase: CARD_INK,
  accent: hexToRgb(ACCENT.slice(1)),
  error: ERROR_INK,
  fieldFill: { color: WHITE, alpha: FIELD_FILL_ALPHA },
  fieldBorder: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
  backFill: BACK_FILL,
  backInk: BACK_INK,
  backHoverFill: BACK_HOVER_FILL,
  backHoverBorder: BACK_HOVER_BORDER,
};
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, ...LIGHT_SURFACES },
  { name: 'porcelain', stops: PORCELAIN_STOPS, ...LIGHT_SURFACES },
  {
    name: 'dark',
    stops: DARK_STOPS,
    panel: DARK_DIALOG_GLASS,
    ink: DARK_CARD_INK,
    inkBase: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    error: DARK_ERROR_INK,
    fieldFill: DARK_FIELD_FILL,
    fieldBorder: DARK_FIELD_BORDER,
    backFill: DARK_WASH_FILL,
    backInk: DARK_BACK_INK,
    backHoverFill: DARK_BACK_HOVER_FILL,
    backHoverBorder: DARK_BACK_HOVER_BORDER,
  },
];

describe('Booking dialog — theme-independent header + CTA (WCAG AA, issue #137)', () => {
  it('solid white header + step-label + CTA text meets AA on both teal-gradient stops', () => {
    for (const stop of TEAL_STOPS) {
      expect(contrastRatio('#ffffff', stop), `white over ${stop}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('the active step number (dark teal on the white circle) meets AA', () => {
    // Decorative reinforcement, but it clears AA anyway: #0a5f74 on solid white.
    expect(contrastRatio('#0a5f74', '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * The banner is `--riv-form-error-*`, NOT the themed `--riv-error-ink` the `.field-error` above
   * wears: an opaque box in every theme, so a real ~6.6:1 rather than the ~1:1 the analyser saw on
   * the old tint. The invariance itself belongs to `form-error-tokens.contrast.spec.ts`.
   */
  it('form-error red meets AA on its solid light-pink fill (theme-independent, static-analysis safe)', () => {
    expect(
      contrastRatio(rgbToHex(FORM_ERROR_INK), rgbToHex(FORM_ERROR_FILL)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe.each(THEMES)(
  'Booking dialog panel contrast — $name theme (WCAG AA, issue #137)',
  (theme) => {
    it('card ink (title, summary values) meets AA on the panel glass', () => {
      expectAaOverStops(theme.ink, 1, theme.panel, theme.stops);
    });

    it('card ink-soft (keys, field labels, fine print, mode note) meets AA on the panel glass', () => {
      expectAaOverStops(theme.inkBase, CARD_INK_SOFT_ALPHA, theme.panel, theme.stops);
    });

    it('accent ink (price, total) meets AA on the panel glass', () => {
      expectAaOverStops(theme.accent, 1, theme.panel, theme.stops);
    });

    it('field-error red meets AA on the panel glass', () => {
      // .field-error sits directly on the panel (no fill of its own); .form-error is asserted theme-independently above.
      expectAaOverStops(theme.error, 1, theme.panel, theme.stops);
    });

    it('field text (dark ink) meets AA on the field fill over the panel', () => {
      for (const stop of theme.stops) {
        const panel = surfaceOver(theme.panel, stop);
        const field = composite(theme.fieldFill.color, theme.fieldFill.alpha, panel);
        expect(contrastRatio(rgbToHex(theme.ink), rgbToHex(field))).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    });

    it('field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
      for (const stop of theme.stops) {
        const panel = surfaceOver(theme.panel, stop);
        const field = composite(theme.fieldFill.color, theme.fieldFill.alpha, panel);
        const border = composite(theme.fieldBorder.color, theme.fieldBorder.alpha, field);
        expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
      }
    });

    it('Back button ink meets AA on its light-glass fill over the panel', () => {
      for (const stop of theme.stops) {
        const panel = surfaceOver(theme.panel, stop);
        const back = composite(theme.backFill.color, theme.backFill.alpha, panel);
        expect(contrastRatio(theme.backInk, rgbToHex(back))).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it("Back button's hover border marks its own affordance boundary at 3:1 against its hover fill (WCAG 1.4.11, issue #839)", () => {
      for (const stop of theme.stops) {
        const panel = surfaceOver(theme.panel, stop);
        const hoverFill = composite(theme.backHoverFill.color, theme.backHoverFill.alpha, panel);
        const border = composite(
          theme.backHoverBorder.color,
          theme.backHoverBorder.alpha,
          hoverFill,
        );
        expect(contrastRatio(rgbToHex(border), rgbToHex(hoverFill))).toBeGreaterThanOrEqual(
          AA_LARGE,
        );
      }
    });
  },
);
