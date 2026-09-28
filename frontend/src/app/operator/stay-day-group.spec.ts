import { stayDayGroupOf } from './stay-day-group';

describe('stayDayGroupOf (#1205)', () => {
  it('reads a one-day booking as an arrival — the same list a one-day venue always had', () => {
    expect(stayDayGroupOf('2026-08-09', '2026-08-09', '2026-08-09')).toBe('ARRIVING');
  });

  it('tells the three days of a stay apart', () => {
    expect(stayDayGroupOf('2026-08-09', '2026-08-11', '2026-08-09')).toBe('ARRIVING');
    expect(stayDayGroupOf('2026-08-09', '2026-08-11', '2026-08-10')).toBe('STAYING');
    expect(stayDayGroupOf('2026-08-09', '2026-08-11', '2026-08-11')).toBe('LEAVING');
  });

  it('reads the middle of a long stay as staying, whatever the distance from either end', () => {
    expect(stayDayGroupOf('2026-08-01', '2026-08-14', '2026-08-02')).toBe('STAYING');
    expect(stayDayGroupOf('2026-08-01', '2026-08-14', '2026-08-13')).toBe('STAYING');
  });
});
