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
introduced: check-in stays event-less (its documented "publishes no event" stance holds);
review eligibility is **pull-based** off `booking.completed_at` at view/submit time.

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
`riviera-docs-freshness` (N/A at plan time — the close-out sweep runs over the merge
range; the counting sweep targets are pre-listed in Phase 5) · `riviera-modulith` (leaf
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
radio-group primitive → house `segmented-control` radiogroup contract) · `riviera-tailwind`
(token-first styling, `appTouchTarget` per radio, BUSY-1 `[appBusy]`, focus-visible
recipe; Tailwind v4 docs verified for `focus-visible`/`aria-*` variants) · `playwright-cli`
(mocked journey shaped on `request-to-book.e2e.ts`; real-backend loop design).

**Branch:** `claude/sdlc-811-plan-review-ubc6zl` — the session's designated remote branch
stands in for `feature/reviews-s1-star-rating` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (submit):** Given a booking whose status is `COMPLETED`, `completed_at` within
  60 days, and no existing review, when `SubmitReview.submit(code, stars=4)` runs, then a
  review row is recorded for that booking/venue and `ReviewsChanged(venueRef)` is published
  in the same transaction (registry persists at commit). *Pinned by:*
  `SubmitReviewServiceTest.recordsReviewAndPublishes`, `ReviewSubmitFlowIT` (module test,
  `PublishedEvents`).
- [ ] **AC-2 (one review per booking, ever):** Given a booking already reviewed, when a
  second submit races or repeats, then exactly one row exists and the outcome is
  `AlreadyReviewed` — enforced by `UNIQUE(booking_id)` + `INSERT … ON CONFLICT DO NOTHING`,
  proven under real concurrency. *Pinned by:* `ReviewUniquenessIT.concurrentDoubleSubmitRecordsOne`.
