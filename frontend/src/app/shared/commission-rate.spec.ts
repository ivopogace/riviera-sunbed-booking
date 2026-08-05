import {
  commissionBpsToPercentInput,
  commissionPercentToBps,
  formatCommissionPercent,
} from './commission-rate';

/**
 * The percent↔bps boundary (A8, epic #348). Two properties carry the whole file: the formatter is
 * byte-identical to the two inline `${bps / 100}%` expressions it was promoted from (so the operator
 * console's output cannot drift), and the parser never returns a number it had to invent — junk,
 * blank and out-of-range all answer `null` rather than a coerced 0.
 */
describe('formatCommissionPercent', () => {
  it('renders the stored basis points as a percentage, without trailing zeros', () => {
    expect(formatCommissionPercent(1500)).toBe('15%');
    expect(formatCommissionPercent(1550)).toBe('15.5%');
    expect(formatCommissionPercent(1533)).toBe('15.33%');
  });

  it('renders the two ends of the range', () => {
    expect(formatCommissionPercent(0)).toBe('0%');
    expect(formatCommissionPercent(10000)).toBe('100%');
  });
});

describe('commissionBpsToPercentInput', () => {
  it('seeds a number input with the plain percent', () => {
    expect(commissionBpsToPercentInput(1500)).toBe('15');
    expect(commissionBpsToPercentInput(1250)).toBe('12.5');
    expect(commissionBpsToPercentInput(0)).toBe('0');
  });
});

describe('commissionPercentToBps', () => {
  it('converts a percent to the exact basis points that will be stored', () => {
    expect(commissionPercentToBps('15')).toBe(1500);
    expect(commissionPercentToBps('12.5')).toBe(1250);
    expect(commissionPercentToBps(' 8.75 ')).toBe(875);
  });

  it('accepts both ends of the range', () => {
    expect(commissionPercentToBps('0')).toBe(0);
    expect(commissionPercentToBps('100')).toBe(10000);
  });

  it('rounds to whole basis points rather than carrying a fraction onto the wire', () => {
    expect(commissionPercentToBps('15.004')).toBe(1500);
    expect(commissionPercentToBps('15.006')).toBe(1501);
  });

  it('survives binary-float multiplication', () => {
    // 15.35 * 100 is 1535.0000000000002 in IEEE 754; truncation would store 1534.
    expect(commissionPercentToBps('15.35')).toBe(1535);
    expect(commissionPercentToBps('8.61')).toBe(861);
  });

  it('refuses a blank field instead of reading it as zero commission', () => {
    expect(commissionPercentToBps('')).toBeNull();
    expect(commissionPercentToBps('   ')).toBeNull();
  });

  it('refuses junk rather than keeping its readable prefix', () => {
    expect(commissionPercentToBps('15abc')).toBeNull();
    expect(commissionPercentToBps('abc')).toBeNull();
  });

  it('refuses a rate outside 0..100 percent', () => {
    expect(commissionPercentToBps('-1')).toBeNull();
    expect(commissionPercentToBps('100.01')).toBeNull();
    expect(commissionPercentToBps('101')).toBeNull();
  });
});
