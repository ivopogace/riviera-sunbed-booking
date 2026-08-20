import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SetView } from '../shared/venue-views';
import { MapTile, MapTileState, mapTileState } from './map-tile';

/**
 * The tourist beach-map tile's appearance, extracted out of `venue-map.html`'s `[&.premium]:`
 * arbitrary variants so the tile and its legend swatch cannot drift (#701 AC-4) — the
 * `operator/beach-cell.ts` shape, one step later.
 *
 * `PRE_MOVE_TILE_CLASS` is the NO-DRIFT PIN: each string is byte-identical to the variant the
 * template carried before the move, so the extraction is verifiable rather than eyeballed. The
 * ONE deliberate departure is `walkin`, and it is the point of the slice: its fill drops
 * `0.85` → `0.6` and it gains the 135° hatch, so "you cannot book this online" no longer
 * differs from front-row cream by tint alone. (Precedent for pinning a departure this way:
 * `beach-cell.spec.ts`'s `/35` → `/55` gap border.)
 */
const PRE_MOVE_TILE_CLASS: Record<MapTileState, string> = {
  available: 'border-[#bfe3df] bg-white/75 text-[#0f7d8c]',
  premium: 'bg-[#fbf1d9]/85 border-[#e6c483] text-[#875911]',
  walkin: 'bg-[#efe0bd]/85 border-[#c8ab62] text-[#5f4d2a]',
  taken: 'bg-white/20 border-dashed border-[#6b7d77] text-[#566560]',
};

/** What the walk-in tile is allowed to change to, and nothing else. */
const WALK_IN_HATCH =
  'bg-[repeating-linear-gradient(135deg,rgba(95,77,42,0.16)_0px,rgba(95,77,42,0.16)_3px,transparent_3px,transparent_8px)]';

@Component({
  imports: [MapTile],
  template: `<li
    appMapTile
    [state]="state()"
    class="set-tile rounded-[10px] border-[1.5px] font-bold text-[12.5px]"
  ></li>`,
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

const ALL_STATES = ['available', 'premium', 'walkin', 'taken'] as const;

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

  it('renders each state from the one shared appearance record', () => {
    const { tile, component, detect } = render();

    for (const state of ALL_STATES) {
      component.state.set(state);
      detect();
      const expected =
        state === 'walkin'
          ? `${PRE_MOVE_TILE_CLASS.walkin.replace('bg-[#efe0bd]/85', 'bg-[#efe0bd]/60')} ${WALK_IN_HATCH}`
          : PRE_MOVE_TILE_CLASS[state];
      for (const token of expected.split(' ')) {
        expect(tile.classList.contains(token), `${state} is missing ${token}`).toBe(true);
      }
    }
  });

  it('keeps the consumer geometry and marker classes beside the appearance ones', () => {
    const { tile, component, detect } = render();
    component.state.set('taken');
    detect();
    // Fill/border-colour/ink are the directive's; geometry and test hooks stay with the consumer.
    for (const token of ['set-tile', 'rounded-[10px]', 'border-[1.5px]', 'text-[12.5px]']) {
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
    for (const state of ALL_STATES) {
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
});
