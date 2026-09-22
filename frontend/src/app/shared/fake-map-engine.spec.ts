import { describe, expect, it, vi } from 'vitest';

import { waterSamplerOf } from '../operator/shore-snap';
import { FakeMapEngine } from './fake-map-engine';
import { LngLat, MapEngineOptions, MapImagery, ScreenPoint } from './map-engine';

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

  it('puts the marker element on its surface and takes it off again', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const surface = host.querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
    const element = document.createElement('button');

    handle.addMarker({ id: 'pin', lngLat: { lng: 20, lat: 39.8 }, element });
    expect(element.parentElement).toBe(surface);
    expect(element.style.position).toBe('absolute');

    handle.removeMarker('pin');
    expect(element.parentElement).toBeNull();
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

  it('turns a click on its surface into the position under it', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const clicks: LngLat[] = [];
    handle.onMapClick((at) => clicks.push(at));

    // jsdom lays nothing out, so the surface's box is 0 × 0 at (0, 0) and its centre is its corner.
    const surface = host.querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
    surface.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));

    expect(clicks).toHaveLength(1);
    expect(clicks[0].lng).toBeCloseTo(OPTIONS.view.center.lng, 9);
    expect(clicks[0].lat).toBeCloseTo(OPTIONS.view.center.lat, 9);
  });

  it('projects a point relative to the camera and re-projects after every move', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const { center } = OPTIONS.view;
    const east = { lng: center.lng + 0.01, lat: center.lat };
    const north = { lng: center.lng, lat: center.lat + 0.01 };

    expect(handle.project(center)).toEqual({ x: 0, y: 0 });
    const eastAt9 = handle.project(east);
    expect(eastAt9.x).toBeGreaterThan(0);
    expect(eastAt9.y).toBeCloseTo(0, 6);
    expect(handle.project(north).y).toBeLessThan(0);

    // Web Mercator: one zoom in doubles every offset from the centre.
    handle.zoomIn();
    expect(handle.project(east).x).toBeCloseTo(eastAt9.x * 2, 6);

    // A moved camera puts its new centre at the box's centre.
    handle.setView({ center: east, zoom: 10 });
    expect(handle.project(east)).toEqual({ x: 0, y: 0 });
  });

  it('holds a click inside the fence, as a real engine holds its camera', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const clicks: LngLat[] = [];
    handle.onMapClick((at) => clicks.push(at));
    handle.setView({ center: OPTIONS.maxBounds[1], zoom: OPTIONS.minZoom });

    // The box is a point in jsdom, so a far offset from it would run past the north-east corner.
    host
      .querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!
      .dispatchEvent(new MouseEvent('click', { clientX: 5000, clientY: -5000, bubbles: true }));

    expect(clicks).toEqual([OPTIONS.maxBounds[1]]);
  });

  it('projects and unprojects as inverses', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const clicks: LngLat[] = [];
    handle.onMapClick((at) => clicks.push(at));
    const there = { lng: 19.92, lat: 39.97 };

    const { x, y } = handle.project(there);
    host
      .querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!
      .dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));

    expect(clicks[0].lng).toBeCloseTo(there.lng, 9);
    expect(clicks[0].lat).toBeCloseTo(there.lat, 9);
  });

  it('reports every camera move until unsubscribed', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const onMove = vi.fn();

    const off = handle.onMove(onMove);
    handle.setView({ center: { lng: 20, lat: 39.8 }, zoom: 12 });
    handle.easeTo({ center: { lng: 20, lat: 39.9 }, zoom: 13 });
    handle.zoomIn();
    handle.zoomOut();
    expect(onMove).toHaveBeenCalledTimes(4);

    off();
    handle.zoomIn();
    expect(onMove).toHaveBeenCalledTimes(4);
  });

  it('eases as a cut: the camera is at the view at once', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);

    handle.easeTo({ center: { lng: 20, lat: 39.9 }, zoom: 13 });

    expect(handle.view()).toEqual({ center: { lng: 20, lat: 39.9 }, zoom: 13 });
  });

  it('re-places its markers when the camera moves, keeping their elements', async () => {
    const host = document.createElement('div');
    const handle = await new FakeMapEngine().create(host, OPTIONS);
    const element = document.createElement('button');
    handle.addMarker({ id: 'pin', lngLat: { lng: 20, lat: 39.8 }, element });
    const before = { left: element.style.left, top: element.style.top };

    handle.setView({ center: { lng: 20, lat: 39.8 }, zoom: 12 });

    expect(element.style.left).not.toBe(before.left);
    expect(element.style.top).not.toBe(before.top);
    expect(element.style.left).toBe('0px');
    expect(element.style.top).toBe('0px');
    expect(handle.markers().get('pin')?.element).toBe(element);
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

/**
 * The fake's imagery: what lets the shoreline snap — a rule over what the map is SHOWING — be
 * driven in jsdom and in the mocked e2e, where there is no WebGL and no tile to draw.
 */
describe('FakeMapEngine imagery', () => {
  /** Water west of this meridian, land east of it: the fixture archive's own straight coast. */
  const COAST_LNG = 19.8;

  function isWaterAt(imagery: MapImagery, point: ScreenPoint): boolean | undefined {
    return waterSamplerOf(imagery)(point);
  }

  it('has no imagery at all until a coast is set, so a map that draws nothing reports nothing', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);

    expect(handle.readImagery()).toBeNull();
  });

  it('paints the style’s water fill west of its coast and land east of it', async () => {
    const handle = await new FakeMapEngine(COAST_LNG).create(
      document.createElement('div'),
      OPTIONS,
    );
    const imagery = handle.readImagery();

    expect(imagery).not.toBeNull();
    expect(isWaterAt(imagery!, handle.project({ lng: COAST_LNG - 0.02, lat: 40.04 }))).toBe(true);
    expect(isWaterAt(imagery!, handle.project({ lng: COAST_LNG + 0.02, lat: 40.04 }))).toBe(false);
  });

  /**
   * Also the one case that shows what "unseen" means: jsdom lays nothing out, so the fake's box
   * runs east and south FROM the camera's centre rather than around it, and a position west of
   * the centre is genuinely off the frame until the camera moves to take it in.
   */
  it('repaints after the camera moves, so the sample follows what the map now shows', async () => {
    const handle = await new FakeMapEngine(COAST_LNG).create(
      document.createElement('div'),
      OPTIONS,
    );
    const atSea = { lng: COAST_LNG - 0.2, lat: 40.04 };

    expect(isWaterAt(handle.readImagery()!, handle.project(atSea))).toBeUndefined();

    handle.setView({ center: { lng: atSea.lng - 0.05, lat: atSea.lat }, zoom: OPTIONS.view.zoom });

    expect(isWaterAt(handle.readImagery()!, handle.project(atSea))).toBe(true);
    expect(
      isWaterAt(handle.readImagery()!, handle.project({ lng: COAST_LNG + 0.02, lat: 40.04 })),
    ).toBe(false);
  });

  it('unprojects a point on its own box back to the position that projects there', async () => {
    const handle = await new FakeMapEngine().create(document.createElement('div'), OPTIONS);
    const there = { lng: 19.92, lat: 39.97 };

    const back = handle.unproject(handle.project(there));

    expect(back.lng).toBeCloseTo(there.lng, 9);
    expect(back.lat).toBeCloseTo(there.lat, 9);
  });
});
