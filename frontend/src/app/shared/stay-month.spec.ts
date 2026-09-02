import { formatStayMonth } from './stay-month';

describe('formatStayMonth', () => {
  it('renders an ISO year-month as the month name and year', () => {
    expect(formatStayMonth('2026-07')).toBe('July 2026');
    expect(formatStayMonth('2026-12')).toBe('December 2026');
  });

  it('renders nothing for a value that is not a year-month', () => {
    expect(formatStayMonth('2026-07-01')).toBe('');
    expect(formatStayMonth('2026-13')).toBe('');
    expect(formatStayMonth('')).toBe('');
  });
});
