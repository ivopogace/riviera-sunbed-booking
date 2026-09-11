# LIGHTBOX Photo Surface Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A photo opened in the lightbox is served a rendition sized for the lightbox's own
near-square box, so a 3:2 upload renders 2200 × 1467 and a 2:3 upload 1200 × 1800 — both an exact
DPR-2 match — instead of being stretched from the 8:3 `BANNER` box.

**Architecture:** One new `PhotoSurface` value, `LIGHTBOX`, with a fit-within box of
**2200 × 1800**, stored at **scale 1 only** — the box already carries the density, so a `scale`
axis on top of it would double-count. The decision that shapes everything else is that the lightbox
must get its **own candidate list**: it currently shares `VenueMapView.photos` with the beach-map
band and the gallery grid, and folding a 2200w candidate into that shared list would offer it to
the band, whose `sizes` would take it. So `VenueMapView` gains a second list built from a
`LIGHTBOX → BANNER → CARD → PREVIEW` preference, which is also the un-backfillable fallback:
a photo stored before this surface existed resolves to `BANNER` exactly as it does today.

That this slice *adds* a preference list — the very construct #1059 proposed deleting — is
deliberate and recorded. `.out-of-scope/photo-width-ladder.md` names surfaces multiplying as the
condition that reopens the ladder question; this is the first of the increments it counts.

