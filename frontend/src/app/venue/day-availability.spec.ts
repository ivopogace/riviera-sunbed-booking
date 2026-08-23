import {
  DAY_AVAILABILITY_STATES,
  DAY_SELECTED_CLASS,
  DAY_TINT_CLASS,
  dayAccessibleName,
  dayAvailabilityState,
  freeFraction,
} from './day-availability';
import { CALENDAR_SELECTED, CALENDAR_TINTS } from '../../testing/calendar-tints';
import { DailyAvailability } from '../shared/venue-views';

/**
 * Pins the calendar day's vocabulary: which tint a day's counts resolve to, and what a screen
 * reader hears. The two must agree — colour is never the only carrier of a day's state — and the
 * spoken form must carry the exact integers, never a tint word standing in for them.
 */
describe('dayAvailabilityState', () => {
  it('is full only when nothing is free', () => {
    expect(dayAvailabilityState({ date: '2026-08-01', free: 0, total: 30 })).toBe('full');
  });

  it('is low at or below a quarter of the sets, and free above it', () => {
    expect(dayAvailabilityState({ date: '2026-08-01', free: 1, total: 30 })).toBe('low');
    expect(dayAvailabilityState({ date: '2026-08-01', free: 7, total: 30 })).toBe('low');
    expect(dayAvailabilityState({ date: '2026-08-01', free: 8, total: 30 })).toBe('free');
    expect(dayAvailabilityState({ date: '2026-08-01', free: 30, total: 30 })).toBe('free');
  });

  it('is unknown when no day was answered', () => {
    expect(dayAvailabilityState(undefined)).toBe('unknown');
  });

  it('fails closed on a count it cannot read as a fraction', () => {
    // A venue with no sets, or a nonsense count, must never resolve to the inviting tint.
    expect(dayAvailabilityState({ date: '2026-08-01', free: 0, total: 0 })).toBe('unknown');
    expect(dayAvailabilityState({ date: '2026-08-01', free: -1, total: 30 })).toBe('unknown');
    expect(dayAvailabilityState({ date: '2026-08-01', free: 31, total: 30 })).toBe('unknown');
  });

  it('fails closed on a non-integer count, which the relational checks would let through', () => {
    // `null >= 0 && null <= 30` is true, so without the integer check a null free painted amber.
    const malformed = [null, undefined, '0', Number.NaN, 1.5];

    for (const free of malformed) {
      const day = { date: '2026-08-01', free, total: 30 } as unknown as DailyAvailability;
      expect(dayAvailabilityState(day)).toBe('unknown');
      expect(dayAccessibleName('2026-08-01', day, true)).toBe(
        'Sat 1 Aug 2026, availability unknown',
      );
    }
    expect(
      dayAvailabilityState({
        date: '2026-08-01',
        free: 4,
        total: '30',
      } as unknown as DailyAvailability),
    ).toBe('unknown');
  });
});

describe('freeFraction', () => {
  it('is the share of sets free, for the capacity bar the tint is not the only carrier of', () => {
    expect(freeFraction({ date: '2026-08-01', free: 15, total: 30 })).toBe(0.5);
    expect(freeFraction({ date: '2026-08-01', free: 0, total: 30 })).toBe(0);
    expect(freeFraction({ date: '2026-08-01', free: 30, total: 30 })).toBe(1);
  });

  it('is zero for a day with no readable counts, so no bar is drawn', () => {
    expect(freeFraction(undefined)).toBe(0);
    expect(freeFraction({ date: '2026-08-01', free: 4, total: 0 })).toBe(0);
  });
});

describe('dayAccessibleName', () => {
  it('says a day is the one the map is showing', () => {
    // The button takes focus, so the selection must be in ITS name, not on the gridcell above.
    expect(
      dayAccessibleName('2026-08-25', { date: '2026-08-25', free: 12, total: 30 }, true, true),
    ).toBe('Tue 25 Aug 2026, 12 of 30 sets free, selected');
    expect(dayAccessibleName('2026-06-15', undefined, false, true)).toBe(
      'Mon 15 Jun 2026, not bookable, selected',
    );
  });

  it('carries the civil day and the exact counts', () => {
    expect(dayAccessibleName('2026-08-25', { date: '2026-08-25', free: 12, total: 30 }, true)).toBe(
      'Tue 25 Aug 2026, 12 of 30 sets free',
    );
  });

  it('says no sets are free rather than "0 of 30"', () => {
    expect(dayAccessibleName('2026-08-25', { date: '2026-08-25', free: 0, total: 30 }, true)).toBe(
      'Tue 25 Aug 2026, no sets free',
    );
  });

  it('admits it does not know when the counts are missing', () => {
    expect(dayAccessibleName('2026-08-25', undefined, true)).toBe(
      'Tue 25 Aug 2026, availability unknown',
    );
  });

  it('announces a day that cannot be booked as such, and never offers it a count', () => {
    expect(dayAccessibleName('2026-06-15', { date: '2026-06-15', free: 9, total: 30 }, false)).toBe(
      'Mon 15 Jun 2026, not bookable',
    );
  });
});

describe('the day vocabulary', () => {
  it('gives every state a tint, and nothing else', () => {
    expect(Object.keys(DAY_TINT_CLASS).sort()).toEqual([...DAY_AVAILABILITY_STATES].sort());
  });

  it('gives each state its own tint, so two states never look alike', () => {
    const tints = DAY_AVAILABILITY_STATES.map((state) => DAY_TINT_CLASS[state]);

    expect(new Set(tints).size).toBe(tints.length);
  });
});

/**
 * Ties the tint record to its test-side mirror as a SET, not a subset: a fill the mirror omits and
 * a mirror entry no state renders both fail here, so the contrast proofs two files away can never
 * be quietly weakened by a value that drifted on one side only.
 */
describe('the tint mirror', () => {
  it('renders exactly the fills testing/calendar-tints.ts proves', () => {
    const rendered = DAY_AVAILABILITY_STATES.map((state) => DAY_TINT_CLASS[state]);
    const mirrored = CALENDAR_TINTS.map(
      ({ fill, ring }) =>
        `${fill === '#ffffff' ? 'bg-white' : `bg-[${fill}]`} focus-visible:outline-[${ring}]`,
    );

    expect(new Set(rendered)).toEqual(new Set(mirrored));
  });

  it('marks the chosen day with the ring the mirror proves, over whatever tint it wears', () => {
    // A ring, not a fill: an inverted fill takes the tint and the bar off the chosen day.
    expect(DAY_SELECTED_CLASS).toContain(`shadow-[inset_0_0_0_2px_${CALENDAR_SELECTED.ring}]`);
    expect(DAY_SELECTED_CLASS).not.toContain('bg-');
  });
});
