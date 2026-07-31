import { expect } from 'vitest';

import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from './contrast';

/**
 * The ONE test-side mirror of the `styles.scss` glass tokens (extracted at the #135
 * review — previously each glass restyle spec hand-copied these "keep in sync"
 * constants, and stale copies pass silently). When a token is retuned in
 * `styles.scss`, this file is the only place the spec suite needs the new value.
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

/** `--riv-card-glass` per theme (promoted at #101 Slice 3; every card spec imports these since #465). */
export const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
export const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
/** `--riv-card-ink-soft` alpha over the card glass. */
export const CARD_INK_SOFT_ALPHA = 0.78;
/** `--riv-card-ink-faint` alpha over the card glass (promoted at #468). */
export const CARD_INK_FAINT_ALPHA = 0.72;

/** `--riv-chip-bg` per theme (over-glass tint). */
export const RIVIERA_CHIP = { color: WHITE, alpha: 0.16 };
export const PORCELAIN_CHIP = { color: CARD_INK, alpha: 0.05 };

/** Worst-case background-gradient stops a glass surface can sit over, per theme. */
export const RIVIERA_STOPS: readonly Rgb[] = ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hexToRgb);
export const PORCELAIN_STOPS: readonly Rgb[] = ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(
  hexToRgb,
);

/** Effective surface of a glass layer over an opaque stop. */
export function surfaceOver(glass: Glass, stop: Rgb): Rgb {
  return composite(glass.color, glass.alpha, stop);
}

/**
 * Asserts an (optionally alpha) ink meets the threshold on a glass surface over EVERY
 * given stop — the shared AA-over-worst-case-stops loop every glass restyle slice
 * (T1 shell, T2 Discover, T3–T5, operator epic) otherwise re-implements.
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
