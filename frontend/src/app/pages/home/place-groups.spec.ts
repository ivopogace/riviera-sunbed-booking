import { describe, expect, it } from 'vitest';

import { VenueCard } from './venue-card';
import { distanceLabel, groupByBeach, nearestRegion, placeTitle } from './place-groups';

/** The card facts the grouping reads; everything else is filler. */
function card(
  id: number,
  beach: VenueCard['beach'],
  regionLabel: string,
  lng: number | null,
  lat: number | null,
): VenueCard {
  return {
    id,
    name: `Venue ${id}`,
    beach,
    beachLabel: beach,
    regionLabel,
    photos: [],
    modeLabel: 'Instant Book',
    instantBook: true,
    isRated: false,
    rating: '0',
    reviewsLabel: 'no reviews yet',
    water: null,
    amenities: [],
    freePercent: 0,
    priceLabel: null,
    fromPrice: null,
    free: 0,
    total: 0,
    salesClosed: false,
    closedForSeason: false,
    reopensOn: null,
    location: lng === null || lat === null ? null : { longitude: lng, latitude: lat },
    stay: null,
    canHost: true,
    stayLabel: null,
    ariaLabel: '',
  };
}

const TIRANA = { lng: 19.82, lat: 41.33 };
const ON_DHERMI = { lng: 19.64, lat: 40.15 };

const golem = card(1, 'GOLEM', 'Durrës', 19.51, 41.24);
const dhermi = card(2, 'DHERMI', 'Himarë', 19.6401, 40.1573);
const palase = card(3, 'PALASE', 'Himarë', 19.607, 40.175);
const ksamil = card(4, 'KSAMIL', 'Sarandë', 20.0021, 39.7712);
const unpinned = card(5, 'BORSH', 'Himarë', null, null);

describe('place groups (the located state)', () => {
  // The great-circle maths itself moved to `shared/geo-distance.spec.ts` with the function.
  it('captions a distance with one decimal under ten and none above', () => {
    expect(distanceLabel(0.62)).toBe('0.6 km');
    expect(distanceLabel(27.8)).toBe('28 km');
  });

  it('names the region of the nearest pinned venue, and nothing for a list with no pins', () => {
    expect(nearestRegion(TIRANA, [golem, dhermi, ksamil])).toBe('DURRES');
    expect(nearestRegion(ON_DHERMI, [golem, dhermi, ksamil])).toBe('HIMARE');
    expect(nearestRegion(TIRANA, [unpinned])).toBe('');
  });

  it('groups by beach in coast order when not located, keeping an unpinned venue in its group', () => {
    const groups = groupByBeach([ksamil, unpinned, dhermi, palase], null);
    expect(groups.map((g) => g.code)).toEqual(['PALASE', 'DHERMI', 'BORSH', 'KSAMIL']);
    expect(groups.every((g) => g.km === null)).toBe(true);
    expect(groups[2].cards.map((c) => c.id)).toEqual([5]);
  });

  it('sorts groups and their venues nearest first when located, a pinless group last', () => {
    const groups = groupByBeach([ksamil, unpinned, dhermi, palase], ON_DHERMI);
    expect(groups.map((g) => g.code)).toEqual(['DHERMI', 'PALASE', 'KSAMIL', 'BORSH']);
    expect(groups[0].km).toBeCloseTo(0.8, 0);
    expect(groups[3].km).toBeNull();
  });

  it('titles the beach within 3 km, the region beyond it, and the chosen place over both', () => {
    const near = groupByBeach([golem, dhermi, palase], ON_DHERMI);
    const far = groupByBeach([golem, dhermi, palase], TIRANA);
    expect(placeTitle({ region: 'HIMARE', beach: '', here: ON_DHERMI, groups: near })).toBe(
      'Dhërmi',
    );
    expect(placeTitle({ region: 'DURRES', beach: '', here: TIRANA, groups: far })).toBe('Durrës');
    expect(placeTitle({ region: 'HIMARE', beach: 'PALASE', here: ON_DHERMI, groups: near })).toBe(
      'Palasë',
    );
    expect(placeTitle({ region: 'HIMARE', beach: '', here: null, groups: near })).toBe('Himarë');
  });

  describe('a stay', () => {
    it('sinks the venues that can’t host after their beach group’s hosts, keeping each side’s order', () => {
      const hosts = { ...card(1, 'DHERMI', 'Himarë', 19.6, 40.15), canHost: false };
      const cards = [
        hosts,
        card(2, 'DHERMI', 'Himarë', 19.61, 40.15),
        { ...card(3, 'DHERMI', 'Himarë', 19.62, 40.15), canHost: false },
        card(4, 'DHERMI', 'Himarë', 19.63, 40.15),
        card(5, 'PALASE', 'Himarë', 19.6, 40.17),
      ];

      const groups = groupByBeach(cards, null);

      expect(groups.map((group) => group.cards.map((c) => c.id))).toEqual([[2, 4, 1, 3], [5]]);
    });

    it('keeps the located nearest-first order inside each side too', () => {
      const cards = [
        { ...card(1, 'DHERMI', 'Himarë', 19.6, 40.15), canHost: false },
        card(2, 'DHERMI', 'Himarë', 19.7, 40.15),
        card(3, 'DHERMI', 'Himarë', 19.65, 40.15),
      ];

      const groups = groupByBeach(cards, { lng: 19.6, lat: 40.15 });

      expect(groups[0].cards.map((c) => c.id)).toEqual([3, 2, 1]);
    });
  });
});
