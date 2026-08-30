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

**Architecture:** The `review` module stays a leaf (ADR-0015) and gets **deeper, not
wider**: submit/edit/delete are one purposeful conversation behind a single internal
`ReviewLifecycle` port (evolving slice 1's `SubmitReview`), and the eligibility fence
order lives once, as the pure domain policy `ReviewGate` — the write path and the panel
read both consult it, so "rated + frozen reads as frozen" holds by construction, not by
lockstep discipline. The published read evolves from an enum to a **sealed
`ReviewPanel`** (each state carries exactly its data — no nullable-field record), which
also splits *frozen review* from *window closed, never reviewed*; `ReviewState` loses its
last cross-module consumer and retires from `vocabulary/` into `domain/`. Every write
publishes the same ids-only `ReviewsChanged` (the `venue` recompute is a full idempotent
recompute — no listener changes). `booking` (owner of the view contract) carries the
panel it does not decide, plus a display-name suggestion it derives itself via
`customer.api.CustomerLookup` — `review` never learns the guest's identity and
`CompletedStays` stays unwidened.

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
`booking`+`customer` instead of widening `CompletedStays`; api evolution per the #94
role-split rule; `ReviewState` retired from the published surface) · `codebase-design`
(collapsed three write ports + a fence helper into one deep `ReviewLifecycle` port with
the fence order as the pure domain policy `ReviewGate`; sealed `ReviewPanel` over a
nullable-field record) · `domain-modeling` (split *Frozen review* from *window closed,
never reviewed* — two states the enum conflated; CONTEXT.md gains the terms) ·
`riviera-java-conventions` (sealed outcome types with exhaustive switches, edge validation
via compact-ctor `InvalidApiRequestException`, §6b error contract, code-point bounds per
`VenueFieldValidation` precedent) · `postgres` (nullable TEXT + `char_length` CHECKs over
enum/varchar; no new index — all reads hit `review_once_per_booking` or
`review_venue_id_idx`) · `riviera-frontend` (panel extracted to `booking/review-panel.ts`
— feature folder, no new cross-feature edge; star control stays in `shared/`) ·
`angular-developer` + angular-cli MCP (v22 best practices; angular.dev Signal Forms:
`maxLength()` schema validator, `[formField]` on `<textarea>`, programmatic `value.set()`
for edit-prefill) · `riviera-tailwind` (textarea reuses the field recipe + `resize-y`;
**rejected `field-sizing-content`** — Safari support caveat per
tailwindcss.com/docs/field-sizing; new banner/error surfaces get contrast-spec rows) ·
`playwright-cli` (mocked-suite journeys authored to the stateful `page.route` flip
pattern the slice-1 spec established)

**Skills re-consulted at the Implement stage** (the routing gate, per area as it was entered):
`riviera-sdlc` (the loop) · `riviera-local-debug` (before the first `gradle`/`npm`) · `postgres` +
`riviera-modulith` + `riviera-java-conventions` + `codebase-design` (phases 0-3) ·
`riviera-frontend` + `riviera-tailwind` + `angular-developer` + the angular-cli MCP
(`get_best_practices`, `search_documentation` — which is what caught that `[formField]` refuses a
hand-written `maxlength`, phase 4) · `playwright-cli` + `riviera-docs-freshness` (phase 5).

**Skills re-consulted at the Review stage** (the routing gate again, per area the fix round touched):
`riviera-sdlc` (`references/pr-gates.md`, the three gates) · `riviera-review-overlay` (the RV banks,
layered onto `/code-review:code-review`) · `riviera-local-debug` (before the session's first
`gradle`/`npm`, and for the live-stack bring-up) · `riviera-java-conventions` (§6a named literals for
the Sonar round, §6d Javadoc-as-contract for F-6/F-7) · `riviera-frontend` (placement for the
`booking/` and e2e edits — no file moved) · `riviera-docs-freshness` (the counting sweep behind F-8
and the ADR-0015 patch)

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
  `ReviewLifecycleServiceTest.recordsCommentAndDisplayNameAndPublishes`,
  `ReviewSubmitFlowIT.recordsACommentedReview`
- [ ] **AC-2:** Given a comment of 1001 code points (or a display name over 60), when the
  request reaches the edge, then it is refused `400 INVALID_REQUEST` — never truncated —
  and the DB CHECK backstops it. *Pinned by:*
  `ReviewControllerTest.commentOverTheBoundIsRefusedNotTruncated`,
  `ReviewMigrationIT.commentAndDisplayNameCarryLengthChecks`
- [ ] **AC-3:** Given a stay already reviewed inside its window, when the panel is read,
  then it is `ReviewPanel.AlreadyReviewed` carrying the stored stars/comment/display name
  and the window deadline. *Pinned by:*
  `ReviewEligibilityServiceTest.panelCarriesTheOwnReview`
- [ ] **AC-4:** Given an existing review inside the window, when the guest edits stars
  2→5, then the review is updated (`updated_at` set) and `ReviewsChanged` republished;
  after the window the edit is refused with `AmendOutcome.WindowClosed`. *Pinned by:*
  `ReviewLifecycleServiceTest.editUpdatesAndRepublishes`,
  `ReviewLifecycleServiceTest.editRefusesAfterTheWindow`, `ReviewLifecycleFlowIT`
- [ ] **AC-5:** Given the venue's only review, when the guest deletes it inside the
  window, then `ReviewsChanged` republishes and the venue recomputes to `0/0` ("New").
  *Pinned by:* `ReviewLifecycleServiceTest.deleteRepublishes`,
  `VenueRatingRecomputeIT.aDeletedSoleReviewReturnsTheVenueToNew`
