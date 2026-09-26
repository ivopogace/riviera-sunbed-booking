import {
  LngLat,
  MapEngine,
  MapEngineOptions,
  MapEventName,
  MapHandle,
  MapImagery,
  MapMarker,
  MapView,
  ScreenPoint,
} from './map-engine';
import { WATER_FILL } from './map-water';
import { projectAround, unprojectAround } from './web-mercator';

/**
 * The box the fake reports imagery over where the browser has laid nothing out — every jsdom
 * spec. A fake that answered `0 × 0` there could prove nothing about a rule over pixels, and the
 * accommodation is the one `project` already makes by treating the box's centre as its corner.
 */
const JSDOM_FRAME = { width: 300, height: 200 };

/** The sand beside the water: anything that is not the water fill, so one plausible colour does. */
const LAND_FILL = { r: 236, g: 238, b: 204 } as const;

/**
 * A fake map: an in-memory camera and marker set, inspectable by the spec that drove it. It also owns
 * a real DOM surface — it mounts the caller's marker elements and positions them — so a spec or an
 * e2e can see and measure a pin, and click the map the way a person does.
 *
 * <p>Real Web Mercator around its own camera, so a zoom doubles every offset and a point projects
 * where a real engine would put it — enough to prove an overlay's crowding, fit and press-through
 * with no WebGL. In jsdom the surface has no box, so the camera's centre is its corner.
 */
export class FakeMapHandle implements MapHandle {
  private current: MapView;
  private readonly markerSet = new Map<string, MapMarker>();
  private readonly listeners = new Map<MapEventName, Set<() => void>>();
  private readonly clickHandlers = new Set<(at: LngLat) => void>();
  private readonly dragEndHandlers = new Set<(id: string, at: LngLat) => void>();
  private readonly moveHandlers = new Set<() => void>();
  private isDestroyed = false;

  constructor(
    private readonly options: MapEngineOptions,
    private readonly surface?: HTMLElement,
    private readonly coastLng?: number,
  ) {
    this.current = options.view;
    surface?.addEventListener('click', (event) => this.reportClick(event));
  }

  view(): MapView {
    return this.current;
  }

  markers(): ReadonlyMap<string, MapMarker> {
    return this.markerSet;
  }

  destroyed(): boolean {
    return this.isDestroyed;
  }

  setView(view: MapView): void {
    this.moveCamera(view);
  }

  /** The fake has no frames to animate over, so an eased move is a cut. */
  easeTo(view: MapView): void {
    this.moveCamera(view);
  }

  zoomIn(): void {
    this.moveCamera({ ...this.current, zoom: this.current.zoom + 1 });
  }

  zoomOut(): void {
    this.moveCamera({ ...this.current, zoom: this.current.zoom - 1 });
  }

  addMarker(marker: MapMarker): void {
    this.markerSet.set(marker.id, marker);
    // A real engine puts the element on the map; so must this one, or nothing can see or measure it.
    this.surface?.appendChild(marker.element);
    this.placeElement(marker.element, marker.lngLat);
  }

  moveMarker(id: string, lngLat: LngLat): void {
    const marker = this.markerSet.get(id);
    if (marker) {
      this.markerSet.set(id, { ...marker, lngLat });
      this.placeElement(marker.element, lngLat);
    }
  }

  removeMarker(id: string): void {
    this.markerSet.get(id)?.element.remove();
    this.markerSet.delete(id);
  }

  project(at: LngLat): ScreenPoint {
    return projectAround(this.current, this.origin(), at);
  }

  onMove(handler: () => void): () => void {
    this.moveHandlers.add(handler);
    return () => this.moveHandlers.delete(handler);
  }

  on(event: MapEventName, handler: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    set.add(handler);
    this.listeners.set(event, set);
    if (event === 'load') {
      // A fake map is "loaded" the moment anyone asks — but never synchronously, like a real one.
      queueMicrotask(() => {
        if (set.has(handler)) {
          handler();
        }
      });
    }
    return () => set.delete(handler);
  }

  onMapClick(handler: (at: LngLat) => void): () => void {
    this.clickHandlers.add(handler);
    return () => this.clickHandlers.delete(handler);
  }

  onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void {
    this.dragEndHandlers.add(handler);
    return () => this.dragEndHandlers.delete(handler);
  }

