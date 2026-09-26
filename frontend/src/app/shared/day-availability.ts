import { DailyAvailability } from './venue-views';
import { formatCivilDate } from './booking-date';

/**
 * Every state a calendar day can be in, in legend order. {@link DayAvailabilityState} is derived
 * FROM this tuple rather than declared beside it, so a new state cannot be added without every
 * state-driven loop — the tint record, the phrase record, the specs — seeing it.
 */
export const DAY_AVAILABILITY_STATES = ['free', 'low', 'full', 'unknown'] as const;

/** How busy one day is, as the calendar paints it. */
export type DayAvailabilityState = (typeof DAY_AVAILABILITY_STATES)[number];

/** At or below this share of a venue's sets, a day is painted as running out. */
const LOW_FRACTION = 0.25;

/**
 * Each state's opaque fill (each contrast proof a plain ink/fill pair per palette; mirror
 * `src/testing/calendar-tints.ts`) with its own focus ring, as two `outline-color` classes resolve
 * by stylesheet order. Ring not `--riv-accent-ink`: docs/design/colour-literal-token-audit.md.
 */
export const DAY_TINT_CLASS: Record<DayAvailabilityState, string> = {
  free: 'bg-riv-calendar-free-fill focus-visible:outline-riv-calendar-accent',
  low: 'bg-riv-calendar-low-fill focus-visible:outline-riv-calendar-accent',
  full: 'bg-riv-calendar-full-fill focus-visible:outline-riv-calendar-accent',
  unknown: 'bg-riv-calendar-unknown-fill focus-visible:outline-riv-calendar-accent',
};

/**
 * The chosen day's mark: an inset ring over the day's tint, never a fill hiding its availability.
 * Not an `aria-selected:` variant — that attribute is not allowed on `role="button"` (axe
 * `aria-allowed-attr`); `box-shadow` costs no layout and leaves `outline` to the focus ring.
 */
export const DAY_SELECTED_CLASS =
  'shadow-[inset_0_0_0_2px_var(--riv-calendar-selected-ring)] font-bold';

/**
 * Phrases for a day with no integers to speak; a day with readable counts speaks the exact numbers.
 * No per-state legend: the tint only reinforces the capacity bar and the accessible name.
 */
const NO_SETS_FREE = 'no sets free';
const AVAILABILITY_UNKNOWN = 'availability unknown';
const NOT_BOOKABLE = 'not bookable';

/**
 * How busy `day` is. Fails closed to `unknown` (no sets, a negative count, `free` above `total`):
 * an unreadable day must never look like an offer; only the claim decides (invariant #2).
 */
export function dayAvailabilityState(day: DailyAvailability | undefined): DayAvailabilityState {
  if (!isReadable(day)) {
    return 'unknown';
  }
  if (day.free === 0) {
    return 'full';
  }
  return day.free / day.total <= LOW_FRACTION ? 'low' : 'free';
}

/**
 * The share of the venue's sets free on `day`, as the width of the day's capacity bar — the
 * carrier that is not colour, so the state survives a viewer who cannot tell the tints apart
 * (WCAG 1.4.1). An unreadable day draws no bar at all.
 */
export function freeFraction(day: DailyAvailability | undefined): number {
  return isReadable(day) ? day.free / day.total : 0;
}

/**
 * A day cell's screen-reader name: civil date plus exact integers ("12 of 30 sets free"), or "not
 * bookable" for an unselectable day. Selection is spoken here, not via the `gridcell`'s
 * `aria-selected`: assistive tech reports the focused button, and the gridcell never takes focus.
 */
export function dayAccessibleName(
  isoDate: string,
  day: DailyAvailability | undefined,
  selectable: boolean,
  selected = false,
): string {
  const civilDate = formatCivilDate(isoDate);
  const mark = selected ? ', selected' : '';
  if (!selectable) {
    return `${civilDate}, ${NOT_BOOKABLE}${mark}`;
  }
  if (!isReadable(day)) {
    return `${civilDate}, ${AVAILABILITY_UNKNOWN}${mark}`;
  }
  const availability = day.free === 0 ? NO_SETS_FREE : `${day.free} of ${day.total} sets free`;
  return `${civilDate}, ${availability}${mark}`;
}

/**
 * Whether `day`'s counts are a share of a real set inventory, and so safe to paint. The integer
 * checks must precede the range checks: `>=`/`<=` coerce, so a `null` free would pass and paint
 * "few left" on a sold-out day.
 */
function isReadable(day: DailyAvailability | undefined): day is DailyAvailability {
  return (
    day !== undefined &&
    Number.isInteger(day.free) &&
    Number.isInteger(day.total) &&
    day.total > 0 &&
    day.free >= 0 &&
    day.free <= day.total
  );
}
