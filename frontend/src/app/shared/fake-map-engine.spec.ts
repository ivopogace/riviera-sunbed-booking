import { describe, expect, it, vi } from 'vitest';

import { FakeMapEngine } from './fake-map-engine';
import { LngLat, MapEngineOptions } from './map-engine';

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

  it('never reports load after destroy, even to a listener registered in the same tick', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const onLoad = vi.fn();

    handle.on('load', onLoad);
    handle.destroy();
    await Promise.resolve();

    expect(onLoad).not.toHaveBeenCalled();
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

  it('records whether a marker is draggable and moves one in place', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const element = document.createElement('button');

    handle.addMarker({ id: 'pin', lngLat: { lng: 20, lat: 39.8 }, element, draggable: true });
    handle.moveMarker('pin', { lng: 19.9, lat: 39.7 });

    expect(handle.markers().get('pin')?.lngLat).toEqual({ lng: 19.9, lat: 39.7 });
    expect(handle.markers().get('pin')?.draggable).toBe(true);
    // A move keeps the element, so a drag gesture and its listeners survive it.
    expect(handle.markers().get('pin')?.element).toBe(element);
  });

  it('reports a drag-end with the marker id and its new position', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const dragged: { id: string; at: LngLat }[] = [];

    const off = handle.onMarkerDragEnd((id, at) => dragged.push({ id, at }));
    handle.addMarker({
      id: 'pin',
      lngLat: { lng: 20, lat: 39.8 },
      element: document.createElement('button'),
      draggable: true,
    });
    handle.dragMarkerTo('pin', { lng: 19.9, lat: 39.7 });

    expect(dragged).toEqual([{ id: 'pin', at: { lng: 19.9, lat: 39.7 } }]);
    expect(handle.markers().get('pin')?.lngLat).toEqual({ lng: 19.9, lat: 39.7 });

    off();
    handle.dragMarkerTo('pin', { lng: 19.8, lat: 39.6 });
    expect(dragged).toHaveLength(1);
  });

  it('turns a click on its surface into a map click inside the bounds', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const clicks: LngLat[] = [];
    handle.onMapClick((at) => clicks.push(at));

    const surface = host.querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
    surface.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));

    expect(clicks).toHaveLength(1);
    const [{ lng, lat }] = clicks;
    expect(lng).toBeGreaterThanOrEqual(OPTIONS.maxBounds[0].lng);
    expect(lng).toBeLessThanOrEqual(OPTIONS.maxBounds[1].lng);
    expect(lat).toBeGreaterThanOrEqual(OPTIONS.maxBounds[0].lat);
    expect(lat).toBeLessThanOrEqual(OPTIONS.maxBounds[1].lat);
  });

  it('stops reporting clicks and drags once destroyed', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const clicks: LngLat[] = [];
    const dragged: string[] = [];
    handle.onMapClick((at) => clicks.push(at));
    handle.onMarkerDragEnd((id) => dragged.push(id));
    handle.addMarker({
      id: 'pin',
      lngLat: { lng: 20, lat: 39.8 },
      element: document.createElement('button'),
      draggable: true,
    });

    handle.destroy();
    const surface = host.querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
    surface.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true }));
    handle.dragMarkerTo('pin', { lng: 19.9, lat: 39.7 });

    expect(clicks).toHaveLength(0);
    expect(dragged).toHaveLength(0);
  });
});
