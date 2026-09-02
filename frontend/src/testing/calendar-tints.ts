/**
 * The unit suite's ONE mirror of the availability calendar's day-cell palette — the same role
 * `testing/chip-fills.ts` plays for the chip directives and `testing/glass-tokens.ts` for the
 * `tailwind.css` glass tokens, and for the same reason: a per-spec hand-copy of a "keep in sync"
 * constant goes stale silently.
 *
 * <p>The palette is themed: one set of values in the stylesheet's base block (the light themes —
 * `riviera` inherits it, its popovers being white glass) and one in the `dark` block. Every value
 * is OPAQUE on purpose, in both palettes. A calendar day composited over theme-dependent glass would
 * need its contrast proved once per theme and once per background stop; a solid fill makes each
 * proof a plain pair, so theming the palette doubles the pairs and nothing else.
 *
 * <p>A list is only a list, so it is tied to the code at both ends. `venue/day-availability.spec.ts`
 * pins `DAY_TINT_CLASS` as exactly the utilities these tokens generate — a set, not a subset, so a
 * tint the list omits and a list entry no state renders both fail — and
 * `venue/availability-calendar.contrast.spec.ts` reads its pairs from here and ties each token's
 * two stylesheet declarations back to the values below.
 */

import { Rgb, rgbToHex } from './contrast';
import {
  DARK_POP_INK,
  DARK_POP_INK_DISABLED,
  DARK_POP_INK_SOFT,
  DARK_POP_SURFACE,
  DARK_STOPS,
  Glass,
  POP_INK,
  POP_INK_DISABLED,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_STOPS,
  RIVIERA_STOPS,
} from './glass-tokens';

/** One day state's opaque fill and the token that carries it. */
export interface CalendarTint {
  readonly state: 'free' | 'low' | 'full' | 'unknown';
  readonly name: string;
  readonly token: string;
  readonly fill: string;
}

/**
 * One palette: the popover glass its chrome sits on, the background stops that glass floats over,
 * the inks the popover family lends it, and the day-cell colours of its own. The ink on a day
 * cell is `--riv-pop-ink` — the same ink as the popover's chrome — so the cell fills are tuned to
 * the popover family's ink rather than carrying one of their own.
 */
export interface CalendarPalette {
  readonly name: 'light' | 'dark';
  readonly surface: Glass;
  readonly stops: readonly Rgb[];
  readonly ink: string;
  readonly inkSoft: Glass;
  readonly inkDisabled: Glass;
  readonly tints: readonly CalendarTint[];
  /** `--riv-calendar-accent`: the month-step glyphs and every day cell's focus ring. */
  readonly accent: string;
  /**
   * `--riv-calendar-selected-ring`: the chosen day's inset ring, drawn OVER whatever tint the day
   * wears — never a fill of its own — so it is proved against every tint rather than one fill.
   */
  readonly selectedRing: string;
  /**
   * The capacity bar under each day number — the non-colour carrier of how full the day is. The
   * fill's width is the free share; the track shows the remainder, so BOTH boundaries have to be
   * perceivable (WCAG 1.4.11): fill against track, and track against every tint it is drawn on.
   */
  readonly bar: { readonly fill: string; readonly track: string };
}

/** The `--riv-calendar-*` tokens that are not a per-state fill, by role. */
export const CALENDAR_TOKENS = {
  accent: '--riv-calendar-accent',
  selectedRing: '--riv-calendar-selected-ring',
  barFill: '--riv-calendar-bar-fill',
  barTrack: '--riv-calendar-bar-track',
} as const;

/** The Tailwind fill utility a `--riv-*` token generates through its `@theme inline` row. */
export function fillUtility(token: string): string {
  return `bg-${token.slice('--'.length)}`;
}

/** The light palette — the base block's values, which `porcelain` and `riviera` both paint. */
export const CALENDAR_PALETTE: CalendarPalette = {
  name: 'light',
  surface: POP_SURFACE,
  stops: [...PORCELAIN_STOPS, ...RIVIERA_STOPS],
  ink: rgbToHex(POP_INK),
  inkSoft: POP_INK_SOFT,
  inkDisabled: POP_INK_DISABLED,
  tints: [
    {
      state: 'free',
      name: 'free (plenty free)',
      token: '--riv-calendar-free-fill',
      fill: '#dff0e4',
    },
    { state: 'low', name: 'low (few left)', token: '--riv-calendar-low-fill', fill: '#fdeecc' },
    {
      state: 'full',
      name: 'full (fully booked)',
      token: '--riv-calendar-full-fill',
      fill: '#fae9e9',
    },
    {
      state: 'unknown',
      name: 'unknown (counts unavailable)',
      token: '--riv-calendar-unknown-fill',
      fill: '#ffffff',
    },
  ],
  accent: '#0a3f4e',
  selectedRing: '#085a6e',
  bar: { fill: '#0a3f4e', track: '#6f8a91' },
};

/** The dark palette — the `dark` block's values: dark opaque fills under the light popover ink. */
export const DARK_CALENDAR_PALETTE: CalendarPalette = {
  name: 'dark',
  surface: DARK_POP_SURFACE,
  stops: DARK_STOPS,
  ink: rgbToHex(DARK_POP_INK),
  inkSoft: DARK_POP_INK_SOFT,
  inkDisabled: DARK_POP_INK_DISABLED,
  tints: [
    {
      state: 'free',
      name: 'free (plenty free)',
      token: '--riv-calendar-free-fill',
      fill: '#1f3f30',
    },
    { state: 'low', name: 'low (few left)', token: '--riv-calendar-low-fill', fill: '#4a3a16' },
    {
      state: 'full',
      name: 'full (fully booked)',
      token: '--riv-calendar-full-fill',
      fill: '#4d2429',
    },
    {
      state: 'unknown',
      name: 'unknown (counts unavailable)',
      token: '--riv-calendar-unknown-fill',
      fill: '#1c2740',
    },
  ],
  accent: '#9adde8',
  selectedRing: '#7cd7e8',
  bar: { fill: '#e6f4f8', track: '#758a9a' },
};

export const CALENDAR_PALETTES: readonly CalendarPalette[] = [
  CALENDAR_PALETTE,
  DARK_CALENDAR_PALETTE,
];

/** Every `--riv-calendar-*` token with the value this palette declares for it. */
export function calendarTokenValues(palette: CalendarPalette): readonly [string, string][] {
  return [
    ...palette.tints.map((tint): [string, string] => [tint.token, tint.fill]),
    [CALENDAR_TOKENS.accent, palette.accent],
    [CALENDAR_TOKENS.selectedRing, palette.selectedRing],
    [CALENDAR_TOKENS.barFill, palette.bar.fill],
    [CALENDAR_TOKENS.barTrack, palette.bar.track],
  ];
}
