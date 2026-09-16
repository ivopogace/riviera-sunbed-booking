/** A WGS84 position, longitude first as every map engine wants it. */
export interface LngLat {
  readonly lng: number;
  readonly lat: number;
}

/** Where the camera looks. */
export interface MapView {
  readonly center: LngLat;
  readonly zoom: number;
}

export interface MapEngineOptions {
  /** The style document, a same-origin `/map/…` path (ADR-0022). */
  readonly styleUrl: string;
  readonly view: MapView;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** South-west and north-east corners the camera may not leave. */
  readonly maxBounds: readonly [LngLat, LngLat];
}

/** A DOM element pinned to a position; the caller owns the element and its accessibility. */
export interface MapMarker {
  readonly id: string;
  readonly lngLat: LngLat;
  readonly element: HTMLElement;
  /** Draggable markers report their new position through {@link MapHandle.onMarkerDragEnd}. */
  readonly draggable?: boolean;
}

/** `load`: the style and its first tiles are on screen. `error`: a resource failed to load. */
export type MapEventName = 'load' | 'error';

/**
 * One live map. Everything the app needs from an engine, and nothing engine-specific: a
 * consumer that only uses this handle survives swapping MapLibre for another renderer.
 */
export interface MapHandle {
  /** Where the camera looks right now — it moves with every pan and zoom, `setView` or gesture. */
  view(): MapView;
  setView(view: MapView): void;
  zoomIn(): void;
  zoomOut(): void;
  addMarker(marker: MapMarker): void;
  /**
   * Move a marker in place. Re-adding it detaches and re-attaches the caller's element instead,
   * which interrupts a drag in progress and drops whatever focus it held.
   */
  moveMarker(id: string, lngLat: LngLat): void;
  removeMarker(id: string): void;
  /** Subscribe; the returned function unsubscribes. */
  on(event: MapEventName, handler: () => void): () => void;
  /** Where the map surface was clicked. Subscribe; the returned function unsubscribes. */
  onMapClick(handler: (at: LngLat) => void): () => void;
  /** Where a draggable marker was let go. Subscribe; the returned function unsubscribes. */
  onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void;
  destroy(): void;
}

/**
 * The map-engine seam — an external browser capability (WebGL rendering, tile fetching), so it
 * sits behind a DI token with a real and a fake adapter, the exact shape of `StripePaymentGateway`
 * and `QrScanner`: `MapLibreMapEngine` in the browser, `FakeMapEngine` when the Playwright e2e
 * arms `window.__RIVIERA_FAKE_MAP__` (the factory lives in `app.config.ts`); unit specs override
 * the token directly.
 */
export abstract class MapEngine {
  /**
   * Render a map into `host`, which the engine owns from then on. Resolves once the engine is up;
   * rejects when the browser cannot render one (no WebGL). Style and tile loading are reported
   * through the handle's `load`/`error` events.
   */
  abstract create(host: HTMLElement, options: MapEngineOptions): Promise<MapHandle>;
}
