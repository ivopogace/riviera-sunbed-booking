# robots.txt and a generated sitemap Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `GET /robots.txt` keeps crawlers off every signed-in and booking surface and names the
sitemap; `GET /sitemap.xml` lists the tourist pages (`/`, `/for-venues`, `/help`, `/venues/{id}` per
tourist-visible venue) in every served locale, with `hreflang` alternates, on absolute URLs from a
configured public origin.

**Architecture:** both endpoints are `web`'s: the crawl policy of the public edge, beside the route
policy whose gated areas robots.txt restates for crawlers. `web` gains `venue::api` + `::vocabulary`
for one new fenced read on its own role-named port, `PublicVenueIndex.visibleVenueIds()`
(`VenueApiRoleSplitTests` keeps `VenueCatalog` to `venue` and `itinerary`). The root's `SpaLocale` is
unreachable from a module (`CompositionRootDisciplineTests`), so `web` re-lists the served locales and
a test pins that list to `frontend/angular.json`, as `SpaLocaleTest` pins `SpaLocale`.

**Source of intent:** issue #1761 (slice 3 of #1733); ADR-0030 for the locale subpaths.

**Branch:** `feature/1761-robots-sitemap`

## Acceptance criteria

- [ ] **AC-1:** Given a venue with an `ACTIVE` owner, one with a `PENDING`/`SUSPENDED` owner and one
  with no owner, when `visibleVenueIds()` is read, then only the first is listed, ascending.
  *Seam:* `PublicVenueIndex` · *Pinned by:* `CrawlSurfaceIT.sitemapListsVisibleVenuesOnly`
- [ ] **AC-2:** Given `riviera.web.public-origin=https://riviera.test`, when `/sitemap.xml` is fetched
  anonymously, then it is a sitemaps.org `urlset` whose every `loc` is an absolute `https` URL on that
  origin, listing `/`, `/for-venues`, `/help` and `/venues/{id}` per visible venue in `en`, `sq`, `it`,
  each `url` carrying `xhtml:link` alternates for all three plus `x-default`, and no `/booking` URL.
  *Seam:* `GET /sitemap.xml` · *Pinned by:* `CrawlSurfaceIT`, `SitemapDocumentTest`
- [ ] **AC-3:** Given any configuration, when `/robots.txt` is fetched anonymously, then it disallows
  `/operator`, `/admin`, `/account`, `/booking`, `/my-bookings`, `/venue-admin` (and their `/sq/`,
  `/it/` forms) and `/api`, and names `<origin>/sitemap.xml`. *Seam:* `GET /robots.txt` · *Pinned by:*
  `CrawlSurfaceIT.robotsDisallowsPrivateSurfacesAndNamesTheSitemap`, `CrawlerControllerTest`
- [ ] **AC-4:** Given `riviera.web.robots.disallow-all=true`, when `/robots.txt` is fetched, then it is
  `Disallow: /` for every agent and names no sitemap. *Seam:* `CrawlerController` · *Pinned by:*
  `CrawlerControllerTest.disallowAllShutsEveryCrawlerOut`; documented in `docs/deploy/cd-pipeline.md`.
- [ ] **AC-5:** Given no public origin, when the app boots, then `/sitemap.xml` answers `404` and
  robots.txt names no sitemap; given a value that is not a bare `https` origin, the boot aborts.
  *Seam:* `PublicWebProperties` · *Pinned by:* `PublicWebPropertiesTest`, `CrawlerControllerTest`
- [ ] **AC-6:** Both endpoints are reachable anonymously and listed: `EndpointRoleGateCoverageTest`
  `DECLARED_REACHABLE`, `SecurityConfig`'s SPA chain names them.
- [ ] **AC-7:** `web`'s served-locale list equals `frontend/angular.json`'s locales. *Pinned by:*
  `ServedLocaleTest`

## Non-goals

- Meta tags (#1760), titles (#1733), slugs, search-console submission, `lastmod`.
- A sitemap index: one file holds 50 000 URLs, i.e. ~16 600 venues at three locales.

## Risks

- **R-1:** a hidden venue leaks into the sitemap → the read fences through `VenueVisibility`, the one
  home of the rule, pinned by AC-1 with each non-`ACTIVE` status.
- **R-2:** absolute URLs built from the request `Host` (host-header poisoning) → only the configured
  origin is used; validated at boot.
- **R-3:** a booking code reaching the sitemap (#7) → only venue ids and fixed pages are emitted; AC-2
  asserts no `/booking` URL.
- **R-4:** a new `web` edge dependency breaks web slices → `WebSliceStubs` gains a `PublicVenueIndex` bean; `@ApplicationModuleTest`s are checked by the full suite in CI.
- **R-5:** crawler load → one id query plus one visibility batch per request, `Cache-Control:
  public, max-age=3600`.

## Open questions

### Resolved

- "Retired venue" in the issue: there is no venue retirement (sets retire, ADR-0019); a venue leaves
  tourist view only through `VenueVisibility`. "Hidden or retired" is that rule.
- `/my-bookings` and `/venue-admin` are signed-in SPA routes the issue's list missed; disallowed too.

## Modulith

- New port `venue.api.PublicVenueIndex.visibleVenueIds()` — owner `venue` (tourist visibility, §venue),
  consumer `web`; its own role because `VenueApiRoleSplitTests` admits only `venue` and `itinerary` to
  `VenueCatalog`. Implemented by `JdbcVenueCatalog`, which already holds the `VenueVisibility` fence.
- `web` grant `venue::api` + `venue::vocabulary` (`VenueId`); `RESPONSIBILITIES.md` §web Job and
  dependency list updated. Structural net + `ModularityTests` pin it.

## Phases

- **Phase 0 — venue read:** `PublicVenueIndex.visibleVenueIds()` fenced on visibility · red `CrawlSurfaceIT.sitemapListsVisibleVenuesOnly` (via the endpoint) / adapter.
- **Phase 1 — origin + locales:** `PublicWebProperties`, `ServedLocale` · red `PublicWebPropertiesTest`, `ServedLocaleTest`.
- **Phase 2 — documents:** robots text + sitemap XML · red `CrawlerControllerTest`, `SitemapDocumentTest`.
- **Phase 3 — wiring:** controller, route policy, coverage list, docs · red `EndpointRoleGateCoverageTest`, `CrawlSurfaceIT`.

## Execution status

**Stage pointer:** PR — CI, then review gate

**Next action:** open the PR, watch CI, mark ready, run `/code-review` at high effort.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — venue read | ✅ | first commit |
| 1 — origin + locales | ✅ | first commit |
| 2 — documents | ✅ | first commit |
| 3 — wiring | ✅ | first commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

RED proof: with the fence removed from `JdbcVenueCatalog.visibleVenueIds()` (`.filter(visible::contains)`
replaced by an always-true filter), `CrawlSurfaceIT.sitemapListsVisibleVenuesOnly` fails on the hidden
venues' URLs; restored, green.
