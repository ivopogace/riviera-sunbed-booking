import { expect } from 'vitest';

import { AA_NORMAL, Rgb, composite, contrastRatio, rgbToHex } from './contrast';
import {
  ACCENT_INK,
  CONSOLE_ACCENT_INK,
  CONSOLE_INSET,
  CONSOLE_NEGATIVE_INK,
  DARK_ACCENT_INK,
  DARK_CHIP,
  DARK_CONSOLE_AVATAR_RING,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_CONSOLE_ACCENT_INK,
  DARK_CONSOLE_INSET,
  DARK_CONSOLE_NEGATIVE_INK,
  DARK_ERROR_INK,
  DARK_FIELD_FILL,
  DARK_HEADER_GLASS,
  DARK_INK_FAINT,
  DARK_POP_ACCENT,
  DARK_POP_HOVER,
  DARK_POP_INK,
  DARK_POP_INK_SOFT,
  DARK_POP_SURFACE,
  DARK_PREMIUM_GRAD_STOPS,
  DARK_PREMIUM_INK,
  DARK_STOPS,
  DARK_WASH_STOPS,
  ERROR_INK,
  FIELD_FILL_ALPHA,
  Glass,
  INK_DARK,
  INK_FAINT,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  POP_ACCENT,
  POP_HOVER,
  POP_INK,
  POP_INK_SOFT,
  POP_SURFACE,
  PREMIUM_GRAD_STOPS,
  PREMIUM_INK,
  SOLID_FILL_BRAND,
  WASH_STOPS,
  WHITE,
  surfaceOver,
} from './glass-tokens';

/**
 * The two console themes as one test-side table, so every console contrast spec composites both
 * off the same rows instead of re-declaring a per-theme block of its own (the tourist specs each
 * carry a private `THEMES` array; fifteen console specs would have carried fifteen). A value here
 * mirrors `tailwind.css` through `glass-tokens.ts`; a retune there is one row here.
 *
 * <p>The console never wears `riviera` — two rows, by decision — so a spec iterating this table
 * is proving exactly the themes an operator can reach.
 */
export interface ConsoleTheme {
  readonly name: 'porcelain' | 'dark';
  /** The page gradient's worst stops. */
  readonly stops: readonly Rgb[];
  /** The beach map's sea→sand wash stops. */
  readonly washStops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly headerGlass: Glass;
  /** `--riv-ink` / `--riv-card-ink` (one value in both console themes). */
  readonly ink: Rgb;
  /** `--riv-console-accent-ink`. */
  readonly accentInk: Rgb;
  /** `--riv-console-negative-ink`. */
  readonly negativeInk: Rgb;
  /** `--riv-error-ink`. */
  readonly errorInk: Rgb;
  /** `--riv-accent-ink` — the selection ring and the tourist-family accent the console shares. */
  readonly accentRing: Rgb;
  /** `--riv-console-tint` — hairlines, the hatch's bands. */
  readonly tint: Rgb;
  /** `--riv-console-inset` — the base behind every `bg-riv-console-inset/α` fill. */
  readonly inset: Rgb;
  /** `--riv-select-tint` / `--riv-select-edge`. */
  readonly selectTint: Rgb;
  readonly selectEdge: Rgb;
  /** `--riv-alert-tint`. */
  readonly alertTint: Rgb;
  /** `--riv-positive-tint`. */
  readonly positiveTint: Rgb;
  /** `--riv-premium-grad`'s stops and the `--riv-premium-ink` numeral over them. */
  readonly premiumStops: readonly Rgb[];
  readonly premiumInk: Rgb;
  readonly popSurface: Glass;
  readonly popInk: Rgb;
  readonly popInkSoft: Glass;
  readonly popHover: Glass;
  /** `--riv-pop-accent` — the current row's ink in every popover. */
  readonly popAccent: Rgb;
  /** `--riv-chip-bg` — the account chip's tint on the header glass. */
  readonly chip: Glass;
  /** `--riv-ink-faint` — the rail's hairline and dividers, the resting slot ink. */
  readonly inkFaint: Glass;
  /** `--riv-field-fill` — the palette's search field on the popover surface. */
  readonly fieldFill: Glass;
  /** The chip's 3:1 boundary on the header glass: the solid brand disc itself in porcelain, the
   *  `--riv-console-avatar-ring` round it in dark (where the disc alone reads 2.6:1). */
  readonly avatarBoundary: Glass;
}

