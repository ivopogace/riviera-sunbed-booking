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

/**
 * How far a stitched plan's move takes the guest, with the direction the server states: "1 row
 * back, 2 spots along", "2 rows closer to the sea", "3 spots along". Both counts are non-negative.
 */
export function moveText(rowsAway: number, positionsAway: number, towardSea: boolean): string {
  const parts: string[] = [];
  if (rowsAway > 0) {
    const rows = `${rowsAway} row${rowsAway === 1 ? '' : 's'}`;
    parts.push(towardSea ? `${rows} closer to the sea` : `${rows} back`);
  }
  if (positionsAway > 0) {
    parts.push(`${positionsAway} spot${positionsAway === 1 ? '' : 's'} along`);
  }
  return parts.length === 0 ? 'the same spot' : parts.join(', ');
}
