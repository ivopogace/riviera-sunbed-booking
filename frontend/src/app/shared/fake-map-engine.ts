import {
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
  private isDestroyed = false;

  constructor(view: MapView) {
    this.current = view;
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
  }

  removeMarker(id: string): void {
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

  destroy(): void {
    this.isDestroyed = true;
    this.listeners.clear();
  }
}

/**
 * The deterministic {@link MapEngine} for Vitest and the mocked Playwright suite (armed by
 * `window.__RIVIERA_FAKE_MAP__`): no WebGL, no tiles, no network. It stamps the host with a
 * `riviera-map-fake` test id so an e2e can see the map "rendered", and records every creation.
 */
export class FakeMapEngine extends MapEngine {
  readonly created: { host: HTMLElement; options: MapEngineOptions }[] = [];

  override create(host: HTMLElement, options: MapEngineOptions): Promise<FakeMapHandle> {
    this.created.push({ host, options });
    const surface = host.ownerDocument.createElement('div');
    surface.dataset['testid'] = 'riviera-map-fake';
    surface.className = 'absolute inset-0';
    host.appendChild(surface);
    return Promise.resolve(new FakeMapHandle(options.view));
  }
}
