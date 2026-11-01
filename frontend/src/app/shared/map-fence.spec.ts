import { describe, expect, it } from 'vitest';

import { fencedCamera, NO_FENCE_INSETS } from './map-fence';
import { RIVIERA_MAP_OPTIONS } from './riviera-map-options';
import { projectAround } from './web-mercator';

const [SOUTH_WEST, NORTH_EAST] = RIVIERA_MAP_OPTIONS.maxBounds;
const PHONE = { width: 390, height: 844 };
const SHEET = { top: 96, bottom: 420 };

function screenY(view: ReturnType<typeof fencedCamera>, lat: number): number {
  const origin = { x: PHONE.width / 2, y: PHONE.height / 2 };
  return projectAround(view, origin, { lng: view.center.lng, lat }).y;
}

describe('fencedCamera', () => {
  it('leaves a camera well inside the fence where it is', () => {
    const view = { center: { lng: 19.9, lat: 40.5 }, zoom: 11 };

    const fenced = fencedCamera(view, PHONE.width, PHONE.height, SHEET, RIVIERA_MAP_OPTIONS);

    expect(fenced).toEqual(view);
  });

  it('with no chrome, stops the box’s own foot at the fence’s south edge, as the engine does', () => {
    const farSouth = { center: { lng: 20, lat: 36 }, zoom: 8 };

    const fenced = fencedCamera(
      farSouth,
      PHONE.width,
      PHONE.height,
      NO_FENCE_INSETS,
      RIVIERA_MAP_OPTIONS,
    );

    expect(screenY(fenced, SOUTH_WEST.lat)).toBeCloseTo(PHONE.height, 6);
  });

  it('lets the south edge rise to the sheet’s top, so the coast’s south end can be pulled clear of it', () => {
    const farSouth = { center: { lng: 20, lat: 36 }, zoom: 8 };

    const fenced = fencedCamera(farSouth, PHONE.width, PHONE.height, SHEET, RIVIERA_MAP_OPTIONS);

    expect(screenY(fenced, SOUTH_WEST.lat)).toBeCloseTo(PHONE.height - SHEET.bottom, 6);
  });

  it('lets the north edge drop to the header’s foot', () => {
    const farNorth = { center: { lng: 20, lat: 46 }, zoom: 8 };

    const fenced = fencedCamera(farNorth, PHONE.width, PHONE.height, SHEET, RIVIERA_MAP_OPTIONS);

    expect(screenY(fenced, NORTH_EAST.lat)).toBeCloseTo(SHEET.top, 6);
  });

  it('holds the zoom to the fence’s range', () => {
    const at = { lng: 20, lat: 40.5 };

    expect(
      fencedCamera({ center: at, zoom: 20 }, 390, 300, NO_FENCE_INSETS, RIVIERA_MAP_OPTIONS).zoom,
    ).toBe(RIVIERA_MAP_OPTIONS.maxZoom);
    expect(
      fencedCamera({ center: at, zoom: 2 }, 100, 100, NO_FENCE_INSETS, RIVIERA_MAP_OPTIONS).zoom,
    ).toBe(RIVIERA_MAP_OPTIONS.minZoom);
  });

  it('zooms in only as far as the VISIBLE strip needs to fit inside the bounds', () => {
    const wide = { center: { lng: 20, lat: 41 }, zoom: RIVIERA_MAP_OPTIONS.minZoom };

    const bare = fencedCamera(
      wide,
      PHONE.width,
      PHONE.height,
      NO_FENCE_INSETS,
      RIVIERA_MAP_OPTIONS,
    );
    const sheeted = fencedCamera(wide, PHONE.width, PHONE.height, SHEET, RIVIERA_MAP_OPTIONS);

    expect(bare.zoom).toBeGreaterThan(RIVIERA_MAP_OPTIONS.minZoom);
    expect(screenY(bare, NORTH_EAST.lat)).toBeCloseTo(0, 6);
    expect(screenY(bare, SOUTH_WEST.lat)).toBeCloseTo(PHONE.height, 6);
    expect(sheeted.zoom).toBe(RIVIERA_MAP_OPTIONS.minZoom);
  });
});
