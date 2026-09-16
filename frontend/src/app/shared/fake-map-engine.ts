import {
  LngLat,
  MapEngine,
  MapEngineOptions,
  MapEventName,
  MapHandle,
  MapMarker,
  MapView,
} from './map-engine';

/** A fake map: an in-memory view and marker set, inspectable by the spec that drove it. */
export class FakeMapHandle implements MapHandle {
  private current: MapView;
  private readonly markerSet = new Map<string, MapMarker>();
  private readonly listeners = new Map<MapEventName, Set<() => void>>();
  private readonly clickHandlers = new Set<(at: LngLat) => void>();
  private readonly dragEndHandlers = new Set<(id: string, at: LngLat) => void>();
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
    this.current = view;
  }

  zoomIn(): void {
    this.current = { ...this.current, zoom: this.current.zoom + 1 };
  }

  zoomOut(): void {
    this.current = { ...this.current, zoom: this.current.zoom - 1 };
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
  }

  /**
   * A real click on the fake surface becomes a map click, so an e2e drops a pin with a genuine
   * gesture. The position interpolates the click across `maxBounds`, clamped for a zero-sized box
   * (jsdom reports no layout), so it is deterministic and always inside the map.
   */
  /** Absolutely positioned inside the surface, so a dropped pin is where it was clicked. */
  private placeElement(element: HTMLElement, at: LngLat): void {
    const [southWest, northEast] = this.options.maxBounds;
    const acrossX = clampUnit((at.lng - southWest.lng) / (northEast.lng - southWest.lng));
    const acrossY = clampUnit((northEast.lat - at.lat) / (northEast.lat - southWest.lat));
    element.style.position = 'absolute';
    element.style.left = `${acrossX * 100}%`;
    element.style.top = `${acrossY * 100}%`;
    element.style.transform = 'translate(-50%, -50%)';
  }

  private reportClick(event: MouseEvent): void {
    if (this.isDestroyed) {
      return;
    }
    const surface = event.currentTarget as HTMLElement;
    const box = surface.getBoundingClientRect();
    const [southWest, northEast] = this.options.maxBounds;
    const acrossX = box.width > 0 ? clampUnit((event.clientX - box.left) / box.width) : 0.5;
    const acrossY = box.height > 0 ? clampUnit((event.clientY - box.top) / box.height) : 0.5;
    this.clickHandlers.forEach((handler) =>
      handler({
        lng: southWest.lng + (northEast.lng - southWest.lng) * acrossX,
        // Screen y grows downward; latitude grows upward.
        lat: northEast.lat - (northEast.lat - southWest.lat) * acrossY,
      }),
    );
  }
}

/** The inverse of {@link FakeMapHandle.reportClick}: a position back to a spot on the surface. */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The deterministic {@link MapEngine} for Vitest and the mocked Playwright suite (armed by
 * `window.__RIVIERA_FAKE_MAP__`): no WebGL, no tiles, no network. It stamps the host with a
 * `riviera-map-fake` test id so an e2e can see the map "rendered" and click it, and records every
 * creation.
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
