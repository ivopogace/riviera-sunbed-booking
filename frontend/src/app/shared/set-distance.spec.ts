import { setDistanceText } from './set-distance';

describe('setDistanceText', () => {
  it.each<[number, number, string]>([
    [0, 4, '4 positions along the row'],
    [0, 1, '1 position along the row'],
    [1, 0, '1 row over'],
    [2, 0, '2 rows over'],
    [1, 2, '1 row over, 2 positions along'],
    [3, 1, '3 rows over, 1 position along'],
  ])('rows %i, positions %i → "%s"', (rows, positions, expected) => {
    expect(setDistanceText(rows, positions)).toBe(expected);
  });
});
