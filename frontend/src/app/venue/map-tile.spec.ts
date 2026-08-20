import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SetView } from '../shared/venue-views';
import {
  MAP_TILE_LEGEND,
  MAP_TILE_MEANING,
  MAP_TILE_STATES,
  MapTile,
  MapTileState,
  mapTileState,
} from './map-tile';

/**
 * The tourist beach-map tile's appearance, extracted out of `venue-map.html`'s `[&.premium]:`
 * arbitrary variants so the tile and its legend swatch cannot drift (#701) — the
 * `operator/beach-cell.ts` shape, one step later.
 *
 * `PRE_MOVE_TILE_CLASS` is the NO-DRIFT PIN: each string is the complete, byte-identical set of
 * appearance classes the template carried before the move, and the comparison below is an
 * EQUALITY, not a subset — an added stray utility fails it too. `walkin` is the one deliberate
 * departure and the point of the slice, so only its unchanged half is pinned here; what it gained
 * is asserted separately, and its retired fill is named nowhere (a Tailwind literal in any scanned
 * source file, spec files included, keeps emitting its rule into the shipped stylesheet).
 */
const PRE_MOVE_TILE_CLASS: Record<MapTileState, string> = {
  available: 'border-[#bfe3df] bg-white/75 text-[#0f7d8c]',
  premium: 'bg-[#fbf1d9]/85 border-[#e6c483] text-[#875911]',
  walkin: 'border-[#c8ab62] text-[#5f4d2a]',
  taken: 'bg-white/20 border-dashed border-[#6b7d77] text-[#566560]',
};

/** What the walk-in tile gained: a lighter sand under a 135° hatch of its own ink. */
const WALK_IN_DEPARTURE =
  'bg-[#efe0bd]/60 bg-[repeating-linear-gradient(135deg,rgba(95,77,42,0.16)_0px,rgba(95,77,42,0.16)_3px,transparent_3px,transparent_8px)]';

/** The geometry + markers the consumer owns; the directive must add to them, never replace them. */
const HOST_CLASS = 'set-tile rounded-[10px] border-[1.5px] font-bold text-[12.5px]';

@Component({
  imports: [MapTile],
  template: `<li appMapTile [state]="state()" class="${HOST_CLASS}"></li>`,
})
class TileHost {
  readonly state = signal<MapTileState>('available');
}

function set(overrides: Partial<SetView>): SetView {
  return {
    id: 1,
    rowLabel: 'Row 1',
    positionNo: 1,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: 1,
    gridY: 1,
    availability: 'FREE',
    ...overrides,
  };
}

/** Everything the host wears, minus the geometry and markers it owns — i.e. what the directive added. */
function appearanceOf(tile: HTMLElement): Set<string> {
  const own = new Set(HOST_CLASS.split(' '));
  return new Set([...tile.classList].filter((token) => !own.has(token)));
}

describe('MapTile appearance (#701)', () => {
  function render(): { tile: HTMLElement; component: TileHost; detect: () => void } {
    const fixture = TestBed.createComponent(TileHost);
    fixture.detectChanges();
    return {
      tile: (fixture.nativeElement as HTMLElement).querySelector('li')!,
      component: fixture.componentInstance,
      detect: () => fixture.detectChanges(),
    };
  }

  it('renders each state from the one shared appearance record, and nothing besides', () => {
    const { tile, component, detect } = render();

    for (const state of MAP_TILE_STATES) {
      component.state.set(state);
      detect();
      const expected =
        state === 'walkin'
          ? `${PRE_MOVE_TILE_CLASS.walkin} ${WALK_IN_DEPARTURE}`
          : PRE_MOVE_TILE_CLASS[state];
      expect([...appearanceOf(tile)].sort(), `the ${state} tile`).toEqual(
        expected.split(' ').sort(),
      );
    }
  });

  it('keeps the consumer geometry and marker classes beside the appearance ones', () => {
    const { tile, component, detect } = render();
    component.state.set('taken');
    detect();
    // Fill/border-colour/ink are the directive's; geometry and test hooks stay with the consumer.
    for (const token of HOST_CLASS.split(' ')) {
      expect(tile.classList.contains(token)).toBe(true);
    }
  });

  it('never carries two states at once — a state swap replaces the previous look', () => {
    const { tile, component, detect } = render();
    component.state.set('premium');
    detect();
    expect(tile.classList.contains('bg-[#fbf1d9]/85')).toBe(true);

    component.state.set('taken');
    detect();
    expect(tile.classList.contains('bg-[#fbf1d9]/85')).toBe(false);
    expect(tile.classList.contains('text-[#875911]')).toBe(false);
  });

  it('exposes the state as an inert `data-state` hook, like the operator grid cells', () => {
    const { tile, component, detect } = render();
    for (const state of MAP_TILE_STATES) {
      component.state.set(state);
      detect();
      expect(tile.getAttribute('data-state')).toBe(state);
    }
  });

  it('resolves a set to its state: taken beats walk-in, walk-in beats tier', () => {
    expect(mapTileState(set({}))).toBe('available');
    expect(mapTileState(set({ tier: 'PREMIUM' }))).toBe('premium');
    expect(mapTileState(set({ pool: 'WALK_IN' }))).toBe('walkin');
    // A premium walk-in still reads walk-in — unbookable must never lose to a tier tint.
    expect(mapTileState(set({ pool: 'WALK_IN', tier: 'PREMIUM' }))).toBe('walkin');
    // …and the ghost wins over both (#672).
    expect(mapTileState(set({ availability: 'TAKEN' }))).toBe('taken');
    expect(mapTileState(set({ availability: 'TAKEN', pool: 'WALK_IN' }))).toBe('taken');
    expect(mapTileState(set({ availability: 'TAKEN', tier: 'PREMIUM' }))).toBe('taken');
  });

  it('gives the legend one row per state, in state order, labelled from the meaning record', () => {
    expect(MAP_TILE_LEGEND.map((row) => row.state)).toEqual([...MAP_TILE_STATES]);
    expect(MAP_TILE_LEGEND.map((row) => row.label)).toEqual([
      'Available',
      'Front row',
      'Walk-in only — book at the venue',
      'Taken',
    ]);
  });

  it('says the same thing in the legend as in the walk-in tile accessible name', () => {
    const walkin = MAP_TILE_MEANING.walkin;
    expect(walkin.legend.toLowerCase()).toBe(walkin.announced);
  });
});
