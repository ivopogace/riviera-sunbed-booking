import { describe, expect, it } from 'vitest';

import { stayLabel } from './stay-label';

describe('stayLabel', () => {
  it('counts the sets that are free for every day', () => {
    expect(
      stayLabel(
        { verdict: 'SAME_SET', sameSetCount: 2, longestRunDays: 4, maxStayDays: null, moves: 0 },
        4,
      ),
    ).toBe('Same set all 4 days · 2 sets');
    expect(
      stayLabel(
        { verdict: 'SAME_SET', sameSetCount: 1, longestRunDays: 4, maxStayDays: 7, moves: 0 },
        4,
      ),
    ).toBe('Same set all 4 days · 1 set');
  });

  it('names the longest run when no set covers the stay', () => {
    expect(
      stayLabel(
        { verdict: 'CANNOT_HOST', sameSetCount: 0, longestRunDays: 3, maxStayDays: null, moves: 0 },
        4,
      ),
    ).toBe('Can’t host 4 days · up to 3 days in a row');
    expect(
      stayLabel(
        { verdict: 'CANNOT_HOST', sameSetCount: 0, longestRunDays: 1, maxStayDays: null, moves: 0 },
        4,
      ),
    ).toBe('Can’t host 4 days · up to 1 day in a row');
  });

  it('counts the moves of a stitched plan that fits', () => {
    expect(
      stayLabel(
        {
          verdict: 'FITS_WITH_MOVES',
          sameSetCount: 0,
          longestRunDays: 3,
          maxStayDays: null,
          moves: 2,
        },
        7,
      ),
    ).toBe('Fits with 2 moves · all 7 days');
    expect(
      stayLabel(
        {
          verdict: 'FITS_WITH_MOVES',
          sameSetCount: 0,
          longestRunDays: 3,
          maxStayDays: 9,
          moves: 1,
        },
        4,
      ),
    ).toBe('Fits with 1 move · all 4 days');
  });

  it('says fully booked when no set has a free day', () => {
    expect(
      stayLabel(
        { verdict: 'CANNOT_HOST', sameSetCount: 0, longestRunDays: 0, maxStayDays: null, moves: 0 },
        3,
      ),
    ).toBe('Can’t host 3 days · fully booked');
  });

  it('names the venue’s maximum when that is the reason, even with a free set', () => {
    expect(
      stayLabel(
        { verdict: 'CANNOT_HOST', sameSetCount: 1, longestRunDays: 4, maxStayDays: 2, moves: 0 },
        4,
      ),
    ).toBe('Stays of up to 2 days here');
    expect(
      stayLabel(
        { verdict: 'CANNOT_HOST', sameSetCount: 0, longestRunDays: 2, maxStayDays: 1, moves: 0 },
        4,
      ),
    ).toBe('Stays of up to 1 day here');
  });
});
