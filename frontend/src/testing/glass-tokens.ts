import { expect } from 'vitest';

import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from './contrast';

/**
 * The ONE test-side mirror of the `tailwind.css` glass tokens — per-spec hand-copies of these
 * "keep in sync" constants go stale silently, so every glass spec imports these instead. When a
 * token is retuned in `tailwind.css`, this file is the only place the spec suite needs the new value.
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
export const DARK_HEADER_GLASS: Glass = { color: hexToRgb('0f172a'), alpha: 0.72 };

/** `--riv-card-glass` per theme; every card spec imports these. The dark theme inverts the whole
 *  card family (dark glass, light inks — the DARK_* mirrors below); riviera/porcelain keep the
 *  white glass with the shared dark-ink constants above. */
export const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
export const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
export const DARK_CARD_GLASS: Glass = { color: hexToRgb('101a2e'), alpha: 0.86 };

/** Dark theme's light card-ink base — `--riv-card-ink` and the rgba(242, 247, 250, …) muted family. */
export const DARK_CARD_INK: Rgb = hexToRgb('f2f7fa');
/** Dark theme's `--riv-accent-ink` (light teal; light themes keep #085a6e). */
export const DARK_ACCENT_INK: Rgb = hexToRgb('7cd7e8');
/** `--riv-error-ink` per ink family (light themes: #a3160e). */
export const DARK_ERROR_INK: Rgb = hexToRgb('ffa9a1');
/** `--riv-error-ink` on the light themes (the dark theme's is DARK_ERROR_INK above). */
export const ERROR_INK: Rgb = hexToRgb('a3160e');
/** `--riv-accent-ink` on the light themes (the dark theme's is DARK_ACCENT_INK above). */
export const ACCENT_INK: Rgb = hexToRgb('085a6e');

/** Dark `--riv-field-fill` / `--riv-field-border` (light themes: the FIELD_*_ALPHA constants). */
export const DARK_FIELD_FILL: Glass = { color: hexToRgb('020a16'), alpha: 0.45 };
export const DARK_FIELD_BORDER: Glass = { color: WHITE, alpha: 0.5 };
/** Dark `--riv-card-track` (light themes: CARD_INK at CARD_TRACK_ALPHA). */
export const DARK_CARD_TRACK: Glass = { color: WHITE, alpha: 0.18 };
/** `--riv-dialog-glass` per ink family (light themes: white 0.82). */
export const DARK_DIALOG_GLASS: Glass = { color: hexToRgb('101a2e'), alpha: 0.94 };
/** Dark `--riv-wash-fill` / `--riv-inset-fill` (light themes: white 0.5 / 0.4). */
export const DARK_WASH_FILL: Glass = { color: WHITE, alpha: 0.08 };

/** The `--riv-danger-*` set — the erasure confirm panel's tinted danger treatment: a panel tint
 *  over the card glass, then a stronger action tint over the panel. Light themes here; the dark
 *  counterparts are the DARK_DANGER_* mirrors below. The `*_BORDER` pair is non-text chrome
 *  (WCAG 1.4.11) and is not asserted by the contrast spec — see its header. */
export const DANGER_INK: Rgb = hexToRgb('8f2c22');
export const DANGER_FILL: Glass = { color: hexToRgb('b3362b'), alpha: 0.06 };
export const DANGER_BORDER: Glass = { color: hexToRgb('b3362b'), alpha: 0.35 };
export const DANGER_ACTION_FILL: Glass = { color: hexToRgb('b3362b'), alpha: 0.1 };
export const DANGER_ACTION_BORDER: Glass = { color: hexToRgb('b3362b'), alpha: 0.6 };

/** The dark theme's `--riv-danger-*` set. The ink matches DARK_ERROR_INK — porcelain
 *  distinguishes the two reds, dark does not. */
