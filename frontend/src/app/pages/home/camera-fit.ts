import { LngLat, MapView } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';

/**
 * The riviera map's camera, derived from the pane and the result set rather than read from
 * `RIVIERA_MAP_OPTIONS` (whose fixed zoom was tuned for the shipped 430 × 560 pane; at any other
 * size the extra area is inland Albania). Web Mercator on both axes, then the tighter zoom.
 *
 * <p>The world is `512 · 2^zoom` px across: `platform/map/style.json` declares no `tileSize` and
 * MapLibre defaults a vector source to 512 (256 asks for a zoom one level too tight). The fit is
 * capped at 14 because three venues 20 m apart would otherwise fit at the map's own ceiling,
 * which shows driveways and no sea — and the sea is the context the whole decision rests on.
 */
const TILE_PX = 512;
/** The pins' own 44 px boxes and their pills, kept inside the frame. */
const PAD_PX = 76;
/** A lone pin has no span to fit, so it gets town scale. */
const SINGLE_PIN_ZOOM = 12.5;
const FIT_MAX_ZOOM = 14;

export interface PaneSize {
  readonly width: number;
  readonly height: number;
}

/** Mercator y for a latitude, as a 0…1 fraction of the world square. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/** Degrees of latitude one pixel spans at `view`, for shifting a centre by pixels. */
function latPerPixel(view: MapView): number {
  return (360 / (TILE_PX * 2 ** view.zoom)) * Math.cos((view.center.lat * Math.PI) / 180);
}

/**
 * The camera that shows every one of `at` inside a `width` × `height` box, clamped to the
 * map's own zoom range and to the zoom at which the box still fits inside `maxBounds` — the
 * ADR-0022 fence is only 2.2° wide, so a wider ask is re-clamped by the engine anyway. `null`
 * when there is nothing to fit or no room to fit it in.
 */
export function fitPins(
  at: readonly LngLat[],
  width: number,
  height: number,
  ceiling = FIT_MAX_ZOOM,
): MapView | null {
  if (at.length === 0 || width <= PAD_PX || height <= PAD_PX) {
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
    lngSpan > 0 ? Math.log2((360 * (width - PAD_PX)) / (TILE_PX * lngSpan)) : Infinity;
  const zoomForLat = ySpan > 0 ? Math.log2((height - PAD_PX) / (TILE_PX * ySpan)) : Infinity;
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
