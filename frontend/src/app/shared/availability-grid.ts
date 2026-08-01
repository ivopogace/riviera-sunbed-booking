import { SetView } from './venue-views';

/**
 * Shared logic for the operator console's per-day availability grid — the read-model derivations used
 * by the O5 Daily view (`operator/daily-view-tab.ts`), plus the row grouping the Pricing tab also uses.
 * Pure and side-effect free, so it is exhaustively unit-testable and lives in exactly one place
 * (extracted at O5 #175 — three consumers, rule of three; the third, the legacy staff daily view, was
 * retired at O6 #176, and the two operator tabs remain).
 */

/** A set's state on a chosen day: `FREE` → tap to mark; `STAFF_MARKED` → tap to release; `BOOKED_ONLINE` → locked. */
export type TileState = 'FREE' | 'STAFF_MARKED' | 'BOOKED_ONLINE';

/** Sets grouped into a beach-map row; first-seen read order is preserved for both rows and sets. */
export interface SetRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

/** Group a venue's sets by row label, preserving read order of the rows and of the sets within each. */
export function groupSetsByRow(sets: readonly SetView[]): SetRow[] {
  const byRow = new Map<string, SetView[]>();
  for (const set of sets) {
    const group = byRow.get(set.rowLabel);
    if (group) {
      group.push(set);
    } else {
      byRow.set(set.rowLabel, [set]);
    }
  }
  return [...byRow].map(([label, rowSets]) => ({ label, sets: rowSets }));
}

/**
 * Derive each set's effective tile state from server truth, which sets a confirmed online booking
 * holds, and any optimistic overrides (which win until a reconcile clears them). A `TAKEN` set is
 * `BOOKED_ONLINE` when an online booking holds it, otherwise a staff walk-in mark.
 */
export function deriveTileStates(
  sets: readonly SetView[],
  onlineHeldSetIds: ReadonlySet<number>,
  overrides: ReadonlyMap<number, TileState>,
): Map<number, TileState> {
  const state = new Map<number, TileState>();
  for (const set of sets) {
    const override = overrides.get(set.id);
    if (override) {
      state.set(set.id, override);
    } else if (set.availability === 'FREE') {
      state.set(set.id, 'FREE');
    } else {
      state.set(set.id, onlineHeldSetIds.has(set.id) ? 'BOOKED_ONLINE' : 'STAFF_MARKED');
    }
  }
  return state;
}

/** The staff action a tap performs for a tile's state: mark a free set, release a marked one, else none. */
export function tileTapAction(state: TileState): 'mark' | 'release' | undefined {
  switch (state) {
    case 'FREE':
      return 'mark';
    case 'STAFF_MARKED':
      return 'release';
    default:
      return undefined; // BOOKED_ONLINE — locked
  }
}