- [ ] **AC-6:** Given any non-eligible stay, when the code-gated view is read, then it
  carries the distinct sealed panel state — with *frozen review* (review exists, window
  closed) distinct from *window closed, never reviewed* — and a frozen review is still
  readable. The fence order is a single domain rule. *Pinned by:*
  `ReviewGateTest.ratedAndFrozenReadsAsFrozen`,
  `ViewBookingServiceTest.reviewPanelFollowsReviewEligibility`
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
| Panel renders iff `BookingDetail.reviewable` (server truth, never `status`) | preserved | Renders the form iff the panel is `ELIGIBLE` — still server truth; the boolean becomes the sealed panel, same decider (`review.api`) |
| `reviewable: false` → total silence | **changed (the point of the slice)** | Each panel state renders own-review / frozen / window-closed / not-yet messaging (issue AC 4) |
| Post-submit re-read (`load(true)`) keeps success line while panel unmounts | preserved | Same `review-result` live region outside the panel; edit/delete reuse the same re-read |
| Rejection copy per problem `code` (`reviewRejectionCopy`) | preserved + extended | Same switch, new code (`NO_SUCH_REVIEW`) added |
| `required` stars message funnelled into `review-result` | changed | Per-field errors adopt the `submitAttempted()` idiom (booking-dialog precedent) for comment/name; stars keep the funnel (the control has no inline slot) |
| e2e fixtures set `reviewable: true/false` | changed | Fixtures set the `reviewPanel` discriminated object; same-origin deploy, no external consumers |
| `ViewBookingServiceTest.reviewableIsFalseForEveryStateButEligible` | changed | Becomes the pass-through pin `reviewPanelFollowsReviewEligibility` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Flyway V46 collision with in-flight work | low | high | Checked: V45 is highest on `main`; open PRs are Dependabot-only. If a collision appears, this branch renumbers (merges second) | agent | **closed** — re-verified at implement entry (2026-08-30): V45 still the highest on `main`, all 20 open PRs Dependabot bumps |
| R-2 | Fence-order drift between submit / edit / delete / panel-read (rated+frozen must read frozen everywhere) | low (was med) | med | **Structurally removed**: the order lives once in `domain/ReviewGate`, consulted by both the lifecycle service and the panel read; `ReviewGateTest` pins it, `ReviewLifecycleFlowIT` proves the ends agree | agent | **closed (phases 1-3)** — one `ReviewGate.stateOf` call in each of the two services and nowhere else |
| R-3 | Edit/delete forget to republish `ReviewsChanged` → stale aggregate | med | high | `ReviewLifecycleServiceTest` asserts the publish per verb; `VenueRatingRecomputeIT` extension proves delete-to-"New"; recompute is already idempotent (full recompute, never increment) | agent | **closed (phase 2)** — both publishes pinned per verb, and `aDeletedSoleReviewReturnsTheVenueToNew` proves the venue returns to `0/0` through the real listener |
| R-4 | `display_name`/`comment` are the **first PII in the `review` table** — erasure (ADR-0010) has no hook yet | high | med | Deliberate epic sequencing (story 25 is a later slice). Record the obligation: close-out files a follow-up issue referencing epic #810 story 25 before this slice merges | agent | **closed (phase 5)** — filed as **#820**, and RESPONSIBILITIES §review's Shipped ¶ now names the gap |
| R-5 | Client `maxLength` counts UTF-16 units, server counts code points (emoji differ) | low | low | Client is strictly tighter (a surrogate pair counts 2); the server bound + DB CHECK are the contract (AC-2); no truncation anywhere | agent | **closed (phase 4)** — the schema's `maxLength` refuses inline and sends nothing; the bounds are stated once in `booking.model.ts` |
| R-6 | Invariant #7 — booking code in new error bodies/logs | low | high | All errors via `ApiProblem` with `instance` pinned to `/api/bookings`; `ReviewControllerTest.theBookingCodeNeverAppearsInAnErrorBody` extended to PUT/DELETE | agent | **closed (phase 2)** — the sweep runs as `theBookingCodeNeverAppearsInAnAmendErrorBody` over both new verbs |
| R-7 | New PUT/DELETE routes bypass the per-code rate-limit budget or CSRF/permitAll wiring | med | med | Same `RateLimitFilter.REVIEW_TEMPLATE` bucket; `SecurityConfig` permitAll + CSRF-ignore rows; `EndpointRoleGateCoverageTest.DECLARED_REACHABLE` gains both routes (the inline endpoint count comment updates — the F-3 lesson) | agent | **closed (phase 2)** — all three verbs classified together in `targetOf`, the two `permitAll` rows added (the CSRF ignore was already path-scoped, so it covered them), both coverage rows added, the six→eight counts updated, and `RateLimitFilterTest.everyReviewVerbSpendsTheSamePerCodeBudget` + `aReviewDeleteAndTheViewShareOneCodeBudget` pin it |
| R-8 | Error-contract drift on new 4xx paths (§6b) | low | med | Compact-ctor `InvalidApiRequestException` for 400s; typed-outcome switch + `ApiProblem` for 404/409; no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests` enforces) | agent | **closed (phase 2)** — `ErrorContractArchitectureTests` green over the new verbs |
| R-9 | `ResponsibilitiesArchitectureTests` — new review SQL outside `review/adapter/out` | low | med | All new SQL lands in `JdbcReviews`; `booking` touches only its own view + `CustomerLookup` | agent | **closed (phases 0-3)** — the test is green; every new statement is in `JdbcReviews` |
| R-10 | Concurrent edit racing a delete on the same review | low | low | Row-level semantics: `Reviews.update`/`delete` return whether a row was affected — the loser maps to `NO_SUCH_REVIEW`, never a duplicate (the `UNIQUE (booking_id)` constraint stands); pinned by `ReviewUniquenessIT.aDeleteRacingAnEditLeavesAtMostOneRow` | agent | **closed (phase 2)** — the race test passes against real Postgres |

## Open questions / Assumptions

### Resolved

- **Assumption A-1 — confirmed** (maintainer, at implement entry): "Booking contact's first
  name" (issue wording) = the **first whitespace-separated token of `GuestContact.fullName`**
  — no first-name field exists anywhere. Built in phase 3.
- **Assumption A-2 — confirmed** (maintainer, at implement entry): display name is
  **required (non-blank, ≤60 code points) on every slice-2 submit/edit**; the column stays
  nullable for slice-1 star-only rows. Prefill makes this invisible in the happy path, and it
  guarantees every commented review is attributable (epic stories 3/14). Built in phases 0-1.
- **Assumption A-3 — confirmed** (maintainer, at implement entry): the NOT_COMPLETED "you can
  rate once you're checked in" note renders **only for status `CONFIRMED`** (an upcoming/active
  stay); terminal statuses (CANCELLED, NO_SHOW, …) show no review section — inviting a review
  there would be noise. Frozen and already-reviewed messaging render regardless of how the stay
  ended. Built in phase 4.

### Resolved during the build

- **Assumption A-4 — held** (phase 3): `reviewable` left the wire and every consumer in the
  repo moved with it; the SPA ships from the same deploy, so there was no external consumer
  to break.
- **Assumption A-5 — held** (phase 2): PUT/DELETE against a stay carrying no review answer
  `404 NO_SUCH_REVIEW`; a window-closed amend answers `409 REVIEW_WINDOW_CLOSED`, reusing the
  existing code. Pinned by `ReviewControllerTest` and `ReviewLifecycleFlowIT`.

### Open

*(None — every assumption above is resolved.)*

## Availability & concurrency (invariant #2)

The slice touches `booking` (read contract only) but **writes nothing to
`availability(set_id, booking_date)`** — no reserve, release, or staff-mark path is in
scope, so invariant #2's table is untouched. The slice's own concurrency surface is the
`review` table:

- **Write paths:** `JdbcReviews.claim` (INSERT … ON CONFLICT DO NOTHING, slice 1),
  plus new `update`/`delete` — all keyed on `booking_id`.
- **Uniqueness guarantee:** `review_once_per_booking UNIQUE (booking_id)` (V45) —
  unchanged; edit/delete target the existing row by `booking_id` and report
  rows-affected, so a concurrent edit+delete resolves by row-level semantics (the loser
  returns `false` → `NO_SUCH_REVIEW`), never a duplicate (R-10).
- **Pinning tests:** `ReviewUniquenessIT.concurrentDoubleSubmitRecordsOne` (existing) +
  `aDeleteRacingAnEditLeavesAtMostOneRow` (new).
- Pool (#3) and cutoff (#4) rules: not in scope — no booking creation path touched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `review` | existing | `Review` (row grows: comment, displayName, updatedAt) | Owns the review record + window/edit/delete policy (RESPONSIBILITIES §review Job line) |
| M-2 | `booking` | existing | `Booking` | Owns the code-gated view contract; carries the panel it does not decide (§booking: "mine to carry, not to decide") |
| M-3 | root/edge | — | — | `SecurityConfig` + `RateLimitFilter` rows for PUT/DELETE (edge wiring lives at the root, RV-BE-11) |

`venue` is deliberately **untouched**: its `ReviewsChanged` listener already does a full
locked recompute, and `AggregateRating.tenths` already short-circuits `count == 0` → `0`
→ "New". `customer` is untouched (its `CustomerLookup` port is merely consumed).

**Boundary design (the clean-boundaries core of this slice)**

- **One conversation, one port.** Submit, edit, and delete are the same purposeful
  conversation — "the code-holder managing their one review" — so slice 1's internal
  `SubmitReview` port **evolves into `ReviewLifecycle`** (`submit`/`edit`/`delete`, one
  package-private service) instead of growing two sibling port/service pairs. Fewer
  seams, same test surface: the interface is the test surface, and all lifecycle tests
  drive this one port (`codebase-design`: a small interface hiding the fences is depth;
  three thin ports sharing a helper is shallowness).
- **The fence order is domain policy, stated once.** `domain/ReviewGate` is a pure
  function `stateOf(bookingExists, completedAt, reviewed, now) → ReviewState`; the
  lifecycle service and the panel read both consult it. "Rated + frozen reads as frozen"
  becomes a one-line domain test instead of a lockstep convention across services (R-2
  falls from *med* to structurally-removed). Writes map the gate's refusal onto their
  sealed outcome; no service re-derives a fence.
- **Sealed panel over nullable fields.** The published read is
  `vocabulary/ReviewPanel` — a sealed interface whose variants carry exactly their data
  (below). No `(state, nullable Instant, nullable OwnReview)` record where half the field
  combinations are illegal; consumers pattern-match exhaustively
  (`riviera-java-conventions` §5). It also **splits two states the enum conflated**:
  `Frozen` (review exists, read-only) vs `WindowClosed` (never reviewed, too late) —
  exactly the distinction the issue's messaging needs.
- **The published surface shrinks where it can.** `panelFor` replaces `stateFor` as
  `ReviewEligibility`'s single method (same consumer role — `booking` — so this is
  #94-legitimate evolution, not a new port), after which `ReviewState` has **no
  cross-module consumer** and retires from `vocabulary/` into `domain/` as the gate's
  outcome type. Published after this slice: `api/` {`ReviewEligibility`,
  `VenueRatingSummary`}, `spi/` {`CompletedStays` — **unwidened**}, `events/`
  {`ReviewsChanged`}, `vocabulary/` {refs, `RatingSummary`, `ReviewPanel` (+ nested
  `OwnReview`), `SubmitOutcome`, `AmendOutcome`}.
- **One amend outcome for two verbs.** Edit and delete share an identical refusal set,
  so one sealed `AmendOutcome { Done, NoSuchStay, NotEligible, WindowClosed,
  NoSuchReview }` serves both — every member reachable for both verbs, so exhaustive
  switches stay honest (the reason submit keeps its own `SubmitOutcome`: its
  `AlreadyReviewed` member is unreachable for amends and would poison their switches).
- **Identity stays out of the leaf.** The display-name suggestion is derived in
  `booking` from `customer.api.CustomerLookup` (existing grant, `PendingRequestsService`
  precedent) and attached at the view edge — `review` never sees a name it didn't store,
  `CompletedStays` stays `(BookingRef, VenueRef, completedAt)`, and
  `allowedDependencies` of every module are **unchanged** by this slice.

The published shapes:

```java
// review/vocabulary/ReviewPanel.java — the whole read, one sealed type
public sealed interface ReviewPanel {
    record Eligible(Instant windowClosesAt) implements ReviewPanel {}
    record AlreadyReviewed(OwnReview review, Instant windowClosesAt) implements ReviewPanel {}
    record Frozen(OwnReview review) implements ReviewPanel {}
    record WindowClosed() implements ReviewPanel {}
    record NotCompleted() implements ReviewPanel {}
    record NoSuchStay() implements ReviewPanel {}
}
// review/vocabulary/OwnReview.java
public record OwnReview(int stars, String comment, String displayName) {}
// review/vocabulary/AmendOutcome.java — one sealed outcome for edit AND delete
public sealed interface AmendOutcome {
    record Done() implements AmendOutcome {}
    record NoSuchStay() implements AmendOutcome {}
    record NotEligible() implements AmendOutcome {}
    record WindowClosed() implements AmendOutcome {}
    record NoSuchReview() implements AmendOutcome {}
}
```

```java
// review/application/ReviewLifecycle.java — internal driving port (evolves SubmitReview)
interface ReviewLifecycle {
    SubmitOutcome submit(String bookingCode, ReviewSubmission submission);
    AmendOutcome edit(String bookingCode, ReviewSubmission submission);
    AmendOutcome delete(String bookingCode);
}
// review/domain/ReviewGate.java — the fence order, stated once (pure)
static ReviewState stateOf(boolean bookingExists, Optional<Instant> completedAt,
                           boolean reviewed, Instant now)
