# LIGHTBOX Photo Surface Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A photo opened in the lightbox is served a rendition sized for the lightbox's own
near-square box, so a 3:2 upload renders 2200 × 1467 and a 2:3 upload 1200 × 1800 — both an exact
DPR-2 match for the box's 1100 × 900 CSS-px maximum — instead of being stretched from the 8:3
`BANNER` box.

**Architecture:** One new `PhotoSurface` value, `LIGHTBOX`, with a fit-within box of
**2200 × 1800**, stored at **scale 1 only** — the box already carries the density, so a `scale`
axis on top of it would double-count. The decision that shapes everything else is that the lightbox
must get its **own candidate list**: it currently shares `VenueMapView.photos` with the beach-map
band and the gallery grid, and folding a 2200w candidate into that shared list would offer it to
those two, whose `sizes` would take it. So `VenueMapView` gains a second list built from a
`LIGHTBOX → BANNER → CARD → PREVIEW` preference, which is also the un-backfillable fallback:
a photo stored before this surface existed resolves to `BANNER` exactly as it does today.

That this slice *adds* a preference list — the very construct #1059 proposed deleting — is
deliberate and recorded. `.out-of-scope/photo-width-ladder.md` names surfaces multiplying as the
condition that reopens the ladder question; this is the first of the increments it counts.

