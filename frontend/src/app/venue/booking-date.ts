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

/** Add one calendar day to an ISO `YYYY-MM-DD` string, returning the same format. */
function addOneDay(isoDate: string): string {
  const next = parseIsoDate(isoDate);
  next.setUTCDate(next.getUTCDate() + 1);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
