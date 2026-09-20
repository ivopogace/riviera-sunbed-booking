import type { MapEngineOptions } from './map-engine';

/**
 * The riviera as the map opens: centred on the coast between Vlorë and Ksamil, at a zoom that
 * shows the whole stretch, and fenced to the extract — all of Albania, the same box as `BBOX` in
 * `scripts/build-riviera-map.sh` — so a tourist cannot pan off the tiles into blank sea. The style
 * is a same-origin path (ADR-0022); the real adapter prefixes it with the API origin where the SPA
 * is served elsewhere.
 *
 * <p>Its own module, free of Angular, so the poster renderer (`frontend/scripts/`) can bundle the
 * camera code that reads it.
 */
export const RIVIERA_MAP_OPTIONS: MapEngineOptions = {
  styleUrl: '/map/style.json',
  view: { center: { lng: 19.75, lat: 40.05 }, zoom: 8.6 },
  minZoom: 7,
  maxZoom: 16,
  maxBounds: [
    { lng: 19.0, lat: 39.5 },
    { lng: 21.2, lat: 42.8 },
  ],
};
