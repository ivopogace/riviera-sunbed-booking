# Venue Photos — operator upload + tourist display Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator can upload / replace / delete a photo in each of their venue's three
slots (cover / sunbeds / bar); tourists see the **cover** photo on Discover cards and the
beach-map banner — replacing the gradient placeholders — served off an immutable, cached
endpoint that hits the database ≈once per image.

**Architecture:** Photos are stored as **resized, EXIF-stripped, capped variants in Postgres
`bytea`, behind a swappable `PhotoStorage` port** (ADR-0008) — the `PaymentGateway` mirror
(real `bytea` adapter + in-memory fake; object-store deferred as a one-adapter swap). A second,
**pure** `PhotoProcessor` deep module (validate → strip EXIF → resize → encode) sits between the
controller and the port so no I/O or Stripe-style profile branching touches the image logic. All
of it lives in the **`venue`** module; the tourist read is public, the write path is
venue-scoped (`assertOwns` first, invariant #13).

**Persistence:** JDBC only (invariant #1). New Flyway **V24** — `venue_photo` (lean metadata)
+ `venue_photo_variant` (metadata + the `bytea`); `bytea` never appears in a list/metadata
query. Bytes move via `JdbcClient` `setBytes`/`getBytes`, no JPA.

**Source of intent:** GitHub issue **#142**; design placeholders in `docs/design/`
(`riviera-sunbeds-liquid-glass-v3.dc.html`, `riviera-operator-console-v2.dc.html`, intake note
`2026-07-02-liquid-glass-redesign-note.md`); storage decision **ADR-0008**.

**Skills consulted** (routing-gate output):
- `riviera-sdlc` — routed the gate; `riviera-plan-doc` — this doc's discipline.
- `domain-modeling` — wrote **ADR-0008** (bytea-behind-port; flip threshold); new glossary
  terms (venue photo / photo variant / photo slot) land in `CONTEXT.md` at phase 5.
- `riviera-modulith` — placement: `PhotoStorage`/`PhotoProcessor` are **module-internal**
  driven ports in `venue/application/` (**not** `api/` — nobody outside `venue` calls them);
  **no** new `api`/`spi`/`events`; `operator::api` grant already present → `allowedDependencies`
  unchanged; a photo change publishes **no** domain event (no consumer).
- `postgres` — two-table split (blob isolated), `slot`/`surface` as `TEXT` + `CHECK` (not enum),
  index the `venue_id` FK, `TIMESTAMPTZ`, `ON DELETE CASCADE` from variant→photo.
- `codebase-design` — `PhotoStorage` is the **real** seam (bytea↔S3 varies → 2 adapters);
  `PhotoProcessor` is a **deep module with one impl** (a hypothetical seam that still earns its
  keep by concentrating image logic); both accept-dependencies for fakeable service tests.
- *To load at implement, per area:* `riviera-java-conventions` (Java idioms + the `ProblemDetail`
  error contract §6b), `riviera-frontend` + `angular-developer` + angular-cli MCP (FE placement +
  v22 APIs + `NgOptimizedImage`), `playwright-cli` (e2e `file_upload`), `riviera-local-debug`
  (scoped build/test recipe). `riviera-stripe-payments` — **N/A, no money.**

**Branch:** `feature/venue-photos` (exists; created off `main` before phase 0).

---

## Acceptance criteria (testable)

> Written at the inner hexagon (the `venue` application boundary), tech-specifics pushed to
> adapter-level tests.

- [ ] **AC-1 (upload):** Given operator O owns venue V and no cover photo exists, when O uploads
  a valid 4000×3000 JPEG to slot `cover`, then a `VenuePhoto(V, cover)` exists with the expected
  capped variants (card + banner + preview), each within its byte + dimension cap. *Pinned by:*
  `VenuePhotoServiceTest.uploadStoresCappedVariants`.
- [ ] **AC-2 (replace = at most one per slot):** Given a cover photo already exists for V, when O
  uploads a new cover image, then the old variants are gone and only the new ones remain — exactly
  one photo per `(venue, slot)`. *Pinned by:* `VenuePhotoServiceTest.replaceOverwritesSlot` +
  `JdbcPhotoStorageIT.uniqueVenueSlot` (DB `UNIQUE(venue_id, slot)`).
- [ ] **AC-3 (delete = single-tx erasure):** When O deletes the cover slot, then the metadata row
  **and** all variant bytes are removed in one transaction. *Pinned by:*
  `VenuePhotoServiceTest.deleteRemovesMetadataAndBytes` + `JdbcPhotoStorageIT.deleteCascade`.
- [ ] **AC-4 (BOLA, invariant #13):** Given operator O2 does **not** own venue V, when O2 calls
  upload / replace / delete on V's photos, then the service throws before any storage call and the
  endpoint returns **403**. *Pinned by:* `CrossVenueDenialIT` (extended with the photo routes).
- [ ] **AC-5 (input validation):** When the upload is > 25 MB, or its real bytes are not a
  supported image (magic-byte check, not the `Content-Type` header), or it decodes beyond the
  ~50 MP / 12 000-px guard, then it is rejected with a `4xx` `ProblemDetail` and nothing is
  stored. *Pinned by:* `PhotoProcessorTest.rejectsOversizeWrongMagicAndBombs`.
- [ ] **AC-6 (EXIF strip):** Given a JPEG carrying GPS EXIF, when processed, then no stored
  variant carries EXIF/GPS metadata (orientation is applied to pixels first, then metadata
  dropped). *Pinned by:* `PhotoProcessorTest.stripsExifKeepsOrientation`.
- [ ] **AC-7 (immutable, cache-once serving):** When the serving endpoint is hit for a variant
  hash, then it returns the bytes with `Cache-Control: public, max-age=31536000, immutable` and a
  strong `ETag`; a conditional `If-None-Match` re-request returns **304** without a blob read.
  *Pinned by:* `VenuePhotoServingIT.immutableCacheAndConditionalGet`.
- [ ] **AC-8 (read model exposes cover only when present):** The public venue discovery + map read
  model exposes cover `card` + `banner` URLs when a cover photo exists, and `null` otherwise;
  the `bytea` column is never selected by these queries. *Pinned by:*
  `VenuePhotoReadModelIT.discoveryExposesCoverUrlsWithoutBlob`.
- [ ] **AC-9 (operator FE):** In the operator Venue tab, each slot supports pick → preview →
  upload, replace, and delete against the real contract (mocked in e2e). *Pinned by:*
  `frontend/e2e/operator-venue-photos.spec.ts` (`file_upload`) + `venue-tab.spec.ts`.
- [ ] **AC-10 (tourist FE + contrast floor preserved):** Discover card and beach-map banner render
  the cover via `NgOptimizedImage` when present and fall back to the existing gradient when
  absent; the `--riv-photo-scrim` AA floor still holds. *Pinned by:* `home.contrast.spec.ts` +
  `venue-map.contrast.spec.ts` (unchanged assertions still pass) + `frontend/e2e/discover-photos.spec.ts`.

## Non-goals

- **Moderation** — deferred (grill decision); a follow-up issue is filed. No approval queue,
  no `moderation_state` column.
- **Automated GDPR erasure / retention policy** — deferred to **#101**. This slice ships only
  operator-initiated delete/replace (which already makes #101 a single `DELETE`).
- **Tourist gallery for sunbeds / bar** — those two are uploaded, stored, and shown in the
  operator slots, but not surfaced to tourists (the designs render only the cover on card +
  banner). A gallery is a follow-up.
- **Storing the full-res original** — decoded, resized, discarded (ADR-0008). Changing resize
  targets later means operators re-upload.
- **Object-storage / CDN adapter** — deferred behind the port until a flip-threshold condition
  (ADR-0008).
- **HEIC / AVIF upload formats** — JPEG / PNG / WebP only.

## Behavior-parity ledger

> This slice **replaces two placeholder surfaces** (operator dashed slots + tourist gradient),
> so the tourist gradient's one real behavior — the contrast floor — must be preserved.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Tourist card/banner render a gradient (`--riv-photo-grad`) placeholder | changed | Renders the cover photo when present; **falls back to the same gradient** when absent — so the placeholder survives as the empty state |
| `--riv-photo-scrim` `0.5@75%` floor keeps the beach·region overlay at WCAG AA | **preserved** | Scrim stays layered over the photo; `home.contrast.spec.ts` / `venue-map.contrast.spec.ts` assertions kept and must still pass (#142 deferred note) |
| "Venue photos coming soon" pill on the map banner | dropped → **replaced** | Removed when a photo is present; on the empty state the bare gradient shows without the pill (the follow-up is shipping, so "coming soon" is no longer true) |
| Operator dashed slot placeholders + "coming in a later update (#142)" note | dropped → **replaced** | Replaced by real upload/replace/delete controls with a live preview |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Decompression bomb / huge decode OOMs the free-tier instance | med | high | Hard ~50 MP / 12 000-px **dimension guard** decided *before* full decode (read header dims first) + 25 MB byte cap + bounded upload concurrency; `PhotoProcessorTest` guard tests (per-side + megapixel) | impl | mitigated (Phase 1) |
| R-2 | Cross-venue write (BOLA, invariant #13) | med | high | `assertOwns(operator, venueId)` as the **first** line of every write service method (reuses `venue`→`operator::api`); `CrossVenueDenialIT` extended to photo routes | impl | mitigated (Phase 2: service-level `VenuePhotoServiceTest` + HTTP `CrossVenueDenialIT` photo routes + owner-positive) |
| R-3 | `bytea` leaks into list/metadata queries → fat responses, Neon load | med | med | Blob isolated in `venue_photo_variant`; read-model + list SQL select metadata columns only, **never** `SELECT *`; review check (RV-BE) | impl | mitigated (Phase 2b: `bytes` selected only in `loadBytes`, grep-verified; review re-checks) |
| R-4 | Tourist read puts Neon in the hot path | med | high | Content-hash URL + `Cache-Control: immutable` + `ETag` + `304`; blob read only on cache miss; `VenuePhotoServingIT` | impl | mitigated (Phase 2: serving IT incl. 304-without-blob-read pin) |
| R-5 | Flyway V24 collision (case #122/#127) | low | high | Verified **V24 free on `main`, no open PRs**; if a parallel slice merges V24 first, **this branch renumbers** (merges-second rule) | impl | verified-free |
| R-6 | `Content-Type` header spoofed | med | med | Validate **actual bytes** via image decode + magic-byte sniff; ignore the client header for the trust decision | impl | mitigated (Phase 1: magic sniff + `rejectsNonImageBytesByMagicNotContentType`) |
| R-7 | WebP **encoding** needs a native lib (awkward in the JDK/Docker build) | med | low | Default variant output to **progressive JPEG** (native `ImageIO`); revisit WebP only if a clean pure-JVM encoder is confirmed (OQ-1) | impl | closed — JPEG output chosen |
| R-8 | EXIF-orientation lost on re-encode → sideways photos | med | med | Thumbnailator `useExifOrientation(true)` applies orientation to pixels, then JPEG re-encode drops all metadata; `PhotoProcessorTest.stripsExifMetadataFromEveryVariant` | impl | mitigated (Phase 1) |
| R-9 | Ad-hoc `{"error":…}` body instead of the central contract | low | med | Errors as centralized `ProblemDetail` (`riviera-java-conventions` §6b) | impl | mitigated (Phase 2: all photo errors via `ApiProblem`/advice; 413 code pinned by `ApiErrorHandlerTest` after F-1) |
| R-10 | Public serving route breaks the `/api/**` security rules | med | high | `SecurityConfig`: permit **GET** `/api/venues/*/photos/**` publicly, keep **POST/DELETE** authenticated; a shared-file change → `/security-review` + review flag | impl | mitigated (Phase 2: POST/DELETE role-gated, GET public — pinned by serving IT [no session] + `CrossVenueDenialIT`); `/security-review` still due at the gate |

## Open questions / Assumptions

- *(OQ-1 codec, OQ-2 image-lib, and the resize-target assumption were resolved at Phase 1 — see
  the **### Resolved** entries below.)*
- **Assumption (scope, maintainer-confirmed at grill):** Only the **cover** slot is surfaced to
  tourists; sunbeds/bar are stored + operator-preview only.
- **Assumption:** Upload transport is `multipart/form-data` (`MultipartFile`), one file per
  request per slot.
- *(OQ-3 resolved at the Sonar gate — see **### Resolved**.)*

### Resolved
- **OQ-3 (Sonar S6218):** flagged as predicted on `StoredBytes` + `StoredVariant`; fixed with
  content-aware `equals`/`hashCode` (`Arrays.equals`/`hashCode` via record deconstruction) and a
  `toString` that renders the byte COUNT, never the payload (Sonar gate, 2026-07-11).
- Storage backend — Postgres `bytea` behind `PhotoStorage` port (**ADR-0008**, grill 2026-07-11).
- Upload limits — JPEG/PNG/WebP, ≤25 MB, EXIF stripped, ~50 MP guard (grill 2026-07-11).
- Moderation — deferred; GDPR erasure — operator delete/replace only, automation → #101; scale —
  few venues/light browse confirms bytea (grill 2026-07-11).
- **OQ-1 codec (Phase 1):** progressive JPEG, quality 0.82 (`content_type` `image/jpeg`) — native
  `ImageIO` writer, no WebP native-encoder dependency.
- **OQ-2 image lib (Phase 1):** TwelveMonkeys `imageio-jpeg` + `imageio-webp` (decode; ServiceLoader
  auto-register) + Thumbnailator (resize + EXIF-orientation). Added to `platform/build.gradle`.
- **Resize targets (Phase 1):** **fit-within** bounds — card 640×384, banner 1280×480, preview
  480×360 — with the frontend's `object-fit: cover` doing the visible crop (no server-side crop, no
  wasted pixels); tests assert each variant ≤ its bound and ≤ 200 KB. Cover → card+banner+preview;
  secondary slots → preview only.
- **Phase-1 corrections:** implemented as a single package-private `PhotoProcessor` class (one impl →
  no `DefaultPhotoProcessor`, no interface; riviera-java-conventions §4). WebP *happy-path* is not
  unit-tested — no pure-JVM WebP **writer** to build a fixture; WebP decode is covered by the lib +
  CI/manual. R-7 (WebP encoding) closed by choosing JPEG output.

## Availability & concurrency (invariant #2)

**N/A — does not touch `availability`, `booking`, or the beach-map set layout.** Photos are venue
**profile media**; no `(set_id, booking_date)` row is written. The only concurrency is
per-slot replace, made safe by `UNIQUE(venue_id, slot)` + a single-transaction **slot-row upsert
(`ON CONFLICT (venue_id, slot) DO UPDATE`) whose row lock serializes concurrent replaces** — the
original delete-then-insert raced (review F-3) — then a variant swap under the same lock (last
writer wins per slot; no optimistic-version contract needed — a photo replace is not a
lost-update hazard the way #224/#226 profile/set edits were). Pinned by
`JdbcPhotoStorageIT.concurrentReplacesOfTheSameSlotSerializeToOnePhoto`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` (photo is venue profile media) | `venue` Job: "own venue profiles (incl. amenities…)" — photos are venue-owned profile data; on **no** other module's Not-My-Job list |

**Cross-module named interfaces (`api/` ports):** **none added.** Write path reuses the existing
`venue → operator::api` (`VenueOwnership`) grant for `assertOwns`. Tourist photo URLs are added to
the **existing** public venue read model (discovery + map DTOs) — new fields on already-published
records, no new port.

**Internal ports (module-private, `venue/application/` — not published):**

| Port | Purpose | Real adapter | Fake |
|---|---|---|---|
| `PhotoStorage` | persist a slot's variants + metadata atomically; load bytes by hash; delete a slot | `JdbcPhotoStorage` (`adapter/out`, `bytea`) | `InMemoryPhotoStorage` (test) |
| `PhotoProcessor` | validate → strip EXIF → resize → encode (pure) | `DefaultPhotoProcessor` (one impl) | used directly in tests (deterministic) |

**Domain events:** **none.** No other module reacts to a photo change (checked against the
event spine — availability/payout care about `BookingConfirmed`, not media). Inventing an event
here would be the coupling smell `riviera-modulith` warns against.

### Module ownership (§4a)

All-in-`venue`, no cross-module interaction beyond the existing `operator::api` ownership check.
`venue` Job covers venue profile data (amenities are the precedent); photos are not on any
module's **Not My Job** list, and no other module claims media. One-module slice.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.**

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab.ts` + `.html` | modify | standalone component | Signals; per-slot upload state | file input (no Signal Form needed) |
| FE-2 | `operator/venue-photo.service.ts` (or `core/`) | new | injectable service | — | — |
| FE-3 | `pages/home/home.html` (+ `.ts`) | modify | standalone component | Signals | — |
| FE-4 | `venue/venue-map.html` (+ `.ts`) | modify | standalone component | Signals | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`, **`NgOptimizedImage`
for the real photo URLs** (works for URLs, **not** base64 — our endpoint returns real URLs).
Carry the two #142 deferred notes: (a) per-card `backdrop-filter` GPU-layer cost on large grids —
watch for scroll jank once real photos land; (b) keep/strengthen `--riv-photo-scrim` and re-check
the contrast specs if the photo band's height/offset changes. FE placement is `riviera-frontend`'s
call at implement (service in `core/` vs feature-local; the tourist read type).

## FE↔BE contract

- **`POST /api/venues/{venueId}/photos/{slot}`** — `multipart/form-data` part `file` (one image);
  `slot ∈ {cover,sunbeds,bar}`. → `200` `PhotoUploadResponse` (per-surface URLs);
  `400` `ProblemDetail` (invalid image → reason code; too large → `TOO_LARGE`); `413` for a >30 MB
  multipart; `403` cross-venue; `401` unauthenticated. **POST, not PUT** — multipart parsing is
  reliable on POST across servlet containers; the slot upload is an idempotent replace either way.
  CSRF: rides the `.spa()` XSRF header (not exempt).
- **`DELETE /api/venues/{venueId}/photos/{slot}`** → `204`; `403` cross-venue.
- **`GET /api/venues/{venueId}/photos/{hash}`** — **public**; → `200` image bytes with
  `Cache-Control: public, max-age=31536000, immutable` + strong `ETag`; `304` on matching
  `If-None-Match`; `404` unknown hash.
- **Read model:** discovery card + map DTOs gain `coverPhoto: { card: string; banner: string } |
  null`. Operator venue-detail DTO gains per slot `{ present: boolean; previewUrl: string | null }`.
- **Client typing:** hand-written typed service; no `as any`. URLs are opaque strings the client
  feeds to `NgOptimizedImage` / `<img>`.

## Execution status

> Session-recovery anchor. Re-read before acting after any compaction or in a fresh session.

**Stage pointer:** `GATES: local review RUN (riviera-review-overlay + /code-review high, 21-agent workflow) → 10 findings F-2..F-11, ALL FIXED through the loop (re-entry: postgres/java-conventions/modulith/FE skills; red-first where pinnable; backend photo suite + structural nets + FE lint/653-unit/build/45-e2e green — one unrelated operator-requests e2e flake, passes in isolation). /security-review RUN: no high-confidence findings. BLOCKED on maintainer confirmation to push (CI) → PR → Sonar (watch OQ-3 S6218) → merge (+ close-out incl. graphify update).`

**Next action:** maintainer confirms → push `feature/venue-photos` → verify CI green → open PR →
Sonar gate (pull the new-issue list) → merge + close-out checklist.

**Windows-session note:** the CI-safe mocked Playwright suite here is **`npm run test:e2e:a11y`**
(`playwright.a11y.config.ts`, testMatch `e2e/*.e2e.ts`, no backend); the bare `test:e2e` config
boots the real backend via `./gradlew bootRun` and fails on this box. e2e spec naming is
`*.e2e.ts`, so the plan's `operator-venue-photos.spec.ts` shipped as `operator-venue-photos.e2e.ts`
(and `discover-photos.spec.ts` → `discover-photos.e2e.ts`).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Schema + storage port (V24, tables, `PhotoStorage`, bytea adapter + fake) | ✅ | Phase-0 commit (this window) |
| 1 — `PhotoProcessor` (validate/EXIF/resize/encode) | ✅ | Phase-1 commit (this window) |
| 2 — Service + controller + serving + read-model + SecurityConfig (BOLA, cache) | ✅ | 2a core `0a3e8d5`; ITs + F-1 `c2b6848`; 2b read-model (this window) |
| 3 — FE operator upload UI + service + e2e | ✅ | this window |
| 4 — FE tourist display (card + banner) + contrast re-check + e2e/a11y | ✅ | this window |
| 5 — Docs freshness (glossary/RESPONSIBILITIES) + close-out | ⏳ | docs this window; close-out after merge |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | local IT (first web-context boot after 2a) | The 2a `@ExceptionHandler(MaxUploadSizeExceededException)` duplicated the `ResponseEntityExceptionHandler` base handler (final since FW 6.1) → ambiguous mapping, Spring context failed to start for every MockMvc IT. Fix: handler removed; 413 flows through `handleExceptionInternal`, `code` pinned to `PAYLOAD_TOO_LARGE` in `defaultCode` (literal 413 — the enum constant is mid-rename). Pinned by `ApiErrorHandlerTest.uploadBeyondTheMultipartLimitIs413WithStableCode` (red→green). Side effect: the compile-time deprecation NOTE on `ApiErrorHandler` is gone — it was the removed handler's own `HttpStatus.PAYLOAD_TOO_LARGE` reference (new code, not pre-existing). | fixed |
| F-2 | review (high, CONFIRMED) | `UNIQUE(venue_id, content_hash)` spanned slots → the same image in two slots (byte-identical PREVIEWs, same SHA-256) broke the 2nd upload with an unrecoverable 409. Fix: constraint → plain serving index `venue_photo_variant_serving_idx` (V24 edited in place — branch-local, never applied outside disposable test DBs); `loadBytes` gains `LIMIT 1` (duplicate rows are content-identical by construction). Pinned by `JdbcPhotoStorageIT.theSameImageCanOccupyTwoSlotsOfOneVenue`. | fixed |
| F-3 | review (high, CONFIRMED) | `replace()` delete-then-insert raced: a concurrent same-slot replace died on `venue_photo_slot_uniq`. Fix: slot-row upsert `ON CONFLICT (venue_id, slot) DO UPDATE SET created_at = NOW()` (row lock serializes; last writer wins; `created_at` now = the current photo's upload) + variant swap by `photo_id`. Pinned by `JdbcPhotoStorageIT.concurrentReplacesOfTheSameSlotSerializeToOnePhoto` (2-thread). | fixed |
| F-4 | review (high, CONFIRMED) | `@Transactional` on `VenuePhotoService.upload` pinned a Hikari connection through the CPU-heavy 25MB decode/resize — pool starvation under upload bursts. Fix: service tx removed (the adapter's `replace()` is itself `@Transactional`; delete is one cascading statement); comment explains the deliberate absence. | fixed |
| F-5 | review (CONFIRMED) | Header-only up-front check let a header-parses/raster-fails file (CMYK JPEG) escape as a 500 (`UncheckedIOException`). Fix: `render()` throws `IOException`, `process()` catches → typed `Rejected(UNREADABLE)`. Pinned by `PhotoProcessorTest.rejectsAJpegWhoseHeaderParsesButWhoseRasterDoesNot` (cut-before-SOS fixture; a mid-scan truncation decodes leniently, learned red-first). | fixed |
| F-6 | review (CONFIRMED) | Tomcat's default 2MB `max-swallow-size` aborted oversize uploads before the 413 body reached the browser (status-0 network error → generic copy). Fix: `server.tomcat.max-swallow-size=33MB` (≥ max-request-size). | fixed |
| F-7 | review (CONFIRMED) | Serving URLs are root-relative but dev `apiBaseUrl` is another origin → every photo broken in local dev. Fix: `venue/photo-url.ts` (`apiPhotoUrl`/`resolveCoverPhoto`) applied at the three HTTP-service boundaries (venue list/map, profile previews, upload response) — a no-op in same-origin prod; specs/e2e assert the resolved URLs (ends-with regex in e2e). | fixed |
| F-8 | review (PLAUSIBLE) | A COVER photo missing one of its CARD/BANNER variant rows produced a non-null `CoverPhotoView` with a null URL → NgOptimizedImage throws past the `@if` guard. Fix: `coverPhotosByVenue` emits a view only for a COMPLETE pair; an incomplete cover reads as "no cover" (gradient fallback). | fixed |
| F-9 | review (CONFIRMED) | Operator slot preview used raw `<img [src]>` against the NgOptimizedImage mandate. Fix: `ngSrc` + `NgOptimizedImage` import in the venue tab. | fixed |
| F-10 | review (cleanup, CONFIRMED) | `actualDimensions()` full-raster-decoded each rendered variant just for width/height. Fix: reuse the header-only `readHeaderDimensions` on our own fresh JPEG; helper deleted. | fixed |
| F-11 | review (cleanup, CONFIRMED) | `present` was derivable lock-step state (`≡ previewUrl != null`) across `PhotoSlotView`, the wire `SlotPhoto`, and the FE model. Fix: dropped everywhere; emptiness is the null `previewUrl`. | fixed |
| F-12 | CI (PR #241 first run, red) | The full-suite-only class (#122/#127 kin, reproduced locally with the bare `test` task): the `@WebMvcTest` slices (`RateLimit*`, `SpaShell`, `WebCors*`) register every `@RestController` and stub each controller port in `WebSliceStubs` — the new `VenuePhotoController` introduced the `VenuePhotos` port nobody stubbed → 24 context-load failures. Scoped local runs never boot those slices, so only CI (or a full local run) could show it. Fix: an inert `VenuePhotos` stub bean (upload→Rejected, delete→false, serve→empty) in `WebSliceStubs`; full local suite green. Rule for next time: a new controller ⇒ a new `WebSliceStubs` bean. | fixed |
| F-13 | Sonar gate (PR #241: gate ERROR on new_reliability_rating; 6 reported new issues; coverage 83.5% ✅, duplication 0.0 ✅) | All six in-code-fixed to reach a literally-empty list: 2× `java:S6218` BUG (`StoredBytes`/`StoredVariant` — OQ-3 as predicted → content-aware equals/hashCode + byte-count toString); `java:S1192` CRITICAL (`"venueIds"` ×3 → `P_VENUE_IDS` constant, house COL_*/P_* pattern); `java:S125` + `css:S125` (comments that read as commented-out code → rephrased in prose); `Web:S6851` (redundant "photo" in the preview img alt → role-free alt text). | fixed |

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/venue/`)**
- `vocabulary/PhotoSlot.java` — `enum {COVER, SUNBEDS, BAR}` (published; the read model + controller speak it).
- `vocabulary/PhotoSurface.java` — `enum {CARD, BANNER, PREVIEW}`.
- `vocabulary/ContentHash.java` — value type (hex) for the immutable URL / `ETag`.
- `vocabulary/VenuePhotoView.java` — read-model record: per-slot presence + surface URLs.
- `application/PhotoStorage.java` — the port (store / loadBytes / delete / list-metadata).
- `application/PhotoProcessor.java` — the port (`ProcessedPhoto process(byte[], PhotoSlot)`).
- `application/DefaultPhotoProcessor.java` — the one impl (validate/EXIF/resize/encode).
- `application/VenuePhotoService.java` — `@Service`; `assertOwns` → process → storage; serving lookup.
- `application/ProcessedPhoto.java`, `application/StoredVariant.java` — value records.
- `adapter/out/JdbcPhotoStorage.java` — `bytea` adapter (`JdbcClient`, package-private).
- `adapter/in/VenuePhotoController.java` — `PUT`/`DELETE` (venue-scoped) + `GET` serving (public).
- `adapter/in/…` request/response DTOs as needed.
- **Test:** `application/InMemoryPhotoStorage.java` (test fake), `PhotoProcessorTest`,
  `VenuePhotoServiceTest`, `adapter/out/JdbcPhotoStorageIT`, `adapter/in/VenuePhotoServingIT`,
  `VenuePhotoReadModelIT`, `CrossVenueDenialIT` (extend), fixture images under `test/resources`.

**Migration**
- `platform/src/main/resources/db/migration/V24__venue_photo.sql`.

**Security**
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — permit public GET on the
  photo serving route (shared root-package file — review + `/security-review`).

**Frontend (`frontend/src/app/`)**
- `operator/venue-photo.service.ts` (+ spec) — typed client for the three endpoints.
- `operator/venue-tab.ts` / `.html` / `.spec.ts` / `.a11y.spec.ts` — real upload UI.
- `pages/home/home.html` / `home.ts` — cover on the card via `NgOptimizedImage` + fallback.
- `venue/venue-map.html` / `venue-map.ts` — cover on the banner + fallback.
- read-model type additions where the venue DTOs are declared.
- `frontend/e2e/operator-venue-photos.spec.ts`, `frontend/e2e/discover-photos.spec.ts` (mocked).

---

## Phase 0 — Schema + storage port

**Files:** Create `V24__venue_photo.sql`, `PhotoSlot`/`PhotoSurface`/`ContentHash`,
`PhotoStorage`, `JdbcPhotoStorage`, `InMemoryPhotoStorage`, `StoredVariant`/`ProcessedPhoto` ·
Test `JdbcPhotoStorageIT`.

- [x] **Step 1 — failing test:** `JdbcPhotoStorageIT` (Testcontainers Postgres) — variants
  round-trip, `listMetadata` is blob-free, `loadBytes` finds by hash, a re-upload **replaces** the
  slot (one photo per `(venue, slot)`), and `delete` erases metadata + variant bytes (cascade).
- [x] **Step 2 — ran, RED confirmed** — `--tests "*JdbcPhotoStorageIT*"` → 4× `BadSqlGrammarException` (`relation "venue_photo" does not exist`); proves the IT hits real persistence.
- [x] **Step 3 — implemented (as shipped, corrects the pre-code sketch):** V24 + `JdbcClient` adapter + value types + fake.
  - `venue_photo`: `id BIGINT GENERATED ALWAYS AS IDENTITY PK`, `venue_id BIGINT NOT NULL REFERENCES
    venue(id) ON DELETE CASCADE`, `slot TEXT CHECK (slot IN ('COVER','SUNBEDS','BAR'))`, `created_at
    TIMESTAMPTZ`, `UNIQUE (venue_id, slot)`, index on `venue_id`.
  - `venue_photo_variant`: `id BIGINT … IDENTITY PK`, `photo_id BIGINT REFERENCES venue_photo(id) ON
    DELETE CASCADE`, `venue_id BIGINT REFERENCES venue(id) ON DELETE CASCADE` (denormalised for the
    scoped serving lookup), `surface TEXT CHECK ('CARD','BANNER','PREVIEW')`, `content_hash TEXT`,
    `content_type TEXT`, `width/height/byte_size INT`, `bytes BYTEA`, `UNIQUE (photo_id, surface)`,
    `UNIQUE (venue_id, content_hash)` (leading `venue_id` also indexes the FK), index on `photo_id`.
  - **Corrections vs the pre-code sketch:** PKs are `BIGINT` identity, **not** UUID (matches
    venue/set_position); enum tokens are **UPPERCASE** in the DB `CHECK` (mirrors `booking_mode`/
    `pool`); the REST path carries the lower-case slot form (mapped in the Phase-2 controller);
    `venue_photo` keeps only `created_at` (replace = new row, so no `updated_at`).
- [x] **Step 4 — ran, GREEN** — `--tests "*JdbcPhotoStorageIT*"` BUILD SUCCESSFUL (4/4); structural
  net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`,
  `*PublishedSurfacePlacementArchitectureTests*`) also GREEN.
- [x] **Step 5 — generalization pass** — new capability, no existing pattern to generalise; **none**.
- [x] **Step 6 — commit** — `feat(venue): V24 venue_photo + PhotoStorage bytea port (#142)`.
- [x] **Step 7 — update Execution status** in the same commit window.

> Run `--tests "*ModularityTests*" "*JdbcOnlyArchitectureTests*" "*PackageShapeArchitectureTests*"`
> at the end of phase 0 (new packages/types) and again after phase 2 (new controller/adapters).

## Phase 1 — PhotoProcessor (pure)

**Files:** Create `PhotoProcessor` (single class), `PhotoProcessingResult` · Modify `platform/build.gradle`
· Test `PhotoProcessorTest` (in-test fixtures).

- [x] **Step 1 — tests:** cover → card+banner+preview JPEGs; secondary → preview only; TOO_LARGE /
  UNSUPPORTED_FORMAT / DIMENSIONS_EXCEEDED (megapixel + per-side) / UNREADABLE typed rejections;
  EXIF stripped from every variant (spliced minimal-EXIF fixture). Targets pinned (fit-within).
- [x] **Steps 2–4 — implemented + GREEN** — added TwelveMonkeys (`imageio-jpeg`/`imageio-webp`) +
  Thumbnailator; `PhotoProcessor` (validate → header-only dimension guard → decode w/ EXIF
  orientation → fit-within resize → JPEG re-encode = EXIF dropped); `--tests "*PhotoProcessorTest*"`
  BUILD SUCCESSFUL; structural net still GREEN.
- [x] **Steps 5–7 —** generalization pass: the validation guard is the single input choke point
  (nothing else to generalise); commit `feat(venue): PhotoProcessor — validate/EXIF-strip/resize (#142)`;
  status updated. *(One class, not `DefaultPhotoProcessor` — one impl needs no interface, §4.)*

## Phase 2 — Service + controller + serving + read model + security

**Files:** Create `VenuePhotoService`, `VenuePhotoController` · Modify `SecurityConfig`, the venue
read-model query/DTOs · Test `VenuePhotoServiceTest`, `VenuePhotoServingIT`,
`VenuePhotoReadModelIT`, extend `CrossVenueDenialIT`.

- [x] **Step 1 — tests (service, fakes):** `assertOwns` first (AC-4 path throws before
  storage); upload stores capped variants (AC-1); replace overwrites (AC-2); delete erases (AC-3).
  **Serving IT (done):** immutable cache headers + `ETag` + `304` **without a blob read** (pinned by
  deleting the rows and re-revalidating), hex guard, venue-scoped, public (AC-7) — `VenuePhotoServingIT`.
  **BOLA IT (done):** photo POST/DELETE routes + owner-positive (real-JPEG fixture) added to
  `CrossVenueDenialIT` (AC-4). **Read-model IT:** → Phase 2b.
- [x] **Steps 2–4 — implemented:** service (`assertOwns` → `PhotoProcessor` → `PhotoStorage`; serving
  read); controller (**POST**/`DELETE` venue-scoped `MultipartFile`, `GET` public bytes+headers);
  `SecurityConfig` POST/DELETE role-gate + public GET; read-model additions: `CoverPhotoView`
  (vocabulary) on `VenueSummaryView`+`VenueMapView`, `PhotoSlotView` list on `VenueProfileView`,
  lower-case `photos` map on `VenueProfileResponse`, assembled blob-free in `JdbcVenueCatalog`
  (bulk IN-clause, no N+1) + `JdbcVenues.findProfile`; `PhotoServingUrls` = the one URL-format
  point (also used by `PhotoUploadResponse`). Errors as `ProblemDetail`; 413 backstop via the
  advice base class (F-1).
- [x] **Steps 5–7 —** generalization pass done: `bytes` column selected ONLY in
  `JdbcPhotoStorage.loadBytes` (grep-verified), no `SELECT *` anywhere; structural net +
  `CrossVenueDenialIT` + photo ITs + `VenueAdminControllerIT` green; committed; status updated.

## Phase 3 — Frontend operator upload

**Files:** Create `venue-photo.service.ts` (+ spec) · Modify `operator/venue-tab.*` · Test
`venue-tab.spec.ts`, `venue-tab.a11y.spec.ts`, `frontend/e2e/operator-venue-photos.spec.ts`.

- [x] Loaded `riviera-frontend` (placement: service in `operator/`, model additions in
  `operator-console.model.ts`) + `angular-developer` + angular-cli MCP + `riviera-tailwind` +
  `playwright-cli`.
- [x] Typed `venue-photo.service.ts` (upload = one multipart `file` part POST, remove = DELETE;
  `photoErrorOf` narrows the RFC-7807 codes incl. the four processor rejections + 413) + spec.
  Venue tab: real slots (pick=upload=replace via hidden labelled file input, preview from the
  returned PREVIEW variant, Remove, per-slot busy/error signals, 401 → sessionLost); placeholder
  pill dropped. Unit specs (5 new photo tests) + a11y fixture updated (axe caught the unlabelled
  file input — aria-label added); `operator-venue-photos.e2e.ts` (pick→upload→preview→remove + axe,
  AC-5 rejection copy, 403 BOLA copy) + `operator-venue.e2e.ts` updated. lint/651-unit/build/44-e2e
  green.
- [x] Commit `feat(venue): operator photo upload UI (#142)`, status updated.

## Phase 4 — Frontend tourist display

**Files:** Modify `pages/home/home.*`, `venue/venue-map.*`, read-model type · Test
`home.contrast.spec.ts` (kept), `venue-map.contrast.spec.ts` (kept),
`frontend/e2e/discover-photos.spec.ts`.

- [x] Cover rendered via `NgOptimizedImage` (`fill` + `object-cover`) on the Discover card (CARD
  variant) + map banner (BANNER variant); gradient + sun fallback; the "coming soon" pill retired
  in BOTH states (parity-ledger decision). Scrim kept — and per the #142 deferred note re-derived
  for real photos: the worst case moved from the gradient's light stop to ANY photo, so
  `--riv-photo-scrim` bottom band 0.5→0.68@75% / 0.66→0.8@100% (white-photo floor ≈6:1) and
  `--riv-mode-chip-glass` 0.7→0.85 (black-photo floor); `home.contrast.spec.ts` now asserts over
  white+black photo stops; the pill's contrast test retired with the pill. Geometry unchanged.
- [x] `discover-photos.e2e.ts` (card photo + scrim layering + gradient fallback + banner + no
  pill + axe); home/venue-map unit tests for both states. lint + 653 unit + build + 45 e2e green.
  Deferred-note (a) carried: per-card `backdrop-filter` GPU cost — watch scroll jank now that real
  photos land under the glass cards (no action yet; recorded for close-out).

## Phase 5 — Docs freshness + close-out

- [x] `riviera-docs-freshness` run over `main...HEAD`. Findings (all patched in-window):
  `CLAUDE.md:25` "photo placeholders" in the O8 note — contradicted by the shipped upload UI →
  patched (+ the venue module-table Owns row gains photos); `RESPONSIBILITIES.md` venue Job —
  silent on photos → patched; `riviera-java-conventions/references/error-contract.md` "otherwise
  the HTTP status name" — contradicted by the F-1 literal 413 pin → patched. ADR-0008's
  "coming soon" mention is its *Context* (historical) — left alone. `CONTEXT.md` glossary gained
  venue photo / photo slot / photo variant (the slice's own doc job, not a freshness finding).
- [x] Moderation follow-up filed as **#230** (cross-links #142 + #101 erasure automation).
- [ ] Merge close-out checklist (`references/pr-gates.md`) — after the gates + merge.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1…AC-8 — backend test classes green (`--tests` scoped per class; CI full suite).
- [ ] AC-9, AC-10 — `npm test` + `npm run test:e2e` + `npm run test:a11y` green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** (invariant #1); `bytea` via `JdbcClient` `setBytes`/`getBytes`.
- [ ] Availability section justified **N/A** with reason (invariant #2).
- [ ] **Modulith** section filled; `PhotoStorage`/`PhotoProcessor` internal (not `api/`); no new
  event; `allowedDependencies` unchanged; no cross-module `application.*`/`adapter.*` imports (#11).
- [ ] Payment/payout **N/A**.
- [ ] BOLA: `assertOwns` first in the service; `CrossVenueDenialIT` covers the photo routes (#13).
- [ ] Security: magic-byte + size + megapixel validation; EXIF stripped; public GET / authed
  write; `/security-review` run on the diff.
- [ ] Flyway **V24** present; `UNIQUE(venue_id, slot)` + cascade tested (invariant #12).
- [ ] Serving: immutable cache + `ETag` + `304`; `bytea` never in a list query.
- [ ] **Frontend** standards met; `NgOptimizedImage` for real URLs; contrast specs still pass; no
  `as any` on the contract.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
