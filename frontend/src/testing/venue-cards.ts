import { VenueCard } from '../app/pages/home/venue-card';

/**
 * A ready-to-render {@link VenueCard} for specs of the surfaces that consume one — the riviera
 * map's pin layer, its geometry and the pin preview — with every field filled and the venue's own
 * facts overridable.
 * Priced at €25 with 18 of 24 sets free on Ksamil; a spec passes `priceLabel: null, fromPrice:
 * null` together for an unpriced venue, since the two are one fact in two forms.
 */
export function venueCard(
  overrides: Partial<VenueCard> & Pick<VenueCard, 'id' | 'name'>,
): VenueCard {
  return {
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    photos: [],
    modeLabel: 'Instant Book',
    isRated: true,
    rating: '4.8',
    reviewsLabel: '326 reviews',
    water: null,
    amenities: [],
    freePercent: 75,
    priceLabel: '€25',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    free: 18,
    total: 24,
    salesClosed: false,
    closedForSeason: false,
    reopensOn: null,
    location: null,
    ariaLabel: `${overrides.name}, Ksamil · Albanian Riviera`,
    ...overrides,
  };
}
