import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import localeSq from '@angular/common/locales/sq';

import { displayDateFormat, displayDecimal, displayMoney, intlHas } from './display-format';

const SAT_14_NOV = new Date('2026-11-14T00:00:00Z');

describe('display formats', () => {
  beforeAll(() => {
    registerLocaleData(localeSq);
    registerLocaleData(localeIt);
  });

  it('formats through Intl where the runtime carries the locale', () => {
    expect(intlHas('en-IE')).toBe(true);
    expect(displayDateFormat('weekday-day-month-year', 'UTC', 'en-IE')(SAT_14_NOV)).toBe(
      'Sat 14 Nov 2026',
    );
    expect(displayMoney(4500, 'EUR', 'en-IE')).toBe('€45');
    expect(displayMoney(4550, 'EUR', 'en-IE')).toBe('€45.50');
    expect(displayDecimal(0.62, 1, 'en-IE')).toBe('0.6');
  });

  it('formats from the build-bundled CLDR data where the runtime lacks the locale (Chromium has no sq)', () => {
    const date = (shape: Parameters<typeof displayDateFormat>[0]) =>
      displayDateFormat(shape, 'UTC', 'sq', false)(SAT_14_NOV);
    expect(date('weekday-day-month-year')).toBe('sht 14 nën 2026');
    expect(date('day-month')).toBe('14 nën');
    expect(date('day')).toBe('14');
    expect(date('month-year')).toBe('nëntor 2026');
    expect(displayMoney(4500, 'EUR', 'sq', false).replaceAll(/\s/g, ' ')).toBe('45 €');
    expect(displayMoney(4550, 'EUR', 'sq', false).replaceAll(/\s/g, ' ')).toBe('45,50 €');
    expect(displayDecimal(0.62, 1, 'sq', false)).toBe('0,6');
  });

  it('keeps an instant in Tirane on both sides of the clock change (#6)', () => {
    const deadline = (iso: string) =>
      displayDateFormat('weekday-day-month-time', 'Europe/Tirane', 'it', false)(new Date(iso));
    // 18:00 UTC is 20:00 in Tirane in July (CEST) and 19:00 in November (CET).
    expect(deadline('2026-07-14T18:00:00Z')).toBe('mar 14 lug, 20:00');
    expect(deadline('2026-11-14T18:00:00Z')).toBe('sab 14 nov, 19:00');
  });
});
