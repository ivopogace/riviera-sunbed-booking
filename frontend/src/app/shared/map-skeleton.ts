import { BeachMapCanvasRow } from './beach-map-canvas';

/** One skeleton row's placeholder tiles; the count also drives each row's `tileCount`. */
export const MAP_SKELETON_TILES: readonly number[] = [1, 2, 3, 4, 5, 6];

/**
 * The in-flight skeleton's geometry for every surface that renders a beach map, on the canvas's
 * own row contract — the bulk generator's 4 × 6 default, so the shape a venue usually lands with
 * is already on screen. It renders through {@link BeachMapCanvas} rather than beside it, because
 * the tile size is the canvas's own `--riv-tile` and a copy of that literal would drift.
 */
export const MAP_SKELETON_ROWS: readonly BeachMapCanvasRow[] = ['A', 'B', 'C', 'D'].map((code) => ({
  code,
  codeLabel: '',
  priceLabel: null,
  zoneStart: true,
  tileCount: MAP_SKELETON_TILES.length,
}));
