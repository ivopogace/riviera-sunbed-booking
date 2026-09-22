import { describe, expect, it } from 'vitest';

import { ScreenPoint } from '../shared/map-engine';
import { WaterSampler } from '../shared/map-water';
import { SHORE_STEP_PX, shoreMoveLabel, snapToShore } from './shore-snap';

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

describe('the move label', () => {
  it('says metres below a kilometre and kilometres above it', () => {
    expect(shoreMoveLabel(0.042)).toBe('42 m');
    expect(shoreMoveLabel(0.93)).toBe('930 m');
    expect(shoreMoveLabel(1.6)).toBe('1.6 km');
    // Each branch is chosen on the rounded value, so neither boundary reads out in the wrong form.
    expect(shoreMoveLabel(0.9994)).toBe('999 m');
    expect(shoreMoveLabel(0.9996)).toBe('1.0 km');
    expect(shoreMoveLabel(9.94)).toBe('9.9 km');
    expect(shoreMoveLabel(9.96)).toBe('10 km');
    expect(shoreMoveLabel(28.4)).toBe('28 km');
  });
});
