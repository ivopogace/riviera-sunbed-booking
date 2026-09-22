import type { StyleSpecification } from 'maplibre-gl';

import { environment } from '../../environments/environment';
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

/** MapLibre's own stylesheet, copied into the build by `angular.json` (`assets`) — never a CDN. */
export const MAPLIBRE_STYLESHEET = '/vendor/maplibre-gl.css';
/**
 * MapLibre's worker, a module script it would otherwise resolve beside its own chunk via
 * `import.meta.url` — a URL the bundle cannot serve. Copied next to the stylesheet (with the shared
 * chunk it imports) and named explicitly, same-origin like every other map resource.
 */
export const MAPLIBRE_WORKER = '/vendor/maplibre-gl-worker.mjs';

const MAP_PREFIX = '/map/';
const PMTILES_SCHEME = 'pmtiles://';

/**
 * Make one of the shipped style's same-origin paths absolute on the map origin (ADR-0022): the
 * API origin where the SPA is served elsewhere (development, the mocked e2e), the page's own in
 * production. `/map/…` and `pmtiles:///map/…` are rewritten; anything else passes through — the
 * committed style never names a host, and MapLibre validates a style's sprite URL as absolute
 * before any request hook runs, so the rewrite happens on the loaded style itself.
 */
export function absoluteMapUrl(url: string, origin: string): string {
  if (url.startsWith(MAP_PREFIX)) {
    return origin + url;
  }
  if (url.startsWith(PMTILES_SCHEME + MAP_PREFIX)) {
    return PMTILES_SCHEME + origin + url.slice(PMTILES_SCHEME.length);
  }
  return url;
}

/** {@link absoluteMapUrl} over every place a style names a resource: sprite, glyphs, source URLs and tile templates. */
export function absoluteMapStyle(style: StyleSpecification, origin: string): StyleSpecification {
  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => {
      if ('url' in source && typeof source.url === 'string') {
        return [id, { ...source, url: absoluteMapUrl(source.url, origin) }];
      }
      if ('tiles' in source && Array.isArray(source.tiles)) {
        return [id, { ...source, tiles: source.tiles.map((tile) => absoluteMapUrl(tile, origin)) }];
      }
      return [id, source];
    }),
  );
  const sprite =
    typeof style.sprite === 'string'
      ? absoluteMapUrl(style.sprite, origin)
      : style.sprite?.map((entry) => ({ ...entry, url: absoluteMapUrl(entry.url, origin) }));
  return {
    ...style,
    sources,
    ...(sprite === undefined ? {} : { sprite }),
    ...(style.glyphs === undefined ? {} : { glyphs: absoluteMapUrl(style.glyphs, origin) }),
  };
}

/** The origin the map's resources live on: the API's where the SPA is served elsewhere, else the page's. */
function mapOrigin(doc: Document): string {
  return environment.apiBaseUrl || doc.location.origin;
}

/**
 * Link the engine's stylesheet once per document, resolving when it has loaded — or failed,
 * because a map without its cursor rules still beats no map at all.
 */
export function ensureStylesheet(doc: Document, href: string): Promise<void> {
  const existing = doc.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    doc.head.appendChild(link);
  });
}

type MapLibre = typeof import('maplibre-gl');

/** Long enough to read as travel across the coast, short enough that a second press never waits on it. */
const EASE_MS = 700;

/** The worker URL and the pmtiles protocol are process-wide (the protocol caches archive headers), so both are set once. */
let protocolReady: Promise<void> | undefined;

async function registerPmtiles(maplibre: MapLibre): Promise<void> {
  protocolReady ??= import('pmtiles').then(({ Protocol }) => {
    maplibre.setWorkerUrl(MAPLIBRE_WORKER);
    maplibre.addProtocol('pmtiles', new Protocol().tile);
  });
  await protocolReady;
}

class MapLibreHandle implements MapHandle {
  private readonly markers = new Map<string, import('maplibre-gl').Marker>();
  private readonly dragEndHandlers = new Set<(id: string, at: LngLat) => void>();

  constructor(
    private readonly maplibre: MapLibre,
    private readonly map: import('maplibre-gl').Map,
    private readonly readable = false,
  ) {}

  view(): MapView {
    const { lng, lat } = this.map.getCenter();
    return { center: { lng, lat }, zoom: this.map.getZoom() };
  }

  setView(view: MapView): void {
    this.map.jumpTo({ center: [view.center.lng, view.center.lat], zoom: view.zoom });
  }

  /** MapLibre itself drops the duration to zero under `prefers-reduced-motion`. */
  easeTo(view: MapView): void {
    this.map.easeTo({
      center: [view.center.lng, view.center.lat],
      zoom: view.zoom,
      duration: EASE_MS,
    });
  }

  zoomIn(): void {
    this.map.zoomIn();
  }

  zoomOut(): void {
    this.map.zoomOut();
  }

