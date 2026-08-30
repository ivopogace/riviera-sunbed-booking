# Reviews slice 2 — comment, display name, own-review lifecycle + messaging

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A checked-in guest can submit a review with an optional bounded comment and an
editable display name, see / edit / delete their own review within the 60-day window, and
every non-eligible booking page says *why* there is no form — all fences server-enforced.

**Architecture:** The `review` module stays a leaf (ADR-0015): the lifecycle (edit,
delete) lives beside submit behind `review`'s own store port, every write publishes the
same ids-only `ReviewsChanged` (the `venue` recompute is a full idempotent recompute, so
no listener changes). The code-gated read stops collapsing `ReviewState` to a boolean:
`review.api.ReviewEligibility` grows a `panelFor(code)` returning state + the guest's own
review + the window deadline, and `booking` (owner of the view contract) carries it on
`BookingDetailView` together with a display-name suggestion it derives itself via
`customer.api.CustomerLookup` — `review` never learns the guest's identity.

**Persistence:** JDBC only (invariant #1). One forward migration **V46** adds
`comment`, `display_name`, `updated_at` to `review` with `char_length` CHECKs
(invariant #12). V45 is the highest version on `main`; no open PR claims V46
(all open PRs are Dependabot bumps — checked 2026-08-30).

**Source of intent:** issue #812 · epic #810 (user stories 2, 3, 5, 7, 8, 9, 10) + the
epic's wiring addendum comment (2026-08-29) · slice-1 plan `docs/plans/reviews-s1-star-rating.md`

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
"booking contact's first name" exists nowhere: the only stored name is
`customer.full_name`, and the code-gated view exposes no contact PII; also confirmed V46
free and no in-flight overlap) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger for the panel-gating change and the PII/erasure risk row) · `tdd`
(each phase red-green on the named test class) · `riviera-review-overlay` (review gate —
runs at ready-for-review) · `riviera-docs-freshness` (N/A at plan time — due at close-out
over this slice's merge range; §review "Shipped" ¶ and §booking's `reviewable` ¶ are known
stale-on-merge) · `riviera-modulith` (kept `review` a leaf: the name suggestion moved to
`booking`+`customer` instead of widening `CompletedStays`; api-widening per the #94
role-split rule) · `riviera-java-conventions` (edge validation via compact-ctor
`InvalidApiRequestException`, typed sealed outcomes for edit/delete, §6b error contract,
code-point bounds per `VenueFieldValidation` precedent) · `postgres` (nullable TEXT +
`char_length` CHECKs over enum/varchar; no new index needed — all reads hit
`review_once_per_booking` or `review_venue_id_idx`) · `riviera-frontend` (panel extracted
to `booking/review-panel.ts` — feature folder, no new cross-feature edge; star control
stays in `shared/`) · `angular-developer` + angular-cli MCP (v22 best practices;
angular.dev Signal Forms: `maxLength()` schema validator, `[formField]` on `<textarea>`,
programmatic `value.set()` for edit-prefill) · `riviera-tailwind` (textarea reuses the
field recipe + `resize-y`; **rejected `field-sizing-content`** — Safari support caveat per
tailwindcss.com/docs/field-sizing; new banner/error surfaces get contrast-spec rows) ·
`playwright-cli` (mocked-suite journeys authored to the stateful `page.route` flip
pattern the slice-1 spec established)

