import { formatMoney } from './money';

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
