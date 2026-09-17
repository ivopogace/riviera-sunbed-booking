import { VenueCard } from './venue-card';
import { venuePins } from './venue-pins';

function card(overrides: Partial<VenueCard> & Pick<VenueCard, 'id' | 'name'>): VenueCard {
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
    priceLabel: '€25.00',
    free: 18,
    total: 24,
    salesClosed: false,
    closedForSeason: false,
    reopensOn: null,
    location: null,
    ariaLabel: `${overrides.name}, …`,
    ...overrides,
  };
}

describe('venuePins', () => {
  it('draws one pin per located venue, in list order', () => {
    const pins = venuePins([
      card({
        id: 7,
        name: 'Miramar Beach Club',
        location: { latitude: 39.7712, longitude: 20.0021 },
      }),
      card({ id: 9, name: 'Aurora Bay', location: { latitude: 40.1573, longitude: 19.6401 } }),
    ]);

    expect(pins).toEqual([
      { id: '7', at: { lng: 20.0021, lat: 39.7712 }, label: 'Miramar Beach Club' },
      { id: '9', at: { lng: 19.6401, lat: 40.1573 }, label: 'Aurora Bay' },
    ]);
  });

  it('omits a venue with no location, which stays in the list', () => {
    const pins = venuePins([
      card({ id: 1, name: 'Pinned', location: { latitude: 39.9, longitude: 20.1 } }),
      card({ id: 2, name: 'Unpinned' }),
    ]);

    expect(pins.map((pin) => pin.label)).toEqual(['Pinned']);
  });

  it('omits a venue whose payload carries no location key at all', () => {
    const unpinned = card({ id: 3, name: 'Older payload' });
    delete (unpinned as { location?: unknown }).location;

    expect(venuePins([unpinned])).toEqual([]);
  });

  it('draws nothing while the list is still loading', () => {
    expect(venuePins(undefined)).toEqual([]);
  });

  it('draws nothing for an empty result set', () => {
    expect(venuePins([])).toEqual([]);
  });

  it('keys a pin by its venue id, so a pin and its card agree', () => {
    expect(
      venuePins([card({ id: 42, name: 'Keyed', location: { latitude: 39.9, longitude: 20.1 } })])[0]
        .id,
    ).toBe('42');
  });
});
