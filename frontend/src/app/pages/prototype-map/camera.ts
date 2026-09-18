import { LngLat, MapView } from '../../shared/map-engine';

/** A south-west/north-east box, the shape `RIVIERA_MAP_OPTIONS.maxBounds` uses. */
export interface Bbox {
  readonly sw: LngLat;
  readonly ne: LngLat;
}

/** ADR-0022's fence, restated here so a variant can fit it without importing the map component. */
export const RIVIERA_FENCE: Bbox = { sw: { lng: 19.0, lat: 39.5 }, ne: { lng: 21.2, lat: 42.8 } };

function worldX(lng: number): number {
  return (lng + 180) / 360;
}

function worldY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function invWorldY(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * The bounding box of a pin set, so a variant can frame "every venue" rather than the whole fence.
 * Falls back to the fence's own centre when there are no pins (never thrown on).
 */
export function pinBounds(pins: readonly { readonly at: LngLat }[]): Bbox {
  if (pins.length === 0) {
    return RIVIERA_FENCE;
  }
  const lngs = pins.map((pin) => pin.at.lng);
  const lats = pins.map((pin) => pin.at.lat);
  return {
    sw: { lng: Math.min(...lngs), lat: Math.min(...lats) },
    ne: { lng: Math.max(...lngs), lat: Math.max(...lats) },
  };
}

/**
 * Fit `box` into a `paneWidthPx` × `paneHeightPx` pane: the same Web-Mercator tile arithmetic
 * MapLibre's own `fitBounds` performs (256 px tiles, longitude and latitude scaled
 * independently, the smaller of the two axis zooms wins so nothing is cropped). Every variant
 * calls this against its own actual measured container box rather than a hand-authored camera —
 * see the README's "measured finding" on what this reveals for a coastline this shape.
 */
export function fitBounds(
  box: Bbox,
  paneWidthPx: number,
  paneHeightPx: number,
  paddingPx = 24,
  minZoom = 7,
  maxZoom = 16,
): MapView {
  const x0 = worldX(box.sw.lng);
  const x1 = worldX(box.ne.lng);
  const y0 = worldY(box.ne.lat); // north has the smaller Mercator y
  const y1 = worldY(box.sw.lat);
  const dx = Math.max(x1 - x0, 1e-9);
  const dy = Math.max(y1 - y0, 1e-9);
  const availW = Math.max(paneWidthPx - paddingPx * 2, 1);
  const availH = Math.max(paneHeightPx - paddingPx * 2, 1);
  const zoomX = Math.log2(availW / (dx * 256));
  const zoomY = Math.log2(availH / (dy * 256));
  const zoom = Math.min(zoomX, zoomY);
  const clampedZoom = Math.round(Math.min(maxZoom, Math.max(minZoom, zoom)) * 100) / 100;
  const midY = (y0 + y1) / 2;
  return {
    center: { lng: (box.sw.lng + box.ne.lng) / 2, lat: invWorldY(midY) },
    zoom: clampedZoom,
  };
}
