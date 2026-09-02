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
 * for what a day looks like, so no second hand-copied set of tokens can drift from it.
 *
 * <p>Each entry carries its own focus-ring utility rather than the base class carrying one: two
 * competing `outline-color` utilities on one element resolve by stylesheet order rather than class
 * order, so one ring per fill, on the fill's own class, is the only arrangement that is
 * deterministic. The ring is the calendar's own accent and not the `@layer base` ring's
 * `--riv-accent-ink`: that value is the chosen day's ring in the light themes, and a focused
 * chosen cell must not wear one colour twice.
 *
 * <p>The fills are **opaque, not translucent** — deliberately, and in both palettes. A calendar
 * day composited over a theme-dependent glass would need its contrast proved once per theme and
 * once per surface; an opaque fill makes the proof a plain ink/fill pair, so theming the palette
 * doubled the pairs and nothing else (`availability-calendar.contrast.spec.ts`). The values live in
 * `tailwind.css`, one set per palette; their test-side mirror is `src/testing/calendar-tints.ts`.
 */
export const DAY_TINT_CLASS: Record<DayAvailabilityState, string> = {
  free: 'bg-riv-calendar-free-fill focus-visible:outline-riv-calendar-accent',
  low: 'bg-riv-calendar-low-fill focus-visible:outline-riv-calendar-accent',
  full: 'bg-riv-calendar-full-fill focus-visible:outline-riv-calendar-accent',
  unknown: 'bg-riv-calendar-unknown-fill focus-visible:outline-riv-calendar-accent',
};

/**
 * The chosen day's mark: an inset ring over whatever tint the day already wears, never a fill
 * replacing it. Availability and selection are orthogonal facts, and an inverted fill destroys the
 * first to show the second — it takes the tint away, and with it the capacity bar, from the one day
 * the tourist is most likely to be weighing.
 *
 * <p>A composed class rather than an `aria-selected:` Tailwind variant, because `aria-selected` is
 * not permitted on `role="button"` (axe `aria-allowed-attr`): the grid states the selection on the
 * `gridcell` that owns it, so the button has nothing to key a variant off. It uses `box-shadow`
 * rather than a border so the ring costs no layout, and leaves `outline` to the focus ring.
 */
export const DAY_SELECTED_CLASS =
  'shadow-[inset_0_0_0_2px_var(--riv-calendar-selected-ring)] font-bold';

/**
 * The phrases a day speaks when it has no integers to speak. A day that HAS readable counts says
 * them instead — a tint word is a summary, and #761 asks for the exact numbers.
 *
 * <p>There is deliberately no per-state legend here: the popover renders no key, because the tint
 * is reinforcement rather than the carrier (the capacity bar is a length and the accessible name
 * carries the integers), so a key would be a table mapping colours to meanings that nothing needs.
 */
const NO_SETS_FREE = 'no sets free';
const AVAILABILITY_UNKNOWN = 'availability unknown';
const NOT_BOOKABLE = 'not bookable';

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
 * What a screen reader says for one day cell: the civil day, its availability in words, and
 * whether it is the day the map is showing.
 *
 * <p>A selectable day with readable counts speaks the **exact integers** ("12 of 30 sets free"),
 * never the tint's summary word. A day that cannot be booked speaks that instead of a count — the
 * endpoint answers past days, but a free/total figure on a day nobody can book reads as an offer.
 *
 * <p>Selection is spoken here rather than left to the `gridcell`'s `aria-selected`, because the
 * button is what takes focus and assistive tech reports the state of the focused object — a
 * selection parked on an ancestor that never receives focus is never heard.
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
 * Whether `day`'s counts are a share of a real set inventory, and so safe to paint.
 *
 * <p>The integer checks come before the range ones because `>=` and `<=` coerce: `null` and
 * `"0"` both satisfy `free >= 0 && free <= total`, and a `null` free would then paint the amber
 * "few left" fill and speak "null of 30 sets free" on a sold-out day. Today's server sends
 * `int`s, so this is a contract the wire cannot currently break — which is exactly why the
 * guard has to state it rather than rely on it.
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
