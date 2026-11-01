import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

import {
  absoluteMapStyle,
  absoluteMapUrl,
  ensureStylesheet,
  MapLibreHandle,
  mapConstructorOptions,
} from './maplibre-map-engine';
import { RIVIERA_MAP_OPTIONS } from './riviera-map-options';

/**
 * The real adapter's jsdom-testable parts: the style rewrite that keeps every map resource on our
 * origin (ADR-0022) and the one-time stylesheet link. MapLibre itself is WebGL and runs only in the
 * real-engine e2e (`discover-map.e2e.ts`).
 */
const ORIGIN = 'http://localhost:8080';

/** The shape `scripts/build-riviera-map.sh` writes: every URL a same-origin `/map/…` path. */
const SHIPPED: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'pmtiles:///map/riviera.pmtiles' },
  },
  sprite: '/map/sprites/osm-liberty',
  glyphs: '/map/glyphs/{fontstack}/{range}.pbf',
  layers: [],
};

describe('absoluteMapUrl', () => {
  it('puts a style-relative /map/ path on the map origin, keeping the pmtiles scheme in front', () => {
    expect(absoluteMapUrl('/map/style.json', ORIGIN)).toBe(`${ORIGIN}/map/style.json`);
    expect(absoluteMapUrl('pmtiles:///map/riviera.pmtiles', ORIGIN)).toBe(
      `pmtiles://${ORIGIN}/map/riviera.pmtiles`,
    );
  });

  it('touches nothing else — an already-absolute URL passes through', () => {
    expect(absoluteMapUrl(`pmtiles://${ORIGIN}/map/riviera.pmtiles/9/300/200`, ORIGIN)).toBe(
      `pmtiles://${ORIGIN}/map/riviera.pmtiles/9/300/200`,
    );
    expect(absoluteMapUrl('https://example.test/x.png', ORIGIN)).toBe('https://example.test/x.png');
  });
});

describe('absoluteMapStyle', () => {
  it('rewrites the sprite, the glyphs and the vector source of the shipped style', () => {
    const style = absoluteMapStyle(SHIPPED, ORIGIN);

    expect(style.sprite).toBe(`${ORIGIN}/map/sprites/osm-liberty`);
    expect(style.glyphs).toBe(`${ORIGIN}/map/glyphs/{fontstack}/{range}.pbf`);
    expect(style.sources['openmaptiles']).toEqual({
      type: 'vector',
      url: `pmtiles://${ORIGIN}/map/riviera.pmtiles`,
    });
    expect(SHIPPED.sprite).toBe('/map/sprites/osm-liberty');
  });

  it('handles tile templates and a sprite list, and leaves a style without them alone', () => {
    const style = absoluteMapStyle(
      {
        version: 8,
        sources: { raster: { type: 'raster', tiles: ['/map/r/{z}/{x}/{y}.png'] } },
        sprite: [{ id: 'default', url: '/map/sprites/osm-liberty' }],
        layers: [],
      },
      ORIGIN,
    );
    expect(style.sources['raster']).toEqual({
      type: 'raster',
      tiles: [`${ORIGIN}/map/r/{z}/{x}/{y}.png`],
    });
    expect(style.sprite).toEqual([{ id: 'default', url: `${ORIGIN}/map/sprites/osm-liberty` }]);
    expect('glyphs' in style).toBe(false);
  });
});

describe('ensureStylesheet', () => {
  it('appends the link once and resolves when it has loaded', async () => {
    const doc = document.implementation.createHTMLDocument();
    const href = '/vendor/maplibre-gl.css';

    const first = ensureStylesheet(doc, href);
    const link = doc.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    expect(link?.rel).toBe('stylesheet');
    link?.dispatchEvent(new Event('load'));
    await first;

    await ensureStylesheet(doc, href);
    expect(doc.head.querySelectorAll('link').length).toBe(1);
  });

  it('resolves rather than rejects when the stylesheet fails to load', async () => {
    const doc = document.implementation.createHTMLDocument();
    const pending = ensureStylesheet(doc, '/vendor/missing.css');
    doc.head.querySelector('link')?.dispatchEvent(new Event('error'));
    await expect(pending).resolves.toBeUndefined();
  });
});