**Branch:** `claude/sdlc-812-plan-review-k93ud6` — the session's designated remote branch
stands in for `feature/reviews-s2-comment-lifecycle` (cloud-session substitution per
`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

> Written at the application boundary — the inner hexagon — in domain terms; adapter-level
> assertions live in the controller/e2e tests that mirror them.

- [ ] **AC-1:** Given a COMPLETED stay inside its window, when the guest submits stars 4,
  comment "Great sunbeds", display name "Ana", then the review is recorded with all three
  fields and `ReviewsChanged` is published. *Pinned by:*
  `SubmitReviewServiceTest.recordsCommentAndDisplayNameAndPublishes`,
  `ReviewSubmitFlowIT.recordsACommentedReview`
- [ ] **AC-2:** Given a comment of 1001 code points (or a display name over 60), when the
  request reaches the edge, then it is refused `400 INVALID_REQUEST` — never truncated —
  and the DB CHECK backstops it. *Pinned by:*
  `ReviewControllerTest.commentOverTheBoundIsRefusedNotTruncated`,
  `ReviewMigrationIT.commentAndDisplayNameCarryLengthChecks`
- [ ] **AC-3:** Given a stay already reviewed inside its window, when the panel state is
  read, then it is `ALREADY_REVIEWED` with the stored stars/comment/display name and the
  window deadline. *Pinned by:* `ReviewEligibilityServiceTest.panelCarriesTheOwnReview`
- [ ] **AC-4:** Given an existing review inside the window, when the guest edits stars
  2→5, then the review is updated (`updated_at` set) and `ReviewsChanged` republished;
  after the window the edit is refused with `WindowClosed`. *Pinned by:*
  `EditReviewServiceTest.updatesAndRepublishes`,
  `EditReviewServiceTest.refusesAfterTheWindow`, `ReviewLifecycleFlowIT`
- [ ] **AC-5:** Given the venue's only review, when the guest deletes it inside the
  window, then `ReviewsChanged` republishes and the venue recomputes to `0/0` ("New").
  *Pinned by:* `DeleteReviewServiceTest.deletesAndRepublishes`,
  `VenueRatingRecomputeIT.aDeletedSoleReviewReturnsTheVenueToNew`
- [ ] **AC-6:** Given any non-eligible stay, when the code-gated view is read, then it
  carries the distinct `ReviewState` (NOT_COMPLETED / WINDOW_CLOSED / ALREADY_REVIEWED)
  instead of a bare boolean, and a frozen review is still readable. *Pinned by:*
  `ViewBookingServiceTest.reviewPanelStateFollowsReviewEligibility`
- [ ] **AC-7:** Given a booking whose contact is "Ana Kelmendi", when the code-gated view
  is read while the stay is reviewable, then the display-name suggestion is "Ana" (first
  whitespace token); absent contact → `null` suggestion. *Pinned by:*
  `ViewBookingServiceTest.suggestsTheContactFirstNameForTheReviewForm`
- [ ] **AC-8:** Given the mocked e2e environment, when a guest submits with a comment,
  edits, deletes, and visits frozen/ineligible bookings, then each journey passes with the
  a11y checks; a signed-in customer reaches the form from My Bookings without the code
  email. *Pinned by:* `frontend/e2e/review-a-stay.e2e.ts` (extended),
  `frontend/e2e/review-lifecycle.e2e.ts`, `frontend/e2e/my-bookings.e2e.ts` (extended)

## Non-goals

- The venue-page review **list** (epic stories 13/14) — a later slice of #810.
- Moderation (hide/un-hide, admin audit) and the **erasure hook** for review PII —
  later slices of #810; the obligation created here is tracked in R-4.
- Review nudge emails; operator replies; half-stars; a live character counter (the
  bound is enforced, not narrated).
- Any change to the My Bookings row markup — the existing row link *is* the entry
  (AC-8 pins the journey, not new UI).
- Widening `MyBookingSummary` with review state (the detail page owns the panel).

## Behavior-parity ledger

> The slice replaces slice 1's panel gating and the `reviewable` wire flag.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Panel renders iff `BookingDetail.reviewable` (server truth, never `status`) | preserved | Renders form iff `reviewState === 'ELIGIBLE'` — still server truth; the boolean is replaced by the state token, same decider (`review.api`) |
| `reviewable: false` → total silence | **changed (the point of the slice)** | Distinct state renders own-review / frozen / not-yet messaging (issue AC 4) |
| Post-submit re-read (`load(true)`) keeps success line while panel unmounts | preserved | Same `review-result` live region outside the panel; edit/delete reuse the same re-read |
| Rejection copy per problem `code` (`reviewRejectionCopy`) | preserved + extended | Same switch, new codes (`NO_SUCH_REVIEW`) added |
| `required` stars message funnelled into `review-result` | changed | Per-field errors adopt the `submitAttempted()` idiom (booking-dialog precedent) for comment/name; stars keep the funnel (the control has no inline slot) |
| e2e fixtures set `reviewable: true/false` | changed | Fixtures set `reviewState` (+ `ownReview`/`reviewWindowClosesAt`/`reviewNameSuggestion`); same-origin deploy, no external consumers |
| `ViewBookingServiceTest.reviewableIsFalseForEveryStateButEligible` | changed | Becomes the pass-through pin `reviewPanelStateFollowsReviewEligibility` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Flyway V46 collision with in-flight work | low | high | Checked: V45 is highest on `main`; open PRs are Dependabot-only. If a collision appears, this branch renumbers (merges second) | agent | open |
| R-2 | Fence-order drift between submit / edit / delete / panel-read (rated+frozen must read WINDOW_CLOSED everywhere) | med | med | One shared package-private fence helper in `review/application`; `ReviewLifecycleFlowIT` pins agreement across all four | agent | open |
| R-3 | Edit/delete forget to republish `ReviewsChanged` → stale aggregate | med | high | Service tests assert the publish; `VenueRatingRecomputeIT` extension proves delete-to-"New"; recompute is already idempotent (full recompute, never increment) | agent | open |
| R-4 | `display_name`/`comment` are the **first PII in the `review` table** — erasure (ADR-0010) has no hook yet | high | med | Deliberate epic sequencing (story 25 is a later slice). Record the obligation: close-out files a follow-up issue referencing epic #810 story 25 before this slice merges | agent | open |
| R-5 | Client `maxLength` counts UTF-16 units, server counts code points (emoji differ) | low | low | Client is strictly tighter (a surrogate pair counts 2); the server bound + DB CHECK are the contract (AC-2); no truncation anywhere | agent | open |
| R-6 | Invariant #7 — booking code in new error bodies/logs | low | high | All errors via `ApiProblem` with `instance` pinned to `/api/bookings`; `ReviewControllerTest.theBookingCodeNeverAppearsInAnErrorBody` extended to PUT/DELETE | agent | open |
| R-7 | New PUT/DELETE routes bypass the per-code rate-limit budget or CSRF/permitAll wiring | med | med | Same `RateLimitFilter.REVIEW_TEMPLATE` bucket; `SecurityConfig` permitAll + CSRF-ignore rows; `EndpointRoleGateCoverageTest.DECLARED_REACHABLE` gains both routes (the inline endpoint count comment updates — the F-3 lesson) | agent | open |
| R-8 | Error-contract drift on new 4xx paths (§6b) | low | med | Compact-ctor `InvalidApiRequestException` for 400s; typed-outcome switch + `ApiProblem` for 404/409; no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests` enforces) | agent | open |
| R-9 | `ResponsibilitiesArchitectureTests` — new review SQL outside `review/adapter/out` | low | med | All new SQL lands in `JdbcReviews`; `booking` touches only its own view + `CustomerLookup` | agent | open |

