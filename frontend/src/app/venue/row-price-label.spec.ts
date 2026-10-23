import { SetView } from '../shared/venue-views';
import { rowPriceLabel, rowZoneKey } from './row-price-label';

/**
 * The price chip's wording rule. The chip is the price alone (#1587): the tile styling and the
 * legend already say which rows are front row and which are walk-in, and the rail chip beside it
 * renders the stored `rowLabel`. The zone key splits walk-in rows from online ones at one price.
 */
function set(over: Omit<Partial<SetView>, 'price'> & { price: number }): SetView {
  return {
    id: 1,
    rowLabel: 'A',
    positionNo: 1,
    tier: 'STANDARD',
    pool: 'ONLINE',
    gridX: 1,
    gridY: 1,
    availability: 'FREE',
    ...over,
    price: { minorUnits: over.price, currency: 'EUR' },
  };
}

/** One row's worth of sets: same label/tier/pool, `count` positions, all at `price`. */
function row(
  rowLabel: string,
  tier: SetView['tier'],
  pool: SetView['pool'],
  price: number,
  count = 3,
): SetView[] {
  return Array.from({ length: count }, (_, i) =>
    set({ id: i + 1, rowLabel, tier, pool, price, positionNo: i + 1 }),
  );
}

/** Shorthand: the chip for one uniform row. */
function labelled(
  rowLabel: string,
  tier: SetView['tier'],
  pool: SetView['pool'],
  price: number,
): string {
  return rowPriceLabel(row(rowLabel, tier, pool, price));
}

describe('rowPriceLabel', () => {
  it("never repeats the venue's words — the rail displays them itself (#724)", () => {
    expect(labelled('Garden · Back', 'STANDARD', 'ONLINE', 3000)).toBe('€30');
    expect(labelled('Front row · Sea view', 'STANDARD', 'ONLINE', 4500)).toBe('€45');
    expect(labelled('VIP', 'STANDARD', 'ONLINE', 4500)).toBe('€45');
  });

  it('renders only the price for premium, standard, walk-in and mixed rows (#1587)', () => {
    expect(labelled('A', 'PREMIUM', 'ONLINE', 5000)).toBe('€50');
    expect(labelled('B', 'STANDARD', 'ONLINE', 3500)).toBe('€35');
    expect(labelled('C', 'STANDARD', 'WALK_IN', 2500)).toBe('€25');
    expect(labelled('D', 'PREMIUM', 'WALK_IN', 5000)).toBe('€50');

    const mixedPool = [
      set({ id: 1, rowLabel: 'E', pool: 'WALK_IN', price: 3000 }),
      set({ id: 2, rowLabel: 'E', tier: 'PREMIUM', price: 3000, positionNo: 2 }),
    ];
    expect(rowPriceLabel(mixedPool)).toBe('€30');
  });

  it('renders a mixed-price row as its min–max span alone (#689, #1587)', () => {
    const mixedPrice = [
      set({ id: 1, rowLabel: 'A', tier: 'PREMIUM', price: 3500 }),
      set({ id: 2, rowLabel: 'A', tier: 'PREMIUM', price: 4500 }),
    ];
    expect(rowPriceLabel(mixedPrice)).toBe('€35–€45');

    const mixedPriceWalkIn = [
      set({ id: 1, rowLabel: 'D', pool: 'WALK_IN', price: 2000 }),
      set({ id: 2, rowLabel: 'D', pool: 'WALK_IN', price: 2500 }),
    ];
    expect(rowPriceLabel(mixedPriceWalkIn)).toBe('€20–€25');
  });
});

describe('rowZoneKey', () => {
  it('keys an all-walk-in row apart from an online row at the same price (#702, #1587)', () => {
    const online = row('B', 'STANDARD', 'ONLINE', 3500);
    const walkIn = row('C', 'STANDARD', 'WALK_IN', 3500);
    expect(rowPriceLabel(online)).toBe(rowPriceLabel(walkIn));
    expect(rowZoneKey(online)).not.toBe(rowZoneKey(walkIn));
  });

  it('keys rows alike when their price span and channel match, whatever the tier', () => {
    expect(rowZoneKey(row('A', 'PREMIUM', 'ONLINE', 3500))).toBe(
      rowZoneKey(row('B', 'STANDARD', 'ONLINE', 3500)),
    );
    expect(rowZoneKey(row('C', 'STANDARD', 'WALK_IN', 2500))).toBe(
      rowZoneKey(row('D', 'PREMIUM', 'WALK_IN', 2500)),
    );
  });

  it('keys a row mixing pools with the online rows, not the walk-in ones', () => {
    const mixedPool = [
      set({ id: 1, rowLabel: 'E', pool: 'WALK_IN', price: 3000 }),
      set({ id: 2, rowLabel: 'E', pool: 'ONLINE', price: 3000, positionNo: 2 }),
    ];
    expect(rowZoneKey(mixedPool)).toBe(rowZoneKey(row('F', 'STANDARD', 'ONLINE', 3000)));
    expect(rowZoneKey(mixedPool)).not.toBe(rowZoneKey(row('G', 'STANDARD', 'WALK_IN', 3000)));
  });

  it('keys rows apart when their price spans differ', () => {
    expect(rowZoneKey(row('A', 'STANDARD', 'ONLINE', 3500))).not.toBe(
      rowZoneKey(row('B', 'STANDARD', 'ONLINE', 4500)),
    );
  });
});