**Persistence:** JDBC only (invariant #1). `venue_photo_variant` gains no column; migration **V57**
widens `venue_photo_variant_surface_check` to admit `'LIGHTBOX'`. V56's
`UNIQUE (photo_id, surface, scale)` already admits the new row without change, and no index is
added — the serving lookup keys on `(venue_id, content_hash)` and the read model's grouping query
is unchanged.

**Source of intent:** GitHub issue #1070 (the outcome of #1059's intake grill; #1059 closed
`wontfix` with `.out-of-scope/photo-width-ladder.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — re-grilled this plan
against the tree after both blockers merged; falsified the stale R-2 and corrected the issue's
display-box formula) · `riviera-plan-doc` (this template — forced the shared-`photos`-array problem
into the Architecture line and the measured byte regression into the risk register instead of
leaving either for review) · `tdd` (phase 1 red-greens the processor bound and the CHECK, phase 2
the read model, phase 3 the frontend) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (ran the counting sweep for "the two tourist surfaces"
over the whole tree at plan time — eight live statements, each judged in *The counting sweep*
below; re-run over the slice's own range at close-out) · `postgres` (CHECK-over-ENUM is the settled
shape here, so the migration widens the existing `CHECK (surface IN …)` rather than introducing a
type; no new index) · `riviera-modulith` (placement: `LIGHTBOX` belongs in the published
`venue.vocabulary` enum, the new view field in the published `VenueMapView` record; no new port, no
event, no `allowedDependencies` change) · `riviera-java-conventions` (§6a — the new bound is named
constants beside `BANNER_W`/`_H`, never inline; §6c — `PhotoSurface`'s, `PhotoProcessor`'s and
`StoredVariant`'s Javadoc are touched blocks and get re-read whole) · `codebase-design` (no new
seam: `PhotoProcessor` stays a deep module behind one method, and the read model keeps deriving
both views from one blob-free query) · `domain-modeling` (`LIGHTBOX` enters `CONTEXT.md` beside the
other surfaces; ADR-0008 takes an amendment-log entry, not a new ADR — the storage decision is
unchanged, only its measured footprint and one declined option) · `riviera-frontend` (placement:
the view mirror stays in `shared/venue-views.ts`, the `venue` feature remains editor of record) ·
`angular-developer` + angular-cli MCP `search_documentation` v22 (measured against the installed
`@angular/common` 22.1.4: the lightbox's `sizes` is never consulted by an engine honouring
`sizes=auto`, so this slice touches no `sizes` value — R-9) · `playwright-cli` (the fallback path —
a photo with no `LIGHTBOX` row — and the candidate the engine actually settles on are only
observable in a real engine).

**Branch:** `claude/issue-1070-lightbox-surface-wup6dw` — the cloud session's designated remote
branch, standing in for `feature/lightbox-photo-surface` per `riviera-sdlc` § *Remote / cloud
session addendum*. Cut from `main` at `11f6eeb8`, which already carries both blockers (#1069 via
PR #1071, #1072 via PR #1073).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a 3:2 upload of 4000 × 2667, when it is processed, then a `LIGHTBOX@1` rendition of **2200 × 1467** is among the stored variants. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.rendersALightboxRenditionBoundByWidthForALandscapeUpload`
- [ ] **AC-2:** Given a 2:3 portrait upload of 2667 × 4000, when it is processed, then the `LIGHTBOX@1` rendition is **1200 × 1800** — bound by the box's HEIGHT, and taller than the 640 × 960 `BANNER@2` it replaces. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.rendersALightboxRenditionBoundByHeightForAPortraitUpload`
- [ ] **AC-3:** Given a 1600 × 1200 upload (1.92 MP, under the 3.63 MP a 4:3 `LIGHTBOX` would need), when it is processed, then **no** `LIGHTBOX` rendition is stored and the five existing renditions are unchanged — `isNotUpscaled` governs it as it governs the retina tier. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.omitsTheLightboxRenditionRatherThanUpscaleASmallUpload`
- [ ] **AC-4:** Given a venue whose cover photo has a `LIGHTBOX` row, when `findVenueMap` is called, then the returned view's `lightboxPhotos` carries the `LIGHTBOX` candidate and its `photos` list is **equal to the list the same fixture produces without the `LIGHTBOX` row** — the band and gallery selection must not move. *Seam:* `venue.api.VenueCatalog#findVenueMap` · *Pinned by:* `VenuePhotoReadModelIT.publishesLightboxCandidatesWithoutDisturbingTheBannerList`
- [ ] **AC-5:** Given a venue whose photos predate this surface (no `LIGHTBOX` row), when `findVenueMap` is called, then `lightboxPhotos` falls back to the `BANNER` view and the cover still renders. *Seam:* `venue.api.VenueCatalog#findVenueMap` · *Pinned by:* `VenuePhotoReadModelIT.fallsBackToBannerForAPhotoStoredBeforeTheLightboxSurface`
- [ ] **AC-6:** Given a cover slot holding `CARD` + `BANNER` + `LIGHTBOX`, and one holding `CARD` + `LIGHTBOX` only, when `findVenueMap` is called, then the first yields a `coverPhoto` and the second yields `null` — `LIGHTBOX` neither joins nor satisfies the complete-pair guard. *Seam:* `JdbcVenueCatalog#coverOf` · *Pinned by:* `VenuePhotoReadModelIT.keepsTheCoverPairGuardOnCardAndBannerAlone`
- [ ] **AC-7:** Given a `venue_photo_variant` row with `surface = 'LIGHTBOX'`, when V57 has run, then the insert succeeds; and given `surface = 'POSTER'`, then it is rejected by `venue_photo_variant_surface_check`. *Seam:* the `venue_photo_variant` table constraint · *Pinned by:* `JdbcPhotoStorageIT.admitsLightboxAndStillRejectsAnUnknownSurface`
- [ ] **AC-8:** Given the venue page at 1440 × 900 at DPR 2, when a photo **with** a `LIGHTBOX` row is opened in the lightbox, then the rendered `<img>`'s `currentSrc` is the `LIGHTBOX` candidate; and when a photo **without** one is opened, it is the `BANNER@2` candidate. *Seam:* the `/venue/:venueId` route's rendered lightbox `<img>` · *Pinned by:* `venue-lightbox-candidates.e2e.ts`
- [ ] **AC-9:** Given the same page, when the lightbox is open on a photo with a `LIGHTBOX` row, then the beach-map band's and the gallery hero's `currentSrc` are the `BANNER` candidates they fetch today. *Seam:* the same route · *Pinned by:* `venue-lightbox-candidates.e2e.ts`
- [ ] **AC-10:** Given the admin photo-moderation slot read, when a venue's photos carry a `LIGHTBOX` row, then each slot still resolves its `PREVIEW` variant. *Seam:* `VenuePhotoService#slotsOf` · *Pinned by:* `VenuePhotoServiceTest.resolvesTheOperatorSlotFromPreviewEvenWithALightboxRow`
- [ ] **AC-11:** Given ADR-0008 and `CONTEXT.md`, when the slice is done, then each states the four-surface vocabulary, the amended stored-footprint figures, and the `BANNER` scale-3 decision. *Seam:* the substrate docs · *Pinned by:* the `riviera-docs-freshness` pass at close-out

## Non-goals

- Backfilling existing photos. The full-res original is discarded at upload (ADR-0008); a
  `LIGHTBOX` row appears only on re-upload. AC-5 is the guarantee that this degrades cleanly.
- Adding a `scale`-2 `LIGHTBOX` rendition. 2200 × 1800 already *is* the DPR-2 size for the box.
- Changing the lightbox's `sizes`. Measured (R-9): with a `LIGHTBOX` row present the lightbox
  publishes one candidate and renders no `srcset` at all, so `sizes` drives nothing; without one it
  drives the same two-candidate choice it drives today.
- Touching `CONTAIN_SIZES`' band, `galleryHero` or `gallerySideTile` values. AC-9 pins that the two
  surfaces they govern do not move.
- Offering the `LIGHTBOX` candidate to the gallery hero. It would close the hero's measured 11%
  DPR-3 shortfall at no new stored bytes, but it changes a consumer's candidate list, which AC-9
  forbids. Recorded as the cheaper successor in the ADR amendment.
- Flipping ADR-0008's object-storage decision. The footprint figures are amended; the decision and
  its flip threshold are re-read, not changed.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. `LIGHTBOX` is added beside the existing surfaces; every
existing surface keeps its renditions, its candidate list and its consumers. AC-4, AC-6 and AC-9
are the verification that "adds only" is true rather than aspirational.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The 2200w candidate leaks into the band's or the gallery's `srcset` and the LCP image balloons | med | **high** | The lightbox gets its own list on `VenueMapView`; the shared `photos` array is left alone. AC-4 asserts the banner list is unchanged and AC-9 asserts the two rendered surfaces still fetch what they fetch today | agent | open |
| R-2 | `PhotoProcessorTest`'s `200_000 * scale * scale` byte cap silently stops constraining, because `LIGHTBOX@1` is a scale-1 rendition larger than every scale-2 one | **high** | med | **Falsified by measurement — closed, no action.** The cap is *tighter* on `LIGHTBOX@1` than on any other rendition, not looser: on the test's own fixture `LIGHTBOX@1` is 64,521 B against its 200,000 B budget (3.1× headroom) where `BANNER@2` is 20,664 B against 800,000 B (39×). The guard is non-monotone in rendition size, which is worth a note in the ADR, not a test rewrite inside this slice | agent | **resolved** |
| R-3 | Stored footprint grows past what ADR-0008 sized its `bytea` decision for | med | med | Measured through the real pipeline, photo-like content: `LIGHTBOX@1` adds 72–112 KB per photo depending on aspect (mean 93 KB across five aspects), against 135–565 KB for a whole photo today. A three-slot venue goes from ≈0.4–1.7 MB to ≈0.6–2.0 MB. AC-11 amends the ADR's figures and re-reads its flip threshold | agent | open |
| R-4 | A phone opening the lightbox now downloads a 2200w rendition where it used to take `BANNER@2` | **certain** | med | **Accepted, and the cost of the settled "its own candidate list" scope.** Measured: at 390 × 844 at DPR 2 the box is 358 CSS px and the engine asks 716 device px, which `BANNER@1` (720w, 22.9 KB) covered; a single `LIGHTBOX` candidate serves 2200w (99 KB) instead. It is one image on a deliberate tourist action, never the LCP element. The alternative — a merged `LIGHTBOX + BANNER` ladder — is #1059's rejected design AND is non-monotone past ≈2.3:1, where `BANNER@2` (2560w) is wider than `LIGHTBOX` (2200w). Stated in the ADR amendment so it is not rediscovered | agent | open |
| R-5 | A `LIGHTBOX` row is served to the operator console or admin moderation surface, which expect the small `PREVIEW` | low | low | `VenuePhotoService#slotsOf` filters `surface() == PREVIEW` explicitly (`VenuePhotoService.java:73`), so the path cannot drift; AC-10 pins it anyway | agent | open |
| R-6 | Upload latency grows — the processor decodes the raw upload once per rendition and this adds a sixth, at the largest box | med | low | Measured over three rounds on a 6000 × 4000 photo-like source: the five existing renditions take 2.57–2.67 s, `LIGHTBOX@1` adds 0.50–0.52 s, **+19–20%**. A rare operator action, far inside any request timeout. No action | agent | **resolved** |
| R-7 | The e2e's mocked photo fixture has no `LIGHTBOX` candidate, so AC-8 passes vacuously | med | med | The fixture carries **both** a photo with and one without a `LIGHTBOX` row; AC-8 asserts both branches, so a vacuous pass fails the second | agent | open |
| R-8 | Two existing specs assert that the lightbox shows the **banner** candidates, which is exactly what this slice ends | **certain** | low | Located: `venue-map.spec.ts:538` (test name) + `:560` (comment), and `discover-photos.e2e.ts:159` (comment) + `:172–175` (the assertions). Both are rewritten in phase 3 — names and comments, not just expectations, because "the server chose no variant" is the property being deliberately ended | agent | open |
| R-9 | The lightbox's `sizes="94vw"` over-states the box once the box caps at 1100 CSS px, the same shape #1072 fixed on the hero | med | low | **Measured — closed, no change.** In Chromium the lazy lightbox image's `auto` prefix wins and resolves to the element box (10/10 probe cells reproduce `round(box × DPR)` exactly), so the `94vw` clause is never consulted; and with a `LIGHTBOX` row present the list has one candidate and renders no `srcset` at all. Only an `auto`-less engine in the `BANNER`-fallback case reads `94vw`, where over-stating can only pick a wider candidate — measured to change the choice in exactly one narrow band (< 534 CSS px at DPR 2, one rung), which is pre-existing and unchanged by this slice. Not a defect, and not its own issue | agent | **resolved** |
| R-10 | V57 collides with another branch's migration | low | med | V56 is the highest on `main`; GitHub reports **zero open PRs**, and `git diff --name-only origin/main...<branch>` over all 31 remote branches finds **no** branch touching `db/migration`. Default rule stands: the branch that merges second renumbers | agent | open |

## Open questions / Assumptions

### Resolved

- **Assumption (resolved, phase 0 measurement):** the lightbox's display box. The issue states
  `min(94vw, 1100px) × min(88vh, 900px)`. Measured with `getBoundingClientRect` in Chromium over a
  1px-granular sweep (300–1300 CSS px wide at a fixed height, 200–1200 tall at a fixed width) plus
  a 330-cell width × height grid: **height is exactly `min(88vh, 900px)`** at every height swept,
  but **width is `min(94vw, 1100px, 100vw − 32px)`** — below 534 CSS px the host's `p-4` padding
  shrinks the flex item and the issue's formula over-states the box (288 measured at 320, 358 at
  390, 398 at 430). The correction only ever makes the box *smaller*, so 2200 × 1800 remains the
  exact DPR-2 match for the box's 1100 × 900 maximum. The height is not padding-clamped because
  `items-center` gives the item no cross-axis shrink — it overflows the padding instead.
