# Reviews slice 1 — rate a checked-in stay (star submission + aggregate recompute)

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A checked-in (COMPLETED) tourist rates their stay 1–5 stars from the code-gated
booking page; the venue's `rating_tenths`/`reviews_count` recompute from real reviews, and
the Miramar demo seed's fabricated 48/326 stops being served.

**Architecture:** New ninth bounded context **`review`** as a **leaf module**
(`allowedDependencies = { shared }`, the `operator`/`customer` posture) per the wiring
addendum on epic #810 (comment of 2026-08-29): eligibility facts flow in through a
`review.spi.CompletedStays` driven port **implemented by `booking`** (the
`customer.spi.GuestBookingHistory` precedent — `review → booking::api` would cycle through
`venue`); aggregation flows out through an ids-only `review.events.ReviewsChanged` event to
a `venue` listener that queries `review.api.VenueRatingSummary` and writes venue's **own**
columns (full idempotent recompute, never an increment). No `BookingCompleted` event is
introduced — **considered and rejected** (maintainer asked for the re-examination,
2026-08-29): the check-in fact is a *query*, not a state change to propagate, so the house
rule (events for state changes, `api/` ports for queries — invariant #11) and Spring
Modulith guidance both put it behind a port; concretely, `review` listening to
`booking::events` would add the `review → booking` module edge that re-closes the
`venue → review → booking → venue` cycle `ApplicationModules.verify()` rejects, an async
projection would leave `reviewable=false` for a just-checked-in guest (epic story 6:
"review the moment I'm checked in"), and pre-deploy COMPLETED bookings would need a
backfill the pull reads for free. Check-in stays event-less (its documented "publishes no
event" stance holds); review eligibility is **pull-based** off `booking.completed_at` at
view/submit time. Full rationale lands in ADR-0015.

**Persistence:** JDBC only (invariant #1). New table `review` via **Flyway V45** (V45 is
free on `main` and unclaimed by any open PR — verified 2026-08-29, only Dependabot PRs
open); the same migration resets all `venue.rating_tenths`/`reviews_count` to 0/0
(supersedes the V3 Miramar seed's 48/326). `venue` is updated through its own adapter —
`review` never touches the `venue` table.

**Source of intent:** issue #811 (slice 1 of epic #810 — the epic body + its
pre-implementation wiring addendum comment are part of the intent).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
no-`BookingCompleted`-event constraint, the un-exposed `completed_at`, the Miramar
seed/IT collision, and confirmed V45 free + `StubPaymentGateway` makes the real-backend
loop feasible) · `riviera-plan-doc` (this template — forced the parity ledger for the
seed supersede and the rounding-rule write-down) · `tdd` (every phase red-green; the
uniqueness and recompute rules are pinned by failing tests first) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (**ran at Phase 5** over `origin/main...HEAD` — see the
Generalization-audit log's docs-freshness row for the findings; the plan's pre-listed
counting-sweep targets turned out to be a subset) · `riviera-modulith` (leaf
module shape, api-vs-spi call for `CompletedStays`, ninth-module structural-test/docs
updates, event-registry semantics for `ReviewsChanged`) · `riviera-java-conventions`
(records, typed `SubmitOutcome` over exceptions, package-private adapters, §6b error
contract for the new POST) · `postgres` (identity PK, `TIMESTAMPTZ`, CHECK over enum,
FK + explicit `venue_id` index, `UNIQUE(booking_id)` as the idempotency guard) ·
`codebase-design` (two `api/` ports split by consumer role; `CompletedStays` as the one
purposeful conversation for both submit and view legs) · `domain-modeling` (CONTEXT.md
terms Review / Review window / Aggregate rating; ADR-0015 judgment) · `riviera-frontend`
(star input → `shared/`, submit logic → `booking/`; no new cross-feature edge) ·
`angular-developer` + angular-cli MCP (`get_best_practices` v22: signals, no
`standalone:true`, OnPush default; `search_documentation` confirmed Angular Aria has no
radio-group primitive → house `segmented-control` radiogroup contract; Signal Forms
custom-control contract — `FormValueControl` + `value = model(...)` + `[formField]`,
schema-level validation — verified on angular.dev/guide/forms/signals/custom-controls) ·
`riviera-tailwind`
(token-first styling, `appTouchTarget` per radio, BUSY-1 `[appBusy]`, focus-visible
recipe; Tailwind v4 docs verified for `focus-visible`/`aria-*` variants) · `playwright-cli`
(mocked journey shaped on `request-to-book.e2e.ts`; real-backend loop design).

**Branch:** `claude/sdlc-811-implement-reviews-s1-300qj8` — the implement session's designated
remote branch stands in for `feature/reviews-s1-star-rating` (riviera-sdlc cloud addendum). It
carries the plan branch `claude/sdlc-811-plan-review-ubc6zl` (HEAD `10de3e3`), merged in at
implement entry; the plan branch is now history, not a second line of work.

---

## Acceptance criteria (testable)

- [x] **AC-1 (submit):** Given a booking whose status is `COMPLETED`, `completed_at` within
  60 days, and no existing review, when `SubmitReview.submit(code, stars=4)` runs, then a
  review row is recorded for that booking/venue and `ReviewsChanged(venueRef)` is published
  in the same transaction (registry persists at commit). *Pinned by:*
  `SubmitReviewServiceTest.recordsReviewAndPublishes`, `ReviewSubmitFlowIT` (`@SpringBootTest` +
  `@RecordApplicationEvents` — `BookingEventIT`'s house shape; `@ApplicationModuleTest` was
  dropped because module isolation bootstraps the root composition and would force every other
  module's `api` port to be mocked, as `PayoutModuleTest`'s fifteen `@MockitoBean`s show, while
  proving less: this test's point is that the inverted `CompletedStays` really answers).
- [x] **AC-2 (one review per booking, ever):** Given a booking already reviewed, when a
  second submit races or repeats, then exactly one row exists and the outcome is
  `AlreadyReviewed` — enforced by `UNIQUE(booking_id)` + `INSERT … ON CONFLICT DO NOTHING`,
  proven under real concurrency. *Pinned by:* `ReviewUniquenessIT.concurrentDoubleSubmitRecordsOne`.
- [x] **AC-3 (eligibility fence):** Given a booking in any non-`COMPLETED` status
  (`PENDING_REQUEST`, `AWAITING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `DECLINED`,
  `EXPIRED`, `WITHDRAWN`), when submit is attempted, then the outcome is `NotEligible` and
  nothing is written. *Pinned by:* `SubmitReviewServiceTest.refusesAStayThatWasNeverCheckedIn`
  (the outcome mapping) + `JdbcCompletedStaysIT.yieldsNothingForAnyStatusButCompleted`
  (`@EnumSource` over every `BookingStatus` but `COMPLETED` — the status fence lives in SQL, so the
  enumeration belongs at the adapter the service can no longer see statuses through).
- [x] **AC-4 (window fence):** Given `completed_at` more than 60 days ago, when submit is
  attempted, then the outcome is `WindowClosed`. *Pinned by:* `ReviewWindowTest`.
- [x] **AC-5 (aggregate recompute):** Given visible reviews {5, 4} for a venue, when the
  `ReviewsChanged` listener runs, then the venue row reads `rating_tenths=45,
  reviews_count=2` (half-up rule below); given zero reviews, it reads `0/0`. Recompute is
  a full re-read (order-independent, idempotent under at-least-once delivery). *Pinned by:*
  `AggregateRatingTest` (the division), `VenueRatingRecomputeIT` (listener → venue row).
- [x] **AC-6 (server-owned view flag):** Given the code-gated view of an eligible booking,
  then `BookingDetail.reviewable == true`; for an ineligible or already-reviewed one,
  `false`. *Pinned by:* `ViewBookingServiceTest.reviewableFollowsReviewEligibility`.
- [x] **AC-7 (seed superseded):** After V45, every venue row carries `0/0` until a real
  recompute moves it — Miramar's 48/326 is never served again; a zero-review venue renders
  "New", never "0.0". *Pinned by:* `ReviewMigrationIT`, updated `VenueReadControllerIT` /
  `VenueListControllerIT` expectations.
- [x] **AC-8 (structure):** `ModularityTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`, `JdbcOnlyArchitectureTests`,
  `EndpointRoleGateCoverageTest` all green with the ninth module and the new endpoint.
- [x] **AC-9 (FE journey, mocked suite):** A COMPLETED+reviewable booking's page offers the
  star radiogroup; selecting 4 stars and submitting POSTs `{stars: 4}`, the page announces
  success and hides the form on the re-read; the venue surfaces show the recomputed
  score/count from the (mocked) wire. Star input is keyboard-operable and passes axe +
  touch-target sweeps. *Pinned by:* `frontend/e2e/review-a-stay.e2e.ts`,
  `star-rating.spec.ts` (keyboard contract + axe), touch-target sweep entry.
- [x] **AC-10 (real loop, local suite):** Operator creates a venue (sales close 23:59),
  a tourist instant-books today (StubPaymentGateway confirms synchronously), the operator
  checks the code in from the daily view, the tourist rates 5 stars, and the venue header
  shows `5.0 · 1 review`. *Pinned by:* `frontend/e2e/real-backend/reviews.e2e.ts`.

**Rounding rule (written down at the division, invariant-#5 discipline):**
`ratingTenths = (10 * sum(stars) + count / 2) / count` in integer arithmetic — round
half-up. Domain: stars ∈ [1,5] ⇒ tenths ∈ [10,50], inside venue's existing
`CHECK (rating_tenths BETWEEN 0 AND 50)`; zero reviews short-circuits to `0/0` before the
division. Lives in `review.domain.AggregateRating`, pinned by `AggregateRatingTest`
(including the half-up cases 8/3→27 and 15/4→38).

## Non-goals

- Comments, display names, edit/delete, "your submitted review" rendering, ineligibility
  messaging (slice 2, #812), review list on the venue page, moderation/hide, erasure hook,
  My Bookings entry link, nudge emails (later slices of #810) — the schema ships only what
  slice 1 needs; later slices add columns by forward migration.
- No `BookingCompleted` event; no change to check-in's "publishes no event" stance.
- No change to the Discover sort (still `rating_tenths DESC, name ASC`) or to the existing
  rating display markup (`RatingView`, "New" chip, `ratingTenths` wire fields — contract-stable).
- No weighted/Bayesian ranking (cold-start consequence recorded on epic #810, accepted for v1).

## Behavior-parity ledger

> The slice supersedes served data (the Miramar seed) rather than retiring a surface; the
> two visible consequences are ledgered so review checks them instead of re-deriving.

| Old-surface behavior | Verdict | How / why |
|---|---|---|
| Miramar's Discover card + map header show `4.8 · 326 reviews` | **changed** (epic decision) | V45 resets all venue rating columns to 0/0; Miramar renders the existing "New" chip until real reviews land |
| Discover order: Miramar first via `rating_tenths DESC` | **changed** | all venues tie at 0 post-reset → name-ASC order until real reviews differentiate; `VenueListControllerIT` order expectations updated |
| Zero-review venues render "New" (never "0.0") | **preserved** | untouched `shared/rating.ts` `isRated` = `reviewsCount > 0`; pinned already by `rating.spec.ts` + `discovery-flow.e2e.ts` |
| Code-gated page: all existing sections (pay panel, cancel, withdraw, QR) | **preserved** | review panel is a new `@if (b.reviewable)` section; no existing gate touched; `booking-view.spec.ts` suite stays green |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Concurrent double-submit records two reviews | med | high | `UNIQUE(booking_id)` + `INSERT … ON CONFLICT DO NOTHING` claim; typed `AlreadyReviewed` outcome; `ReviewUniquenessIT` real-concurrency test | impl | **closed** (Phase 1 — four racing submits give one `Submitted` + three `AlreadyReviewed` and one row, `@RepeatedTest(3)`) |
| R-2 | Lost/duplicated `ReviewsChanged` delivery skews the aggregate | med | med | Event Publication Registry (at-least-once, AFTER_COMMIT) + **full recompute** (idempotent, order-independent — the payout-listener discipline); converges because each submit's own listener runs after its commit | impl | **closed** (Phase 2 — `VenueRatingRecomputeIT.redeliveryOfTheSameEventChangesNothing`; nothing but the venue id is read off the event) |
| R-3 | Rounding drift / float sneaking into the mean | low | med | integer half-up formula written down above; `AggregateRatingTest` edge cases; no `double` anywhere in the math | impl | **closed** (Phase 2 — `AggregateRating` is `long`/`int` only, the rounding rule is stated at the division, and the mean is taken in the domain rather than in SQL so a test can reach it) |
| R-4 | Seed reset breaks ITs/e2e asserting 48/326 or Miramar-first order | high | low | grill found the assertion sites (`VenueListControllerIT`, `VenueReadControllerIT`; FE e2e fixtures are mocks and stay); updated in the same phase as V45 | impl | **closed** (Phase 0 audit — one real site, `VenueReadControllerIT`, updated with V45; `VenueListControllerIT` seeds its own ratings post-migration and needed nothing) |
| R-5 | New public POST misses an edge wire (SecurityConfig permitAll, CSRF ignore, per-code rate-limit template, `DECLARED_REACHABLE`, `WebSliceStubs`) | med | med | `EndpointRoleGateCoverageTest` enumerates every mapped endpoint (fails loud); Phase 3 checklist lists all five sites; review overlay RV-BE checks | impl | **closed** (Phase 3 — all five wired and green; the Phase 3 audit re-derived the population from the code rather than the checklist) |
| R-6 | Module cycle (`venue → review → booking → venue`) | low | high | leaf posture per epic addendum: `review` depends only on `shared`; `ApplicationModules.verify()` is the gate | impl | **closed** (Phases 0–1 — `review` ships `allowedDependencies = { shared }`; `ModularityTests` green with the ninth module and `booking`'s `review::spi` grant) |
| R-7 | Flyway V45 collision with in-flight work | low | med | verified free on `main` + all 20 open PRs are Dependabot (2026-08-29); if a collision appears, this branch renumbers (merges second) | impl | **closed** (Phase 0 — V45 landed with no collision; re-checked at the pre-merge `origin/main` merge) |
| R-8 | Booking code leaks via the new module (invariant #7) | med | high | code never logged, never in ProblemDetail (`instance` overridden to constant URI — copy `BookingController.error(...)`); per-code rate-limit joins the shared "guesses at the same secret" budget | impl | **closed** (Phase 3 — `ReviewControllerTest.theBookingCodeNeverAppearsInAnErrorBody` asserts the whole body, `instance` pinned to `/api/bookings`; no `review` class logs at all) |
| R-9 | Real-backend loop infeasible (check-in is service-date-only; sales close blocks same-day booking) | med | low | `StubPaymentGateway` (`@Profile("!stripe")`) confirms synchronously — verified; the spec sets the venue's sales close to 23:59 and books **today** so check-in is legal; fallback: the backend `ReviewSubmitFlowIT` already proves the true loop server-side, and the e2e AC is renegotiated with the maintainer | impl | **closed — the fallback was NOT needed** (Phase 5: `reviews.e2e.ts` ran green in this cloud session against the real Spring Boot backend + real Postgres via `scripts/e2e-local-stack.sh`; sales close 23:59, booked today, `StubPaymentGateway` confirmed, real check-in, real rating, header read `5.0 · 1 review`) |
| R-10 | Star control fails the a11y/touch-target/focus gates | med | med | follow `segmented-control.ts` verbatim (roving tabindex, keydown per radio); `appTouchTarget` on each of the 5 radios (TT-1); `[appBusy]` on submit (BUSY-1 — `submitting` is a guarded stem); filled-vs-outline glyphs so state is never color-only | impl | **closed** (Phase 4 — `star-rating.spec.ts` axe + keyboard contract green, both authoring guards green, and the sweep now *measures* the five radios via a new reviewable-booking case) |
| R-11 | `venue.rating_tenths` gains a second writer unnoticed (no machine rule guards the venue table the way `ResponsibilitiesArchitectureTests` guards `set_availability`) | low | med | review-checked boundary: `review` has no SQL touching `venue`; called out for RV-BE; RESPONSIBILITIES §venue gains the "I store the aggregate; `review` computes it" line | impl | **mitigated, stays review-checked** (Phase 2 — the write is one method, `JdbcVenues.store`, behind venue's own `VenueRatings` port; `review`'s SQL names only the `review` table. Still no machine rule: the RESPONSIBILITIES line lands in Phase 5) |

## Open questions / Assumptions

- **Assumption A-1:** ADR-0015 ("`review` is a leaf module; aggregation is event + own-write")
  ships with this slice — the epic delegated the ADR judgment to slice 1; all three ADR
  criteria hold (hard to reverse, surprising inversion, real trade-off vs `review → booking::api`).
  *Owner:* maintainer may veto at plan review · *Resolves by:* phase 0.
- **Assumption A-2 (epic-delegated decision):** `review` publishes its **own**
  `review.vocabulary.VenueRef(long value)` rather than reusing `operator::vocabulary.VenueRef`
  — keeps `allowedDependencies = { shared }` exactly (the operator published-own-ref
  precedent, same rationale verbatim). *Owner:* plan · *Resolves by:* phase 0.
- **Assumption A-3:** Miramar reset rides **inside V45** (one migration: create table +
  `UPDATE venue SET rating_tenths = 0, reviews_count = 0`) — no real review exists, so every
  nonzero value is fabricated; "overwritten by first recompute" would leave 326 fake reviews
  in denominators. *Owner:* plan · *Resolves by:* phase 0.
- **Decision A-4 (revised per maintainer direction, 2026-08-29):** the FE submit leg is a
  **Signal Form** — `form(signal({ stars: null }), p => required(p.stars, …))` in
  `booking-view.ts`, with `shared/star-rating.ts` implementing Signal Forms'
  `FormValueControl<number | null>` (`value = model(...)`) and bound via
  `[formField]="reviewForm.stars"`; validation lives in the schema, the control only
  displays state (angular.dev custom-controls guidance). This matches the house standard
  (16 files on `@angular/forms/signals`, zero on `@angular/forms`) and makes the control a
  drop-in field for #812's fuller form (comment + display name). The earlier
  signal-state-only deviation is withdrawn. *Owner:* plan · *Resolved.*
- **Open question O-1 — resolved (phase 4), and the answer was "half".**
  `touch-targets-tourist.e2e.ts` does visit `/booking/:code`, but with a **CONFIRMED**
  booking, so the five radios — which exist only on a reviewable one — were *not* swept for
  free. A second case (`booking detail — a delivered stay offering the star rating`) serves the
  same fixture as `COMPLETED` + `reviewable`, so the radios are measured; the confirmed case
  keeps proving the cancel controls it was written for.
- **Open question O-2 — resolved (phase 0 audit, re-confirmed phase 4).** Every FE hit for
  `ratingTenths`/`reviewsCount` is either a mocked wire value or the display helper; none
  asserts "Miramar seeded" semantics, and the real-backend suite asserts no rating at all. No
  FE fixture needed changing.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No path in this slice reads or writes
`availability(set_id, booking_date)`; the `booking` module gains only a read-side flag and
a read-only `CompletedStays` adapter. The slice's own concurrency point is **review
uniqueness**, handled with the same discipline invariant #2 mandates for availability:
DB-enforced `UNIQUE (booking_id)` + an atomic `INSERT … ON CONFLICT DO NOTHING` claim whose
row-count is the outcome (no read-then-write race), pinned by
`ReviewUniquenessIT.concurrentDoubleSubmitRecordsOne`. Aggregate recompute concurrency:
each event's listener runs AFTER its submit's commit and re-reads the full review set, so
concurrent recomputes converge (last reader sees the complete set); no lock needed.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `review` | **new (ninth)** | `Review` | the review record, eligibility/window policy, aggregate math — epic #810 Implementation Decisions |
| M-2 | `booking` | existing | `Booking` | implements `review.spi.CompletedStays` (completed-stay facts); surfaces `reviewable` on the code-gated view via `review::api` |
| M-3 | `venue` | existing | `Venue` | sole writer of `venue.rating_tenths`/`reviews_count`; gains its first `adapter/in` event listener |
| M-4 | root (edge) | existing | — | SecurityConfig permitAll + CSRF ignore, RateLimitFilter fourth per-code template, role-gate coverage declaration |

**Cross-module named interfaces (`api/` + `spi/` ports)**

| # | Surface | Port | Public types (all in `review.vocabulary`) | Consumers / implementor |
|---|---|---|---|---|
| NI-1 | `review.api` | `VenueRatingSummary#summaryFor(VenueRef): RatingSummary` | `VenueRef`, `RatingSummary(int ratingTenths, int reviewsCount)` | consumer: `venue` (listener) |
| NI-2 | `review.api` | `ReviewEligibility#stateFor(String bookingCode): ReviewState` | `ReviewState` enum (`ELIGIBLE`, `ALREADY_REVIEWED`, `NOT_COMPLETED`, `WINDOW_CLOSED`, `NO_SUCH_STAY`) | consumer: `booking` (`ViewBookingService` → `reviewable`; #812 consumes richer states) |
| NI-3 | `review.spi` | `CompletedStays#byCode(String): Optional<CompletedStay>` — empty unless the booking exists **and** is `COMPLETED` — plus `#existsByCode(String): boolean`, the presence probe that separates "no such booking" from "never checked in" (the contract's 404-vs-409; unreadable off an empty `byCode`, and consulted only once `byCode` comes back empty — the `venue.spi.BookingPresence` fact-probe shape) | `CompletedStay(BookingRef booking, VenueRef venue, Instant completedAt)`, `BookingRef` | **implemented by `booking`** (`JdbcCompletedStays`, own SQL — `findByCode` untouched) |

Two `api/` ports split by consumer role (#94); submit stays an **internal** application
port (`review.application.SubmitReview`) — its only caller is `review`'s own REST adapter
(the `ViewBooking` precedent). `api`/`spi` hold non-sealed interfaces only; all records/enums
land in `vocabulary` (`PublishedSurfacePlacementArchitectureTests`).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `review.events.ReviewsChanged` | `SubmitReviewService` (`@Transactional`, publish from the claim's RETURNING facts — never a second read) | `{ VenueRef venue }` | `venue` (`ReviewsChangedListener`, `@ApplicationModuleListener`, DB-only → shared pool) | async AFTER_COMMIT via Event Publication Registry | `ReviewSubmitFlowIT` (`PublishedEvents`), `VenueRatingRecomputeIT` |

This is the **sixth** published event — CLAUDE.md's "Five published events" sentence and
the availability-has-no-listener framing are updated in Phase 5. The listener re-reads the
aggregate through NI-1 rather than trusting anything on the event (the
`BookingConfirmedPayoutListener` commission-rate discipline).

**Alternative considered — `BookingCompleted` event instead of the `CompletedStays` pull
(rejected; recorded in ADR-0015).** Events are for propagating state changes to modules
that react (Modulith's own posture, and this repo's invariant #11); the check-in fact is a
*lookup* the moment review needs it. Making it an event fails three ways: (1) **cycle** —
`review` consuming `booking::events` adds `review → booking`, and with `venue → review`
(the listener) plus `booking → venue::api` already fixed, `verify()` rejects the graph;
this is the same cycle the epic addendum killed for `review → booking::api`. (2)
**consistency** — an event-fed eligibility projection is eventually consistent, so a guest
checking in and immediately opening their booking page (epic story 6) would see no review
form until the listener ran. (3) **backfill** — bookings already COMPLETED at deploy would
need a one-off projection seed; the pull reads `booking.completed_at` directly and needs
none. The slice still keeps the event where an event belongs: `ReviewsChanged` propagating
the state change to `venue`.

**allowedDependencies deltas** (narrowest named interfaces):

- `review` (new): `{ "shared" }`.
- `booking`: `+ "review::api", "review::spi", "review::vocabulary"` (implements NI-3,
  calls NI-2).
- `venue`: `+ "review::api", "review::events", "review::vocabulary"` (listener + NI-1).

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Review record, one-per-booking rule, 60-day window, eligibility policy, aggregate math | `review` | new §`review` Job (RESPONSIBILITIES.md ships in Phase 5); not `booking` (its Not-My-Job grows: "review policy → `review`; I answer only the completed-stay fact via `review.spi.CompletedStays` — the `GuestBookingHistory` sentence-shape") |
| "Was this booking checked in, and when" (fact only) | `booking` | §booking Job owns check-in and `completed_at`; exposed as an spi fact, never the `BookingStatus` enum (existing "keeps `BookingStatus` internal" rule holds — `CompletedStay` presence IS the completed fact) |
| Writing `venue.rating_tenths` / `reviews_count` | `venue` | §venue: sole writer of its table; new line mirrors the commission split: "I store the aggregate *values*; `review` computes them" (R-11) |
| The submit endpoint `POST /api/bookings/{code}/review` | `review` (`adapter/in`) | driving adapter of the module that owns the use case; joins the code-gated URL family without touching `BookingController` |
| `reviewable` flag on the code-gated read | `booking` | the view contract is `booking`'s (`BookingDetail`); the *policy answer* comes from `review::api` (decision-vs-rendering split) |
| Edge wiring (permitAll, CSRF, rate limit) | root | login/session/edge machinery never in modules (RV-BE-11) |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves; no Stripe surface touched. The
integer-arithmetic discipline (#5) is borrowed for the rating mean (rounding rule above).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/star-rating.ts` (+ `.spec.ts`) | new | standalone component (presentational primitive — `shared/` per `riviera-frontend`; no HTTP, no app state) | implements Signal Forms' `FormValueControl<number \| null>`: `value = model<number \| null>(null)`; `input.required<string>()` aria-label; optional `disabled`/`touched` inputs only if needed | Signal Forms custom control, bound via `[formField]` |
| FE-2 | `booking/booking-view.ts` | modified | review panel `@if (b.reviewable)` + result region (house `role="status"` outside-the-switch pattern); per-booking signal/form reset in the `paramMap` subscription | signals; `submitting` flag with `[appBusy]` | Signal Form: `form(signal({ stars: null }), p => required(p.stars, { message: 'Pick a star rating.' }))`; submit guarded on form validity (A-4) |
| FE-3 | `booking/booking.service.ts` | modified | `review(code, stars)` → `POST /api/bookings/{code}/review` beside `cancel`/`withdraw`; success → `load(true)` re-read | rxjs `.subscribe({next, error})` + `problemCodeOf` | — |
| FE-4 | `booking/booking.model.ts` | modified | `BookingDetail` gains `reviewable: boolean` | — | — |

**Star control contract** (verified against W3C APG "Rating Radio Group" + house
`segmented-control.ts`; Angular Aria has no radio-group primitive — angular-cli MCP
`search_documentation`, v22): `role="radiogroup"` host with required accessible name; five
`<button type="button" role="radio" appTouchTarget>` children, `aria-checked`, per-star
labels "1 star" … "5 stars"; **roving tabindex** (checked radio is the tab stop; none
checked → first radio); arrows move selection *and* focus with wrap, Home/End to extremes;
`(keydown)` bound **per radio, never the group div** (a11y-lint `interactive-supports-focus`);
selection ends with `.focus()` and writes the `value` model (which is what makes the
component a `FormValueControl` — the `[formField]` directive two-way-binds it and feeds
schema state back; validation stays in the form schema, never in the control).
Selected state is filled `★` vs outline `☆` (never
color-only); glyph spans `aria-hidden="true"`. Styling: token-first Tailwind v4, house
focus recipe `focus-visible:outline-[3px] focus-visible:outline-offset-2
focus-visible:outline-riv-accent-ink`, `text-[…px]` sizes, `motion-reduce:` guard —
state classes bound from the model signal (no `peer-checked` needed; Tailwind v4 docs
confirm the variants exist if the shape ever changes to native inputs).

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()` signal
APIs; OnPush default (v22 — not set explicitly); Signal Forms per the house standard (A-4)
— no deviation remains.

## FE↔BE contract

- **Changed:** `GET /api/bookings/{code}` → `BookingDetailView` gains `reviewable: boolean`
  (server-owned flag; the template gates on it, never on status — the `withdrawable` rule).
- **New:** `POST /api/bookings/{code}/review`, body `{ "stars": 1..5 }` → `201 Created`
  (empty body; FE re-reads the detail). Errors are RFC-7807 `ProblemDetail` via
  `ApiProblem`/`ApiErrorHandler` (§6b — no `@Valid`), `instance` pinned to the constant
  `/api/bookings` so the code never leaks:
  - unknown code → `404` `NO_SUCH_BOOKING` (the shared non-enumerating answer, same body
    as the view leg),
  - not COMPLETED → `409` `BOOKING_NOT_COMPLETED`,
  - window closed → `409` `REVIEW_WINDOW_CLOSED`,
  - already reviewed → `409` `REVIEW_ALREADY_SUBMITTED`,
  - stars outside 1–5 / malformed → `400` `INVALID_REQUEST` (`InvalidApiRequestException`).
- **Edge:** permitAll + CSRF `ignoringRequestMatchers` entry (`/api/bookings/*/review`);
  RateLimitFilter gains `REVIEW_TEMPLATE` joining the shared per-code budget (30/30s —
  "guesses at the same secret") + per-IP; `EndpointRoleGateCoverageTest.DECLARED_REACHABLE`
  entry with reason.
- **Wire types:** stars as plain int; no money, no dates added.

## Execution status

> **This section is the session-recovery anchor** — update in the same commit window as
> the change it records, at every phase boundary and stage transition.

**Stage pointer:** `implement` — Phase 0 done. Implementation runs on the branch above; the
review gate is deliberately **out of scope for this session** (it runs from a separate session,
per the maintainer's instruction), so the PR stays a **draft** and is never marked ready.

**Next action:** none in this session — all six phases are done, CI is green, and the session's
stop condition is reached. The PR (**#816**) stays a **draft**: the review gate and the
ready-for-review transition are the next session's, by the maintainer's instruction. Final
close-out (`merged via PR #NN`, the self-review boxes) belongs to that session's merge step.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V45 migration + `review` module skeleton + structural tests | ✅ | `<phase-0>` |
| 1 — submit path: domain, service, JDBC adapter, spi + booking's `JdbcCompletedStays` | ✅ | `<phase-1>` |
| 2 — `ReviewsChanged` → venue listener → recompute + seed-supersede IT updates | ✅ | `<phase-2>` |
| 3 — edge: `ReviewController`, `reviewable` on the view, SecurityConfig/RateLimit/coverage | ✅ | `<phase-3>` |
| 4 — FE: `star-rating`, booking-view panel, service/model, unit+axe+contrast, mocked e2e | ✅ | `<phase-4>` |
| 5 — real-backend e2e loop + docs (CLAUDE/RESPONSIBILITIES/CONTEXT/ADR-0015/counting sweep) | ✅ | `<phase-5>` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | Sonar (PR #816, `java:S6213` ×2) | `Reviews.record(...)` and its adapter override match a **restricted identifier** (`record`) — MAJOR code smell, and this repo's merge bar is 0 new issues, not merely a green gate | **fixed** — renamed to `Reviews.claim(...)`, which also reads better: it is the same atomic-claim primitive as `AvailabilityClaim.claim`, and the row's creation *is* the claim |
| F-2 | Local run of the real-backend suite (Phase 5) | 6 of the 10 pre-existing real-backend specs fail — `venue-editor`, `venue` ×2, `daily`, `pricing`, `payouts` — all at the shared `createVenue` helper's `Venue details` heading, because `signInOperator` only *submits* the login and those call sites navigate again before the session round-trip settles (`venue-editor.e2e.ts:50-51`) | **not this slice's, reported not fixed** — `git diff origin/main` shows this branch touches none of those files or the helper; the suite is local-only (never CI), so the race was invisible. The new `reviews.e2e.ts` avoids it by awaiting the heading after sign-in. Proposed patch: move that `await expect(...)` inside `createVenue`, ahead of its own `goto` |

---

## File structure

- `docs/plans/reviews-s1-star-rating.md` — this plan
- `docs/adr/ADR-0015-review-leaf-module.md` (the repo's actual `ADR-NNNN-` prefix, not the template's bare number) — ADR: leaf `review` module, spi inversion, event + own-write aggregation; rejected alternatives recorded (`review → booking::api`, and a `BookingCompleted` event — cycle, consistency lag, backfill) (A-1)
- `CLAUDE.md` — bounded-context table row `review`; "Five published events" → six; module count prose
- `RESPONSIBILITIES.md` — new §`review`; §venue Job/Not-My-Job aggregate lines; §booking Not-My-Job review line + `CompletedStays` mention; header module list; machine-vs-review-checked classification
- `CONTEXT.md` — Review, Review window, Aggregate rating
- `.claude/skills/riviera-modulith/SKILL.md` — "eight bounded-context modules" → nine (both sites) and the five-event inventory → six
- `.claude/skills/riviera-modulith/references/boundaries.md`, `.claude/skills/riviera-modulith/references/events.md`, `.claude/skills/riviera-stripe-payments/SKILL.md`, `docs/adr/ADR-0007-package-structure.md`, `docs/agents/domain.md` — the five counting-sweep sites the plan did **not** pre-list, found by the `riviera-docs-freshness` sweep (three of them only on the re-run *after* the first fix round — the #373 lesson holding)
- `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` — "Later" line annotated (epic #810 executes it)
- `platform/src/main/resources/db/migration/V45__review.sql` — table + Miramar reset
- `platform/src/main/java/ai/riviera/platform/review/**/*.java` — `package-info.java`, `api/{VenueRatingSummary,ReviewEligibility,package-info}.java`, `spi/{CompletedStays,package-info}.java`, `vocabulary/{VenueRef,BookingRef,RatingSummary,ReviewState,CompletedStay,SubmitOutcome,package-info}.java`, `events/{ReviewsChanged,package-info}.java`, `application/{SubmitReview,SubmitReviewService,ReviewEligibilityService,Reviews}.java`, `domain/{ReviewWindow,AggregateRating}.java`, `adapter/in/ReviewController.java`, `adapter/out/JdbcReviews.java`
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — grants `+ review::api/spi/vocabulary`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcCompletedStays.java` — implements NI-3
- `platform/src/main/java/ai/riviera/platform/booking/application/view/{ViewBookingService,BookingDetail}.java` — `reviewable`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — wire field
- `platform/src/main/java/ai/riviera/platform/venue/package-info.java` — grants `+ review::api/events/vocabulary`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/ReviewsChangedListener.java` — first venue listener
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueRatingService.java` + its ports `platform/src/main/java/ai/riviera/platform/venue/application/RecomputeVenueRating.java` (inbound, the listener's) and `platform/src/main/java/ai/riviera/platform/venue/application/VenueRatings.java` (outbound, the write) + `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the one venue-side write (no dedicated `JdbcVenueRatings`: `JdbcVenues` already serves two ports writing this same row)
- `platform/src/main/java/ai/riviera/platform/{SecurityConfig,RateLimitFilter}.java` — edge wiring
- `platform/src/test/java/ai/riviera/platform/ModularityTests.java` — javadoc count
- `platform/src/test/java/ai/riviera/platform/{EndpointRoleGateCoverageTest,WebSliceStubs}.java` — declaration + stubs
- `platform/src/test/java/ai/riviera/platform/review/**/*.java` — `SubmitReviewServiceTest`, `ReviewWindowTest`, `AggregateRatingTest`, `ReviewUniquenessIT`, `ReviewSubmitFlowIT`, `ReviewMigrationIT`, `ReviewControllerTest`
- `platform/src/test/java/ai/riviera/platform/ReviewFixtures.java` — the venue/set/guest/booking seeding both the `review` and `booking` test packages share (the `OwnershipFixtures` placement precedent)
- `platform/src/test/java/ai/riviera/platform/ReviewControllerTest.java` — the web slice, in the root test package because it imports the package-private `SecurityConfig`/`WebSliceStubs` (every `*ControllerTest` in the repo sits there for the same reason)
- `platform/src/test/java/ai/riviera/platform/venue/**/*.java` — `VenueRatingRecomputeIT`; updated `VenueReadControllerIT`, `VenueListControllerIT`
- `platform/src/test/java/ai/riviera/platform/booking/**/*.java` — `ViewBookingServiceTest` update, `JdbcCompletedStaysIT`
- `frontend/src/app/shared/star-rating.ts` + `frontend/src/app/shared/star-rating.spec.ts` — control + keyboard/axe spec
- `frontend/src/app/booking/{booking-view.ts,booking-view.spec.ts,booking.service.ts,booking.service.spec.ts,booking.model.ts}` — panel, flag, POST
- `frontend/src/app/booking/{find-booking.spec.ts,booking-pay.spec.ts,my-bookings.spec.ts}` — their `BookingDetail` fixtures gain `reviewable` (the field is required, so every fixture declares it)
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — star glyph/status colors over the card stops (if a new color pairing is introduced)
- `frontend/e2e/review-a-stay.e2e.ts` — mocked journey (AC-9)
- `frontend/e2e/touch-targets*.e2e.ts` — surface entry if `/booking/:code` absent (O-1)
- `frontend/e2e/real-backend/reviews.e2e.ts` (+ any new `frontend/e2e/real-backend/support/*.ts` helper) — AC-10

---

## Phase 0 — V45 migration + `review` module skeleton

**Files:** Create `V45__review.sql`, `review/package-info.java`, `review/vocabulary/*`,
`review/events/ReviewsChanged.java` (+ package-infos) · Modify `ModularityTests` javadoc ·
Test `ReviewMigrationIT`

- [x] **Step 1: Write the failing migration IT** (Testcontainers; skips cleanly without Docker)

```java
@Test
void reviewTableEnforcesStarsRangeAndOnePerBooking() {
    long venueId = seedVenue();
    long bookingId = seedCompletedBooking(venueId);
    insertReview(bookingId, venueId, 4);
    assertThrows(DataIntegrityViolationException.class, () -> insertReview(bookingId, venueId, 5));
    assertThrows(DataIntegrityViolationException.class, () -> insertReview(seedCompletedBooking(venueId), venueId, 6));
}

@Test
void v45ResetsEverySeededRatingToZero() {
    var row = jdbc.sql("SELECT rating_tenths, reviews_count FROM venue WHERE name = 'Miramar Beach Club'")
        .query((rs, n) -> new int[] { rs.getInt(1), rs.getInt(2) }).single();
    assertArrayEquals(new int[] { 0, 0 }, row);
}
```

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ReviewMigrationIT*"` → FAIL (`relation "review" does not exist`)
- [x] **Step 3: Minimal implementation** — `V45__review.sql` (house prose header naming
  issue #811, the no-later-slice-columns decision, and the verifying IT):

```sql
CREATE TABLE review (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  BIGINT      NOT NULL REFERENCES booking (id),
    venue_id    BIGINT      NOT NULL REFERENCES venue (id),
    stars       INTEGER     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT review_once_per_booking UNIQUE (booking_id),
    CONSTRAINT review_stars_check CHECK (stars BETWEEN 1 AND 5)
);
-- booking_id lookups ride the UNIQUE index; the FK column venue_id needs its own
-- (Postgres does not create it automatically) — it is the recompute's access path.
CREATE INDEX review_venue_id_idx ON review (venue_id);

-- Supersede the V3 demo seed: no venue may carry rating values that did not come
-- from the recompute (#811 AC; epic #810). All real venues are 0/0 already.
UPDATE venue SET rating_tenths = 0, reviews_count = 0;
```

  Skeleton packages: `package-info.java` with
  `@ApplicationModule(displayName = "Review", allowedDependencies = { "shared" })`;
  `vocabulary/`: `VenueRef(long value)` (own-ref rationale javadoc mirroring
  `operator.vocabulary.VenueRef`), `BookingRef(long value)`, `RatingSummary(int
  ratingTenths, int reviewsCount)`, `ReviewState` enum, `CompletedStay(BookingRef booking,
  VenueRef venue, Instant completedAt)`, `SubmitOutcome` sealed
  (`Submitted`/`AlreadyReviewed`/`NotEligible`/`WindowClosed`/`NoSuchStay`);
  `events/ReviewsChanged(VenueRef venue)`.
- [x] **Step 4: Run** — `./gradlew test --tests "*ReviewMigrationIT*" --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS
- [x] **Step 5: Generalization audit** — population "everything that asserts the seeded
  48/326 or Miramar-first ordering": `grep -rn "48\b.*326\|rating_tenths" platform/src/test frontend/e2e frontend/src --include="*.java" --include="*.ts" -l` → fix list feeds Phase 2/4; log below.
- [x] **Step 6: Commit** — `git commit -m "Add review module skeleton + V45 review table, supersede demo rating seed (#811)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — submit path (domain + application + adapters)

**Files:** Create `domain/ReviewWindow.java`, `domain/AggregateRating.java`,
`application/{SubmitReview,SubmitReviewService,Reviews}.java`, `spi/CompletedStays.java`,
`adapter/out/JdbcReviews.java`, `booking/adapter/out/JdbcCompletedStays.java` · Modify
`booking/package-info.java` · Tests `SubmitReviewServiceTest`, `ReviewWindowTest`,
`AggregateRatingTest`, `ReviewUniquenessIT`, `JdbcCompletedStaysIT`, `ReviewSubmitFlowIT`

- [x] **Step 1: Failing service test** (fake `CompletedStays` + fake `Reviews`; frozen `Clock`)

```java
@Test
void recordsReviewAndPublishes() {
    stays.completed("RVWCODE123", booking(7), venue(3), NOW.minus(Duration.ofDays(1)));
    var outcome = service.submit("RVWCODE123", 4);
    assertEquals(new SubmitOutcome.Submitted(), outcome);
    assertEquals(new ReviewsChanged(new VenueRef(3)), events.single());
}

@Test
void refusesAfterSixtyDays() {
    stays.completed("RVWCODE123", booking(7), venue(3), NOW.minus(Duration.ofDays(61)));
    assertEquals(new SubmitOutcome.WindowClosed(), service.submit("RVWCODE123", 4));
    assertTrue(reviews.isEmpty());
}
```

- [x] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*SubmitReviewServiceTest*"`
- [x] **Step 3: Implementation.** `SubmitReviewService` (package-private `@Service`,
  `@Transactional`, constructor-injected `CompletedStays`, `Reviews`,
  `ApplicationEventPublisher`, `Clock`): resolve the stay (`empty` → `NoSuchStay`; the
  controller maps it to the shared non-enumerating 404), check
  `ReviewWindow.isOpen(completedAt, clock)` (`WINDOW = Duration.ofDays(60)` named
  constant), claim via `Reviews.record(booking, venue, stars, now)` returning
  `boolean inserted` (`INSERT … ON CONFLICT DO NOTHING`, row-count is the answer);
  `false` → `AlreadyReviewed`; `true` → publish `ReviewsChanged(venue)` from the claim's
  facts. `JdbcReviews` (package-private, `JdbcClient`, text-block SQL). `JdbcCompletedStays`
  in `booking/adapter/out`: own `SELECT id, venue_id, completed_at FROM booking WHERE code
  = :code AND status = 'COMPLETED'` (status token in lockstep with the CHECK-listed
  values), never widening `findByCode`.
- [x] **Step 4: Run/verify PASS** — service + window + `ReviewUniquenessIT` (two threads,
  `ExecutorService` try-with-resources, exactly one row + one `AlreadyReviewed`) +
  `ReviewSubmitFlowIT` (`@ApplicationModuleTest` with `PublishedEvents`); then broaden to
  the `review` package.
- [x] **Step 5: Generalization audit** — population "spi ports `booking` implements":
  `grep -rln "implements .*\.spi\." platform/src/main` → confirm `JdbcCompletedStays`
  matches the `JdbcGuestBookingHistory` shape (package-private, empty-guard, no logging of
  the code).
- [x] **Step 6: Commit** — `git commit -m "Review submit path: eligibility via booking-implemented CompletedStays, one review per booking (#811)"`
- [x] **Step 7: Update execution status.**

## Phase 2 — aggregate recompute (`ReviewsChanged` → venue)

**Files:** Create `venue/adapter/in/ReviewsChangedListener.java`,
`venue/application/VenueRatingService.java`, `review/api/VenueRatingSummary.java` (+ its
`JdbcReviews` query + `AggregateRating` math) · Modify `venue/package-info.java`, venue's
JDBC adapter (rating UPDATE), `VenueReadControllerIT`, `VenueListControllerIT` · Tests
`AggregateRatingTest`, `VenueRatingRecomputeIT`

- [x] **Step 1: Failing math + recompute tests**

```java
@Test
void halfUpAtTheDivision() {
    assertEquals(45, AggregateRating.tenths(9, 2));
    assertEquals(27, AggregateRating.tenths(8, 3));
    assertEquals(38, AggregateRating.tenths(15, 4));
    assertEquals(0, AggregateRating.tenths(0, 0));
}
```

  `VenueRatingRecomputeIT` (`@ApplicationModuleTest` on `venue` + `Scenario`): publish
  `ReviewsChanged(venue)` with two seeded reviews {5,4} → venue row becomes 45/2;
  re-deliver the same event → still 45/2 (idempotent).
- [x] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*AggregateRatingTest*" --tests "*VenueRatingRecomputeIT*"`
- [x] **Step 3: Implementation.** `AggregateRating.tenths(sumStars, count)` =
  `count == 0 ? 0 : (10 * sumStars + count / 2) / count` (all `int`/`long`, documented
  half-up). `JdbcReviews` gains `SELECT COUNT(*), COALESCE(SUM(stars), 0) FROM review
  WHERE venue_id = :venue` behind `VenueRatingSummary` — as built that SQL sits behind the module's
  internal `Reviews` port returning raw `ReviewTotals`, with `VenueRatingSummaryService` applying
  `AggregateRating` in front of the published port, so the rounding rule stays in the domain rather
  than in an adapter. `ReviewsChangedListener`
  (package-private `@Component`, single `@ApplicationModuleListener void on(ReviewsChanged
  event)`, DB-only → shared pool, javadoc mirroring the payout listener's
  at-least-once/idempotence paragraph) → `VenueRatingService.recompute(VenueRef)`
  (`@Transactional`): query NI-1, `UPDATE venue SET rating_tenths = :tenths, reviews_count
  = :count WHERE id = :id` via venue's own adapter. Update the two ITs' 48/326 + ordering
  expectations (Phase 0 audit list).
- [x] **Step 4: Run/verify PASS** — the two new tests + `--tests "*Venue*ControllerIT*"` +
  the structural net.
- [x] **Step 5: Generalization audit** — population "every `@ApplicationModuleListener`":
  `grep -rln "@ApplicationModuleListener" platform/src/main` → confirm the new listener is
  the only one re-computing venue state and carries the idempotence contract.
- [x] **Step 6: Commit** — `git commit -m "Venue recomputes rating from ReviewsChanged via review's aggregate port (#811)"`
- [x] **Step 7: Update execution status.**

## Phase 3 — edge: controller, view flag, security wiring

**Files:** Create `review/adapter/in/ReviewController.java`,
`review/api/ReviewEligibility.java`, `review/application/ReviewEligibilityService.java` ·
Modify `SecurityConfig`, `RateLimitFilter`, `application.properties` (if the template list
is property-driven), `EndpointRoleGateCoverageTest`, `WebSliceStubs`,
`ViewBookingService`, `BookingDetail`, `BookingDetailView`, `booking/package-info.java` ·
Tests `ReviewControllerTest` (web slice), `ViewBookingServiceTest`

- [x] **Step 1: Failing tests.** `ReviewControllerTest`: `POST /api/bookings/{code}/review`
  `{"stars":4}` → 201; each `SubmitOutcome` → its ProblemDetail code (FE↔BE table above);
  `stars: 0|6|missing` → 400 `INVALID_REQUEST`; response `instance` is the constant
  `/api/bookings` (code never echoed). `ViewBookingServiceTest.reviewableFollowsReviewEligibility`:
  `ELIGIBLE` → `true`, every other state → `false`.
- [x] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*ReviewControllerTest*" --tests "*ViewBookingServiceTest*"`
- [x] **Step 3: Implementation.** Controller: package-private `@RestController`, exhaustive
  `switch` over the sealed `SubmitOutcome` → `ApiProblem` rejects; request record with
  compact-constructor 1–5 validation throwing `InvalidApiRequestException` (§6b).
  `ReviewEligibilityService` implements NI-2 (consults `CompletedStays` + `Reviews`,
  applies `ReviewWindow`). `ViewBookingService` maps NI-2 to `reviewable`. Edge: permitAll
  + CSRF ignore + `REVIEW_TEMPLATE` in the shared per-code budget + `DECLARED_REACHABLE`
  entry ("public by design: the code is the credential, invariant #7") + `WebSliceStubs`
  beans for `SubmitReview`/`ReviewEligibility`.
- [x] **Step 4: Run/verify PASS** — the two test classes + `--tests "*EndpointRoleGateCoverageTest*"` + structural net; end-of-phase: `review` + `booking` packages.
- [x] **Step 5: Generalization audit** — population "every code-keyed endpoint":
  `grep -rn "bookings/\*" platform/src/main/java/ai/riviera/platform/SecurityConfig.java platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` → confirm all four legs (view/cancel/withdraw/review) share the per-code budget and CSRF posture.
- [x] **Step 6: Commit** — `git commit -m "Code-gated review submit endpoint + server-owned reviewable flag (#811)"`
- [x] **Step 7: Update execution status.**

## Phase 4 — frontend: star input, panel, mocked e2e

**Files:** Create `shared/star-rating.ts` + `.spec.ts`, `e2e/review-a-stay.e2e.ts` ·
Modify `booking/booking-view.ts` + `.spec.ts` (+ `.contrast.spec.ts` if a new color pairing
lands), `booking/booking.service.ts` + `.spec.ts`, `booking/booking.model.ts`,
touch-target sweep entry (O-1)

- [x] **Step 1: Failing specs.** `star-rating.spec.ts`: renders 5 `role="radio"` in a
  labelled `role="radiogroup"`; roving tabindex (none selected → first radio `tabIndex=0`);
  `ArrowRight` from 3 selects+focuses 4 (wraps 5→1); `Home`/`End`; click selects and
  focuses; each interaction writes the `value` model (the `FormValueControl` contract —
  pin it so `[formField]` binding keeps working); filled-vs-outline glyph classes;
  `expectNoAxeViolations(host)`. `booking-view.spec.ts`: `reviewable:true` detail → panel
  visible with the star control bound via `[formField]`; submit with no star → form
  invalid, service NOT called, required message shown; select 4 + submit → service called
  with `(CODE, 4)`, re-read with `reviewable:false` → panel gone, result region announces;
  `reviewable:false` → no panel (status never consulted); axe run on the reviewable state.
- [x] **Step 2: Run/verify FAIL** — `npm test -- star-rating booking-view` (scoped)
- [x] **Step 3: Implementation** per the FE-1/FE-2 contract above (segmented-control as the
  copy source for keyboard/roving-tabindex; `FormValueControl` shape + `form()`/`required()`
  schema per `find-booking.ts` and angular.dev custom-controls; `[appBusy]` submit button
  with the house BTN recipe; result region cloned from the outside-the-switch
  `role="status"` block; per-booking signal **and form** reset added to the `paramMap`
  subscription; `getByCode`-prefetch note: success path calls `load(true)`).
- [x] **Step 4: Run/verify PASS** — scoped Vitest, then `npm run lint`,
  `npm run format:check`, `npm run test:a11y`; guards:
  `node scripts/check-touch-target.mjs --files …`, `node scripts/check-focus-posture.mjs --files …`.
  Mocked e2e: `review-a-stay.e2e.ts` (route intercepts shaped on `request-to-book.e2e.ts`:
  detail GET → COMPLETED/reviewable, `POST …/review` asserting `{stars:4}` → 201,
  re-served detail `reviewable:false`, venue/list payloads with moved `ratingTenths` —
  covers AC-9's "see the score move" + the New→first-review display transition;
  `expectNoSeriousAxeViolations` after `settle`), run via `npm run test:e2e:a11y`.
- [x] **Step 5: Generalization audit** — population "surfaces the touch-target sweep
  visits": read `e2e/support/touch-targets.ts` surface list → add `/booking/:code` if
  absent (O-1); population "fixtures asserting seed semantics" (O-2 grep).
- [x] **Step 6: Commit** — `git commit -m "Star rating input on the code-gated page, submit-and-see-score journey (#811)"`
- [x] **Step 7: Update execution status.**

## Phase 5 — real-backend loop + docs close-out

**Files:** Create `e2e/real-backend/reviews.e2e.ts`, `docs/adr/0015-review-leaf-module.md` ·
Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, `CONTEXT.md`,
`.claude/skills/riviera-modulith/SKILL.md`, `ModularityTests` javadoc, spec "Later" line

- [x] **Step 1: Real-backend spec** (local-only; existing operator helpers): create venue +
  set (sales close **23:59** so booking *today* is legal), tourist instant-books today via
  the FE (StubPaymentGateway confirms synchronously — no Stripe), capture the code from the
  confirmation, operator daily-view check-in, open `/booking/{code}`, rate 5, assert the
  venue map header reads `5.0 · 1 review`. Run `npm run test:e2e` locally; document the
  run result honestly in the PR if the cloud sandbox cannot run it (riviera-local-debug).
- [x] **Step 2: Docs.** CLAUDE.md: `review` row (Owns: the review record, eligibility +
  60-day window, aggregate math; Root: `Review`), six-events sentence
  (`ReviewsChanged` → `venue`), Modulith module list. RESPONSIBILITIES.md: §`review`
  (Job / Not-My-Job — "writing `venue` columns → `venue`"; "deciding check-in → `booking`"),
  §venue + §booking line edits (§4a table wording), header list, machine-vs-review-checked
  note for R-11. CONTEXT.md: the three epic-defined terms. ADR-0015 (A-1). Counting-sweep
  sites: `riviera-modulith` SKILL.md ×2, `ModularityTests` javadoc. Spec "Later" line
  annotated. Then run `riviera-docs-freshness` over the branch range and act on findings.
- [x] **Step 3: Full local verification** — scoped per `riviera-local-debug`; CI owns the
  full suite. `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged first). Merge latest `origin/main` with phase discipline; mark PR ready for
  review → Review gate (`/code-review` + `riviera-review-overlay`) → Sonar gate → merge
  close-out per `references/pr-gates.md`.
- [x] **Step 4: Commit** — `git commit -m "Reviews docs close-out: ninth module recorded, ADR-0015, real-backend loop (#811)"`
- [x] **Step 5: Update execution status → finalize before merge (merged via PR #NN).**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-29 | Phase 5 (`riviera-docs-freshness` over `origin/main...HEAD`) | every substrate doc stating the module count or the published-event count — the counting sweep, whose whole point is that these sit in files the diff never touches | `grep -rniE '\b(the\|both\|only\|all) (eight\|8\|five\|5\|two\|2)\b' platform/src CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents docs/runbooks docs/deploy .claude/skills \| grep -iE 'module\|bounded\|event\|listener\|context\|published'`, then re-run after each fix round | **7 patched:** CLAUDE.md (module table + five→six events), `riviera-modulith` SKILL.md ×3 (eight→nine ×2, five-event→six), `riviera-modulith/references/boundaries.md`, `riviera-modulith/references/events.md`, `riviera-stripe-payments/SKILL.md`, `ADR-0007`, `docs/agents/domain.md`. **Read and left alone:** every "the two X" about mail vehicles / principal types / bulkhead pools / TTLs (different subject, still true), `RESPONSIBILITIES.md`'s "all five shipped listeners" (notification's *mail* listeners — mine is venue's and is not one), and the `docs/plans/*` hits (historical records, never living docs) | Three of the seven — `boundaries.md`, `events.md`, `riviera-stripe-payments` — surfaced **only on the re-run after the first fix round**, exactly the #373 failure mode the skill warns about; a single pass would have shipped them stale |
| 2026-08-29 | Phase 4 (`BookingDetail` gains a required field) | every `BookingDetail` fixture in the frontend | `grep -rln ": BookingDetail =" frontend/src` + `grep -rln "cancellationWindowAtBirth" frontend/src --include="*.spec.ts"` | 5 spec files — `booking-view`, `booking.service`, `find-booking`, `booking-pay`, `my-bookings` | all five given `reviewable: false`; the compiler was the enumerator here (a required field cannot be missed), and the grep only confirmed the fix list. The e2e fixtures are wire JSON, not typed, so an absent flag reads as `undefined` → falsy → no panel, which is the safe default and what the "not reviewable" case asserts |
| 2026-08-29 | Phase 3 (a fourth code-keyed public endpoint) | every code-keyed endpoint, and whether all of them share one posture | `grep -n "bookings/\*" …/SecurityConfig.java` + `grep -n "bookings/{code}" …/RateLimitFilter.java` | 4 legs — view (GET), cancel, withdraw, review | All four are `permitAll` + CSRF-ignored and resolve to a `Target(code)`; `RateLimitFilter` keys **one** `codeBuckets` map on the code alone, so the four share the "guesses at the same secret" budget rather than getting a fourth of their own. `/api/bookings/cancellation-terms` stays the deliberate exception (a literal sibling with no code to key on) |
| 2026-08-29 | Phase 2 (a ninth `@ApplicationModuleListener` joins the app) | every `@ApplicationModuleListener` | `grep -rln "@ApplicationModuleListener" platform/src/main/java` | 9 files — 6 listeners (2 booking, 1 notification composite, 2 payout, the new venue one), 2 executor configs naming bulkhead pools, 1 service-level listener | `ReviewsChangedListener` is the only one recomputing venue state, and it carries the at-least-once/idempotence paragraph the payout listeners set the shape for. It takes the **shared** executor, matching the two payout listeners (DB-only work); the bulkhead-pool listeners are the mail/refund ones, whose blast radius is an external call this one does not make |
| 2026-08-29 | Phase 1 (`booking` implements a second module's spi port) | every `spi` port `booking` implements | `grep -rln "implements .*\.spi\." platform/src/main` (plus the by-name sweep, since the import-and-implement forms differ) | 5 adapters: `JdbcGuestBookingHistory`, `JdbcBookingPresence`, `BookingCutoffSalesWindow`, `JdbcSetAvailabilityLookup`, `SuppressedConfirmationMailDelivery` | `JdbcCompletedStays` matches the shape verbatim — `@Repository`, package-private class + constructor, `JdbcClient`, empty-safe, no logging of the code. One sweep finding applied: `JdbcBookingPresence` derives its status tokens from `BookingStatus` rather than a literal, so `JdbcCompletedStays` now does too (§6a, and the enum still never crosses the seam) |
| 2026-08-29 | Phase 0 (V45 resets every venue's rating columns) | everything asserting the seeded 48/326 or Miramar-first ordering | `grep -rn "ratingTenths\|rating_tenths\|reviewsCount\|reviews_count" platform/src/test --include="*.java"` + the same over `frontend/src` / `frontend/e2e` / `frontend/e2e/real-backend` | 1 backend assertion (`VenueReadControllerIT.returnsVenueWithSets` → 48); `VenueListControllerIT` inserts its own ratings **after** migration so it is unaffected; `VenueAdminControllerIT` already asserts 0/0 for a fresh venue; every FE hit is a mocked wire value or the display helper — none asserts seed semantics (**resolves O-2**); the real-backend suite asserts no rating at all | `VenueReadControllerIT` updated to `0` with the superseding comment; no FE change needed |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..7:** the scoped `*Review*` / `*VenueRating*` / `*ViewBookingServiceTest*` /
  `*Venue*ControllerIT*` batches ran green locally per phase, and CI's full backend suite is green
  on the branch head — the two halves `riviera-local-debug` says make up complete verification.
- [x] **AC-8:** `ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`, `EndpointRoleGateCoverageTest` green (run after
  every structural change, not just at the end — `ModularityTests` caught the missing
  `review::api` grant on `booking` the moment `ViewBookingService` took it).
- [x] **AC-9:** `npm test` (2009 specs), `npm run test:a11y` (482), `npm run test:e2e:a11y`
  (299, incl. the new journey and the widened touch-target sweep) → all green.
- [x] **AC-10:** `npm run test:e2e -- reviews` → **green in this cloud session** against the real
  backend + real Postgres (`scripts/e2e-local-stack.sh`). R-9's fallback was not needed. Six
  *other* specs in that local-only suite fail on a pre-existing sign-in race this branch does not
  touch — findings register F-2.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section justified N/A; the slice's own concurrency test present (`ReviewUniquenessIT`).
- [x] Pool + cutoff rules untouched (invariants #3, #4 — no reservation-path change).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `ReviewsChanged` payload id-based (invariant #11).
- [x] **Payment/payout** N/A holds — no Stripe/ledger surface in the diff.
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: `completed_at`/`created_at` are UTC `Instant`s; the 60-day window is pure `Duration` arithmetic (invariant #6).
- [x] Booking codes never logged / never in error bodies (invariant #7 — R-8).
- [x] Flyway V45 present; constraints tested by `ReviewMigrationIT` (invariant #12).
- [x] **Frontend** standards met (Signal Forms per A-4); no `as any` on the contract.
- [x] Execution status at HEAD matches reality (stage pointer, phase table, findings register).
- [x] Risk register has no stale `open` rows (all eleven closed or explicitly downgraded); Open Questions O-1/O-2 both resolved in-slice.
- [ ] **Close-out written in THIS PR** (`merged via PR #816`; docs-freshness ran). *Half done: the
  docs-freshness sweep ran and its findings are logged; the `merged via` line belongs to the
  merging session, which is not this one.*
- [ ] **The review gate ran in full** — invocation ladder per `references/pr-gates.md` §1 +
  `riviera-review-overlay`. *Deliberately not run here — the maintainer scheduled it for a
  separate session, which is also why PR #816 stays a draft. This is a known, stated gap, not an
  oversight.*

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
