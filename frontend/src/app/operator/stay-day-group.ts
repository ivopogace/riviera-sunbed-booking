/**
 * Where a guest's stay stands on one day of the Daily view: arriving (the span starts today — a
 * one-day booking is an arrival too), staying (strictly inside the span) or leaving (the last day
 * of a stay that began earlier). The one rule the guest list groups by (design D4, story 30).
 */
export type StayDayGroup = 'ARRIVING' | 'STAYING' | 'LEAVING';

/** The group of a span `first..last` (ISO civil days, inclusive) on `date`, a day inside it. */
export function stayDayGroupOf(first: string, last: string, date: string): StayDayGroup {
  if (date === first) {
    return 'ARRIVING';
  }
  return date === last ? 'LEAVING' : 'STAYING';
}