## Open questions / Assumptions

- **Assumption A-1:** "Booking contact's first name" (issue wording) = the **first
  whitespace-separated token of `GuestContact.fullName`** — no first-name field exists
  anywhere. ← confirm — *Owner:* maintainer · *Resolves by:* plan review
- **Assumption A-2:** Display name is **required (non-blank, ≤60 code points) on every
  slice-2 submit/edit**; the column stays nullable for slice-1 star-only rows. Prefill
  makes this invisible in the happy path, and it guarantees every commented review is
  attributable (epic stories 3/14). ← confirm — *Owner:* maintainer · *Resolves by:* plan review
- **Assumption A-3:** The NOT_COMPLETED "you can rate once you're checked in" note renders
  **only for status `CONFIRMED`** (an upcoming/active stay); terminal statuses (CANCELLED,
  NO_SHOW, …) show no review section — inviting a review there would be noise. Frozen and
  already-reviewed messaging render regardless of how the stay ended. ← confirm —
  *Owner:* maintainer · *Resolves by:* plan review
- **Assumption A-4:** Replacing `reviewable: boolean` with `reviewState` on the wire is
  safe — same-origin single deploy, no external API consumers. — *Owner:* agent ·
  *Resolves by:* phase 3
- **Assumption A-5:** PUT with no existing review (or DELETE likewise) → `404
  NO_SUCH_REVIEW`; window-closed edit/delete → `409 REVIEW_WINDOW_CLOSED` (reusing the
  existing code). — *Owner:* agent · *Resolves by:* phase 2

## Availability & concurrency (invariant #2)

The slice touches `booking` (read contract only) but **writes nothing to
`availability(set_id, booking_date)`** — no reserve, release, or staff-mark path is in
scope, so invariant #2's table is untouched. The slice's own concurrency surface is the
`review` table:

- **Write paths:** `JdbcReviews.claim` (INSERT … ON CONFLICT DO NOTHING, slice 1),
  plus new `update`/`delete` — all keyed on `booking_id`.
- **Uniqueness guarantee:** `review_once_per_booking UNIQUE (booking_id)` (V45) —
  unchanged; edit/delete target the existing row by `booking_id`, so a concurrent
  edit+delete resolves by row-level last-writer semantics (one returns `false` and maps
  to `NO_SUCH_REVIEW`), never a duplicate.
- **Pinning test:** `ReviewUniquenessIT.concurrentDoubleSubmitRecordsOne` (existing) —
  extended with `aDeleteRacingAnEditLeavesAtMostOneRow`.
