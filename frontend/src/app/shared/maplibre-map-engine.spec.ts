import { describe, expect, it } from 'vitest';

import { ensureStylesheet, sameOriginMapRequest } from './maplibre-map-engine';

/**
 * The real adapter's two jsdom-testable parts: the request transform that keeps every map
 * resource on our origin (ADR-0022) and the one-time stylesheet link. MapLibre itself is WebGL and
 * runs only in the real-engine e2e (`discover-map.e2e.ts`).
 */
describe('sameOriginMapRequest', () => {
  it('leaves style-relative /map/ paths alone when the API is same-origin (production)', () => {
    const transform = sameOriginMapRequest('');
    expect(transform('/map/style.json')).toEqual({ url: '/map/style.json' });
    expect(transform('pmtiles:///map/riviera.pmtiles')).toEqual({
      url: 'pmtiles:///map/riviera.pmtiles',
    });
  });

  it('prefixes /map/ paths with the API origin when the SPA is served elsewhere (dev, e2e)', () => {
    const transform = sameOriginMapRequest('http://localhost:8080');
    expect(transform('/map/glyphs/Roboto%20Regular/0-255.pbf')).toEqual({
      url: 'http://localhost:8080/map/glyphs/Roboto%20Regular/0-255.pbf',
    });
    expect(transform('pmtiles:///map/riviera.pmtiles')).toEqual({
      url: 'pmtiles://http://localhost:8080/map/riviera.pmtiles',
    });
  });

  it('touches nothing else — an already-absolute tile URL passes through', () => {
    const transform = sameOriginMapRequest('http://localhost:8080');
    expect(transform('pmtiles://http://localhost:8080/map/riviera.pmtiles/9/300/200')).toBe(
      undefined,
    );
    expect(transform('http://localhost:8080/map/sprites/osm-liberty.json')).toBe(undefined);
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
