/**
 * Render an ISO year-month (`2026-07`, the form a review's stay travels in — never a day) as
 * "July 2026". Parsed as explicit UTC and formatted in UTC so no viewer zone can roll it into a
 * neighbouring month (invariant #6); the locale is pinned like `shared/money.ts`, and the formatter
 * is a module-level constant like `booking-date-label.ts`'s.
 */
const FMT = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export function formatStayMonth(isoYearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(isoYearMonth)) {
    return '';
  }
  const date = new Date(`${isoYearMonth}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : FMT.format(date);
}
