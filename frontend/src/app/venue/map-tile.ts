import { computed, Directive, input } from '@angular/core';

import { SetView } from '../shared/venue-views';

/**
 * How one tile on the tourist beach map looks. The order is a priority, not a list: `taken`
 * beats everything (the ghost wins), and `walkin` beats `premium` — "you cannot book this
 * online" is the fact a tourist must not miss, so it never loses to a tier tint.
 */
export type MapTileState = 'available' | 'premium' | 'walkin' | 'taken';

/**
 * Fill, border colour and ink per state — the one home of what a tourist tile looks like, so
 * the grid and the map card's legend swatches render the identical vocabulary rather than two
 * hand-copied sets of literals.
 *
 * <p>It deliberately carries **no geometry** (the `operator/beach-cell.ts` split): the tile is
 * `--riv-tile` square with a 10px radius, the swatch is 18px with a 6px one, and both set their
 * own border *width* — only the appearance is shared. The walk-in entry is the odd one out and
 * on purpose: a 135° hatch of the tile's own ink over a lightened sand, because at swatch size
 * front-row cream and walk-in sand differ by too little to carry a meaning this consequential.
 * Its ink stays AA on both bands of that hatch (`venue-map.contrast.spec.ts`).
 */
const MAP_TILE_CLASS: Record<MapTileState, string> = {
  available: 'border-[#bfe3df] bg-white/75 text-[#0f7d8c]',
  premium: 'bg-[#fbf1d9]/85 border-[#e6c483] text-[#875911]',
  walkin:
    'bg-[#efe0bd]/60 bg-[repeating-linear-gradient(135deg,rgba(95,77,42,0.16)_0px,rgba(95,77,42,0.16)_3px,transparent_3px,transparent_8px)] border-[#c8ab62] text-[#5f4d2a]',
  taken: 'bg-white/20 border-dashed border-[#6b7d77] text-[#566560]',
};

/** How a set renders on the tourist map, resolving the {@link MapTileState} priority. */
export function mapTileState(set: SetView): MapTileState {
  if (set.availability === 'TAKEN') {
    return 'taken';
  }
  if (set.pool === 'WALK_IN') {
    return 'walkin';
  }
  return set.tier === 'PREMIUM' ? 'premium' : 'available';
}

/**
 * The tourist beach-map tile's tier/pool/availability appearance, as a variant directive (the
 * `shared/amenity-chip` shape) — worn by the grid tiles and by the legend swatches that stand
 * for them, so a swatch cannot claim a look the tile does not have.
 *
 * <p>`data-state` rides along as an inert hook, mirroring `operator/beach-cell.ts`. The `<li>`
 * keeps its own `premium` / `walkin` / `taken` / `bookable` marker classes: those are test
 * hooks and layout keys, not styling.
 */
@Directive({
  selector: '[appMapTile]',
  host: { '[class]': 'classes()', '[attr.data-state]': 'state()' },
})
export class MapTile {
  readonly state = input.required<MapTileState>();

  protected readonly classes = computed(() => MAP_TILE_CLASS[this.state()]);
}
