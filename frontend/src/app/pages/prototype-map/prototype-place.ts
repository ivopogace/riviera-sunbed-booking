/**
 * PROTOTYPE — throwaway. Round 5's model of WHERE THE TOURIST IS: the phone's first question is
 * not "show me the coast" but "what is near me, today", so the position becomes a first-class
 * input beside the beach and region filters, and the list learns to sort and caption by distance.
 *
 * <p>A position reaches the camera, the sort and the captions and nothing else — never a request,
 * never storage — exactly the promise `shared/geolocation.ts` makes. `?here=lng,lat` seeds it for
 * screenshots; in the browser the strip's Near me button asks the gateway.
 */
import { beachEntry, RegionCode } from '../../shared/beaches';
import { LngLat } from '../../shared/map-engine';
import { VenueCard } from '../home/venue-card';

/** `19.64,40.15` → a position; anything else is no position. */
export function parseHere(text: string | null): LngLat | null {
  if (text === null) return null;
  const [lng, lat] = text.split(',').map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

/** Great-circle distance in km — a caption, so the spherical approximation is plenty. */
export function distanceKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** `0.3 km`, `1.8 km`, `24 km` — one decimal under ten, none above. */
export function distanceLabel(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function locationOf(card: VenueCard): LngLat {
  return { lng: card.location!.longitude, lat: card.location!.latitude };
}

/** The region whose venue is nearest `here` — where the tourist is, as the catalogue says it. */
export function nearestRegion(here: LngLat, cards: readonly VenueCard[]): RegionCode | '' {
  let best: VenueCard | null = null;
  let bestKm = Infinity;
  for (const card of cards) {
    const km = distanceKm(here, locationOf(card));
    if (km < bestKm) {
      bestKm = km;
      best = card;
    }
  }
  return best === null ? '' : (beachEntry(best.beach)?.region ?? '');
}

/** One beach's slice of the list: its venues, and how far it is when the tourist is located. */
export interface BeachGroup {
  readonly code: string;
  readonly label: string;
  readonly region: string;
  readonly cards: readonly VenueCard[];
  readonly at: LngLat;
  /** Distance from `here` to the beach's venues' centre; `null` when not located. */
  readonly km: number | null;
}

/**
 * The set grouped by beach — nearest first when located, the coast's north-to-south order
 * otherwise — and each group's venues nearest first too.
 */
export function groupByBeach(cards: readonly VenueCard[], here: LngLat | null): BeachGroup[] {
  const byBeach = new Map<string, VenueCard[]>();
  for (const card of cards) {
    const on = byBeach.get(card.beach) ?? [];
    on.push(card);
    byBeach.set(card.beach, on);
  }
  const groups = [...byBeach.entries()].map(([code, on]) => {
    const at = {
      lng: on.reduce((s, c) => s + c.location!.longitude, 0) / on.length,
      lat: on.reduce((s, c) => s + c.location!.latitude, 0) / on.length,
    };
    const km = here === null ? null : distanceKm(here, at);
    const sorted =
      here === null
        ? on
        : [...on].sort((a, b) => distanceKm(here, locationOf(a)) - distanceKm(here, locationOf(b)));
    return {
      code,
      label: on[0].beachLabel,
      region: on[0].regionLabel,
      cards: sorted,
      at,
      km,
    } satisfies BeachGroup;
  });
  return here === null ? groups : groups.sort((a, b) => a.km! - b.km!);
}
