import type { LngLat, MapView, ScreenPoint } from './map-engine';

/**
 * Web Mercator as tile engines draw it: one square world `512 · 2^zoom` CSS px across (MapLibre's
 * vector default; `platform/map/style.json` sets no `tileSize`), x east, y south. The fake engine,
 * camera fit and poster still all project through these, so a point lands on one pixel in each.
 */
export const WORLD_PX = 512;

/** Longitude to the unit square's x (0 at the antimeridian, 1 at the other side). */
export function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

/** Latitude to the unit square's y, growing southward as screen y does; clamped at the poles' cut. */
export function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

export function lngOf(x: number): number {
  return x * 360 - 180;
}

export function latOf(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/** The world's width in CSS px at a zoom. */
export function worldPx(zoom: number): number {
  return WORLD_PX * 2 ** zoom;
}

/** Degrees of latitude one pixel spans at `view`, for shifting a centre by pixels. */
export function latPerPixel(view: MapView): number {
  return (360 / worldPx(view.zoom)) * Math.cos((view.center.lat * Math.PI) / 180);
}

/** Where `at` lands on a box whose centre `origin` shows the camera's centre. */
export function projectAround(view: MapView, origin: ScreenPoint, at: LngLat): ScreenPoint {
  const world = worldPx(view.zoom);
  return {
    x: origin.x + (mercatorX(at.lng) - mercatorX(view.center.lng)) * world,
    y: origin.y + (mercatorY(at.lat) - mercatorY(view.center.lat)) * world,
  };
}

/** The inverse of {@link projectAround}: a spot on the box back to a position. */
export function unprojectAround(view: MapView, origin: ScreenPoint, point: ScreenPoint): LngLat {
  const world = worldPx(view.zoom);
  return {
    lng: lngOf(mercatorX(view.center.lng) + (point.x - origin.x) / world),
    lat: latOf(mercatorY(view.center.lat) + (point.y - origin.y) / world),
  };
}