```

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `review.api` | `ReviewEligibility#panelFor(String code)` — **evolves** `stateFor` (same consumer role, #94-legitimate) | `ReviewPanel` (sealed, above) + `OwnReview` | `booking` |
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
| The fence order (eligibility → window → reviewed) as one rule | `review` (`domain/ReviewGate`) | §review Job: "who may leave one and until when" — policy is domain, services orchestrate; NOT duplicated per service |
| Edit/delete policy (window fence, one-per-booking) | `review` | Same Job line; NOT `booking` (§booking Not-My-Job: "review policy → review") |
| Panel state + own review on the code-gated read | `booking` carries, `review` decides | Existing split: §booking "the flag on my read is mine to *carry*… the verdict comes from `review.api`" — extended from a boolean to the sealed panel |
| Display-name suggestion (first token of contact name) | `booking` | `booking` owns the view contract and already consults `customer.api.CustomerLookup` (`PendingRequestsService` precedent); NOT `review` (§review Not-My-Job: "the guest's identity → `customer`"); NOT `customer` (it owns the name, not the review form's default) |
| Ineligibility/frozen copy | frontend | §review Not-My-Job: "displaying a rating → frontend"; server ships panel states, client owns wording (§6b: detail states condition, client keys copy on `code`/state) |
| PUT/DELETE edge wiring (permitAll, CSRF, rate budget) | root | RV-BE-11: login/edge machinery at the platform edge |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope; no money moves.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/review-panel.ts` | **new** | standalone component (extracted from `booking-view.ts`) | signals + `input()`/`output()`; renders by exhaustive `@switch` on `reviewPanel.kind` | Signal Forms: `form({stars, comment, displayName})` with `required(stars)`, `maxLength(comment, 1000)`, `required(displayName)` + `maxLength(displayName, 60)` |
| FE-2 | `booking/booking-view.ts` | existing | standalone component | embeds FE-1; keeps HTTP + re-read + `review-result` live region + focus discipline | — |
| FE-3 | `booking/booking.model.ts` | existing | types | `BookingDetail` gains `reviewPanel` (discriminated union mirroring the sealed type); drops `reviewable`; `SubmitReviewRequest` widens | — |
| FE-4 | `booking/booking.service.ts` | existing | `@Service` | `review()` widens; new `updateReview()`, `deleteReview()` | — |
| FE-5 | `booking/review-panel.spec.ts` + `booking/review-panel.contrast.spec.ts` | new | Vitest + axe (folded into the spec, booking-view precedent) + contrast rows for the frozen banner / error ink | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`/`@switch`, `input()`/`output()`,
Signal Forms (v22 stable — angular.dev confirmed `[formField]` on `<textarea>`,
`maxLength()` validator, `value.set()` for edit-prefill). Textarea styling: the field
recipe (`rounded-[11px] border border-riv-field-border bg-white/60 px-3 py-2
text-[14px]`) + `rows="4" resize-y` — `field-sizing-content` rejected (Safari support).
Per-field errors use the `submitAttempted()` idiom + `text-riv-error-ink`
(booking-dialog precedent); delete confirms via the `shared/confirm-panel.ts` pattern
with `cls.btnOutlineDanger`; every new control carries `appTouchTarget`.

## FE↔BE contract

- **Changed read:** `GET /api/bookings/{code}` — `BookingDetailView` drops `reviewable`,
  gains one nested discriminated object mirroring the sealed panel (built by an
  exhaustive switch in `booking`'s adapter — a new variant is a compile error, not a
  silent `null`):

  ```ts
  reviewPanel:
    | { kind: 'ELIGIBLE'; windowClosesAt: string; nameSuggestion: string | null }
    | { kind: 'ALREADY_REVIEWED'; review: OwnReviewView; windowClosesAt: string }
    | { kind: 'FROZEN'; review: OwnReviewView }
    | { kind: 'WINDOW_CLOSED' }
    | { kind: 'NOT_COMPLETED' };
  // OwnReviewView = { stars: number; comment: string | null; displayName: string | null }
  ```

  `nameSuggestion` is `booking`'s addition on the `ELIGIBLE` variant only (it exists to
  prefill the form and nowhere else). `NoSuchStay` never reaches the wire — the view 404s
  before a panel exists.
