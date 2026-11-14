import { pluralOf } from './plural';

/**
 * How far a remodel moved a set, in the guest's and the operator's words alike: "4 positions along
 * the row", "1 row over", "1 row over, 2 positions along". Both counts are non-negative; the server
 * computes them, this only says them.
 */
export function setDistanceText(rowsAway: number, positionsAway: number): string {
  const p = positionsAway;
  if (rowsAway === 0) {
    return pluralOf(
      p,
      $localize`${p}:count: position along the row`,
      $localize`${p}:count: positions along the row`,
    );
  }
  const r = rowsAway;
  const rows = pluralOf(r, $localize`${r}:count: row over`, $localize`${r}:count: rows over`);
  if (positionsAway === 0) {
    return rows;
  }
  const positions = pluralOf(
    p,
    $localize`${p}:count: position along`,
    $localize`${p}:count: positions along`,
  );
  return $localize`${rows}:rowsOver:, ${positions}:positionsAlong:`;
}

/**
 * How far a stitched plan's move takes the guest, with the direction the server states: "1 row
 * back, 2 spots along", "2 rows closer to the sea", "3 spots along". Both counts are non-negative.
 */
export function moveText(rowsAway: number, positionsAway: number, towardSea: boolean): string {
  const r = rowsAway;
  const p = positionsAway;
  const rows = towardSea
    ? pluralOf(
        r,
        $localize`${r}:count: row closer to the sea`,
        $localize`${r}:count: rows closer to the sea`,
      )
    : pluralOf(r, $localize`${r}:count: row back`, $localize`${r}:count: rows back`);
  const spots = pluralOf(p, $localize`${p}:count: spot along`, $localize`${p}:count: spots along`);
  if (r > 0 && p > 0) {
    return $localize`${rows}:rowMove:, ${spots}:spotMove:`;
  }
  if (r > 0) {
    return rows;
  }
  return p > 0 ? spots : $localize`the same spot`;
}
