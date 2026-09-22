import { describe, expect, it } from 'vitest';

import { distanceKm } from './geo-distance';

/** Tirana's centre, and a point east of it whose distance is a published figure, not a recomputation. */
const TIRANA = { lng: 19.8187, lat: 41.3275 };

describe('distanceKm', () => {
  it('measures the great-circle distance between two positions', () => {
    expect(distanceKm(TIRANA, { lng: 19.51, lat: 41.24 })).toBeCloseTo(27.8, 0);
  });

  it('is zero for a position against itself, and symmetric', () => {
    const elsewhere = { lng: 19.6482, lat: 40.1468 };

    expect(distanceKm(TIRANA, TIRANA)).toBe(0);
    expect(distanceKm(TIRANA, elsewhere)).toBeCloseTo(distanceKm(elsewhere, TIRANA), 9);
  });
});
