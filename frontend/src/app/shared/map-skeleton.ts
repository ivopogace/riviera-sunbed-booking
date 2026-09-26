import { BeachMapCanvasRow } from './beach-map-canvas';

/** One skeleton row's placeholder tiles; the count also drives each row's `tileCount`. */
export const MAP_SKELETON_TILES: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);

/**
 * The in-flight skeleton's geometry for every beach-map surface, on the canvas's row contract:
 * 4 × 16, a live venue's typical floor (not the editor's 4 × 6 empty-venue seed). Renders through
 * `BeachMapCanvas`, never beside it, so the tile size stays the canvas's own `--riv-tile`.
 */
export const MAP_SKELETON_ROWS: readonly BeachMapCanvasRow[] = ['A', 'B', 'C', 'D'].map((code) => ({
  code,
  priceLabel: null,
  zoneStart: true,
  tileCount: MAP_SKELETON_TILES.length,
}));
