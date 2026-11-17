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
  available: {
    legend: $localize`:Map legend swatch:Available`,
    announced: $localize`:Tile state inside a beach-map spot's accessible name:available`,
  },
  premium: {
    legend: $localize`:Map legend swatch for the premium tier:Front row`,
    announced: $localize`:Tile state inside a beach-map spot's accessible name:available`,
  },
  partly: {
    legend: $localize`:Map legend swatch:Partly free`,
    announced: $localize`:Tile state inside a beach-map spot's accessible name:partly free`,
  },
  walkin: {
    legend: $localize`:Map legend swatch:Walk-in only — book at the venue`,
    announced: $localize`:Tile state inside a beach-map spot's accessible name:walk-in only — book at the venue`,
  },
  taken: {
    legend: $localize`:Map legend swatch:Taken`,
    announced: $localize`:Tile state inside a beach-map spot's accessible name:taken`,
  },
};

/** The pick's skin on a 44px tile: the one solid fill on the map, so it replaces the state's. */
const MAP_TILE_PICK_CLASS =
  'border-riv-tile-pick-fill bg-riv-tile-pick-fill text-riv-tile-pick-ink';

/** The half fill a partly-free cell draws, as a border so forced colours keep it. */
const HALF = 'after:absolute after:inset-x-0 after:bottom-0 after:border-b-[50cqw]';

/**
 * Each state at overview scale (the phone lens's cells and legend): told apart by shape, drawn in
 * `currentColor` on `::after`, none of them solid. Keyed by {@link MapTileState}, so a new state
 * cannot ship without an overview look.
 */
const MAP_OVERVIEW_CLASS: Record<MapTileState, string> = {
  available: 'text-riv-tile-available-ink bg-current/18',
  premium: 'text-riv-tile-premium-ink bg-current/16',
  partly: `text-riv-tile-available-ink ${HALF} after:border-riv-tile-partly-tint`,
  walkin:
    'text-riv-tile-walkin-ink after:absolute after:top-1/2 after:left-1/2 after:-translate-1/2 after:rounded-full after:border-[24cqw] after:border-current',
  taken:
    'text-riv-tile-taken-border after:absolute after:top-1/2 after:-left-1/4 after:w-[150%] after:-translate-y-1/2 after:-rotate-45 after:border-t-[1.5px] after:border-current',
};

/** The lens keys the tourist map hands out: every tile state, a front-row partly, and the pick. */
export type MapOverviewKey = MapTileState | 'partly-premium' | 'pick';

/** The tourist map's overview looks by lens key. `pick` is the only solid one. */
export const MAP_OVERVIEW_LOOKS: Record<MapOverviewKey, string> = {
  ...MAP_OVERVIEW_CLASS,
  'partly-premium': `text-riv-tile-premium-ink ${HALF} after:border-riv-tile-partly-premium-tint`,
  // Wider than half the cell on purpose: at a fractional cell size two 50cqw borders leave a seam.
  pick: 'text-riv-tile-pick-fill outline-[1.5px] outline-offset-[1.5px] outline-current after:absolute after:inset-0 after:border-[60cqw] after:border-current',
};

/** The states a free count counts: the ones wearing a free look. */
export const MAP_FREE_STATES: readonly MapTileState[] = ['available', 'premium'];

/** A set's overview key: its tile state, with partly split by tier so the half fill keeps the row's hue. */
export function mapOverviewKey(set: SetView): MapOverviewKey {
  const state = mapTileState(set);
  return state === 'partly' && set.tier === 'PREMIUM' ? 'partly-premium' : state;
}

/** The phone legend's rows: one per tile state in its overview look, then the pick. */
export const MAP_OVERVIEW_LEGEND: readonly {
  readonly key: MapOverviewKey;
  readonly label: string;
}[] = [
  ...MAP_TILE_STATES.map((state) => ({ key: state, label: MAP_TILE_MEANING[state].legend })),
  { key: 'pick', label: $localize`:Map legend swatch for the set the visitor picked:Your pick` },
];

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
  /** The visitor's pick (phone only): the solid skin replaces the state's, `data-state` stays. */
  readonly picked = input(false);

  protected readonly classes = computed(() =>
    this.picked() ? MAP_TILE_PICK_CLASS : MAP_TILE_CLASS[this.state()],
  );
}
