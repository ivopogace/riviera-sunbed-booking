import { AMENITY_CATALOGUE, amenityLabel, distanceToWaterLabel, orderedAmenities } from './amenities';

describe('amenities catalogue (shared vocabulary, T7 #140)', () => {
  it('is the 11 fixed catalogue codes in canonical order (mirrors the backend enum)', () => {
    expect(AMENITY_CATALOGUE).toEqual([
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
    ]);
  });

  it('maps a code to its display label', () => {
    expect(amenityLabel('FREE_PARKING')).toBe('Free parking');
    expect(amenityLabel('WIFI')).toBe('WiFi');
  });

  it('humanizes an unknown code rather than throwing (FE/BE skew tolerance)', () => {
    expect(amenityLabel('SUNSET_VIEW')).toBe('Sunset view');
  });

  it('orders amenities into canonical catalogue order and drops unknowns + duplicates', () => {
    expect(orderedAmenities(['WIFI', 'BEACH_BAR', 'PING_PONG', 'WIFI'])).toEqual([
      'BEACH_BAR',
      'WIFI',
    ]);
  });

  it('renders the to-water label, or null when the distance is absent', () => {
    expect(distanceToWaterLabel(15)).toBe('15m to water');
    expect(distanceToWaterLabel(null)).toBeNull();
  });
});
