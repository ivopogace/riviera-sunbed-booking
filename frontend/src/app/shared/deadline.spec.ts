import { formatDeadline, isUrgent, timeLeftLabel } from './deadline';

describe('formatDeadline', () => {
  it('renders a UTC instant in Europe/Tirane winter time (UTC+1)', () => {
    // 16:00Z on 30 Nov → 17:00 Tirane wall clock (invariant #6: never the runtime default zone).
    const text = formatDeadline('2026-11-30T16:00:00Z');
    expect(text).toContain('30');
    expect(text).toContain('Nov');
    expect(text).toContain('17:00');
  });

  it('renders a UTC instant in Europe/Tirane summer time (UTC+2)', () => {
    const text = formatDeadline('2026-07-02T16:00:00Z');
    expect(text).toContain('2');
    expect(text).toContain('Jul');
    expect(text).toContain('18:00');
  });
});

/**
 * The Requests-tab urgency helpers. Pure functions taking `now` as a millisecond epoch,
 * so the 8-hour boundary is deterministic without mocking the clock.
 */
describe('isUrgent', () => {
  const now = Date.UTC(2026, 6, 2, 8, 0, 0); // 2026-07-02T08:00:00Z

  it('is true when the deadline is under 8h away', () => {
    // +7h59m → inside the window.
    expect(isUrgent('2026-07-02T15:59:00Z', now)).toBe(true);
  });

  it('is false at or beyond the 8h window', () => {
    expect(isUrgent('2026-07-02T16:00:00Z', now)).toBe(false); // exactly 8h
    expect(isUrgent('2026-07-03T08:00:00Z', now)).toBe(false); // 24h
  });

  it('is false for a deadline already in the past (the sweep owns it)', () => {
    expect(isUrgent('2026-07-02T07:59:00Z', now)).toBe(false);
  });
});

describe('timeLeftLabel', () => {
  const now = Date.UTC(2026, 6, 2, 8, 0, 0);

  it('renders hours once a full hour or more remains', () => {
    expect(timeLeftLabel('2026-07-02T11:00:00Z', now)).toBe('3h left');
    expect(timeLeftLabel('2026-07-02T09:30:00Z', now)).toBe('1h left'); // 90m floors to 1h
  });

  it('renders minutes below an hour, floored (never overstating) at min 1m', () => {
    expect(timeLeftLabel('2026-07-02T08:45:00Z', now)).toBe('45m left');
    // Just under an hour must NOT round up to "1h left" — it reads "59m left".
    expect(timeLeftLabel('2026-07-02T08:59:30Z', now)).toBe('59m left');
    expect(timeLeftLabel('2026-07-02T08:00:30Z', now)).toBe('1m left'); // 30s floors to the 1m minimum
  });
});
