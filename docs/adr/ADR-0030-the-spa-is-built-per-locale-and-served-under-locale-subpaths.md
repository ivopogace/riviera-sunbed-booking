# ADR-0030: The SPA is translated with Angular's built-in i18n, built once per locale and served under a subpath per locale

- **Status:** Accepted
- **Date:** 2026-11-14
- **Relates to:** ADR-0004 (same-origin hosting), ADR-0028 (the root holds the SPA's resource
  configuration), invariants #5, #6. Issue #1734 (its triage `## Decisions`), Angular's guides
  [Deploy multiple locales](https://angular.dev/guide/i18n/deploy) and
  [Merge translations into the application](https://angular.dev/guide/i18n/merge).

## Context

The tourists on the Albanian riviera are largely Italian and Albanian speakers, and the venue staff
are Albanian. The SPA was English only, with `index.html` fixed at `lang="en"`. The owner chose
Albanian (`sq`) and Italian (`it`) first, beside English, with German next. Spring serves the SPA
same-origin (ADR-0004), so how each language is served is part of the decision.

Two mechanisms were on the table: Angular's built-in i18n (`i18n` attributes and `$localize`,
compiled per locale), or a runtime translation library with an in-page switch.

## Decision

1. **Angular's built-in i18n, compiled per locale.** Templates mark copy with `i18n`
   (`i18n-aria-label` and the like for attributes), TypeScript with `$localize`. `ng build` inlines
   each locale's translations at build time, so there is no runtime library and no runtime cost, and
   each language has its own URL, which link previews (#1760) and `hreflang` (#1761) need. The cost is
   one build per locale; the inlining runs on the one compilation, so the build takes little longer.
2. **English is served from the root, the others under `/sq/` and `/it/`** (`angular.json`'s
   `sourceLocale` with `subPath: ""`). Each build carries its own `lang` and `<base href>`.
3. **Spring maps each subpath's client routes to that build's `index.html`.** `SpaLocale` (`web`,
   moved from the root package by #1760, keyed off `shared.SiteLocale` by #1770) is the one
   locale-to-shell mapping on the server; `SpaWebConfig`'s fallback resolver asks
   it which shell a path falls back to. A missing asset is still a `404` under every subpath, and
   `/api/**` never falls back. `SpaLocaleTest` pins `SpaLocale` to `angular.json`'s locales.
4. **The choice lives on the device, in `localStorage` (`riviera-locale`), like the theme.** The
   language row in the tourist menus stores it and loads the same route under the chosen subpath.
5. **A first load of `/` goes to the stored choice, then the browser's language list, then English.**
   The root shell's inline script does it before boot, by `location.replace`, and only on `/`: a deep
   link is served in the locale its URL names. `navigator.languages` is the list the browser sends as
   `Accept-Language`. The server cannot do it: it cannot read `localStorage`, and a language cookie
   would make the privacy policy's list of cookies ("a session cookie and a request-forgery-protection
   cookie") untrue, and the legal text is a human task (#101). An SSO sign-in is the one load of `/`
   that outranks the stored choice: the callback redirects to `/` alone, so `CustomerAuth.startSso`
   leaves a per-tab `sessionStorage` note of the build it left (`riviera-sso-locale`) and the seed
   consumes it first (#1772). The server never reads a locale, and the seed builds its target only from
   an allow-listed id, so a tampered note cannot leave the origin.
6. **A marked message without a translation fails the build** (`i18nMissingTranslation: error`).
   Translations live in XLIFF 1.2 files (`frontend/src/locale/messages.<locale>.xlf`), each unit with
   its English `<source>` beside the `<target>`, so a native speaker reviews one file per language.
   IDs are Angular's content hashes: a changed English sentence is a new message, so its old
   translation can never silently stand in for it. `npm run i18n:sync` keeps the files in step with
   the source.
7. **Dates and money display per locale; the data does not change.** Every display on a translated
   page goes through `shared/display-format.ts` in `DISPLAY_LOCALE` (`en-IE` for English, else the build's locale): by
   `Intl` where the browser carries the locale, else by the CLDR data the localized build bundles,
   since Chromium ships no Albanian data and would print `sq` in American English. Money stays integer
   minor units (#5) and days stay `Europe/Tirane` civil days (#6).
8. **The locale builds share the source locale's copies of `public/posters` and `vendor/`.** The app
   names both by absolute path, so `scripts/prune-locale-copies.mjs` deletes the other locales' copies
   after `ng build`, keeping the jar one set of posters heavy.

## Consequences

- `ng serve` builds the source locale only. The translated builds are checked against the
  production build by the locale e2e (`playwright.locales.config.ts`, CI's first a11y shard). A
  developer whose browser lists Albanian or Italian before English lands on `/sq/` or `/it/` under
  `ng serve`, which has no such build; picking English in the language row stores the choice and
  ends it.
- Unit specs run the source locale, so they keep asserting English.
- A link that opens a new tab, and a full page load of a router URL (`core/chunk-load-recovery.ts`'s
  reload), names its path with `localePath()`: the router prefixes only its own links with the base href.
- Translated so far: the tourist shell (menus, footer), Discover, the venue map, the booking dialog,
  payment, the confirmations, the booking view, `/for-venues`, `/help`, the not-found and
  page-load-failed pages, the sign-in card, the password and verification pages, Your account and My
  bookings, the operator and admin consoles (#1769) and the `ApiProblem` copy (#1771). Still English:
  the legal pages (legal text is #101's).
- Transactional mails follow the guest's language (#1770): the SPA sends its build locale with a booking
  or stay create, which `booking` stores, and with the account requests; the server renders
  `notification`'s per-locale message bundles and links under the locale's subpath. Still no cookie.
- Adding a locale is a row in `angular.json`, in `shared.SiteLocale` (which `SpaLocale` keys off), in
  `core/locale.ts`'s options, in `shared/display-locale.ts` and in the inline seed's list, plus its
  translation file, its mail bundle (`mail/messages_<code>.properties`) and a migration widening
  `booking_locale_check`.
