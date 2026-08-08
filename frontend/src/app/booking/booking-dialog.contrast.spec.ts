import { AA_LARGE, AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  FIELD_BORDER_ALPHA,
  FIELD_FILL_ALPHA,
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
 * text-bearing token in `booking-dialog.scss`.
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

// styles.scss booking-dialog surfaces.
const DIALOG_GLASS: Glass = { color: WHITE, alpha: 0.82 }; // .booking-panel
const BACK_FILL_ALPHA = 0.5; // .btn-back glass over the panel
const ACCENT = '#085a6e'; // --riv-accent-ink (price, total)
const ERROR_RED = '#a3160e'; // .field-error (on the panel) + .form-error ink (on the solid fill below)
const ERROR_FILL = '#f6e8e7'; // .form-error solid light-pink box (composite of the old rgba(163,22,14,.1) tint)
const BACK_INK = '#0a4f5e'; // .btn-back text

// The AA-safe dark-teal header gradient stops (= --riv-cta-grad), carrying solid white ink — used
// by the header AND the primary CTA. Theme-independent (the header teal does not vary by theme).
const TEAL_STOPS = ['#0c7288', '#0a5f74'];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
}
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS },
  { name: 'porcelain', stops: PORCELAIN_STOPS },
];

describe('Booking dialog — theme-independent header + CTA (WCAG AA, issue #137)', () => {
  it('solid white header + step-label + CTA text meets AA on both teal-gradient stops', () => {
    for (const stop of TEAL_STOPS) {
      expect(contrastRatio('#ffffff', stop), `white over ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the active step number (dark teal on the white circle) meets AA', () => {
    // Decorative reinforcement, but it clears AA anyway: #0a5f74 on solid white.
    expect(contrastRatio('#0a5f74', '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('form-error red meets AA on its solid light-pink fill (theme-independent, static-analysis safe)', () => {
    // .form-error now sits on an opaque #f6e8e7 box (was a translucent red tint), so the pair is a
    // single fixed hex in both themes — a real ~6.6:1, not the ~1:1 the analyser saw on the tint.
    expect(contrastRatio(ERROR_RED, ERROR_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe.each(THEMES)('Booking dialog panel contrast — $name theme (WCAG AA, issue #137)', (theme) => {
  it('card ink (title, summary values) meets AA on the panel glass', () => {
    expectAaOverStops(INK_DARK, 1, DIALOG_GLASS, theme.stops);
  });

  it('card ink-soft (keys, field labels, fine print, mode note) meets AA on the panel glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, DIALOG_GLASS, theme.stops);
  });

  it('accent ink (price, total) meets AA on the panel glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, DIALOG_GLASS, theme.stops);
  });

  it('field-error red meets AA on the panel glass', () => {
    // .field-error sits directly on the panel (no fill of its own); .form-error moved to a solid
    // fill, asserted theme-independently above.
    expectAaOverStops(hexToRgb(ERROR_RED), 1, DIALOG_GLASS, theme.stops);
  });

  it('field text (dark ink) meets AA on the field fill over the panel', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(DIALOG_GLASS, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(field))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(DIALOG_GLASS, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('Back button ink meets AA on its light-glass fill over the panel', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(DIALOG_GLASS, stop);
      const back = composite(WHITE, BACK_FILL_ALPHA, panel);
      expect(contrastRatio(BACK_INK, rgbToHex(back))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
