/**
 * PROTOTYPE — throwaway. The map's fence, measured: `RIVIERA_MAP_OPTIONS.maxBounds` is 2.2° of
 * longitude wide and MapLibre clamps the viewport against it, so a pane's WIDTH sets a zoom floor;
 * the coast is a tall thin strip, so it fits whole only in a pane that is taller than it is wide.
 */
import { LngLat, MapView } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';

/** MapLibre's world is 512 px wide at zoom 0. */
const WORLD_PX = 512;

export interface Box {
  readonly width: number;
  readonly height: number;
}

const [SW, NE] = RIVIERA_MAP_OPTIONS.maxBounds;

function mercY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
}

function mercX(lng: number): number {
  return (lng + 180) / 360;
}

function latOf(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/** The lowest zoom a pane of this width can show without the fence's 2.2° being narrower than it. */
export function widthFloor(widthPx: number): number {
  return Math.log2(widthPx / ((mercX(NE.lng) - mercX(SW.lng)) * WORLD_PX));
}

/** The same floor from the fence's latitude span, for a pane of this height. */
export function heightFloor(heightPx: number): number {
  return Math.log2(heightPx / ((mercY(SW.lat) - mercY(NE.lat)) * WORLD_PX));
}

/** The pane's floor: the engine's `minZoom`, or the fence on whichever axis binds harder. */
export function paneFloor(box: Box): number {
  return Math.max(RIVIERA_MAP_OPTIONS.minZoom, widthFloor(box.width), heightFloor(box.height));
}

/** How much screen a set of points spans at a zoom, in px. */
export function spanPx(points: readonly LngLat[], zoom: number): Box {
  const xs = points.map((p) => mercX(p.lng));
  const ys = points.map((p) => mercY(p.lat));
  const scale = WORLD_PX * 2 ** zoom;
  return {
    width: (Math.max(...xs) - Math.min(...xs)) * scale,
    height: (Math.max(...ys) - Math.min(...ys)) * scale,
  };
}

export interface Fit extends MapView {
  /** The zoom the points would fit at before the pane's floor was applied. */
  readonly unclamped: number;
  readonly floor: number;
  /** True when the whole point set is on screen at the fitted zoom. */
  readonly whole: boolean;
}

/**
 * The camera for a set of points in a pane: centred on them, at the largest zoom that shows them
 * all inside the padding, raised to the pane's floor when the fence would not let it go lower.
 * Never the shipped constant — the pane and the pins decide.
 */
export function fitView(points: readonly LngLat[], box: Box, padding = 48): Fit {
  const xs = points.map((p) => mercX(p.lng));
  const ys = points.map((p) => mercY(p.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const innerW = Math.max(1, box.width - 2 * padding);
  const innerH = Math.max(1, box.height - 2 * padding);
  const zx = Math.log2(innerW / (Math.max(maxX - minX, 1e-9) * WORLD_PX));
  const zy = Math.log2(innerH / (Math.max(maxY - minY, 1e-9) * WORLD_PX));
  const unclamped = Math.min(zx, zy, RIVIERA_MAP_OPTIONS.maxZoom);
  const floor = paneFloor(box);
  const zoom = Math.max(unclamped, floor);
  const span = spanPx(points, zoom);
  return {
    center: { lng: ((minX + maxX) / 2) * 360 - 180, lat: latOf((minY + maxY) / 2) },
    zoom,
    unclamped,
    floor,
    whole: span.width <= innerW + 1 && span.height <= innerH + 1,
  };
}

/**
 * When the pane cannot frame every point, the stretch of coast that holds the most of them at the
 * pane's floor zoom: a window the pane's height slid down the sorted points. Centred on the pins
 * in that window, never on the pins' overall mean — which for this coast is inland, with nothing
 * in view.
 */
export function bestStretch(points: readonly LngLat[], box: Box, padding = 48): Fit {
  const fit = fitView(points, box, padding);
  if (fit.whole) {
    return fit;
  }
  const scale = WORLD_PX * 2 ** fit.zoom;
  const windowH = Math.max(1, box.height - 2 * padding) / scale;
  const sorted = [...points].sort((a, b) => mercY(a.lat) - mercY(b.lat));
  let best: LngLat[] = [];
  for (const first of sorted) {
    const top = mercY(first.lat);
    const inside = sorted.filter((p) => mercY(p.lat) >= top && mercY(p.lat) <= top + windowH);
    if (inside.length > best.length) {
      best = inside;
    }
  }
  const ys = best.map((p) => mercY(p.lat));
  const xs = best.map((p) => mercX(p.lng));
  return {
    ...fit,
    center: {
      lng: ((Math.min(...xs) + Math.max(...xs)) / 2) * 360 - 180,
      lat: latOf((Math.min(...ys) + Math.max(...ys)) / 2),
    },
  };
}

/** One line of numbers about a pane, for the switcher's readout and the README. */
export function describeFrame(points: readonly LngLat[], box: Box, padding = 48): string {
  if (box.width === 0 || box.height === 0) {
    return 'pane unmeasured';
  }
  const fit = fitView(points, box, padding);
  const span = spanPx(points, fit.zoom);
  const shown = Math.min(100, Math.round((100 * (box.height - 2 * padding)) / span.height));
  const stretch = bestStretch(points, box, padding);
  const inStretch = points.filter(
    (p) => Math.abs(spanPx([p, stretch.center], fit.zoom).height) <= (box.height - 2 * padding) / 2,
  ).length;
  return (
    `pane ${Math.round(box.width)}×${Math.round(box.height)} · floor z${fit.floor.toFixed(2)} · ` +
    `fit z${fit.unclamped.toFixed(2)} → z${fit.zoom.toFixed(2)} · pins ${Math.round(span.width)}×${Math.round(span.height)}px · ` +
    (fit.whole
      ? 'whole coast'
      : `${shown}% of the coast, best stretch holds ${inStretch}/${points.length} pins`)
  );
}
