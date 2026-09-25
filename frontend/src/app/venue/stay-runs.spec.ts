import { SetView } from '../shared/venue-views';
import { freeDaysOf, freeRuns, longestFreeRun, longestRunAcross, stayDays } from './stay-runs';

function set(overrides: Partial<SetView>): SetView {
  return {
    id: 1,
    rowLabel: 'Row 1',
    positionNo: 1,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: 1,
    gridY: 1,
    availability: 'FREE',
    ...overrides,
  };
}

describe('stayDays', () => {
  it('lists every day of the stay, first to last', () => {
    expect(stayDays('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(stayDays('2026-06-29', '2026-06-29')).toEqual(['2026-06-29']);
  });
});

describe('freeRuns', () => {
  it('splits the stay around the taken days into runs of free days', () => {
    expect(freeRuns(['2026-07-02'], '2026-06-30', '2026-07-04')).toEqual([
      { first: '2026-06-30', last: '2026-07-01', days: 2 },
      { first: '2026-07-03', last: '2026-07-04', days: 2 },
    ]);
  });

  it('answers the whole stay when nothing is taken, and nothing when every day is', () => {
    expect(freeRuns([], '2026-06-30', '2026-07-01')).toEqual([
      { first: '2026-06-30', last: '2026-07-01', days: 2 },
    ]);
    expect(freeRuns(['2026-06-30', '2026-07-01'], '2026-06-30', '2026-07-01')).toEqual([]);
  });
});

describe('longestFreeRun', () => {
  it('picks the longest run, the earliest on a tie', () => {
    expect(longestFreeRun(['2026-07-01', '2026-07-05'], '2026-06-30', '2026-07-06')).toEqual({
      first: '2026-07-02',
      last: '2026-07-04',
      days: 3,
    });
    expect(longestFreeRun(['2026-07-02'], '2026-06-30', '2026-07-04')).toEqual({
      first: '2026-06-30',
      last: '2026-07-01',
      days: 2,
    });
  });

  it('is undefined when no day is free', () => {
    expect(longestFreeRun(['2026-06-30'], '2026-06-30', '2026-06-30')).toBeUndefined();
  });
});

describe('longestRunAcross', () => {
  const first = '2026-06-30';
  const last = '2026-07-02';

  it('finds the online set whose longest run is longest, earliest start then map order on a tie', () => {
    const late = set({ id: 1, availability: 'PARTLY_FREE', takenDates: ['2026-06-30'] });
    const early = set({ id: 2, availability: 'PARTLY_FREE', takenDates: ['2026-07-02'] });
    const oneDay = set({
      id: 3,
      availability: 'PARTLY_FREE',
      takenDates: ['2026-06-30', '2026-07-01'],
    });

    expect(longestRunAcross([late, early, oneDay], first, last)).toEqual({
      set: early,
      run: { first: '2026-06-30', last: '2026-07-01', days: 2 },
    });
  });

  it('ignores walk-in and fully taken sets', () => {
    const walkIn = set({ id: 1, pool: 'WALK_IN', availability: 'PARTLY_FREE', takenDates: [] });
    const taken = set({ id: 2, availability: 'TAKEN', takenDates: [first, '2026-07-01', last] });

    expect(longestRunAcross([walkIn, taken], first, last)).toBeUndefined();
  });
});

describe('freeDaysOf', () => {
  it('reads the count off the set, falling back to all-or-nothing on an older payload', () => {
    expect(freeDaysOf(set({ availability: 'PARTLY_FREE', freeDays: 2 }), 5)).toBe(2);
    expect(freeDaysOf(set({ availability: 'FREE' }), 5)).toBe(5);
    expect(freeDaysOf(set({ availability: 'TAKEN' }), 5)).toBe(0);
  });
});
