import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MapImagery } from './map-engine';
import { WATER_FILL, waterSamplerOf } from './map-water';

/** The style the map is drawn from, as the backend serves it under `/map/**` (ADR-0022). */
const STYLE_PATH = join(process.cwd(), '../platform/map/style.json');

describe('the water sampler over a rendered raster', () => {
  /** Two CSS px wide, one tall, read at 2×: the left px water, the right px land. */
  function twoPixels(): MapImagery {
    const pixels = new Uint8ClampedArray(4 * 4 * 2);
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 2; y += 1) {
        const at = (y * 4 + x) * 4;
        const [r, g, b] = x < 2 ? [WATER_FILL.r, WATER_FILL.g, WATER_FILL.b] : [222, 227, 205];
        pixels.set([r, g, b, 255], at);
      }
    }
    return { width: 2, height: 1, scale: 2, pixels };
  }

  it('reads the style’s own water fill as water and anything else as land', () => {
    const sample = waterSamplerOf(twoPixels());

    expect(sample({ x: 0, y: 0 })).toBe(true);
    expect(sample({ x: 1, y: 0 })).toBe(false);
  });

  it('reports a point outside the frame as unseen, not as land', () => {
    const sample = waterSamplerOf(twoPixels());

    expect(sample({ x: 2, y: 0 })).toBeUndefined();
    expect(sample({ x: 0, y: -1 })).toBeUndefined();
  });

  /**
   * The shoreline's own pixels are the fill blended with the sand beside it, so they must read as
   * land: the 4 px step is what puts the proposal clear of the blend, and a tolerance wide enough
   * to swallow a blend would put it in the sea.
   */
  it('reads a blended shoreline pixel as land', () => {
    const imagery = twoPixels();
    imagery.pixels.set([190, 205, 230, 255], 0);

    expect(waterSamplerOf(imagery)({ x: 0, y: 0 })).toBe(false);
  });

  /**
   * The fill is a constant here and a declaration in the style the map actually draws from, so a
   * style change that retints the sea would silently stop every proposal. This is the drift guard.
   */
  it('matches the water fill the style declares', () => {
    const style = JSON.parse(readFileSync(STYLE_PATH, 'utf8')) as {
      layers: { id: string; paint?: Record<string, unknown> }[];
    };
    const water = style.layers.find((layer) => layer.id === 'water');

    expect(water?.paint?.['fill-color']).toBe(
      `rgb(${WATER_FILL.r},${WATER_FILL.g},${WATER_FILL.b})`,
    );
  });
});
