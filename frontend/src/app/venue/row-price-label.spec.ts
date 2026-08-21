import { SetView } from '../shared/venue-views';
import { rowPriceLabel } from './row-price-label';

/**
 * The price chip's wording rule (#702, narrowed by #724). The rail chip beside it renders the
 * stored `rowLabel` verbatim, so the price chip never repeats the venue's own words — it only
 * adds the two facts a label cannot state: the channel (invariant #3) and the tier.
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

  it('leaves a positional-only standard row as the bare price', () => {
    expect(labelled('Row 2', 'STANDARD', 'ONLINE', 3500)).toBe('€35');
    expect(labelled('B', 'STANDARD', 'ONLINE', 3500)).toBe('€35');
  });

  it('names an all-premium row by its tier, whatever its label says', () => {
    // The #701 legend labels every premium tile "Front row"; two at one price must read alike.
    expect(labelled('A', 'PREMIUM', 'ONLINE', 5000)).toBe('€50 · Front row');
    expect(labelled('Front row · Sea view', 'PREMIUM', 'ONLINE', 4500)).toBe('€45 · Front row');
    expect(labelled('Cabana', 'PREMIUM', 'ONLINE', 4500)).toBe('€45 · Front row');
  });

  it('states the at-venue channel for a walk-in row, over everything', () => {
    expect(labelled('Row 5 · Walk-in', 'STANDARD', 'WALK_IN', 2500)).toBe('€25 · at venue');
    // Invariant #3's fact outranks the tier.
    expect(labelled('Front row · Sea view', 'PREMIUM', 'WALK_IN', 5000)).toBe('€50 · at venue');
  });

  it('claims neither channel nor tier for a row that mixes them', () => {
    const mixedPool = [
      set({ id: 1, rowLabel: 'C', pool: 'WALK_IN', price: 3000 }),
      set({ id: 2, rowLabel: 'C', pool: 'ONLINE', price: 3000, positionNo: 2 }),
    ];
    expect(rowPriceLabel(mixedPool)).toBe('€30');

    const mixedTier = [
      set({ id: 1, rowLabel: 'C', tier: 'PREMIUM', price: 3000 }),
      set({ id: 2, rowLabel: 'C', tier: 'STANDARD', price: 3000, positionNo: 2 }),
    ];
    expect(rowPriceLabel(mixedTier)).toBe('€30');
  });

  it('composes the qualifier onto a mixed-price span (#689)', () => {
    const mixedPrice = [
      set({ id: 1, rowLabel: 'Front row · Sea view', tier: 'PREMIUM', price: 3500 }),
      set({ id: 2, rowLabel: 'Front row · Sea view', tier: 'PREMIUM', price: 4500 }),
    ];
    expect(rowPriceLabel(mixedPrice)).toBe('€35–€45 · Front row');

    const mixedPriceWalkIn = [
      set({ id: 1, rowLabel: 'D', pool: 'WALK_IN', price: 2000 }),
      set({ id: 2, rowLabel: 'D', pool: 'WALK_IN', price: 2500 }),
    ];
    expect(rowPriceLabel(mixedPriceWalkIn)).toBe('€20–€25 · at venue');
  });
});