export const CONSOLE_THEMES: readonly ConsoleTheme[] = [
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    washStops: WASH_STOPS,
    cardGlass: PORCELAIN_CARD_GLASS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    ink: INK_DARK,
    accentInk: CONSOLE_ACCENT_INK,
    negativeInk: CONSOLE_NEGATIVE_INK,
    errorInk: ERROR_INK,
    accentRing: ACCENT_INK,
    tint: hexToRgbOf('#0c2a33'),
    inset: CONSOLE_INSET,
    selectTint: hexToRgbOf('#2bb8d4'),
    selectEdge: hexToRgbOf('#0e8aa8'),
    alertTint: hexToRgbOf('#a3160e'),
    positiveTint: hexToRgbOf('#0e6e46'),
    premiumStops: PREMIUM_GRAD_STOPS,
    premiumInk: PREMIUM_INK,
    popSurface: POP_SURFACE,
    popInk: POP_INK,
    popInkSoft: POP_INK_SOFT,
    popHover: POP_HOVER,
    popAccent: POP_ACCENT,
    chip: PORCELAIN_CHIP,
    inkFaint: INK_FAINT,
    fieldFill: { color: WHITE, alpha: FIELD_FILL_ALPHA },
    avatarBoundary: { color: SOLID_FILL_BRAND, alpha: 1 },
  },
  {
    name: 'dark',
    stops: DARK_STOPS,
    washStops: DARK_WASH_STOPS,
    cardGlass: DARK_CARD_GLASS,
    headerGlass: DARK_HEADER_GLASS,
    ink: DARK_CARD_INK,
    accentInk: DARK_CONSOLE_ACCENT_INK,
    negativeInk: DARK_CONSOLE_NEGATIVE_INK,
    errorInk: DARK_ERROR_INK,
    accentRing: DARK_ACCENT_INK,
    tint: WHITE,
    inset: DARK_CONSOLE_INSET,
    selectTint: hexToRgbOf('#7cd7e8'),
    selectEdge: hexToRgbOf('#9adde8'),
    alertTint: hexToRgbOf('#ff8a7a'),
    positiveTint: hexToRgbOf('#7fd8ac'),
    premiumStops: DARK_PREMIUM_GRAD_STOPS,
    premiumInk: DARK_PREMIUM_INK,
    popSurface: DARK_POP_SURFACE,
    popInk: DARK_POP_INK,
    popInkSoft: DARK_POP_INK_SOFT,
    popHover: DARK_POP_HOVER,
    popAccent: DARK_POP_ACCENT,
    chip: DARK_CHIP,
    inkFaint: DARK_INK_FAINT,
    fieldFill: DARK_FIELD_FILL,
    avatarBoundary: DARK_CONSOLE_AVATAR_RING,
  },
];

/** The class-O rows carry their values as CSS text; the compositing maths wants channels. */
function hexToRgbOf(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** The header glass composited over one page stop. */
export function headerOver(theme: ConsoleTheme, stop: Rgb): Rgb {
  return surfaceOver(theme.headerGlass, stop);
}

/** The popover surface composited over one page stop. */
export function popOver(theme: ConsoleTheme, stop: Rgb): Rgb {
  return surfaceOver(theme.popSurface, stop);
}

/** A glass layer (an alpha token) laid on a surface. */
export function glassOn(glass: Glass, surface: Rgb): Rgb {
  return composite(glass.color, glass.alpha, surface);
}

/** The card glass composited over one page stop. */
export function cardOver(theme: ConsoleTheme, stop: Rgb): Rgb {
  return surfaceOver(theme.cardGlass, stop);
}

/** A `bg-riv-console-inset/α` fill on the card glass over one page stop. */
export function insetOver(theme: ConsoleTheme, alpha: number, stop: Rgb): Rgb {
  return composite(theme.inset, alpha, cardOver(theme, stop));
}

/** A tint (`bg-riv-<token>/α`) on the card glass over one page stop. */
export function tintOver(theme: ConsoleTheme, tint: Rgb, alpha: number, stop: Rgb): Rgb {
  return composite(tint, alpha, cardOver(theme, stop));
}

/**
 * Asserts an ink (at its own alpha) meets the threshold on a surface derived per page stop — the
 * loop every console pair otherwise re-implements: the surface is whatever the caller composites
 * for that stop (an inset, a tint, the bare card), so one helper serves every fill kind.
 */
export function expectAaOnSurfaces(
  theme: ConsoleTheme,
  ink: Rgb,
  inkAlpha: number,
  surface: (stop: Rgb) => Rgb,
  threshold: number = AA_NORMAL,
): void {
  for (const stop of theme.stops) {
    const fill = surface(stop);
    const effectiveInk = composite(ink, inkAlpha, fill);
    expect(
      contrastRatio(rgbToHex(effectiveInk), rgbToHex(fill)),
      `${theme.name}: over stop ${rgbToHex(stop)}`,
    ).toBeGreaterThanOrEqual(threshold);
  }
}
