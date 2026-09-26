/**
 * Render an ISO year-month (`2026-07`, a review's stay — never a day) as "July 2026". Parsed and
 * formatted in explicit UTC so no viewer zone rolls it into a neighbouring month (invariant #6);
 * the locale is pinned like `shared/money.ts`.
 */
const FMT = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export function formatStayMonth(isoYearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(isoYearMonth)) {
    return '';
  }
  const date = new Date(`${isoYearMonth}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : FMT.format(date);
}
