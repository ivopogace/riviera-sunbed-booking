# Venue photo retina tier + `srcset` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every venue photo is stored at two densities and published to the browser as a
`srcset` of content-addressed candidates with their intrinsic widths, so a 356 px gallery
tile and a 1100 px lightbox each fetch the candidate that fits instead of sharing one
variant sized for DPR 1.

**Architecture:** `venue_photo_variant` gains a `scale` column, so a variant is keyed by
`(photo, surface, scale)` rather than `(photo, surface)` — the retina tier is a second row
per surface, not a new surface vocabulary. The read model stops publishing one URL per
photo and publishes a `PhotoView` carrying the 1× URL plus every stored candidate with its
intrinsic pixel width; the frontend composes the HTML `srcset` from that. **No
`IMAGE_LOADER` is added** — see *Why no loader* below.

**Persistence:** JDBC only (invariant #1). Touches `venue_photo_variant` (new `scale`
column, widened uniqueness) via Flyway `V56`. No other table.

**Source of intent:** GitHub issue #1041, re-scoped at the `riviera-sdlc` issue-intake
grill gate — see *Issue reconciliation* below.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
#1041's stated premise is false: the read model already selects a variant per surface
server-side, so the Discover card and the lightbox never share bytes and there is no
over-fetch for a loader to remove) · `riviera-plan-doc` (this template — forced the
Module-ownership table and the per-AC seam names) · `tdd` (each phase red-green at the
seams named in the AC table) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**N/A at plan time — due at merge close-out**;
ADR-0008's stored-footprint figures and `PhotoSurface`'s Javadoc are known targets) ·
`postgres` (chose a `scale` column over new `CHECK` enum tokens, and kept the widened
uniqueness as a constraint rather than adapter discipline) · `riviera-modulith` (the new
view records land in `venue/vocabulary/`, the published-surface kind for value records;
`PhotoStorage` stays module-internal) · `riviera-java-conventions` (records, no Lombok,
the `StoredVariant` array-equality pattern already in the file) · `codebase-design`
(kept the surface concept and added a density axis rather than exposing a width parameter
on the serving route, which would have broken the content-addressed URL) ·
`riviera-frontend` (the API-view mirror stays in `shared/venue-views.ts`; the `srcset`
helper joins `shared/photo-url.ts` beside `apiPhotoUrl`) · `riviera-tailwind` (no styling
change — `object-contain`/`object-cover` and the aspect boxes are untouched; confirmed
Tailwind has no responsive-image or DPR utility to reach for) · `angular-developer` +
angular-cli MCP `search_documentation` (v22 — established that a loader is required for
*any* automatic `srcset`, that the `srcset` **input** is a suppression flag rather than a
passthrough so `[attr.srcset]` is the binding that reaches the DOM, and that Angular
already emits `sizes="auto, 100vw"` on lazy `fill` images) · `playwright-cli` (the mocked
suite asserts the rendered `srcset`/`sizes` attributes) · `riviera-local-debug` (scoped
Gradle/Vitest runs; the full task OOMs the sandbox)

**Branch:** `claude/sdlc-1041-yxc1cz` — the cloud session's designated remote branch stands
in for `feature/venue-photo-retina-srcset` (`riviera-sdlc` § *Remote / cloud session
addendum*).

---

## Issue reconciliation (issue-intake grill gate)

#1041 asked for an `IMAGE_LOADER` so that `NgOptimizedImage`'s automatic `srcset`
generation stops short-circuiting. The gate measured the premise against the code and it
does not hold. Recorded here because the ACs below are the reconciled scope, not the
issue's.

**What the issue claims, and what is actually true**

| #1041 says | Measured |
|---|---|
| "a 264px Discover card and the 1100px lightbox fetch byte-identical images" | False. `JdbcVenueCatalog.slideshowOf` picks per surface: the Discover card gets `CARD` (`CARD_SLIDESHOW`), the venue page — band, gallery grid **and** lightbox — gets `BANNER` (`BANNER_SLIDESHOW`). Different hashes, different bytes. |
| "On a phone that is the full-size upload for every card in the grid" | False. The full-res upload is decoded, resized and discarded (ADR-0008); the card fetches the `CARD` variant, capped at 640×384. |
| The win is removing an over-fetch | Inverted. Nothing is over-fetched; Angular's own NG0913 oversized-image warning fires only at >1200 px too large and would not fire here. Every tourist surface is **under**-served at DPR 2. |