/**
 * The WebGL drawing buffer is kept only for a map that will be read back — the pin placer's, to
 * find the shore under a dropped pin. Every other map on the site, Discover's included, pays
 * nothing for it.
 */
describe('mapConstructorOptions', () => {
  const OPTIONS = {
    styleUrl: '/map/style.json',
    view: { center: { lng: 19.75, lat: 40.05 }, zoom: 9 },
    minZoom: 7,
    maxZoom: 16,
    maxBounds: [
      { lng: 19, lat: 39.3 },
      { lng: 20.5, lat: 40.8 },
    ] as const,
  };

  it('keeps the drawing buffer only when the map is to be read back', () => {
    const host = document.createElement('div');

    expect(
      mapConstructorOptions(host, OPTIONS).canvasContextAttributes?.preserveDrawingBuffer,
    ).toBe(false);
    expect(
      mapConstructorOptions(host, { ...OPTIONS, readableImagery: true }).canvasContextAttributes
        ?.preserveDrawingBuffer,
    ).toBe(true);
  });

  it('carries the camera and the fence across unchanged', () => {
    const built = mapConstructorOptions(document.createElement('div'), OPTIONS);

    expect(built.center).toEqual([19.75, 40.05]);
    expect(built.zoom).toBe(9);
    expect(built.maxBounds).toEqual([
      [19, 39.3],
      [20.5, 40.8],
    ]);
    expect(built.attributionControl).toBe(false);
  });
});

describe('MapLibreHandle.setFenceInsets', () => {
  type Constrain = (at: LngLatStub, zoom: number) => { center: LngLatStub; zoom: number };

  class LngLatStub {
    constructor(
      readonly lng: number,
      readonly lat: number,
    ) {}
  }

  /** MapLibre's part, as far as the fence goes: re-fencing the camera when handed a new function. */
  function stubMap(center: LngLatStub, zoom: number) {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 390 });
    Object.defineProperty(container, 'clientHeight', { value: 844 });
    const camera = { center, zoom };
    const map = {
      getCenter: () => camera.center,
      getZoom: () => camera.zoom,
      getContainer: () => container,
      setTransformConstrain: vi.fn((constrain: Constrain | null) => {
        if (constrain !== null) {
          Object.assign(camera, constrain(camera.center, camera.zoom));
        }
      }),
      jumpTo: vi.fn(),
    };
    const handle = new MapLibreHandle(
      { LngLat: LngLatStub } as unknown as typeof import('maplibre-gl'),
      map as unknown as import('maplibre-gl').Map,
      RIVIERA_MAP_OPTIONS,
    );
    return { map, handle, camera };
  }

  it('fences the visible strip, reporting the move when the camera had to shift', () => {
    const { map, handle, camera } = stubMap(new LngLatStub(20, 30), 7);

    handle.setFenceInsets({ top: 96, bottom: 418 });

    expect(map.setTransformConstrain).toHaveBeenCalledOnce();
    expect(camera.center).toBeInstanceOf(LngLatStub);
    expect(camera.center.lat).toBeGreaterThan(RIVIERA_MAP_OPTIONS.maxBounds[0].lat);
    expect(map.jumpTo).toHaveBeenCalledExactlyOnceWith({});
  });

  it('leaves a camera the fence does not move alone, and the same insets twice cost nothing', () => {
    const { map, handle } = stubMap(new LngLatStub(19.9, 40.5), 11);

    handle.setFenceInsets({ top: 96, bottom: 418 });
    handle.setFenceInsets({ top: 96, bottom: 418 });

    expect(map.setTransformConstrain).toHaveBeenCalledOnce();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('hands the fence back to the engine when nothing covers the map', () => {
    const { map, handle } = stubMap(new LngLatStub(19.9, 40.5), 11);

    handle.setFenceInsets({ top: 96, bottom: 418 });
    handle.setFenceInsets({ top: 0, bottom: 0 });

    expect(map.setTransformConstrain).toHaveBeenLastCalledWith(null);
  });
});
