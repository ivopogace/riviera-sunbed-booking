import { SetView } from './venue-views';

/**
 * Shared logic for the operator console's per-day availability grid — the read-model derivations used
 * by the Daily view (`operator/daily-view-tab.ts`), plus the row grouping the Pricing tab also uses.
 * Pure and side-effect free, so it is exhaustively unit-testable and lives in exactly one place
 * (extracted on the rule of three; the third consumer, the legacy staff daily view, is retired —
 * the two operator tabs remain).
 */

/** A set's state on a chosen day: `FREE` → tap to mark; `STAFF_MARKED` → tap to release; `BOOKED_ONLINE` → locked. */
export type TileState = 'FREE' | 'STAFF_MARKED' | 'BOOKED_ONLINE';

/** A held set's server state token — what the owner availability read reports; free sets are absent. */
export type HeldSetState = Exclude<TileState, 'FREE'>;

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
 * Derive each set's effective tile state from the server's per-set state tokens and any
 * optimistic overrides (which win until a reconcile clears them). The states map is the single
 * classification authority: a set absent from it is `FREE`; a held one carries `BOOKED_ONLINE`
 * (any online hold — paid or not — renders locked) or `STAFF_MARKED`. This replaced the
 * taken−confirmed-bookings heuristic that mislabeled an unpaid online hold as a walk-in.
 */
export function deriveTileStates(
  sets: readonly SetView[],
  heldStates: ReadonlyMap<number, HeldSetState>,
  overrides: ReadonlyMap<number, TileState>,
): Map<number, TileState> {
  const state = new Map<number, TileState>();
  for (const set of sets) {
    state.set(set.id, overrides.get(set.id) ?? heldStates.get(set.id) ?? 'FREE');
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
