import { formatBookingDate } from './booking-date-label';

describe('formatBookingDate', () => {
  it('renders an ISO LocalDate as a friendly weekday/day/month label (design formatDate shape)', () => {
    // 2026-07-20 is a Monday. Locale/ICU punctuation can vary, so assert the parts (like
    // deadline.spec.ts), not the exact string. No year, matching the v3 design's formatDate.
    const text = formatBookingDate('2026-07-20');
    expect(text).toContain('Mon');
    expect(text).toContain('20');
    expect(text).toContain('Jul');
    expect(text).not.toContain('2026'); // no year in the label
  });

  it('does not roll back a day (a LocalDate has no instant — invariant #6)', () => {
    // The UTC-midnight footgun: `new Date("2026-12-01")` in a negative-offset zone can render
    // as 30 Nov. The helper parses as explicit UTC, so 1 Dec stays 1 Dec (a Tuesday).
    const text = formatBookingDate('2026-12-01');
    expect(text).toContain('Tue');
    expect(text).toContain('1');
    expect(text).toContain('Dec');
    expect(text).not.toContain('Nov');
    expect(text).not.toContain('30');
  });

  it('includes the year with { withYear: true } (the map / Discover context)', () => {
    const text = formatBookingDate('2026-07-20', { withYear: true });
    expect(text).toContain('Mon');
    expect(text).toContain('20');
    expect(text).toContain('Jul');
    expect(text).toContain('2026');
  });

  it('returns an empty string for an empty or malformed input (defensive)', () => {
    expect(formatBookingDate('')).toBe('');
    expect(formatBookingDate('not-a-date')).toBe('');
    expect(formatBookingDate('2026-13-40')).toBe('');
  });
});
