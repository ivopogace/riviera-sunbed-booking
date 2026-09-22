import { LngLat } from './map-engine';

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in km. Two features ask it — Discover's distance captions and the pin
 * placer's "how far would this move it" — so it lives here rather than in either of them; the
 * spherical approximation is plenty for both.
 */
export function distanceKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
