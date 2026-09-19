/**
 * PROTOTYPE — throwaway. **The result set has an aspect ratio of its own, and it is not a
 * constant** — the number Q's desktop map pane is sized from.
 *
 * <p>The 26 venues' own bounding box, in Mercator, is **1 : 4.51** (w : h) north-up; Himarë's is
 * 0.60, Sarandë's 2.07. A pane at any other aspect spends the difference on padding — which on
 * this coast is inland Albania — so the desktop gives the map the width its set needs (the pane's
 * height over this aspect) and the list keeps the rest. The phone needs no such rule: its window's
 * height is the thumb's, through the sheet.
 */
import { LngLat } from '../../shared/map-engine';

/** Mercator x for a longitude, as a 0…1 fraction of the world square. */
function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}

/** Mercator y for a latitude, as a 0…1 fraction of the world square. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/**
 * The set's own height ÷ width, in Mercator, at `bearing` (0 = north up). A pane at exactly this
 * aspect is the only one the set fills in both axes. Two pins on one meridian have no width and
 * answer `MAX_ASPECT` rather than infinity; fewer than two pins answer `null` — there is no shape
 * to match, and the caller falls back to its own default rather than to a degenerate pane.
 */
export function contentAspect(at: readonly LngLat[], bearing = 0): number | null {
  if (at.length < 2) return null;
  const rad = (bearing * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const framed = at.map((p) => {
    const mx = mercatorX(p.lng);
    const my = mercatorY(p.lat);
    return { sx: mx * cos + my * sin, sy: -mx * sin + my * cos };
  });
  const width = Math.max(...framed.map((f) => f.sx)) - Math.min(...framed.map((f) => f.sx));
  const height = Math.max(...framed.map((f) => f.sy)) - Math.min(...framed.map((f) => f.sy));
  if (width <= 0) return MAX_ASPECT;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, height / width));
}

/** A set on one meridian would ask for an infinitely thin pane; a ribbon is thin enough. */
const MAX_ASPECT = 6;
/** And one on a parallel would ask for an infinitely deep one. */
const MIN_ASPECT = 0.15;
