import { addDays } from '../app/shared/booking-date';

/**
 * Build an availability-calendar response covering `[from, to]` inclusive — the shape every suite
 * that opens the picker needs in order to settle its month read.
 *
 * <p>It exists so specs stop hand-rolling `new Date(...)` + `setUTCDate` + `toISOString().slice(0,10)`
 * loops, which is the arithmetic `shared/booking-date.ts` owns and which invariant #6 keeps out of
 * app code. Three copies had already appeared across the unit suites.
 *
 * <p>`counts` is asked for each day's position in the window, so a caller can spread the tint
 * states deliberately rather than by whatever the calendar happens to look like today.
 */
export function calendarDays(
  from: string,
  to: string,
  counts: (index: number) => { free: number; total: number },
): { date: string; free: number; total: number }[] {
  const days: { date: string; free: number; total: number }[] = [];
  for (let date = from; ; date = addDays(date, 1)) {
    days.push({ date, ...counts(days.length) });
    if (date === to) {
      return days;
    }
  }
}

/** Every day the same: the usual "just settle the read" answer. */
export function uniformDays(from: string, to: string, free = 20, total = 30) {
  return calendarDays(from, to, () => ({ free, total }));
}
