import { BEACH_CATALOGUE } from '../../shared/beaches';
import { LngLat, MapEngineOptions, MapView } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';

/**
 * PROTOTYPE. The riviera map's geometry, solved for the PANE rather than read off a constant.
 *
 * <p>Every candidate layout in this spike asks the same question — *what can a box this shape
 * actually frame?* — so the answer lives here once. MapLibre lays the world out as a square of
 * `512 × 2^zoom` CSS px (512 being the vector tiles' size) and, given `maxBounds`, refuses any
 * camera whose viewport would leave that box: the fence therefore sets a **zoom floor per pane**,
 * and a wide pane has a higher floor than a narrow one. The consequence the spike is built on:
 * a pane frames the whole catalogued coast only while `width ≤ 0.80 × height`. See `README.md`.
 */

/** MapLibre's world edge at zoom 0, in CSS px — the vector tile size, not the raster 256. */
const TILE_PX = 512;

/** The fence itself is ADR-0022's and is not re-opened here; only the camera inside it is ours. */
const FENCE = RIVIERA_MAP_OPTIONS.maxBounds;
const MIN_ZOOM = RIVIERA_MAP_OPTIONS.minZoom;
const MAX_ZOOM = RIVIERA_MAP_OPTIONS.maxZoom;

/** Metres of latitude per degree, near enough at 40°N to talk about a coast in kilometres. */
const KM_PER_DEG_LAT = 111.32;

/** A pane's rendered box in CSS px — what the map is actually given, never what it asked for. */
export interface PaneBox {
  readonly width: number;
  readonly height: number;
}

/** A normalised Web-Mercator rectangle: 0…1 on both axes, y increasing southward. */
interface MercatorBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** Normalised Mercator x for a longitude: 0 at 180°W, 1 at 180°E. */
export function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

/** Normalised Mercator y for a latitude: 0 at the projection's north edge, 1 at its south. */
export function mercatorY(lat: number): number {
  const phi = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
}

function lngAtX(x: number): number {
  return x * 360 - 180;
}

function latAtY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

const FENCE_BOX: MercatorBox = {
  x0: mercatorX(FENCE[0].lng),
  x1: mercatorX(FENCE[1].lng),
  y0: mercatorY(FENCE[1].lat),
  y1: mercatorY(FENCE[0].lat),
};

const FENCE_W = FENCE_BOX.x1 - FENCE_BOX.x0;
const FENCE_H = FENCE_BOX.y1 - FENCE_BOX.y0;

/** Every point in the catalogue, so "the coast" is the data's own extent and not a guess. */
export const COAST_POINTS: readonly LngLat[] = BEACH_CATALOGUE.map((entry) => entry.view.center);

