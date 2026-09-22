import { MapImagery, ScreenPoint } from '../shared/map-engine';

/**
 * The map's own water fill, as `platform/map/style.json`'s `water` layer declares it. A constant
 * here and a declaration there, so `shore-snap.spec.ts` holds the two together: a restyled sea
 * would otherwise stop every proposal silently.
 */
export const WATER_FILL = { r: 158, g: 189, b: 255 } as const;

/**
 * How far a channel may stray from the fill and still be sea. Wide enough for a renderer's own
 * rounding, narrow enough that a shoreline pixel — the fill blended with the sand beside it —
 * reads as land, which is what keeps the proposal clear of the blend.
 */
const WATER_TOLERANCE = 10;

/** How far onto the sand a proposal steps from the shore pixel it found (the prototype's 4 px). */
export const SHORE_STEP_PX = 4;

/**
 * Nearer to the water than this and the pin is already on the shore, so nothing is proposed:
 * twice the step, the band inside which a move would be noise rather than a correction. It is a
 * screen distance, so it is worth whatever the operator's own zoom makes it — at a camera too
 * coarse to place a pin precisely, it swallows the difference instead of proposing a false one.
 */
const SHORE_BAND_PX = 8;

/** A stop for a sampler that never reports leaving its frame; no map box comes near it. */
const MAX_SEARCH_PX = 4096;

/**
 * Whether the map's imagery is water at a point on the map's own box, in CSS px from its
 * top-left corner — `undefined` where the sampler cannot see, which is how a frame's edge is
 * told from its land.
 */
export type WaterSampler = (point: ScreenPoint) => boolean | undefined;

/**
 * Where a pin dropped off the shoreline should go: the nearest shore pixel, then
 * {@link SHORE_STEP_PX} onto the sand — the rule the map-design prototype established on its 26
 * fixtures (PR #1155, round 7), here as a pure function over a sampled raster so a spec drives it
 * with a stub sampler and no DOM, the seam `layoutPills` established for the pin pills.
 *
 * <p>`null` is the honest answer in four cases, and the placer proposes nothing in all of them: a
 * pin already within {@link SHORE_BAND_PX} of the water, a frame holding no water at all (as
 * Palasë's and Borsh's beach frames did), a frame holding no land, and a point the sampler cannot
 * see. A pin in the water is never one of them — it goes to the nearest LAND, stepped the same 4
 * px inland, rather than to the water's edge it is already at.
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
 * Reads a raster the map engine handed back: the fill at a CSS-px point, matched against
 * {@link WATER_FILL} within {@link WATER_TOLERANCE}. The raster is in device pixels, so a 2× map
 * is sampled at 2× and the caller still speaks CSS px.
 */
export function waterSamplerOf(imagery: MapImagery): WaterSampler {
  const deviceWidth = Math.round(imagery.width * imagery.scale);
  const deviceHeight = Math.round(imagery.height * imagery.scale);
  return (point) => {
    if (point.x < 0 || point.y < 0 || point.x >= imagery.width || point.y >= imagery.height) {
      return undefined;
    }
    const x = Math.min(deviceWidth - 1, Math.floor(point.x * imagery.scale));
    const y = Math.min(deviceHeight - 1, Math.floor(point.y * imagery.scale));
    const at = (y * deviceWidth + x) * 4;
    return (
      Math.abs(imagery.pixels[at] - WATER_FILL.r) <= WATER_TOLERANCE &&
      Math.abs(imagery.pixels[at + 1] - WATER_FILL.g) <= WATER_TOLERANCE &&
      Math.abs(imagery.pixels[at + 2] - WATER_FILL.b) <= WATER_TOLERANCE
    );
  };
}

/**
 * How far the proposal would move the pin, for the operator to read: metres below a kilometre,
 * because the moves that matter at a beach are tens of metres and `0.1 km` says less than `90 m`.
 */
export function shoreMoveLabel(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
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
