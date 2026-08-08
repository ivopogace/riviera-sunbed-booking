import {
  defaultBookingDate,
  formatCivilDate,
  formatIsoDate,
  isIsoDate,
  parseIsoDate,
  todayBookingDate,
} from './booking-date';

/**
 * Pins the map/dialog default date: tomorrow in Europe/Tirane, as ISO YYYY-MM-DD,
 * computed purely from an injected `now`. Covers the civil-day derivation and the +1-day
 * roll across month and year boundaries.
 */
describe('defaultBookingDate', () => {
  it('returns the next civil day in Europe/Tirane', () => {
    // Midday UTC is the same civil day in Tirane (UTC+1/+2) → tomorrow is the next day.
    expect(defaultBookingDate(new Date('2026-06-29T12:00:00Z'))).toBe('2026-06-30');
  });

  it('rolls across a month boundary', () => {
    expect(defaultBookingDate(new Date('2026-06-30T12:00:00Z'))).toBe('2026-07-01');
  });

  it('rolls across a year boundary', () => {
    expect(defaultBookingDate(new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
  });

  it('uses the Tirane civil day, not UTC, late in the evening', () => {
    // 23:30 UTC on 2026-06-29 is already 01:30 on 2026-06-30 in Tirane (UTC+2 in summer),
    // so "tomorrow in Tirane" is 2026-07-01 — a naive UTC reading would wrongly give 2026-06-30.
    expect(defaultBookingDate(new Date('2026-06-29T23:30:00Z'))).toBe('2026-07-01');
  });
});

/**
 * Pins the staff daily-view default date: TODAY in Europe/Tirane, as ISO YYYY-MM-DD, computed
 * purely from an injected `now`. The civil-day boundary is the late-evening case where a naive UTC
 * reading would show the wrong day.
 */
describe('todayBookingDate', () => {
  it('returns the current civil day in Europe/Tirane', () => {
    expect(todayBookingDate(new Date('2026-06-30T12:00:00Z'))).toBe('2026-06-30');
  });

  it('uses the Tirane civil day, not UTC, late in the evening', () => {
    // 23:30 UTC on 2026-06-30 is already 01:30 on 2026-07-01 in Tirane (UTC+2 in summer).
    expect(todayBookingDate(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });
});

/**
 * Pins the shared civil-day label — the human "Tue 30 Jun 2026" the console's Daily-view
 * and Requests tabs render. UTC-anchored, so the same ISO day formats identically regardless of the
 * viewer's zone (invariant #6).
 */
describe('formatCivilDate', () => {
  it('renders an ISO civil day as a UTC-anchored weekday/day/month/year label', () => {
    expect(formatCivilDate('2026-06-30')).toBe('Tue 30 Jun 2026');
  });
});

/**
 * Guards the validation of an externally-supplied date — the `?date=` query param the discovery page
 * carries into the venue map. Must reject the wrong shape and calendar overflow (which would
 * otherwise silently roll into a different day), and round-trip a UTC-anchored date to ISO.
 */
describe('isIsoDate', () => {
  it('accepts a well-formed ISO calendar date', () => {
    expect(isIsoDate('2026-07-25')).toBe(true);
  });

  it('rejects the wrong shape', () => {
    expect(isIsoDate('2026-7-5')).toBe(false); // unpadded
    expect(isIsoDate('25-07-2026')).toBe(false); // wrong field order
    expect(isIsoDate('not-a-date')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('rejects calendar overflow that would silently roll over', () => {
    expect(isIsoDate('2026-02-30')).toBe(false); // Feb 30 → would roll into March
    expect(isIsoDate('2026-13-01')).toBe(false); // month 13
  });
});

describe('formatIsoDate', () => {
  it('formats a UTC-anchored date as ISO YYYY-MM-DD, round-tripping parseIsoDate', () => {
    expect(formatIsoDate(parseIsoDate('2026-07-01'))).toBe('2026-07-01');
  });
});
