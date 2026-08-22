import { expect } from 'vitest';

import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from './contrast';

/**
 * The ONE test-side mirror of the `styles.scss` glass tokens — per-spec hand-copies of these
 * "keep in sync" constants go stale silently, so every glass spec imports these instead. When a
 * token is retuned in `styles.scss`, this file is the only place the spec suite needs the new value.
 */

export interface Glass {
  readonly color: Rgb;
  readonly alpha: number;
}

export const WHITE: Rgb = hexToRgb('ffffff');
/** Porcelain `--riv-ink` and both themes' `--riv-card-ink`. */
export const INK_DARK: Rgb = hexToRgb('0a2a33');
/** Base of the rgba(12, 42, 51, …) muted-ink family. */
export const CARD_INK: Rgb = hexToRgb('0c2a33');

export const RIVIERA_HEADER_GLASS: Glass = { color: hexToRgb('0a2c3f'), alpha: 0.72 };
export const PORCELAIN_HEADER_GLASS: Glass = { color: WHITE, alpha: 0.6 };

/** `--riv-card-glass` per theme; every card spec imports these. */
export const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
export const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
/** `--riv-card-ink-soft` alpha over the card glass. */
export const CARD_INK_SOFT_ALPHA = 0.78;
/** `--riv-card-ink-faint` alpha over the card glass. */
export const CARD_INK_FAINT_ALPHA = 0.72;
/** `--riv-card-track` alpha (a `CARD_INK` tint) over the card glass. */
export const CARD_TRACK_ALPHA = 0.12;

/**
 * `--riv-field-fill` alpha (white), composited over whichever surface the field sits on —
 * the card glass on Discover/auth, the `0.82` panels in the booking and find dialogs.
 * `venue-map`'s date field is deliberately NOT this token (see that spec's local constant).
 */
export const FIELD_FILL_ALPHA = 0.55;
/** `--riv-field-border` alpha (a `CARD_INK` tint) over the field fill — the WCAG 1.4.11 boundary. */
export const FIELD_BORDER_ALPHA = 0.55;

/** `--riv-track-bg` per theme — the placeholder/track tint for the INK-coloured panel glass,
 *  the counterpart of `--riv-card-track` on the light card glass. */
export const RIVIERA_PANEL_TRACK = { color: WHITE, alpha: 0.25 };
export const PORCELAIN_PANEL_TRACK = { color: CARD_INK, alpha: 0.12 };

/** `--riv-chip-bg` per theme (over-glass tint). */
export const RIVIERA_CHIP = { color: WHITE, alpha: 0.16 };
export const PORCELAIN_CHIP = { color: CARD_INK, alpha: 0.05 };

/** The shared beach-map canvas's sea→sand wash stops (`beach-map-canvas.html`, #672).
 *  The first is the canvas host's `--riv-map-sea`, which the tourist legend band also wears. */
export const WASH_STOPS: readonly Rgb[] = ['cfeef6', 'e7f5f1', 'f6eedb'].map(hexToRgb);

/** Worst-case background-gradient stops a glass surface can sit over, per theme. */
export const RIVIERA_STOPS: readonly Rgb[] = ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hexToRgb);
export const PORCELAIN_STOPS: readonly Rgb[] = ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(
  hexToRgb,
);

/** `--riv-photo-grad` stops — the photo band's placeholder gradient (theme-invariant). */
export const PHOTO_STOPS: readonly Rgb[] = ['2bb8d4', '0e8aa8'].map(hexToRgb);

/**
 * Every backdrop an overlay on a photo band must survive: the placeholder gradient's own stops
 * plus the two extremes a real uploaded photo can present — pure white and pure black. Since #142
 * the bands back real images, so "worst case" stopped meaning "the gradient's lightest stop".
 */
export const WORST_PHOTOS: readonly Rgb[] = [...PHOTO_STOPS, WHITE, hexToRgb('000000')];

/** `--riv-mode-chip-glass` — the white glass under the Discover mode chip and the step chips. */
export const MODE_CHIP_GLASS: Glass = { color: WHITE, alpha: 0.85 };

/** `--riv-photo-chrome` — the dot rail's dark backing over a photo (#704). */
export const PHOTO_CHROME: Glass = { color: hexToRgb('0d2828'), alpha: 0.7 };

/** `--riv-photo-chrome-edge` alpha (a `CARD_INK` tint) — the step chip's 1.4.11 boundary (#704). */
export const PHOTO_CHROME_EDGE_ALPHA = 0.6;

/** Effective surface of a glass layer over an opaque stop. */
export function surfaceOver(glass: Glass, stop: Rgb): Rgb {
  return composite(glass.color, glass.alpha, stop);
}

/**
 * Asserts an (optionally alpha) ink meets the threshold on a glass surface over EVERY
 * given stop — the shared AA-over-worst-case-stops loop every glass restyle
 * otherwise re-implements.
 */
export function expectAaOverStops(
  ink: Rgb,
  inkAlpha: number,
  glass: Glass,
  stops: readonly Rgb[],
  threshold: number = AA_NORMAL,
): void {
  for (const stop of stops) {
    const surface = surfaceOver(glass, stop);
    const effectiveInk = composite(ink, inkAlpha, surface);
    expect(
      contrastRatio(rgbToHex(effectiveInk), rgbToHex(surface)),
      `over stop ${rgbToHex(stop)}`,
    ).toBeGreaterThanOrEqual(threshold);
  }
}