**Persistence:** JDBC only (invariant #1). `venue_photo_variant` gains no column; migration **V57**
widens `venue_photo_variant_surface_check` to admit `'LIGHTBOX'`. The existing
`UNIQUE (photo_id, surface, scale)` from V56 already admits the new row without change.

**Source of intent:** GitHub issue #1070 (the outcome of #1059's intake grill; #1059 closed
`wontfix` with `.out-of-scope/photo-width-ladder.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — established that the
defect is aspect rather than density, and that a `scale`-3 rung cannot fix it) · `riviera-plan-doc`
(this template — forced the shared-`photos`-array problem into the Architecture line instead of
leaving it for implementation to discover) · `tdd` (phase 0 red-greens the processor bound, phase 2
the read model, phase 3 the frontend) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (`ran over the slice's own surface — ADR-0008's
rendition list and stored-footprint figures, CLAUDE.md's venue table, and PhotoSurface's Javadoc
all state facts this changes; each is an AC below`) · `postgres` (CHECK-over-ENUM is the settled
shape here, so the migration widens the existing `CHECK (surface IN …)` rather than introducing a
type; no new index — the serving lookup already keys on `(venue_id, content_hash)`) ·
`riviera-modulith` (placement: `LIGHTBOX` belongs in the published `venue.vocabulary` enum, the new
view field in the published `VenueMapView` record; no new port, no event, no `allowedDependencies`
change) · `riviera-java-conventions` (§6a — the new bound is named constants beside `BANNER_W`/`_H`,
never inline; §6c — the Javadoc on `PhotoSurface` is a touched block and gets re-read whole) ·
`codebase-design` (no new seam: `PhotoProcessor` stays a deep module behind one method, and the
read model keeps deriving both views from one blob-free query) · `domain-modeling` (`LIGHTBOX`
enters `CONTEXT.md` beside the other surfaces; ADR-0008 takes an amendment-log entry, not a new
ADR — the storage decision is unchanged, only its measured footprint) · `riviera-frontend`
(placement: the view mirror stays in `shared/venue-views.ts`, the `venue` feature remains editor of
record) · `angular-developer` + angular-cli MCP `search_documentation` v22 (the lightbox's
`sizes="94vw"` is already correct for a `contain` box that is nearly square — its element box and
its painted box differ by little — so it needs no change, unlike the band in #1069) · `playwright-cli` (the
fallback path — a photo with no `LIGHTBOX` row — is only observable in a real engine).

**Branch:** `claude/intelligent-albattani-otm46u` — the cloud session's designated remote branch,
standing in for `feature/lightbox-photo-surface` per `riviera-sdlc` § *Remote / cloud session
addendum*. **This slice executes after #1069 merges**; see Open questions for the branch-reuse note.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a 3:2 upload of 4000 × 2667, when it is processed, then a `LIGHTBOX@1` rendition of **2200 × 1467** is among the stored variants. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.rendersALightboxRenditionSizedForItsOwnBox`
- [ ] **AC-2:** Given a 2:3 portrait upload of 2667 × 4000, when it is processed, then the `LIGHTBOX@1` rendition is **1200 × 1800** — taller than the `BANNER@2` rendition it replaces. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.rendersAPortraitLightboxTallerThanItsBanner`
- [ ] **AC-3:** Given an upload smaller than the `LIGHTBOX` box in area, when it is processed, then **no** `LIGHTBOX` rendition is stored — `isNotUpscaled` governs it as it governs the retina tier. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.omitsTheLightboxRenditionRatherThanUpscaleASmallUpload`
- [ ] **AC-4:** Given a venue whose cover photo has a `LIGHTBOX` row, when `findVenueMap` is called, then the returned view's lightbox list carries the `LIGHTBOX` candidate and its `photos` list is **byte-identical to today's** — the band and gallery selection must not move. *Seam:* `venue.api.VenueCatalog#findVenueMap` · *Pinned by:* `VenuePhotoReadModelIT.publishesLightboxCandidatesWithoutDisturbingTheBannerList`
- [ ] **AC-5:** Given a venue whose photos predate this surface (no `LIGHTBOX` row), when `findVenueMap` is called, then the lightbox list falls back to the `BANNER` view and the cover still renders. *Seam:* `venue.api.VenueCatalog#findVenueMap` · *Pinned by:* `VenuePhotoReadModelIT.fallsBackToBannerForAPhotoStoredBeforeTheLightboxSurface`
- [ ] **AC-6:** Given a `venue_photo_variant` row with `surface = 'LIGHTBOX'`, when V57 has run, then the insert succeeds; and given `surface = 'POSTER'`, then it is rejected by `venue_photo_variant_surface_check`. *Seam:* the `venue_photo_variant` table constraint · *Pinned by:* `JdbcPhotoStorageIT.admitsLightboxAndStillRejectsAnUnknownSurface`
- [ ] **AC-7:** Given the venue page at a 1440 × 900 viewport at DPR 2, when a photo with a `LIGHTBOX` row is opened in the lightbox, then the rendered `<img>`'s `currentSrc` is the `LIGHTBOX` candidate, and when a photo without one is opened, it is the `BANNER@2` candidate. *Seam:* the `/venue/:venueId` route's rendered lightbox `<img>` · *Pinned by:* `venue-lightbox-candidates.e2e.ts`
- [ ] **AC-8:** Given every rendition the processor stores, when its byte length is asserted, then the cap is expressed against **its own pixel area**, not against `scale` — `LIGHTBOX@1` is the first scale-1 rendition larger than a scale-2 one, so the existing `200_000 * scale * scale` cap stops meaning what it says. *Seam:* `PhotoProcessor#process` · *Pinned by:* `PhotoProcessorTest.capsEveryRenditionAgainstItsOwnPixelArea`
- [ ] **AC-9:** Given ADR-0008, `CLAUDE.md` and `CONTEXT.md`, when the slice is done, then each states the four-surface vocabulary and the amended stored-footprint figures. *Seam:* the substrate docs · *Pinned by:* the `riviera-docs-freshness` pass at close-out

## Non-goals

- Backfilling existing photos. The full-res original is discarded at upload (ADR-0008); a
  `LIGHTBOX` row appears only on re-upload. AC-5 is the guarantee that this degrades cleanly.
- Adding a `scale`-2 `LIGHTBOX` rendition. 2200 × 1800 already *is* the DPR-2 size for the box.
- Changing the lightbox's `sizes`. `94vw` is already right for a near-square `contain` box; the
  band's wrong value is #1069.
- Touching the Discover card, the beach-map band or the gallery grid's candidate lists. AC-4 pins
  that they do not move.
- Flipping ADR-0008's object-storage decision. The footprint figures are amended; the decision and
  its flip threshold are re-read, not changed.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. `LIGHTBOX` is added beside the existing surfaces; every
existing surface keeps its renditions, its candidate list and its consumers. AC-4 and AC-5 are the
verification that "adds only" is true rather than aspirational.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The 2200w candidate leaks into the band's or gallery's `srcset` and the LCP image balloons | med | **high** | The lightbox gets its own list on `VenueMapView`; the shared `photos` array is left alone. AC-4 asserts the banner list is unchanged, and #1069's e2e independently pins the band's candidate | agent | open |
| R-2 | `PhotoProcessorTest`'s `200_000 * scale * scale` byte cap silently stops constraining, because `LIGHTBOX@1` is a scale-1 rendition larger than every scale-2 one | **high** | med | AC-8 re-expresses the cap against pixel area before the new surface is added, so the guard is meaningful when it first sees it | agent | open |
| R-3 | Stored footprint grows past what ADR-0008 sized its `bytea` decision for | med | med | Measured, not assumed: ~97 KB per photo on photo-like content, ~872 KB on ADR-0008's own synthetic-noise upper bound. Worst case a three-slot venue goes 1.67 MB → 4.1 MB. AC-9 amends the ADR's figures and re-reads its flip threshold in the same slice | agent | open |
| R-4 | Flyway `V57` collides with another branch | low | med | `V56` is the highest on `main` and there are **zero open PRs** (checked at plan time). Default rule stands: the branch that merges second renumbers | agent | open |
| R-5 | A `LIGHTBOX` row is served to the operator console or admin moderation surface, which expect the small `PREVIEW` | low | med | Those paths select by surface explicitly (`VariantMeta` / `PhotoSlots`); add an assertion that the operator slot still resolves `PREVIEW` | agent | open |
| R-6 | Upload latency grows — the processor decodes the raw upload once per rendition and this adds a sixth, at the largest size | med | low | Upload is a rare operator action and the existing Javadoc already accepts the repeated decode. Measure the delta in phase 0 and record it; only act if it exceeds the request timeout | agent | open |
| R-8 | Two existing specs assert that the lightbox shows the **banner** candidates, which is exactly what this slice changes | **certain** | low | Located before phase 0: `venue-map.spec.ts:559` and `discover-photos.e2e.ts:171`. Both are updated in phase 3, and their comments ("the same candidates in a far wider box: the server chose no variant") become false and must be rewritten, not just re-pointed | agent | open |
| R-7 | The e2e's mocked photo fixture has no `LIGHTBOX` candidate, so AC-7 passes vacuously | med | med | The fixture must carry **both** a photo with and one without a `LIGHTBOX` row; AC-7 asserts both branches, so a vacuous pass fails the second | agent | open |

## Open questions / Assumptions

- **Assumption:** 2200 × 1800 is the right box — it is `min(94vw,1100px) × min(88vh,900px)` at DPR 2,
  read from `photo-lightbox.ts:52`. A future lightbox resize invalidates it. — *Owner:* agent ·
  *Resolves by:* phase 1, by citing the CSS box in the constant's one-line comment
- **Assumption:** JPEG quality 0.62 (today's `RETINA_JPEG_QUALITY`) is right for `LIGHTBOX`, since
  it too is consumed at ~1 image pixel per device pixel on a retina screen. A lower quality is what
  makes the measured ~97 KB affordable. — *Owner:* agent · *Resolves by:* phase 1
- **Open question:** Does `VenueSummaryView` need the lightbox list too? The Discover page has no
  lightbox today, so the answer is presumed no. — *Owner:* agent · *Resolves by:* phase 2 step 1,
  by grepping the `photo-lightbox` mount sites
- **Open question:** Branch reuse. This slice and #1069 share one designated remote branch. If
  #1069's PR has merged when this starts, restart the branch from latest `main` per the session's
  git instructions rather than stacking. — *Owner:* human · *Resolves by:* slice start

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds one rendition to the photo pipeline and one
field to a read view. It writes only `venue_photo_variant`, reads no `set_availability` row, and
touches no booking, set-position, pool or sales-window path. The one concurrency property in scope
is already the table's: `UNIQUE (photo_id, surface, scale)` makes a duplicate rendition impossible,
and V57 leaves that constraint untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue_photo_variant` | `RESPONSIBILITIES.md` §`venue` Job: "venue photos … per-slot upload/replace/delete, **processing**, `bytea` storage behind the module-internal `PhotoStorage` port, and the public content-hash serving read" (ADR-0008). A rendition target is photo processing |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueCatalog#findVenueMap(VenueId, LocalDate)` | `VenueMapView` (gains one field), `PhotoView`, `PhotoSourceView`, `PhotoSurface` (gains one constant) — all already in `venue.vocabulary` | the composition root's venue controller |

No new port. `PhotoStorage` and `VenuePhotoModeration` are unchanged; `PhotoSurface` is already
published vocabulary, so the new constant needs no grant change and no `allowedDependencies` edit.

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
| FE-2 | `shared/photo-url.ts` | existing | pure helpers (`apiPhotoView` over the new list) | none | none |
| FE-3 | `venue/venue.service.ts` | existing | HTTP service | signals | none |
| FE-4 | `venue/venue-map.ts` + `.html` | existing | standalone component | signals | none |
| FE-5 | `frontend/e2e/venue-lightbox-candidates.e2e.ts` | new | Playwright spec (CI-safe mocked suite) | n/a | n/a |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
`NgOptimizedImage`. The new list is optional on the interface (`readonly lightboxPhotos?:`) for the
same reason `photos` is — test doubles and older payloads omit it, and `slideshowPhotos`' existing
fallback chain absorbs that. No deviation.

## FE↔BE contract

- **New/changed endpoints:** none. `GET /api/venues/{venueId}/map` gains one optional array field
  on its response; no path, method or status changes. The serving path stays content-addressed —
  no width parameter (ADR-0008: the strong `ETag` *is* the hash).
- **Client typing:** the hand-written mirror in `shared/venue-views.ts`, resolved through
  `apiPhotoView` at the HTTP boundary like every other photo URL. No `as any`.
- **Money/date on the wire:** N/A — this payload carries neither.

## Execution status

**Stage pointer:** `plan — committed, blocked on #1069 merging`

**Next action:** Wait for #1069's PR to merge, then restart the designated branch from latest
`main` and start phase 0 — re-express the processor's byte cap against pixel area (AC-8) *before*
adding the surface, so the guard is meaningful when it first sees `LIGHTBOX`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Re-express the rendition byte cap (AC-8) | | |
| 1 — The `LIGHTBOX` surface + V57 + the processor bound | | |
| 2 — The read model's second candidate list | | |
| 3 — The frontend mirror and the lightbox wiring | | |
| 4 — Substrate docs: ADR-0008, CLAUDE.md, CONTEXT.md | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/lightbox-photo-surface.md` — this plan
- `.out-of-scope/photo-width-ladder.md` — #1059's closure record, committed with this plan because #1070 is its successor
- `platform/src/main/resources/db/migration/V57__venue_photo_variant_lightbox_surface.sql` — widen the surface CHECK
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/PhotoSurface.java` — the new constant + re-read Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — the lightbox candidate list
- `platform/src/main/java/ai/riviera/platform/venue/application/PhotoProcessor.java` — the bound, the quality, the surface set
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — the `LIGHTBOX_SLIDESHOW` preference + the second `slideshowOf` call
- `platform/src/test/java/ai/riviera/platform/venue/application/PhotoProcessorTest.java` — AC-1/2/3/8
- `platform/src/test/java/ai/riviera/platform/venue/VenuePhotoReadModelIT.java` — AC-4/5
- `platform/src/test/java/ai/riviera/platform/venue/JdbcPhotoStorageIT.java` — AC-6
- `frontend/src/app/shared/venue-views.ts` — the mirror
- `frontend/src/app/shared/photo-url.ts` — resolving the new list against the API origin
- `frontend/src/app/venue/venue.service.ts` — mapping the new field
- `frontend/src/app/venue/venue-map.ts|.html` — passing the lightbox its own list
- `frontend/src/app/venue/venue-map.spec.ts` — the fallback when the field is absent, and the lightbox `srcset` assertion at `:559` that currently expects the banner candidates
- `frontend/e2e/discover-photos.e2e.ts` — the lightbox `srcset` assertion at `:171`, same reason
- `frontend/e2e/venue-lightbox-candidates.e2e.ts` — AC-7
- `frontend/e2e/support/photo-views.ts` — a fixture with and without a `LIGHTBOX` row
- `frontend/src/testing/photo-views.ts` — the unit-test double
- `docs/adr/ADR-0008-venue-photo-storage.md` — amended rendition list + footprint figures
- `CLAUDE.md` — the `venue` module row, if the surface vocabulary is stated there
- `CONTEXT.md` — the surface vocabulary in the glossary

---

## Phase 0 — Re-express the rendition byte cap (AC-8)

**Files:** Modify `platform/src/test/java/ai/riviera/platform/venue/application/PhotoProcessorTest.java`

> Done first, and deliberately: the current cap is `200_000 * scale * scale`. `LIGHTBOX@1` is the
> first scale-1 rendition larger than every scale-2 one, so adding the surface first would slip it
> under a guard that no longer means what it says.

- [ ] **Step 1: Write the failing test** — assert every rendition's byte length against its own
      pixel area (a bytes-per-pixel ceiling), not against `scale`. Run it against today's five
      renditions; it must pass for all of them, so pick the ceiling from the measured values rather
      than inventing one.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*PhotoProcessorTest*"` → FAIL
      until the ceiling is calibrated
- [ ] **Step 3: Minimal implementation** — calibrate the ceiling; delete the `scale`-keyed cap.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*PhotoProcessorTest*"` → PASS
- [ ] **Step 5: Commit** — `git commit -m "Cap renditions by pixel area, not by scale (#1070)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The `LIGHTBOX` surface + V57 + the processor bound

**Files:** Create `platform/src/main/resources/db/migration/V57__venue_photo_variant_lightbox_surface.sql` · Modify `PhotoSurface.java`, `PhotoProcessor.java` · Test `PhotoProcessorTest.java`, `JdbcPhotoStorageIT.java`

- [ ] **Step 1: Write the failing tests** — AC-1 (2200 × 1467 for 3:2), AC-2 (1200 × 1800 for 2:3),
      AC-3 (omitted rather than upscaled), AC-6 (the CHECK admits `LIGHTBOX`, rejects `POSTER`).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*PhotoProcessorTest*"` → FAIL
      with no `LIGHTBOX` constant
- [ ] **Step 3: Minimal implementation** — the enum constant; `LIGHTBOX_W`/`LIGHTBOX_H` constants
      beside `BANNER_W`/`_H` (§6a — never inline); `LIGHTBOX` excluded from `RETINA_SURFACES` so it
      stays scale 1; the migration widening the CHECK. Re-read `PhotoSurface`'s Javadoc whole
      (§6c) — it currently says "the two tourist surfaces carry a scale-2 rendition", which stops
      being the whole truth.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*PhotoProcessorTest*"`, then
      `./gradlew test --tests "*JdbcPhotoStorageIT*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — Population `every place that enumerates PhotoSurface
      or its DB token` → enumerate
      `grep -rn "PhotoSurface\.\|'CARD'\|'BANNER'\|'PREVIEW'" platform/src frontend/src` +
      `git ls-files '*/adapter/out/*.java'` (an empty search is not evidence of absence —
      `CLAUDE.md` § Searching the codebase) → candidates `<list>` → decision `<…>`.
- [ ] **Step 6: Run the structural net** — the six-test command in `CLAUDE.md` § Commands. A new
      published vocabulary constant is a structure change.
- [ ] **Step 7: Commit** — `git commit -m "Add the LIGHTBOX photo surface (#1070)"`
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The read model's second candidate list

**Files:** Modify `VenueMapView.java`, `JdbcVenueCatalog.java` · Test `VenuePhotoReadModelIT.java`

- [ ] **Step 1: Write the failing tests** — AC-4 (the lightbox list carries `LIGHTBOX`; the
      `photos` list is unchanged) and AC-5 (fallback to `BANNER` with no `LIGHTBOX` row). Resolve the
      Open question on `VenueSummaryView` first:
      `grep -rn "app-photo-lightbox" frontend/src/app`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenuePhotoReadModelIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `LIGHTBOX_SLIDESHOW = List.of(LIGHTBOX, BANNER, CARD,
      PREVIEW)` beside the existing two; a second `slideshowOf` call in `findVenueMap`; the new
      field on `VenueMapView`. `coverOf`'s complete-pair guard stays exactly as it is — `LIGHTBOX`
      must **not** join it, or every pre-existing cover photo would read as absent.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenuePhotoReadModelIT*"`, then
      broaden to `./gradlew test --tests "*venue*"` → PASS
- [ ] **Step 5: Commit** — `git commit -m "Publish lightbox candidates on the venue map view (#1070)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — The frontend mirror and the lightbox wiring

**Files:** Modify `venue-views.ts`, `photo-url.ts`, `venue.service.ts`, `venue-map.ts|.html`, `frontend/src/testing/photo-views.ts` · Create `frontend/e2e/venue-lightbox-candidates.e2e.ts` · Test `venue-map.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-7 in the e2e (both branches: with and without a
      `LIGHTBOX` row — R-7), plus a unit spec that an absent `lightboxPhotos` falls back to `photos`.
- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-lightbox-candidates` → FAIL
- [ ] **Step 3: Minimal implementation** — the optional field on the mirror, `apiPhotoView` over the
      new list in `venue.service.ts`, and `venue-map.html:353` binding the lightbox to it with the
      existing `slideshowPhotos` fallback shape.
- [ ] **Step 3a: Update the two specs that assert the old sharing** — `venue-map.spec.ts:559` and
      `discover-photos.e2e.ts:171`. Their comments assert the lightbox and hero share one candidate
      list; that is the property this slice ends, so rewrite the comments rather than re-pointing
      the expectation.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map photo-url` then
      `npm run test:e2e:a11y` → PASS; then `npm run lint && npm run format:check`
- [ ] **Step 5: Commit** — `git commit -m "Serve the lightbox its own candidates (#1070)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Substrate docs

**Files:** Modify `docs/adr/ADR-0008-venue-photo-storage.md`, `CLAUDE.md`, `CONTEXT.md`

- [ ] **Step 1: Run `riviera-docs-freshness`** over the slice's range, including the counting sweep
      for the "two tourist surfaces" phrasing, which this slice falsifies in at least
      `PhotoSurface`'s Javadoc, `V56`'s header comment and ADR-0008.
- [ ] **Step 2: Amend ADR-0008** — a new amendment-log entry; the rendition list; and the
      stored-footprint figures, which move from "≈135–565 KB per photo" once the largest single
      rendition is the `LIGHTBOX` one. Re-read the flip threshold and state whether it still holds.
- [ ] **Step 3: Update `CLAUDE.md` and `CONTEXT.md`** — the surface vocabulary.
- [ ] **Step 4: Verify** — `node scripts/check-plan-file-structure.mjs --diff origin/main` and
      `node scripts/check-inline-comments.mjs --diff origin/main` → clean
- [ ] **Step 5: Commit** — `git commit -m "Amend ADR-0008 for the lightbox surface (#1070)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*PhotoProcessorTest*"` → 2200 × 1467. Verified at commit `<sha>`.
- [ ] **AC-2:** same run → 1200 × 1800 portrait. Verified at commit `<sha>`.
- [ ] **AC-3:** same run → no upscaled rendition. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `./gradlew test --tests "*VenuePhotoReadModelIT*"` → banner list unchanged. Verified at commit `<sha>`.
- [ ] **AC-5:** same run → falls back to `BANNER`. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `./gradlew test --tests "*JdbcPhotoStorageIT*"` → CHECK admits/rejects. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- venue-lightbox-candidates` → both branches. Verified at commit `<sha>`.
- [ ] **AC-8:** Run `./gradlew test --tests "*PhotoProcessorTest*"` → area-based cap. Verified at commit `<sha>`.
- [ ] **AC-9:** `riviera-docs-freshness` pass reports no stale statement. Verified at commit `<sha>`.

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
