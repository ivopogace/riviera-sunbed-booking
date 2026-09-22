import { MapImagery, ScreenPoint } from './map-engine';

/**
 * The map's own water fill, as `platform/map/style.json`'s `water` layer declares it. A constant
 * here and a declaration there, so `map-water.spec.ts` holds the two together: a restyled sea
 * would otherwise stop everything that reasons about where the sea is, silently.
 */
export const WATER_FILL = { r: 158, g: 189, b: 255 } as const;

/**
 * How far a channel may stray from the fill and still be sea. Wide enough for a renderer's own
 * rounding, narrow enough that a shoreline pixel — the fill blended with the sand beside it —
 * reads as land, which is what keeps a consumer's answer clear of the blend.
 */
const WATER_TOLERANCE = 10;

/**
 * Whether the map's imagery is water at a point on the map's own box, in CSS px from its
 * top-left corner — `undefined` where the sampler cannot see, which is how a frame's edge is
 * told from its land.
 *
 * <p>Reporting that edge is not optional: a consumer searching outward for the nearest water has
 * no other way to learn it has left the frame, so a sampler that answers everywhere is searched
 * to its consumer's own guard radius instead of to its frame.
 */
export type WaterSampler = (point: ScreenPoint) => boolean | undefined;

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
