import type { FenceInsets, LngLat, MapView } from './map-engine';
import { latOf, lngOf, mercatorX, mercatorY, WORLD_PX, worldPx } from './web-mercator';

export const NO_FENCE_INSETS: FenceInsets = { top: 0, bottom: 0 };

/** The camera's limits: the bounds the visible map stays inside, and the zoom range. */
export interface CameraFence {
  readonly maxBounds: readonly [LngLat, LngLat];
  readonly minZoom: number;
  readonly maxZoom: number;
}

/**
 * The camera nearest `view` whose VISIBLE map (the box less `insets`) stays inside the bounds. An
 * engine's fence keeps the whole box in, so the covered band hid the coast's ends on the phone.
 */
export function fencedCamera(
  view: MapView,
  width: number,
  height: number,
  insets: FenceInsets,
  fence: CameraFence,
): MapView {
  const [southWest, northEast] = fence.maxBounds;
  const visibleHeight = Math.max(1, height - insets.top - insets.bottom);
  const boundsX = mercatorX(northEast.lng) - mercatorX(southWest.lng);
  const boundsY = mercatorY(southWest.lat) - mercatorY(northEast.lat);
  const clamped = Math.min(fence.maxZoom, Math.max(fence.minZoom, view.zoom));
  const zoom = Math.max(
    clamped,
    Math.log2(width / (WORLD_PX * boundsX)),
    Math.log2(visibleHeight / (WORLD_PX * boundsY)),
  );

  const world = worldPx(zoom);
  const x = mercatorX(view.center.lng) * world;
  const y = mercatorY(view.center.lat) * world;
  const fencedX = clampOrMiddle(
    x,
    mercatorX(southWest.lng) * world + width / 2,
    mercatorX(northEast.lng) * world - width / 2,
  );
  const fencedY = clampOrMiddle(
    y,
    mercatorY(northEast.lat) * world + height / 2 - insets.top,
    mercatorY(southWest.lat) * world - height / 2 + insets.bottom,
  );
  // An axis left alone keeps its exact degrees: a round trip would read as a move to the engine.
  return {
    center: {
      lng: fencedX === x ? view.center.lng : lngOf(fencedX / world),
      lat: fencedY === y ? view.center.lat : latOf(fencedY / world),
    },
    zoom,
  };
}

/** `value` within `[low, high]`; the middle when rounding has crossed them at an exact fit. */
function clampOrMiddle(value: number, low: number, high: number): number {
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}
