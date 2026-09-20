import { describe, expect, it, vi } from 'vitest';

import { BEACH_CATALOGUE } from './beaches';
import { FakeMapHandle } from './fake-map-engine';
import { LngLat, MapView } from './map-engine';
import { PosterHandle } from './poster-handle';
import { RIVIERA_MAP_OPTIONS } from './riviera-map-options';

/**
 * The still-image map handle the pin layer projects through while the ground is a poster. Its
 * geometry is proven against the fake engine's — the same Web Mercator the real adapter draws —
 * so a pin lands on the poster where the live map will put it once it takes over at the view the
 * handle hands it.
 */
describe('PosterHandle', () => {
  /** Himarë's poster camera as the catalogue fits it, framed for a 390 px pane and a 960 px still. */
  const camera: MapView = { center: { lng: 19.786, lat: 39.804 }, zoom: 8.59 };
  const PANE = { width: 390, height: 844 };
  const POSTER_H = 960;
  const TIRANA: LngLat = { lng: 19.82, lat: 41.33 };

  /** A fake engine surface with a real box, since jsdom lays nothing out. */
  function liveOver(pane: { width: number; height: number }, view: MapView): FakeMapHandle {
    const surface = document.createElement('div');
    surface.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, width: pane.width, height: pane.height }) as DOMRect;
    return new FakeMapHandle({ ...RIVIERA_MAP_OPTIONS, view }, surface);
  }

  it('projects where the fake engine projects for the live view it hands over', () => {
    const still = new PosterHandle(camera, PANE.width, POSTER_H, vi.fn());
    const live = liveOver(PANE, still.liveView(PANE));

    for (const at of [
      ...BEACH_CATALOGUE.filter((b) => b.region === 'HIMARE').map((b) => b.view.center),
      TIRANA,
    ]) {
      expect(live.project(at).x).toBeCloseTo(still.project(at).x, 6);
      expect(live.project(at).y).toBeCloseTo(still.project(at).y, 6);
    }
  });

  it('centres the camera on the pane’s width and the poster’s own height', () => {
    const still = new PosterHandle(camera, PANE.width, POSTER_H, vi.fn());

    expect(still.project(camera.center)).toEqual({ x: PANE.width / 2, y: POSTER_H / 2 });
    expect(still.view()).toEqual(camera);
    // The live view is the geography at the pane's centre, so a shorter pane looks further north.
    expect(still.liveView(PANE).zoom).toBe(camera.zoom);
    expect(still.liveView(PANE).center.lat).toBeGreaterThan(camera.center.lat);
    const whole = still.liveView({ width: PANE.width, height: POSTER_H }).center;
    expect(whole.lng).toBeCloseTo(camera.center.lng, 9);
    expect(whole.lat).toBeCloseTo(camera.center.lat, 9);
  });

  it('reports a move it cannot make — an ease, a zoom, a set view — as the view wanted', () => {
    const wanted = vi.fn<(view: MapView) => void>();
    const still = new PosterHandle(camera, PANE.width, POSTER_H, wanted);
    const crowd: MapView = { center: { lng: 19.645, lat: 40.145 }, zoom: 13 };

    still.easeTo(crowd);
    still.zoomIn();
    still.zoomOut();
    still.setView(crowd);

    expect(wanted.mock.calls.map(([view]) => view)).toEqual([
      crowd,
      { ...camera, zoom: camera.zoom + 1 },
      { ...camera, zoom: camera.zoom - 1 },
      crowd,
    ]);
    expect(still.view()).toEqual(camera);
  });

  it('re-projects on a pane resize and tells its movers', () => {
    const still = new PosterHandle(camera, PANE.width, POSTER_H, vi.fn());
    const moved = vi.fn();
    const off = still.onMove(moved);

    still.resize(430);

    expect(moved).toHaveBeenCalledTimes(1);
    expect(still.project(camera.center).x).toBe(215);
    off();
    still.resize(390);
    expect(moved).toHaveBeenCalledTimes(1);
  });

  it('is loaded as soon as anyone asks, and holds markers without drawing them', async () => {
    const still = new PosterHandle(camera, PANE.width, POSTER_H, vi.fn());
    const loaded = vi.fn();
    still.on('load', loaded);
    expect(loaded).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(loaded).toHaveBeenCalledTimes(1);

    const element = document.createElement('div');
    still.addMarker({ id: 'you', lngLat: TIRANA, element });
    expect(still.markers().get('you')?.lngLat).toEqual(TIRANA);
    expect(element.isConnected).toBe(false);
    still.moveMarker('you', camera.center);
    expect(still.markers().get('you')?.lngLat).toEqual(camera.center);
    still.removeMarker('you');
    expect(still.markers().size).toBe(0);
  });

  it('subscribes clicks and drags as the seam asks, fires neither, and lets go on destroy', () => {
    const still = new PosterHandle(camera, PANE.width, POSTER_H, vi.fn());
    const clicked = vi.fn();
    const dragged = vi.fn();
    const moved = vi.fn();
    still.onMapClick(clicked);
    still.onMarkerDragEnd(dragged);
    still.onMove(moved);

    still.destroy();
    still.resize(430);

    expect(clicked).not.toHaveBeenCalled();
    expect(dragged).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled();
  });
});
