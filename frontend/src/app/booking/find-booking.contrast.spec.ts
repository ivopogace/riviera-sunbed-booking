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
 * WCAG-AA contrast guard for the Liquid Glass "Find a booking" modal. The modal
 * floats over a dark scrim + the theme background, so every pair is the EFFECTIVE colour: the panel
 * glass composited over the theme's worst-case gradient stops, then each ink composited over that
 * (the booking-dialog.contrast.spec.ts pattern). This table mirrors every text-bearing token in
 * find-booking.scss.
 *
 * Deviations from the design file, on purpose (cloned from booking-dialog): the panel is
 * white 0.82 (design 0.78) so dark inks clear AA over the darkest stop; the input border is the dark
 * --riv-field-border (a white border fails the 3:1 boundary); the CTA is the AA-safe --riv-cta-grad
 * teal with SOLID white ink.
 *
 * Deliberately excluded (decorative / 1.4.11-exempt): the ✕ close glyph (aria-hidden — the "Close"
 * button name carries the meaning) and the decorative panel/close borders.
 */

const PANEL_GLASS: Glass = { color: WHITE, alpha: 0.82 }; // .find-panel
const ERROR_RED = '#a3160e'; // .find-error, sitting directly on the panel

// The AA-safe dark-teal CTA gradient stops (= --riv-cta-grad), carrying solid white ink.
// Theme-independent (the teal does not vary by theme).
const TEAL_STOPS = ['#0c7288', '#0a5f74'];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
}
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS },
  { name: 'porcelain', stops: PORCELAIN_STOPS },
];

describe('Find-booking modal — theme-independent CTA (WCAG AA, issue #148)', () => {
  it('solid white "Open booking" text meets AA on both teal-gradient stops', () => {
    for (const stop of TEAL_STOPS) {
      expect(contrastRatio('#ffffff', stop), `white over ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe.each(THEMES)('Find-booking modal panel contrast — $name theme (WCAG AA, issue #148)', (theme) => {
  it('card ink (the "Find your booking" title, intro strong) meets AA on the panel glass', () => {
    expectAaOverStops(INK_DARK, 1, PANEL_GLASS, theme.stops);
  });

  it('card ink-soft (intro, field label, placeholder) meets AA on the panel glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PANEL_GLASS, theme.stops);
  });

  it('the not-found error red meets AA on the panel glass', () => {
    expectAaOverStops(hexToRgb(ERROR_RED), 1, PANEL_GLASS, theme.stops);
  });

  it('code-input text (dark ink) meets AA on the field fill over the panel', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(PANEL_GLASS, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(field))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the input border marks the field boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(PANEL_GLASS, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});
