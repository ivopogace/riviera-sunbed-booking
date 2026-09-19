/**
 * PROTOTYPE — throwaway. Round 6's map POSTER: the region map a phone's first screen shows before
 * anyone touches it, as one image — no style, no glyph ranges, no tile ranges, no WebGL context.
 *
 * <p>Measured, a live map costs a first screen 341 kB of style and glyphs, ~100 kB of tiles and
 * one WebGL context; the reference products pay more (Airbnb's search page: 14.8 MB, of which the
 * Google map is 1.9 MB); a static image costs one request. The poster is that image: the fitted region camera rendered ONCE by the real map
 * (`shoot.mjs --posters` opens `?variant=Q&poster=<key>` and screenshots it), served from
 * `public/prototype-posters/`, and drawn under the shipped pin layer through a {@link MapHandle}
 * whose `project` is Web Mercator arithmetic for that camera. The pins are live DOM: they crowd,
 * price and press exactly as on the live map. The first thing that needs the camera to MOVE —
 * a crowd press, a pinch, a drag, the sheet pulled down to the map — swaps the live map in at the
 * poster's own camera and the poster fades under it.
 *
 * <p>A shipped version renders the posters server-side from the same extract (ADR-0022: the map
 * stays first-party), one per region and beach, and invalidates them with the extract.
 */
import { LngLat, MapHandle, MapMarker, MapView, ScreenPoint } from '../../shared/map-engine';
import { fitPins } from './prototype-camera';

/**
 * The poster's own box: 440 wide so it covers a 360–440 px phone with `object-fit: none` and a
 * centred crop, 380 deep = the 68 px glass header the ground runs under plus the 312 px of map the
 * half sheet leaves (`variant-shore.ts` § detents).
 */
export const POSTER_W = 440;
export const POSTER_H = 380;
/** The shipped tourist header on a phone, which the ground runs under (glass over the coast). */
export const HEADER_H = 68;
/** What the half sheet leaves of the map below the header — Airbnb's rest position, measured 307. */
export const MAP_AT_HALF = POSTER_H - HEADER_H;
/** 512 px tiles: `platform/map/style.json` declares no `tileSize` and MapLibre defaults a vector source to 512. */
const TILE = 512;

/**
 * The camera a poster is rendered at: the pins fitted into the 390 × 312 window the half sheet
 * leaves under the header, then the centre dropped by half the header so the frame is the window,
 * not the poster. Deterministic on the fixtures, so the page and the driver agree without a file.
 */
export function posterCamera(pins: readonly LngLat[]): MapView | null {
  const view = fitPins(pins, 390, MAP_AT_HALF);
  if (view === null) return null;
  const perPixel = degreesPerPixel(view.zoom, view.center.lat);
  return {
    center: { lng: view.center.lng, lat: view.center.lat + (HEADER_H / 2) * perPixel },
    zoom: view.zoom,
  };
}

function degreesPerPixel(zoom: number, lat: number): number {
  return (360 / (TILE * 2 ** zoom)) * Math.cos((lat * Math.PI) / 180);
}

function mercX(lng: number): number {
  return (lng + 180) / 360;
}

function mercY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/**
 * A {@link MapHandle} over a still image. `project` is the only method the pin layer reads on
 * every frame; `easeTo`/`zoomIn`/`zoomOut` cannot be honoured by an image, so they report the
 * intent through `onWake` and the page swaps the live map in and replays the move.
 */
export class PosterHandle implements MapHandle {
  private camera: MapView;
  private readonly moveHandlers = new Set<() => void>();
  private readonly clickHandlers = new Set<(at: LngLat) => void>();
  private readonly dragHandlers = new Set<(id: string, at: LngLat) => void>();
  /** Markers a poster cannot draw; kept so a live map taking over can be handed them. */
  readonly markers = new Map<string, MapMarker>();

  constructor(
    camera: MapView,
    /** The pane's width; the poster is centred in it, so projection is relative to the pane. */
    private paneWidth: number,
    private readonly onWake: (wanted: MapView | null) => void,
  ) {
    this.camera = camera;
  }

  resize(paneWidth: number): void {
    this.paneWidth = paneWidth;
    for (const handler of this.moveHandlers) handler();
  }

  view(): MapView {
    return this.camera;
  }

  setView(view: MapView): void {
    this.camera = view;
    for (const handler of this.moveHandlers) handler();
  }

  zoomIn(): void {
    this.onWake({ ...this.camera, zoom: this.camera.zoom + 1 });
  }

  zoomOut(): void {
    this.onWake({ ...this.camera, zoom: this.camera.zoom - 1 });
  }

  addMarker(marker: MapMarker): void {
    this.markers.set(marker.id, marker);
  }

  moveMarker(id: string, lngLat: LngLat): void {
    const marker = this.markers.get(id);
    if (marker !== undefined) this.markers.set(id, { ...marker, lngLat });
  }

  removeMarker(id: string): void {
    this.markers.delete(id);
  }

  project(at: LngLat): ScreenPoint {
    const world = TILE * 2 ** this.camera.zoom;
    return {
      x: this.paneWidth / 2 + (mercX(at.lng) - mercX(this.camera.center.lng)) * world,
      y: POSTER_H / 2 + (mercY(at.lat) - mercY(this.camera.center.lat)) * world,
    };
  }

  onMove(handler: () => void): () => void {
    this.moveHandlers.add(handler);
    return () => this.moveHandlers.delete(handler);
  }

  easeTo(view: MapView): void {
    this.onWake(view);
  }

  on(event: 'load' | 'error', handler: () => void): () => void {
    if (event === 'load') handler();
    return () => this.moveHandlers.delete(handler);
  }

  onMapClick(handler: (at: LngLat) => void): () => void {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void {
    this.dragHandlers.add(handler);
    return () => this.dragHandlers.delete(handler);
  }

  destroy(): void {
    this.moveHandlers.clear();
    this.clickHandlers.clear();
    this.dragHandlers.clear();
  }

  /** The ground was tapped clear of any pin. */
  clicked(): void {
    for (const handler of this.clickHandlers) handler(this.camera.center);
  }
}

/** `public/prototype-posters/<key>.jpg` — a region's code, or `beach-<code>` for one beach. */
export function posterKey(region: string, beach: string): string {
  return beach !== '' ? `beach-${beach}` : region;
}

export function posterUrl(key: string): string {
  return `/prototype-posters/${key}.jpg`;
}
