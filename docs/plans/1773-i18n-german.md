# German (`de`) locale Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the SPA is built and served in German under `/de/`, and a guest who books or asks for an
account mail in German gets German mail with `/de/` links.

**Architecture:** ADR-0030's "adding a locale" list, nothing new: one row each in `angular.json`,
`shared.SiteLocale` (which `web`'s `SpaLocale` keys off), `core/locale.ts`, `shared/display-locale.ts`
and the inline seed, plus `messages.de.xlf`, `mail/messages_de.properties` and a forward migration
widening `booking_locale_check`.

**Source of intent:** #1773 (body + its three comments), ADR-0030.

**Branch:** `feature/1773-i18n-german`

## Acceptance criteria

- [ ] **AC-1:** Given the build lists `de`, when the server maps a path, then `/de/**` client routes fall
  back to `static/de/index.html` and `SiteLocale.fromCode("de")` is `DE`. *Seam:* `SpaLocale` /
  `SiteLocale` · *Pinned by:* `SpaLocaleTest.servedLocalesAreTheBuiltLocalesUnderTheirSubpaths`,
  `SiteLocaleTest`
- [ ] **AC-2:** Given a stay created with `SiteLocale.DE`, when it is stored, then `booking.locale` is
  `'de'` (the CHECK admits it). *Seam:* `booking::api` create → `booking` table · *Pinned by:*
  `BookingLocaleIT` (stores every `SiteLocale`)
- [ ] **AC-3:** Given a mail for a `DE` guest, when `SmtpMailer` renders it, then subject and body are
  German. *Seam:* `Mailer` port · *Pinned by:* `SmtpMailerLocaleIT` de rows, `MailCopyBundleTest`
  (every key, `MessageFormat`-safe apostrophes)
- [ ] **AC-4:** Given a crawler or a link preview, when it asks for a page, then `de` is one of the
  `hreflang` alternates and the sitemap lists the `/de/` URLs, and `/de/`'s home head is German.
  *Seam:* `LinkPreviews`, `SitemapXml` · *Pinned by:* `LinkPreviewsTest`, `SitemapXmlTest`
- [ ] **AC-5:** Given a first visit to `/` with a German browser, when the seed runs, then it lands on
  `/de/`; the language row offers "Deutsch". *Seam:* `firstVisitLocale` + `index.html` seed ·
  *Pinned by:* `locale.spec.ts`, `locale-boot.spec.ts`
- [ ] **AC-6:** Given the production build, when `/de/` pages load (tourist, operator, admin), then
  they render German with `lang="de"`. *Seam:* the built app · *Pinned by:* `e2e/locales/locales.e2e.ts`

## Non-goals

- Native-speaker review of the German (#1774); the legal pages (#101); Stripe's `de` element locale
  (#1783 maps it).

## Risks

- **R-1:** a missing `de` target fails the build → `npm run build` is the gate; the translations live as
  a `{id: target}` map re-applied with `npm run i18n:sync -- --fill de=…` after a merge.
- **R-2:** jar growth, one more copy of the bundles → measured before/after; posters and `vendor/`
  stay single (`prune-locale-copies.mjs`).
- **R-3:** Flyway number clash with #1785 (V84) → this slice takes **V85** and merges after #1785; if
  #1785 adds an operator locale CHECK, V85 widens it too.

## Open questions

### Resolved

- Formal *Sie* or *du*? → *Sie* throughout, machine-drafted; #1774 reviews.

## Execution status

- [x] Phase 1 — backend: `SiteLocale.DE`/`SpaLocale.DE`, German link-preview copy, test shell,
  `messages_de.properties` (+ per-locale date patterns `format.date`/`format.dayMonth`, so German
  writes `15. August 2026`), V85, the pinning tests above.
- [x] Phase 2 — frontend: locale rows, `messages.de.xlf` (from a `{id: target}` map, kept beside the
  wave's shared notes as `1773-de-translations.json`), specs, locale e2e. Build: 1660/1660 targets;
  the `de` copy adds 3.1 MB to a 35 MB static tree.
- [ ] Phase 3 — PR, review gate, Sonar, resolve against final main (#1785, #1783).