  /**
   * Water west of the given coast meridian, land east, in the style's fills at the current camera.
   * `null` with no coast, or without {@link MapEngineOptions.readableImagery}, as MapLibre without
   * its drawing buffer — so a consumer that forgets the flag fails under the fake too.
   */
  readImagery(): MapImagery | null {
    if (this.coastLng === undefined || this.options.readableImagery !== true) {
      return null;
    }
    const { width, height } = this.frame();
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const fill = this.unproject({ x, y }).lng < this.coastLng ? WATER_FILL : LAND_FILL;
        pixels.set([fill.r, fill.g, fill.b, 255], (y * width + x) * 4);
      }
    }
    return { width, height, scale: 1, pixels };
  }

  /** Drive a drag the way a pointer would, for a spec or a mocked e2e. */
  dragMarkerTo(id: string, lngLat: LngLat): void {
    if (this.isDestroyed || !this.markerSet.has(id)) {
      return;
    }
    this.moveMarker(id, lngLat);
    this.dragEndHandlers.forEach((handler) => handler(id, lngLat));
  }

  destroy(): void {
    this.isDestroyed = true;
    this.markerSet.forEach((marker) => marker.element.remove());
    this.markerSet.clear();
    // A queued load still holds its set, so the set itself is emptied, not just the map.
    this.listeners.forEach((set) => set.clear());
    this.listeners.clear();
    this.clickHandlers.clear();
    this.dragEndHandlers.clear();
    this.moveHandlers.clear();
  }

  /** Every camera change comes through here, so the markers follow and the move is reported. */
  private moveCamera(view: MapView): void {
    this.current = view;
    this.markerSet.forEach((marker) => this.placeElement(marker.element, marker.lngLat));
    this.moveHandlers.forEach((handler) => handler());
  }

  /** The surface's centre, where the camera's centre shows; a point in a document with no layout. */
  private origin(): ScreenPoint {
    const rect = this.surface?.getBoundingClientRect();
    return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
  }

  /** The box the imagery covers: the surface's where a browser laid one out, else {@link JSDOM_FRAME}. */
  private frame(): { width: number; height: number } {
    const rect = this.surface?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0
      ? { width: Math.round(rect.width), height: Math.round(rect.height) }
      : JSDOM_FRAME;
  }

  /** The inverse of {@link FakeMapHandle.project}: a spot on the surface back to a position. */
  unproject(point: ScreenPoint): LngLat {
    return unprojectAround(this.current, this.origin(), point);
  }

  /** A marker sits where its position projects, so it moves with the camera like a real one. */
  private placeElement(element: HTMLElement, at: LngLat): void {
    const { x, y } = this.project(at);
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.transform = 'translate(-50%, -50%)';
  }

  /**
   * A real click on the surface becomes a map click at the position under the pointer, so an e2e
   * drops a pin with a genuine gesture. Clamped to `maxBounds` like a real engine's fence: with no
   * layout the box is a point, so an offset that would run off the map still lands on it.
   */
  private reportClick(event: MouseEvent): void {
    if (this.isDestroyed) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const at = this.unproject({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const [southWest, northEast] = this.options.maxBounds;
    this.clickHandlers.forEach((handler) =>
      handler({
        lng: Math.min(northEast.lng, Math.max(southWest.lng, at.lng)),
        lat: Math.min(northEast.lat, Math.max(southWest.lat, at.lat)),
      }),
    );
  }
}

/**
 * The deterministic {@link MapEngine} for Vitest and the mocked Playwright suite (armed by
 * `window.__RIVIERA_FAKE_MAP__`): no WebGL, no tiles, no network. It mounts a surface inside the
 * host under a `riviera-map-fake` test id, so an e2e can see the map "rendered" and click it, and
 * records every creation.
 */
export class FakeMapEngine extends MapEngine {
  readonly created: { host: HTMLElement; options: MapEngineOptions }[] = [];

  /**
   * `coastLng` gives every map this engine makes a straight coast to "draw", so a consumer
   * reasoning about the sea can be driven with no WebGL. Absent — the default, and what every
   * spec that does not care about the sea passes — the maps draw nothing readable.
   */
  constructor(private readonly coastLng?: number) {
    super();
  }

  override create(host: HTMLElement, options: MapEngineOptions): Promise<FakeMapHandle> {
    this.created.push({ host, options });
    const surface = host.ownerDocument.createElement('div');
    surface.dataset['testid'] = 'riviera-map-fake';
    surface.className = 'absolute inset-0';
    host.appendChild(surface);
    return Promise.resolve(new FakeMapHandle(options, surface, this.coastLng));
  }
}
