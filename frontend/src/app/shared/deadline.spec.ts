import { formatDeadline } from './deadline';

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
