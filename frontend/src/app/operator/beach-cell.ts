import { computed, Directive, input } from '@angular/core';

import { SetView } from '../shared/venue-views';

/** What a beach-map grid cell holds. `gap` = no set — an aisle in the bulk editor, a free cell in the per-set one. */
export type CellState = 'premium' | 'standard' | 'walkin' | 'gap';

/** The layout maxima the server enforces, published once so no grid clamps differently. */
export const MAX_ROWS = 26;
export const MAX_COLS = 40;

/** Human, AT-readable description of a cell's state (paired with its row/position by the caller). */
export const CELL_STATE_DESC: Record<CellState, string> = {
  premium: 'front row, premium, online',
  standard: 'standard, online',
  walkin: 'walk-in pool, not bookable online',
  gap: 'gap or aisle',
};

/** Per-state background + border classes. Geometry (size, radius) stays with the consumer. */
const CELL_CLASS: Record<CellState, string> = {
  premium: 'border-[#b47814]/40 bg-[linear-gradient(180deg,#ffe3a3,#f4c05a)]',
  standard: 'border-[#0c2a33]/15 bg-white/85',
  walkin:
    'border-[#0c2a33]/15 bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.3)_0_3px,rgba(12,42,51,0.12)_3px_6px)]',
  // 0.55, not 0.35: the gap cell's identity is its border alone, proven 3:1 over the canvas wash.
  gap: 'border-dashed border-[#0c2a33]/55 bg-transparent',
};

/**
 * The beach-map grid cell's tier/pool appearance, as a variant directive (the `shared/amenity-chip`
 * shape) — the one home of what a premium, standard, walk-in or empty cell looks like, so the bulk
 * paint grid and the per-set editing grid render the identical map.
 *
 * <p>It deliberately carries **no geometry**: the consumer sets its own size, radius and hover
 * treatment, because the two grids size their cells differently (the per-set grid needs a touch
 * target). `data-state` rides along as the inert test hook the layout-editor e2e already queries.
 */
@Directive({
  selector: '[appBeachCell]',
  host: { '[class]': 'classes()', '[attr.data-state]': 'state()' },
})
export class BeachCell {
  readonly state = input.required<CellState>();

  protected readonly classes = computed(() => CELL_CLASS[this.state()]);
}

/** How a saved set renders on the grid: walk-in reads as walk-in whatever its tier. */
export function cellStateOf(set: SetView): CellState {
  if (set.pool === 'WALK_IN') {
    return 'walkin';
  }
  return set.tier === 'PREMIUM' ? 'premium' : 'standard';
}

/** The row label for a 0-based grid row: row 0 (sea-facing) is A. */
export function gridRowLabel(index: number): string {
  return String.fromCodePoint(65 + index);
}

/** Clamp a grid dimension into `[min, max]`. */
export function clampGrid(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