- **Assumption (resolved, phase 0 measurement):** JPEG quality. `LIGHTBOX` takes
  `RETINA_JPEG_QUALITY` (0.62), since it too is consumed at ≈1 image pixel per device pixel on a
  retina screen. Measured on a 3:2 photo-like source: 100,967 B at 0.62 against 137,360 B at 0.82,
  and on ADR-0008's synthetic-noise upper bound 735,278 B against 1,266,185 B. The lower quality is
  what makes R-3's figures affordable.
- **Open question (resolved, grep):** does `VenueSummaryView` need the lightbox list too? No —
  `grep -rn "app-photo-lightbox" frontend/src/app` finds exactly one mount site,
  `venue-map.html:352`. The Discover page has no lightbox.
- **Open question (resolved, issue #1072 hand-off):** does `BANNER` gain a scale-3 rung? **No.**
  The decision and its measured basis go in the ADR amendment — see *The BANNER scale-3 decision*
  below.
- **Open question (resolved, `git log`/GitHub):** branch reuse. Both blockers have merged and the
  designated branch carries no commits beyond `main`, so this slice starts from `11f6eeb8` with no
  restart needed.

## The BANNER scale-3 decision (recorded here, written into ADR-0008 in phase 4)

`#1072` handed this question to this slice because it is the slice that re-opens ADR-0008's
rendition list. **Declined.** The basis, measured rather than carried over:

- The shortfall is **uniformly 11%**, not the 1%/11% split the first note on #1070 gave. The gallery
  hero's box measures **730.7 × 360** from 1280 CSS px up and **485.3 × 360** from 1024 to 1279
  (`getBoundingClientRect`, Chromium). At DPR 3 in the 730.7 × 360 box the widest stored `BANNER`
  candidate is short by 11% at 2:3, 1:1, 4:3, 3:2 and 16:9 alike — the ratio is aspect-independent
  because paint and stored width are both linear in the aspect where the box is height-bound.
- A `BANNER@3` rung (3840 × 1440) would cost a measured **50–105 KB per photo** (mean 81 KB across
  those five aspects) on **every** photo, on top of the 93 KB `LIGHTBOX` already adds.
- It would buy pixels the tree will already hold. Measured: the `LIGHTBOX` rendition is **wide
  enough to cover the hero's DPR-3 need in all five aspects** (e.g. 3:2 needs 1620 device px and
  `LIGHTBOX` stores 2200w). They are simply not offered to the hero's candidate list, by this
  slice's own AC-9. Reaching them later is a `sizes`-free, byte-free change to one preference list;
  a new rung is neither.
