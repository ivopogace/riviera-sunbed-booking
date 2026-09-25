import { stayRule } from './stay-rule';

describe('stayRule', () => {
  it('states the maximum, agreeing the noun', () => {
    expect(stayRule(5)).toBe('Stays of up to 5 days at this venue.');
    expect(stayRule(1)).toBe('Stays of up to 1 day at this venue.');
  });

  it('reads any length when the venue sets no maximum', () => {
    expect(stayRule(null)).toBe('Stays of any length this season.');
    expect(stayRule(undefined)).toBe('Stays of any length this season.');
  });
});
