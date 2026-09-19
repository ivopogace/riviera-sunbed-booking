/**
 * PROTOTYPE — throwaway. Fit the riviera map's camera to the pins it is showing, for the pane it
 * is showing them in.
 *
 * <p>This is a FINDING, not decoration. `RIVIERA_MAP_OPTIONS` opens at zoom 8.6 on
 * {19.75, 40.05} — a camera tuned for the 430 × 560 px portrait pane the shipped page gives it.
 * Every layout here makes the pane bigger or a different shape, and at that fixed camera the
 * extra area goes to inland Albania (Përmet, Gjirokastra) and open sea instead of to the coast.
 * So whichever layout wins, the camera has to be derived from the pane and the result set rather
 * than pinned in a constant.
 *
 * <p>Web Mercator, both axes, then the tighter of the two zooms. Only `easeTo(view)` is needed,
 * which `MapHandle` already publishes — no port change.
 */
import { LngLat, MapHandle, MapView } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';

/**
 * The world is `TILE * 2^zoom` pixels across. 512, not 256: `platform/map/style.json`'s
 * `openmaptiles` source declares no `tileSize`, and MapLibre defaults a VECTOR source to 512 —
 * measured, not assumed (256 here asks for a zoom exactly one level too tight, which is what
 * first framed this map on Durrës instead of the whole coast).
 */
const TILE = 512;
/** Chrome inset: the Near me / zoom column, the credit pill and the pins' own 44px boxes. */
const PAD_PX = 76;
/** A lone pin has no span to fit, so it gets town scale instead of an infinite zoom. */
const SINGLE_PIN_ZOOM = 12.5;
/**
 * The tightest the fit will go, whatever the pins allow. Three venues 20 m apart would otherwise
 * fit at the map's own ceiling of 16, which shows driveways and no sea — and on THIS product the
 * sea is the context the whole decision rests on. 14 keeps the bay and the shoreline in frame;
 * `shared/beaches.ts` picks 13 for the same reason when a beach is chosen from the filter.
 */
const FIT_MAX_ZOOM = 14;

/** Mercator y for a latitude, as a 0…1 fraction of the world square. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/**
 * The camera that shows every one of `at` inside a `width` × `height` pane.
 *
 * <p>`insetLeft` / `insetRight` is chrome that COVERS the map rather than sitting beside it
 * (variant B's glass rail; variant K's label gutter): the fit then frames the pins in what is
 * actually left over and shifts the centre by half the imbalance, instead of parking the coast
 * behind the chrome.
 *
 * <p>Clamped twice: to the map's own `minZoom`/`maxZoom`, and to the zoom at which the viewport
 * still fits inside `maxBounds` — the ADR-0022 tile fence is only 2.2° of longitude wide, so a
 * wide pane asking for a wider viewport gets re-clamped by the engine anyway, and fighting it
 * produces exactly the half-framed camera this replaces. `null` when there is nothing to fit.
 */
export function fitPins(
  at: readonly LngLat[],
  width: number,
  height: number,
  insetLeft = 0,
  insetRight = 0,
  pad = PAD_PX,
): MapView | null {
  if (at.length === 0 || width - insetLeft - insetRight <= pad || height <= pad) {
    return null;
  }
  const lngs = at.map((p) => p.lng);
  const lats = at.map((p) => p.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const north = Math.max(...lats);
  const south = Math.min(...lats);

  const usableW = width - insetLeft - insetRight - pad;
  const usableH = height - pad;

  const lngSpan = east - west;
  const ySpan = Math.abs(mercatorY(north) - mercatorY(south));
  // Each axis' own ceiling; the pane must satisfy both, so take the smaller.
  const zoomForLng = lngSpan > 0 ? Math.log2((360 * usableW) / (TILE * lngSpan)) : Infinity;
  const zoomForLat = ySpan > 0 ? Math.log2(usableH / (TILE * ySpan)) : Infinity;
  const wanted = lngSpan <= 0 && ySpan <= 0 ? SINGLE_PIN_ZOOM : Math.min(zoomForLng, zoomForLat);

  const [sw, ne] = RIVIERA_MAP_OPTIONS.maxBounds;
  // The zoom below which the viewport is wider than the fence, which the engine would undo.
  const fenceFloor = Math.log2((360 * width) / (TILE * (ne.lng - sw.lng)));

  const zoom = Math.min(
    RIVIERA_MAP_OPTIONS.maxZoom,
    FIT_MAX_ZOOM,
    Math.max(RIVIERA_MAP_OPTIONS.minZoom, fenceFloor, wanted),
  );

  // Degrees per pixel at the chosen zoom, for the covered-chrome shift.
  const perPixel = 360 / (TILE * 2 ** zoom);
  return {
    center: {
      lng: (west + east) / 2 - ((insetLeft - insetRight) / 2) * perPixel,
      lat: (north + south) / 2,
    },
    zoom,
  };
}

/** Apply {@link fitPins} to a live handle; a `null` fit leaves the camera where it is. */
export function fitHandleToPins(
  handle: MapHandle,
  at: readonly LngLat[],
  pane: HTMLElement,
  insetLeft = 0,
  insetRight = 0,
): void {
  const view = fitPins(at, pane.clientWidth, pane.clientHeight, insetLeft, insetRight);
  if (view !== null) {
    handle.easeTo(view);
  }
}
