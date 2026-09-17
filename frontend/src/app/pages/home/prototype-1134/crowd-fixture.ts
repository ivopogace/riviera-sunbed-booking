import { Amenity } from '../../../shared/amenities';
import { VenueSummary } from '../../../shared/venue-views';

/**
 * THROWAWAY PROTOTYPE (issue #1134) — the venue list the prototype runs on, so it starts from
 * `npm run prototype:1134` with no backend, no Postgres and no Docker.
 *
 * <p>Real Albanian-riviera coordinates, arranged to hold the three crowding cases the defect
 * produces at three different scales:
 *
 * <ul>
 *   <li><b>Dhërmi (3 venues, ~20 m apart)</b> — unreachable at EVERY zoom the map offers, including
 *       `maxZoom` 16. This is the maintainer's report.
 *   <li><b>Ksamil (2 venues, ~120 m apart)</b> — separates only past zoom 14.
 *   <li><b>Jale (5 venues, ~400 m of beach)</b> — separates around zoom 12, where Near me lands,
 *       and is one blob at the opening view. Five is the case a two-pin fix quietly fails.
 * </ul>
 *
 * The four remaining venues sit far enough apart to never crowd, so every variant is judged on
 * what it does to the pins that are NOT in trouble as well.
 */

const AMENITIES: readonly Amenity[] = ['BEACH_BAR', 'SHOWERS', 'WIFI'];

function venue(
  id: number,
  name: string,
  beach: string,
  region: string,
  latitude: number,
  longitude: number,
  priceMinor: number,
  free: number,
  total: number,
  extra: Partial<VenueSummary> = {},
): VenueSummary {
  return {
    id,
    name,
    beach,
    region,
    ratingTenths: 38 + (id % 12),
    reviewsCount: 4 + id * 3,
    bookingMode: id % 3 === 0 ? 'REQUEST' : 'INSTANT',
    fromPrice: { minorUnits: priceMinor, currency: 'EUR' },
    amenities: AMENITIES.slice(0, 1 + (id % 3)),
    distanceToWaterM: 8 + (id % 5) * 9,
    location: { latitude, longitude },
    availability: { free, total },
    salesOpen: true,
    closedForSeason: false,
    ...extra,
  };
}

export const CROWD_FIXTURE: readonly VenueSummary[] = [
  // Dhërmi — three venues on one strip of sand. Never separable by zooming.
  venue(1, 'Havana Beach', 'Dhërmi', 'Vlorë', 40.14831, 19.63925, 2400, 6, 28),
  venue(2, 'Folie Marine', 'Dhërmi', 'Vlorë', 40.14848, 19.63941, 3900, 2, 34),
  venue(3, 'Dhërmi Sun Club', 'Dhërmi', 'Vlorë', 40.14819, 19.63953, 1800, 19, 22),

  // Jale — a five-venue bay. One blob at the opening view, still crowded where Near me lands.
  venue(4, 'Jale Beach Bar', 'Jale', 'Vlorë', 40.10812, 19.71902, 2000, 11, 26),
  venue(5, 'Blue Bay Jale', 'Jale', 'Vlorë', 40.10871, 19.71838, 2600, 3, 18),
  venue(6, 'Riviera Sands', 'Jale', 'Vlorë', 40.10758, 19.71969, 1600, 24, 30),
  venue(7, 'Aloha Jale', 'Jale', 'Vlorë', 40.10922, 19.71781, 3100, 0, 16, { salesOpen: false }),
  venue(8, 'Kanali Lounge', 'Jale', 'Vlorë', 40.10706, 19.72022, 2200, 9, 20),

  // Ksamil — a pair that separates only when the tourist is already zoomed well in.
  venue(9, 'Ksamil Islands Beach', 'Ksamil', 'Vlorë', 39.7669, 20.00218, 2800, 7, 24),
  venue(10, 'Lori Beach', 'Ksamil', 'Vlorë', 39.76797, 20.00325, 2100, 15, 25),

  // Four that never crowd anything — the control group.
  venue(11, 'Livadh Bay', 'Livadh', 'Vlorë', 40.11528, 19.72864, 1900, 13, 21),
  venue(12, 'Borsh Long Beach', 'Borsh', 'Vlorë', 40.04716, 19.84832, 1400, 31, 40),
  venue(13, 'Porto Palermo Cove', 'Qeparo', 'Vlorë', 40.06423, 19.79004, 3400, 5, 12),
  venue(14, 'Radhimë Riva', 'Radhimë', 'Vlorë', 40.36669, 19.45001, 1700, 17, 27, {
    closedForSeason: true,
    reopensOn: '2026-05-15',
  }),
];