- Pool (#3) and cutoff (#4) rules: not in scope — no booking creation path touched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `review` | existing | `Review` (record grows: comment, displayName, updatedAt) | Owns the review record + window/edit/delete policy (RESPONSIBILITIES §review Job line) |
| M-2 | `booking` | existing | `Booking` | Owns the code-gated view contract; carries panel state it does not decide (§booking: "mine to carry, not to decide") |
| M-3 | root/edge | — | — | `SecurityConfig` + `RateLimitFilter` rows for PUT/DELETE (edge wiring lives at the root, RV-BE-11) |

`venue` is deliberately **untouched**: its `ReviewsChanged` listener already does a full
locked recompute, and `AggregateRating.tenths` already short-circuits `count == 0` → `0`
→ "New". `customer` is untouched (its `CustomerLookup` port is merely consumed).

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `review.api` | `ReviewEligibility#panelFor(String code)` — **evolves** `stateFor` (same consumer role, #94-legitimate) | `ReviewPanel(ReviewState state, Instant windowClosesAt, OwnReview review)` — `windowClosesAt`/`review` nullable; `OwnReview(int stars, String comment, String displayName)` new in `review.vocabulary` | `booking` |
| NI-2 | `review.api` | `VenueRatingSummary` | unchanged | `venue` |
| NI-3 | `review.spi` | `CompletedStays` | **unchanged** — the name suggestion deliberately does NOT widen this port; `review` never learns guest identity (leaf posture, ADR-0015) | implemented by `booking` |
| NI-4 | `customer.api` | `CustomerLookup#findById` | `GuestContact` | `booking` (existing grant — `PendingRequestsService` precedent) |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `ReviewsChanged` | `review` — now from **submit, edit, and delete** | `{ venueRef }` | `venue` | async `AFTER_COMMIT` (unchanged) | `ReviewLifecycleFlowIT`, `VenueRatingRecomputeIT` |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Comment + display-name storage, bounds, `updated_at` | `review` | §review Job: "own everything about a tourist's verdict"; migration + SQL stay in `review/adapter/out` (machine-checked sole-writer rule) |
| Edit/delete policy (window fence, one-per-booking) | `review` | §review Job: "who may leave one and until when"; NOT `booking` (§booking Not-My-Job: "review policy → review") |
| Panel state + own review on the code-gated read | `booking` carries, `review` decides | Existing split: §booking "the flag on my read is mine to *carry*… the verdict comes from `review.api`" — extended from a boolean to `ReviewPanel` |
| Display-name suggestion (first token of contact name) | `booking` | `booking` owns the view contract and already consults `customer.api.CustomerLookup` (`PendingRequestsService` precedent); NOT `review` (§review Not-My-Job: "the guest's identity → `customer`"); NOT `customer` (it owns the name, not the review form's default) |
| Ineligibility/frozen copy | frontend | §review Not-My-Job: "displaying a rating → frontend"; server ships state tokens, client owns wording (§6b: detail states condition, client keys copy on `code`/state) |
| PUT/DELETE edge wiring (permitAll, CSRF, rate budget) | root | RV-BE-11: login/edge machinery at the platform edge |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope; no money moves.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/review-panel.ts` | **new** | standalone component (extracted from `booking-view.ts`) | signals + `input()`/`output()` | Signal Forms: `form({stars, comment, displayName})` with `required(stars)`, `maxLength(comment, 1000)`, `required(displayName)` + `maxLength(displayName, 60)` |
| FE-2 | `booking/booking-view.ts` | existing | standalone component | embeds FE-1; keeps HTTP + re-read + `review-result` live region + focus discipline | — |
| FE-3 | `booking/booking.model.ts` | existing | types | `BookingDetail` gains `reviewState`, `reviewWindowClosesAt`, `ownReview`, `reviewNameSuggestion`; drops `reviewable`; `SubmitReviewRequest` widens | — |
| FE-4 | `booking/booking.service.ts` | existing | `@Service` | `review()` widens; new `updateReview()`, `deleteReview()` | — |
| FE-5 | `booking/review-panel.spec.ts` + `booking/review-panel.contrast.spec.ts` | new | Vitest + axe (folded into the spec, booking-view precedent) + contrast rows for the frozen banner / error ink | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()`, Signal Forms
(v22 stable — angular.dev confirmed `[formField]` on `<textarea>`, `maxLength()`
validator, `value.set()` for edit-prefill). Textarea styling: the field recipe
(`rounded-[11px] border border-riv-field-border bg-white/60 px-3 py-2 text-[14px]`) +
`rows="4" resize-y` — `field-sizing-content` rejected (Safari support). Per-field errors
use the `submitAttempted()` idiom + `text-riv-error-ink` (booking-dialog precedent);
delete confirms via the `shared/confirm-panel.ts` pattern with `cls.btnOutlineDanger`;
every new control carries `appTouchTarget`.

## FE↔BE contract

- **Changed read:** `GET /api/bookings/{code}` — `BookingDetailView` drops `reviewable`,
  gains `reviewState: string` (the `ReviewState` token), `reviewWindowClosesAt:
  Instant|null`, `ownReview: {stars, comment|null, displayName|null}|null`,
  `reviewNameSuggestion: string|null`.
- **Changed write:** `POST /api/bookings/{code}/review` body widens to
  `{stars: number, comment?: string|null, displayName: string}`.
- **New:** `PUT /api/bookings/{code}/review` (same body) → `204`; errors `404
  NO_SUCH_BOOKING` / `404 NO_SUCH_REVIEW` / `409 REVIEW_WINDOW_CLOSED`. `DELETE
  /api/bookings/{code}/review` → `204`; same error set.
- **Client typing:** hand-written typed service (`BookingService`), no `as any`.
- **Dates on the wire:** `reviewWindowClosesAt` as ISO instant, rendered via
  `shared/deadline.ts` in `Europe/Tirane` (invariant #6).

## Execution status

**Stage pointer:** `plan — complete; stopped by request (plan-only session), awaiting maintainer review`

**Next action:** maintainer reviews this plan (esp. A-1/A-2/A-3); then a build session
starts at Phase 0 (re-run the skill-routing gate on entry).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V46 migration + store-port widening | | |
| 1 — submit with comment + display name | | |
| 2 — edit + delete lifecycle + edge wiring | | |
| 3 — richer code-gated read + name suggestion | | |
| 4 — frontend panel (form / own / frozen / messaging) | | |
| 5 — e2e journeys + docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `platform/src/main/resources/db/migration/V46__review_comment_display_name.sql` — new columns + CHECKs
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewText.java` — comment/name bounds + messages
- `platform/src/main/java/ai/riviera/platform/review/domain/Review.java` — the stored-review record (stars, comment, displayName, timestamps)
- `platform/src/main/java/ai/riviera/platform/review/application/Reviews.java` — port gains `findFor`, `update`, `delete`; `claim` widens
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewSubmission.java` — `(int stars, String comment, String displayName)` internal value
- `platform/src/main/java/ai/riviera/platform/review/application/SubmitReview.java` — signature widens to take `ReviewSubmission`
- `platform/src/main/java/ai/riviera/platform/review/application/SubmitReviewService.java` — stores the new fields
- `platform/src/main/java/ai/riviera/platform/review/application/EditReview.java` + `EditReviewService.java` — new internal port + service
- `platform/src/main/java/ai/riviera/platform/review/application/DeleteReview.java` + `DeleteReviewService.java` — new internal port + service
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewFences.java` — shared fence helper (R-2)
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewEligibilityService.java` — becomes the `panelFor` implementation
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewPanel.java` + `OwnReview.java` — published read shapes
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/EditOutcome.java` + `DeleteOutcome.java` — sealed outcomes
- `platform/src/main/java/ai/riviera/platform/review/api/ReviewEligibility.java` — `stateFor` → `panelFor`
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/ReviewController.java` — body widens; PUT + DELETE mappings
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/SubmitReviewRequest.java` — comment/displayName + compact-ctor bounds
- `platform/src/main/java/ai/riviera/platform/review/adapter/out/JdbcReviews.java` — new SQL (stays sole writer)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — panel + name suggestion
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — new fields, `reviewable` dropped
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — wire mirror
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — PUT/DELETE permitAll + CSRF-ignore rows
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — PUT/DELETE join the per-code review budget (count comment updated)
- `platform/src/test/java/ai/riviera/platform/review/**` — new/extended: `ReviewMigrationIT`, `SubmitReviewServiceTest`, `EditReviewServiceTest`, `DeleteReviewServiceTest`, `ReviewEligibilityServiceTest`, `ReviewLifecycleFlowIT`, `ReviewUniquenessIT`
- `platform/src/test/java/ai/riviera/platform/ReviewControllerTest.java` — new verbs + 400 bounds + code-redaction sweep
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stubs for the new ports
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — two new DECLARED_REACHABLE rows
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — panel pass-through + suggestion
- `platform/src/test/java/ai/riviera/platform/venue/VenueRatingRecomputeIT.java` — delete-to-"New" case
- `platform/src/test/java/ai/riviera/platform/review/ReviewFixtures.java` — helpers for commented reviews
- `frontend/src/app/booking/review-panel.ts` · `.spec.ts` · `.contrast.spec.ts` — the extracted panel
- `frontend/src/app/booking/booking-view.ts` · `booking-view.spec.ts` · `booking-view.contrast.spec.ts` — embed + trimmed
- `frontend/src/app/booking/booking.model.ts` · `booking.service.ts` · `booking.service.spec.ts` — contract + verbs
- `frontend/e2e/review-a-stay.e2e.ts` — fixtures to `reviewState`; submit-with-comment journey
- `frontend/e2e/review-lifecycle.e2e.ts` — edit / delete / frozen / ineligible journeys
- `frontend/e2e/my-bookings.e2e.ts` — signed-in COMPLETED row → review form journey
- `frontend/e2e/touch-targets-tourist.e2e.ts` — panel controls in the sweep
- `frontend/e2e/real-backend/reviews.e2e.ts` — comment+edit+delete on the true loop
- `RESPONSIBILITIES.md` — §review Shipped ¶, §booking `reviewable` ¶
- `CONTEXT.md` — Display name vocabulary entry
- `docs/plans/reviews-s2-comment-lifecycle.md` — this plan

---

## Phase 0 — V46 migration + store-port widening

**Files:** Create `V46__review_comment_display_name.sql`, `ReviewText.java`, `Review.java` ·
Modify `Reviews.java`, `JdbcReviews.java`, `ReviewFixtures.java` · Test `ReviewMigrationIT.java`

- [ ] **Step 1: Write the failing test** — extend `ReviewMigrationIT`:

```java
@Test
void commentAndDisplayNameCarryLengthChecks() {
    long bookingId = fixtures.completedBooking("RVW0MIGRT1").bookingId();
    assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("""
            INSERT INTO review (booking_id, venue_id, stars, comment, display_name, created_at)
            VALUES (:b, :v, 4, :comment, 'Ana', now())
            """).param("b", bookingId).param("v", fixtures.venueId())
            .param("comment", "x".repeat(1001)).update());
    assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("""
            INSERT INTO review (booking_id, venue_id, stars, comment, display_name, created_at)
            VALUES (:b, :v, 4, 'fine', :name, now())
            """).param("b", bookingId).param("v", fixtures.venueId())
            .param("name", "y".repeat(61)).update());
}
```

- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*ReviewMigrationIT*"` → FAIL (columns don't exist)

- [ ] **Step 3: Minimal implementation** — `V46__review_comment_display_name.sql`:

```sql
-- Slice 2 of #810: optional bounded comment + display name, edit timestamp (issue #812).
ALTER TABLE review
    ADD COLUMN comment      TEXT        NULL CHECK (char_length(comment) <= 1000),
    ADD COLUMN display_name TEXT        NULL CHECK (char_length(display_name) <= 60),
    ADD COLUMN updated_at   TIMESTAMPTZ NULL;
```

plus `review/domain/ReviewText.java`:

```java
/** Bounds for the review's free-text fields; the V46 CHECKs mirror them (invariant #12). */
final class ReviewText {
    static final int COMMENT_MAX = 1000;
    static final int DISPLAY_NAME_MAX = 60;
    static final String COMMENT_BOUND_DESCRIPTION = "comment must be at most 1000 characters";
    static final String DISPLAY_NAME_BOUND_DESCRIPTION = "display name must be at most 60 characters";
    static final String DISPLAY_NAME_REQUIRED_DESCRIPTION = "display name must not be blank";
    private ReviewText() {}
}
```

and widen `Reviews` + `JdbcReviews` (claim gains `comment`/`displayName` params; new
`Optional<Review> findFor(BookingRef)`, `boolean update(BookingRef, int stars, String
comment, String displayName, Instant at)`, `boolean delete(BookingRef)` — text-block SQL,
named params, all inside `review/adapter/out`).

- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*ReviewMigrationIT*" --tests "*ReviewUniquenessIT*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — N/A (no bug fix; new columns follow the
  `VenueFieldValidation`/V43 bounded-text mechanism already audited there)
- [ ] **Step 6: Commit** — `git commit -m "Add review comment/display-name columns and store operations (#812)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — submit with comment + display name

**Files:** Create `ReviewSubmission.java` · Modify `SubmitReview.java`,
`SubmitReviewService.java`, `SubmitReviewRequest.java`, `ReviewController.java`,
`WebSliceStubs.java` · Test `SubmitReviewServiceTest.java`, `ReviewControllerTest.java`,
`ReviewSubmitFlowIT.java`

- [ ] **Step 1: Failing tests** — `SubmitReviewServiceTest.recordsCommentAndDisplayNameAndPublishes`
  (fake `Reviews` records the tuple; recording publisher sees `ReviewsChanged`);
  `ReviewControllerTest.commentOverTheBoundIsRefusedNotTruncated` (1001-char comment →
  `400 INVALID_REQUEST`, use-case never reached) and the display-name blank/over-bound twins:

```java
@Test
void commentOverTheBoundIsRefusedNotTruncated() throws Exception {
    mvc.perform(post("/api/bookings/RVWE234567/review")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"stars": 4, "comment": "%s", "displayName": "Ana"}
                """.formatted("x".repeat(1001))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    assertEquals(List.of(), stubs.submittedReviews());
}
```

- [ ] **Step 2: Verify fail** — `./gradlew test --tests "*SubmitReviewServiceTest*" --tests "*ReviewControllerTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `ReviewSubmission(int stars, String comment,
  String displayName)` (internal, `application/`); `SubmitReview.submit(String code,
  ReviewSubmission submission)`; service passes the fields to `reviews.claim(...)`.
  Edge validation in `SubmitReviewRequest`'s compact ctor, `VenueFieldValidation` shape:
  strip both texts; blank comment → `null`; code-point bound checks throwing
  `InvalidApiRequestException(ReviewText.…_DESCRIPTION)`; blank displayName refused.
- [ ] **Step 4: Verify pass, then end-of-phase regression** —
  `./gradlew test --tests "*Review*"` → PASS
- [ ] **Step 5: Generalization-audit** — population: every edge DTO with a bounded text
  field (`git ls-files 'platform/*adapter/in*.java' | xargs grep -l codePointCount` +
  `VenueFieldValidation` callers) → confirm the new DTO matches the mechanism; no fix expected.
- [ ] **Step 6: Commit** — `git commit -m "Accept comment and display name on review submit (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 2 — edit + delete lifecycle + edge wiring

**Files:** Create `EditReview.java`, `EditReviewService.java`, `DeleteReview.java`,
`DeleteReviewService.java`, `ReviewFences.java`, `vocabulary/EditOutcome.java`,
`vocabulary/DeleteOutcome.java`, `ReviewLifecycleFlowIT.java` · Modify
`ReviewController.java`, `SecurityConfig.java`, `RateLimitFilter.java`,
`WebSliceStubs.java`, `EndpointRoleGateCoverageTest.java`, `ReviewUniquenessIT.java`,
`VenueRatingRecomputeIT.java`

- [ ] **Step 1: Failing tests** — `EditReviewServiceTest` (updates + republishes; refuses
  after window; `NoSuchReview` when nothing stored), `DeleteReviewServiceTest` (mirror),
  `VenueRatingRecomputeIT.aDeletedSoleReviewReturnsTheVenueToNew`:

```java
@Test
void aDeletedSoleReviewReturnsTheVenueToNew() {
    fixtures.reviewFor("RVWDEL2345", 5);
    recompute.recompute(venueId);
    fixtures.deleteReviewFor("RVWDEL2345");
    recompute.recompute(venueId);
    assertEquals(new int[] {0, 0}, ratingColumnsOf(venueId));
}
```

- [ ] **Step 2: Verify fail** — scoped `--tests` runs as above → FAIL
- [ ] **Step 3: Minimal implementation** — sealed outcomes
  (`EditOutcome { Updated, NoSuchStay, NotEligible, WindowClosed, NoSuchReview }`,
  `DeleteOutcome` mirror); both services run the shared `ReviewFences` (stay lookup →
  window; **fence order stays in lockstep with submit/panel**: rated+frozen reads
  WINDOW_CLOSED), then `reviews.update/delete`, then publish `ReviewsChanged`.
  Controller: `@PutMapping("/{code}/review")` + `@DeleteMapping("/{code}/review")`,
  exhaustive switch → `204` / `ApiProblem` (`NO_SUCH_REVIEW` new code, A-5). Edge rows:
  `SecurityConfig` permitAll + CSRF-ignore; `RateLimitFilter` review budget matches all
  three verbs; coverage-test rows.
- [ ] **Step 4: Verify pass + regression** — `./gradlew test --tests "*Review*" --tests "*VenueRating*" --tests "*EndpointRoleGate*" --tests "*ErrorContract*"` → PASS
- [ ] **Step 5: Generalization-audit** — population: every publisher of `ReviewsChanged`
  (`grep -rl "new ReviewsChanged" platform/src/main/java`) → all three write services
  publish; decision recorded in the log.
- [ ] **Step 6: Commit** — `git commit -m "Edit and delete an own review within the window (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 3 — richer code-gated read + name suggestion

**Files:** Modify `ReviewEligibility.java`, `ReviewEligibilityService.java`, create
`vocabulary/ReviewPanel.java`, `vocabulary/OwnReview.java` · Modify
`ViewBookingService.java`, `BookingDetail.java`, `BookingDetailView.java`,
`BookingController.java` mapping, `WebSliceStubs.java` · Test
`ReviewEligibilityServiceTest.java`, `ViewBookingServiceTest.java`

- [ ] **Step 1: Failing tests** — `ReviewEligibilityServiceTest.panelCarriesTheOwnReview`
  (+ per-state panels incl. frozen-with-review), `ViewBookingServiceTest`:

```java
@Test
void suggestsTheContactFirstNameForTheReviewForm() {
    customers.put(CUSTOMER_ID, new GuestContact("ana@example.com", "Ana Kelmendi", "+355…"));
    BookingDetail detail = service.byCode(COMPLETED_CODE).orElseThrow();
    assertEquals("Ana", detail.reviewNameSuggestion());
}

@ParameterizedTest
@EnumSource(ReviewState.class)
void reviewPanelStateFollowsReviewEligibility(ReviewState state) { … }
```

- [ ] **Step 2: Verify fail** → FAIL
- [ ] **Step 3: Minimal implementation** — `ReviewPanel(ReviewState state, Instant
  windowClosesAt, OwnReview review)` (nullable fields documented);
  `ReviewEligibilityService.panelFor` composes fences + `reviews.findFor`;
  `ViewBookingService` maps the panel onto `BookingDetail` and derives the suggestion
  (first whitespace token of `GuestContact.fullName`, `null` when absent/blank), only for
  panel states that render a form (`ELIGIBLE`). `reviewable` is deleted end-to-end.
- [ ] **Step 4: Verify pass + regression** — `./gradlew test --tests "*Review*" --tests "*ViewBooking*" --tests "*ModularityTests*" --tests "*PackageShape*" --tests "*PublishedSurfacePlacement*"` → PASS (structural net after the surface change)
- [ ] **Step 5: Generalization-audit** — population: every consumer of the old
  `stateFor`/`reviewable` (`grep -rln "stateFor\|reviewable" platform/src frontend/src frontend/e2e`) → enumerate and migrate each.
- [ ] **Step 6: Commit** — `git commit -m "Carry review panel state, own review and name suggestion on the code-gated read (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 4 — frontend panel (form / own / frozen / messaging)

**Files:** Create `booking/review-panel.ts` + `.spec.ts` + `.contrast.spec.ts` · Modify
`booking-view.ts` + specs, `booking.model.ts`, `booking.service.ts` + spec

- [ ] **Step 1: Failing tests** — `review-panel.spec.ts`: renders the form for
  `ELIGIBLE` with the name prefilled from `reviewNameSuggestion`; comment over 1000 →
  inline error after submit attempt; `ALREADY_REVIEWED` renders stored review + edit +
  delete (confirm panel); `WINDOW_CLOSED` + ownReview renders frozen read-only copy;
  `NOT_COMPLETED` on a CONFIRMED booking renders the check-in note, on CANCELLED renders
  nothing (A-3); axe run last. `booking.service.spec.ts`: `updateReview` PUTs,
  `deleteReview` DELETEs (also backfills the missing `review()` POST test noted in the survey).
- [ ] **Step 2: Verify fail** — `npm test -- --include='**/review-panel.spec.ts' --include='**/booking.service.spec.ts'` → FAIL
- [ ] **Step 3: Minimal implementation** — Signal Forms model:

```ts
interface ReviewFormModel { stars: number | null; comment: string; displayName: string; }
protected readonly reviewForm = form(this.model, (path) => {
  required(path.stars, { message: REVIEW_REQUIRED });
  maxLength(path.comment, COMMENT_MAX, { message: COMMENT_TOO_LONG });
  required(path.displayName, { message: NAME_REQUIRED });
  maxLength(path.displayName, NAME_MAX, { message: NAME_TOO_LONG });
});
```

  Panel `input()`s: `state`, `ownReview`, `nameSuggestion`, `windowClosesAt`,
  `bookingStatus`; `output()`s: `submitted`, `updated`, `deleted` (parent keeps HTTP +
  `load(true)` + the `review-result` live region + `focusMover`). Edit mode seeds the
  model via `value.set()` from `ownReview`. Textarea: field recipe + `rows="4" resize-y`
  + `maxlength` attr; controls carry `appTouchTarget`; delete via confirm-panel pattern
  with `cls.btnOutlineDanger`. New copy strings keep `text-riv-error-ink`/token inks;
  contrast rows added for the frozen banner.
- [ ] **Step 4: Verify pass + regression** — `npm test` (booking specs) + `npm run lint`
  + `npm run format:check` → PASS
- [ ] **Step 5: Generalization-audit** — population: every template binding of
  `reviewable` (`grep -rn "reviewable" frontend/src frontend/e2e`) → all migrated to `reviewState`.
- [ ] **Step 6: Commit** — `git commit -m "Review panel: comment form, own review, edit/delete, ineligibility messaging (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 5 — e2e journeys + docs freshness + close-out

**Files:** Modify `frontend/e2e/review-a-stay.e2e.ts`, `my-bookings.e2e.ts`,
`touch-targets-tourist.e2e.ts`, `frontend/e2e/real-backend/reviews.e2e.ts` · Create
`frontend/e2e/review-lifecycle.e2e.ts` · Modify `RESPONSIBILITIES.md`, `CONTEXT.md`

- [ ] **Step 1: Author the mocked journeys** (stateful `page.route` flip pattern per the
  slice-1 spec): submit-with-comment (captures `postDataJSON()` → `{stars, comment,
  displayName}`), edit (fixture flips to `ALREADY_REVIEWED` + ownReview; PUT captured;
  copy updates), delete (DELETE captured; venue fixtures flip back to `0/0` → "New"),
  frozen (`WINDOW_CLOSED` + ownReview → read-only + why), ineligible
  (`NOT_COMPLETED`/CONFIRMED → check-in note; CANCELLED → silence), each with
  `settle(page)` + `expectNoSeriousAxeViolations`. My Bookings: customer-principal mock +
  COMPLETED row → row link → panel visible (no code email involved). Touch-target sweep
  gains the panel's textarea/inputs/buttons surface.
- [ ] **Step 2: Run** — `npm run test:e2e:a11y` → PASS
- [ ] **Step 3: Extend the real-backend spec** — after check-in: submit with comment,
  reload → own review shown, edit stars → header score moves, delete → header returns to
  "New" (local-only; skips cleanly in CI).
- [ ] **Step 4: Docs freshness** — run `riviera-docs-freshness` over the slice range:
  §review Shipped ¶ (comments/display names/own-review/messaging now shipped; list what
  still isn't), §booking's "`reviewable` flag" ¶ → panel-state wording, CONTEXT.md
  "Display name" entry; file the R-4 erasure follow-up issue.
- [ ] **Step 5: Guard + self-review** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
  (plan doc staged) + the Self-review checklist; finalize Execution status.
- [ ] **Step 6: Commit** — `git commit -m "Review lifecycle e2e journeys and doc freshness (#812)"`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** `./gradlew test --tests "*Review*" --tests "*ViewBooking*" --tests "*VenueRating*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; concurrency covered by `ReviewUniquenessIT` (invariant #2 untouched).
- [ ] Pool + cutoff rules honored — N/A, no reserve path (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy — N/A (invariant #10).
- [ ] Timezone correct: `updated_at`/`windowClosesAt` UTC instants; deadline rendered `Europe/Tirane` (invariant #6).
- [ ] Booking codes never in error bodies/logs (invariant #7) — pinned test extended to the new verbs.
- [ ] Flyway V46 present; CHECKs tested by `ReviewMigrationIT` (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