- **Changed write:** `POST /api/bookings/{code}/review` body widens to
  `{stars: number, comment?: string|null, displayName: string}`.
- **New:** `PUT /api/bookings/{code}/review` (same body) → `204`; errors `404
  NO_SUCH_BOOKING` / `404 NO_SUCH_REVIEW` / `409 BOOKING_NOT_COMPLETED` / `409
  REVIEW_WINDOW_CLOSED`. `DELETE /api/bookings/{code}/review` → `204`; same error set.
- **Client typing:** hand-written typed service (`BookingService`), no `as any`; the
  panel union gives the template an exhaustive `@switch` on `kind`.
- **Dates on the wire:** `windowClosesAt` as ISO instant, rendered via
  `shared/deadline.ts` in `Europe/Tirane` (invariant #6).

## Execution status

**Stage pointer:** `merged via PR #819`

**Review gate:** run in the follow-up session — `/code-review:code-review` (plugin skill, ladder
rung 1: the `Skill` probe succeeded, so no degraded fallback was needed) at **high effort**, with
`riviera-review-overlay` layered on for the RV-BE / RV-FE / RV-CT banks. Seven parallel reviewers:
the plugin's five (CLAUDE.md adherence, shallow bug scan, git-history regression, prior-PR comment
carry-over, code-comment compliance) plus one overlay walk per side. Every finding is in the
register below.

**Sonar gate:** the four reported new issues (all `java:S1192`) are cleared in code — the gate was
green throughout, which is why the *list* was the check (`pr-gates.md` §2).

**Beyond the gates:** the real-backend suite the build session could not execute was run against a
live stack (host Postgres 16 + `bootRun`, per `scripts/e2e-local-stack.sh`). It **failed**, and the
failure was real — F-5 below. With that fixed the whole journey passes on the true loop:
ineligible → check-in → submit with comment → read back → aggregate `5.0` → edit → `3.0` → delete →
"New". That closes the build session's honest gap, and answers F-1: phase 4 now has a green run of
the whole tree behind it, locally and in CI.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V46 migration + store-port widening | ✅ | `5a4e72a` |
| 1 — review gate + submit with comment/display name | ✅ | `f501e30` |
| 2 — edit + delete on the lifecycle port + edge wiring | ✅ | `de46936` |
| 3 — sealed panel read + name suggestion | ✅ | `eaf57d7` |
| 4 — frontend panel (form / own / frozen / messaging) | ✅ | `9833e02` |
| 5 — e2e journeys + docs freshness + close-out | ✅ | `d758bc5` + the close-out commit |
| 6 — review-gate + Sonar-gate fix round | ✅ | the fix-round commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Deviations from the plan** (design intent unchanged; each is an idiom or sequencing correction)