export const DARK_DANGER_INK: Rgb = hexToRgb('ffa9a1');
export const DARK_DANGER_FILL: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.1 };
export const DARK_DANGER_BORDER: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.42 };
export const DARK_DANGER_ACTION_FILL: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.16 };
export const DARK_DANGER_ACTION_BORDER: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.66 };
/** The `--riv-accent-*` tint family (#835) — the brand teal as the three POSITIVE-state tinted
 *  treatments: the info panel, the selected chip, and the pay spinner's track. No dark mirror
 *  exists on purpose; the tokens are declared once and paint the same value in every theme.
 *  The `*_BORDER` values are non-text chrome (WCAG 1.4.11) — see the spec header. */
export const ACCENT_FILL: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.12 };
export const ACCENT_BORDER: Glass = { color: hexToRgb('0e8aa8'), alpha: 0.35 };
export const ACCENT_CHIP_FILL: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.18 };
export const ACCENT_CHIP_BORDER: Glass = { color: hexToRgb('0e8aa8'), alpha: 0.75 };
export const ACCENT_TRACK: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.25 };
export const ACCENT_STRONG: Rgb = hexToRgb('0e8aa8');

/** `--riv-solid-btn-ink` and the two fixed fills it is pinned to. Theme-invariant: the fills do
 *  not theme either, so a themed ink here would drift light-on-light in the dark theme. */
export const SOLID_BTN_INK: Rgb = hexToRgb('0a4f5e');
export const SOLID_BTN_FILL: Rgb = hexToRgb('f4f6f7');
export const SOLID_BTN_HOVER: Rgb = hexToRgb('e7ebec');

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
export const DARK_PANEL_TRACK = { color: WHITE, alpha: 0.25 };

/** `--riv-chip-bg` per theme (over-glass tint). */
export const RIVIERA_CHIP = { color: WHITE, alpha: 0.16 };
export const PORCELAIN_CHIP = { color: CARD_INK, alpha: 0.05 };
export const DARK_CHIP = { color: WHITE, alpha: 0.16 };

/** The shared beach-map canvas's sea→sand wash stops (`beach-map-canvas.html`, #672) — the
 *  daylight `--riv-map-sea/mid/sand` values (light themes + porcelain-pinned operator surfaces).
 *  The first is `--riv-map-sea`, which the tourist legend band also wears. */
export const WASH_STOPS: readonly Rgb[] = ['cfeef6', 'e7f5f1', 'f6eedb'].map(hexToRgb);
/** The night wash — the dark theme's `--riv-map-sea/mid/sand`. */
export const DARK_WASH_STOPS: readonly Rgb[] = ['14303c', '1c2f33', '2b2a22'].map(hexToRgb);

/** Worst-case background-gradient stops a glass surface can sit over, per theme. */
export const RIVIERA_STOPS: readonly Rgb[] = ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hexToRgb);
export const PORCELAIN_STOPS: readonly Rgb[] = ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(
  hexToRgb,
);
export const DARK_STOPS: readonly Rgb[] = ['3b4a5f', '2a3648', '33415a', '0b1120'].map(hexToRgb);

/** `--riv-photo-grad` stops — the photo band's placeholder gradient (light themes; the dark
 *  theme swaps in DARK_PHOTO_STOPS below). */
export const PHOTO_STOPS: readonly Rgb[] = ['2bb8d4', '0e8aa8'].map(hexToRgb);
/** The dark theme's `--riv-photo-grad` placeholder stops (light themes: PHOTO_STOPS). */
export const DARK_PHOTO_STOPS: readonly Rgb[] = ['3b4a5f', '24314a', '1a2438'].map(hexToRgb);

/**
 * Every backdrop an overlay on a photo band must survive: both placeholder gradients' own stops
 * plus the two extremes a real uploaded photo can present — pure white and pure black. Since #142
 * the bands back real images, so "worst case" stopped meaning "the gradient's lightest stop".
 */
export const WORST_PHOTOS: readonly Rgb[] = [
  ...PHOTO_STOPS,
  ...DARK_PHOTO_STOPS,
  WHITE,
  hexToRgb('000000'),
];

/** `--riv-mode-chip-glass` — the white glass under the step chips, on both slideshow hosts.
 *  Named for the Discover mode chip, which stopped wearing it at #705 (it took an opaque fill,
 *  which needs no backing); the step chips are now the token's whole population. */
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
