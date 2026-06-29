import { defaultBookingDate } from './booking-date';

/**
 * Pins the map/dialog default date (issue #44): tomorrow in Europe/Tirane, as ISO YYYY-MM-DD,
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