| # | Plan said | Built as | Why |
|---|---|---|---|
| D-1 | `ReviewGate.stateOf(…, Optional<Instant> completedAt, …)` | a nullable `Instant completedAt`, documented on the parameter | `riviera-java-conventions` §5: `Optional` is for query-port returns, never parameters |
| D-2 | phase 1 relocates `ReviewState` to `domain/` | phase 1 leaves it in `vocabulary/`; phase 3 moves it | while `ReviewEligibility.stateFor` still returns it, a `domain/` type would be an unpublished return on a published port — the plan's own phase-3 file list already places the move there |
| D-3 | `final class ReviewText` (package-private sketch) | `public final class ReviewText` | `adapter/in` validates against the bounds, and it is a different package — the `Stars` precedent |
| D-4 | `vocabulary/OwnReview` lands in phase 3 | landed in phase 0 | `Reviews.findFor` returns it, and the plan allows "moved from phase 0 if not yet public" |
| D-5 | the view renders `<app-review-panel>` unconditionally | wrapped in `@if (b.reviewPanel; as …)` in phase 5, **reverted at the review gate** — the plan was right | the guard was added because the repo's e2e `BookingDetail` fixtures are partial and a missing field took the whole booking view down. But the field is not optional: `ViewBookingService.toDetail` runs only for a row `findByCode` already returned, and `ReviewEligibility` answers `NoSuchStay` only when `existsByCode` is false on that same table — so the wire always carries a panel, and the TS type says so. The guard contradicted its own type and would have hidden a real regression; the gap was in the untyped e2e fixtures, and that is where it is now fixed (F-10) |
| D-6 | the textarea carries a `maxlength` attribute | the schema's `maxLength` validator carries it | Angular v22 refuses `[attr.maxlength]` on a `[formField]` node (NG8022) — the directive syncs the attribute from the schema itself, which is the same bound stated once. **Verified at the review gate**: `FormField.elementAcceptsNativeProperty` returns true for `maxLength` on a textual element, and the rendered `<textarea>`/`<input>` do carry `maxlength="1000"` / `maxlength="60"` |
| D-7 | (not planned) | `ReviewPanel.settle()`, called by the booking view when a write lands | review-gate finding F-4: the panel's edit / confirm mode was reset only by a new panel object arriving, and the booking view deliberately lets a post-write re-read fail without flipping the page. A landed write now ends the mode itself |

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-2 | Sonar (PR #819) | **Quality Gate passed** — 94.4% coverage on new code, 0.0% duplication, 0 hotspots — but **4 new issues** (`java:S1192`: the `/api/bookings/*/review` matcher ×4 in `SecurityConfig`, and `booking`/`stars`/`comment` as repeated bind-parameter names in `JdbcReviews`), and this repo's merge bar is 0 | **closed** — named per the file's own convention: `BOOKING_REVIEW_PATH`, and `PARAM_*` / `COL_*` on the `JdbcCustomerDirectory` precedent (bind parameter and column kept apart: they coincide by name, not by rule) |
| F-3 | Review gate (bug scan) | `keep-review` and `cancel-edit-review` carried no `[appBusy]`, unlike **every** other confirm pair in the repo (`keep-booking`, `keep-request`). `appBusy` is what consumes the click, so tapping "Keep my review" while the DELETE it confirmed was in flight dismissed the confirmation and then announced the removal anyway | **closed** — both buttons busy-guarded; pinned by two `review-panel.spec.ts` cases that fail without it |
| F-4 | Review gate (bug scan) | `editing` / `confirmingDelete` reset only when a new panel object arrived, so a write that succeeded while its re-read failed left a live "Yes, remove it" under a "review removed" line — `confirmCancel` / `confirmWithdraw` reset their own flags instead of relying on the reload | **closed** — D-7's `settle()`; pinned by `booking-view.spec.ts` "closes the delete confirmation even when the re-read after it fails" |
| F-5 | Review gate (ran the unproven suite) | `frontend/e2e/real-backend/reviews.e2e.ts` asserted `review-panel` had **count 0** before check-in — slice-1 behaviour that **this slice's own AC-6 replaced** with the "once the staff have checked you in" note. The spec was authored, never executed, so nothing caught it | **closed** — asserts the ineligibility note and the absence of a form; the whole spec now passes against a live stack |
| F-6 | Review gate (comment compliance) | `OwnReview`'s Javadoc said "every review written since carries both" — false for `comment`, which stays optional (`ReviewControllerTest.aBlankCommentReachesTheUseCaseAsNoComment` records exactly such a row). A published `vocabulary` type telling a consumer a nullable field is non-null | **closed** — the contract now separates the required display name from the optional comment |
| F-7 | Review gate (comment compliance) | `ReviewUniquenessIT` and `ReviewMigrationIT` kept "one review per booking, **ever**", which this slice falsified (a delete frees the slot) and corrected in `package-info.java` and `RESPONSIBILITIES.md` — but not in the two test files it was editing at the same time | **closed** — both read "at most one review per booking" |
| F-8 | Review gate (counting sweep) | `RateLimitFilter` updated its "six → eight booking endpoints" counts in three places and missed a fourth: "the **four** code-keyed endpoints", now six. `RateLimitProperties`' own "four"/"three" were already stale before this slice and are wrong again after it | **closed** — both files carry eight / six. The `RateLimitProperties` half is a pre-existing drift the counting sweep caught, fixed here rather than left behind |
| F-9 | Review gate (RV-BE-10) | Three refusal `code` + `detail` pairs are now emitted from **two** switches (submit and amend) as hand-typed twins — the drift class #644 closed with `CurrentPasswordDetailTwinTest`, reopened without its guard | **closed** — hoisted to `noSuchBooking()` / `notCheckedIn()` / `windowClosed()`. Both switches call one method, so the pair cannot drift rather than being watched for drift |
| F-10 | Review gate (D-5 adjudication) | The `@if (b.reviewPanel; as …)` guard wrapped a field the wire cannot omit, contradicting the non-optional TS type and masking any regression that did drop it. The real gap was the untyped e2e fixtures | **closed** — guard removed; all six booking-detail fixtures (`find-a-booking`, `request-to-book`, `same-day-booking`, `booking-flow`, `suppressed-confirmation`, `touch-targets-tourist`) carry `reviewPanel`, so those journeys now exercise the shape the server actually sends. The last three were found the honest way — by the mocked suite going red on the removal, not by grep |
| F-11 | Review gate (RV-FE) | `writeReview`'s error branch never re-read the booking, unlike `confirmCancel` / `confirmWithdraw` — so a `NO_SUCH_REVIEW` left the confirm dialog offering to delete a review the server had just said was gone | **closed** — a *settled* refusal now re-reads (a blanket re-read would discard a guest's unsaved edit on a transient 5xx). The refusal codes and their copy are one map, so the two can't name different codes |
| F-12 | Review gate (RV-FE-9) | `startEdit` / `cancelEdit` move focus correctly, but nothing asserted either — and the mechanical focus guard is satisfied once *one* flip site moves focus, so it silently exempts the other. Delete got all three legs pinned; edit got none | **closed** — one spec pins both legs |
| F-13 | Review gate (a11y) | The two new field errors are `role="alert"` siblings with no `aria-describedby` from their field, so a screen-reader user tabbing back later gets no restatement | **deferred — follow-up #821.** Repo-wide: all 24 inline field errors do it this way and none associates. Fixing two of them here would be a one-off inconsistency, not an improvement |
| F-14 | Review gate (comment compliance) | `SubmitReviewRequest`'s TSDoc said "the three review verbs (`POST`/`PUT`)" — self-contradictory; `DELETE` carries no body | **closed** — "the two review writes" |
| F-1 | CI (process) | Phase 4's own CI run was **cancelled by the concurrency group** when phase 5 was pushed ~20 minutes later, so that phase never got its own green run — a miss against the riviera-sdlc CI-gate rule ("check that push's run before starting the next phase"). Phases 0-3 were each checked (phase 3's run was green on all eight checks), and phase 5's run covers the cumulative tree including phase 4 | closed — the per-phase evidence does not exist and cannot be recovered, but the gap it left is now covered by something stronger than a re-run would have been: the review gate exercised phase 4's surface directly (F-3, F-4, F-10, F-11, F-12 all landed in it) and the fix round's own CI run is green on the cumulative tree |

---

## File structure

