import { Pool, SetView, Tier } from './venue-views';
import {
  HeldSetState,
  TileState,
  deriveTileStates,
  groupSetsByRow,
  tileTapAction,
} from './availability-grid';

/**
 * The shared operator availability-grid logic: row grouping, tile-state derivation, and the
 * tap action. Pure functions, exhaustively covered here so the console components can rely on them.
 */
describe('availability-grid', () => {
  describe('groupSetsByRow', () => {
    it('groups sets by row label, preserving read order of rows and sets', () => {
      const rows = groupSetsByRow([
        seat(1, 'A', 1, 'FREE'),
        seat(2, 'B', 1, 'FREE'),
        seat(3, 'A', 2, 'FREE'),
      ]);
      expect(rows.map((r) => r.label)).toEqual(['A', 'B']); // first-seen order
      expect(rows[0].sets.map((s) => s.id)).toEqual([1, 3]);
      expect(rows[1].sets.map((s) => s.id)).toEqual([2]);
    });

    it('returns an empty list for no sets', () => {
      expect(groupSetsByRow([])).toEqual([]);
    });
  });

  describe('deriveTileStates', () => {
    it('maps a set absent from the server states to FREE', () => {
      const state = deriveTileStates([seat(1, 'A', 1, 'FREE')], new Map(), new Map());
      expect(state.get(1)).toBe('FREE');
    });

    it('classifies from the server state tokens — hold vs walk-in, no booking heuristic (#207)', () => {
      const state = deriveTileStates(
        [seat(1, 'A', 1, 'TAKEN'), seat(2, 'A', 2, 'TAKEN'), seat(3, 'A', 3, 'FREE')],
        new Map<number, HeldSetState>([
          [1, 'BOOKED_ONLINE'],
          [2, 'STAFF_MARKED'],
        ]),
        new Map(),
      );
      expect(state.get(1)).toBe('BOOKED_ONLINE');
      expect(state.get(2)).toBe('STAFF_MARKED');
      expect(state.get(3)).toBe('FREE');
    });

    it('renders an unpaid online hold as BOOKED_ONLINE (locked), never a walk-in (#207)', () => {
      // The old derivation mislabeled a TAKEN set without a CONFIRMED booking as STAFF_MARKED.
      const state = deriveTileStates(
        [seat(1, 'A', 1, 'TAKEN')],
        new Map<number, HeldSetState>([[1, 'BOOKED_ONLINE']]),
        new Map(),
      );
      expect(state.get(1)).toBe('BOOKED_ONLINE');
    });

    it('lets an optimistic override win over server truth', () => {
      const overrides = new Map<number, TileState>([[1, 'STAFF_MARKED']]);
      const state = deriveTileStates([seat(1, 'A', 1, 'FREE')], new Map(), overrides);
      expect(state.get(1)).toBe('STAFF_MARKED');
    });
  });

  describe('tileTapAction', () => {
    it('marks a free set, releases a marked one, and locks a booked one', () => {
      expect(tileTapAction('FREE')).toBe('mark');
      expect(tileTapAction('STAFF_MARKED')).toBe('release');
      expect(tileTapAction('BOOKED_ONLINE')).toBeUndefined();
    });
  });
});

function seat(id: number, rowLabel: string, positionNo: number, availability: 'FREE' | 'TAKEN'): SetView {
  const tier: Tier = 'STANDARD';
  const pool: Pool = 'ONLINE';
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability,
  };
}