**The measurement** — `PhotoProcessor`'s fit-within bounds are `CARD` 640×384, `BANNER`
1280×480, `PREVIEW` 480×360, so a 3:2 upload yields 576×384, 720×480 and 480×320.
Rendered boxes come from the real markup (`home.html`'s
`grid-cols-[repeat(auto-fill,minmax(264px,1fr))]` inside `max-w-[1080px] px-6`, and
`venue-map.html`'s bands):

| Surface | Rendered box (CSS px) | Wants at DPR 2 | Gets today (3:2 source) | Verdict |
|---|---|---|---|---|
| Discover card | 330×220 desktop, 342×228 one-column | 684×456 | `CARD` 576×384 | 2× upscale |
| Beach-map banner band (`contain`) | 1100×264 / 390×150 | 528 tall | `BANNER` 720×480 | ~sharp |
| Gallery hero (`contain`) | ~730×360 | 1460×720 | `BANNER` 720×480 | 2× upscale |
| Gallery tile (`contain`) | ~356×176 | 712×352 | `BANNER` 720×480 | ~sharp, over-served at DPR 1 |
| Lightbox (`contain`) | ≤1100×900 | 2200×1800 | `BANNER` 720×480 | 1.5× upscale; **1.9× for a portrait upload**, whose `BANNER` variant is only 320×480 |

So the defect is resolution, not bytes, and the four venue-page consumers of `BANNER` span
356 px to 1100 px while sharing one variant. That is what a `srcset` is for.

**Why no loader.** angular.dev's loader table states the generic (no-op) loader's purpose
directly: *"The URL returned by the generic loader will always match the value of `src`
… Sites that use Angular to serve images are the primary intended use case for this
loader."* The `IMAGE_LOADER` seam exists to drive an image CDN that resizes on demand; this
platform serves its own bytes from Spring and has no on-demand resizer, only fixed
pre-rendered variants. angular.dev's own remedy list for a size mismatch is *"Add a
`srcset` if multiple sizes are needed for different layouts"* — which is what this slice
does. Adding a width parameter to `/api/venues/{id}/photos/{hash}` would additionally
break ADR-0008's content-addressed URL, whose whole point is that the strong `ETag` **is**
the hash.

**What the docs contribute to the design** (all verified against `@angular/common` 22.1.4
in `node_modules`, not from memory):

- A loader is required for *every* automatic path, `ngSrcset` included
  (`shouldGenerateAutomaticSrcset()` short-circuits on `imageLoader !== noopImageLoader`;
  `assertNoNgSrcsetWithoutLoader` warns). So the `srcset` must be supplied as an attribute.
- `srcset` is declared as an `@Input` on the directive with no host-attribute write, so a
  bound `[srcset]` is swallowed and never reaches the DOM. `[attr.srcset]` does reach it.
- `disableOptimizedSrcset` is the documented per-image opt-out. Setting it makes the
  hand-supplied attribute authoritative and stops a future loader from silently overwriting
  it at `updateSrcAndSrcset`.
- In `fill` mode the directive sets `sizes ||= '100vw'` and emits `sizes="auto, 100vw"` for
  lazy images. Every slideshow image except the two `priority` ones is lazy, so on browsers
  supporting `sizes="auto"` the browser uses the real laid-out width — which is the only
  thing that can size an `auto-fill` grid correctly, since its column count is not
  expressible as a `vw` fraction.
- Tailwind v4 contributes nothing here: it has no responsive-image or device-pixel-ratio
  utility. Confirmed against the responsive-design and object-fit docs and
  `riviera-tailwind`.

**In flight:** no open PRs, no other session branch. `V56` is free on `main` and unclaimed.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a 3:2 upload wider than 1152 px, when it is processed, then the
      result carries a scale-1 **and** a scale-2 variant for `CARD` and for `BANNER`, and a
      scale-1 variant only for `PREVIEW`, every one of them a distinct content hash.
      *Seam:* `PhotoProcessor#process` · *Pinned by:*
      `PhotoProcessorTest.rendersARetinaTierForTheTouristSurfacesOnly`
- [ ] **AC-2:** Given an upload narrower than a target's scale-2 width, when it is
      processed, then no scale-2 variant is produced for that surface — the pipeline never
      upscales. *Seam:* `PhotoProcessor#process` · *Pinned by:*
      `PhotoProcessorTest.omitsTheRetinaTierRatherThanUpscaleASmallUpload`
- [ ] **AC-3:** Given a photo whose `CARD` surface has a scale-1 and a scale-2 variant,
      when the tourist catalog is read, then the summary's photo carries `url` equal to the
      scale-1 serving URL and `sources` listing both candidates with their intrinsic pixel
      widths, ascending. *Seam:* `venue.api.VenueCatalog` · *Pinned by:*
      `VenuePhotoReadModelIT.publishesEveryStoredCandidateWithItsIntrinsicWidth`
- [ ] **AC-4:** Given a photo stored before this slice (scale-1 rows only), when the
      catalog is read, then its `PhotoView` carries exactly one source and the surface still
      renders — a pre-migration photo degrades to a one-candidate `srcset`, never to a
      missing image. *Seam:* `venue.api.VenueCatalog` · *Pinned by:*
      `VenuePhotoReadModelIT.degradesToASingleCandidateForAPreMigrationPhoto`
- [ ] **AC-5:** Given a `venue_photo_variant` row, when a second row is inserted for the
      same `(photo_id, surface, scale)`, then the insert is rejected by the uniqueness
      constraint. *Seam:* the `V56` schema · *Pinned by:*
      `JdbcPhotoStorageIT.rejectsADuplicateSurfaceAndScaleForOnePhoto`
- [ ] **AC-6:** Given a photo with two candidates, when the slideshow renders it, then the
      `<img>` carries `srcset` listing both URLs with `w` descriptors, carries
      `disableOptimizedSrcset`, and its `src` is still the scale-1 URL. *Seam:* the rendered
      `app-photo-slideshow` DOM · *Pinned by:*
      `photo-slideshow.spec.ts` › `emits every candidate as a w-descriptor srcset`
- [ ] **AC-7:** Given the Discover grid, when it renders, then each card image carries an
      explicit `sizes` whose fallback describes the grid's real column fraction, so a
      browser without `sizes="auto"` does not fall back to `100vw` and pick the widest
      candidate for a 330 px card. *Seam:* the rendered `app-photo-slideshow` DOM ·
      *Pinned by:* `home.spec.ts` › `passes the Discover grid's own sizes to the slideshow`
- [ ] **AC-8:** Given the venue page, when the gallery grid and the lightbox render the
      same photo, then both receive the same candidate list and neither hard-codes a
      variant — the browser, not the server, picks per box. *Seam:* the rendered
      `app-photo-gallery-grid` / `app-photo-lightbox` DOM · *Pinned by:*
      `venue-map.spec.ts` › `hands the gallery grid and the lightbox the same candidates`
- [ ] **AC-9:** Given a venue with photos, when the Discover page and the venue page load
      in a real browser, then every slideshow `<img>` has a non-empty `srcset` and a
      `sizes`, and the page passes the axe policy unchanged. *Seam:* the rendered pages ·
      *Pinned by:* `frontend/e2e/discover-photos.e2e.ts`

## Non-goals

- **No `IMAGE_LOADER`, and no width parameter on `/api/venues/{id}/photos/{hash}`** — the
  rationale is *Why no loader* above. The serving route is untouched by this slice.
- **No backfill of the retina tier for existing photos.** The full-res original is
  discarded at upload by design (ADR-0008), so a scale-2 variant cannot be derived from
  what is stored. Existing photos keep their scale-1 rows and render a one-candidate
  `srcset` until re-uploaded (AC-4). No re-upload prompt, no migration job.
- **No change to the surface vocabulary.** `CARD`/`BANNER`/`PREVIEW` and the
  `CARD_SLIDESHOW`/`BANNER_SLIDESHOW` preferences stay. Collapsing surfaces into a single
  per-photo width ladder is the better long-term model — it would delete the preference
  lists and the `coverOf` complete-pair special case — but it rewrites every photo read
  model and is its own slice. Recorded as a follow-up in Open questions.
- **No lightbox-specific variant.** The retina tier moves the lightbox from soft at DPR 1
  to sharp at DPR 1 and soft at DPR 2; chasing a 1100×900 box at DPR 2 means a ~2 MP
  `bytea` row, which is past what ADR-0008's storage decision is sized for.
- **No `PREVIEW` retina tier.** The operator console slot thumbnail is a small,
  authenticated, low-traffic surface; doubling its bytes buys nothing measurable.
- **No change to lazy-loading or slide-mounting behaviour.** `PhotoSlideshow`'s
  mount-on-reach and neighbour-warming logic (#1039) is untouched.

## Behavior-parity ledger

`N/A — additive. No surface is retired or replaced; every existing photo URL keeps working
and stays content-addressed.`

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `[attr.srcset]` is overwritten or ignored by `NgOptimizedImage`, so the whole slice is inert — the exact failure mode #1041 documents for `sizes` | med | high | Verified in the 22.1.4 bundle that `updateSrcAndSrcset` writes `srcset` only from `ngSrcset` or the automatic path, both gated on a loader; `disableOptimizedSrcset` closes the future-loader hole. **Phase 2 pins it in the rendered DOM (AC-6), not in the class list** | agent | open |
| R-2 | Without `sizes="auto"` support the `100vw` fallback makes every Discover card pick the widest candidate — a **bytes regression** on the exact surface #1041 cared about | med | high | AC-7: pass an explicit vw-only `sizes` per host so the fallback describes the real box. `sizes` must contain no pixel values (RuntimeError 2952) — vw-only by construction | agent | open |
| R-3 | Retina bytes blow ADR-0008's stated "≈≤120 KB each" cap and the per-venue footprint it sizes the `bytea` decision on | high | med | Confirmed: it does. Measured in phase 0 (see the Generalization-audit log) — worst single rendition 327 KB, per-photo total 135–563 KB by aspect, so a 3-slot venue runs ~0.4–1.7 MB against the ADR's stated ≈360 KB. The 0.62 retina quality is what keeps it there. **Phase 3 updates ADR-0008's figures**; the flip threshold itself is unmoved at Phase-1 venue counts | agent | measured in phase 0, doc fix due phase 3 |
| R-4 | Widening the uniqueness constraint drops the old one; a bad migration could leave the table with no protection against a duplicate `(photo, surface)` write | low | high | AC-5 pins the new constraint from the DB side in `JdbcPhotoStorageIT`; the migration adds the new constraint before dropping the old | agent | open |
| R-5 | `PhotoView` replaces `List<String>` in two published view records, so every consumer of `photos` and `coverPhoto` breaks at once — backend read models, the frontend mirror, three components and their specs | high | med | Phase 1 changes the backend contract and its ITs together; phase 2 changes the mirror and all three components together. Neither phase is green in isolation, which is expected and stated in the phase table | agent | open |
| R-6 | Flyway `V56` collides with a concurrently-merged branch | low | med | Checked at the intake gate: `V55` is the max on `main` and there are no open PRs. If one appears, this branch renumbers (it will merge second) | agent | open |
| R-7 | A module-boundary leak: the new view records land somewhere other than `venue/vocabulary/` | low | med | `PublishedSurfacePlacementArchitectureTests` + `ModularityTests` in the structural-net run after phase 1 | agent | open |

## Open questions / Assumptions

- **Assumption:** every browser that matters honours a `w`-descriptor `srcset` on an
  `<img>` that also carries `src` — standard HTML, but the interaction with the directive's
  own `src` write is what phase 2's rendered-DOM test actually proves. — *Owner:* agent ·
  *Resolves by:* phase 2 (AC-6)
- **Assumption:** the scale-2 JPEG quality of 0.62 is visually acceptable on a high-density
  display. Not verifiable in this sandbox; the byte measurement in phase 0 is, and the
  quality choice is recorded so it can be revisited. — *Owner:* agent · *Resolves by:*
  phase 0
- **Open question:** should the surface vocabulary eventually collapse into one per-photo
  width ladder, deleting `CARD_SLIDESHOW`/`BANNER_SLIDESHOW` and `coverOf`'s complete-pair
  guard? Out of scope here (Non-goals). — *Owner:* maintainer · *Resolves by:* a follow-up
  issue opened at close-out if the lightbox's remaining DPR-2 softness matters

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches `venue_photo_variant` only. It
writes no `set_availability` row, reads no `(set, date)` state, and changes no booking,
beach-map or sales-window path. The one concurrency property in scope is unchanged:
`PhotoStorage#replace` remains a single transaction whose slot-row upsert serialises
concurrent replaces (last writer wins), and this slice adds rows inside that same
transaction rather than a new write path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue_photo_variant` | `venue` is the sole owner and sole writer of `venue_photo(_variant)` per the CLAUDE.md module table, and owns photo processing and the tourist read model |

No other module is touched. No new module, no new dependency grant.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog` — **signature unchanged** | `VenueSummaryView`, `VenueMapView`, and via them the new `venue.vocabulary.PhotoView` / `PhotoSourceView` | the platform edge's tourist controllers |

The port's methods do not change; the value records they already return gain a field and
two new record types join `venue/vocabulary/` — the published surface for value records
(`riviera-modulith` § *The published surface, split by kind*).

**Domain events**

`N/A — no event published or consumed. Photo storage is a synchronous write behind the
module-internal PhotoStorage port; nothing outside venue observes it.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Render a second density of the tourist variants | `venue` | `venue` Job (`RESPONSIBILITIES.md` §`venue`): "Venue photos (ADR-0008): per-slot upload/replace/delete, **processing**, `bytea` storage behind the module-internal `PhotoStorage` port". Image processing is named work of this module and appears on no other module's Not-My-Job list |
| Publish the stored candidates and their intrinsic widths to the tourist read model | `venue` | Same § — `venue` owns the tourist read model that already carries `coverPhoto` and `photos`. The new records are values, not a foreign aggregate, so the Need-To-Know rule is satisfied: consumers receive URLs and integers |
| Choose which candidate to display | **neither — the browser** | Deliberate. The server publishes the ladder; `srcset`/`sizes` selection happens in the user agent. This is the design decision that keeps a width parameter off the serving route and preserves ADR-0008's content-addressed URL |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope. No money is read, written, or displayed by this slice.`

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/venue-views.ts` | existing | API-view mirror | none (types only) | — |
| FE-2 | `shared/photo-url.ts` | existing | pure helpers | none | — |
| FE-3 | `shared/photo-slideshow.ts` | existing | standalone component | signals; `photos` input retyped to `readonly PhotoView[]`, new `sizes` input | — |
| FE-4 | `shared/photo-gallery-grid.ts` | existing | standalone component | signals; same retype | — |
| FE-5 | `shared/photo-lightbox.ts` | existing | standalone component | signals; same retype | — |
| FE-6 | `pages/home/home.ts` + `.html` | existing | standalone component | passes the grid's `sizes` | — |
| FE-7 | `venue/venue-map.ts` + `.html` | existing | standalone component | passes each band's `sizes` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, `NgOptimizedImage` retained on every image. Two documented deviations, both forced by
the directive and both evidenced in *Issue reconciliation*: the `srcset` is bound with
`[attr.srcset]` because the directive's `srcset` input is a suppression flag that never
reaches the DOM, and every such image carries `disableOptimizedSrcset` so the hand-supplied
attribute stays authoritative.

## FE↔BE contract

- **New/changed endpoints:** none. `GET /api/venues` and `GET /api/venues/{id}/map` change
  **shape**, not route: `photos` becomes `PhotoView[]` and `coverPhoto`'s `card`/`banner`
  each become a `PhotoView`, where
  `PhotoView = { url: string; sources: { url: string; width: number }[] }`.
- **Client typing:** hand-written typed mirror in `shared/venue-views.ts`, per the
  `riviera-frontend` residual-vocabulary rule. No `as any`.
- **Money/date on the wire:** `N/A — neither crosses this contract.`

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** Write `VenuePhotoReadModelIT.publishesEveryStoredCandidateWithItsIntrinsicWidth`
red, per AC-3. Phase 0 left both tourist read models pinned to `scale = 1` so the tree stays
correct between phases; phase 1 is what widens `JdbcVenueCatalog` to publish both candidates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Retina tier in the processor + `V56` scale column | ✅ | AC-1, AC-2, AC-5 green |
| 1 — `PhotoView` read model | ⏳ | |
| 2 — Frontend `srcset` + per-host `sizes` | | |
| 3 — e2e coverage + ADR-0008 footprint figures | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/venue-photo-retina-srcset.md` — this plan
- `platform/src/main/resources/db/migration/V56__venue_photo_variant_scale.sql` — the
  `scale` column, its `CHECK`, and the widened uniqueness
- `platform/src/main/java/ai/riviera/platform/venue/application/StoredVariant.java` — carries `scale`
- `platform/src/main/java/ai/riviera/platform/venue/application/PhotoProcessor.java` — renders the retina tier
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcPhotoStorage.java` — writes/reads `scale`
- `platform/src/main/java/ai/riviera/platform/venue/application/VariantMeta.java` — the moderation read's rendition carries `scale`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the console slot read is pinned to the baseline density
- `platform/src/main/java/ai/riviera/platform/venue/application/PhotoMetadata.java` — admin moderation read carries `scale`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/PhotoSourceView.java` — one candidate: URL + intrinsic width
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/PhotoView.java` — a photo as its candidate list
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/CoverPhotoView.java` — `card`/`banner` become `PhotoView`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueSummaryView.java` — `photos` becomes `List<PhotoView>`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — same
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — builds the candidate lists
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/PhotoUploadResponse.java` — upload echo carries `scale`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenuePhotoService.java` — slot view follows the record change
- `platform/src/test/java/ai/riviera/platform/venue/application/PhotoProcessorTest.java` — AC-1, AC-2
- `platform/src/test/java/ai/riviera/platform/venue/application/InMemoryPhotoStorage.java` — fake follows the port
- `platform/src/test/java/ai/riviera/platform/venue/application/VenuePhotoServiceTest.java` — follows the record change
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoReadModelIT.java` — AC-3, AC-4
- `platform/src/test/java/ai/riviera/platform/venue/JdbcPhotoStorageIT.java` — AC-5
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoServingIT.java` — serving path unchanged, re-pinned
- `platform/src/test/java/ai/riviera/platform/venue/application/StoredCarrierEqualityTest.java` — `scale` joins the equality contract
- `platform/src/test/java/ai/riviera/platform/venue/AdminPhotoModerationIT.java` — fixture follows the record change
- `platform/src/test/java/ai/riviera/platform/venue/AdminPhotoTakedownIT.java` — fixture follows the record change
- `frontend/src/app/shared/venue-views.ts` — the `PhotoView`/`PhotoSourceView` mirror
- `frontend/src/app/shared/photo-url.ts` — `apiPhotoView` + `photoSrcset` helpers
- `frontend/src/app/shared/photo-url.spec.ts` — helper specs
- `frontend/src/app/shared/photo-slideshow.ts` — `[attr.srcset]`, `disableOptimizedSrcset`, `sizes` input
- `frontend/src/app/shared/photo-slideshow.spec.ts` — AC-6
- `frontend/src/app/shared/photo-gallery-grid.ts|.spec.ts` — same treatment for the three tiles
- `frontend/src/app/shared/photo-lightbox.ts|.spec.ts` — retyped `photos`
- `frontend/src/app/shared/photo-slideshow.contrast.spec.ts` — follows the retype
- `frontend/src/app/pages/home/home.ts|.html` — passes the grid's `sizes`
- `frontend/src/app/pages/home/home.spec.ts` — AC-7
- `frontend/src/app/venue/venue-map.ts|.html` — passes each band's `sizes`
- `frontend/src/app/venue/venue-map.spec.ts` — AC-8
- `frontend/src/app/venue/venue.service.ts|.spec.ts` — resolves candidate URLs against `apiBaseUrl`
- `frontend/e2e/discover-photos.e2e.ts` — AC-9
- `docs/adr/ADR-0008-venue-photo-storage.md` — measured footprint figures (phase 3)
- `RESPONSIBILITIES.md` — `venue` § photo line, if the measured figures move what it states

---

## Phase 0 — Retina tier in the processor + `V56` scale column

**Files:** Create `V56__venue_photo_variant_scale.sql` · Modify `PhotoProcessor.java`,
`StoredVariant.java`, `JdbcPhotoStorage.java`, `PhotoMetadata.java` · Test
`PhotoProcessorTest.java`, `JdbcPhotoStorageIT.java`

- [ ] **Step 1: Write the failing test** — `PhotoProcessorTest.rendersARetinaTierForTheTouristSurfacesOnly`
      and `.omitsTheRetinaTierRatherThanUpscaleASmallUpload` (AC-1, AC-2), asserting on the
      variant list `PhotoProcessor#process` returns: five variants for a wide 3:2 upload
      (`CARD`@1, `CARD`@2, `BANNER`@1, `BANNER`@2, `PREVIEW`@1) with distinct hashes, and no
      `@2` rows for an upload narrower than the `@2` target.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*PhotoProcessorTest*"`
      → FAIL (no `scale` on `StoredVariant`).
- [ ] **Step 3: Minimal implementation** — `StoredVariant` gains `int scale`; `PhotoProcessor`
      renders `boundsFor(surface, scale)` (scale-2 = the scale-1 box doubled) at
      `RETINA_JPEG_QUALITY = 0.62` for `CARD` and `BANNER` only, skipping a scale-2 render
      whose target exceeds the source's own dimensions; `V56` adds
      `scale SMALLINT NOT NULL DEFAULT 1`, its `CHECK (scale IN (1, 2))`, the new
      `UNIQUE (photo_id, surface, scale)` **before** dropping
      `venue_photo_variant_surface_uniq`; `JdbcPhotoStorage` writes and reads the column.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*PhotoProcessorTest*"`
      then `--tests "*JdbcPhotoStorageIT*"` → PASS. Record the measured byte size of each
      variant in the Generalization-audit log (feeds R-3 and phase 3's ADR update).
- [ ] **Step 5: Generalization-audit pass** — population: every reader of
      `venue_photo_variant`. Enumerate with
      `grep -rn "venue_photo_variant" platform/src --include=*.java --include=*.sql`.
- [ ] **Step 6: Commit** — `git commit -m "Render a retina tier for the tourist photo surfaces (#1041)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

> After this phase, run the structural net —
> `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*RetiredSetExclusionArchitectureTests*"`.

---

## Phase 1 — `PhotoView` read model

**Files:** Create `PhotoSourceView.java`, `PhotoView.java` · Modify `CoverPhotoView.java`,
`VenueSummaryView.java`, `VenueMapView.java`, `JdbcVenueCatalog.java`,
`PhotoUploadResponse.java`, `VenuePhotoService.java` · Test `VenuePhotoReadModelIT.java`

- [ ] **Step 1: Write the failing test** — `VenuePhotoReadModelIT.publishesEveryStoredCandidateWithItsIntrinsicWidth`
      and `.degradesToASingleCandidateForAPreMigrationPhoto` (AC-3, AC-4).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenuePhotoReadModelIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — the two new `vocabulary/` records;
      `JdbcVenueCatalog`'s variant query selects `scale`, `width` and groups per
      `(slot, surface)` into a `PhotoView`; `slideshowOf` returns `List<PhotoView>`;
      `coverOf` keeps its complete-pair guard on the scale-1 rows.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenuePhotoReadModelIT*"`,
      then the `venue` package, then the structural net.
- [ ] **Step 5: Generalization-audit pass** — population: every consumer of
      `VenueSummaryView#photos` / `VenueMapView#photos` / `CoverPhotoView`.
- [ ] **Step 6: Commit** — `git commit -m "Publish venue photos as their density candidates (#1041)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Frontend `srcset` + per-host `sizes`

**Files:** Modify `venue-views.ts`, `photo-url.ts`, `photo-slideshow.ts`,
`photo-gallery-grid.ts`, `photo-lightbox.ts`, `home.ts|.html`, `venue-map.ts|.html`,
`venue.service.ts` · Test the matching `.spec.ts` files

- [ ] **Step 1: Write the failing test** — `photo-slideshow.spec.ts` › `emits every candidate
      as a w-descriptor srcset` (AC-6), `home.spec.ts` › `passes the Discover grid's own
      sizes to the slideshow` (AC-7), `venue-map.spec.ts` › `hands the gallery grid and the
      lightbox the same candidates` (AC-8). Assert on rendered attributes, never on the class list.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- photo-slideshow` → FAIL.
- [ ] **Step 3: Minimal implementation** — mirror the two records in `venue-views.ts`;
      `photoSrcset(photo)` joins `sources` as `"<url> <width>w"`; every `<img ngSrc>` in the
      three components gains `[attr.srcset]` and `disableOptimizedSrcset`; `PhotoSlideshow`
      and `PhotoGalleryGrid` gain a `sizes` input (vw-only, no pixel values — RuntimeError
      2952); `home.html` passes the Discover grid's real fraction and `venue-map.html` each
      band's.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- photo-slideshow photo-gallery-grid photo-lightbox home venue-map`,
      then `npm run lint && npm run format:check`.
- [ ] **Step 5: Generalization-audit pass** — population: every `ngSrc` in the tree.
      Enumerate with `grep -rn "ngSrc" frontend/src --include=*.ts --include=*.html`.
- [ ] **Step 6: Commit** — `git commit -m "Let the browser pick the photo candidate that fits (#1041)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — e2e coverage + ADR-0008 footprint figures

**Files:** Modify `frontend/e2e/discover-photos.e2e.ts`,
`docs/adr/ADR-0008-venue-photo-storage.md`, `RESPONSIBILITIES.md`

- [ ] **Step 1: Write the failing test** — extend `discover-photos.e2e.ts` for AC-9: every
      slideshow `<img>` has a non-empty `srcset` and a `sizes`, on both the Discover page and
      the venue page, with the axe policy unchanged (`expectNoSeriousAxeViolations`).
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- discover-photos` → FAIL.
- [ ] **Step 3: Minimal implementation** — mock fixtures updated to the new payload shape.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y -- discover-photos` → PASS.
- [ ] **Step 5: Docs** — fold phase 0's measured byte sizes into ADR-0008's serving-discipline
      figures and its flip threshold; check `RESPONSIBILITIES.md` §`venue`'s photo line.
      This is the `riviera-docs-freshness` sweep's input, not a substitute for it.
- [ ] **Step 6: Commit** — `git commit -m "Pin the rendered srcset in e2e and refresh ADR-0008's figures (#1041)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-10 | phase 0 | Every reader of `venue_photo_variant` — a second row per surface changes what any of them sees | `grep -rn "venue_photo_variant" platform/src --include=*.java --include=*.sql` | `JdbcPhotoStorage` (3 reads + the write), `JdbcVenueCatalog:293` (tourist read model), `JdbcVenues:610` (console slot read), 2 test call sites | Fixed all three production readers. `JdbcVenueCatalog` keys its map by surface alone, so a second density silently overwrote the first — pinned to `scale = :scale` (BASE_SCALE) until phase 1 widens it. `JdbcVenues` collects with `Collectors.toMap`, which would throw on a duplicate slot key if PREVIEW ever gained a tier — pinned to `PREVIEW_SCALE`. |
| 2026-09-10 | phase 0 | Measured rendition bytes (synthetic noise, so an upper bound — a real photo compresses better) | throwaway `ScratchSizeProbe` against `PhotoProcessor`, deleted after reading | 3:2 3000×2000 → CARD@1 26 KB, CARD@2 95 KB, BANNER@1 48 KB, BANNER@2 170 KB, PREVIEW@1 17 KB (**358 KB**); 16:9 3000×1688 → 29/104/86/**327**/14 KB (**563 KB**); 2:3 2000×3000 → 10/39/17/61/6 KB (**135 KB**) | Feeds R-3 and phase 3's ADR-0008 update. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*PhotoProcessorTest*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*PhotoProcessorTest*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "*VenuePhotoReadModelIT*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*VenuePhotoReadModelIT*"` → PASS.
- [ ] **AC-5:** `./gradlew test --tests "*JdbcPhotoStorageIT*"` → PASS.
- [ ] **AC-6:** `npm test -- photo-slideshow` → PASS.
- [ ] **AC-7:** `npm test -- home` → PASS.
- [ ] **AC-8:** `npm test -- venue-map` → PASS.
- [ ] **AC-9:** `npm run test:e2e:a11y -- discover-photos` → PASS.

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
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
