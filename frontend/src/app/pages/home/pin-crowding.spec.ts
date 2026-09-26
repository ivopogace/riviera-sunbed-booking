import { LngLat, ScreenPoint } from '../../shared/map-engine';
import {
  crowdPins,
  crowds,
  footSwap,
  layoutPills,
  lowestFromPrice,
  PIN_HEIGHT_PX,
  pinWidth,
  PinCrowd,
  PillSpace,
  placeName,
  PlacedPin,
  Rect,
  separationZoom,
  VenuePin,
} from './pin-crowding';
import { VenueCard } from './venue-card';

function card(overrides: Partial<VenueCard> & Pick<VenueCard, 'id' | 'name'>): VenueCard {
  return {
    beach: 'KSAMIL',
    beachLabel: 'Ksamil',
    regionLabel: 'Sarandë',
    photos: [],
    modeLabel: 'Instant Book',
    instantBook: true,
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
    stay: null,
    canHost: true,
    stayLabel: null,
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

  /** Projected straight off the longitude, so a spec reads the screen position in the pin list. */
  const atX = (id: string, x: number, price: string): VenuePin => ({
    id,
    at: { lng: x, lat: 39.8 },
    card: card({ id: Number(id), name: `Venue ${id}`, priceLabel: price }),
  });
  const byLng = (at: LngLat): ScreenPoint => ({ x: at.lng, y: 0 });

  it('tests a pin against the crowd’s running mean, not its first member', () => {
    // 80 is 80 px from the first member and 55 from the pair's mean, inside their 62 px reach.
    const grouped = crowdPins(
      [atX('1', 0, '€25'), atX('2', 50, '€25'), atX('3', 80, '€250')],
      byLng,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].members.map((member) => member.pin.id)).toEqual(['1', '2', '3']);
  });

  it('tests a pin against the crowd’s widest member, not its first', () => {
    // Two at one spot, the second wider: 60 across clears the narrow first member and not the pair.
    const grouped = crowdPins(
      [atX('1', 0, '€25'), atX('2', 0, '€250'), atX('3', 60, '€25')],
      byLng,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].width).toBe(pinWidth('€250'));
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

describe('footSwap', () => {
  const pane: Rect = { left: 0, top: 0, right: 390, bottom: 500 };
  /** The 44 px Near me at the foot's right; the shorter wrapped credit at its left. */
  const nearMe: Rect = { left: 240, top: 440, right: 378, bottom: 484 };
  const credit: Rect = { left: 12, top: 452, right: 212, bottom: 484 };
  const foot = [nearMe, credit];
  /** Mirrored in the pane, Near me takes 12–150 at the left and the credit 178–378 at the right. */
  const pinAt = (left: number, top: number): Rect => ({
    left,
    top,
    right: left + 57,
    bottom: top + 44,
  });
  const onNearMe = pinAt(300, 400);

  it('swaps the foot when a lone pin sits under it and the mirrored spots are free', () => {
    expect(footSwap(foot, [onNearMe], pane, false)).toBe(true);
  });

  it('holds when a lone pin waits under the swapped spots too, so it cannot oscillate', () => {
    expect(footSwap(foot, [onNearMe, pinAt(100, 400)], pane, false)).toBe(false);
  });

  it('holds when nothing is under the foot at all', () => {
    expect(footSwap(foot, [pinAt(160, 300)], pane, false)).toBe(false);
  });

  it('swaps back once the pin that moved the chrome has gone', () => {
    expect(footSwap(foot, [pinAt(160, 300)], pane, true)).toBe(true);
    expect(footSwap(foot, [onNearMe], pane, true)).toBe(false);
  });

  it('holds when the foot has not been drawn yet', () => {
    expect(footSwap([], [onNearMe], pane, true)).toBe(true);
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
  const pane = (right: number, bottom: number, noGo: readonly Rect[] = []): PillSpace => ({
    window: { left: 0, top: 0, right, bottom },
    noGo,
  });
  const box = pane(300, 200);
  const full = (): number => 120;

  it('sits a pill centred on its place when it fits', () => {
    const crowd = crowdOf([placed('a', 150, 100), placed('b', 151, 100)]);
    expect(layoutPills([crowd], full, box).get(crowd.key)).toEqual({
      anchor: 'centre',
      rise: 'level',
      compact: false,
      width: 120,
    });
  });

  it('hangs a pill right, then left, then collapses it', () => {
    const nearLeft = crowdOf([placed('a', 30, 100), placed('b', 31, 100)]);
    const nearRight = crowdOf([placed('c', 270, 100), placed('d', 271, 100)]);
    expect(layoutPills([nearLeft], full, box).get(nearLeft.key)?.anchor).toBe('right');
    expect(layoutPills([nearRight], full, box).get(nearRight.key)?.anchor).toBe('left');

    const cramped = layoutPills([nearLeft], full, pane(60, 200)).get(nearLeft.key);
    expect(cramped).toEqual({
      anchor: 'centre',
      rise: 'level',
      compact: true,
      width: PIN_HEIGHT_PX,
    });
  });

  it('hangs a pill off a lone pin it would run over', () => {
    const lone = crowdOf([placed('l', 100, 100)]);
    const crowd = crowdOf([placed('a', 160, 100), placed('b', 161, 100)]);
    const placements = layoutPills([lone, crowd], full, box);
    expect(placements.get(crowd.key)?.anchor).toBe('right');
    expect(placements.get(lone.key)).toEqual({
      anchor: 'centre',
      rise: 'level',
      compact: false,
      width: 57,
    });
  });

  it('places the larger crowd first, so the smaller one is the one that hangs', () => {
    const small = crowdOf([placed('a', 100, 100), placed('b', 100, 100)]);
    const large = crowdOf([placed('c', 200, 100), placed('d', 200, 100), placed('e', 200, 100)]);
    const placements = layoutPills([small, large], full, box);
    expect(placements.get(large.key)).toEqual({
      anchor: 'centre',
      rise: 'level',
      compact: false,
      width: 120,
    });
    expect(placements.get(small.key)).toEqual({
      anchor: 'left',
      rise: 'level',
      compact: false,
      width: 120,
    });
  });

  it('never hangs for the box’s edge when the box is unknown', () => {
    const nearLeft = crowdOf([placed('a', 30, 100), placed('b', 31, 100)]);
    const unmeasured: PillSpace = { window: null, noGo: [] };
    expect(layoutPills([nearLeft], full, unmeasured).get(nearLeft.key)?.anchor).toBe('centre');
  });

  /** A 120 px pill at x 150 reaches 90–210 centred, 128–248 hung right and 52–172 hung left. */
  const crowded = crowdOf([placed('x', 150, 100), placed('y', 150, 100)]);

  it('hangs a pill below its point when every level spot is taken', () => {
    // Two lone pins at y 70 span 30–270 across the level band and the band a pill above would use.
    const left = crowdOf([placed('p', 90, 70, 120)]);
    const right = crowdOf([placed('q', 210, 70, 120)]);

    expect(layoutPills([left, right, crowded], full, box).get(crowded.key)).toEqual({
      anchor: 'centre',
      rise: 'below',
      compact: false,
      width: 120,
    });
  });

  it('hangs a pill diagonally before collapsing it', () => {
    const level = [crowdOf([placed('p', 90, 70, 120)]), crowdOf([placed('q', 210, 70, 120)])];
    // 172–300 at y 160 leaves only the left of the three below spots free.
    const below = crowdOf([placed('r', 236, 160, 128)]);

    expect(layoutPills([...level, below, crowded], full, box).get(crowded.key)).toEqual({
      anchor: 'left',
      rise: 'below',
      compact: false,
      width: 120,
    });
  });

  it('tries the nine spots again as a bare disc before it stands its ground', () => {
    // A wall across the level and above bands, and two pins leaving only 120–180 free below.
    const wall = crowdOf([placed('w', 150, 70, 300)]);
    const gap = [crowdOf([placed('g1', 60, 132, 120)]), crowdOf([placed('g2', 240, 132, 120)])];

    expect(layoutPills([wall, ...gap, crowded], full, box).get(crowded.key)).toEqual({
      anchor: 'centre',
      rise: 'below',
      compact: true,
      width: PIN_HEIGHT_PX,
    });
  });

  it('leaves a pill that fits nowhere at its layer placement', () => {
    const buried = crowdOf([placed('b1', 150, 100, 300)]);

    expect(layoutPills([buried, crowded], full, box).get(crowded.key)).toEqual({
      anchor: 'centre',
      rise: 'level',
      compact: true,
      width: PIN_HEIGHT_PX,
    });
  });

  it('hangs a pill clear of the page’s chrome at the map’s foot', () => {
    const atFoot = crowdOf([placed('x', 150, 160), placed('y', 150, 160)]);
    const nearMe: Rect = { left: 100, top: 156, right: 300, bottom: 200 };

    expect(layoutPills([atFoot], full, pane(300, 200, [nearMe])).get(atFoot.key)).toEqual({
      anchor: 'centre',
      rise: 'above',
      compact: false,
      width: 120,
    });
  });

  it('hangs a pill clear of the tourist’s own dot', () => {
    // The 20 px dot with its 2 px margin, just above the crowd — the record's Dhërmi case.
    const dot: Rect = { left: 138, top: 66, right: 162, bottom: 90 };

    expect(layoutPills([crowded], full, pane(300, 200, [dot])).get(crowded.key)).toEqual({
      anchor: 'centre',
      rise: 'below',
      compact: false,
      width: 120,
    });
  });

  it('confines a pill to the window, which need not start at the box’s own top', () => {
    const underHeader = { window: { left: 0, top: 90, right: 300, bottom: 200 }, noGo: [] };

    expect(layoutPills([crowded], full, underHeader).get(crowded.key)).toEqual({
      anchor: 'centre',
      rise: 'below',
      compact: false,
      width: 120,
    });
  });
});
