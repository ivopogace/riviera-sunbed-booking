import { describe, expect, it } from 'vitest';

import { BEACH_CATALOGUE, REGION_CATALOGUE } from '../../shared/beaches';
import { PosterHandle } from '../../shared/poster-handle';
import {
  POSTER_BUCKETS,
  POSTER_HEADER_PX,
  POSTER_SET,
  posterCamera,
  posterFor,
  posterFrames,
  posterKey,
  posterUrl,
} from './map-poster';

/**
 * The poster catalogue: which stills exist, at what camera, and which one a viewport shows. The
 * renderer bundles this module to know what to draw, so a worked example here is the contract
 * between the picture on disk and the pins projected over it.
 */
describe('map poster', () => {
  const himare = REGION_CATALOGUE.find((r) => r.code === 'HIMARE')!;
  const dhermi = BEACH_CATALOGUE.find((b) => b.code === 'DHERMI')!;
  const phone = POSTER_BUCKETS[0];

  it('keys a region by its code and a beach under beach-', () => {
    expect(posterKey('HIMARE', '')).toBe('HIMARE');
    expect(posterKey('HIMARE', 'DHERMI')).toBe('beach-DHERMI');
    expect(posterUrl('beach-DHERMI', phone, 3)).toBe('/posters/beach-DHERMI-440@3x.jpg');
  });

  it('lists one poster per catalogue region and beach at every bucket and density', () => {
    const entries = REGION_CATALOGUE.length + BEACH_CATALOGUE.length;
    expect(POSTER_SET.length).toBe(entries * POSTER_BUCKETS.length * 2);
    const files = new Set(POSTER_SET.map((poster) => poster.file));
    expect(files.size).toBe(POSTER_SET.length);
    expect(files.has('HIMARE-440@2x.jpg')).toBe(true);
    expect(files.has('beach-KSAMIL-834@3x.jpg')).toBe(true);
    for (const poster of POSTER_SET) {
      expect(poster.camera.zoom).toBeGreaterThanOrEqual(7);
      expect(poster.camera.zoom).toBeLessThanOrEqual(14);
    }
  });

  it('fits a region’s beach centres, with their reach, into the pin window of the bucket’s pane', () => {
    // 0.378° × 0.265° with the reach, into 390 × 251 less the pad: the height wins at log2(175 / (512 · ΔmercatorY(0.265°))) ≈ 8.47, then the centre shifts south so the pins land 73 px down the still.
    const camera = posterCamera(himare.code, '', phone)!;
    expect(camera.zoom).toBeCloseTo(8.47, 2);
    expect(camera.center.lng).toBeCloseTo((19.607 + 19.965) / 2, 6);
    expect(camera.center.lat).toBeLessThan((40.175 + 39.93) / 2);
    // Every beach inside the pad, to the pixel the fit's linear latitude shift allows.
    const still = new PosterHandle(camera, phone.fitWidth, phone.height, () => undefined);
    for (const beach of BEACH_CATALOGUE.filter((b) => b.region === 'HIMARE')) {
      const { x, y } = still.project(beach.view.center);
      expect(x).toBeGreaterThanOrEqual(38);
      expect(x).toBeLessThanOrEqual(phone.fitWidth - 38);
      expect(y).toBeGreaterThanOrEqual(POSTER_HEADER_PX + 38 - 1);
      expect(y).toBeLessThanOrEqual(POSTER_HEADER_PX + 251 - 38 + 1);
    }
  });

  it('gives a beach town scale around its centre, and nothing to a code off the catalogue', () => {
    // One centre with a kilometre of reach: 0.02° tall into 175 usable px — log2(175 / (512 · ΔmercatorY(0.02°))) ≈ 12.20.
    const camera = posterCamera('HIMARE', dhermi.code, phone)!;
    expect(camera.zoom).toBeCloseTo(12.2, 2);
    const still = new PosterHandle(camera, phone.fitWidth, phone.height, () => undefined);
    const { x, y } = still.project(dhermi.view.center);
    expect(x).toBeCloseTo(phone.fitWidth / 2, 6);
    expect(y).toBeCloseTo(POSTER_HEADER_PX + 251 / 2, 0);
    expect(posterCamera('ATLANTIS', '', phone)).toBeNull();
    expect(posterCamera('HIMARE', 'ATLANTIS', phone)).toBeNull();
  });

  it('picks the narrowest bucket that covers the viewport, none above the widest or taller than it', () => {
    expect(posterFor('HIMARE', '', { width: 320, height: 640 })?.bucket.width).toBe(440);
    expect(posterFor('HIMARE', '', { width: 440, height: 956 })?.bucket.width).toBe(440);
    expect(posterFor('HIMARE', '', { width: 441, height: 800 })?.bucket.width).toBe(834);
    expect(posterFor('HIMARE', '', { width: 820, height: 1180 })?.bucket.width).toBe(834);
    expect(posterFor('HIMARE', '', { width: 835, height: 800 })).toBeUndefined();
    expect(posterFor('HIMARE', '', { width: 390, height: 961 })).toBeUndefined();
    expect(posterFor('', '', { width: 390, height: 844 })).toBeUndefined();
  });

  it('names the files a viewport loads, by density', () => {
    const poster = posterFor('HIMARE', 'DHERMI', { width: 390, height: 844 })!;
    expect(poster.src).toBe('/posters/beach-DHERMI-440@2x.jpg');
    expect(poster.srcset).toBe(
      '/posters/beach-DHERMI-440@2x.jpg 2x, /posters/beach-DHERMI-440@3x.jpg 3x',
    );
    expect(poster.camera).toEqual(posterCamera('HIMARE', 'DHERMI', phone));
  });

  it('frames a point inside the window between the header and the sheet’s half rest, not one outside', () => {
    const camera = posterCamera('DURRES', '', phone)!;
    const still = new PosterHandle(camera, 390, phone.height, () => undefined);
    const golem = { lng: 19.51, lat: 41.24 };
    const tirana = { lng: 19.82, lat: 41.33 };
    const shkoder = { lng: 19.51, lat: 42.07 };
    // A venue a kilometre off its beach's centre is still on the beach's own poster.
    const aurora = { lng: 19.6401, lat: 40.1573 };
    const dhermiStill = new PosterHandle(
      posterCamera('HIMARE', 'DHERMI', phone)!,
      390,
      phone.height,
      () => undefined,
    );
    expect(posterFrames(dhermiStill, [aurora], 390)).toBe(true);
    expect(posterFrames(still, [golem, tirana], 390)).toBe(true);
    expect(posterFrames(still, [golem, shkoder], 390)).toBe(false);
    expect(posterFrames(still, [], 390)).toBe(true);
  });
});
