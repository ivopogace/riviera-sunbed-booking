/**
 * The default booking date the beach map and booking dialog open on: **today in Europe/Tirane**
 * (invariant #6), from the injected `now`; a display default only, sales-close is server-side (#4).
 * Via `Intl` with an explicit zone, never `toISOString()` (UTC, rolls the day late in the evening).
 */
const TIRANE = 'Europe/Tirane';

export function defaultBookingDate(now: Date): string {
  return todayBookingDate(now);
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
 * Anchoring in UTC keeps day arithmetic and re-formatting free of local-zone/DST shifts. Shared so
 * every civil-day helper in this file parses dates the one way.
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
 * Render an ISO civil day (a Europe/Tirane booking date, invariant #6) as `"Tue 30 Jun 2026"`,
 * in **UTC** because {@link parseIsoDate} anchors it at midnight UTC — free of the viewer's zone.
 * Locale pinned like `shared/money.ts` for deterministic output; the one shared civil-date format.
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

/**
 * Render an ISO civil day as its day and month only — `"15 May"` — for the closed-for-season badge,
 * where the year is the coming one and the card has no room for it. Same UTC anchoring and locale
 * as {@link formatCivilDate}.
 */
export function formatDayMonth(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(parseIsoDate(isoDate));
}

/** A stay's days, first to last inclusive, as ISO civil days; one day when `first === last`. */
export interface DateRange {
  readonly first: string;
  readonly last: string;
}

/**
 * How many civil days `first` to `last` covers, inclusive — 1 for one day. Counted on the
 * UTC-anchored {@link parseIsoDate} instants, so DST cannot make a day count as 23 hours.
 */
export function daysBetween(first: string, last: string): number {
  const ms = parseIsoDate(last).getTime() - parseIsoDate(first).getTime();
  return Math.round(ms / 86_400_000) + 1;
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
 * Shift an ISO `YYYY-MM-DD` civil day by whole calendar `months` (negative moves back),
 * **clamping** the day to the target month: 31 Jan + 1 month is 28/29 Feb, never 3 March — a naive
 * `setUTCMonth` overflows, and a month-navigating calendar would skip February.
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

/**
 * The month containing `isoDate` as Monday-first weeks of seven cells: the day's ISO string, or
 * `undefined` outside the month — **blank, not borrowed from neighbours**, so one request for this
 * month's own bounds answers the grid and never nears the server's 62-day window cap.
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
