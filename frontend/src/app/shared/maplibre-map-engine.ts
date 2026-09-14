import { environment } from '../../environments/environment';
import {
  MapEngine,
  MapEngineOptions,
  MapEventName,
  MapHandle,
  MapMarker,
  MapView,
} from './map-engine';

/** MapLibre's own stylesheet, copied into the build by `angular.json` (`assets`) — never a CDN. */
export const MAPLIBRE_STYLESHEET = '/vendor/maplibre-gl.css';

const MAP_PREFIX = '/map/';
const PMTILES_SCHEME = 'pmtiles://';

/**
 * The request transform that keeps every map resource on our origin (ADR-0022). The shipped
 * style names only `/map/…` paths; in production the SPA and the API share an origin so they
 * resolve as they are, while in development and the mocked e2e the API lives elsewhere
 * (`environment.apiBaseUrl`), so the transform prefixes them. Any other URL is left untouched —
 * including the archive-derived tile URLs, which are already absolute by then.
 */
export function sameOriginMapRequest(
  apiBaseUrl: string,
): (url: string) => { url: string } | undefined {
  return (url) => {
    if (url.startsWith(MAP_PREFIX)) {
      return { url: apiBaseUrl + url };
    }
    if (url.startsWith(PMTILES_SCHEME + MAP_PREFIX)) {
      return { url: PMTILES_SCHEME + apiBaseUrl + url.slice(PMTILES_SCHEME.length) };
    }
    return undefined;
  };
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

/** The pmtiles protocol is process-wide and caches archive headers, so it is registered once. */
let protocolReady: Promise<void> | undefined;

async function registerPmtiles(maplibre: MapLibre): Promise<void> {
  protocolReady ??= import('pmtiles').then(({ Protocol }) => {
    maplibre.addProtocol('pmtiles', new Protocol().tile);
  });
  await protocolReady;
}

class MapLibreHandle implements MapHandle {
  private readonly markers = new Map<string, import('maplibre-gl').Marker>();

  constructor(
    private readonly maplibre: MapLibre,
    private readonly map: import('maplibre-gl').Map,
  ) {}

  setView(view: MapView): void {
    this.map.jumpTo({ center: [view.center.lng, view.center.lat], zoom: view.zoom });
  }

  zoomIn(): void {
    this.map.zoomIn();
  }

  zoomOut(): void {
    this.map.zoomOut();
  }

  addMarker(marker: MapMarker): void {
    this.removeMarker(marker.id);
    const pin = new this.maplibre.Marker({ element: marker.element })
      .setLngLat([marker.lngLat.lng, marker.lngLat.lat])
      .addTo(this.map);
    this.markers.set(marker.id, pin);
  }

  removeMarker(id: string): void {
    this.markers.get(id)?.remove();
    this.markers.delete(id);
  }

  on(event: MapEventName, handler: () => void): () => void {
    const subscription = this.map.on(event, () => handler());
    return () => subscription.unsubscribe();
  }

  destroy(): void {
    this.markers.forEach((pin) => pin.remove());
    this.markers.clear();
    this.map.remove();
  }
}

/**
 * Real adapter: MapLibre GL (BSD, no telemetry, no token) with the PMTiles protocol, both loaded
 * on first use so neither enters the initial bundle. Attribution is the component's own — the
 * library's control is off — and every request passes {@link sameOriginMapRequest}.
 */
export class MapLibreMapEngine extends MapEngine {
  override async create(host: HTMLElement, options: MapEngineOptions): Promise<MapHandle> {
    const [maplibre] = await Promise.all([
      import('maplibre-gl'),
      ensureStylesheet(host.ownerDocument, MAPLIBRE_STYLESHEET),
    ]);
    await registerPmtiles(maplibre);
    const [southWest, northEast] = options.maxBounds;
    const map = new maplibre.Map({
      container: host,
      style: options.styleUrl,
      center: [options.view.center.lng, options.view.center.lat],
      zoom: options.view.zoom,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      maxBounds: [
        [southWest.lng, southWest.lat],
        [northEast.lng, northEast.lat],
      ],
      attributionControl: false,
      transformRequest: sameOriginMapRequest(environment.apiBaseUrl),
    });
    return new MapLibreHandle(maplibre, map);
  }
}
