/**
 * The unit suite's ONE mirror of the availability calendar's OPAQUE SOLID recipe — the same role
 * `testing/chip-fills.ts` plays for the chip directives and `testing/glass-tokens.ts` for the
 * `tailwind.css` glass tokens, and for the same reason: a per-spec hand-copy of a "keep in sync"
 * constant goes stale silently.
 *
 * <p>A list is only a list, so it is tied to the code at both ends. `venue/day-availability.spec.ts`
 * pins `DAY_TINT_CLASS` as exactly the {@link CALENDAR_TINTS} fills — a set, not a subset, so a
 * tint the list omits and a list entry no state renders both fail — and
 * `venue/availability-calendar.contrast.spec.ts` reads its pairs from here rather than from
 * literals of its own.
 *
 * <p>Every value is opaque on purpose. A calendar day composited over theme-dependent glass would
 * need its contrast proved once per theme and once per background stop; a solid fill makes each
 * proof a plain pair that holds on both themes by construction.
 */

/**
 * A calendar recipe: the ink, the opaque fill it sits on, and the focus ring drawn over that fill.
 * The ring travels WITH the fill rather than being one shared colour, because the chosen day's
 * accent is dark and the tints are pale — one ring cannot read on both (it measured 1.47:1 on the
 * accent). It also means exactly one `outline-color` utility reaches each element: Tailwind
 * resolves two competing ones by stylesheet order, not class order, so a base ring plus an
 * override would be a coin flip.
 */
export interface CalendarTint {
  readonly name: string;
  readonly ink: string;
  readonly fill: string;
  readonly ring: string;
}

/** `venue/day-availability.ts` — the per-day availability tints, in `DAY_AVAILABILITY_STATES` order. */
export const CALENDAR_TINTS: readonly CalendarTint[] = [
  { name: 'free (plenty free)', ink: '#0a2a33', fill: '#dff0e4', ring: '#0a3f4e' },
  { name: 'low (few left)', ink: '#0a2a33', fill: '#fdeecc', ring: '#0a3f4e' },
  { name: 'full (fully booked)', ink: '#0a2a33', fill: '#fae9e9', ring: '#0a3f4e' },
  { name: 'unknown (counts unavailable)', ink: '#0a2a33', fill: '#ffffff', ring: '#0a3f4e' },
];

/**
 * The capacity bar under each day number — the non-colour carrier of how full the day is. The
 * fill's width is the free share; the track shows the remainder, so BOTH boundaries have to be
 * perceivable (WCAG 1.4.11): fill against track, and track against every tint it is drawn on.
 */
export const CALENDAR_BAR = {
  fill: '#0a3f4e',
  track: '#6f8a91',
} as const;

/**
 * The chosen day's mark: an inset ring in the accent, drawn OVER whatever tint the day wears — so
 * `fill` here is not a fill of its own, it is the pale tint the ring has to read against. The
 * contrast spec checks the ring against every tint rather than against one fill.
 */
export const CALENDAR_SELECTED = {
  name: 'selected-day ring',
  ring: '#085a6e',
} as const;
