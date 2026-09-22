import {
  BEACH_CATALOGUE,
  beachEntry,
  beachLabel,
  RegionCode,
  regionLabel,
} from '../../shared/beaches';
import { distanceKm } from '../../shared/geo-distance';
import { LngLat } from '../../shared/map-engine';
import { VenueCard } from './venue-card';

/**
 * The located state's rules: where the tourist is, as the catalogue says it, and the list
 * re-ordered by distance. A position reaches the camera, the sort and the captions and nothing
 * else — never a request, never storage — the promise `shared/geolocation.ts` makes.
 */

/** Nearer than this to the nearest beach, the tourist is on it and it is the title. */
const ON_BEACH_KM = 3;

/** One beach's slice of the list: its venues, and how far it is when the tourist is located. */
export interface BeachGroup {
  readonly code: string;
  readonly label: string;
  readonly cards: readonly VenueCard[];
  /** Distance from the position to the group's pinned venues' centre; `null` unlocated or unpinned. */
  readonly km: number | null;
}

/** `0.6 km`, `1.8 km`, `28 km` — one decimal under ten, none above. */
export function distanceLabel(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function locationOf(card: VenueCard): LngLat | null {
  return card.location === null
    ? null
    : { lng: card.location.longitude, lat: card.location.latitude };
}

/** The region of the pinned venue nearest `here`, or `''` when no venue has a pin. */
export function nearestRegion(here: LngLat, cards: readonly VenueCard[]): RegionCode | '' {
  let best: VenueCard | null = null;
  let bestKm = Infinity;
  for (const card of cards) {
    const at = locationOf(card);
    if (at === null) {
      continue;
    }
    const km = distanceKm(here, at);
    if (km < bestKm) {
      bestKm = km;
      best = card;
    }
  }
  return best === null ? '' : (beachEntry(best.beach)?.region ?? '');
}

/**
 * The set grouped by beach — nearest first when located, the coast's north-to-south order
 * otherwise (the list arrives rating-sorted) — and each group's venues nearest first too. A
 * group with no pinned venue sorts last.
 */
export function groupByBeach(cards: readonly VenueCard[], here: LngLat | null): BeachGroup[] {
  const byBeach = new Map<string, VenueCard[]>();
  for (const card of cards) {
    const on = byBeach.get(card.beach) ?? [];
    on.push(card);
    byBeach.set(card.beach, on);
  }
  const groups = [...byBeach.entries()].map(([code, on]) => {
    const pinned = on.map(locationOf).filter((at): at is LngLat => at !== null);
    const centre =
      pinned.length === 0
        ? null
        : {
            lng: pinned.reduce((sum, at) => sum + at.lng, 0) / pinned.length,
            lat: pinned.reduce((sum, at) => sum + at.lat, 0) / pinned.length,
          };
    const km = here === null || centre === null ? null : distanceKm(here, centre);
    const sorted = here === null ? on : [...on].sort((a, b) => kmOf(a, here) - kmOf(b, here));
    return { code, label: beachLabel(code), cards: sorted, km } satisfies BeachGroup;
  });
  return here === null
    ? groups.sort((a, b) => coastIndex(a.code) - coastIndex(b.code))
    : groups.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

function coastIndex(code: string): number {
  const index = BEACH_CATALOGUE.findIndex((entry) => entry.code === code);
  return index === -1 ? BEACH_CATALOGUE.length : index;
}

function kmOf(card: VenueCard, here: LngLat): number {
  const at = locationOf(card);
  return at === null ? Infinity : distanceKm(here, at);
}

/** The card's distance from `here` as a caption, or `null` unlocated or unpinned. */
export function rowDistance(card: VenueCard, here: LngLat | null): string | null {
  const at = here === null ? null : locationOf(card);
  return at === null || here === null ? null : distanceLabel(distanceKm(here, at));
}

/**
 * The head's place: the chosen beach; else, located, the nearest beach when standing on it
 * (within 3 km) and the region beyond that (Tirana → `Durrës`); else the region.
 */
export function placeTitle(focus: {
  readonly region: string;
  readonly beach: string;
  readonly here: LngLat | null;
  readonly groups: readonly BeachGroup[];
}): string {
  if (focus.beach !== '') {
    return beachLabel(focus.beach);
  }
  const nearest = focus.groups[0];
  if (
    focus.here !== null &&
    nearest?.km !== null &&
    nearest !== undefined &&
    nearest.km < ON_BEACH_KM
  ) {
    return nearest.label;
  }
  return focus.region === '' ? 'The coast' : regionLabel(focus.region);
}
