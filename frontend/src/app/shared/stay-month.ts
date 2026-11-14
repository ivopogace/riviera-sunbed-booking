import { displayDateFormat } from './display-format';

/**
 * Render an ISO year-month (`2026-07`, a review's stay — never a day) as "July 2026". Parsed and
 * formatted in explicit UTC so no viewer zone rolls it into a neighbouring month (invariant #6);
 * shown in the display locale (`shared/display-format.ts`).
 */
const FMT = displayDateFormat('month-year', 'UTC');

export function formatStayMonth(isoYearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(isoYearMonth)) {
    return '';
  }
  const date = new Date(`${isoYearMonth}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : FMT(date);
}
