/**
 * Render an ISO `LocalDate` (a booking date: civil, no instant, no zone) as a weekday/day/month
 * label; the app's ONE civil-date formatter. Parsed as **explicit UTC midnight** and formatted with
 * `timeZone: 'UTC'`: rendered in the viewer's zone it can roll back a day in negative-offset zones
 * (invariant #6). Locale pinned like `shared/money.ts`; `Intl.DateTimeFormat`s are module-level.
 *
 * @param opts.withYear include the year ("Tue 30 Jun 2026"), for map/Discover; checkout omits it.
 */
import { daysBetween, formatDayMonth } from './booking-date';
import { plural } from './plural';

const DAY_ONLY = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', day: 'numeric' });

const FMT = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const FMT_WITH_YEAR = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

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
  return (opts.withYear ? FMT_WITH_YEAR : FMT).format(date);
}

/**
 * Render a stay's days: one day exactly as {@link formatBookingDate} would, a range as
 * `"Tue 30 Jun – Sat 4 Jul · 5 days"` — the year (when asked for) on the last day only. The one
 * home of the range label, so the map trigger, the dialog and the confirmation agree.
 */
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
      ? DAY_ONLY.format(new Date(`${first}T00:00:00Z`))
      : formatDayMonth(first);
  return `${from} – ${formatDayMonth(last)} · ${plural(daysBetween(first, last), 'day')}`;
}

export function formatStay(first: string, last: string, opts: { withYear?: boolean } = {}): string {
  if (first === last) {
    return formatBookingDate(first, opts);
  }
  return `${formatBookingDate(first)} – ${formatBookingDate(last, opts)} · ${plural(daysBetween(first, last), 'day')}`;
}
