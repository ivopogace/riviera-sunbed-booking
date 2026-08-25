import { MAP_SKELETON_ROWS, MAP_SKELETON_TILES } from './map-skeleton';

describe('map skeleton geometry (#744)', () => {
  it('is a live venue’s floor, 4 × 12, so the usual shape is already on screen', () => {
    expect(MAP_SKELETON_ROWS).toHaveLength(4);
    expect(MAP_SKELETON_TILES).toHaveLength(12);
  });

  it('declares a tile count the canvas can turn into columns', () => {
    for (const row of MAP_SKELETON_ROWS) {
      expect(row.tileCount).toBe(MAP_SKELETON_TILES.length);
    }
  });

  it('gives every row a unique code, which the canvas tracks rows by', () => {
    expect(new Set(MAP_SKELETON_ROWS.map((row) => row.code)).size).toBe(MAP_SKELETON_ROWS.length);
  });

  it('claims no price, so the rail renders no chip over data nobody has fetched', () => {
    for (const row of MAP_SKELETON_ROWS) {
      expect(row.priceLabel).toBeNull();
    }
  });
});
