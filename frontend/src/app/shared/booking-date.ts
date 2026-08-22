/**
 * The default booking date the beach map and booking dialog open on: **tomorrow in
 * Europe/Tirane** (invariant #6), as an ISO `YYYY-MM-DD` string. The server is authoritative for
 * the real cutoff (invariant #4); this is a display default only.
 *
 * Computed from the given `now` so it is pure and unit-testable (no ambient `new Date()` — the
 * caller injects the clock). Tirane's civil "today" is derived via `Intl` with an explicit time
 * zone, then advanced one day — never via `toISOString()`, which is UTC and can roll the day for
 * late-evening users.
 */
const TIRANE = 'Europe/Tirane';

export function defaultBookingDate(now: Date): string {
  return addOneDay(todayBookingDate(now));
}

/**
 * **Today** in Europe/Tirane (invariant #6), as an ISO `YYYY-MM-DD` string — the day staff are
 * working in the operator daily view. Pure (computed from the injected `now`); derived via `Intl` with an
 * explicit time zone, never `toISOString()` (which is UTC and can roll the day late in the evening).
 */
export function todayBookingDate(now: Date): string {
  // en-CA renders ISO `YYYY-MM-DD`; the timeZone option pins it to Tirane's civil day.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIRANE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Parse an ISO `YYYY-MM-DD` string to a UTC-anchored `Date` (midnight UTC of that civil day).
 * Anchoring in UTC keeps day arithmetic and re-formatting free of local-zone/DST shifts. Shared
 * so the map's `dateLabel` and `addOneDay` parse dates the one way.
 */
export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a UTC-anchored `Date` (see {@link parseIsoDate}) as an ISO `YYYY-MM-DD` string — the
 * inverse of the parse, reading the same UTC fields so it stays free of the viewer's zone.
 */
export function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whether `value` is a well-formed calendar date in ISO `YYYY-MM-DD` form — used to validate an
 * externally-supplied date (e.g. a `?date=` query param) before trusting it. Rejects the wrong shape
 * and calendar overflow (`2026-02-30`, which {@link parseIsoDate} would silently roll into March).
 */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && formatIsoDate(parseIsoDate(value)) === value;
}

/**
 * Render an ISO `YYYY-MM-DD` civil day (a Europe/Tirane booking date, invariant #6) as a human label
 * like `"Tue 30 Jun 2026"`. Formatted in **UTC** because {@link parseIsoDate} anchors the day at
 * midnight UTC — so the label is the civil day itself, free of the viewer's zone. Locale pinned like
 * `shared/money.ts` / `shared/deadline.ts` for deterministic output. Shared by the operator console's
 * Daily-view and Requests tabs so the one date format doesn't drift between them.
 */
export function formatCivilDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

/** Add one calendar day to an ISO `YYYY-MM-DD` string, returning the same format. */
function addOneDay(isoDate: string): string {
  return addDays(isoDate, 1);
}

/**
 * Shift an ISO `YYYY-MM-DD` civil day by `days` (negative moves back), returning the same format.
 * Arithmetic happens on the UTC-anchored {@link parseIsoDate} instant, so it is free of the
 * viewer's zone and of DST.
 */
export function addDays(isoDate: string, days: number): string {
  const shifted = parseIsoDate(isoDate);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatIsoDate(shifted);
}

/**
 * Shift an ISO `YYYY-MM-DD` civil day by whole calendar `months` (negative moves back).
 *
 * <p>The day of the month is **clamped** to the target month's length rather than allowed to
 * overflow: 31 January plus one month is 28 (or 29) February, never 3 March. Overflow is what a
 * naive `setUTCMonth` does, and in a month-navigating calendar it skips February entirely.
 */
export function addMonths(isoDate: string, months: number): string {
  const source = parseIsoDate(isoDate);
  const targetYear = source.getUTCFullYear();
  const targetMonth = source.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(source.getUTCDate(), lastDay);
  return formatIsoDate(new Date(Date.UTC(targetYear, targetMonth, day)));
}

/** The first civil day of the month containing `isoDate`, as an ISO `YYYY-MM-DD` string. */
export function startOfMonth(isoDate: string): string {
  const source = parseIsoDate(isoDate);
  return formatIsoDate(new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1)));
}

/** The last civil day of the month containing `isoDate`, as an ISO `YYYY-MM-DD` string. */
export function endOfMonth(isoDate: string): string {
  const source = parseIsoDate(isoDate);
  return formatIsoDate(new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)));
}

/**
 * The **Monday** that opens the week containing `isoDate`. Monday-first because the app's civil
 * dates are pinned to `en-IE` and the venues are Albanian — both Monday-first conventions.
 */
export function startOfWeek(isoDate: string): string {
  return addDays(isoDate, -mondayIndex(isoDate));
}

/** The **Sunday** that closes the week containing `isoDate`. */
export function endOfWeek(isoDate: string): string {
  return addDays(isoDate, 6 - mondayIndex(isoDate));
}

/** Whether two ISO `YYYY-MM-DD` civil days fall in the same calendar month of the same year. */
export function isSameMonth(isoDate: string, other: string): boolean {
  return isoDate.slice(0, 7) === other.slice(0, 7);
}

/**
 * The month containing `isoDate` laid out as calendar weeks — Monday-first rows of exactly seven
 * cells, where a cell is that day's ISO string or `undefined` for a position outside the month.
 *
 * <p>Days outside the month are **blank rather than borrowed from the neighbouring month**, which
 * is what keeps one grid answerable by one request: the calendar read is asked for this month's
 * own bounds, so it can never approach the server's 62-day window cap.
 */
export function monthWeeks(isoDate: string): readonly (string | undefined)[][] {
  const first = startOfMonth(isoDate);
  const length = parseIsoDate(endOfMonth(isoDate)).getUTCDate();
  const cells: (string | undefined)[] = Array.from({ length: mondayIndex(first) });
  for (let day = 0; day < length; day++) {
    cells.push(addDays(first, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(undefined);
  }
  return Array.from({ length: cells.length / 7 }, (_unused, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
}

/**
 * Render the month of an ISO `YYYY-MM-DD` civil day as a heading like `"August 2026"`. Formatted in
 * UTC for the same reason {@link formatCivilDate} is — the day is anchored at midnight UTC, so the
 * label is the civil month itself rather than the viewer's reading of it.
 */
export function formatMonthLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

/** How many days `isoDate` sits past the Monday of its week (Monday 0 … Sunday 6). */
function mondayIndex(isoDate: string): number {
  return (parseIsoDate(isoDate).getUTCDay() + 6) % 7;
}
