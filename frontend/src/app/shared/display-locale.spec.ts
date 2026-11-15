import {
  buildLocale,
  DISPLAY_LOCALE,
  intlLocaleFor,
  isLocaleId,
  localePath,
} from './display-locale';

describe('display locale', () => {
  it('displays English as en-IE and every other build in its own language', () => {
    expect(intlLocaleFor('en')).toBe('en-IE');
    expect(intlLocaleFor('sq')).toBe('sq');
    expect(intlLocaleFor('it')).toBe('it');
    expect(intlLocaleFor('de')).toBe('de');
  });

  it('is English under the source-locale build the unit tests run', () => {
    expect(buildLocale()).toBe('en');
    expect(DISPLAY_LOCALE).toBe('en-IE');
  });

  it('knows exactly the built locales', () => {
    expect(['en', 'sq', 'it', 'de'].every(isLocaleId)).toBe(true);
    expect(isLocaleId('fr')).toBe(false);
    expect(isLocaleId(undefined)).toBe(false);
  });

  it('formats a euro amount and a month per locale', () => {
    const amount = (locale: string) =>
      new Intl.NumberFormat(intlLocaleFor(locale as 'en'), { style: 'currency', currency: 'EUR' })
        .format(45)
        .replaceAll(/\s/g, ' ');
    expect(amount('en')).toBe('€45.00');
    expect(amount('it')).toBe('45,00 €');
    expect(amount('de')).toBe('45,00 €');
    const month = (locale: string) =>
      new Intl.DateTimeFormat(intlLocaleFor(locale as 'en'), {
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date('2026-08-01T00:00:00Z'));
    expect(month('sq')).toBe('gusht');
    expect(month('it')).toBe('agosto');
    expect(month('de')).toBe('August');
  });

  it('keeps an in-app path under the build subpath', () => {
    expect(localePath('/help')).toBe('/help');
    expect(localePath('/legal/terms', 'sq')).toBe('/sq/legal/terms');
    expect(localePath('/help', 'it')).toBe('/it/help');
  });
});
