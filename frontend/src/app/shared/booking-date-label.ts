/**
 * Render an ISO `LocalDate` (a booking date — no instant, no zone) as a friendly weekday/day/month
 * label. This is the ONE home of the app's civil-date formatter (the checkout screens, the beach
 * map, and Discover all use it). A booking date is a civil date, so it is parsed as **explicit UTC
 * midnight** and formatted with `timeZone: 'UTC'`: `new Date("2026-12-01")` alone would be UTC
 * midnight rendered in the viewer's zone and can roll back a day in negative-offset zones
 * (invariant #6). The locale is pinned like `shared/money.ts` so output is deterministic, and the
 * `Intl.DateTimeFormat` instances are module-level constants (constructing one per call — or per
 * change-detection pass — is needless allocation).
 *
 * @param opts.withYear include the year ("Tue 30 Jun 2026") — the map/Discover context; the
 *   checkout surfaces omit it ("Tue 1 Dec").
 */
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