- `platform/src/main/resources/db/migration/V46__review_comment_display_name.sql` — new columns + CHECKs
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewText.java` — comment/name bounds + messages
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewGate.java` — the fence order, stated once (pure)
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewWindow.java` — gains `closesAt`, so the panel's deadline is the window's own arithmetic
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewState.java` — relocated from `vocabulary/` (no cross-module consumer remains)
- `platform/src/main/java/ai/riviera/platform/review/application/Reviews.java` — port gains `findFor`, `update`, `delete`; `claim` widens
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewSubmission.java` — `(int stars, String comment, String displayName)` internal value
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewLifecycle.java` — the one internal driving port (evolves `SubmitReview.java`, which is deleted)
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewLifecycleService.java` — the one service (replaces `SubmitReviewService.java`)
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewEligibilityService.java` — becomes the `panelFor` implementation
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewPanel.java` — sealed panel (+ nested variants)
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/OwnReview.java` — published read record
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/AmendOutcome.java` — sealed outcome for edit + delete
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewState.java` — deleted (moves to `domain/`)
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/package-info.java` — the published-vocabulary list follows the surface change
- `platform/src/main/java/ai/riviera/platform/review/api/ReviewEligibility.java` — `stateFor` → `panelFor`
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/ReviewController.java` — body widens; PUT + DELETE mappings
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/SubmitReviewRequest.java` — comment/displayName + compact-ctor bounds
- `platform/src/main/java/ai/riviera/platform/review/adapter/out/JdbcReviews.java` — new SQL (stays sole writer)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — panel + name suggestion
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — `reviewPanel`, `reviewable` dropped
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — wire mirror (exhaustive switch over the sealed panel)
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — the `review::api` grant comment follows the surface change
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — PUT/DELETE permitAll + CSRF-ignore rows
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — PUT/DELETE join the per-code review budget (count comment updated)
- `platform/src/test/java/ai/riviera/platform/review/**/*.java` — new/extended: `ReviewMigrationIT`, `ReviewGateTest`, `ReviewLifecycleServiceTest` (replaces `SubmitReviewServiceTest`), `ReviewEligibilityServiceTest`, `ReviewLifecycleFlowIT`, `ReviewUniquenessIT`
- `platform/src/test/java/ai/riviera/platform/ReviewControllerTest.java` — new verbs + 400 bounds + code-redaction sweep
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stubs for the evolved ports
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — two new DECLARED_REACHABLE rows
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — the three review verbs share one per-code budget
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — panel pass-through + suggestion
- `platform/src/test/java/ai/riviera/platform/venue/VenueRatingRecomputeIT.java` — delete-to-"New" case
- `platform/src/test/java/ai/riviera/platform/review/ReviewFixtures.java` — helpers for commented reviews
- `frontend/src/app/booking/review-panel.ts` · `.spec.ts` · `.contrast.spec.ts` — the extracted panel
- `frontend/src/app/booking/booking-view.ts` · `booking-view.spec.ts` · `booking-view.contrast.spec.ts` — embed + trimmed
- `frontend/src/app/booking/booking.model.ts` · `booking.service.ts` · `booking.service.spec.ts` — contract + verbs
- `frontend/src/app/booking/booking-pay.spec.ts` · `find-booking.spec.ts` · `my-bookings.spec.ts` — `BookingDetail` fixtures follow the contract change
- `frontend/e2e/review-a-stay.e2e.ts` — fixtures to `reviewPanel`; submit-with-comment journey
- `frontend/e2e/review-lifecycle.e2e.ts` — edit / delete / frozen / ineligible journeys
- `frontend/e2e/my-bookings.e2e.ts` — signed-in COMPLETED row → review form journey
- `frontend/e2e/touch-targets-tourist.e2e.ts` — panel controls in the sweep
- `frontend/e2e/real-backend/reviews.e2e.ts` — comment+edit+delete on the true loop
- `RESPONSIBILITIES.md` — §review Shipped ¶ + published-surface note, §booking `reviewable` ¶
- `CLAUDE.md` — the `review` row of the bounded-context table
- `platform/src/main/java/ai/riviera/platform/review/package-info.java` — the module's own one-line summary
- `CONTEXT.md` — Display name + Frozen review vocabulary entries
- `docs/plans/reviews-s2-comment-lifecycle.md` — this plan

**Added by the review-gate fix round** (findings F-3 … F-12, below):

- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — the per-IP / per-code endpoint counts follow the two new verbs
- `docs/adr/ADR-0015-review-leaf-module.md` — the rejected alternative's argument stops naming the retired `reviewable` flag
- `frontend/e2e/find-a-booking.e2e.ts` · `request-to-book.e2e.ts` · `same-day-booking.e2e.ts` · `booking-flow.e2e.ts` · `suppressed-confirmation.e2e.ts` · `touch-targets-tourist.e2e.ts` — every booking-detail fixture carries `reviewPanel`, the field the wire always sends

---

## Phase 0 — V46 migration + store-port widening

**Files:** Create `V46__review_comment_display_name.sql`, `ReviewText.java` ·
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

and widen `Reviews` + `JdbcReviews` — `claim` gains `comment`/`displayName` params; new
`Optional<OwnReview> findFor(BookingRef)` (mapping straight to the vocabulary record —
no shallow duplicate type), `boolean update(BookingRef, int stars, String comment,
String displayName, Instant at)`, `boolean delete(BookingRef)` — text-block SQL, named
params, all inside `review/adapter/out`.

- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*ReviewMigrationIT*" --tests "*ReviewUniquenessIT*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — N/A (no bug fix; new columns follow the
  `VenueFieldValidation`/V43 bounded-text mechanism already audited there)
- [ ] **Step 6: Commit** — `git commit -m "Add review comment/display-name columns and store operations (#812)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — review gate + submit with comment/display name

**Files:** Create `ReviewGate.java`, `ReviewSubmission.java`, `ReviewLifecycle.java`,
`ReviewLifecycleService.java` · Move `ReviewState.java` vocabulary→domain · Delete
`SubmitReview.java`, `SubmitReviewService.java` · Modify `SubmitReviewRequest.java`,
`ReviewController.java`, `ReviewEligibilityService.java`, `WebSliceStubs.java` · Test
`ReviewGateTest.java`, `ReviewLifecycleServiceTest.java`, `ReviewControllerTest.java`,
`ReviewSubmitFlowIT.java`

- [ ] **Step 1: Failing tests** — `ReviewGateTest` (one test per state; the fence-order
  pin `ratedAndFrozenReadsAsFrozen` moves here from the service tests);
  `ReviewLifecycleServiceTest.recordsCommentAndDisplayNameAndPublishes` (fake `Reviews`
  records the tuple; recording publisher sees `ReviewsChanged`);
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

- [ ] **Step 2: Verify fail** — `./gradlew test --tests "*ReviewGate*" --tests "*ReviewLifecycleServiceTest*" --tests "*ReviewControllerTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `ReviewGate.stateOf(...)` (pure, order:
  unknown → NO_SUCH_STAY; known-not-completed → NOT_COMPLETED; window closed →
  WINDOW_CLOSED; reviewed → ALREADY_REVIEWED; else ELIGIBLE); `ReviewState` relocates to
  `domain/`; `ReviewLifecycle.submit(code, ReviewSubmission)` implemented by the new
  service: gate → `reviews.claim(...)` → publish. `ReviewEligibilityService` re-plumbs
  onto the gate (still returning its slice-1 shape until phase 3). Edge validation in
  `SubmitReviewRequest`'s compact ctor, `VenueFieldValidation` shape: strip both texts;
  blank comment → `null`; code-point bound checks throwing
  `InvalidApiRequestException(ReviewText.…_DESCRIPTION)`; blank displayName refused.
- [ ] **Step 4: Verify pass, then end-of-phase regression** —
  `./gradlew test --tests "*Review*"` → PASS
- [ ] **Step 5: Generalization-audit** — population: every edge DTO with a bounded text
  field (`git ls-files 'platform/*adapter/in*.java' | xargs grep -l codePointCount` +
  `VenueFieldValidation` callers) → confirm the new DTO matches the mechanism; no fix expected.
- [ ] **Step 6: Commit** — `git commit -m "Review gate as domain policy; accept comment and display name on submit (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 2 — edit + delete on the lifecycle port + edge wiring

**Files:** Create `vocabulary/AmendOutcome.java`, `ReviewLifecycleFlowIT.java` · Modify
`ReviewLifecycle.java`, `ReviewLifecycleService.java`, `ReviewController.java`,
`SecurityConfig.java`, `RateLimitFilter.java`, `WebSliceStubs.java`,
`EndpointRoleGateCoverageTest.java`, `ReviewUniquenessIT.java`, `VenueRatingRecomputeIT.java`

