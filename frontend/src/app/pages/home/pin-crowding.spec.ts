import { LngLat, ScreenPoint } from '../../shared/map-engine';
import {
  crowdPins,
  crowds,
  layoutPills,
  lowestFromPrice,
  PIN_HEIGHT_PX,
  pinWidth,
  PinCrowd,
  placeName,
  PlacedPin,
  separationZoom,
  VenuePin,
} from './pin-crowding';
import { VenueCard } from './venue-card';

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
    priceLabel: '€25',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
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

function pin(id: string, at: LngLat = { lng: 20, lat: 39.8 }): VenuePin {
  return { id, at, card: card({ id: Number(id), name: `Venue ${id}` }) };
}

function placed(id: string, x: number, y: number, width = 57): PlacedPin {
  return { pin: pin(id), x, y, width };
}

function crowdOf(members: readonly PlacedPin[]): PinCrowd {
  return {
    key: members.map((m) => m.pin.id).join('+'),
    x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
    y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
    members,
    width: Math.max(...members.map((m) => m.width)),
  };
}

describe('pinWidth', () => {
  it('is the 44 px disc for a pin with nothing written on it', () => {
    expect(pinWidth(null)).toBe(PIN_HEIGHT_PX);
  });

  it('widens with the badge, never below the disc', () => {
    expect(pinWidth('€25')).toBeGreaterThanOrEqual(PIN_HEIGHT_PX);
    expect(pinWidth('€125')).toBeGreaterThan(pinWidth('€25'));
  });
});

describe('crowds', () => {
  it('two pins crowd when their pills overlap on both axes', () => {
    // Two 57 px pills: their halves together are 57, so 56 px apart they overlap, 57 they touch.
    expect(crowds(placed('a', 0, 0), placed('b', 56, 0))).toBe(true);
    expect(crowds(placed('a', 0, 0), placed('b', 57, 0))).toBe(false);
    expect(crowds(placed('a', 0, 0), placed('b', 0, 43))).toBe(true);
    expect(crowds(placed('a', 0, 0), placed('b', 0, 44))).toBe(false);
  });

  it('uses each pin’s own width, so a dot and a pill overlap later than two pills', () => {
    expect(crowds(placed('a', 0, 0, 44), placed('b', 50, 0, 57))).toBe(true);
    expect(crowds(placed('a', 0, 0, 44), placed('b', 51, 0, 57))).toBe(false);
  });
});

describe('crowdPins', () => {
  const spots: Record<string, ScreenPoint> = {
    a: { x: 0, y: 0 },
    b: { x: 10, y: 4 },
    c: { x: 300, y: 0 },
    d: { x: 30, y: 0 },
  };
  const pins = [
    pin('a', { lng: 20.0, lat: 39.8 }),
    pin('b', { lng: 20.1, lat: 39.8 }),
    pin('c', { lng: 20.2, lat: 39.8 }),
    pin('d', { lng: 20.3, lat: 39.8 }),
  ];
  const project = (at: LngLat): ScreenPoint => spots[pins.find((p) => p.at === at)!.id];

  it('groups pins by where they land, in feed order, keyed by their members', () => {
    const grouped = crowdPins(pins, project);

    expect(grouped.map((crowd) => crowd.key)).toEqual(['a+b+d', 'c']);
    expect(grouped[0].members.map((m) => m.pin.id)).toEqual(['a', 'b', 'd']);
  });

  it('anchors a crowd on its members’ mean position and the widest member', () => {
    const [crowd, lone] = crowdPins(pins, project);

    expect(crowd.x).toBeCloseTo((0 + 10 + 30) / 3, 9);
    expect(crowd.y).toBeCloseTo(4 / 3, 9);
    expect(crowd.width).toBe(pinWidth('€25'));
    expect(lone.members).toHaveLength(1);
    expect(lone).toMatchObject({ x: 300, y: 0 });
  });

  it('joins a pin to the first crowd whose anchor it overlaps, so grouping is deterministic', () => {
    // d overlaps a (30 < 57) but not b's later position; it still joins a's crowd, the first open one.
    const [crowd] = crowdPins(pins, project);
    expect(crowd.members.map((m) => m.pin.id)).toContain('d');
  });

  it('draws nothing for no pins', () => {
    expect(crowdPins([], project)).toEqual([]);
  });
});

