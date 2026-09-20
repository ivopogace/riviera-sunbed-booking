import { describe, expect, it } from 'vitest';

import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { fitInWindow, fitPins } from './camera-fit';

/**
 * The camera is derived from the pane and the result set (README @ 2cf675da, § What Q rests on):
 * Web Mercator on both axes over 512 px tiles, capped at 14 so the sea stays in frame, never
 * below the zoom at which the viewport would be wider than the ADR-0022 fence.
 */
describe('camera fit', () => {
  const dhermi = { lng: 19.645, lat: 40.145 };
  const himare = { lng: 19.744, lat: 40.1 };
  const borsh = { lng: 19.86, lat: 40.06 };

  it('fits nothing to nothing', () => {
    expect(fitPins([], 390, 251)).toBeNull();
    expect(fitPins([dhermi], 60, 251)).toBeNull();
  });

  it('gives a lone pin town scale rather than an infinite zoom', () => {
    expect(fitPins([dhermi], 390, 251)).toEqual({ center: dhermi, zoom: 12.5 });
  });

  it('takes the tighter of the two axes for a span wider than tall, centred on the span', () => {
    const view = fitPins([dhermi, borsh], 390, 251)!;
    // 0.215° of longitude across 314 usable px: log2(360 · 314 / (512 · 0.215)) ≈ 10.0.
    expect(view.zoom).toBeCloseTo(10.0, 1);
    expect(view.center.lng).toBeCloseTo((19.645 + 19.86) / 2, 6);
    expect(view.center.lat).toBeCloseTo((40.145 + 40.06) / 2, 6);
  });

  it('caps three venues 20 m apart at 14, where the bay is still in frame', () => {
    const view = fitPins([himare, { lng: 19.7442, lat: 40.1001 }], 390, 251)!;
    expect(view.zoom).toBe(14);
  });

  it('never asks for a viewport wider than the fence, which the engine would undo', () => {
    // The whole coast in a 1,920 px pane wants ~9.6; the 2.2° fence at 1,920 px floors it at ~9.7.
    const [sw, ne] = RIVIERA_MAP_OPTIONS.maxBounds;
    const view = fitPins(
      [
        { lng: 19.411, lat: 41.848 },
        { lng: 20.0, lat: 39.77 },
      ],
      1920,
      400,
    )!;
    const fenceFloor = Math.log2((360 * 1920) / (512 * (ne.lng - sw.lng)));
    expect(view.zoom).toBeGreaterThanOrEqual(fenceFloor);
    expect(view.zoom).toBeGreaterThanOrEqual(RIVIERA_MAP_OPTIONS.minZoom);
  });

  it('fits into the window between the header and the foot, and looks south by the window’s offset', () => {
    // A 390 × 844 pane; the window is 73 → 324 (the sheet at 380 less the 56 px foot row).
    const view = fitInWindow([dhermi, borsh], { width: 390, height: 844 }, 73, 324)!;
    const flat = fitPins([dhermi, borsh], 390, 251)!;
    expect(view.zoom).toBe(flat.zoom);
    expect(view.center.lng).toBe(flat.center.lng);
    // The window's middle (198.5) sits 223.5 px above the pane's (422), so the camera looks that far south.
    const perPixel = (360 / (512 * 2 ** flat.zoom)) * Math.cos((flat.center.lat * Math.PI) / 180);
    expect(view.center.lat).toBeCloseTo(flat.center.lat - 223.5 * perPixel, 6);
  });
});
