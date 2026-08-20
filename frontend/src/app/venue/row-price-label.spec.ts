import { SetView } from '../shared/venue-views';
import { rowPriceLabel } from './row-price-label';

/**
 * The rail chip's wording rule (#702). Every case here is a row as the venue read model can
 * actually serve one: the V3 demo seed's descriptive labels ("Front row · Sea view",
 * "Row 4 · Back") and the bare `A`/`B`/`C` the operator layout editor writes for every venue
 * created in-product — which is why the tier and pool fallbacks exist at all.
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

describe('rowPriceLabel', () => {
  it('names a descriptive row by its first non-positional segment', () => {
    expect(rowPriceLabel(row('Front row · Sea view', 'PREMIUM', 'ONLINE', 4500))).toBe(
      '€45 · Front row',
    );
    // The seed's back row leads with its ordinal; the words after it are the meaning.
    expect(rowPriceLabel(row('Row 4 · Back', 'STANDARD', 'ONLINE', 3000))).toBe('€30 · Back');
  });

  it('falls back to the tier name for a positional-only premium row', () => {
    // What the operator layout editor writes today: a bare letter, no words of its own.
    expect(rowPriceLabel(row('A', 'PREMIUM', 'ONLINE', 5000))).toBe('€50 · Front row');
    expect(rowPriceLabel(row('Row 1', 'PREMIUM', 'ONLINE', 5000))).toBe('€50 · Front row');
  });

  it('leaves a positional-only standard row as the bare price', () => {
    expect(rowPriceLabel(row('Row 2', 'STANDARD', 'ONLINE', 3500))).toBe('€35');
    expect(rowPriceLabel(row('B', 'STANDARD', 'ONLINE', 3500))).toBe('€35');
    expect(rowPriceLabel(row('AA', 'STANDARD', 'ONLINE', 3500))).toBe('€35');
    expect(rowPriceLabel(row('Row 12', 'STANDARD', 'ONLINE', 3500))).toBe('€35');
  });

  it("reads a positional segment in the venue's own language, not just English", () => {
    // "Rreshti 4" restates the position exactly as "Row 4" does; "Prapa" carries the meaning.
    expect(rowPriceLabel(row('Rreshti 4 · Prapa', 'STANDARD', 'ONLINE', 3000))).toBe('€30 · Prapa');
    expect(rowPriceLabel(row('Fila B', 'STANDARD', 'ONLINE', 3000))).toBe('€30');
    expect(rowPriceLabel(row('Rreshti 1', 'PREMIUM', 'ONLINE', 5000))).toBe('€50 · Front row');
  });

  it('keeps a short word that only looks positional', () => {
    // Three letters is a word, not a row ordinal — the pattern must not eat it.
    expect(rowPriceLabel(row('VIP', 'STANDARD', 'ONLINE', 4500))).toBe('€45 · VIP');
    expect(rowPriceLabel(row('Row 3 · Bar', 'STANDARD', 'ONLINE', 4500))).toBe('€45 · Bar');
    // Two words are a name, however short the second: only a bare code or ordinal is positional.
    expect(rowPriceLabel(row('Sea view', 'STANDARD', 'ONLINE', 4500))).toBe('€45 · Sea view');
    expect(rowPriceLabel(row('2nd row · Back', 'STANDARD', 'ONLINE', 4500))).toBe('€45 · 2nd row');
  });

  it('states the at-venue channel for a walk-in row, price retained', () => {
    expect(rowPriceLabel(row('Row 5 · Walk-in', 'STANDARD', 'WALK_IN', 2500))).toBe(
      '€25 · at venue',
    );
    // Invariant #3's fact outranks both the venue's own words and the tier.
    expect(rowPriceLabel(row('Front row · Sea view', 'PREMIUM', 'WALK_IN', 5000))).toBe(
      '€50 · at venue',
    );
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
