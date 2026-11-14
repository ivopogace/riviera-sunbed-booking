# Link preview tags in the served shell — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a venue link pasted into WhatsApp/Viber/Instagram previews with the venue's name, beach,
a one-line description and its cover photo, because Spring writes the title, description,
canonical, `hreflang`, Open Graph and Twitter tags into the `index.html` it serves; private routes
are served `noindex` and carry no venue or booking value.

**Architecture:** the shell is served by `web` (the HTTP boundary), not the root: the tag injection
needs `venue::api`, and the root reaches no module (ADR-0028 Decision 1). So `SpaLocale` and
`SpaWebConfig` move from the root into `web/adapter/in`, still the one locale→shell mapping, and a
new `SpaShellController` there serves the routes that need a head of their own. `venue` gains one
narrow tourist read, `VenueCatalog.findLinkPreview`, behind the same visibility fence as the map.

**Source of intent:** issue #1760 (slice 2 of #1733), its close-out note from #1733 (title shape and
beach display label), ADR-0030 (locale subpaths), ADR-0004 (same-origin).

**Branch:** `feature/1760-link-preview-tags`

## Acceptance criteria

- [ ] **AC-1:** Given a tourist-visible venue with a cover photo, when `GET /venues/{id}` (and
  `/sq/venues/{id}`, `/it/venues/{id}`) is served, then the shell carries `<title>` and `og:title`
  `{name}, {beach label} — Riviera`, `description`/`og:description` from the venue's description
  (first line, whitespace collapsed, capped), `og:image` = the public origin + the cover banner URL,
  `og:url` = `<link rel="canonical">` = origin + locale subpath + `/venues/{id}` (no query), and
  `hreflang` alternates `en`/`sq`/`it`/`x-default`. *Seam:* HTTP `GET /venues/{id}` over the real
  `VenueCatalog` · *Pinned by:* `LinkPreviewShellIT.visibleVenueGetsItsOwnTags`,
  `…localeShellGetsItsOwnCanonical`
- [ ] **AC-2:** Given a hidden (owner not `ACTIVE`) or unknown venue id, or a non-numeric id, when
  its page is served, then it carries the generic tags plus `noindex`, never the venue's name, and
  is `200` (the SPA owns not-found). *Seam:* HTTP · *Pinned by:*
  `LinkPreviewShellIT.hiddenVenueGetsGenericTagsAndNoName`, `SpaShellControllerTest.unknownAndMalformedIdsGetGenericTags`
