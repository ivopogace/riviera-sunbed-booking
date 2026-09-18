/**
 * PROTOTYPE — throwaway. Round 4's finding, as the number the layouts are built from: **the
 * result set has an aspect ratio of its own, and it is not a constant.**
 *
 * <p>Round 1 measured the *fence* floor — `h/w ≥ 1.25` or the camera cannot zoom out far enough
 * to frame the whole coast at all — and ranked the layouts by it. That answers "can this pane
 * show the coast", not "how much of this pane does the coast use", and the second question is the
 * one every screenshot in rounds 1–3 was actually complaining about. The answer is below: the
 * 26 venues' own bounding box, in Mercator, is **1 : 4.51** (w : h) north-up. A pane at any other
 * aspect spends the difference on padding — which on this coast is inland Albania.
 *
 * <p>So the fraction of a pane the result set can ever fill is
 * `min(paneAspect, contentAspect) / max(paneAspect, contentAspect)`, and it is brutal:
 *
 * <pre>
 *   pane                          h : w     whole coast fills
 *   shipped 430 × 560             1.30      29 % of the width
 *   A / G  two-pane 634 × 832     1.31      29 % of the width
 *   B / L  full bleed 1440 × 832  0.58      13 % of the width
 *   E      band 1440 × 414        0.29      66 % of the width (at bearing 78°)
 *   K      ribbon 190 × 770       4.05      90 % of the height
 * </pre>
 *
 * <p>And the set's aspect swings by a factor of seven with the filters — 4.51 for the whole
 * coast, 0.60 for Himarë, 2.07 for Sarandë — so **no fixed pane shape is right twice**. That is
 * the finding that outranks where the map goes, and it is what K is built on.
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

/**
 * How much of a `paneW × paneH` box the set can fill, 0…1 — the number the table above is. The
 * unfilled remainder is not a rounding error: on a coast it is the inland the screenshots show.
 */
export function paneFill(aspect: number, paneW: number, paneH: number): number {
  const pane = paneH / paneW;
  return Math.min(pane, aspect) / Math.max(pane, aspect);
}
