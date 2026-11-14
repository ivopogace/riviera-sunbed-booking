/**
 * Render an ISO `LocalDate` (a booking date: civil, no instant, no zone) as a weekday/day/month
 * label; the app's ONE civil-date formatter. Parsed as **explicit UTC midnight** and formatted with
 * `timeZone: 'UTC'`: rendered in the viewer's zone it can roll back a day in negative-offset zones
 * (invariant #6). Shown in the display locale (`shared/display-format.ts`); the formatters are module-level.
 *
 * @param opts.withYear include the year ("Tue 30 Jun 2026"), for map/Discover; checkout omits it.
 */
import { displayDateFormat } from './display-format';
import { daysBetween, formatDayMonth } from './booking-date';
import { pluralOf } from './plural';

const DAY_ONLY = displayDateFormat('day', 'UTC');
const FMT = displayDateFormat('weekday-day-month', 'UTC');
const FMT_WITH_YEAR = displayDateFormat('weekday-day-month-year', 'UTC');

/** A stay's length, `1 day` / `5 days`. */
function dayCountLabel(days: number): string {
  return pluralOf(days, $localize`${days}:count: day`, $localize`${days}:count: days`);
}

export function formatBookingDate(iso: string, opts: { withYear?: boolean } = {}): string {
  // Parse via the ISO string form (strict — an out-of-range month/day yields Invalid Date), not
  // `Date.UTC(...)`, which silently rolls over.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return '';
  }
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return (opts.withYear ? FMT_WITH_YEAR : FMT)(date);
}

/**
 * A stay as a chip says it, weekdays dropped: `"19 – 22 Jun · 4 days"` inside one month,
 * `"29 Jun – 2 Jul · 4 days"` across two; one day exactly as {@link formatBookingDate} would.
 */
export function formatStayChip(first: string, last: string): string {
  if (first === last) {
    return formatBookingDate(first);
  }
  const from =
    first.slice(0, 7) === last.slice(0, 7)
      ? DAY_ONLY(new Date(`${first}T00:00:00Z`))
      : formatDayMonth(first);
  return `${from} – ${formatDayMonth(last)} · ${dayCountLabel(daysBetween(first, last))}`;
}

/**
 * Render a stay's days: one day exactly as {@link formatBookingDate} would, a range as
 * `"Tue 30 Jun – Sat 4 Jul · 5 days"` — the year (when asked for) on the last day only. The one
 * home of the range label, so the map trigger, the dialog and the confirmation agree.
 */
export function formatStay(first: string, last: string, opts: { withYear?: boolean } = {}): string {
  if (first === last) {
    return formatBookingDate(first, opts);
  }
  return `${formatBookingDate(first)} – ${formatBookingDate(last, opts)} · ${dayCountLabel(daysBetween(first, last))}`;
}