  addMarker(marker: MapMarker): void {
    this.removeMarker(marker.id);
    const pin = new this.maplibre.Marker({
      element: marker.element,
      draggable: marker.draggable ?? false,
    })
      .setLngLat([marker.lngLat.lng, marker.lngLat.lat])
      .addTo(this.map);
    if (marker.draggable) {
      pin.on('dragend', () => {
        const { lng, lat } = pin.getLngLat();
        this.dragEndHandlers.forEach((handler) => handler(marker.id, { lng, lat }));
      });
    }
    this.markers.set(marker.id, pin);
  }

  moveMarker(id: string, lngLat: LngLat): void {
    this.markers.get(id)?.setLngLat([lngLat.lng, lngLat.lat]);
  }

  removeMarker(id: string): void {
    this.markers.get(id)?.remove();
    this.markers.delete(id);
  }

  project(at: LngLat): ScreenPoint {
    const { x, y } = this.map.project([at.lng, at.lat]);
    return { x, y };
  }

  unproject(point: ScreenPoint): LngLat {
    const { lng, lat } = this.map.unproject([point.x, point.y]);
    return { lng, lat };
  }

  /**
   * The rendered imagery, read back through a 2D scratch canvas rather than `gl.readPixels`:
   * `drawImage` hands back rows the right way up with alpha already un-premultiplied, which is
   * what a sampler wants, and the WebGL flip and premultiplication are not this file's business.
   *
   * <p>`null` rather than a blank raster whenever the read cannot be trusted: a map built without
   * {@link MapEngineOptions.readableImagery} has had its drawing buffer cleared by the compositor,
   * and a map with no box yet has nothing to read.
   */
  readImagery(): MapImagery | null {
    const canvas = this.map.getCanvas();
    const width = Math.round(canvas.clientWidth);
    const height = Math.round(canvas.clientHeight);
    if (width <= 0 || height <= 0 || !this.readable) {
      return null;
    }
    const scratch = canvas.ownerDocument.createElement('canvas');
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const context = scratch.getContext('2d');
    if (context === null) {
      return null;
    }
    context.drawImage(canvas, 0, 0);
    const scale = canvas.width / width;
    return {
      width,
      height,
      scale,
      pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  }

  onMove(handler: () => void): () => void {
    const subscription = this.map.on('move', () => handler());
    return () => subscription.unsubscribe();
  }

  on(event: MapEventName, handler: () => void): () => void {
    const subscription = this.map.on(event, () => handler());
    return () => subscription.unsubscribe();
  }

  onMapClick(handler: (at: LngLat) => void): () => void {
    const subscription = this.map.on('click', (event) => {
      const { lng, lat } = event.lngLat;
      handler({ lng, lat });
    });
    return () => subscription.unsubscribe();
  }

  onMarkerDragEnd(handler: (id: string, at: LngLat) => void): () => void {
    this.dragEndHandlers.add(handler);
    return () => this.dragEndHandlers.delete(handler);
  }

  destroy(): void {
    this.markers.forEach((pin) => pin.remove());
    this.markers.clear();
    this.dragEndHandlers.clear();
    this.map.remove();
  }
}

/**
 * The constructor object MapLibre is built with, as a value so the one thing a jsdom spec can
 * judge about a WebGL renderer — which options it is asked for — is judgeable: above all
 * `canvasContextAttributes.preserveDrawingBuffer`, set for the pin placer's map alone. Keeping it
 * costs memory and a compositing step on every frame of every map that has it, and only a map
 * that reads its own pixels back needs it.
 */
export function mapConstructorOptions(
  host: HTMLElement,
  options: MapEngineOptions,
): import('maplibre-gl').MapOptions {
  const [southWest, northEast] = options.maxBounds;
  return {
    container: host,
    center: [options.view.center.lng, options.view.center.lat],
    zoom: options.view.zoom,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom,
    maxBounds: [
      [southWest.lng, southWest.lat],
      [northEast.lng, northEast.lat],
    ],
    attributionControl: false,
    interactive: options.interactive ?? true,
    canvasContextAttributes: { preserveDrawingBuffer: options.readableImagery === true },
  };
}

/**
 * Real adapter: MapLibre GL (BSD, no telemetry, no token) with the PMTiles protocol, both loaded
 * on first use so neither enters the initial bundle. Attribution is the component's own — the
 * library's control is off — and every URL the style names is made absolute on the map origin
 * through {@link absoluteMapStyle}.
 */
export class MapLibreMapEngine extends MapEngine {
  override async create(host: HTMLElement, options: MapEngineOptions): Promise<MapHandle> {
    const [maplibre] = await Promise.all([
      import('maplibre-gl'),
      ensureStylesheet(host.ownerDocument, MAPLIBRE_STYLESHEET),
    ]);
    await registerPmtiles(maplibre);
    const origin = mapOrigin(host.ownerDocument);
    const map = new maplibre.Map(mapConstructorOptions(host, options));
    // The style hook is a setStyle option, not a constructor one — so the style is set here.
    map.setStyle(absoluteMapUrl(options.styleUrl, origin), {
      transformStyle: (_previous, next) => absoluteMapStyle(next, origin),
    });
    return new MapLibreHandle(maplibre, map, options.readableImagery === true);
  }
}
