import {
  addDays,
  addMonths,
  defaultBookingDate,
  endOfMonth,
  endOfWeek,
  formatCivilDate,
  formatIsoDate,
  formatMonthLabel,
  isIsoDate,
  isSameMonth,
  monthWeeks,
  parseIsoDate,
  startOfMonth,
  startOfWeek,
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

/**
 * Pins the month arithmetic the availability calendar's grid is built from (#761). Every
 * function reads and writes the same UTC-anchored ISO civil day the rest of this module uses,
 * so the grid can never disagree with the date the map and the booking dialog are holding.
 */
describe('addDays', () => {
  it('moves forward and backward within a month', () => {
    expect(addDays('2026-08-10', 5)).toBe('2026-08-15');
    expect(addDays('2026-08-10', -5)).toBe('2026-08-05');
  });

  it('rolls across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('crosses a leap-year February', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('addMonths', () => {
  it('moves whole months', () => {
    expect(addMonths('2026-08-15', 1)).toBe('2026-09-15');
    expect(addMonths('2026-08-15', -1)).toBe('2026-07-15');
  });

  it('rolls across a year boundary in both directions', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('clamps to the last day when the target month is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('moves whole years', () => {
    expect(addMonths('2026-08-15', 12)).toBe('2027-08-15');
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28');
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('answers the first and last civil day of the month', () => {
    expect(startOfMonth('2026-08-15')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-15')).toBe('2026-08-31');
  });

  it('answers a short and a leap February', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});

describe('startOfWeek / endOfWeek', () => {
  it('treats Monday as the first day of the week', () => {
    // 2026-08-19 is a Wednesday.
    expect(startOfWeek('2026-08-19')).toBe('2026-08-17');
    expect(endOfWeek('2026-08-19')).toBe('2026-08-23');
  });

  it('leaves a Monday and a Sunday at their own week bounds', () => {
    expect(startOfWeek('2026-08-17')).toBe('2026-08-17');
    expect(endOfWeek('2026-08-23')).toBe('2026-08-23');
  });

  it('crosses a month boundary rather than clamping to it', () => {
    // Sunday 2026-08-02 belongs to the week that started Monday 2026-07-27.
    expect(startOfWeek('2026-08-02')).toBe('2026-07-27');
  });
});

describe('monthWeeks', () => {
  it('lays the month out Monday-first, with blanks outside it', () => {
    // August 2026 starts on a Saturday and has 31 days.
    const weeks = monthWeeks('2026-08-15');

    expect(weeks[0]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(weeks.at(-1)?.at(0)).toBe('2026-08-31');
    expect(weeks.at(-1)?.slice(1)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('emits every day of the month exactly once, in order', () => {
    const days = monthWeeks('2026-08-15')
      .flat()
      .filter((day): day is string => day !== undefined);

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-08-01');
    expect(days.at(-1)).toBe('2026-08-31');
    expect([...days].sort()).toEqual(days);
  });

  it('needs no leading blanks for a month that starts on a Monday', () => {
    // 2026-06-01 is a Monday.
    expect(monthWeeks('2026-06-10')[0][0]).toBe('2026-06-01');
  });

  it('lays out a non-leap February in exactly four weeks when it starts on a Monday', () => {
    // 2027-02-01 is a Monday and February 2027 has 28 days.
    const weeks = monthWeeks('2027-02-10');

    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe('2027-02-01');
    expect(weeks.at(-1)?.at(-1)).toBe('2027-02-28');
  });

  it('lays out a leap February', () => {
    const days = monthWeeks('2028-02-10')
      .flat()
      .filter((day): day is string => day !== undefined);

    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2028-02-29');
  });
});

describe('formatMonthLabel', () => {
  it('renders the month and year of the civil day', () => {
    expect(formatMonthLabel('2026-08-15')).toBe('August 2026');
    expect(formatMonthLabel('2027-01-01')).toBe('January 2027');
  });

  it('reads the civil day itself, not the viewer zone', () => {
    // Midnight UTC on the 1st: a local-zone read west of UTC would render the previous month.
    expect(formatMonthLabel('2026-09-01')).toBe('September 2026');
  });
});

describe('isSameMonth', () => {
  it('is true only within one calendar month of one year', () => {
    expect(isSameMonth('2026-08-01', '2026-08-31')).toBe(true);
    expect(isSameMonth('2026-08-31', '2026-09-01')).toBe(false);
    expect(isSameMonth('2026-08-15', '2027-08-15')).toBe(false);
  });
});