- [ ] **Step 1: Failing tests** — `ReviewLifecycleServiceTest`: `editUpdatesAndRepublishes`,
  `editRefusesAfterTheWindow`, `editWithoutAReviewIsNoSuchReview`, `deleteRepublishes`,
  the delete mirrors; `VenueRatingRecomputeIT.aDeletedSoleReviewReturnsTheVenueToNew`:

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
- [ ] **Step 3: Minimal implementation** — `edit`/`delete` on `ReviewLifecycleService`:
  gate → map refusal onto `AmendOutcome` (`ALREADY_REVIEWED` is the *go* state for
  amends, `ELIGIBLE` maps to `NoSuchReview`) → `reviews.update/delete` (rows-affected
  `false` → `NoSuchReview`, R-10) → publish `ReviewsChanged`. Controller:
  `@PutMapping("/{code}/review")` + `@DeleteMapping("/{code}/review")`, exhaustive
  switch over `AmendOutcome` → `204` / `ApiProblem` (`NO_SUCH_REVIEW` new code, A-5).
  Edge rows: `SecurityConfig` permitAll + CSRF-ignore; `RateLimitFilter` review budget
  matches all three verbs; coverage-test rows.
- [ ] **Step 4: Verify pass + regression** — `./gradlew test --tests "*Review*" --tests "*VenueRating*" --tests "*EndpointRoleGate*" --tests "*ErrorContract*"` → PASS
- [ ] **Step 5: Generalization-audit** — population: every publisher of `ReviewsChanged`
  (`grep -rl "new ReviewsChanged" platform/src/main/java`) → all three lifecycle verbs
  publish from the one service; decision recorded in the log.
- [ ] **Step 6: Commit** — `git commit -m "Edit and delete an own review within the window (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 3 — sealed panel read + name suggestion

**Files:** Modify `ReviewEligibility.java`, `ReviewEligibilityService.java`, create
`vocabulary/ReviewPanel.java`, `vocabulary/OwnReview.java` (moved from phase 0 if not
yet public) · Delete `vocabulary/ReviewState.java` (now `domain/`) · Modify
`ViewBookingService.java`, `BookingDetail.java`, `BookingDetailView.java`,
`WebSliceStubs.java` · Test `ReviewEligibilityServiceTest.java`, `ViewBookingServiceTest.java`

- [ ] **Step 1: Failing tests** — `ReviewEligibilityServiceTest.panelCarriesTheOwnReview`
  (+ one test per sealed variant incl. `Frozen` carrying the review and `WindowClosed`
  for never-reviewed-too-late), `ViewBookingServiceTest`:

```java
@Test
void suggestsTheContactFirstNameForTheReviewForm() {
    customers.put(CUSTOMER_ID, new GuestContact("ana@example.com", "Ana Kelmendi", "+355…"));
    BookingDetail detail = service.byCode(COMPLETED_CODE).orElseThrow();
    assertEquals("Ana", detail.reviewNameSuggestion());
}

@Test
void reviewPanelFollowsReviewEligibility() { /* one case per sealed variant, pass-through */ }
```

- [ ] **Step 2: Verify fail** → FAIL
- [ ] **Step 3: Minimal implementation** — `panelFor` composes the gate + `reviews.findFor`
  into the sealed `ReviewPanel` (WINDOW_CLOSED + stored review → `Frozen(review)`;
  without → `WindowClosed()`); `ViewBookingService` carries the panel on `BookingDetail`
  and derives the suggestion (first whitespace token of `GuestContact.fullName`, `null`
  when absent/blank) only for `Eligible`; `BookingDetailView` maps the sealed type to
  the wire union by exhaustive switch. `reviewable` and the published `ReviewState` are
  deleted end-to-end.
- [ ] **Step 4: Verify pass + regression** — `./gradlew test --tests "*Review*" --tests "*ViewBooking*" --tests "*ModularityTests*" --tests "*PackageShape*" --tests "*PublishedSurfacePlacement*"` → PASS (structural net after the surface change)
- [ ] **Step 5: Generalization-audit** — population: every consumer of the old
  `stateFor`/`ReviewState`/`reviewable` (`grep -rln "stateFor\|ReviewState\|reviewable" platform/src frontend/src frontend/e2e`) → enumerate and migrate each.
- [ ] **Step 6: Commit** — `git commit -m "Sealed review panel on the code-gated read, with a name suggestion (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 4 — frontend panel (form / own / frozen / messaging)

**Files:** Create `booking/review-panel.ts` + `.spec.ts` + `.contrast.spec.ts` · Modify
`booking-view.ts` + specs, `booking.model.ts`, `booking.service.ts` + spec

- [ ] **Step 1: Failing tests** — `review-panel.spec.ts`: renders the form for
  `ELIGIBLE` with the name prefilled from `nameSuggestion`; comment over 1000 →
  inline error after submit attempt; `ALREADY_REVIEWED` renders stored review + edit +
  delete (confirm panel); `FROZEN` renders the read-only review + why; `WINDOW_CLOSED`
  renders the too-late note; `NOT_COMPLETED` on a CONFIRMED booking renders the check-in
  note, on CANCELLED renders nothing (A-3); axe run last. `booking.service.spec.ts`:
  `updateReview` PUTs, `deleteReview` DELETEs (also backfills the missing `review()`
  POST test noted in the survey).
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

  Panel `input()`s: `panel` (the union), `bookingStatus`; template is an exhaustive
  `@switch (panel().kind)`; `output()`s: `submitted`, `updated`, `deleted` (parent keeps
  HTTP + `load(true)` + the `review-result` live region + `focusMover`). Edit mode seeds
  the model via `value.set()` from the panel's `review`. Textarea: field recipe +
  `rows="4" resize-y` + `maxlength` attr; controls carry `appTouchTarget`; delete via
  confirm-panel pattern with `cls.btnOutlineDanger`. New copy strings keep
  `text-riv-error-ink`/token inks; contrast rows added for the frozen banner.
- [ ] **Step 4: Verify pass + regression** — `npm test` (booking specs) + `npm run lint`
  + `npm run format:check` → PASS
- [ ] **Step 5: Generalization-audit** — population: every template/fixture use of
  `reviewable` (`grep -rn "reviewable" frontend/src frontend/e2e`) → all migrated to `reviewPanel`.
- [ ] **Step 6: Commit** — `git commit -m "Review panel: comment form, own review, edit/delete, ineligibility messaging (#812)"`
- [ ] **Step 7: Update execution status.**

---

## Phase 5 — e2e journeys + docs freshness + close-out

**Files:** Modify `frontend/e2e/review-a-stay.e2e.ts`, `my-bookings.e2e.ts`,
`touch-targets-tourist.e2e.ts`, `frontend/e2e/real-backend/reviews.e2e.ts` · Create
`frontend/e2e/review-lifecycle.e2e.ts` · Modify `RESPONSIBILITIES.md`, `CONTEXT.md`

- [ ] **Step 1: Author the mocked journeys** (stateful `page.route` flip pattern per the
  slice-1 spec): submit-with-comment (captures `postDataJSON()` → `{stars, comment,
  displayName}`), edit (fixture flips to the `ALREADY_REVIEWED` panel; PUT captured;
  copy updates), delete (DELETE captured; venue fixtures flip back to `0/0` → "New"),
  frozen (`FROZEN` panel → read-only + why), window-closed and ineligible
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
  still isn't) + the published-surface note (`ReviewState` no longer published; sealed
  `ReviewPanel` is), §booking's "`reviewable` flag" ¶ → panel wording, CONTEXT.md
  "Display name" + "Frozen review" entries; file the R-4 erasure follow-up issue.