- So the cheaper successor, if the 11% is ever judged worth closing, is to offer the existing
  `LIGHTBOX` candidate to the hero — not to store a third `BANNER` density. Until then the 11% is
  a softer image at DPR 3, which is not worth a rendition on every photo.

## The counting sweep

`TOURIST_SURFACES` does not exist; the set the issue means is `RETINA_SURFACES`
(`PhotoProcessor.java:57–58`), and it is `EnumSet.of(CARD, BANNER)`. A third `PhotoSurface` value
is `riviera-docs-freshness` step 2b's exact trigger, so every live statement was enumerated with
`grep -rn "two tourist\|tourist surfaces"` plus a read of each `PhotoSurface` mention. `LIGHTBOX`
stores at scale 1 only, so a statement about *which surfaces carry a second density* stays true
while a statement counting *the tourist surfaces* does not. Judged one by one:

| Site | Says | Verdict |
|---|---|---|
| `PhotoSurface.java:4–7` | lists `CARD`/`BANNER`/`PREVIEW` and the CHECK token set | **false** — rewrite (the constant and the token list both change) |
| `PhotoSurface.java:9` | "the two tourist surfaces carry a scale-2 rendition" | **false as a count** — name `CARD` and `BANNER`, and say `LIGHTBOX` carries the density in its box instead |
| `PhotoProcessor.java:31` | "a scale-2 retina rendition for the two tourist surfaces" | **false as a count** — same fix |
| `PhotoProcessor.java:56` | "The two tourist surfaces; the operator slot preview is small…" | **false** — the comment describes `RETINA_SURFACES`, so name the two surfaces rather than count a category that now has three |
| `StoredVariant.java:18` | "scale 2 … present only for the tourist surfaces" | **false** — `LIGHTBOX` is a tourist surface with no scale 2; name `CARD`/`BANNER` |
| `PhotoProcessorTest.java:67` | assertion message, same phrasing | **false** — same fix, and the expected rendition set gains nothing (the 1600 × 1200 fixture earns no `LIGHTBOX` row, AC-3) |
| `ADR-0008:45` | "the two tourist ones carry a second rendition at twice the density" | **true of `CARD`/`BANNER`, false as a count of tourist surfaces** — rewrite the sentence to name them, and add `LIGHTBOX` to the rendition list |
| `ADR-0008:123` (#1041 line) | "the two tourist surfaces gained a scale-2 rendition" | **still true as history** — it describes what #1041 did; leave it and let the new amendment-log entry carry the change |
| `CONTEXT.md:41–47` | the surface vocabulary + "the two tourist surfaces carry a second rendition" | **false** — rewrite |
| `V24:27,34`, `V56:2` | the token list and "CARD and BANNER each carry a scale-1 and a scale-2 row" | **immutable** — an applied Flyway migration is a historical record (invariant #12); V57 carries the new statement |
| `CLAUDE.md:118` | the `venue` module row | **unaffected** — it names tables, not surfaces |
| `RESPONSIBILITIES.md:92` | "Venue photos (ADR-0008): … processing …" | **unaffected** — it names no surface |

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds one rendition to the photo pipeline and one
field to a read view. It writes only `venue_photo_variant`, reads no `set_availability` row, and
touches no booking, set-position, pool or sales-window path. The one concurrency property in scope
is already the table's: V56's `UNIQUE (photo_id, surface, scale)` makes a duplicate rendition
impossible, and V57 leaves that constraint untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue_photo_variant` | `RESPONSIBILITIES.md` §`venue` Job: "venue photos … per-slot upload/replace/delete, **processing**, `bytea` storage behind the module-internal `PhotoStorage` port, and the public content-hash serving read" (ADR-0008). A rendition target is photo processing |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#findVenueMap(VenueId, LocalDate)` | `VenueMapView` (gains one field), `PhotoView`, `PhotoSourceView`, `PhotoSurface` (gains one constant) — all already in `venue.vocabulary` | `venue`'s own `VenueReadController`, and `OperatorBeachMap`/`OperatorBeachMapView`, which embed `VenueMapView` whole |

No new port. `PhotoStorage` and `VenuePhotoModeration` are unchanged; `PhotoSurface` is already
published vocabulary, so the new constant needs no grant change and no `allowedDependencies` edit.
`OperatorBeachMapView` embeds `VenueMapView`, so the operator console's beach-map payload gains the
same array; it renders no photos from it, and the extra grouping is free (the read model already
buckets every surface).

**Domain events (id-based payloads, invariant #11)**

N/A — no event is published or consumed. Nothing outside `venue` learns that a rendition exists;
the read model simply publishes more candidates.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Render and store a lightbox-sized rendition at upload | `venue` | `venue` Job: owns venue photos and their processing (ADR-0008). No other module's Not-My-Job list claims image rendering, and no other module writes `venue_photo_variant` |
| Publish the lightbox candidate list on the venue map view | `venue` | `venue` Job: owns the tourist catalogue reads. The view record is already `venue.vocabulary`; the Need-To-Know rule is satisfied because the payload carries URLs and widths, never a foreign aggregate |

Single module, no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is collected, refunded, accrued or reversed; no ledger entry,
no Stripe call, no commission arithmetic.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/venue-views.ts` | existing | interface mirror | none | none |
| FE-2 | `venue/venue.service.ts` | existing | HTTP service | signals | none |
| FE-3 | `venue/venue-map.ts` + `.html` | existing | standalone component | signals | none |
| FE-4 | `frontend/e2e/venue-lightbox-candidates.e2e.ts` | new | Playwright spec (CI-safe mocked suite) | n/a | n/a |
| FE-5 | `frontend/e2e/support/photo-views.ts` | existing | mock fixture builder | n/a | n/a |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
`NgOptimizedImage`. The new list is optional on the interface (`readonly lightboxPhotos?:`) for the
same reason `photos` is — test doubles and older payloads omit it — and the component falls back to
the banner list it already computes. No deviation. No `sizes` value changes (R-9).

## FE↔BE contract

- **New/changed endpoints:** none. `GET /api/venues/{venueId}` gains one optional array field on
  its response; no path, method or status changes. The serving path stays content-addressed — no
  width parameter (ADR-0008: the strong `ETag` *is* the hash).
- **Client typing:** the hand-written mirror in `shared/venue-views.ts`, resolved through
  `apiPhotoView` at the HTTP boundary like every other photo URL. No `as any`.
- **Money/date on the wire:** N/A — this payload carries neither.

## Execution status

**Stage pointer:** `implement — phases 1-2 done; phase 3 next`

**Next action:** Phase 3 — the frontend mirror, the lightbox wiring, and the two specs this slice
falsifies, test-first.

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — The `LIGHTBOX` surface + V57 + the processor bound | ✅ | `6a363052` |
| 2 — The read model's second candidate list | ✅ | `f4118692` |
| 3 — The frontend mirror, the lightbox wiring, and the two specs it falsifies | | |
| 4 — Substrate docs: ADR-0008, CONTEXT.md + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | phase 1 mutation testing | A first attempt to pin `LIGHTBOX`'s JPEG quality (0.62, not 0.82) by comparing bytes-per-pixel **survived** the mutation: on the test's flat fixture quality moves bytes by 6% (0.01783 → 0.01897 B/px) because the image is almost all flat colour, and on a detail-rich one the comparison is confounded by rendition size instead. The assertion was **removed** rather than tuned to a fixture-specific threshold — a test that passes under its own mutation claims coverage it does not have. The quality choice is pinned by ADR-0008's measured footprint figures, not by a unit test | closed |

---

## File structure

- `docs/plans/lightbox-photo-surface.md` — this plan
- `docs/plans/hero-dpr3-capped-sizes.md` — **deleted** in phase 4; PR #1073 has merged (`riviera-docs-freshness` § *Plan-doc retirement*)
- `platform/src/main/resources/db/migration/V57__venue_photo_variant_lightbox_surface.sql` — widen the surface CHECK
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/PhotoSurface.java` — the new constant + re-read Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — the lightbox candidate list
- `platform/src/main/java/ai/riviera/platform/venue/application/PhotoProcessor.java` — the bound, the skip rule, the re-read Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/StoredVariant.java` — the re-read Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — the `LIGHTBOX_SLIDESHOW` preference + the second `slideshowOf` call
- `platform/src/test/java/ai/riviera/platform/venue/application/PhotoProcessorTest.java` — AC-1/2/3
- `platform/src/test/java/ai/riviera/platform/venue/application/VenuePhotoServiceTest.java` — AC-10
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoReadModelIT.java` — AC-4/5/6
- `platform/src/test/java/ai/riviera/platform/venue/JdbcPhotoStorageIT.java` — AC-7
- `frontend/src/app/shared/venue-views.ts` — the mirror
- `frontend/src/app/venue/venue.service.ts` — mapping the new field
- `frontend/src/app/venue/venue-map.ts` — the header view's second photo list
- `frontend/src/app/venue/venue-map.html` — binding the lightbox to it
- `frontend/src/app/venue/venue-map.spec.ts` — the fallback when the field is absent, and the `:538`/`:560` test that currently asserts the sharing
- `frontend/e2e/discover-photos.e2e.ts` — the `:159` comment and the `:172–175` lightbox assertions, same reason
- `frontend/e2e/venue-lightbox-candidates.e2e.ts` — AC-8/9
- `frontend/e2e/support/photo-views.ts` — a builder for a photo WITH a `LIGHTBOX` row
- `docs/adr/ADR-0008-venue-photo-storage.md` — amended rendition list, footprint figures, and the declined `BANNER` scale-3 rung
- `CONTEXT.md` — the surface vocabulary in the glossary

---

## Phase 1 — The `LIGHTBOX` surface + V57 + the processor bound

**Files:** Create `platform/src/main/resources/db/migration/V57__venue_photo_variant_lightbox_surface.sql` · Modify `PhotoSurface.java`, `PhotoProcessor.java`, `StoredVariant.java` · Test `PhotoProcessorTest.java`, `JdbcPhotoStorageIT.java`

- [ ] **Step 1: Write the failing tests** — AC-1 (2200 × 1467 for 3:2, width-bound), AC-2
      (1200 × 1800 for 2:3, height-bound), AC-3 (omitted rather than upscaled), AC-7 (the CHECK
      admits `LIGHTBOX`, rejects `POSTER`). AC-1/2 need a fixture larger than today's 1600 × 1200,
      which earns no `LIGHTBOX` row.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew --console=plain test --tests "*PhotoProcessorTest*"` → FAIL
      with no `LIGHTBOX` constant
- [ ] **Step 3: Minimal implementation** — the enum constant; `LIGHTBOX_W`/`LIGHTBOX_H` constants
      beside `BANNER_W`/`_H` (§6a — never inline); `LIGHTBOX` excluded from `RETINA_SURFACES` so it
      stays scale 1, and added to the surfaces whose baseline is skipped rather than upscaled; the
      migration widening the CHECK. The three exhaustive `switch`es over `PhotoSurface`
      (`PhotoProcessor#boundsFor`, `PhotoProcessorTest#boundW`/`#boundH`) stop compiling until each
      names the new constant — that is the intended forcing function. Re-read the touched Javadoc
      whole (§6c) per *The counting sweep*.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew --console=plain test --tests "*PhotoProcessorTest*"`, then
      `./gradlew --console=plain test --tests "*JdbcPhotoStorageIT*"` → PASS
- [ ] **Step 5: Mutation-test every new assertion** — change each guarded value (2200 → 2199,
      1467 → 1466, 1800 → 1799, the skipped-rendition count) and show the assertion going red.
- [ ] **Step 6: Generalization-audit pass** — Population `every place that enumerates PhotoSurface
      or its DB token` → enumerated with
      `grep -rn "PhotoSurface" platform/src frontend/src` + `grep -rn "'CARD'\|'BANNER'\|'PREVIEW'"` +
      `git ls-files '*/adapter/out/*.java'` (an empty search is not evidence of absence —
      `CLAUDE.md` § Searching the codebase) → record the sites and the decision.
- [ ] **Step 7: Run the structural net** — the six-test command in `CLAUDE.md` § Commands. A new
      published vocabulary constant is a structure change.
- [ ] **Step 8: Commit** — `git commit -m "Add the LIGHTBOX photo surface (#1070)"`
- [ ] **Step 9: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The read model's second candidate list

**Files:** Modify `VenueMapView.java`, `JdbcVenueCatalog.java` · Test `VenuePhotoReadModelIT.java`, `VenuePhotoServiceTest.java`

- [ ] **Step 1: Write the failing tests** — AC-4 (the lightbox list carries `LIGHTBOX`; `photos` is
      unchanged), AC-5 (fallback to `BANNER` with no `LIGHTBOX` row), AC-6 (the complete-pair guard
      is unmoved — a cover with `CARD` + `LIGHTBOX` but no `BANNER` still reads as no cover),
      AC-10 (the operator slot still resolves `PREVIEW`).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew --console=plain test --tests "*VenuePhotoReadModelIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `LIGHTBOX_SLIDESHOW = List.of(LIGHTBOX, BANNER, CARD,
      PREVIEW)` beside the existing two; a second `slideshowOf` call in `findVenueMap`; the new
      field on `VenueMapView`. `coverOf`'s complete-pair guard stays exactly as it is — `LIGHTBOX`
      must **not** join it, or every pre-existing cover photo would read as absent.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew --console=plain test --tests "*VenuePhotoReadModelIT*"`, then
      `--tests "*VenuePhotoServiceTest*"` and `--tests "*VenueReadController*"` → PASS
- [ ] **Step 5: Mutation-test every new assertion** — add `LIGHTBOX` to `coverOf`'s guard and show
      AC-6 going red; point `LIGHTBOX_SLIDESHOW` at `BANNER` first and show AC-4 going red.
- [ ] **Step 6: Commit** — `git commit -m "Publish lightbox candidates on the venue map view (#1070)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — The frontend mirror, the lightbox wiring, and the two specs it falsifies

**Files:** Modify `venue-views.ts`, `venue.service.ts`, `venue-map.ts|.html`, `e2e/support/photo-views.ts` · Create `frontend/e2e/venue-lightbox-candidates.e2e.ts` · Test `venue-map.spec.ts`, `discover-photos.e2e.ts`

- [ ] **Step 1: Write the failing tests** — AC-8 in the new e2e (both branches: with and without a
      `LIGHTBOX` row — R-7) and AC-9 (the band and hero unchanged), plus a unit spec that an absent
      `lightboxPhotos` falls back to the banner list.
- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-lightbox-candidates` → FAIL
- [ ] **Step 3: Minimal implementation** — the optional field on the mirror, `apiPhotoView` over the
      new list in `venue.service.ts`, `VenueHeader` gaining its second list, and
      `venue-map.html:353` binding the lightbox to it.
- [ ] **Step 3a: Rewrite the two specs that assert the old sharing** — `venue-map.spec.ts:538`
      (test NAME) + `:560` (comment), and `discover-photos.e2e.ts:159` (comment) + `:172–175`
      (assertions). Their claim is that the lightbox and hero share one candidate list and the
      server chose no variant; that is the property this slice ends, so rewrite the names and
      comments rather than re-pointing the expectations.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map photo-url` then
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS; then
      `npm run lint && npm run format:check`
- [ ] **Step 5: Mutation-test every new assertion** — bind the lightbox back to the banner list and
      show AC-8's first branch going red; drop the no-`LIGHTBOX` fixture and show the second branch
      going red.
- [ ] **Step 6: Commit** — `git commit -m "Serve the lightbox its own candidates (#1070)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Substrate docs + close-out

**Files:** Modify `docs/adr/ADR-0008-venue-photo-storage.md`, `CONTEXT.md` · Delete `docs/plans/hero-dpr3-capped-sizes.md`

- [ ] **Step 1: Run `riviera-docs-freshness`** over the slice's range and reconcile against *The
      counting sweep* above — every site judged there is either changed or justified.
- [ ] **Step 2: Amend ADR-0008** — a new amendment-log entry; the rendition list; the
      stored-footprint figures (R-3's measurements); the declined `BANNER` scale-3 rung with its
      basis; and R-4's accepted byte cost on a phone. Re-read the flip threshold and state whether
      it still holds.
- [ ] **Step 3: Update `CONTEXT.md`** — the surface vocabulary and the second-density sentence.
- [ ] **Step 4: Retire `docs/plans/hero-dpr3-capped-sizes.md`** — `git rm`, in this slice's last
      code-touching commit, per `riviera-docs-freshness` § *Plan-doc retirement* (its PR #1073 has
      merged).
- [ ] **Step 5: Verify** — `node scripts/check-plan-file-structure.mjs --diff origin/main` and
      `node scripts/check-inline-comments.mjs --diff origin/main` → clean
- [ ] **Step 6: Commit** — `git commit -m "Amend ADR-0008 for the lightbox surface (#1070)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-11 | phase 1 — a fourth `PhotoSurface` constant | Mechanism: *anything that enumerates the surface set or names a surface token*, in Java, SQL and TypeScript alike — not "files about photos" | `grep -rn "PhotoSurface\." --include=*.java platform/src` · `grep -rn "'CARD'\|'BANNER'\|'PREVIEW'\|'LIGHTBOX'" --include=*.java --include=*.sql --include=*.ts platform/src frontend/src frontend/e2e` · `git ls-files '*/adapter/out/*.java' \| xargs grep -l PhotoSurface` | 11 Java files; 3 exhaustive `switch`es (`PhotoProcessor#boundsFor`, `PhotoProcessorTest#boundW`/`#boundH`); 2 `adapter/out` classes; 2 SQL token lists (V24, V57); **1 site the first pass missed** — `JdbcVenues.java:613`, the operator console's slot read, which pins `surface = 'PREVIEW'` in SQL; **0 frontend sites** — the wire carries URLs and widths, never a surface name | The three `switch`es are compiler-forced and were updated. `JdbcVenues:613` and `VenuePhotoService:73` both select `PREVIEW` explicitly, so neither can pick up a `LIGHTBOX` row — R-5 is covered twice over, and AC-10 pins the second. V24 is an applied migration and stays as written |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*PhotoProcessorTest*"` → 2200 × 1467, width-bound. Verified at commit `<sha>`.
- [ ] **AC-2:** same run → 1200 × 1800, height-bound. Verified at commit `<sha>`.
- [ ] **AC-3:** same run → no upscaled rendition; the five existing ones unchanged. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `./gradlew test --tests "*VenuePhotoReadModelIT*"` → banner list unchanged. Verified at commit `<sha>`.
- [ ] **AC-5:** same run → falls back to `BANNER`. Verified at commit `<sha>`.
- [ ] **AC-6:** same run → the cover pair guard is unmoved. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `./gradlew test --tests "*JdbcPhotoStorageIT*"` → CHECK admits/rejects. Verified at commit `<sha>`.
- [ ] **AC-8:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-lightbox-candidates` → both branches. Verified at commit `<sha>`.
- [ ] **AC-9:** same run → band and hero unchanged. Verified at commit `<sha>`.
- [ ] **AC-10:** Run `./gradlew test --tests "*VenuePhotoServiceTest*"` → the slot read still resolves `PREVIEW`. Verified at commit `<sha>`.
- [ ] **AC-11:** `riviera-docs-freshness` pass reports no stale statement. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