function boxOf(points: readonly LngLat[]): MercatorBox {
  const xs = points.map((at) => mercatorX(at.lng));
  const ys = points.map((at) => mercatorY(at.lat));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export const COAST_BOX: MercatorBox = boxOf(COAST_POINTS);

/** North-to-south extent of the catalogued coast, in km — the number the README argues from. */
export const COAST_KM = (latAtY(COAST_BOX.y0) - latAtY(COAST_BOX.y1)) * KM_PER_DEG_LAT;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The lowest zoom this pane can hold, which is the fence's doing and not the map's `minZoom`:
 * MapLibre scales up until the fenced box covers the viewport on BOTH axes, so the binding axis
 * is whichever needs more world. A 1440 px-wide pane floors at 8.85 and a 390 px one at 7.
 */
export function zoomFloor(pane: PaneBox): number {
  const worldNeeded = Math.max(pane.width / FENCE_W, pane.height / FENCE_H);
  return Math.max(MIN_ZOOM, Math.log2(worldNeeded / TILE_PX));
}

/** The zoom at which `points` exactly fill the pane inside `padPx`, before any clamping. */
function rawFitZoom(points: readonly LngLat[], pane: PaneBox, padPx: number): number {
  const box = boxOf(points);
  // A single point (or a column of them) has no extent on that axis: it constrains nothing.
  const width = Math.max(box.x1 - box.x0, Number.EPSILON);
  const height = Math.max(box.y1 - box.y0, Number.EPSILON);
  const usable = (span: number, px: number): number => Math.max(px - 2 * padPx, 1) / span;
  return Math.log2(Math.min(usable(width, pane.width), usable(height, pane.height)) / TILE_PX);
}

/** Whether this pane can frame these points at all, or whether the fence's floor crops them. */
export function fits(points: readonly LngLat[], pane: PaneBox, padPx = 0): boolean {
  return rawFitZoom(points, pane, padPx) >= zoomFloor(pane);
}

/** How a fit is qualified. Defaults: no padding, no ceiling, the whole pane visible. */
export interface FitOptions {
  readonly padPx?: number;
  /**
   * The closest the camera may go. Usually wanted: three venues 300 m apart "fit" at zoom 16,
   * which is a car park and not a bay — {@link zoomForCoastKm} turns "show me 3 km of coast"
   * into the number to pass here.
   */
  readonly ceiling?: number;
  /**
   * The part of the pane nothing floats over. A sheet or a dock covering the map's lower half
   * halves the room a fit actually has, and a camera fitted to the whole pane puts half its pins
   * underneath — which is what the spike's first phone bay screenshot showed. The FENCE still
   * reads the real pane: MapLibre clamps against the element, not against what we can see.
   */
  readonly visible?: PaneBox;
}

/**
 * The camera that frames `points` in this pane: their own centre at the zoom that fits them,
 * clamped into the fence exactly as MapLibre would, so a projected pin lands where we predicted.
 */
export function fitView(
  points: readonly LngLat[],
  pane: PaneBox,
  options: FitOptions = {},
): MapView {
  const { padPx = 0, ceiling = MAX_ZOOM, visible = pane } = options;
  const zoom = clamp(
    rawFitZoom(points, visible, padPx),
    zoomFloor(pane),
    Math.min(ceiling, MAX_ZOOM),
  );
  const box = boxOf(points);
  return constrain({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, zoom, pane);
}

/** The same clamp for a camera aimed by hand — a scrubber, a scroll position, a beach's centre. */
export function viewAt(at: LngLat, zoom: number, pane: PaneBox): MapView {
  return constrain(
    { x: mercatorX(at.lng), y: mercatorY(at.lat) },
    clamp(zoom, zoomFloor(pane), MAX_ZOOM),
    pane,
  );
}

function constrain(centre: { x: number; y: number }, zoom: number, pane: PaneBox): MapView {
  const world = TILE_PX * Math.pow(2, zoom);
  const halfW = pane.width / 2 / world;
  const halfH = pane.height / 2 / world;
  const axis = (value: number, low: number, high: number, half: number): number =>
    high - low <= 2 * half ? (low + high) / 2 : clamp(value, low + half, high - half);
  return {
    center: {
      lng: lngAtX(axis(centre.x, FENCE_BOX.x0, FENCE_BOX.x1, halfW)),
      lat: latAtY(axis(centre.y, FENCE_BOX.y0, FENCE_BOX.y1, halfH)),
    },
    zoom,
  };
}

/** Map options for a pane: the shipped fence, a camera this pane can actually hold. */
export function optionsFor(view: MapView): MapEngineOptions {
  return { ...RIVIERA_MAP_OPTIONS, view };
}

/** What a pane frames under a given camera — the readout the switcher prints over every shot. */
export interface Frame {
  readonly zoom: number;
  readonly floor: number;
  readonly lngDeg: number;
  readonly latDeg: number;
  readonly km: number;
  /** True while the pane could hold the whole catalogued coast at its own floor. */
  readonly holdsCoast: boolean;
}

/**
 * Measured around the camera's OWN latitude, not around the equator. Mercator stretches away
 * from the equator, so the same pixel height covers fewer degrees at 40°N than at 0° — about 24 %
 * fewer. An equator-centred reading of this pane overstates the coast in shot by that much, and
 * every argument in `README.md` is made from these numbers.
 */
export function frameOf(pane: PaneBox, view: MapView): Frame {
  const world = TILE_PX * Math.pow(2, view.zoom);
  const half = pane.height / 2 / world;
  const centre = mercatorY(view.center.lat);
  const latDeg = latAtY(centre - half) - latAtY(centre + half);
  return {
    zoom: view.zoom,
    floor: zoomFloor(pane),
    lngDeg: (pane.width / world) * 360,
    latDeg,
    km: latDeg * KM_PER_DEG_LAT,
    holdsCoast: fits(COAST_POINTS, pane),
  };
}

/**
 * The widest this pane may be and still frame the whole coast, at its current height. The ratio
 * is constant (0.80) because both terms are Mercator heights; the pixel figure is what a layout
 * argument actually needs.
 */
export function widestCoastPane(height: number): number {
  return (height * FENCE_W) / (COAST_BOX.y1 - COAST_BOX.y0);
}

/** Normalised Mercator height of one degree of latitude near the riviera (40°N). */
const DY_PER_DEG_AT_40N = 1 / (360 * Math.cos((40 * Math.PI) / 180));

/**
 * The zoom at which this pane's HEIGHT spans roughly `km` of coast — how a travelling camera is
 * aimed: pick the stretch of coast that should be in shot, and the pane decides the zoom.
 */
export function zoomForCoastKm(pane: PaneBox, km: number): number {
  const height = (km / KM_PER_DEG_LAT) * DY_PER_DEG_AT_40N;
  return clamp(Math.log2(pane.height / height / TILE_PX), zoomFloor(pane), MAX_ZOOM);
}

/** A point `t` of the way from `from` to `to`, for a camera walking a coastline. */
export function between(from: LngLat, to: LngLat, t: number): LngLat {
  const at = clamp(t, 0, 1);
  return { lng: from.lng + (to.lng - from.lng) * at, lat: from.lat + (to.lat - from.lat) * at };
}

/**
 * Slide what the camera is looking at by this many px to the RIGHT and UP within the frame, at
 * the same zoom. Two things want it, both of them properties of this subject rather than of maps
 * in general:
 *
 * <p>**The sea is always on one side.** Every beach on this coast faces west, so a camera centred
 * on its venues spends its right-hand half on the hillside behind them — two thirds of a 1340 px
 * pane in the spike's first bay screenshot. Pushing the content right puts the water in frame.
 *
 * <p>**Floating chrome eats the bottom.** A sheet or a dock over the map's lower half leaves the
 * fit only the strip above it, and the content has to rise into that strip.
 */
export function nudged(view: MapView, pane: PaneBox, rightPx: number, upPx: number): MapView {
  const world = TILE_PX * Math.pow(2, view.zoom);
  return constrain(
    {
      x: mercatorX(view.center.lng) - rightPx / world,
      y: mercatorY(view.center.lat) + upPx / world,
    },
    view.zoom,
    pane,
  );
}
