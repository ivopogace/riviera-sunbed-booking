import { ScreenPoint } from '../shared/map-engine';
import { WaterSampler } from '../shared/map-water';

/** How far onto the sand a proposal steps from the shore pixel it found (the prototype's 4 px). */
export const SHORE_STEP_PX = 4;

/**
 * A land pin nearer the water than this is already on the shore: nothing is proposed (twice the
 * step; less is noise). Screen pixels, so it scales with the operator's zoom — at a coarse camera
 * it swallows the difference rather than propose a false move.
 */
const SHORE_BAND_PX = 8;

/** The last-resort stop for a sampler that breaks its contract and never reports its own edge. */
const MAX_SEARCH_PX = 4096;

/**
 * Pure, in screen pixels: the nearest shore pixel, then {@link SHORE_STEP_PX} onto the sand (a
 * water pin is offered land however close). `null`, proposing nothing, for an unseen point, no
 * shore in frame, a land pin inside {@link SHORE_BAND_PX}, or a step that is not land.
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
 * The proposal's distance for the operator: metres below a kilometre (beach moves are tens of
 * metres). Branch on the ROUNDED value, not the raw one: 0.9996 km reads `1.0 km`, never `1000 m`,
 * and 9.96 km reads `10 km`, never `10.0 km`.
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
 * The nearest pixel of the wanted kind by straight-line distance: square rings outward, past the
 * first hit (ring r's corner is further than ring r + 1's middle), stopping once a whole ring has
 * left the sampler's frame — so "no water in this frame" is an answer, not a scan to the horizon.
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
