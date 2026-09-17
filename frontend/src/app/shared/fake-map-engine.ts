import {
  LngLat,
  MapEngine,
  MapEngineOptions,
  MapEventName,
  MapHandle,
  MapMarker,
  MapView,
  ScreenPoint,
} from './map-engine';

/** The Web Mercator world at zoom 0, in CSS px — what every tile engine uses. */
const WORLD_PX = 512;

/**
 * A fake map: an in-memory camera and marker set, inspectable by the spec that drove it. It also owns
 * a real DOM surface — it mounts the caller's marker elements and positions them — so a spec or an
 * e2e can see and measure a pin, and click the map the way a person does.
 *
 * <p>Its geometry is the real thing in miniature: Web Mercator around its own camera, so a zoom
 * really doubles every offset and a point projects where a real engine would put it. That is what
 * lets an overlay's crowding, its fit and its press-through be proven here, in jsdom and in the
 * mocked e2e, with no WebGL. In jsdom the surface has no box, so the camera's centre is its corner.
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
    const box = this.box();
    const scale = WORLD_PX * 2 ** this.current.zoom;
    return {
      x: box.width / 2 + (mercatorX(at.lng) - mercatorX(this.current.center.lng)) * scale,
      y: box.height / 2 + (mercatorY(at.lat) - mercatorY(this.current.center.lat)) * scale,
    };
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

  private box(): { width: number; height: number } {
    const rect = this.surface?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  /** The inverse of {@link FakeMapHandle.project}: a spot on the surface back to a position. */
  private unproject({ x, y }: ScreenPoint): LngLat {
    const box = this.box();
    const scale = WORLD_PX * 2 ** this.current.zoom;
    return {
      lng: lngOf(mercatorX(this.current.center.lng) + (x - box.width / 2) / scale),
      lat: latOf(mercatorY(this.current.center.lat) + (y - box.height / 2) / scale),
    };
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
   * A real click on the fake surface becomes a map click at the position under the pointer, so an
   * e2e drops a pin with a genuine gesture and it lands where the click was. Held inside
   * `maxBounds` as a real engine's fence would hold its camera: in a document with no layout the
   * box is a point, so an offset that would otherwise run off the map still lands on it.
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

/** Longitude to the unit Web Mercator square's x (0 at the antimeridian, 1 at the other side). */
function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

/** Latitude to the unit square's y, growing southward as screen y does. */
function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function lngOf(x: number): number {
  return x * 360 - 180;
}

function latOf(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * The deterministic {@link MapEngine} for Vitest and the mocked Playwright suite (armed by
 * `window.__RIVIERA_FAKE_MAP__`): no WebGL, no tiles, no network. It mounts a surface inside the
 * host under a `riviera-map-fake` test id, so an e2e can see the map "rendered" and click it, and
 * records every creation.
 */
export class FakeMapEngine extends MapEngine {
  readonly created: { host: HTMLElement; options: MapEngineOptions }[] = [];

  override create(host: HTMLElement, options: MapEngineOptions): Promise<FakeMapHandle> {
    this.created.push({ host, options });
    const surface = host.ownerDocument.createElement('div');
    surface.dataset['testid'] = 'riviera-map-fake';
    surface.className = 'absolute inset-0';
    host.appendChild(surface);
    return Promise.resolve(new FakeMapHandle(options, surface));
  }
}