- [ ] **AC-3:** Given `/booking/{code}` (and `/account/**`, `/operator/**`, `/admin/**`,
  `/my-bookings`, each under every locale), when served, then the shell carries
  `<meta name="robots" content="noindex">`, no canonical, no `og:*`, and the path's code appears
  nowhere in the HTML (#7). *Seam:* HTTP · *Pinned by:* `LinkPreviewShellIT.bookingPageIsNoindexAndCarriesNoCode`,
  `SpaShellControllerTest.privateRoutesAreNoindex`
- [ ] **AC-4:** Given a venue named `<script>alert("x")</script> & 'Co' $1`, when its page is
  served, then every value is HTML-escaped and the `$1` survives literally. *Seam:*
  `LinkPreviewTags.render` · *Pinned by:* `LinkPreviewShellIT.venueValuesAreEscaped`,
  `LinkPreviewTagsTest.escapesEveryValue`
- [ ] **AC-5:** Given `riviera.web.public-origin` is unset, when any page is served, then no
  absolute-URL tag (canonical, `og:url`, `og:image`, `hreflang`) is emitted, and the request's
  `Host` is never read; a malformed origin fails startup. *Seam:* `PublicOrigin` · *Pinned by:*
  `PublicOriginTest`, `SpaShellControllerTest.noOriginMeansNoAbsoluteUrls`
- [ ] **AC-6:** Given `/`, `/sq/`, `/it/`, when served, then each carries the generic tags in its
  locale with its own canonical and the alternates (`x-default` = `/`). *Seam:* HTTP · *Pinned by:*
  `SpaShellControllerTest.homeGetsGenericTagsPerLocale`
- [ ] **AC-7:** The SPA serving behaviour is unchanged otherwise (deep-link fallback per locale,
  missing asset `404`, `/api/**` never the shell). *Pinned by:* the moved `SpaShellTest`,
  `SpaFallbackResolverTest`, `SpaLocaleTest`.
- [ ] **AC-8:** `Beach.label()` matches the frontend mirror's labels (`shared/beaches.ts`). *Pinned
  by:* `BeachLabelMirrorTest`.
- [ ] **AC-9:** The structural net passes with the new `web` → `venue::api` + `venue::vocabulary` grant.

## Non-goals

- Slugs, JSON-LD, `robots.txt`/sitemap (#1761), SPA route titles (#1733).
- Tags on routes other than home, venue and the private set (`/help`, `/for-venues` keep the bare shell).
- A `404` status for an unknown venue (the SPA owns not-found; unchanged).

## Risks

- **R-1: booking code leak (#7)** → private routes emit no URL tag at all; the IT asserts the code is
  absent from the body.
- **R-2: hidden venue leak** → `findLinkPreview` applies the same `VenueVisibility` fence as
  `findVenueMap`; hidden and unknown render the identical generic head (no oracle).
- **R-3: HTML/attribute injection** → one escaping point (`HtmlUtils.htmlEscape`, UTF-8) for every
  value in `LinkPreviewTags`; insertion uses literal string ops, never a regex replacement string.
- **R-4: Host-header poisoning** → absolute URLs only from the configured origin; validated at boot.
- **R-5: stale or cached per-venue HTML** → rendered per request, `Cache-Control: no-cache`, no
  resource-chain caching of the rendered body.
- **R-6: moving root beans breaks `@ApplicationModuleTest`s / `@WebMvcTest`s** → the new controller is
  picked up by every `@WebMvcTest`; `WebSliceStubs` already serves `VenueCatalog`. Full suite before push.

## Open questions

### Resolved

- Placement → `web` (ADR-0028 Decision 1 forbids the root reaching `venue::api`); `SpaLocale` and
  `SpaWebConfig` move with it so there is still one locale mapping. ADR-0028/0030 amended.
- Origin property → `riviera.web.public-origin` (env `RIVIERA_PUBLIC_ORIGIN`), shared with #1761.
- Generic copy per locale → server-side, three strings per locale, in `LinkPreviewCopy`; flagged for
  #1774's native-speaker review.

## Modulith

- **New read:** `VenueCatalog.findLinkPreview(VenueId) → Optional<VenueLinkPreview>` (owner `venue`,
  a tourist read so it belongs on `VenueCatalog`; `VenueApiRoleSplitTests`). `VenueLinkPreview` in
  `venue::vocabulary`. Consumer: `web`'s `SpaShellController`. Pinned by `VenueLinkPreviewIT`.
- **`Beach.label()`**: the display label moves into the backend vocabulary (the frontend keeps its
  mirror); pinned by `BeachLabelMirrorTest`.
- **Grant:** `web` += `venue::api`, `venue::vocabulary`. No cycle (`venue` never reaches `web`).
- **Root:** `SpaLocale`, `SpaWebConfig` leave the root; `RESPONSIBILITIES.md` §`web` takes "the SPA
  shell", the root keeps `/map/**` (`MapResourcesConfig`).

## Phases

- **Phase 0 — move SPA serving into `web`:** pure move, existing tests moved and green.
- **Phase 1 — `Beach.label()` + `findLinkPreview`:** red `BeachLabelMirrorTest`, `VenueLinkPreviewIT`.
- **Phase 2 — `PublicOrigin`, `LinkPreviewTags`, `LinkPreviewCopy`:** red `PublicOriginTest`, `LinkPreviewTagsTest`.
- **Phase 3 — `SpaShellController`:** red `SpaShellControllerTest`, `LinkPreviewShellIT`; grant; docs.

## Execution status

**Stage pointer:** `implement (phase 0)`

**Next action:** move `SpaLocale`/`SpaWebConfig` and their tests into `web/adapter/in`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — move SPA serving into `web` | ⏳ | |
| 1 — `Beach.label()` + `findLinkPreview` | | |
| 2 — origin, tags, copy | | |
| 3 — controller, grant, docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
