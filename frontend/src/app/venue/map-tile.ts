import { computed, Directive, input } from '@angular/core';

import { SetView } from '../shared/venue-views';

/**
 * Every tile state, in legend order. {@link MapTileState} is derived FROM this tuple rather than
 * declared beside it, so a new state cannot be added without every state-driven loop — the legend,
 * the appearance record, the specs — seeing it.
 */
export const MAP_TILE_STATES = ['available', 'premium', 'walkin', 'taken'] as const;

/**
 * How one tile on the tourist beach map looks. The order is a priority, not a list: `taken`
 * beats everything (the ghost wins), and `walkin` beats `premium` — "you cannot book this
 * online" is the fact a tourist must not miss, so it never loses to a tier tint.
 */
export type MapTileState = (typeof MAP_TILE_STATES)[number];

/**
 * Fill, border colour and ink per state — the one home of what a tourist tile looks like, so
 * the grid and the map card's legend swatches render the identical vocabulary rather than two
 * hand-copied sets of literals. The colours are the `--riv-tile-*` tokens (daylight in the light
 * themes, night values in the dark theme — declared per theme in `styles.scss`).
 *
 * <p>It deliberately carries **no geometry** (the `operator/beach-cell.ts` split): the tile is
 * `--riv-tile` square with a 10px radius, the swatch is 18px with a 6px one, and both set their
 * own border *width* — only the appearance is shared. The walk-in entry is the odd one out and
 * on purpose: a 135° hatch of the tile's own ink over a lightened sand, because at swatch size
 * front-row cream and walk-in sand differ by too little to carry a meaning this consequential.
 * Its ink stays AA on both bands of that hatch (`venue-map.contrast.spec.ts`).
 */
const MAP_TILE_CLASS: Record<MapTileState, string> = {
  available:
    'border-(--riv-tile-available-border) bg-(--riv-tile-available-fill) text-(--riv-tile-available-ink)',
  premium:
    'bg-(--riv-tile-premium-fill) border-(--riv-tile-premium-border) text-(--riv-tile-premium-ink)',
  walkin:
    'bg-(--riv-tile-walkin-fill) bg-[repeating-linear-gradient(135deg,var(--riv-tile-walkin-hatch)_0px,var(--riv-tile-walkin-hatch)_3px,transparent_3px,transparent_8px)] border-(--riv-tile-walkin-border) text-(--riv-tile-walkin-ink)',
  taken:
    'bg-(--riv-tile-taken-fill) border-dashed border-(--riv-tile-taken-border) text-(--riv-tile-taken-ink)',
};

/**
 * What each state means in words, kept beside the colours it explains (the
 * `operator/beach-cell.ts` `CELL_STATE_DESC` shape): `legend` is the swatch's label on the map
 * card, `announced` the phrase inside the tile's accessible name. Colour is never the only
 * carrier, so the two must say the same thing — `map-tile.spec.ts` pins that they do.
 */
export const MAP_TILE_MEANING: Record<MapTileState, { legend: string; announced: string }> = {
  available: { legend: 'Available', announced: 'available' },
  premium: { legend: 'Front row', announced: 'available' },
  walkin: {
    legend: 'Walk-in only — book at the venue',
    announced: 'walk-in only — book at the venue',
  },
  taken: { legend: 'Taken', announced: 'taken' },
};

/** The legend's rows, in tile-state order — what `venue-map.html` iterates. */
export const MAP_TILE_LEGEND: readonly { readonly state: MapTileState; readonly label: string }[] =
  MAP_TILE_STATES.map((state) => ({ state, label: MAP_TILE_MEANING[state].legend }));

/**
 * How a set renders on the tourist map, resolving the {@link MapTileState} priority.
 *
 * <p>The availability test is `!== 'FREE'`, not `=== 'TAKEN'`, so it fails **closed**: should the
 * venue read ever grow a third availability (blocked, closed), such a set renders as the ghost
 * rather than as a bookable-looking tile that announces the wrong thing.
 */
export function mapTileState(set: SetView): MapTileState {
  if (set.availability !== 'FREE') {
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
 * keeps `premium` / `walkin` / `taken` marker classes beside it, but they are bound from the
 * SAME resolved state — one vocabulary, two spellings — so `.set-tile.premium` and
 * `[data-state="premium"]` can never select different tiles.
 */
@Directive({
  selector: '[appMapTile]',
  host: { '[class]': 'classes()', '[attr.data-state]': 'state()' },
})
export class MapTile {
  readonly state = input.required<MapTileState>();

  protected readonly classes = computed(() => MAP_TILE_CLASS[this.state()]);
}
