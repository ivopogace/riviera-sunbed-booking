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
 * working in the U8 daily view. Pure (computed from the injected `now`); derived via `Intl` with an
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
 * Daily-view and Requests tabs (issue #176) so the one date format doesn't drift between them.
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
  const next = parseIsoDate(isoDate);
  next.setUTCDate(next.getUTCDate() + 1);
  return formatIsoDate(next);
}