- [ ] **AC-3 (eligibility fence):** Given a booking in any non-`COMPLETED` status
  (`PENDING_REQUEST`, `AWAITING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `DECLINED`,
  `EXPIRED`, `WITHDRAWN`), when submit is attempted, then the outcome is `NotEligible` and
  nothing is written. *Pinned by:* `SubmitReviewServiceTest.refusesEveryNonCompletedStatus`.
- [ ] **AC-4 (window fence):** Given `completed_at` more than 60 days ago, when submit is
  attempted, then the outcome is `WindowClosed`. *Pinned by:* `ReviewWindowTest`.
- [ ] **AC-5 (aggregate recompute):** Given visible reviews {5, 4} for a venue, when the
  `ReviewsChanged` listener runs, then the venue row reads `rating_tenths=45,
  reviews_count=2` (half-up rule below); given zero reviews, it reads `0/0`. Recompute is
  a full re-read (order-independent, idempotent under at-least-once delivery). *Pinned by:*
  `AggregateRatingTest` (the division), `VenueRatingRecomputeIT` (listener → venue row).
- [ ] **AC-6 (server-owned view flag):** Given the code-gated view of an eligible booking,
  then `BookingDetail.reviewable == true`; for an ineligible or already-reviewed one,
  `false`. *Pinned by:* `ViewBookingServiceTest.reviewableFollowsReviewEligibility`.
- [ ] **AC-7 (seed superseded):** After V45, every venue row carries `0/0` until a real
  recompute moves it — Miramar's 48/326 is never served again; a zero-review venue renders
  "New", never "0.0". *Pinned by:* `ReviewMigrationIT`, updated `VenueReadControllerIT` /
  `VenueListControllerIT` expectations.
- [ ] **AC-8 (structure):** `ModularityTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`, `JdbcOnlyArchitectureTests`,
  `EndpointRoleGateCoverageTest` all green with the ninth module and the new endpoint.
- [ ] **AC-9 (FE journey, mocked suite):** A COMPLETED+reviewable booking's page offers the
  star radiogroup; selecting 4 stars and submitting POSTs `{stars: 4}`, the page announces
  success and hides the form on the re-read; the venue surfaces show the recomputed
  score/count from the (mocked) wire. Star input is keyboard-operable and passes axe +
  touch-target sweeps. *Pinned by:* `frontend/e2e/review-a-stay.e2e.ts`,
  `star-rating.spec.ts` (keyboard contract + axe), touch-target sweep entry.
- [ ] **AC-10 (real loop, local suite):** Operator creates a venue (sales close 23:59),
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
| R-1 | Concurrent double-submit records two reviews | med | high | `UNIQUE(booking_id)` + `INSERT … ON CONFLICT DO NOTHING` claim; typed `AlreadyReviewed` outcome; `ReviewUniquenessIT` real-concurrency test | impl | open |
| R-2 | Lost/duplicated `ReviewsChanged` delivery skews the aggregate | med | med | Event Publication Registry (at-least-once, AFTER_COMMIT) + **full recompute** (idempotent, order-independent — the payout-listener discipline); converges because each submit's own listener runs after its commit | impl | open |
| R-3 | Rounding drift / float sneaking into the mean | low | med | integer half-up formula written down above; `AggregateRatingTest` edge cases; no `double` anywhere in the math | impl | open |
| R-4 | Seed reset breaks ITs/e2e asserting 48/326 or Miramar-first order | high | low | grill found the assertion sites (`VenueListControllerIT`, `VenueReadControllerIT`; FE e2e fixtures are mocks and stay); updated in the same phase as V45 | impl | open |
| R-5 | New public POST misses an edge wire (SecurityConfig permitAll, CSRF ignore, per-code rate-limit template, `DECLARED_REACHABLE`, `WebSliceStubs`) | med | med | `EndpointRoleGateCoverageTest` enumerates every mapped endpoint (fails loud); Phase 3 checklist lists all five sites; review overlay RV-BE checks | impl | open |
| R-6 | Module cycle (`venue → review → booking → venue`) | low | high | leaf posture per epic addendum: `review` depends only on `shared`; `ApplicationModules.verify()` is the gate | impl | open |
| R-7 | Flyway V45 collision with in-flight work | low | med | verified free on `main` + all 20 open PRs are Dependabot (2026-08-29); if a collision appears, this branch renumbers (merges second) | impl | open |
| R-8 | Booking code leaks via the new module (invariant #7) | med | high | code never logged, never in ProblemDetail (`instance` overridden to constant URI — copy `BookingController.error(...)`); per-code rate-limit joins the shared "guesses at the same secret" budget | impl | open |
| R-9 | Real-backend loop infeasible (check-in is service-date-only; sales close blocks same-day booking) | med | low | `StubPaymentGateway` (`@Profile("!stripe")`) confirms synchronously — verified; the spec sets the venue's sales close to 23:59 and books **today** so check-in is legal; fallback: the backend `ReviewSubmitFlowIT` already proves the true loop server-side, and the e2e AC is renegotiated with the maintainer | impl | open |
| R-10 | Star control fails the a11y/touch-target/focus gates | med | med | follow `segmented-control.ts` verbatim (roving tabindex, keydown per radio); `appTouchTarget` on each of the 5 radios (TT-1); `[appBusy]` on submit (BUSY-1 — `submitting` is a guarded stem); filled-vs-outline glyphs so state is never color-only | impl | open |
| R-11 | `venue.rating_tenths` gains a second writer unnoticed (no machine rule guards the venue table the way `ResponsibilitiesArchitectureTests` guards `set_availability`) | low | med | review-checked boundary: `review` has no SQL touching `venue`; called out for RV-BE; RESPONSIBILITIES §venue gains the "I store the aggregate; `review` computes it" line | impl | open |

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
- **Assumption A-4:** the FE submit leg is signal-state + `POST` (the
  `confirmCancel`/`confirmWithdraw` pattern), **not** a Signal Form — the "form" is one
  custom radiogroup + a button, no text entry; deviation from the "prefer Signal Forms"
  default recorded here deliberately (matches house `segmented-control` consumers).
  *Owner:* plan · *Resolves by:* phase 4.
- **Open question O-1:** does the mocked touch-target sweep already visit `/booking/:code`
  (then the 5 radios are swept for free), or does the surface need adding to
  `touch-targets*.e2e.ts`? — *Owner:* impl · *Resolves by:* phase 4 (read the sweep's
  surface list; add the entry if absent).
- **Open question O-2:** FE e2e fixtures (~45) that set `ratingTenths: 48, reviewsCount: 326`
  are mocked wire values and stay valid; confirm none asserts "Miramar seeded" semantics.
  — *Owner:* impl · *Resolves by:* phase 4 grep.

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
| NI-3 | `review.spi` | `CompletedStays#byCode(String): Optional<CompletedStay>` — empty unless the booking exists **and** is `COMPLETED` | `CompletedStay(BookingRef booking, VenueRef venue, Instant completedAt)`, `BookingRef` | **implemented by `booking`** (`JdbcCompletedStays`, own SQL — `findByCode` untouched) |

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
| FE-1 | `shared/star-rating.ts` (+ `.spec.ts`) | new | standalone component (presentational primitive — `shared/` per `riviera-frontend`; no HTTP, no app state) | `model.required<number \| null>()` two-way value; `input.required<string>()` aria-label | none (custom radiogroup control) |
| FE-2 | `booking/booking-view.ts` | modified | review panel `@if (b.reviewable)` + result region (house `role="status"` outside-the-switch pattern); per-booking signal reset in the `paramMap` subscription | signals; `submitting` flag with `[appBusy]` | signal-state + POST (A-4 deviation) |
| FE-3 | `booking/booking.service.ts` | modified | `review(code, stars)` → `POST /api/bookings/{code}/review` beside `cancel`/`withdraw`; success → `load(true)` re-read | rxjs `.subscribe({next, error})` + `problemCodeOf` | — |
| FE-4 | `booking/booking.model.ts` | modified | `BookingDetail` gains `reviewable: boolean` | — | — |

**Star control contract** (verified against W3C APG "Rating Radio Group" + house
`segmented-control.ts`; Angular Aria has no radio-group primitive — angular-cli MCP
`search_documentation`, v22): `role="radiogroup"` host with required accessible name; five
`<button type="button" role="radio" appTouchTarget>` children, `aria-checked`, per-star
labels "1 star" … "5 stars"; **roving tabindex** (checked radio is the tab stop; none
checked → first radio); arrows move selection *and* focus with wrap, Home/End to extremes;
`(keydown)` bound **per radio, never the group div** (a11y-lint `interactive-supports-focus`);
selection ends with `.focus()`. Selected state is filled `★` vs outline `☆` (never
color-only); glyph spans `aria-hidden="true"`. Styling: token-first Tailwind v4, house
focus recipe `focus-visible:outline-[3px] focus-visible:outline-offset-2
focus-visible:outline-riv-accent-ink`, `text-[…px]` sizes, `motion-reduce:` guard —
state classes bound from the model signal (no `peer-checked` needed; Tailwind v4 docs
confirm the variants exist if the shape ever changes to native inputs).

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`/`model()` signal
APIs; OnPush default (v22 — not set explicitly); deviation A-4 (no Signal Form) documented.

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

**Stage pointer:** `plan` — **plan complete, committed for maintainer review; implementation
not started** (session instruction: stop after the plan).

**Next action:** on pick-up — re-run the Skill-routing gate for phase 0 (re-load
`postgres`, `riviera-modulith`, `riviera-java-conventions`), load `riviera-local-debug`
before the first `./gradlew`, open the draft PR at the first phase commit, then execute
Phase 0.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V45 migration + `review` module skeleton + structural tests | | |
| 1 — submit path: domain, service, JDBC adapter, spi + booking's `JdbcCompletedStays` | | |
| 2 — `ReviewsChanged` → venue listener → recompute + seed-supersede IT updates | | |
| 3 — edge: `ReviewController`, `reviewable` on the view, SecurityConfig/RateLimit/coverage | | |
| 4 — FE: `star-rating`, booking-view panel, service/model, unit+axe+contrast, mocked e2e | | |
| 5 — real-backend e2e loop + docs (CLAUDE/RESPONSIBILITIES/CONTEXT/ADR-0015/counting sweep) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/reviews-s1-star-rating.md` — this plan
- `docs/adr/0015-review-leaf-module.md` — ADR: leaf `review` module, spi inversion, event + own-write aggregation (A-1)
- `CLAUDE.md` — bounded-context table row `review`; "Five published events" → six; module count prose
- `RESPONSIBILITIES.md` — new §`review`; §venue Job/Not-My-Job aggregate lines; §booking Not-My-Job review line + `CompletedStays` mention; header module list; machine-vs-review-checked classification
- `CONTEXT.md` — Review, Review window, Aggregate rating
- `.claude/skills/riviera-modulith/SKILL.md` — "eight bounded-context modules" → nine (both sites)
- `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` — "Later" line annotated (epic #810 executes it)
- `platform/src/main/resources/db/migration/V45__review.sql` — table + Miramar reset
- `platform/src/main/java/ai/riviera/platform/review/**` — `package-info.java`, `api/{VenueRatingSummary,ReviewEligibility,package-info}.java`, `spi/{CompletedStays,package-info}.java`, `vocabulary/{VenueRef,BookingRef,RatingSummary,ReviewState,CompletedStay,SubmitOutcome,package-info}.java`, `events/{ReviewsChanged,package-info}.java`, `application/{SubmitReview,SubmitReviewService,ReviewEligibilityService,Reviews}.java`, `domain/{ReviewWindow,AggregateRating}.java`, `adapter/in/ReviewController.java`, `adapter/out/JdbcReviews.java`
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — grants `+ review::api/spi/vocabulary`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcCompletedStays.java` — implements NI-3
- `platform/src/main/java/ai/riviera/platform/booking/application/view/{ViewBookingService,BookingDetail}.java` — `reviewable`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — wire field
- `platform/src/main/java/ai/riviera/platform/venue/package-info.java` — grants `+ review::api/events/vocabulary`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/ReviewsChangedListener.java` — first venue listener
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueRatingService.java` + `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` (or a dedicated `JdbcVenueRatings.java`) — the one venue-side write
- `platform/src/main/java/ai/riviera/platform/{SecurityConfig,RateLimitFilter}.java` — edge wiring
- `platform/src/test/java/ai/riviera/platform/ModularityTests.java` — javadoc count
- `platform/src/test/java/ai/riviera/platform/{EndpointRoleGateCoverageTest,WebSliceStubs}.java` — declaration + stubs
- `platform/src/test/java/ai/riviera/platform/review/**` — `SubmitReviewServiceTest`, `ReviewWindowTest`, `AggregateRatingTest`, `ReviewUniquenessIT`, `ReviewSubmitFlowIT`, `ReviewMigrationIT`, `ReviewControllerTest`
- `platform/src/test/java/ai/riviera/platform/venue/**` — `VenueRatingRecomputeIT`; updated `VenueReadControllerIT`, `VenueListControllerIT`
- `platform/src/test/java/ai/riviera/platform/booking/**` — `ViewBookingServiceTest` update, `JdbcCompletedStaysIT`
- `frontend/src/app/shared/star-rating.ts` + `frontend/src/app/shared/star-rating.spec.ts` — control + keyboard/axe spec
- `frontend/src/app/booking/{booking-view.ts,booking-view.spec.ts,booking.service.ts,booking.service.spec.ts,booking.model.ts}` — panel, flag, POST
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — star glyph/status colors over the card stops (if a new color pairing is introduced)
- `frontend/e2e/review-a-stay.e2e.ts` — mocked journey (AC-9)
- `frontend/e2e/touch-targets*.e2e.ts` — surface entry if `/booking/:code` absent (O-1)
- `frontend/e2e/real-backend/reviews.e2e.ts` (+ any new `frontend/e2e/real-backend/support/*.ts` helper) — AC-10

---

## Phase 0 — V45 migration + `review` module skeleton

**Files:** Create `V45__review.sql`, `review/package-info.java`, `review/vocabulary/*`,
`review/events/ReviewsChanged.java` (+ package-infos) · Modify `ModularityTests` javadoc ·
Test `ReviewMigrationIT`

- [ ] **Step 1: Write the failing migration IT** (Testcontainers; skips cleanly without Docker)

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

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ReviewMigrationIT*"` → FAIL (`relation "review" does not exist`)
- [ ] **Step 3: Minimal implementation** — `V45__review.sql` (house prose header naming
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
- [ ] **Step 4: Run** — `./gradlew test --tests "*ReviewMigrationIT*" --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS
- [ ] **Step 5: Generalization audit** — population "everything that asserts the seeded
  48/326 or Miramar-first ordering": `grep -rn "48\b.*326\|rating_tenths" platform/src/test frontend/e2e frontend/src --include="*.java" --include="*.ts" -l` → fix list feeds Phase 2/4; log below.
- [ ] **Step 6: Commit** — `git commit -m "Add review module skeleton + V45 review table, supersede demo rating seed (#811)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 1 — submit path (domain + application + adapters)

**Files:** Create `domain/ReviewWindow.java`, `domain/AggregateRating.java`,
`application/{SubmitReview,SubmitReviewService,Reviews}.java`, `spi/CompletedStays.java`,
`adapter/out/JdbcReviews.java`, `booking/adapter/out/JdbcCompletedStays.java` · Modify
`booking/package-info.java` · Tests `SubmitReviewServiceTest`, `ReviewWindowTest`,
`AggregateRatingTest`, `ReviewUniquenessIT`, `JdbcCompletedStaysIT`, `ReviewSubmitFlowIT`

- [ ] **Step 1: Failing service test** (fake `CompletedStays` + fake `Reviews`; frozen `Clock`)

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

- [ ] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*SubmitReviewServiceTest*"`
- [ ] **Step 3: Implementation.** `SubmitReviewService` (package-private `@Service`,
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
- [ ] **Step 4: Run/verify PASS** — service + window + `ReviewUniquenessIT` (two threads,
  `ExecutorService` try-with-resources, exactly one row + one `AlreadyReviewed`) +
  `ReviewSubmitFlowIT` (`@ApplicationModuleTest` with `PublishedEvents`); then broaden to
  the `review` package.
- [ ] **Step 5: Generalization audit** — population "spi ports `booking` implements":
  `grep -rln "implements .*\.spi\." platform/src/main` → confirm `JdbcCompletedStays`
  matches the `JdbcGuestBookingHistory` shape (package-private, empty-guard, no logging of
  the code).
- [ ] **Step 6: Commit** — `git commit -m "Review submit path: eligibility via booking-implemented CompletedStays, one review per booking (#811)"`
- [ ] **Step 7: Update execution status.**

## Phase 2 — aggregate recompute (`ReviewsChanged` → venue)

**Files:** Create `venue/adapter/in/ReviewsChangedListener.java`,
`venue/application/VenueRatingService.java`, `review/api/VenueRatingSummary.java` (+ its
`JdbcReviews` query + `AggregateRating` math) · Modify `venue/package-info.java`, venue's
JDBC adapter (rating UPDATE), `VenueReadControllerIT`, `VenueListControllerIT` · Tests
`AggregateRatingTest`, `VenueRatingRecomputeIT`

- [ ] **Step 1: Failing math + recompute tests**

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
- [ ] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*AggregateRatingTest*" --tests "*VenueRatingRecomputeIT*"`
- [ ] **Step 3: Implementation.** `AggregateRating.tenths(sumStars, count)` =
  `count == 0 ? 0 : (10 * sumStars + count / 2) / count` (all `int`/`long`, documented
  half-up). `JdbcReviews` gains `SELECT COUNT(*), COALESCE(SUM(stars), 0) FROM review
  WHERE venue_id = :venue` behind `VenueRatingSummary`. `ReviewsChangedListener`
  (package-private `@Component`, single `@ApplicationModuleListener void on(ReviewsChanged
  event)`, DB-only → shared pool, javadoc mirroring the payout listener's
  at-least-once/idempotence paragraph) → `VenueRatingService.recompute(VenueRef)`
  (`@Transactional`): query NI-1, `UPDATE venue SET rating_tenths = :tenths, reviews_count
  = :count WHERE id = :id` via venue's own adapter. Update the two ITs' 48/326 + ordering
  expectations (Phase 0 audit list).
- [ ] **Step 4: Run/verify PASS** — the two new tests + `--tests "*Venue*ControllerIT*"` +
  the structural net.
- [ ] **Step 5: Generalization audit** — population "every `@ApplicationModuleListener`":
  `grep -rln "@ApplicationModuleListener" platform/src/main` → confirm the new listener is
  the only one re-computing venue state and carries the idempotence contract.
- [ ] **Step 6: Commit** — `git commit -m "Venue recomputes rating from ReviewsChanged via review's aggregate port (#811)"`
- [ ] **Step 7: Update execution status.**

## Phase 3 — edge: controller, view flag, security wiring

**Files:** Create `review/adapter/in/ReviewController.java`,
`review/api/ReviewEligibility.java`, `review/application/ReviewEligibilityService.java` ·
Modify `SecurityConfig`, `RateLimitFilter`, `application.properties` (if the template list
is property-driven), `EndpointRoleGateCoverageTest`, `WebSliceStubs`,
`ViewBookingService`, `BookingDetail`, `BookingDetailView`, `booking/package-info.java` ·
Tests `ReviewControllerTest` (web slice), `ViewBookingServiceTest`

- [ ] **Step 1: Failing tests.** `ReviewControllerTest`: `POST /api/bookings/{code}/review`
  `{"stars":4}` → 201; each `SubmitOutcome` → its ProblemDetail code (FE↔BE table above);
  `stars: 0|6|missing` → 400 `INVALID_REQUEST`; response `instance` is the constant
  `/api/bookings` (code never echoed). `ViewBookingServiceTest.reviewableFollowsReviewEligibility`:
  `ELIGIBLE` → `true`, every other state → `false`.
- [ ] **Step 2: Run/verify FAIL** — `./gradlew test --tests "*ReviewControllerTest*" --tests "*ViewBookingServiceTest*"`
- [ ] **Step 3: Implementation.** Controller: package-private `@RestController`, exhaustive
  `switch` over the sealed `SubmitOutcome` → `ApiProblem` rejects; request record with
  compact-constructor 1–5 validation throwing `InvalidApiRequestException` (§6b).
  `ReviewEligibilityService` implements NI-2 (consults `CompletedStays` + `Reviews`,
  applies `ReviewWindow`). `ViewBookingService` maps NI-2 to `reviewable`. Edge: permitAll
  + CSRF ignore + `REVIEW_TEMPLATE` in the shared per-code budget + `DECLARED_REACHABLE`
  entry ("public by design: the code is the credential, invariant #7") + `WebSliceStubs`
  beans for `SubmitReview`/`ReviewEligibility`.
- [ ] **Step 4: Run/verify PASS** — the two test classes + `--tests "*EndpointRoleGateCoverageTest*"` + structural net; end-of-phase: `review` + `booking` packages.
- [ ] **Step 5: Generalization audit** — population "every code-keyed endpoint":
  `grep -rn "bookings/\*" platform/src/main/java/ai/riviera/platform/SecurityConfig.java platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` → confirm all four legs (view/cancel/withdraw/review) share the per-code budget and CSRF posture.
- [ ] **Step 6: Commit** — `git commit -m "Code-gated review submit endpoint + server-owned reviewable flag (#811)"`
- [ ] **Step 7: Update execution status.**

## Phase 4 — frontend: star input, panel, mocked e2e

**Files:** Create `shared/star-rating.ts` + `.spec.ts`, `e2e/review-a-stay.e2e.ts` ·
Modify `booking/booking-view.ts` + `.spec.ts` (+ `.contrast.spec.ts` if a new color pairing
lands), `booking/booking.service.ts` + `.spec.ts`, `booking/booking.model.ts`,
touch-target sweep entry (O-1)

- [ ] **Step 1: Failing specs.** `star-rating.spec.ts`: renders 5 `role="radio"` in a
  labelled `role="radiogroup"`; roving tabindex (none selected → first radio `tabIndex=0`);
  `ArrowRight` from 3 selects+focuses 4 (wraps 5→1); `Home`/`End`; click selects and
  focuses; filled-vs-outline glyph classes; `expectNoAxeViolations(host)`.
  `booking-view.spec.ts`: `reviewable:true` detail → panel visible; submit 4 → service
  called with `(CODE, 4)`, re-read with `reviewable:false` → panel gone, result region
  announces; `reviewable:false` → no panel (status never consulted); axe run on the
  reviewable state.
- [ ] **Step 2: Run/verify FAIL** — `npm test -- star-rating booking-view` (scoped)
- [ ] **Step 3: Implementation** per the FE-1/FE-2 contract above (segmented-control as the
  copy source; `[appBusy]` submit button with the house BTN recipe; result region cloned
  from the outside-the-switch `role="status"` block; per-booking signal reset added to the
  `paramMap` subscription; `getByCode`-prefetch note: success path calls `load(true)`).
- [ ] **Step 4: Run/verify PASS** — scoped Vitest, then `npm run lint`,
  `npm run format:check`, `npm run test:a11y`; guards:
  `node scripts/check-touch-target.mjs --files …`, `node scripts/check-focus-posture.mjs --files …`.
  Mocked e2e: `review-a-stay.e2e.ts` (route intercepts shaped on `request-to-book.e2e.ts`:
  detail GET → COMPLETED/reviewable, `POST …/review` asserting `{stars:4}` → 201,
  re-served detail `reviewable:false`, venue/list payloads with moved `ratingTenths` —
  covers AC-9's "see the score move" + the New→first-review display transition;
  `expectNoSeriousAxeViolations` after `settle`), run via `npm run test:e2e:a11y`.
- [ ] **Step 5: Generalization audit** — population "surfaces the touch-target sweep
  visits": read `e2e/support/touch-targets.ts` surface list → add `/booking/:code` if
  absent (O-1); population "fixtures asserting seed semantics" (O-2 grep).
- [ ] **Step 6: Commit** — `git commit -m "Star rating input on the code-gated page, submit-and-see-score journey (#811)"`
- [ ] **Step 7: Update execution status.**

## Phase 5 — real-backend loop + docs close-out

**Files:** Create `e2e/real-backend/reviews.e2e.ts`, `docs/adr/0015-review-leaf-module.md` ·
Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, `CONTEXT.md`,
`.claude/skills/riviera-modulith/SKILL.md`, `ModularityTests` javadoc, spec "Later" line

- [ ] **Step 1: Real-backend spec** (local-only; existing operator helpers): create venue +
  set (sales close **23:59** so booking *today* is legal), tourist instant-books today via
  the FE (StubPaymentGateway confirms synchronously — no Stripe), capture the code from the
  confirmation, operator daily-view check-in, open `/booking/{code}`, rate 5, assert the
  venue map header reads `5.0 · 1 review`. Run `npm run test:e2e` locally; document the
  run result honestly in the PR if the cloud sandbox cannot run it (riviera-local-debug).
- [ ] **Step 2: Docs.** CLAUDE.md: `review` row (Owns: the review record, eligibility +
  60-day window, aggregate math; Root: `Review`), six-events sentence
  (`ReviewsChanged` → `venue`), Modulith module list. RESPONSIBILITIES.md: §`review`
  (Job / Not-My-Job — "writing `venue` columns → `venue`"; "deciding check-in → `booking`"),
  §venue + §booking line edits (§4a table wording), header list, machine-vs-review-checked
  note for R-11. CONTEXT.md: the three epic-defined terms. ADR-0015 (A-1). Counting-sweep
  sites: `riviera-modulith` SKILL.md ×2, `ModularityTests` javadoc. Spec "Later" line
  annotated. Then run `riviera-docs-freshness` over the branch range and act on findings.
- [ ] **Step 3: Full local verification** — scoped per `riviera-local-debug`; CI owns the
  full suite. `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged first). Merge latest `origin/main` with phase discipline; mark PR ready for
  review → Review gate (`/code-review` + `riviera-review-overlay`) → Sonar gate → merge
  close-out per `references/pr-gates.md`.
- [ ] **Step 4: Commit** — `git commit -m "Reviews docs close-out: ninth module recorded, ADR-0015, real-backend loop (#811)"`
- [ ] **Step 5: Update execution status → finalize before merge (merged via PR #NN).**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..7:** `./gradlew test --tests "*Review*" --tests "*VenueRating*" --tests "*ViewBookingServiceTest*" --tests "*Venue*ControllerIT*"` → all green. Verified at commit `<sha>`.
- [ ] **AC-8:** `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*EndpointRoleGateCoverageTest*"` → green.
- [ ] **AC-9:** `npm test`, `npm run test:a11y`, `npm run test:e2e:a11y` → green.
- [ ] **AC-10:** `npm run test:e2e` (local, Docker + backend up) → green, or the honest
  fallback recorded per R-9.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A; the slice's own concurrency test present (`ReviewUniquenessIT`).
- [ ] Pool + cutoff rules untouched (invariants #3, #4 — no reservation-path change).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `ReviewsChanged` payload id-based (invariant #11).
- [ ] **Payment/payout** N/A holds — no Stripe/ledger surface in the diff.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: `completed_at`/`created_at` are UTC `Instant`s; the 60-day window is pure `Duration` arithmetic (invariant #6).
- [ ] Booking codes never logged / never in error bodies (invariant #7 — R-8).
- [ ] Flyway V45 present; constraints tested by `ReviewMigrationIT` (invariant #12).
- [ ] **Frontend** standards met; deviation A-4 documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality (stage pointer, phase table, findings register).
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`; docs-freshness ran).
- [ ] **The review gate ran in full** — invocation ladder per `references/pr-gates.md` §1 + `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
