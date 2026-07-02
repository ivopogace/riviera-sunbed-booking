/**
 * Render an ISO `LocalDate` (a booking date — no instant, no zone) as a friendly
 * weekday/day/month label, mirroring the v3 design's `formatDate`. A booking date is a
 * civil date, so it is parsed as **explicit UTC midnight** and formatted with
 * `timeZone: 'UTC'`: `new Date("2026-12-01")` alone would be UTC midnight rendered in the
 * viewer's zone and can roll back a day in negative-offset zones (invariant #6). The locale
 * is pinned like `shared/money.ts` / `shared/deadline.ts` so output is deterministic.
 */
export function formatBookingDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return '';
  }
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}
