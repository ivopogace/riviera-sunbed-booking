import { moveText, setDistanceText } from './set-distance';

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

describe('moveText', () => {
  it.each<[number, number, boolean, string]>([
    [1, 2, false, '1 row back, 2 spots along'],
    [2, 0, true, '2 rows closer to the sea'],
    [0, 3, false, '3 spots along'],
    [0, 1, true, '1 spot along'],
    [1, 0, false, '1 row back'],
    [0, 0, false, 'the same spot'],
  ])('rows %i, positions %i, toward sea %s → "%s"', (rows, positions, towardSea, expected) => {
    expect(moveText(rows, positions, towardSea)).toBe(expected);
  });
});
