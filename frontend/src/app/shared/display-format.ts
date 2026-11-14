import { formatCurrency, formatDate, formatNumber } from '@angular/common';

import { DISPLAY_LOCALE } from './display-locale';

/** The date shapes the app displays; each one is an `Intl` options set and its CLDR pattern twin. */
export type DateShape =
  | 'day'
  | 'day-month'
  | 'weekday-day-month'
  | 'weekday-day-month-year'
  | 'month-year'
  | 'weekday-day-month-time';

/** The zones a display reasons in: a civil day is anchored at UTC midnight, an instant in Tirane (#6). */
export type DisplayZone = 'UTC' | 'Europe/Tirane';

const INTL_SHAPES: Record<DateShape, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric' },
  'day-month': { day: 'numeric', month: 'short' },
  'weekday-day-month': { weekday: 'short', day: 'numeric', month: 'short' },
  'weekday-day-month-year': { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  'month-year': { month: 'long', year: 'numeric' },
  'weekday-day-month-time': {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  },
};

const CLDR_SHAPES: Record<DateShape, string> = {
  day: 'd',
  'day-month': 'd MMM',
  'weekday-day-month': 'EEE d MMM',
  'weekday-day-month-year': 'EEE d MMM y',
  'month-year': 'LLLL y',
  'weekday-day-month-time': 'EEE d MMM, HH:mm',
};

/**
 * Whether the browser's `Intl` carries `locale`'s data. Chromium ships none for Albanian and would
 * render `sq` in American English, so such a runtime formats from the CLDR data the localized build
 * bundles for its own locale instead (ADR-0030).
 */
export function intlHas(locale: string): boolean {
  return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0;
}

/** `Europe/Tirane`'s offset at `date` as Angular's `formatDate` takes it (`+0200`). */
function tiraneOffset(date: Date): string {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Tirane',
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  return match ? `${match[1]}${match[2]}${match[3]}` : '+0000';
}

/** A formatter for one date shape in one zone, in the display locale. */
export function displayDateFormat(
  shape: DateShape,
  zone: DisplayZone,
  locale: string = DISPLAY_LOCALE,
  useIntl: boolean = intlHas(locale),
): (date: Date) => string {
  if (useIntl) {
    const format = new Intl.DateTimeFormat(locale, { ...INTL_SHAPES[shape], timeZone: zone });
    return (date) => format.format(date);
  }
  return (date) =>
    formatDate(date, CLDR_SHAPES[shape], locale, zone === 'UTC' ? '+0000' : tiraneOffset(date));
}

/** Integer minor units as an amount in the display locale; whole amounts drop the cents (#5). */
export function displayMoney(
  minorUnits: number,
  currency: string,
  locale: string = DISPLAY_LOCALE,
  useIntl: boolean = intlHas(locale),
): string {
  const whole = minorUnits % 100 === 0;
  const amount = minorUnits / 100;
  if (useIntl) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  }
  return formatCurrency(
    amount,
    locale,
    currencySymbol(currency),
    currency,
    whole ? '1.0-0' : '1.2-2',
  );
}

/** A number with exactly `fractionDigits` decimals in the display locale. */
export function displayDecimal(
  value: number,
  fractionDigits: number,
  locale: string = DISPLAY_LOCALE,
  useIntl: boolean = intlHas(locale),
): string {
  if (useIntl) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }
  return formatNumber(value, locale, `1.${fractionDigits}-${fractionDigits}`);
}

function currencySymbol(currency: string): string {
  return currency === 'EUR' ? '€' : currency;
}
