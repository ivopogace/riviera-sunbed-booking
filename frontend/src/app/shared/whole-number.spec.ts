import { parseWholeNumber } from './whole-number';

describe('parseWholeNumber', () => {
  it('parses clean digit strings to a non-negative integer', () => {
    expect(parseWholeNumber('0')).toBe(0);
    expect(parseWholeNumber('20')).toBe(20);
    expect(parseWholeNumber('  15  ')).toBe(15); // surrounding whitespace is trimmed
  });

  it('rejects non-digit / fractional / empty input as undefined (never truncates)', () => {
    expect(parseWholeNumber('4.5')).toBeUndefined();
    expect(parseWholeNumber('12abc')).toBeUndefined();
    expect(parseWholeNumber('-3')).toBeUndefined();
    expect(parseWholeNumber('')).toBeUndefined();
    expect(parseWholeNumber('   ')).toBeUndefined();
  });
});
