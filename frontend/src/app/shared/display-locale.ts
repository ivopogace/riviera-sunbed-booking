/** A locale the SPA is built in (ADR-0030); `angular.json`'s `i18n` block and `SpaLocale` list the same. */
export type LocaleId = 'en' | 'sq' | 'it';

const LOCALE_IDS: ReadonlySet<string> = new Set<LocaleId>(['en', 'sq', 'it']);
const SOURCE_LOCALE: LocaleId = 'en';

export function isLocaleId(value: string | null | undefined): value is LocaleId {
  return value != null && LOCALE_IDS.has(value);
}

/** The locale this build was compiled for; `$localize.locale` is unset in the source-locale dev build. */
export function buildLocale(): LocaleId {
  const compiled = (globalThis as { $localize?: { locale?: string } }).$localize?.locale;
  return isLocaleId(compiled) ? compiled : SOURCE_LOCALE;
}

/**
 * The `Intl` locale every date and money display uses: the build's language, with English as
 * `en-IE` (day before month, the euro sign first). Pinned per build, never the runtime default, so
 * output is deterministic; the data stays minor units (#5) and `Europe/Tirane` days (#6).
 */
export function intlLocaleFor(locale: LocaleId): string {
  return locale === SOURCE_LOCALE ? 'en-IE' : locale;
}

export const DISPLAY_LOCALE = intlLocaleFor(buildLocale());

/**
 * An absolute in-app path under the running build's subpath (`/help` → `/sq/help`), for a plain
 * `href` the router does not prefix, such as a link that opens a new tab.
 */
export function localePath(path: string, locale: LocaleId = buildLocale()): string {
  return locale === SOURCE_LOCALE ? path : `/${locale}${path}`;
}
