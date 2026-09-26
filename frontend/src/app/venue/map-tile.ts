import { computed, Directive, input } from '@angular/core';

import { SetView } from '../shared/venue-views';

/**
 * Every tile state, in legend order. {@link MapTileState} is derived FROM this tuple rather than
 * declared beside it, so a new state cannot be added without every state-driven loop — the legend,
 * the appearance record, the specs — seeing it.
 */
export const MAP_TILE_STATES = ['available', 'premium', 'partly', 'walkin', 'taken'] as const;

/**
 * How one tile on the tourist beach map looks. The order is a priority, not a list: `taken`
 * beats everything (the ghost wins), `walkin` beats `partly` and `premium` — "you cannot book this
 * online" is the fact a tourist must not miss, so it never loses to a tier tint — and `partly`
 * (free on some of a stay's days) beats the tier.
 */
export type MapTileState = (typeof MAP_TILE_STATES)[number];

/**
 * The one home of tile fill, border colour and ink (`--riv-tile-*`, themed in `tailwind.css`),
 * shared by grid and legend; **no geometry**. Walk-in adds a hatch (cream and sand differ too
 * little at swatch size); the consumer widens partly's dotted border to 2px for forced colours.
 */
const MAP_TILE_CLASS: Record<MapTileState, string> = {
  available:
    'border-riv-tile-available-border bg-riv-tile-available-fill text-riv-tile-available-ink',
  premium: 'bg-riv-tile-premium-fill border-riv-tile-premium-border text-riv-tile-premium-ink',
  partly:
    'bg-riv-tile-available-fill border-dotted border-riv-tile-partly-border text-riv-tile-available-ink',
  walkin:
    'bg-riv-tile-walkin-fill bg-[repeating-linear-gradient(135deg,var(--riv-tile-walkin-hatch)_0px,var(--riv-tile-walkin-hatch)_3px,transparent_3px,transparent_8px)] border-riv-tile-walkin-border text-riv-tile-walkin-ink',
  taken:
    'bg-riv-tile-taken-fill border-dashed border-riv-tile-taken-border text-riv-tile-taken-ink',
};

/**
 * What each state means in words: `legend` labels the swatch, `announced` sits in the tile's
 * accessible name. Colour is never the only carrier, so the two must agree (`map-tile.spec.ts`).
 */
export const MAP_TILE_MEANING: Record<MapTileState, { legend: string; announced: string }> = {
  available: { legend: 'Available', announced: 'available' },
  premium: { legend: 'Front row', announced: 'available' },
  partly: { legend: 'Partly free', announced: 'partly free' },
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
 * How a set renders on the tourist map, by the {@link MapTileState} priority. It fails **closed**:
 * anything not `FREE`/`PARTLY_FREE` is the ghost (never test `=== 'TAKEN'`), so a new availability
 * value can't render as a bookable-looking tile.
 */
export function mapTileState(set: SetView): MapTileState {
  if (set.availability !== 'FREE' && set.availability !== 'PARTLY_FREE') {
    return 'taken';
  }
  if (set.pool === 'WALK_IN') {
    return 'walkin';
  }
  if (set.availability === 'PARTLY_FREE') {
    return 'partly';
  }
  return set.tier === 'PREMIUM' ? 'premium' : 'available';
}

/**
 * The tourist beach-map tile's appearance as a variant directive, worn by the grid tiles and the
 * legend swatches alike, so a swatch cannot claim a look the tile does not have.
 *
 * <p>`data-state` rides along as an inert hook. The `<li>`'s `premium` / `walkin` / `taken`
 * marker classes bind from the SAME resolved state, so `.set-tile.premium` and
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
