/**
 * How far a remodel moved a set, in the guest's and the operator's words alike: "4 positions along
 * the row", "1 row over", "1 row over, 2 positions along". Both counts are non-negative; the server
 * computes them, this only says them.
 */
export function setDistanceText(rowsAway: number, positionsAway: number): string {
  const positions = `${positionsAway} position${positionsAway === 1 ? '' : 's'}`;
  if (rowsAway === 0) {
    return `${positions} along the row`;
  }
  const rows = `${rowsAway} row${rowsAway === 1 ? '' : 's'} over`;
  return positionsAway === 0 ? rows : `${rows}, ${positions} along`;
}
