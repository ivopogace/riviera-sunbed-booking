import { plural, pluralOf } from './plural';

describe('plural', () => {
  it('agrees a regular English noun with its count', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(3, 'day')).toBe('3 days');
  });
});

describe('pluralOf', () => {
  it('picks the one form for exactly 1 and the other form for every other count', () => {
    expect(pluralOf(1, '1 ditë', 'x ditë')).toBe('1 ditë');
    expect(pluralOf(0, 'one', 'other')).toBe('other');
    expect(pluralOf(2, 'one', 'other')).toBe('other');
  });
});
