import type { LngLat, MapView } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map-options';
import { latPerPixel, mercatorY, WORLD_PX as TILE_PX } from '../../shared/web-mercator';

/**
 * The riviera map's camera, derived from the pane and the result set, not `RIVIERA_MAP_OPTIONS`
 * (whose fixed zoom suits only the shipped 430 × 560 pane; other sizes add inland Albania).
 *
 * <p>The world is `512 · 2^zoom` px across: `platform/map/style.json` declares no `tileSize` and
 * MapLibre defaults a vector source to 512 (256 asks for a zoom one level too tight). Web Mercator
 * on both axes, then the tighter zoom. The fit is capped at 14: three venues 20 m apart would fit
 * at the map's ceiling, showing driveways and no sea — the context the whole decision rests on.
 */
/** The pins' own 44 px boxes and their pills, kept inside the frame — the default pad. */
const PAD_PX = 76;
/** A lone pin has no span to fit, so it gets town scale. */
const SINGLE_PIN_ZOOM = 12.5;
const FIT_MAX_ZOOM = 14;

export interface PaneSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The camera showing every one of `at` in a `width` × `height` box, clamped to the map's zoom
 * range and to where the box still fits `maxBounds` (the 2.2°-wide ADR-0022 fence); `null` when
 * nothing or no room to fit. `pad` keeps the marks at `at` in frame: pin boxes by default.
 */
export function fitPins(
  at: readonly LngLat[],
  width: number,
  height: number,
  ceiling = FIT_MAX_ZOOM,
  pad = PAD_PX,
): MapView | null {
  if (at.length === 0 || width <= pad || height <= pad) {
    return null;
  }
  const lngs = at.map((p) => p.lng);
  const lats = at.map((p) => p.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const center = { lng: (west + east) / 2, lat: (north + south) / 2 };

  const lngSpan = east - west;
  const ySpan = Math.abs(mercatorY(north) - mercatorY(south));
  const zoomForLng =
    lngSpan > 0 ? Math.log2((360 * (width - pad)) / (TILE_PX * lngSpan)) : Infinity;
  const zoomForLat = ySpan > 0 ? Math.log2((height - pad) / (TILE_PX * ySpan)) : Infinity;
  const wanted = lngSpan <= 0 && ySpan <= 0 ? SINGLE_PIN_ZOOM : Math.min(zoomForLng, zoomForLat);

  const [southWest, northEast] = RIVIERA_MAP_OPTIONS.maxBounds;
  const fenceFloor = Math.log2((360 * width) / (TILE_PX * (northEast.lng - southWest.lng)));
  const zoom = Math.min(
    RIVIERA_MAP_OPTIONS.maxZoom,
    ceiling,
    Math.max(RIVIERA_MAP_OPTIONS.minZoom, fenceFloor, wanted),
  );
  return { center, zoom };
}

/**
 * Fit into the map visible between `top` and `bottom` of a pane that is the whole viewport, then
 * look south by the window's offset from the pane's middle so the pins land in the window — not
 * in the viewport's centre, which is under the sheet.
 */
export function fitInWindow(
  at: readonly LngLat[],
  pane: PaneSize,
  top: number,
  bottom: number,
  ceiling?: number,
): MapView | null {
  const visible = bottom - top;
  const view = fitPins(at, pane.width, visible, ceiling);
  if (view === null) {
    return null;
  }
  const shift = pane.height / 2 - (top + visible / 2);
  return {
    center: { lng: view.center.lng, lat: view.center.lat - shift * latPerPixel(view) },
    zoom: view.zoom,
  };
}
