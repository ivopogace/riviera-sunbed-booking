import { BeachMapCanvasRow } from './beach-map-canvas';

/** One skeleton row's placeholder tiles; the count also drives each row's `tileCount`. */
export const MAP_SKELETON_TILES: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);

/**
 * The in-flight skeleton's geometry for every surface that renders a beach map, on the canvas's
 * own row contract — 4 × 16, a real venue's floor rather than the layout editor's own 4 × 6
 * bulk-generate seed (that default is what an operator starts from on an EMPTY venue; a live one
 * never stays that small), so the shape most live venues land in is already on screen. It renders
 * through {@link BeachMapCanvas} rather than beside it, because the tile size is the canvas's own
 * `--riv-tile` and a copy of that literal would drift.
 */
export const MAP_SKELETON_ROWS: readonly BeachMapCanvasRow[] = ['A', 'B', 'C', 'D'].map((code) => ({
  code,
  priceLabel: null,
  zoneStart: true,
  tileCount: MAP_SKELETON_TILES.length,
}));