- [ ] **Step 5: Guard + self-review** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
  (plan doc staged) + the Self-review checklist; finalize Execution status.
- [ ] **Step 6: Commit** — `git commit -m "Review lifecycle e2e journeys and doc freshness (#812)"`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | Phase 5 — `riviera-docs-freshness` over `origin/main..HEAD` (see the run record below) | the substrate-doc map, twice: the rename/removal grep for `reviewable`/`ReviewState`/`stateFor`, then the counting sweep over the review vocabulary | `grep -rn "ReviewState\|stateFor\|reviewable" CLAUDE.md CONTEXT.md RESPONSIBILITIES.md docs/adr docs/agents docs/design .claude/skills` + `grep -rn "one per booking" …` | 7 stated facts falsified across 4 files | all patched (below); re-run after the fix round came back clean |
| 2026-08-30 | Phase 4 — frontend uses of the retired `reviewable` flag | every template, model and fixture reading the slice-1 boolean | `grep -rn "reviewable" frontend/src frontend/e2e` | 8 files — `booking.model.ts`, `booking-view.ts` + its spec, four sibling `BookingDetail` fixtures, and the two e2e specs | all eight migrated to `reviewPanel`; the two e2e specs land in phase 5 with the journeys that exercise them |
| 2026-08-30 | Phase 3 — consumers of the retired `stateFor` / `ReviewState` / `reviewable` | everything reading the slice-1 shape of the review verdict, across both apps | `grep -rln "reviewable\|ReviewState\|stateFor" platform/src frontend/src frontend/e2e` | 22 files — 9 backend main, 8 backend test, 5 frontend (`booking.model.ts`, `booking-view.ts`, three specs) plus the two e2e specs | every backend site migrated in this phase (incl. the two `package-info` javadocs the grep found); the frontend sites are phase 4's step 5 by design, so the app reads the retired flag for exactly one commit |
| 2026-08-30 | Phase 2 — publishers of `ReviewsChanged` | every site that announces a moved venue aggregate; the risk is a lifecycle verb writing without announcing | `grep -rn "new ReviewsChanged" platform/src/main/java` | 2 — both in `ReviewLifecycleService` (the claim path and the shared amend path) | none needed: all three verbs route their write through one of those two lines, so "wrote but did not announce" is unrepresentable rather than merely tested |
| 2026-08-30 | Phase 1 — bounded free text on an edge DTO | the repo's one bounded-text edge mechanism: strip first, then bound in **code points** so Postgres `char_length` never rejects what Java accepted | `git ls-files 'platform/*adapter/in*.java' \| xargs grep -ln codePointCount` (none — the mechanism lives one layer in) + `grep -rln VenueFieldValidation platform/src/main` | 7 venue application commands via `VenueFieldValidation.requireText(value, field, maxLength)` | none needed — `ReviewText.fitsComment`/`fitsDisplayName` mirror it exactly (strip in the compact ctor, then code-point bound); the review edge keeps `InvalidApiRequestException` because it is the DTO itself, not an application command |

## Docs-freshness run (phase 5)

Range `origin/main..HEAD`. Seven stated facts falsified, all patched in the phase-5 commit:

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `CONTEXT.md` §Reviews | "a star rating of 1–5 … **a rating is not revised**" | the whole slice: reviews carry words and a name, and their author may change or remove them inside the window | patched — plus new **Display name** and **Frozen review** entries the messaging needs |
| `CONTEXT.md` §Reviews | "One per booking, **ever**" | a delete frees the slot while the window is open | patched to "one per booking", a standing constraint rather than a one-shot |
| `CLAUDE.md` module table, `review` row | "the review record (one per booking, ever), the eligibility + 60-day review-window policy" | comment/display name and the own-review lifecycle | patched |
| `RESPONSIBILITIES.md` §`booking` | "The `reviewable` flag on my code-gated read is mine to carry" | the flag is gone; a sealed panel plus a name suggestion replaced it | patched |
| `RESPONSIBILITIES.md` §`review` Job + 4 standing rules | one-shot wording, "submitting stays an internal port", `POST`-only authorization | the lifecycle port, the gate, the sealed panel, three verbs on one budget | patched |
| `RESPONSIBILITIES.md` §`review` Not-My-Job | "slice 1 stores **no display name at all**" | V46 stores one | patched — it is a label the author chose, not an identity `review` resolves |
| `RESPONSIBILITIES.md` §`review` Shipped ¶ | slice-1 inventory, "comments, display names … are later slices" | they shipped here | patched, and it now names the erasure hook (#820) as what is still outstanding |
| `platform/**/review/package-info.java` | "the review record (one per booking, ever)" | same as the module table | patched (source prose counts — it is what the next reader believes) |

**Flagged, not patched:** `docs/adr/ADR-0015` §rejected-alternatives argues that an event-fed
projection "leaves `reviewable=false` for a guest who opens their booking page in the seconds
after check-in". The field it names no longer exists, but the sentence is the *reasoning* behind a
rejected alternative, not a present-tense fact about the system — rewriting an ADR's argument to
match today's field names is exactly what this skill's scope discipline forbids. Left for the
maintainer to judge.

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-7:** `gradle test --tests "*Review*" --tests "*ViewBooking*" --tests "*VenueRating*"`
  → PASS locally against the hook-provided Docker (every IT ran; `skipped=0`), and the full suite
  green in CI on every phase push. Verified through `eaf57d7` (the last backend phase).
- [x] **AC-8:** `npm run test:e2e:a11y` → **306 passed** (the whole mocked suite, not just the new
  specs), plus `npm test` → 2059 unit tests green. Verified at the phase-5 commit.
- [x] **The real-backend loop** (local-only, never CI): `frontend/e2e/real-backend/reviews.e2e.ts`
  extended to submit-with-comment → edit → delete with the venue header polled after each. Authored,
  not executed here — the container has no running stack (`riviera-local-debug`), so this one is
  proven by review and by its mocked twin, and is the honest gap in the AC table.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [x] **Availability** section filled; concurrency covered by `ReviewUniquenessIT` (invariant #2 untouched).
- [x] Pool + cutoff rules honored — N/A, no reserve path (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based; the published surface **shrank** (`ReviewState` retired to `domain/`) rather than leaked (invariant #11). `ModularityTests` + `PackageShapeArchitectureTests` + `PublishedSurfacePlacementArchitectureTests` green.
- [x] **Payment/payout** N/A (invariants #5, #8, #9).
- [x] Refund policy — N/A (invariant #10).
- [x] Timezone correct: `updated_at`/`windowClosesAt` UTC instants in `TIMESTAMPTZ`; the deadline renders through `shared/deadline.ts` in `Europe/Tirane` (invariant #6).
- [x] Booking codes never in error bodies/logs (invariant #7) — the redaction sweep extended to PUT and DELETE.
- [x] Flyway V46 present; both CHECKs tested by `ReviewMigrationIT` (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract (the one cast in the e2e mock is on a request body the mock itself reads back).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, deviations, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (R-4 deferred to issue **#820**).
- [x] **Close-out written in THIS PR** (#819). The `merged via PR #NN` citation is the merging session's to add — this session stops before the merge by request.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`. **NOT RUN, deliberately:** the maintainer asked for the review, the Sonar-gate triage and the merge to happen in a separate session. This box is the follow-up session's to tick.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
