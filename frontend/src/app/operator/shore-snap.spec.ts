import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MapImagery, ScreenPoint } from '../shared/map-engine';
import {
  SHORE_STEP_PX,
  WATER_FILL,
  WaterSampler,
  shoreMoveLabel,
  snapToShore,
  waterSamplerOf,
} from './shore-snap';

/** The style the map is drawn from, as the backend serves it under `/map/**` (ADR-0022). */
const STYLE_PATH = join(process.cwd(), '../platform/map/style.json');

/**
 * A frame 300 × 200 CSS px with a straight north–south coast: water west of x = 100, land east of
 * it, nothing outside the frame. Every expected point below is worked out from that geometry by
 * hand, not from the rule.
 */
function inFrame(point: ScreenPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < 300 && point.y < 200;
}

const COAST: WaterSampler = (point) => (inFrame(point) ? point.x < 100 : undefined);
/** A frame the camera caught no sea in at all — the prototype's Palasë and Borsh. */
const ALL_LAND: WaterSampler = (point) => (inFrame(point) ? false : undefined);
/** The other end of the same honesty: a frame that is all sea. */
const ALL_SEA: WaterSampler = (point) => (inFrame(point) ? true : undefined);

/** The rule's own vocabulary, checked once so the worked examples below stay readable. */
describe('the shore snap rule', () => {
  it('proposes a point four px onto the sand, not the shore pixel itself', () => {
    // The nearest water to (160, 50) is (99, 50) — the last water column — so the sand is at 103.
    expect(snapToShore({ x: 160, y: 50 }, COAST)).toEqual({ x: 99 + SHORE_STEP_PX, y: 50 });
  });

  it('proposes nothing for a pin already on the shore', () => {
    expect(snapToShore({ x: 104, y: 50 }, COAST)).toBeNull();
  });

  it('takes a pin at sea to the land, not to the nearest water edge', () => {
    // The nearest land to (40, 50) is (100, 50) — the first land column — so the sand is at 104.
    expect(snapToShore({ x: 40, y: 50 }, COAST)).toEqual({ x: 100 + SHORE_STEP_PX, y: 50 });
  });

  it('degrades honestly on a frame holding no water at all', () => {
    expect(snapToShore({ x: 160, y: 50 }, ALL_LAND)).toBeNull();
  });

  it('degrades honestly on a frame holding no land at all', () => {
    expect(snapToShore({ x: 160, y: 50 }, ALL_SEA)).toBeNull();
  });

  it('proposes nothing for a point the sampler cannot see', () => {
    expect(snapToShore({ x: 900, y: 50 }, COAST)).toBeNull();
  });

  /**
   * The search is nearest-first in every direction, not west-first: on a coast that also runs
   * along the frame's top, a pin at (150, 30) is 21 px below the northern shore at (150, 9) and
   * 51 px east of the western one at (99, 30). The proposal is the northern one, four px south.
   */
  it('finds the nearest shore, whichever way it lies', () => {
    const inlet: WaterSampler = (point) =>
      inFrame(point) ? point.x < 100 || point.y < 10 : undefined;

    expect(snapToShore({ x: 150, y: 30 }, inlet)).toEqual({ x: 150, y: 9 + SHORE_STEP_PX });
  });
});

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

describe('the move label', () => {
  it('says metres below a kilometre and kilometres above it', () => {
    expect(shoreMoveLabel(0.042)).toBe('42 m');
    expect(shoreMoveLabel(0.93)).toBe('930 m');
    expect(shoreMoveLabel(1.6)).toBe('1.6 km');
    expect(shoreMoveLabel(28.4)).toBe('28 km');
  });
});
