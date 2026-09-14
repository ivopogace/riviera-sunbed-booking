import { describe, expect, it, vi } from 'vitest';

import { FakeMapEngine } from './fake-map-engine';
import { MapEngineOptions } from './map-engine';

const OPTIONS: MapEngineOptions = {
  styleUrl: '/map/style.json',
  view: { center: { lng: 19.75, lat: 40.05 }, zoom: 9 },
  minZoom: 7,
  maxZoom: 16,
  maxBounds: [
    { lng: 19, lat: 39.3 },
    { lng: 20.5, lat: 40.8 },
  ],
};

describe('FakeMapEngine', () => {
  it('records the host and options it was created on and marks the host for the e2e', async () => {
    const engine = new FakeMapEngine();
    const host = document.createElement('div');

    const handle = await engine.create(host, OPTIONS);

    expect(engine.created).toEqual([{ host, options: OPTIONS }]);
    expect(host.querySelector('[data-testid="riviera-map-fake"]')).not.toBeNull();
    expect(handle.view()).toEqual(OPTIONS.view);
  });

  it('applies zoom and view changes to its recorded view', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);

    handle.zoomIn();
    handle.zoomIn();
    handle.zoomOut();
    expect(handle.view().zoom).toBe(10);

    handle.setView({ center: { lng: 20, lat: 39.8 }, zoom: 12 });
    expect(handle.view()).toEqual({ center: { lng: 20, lat: 39.8 }, zoom: 12 });
  });

  it('keeps markers by id', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const element = document.createElement('button');

    handle.addMarker({ id: 'venue-1', lngLat: { lng: 20, lat: 39.8 }, element });
    expect([...handle.markers().keys()]).toEqual(['venue-1']);

    handle.removeMarker('venue-1');
    expect(handle.markers().size).toBe(0);
  });

  it('reports load to a listener and lets it unsubscribe', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const onLoad = vi.fn();

    const off = handle.on('load', onLoad);
    await Promise.resolve();
    expect(onLoad).toHaveBeenCalledTimes(1);

    off();
    expect(handle.destroyed()).toBe(false);
    handle.destroy();
    expect(handle.destroyed()).toBe(true);
  });
});
