/**
 * PROTOTYPE — throwaway. Round 2 reaches past the `MapHandle` port to the MapLibre map behind it,
 * for the three things the port does not publish and variant E needs: a camera **bearing**, a
 * bounds fit that knows about it, and a bounds *constraint* that knows about it.
 *
 * <p>The third is a FINDING. MapLibre's default constrain (`mercator_transform.ts`
 * `defaultConstrain`) clamps the UNROTATED viewport — `this.size` against the lng/lat ranges —
 * whatever the bearing is. So a 1440 × 400 band rotated to run along the coast is still held to
 * the 2.2° fence by its 1440 px *width*, and the camera is pinned to the fence's centre longitude
 * where the coast is not. `map.setTransformConstrain` (public API) takes a replacement; the one
 * below constrains the rotated viewport's axis-aligned extent instead, which is what lets the band
 * frame the whole coast at all. If E ships, the port grows `bearing` on `MapView`, a
 * `fitBounds(…, bearing)` and this constraint — three additions, no engine change.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

import { LngLat, MapHandle } from '../../shared/map-engine';
import { RegionCode } from '../../shared/beaches';

type MapLibre = typeof import('maplibre-gl');

/** The world is `TILE · 2^zoom` px across (see prototype-camera.ts for why 512). */
const TILE = 512;

/**
 * The compass direction that points UP so the sea lies at the bottom of the band and the coast
 * reads left → right, north on the left. Derived per region from the coast's own direction of
 * travel: the Adriatic stretch runs almost due south with the sea to the west (up ≈ east), the
 * riviera proper runs south-east from Palasë with the sea to the south-west (up ≈ north-east).
 */
export const REGION_BEARING: Record<RegionCode, number> = {
  SHKODER: 84,
  LEZHE: 84,
  DURRES: 88,
  FIER: 86,
  VLORE: 80,
  HIMARE: 36,
  SARANDE: 90,
};

/** Velipojë → Ksamil as one line: 168° of travel, sea on the right, so up is 78°. */
export const COAST_BEARING = 78;

interface RawAccess {
  readonly map: MapLibreMap;
  readonly maplibre: MapLibre;
}

/** The MapLibre map and module behind a live handle; `null` for the fake engine. */
export function rawMap(handle: MapHandle): RawAccess | null {
  const raw = handle as unknown as Partial<RawAccess>;
  return raw.map && raw.maplibre && typeof raw.map.easeTo === 'function'
    ? { map: raw.map, maplibre: raw.maplibre }
    : null;
}

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function lngOf(x: number): number {
  return x * 360 - 180;
}

function latOf(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Replace the map's bounds constraint with one that fences the ROTATED viewport: the axis-aligned
 * extent of the screen rectangle at `bearing()` (the target bearing, not the in-flight one, so an
 * ease into a rotation does not jitter against the fence mid-flight) must sit inside `bounds`.
 */
export function constrainRotated(
  { map, maplibre }: RawAccess,
  bounds: readonly [LngLat, LngLat],
  bearing: () => number,
): void {
  const [sw, ne] = bounds;
  map.setTransformConstrain((lngLat, zoom) => {
    const rad = (bearing() * Math.PI) / 180;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const extentW = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad));
    const extentH = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad));

    let z = clamp(zoom, map.getMinZoom(), map.getMaxZoom());
    let world = TILE * 2 ** z;
    const fenceW = (mercatorX(ne.lng) - mercatorX(sw.lng)) * world;
    const fenceH = (mercatorY(sw.lat) - mercatorY(ne.lat)) * world;
    const scale = Math.max(extentW / fenceW, extentH / fenceH, 1);
    if (scale > 1) {
      z = clamp(z + Math.log2(scale), map.getMinZoom(), map.getMaxZoom());
      world = TILE * 2 ** z;
    }
    const minX = mercatorX(sw.lng) * world;
    const maxX = mercatorX(ne.lng) * world;
    const minY = mercatorY(ne.lat) * world;
    const maxY = mercatorY(sw.lat) * world;

    const x = clamp(mercatorX(lngLat.lng) * world, minX + extentW / 2, maxX - extentW / 2);
    const y = clamp(mercatorY(lngLat.lat) * world, minY + extentH / 2, maxY - extentH / 2);
    return { center: new maplibre.LngLat(lngOf(x / world), latOf(y / world)), zoom: z };
  });
}

/** Chrome the fit keeps clear of: the pill row along the bottom, the glass at the top. */
export interface RotatedPadding {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Frame `at` with the camera turned to `bearing`, easing there — a SECOND finding. MapLibre's
 * `fitBounds` takes a bearing, but it rotates the pins' GEOGRAPHIC bounding box, whose corners for
 * a diagonal coast sit out at sea and inland; the rotated fit is then limited by a spread the
 * pins do not have (first tried: the coast sank to the band's foot at a zoom two levels too
 * wide). So the extent is measured in the rotated frame itself: every pin into the screen frame
 * at `bearing`, min/max there, the zoom that fits that box in the padded pane, and the centre
 * turned back. A lone pin has no span and gets town scale.
 */
export function fitRotated(
  { map }: RawAccess,
  at: readonly LngLat[],
  bearing: number,
  padding: RotatedPadding,
  maxZoom = 14,
): void {
  if (at.length === 0) {
    return;
  }
  if (at.length === 1) {
    map.easeTo({ center: [at[0].lng, at[0].lat], zoom: 12.5, bearing, duration: 700 });
    return;
  }
  const rad = (bearing * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Screen right is compass `bearing + 90`, screen up is `bearing`; y grows downwards on both.
  const framed = at.map((p) => {
    const mx = mercatorX(p.lng);
    const my = mercatorY(p.lat);
    return { sx: mx * cos + my * sin, sy: -mx * sin + my * cos };
  });
  const minX = Math.min(...framed.map((f) => f.sx));
  const maxX = Math.max(...framed.map((f) => f.sx));
  const minY = Math.min(...framed.map((f) => f.sy));
  const maxY = Math.max(...framed.map((f) => f.sy));

  const { clientWidth, clientHeight } = map.getContainer();
  const usableW = Math.max(1, clientWidth - padding.left - padding.right);
  const usableH = Math.max(1, clientHeight - padding.top - padding.bottom);
  const zoomForX = maxX > minX ? Math.log2(usableW / (TILE * (maxX - minX))) : Infinity;
  const zoomForY = maxY > minY ? Math.log2(usableH / (TILE * (maxY - minY))) : Infinity;
  const zoom = clamp(Math.min(zoomForX, zoomForY), map.getMinZoom(), Math.min(maxZoom, 16));

  // The box sits centred in the PADDED pane, so the camera is offset by the padding's imbalance.
  const worldPx = TILE * 2 ** zoom;
  const cx = (minX + maxX) / 2 - (padding.left - padding.right) / 2 / worldPx;
  const cy = (minY + maxY) / 2 - (padding.top - padding.bottom) / 2 / worldPx;
  const mx = cx * cos - cy * sin;
  const my = cx * sin + cy * cos;
  map.easeTo({ center: [lngOf(mx), latOf(my)], zoom, bearing, duration: 700 });
}
