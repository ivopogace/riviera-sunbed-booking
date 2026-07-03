/**
 * The fixed platform amenity catalogue (T7, issue #140) — the frontend mirror of the backend
 * `ai.riviera.platform.venue.vocabulary.Amenity` enum, exactly as `booking-status.ts` mirrors the
 * backend `BookingStatus`. **Codes travel the wire; labels are display-only.** Declaration order is
 * the canonical display/priority order: the Discover card renders the first few amenities in this
 * order, the beach-map header renders all of them in this order. A pure, presentational vocabulary
 * shared across features, so `shared/` still imports nothing app-internal (the FE boundary rule).
 */
export type Amenity =
  | 'BEACH_BAR'
  | 'RESTAURANT'
  | 'CAFE'
  | 'FREE_PARKING'
  | 'SHOWERS'
  | 'WIFI'
  | 'WATER_SPORTS'
  | 'PET_FRIENDLY'
  | 'SNACK_SHACK'
  | 'SNORKELLING'
  | 'QUIET_BAY';

/** The catalogue in canonical display/priority order (mirrors the backend enum's ordinal order). */
export const AMENITY_CATALOGUE: readonly Amenity[] = [
  'BEACH_BAR',
  'RESTAURANT',
  'CAFE',
  'FREE_PARKING',
  'SHOWERS',
  'WIFI',
  'WATER_SPORTS',
  'PET_FRIENDLY',
  'SNACK_SHACK',
  'SNORKELLING',
  'QUIET_BAY',
];

/** Human-readable display label per amenity code (the design chip text). */
export const AMENITY_LABELS: Record<Amenity, string> = {
  BEACH_BAR: 'Beach bar',
  RESTAURANT: 'Restaurant',
  CAFE: 'Cafe',
  FREE_PARKING: 'Free parking',
  SHOWERS: 'Showers',
  WIFI: 'WiFi',
  WATER_SPORTS: 'Water sports',
  PET_FRIENDLY: 'Pet friendly',
  SNACK_SHACK: 'Snack shack',
  SNORKELLING: 'Snorkelling',
  QUIET_BAY: 'Quiet bay',
};

/** Humanize an unknown code ("SUNSET_VIEW" → "Sunset view") — the graceful fallback for FE/BE skew. */
function humanizeAmenity(code: string): string {
  const words = code.replaceAll('_', ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The display label for an amenity code; humanizes an unknown code rather than throwing. */
export function amenityLabel(code: string): string {
  // Object.hasOwn (not a bracket-`!== undefined` check) so a code that collides with an inherited
  // Object.prototype member ('valueOf', 'toString', …) is treated as unknown, not as a "label".
  return Object.hasOwn(AMENITY_LABELS, code) ? AMENITY_LABELS[code as Amenity] : humanizeAmenity(code);
}

/**
 * Filter a venue's amenity codes to the known catalogue and sort them into canonical display order,
 * dropping duplicates and unknowns. The backend already sends them ordered, but the FE re-orders
 * defensively so a stale/unknown code can never reorder the row or render an unlabelled chip.
 */
export function orderedAmenities(codes: readonly string[]): Amenity[] {
  // Object.hasOwn, not bracket `!== undefined`: a code equal to an inherited Object.prototype member
  // ('valueOf', 'hasOwnProperty', …) must be dropped as unknown, not passed through as a chip.
  const known = codes.filter((code): code is Amenity => Object.hasOwn(AMENITY_LABELS, code));
  return [...new Set(known)].sort(
    (a, b) => AMENITY_CATALOGUE.indexOf(a) - AMENITY_CATALOGUE.indexOf(b),
  );
}

/** The "Xm to water" chip label, or `null` when the distance is not stated. */
export function distanceToWaterLabel(metres: number | null): string | null {
  return metres == null ? null : `${metres}m to water`;
}
