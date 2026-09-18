/**
 * PROTOTYPE — throwaway. A plausible beach-map grid per venue, so variant D can show the real
 * `shared/beach-map-canvas` without a `/api/venues/:id/map` response behind it.
 *
 * Deterministic off the venue id: flipping variants must not reshuffle the beach under you.
 */
export type PrototypeTileState = 'available' | 'premium' | 'walkin' | 'taken';

export interface PrototypeTile {
  readonly id: string;
  readonly name: string;
  readonly state: PrototypeTileState;
}

export interface PrototypeSetRow {
  readonly code: string;
  readonly priceLabel: string | null;
  readonly zoneStart: boolean;
  readonly tileCount: number;
  readonly tiles: readonly PrototypeTile[];
}

/** Front row to promenade: three price zones, the front one dearest. */
const ZONES = [
  { rows: 2, label: 'Front row' },
  { rows: 3, label: 'Middle' },
  { rows: 3, label: 'Promenade' },
];

export function prototypeRows(
  venueId: number,
  fromMinor: number,
  cols: number,
): readonly PrototypeSetRow[] {
  const rnd = mulberry(venueId * 7919);
  const rows: PrototypeSetRow[] = [];
  let index = 0;
  ZONES.forEach((zone, z) => {
    // The front row carries the premium multiple; the promenade sits at the from-price.
    const price = Math.round((fromMinor * [1.8, 1.3, 1][z]) / 100);
    for (let r = 0; r < zone.rows; r++) {
      const letter = String.fromCharCode(65 + index);
      rows.push({
        code: letter,
        priceLabel: r === 0 ? `€${price} · ${zone.label}` : null,
        zoneStart: r === 0,
        tileCount: cols,
        tiles: Array.from({ length: cols }, (_, c) => ({
          id: `${venueId}-${letter}${c + 1}`,
          name: `Set ${letter}${c + 1}`,
          state: state(z, rnd()),
        })),
      });
      index++;
    }
  });
  return rows;
}

function state(zone: number, roll: number): PrototypeTileState {
  if (roll < 0.14) return 'walkin';
  if (roll < 0.36) return 'taken';
  return zone === 0 ? 'premium' : 'available';
}

/** A tiny seeded PRNG — the fixture must look the same on every reload. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
