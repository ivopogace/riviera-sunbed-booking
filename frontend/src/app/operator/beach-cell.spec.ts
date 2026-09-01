import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BeachCell, CellState, cellStateOf, gridRowLabel, MAX_COLS, MAX_ROWS } from './beach-cell';
import { SetView } from '../shared/venue-views';

/**
 * The shared beach-map cell styling, extracted from the layout editor so the bulk grid and the
 * per-set grid cannot drift apart (#600). These strings are the NO-DRIFT PIN: each restates the
 * `CELL_CLASS` entry the layout editor carried before the move, so the extraction is verifiable
 * rather than eyeballed. Two deliberate departures since: the gap border darkened `/35` → `/55` so
 * the aisle boundary is 3:1 composited over the shared canvas wash (#672 slice 2, pinned in
 * `layout-editor.contrast.spec.ts`), and #852 tokenised the `#0c2a33` positions — the ones this map
 * paints with an `/opacity` modifier AND the two raw stops inside the walk-in gradient, since a
 * per-state map may not mix a named utility with a literal of the same value in one branch. Then
 * #879 took the walk-in gradient whole: its two stops were 30%/12% here and 35%/12% at the layout
 * editor's "mirror" swatch, so the hatch became one `--riv-walkin-hatch` image token and this entry
 * names the token rather than the stops.
 *
 * <p>So the pin is no longer byte-identical to the pre-move strings, and could not stay so without
 * pinning the migration out. What it still guarantees is what it was written for: that the two
 * grids render ONE map, and that no slice restyles a cell while claiming to move it. The paint is
 * unchanged either way — `border-riv-console-tint/15` compiles to the same
 * `color-mix(in oklab, …, transparent)` the literal did, measured byte-identical over five hosts
 * (`shared/class-o-tint-tokens.contrast.spec.ts`, `e2e/class-o-tint-tokens.e2e.ts`).
 */
const PRE_MOVE_CELL_CLASS: Record<CellState, string> = {
  premium: 'border-riv-premium-edge/40 bg-(image:--riv-premium-grad)',
  standard: 'border-riv-console-tint/15 bg-white/85',
  walkin: 'border-riv-console-tint/15 bg-(image:--riv-walkin-hatch)',
  gap: 'border-dashed border-riv-console-tint/55 bg-transparent',
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

  /**
   * The aisle boundary is the one class-O alpha that could not be normalised (#879). `/55` is not
   * what someone typed — it is 0.55 and not 0.35 because the gap cell's identity is its border
   * ALONE (no fill, `bg-transparent`), and only at 0.55 does that border clear 3:1 composited over
   * the shared canvas wash, WCAG 1.4.11 (#672 slice 2; the ratio itself is measured in
   * `layout-editor.contrast.spec.ts`, which is where it belongs — one number-bearing surface).
   *
   * <p>It needed no exemption from the multiple-of-five ladder, because 55 is already on it. That
   * is a coincidence worth a test rather than a comment: the ladder is a rule about alphas and this
   * alpha is a rule about contrast, and a future re-cut of the ladder that did not know the second
   * rule existed would be free to round this one anywhere. This test is what makes it not free.
   */
  it('keeps the aisle boundary at /55, off the ladder’s collapse', () => {
    const { host, component, detect } = render();
    component.state.set('gap');
    detect();
    const button = host.querySelector('button')!;

    expect(button.classList.contains('border-riv-console-tint/55')).toBe(true);
    expect(button.classList.contains('bg-transparent')).toBe(true);
    expect(
      [...button.classList].filter((c) => /^(bg|border)-riv-console-tint\//.test(c)),
      'the gap cell paints exactly one console-tint position — its border',
    ).toEqual(['border-riv-console-tint/55']);
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
