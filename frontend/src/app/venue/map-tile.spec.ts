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
 * `TILE_TOKEN_CLASS` is the NO-DRIFT PIN: each string is the complete set of appearance classes
 * per state, and the comparison below is an EQUALITY, not a subset — an added stray utility fails
 * it too. The classes reference the `--riv-tile-*` theme tokens (day values in the light themes,
 * night in dark — `styles.scss`); the colour VALUES are AA-proven per ink family in
 * `venue-map.contrast.spec.ts`, so this file pins vocabulary identity, that one pins the maths.
 * `walkin`'s hatch half is pinned separately, mirroring how it arrived.
 */
const TILE_TOKEN_CLASS: Record<MapTileState, string> = {
  available:
    'border-(--riv-tile-available-border) bg-(--riv-tile-available-fill) text-(--riv-tile-available-ink)',
  premium:
    'bg-(--riv-tile-premium-fill) border-(--riv-tile-premium-border) text-(--riv-tile-premium-ink)',
  walkin: 'border-(--riv-tile-walkin-border) text-(--riv-tile-walkin-ink)',
  taken:
    'bg-(--riv-tile-taken-fill) border-dashed border-(--riv-tile-taken-border) text-(--riv-tile-taken-ink)',
};

/** The walk-in tile's second half: a lightened sand under a 135° hatch of its ink family. */
const WALK_IN_DEPARTURE =
  'bg-(--riv-tile-walkin-fill) bg-[repeating-linear-gradient(135deg,var(--riv-tile-walkin-hatch)_0px,var(--riv-tile-walkin-hatch)_3px,transparent_3px,transparent_8px)]';

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
          ? `${TILE_TOKEN_CLASS.walkin} ${WALK_IN_DEPARTURE}`
          : TILE_TOKEN_CLASS[state];
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
    expect(tile.classList.contains('bg-(--riv-tile-premium-fill)')).toBe(true);

    component.state.set('taken');
    detect();
    expect(tile.classList.contains('bg-(--riv-tile-premium-fill)')).toBe(false);
    expect(tile.classList.contains('text-(--riv-tile-premium-ink)')).toBe(false);
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
