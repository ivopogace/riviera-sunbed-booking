import { ScreenPoint } from '../shared/map-engine';
import { WaterSampler } from '../shared/map-water';

/** How far onto the sand a proposal steps from the shore pixel it found (the prototype's 4 px). */
export const SHORE_STEP_PX = 4;

/**
 * Nearer to the water than this and the pin is already on the shore, so nothing is proposed:
 * twice the step, the band inside which a move would be noise rather than a correction. It is a
 * screen distance, so it is worth whatever the operator's own zoom makes it — at a camera too
 * coarse to place a pin precisely, it swallows the difference instead of proposing a false one.
 */
const SHORE_BAND_PX = 8;

/** The last-resort stop for a sampler that breaks its contract and never reports its own edge. */
const MAX_SEARCH_PX = 4096;

/**
 * Where a pin dropped off the shoreline should go: the nearest shore pixel, then
 * {@link SHORE_STEP_PX} onto the sand — the rule the map-design prototype established over its
 * 26 fixtures, here as a pure function over a sampled raster so a spec drives it with a stub
 * sampler and no DOM, the seam `layoutPills` established for the pin pills.
 *
 * <p>`null` is the honest answer wherever the imagery cannot settle it, and the placer proposes
 * nothing in every such case: a pin on land already within {@link SHORE_BAND_PX} of the water, a
 * frame holding no water at all (as the prototype's Palasë and Borsh frames had none), a frame
 * holding no land, a point the sampler cannot see, and a stepped point that turns out not to be
 * land after all — a spit too narrow to stand on, or a step off the frame.
 *
 * <p>The band is the one case that is about LAND only: a pin in the water is always off the
 * shoreline, however close, so it is offered the nearest LAND, stepped the same 4 px inland,
 * rather than the water's edge it is already at.
 */
export function snapToShore(at: ScreenPoint, isWater: WaterSampler): ScreenPoint | null {
  const here = isWater({ x: Math.round(at.x), y: Math.round(at.y) });
  if (here === undefined) {
    return null;
  }
  const shore = nearestPixel(at, !here, isWater);
  if (shore === null) {
    return null;
  }
  if (!here && distanceBetween(at, shore) <= SHORE_BAND_PX) {
    return null;
  }
  const inland = here
    ? moveAlong(shore, shore.x - at.x, shore.y - at.y)
    : moveAlong(shore, at.x - shore.x, at.y - shore.y);
  return isWater(inland) === false ? inland : null;
}

/**
 * How far the proposal would move the pin, for the operator to read: metres below a kilometre,
 * because the moves that matter at a beach are tens of metres and `0.1 km` says less than `90 m`.
 *
 * <p>Each branch is chosen on the ROUNDED value, not the raw one, so a distance that rounds up
 * across a boundary is read out in the form it rounded into: 0.9996 km is `1.0 km`, never
 * `1000 m`, and 9.96 km is `10 km`, never `10.0 km`.
 */
export function shoreMoveLabel(km: number): string {
  const metres = Math.round(km * 1000);
  if (metres < 1000) {
    return `${metres} m`;
  }
  const whole = km.toFixed(1);
  return Number(whole) < 10 ? `${whole} km` : `${Math.round(km)} km`;
}

/**
 * The nearest pixel of the wanted kind, by straight-line distance: square rings outward, carried
 * one ring past the first hit because a corner of ring r is further than the middle of ring r + 1.
 * It stops when a whole ring has left the sampler's frame, which is what makes "no water anywhere
 * in this frame" an answer rather than a scan to the horizon.
 */
function nearestPixel(
  from: ScreenPoint,
  wanted: boolean,
  isWater: WaterSampler,
): ScreenPoint | null {
  const origin = { x: Math.round(from.x), y: Math.round(from.y) };
  let best: ScreenPoint | null = null;
  let bestDistance = Infinity;
  for (let radius = 0; radius <= MAX_SEARCH_PX && radius <= bestDistance; radius += 1) {
    let seen = false;
    for (const point of ring(origin, radius)) {
      const water = isWater(point);
      if (water === undefined) {
        continue;
      }
      seen = true;
      const distance = distanceBetween(origin, point);
      if (water === wanted && distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    if (!seen) {
      return best;
    }
  }
  return best;
}

/** The square ring at Chebyshev distance `radius` from `origin`; the origin itself at zero. */
function* ring(origin: ScreenPoint, radius: number): Generator<ScreenPoint> {
  if (radius === 0) {
    yield origin;
    return;
  }
  for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
    yield { x, y: origin.y - radius };
    yield { x, y: origin.y + radius };
  }
  for (let y = origin.y - radius + 1; y <= origin.y + radius - 1; y += 1) {
    yield { x: origin.x - radius, y };
    yield { x: origin.x + radius, y };
  }
}

/** {@link SHORE_STEP_PX} from `from` along the given direction, rounded back onto the pixel grid. */
function moveAlong(from: ScreenPoint, dx: number, dy: number): ScreenPoint {
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return from;
  }
  return {
    x: Math.round(from.x + (dx / length) * SHORE_STEP_PX),
    y: Math.round(from.y + (dy / length) * SHORE_STEP_PX),
  };
}

function distanceBetween(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
