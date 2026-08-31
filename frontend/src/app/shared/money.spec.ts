import { formatMoney, formatMoneyRange } from './money';

describe('formatMoney', () => {
  it('drops the cents for a whole-euro amount', () => {
    expect(formatMoney({ minorUnits: 4500, currency: 'EUR' })).toBe('€45');
  });

  it('shows two decimals for a fractional amount', () => {
    expect(formatMoney({ minorUnits: 4550, currency: 'EUR' })).toBe('€45.50');
  });

  it('formats zero', () => {
    expect(formatMoney({ minorUnits: 0, currency: 'EUR' })).toBe('€0');
  });
});

describe('formatMoneyRange', () => {
  it('renders equal amounts as the single price', () => {
    expect(
      formatMoneyRange([
        { minorUnits: 3500, currency: 'EUR' },
        { minorUnits: 3500, currency: 'EUR' },
      ]),
    ).toBe('€35');
  });

  it('renders one amount as its single price', () => {
    expect(formatMoneyRange([{ minorUnits: 4500, currency: 'EUR' }])).toBe('€45');
  });

  it('renders mixed amounts as the min–max span, whatever the input order', () => {
    expect(
      formatMoneyRange([
        { minorUnits: 4500, currency: 'EUR' },
        { minorUnits: 3500, currency: 'EUR' },
        { minorUnits: 4000, currency: 'EUR' },
      ]),
    ).toBe('€35–€45');
  });

  it('keeps two decimals on a fractional bound only', () => {
    expect(
      formatMoneyRange([
        { minorUnits: 2250, currency: 'EUR' },
        { minorUnits: 3000, currency: 'EUR' },
      ]),
    ).toBe('€22.50–€30');
  });
});
