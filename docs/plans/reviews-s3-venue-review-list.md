# Reviews slice 3 — venue-page review section, public paginated list

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist on a venue's beach-map page reads past guests' commented reviews —
stars, display name, stay month/year, comment — newest first, ten at a time behind a
"Show more" control, through a public read that serves only visible reviews and answers
404 for a venue tourists cannot see; star-only reviews count toward the aggregate but never
appear as empty rows.

**Architecture:** `review` stays a leaf (ADR-0015) and gains one more consumer-role `api`
port, `ListedReviews`, answering a cursor page of *listed* reviews (visible, with a
comment) for a venue. The public endpoint lives in **`venue`** — `GET
/api/venues/{venueId}/reviews` beside the other tourist reads — because the
tourist-visibility fence (`operator.api.VenueVisibility`, "a venue is visible iff its owner
is ACTIVE") is `venue`'s catalogue rule and `review` cannot reach `operator` without widening
a leaf; `venue` already holds every grant the read needs, so the slice adds **no module
edge**. The stay month comes from a new `review.stay_date` column written at claim time
from a widened `CompletedStay`, reduced to a `YearMonth` at the JDBC adapter so the exact
day never enters the published surface (privacy by type). Pagination is keyset on the
review id ("older than this review"), never `OFFSET`.

**Persistence:** JDBC only (invariant #1). One forward migration **V47** adds
`review.stay_date DATE NOT NULL` (backfilled from `booking.booking_date` for rows already
written) and replaces the single-column `review_venue_id_idx` with the composite
`(venue_id, id)` the seek needs (invariant #12). V46 is the highest version on `main`; no
open PR exists at all (checked 2026-09-02), so V47 is free.

**Source of intent:** issue #813 · epic #810 (user stories 13, 14) + its wiring addendum
comment (2026-08-29) · sibling plans `docs/plans/reviews-s1-star-rating.md`,
`docs/plans/reviews-s2-comment-lifecycle.md` · ADR-0015

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught three
drifts: the `review` row stores **no stay date** (only the submit-time `created_at`) so
"stay month/year derived from the booking date" needs a column; "visible reviews only" has
**no moderation flag to filter on yet** (a later slice of #810) so the AC is vacuous today;
and there is **no pagination precedent** anywhere in the codebase, backend or frontend —
the shape had to be decided, and was, by the maintainer: cursor + "Show more", page size
10, `stay_date` stored on the row. Also confirmed V47 free, zero open PRs, #812 closed via
PR #819) · `riviera-plan-doc` (this template — forced the Module-ownership table that
settled the controller's home, and the privacy risk row for the stay day) · `tdd` (each
phase red-green on the named test class) · `riviera-review-overlay` (review gate — runs at
ready-for-review) · `riviera-docs-freshness` (N/A at plan time — due at close-out over this
slice's merge range; §review's Shipped ¶, §venue's tourist-read list, the CLAUDE.md review
row and CONTEXT.md are known stale-on-merge) · `riviera-modulith` (the fence forced the
placement: `review` is `allowedDependencies = { "shared" }` and `operator` is `{}`, so the
endpoint is `venue`'s — zero new edges; `ListedReviews` is a third consumer-role port per
the #94 split; `ReviewCursor`/`ReviewRef`/`ListedReview`/`ReviewPage` go to `vocabulary/`)
· `codebase-design` (one cursor-taking method per port instead of a first-page/next-page
pair — `ReviewCursor.FIRST_PAGE` hides the sentinel; the page split and `hasMore` live in
the service so a unit test reaches them without Postgres; `Reviews.claim` deepens to take
the `CompletedStay` + `ReviewSubmission` rather than a seventh positional parameter) ·
`domain-modeling` (CONTEXT.md gains **Listed review** — a visible review that carries a
comment — and **Stay month**; the glossary's "visible" wording is kept ahead of the
moderation slice) · `riviera-java-conventions` (typed cursor, `Optional` on the query port
only, `InvalidApiRequestException` for the cursor bound, §6b error contract, `YearMonth` on
the published record) · `postgres` (keyset over `OFFSET`; the composite `(venue_id, id)`
index serves both the seek and the recompute's `venue_id =` prefix, so the old
single-column index is dropped as a duplicate prefix; backfill-then-`NOT NULL`) ·
`riviera-frontend` (new `venue/venue-reviews.ts` component in the feature folder; the wire
types in `shared/venue-views.ts` (venue is editor of record); the star-glyph helper is
**promoted** from `booking/review-panel.ts` to `shared/rating.ts` so `venue/` never
imports `booking/` — RV-FE-8) · `angular-developer` + angular-cli MCP (v22 best practices;
`resource` guidance read, but the page keeps the venue-map's epoch-guarded `subscribe`
idiom because the list *appends* across cursor loads, which a `resource` re-fetch would
replace) · `riviera-tailwind` (the own-review card recipe from `review-panel.ts` reused
for list entries; the "Show more" button is `[appTouchTarget]` + `[appBusy]`; new inks get
contrast-spec rows) · `playwright-cli` (mocked-suite journey authored to the
`review-a-stay` fixture + `page.route` idiom, branching on the `cursor` query param) ·
`riviera-local-debug` (before the session's first `gradle`/`npm`)

**Branch:** `claude/sdlc-813-2owuki` — the session's designated remote branch stands in for
`feature/reviews-s3-venue-review-list` (cloud-session substitution per `riviera-sdlc`'s
remote addendum).

---

## Acceptance criteria (testable)

> Written at the application boundary — the inner hexagon — in domain terms; adapter-level
> assertions live in the controller/e2e tests that mirror them.

- [ ] **AC-1:** Given a venue with 11 commented reviews, when the first page is read, then
  it carries the 10 newest (by review id, descending), each with stars, display name, stay
  month and comment, and a cursor; reading the page at that cursor yields the 11th and no
  cursor. *Seam:* `review.api.ListedReviews#pageFor(VenueRef, ReviewCursor)` · *Pinned by:*
  `ReviewListingFlowIT.pagesNewestFirstPastTheFirstPage`,
  `ListedReviewsServiceTest.aFullPageCarriesTheNextCursor`,
  `ListedReviewsServiceTest.aShortPageCarriesNoCursor`
- [ ] **AC-2:** Given a venue with two commented reviews and one star-only review, when the
  page is read and the aggregate is read, then the page lists two and the aggregate counts
  three. *Seam:* `review.api.ListedReviews` + `review.api.VenueRatingSummary` · *Pinned by:*
  `ReviewListingFlowIT.starOnlyReviewsCountButAreNotListed`
- [ ] **AC-3:** Given a review of a stay on 2026-07-01, when it is listed, then its stay
  reads as the month `2026-07` and nothing finer, on the port and on the wire. *Seam:*
  `review.api.ListedReviews` (`YearMonth`) + `GET /api/venues/{venueId}/reviews`
  (`stayedIn: "2026-07"`) · *Pinned by:* `ReviewListingFlowIT.listsTheStayAsAMonth`,
  `VenueReviewsControllerTest.servesTheStayAsYearMonthOnly`
- [ ] **AC-4:** Given a venue whose reviews are all star-only, when the venue page renders,
  then the header shows the aggregate and the review section shows its quiet empty state.
  *Seam:* `app-venue-reviews` (`[venueId]` input + the mocked `/reviews` route) · *Pinned by:*
  `venue-reviews.spec.ts` ("renders the quiet empty state on an empty first page"),
  `frontend/e2e/venue-reviews.e2e.ts` ("a rated venue with no written reviews")
- [ ] **AC-5:** Given no credential, when the list is read for a visible venue, then it is
  served; for a venue whose owner is not `ACTIVE` (or that does not exist) it is `404`,
  indistinguishable from the map read's answer; and the operator-only read one segment away
  stays `401`. *Seam:* `venue.application.ListVenueReviews#pageFor(VenueId, ReviewCursor)`
  + `GET /api/venues/{venueId}/reviews` · *Pinned by:*
  `ListVenueReviewsServiceTest.fencesOnTouristVisibility`,
  `VenueReviewsControllerTest.anInvisibleVenueIs404`,
  `VenueReviewsControllerTest.isPublicAndDoesNotUngateTheOperatorRead`
- [ ] **AC-6:** Given a review row claimed through the lifecycle, when it is written, then
  it carries the stay's booking date, and a row without one is refused by the schema.
  *Seam:* `review.application.ReviewLifecycle#submit` + the `review` table · *Pinned by:*
  `ReviewSubmitFlowIT.recordsTheStayDate`, `ReviewMigrationIT.requiresAStayDate`
- [ ] **AC-7:** Given a non-positive or non-numeric `cursor`, when the list is read, then
  it is refused `400 INVALID_REQUEST` before the port is called. *Seam:* `GET
  /api/venues/{venueId}/reviews?cursor=` · *Pinned by:*
  `VenueReviewsControllerTest.rejectsANonPositiveCursor`,
  `VenueReviewsControllerTest.rejectsAMalformedCursor`
- [ ] **AC-8:** Given the mocked e2e environment with two pages, when a tourist opens the
  venue page, then the section lists the first page (stars announced as "N out of 5 stars",
  display name, "July 2026", comment); pressing "Show more reviews" appends the second
  page, the control leaves, focus lands on the first newly-listed review, and axe passes
  in every state. *Seam:* `app-venue-reviews` on `/venues/1` · *Pinned by:*
  `frontend/e2e/venue-reviews.e2e.ts`, `venue-reviews.spec.ts`,
  `venue-reviews.a11y.spec.ts`, `venue-reviews.contrast.spec.ts`

## Non-goals

- **Moderation** (hide / un-hide, admin audit) and the **hidden-review predicate** — a
  later slice of #810; this slice's query is written so that predicate lands in one place
  (A-2 below).
- The **erasure hook** for review PII — #820.
- Review sorting/filtering beyond newest-first; a total count on the page; operator replies;
  half-stars; translations.
- Any change to the header's aggregate markup, the "New" chip, or `shared/rating.ts`'s
  existing helpers — the section anchors on the header as it is.
- Changing the Discover card.
- A `resource()`/`httpResource` migration of `venue-map.ts` — out of scope; the new child
  keeps the page's request idiom.

## Behavior-parity ledger

N/A — new behavior, replaces nothing. (The one touched existing surface,
`booking/review-panel.ts`, keeps its rendering byte-for-byte; only its private
`starsLabel` helper moves to `shared/rating.ts` under the name `starGlyphs`, pinned by the
panel's existing spec.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Flyway V47 collision with in-flight work | low | high | Checked 2026-09-02: V46 highest on `main`, **zero** open PRs. If one appears, this branch renumbers (merges second) | agent | open |
| R-2 | The list is served for a venue tourists cannot see (suspended / unowned owner), leaking a catalogue read the map read hides | med | med | The fence lives in `venue`'s application service `ListVenueReviewsService` (not the controller), consulting `operator.api.VenueVisibility` exactly as `JdbcVenueCatalog.findVenueMap` does; empty → `404`. `ListVenueReviewsServiceTest` + `VenueReviewsControllerTest.anInvisibleVenueIs404` | agent | open |
| R-3 | The exact stay day leaks (privacy: the issue mandates month/year only) | low | med | Reduced to `YearMonth` in `JdbcReviews`'s row mapper — no published type carries a `LocalDate`; wire field `stayedIn: "YYYY-MM"`; `VenueReviewsControllerTest.servesTheStayAsYearMonthOnly` asserts the shape | agent | open |
| R-4 | V47 backfill: a production `review` row with no matching booking date | very low | high | `booking_id` is a `NOT NULL` FK, so the `UPDATE … FROM booking` join covers every row; `SET NOT NULL` afterwards fails the migration loudly rather than shipping a null. `ReviewMigrationIT.requiresAStayDate` pins the constraint | agent | open |
| R-5 | Widening `CompletedStay` (the `spi` vocabulary) breaks `booking`'s adapter and the two service-test fakes | high | low | Same phase (0): `JdbcCompletedStays` selects `booking_date`; both fakes rebuilt; `Reviews.claim` deepens to `claim(CompletedStay, ReviewSubmission, Instant)` so no caller threads a seventh parameter | agent | open |
| R-6 | `venue-map.spec.ts` / `venue-map.a11y.spec.ts` fail on `httpMock.verify()` because the embedded child now issues a `/reviews` request | high | low | Drain it: `httpMock.match((r) => r.url.endsWith('/reviews'))` before `verify()` in both `afterEach`s; the child's own specs cover its states | agent | open |
| R-7 | Legacy mocked e2e specs that render `/venues/1` without a `/reviews` mock now show the section's failure state; the touch-target sweep never sees the "Show more" button | med | low | The failure state is quiet (one line + the shared retry button, itself `[appTouchTarget]`); `touch-targets-tourist.e2e.ts`'s venue-detail case gains a two-page mock so the sweep measures the control | agent | open |
| R-8 | "Show more" removes itself after the last page → focus stranded on `<body>` (WCAG 2.4.3, RV-FE-9) | high | med | `focusMover()` to the first newly-appended entry whenever the control leaves; pinned in `venue-reviews.spec.ts` and the e2e | agent | open |
| R-9 | Dropping `review_venue_id_idx` slows the aggregate recompute | low | low | The replacement `(venue_id, id)` composite serves `WHERE venue_id = ?` through its prefix; the old index becomes a duplicate prefix (`postgres` index-optimization) | agent | open |
| R-10 | Error-contract drift on the new 4xx paths (§6b) | low | med | `InvalidApiRequestException` for a non-positive cursor; the binder's own `400` for a malformed one (the calendar read's `rejectsAMalformedDate` precedent); `404` via `ResponseEntity.notFound()`; `ErrorContractArchitectureTests` stays green | agent | open |
| R-11 | `WebSliceStubs` lacks the new `ListVenueReviews` port → every `@WebMvcTest` slice fails to boot | high | low | Phase 2 adds the inert stub together with the controller; `EndpointRoleGateCoverageTest.DECLARED_REACHABLE` gains the route | agent | open |

## Open questions / Assumptions

### Resolved

- **Decision D-1 — maintainer, 2026-09-02:** pagination is **cursor + "Show more"**
  (append), keyset on the review id, never `OFFSET`; a prev/next control was rejected for
  the focus-strand it creates when it disables at the last page.
- **Decision D-2 — maintainer, 2026-09-02:** the stay month comes from a new
  **`review.stay_date`** column (the booking date, backfilled in V47), carried into
  `review` through `CompletedStay` and written at claim time; deriving it from the check-in
  instant was rejected as resting on `booking`'s "check-in only on the service date" rule.
- **Decision D-3 — maintainer, 2026-09-02:** page size **10**, fixed server-side as the
  port's contract (the `MyBookings` cap precedent), not a client knob.

### Open

- **Assumption A-1:** newest-first is ordered by review **id** (assigned at claim, monotone
  with insertion) rather than `created_at`; the two agree except under concurrent claims
  within the same clock tick, and a single-key cursor is what keeps the wire shape one
  integer. — *Owner:* agent · *Resolves by:* phase 1 (`ReviewListingFlowIT` pins the order).
- **Assumption A-2:** "visible reviews only" (issue AC 6) is **vacuously true** in this
  slice: no moderation column exists. The `ListedReviews` Javadoc and the SQL name the
  predicate's future home (the one `WHERE` in `JdbcReviews.newestListedBefore`, beside
  `totalsFor`) so the moderation slice adds it in one place. — *Owner:* agent ·
  *Resolves by:* close-out (recorded in RESPONSIBILITIES §review).
- **Assumption A-3:** a row carrying a comment always carries a display name (the slice-2
  edge contract); the wire keeps `displayName` nullable and the client renders "A guest"
  for a null, so an out-of-contract row cannot break the section. — *Owner:* agent ·
  *Resolves by:* phase 3.
- **Assumption A-4:** the section's copy — heading "Guest reviews", empty state "No written
  reviews yet — ratings so far came without a comment.", failure "Reviews couldn't be
  loaded." — is the agent's call (display wording is the client's, §6b). — *Owner:* agent ·
  *Resolves by:* phase 3.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice is read-only against `review` and touches
neither `availability(set_id, booking_date)`, the beach map's write paths, nor `booking`'s
state; the one write it changes (`Reviews.claim`) keeps V45's `INSERT … ON CONFLICT
(booking_id) DO NOTHING` claim exactly, adding a column to the row it inserts.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `review` | existing | `Review` (row gains `stay_date`) | Owns the review record and "the arithmetic that turns a venue's reviews into a score" — the listable subset is the same record read another way (§review Job) |
| M-2 | `venue` | existing | `Venue` | Owns the tourist venue page's read surface and its visibility fence (§venue; `JdbcVenueCatalog.findVenueMap` is the precedent); already granted `review::api` + `::vocabulary` + `operator::api` |
| M-3 | `booking` | existing | `Booking` | Implements `review.spi.CompletedStays`; its adapter now also answers the booking date (a fact about the stay, not guest identity) |
| M-4 | root/edge | — | — | `EndpointRoleGateCoverageTest` + `WebSliceStubs` rows; `SecurityConfig` **unchanged** — `GET /api/venues/**` is already `permitAll`, and `/reviews` collides with no operator-only single-segment path |

**Boundary design**

- **Placement follows the fence.** "A venue is visible to tourists iff its owner is ACTIVE"
  is `operator`'s rule consumed by `venue`'s catalogue reads. `review` is a leaf
  (`allowedDependencies = { "shared" }`) and `operator` is `{}`, so a review-hosted
  endpoint could fence only by widening one of them (a `review.spi` port implemented by
  `operator`). Hosting the endpoint in `venue` adds no edge: `venue → review::api` already
  exists for the rating listener. The same shape as `booking` carrying the review panel it
  does not decide — `venue` carries the list `review` decides.
- **A third consumer-role port, not a widened one** (#94). `VenueRatingSummary` answers
  `venue`'s aggregate question; `ReviewEligibility` answers `booking`'s; `ListedReviews`
  answers `venue`'s *list* question. Different conversation, own port; the write surface
  stays internal.
- **One cursor-taking method.** `ReviewCursor(long beforeId)` with `ReviewCursor.FIRST_PAGE`
  (no upper bound) means one `pageFor(VenueRef, ReviewCursor)` per port, no
  `Optional` parameter and no first/next method pair. `ReviewPage.next()` returns
  `Optional<ReviewCursor>` — the last listed review's ref when a further page exists.
- **The page split is domain-side.** The adapter fetches `PAGE_SIZE + 1` rows; the service
  trims and sets `hasMore`, so `ListedReviewsServiceTest` proves the cursor arithmetic with
  a fake store.
- **Privacy by type.** The adapter maps `stay_date` to `YearMonth` in the row mapper; no
  published type carries the day.
- **`CompletedStay` widens by one fact.** `(booking, venue, stayedOn, completedAt)` — the
  booking date is a stay fact the review record needs, not identity (the slice-2 line
  holds: `review` still never learns who the guest is).

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `review.api` | **new** `ListedReviews#pageFor(VenueRef, ReviewCursor)` | `ReviewPage`, `ListedReview`, `ReviewRef`, `ReviewCursor` (all `review.vocabulary`) | `venue` |
| NI-2 | `review.spi` | `CompletedStays` — **unchanged signature**; `CompletedStay` gains `stayedOn` | `CompletedStay` | implemented by `booking` |
| NI-3 | `operator.api` | `VenueVisibility#isVisible(VenueRef)` — existing | `operator.vocabulary.VenueRef` | `venue` (existing grant; new call site) |
| NI-4 | `review.api` | `VenueRatingSummary`, `ReviewEligibility` | unchanged | unchanged |

The published shapes:

```java
// review/vocabulary/ReviewRef.java
public record ReviewRef(long value) {}

// review/vocabulary/ReviewCursor.java — "the page of listed reviews older than this one"
public record ReviewCursor(long beforeId) {
    public static final ReviewCursor FIRST_PAGE = new ReviewCursor(Long.MAX_VALUE);
    public static ReviewCursor after(ReviewRef last) { return new ReviewCursor(last.value()); }
}

// review/vocabulary/ListedReview.java — one row as the public reads it; the stay is a month, never a day
public record ListedReview(ReviewRef ref, int stars, String displayName, YearMonth stayedIn,
        String comment) {}

// review/vocabulary/ReviewPage.java
public record ReviewPage(List<ListedReview> reviews, boolean hasMore) {
    public Optional<ReviewCursor> next() { … last review's ref when hasMore … }
}

// review/api/ListedReviews.java
public interface ListedReviews {
    ReviewPage pageFor(VenueRef venue, ReviewCursor from);
}

// venue/application/ListVenueReviews.java — internal driving port; empty = not visible to tourists
public interface ListVenueReviews {
    Optional<ReviewPage> pageFor(VenueId venue, ReviewCursor from);
}
```

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none new or changed | | | | | `ReviewsChanged` untouched |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Which reviews are *listed* (visible + commented), their order, the page size, the cursor | `review` | §review Job: "own everything about a tourist's verdict … and the arithmetic"; the list is the record read publicly. NOT `venue` (§venue Not-My-Job: it stores the aggregate, `review` computes — the same split) |
| `stay_date` storage + backfill; reducing it to a month | `review` | The review record is `review`'s table (machine-checked sole-writer rule); V47 + SQL stay in `review/adapter/out` + `db/migration` |
| Answering the booking date on `CompletedStays` | `booking` | §booking owns the `booking` table and already implements the inverted port; a stay fact, not identity (§review Not-My-Job "the guest's identity → `customer`" untouched) |
| The public endpoint, its DTO, the cursor's edge validation | `venue` | §venue owns the tourist venue-page reads (`VenueReadController`); NOT `review` (it cannot fence) |
| The tourist-visibility fence on the list | `venue` (application service) | The `JdbcVenueCatalog.findVenueMap` precedent and CLAUDE.md §operator: "`venue` fences its catalogue reads"; in the **service**, so no driving adapter can bypass it (the invariant-#13 discipline applied to a read fence) |
| Rendering, copy, the "Show more" affordance, empty/failure states | frontend | §review Not-My-Job: "displaying a rating → `venue` and the frontend"; wording keyed on wire state (§6b) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope; no money moves.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-reviews.ts` | **new** | standalone component `app-venue-reviews`, inline template | `input.required<number>() venueId`; signals `entries`, `nextCursor`, `loading`, `failed`; an epoch guard on the `venueId` change (the `venue-map.ts` idiom); appends per cursor load; `focusMover()` when the control leaves | — |
| FE-2 | `venue/venue-map.html` + `.ts` | existing | page | embeds FE-1 inside the `<article>` after the canvas, `[venueId]="v.id"` — so it lives and dies with the loaded venue and resets on an in-place `:id` change | — |
| FE-3 | `venue/venue.service.ts` | existing | `@Service` | `reviews(venueId, cursor?)` → `Observable<VenueReviewsPage>` | — |
| FE-4 | `shared/venue-views.ts` | existing | types | `VenueReviewEntry`, `VenueReviewsPage` | — |
| FE-5 | `shared/rating.ts` | existing | pure helpers | `starGlyphs(stars)` (promoted from `review-panel.ts`), `starsOutOfFive(stars)` ("4 out of 5 stars") | — |
| FE-6 | `shared/stay-month.ts` | **new** | pure helper | `formatStayMonth('2026-07')` → "July 2026" (`Intl.DateTimeFormat('en-IE')`, module-level constant per the `booking-date-label.ts` note) | — |
| FE-7 | `booking/review-panel.ts` | existing | component | imports `starGlyphs` from `shared/`; no rendering change | — |
| FE-8 | `venue/venue-reviews.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`; `venue/venue-map.spec.ts` + `.a11y.spec.ts` (drain); `shared/rating.spec.ts`, `shared/stay-month.spec.ts` | new + existing | Vitest | | |

**Standards:** standalone, `inject()`, `@if`/`@for` (`track entry.id`), `input()`,
signals. Entry card reuses the own-review recipe (`rounded-[16px] border
border-riv-card-track bg-riv-wash-fill px-[15px] py-3`; stars `text-riv-accent-ink` with
`role="img"` + `aria-label="N out of 5 stars"`, glyphs `aria-hidden`); name
`text-riv-card-ink font-bold text-[13px]`, stay month `text-riv-card-ink-soft
text-[12.5px]`, comment `text-[14px] leading-[1.5] text-riv-card-ink`. "Show more reviews"
is a `<button appTouchTarget [appBusy]="loading()">` styled as the outline button; a
`role="status"` line announces "Showing N reviews" after each append. Section:
`<section aria-labelledby="reviews-heading" data-testid="venue-reviews">` with an `<h2>`
and a `<ul>`; each `<li tabindex="-1">` is the focus landing spot. The a11y idiom follows
`review-panel.ts` (`"4 out of 5 stars"`), not the header's `"Rated 4.8 out of 5"`, because
the entries are star rows, not a score.

## FE↔BE contract

- **New endpoint:** `GET /api/venues/{venueId}/reviews?cursor=<reviewId>` — public. Response:

  ```ts
  interface VenueReviewsPage {
    readonly reviews: readonly VenueReviewEntry[];   // newest first, at most 10
    readonly nextCursor: number | null;              // pass back as ?cursor= for the next page
  }
  interface VenueReviewEntry {
    readonly id: number;
    readonly stars: number;                          // 1..5
    readonly displayName: string | null;             // null only for an out-of-contract row (A-3)
    readonly stayedIn: string;                       // ISO year-month "YYYY-MM" — never a day
    readonly comment: string;
  }
  ```

  Errors: `400 INVALID_REQUEST` (cursor ≤ 0 or non-numeric), `404` (no visible venue —
  body-less like the map read).
- **Changed write (internal):** none on the wire; `Reviews.claim` carries the stay date
  from `CompletedStay`.
- **Client typing:** hand-written typed service (`VenueService.reviews`), no `as any`.
- **Dates on the wire:** `stayedIn` as `YYYY-MM`; formatted client-side to "July 2026".

## Execution status

**Stage pointer:** `plan — doc committed, opening the draft PR`

**Next action:** phase 0 — red on `ReviewMigrationIT.requiresAStayDate`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V47 stay date through the claim | | |
| 1 — `review.api.ListedReviews` + the keyset read | | |
| 2 — `venue`: fence, endpoint, DTO, edge rows | | |
| 3 — frontend: `app-venue-reviews` on the venue page | | |
| 4 — mocked e2e, touch-target coverage, docs, close-out prep | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/reviews-s3-venue-review-list.md` — this plan
- `platform/src/main/resources/db/migration/V47__review_stay_date.sql` — `stay_date` + backfill + `NOT NULL`; composite `(venue_id, id)` index replacing `review_venue_id_idx`
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/CompletedStay.java` — gains `stayedOn`
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewRef.java` — new typed id
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewCursor.java` — new
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ListedReview.java` — new
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewPage.java` — new
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/package-info.java` — inventory line
- `platform/src/main/java/ai/riviera/platform/review/api/ListedReviews.java` — new port
- `platform/src/main/java/ai/riviera/platform/review/api/package-info.java` — inventory line
- `platform/src/main/java/ai/riviera/platform/review/application/Reviews.java` — `claim(CompletedStay, ReviewSubmission, Instant)`, `update(BookingRef, ReviewSubmission, Instant)`, `newestListedBefore(VenueRef, long, int)`
- `platform/src/main/java/ai/riviera/platform/review/application/ListedReviewsService.java` — new
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewLifecycleService.java` — the deeper `claim`/`update` calls
- `platform/src/main/java/ai/riviera/platform/review/adapter/out/JdbcReviews.java` — `stay_date` on insert; the keyset query
- `platform/src/main/java/ai/riviera/platform/review/package-info.java` — surface inventory
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcCompletedStays.java` — selects `booking_date`
- `platform/src/main/java/ai/riviera/platform/venue/application/ListVenueReviews.java` — new internal port
- `platform/src/main/java/ai/riviera/platform/venue/application/ListVenueReviewsService.java` — new; the fence
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — `reviews` mapping
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReviewsResponse.java` — new DTO
- `platform/src/test/java/ai/riviera/platform/review/ReviewMigrationIT.java` — `requiresAStayDate`; fixtures carry `stay_date`
- `platform/src/test/java/ai/riviera/platform/review/ReviewSubmitFlowIT.java` — `recordsTheStayDate`
- `platform/src/test/java/ai/riviera/platform/review/ReviewListingFlowIT.java` — new
- `platform/src/test/java/ai/riviera/platform/review/application/ListedReviewsServiceTest.java` — new
- `platform/src/test/java/ai/riviera/platform/review/application/ReviewLifecycleServiceTest.java` — fakes follow the new shapes
- `platform/src/test/java/ai/riviera/platform/review/application/ReviewEligibilityServiceTest.java` — fakes follow the new shapes
- `platform/src/test/java/ai/riviera/platform/venue/application/ListVenueReviewsServiceTest.java` — new
- `platform/src/test/java/ai/riviera/platform/VenueReviewsControllerTest.java` — new
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — `ListVenueReviews` stub
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — the route
- `platform/src/test/java/ai/riviera/platform/ReviewFixtures.java` — `review(...)` seeder; bookings carry a stay date parameter
- `frontend/src/app/shared/rating.ts` + `rating.spec.ts` — `starGlyphs`, `starsOutOfFive`
- `frontend/src/app/shared/stay-month.ts` + `stay-month.spec.ts` — new
- `frontend/src/app/shared/venue-views.ts` — the two wire types
- `frontend/src/app/booking/review-panel.ts` — imports `starGlyphs`
- `frontend/src/app/venue/venue.service.ts` + `venue.service.spec.ts` — `reviews()`
- `frontend/src/app/venue/venue-reviews.ts` — new component
- `frontend/src/app/venue/venue-reviews.spec.ts` — new
- `frontend/src/app/venue/venue-reviews.a11y.spec.ts` — new
- `frontend/src/app/venue/venue-reviews.contrast.spec.ts` — new
- `frontend/src/app/venue/venue-map.html` + `venue-map.ts` — embed
- `frontend/src/app/venue/venue-map.spec.ts` + `venue-map.a11y.spec.ts` — drain the child's request
- `frontend/e2e/venue-reviews.e2e.ts` — new mocked journey
- `frontend/e2e/touch-targets-tourist.e2e.ts` — a two-page reviews mock on the venue-detail case
- `RESPONSIBILITIES.md` — §review (the list read, `stay_date`, A-2), §venue (carries + fences the list)
- `CONTEXT.md` — **Listed review**, **Stay month**
- `CLAUDE.md` — the `review` row names the public list read

---

## Phase 0 — V47: the stay date, through the claim

**Files:** Create `V47__review_stay_date.sql` · Modify `CompletedStay`, `JdbcCompletedStays`,
`Reviews`, `JdbcReviews`, `ReviewLifecycleService`, `ReviewFixtures`, both service-test
fakes · Test `ReviewMigrationIT`, `ReviewSubmitFlowIT`

- [ ] **Step 1: Write the failing tests**

```java
// ReviewMigrationIT
@Test
void requiresAStayDate() {
    long venueId = seedVenue("Review Migration Stay Date");
    long bookingId = seedCompletedBooking(venueId);

    DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
            () -> jdbc.sql("""
                    INSERT INTO review (booking_id, venue_id, stars, created_at)
                    VALUES (:booking, :venue, 4, :createdAt)
                    """)
                    .param("booking", bookingId).param("venue", venueId)
                    .param("createdAt", Timestamp.from(Instant.parse("2026-07-02T08:00:00Z")))
                    .update());
    assertThat(rejected.getMessage()).contains("stay_date");
}

// ReviewSubmitFlowIT
@Test
void recordsTheStayDate() {
    long venueId = fixtures.venue("Submit Flow Stay Date");
    String code = fixtures.completedBooking(venueId, Instant.now().minus(1, ChronoUnit.DAYS));

    lifecycle.submit(code, stars(5));

    assertThat(jdbc.sql("SELECT stay_date FROM review WHERE booking_id = :id")
            .param("id", fixtures.bookingIdOf(code)).query(LocalDate.class).single())
            .isEqualTo(LocalDate.of(2026, 7, 1));
}
```

- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*ReviewMigrationIT*" --tests "*ReviewSubmitFlowIT*"` → FAIL (`column "stay_date" does not exist` / the insert without it succeeds)

- [ ] **Step 3: Minimal implementation**

```sql
-- V47__review_stay_date.sql
ALTER TABLE review ADD COLUMN stay_date DATE;
UPDATE review r SET stay_date = b.booking_date FROM booking b WHERE b.id = r.booking_id;
ALTER TABLE review ALTER COLUMN stay_date SET NOT NULL;
DROP INDEX review_venue_id_idx;
CREATE INDEX review_venue_listing_idx ON review (venue_id, id);
```

```java
public record CompletedStay(BookingRef booking, VenueRef venue, LocalDate stayedOn,
        Instant completedAt) {}

// Reviews
boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at);
boolean update(BookingRef booking, ReviewSubmission submission, Instant at);
```

`JdbcReviews.claim` inserts `stay_date = stay.stayedOn()`; `JdbcCompletedStays.byCode`
selects `booking_date`; `ReviewFixtures.booking` keeps its 2026-07-01 date; both fakes
implement the new signatures.

- [ ] **Step 4: Run it, verify it passes** — the two ITs + `--tests "*review.application*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — population "every constructor call of `CompletedStay` / every implementor of `Reviews`": `grep -rn "new CompletedStay(\|implements Reviews" platform/src` → fix all.
- [ ] **Step 6: Commit** — `Store the stay date on the review row, backfilled from the booking (#813)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 1 — `review.api.ListedReviews`: the keyset read

**Files:** Create `ReviewRef`, `ReviewCursor`, `ListedReview`, `ReviewPage`, `ListedReviews`,
`ListedReviewsService`, `ReviewListingFlowIT`, `ListedReviewsServiceTest` · Modify
`Reviews`, `JdbcReviews`, `ReviewFixtures` (a `review(...)` seeder), the three
`package-info.java` inventories

- [ ] **Step 1: Write the failing tests**

```java
// ListedReviewsServiceTest — a fake Reviews answering a canned list
@Test
void aFullPageCarriesTheNextCursor() {
    reviews.stock(VENUE, listed(30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20));
    ReviewPage page = service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);
    assertEquals(10, page.reviews().size());
    assertEquals(Optional.of(new ReviewCursor(21)), page.next());
}

@Test
void aShortPageCarriesNoCursor() {
    reviews.stock(VENUE, listed(3, 2, 1));
    assertEquals(Optional.empty(), service.pageFor(VENUE, ReviewCursor.FIRST_PAGE).next());
}

@Test
void theCursorBoundsTheNextRead() {
    reviews.stock(VENUE, listed(3, 2, 1));
    service.pageFor(VENUE, new ReviewCursor(2));
    assertEquals(2L, reviews.lastBefore());
    assertEquals(11, reviews.lastLimit());
}

// ReviewListingFlowIT — real Postgres through the real port
@Test
void pagesNewestFirstPastTheFirstPage() {
    long venueId = fixtures.venue("Listing Flow");
    List<Long> ids = new ArrayList<>();
    for (int i = 1; i <= 11; i++) {
        ids.add(fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), 4, "Comment " + i, "Guest " + i));
    }
    ReviewPage first = listed.pageFor(new VenueRef(venueId), ReviewCursor.FIRST_PAGE);
    assertThat(first.reviews()).extracting(r -> r.ref().value()).containsExactlyElementsOf(ids.reversed().subList(0, 10));
    ReviewPage second = listed.pageFor(new VenueRef(venueId), first.next().orElseThrow());
    assertThat(second.reviews()).extracting(r -> r.ref().value()).containsExactly(ids.getFirst());
    assertThat(second.next()).isEmpty();
}

@Test
void starOnlyReviewsCountButAreNotListed() { /* 2 commented + 1 star-only: page size 2, summaryFor count 3 */ }

@Test
void listsTheStayAsAMonth() { /* stayedIn == YearMonth.of(2026, 7); displayName + comment echoed */ }

@Test
void listsOnlyTheVenuesOwnReviews() { /* a second venue's commented review is absent */ }
```

- [ ] **Step 2: Run it, verify it fails** — `--tests "*ListedReviewsServiceTest*" --tests "*ReviewListingFlowIT*"` → compile FAIL (types absent)

- [ ] **Step 3: Minimal implementation**

```java
// JdbcReviews
@Override
public List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit) {
    return jdbc.sql("""
            SELECT id, stars, display_name, stay_date, comment
            FROM review
            WHERE venue_id = :venue AND comment IS NOT NULL AND id < :before
            ORDER BY id DESC
            LIMIT :limit
            """)
            .param("venue", venue.value()).param("before", beforeId).param("limit", limit)
            .query((rs, rowNum) -> new ListedReview(new ReviewRef(rs.getLong("id")),
                    rs.getInt(COL_STARS), rs.getString("display_name"),
                    YearMonth.from(rs.getObject("stay_date", LocalDate.class)),
                    rs.getString(COL_COMMENT)))
            .list();
}

// ListedReviewsService (package-private @Service, read-only)
static final int PAGE_SIZE = 10;

@Override
public ReviewPage pageFor(VenueRef venue, ReviewCursor from) {
    List<ListedReview> rows = reviews.newestListedBefore(venue, from.beforeId(), PAGE_SIZE + 1);
    boolean hasMore = rows.size() > PAGE_SIZE;
    return new ReviewPage(hasMore ? rows.subList(0, PAGE_SIZE) : rows, hasMore);
}
```

- [ ] **Step 4: Run it, verify it passes** — the two classes + `--tests "*review*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — population "every SQL statement against `review`" (`grep -rn "FROM review\|INTO review" platform/src/main`): the moderation predicate's future homes are `newestListedBefore` and `totalsFor` — named in the Javadoc, no code change.
- [ ] **Step 6: Commit** — `Publish a cursor page of a venue's listed reviews from the review module (#813)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — `venue`: the fence, the endpoint, the edge rows

**Files:** Create `ListVenueReviews`, `ListVenueReviewsService`, `VenueReviewsResponse`,
`ListVenueReviewsServiceTest`, `VenueReviewsControllerTest` · Modify `VenueReadController`,
`WebSliceStubs`, `EndpointRoleGateCoverageTest`

- [ ] **Step 1: Write the failing tests**

```java
// ListVenueReviewsServiceTest
@Test
void fencesOnTouristVisibility() {
    visibility.hide(VENUE);
    assertEquals(Optional.empty(), service.pageFor(VENUE, ReviewCursor.FIRST_PAGE));
    assertEquals(0, listed.calls());
}

@Test
void answersTheReviewPageForAVisibleVenue() {
    visibility.show(VENUE);
    listed.stock(PAGE);
    assertEquals(Optional.of(PAGE), service.pageFor(VENUE, new ReviewCursor(40)));
    assertEquals(new ReviewCursor(40), listed.lastCursor());
}

// VenueReviewsControllerTest (@WebMvcTest, root package)
@Test
void servesTheStayAsYearMonthOnly() {
    when(reviews.pageFor(new VenueId(VENUE), ReviewCursor.FIRST_PAGE)).thenReturn(Optional.of(new ReviewPage(
            List.of(new ListedReview(new ReviewRef(41), 4, "Ana", YearMonth.of(2026, 7), "Great sunbeds")), false)));
    mvc.perform(get(REVIEWS, VENUE))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reviews[0].id").value(41))
            .andExpect(jsonPath("$.reviews[0].stars").value(4))
            .andExpect(jsonPath("$.reviews[0].displayName").value("Ana"))
            .andExpect(jsonPath("$.reviews[0].stayedIn").value("2026-07"))
            .andExpect(jsonPath("$.reviews[0].comment").value("Great sunbeds"))
            .andExpect(jsonPath("$.nextCursor").value(nullValue()));
}

@Test void aFullPageCarriesTheNextCursorOnTheWire() { /* hasMore → nextCursor == last id; ?cursor=41 reaches the port as new ReviewCursor(41) */ }
@Test void rejectsANonPositiveCursor() { /* ?cursor=0 → 400 INVALID_REQUEST, port never called */ }
@Test void rejectsAMalformedCursor() { /* ?cursor=abc → 400 */ }
@Test void anInvisibleVenueIs404() { /* Optional.empty() → 404 */ }
@Test void isPublicAndDoesNotUngateTheOperatorRead() { /* 200 anonymous; GET /api/venues/{id}/availability → 401 */ }
```

- [ ] **Step 2: Run it, verify it fails** — `--tests "*ListVenueReviewsServiceTest*" --tests "*VenueReviewsControllerTest*"` → compile FAIL

- [ ] **Step 3: Minimal implementation**

```java
// ListVenueReviewsService — package-private, read-only
@Override
public Optional<ReviewPage> pageFor(VenueId venue, ReviewCursor from) {
    if (!visibility.isVisible(new ai.riviera.platform.operator.vocabulary.VenueRef(venue.value()))) {
        return Optional.empty();
    }
    return Optional.of(listed.pageFor(new ai.riviera.platform.review.vocabulary.VenueRef(venue.value()), from));
}

// VenueReadController
@GetMapping("/{venueId}/reviews")
ResponseEntity<VenueReviewsResponse> reviews(@PathVariable long venueId,
        @RequestParam(name = "cursor", required = false) Long cursor) {
    if (cursor != null && cursor <= 0) {
        throw new InvalidApiRequestException("reviews: 'cursor' must be a positive review id");
    }
    ReviewCursor from = cursor == null ? ReviewCursor.FIRST_PAGE : new ReviewCursor(cursor);
    return reviewListing.pageFor(new VenueId(venueId), from)
            .map(page -> ResponseEntity.ok(VenueReviewsResponse.from(page)))
            .orElseGet(() -> ResponseEntity.notFound().build());
}
```

`WebSliceStubs` gains `ListVenueReviews listVenueReviews() { return (_, _) -> Optional.empty(); }`;
`DECLARED_REACHABLE` gains `"GET /api/venues/{venueId}/reviews"`.

- [ ] **Step 4: Run it, verify it passes** — the two classes + the structural net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`, `*PublishedSurfacePlacementArchitectureTests*`, `*ResponsibilitiesArchitectureTests*`, `*EndpointRoleGateCoverageTest*`, `*ErrorContractArchitectureTests*`) → PASS
- [ ] **Step 5: Generalization-audit pass** — population "every public `GET /api/venues/{venueId}/…` read" (`grep -n "GetMapping" venue/adapter/in/*.java`): each already fences through `VenueCatalog`; the new one fences in its own service — consistent, no further change.
- [ ] **Step 6: Commit** — `Serve a venue's listed reviews publicly behind the tourist-visibility fence (#813)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — frontend: `app-venue-reviews` on the venue page

**Files:** Create `venue/venue-reviews.ts` + three specs, `shared/stay-month.ts` + spec ·
Modify `shared/rating.ts` + spec, `shared/venue-views.ts`, `booking/review-panel.ts`,
`venue/venue.service.ts` + spec, `venue/venue-map.html` + `.ts` + its two specs

- [ ] **Step 1: Write the failing tests** — `venue-reviews.spec.ts`: renders the first page
  (stars `role="img"` "4 out of 5 stars", name, "July 2026", comment, `track` by id);
  "Show more reviews" requests `?cursor=<last id>` and **appends**; the control leaves on a
  short page and focus lands on the first new `<li>`; a `null` `displayName` reads "A
  guest"; an empty first page renders the quiet empty state; a failed load renders the
  failure line + retry, and retry re-fetches; a `venueId` change resets the list (epoch).
  `rating.spec.ts`: `starGlyphs(4) === '★★★★☆'`, `starsOutOfFive(4) === '4 out of 5
  stars'`. `stay-month.spec.ts`: `'2026-07' → 'July 2026'`. `venue.service.spec.ts`: the
  URL and the `cursor` param (absent on the first page).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- venue-reviews rating stay-month venue.service` → FAIL
- [ ] **Step 3: Minimal implementation** — the component per the Angular section; the
  embed in `venue-map.html` after `</app-beach-map-canvas>`; the two venue-map specs drain
  `/reviews` before `verify()`.
- [ ] **Step 4: Run it, verify it passes** — `npm test`, `npm run lint`, `npm run format:check`, `npm run test:a11y` → PASS
- [ ] **Step 5: Generalization-audit pass** — population "every private star-glyph helper" (`grep -rn "'★'.repeat" frontend/src`): promoted to `shared/rating.ts`, one definition.
- [ ] **Step 6: Commit** — `Render a venue's guest reviews below the beach map with a Show-more cursor (#813)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — mocked e2e, touch-target coverage, docs

**Files:** Create `frontend/e2e/venue-reviews.e2e.ts` · Modify
`frontend/e2e/touch-targets-tourist.e2e.ts`, `RESPONSIBILITIES.md`, `CONTEXT.md`,
`CLAUDE.md`, this plan

- [ ] **Step 1: Write the journey** — a two-page mock branching on `cursor`: read page 1
  (axe), press "Show more reviews", page 2 appended, control gone, focus on the first new
  entry (axe); a rated venue with an empty list shows the header aggregate + the empty
  state (axe); a `/reviews` 500 shows the failure line and retry recovers.
- [ ] **Step 2: Run it** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts venue-reviews touch-targets-tourist` → PASS
- [ ] **Step 3: Docs** — RESPONSIBILITIES §review (the `ListedReviews` port, `stay_date`,
  A-2's predicate home, Shipped ¶) + §venue (carries + fences the list); CONTEXT.md terms;
  CLAUDE.md review row.
- [ ] **Step 4: Commit** — `Cover the venue review list end to end and record it in the substrate docs (#813)`
- [ ] **Step 5: Update plan-doc execution status;** merge `origin/main`; mark the PR ready for review.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle test --tests "*ReviewListingFlowIT*" --tests "*ListedReviewsServiceTest*"` → PASS.
- [ ] **AC-2:** `gradle test --tests "*ReviewListingFlowIT*"` → PASS.
- [ ] **AC-3:** `gradle test --tests "*ReviewListingFlowIT*" --tests "*VenueReviewsControllerTest*"` → PASS.
- [ ] **AC-4:** `npm test -- venue-reviews` + the mocked e2e → PASS.
- [ ] **AC-5:** `gradle test --tests "*ListVenueReviewsServiceTest*" --tests "*VenueReviewsControllerTest*"` → PASS.
- [ ] **AC-6:** `gradle test --tests "*ReviewSubmitFlowIT*" --tests "*ReviewMigrationIT*"` → PASS.
- [ ] **AC-7:** `gradle test --tests "*VenueReviewsControllerTest*"` → PASS.
- [ ] **AC-8:** `npm test`, `npm run test:a11y`, the mocked e2e → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
