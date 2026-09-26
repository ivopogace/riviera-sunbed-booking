import { formatBookingDate, formatStay, formatStayChip } from './booking-date-label';

describe('formatBookingDate', () => {
  it('renders an ISO LocalDate as a friendly weekday/day/month label', () => {
    // 2026-07-20 is a Monday. Locale/ICU punctuation can vary, so assert the parts (like
    // deadline.spec.ts), not the exact string. The label deliberately carries no year.
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

describe('formatStay', () => {
  it('renders a one-day stay exactly as the single date', () => {
    expect(formatStay('2026-06-30', '2026-06-30')).toBe(formatBookingDate('2026-06-30'));
    expect(formatStay('2026-06-30', '2026-06-30', { withYear: true })).toBe(
      formatBookingDate('2026-06-30', { withYear: true }),
    );
  });

  it('renders a range as first – last with the day count, the year on the last day only', () => {
    // ICU punctuation varies ("Tue, 30 Jun" vs "Tue 30 Jun"), so the ends are matched loosely.
    expect(formatStay('2026-06-30', '2026-07-04')).toMatch(/^Tue,? 30 Jun – Sat,? 4 Jul · 5 days$/);
    expect(formatStay('2026-06-30', '2026-07-04', { withYear: true })).toMatch(
      /^Tue,? 30 Jun – Sat,? 4 Jul 2026 · 5 days$/,
    );
    expect(formatStay('2026-07-03', '2026-07-04')).toContain('· 2 days');
  });
});

describe('formatStayChip', () => {
  it('drops the weekdays and the first month inside one month', () => {
    expect(formatStayChip('2026-06-19', '2026-06-22')).toBe('19 – 22 Jun · 4 days');
  });

  it('names both months across a month boundary', () => {
    expect(formatStayChip('2026-06-29', '2026-07-02')).toBe('29 Jun – 2 Jul · 4 days');
  });

  it('renders one day exactly as the single date', () => {
    expect(formatStayChip('2026-06-19', '2026-06-19')).toBe(formatBookingDate('2026-06-19'));
  });
});
