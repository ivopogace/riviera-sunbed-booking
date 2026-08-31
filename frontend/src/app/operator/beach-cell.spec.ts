import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BeachCell, CellState, cellStateOf, gridRowLabel, MAX_COLS, MAX_ROWS } from './beach-cell';
import { SetView } from '../shared/venue-views';

/**
 * The shared beach-map cell styling, extracted from the layout editor so the bulk grid and the
 * per-set grid cannot drift apart (#600). These strings are the NO-DRIFT PIN: each is byte-identical
 * to the `CELL_CLASS` entry the layout editor carried before the move, so the extraction is
 * verifiable rather than eyeballed. One deliberate departure since: the gap border darkened
 * `/35` → `/55` so the aisle boundary is 3:1 composited over the shared canvas wash (#672 slice 2,
 * pinned in `layout-editor.contrast.spec.ts`).
 */
const PRE_MOVE_CELL_CLASS: Record<CellState, string> = {
  premium: 'border-[#b47814]/40 bg-[linear-gradient(180deg,#ffe3a3,#f4c05a)]',
  standard: 'border-[#0c2a33]/15 bg-white/85',
  walkin:
    'border-[#0c2a33]/15 bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.3)_0_3px,rgba(12,42,51,0.12)_3px_6px)]',
  gap: 'border-dashed border-[#0c2a33]/55 bg-transparent',
};

@Component({
  imports: [BeachCell],
  template: `<button
    type="button"
    appBeachCell
    [state]="state()"
    aria-label="Row A position 1"
    class="h-7 rounded-[6px] border"
  ></button>`,
})
class CellHost {
  readonly state = signal<CellState>('standard');
}

describe('BeachCell (#600)', () => {
  function render(): { host: HTMLElement; component: CellHost; detect: () => void } {
    const fixture = TestBed.createComponent(CellHost);
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      component: fixture.componentInstance,
      detect: () => fixture.detectChanges(),
    };
  }

  it('emits exactly the class string the layout editor carried before the extraction', () => {
    const { host, component, detect } = render();
    const button = host.querySelector('button')!;

    for (const state of ['premium', 'standard', 'walkin', 'gap'] as const) {
      component.state.set(state);
      detect();
      for (const token of PRE_MOVE_CELL_CLASS[state].split(' ')) {
        expect(button.classList.contains(token)).toBe(true);
      }
    }
  });

  it('keeps the consumer’s own geometry classes beside the variant classes', () => {
    const { host } = render();
    const button = host.querySelector('button')!;

    // Angular 22 merges a static `class` with the host binding, so geometry stays the consumer's.
    expect(button.classList.contains('h-7')).toBe(true);
    expect(button.classList.contains('rounded-[6px]')).toBe(true);
  });

  it('exposes the state as the inert `data-state` test hook the e2e already queries', () => {
    const { host, component, detect } = render();
    const button = host.querySelector('button')!;

    component.state.set('walkin');
    detect();
    expect(button.getAttribute('data-state')).toBe('walkin');
  });
});

describe('beach-grid vocabulary (#600)', () => {
  function setAt(overrides: Partial<SetView>): SetView {
    return {
      id: 1,
      rowLabel: 'A',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
      ...overrides,
    };
  }

  it('reads a walk-in set as walk-in whatever its tier, and an online set by tier', () => {
    expect(cellStateOf(setAt({ pool: 'WALK_IN', tier: 'PREMIUM' }))).toBe('walkin');
    expect(cellStateOf(setAt({ pool: 'ONLINE', tier: 'PREMIUM' }))).toBe('premium');
    expect(cellStateOf(setAt({ pool: 'ONLINE', tier: 'STANDARD' }))).toBe('standard');
  });

  it('labels grid rows A, B, C… from the sea-facing row', () => {
    expect(gridRowLabel(0)).toBe('A');
    expect(gridRowLabel(1)).toBe('B');
    expect(gridRowLabel(25)).toBe('Z');
  });

  it('publishes the layout maxima once, so the bulk and per-set grids cannot clamp differently', () => {
    expect(MAX_ROWS).toBe(26);
    expect(MAX_COLS).toBe(40);
  });
});
