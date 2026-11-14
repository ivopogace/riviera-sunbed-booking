import type { MockSetView, MockVenueMapView } from './venue-views';

/**
 * The seeded Miramar Beach Club's beach map as a demo database holds it: row A is 13 sets wide,
 * rows B–I 7, with per-set prices that open five price zones (A, B, C, D, E–I). The phone-density
 * spec measures this shape (#1732); the per-set prices are the ones the zone chips summarise.
 */
const ROW_PRICES: Record<string, readonly number[]> = {
  A: [4500, 4500, 4500, 4500, 4500, 4500, 3500, 3500, 3500, 3500, 3500, 3500, 3500],
  B: [3500, 3500, 3500, 3500, 3500, 3500, 2500],
  C: [3000, 3000, 3000, 3000, 3000, 3000, 2000],
  D: [2500, 2500, 2500, 2000, 2500, 2500, 2000],
  E: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
  F: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
  G: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
  H: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
  I: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
};

export function miramarMapVenue(id = 1): MockVenueMapView {
  const sets: MockSetView[] = [];
  Object.entries(ROW_PRICES).forEach(([rowLabel, prices], r) => {
    prices.forEach((minorUnits, p) => {
      sets.push({
        id: sets.length + 1,
        rowLabel,
        positionNo: p + 1,
        tier: rowLabel === 'A' ? 'PREMIUM' : 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits, currency: 'EUR' },
        gridX: p + 1,
        gridY: r + 1,
        availability: (p + r) % 5 === 0 ? 'TAKEN' : 'FREE',
      });
    });
  });
  return {
    id,
    name: 'Miramar Beach Club',
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: 'Premium loungers on the Ksamil shoreline.',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2000, currency: 'EUR' },
    sets,
  };
}