describe('separationZoom', () => {
  it('names the smallest zoom that separates a pair, Web Mercator doubling per zoom', () => {
    // 57 px pills 1 px apart across need 57 + 12 px of clear water: 69× the offset, log2(69) zooms.
    const pair = crowdOf([placed('a', 0, 0), placed('b', 1, 0)]);
    expect(separationZoom(pair, 8.6, 16, null)).toBeCloseTo(8.6 + Math.log2(69), 6);
  });

  it('takes the cheaper axis when both separate', () => {
    // Down: 44 + 12 = 56 px over a 1 px offset beats the 69 px across the same 1 px.
    const pair = crowdOf([placed('a', 0, 0), placed('b', 1, 1)]);
    expect(separationZoom(pair, 8.6, 16, null)).toBeCloseTo(8.6 + Math.log2(56), 6);
  });

  it('never asks for less than the current zoom', () => {
    const apart = crowdOf([placed('a', 0, 0), placed('b', 100, 0)]);
    expect(separationZoom(apart, 12, 16, null)).toBe(12);
  });

  it('is capped by maxZoom', () => {
    const pair = crowdOf([placed('a', 0, 0), placed('b', 1, 0)]);
    expect(separationZoom(pair, 8.6, 10, null)).toBe(10);
  });

  it('asks for maxZoom for coinciding pins, which no zoom separates', () => {
    const same = crowdOf([placed('a', 5, 5), placed('b', 5, 5)]);
    expect(separationZoom(same, 8.6, 16, null)).toBe(16);
  });

  it('is capped by the box: the crowd stops where its span still fits inside the margin', () => {
    const pair = crowdOf([placed('a', 0, 0), placed('b', 0.5, 0)]);
    // A 160 px box leaves 10 px past the 150 px margin: the 0.5 px span may grow 20× at most.
    expect(separationZoom(pair, 8.6, 16, { width: 160, height: 400 })).toBeCloseTo(
      8.6 + Math.log2(20),
      6,
    );
    // A roomy box leaves the separation zoom alone.
    expect(separationZoom(pair, 8.6, 16, { width: 800, height: 600 })).toBeCloseTo(
      8.6 + Math.log2(138),
      6,
    );
  });

  it('is the largest of every pair’s need', () => {
    const trio = crowdOf([placed('a', 0, 0), placed('b', 20, 0), placed('c', 21, 0)]);
    expect(separationZoom(trio, 8.6, 16, null)).toBeCloseTo(8.6 + Math.log2(69), 6);
  });
});

describe('placeName', () => {
  it('names the place by its beaches: one, both, or a count', () => {
    expect(placeName(['Dhërmi'])).toBe('Dhërmi');
    expect(placeName(['Jale', 'Livadh'])).toBe('Jale & Livadh');
    expect(placeName(['Dhërmi', 'Jale', 'Livadh'])).toBe('3 beaches');
  });
});

describe('lowestFromPrice', () => {
  it('takes the lowest from-price in minor units and formats it, ignoring unpriced venues', () => {
    expect(
      lowestFromPrice([
        card({ id: 1, name: 'A', fromPrice: { minorUnits: 2400, currency: 'EUR' } }),
        card({ id: 2, name: 'B', fromPrice: { minorUnits: 2000, currency: 'EUR' } }),
        card({ id: 3, name: 'C', fromPrice: null, priceLabel: null }),
      ]),
    ).toBe('€20');
  });

  it('is absent when no member is priced', () => {
    expect(lowestFromPrice([card({ id: 3, name: 'C', fromPrice: null, priceLabel: null })])).toBe(
      null,
    );
  });
});

describe('layoutPills', () => {
  const box = { width: 300, height: 200 };
  const full = (): number => 120;

  it('sits a pill centred on its place when it fits', () => {
    const crowd = crowdOf([placed('a', 150, 100), placed('b', 151, 100)]);
    expect(layoutPills([crowd], full, box).get(crowd.key)).toEqual({
      anchor: 'centre',
      compact: false,
      width: 120,
    });
  });

  it('hangs a pill right, then left, then collapses it', () => {
    const nearLeft = crowdOf([placed('a', 30, 100), placed('b', 31, 100)]);
    const nearRight = crowdOf([placed('c', 270, 100), placed('d', 271, 100)]);
    expect(layoutPills([nearLeft], full, box).get(nearLeft.key)?.anchor).toBe('right');
    expect(layoutPills([nearRight], full, box).get(nearRight.key)?.anchor).toBe('left');

    const cramped = layoutPills([nearLeft], full, { width: 60, height: 200 }).get(nearLeft.key);
    expect(cramped).toEqual({ anchor: 'centre', compact: true, width: PIN_HEIGHT_PX });
  });

  it('hangs a pill off a lone pin it would run over', () => {
    const lone = crowdOf([placed('l', 100, 100)]);
    const crowd = crowdOf([placed('a', 160, 100), placed('b', 161, 100)]);
    const placements = layoutPills([lone, crowd], full, box);
    expect(placements.get(crowd.key)?.anchor).toBe('right');
    expect(placements.get(lone.key)).toEqual({ anchor: 'centre', compact: false, width: 57 });
  });

  it('places the larger crowd first, so the smaller one is the one that hangs', () => {
    const small = crowdOf([placed('a', 100, 100), placed('b', 100, 100)]);
    const large = crowdOf([placed('c', 200, 100), placed('d', 200, 100), placed('e', 200, 100)]);
    const placements = layoutPills([small, large], full, box);
    expect(placements.get(large.key)).toEqual({ anchor: 'centre', compact: false, width: 120 });
    expect(placements.get(small.key)).toEqual({ anchor: 'left', compact: false, width: 120 });
  });

  it('never hangs for the box’s edge when the box is unknown', () => {
    const nearLeft = crowdOf([placed('a', 30, 100), placed('b', 31, 100)]);
    expect(layoutPills([nearLeft], full, null).get(nearLeft.key)?.anchor).toBe('centre');
  });
});
