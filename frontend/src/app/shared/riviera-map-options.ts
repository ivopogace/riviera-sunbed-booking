import type { MapEngineOptions } from './map-engine';

/**
 * The riviera as the map opens: the coast Vlorë–Ksamil, fenced to the extract (all of Albania, the
 * `BBOX` of `scripts/build-riviera-map.sh`) so a tourist cannot pan off the tiles. Free of Angular
 * so the poster renderer (`frontend/scripts/`) can bundle it. Style path same-origin (ADR-0022).
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
