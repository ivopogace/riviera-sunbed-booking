import { DailyAvailability } from '../shared/venue-views';
import { formatCivilDate } from '../shared/booking-date';

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
 * The opaque fill each state wears, in the `map-tile.ts` shape and for the same reason: one home
 * for what a day looks like, so no second hand-copied set of literals can drift from it.
 *
 * <p>The fills are **solid, not translucent** — deliberately. A calendar day composited over a
 * theme-dependent glass would need its contrast proved once per theme and once per surface; an
 * opaque fill makes the proof a plain ink/fill pair that holds on both themes by construction
 * (`availability-calendar.contrast.spec.ts`). Their test-side mirror is
 * `src/testing/calendar-tints.ts`.
 */
export const DAY_TINT_CLASS: Record<DayAvailabilityState, string> = {
  free: 'bg-[#dff0e4]',
  low: 'bg-[#fdeecc]',
  full: 'bg-[#fae9e9]',
  unknown: 'bg-white',
};

/**
 * What each state means in words, kept beside the tint it explains (the `map-tile.ts`
 * `MAP_TILE_MEANING` shape). `legend` labels the popover's key; `announced` is the phrase a day
 * with no readable counts falls back to. A day that HAS counts speaks them instead — see
 * {@link dayAccessibleName} — because a tint word is a summary and #761 asks for the integers.
 */
export const DAY_MEANING: Record<DayAvailabilityState, { legend: string; announced: string }> = {
  free: { legend: 'Plenty free', announced: 'sets free' },
  low: { legend: 'Few left', announced: 'sets free' },
  full: { legend: 'Fully booked', announced: 'no sets free' },
  unknown: { legend: 'Not known', announced: 'availability unknown' },
};

/**
 * How busy `day` is, or `unknown` when it cannot be read as a share of the venue's sets.
 *
 * <p>It fails **closed**: a venue with no sets, a negative count, or a `free` above `total` all
 * resolve to `unknown` rather than to the inviting tint. A day the client cannot understand must
 * never look like an offer — the counts are a snapshot and only the claim decides (invariant #2).
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
 * What a screen reader says for one day cell: the civil day, then its availability in words.
 *
 * <p>A selectable day with readable counts speaks the **exact integers** ("12 of 30 sets free"),
 * never the tint's summary word. A day that cannot be booked speaks that instead of a count — the
 * endpoint answers past days, but a free/total figure on a day nobody can book reads as an offer.
 */
export function dayAccessibleName(
  isoDate: string,
  day: DailyAvailability | undefined,
  selectable: boolean,
): string {
  const civilDate = formatCivilDate(isoDate);
  if (!selectable) {
    return `${civilDate}, not bookable`;
  }
  if (!isReadable(day)) {
    return `${civilDate}, ${DAY_MEANING.unknown.announced}`;
  }
  return day.free === 0
    ? `${civilDate}, ${DAY_MEANING.full.announced}`
    : `${civilDate}, ${day.free} of ${day.total} sets free`;
}

/** Whether `day`'s counts are a share of a real set inventory, and so safe to paint. */
function isReadable(day: DailyAvailability | undefined): day is DailyAvailability {
  return day !== undefined && day.total > 0 && day.free >= 0 && day.free <= day.total;
}
