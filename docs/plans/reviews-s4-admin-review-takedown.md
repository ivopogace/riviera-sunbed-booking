# Reviews slice 4 — admin review takedown: hide / un-hide with audit

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A platform admin lists any venue's reviews (hidden ones marked), hides any of
them and un-hides one hidden in error; a hidden review leaves both the public list and the
aggregate score/count on every surface (hiding a venue's only review returns it to "New"),
un-hide restores both, both actions land in the admin audit record, and a hidden review is
frozen for its author — readable on their booking page, marked as removed from public view,
never editable or deletable back into circulation.

**Architecture:** `review` stays a leaf (ADR-0015) and grows one **internal** application
port, `ReviewModeration` (the `ReviewLifecycle` / `VenuePhotoModeration` posture:
ownership-free, its only caller this module's own admin REST adapter under `/api/admin/**`,
which the edge role-gates to ADMIN — invariant #13's admin exemption). Hide is a reversible
soft flag, `review.hidden_at` (`NULL` = visible), and the visibility predicate lands in
exactly the two `WHERE`s slice 3 named for it — `totalsFor` and `newestListedBefore` — so
`venue`'s existing `ReviewsChanged` listener excludes hidden reviews by re-reading the same
port it already re-reads; hide/un-hide publish that same event. The author's fence is one
new verdict in `ReviewGate` (`HIDDEN`, ordered before the window), so the panel read and the
amend path agree by construction. The audit needs **no code**: `AdminAuditFilter` records
every mutating `/api/admin/**` request, target id in the path. No new module edge.

**Persistence:** JDBC only (invariant #1). One forward migration **V48** adds
`review.hidden_at TIMESTAMPTZ NULL`; no new index (both reads keep seeking
`review_venue_listing_idx (venue_id, id)` and filter the few hidden rows after the seek).

**Source of intent:** issue #814 (epic #810, user stories 21–24; ADR-0013's
report-and-remove posture applied to reviews).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the audit is filter-driven so AC-4 needs a pin, not code; that the hide must survive the
author's *delete-and-resubmit* path, not just edit; and that `admin_audit_record` carries
no target column, so the review id must ride in the path) · `riviera-plan-doc` (this
template — forced the author-view decision D-1 and the gate-order decision D-4 to be written
down before phase 0) · `tdd` (each phase is one seam: the migration + predicate, the
moderation port, the gate, the REST edge, the admin tab) · `riviera-review-overlay` (review
gate — due at ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 6 findings, all patched: `AdminAuditLog`'s "five modules", `AdminSurfaceRoleGateTest`'s anchor count (F-5), the tab spec's "at most eight", two e2e headers' "seven tabs", and the admin-console artboard's tab order, which gained the README's as-built pointer) ·
`postgres` (nullable `TIMESTAMPTZ` over a boolean so the admin list can say "hidden since";
no index for a low-selectivity predicate already inside an index seek) · `riviera-modulith`
(the port stays internal in `application/` — nothing outside `review` calls it — and the
controller lives in `review/adapter/in`, the `AdminVenuePhotoController` precedent; no
grant changes) · `riviera-java-conventions` (sealed `ModerationOutcome`, `Optional` from the
store, the §6b error contract for `404 NO_SUCH_REVIEW` / `409 REVIEW_HIDDEN`, one-line
comments) · `codebase-design` (deepened `Reviews.findFor` to return the stored review with
its hidden flag instead of adding a sibling `isHidden` query; one `ReviewSlot` enum instead
of two coupled booleans on the gate) · `domain-modeling` (CONTEXT.md gains **Review
takedown** and **Hidden review**; no ADR — reversible, unsurprising given ADR-0013, no real
trade-off) · `riviera-frontend` (the new tab is four files in `admin/`; the venue picker's
list promoted to `admin/admin-venues.service.ts` so two tabs share it inside one feature) ·
`angular-developer` + angular-cli MCP (signals, `@switch` on the panel `kind`, `[appBusy]`
never `[disabled]`, `focusMover()` on every leg that destroys the focused control) ·
`riviera-tailwind` (token-first, `[appTouchTarget]` on every control, `ConfirmWithReason`
reused; copy differs from the photo takedown because hide is reversible) · `playwright-cli`
(the mocked journey is stateful: the hide mutates the mock, the public reads serve from it)
· `riviera-local-debug` (scoped classes; one IT class at a time).

**Branch:** `claude/sdlc-814-7kf2fq` — the session's designated remote branch stands in for
`feature/reviews-s4-admin-review-takedown` (`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue with two visible reviews (4★, 5★) and one hidden review (1★),
  when its aggregate is read, then it is `RatingSummary(45, 2)` — the hidden review counts
  for nothing. *Seam:* `review.api.VenueRatingSummary` · *Pinned by:*
  `ReviewModerationFlowIT.hiddenReviewsLeaveTheAggregate`
- [x] **AC-2:** Given a venue with a visible commented review and a hidden commented review,
  when the public page is read, then only the visible one is listed. *Seam:*
  `review.api.ListedReviews` · *Pinned by:* `ReviewModerationFlowIT.hiddenReviewsLeaveTheList`
- [x] **AC-3:** Given a visible review, when it is hidden, then the outcome is `Applied` and
  exactly one `ReviewsChanged(venue)` is published; when it is hidden again, then the outcome
  is `AlreadyApplied` and nothing is published (idempotent, converging). *Seam:*
  `review.application.ReviewModeration` (the admin adapter's port) · *Pinned by:*
  `ReviewModerationServiceTest.hidePublishesOnceAndIsIdempotent`
- [x] **AC-4:** Given a hidden review, when it is un-hidden, then it is back in both the
  aggregate and the list, and a second un-hide is `AlreadyApplied`. *Seam:*
  `ReviewModeration` + `VenueRatingSummary` + `ListedReviews` · *Pinned by:*
  `ReviewModerationFlowIT.unhideRestoresBothSurfaces`,
  `ReviewModerationServiceTest.unhidePublishesOnceAndIsIdempotent`
- [x] **AC-5:** Given a venue whose only review is hidden, when `venue` recomputes on
  `ReviewsChanged`, then its stored columns read `0/0` — the "New" rendering. *Seam:*
  `review.events.ReviewsChanged` → `venue`'s listener → the venue row · *Pinned by:*
  `VenueRatingRecomputeIT.aHiddenSoleReviewReturnsTheVenueToNew`
- [x] **AC-6:** Given a venue with a visible commented review, a star-only review and a hidden
  review, when the admin list is read, then all three appear newest first, each with its
  `hiddenAt` (`null` for visible), ten per page with a cursor to the next. *Seam:*
  `ReviewModeration#pageFor` · *Pinned by:* `ReviewModerationFlowIT.adminListShowsEveryReviewMarked`
- [x] **AC-7:** Given an ADMIN session, when `GET /api/admin/venues/{venueId}/reviews`,
  `POST /api/admin/reviews/{id}/hide` and `POST /api/admin/reviews/{id}/unhide` are called,
  then they answer `200` / `204` / `204`; a plain OPERATOR gets `403` and an anonymous caller
  `401` on each; an unknown review id is `404 NO_SUCH_REVIEW` (`application/problem+json`).
  *Seam:* the three routes · *Pinned by:* `AdminReviewTakedownIT.adminHidesAndUnhides`,
  `AdminReviewTakedownIT.takedownIsAdminOnly`, `AdminReviewTakedownIT.unknownReviewIs404`,
  plus `AdminSurfaceRoleGateTest` (auto-discovers the routes; the list read is one of its
  cross-module anchors) — `EndpointRoleGateCoverageTest` needs no row: it declares only the
  role-free endpoints, and a gated one is what it checks by default
- [x] **AC-8:** Given an ADMIN session, when a hide is posted with an `X-Audit-Reason`
  header and an un-hide without, then `admin_audit_record` gains one row each — actor, `POST`,
  the exact path (`/api/admin/reviews/{id}/hide` / `…/unhide`), status `204`, the sanitized
  reason (`null` when absent). *Seam:* the routes + the audit table · *Pinned by:*
  `AdminReviewTakedownIT.hideAndUnhideAreAudited`
- [x] **AC-9:** Given a hidden review, when its author's booking page is read, then the panel
  is `ReviewPanel.Hidden(review)` — even past the window (hidden is decided before frozen);
  when the author edits or deletes, then `AmendOutcome.Hidden`; when they submit again, then
  `SubmitOutcome.AlreadyReviewed` (the slot stays taken). *Seam:* `review.domain.ReviewGate`
  (the fence order) + `review.api.ReviewEligibility` + `ReviewLifecycle` · *Pinned by:*
  `ReviewGateTest.aHiddenReviewReadsAsHiddenEvenPastTheWindow`,
  `ReviewEligibilityServiceTest.aHiddenReviewPanelsAsHidden`,
  `ReviewLifecycleServiceTest.aHiddenReviewCannotBeEditedOrRemoved`; the wire
  `409 REVIEW_HIDDEN` by `ReviewControllerTest.aHiddenReviewIsAConflict`, the `Hidden` panel carried through `booking`'s
  read model by `ViewBookingServiceTest.reviewPanelFollowsReviewEligibility`
- [x] **AC-10:** Given the booking page receives `reviewPanel.kind = 'HIDDEN'`, when it
  renders, then it shows the guest's own review under a "removed from public view" note with
  no edit or delete control. *Seam:* `app-review-panel`'s `panel` input · *Pinned by:*
  `review-panel.spec.ts` ("a hidden review is shown read-only with the removal note")
- [x] **AC-11:** Given the mocked e2e stack with a venue at 4.5 over 2 reviews, when the
  admin hides one review from `/admin/reviews`, then the venue page header reads the new
  score/count and the list no longer shows that review; when the admin hides the other, then
  the header reads "New"; when the admin un-hides one, then it is back. *Seam:* the
  `/admin/reviews` page + the public `/venues/:id` page over stateful route mocks · *Pinned
  by:* `frontend/e2e/admin-reviews.e2e.ts` ("hide → public surfaces update → un-hide restores")
- [x] **AC-12:** Given the admin Reviews tab in its list, confirm and notice states, when axe
  runs and the touch-target sweep measures it, then no serious violation and every control
  meets 44×44. *Seam:* the rendered page · *Pinned by:* `admin-reviews.a11y.spec.ts`,
  `admin-reviews.e2e.ts` (axe at three states), `touch-targets-admin.e2e.ts` (the new row)

## Non-goals

- A **reason column on the review row** — the grounds live in the audit record
  (`X-Audit-Reason`), as for every admin surface.
- A **pre-moderation queue**, tourist/operator **reporting**, or an operator-facing hide —
  publish-first stays the stance; only the platform admin moderates.
- **Erasure** of review PII — #815 (slice 5).
- Any change to the venue page, the Discover card, the "New" chip or `shared/rating.ts` —
  hidden reviews simply stop feeding them.
- Telling the **public** that a review was hidden (no tombstone row in the list).
- Retention / purge of hidden reviews; a hard delete lever.
- A `resource()` migration of the admin tabs — the new tab follows `admin-venue-photos.ts`'s
  request idiom.

## Behavior-parity ledger

N/A for the new surfaces — new behavior, replaces nothing. One touched existing surface:
`admin-venue-photos.service.ts`'s `venues()` moves to `admin/admin-venues.service.ts` so the
Reviews tab shares it.

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| `AdminVenuePhotosService.venues()` reads `GET /api/admin/venues`, maps `venueId → id`, drops `commissionBps`, includes hidden venues | preserved | `AdminVenuesService.venues()` is the same method, moved; `admin-venue-photos.service.spec.ts`'s "lists venues" case moves with it and the photos page injects the new service |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Flyway V48 collision with in-flight work | low | high | Checked 2026-09-02: V47 highest on `main`, **zero** open PRs. If one appears, this branch renumbers (merges second); re-check at the merge-from-main | agent | **closed (PR stage)** — `main` had not moved at ready-for-review (`git rev-list --count HEAD..origin/main` = 0); V48 still free |
| R-2 | A hidden review re-enters circulation through the author's **delete + resubmit** (delete frees the slot, a fresh submit claims a new visible row) | high without D-1 | high | D-1: a hidden review is frozen for its author — `ReviewGate` answers `HIDDEN` before the window, the lifecycle maps it to `AmendOutcome.Hidden` for edit *and* delete, submit to `AlreadyReviewed`; `ReviewLifecycleServiceTest.aHiddenReviewCannotBeEditedOrRemoved` | agent | **closed (phase 2)** — the pin is green: edit, delete and resubmit all refused with the row untouched |
| R-3 | The predicate lands in one `WHERE` but not the other (list hides, aggregate still counts) | med | high | Both `WHERE`s in one commit (phase 0), each with its own pin (AC-1, AC-2); `JdbcReviews` Javadoc rewritten to state the predicate lives in exactly those two statements | agent | **closed (phase 0)** — both pins green, the audit above enumerates the seven statements |
| R-4 | A missing `SecurityConfig` matcher lets `anyRequest().authenticated()` admit a plain OPERATOR to the new routes | low | high | Three explicit `hasRole(ADMIN)` matchers; `AdminSurfaceRoleGateTest` discovers every `/api/admin/**` mapping and probes OPERATOR + CUSTOMER — a missed matcher fails the build; `AdminReviewTakedownIT.takedownIsAdminOnly` proves it over the real chain | agent | **closed (phase 3)** — both pins green; the plain operator is `403` on all three routes |
| R-5 | `WebSliceStubs` lacks the new `ReviewModeration` port → every `@WebMvcTest` slice fails to boot | high | low | Phase 3 adds the inert stub with the controller (the coverage test's `DECLARED_REACHABLE` lists only role-free routes, so it needs no row) | agent | **closed (phase 3)** — four web slices boot green with the stub |
| R-6 | Hide/un-hide redelivered or double-clicked → duplicate `ReviewsChanged` or drift | med | low | The write is `UPDATE … WHERE id = :id AND hidden_at IS NULL RETURNING venue_id` (mirror for un-hide): rows-affected is the outcome, a no-op publishes nothing, and the listener's recompute is a full re-read either way | agent | **closed (phase 1)** — `ReviewModerationServiceTest` pins one event per flip, `ReviewModerationFlowIT` the conditional update for real |
| R-7 | The aggregate is eventually consistent (ADR-0015): the admin's next read may precede the recompute | med | low | Same posture as submit; the admin tab does not render the score. The e2e is mocked, so no timing; `VenueRatingRecomputeIT` awaits the row | agent | **closed (phase 4)** — the tab renders no score; the IT awaits the recompute |
| R-8 | Error-contract drift on the new 4xx paths (§6b) | low | med | `404 NO_SUCH_REVIEW` and `409 REVIEW_HIDDEN` through `ApiProblem` from exhaustive switches; the review-side `409` keeps `instance` pinned to `/api/bookings` (invariant #7); `ErrorContractArchitectureTests` stays green | agent | **closed (phase 3)** — `unknownReviewIs404` reads problem+json with the code, `aHiddenReviewIsAConflict` pins the instance, the architecture test is green |
| R-9 | Adding `ReviewPanel.Hidden` breaks the exhaustive switches in `booking`'s `BookingDetailView` and the frontend `@switch` silently (a missing `kind`) | high | low | The Java switch is exhaustive → compile error → `"HIDDEN"` added with its own test; the TS union gains the member so the template's `@switch` is type-checked; `review-panel.spec.ts` pins the case | agent | **closed (phase 2)** — `ViewBookingServiceTest.everyPanel` carries `Hidden`; the TS spec caught the one non-exhaustive site (`own`) |
| R-10 | `Reviews.findFor` changes shape → the `FakeReviews` in the service tests stop compiling | high | low | Same phase (2): every implementor found by `grep -rn "implements Reviews"` updated in the commit (`WebSliceStubs` holds no `Reviews` stub — phase 1's audit) | agent | **closed (phase 2)** — all five implementors moved to `Optional<StoredReview>`; `existsFor` retired |
| R-11 | The touch-target sweep and `admin-console-tabs.e2e.ts` hit an unmocked `/api/admin/venues/*/reviews` | med | low | `support/admin-console.mocks.ts` gains the read; `touch-targets-admin.e2e.ts` gains the Reviews row (list + confirm states) | agent | **closed (phase 4)** — both sweeps green with the read mocked |
| R-12 | The Reviews tab lands out of slot in `ADMIN_CONSOLE_TAB_ORDER` and fails the subsequence pin | low | low | Inserted after Photos (moderation surfaces adjacent), the IA contract updated in `q1-admin-console-tab-ia.md`'s order | agent | **closed (phase 4)** — `admin-console-tabs.spec.ts` green; the IA table carries the row |
| R-13 | A hidden review's `display_name`/`comment` still reach the admin (by design) but must never reach the public list — the admin read must not be reachable without ADMIN | low | high | The admin list is served only by the `/api/admin/**` route (R-4); the public read keeps its predicate (R-3) | agent | **closed (phase 3)** — R-3 and R-4 both closed |

## Open questions / Assumptions

### Resolved

- **Decision D-1 — plan (the issue delegated "the tourist's own code-gated view of a hidden
  review" to the slice plan; recorded here, flagged to the maintainer in the PR):** a hidden
  review stays **visible to its author, marked as removed from public view, and frozen** —
  edit and delete are refused with `409 REVIEW_HIDDEN`. Refusing delete is what makes "hide
  survives the guest's window mechanics" true: a delete would free the one-per-booking slot
  and a resubmit would claim a fresh, visible row (R-2). Un-hide hands the author their
  window rights back if the window is still open.
- **Decision D-2 — plan:** the column is `hidden_at TIMESTAMPTZ NULL` (`NULL` = visible),
  not a boolean: the admin list says "hidden since", the predicate is one `IS NULL`, and no
  existing row changes meaning (`postgres`).
- **Decision D-3 — plan:** routes are `GET /api/admin/venues/{venueId}/reviews?cursor=`,
  `POST /api/admin/reviews/{id}/hide`, `POST /api/admin/reviews/{id}/unhide` — two verbs as
  two paths (not `DELETE …/hide`) so the audit's `method path` column reads unambiguously
  to a human; the review id rides in the path because `admin_audit_record` has no target
  column.
- **Decision D-4 — plan:** `ReviewGate` order becomes unknown → not checked in →
  **hidden** → window closed → already reviewed → eligible. Hidden before frozen: a hidden
  review past its window must read "removed", not "stays as written".
- **Decision D-5 — plan:** the admin list includes **every** review (star-only rows too —
  a star-only 1★ spam row moves the aggregate and must be takedown-able), newest first, ten
  per page on the same `ReviewCursor` keyset (the `ListedReviews` contract, reused rather
  than a second paging idiom). The stay stays a `YearMonth` — the admin needs no day.
- **Decision D-6 — plan:** hide/un-hide are **idempotent** at the port (`Applied` /
  `AlreadyApplied` / `NoSuchReview`); the wire answers `204` for both applied states, so a
  double-click or a retried request is harmless and audited as what it was.
- **Assumption A-1 — held** (phase 4): `ConfirmWithReason` is reused for **hide** (the reason
  feeds the audit header, the photo precedent), with copy that does not say "cannot be undone"
  (`admin-reviews.spec.ts` pins the absence); **un-hide** is a single button with no confirm —
  it restores, it does not destroy.
- **Assumption A-4 — recorded** (phase 4): after a `204` the row **flips in place** (the photos
  tab's empty-the-slot idiom) rather than re-reading the venue — the server answers no body, and
  a re-read would drop every page the admin had shown. The "hidden since" moment is the press; the
  e2e's "survives re-reading the venue" case proves the server's state is what comes back.
- **Assumption A-5 — held** (phase 4): the hidden chip paints the existing `--riv-danger-*`
  family (`border-riv-danger-border bg-riv-danger-fill text-riv-danger-ink`), whose porcelain
  card-glass contrast `admin-console.contrast.spec.ts` already pins — no new ink, no new
  contrast spec.
- **Assumption A-2 — held** (phase 0): the `venue` listener needs no change —
  `RecomputeVenueRating` re-reads `VenueRatingSummary`, whose store read gained the predicate;
  `VenueRatingRecomputeIT.aHiddenSoleReviewReturnsTheVenueToNew` is green with zero `venue` edits.
- **Assumption A-3 — held** (phase 2): the author-facing `HIDDEN` panel copy: heading "Your
  review", note "This review was removed from public view by the platform. It no longer counts
  toward the venue's rating and can't be changed."; the booking page narrates a refused amend as
  "This review was removed from public view and can't be changed."

### Open

*(None.)*

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Nothing in this slice reads or writes
`availability(set_id, booking_date)`, the beach map, or a booking's lifecycle; the only
row written is `review.hidden_at`. The one concurrency point is this module's own:
hide/un-hide are single conditional `UPDATE … WHERE … RETURNING` statements whose row count
is the outcome (R-6), the same discipline as the claim.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `review` | existing | `Review` | Owns the review record and its moderation state (Job: "who may leave one, change one or remove one"); the hidden flag is review state, the predicate is review's SQL (sole writer/reader of the `review` table, machine-checked) |
| M-2 | `booking` | existing | `Booking` | Only its `adapter/in` DTO `BookingDetailView` learns the new sealed variant (`"HIDDEN"` kind) — a compile-forced ripple, no behavior of `booking`'s changes |
| M-3 | `venue` | existing | `Venue` | **No code change**: its `ReviewsChangedListener` already re-reads `VenueRatingSummary`; one new IT case pins that a hidden sole review recomputes to `0/0` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `review.api` | `VenueRatingSummary#summaryFor(VenueRef)` (unchanged signature; now "over visible reviews" is true, not vacuous) | `RatingSummary` | `venue` |
| NI-2 | `review.api` | `ListedReviews#pageFor(VenueRef, ReviewCursor)` (unchanged; visibility predicate lands) | `ReviewPage` | `venue` |
| NI-3 | `review.api` | `ReviewEligibility#panelFor(String)` (unchanged signature; `ReviewPanel` gains `Hidden`) | `ReviewPanel.Hidden(OwnReview)` | `booking` |
| — | `review.application` | `ReviewModeration` — **internal**, not published: `ModerationPage pageFor(VenueRef, ReviewCursor)`, `ModerationOutcome hide(ReviewRef)`, `ModerationOutcome unhide(ReviewRef)` | `ModeratedReview`, `ModerationPage` (application-internal records, the `PhotoSlotView` precedent), `ModerationOutcome` (sealed, in `vocabulary/` beside `AmendOutcome`) | `review`'s own `AdminReviewController` only |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `ReviewsChanged` (existing) | `review` — now also on hide / un-hide | `{ venue: VenueRef }` | `venue` | async `@ApplicationModuleListener` (AFTER_COMMIT, registry) | `ReviewModerationServiceTest.hidePublishesOnceAndIsIdempotent`, `VenueRatingRecomputeIT.aHiddenSoleReviewReturnsTheVenueToNew` |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The hidden flag on a review, and hiding / un-hiding | `review` | Job: the review record and "who may … remove one"; moderation state was named as `review`'s in the epic's Implementation Decisions. **Not** `venue` (Not-My-Job: review policy leaking into `venue` is the twin of the commission split, RV-BE-11) |
| Excluding hidden reviews from the aggregate and the list | `review` | The SQL is `review`'s alone (machine-checked sole reader); `venue` keeps storing whatever `review` computes |
| The admin's per-venue review list | `review` | Its own rows, read ownership-free for a role-gated caller — the `VenuePhotoModeration.slotsOf` posture; **not** `venue`'s fenced tourist read, which refuses exactly the venues a moderator must reach |
| The `/api/admin/reviews/**` + `/api/admin/venues/*/reviews` routes | `review` (`adapter/in`) | Module-hosted admin surfaces (`AdminVenuePhotoController` in `venue`); the role gate and the audit stay at the edge (`SecurityConfig`, `AdminAuditFilter`) — login/authorization machinery never enters a module (RV-BE-11) |
| The author's fence on a hidden review (frozen: no edit, no delete) | `review` | `ReviewGate` is the one statement of the fence order; adding a verdict there is the whole change |
| Rendering the `HIDDEN` panel kind on the wire | `booking` (`adapter/in`) | `BookingDetailView` flattens the sealed panel it already carries; the switch is exhaustive so this is compile-forced, not a new responsibility |
| Recording the action in the audit trail | the **edge** (`AdminAuditFilter`) | Composition-root state spanning modules; nothing in `review` writes audit — AC-8 pins the filter covers the new routes |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-reviews.ts` | **new** | standalone `app-admin-reviews`, inline template | signals `venues`, `selectedVenueId`, `entries`, `nextCursor`, `confirming` (a review id or `undefined`), `reason`, `loading`, `loadError`, `busy`, `notice`; a `loadGeneration` counter and `reportOnlyIfStillViewing` guard (the photos-page idioms); the row flips in place on a `204` (A-4); `focusMover()` back onto the row after hide/un-hide, onto the notice on failure, onto the first appended row after Show more | the `ConfirmWithReason` reason (`model`) |
| FE-2 | `admin/admin-reviews.service.ts` | **new** | `@Service()` | `reviews(venueId, cursor?)`, `hide(reviewId, reason?)`, `unhide(reviewId)` — the `X-Audit-Reason` header plumbing copied from the photos service | — |
| FE-3 | `admin/admin-venues.service.ts` | **new** (promoted) | `@Service()` | `venues(): Promise<readonly ModerationVenue[]>` — moved from `admin-venue-photos.service.ts`; both tabs inject it | — |
| FE-4 | `admin/admin-venue-photos.service.ts` + `.ts` + specs | existing | service + page | drop `venues()`; the page injects `AdminVenuesService` | — |
| FE-5 | `admin/admin.model.ts` | existing | types | `AdminReviewEntryView`, `AdminReviewsPage` (TSDoc names the backend records) | — |
| FE-6 | `admin/admin-console-tabs.ts` | existing | tabs | `Reviews` after `Photos` in `ADMIN_CONSOLE_TAB_ORDER` and `tabs` (`admin-tab-reviews`) | — |
| FE-7 | `app.routes.ts` | existing | routes | `admin/reviews` child with its `AdminTabRouteData` (`admin-reviews-title`, sign-in copy "Sign in as an admin to moderate reviews.", the three test ids) | — |
| FE-8 | `booking/review-panel.ts` | existing | component | `@case ('HIDDEN')`: heading + `review-hidden-note` + the own-review template, no actions | — |
| FE-9 | `booking/booking.model.ts` | existing | types | `ReviewPanel` union gains `{ kind: 'HIDDEN'; review: OwnReviewView }` | — |
| FE-10 | `admin/admin-reviews.spec.ts`, `.a11y.spec.ts`, `admin-reviews.service.spec.ts`, `admin-venues.service.spec.ts`; `booking/review-panel.spec.ts` (no new ink — A-5) | new + existing | Vitest | | |

**Standards:** standalone, `inject()`, `@if`/`@for` (`track entry.id`), signals. The tab's
list is a `<ul role="list">` of `appCardGlass` rows (`tabindex="-1"`, `data-testid="admin-review-{id}"`),
each showing stars (`role="img"` + "N out of 5 stars"), display name ("A guest" for null),
stay month via `shared/stay-month.ts`, the comment (or "No comment"), and a **Hidden since
{when}** chip (`data-testid="admin-review-hidden-{id}"`) when hidden. Controls: "Hide"
(`admin-review-hide-{id}`, opens `ConfirmWithReason` with `label="Confirm hiding this
review"`, prompt "Hide {name}'s review of {venue}? It leaves the venue page and the score
until you un-hide it.", `confirmLabel="Hide"`, `cancelLabel="Keep it"`) and "Un-hide"
(`admin-review-unhide-{id}`, no confirm). "Show more" (`admin-reviews-more`) appends the next
cursor page. Every button `appTouchTarget` + `[appBusy]="busy()"`. Notice
`<p role="status" aria-live="polite" tabindex="-1" data-testid="admin-reviews-notice">`.
Venue picker `<select data-testid="admin-reviews-venue">`, the photos tab's markup.

## FE↔BE contract

- **New endpoints** (all ADMIN-gated, `/api/admin/**`):
  - `GET /api/admin/venues/{venueId}/reviews?cursor=<reviewId>` →

    ```ts
    interface AdminReviewsPage {
      readonly reviews: readonly AdminReviewEntryView[];  // newest first, at most 10
      readonly nextCursor: number | null;
    }
    interface AdminReviewEntryView {
      readonly id: number;
      readonly stars: number;                 // 1..5
      readonly displayName: string | null;
      readonly stayedIn: string;              // "YYYY-MM"
      readonly comment: string | null;        // null for a star-only review
      readonly createdAt: string;             // ISO UTC instant
      readonly hiddenAt: string | null;       // ISO UTC instant; null = visible
    }
    ```

    Errors: `400 INVALID_REQUEST` (cursor ≤ 0 or non-numeric — the slice-3 precedent). An
    unknown venue answers an empty page (the admin venue list is the picker; the photo
    twin's "answer every venue" posture).
  - `POST /api/admin/reviews/{reviewId}/hide` → `204` (applied or already hidden);
    `404 NO_SUCH_REVIEW`. Optional `X-Audit-Reason` header.
  - `POST /api/admin/reviews/{reviewId}/unhide` → `204`; `404 NO_SUCH_REVIEW`.
- **Changed endpoints:**
  - `GET /api/bookings/{code}` — `reviewPanel.kind` gains `"HIDDEN"` with `review`.
  - `PUT`/`DELETE /api/bookings/{code}/review` — new `409 REVIEW_HIDDEN`
    ("This review has been removed from public view."), `instance` `/api/bookings`.
- **Client typing:** hand-written typed services, no `as any`.
- **Dates on the wire:** instants ISO UTC, rendered client-side in `Europe/Tirane`
  (`admin-audit.ts`'s `formatMoment` idiom, promoted to `shared/` only if a third caller
  appears — two callers in one feature folder share it locally).

## Execution status

**Stage pointer:** `merged via PR #898` (close-out written before the merge, per §3 step 4)

**Next action:** none — the merge close-out (`references/pr-gates.md` §3): issue #814 closed by the PR, epic #810's sub-issue ticked, subscription ended.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V48 `hidden_at` + the visibility predicate | ✅ | `Hide reviews from the aggregate and the public list by a nullable hidden_at (#814)` |
| 1 — `ReviewModeration`: hide / un-hide / admin list, `ReviewsChanged` | ✅ | `Hide and un-hide a review through the review module's moderation port (#814)` |
| 2 — the author's fence: `HIDDEN` in the gate, the panel, the amend outcome, the booking page | ✅ | `Freeze a hidden review for its author and show it as removed from public view (#814)` |
| 3 — the admin REST edge: controller, matchers, stubs, audit pin | ✅ | `Serve the admin review list and the hide/un-hide takedown under /api/admin (#814)` |
| 4 — the admin Reviews tab, the mocked journey, docs, close-out prep | ✅ | `Add the admin Reviews tab: hide and un-hide with grounds, and cover the takedown end to end (#814)` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Review gate (2026-09-02):** `/code-review:code-review` (plugin skill, ladder rung 1 — the
`Skill` call succeeded) at **high** effort (authorization touched) with `riviera-review-overlay`
layered on: five plugin reviewers (CLAUDE.md adherence + RV-BE walk, shallow bug scan,
git-history regression, prior-PR comment carry-over, code-comment compliance + RV-FE/RV-CT walk)
plus RV-PROC-1. Findings F-1..F-3 and F-5..F-6 below, all fixed in the same session; the Haiku
confidence scores were 75 / 100 / 75 / 75 / 100, so the posted comment lists the two ≥ 80
(F-2, F-6) and the register here carries all five. Skills re-loaded for the fix round:
`riviera-frontend` + `angular-developer` (the focus leg and the two structural specs),
`riviera-java-conventions` (the Javadoc contract).

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (prior-PR carry-over walker) | `admin-console-tabs.spec.ts` was not extended for the new tab — no `admin/reviews` route in its router config, no `href` pin, no "marks Reviews as current" case, which every prior tab addition (#511, #507, #460) added | fixed — all three added |
| F-2 | review (prior-PR carry-over walker) | `app.spec.ts`'s `ADMIN_TAB_CHILD_PATHS` enumeration lacked `reviews`, so the structural guard never checked the new route's `adminTab` data | fixed — `'reviews'` added |
| F-4 | CI (frontend job, head `0922fbd`) | `admin-privacy.e2e.ts` pins the strip's last three labels as `Photos, Privacy, Audit` — the Reviews tab now sits between | fixed — `Reviews, Privacy, Audit`, slot 8 |
| F-5 | review (comment-compliance walker) | `AdminSurfaceRoleGateTest`'s anchor Javadoc counted five entries across five owners and promised "a new admin endpoint needs no edit here" — this PR added a sixth anchor for the `review` module | fixed — six across six, and the sentence now says a module's *first* admin surface adds one |
| F-6 | review (overlay RV-FE-9 spirit, Minor) | a failed un-hide moved focus onto the notice although the pressed Un-hide button survives — only the hide leg destroys its control | fixed — the un-hide failure keeps focus where it is and lets the `role=status` region announce; `admin-reviews.spec.ts` pins it |
| F-7 | `riviera-docs-freshness` over `origin/main...HEAD` | six present-tense counts in files the diff never touched — `AdminAuditLog` Javadoc ("span five modules"), `admin-console-tabs.spec.ts` ("at most eight tabs"), `admin-privacy.e2e.ts` + `admin-console-stats.e2e.ts` ("seven tabs"), and the admin-console artboard's stated order (no Reviews) | fixed — counts updated; the artboard gets the `as-built diverges — see #814` pointer, never a rewrite |
| F-3 | review (git-history walker) | `q1-admin-console-tab-ia.md`'s summary sentence ("filtering the eight … five shipped tabs") contradicted the table it summarizes once the Reviews row landed | fixed — the paragraph is dated to decision time with a note naming the later row |

---

## File structure

- `docs/plans/reviews-s4-admin-review-takedown.md` — this plan
- `platform/src/main/resources/db/migration/V48__review_hidden_at.sql` — `hidden_at TIMESTAMPTZ NULL`
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewSlot.java` — new enum `EMPTY | TAKEN | HIDDEN`
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewState.java` — `HIDDEN`
- `platform/src/main/java/ai/riviera/platform/review/domain/ReviewGate.java` — the new verdict in its place
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ReviewPanel.java` — `Hidden(OwnReview)`
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/AmendOutcome.java` — `Hidden`
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/ModerationOutcome.java` — new sealed `Applied | AlreadyApplied | NoSuchReview`
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/package-info.java` — inventory line
- `platform/src/main/java/ai/riviera/platform/review/application/StoredReview.java` — new `(OwnReview review, boolean hidden)`
- `platform/src/main/java/ai/riviera/platform/review/application/ModeratedReview.java` — new admin row record
- `platform/src/main/java/ai/riviera/platform/review/application/ModerationPage.java` — new `(List<ModeratedReview>, boolean hasMore)` + `next()`
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewModeration.java` — new internal port
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewModerationService.java` — new
- `platform/src/main/java/ai/riviera/platform/review/application/Reviews.java` — `findFor` → `Optional<StoredReview>`; `existsFor` retired; `hide`, `unhide`, `existsById`, `newestForModerationBefore`
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewLifecycleService.java` — `HIDDEN` arms; slot from `findFor`
- `platform/src/main/java/ai/riviera/platform/review/application/ReviewEligibilityService.java` — `HIDDEN` arm
- `platform/src/main/java/ai/riviera/platform/review/application/ListedReviewsService.java` — unchanged unless the page arithmetic is shared with the moderation page
- `platform/src/main/java/ai/riviera/platform/review/adapter/out/JdbcReviews.java` — the predicate in both `WHERE`s; the three new statements; Javadoc
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/ReviewController.java` — the `Hidden` arm → `409 REVIEW_HIDDEN`
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/AdminReviewController.java` — new
- `platform/src/main/java/ai/riviera/platform/review/adapter/in/AdminReviewsResponse.java` — new DTO
- `platform/src/main/java/ai/riviera/platform/review/package-info.java` — surface inventory
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — `"HIDDEN"` kind
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — three ADMIN matchers
- `platform/src/test/java/ai/riviera/platform/review/ReviewMigrationIT.java` — `hiddenAtIsNullableAndDefaultsToVisible`
- `platform/src/test/java/ai/riviera/platform/review/ReviewModerationFlowIT.java` — new
- `platform/src/test/java/ai/riviera/platform/review/application/ReviewModerationServiceTest.java` — new
- `platform/src/test/java/ai/riviera/platform/review/application/ReviewLifecycleServiceTest.java` — the hidden cases; fake follows `Reviews`
- `platform/src/test/java/ai/riviera/platform/review/application/ReviewEligibilityServiceTest.java` — the hidden case; fake follows `Reviews`
- `platform/src/test/java/ai/riviera/platform/review/application/ListedReviewsServiceTest.java` — fake follows `Reviews`
- `platform/src/test/java/ai/riviera/platform/review/domain/ReviewGateTest.java` — the hidden verdict + its order
- `platform/src/test/java/ai/riviera/platform/venue/VenueRatingRecomputeIT.java` — `aHiddenSoleReviewReturnsTheVenueToNew`
- `platform/src/test/java/ai/riviera/platform/ReviewControllerTest.java` — `aHiddenReviewIsAConflict`
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — `everyPanel` carries `Hidden`
- `platform/src/test/java/ai/riviera/platform/AdminReviewTakedownIT.java` — new
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — `ReviewModeration` stub
- `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java` — the list read joins the cross-module anchors
- `platform/src/test/java/ai/riviera/platform/ReviewFixtures.java` — `hiddenReview(...)` / `hide(reviewId)` seeder
- `frontend/src/app/admin/admin-venues.service.ts` + `admin-venues.service.spec.ts` — new (promoted `venues()`)
- `frontend/src/app/admin/admin-venue-photos.service.ts` + `admin-venue-photos.service.spec.ts` + `admin-venue-photos.ts` + `admin-venue-photos.spec.ts` + `admin-venue-photos.a11y.spec.ts` — use the promoted service; the service spec now pins `slots()` and the takedown header
- `frontend/src/app/admin/admin-moment.ts` — `formatMoment`, shared by the Audit and Reviews tabs
- `frontend/src/app/admin/admin-audit.ts` — uses the shared helper
- `frontend/src/app/admin/admin-reviews.service.ts` + `admin-reviews.service.spec.ts` — new
- `frontend/src/app/admin/admin-reviews.ts` + `admin-reviews.spec.ts` + `admin-reviews.a11y.spec.ts` — new
- `frontend/src/app/admin/admin.model.ts` — the two wire types
- `frontend/src/app/admin/admin-console-tabs.ts` + `admin-console-tabs.spec.ts` — the Reviews tab
- `frontend/src/app/app.routes.ts` — `admin/reviews`
- `frontend/src/app/app.spec.ts` — `ADMIN_TAB_CHILD_PATHS` gains `reviews` (F-2)
- `frontend/src/app/booking/booking.model.ts` — the `HIDDEN` member
- `frontend/src/app/booking/review-panel.ts` + `review-panel.spec.ts` — the `HIDDEN` case
- `frontend/src/app/booking/booking-view.ts` — the `REVIEW_HIDDEN` refusal narration
- `frontend/e2e/admin-reviews.e2e.ts` — new mocked journey
- `frontend/e2e/support/admin-console.mocks.ts` — the reviews read
- `frontend/e2e/touch-targets-admin.e2e.ts` — the Reviews row + confirm state
- `frontend/e2e/admin-privacy.e2e.ts` — the strip's last three labels (F-4)
- `frontend/e2e/admin-console-stats.e2e.ts` — the tab count in its measured-budget header (F-7)
- `platform/src/main/java/ai/riviera/platform/AdminAuditLog.java` — the module count in its Javadoc (F-7)
- `RESPONSIBILITIES.md` — §review (moderation, the predicate landed, the author's fence, the admin surface), §venue (no change — states the listener now excludes hidden by re-read)
- `CONTEXT.md` — **Review takedown**, **Hidden review**
- `CLAUDE.md` — the `review` row names moderation
- `docs/plans/q1-admin-console-tab-ia.md` — the tab order gains Reviews

---

## Phase 0 — V48 `hidden_at` + the visibility predicate

**Files:** Create `V48__review_hidden_at.sql`, `ReviewModerationFlowIT.java` · Modify
`JdbcReviews.java` (two `WHERE`s), `ReviewFixtures.java`, `ReviewMigrationIT.java`,
`VenueRatingRecomputeIT.java`

- [ ] **Step 1: Write the failing tests** — `ReviewFixtures.hide(long reviewId)` sets
  `hidden_at = now()` by SQL (the fixture, not the port — the port arrives in phase 1);
  `ReviewModerationFlowIT.hiddenReviewsLeaveTheAggregate` seeds 4★, 5★ visible and 1★
  hidden and asserts `summary.summaryFor(venue)` is `RatingSummary(45, 2)`;
  `hiddenReviewsLeaveTheList` seeds two commented rows, hides one, asserts the page lists
  only the other; `VenueRatingRecomputeIT.aHiddenSoleReviewReturnsTheVenueToNew` seeds one
  review, hides it, announces, awaits `0/0`; `ReviewMigrationIT.hiddenAtIsNullableAndDefaultsToVisible`.

```sql
-- V48 (#814, epic #810), slice 4 of the review record: moderation state. A platform admin's
-- takedown is a reversible soft flag, so it is a nullable instant rather than a delete or a
-- boolean: NULL means visible, and every row already in the table keeps that meaning; a
-- non-null value says when the review left public view, which the admin list shows. The
-- visibility predicate (hidden_at IS NULL) lives in exactly two statements of the review
-- module's adapter: the aggregate totals and the public listing. No index: both reads seek
-- review_venue_listing_idx (venue_id, id) and filter the few hidden rows after the seek.
-- Verified by ReviewMigrationIT.
ALTER TABLE review ADD COLUMN hidden_at TIMESTAMPTZ NULL;   -- UTC instant (invariant #6)
```

- [ ] **Step 2: Run, verify red** — `gradle --no-daemon --console=plain test --tests "*ReviewModerationFlowIT*"` → FAIL (`RatingSummary(37, 3)` — the hidden row still counts)
- [ ] **Step 3: Minimal implementation** — the migration; `totalsFor`'s `WHERE venue_id = :venue AND hidden_at IS NULL`; `newestListedBefore`'s `WHERE venue_id = :venue AND hidden_at IS NULL AND comment IS NOT NULL AND id < :before`; the `JdbcReviews` Javadoc paragraph rewritten to state where the predicate lives.
- [ ] **Step 4: Run, verify green** — the two ITs + `ReviewMigrationIT` + `ReviewListingFlowIT` + `ReviewSubmitFlowIT` (the fixture) → PASS
- [ ] **Step 5: Generalization audit** — population: every SQL statement that reads the `review` table (`grep -rn "FROM review\|UPDATE review\|INTO review" platform/src`) → decide per statement whether it is a *public* read (needs the predicate) or an *own/admin* read (must not).
- [ ] **Step 6: Commit** — `Hide reviews from the aggregate and the public list by a nullable hidden_at (#814)`
- [ ] **Step 7: Update Execution status.**

## Phase 1 — `ReviewModeration`: hide / un-hide / admin list

**Files:** Create `ReviewModeration.java`, `ReviewModerationService.java`,
`ModerationOutcome.java`, `ModeratedReview.java`, `ModerationPage.java`,
`ReviewModerationServiceTest.java` · Modify `Reviews.java`, `JdbcReviews.java`,
`ReviewModerationFlowIT.java`, the three `FakeReviews`, `WebSliceStubs.java` (only if a
`Reviews` stub exists there), `vocabulary/package-info.java`

- [ ] **Step 1: Failing tests** — `ReviewModerationServiceTest.hidePublishesOnceAndIsIdempotent`
  (fake store; first `hide` → `Applied` + one `ReviewsChanged(venue)` captured on a recording
  `ApplicationEventPublisher`; second → `AlreadyApplied`, still one event),
  `unhidePublishesOnceAndIsIdempotent`, `hidingAnUnknownReviewIsNoSuchReview`;
  `ReviewModerationFlowIT.unhideRestoresBothSurfaces` and `adminListShowsEveryReviewMarked`
  (three rows incl. star-only + hidden, newest first, `hiddenAt` present on the hidden one,
  11 rows page at 10 with `next()`).

```java
public interface ReviewModeration {
	ModerationPage pageFor(VenueRef venue, ReviewCursor from);
	ModerationOutcome hide(ReviewRef review);
	ModerationOutcome unhide(ReviewRef review);
}
```

  Store additions on `Reviews`: `Optional<VenueRef> hide(ReviewRef, Instant at)` and
  `Optional<VenueRef> unhide(ReviewRef)` (the venue whose aggregate moved; empty when the
  row was already in that state or absent), `boolean existsById(ReviewRef)`,
  `List<ModeratedReview> newestForModerationBefore(VenueRef, long beforeId, int limit)`.
  SQL: `UPDATE review SET hidden_at = :at WHERE id = :id AND hidden_at IS NULL RETURNING venue_id`
  and the `IS NOT NULL` / `= NULL` mirror.

- [ ] **Step 2: Run, verify red** — `--tests "*ReviewModerationServiceTest*"` → compile failure on the missing port (the honest red for a new seam), then assertion failures.
- [ ] **Step 3: Minimal implementation** — the service (`@Transactional` on hide/unhide, publishes only on `Optional.isPresent()`), the adapter statements, `ModerationPage.next()` on the `ReviewCursor.after` idiom, `PAGE_SIZE` shared with `ListedReviewsService` by a package-private constant.
- [ ] **Step 4: Green** — the unit test + `ReviewModerationFlowIT` → PASS; then the structural net (`ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `JdbcOnlyArchitectureTests`).
- [ ] **Step 5: Generalization audit** — population: every implementor of `Reviews` (`grep -rn "implements Reviews" platform/src`) updated in this commit.
- [ ] **Step 6: Commit** — `Hide and un-hide a review through the review module's moderation port (#814)`
- [ ] **Step 7: Update Execution status.**

## Phase 2 — the author's fence: `HIDDEN` in the gate, the panel, the amend outcome, the booking page

**Files:** Create `ReviewSlot.java`, `StoredReview.java` · Modify `ReviewState.java`,
`ReviewGate.java`, `ReviewPanel.java`, `AmendOutcome.java`, `Reviews.java` (`findFor`),
`ReviewLifecycleService.java`, `ReviewEligibilityService.java`, `ReviewController.java`,
`BookingDetailView.java`, `booking.model.ts`, `review-panel.ts` · Test `ReviewGateTest`,
`ReviewLifecycleServiceTest`, `ReviewEligibilityServiceTest`, `ReviewControllerTest`, the
booking-detail DTO test, `review-panel.spec.ts`

- [ ] **Step 1: Failing tests** — `ReviewGateTest.aHiddenReviewReadsAsHiddenEvenPastTheWindow`
  (`stateOf(true, COMPLETED_LONG_AGO, ReviewSlot.HIDDEN, now)` → `HIDDEN`; and inside the
  window → `HIDDEN`); `ReviewLifecycleServiceTest.aHiddenReviewCannotBeEditedOrRemoved`
  (edit → `AmendOutcome.Hidden`, delete → `AmendOutcome.Hidden`, store untouched, no event;
  submit → `AlreadyReviewed`); `ReviewEligibilityServiceTest.aHiddenReviewPanelsAsHidden`;
  `ReviewControllerTest.aHiddenReviewIsAConflict` (`PUT` → `409`, `code` `REVIEW_HIDDEN`,
  `instance` `/api/bookings`); the DTO test's `HIDDEN` kind with `review`, `windowClosesAt`
  null; `review-panel.spec.ts` "a hidden review is shown read-only with the removal note"
  (own-review card present, `review-hidden-note` present, no `edit-review` /
  `start-delete-review`).
- [ ] **Step 2: Red** — `--tests "*ReviewGateTest*"` → compile failure on `ReviewSlot`, then the assertions.
- [ ] **Step 3: Minimal implementation** — `ReviewGate.stateOf(boolean bookingExists, Instant completedAt, ReviewSlot slot, Instant now)`: unknown → not completed → `slot == HIDDEN` → window → `slot == TAKEN ? ALREADY_REVIEWED : ELIGIBLE`; `Reviews.findFor` → `Optional<StoredReview>`; both services derive the slot from it (`existsFor` retired); the `HIDDEN` arms; `ReviewController.amended` gains `case AmendOutcome.Hidden ignored -> error(CONFLICT, "REVIEW_HIDDEN", "This review has been removed from public view.")`; `BookingDetailView` `"HIDDEN"`; the TS union + `@case ('HIDDEN')` with A-3's copy.
- [ ] **Step 4: Green** — the five Java test classes + `ReviewSubmitFlowIT` + `ReviewLifecycleFlowIT` (the fixture and the real gate) → PASS; `npm test -- review-panel` → PASS; `npm run lint`, `npm run format:check`.
- [ ] **Step 5: Generalization audit** — population: every exhaustive `switch` over `ReviewState`, `ReviewPanel`, `AmendOutcome` and every TS site narrowing `reviewPanel.kind` (`grep -rn "ReviewState\.\|case ReviewPanel\.\|AmendOutcome\.\|kind === '" platform/src frontend/src`) — the compiler finds the Java ones; the TS ones are checked by hand (`booking-view.ts`'s outcome narration).
- [ ] **Step 6: Commit** — `Freeze a hidden review for its author and show it as removed from public view (#814)`
- [ ] **Step 7: Update Execution status.**

## Phase 3 — the admin REST edge

**Files:** Create `AdminReviewController.java`, `AdminReviewsResponse.java`,
`AdminReviewTakedownIT.java` · Modify `SecurityConfig.java`, `WebSliceStubs.java`,
`EndpointRoleGateCoverageTest.java`, `review/package-info.java`

- [ ] **Step 1: Failing tests** — `AdminReviewTakedownIT` (`@SpringBootTest` + MockMvc, the
  `AdminPhotoTakedownIT` cast: bootstrap admin, a plain operator provisioned per test,
  `SessionLoginSupport.operatorSession`, `csrf()`): `adminHidesAndUnhides` (list shows
  `hiddenAt` null → `POST …/hide` 204 → list shows `hiddenAt` set and the public
  `GET /api/venues/{id}/reviews` no longer lists it → `POST …/unhide` 204 → both back),
  `takedownIsAdminOnly` (anonymous 401, plain operator 403 on all three routes; the review
  stays visible), `unknownReviewIs404` (`NO_SUCH_REVIEW`, problem+json),
  `hideAndUnhideAreAudited` (two rows: `POST /api/admin/reviews/{id}/hide` with the header's
  sanitized reason, `POST …/unhide` with `reason` null, both `204`, actor the admin username),
  `rejectsANonPositiveCursor`.
- [ ] **Step 2: Red** — `--tests "*AdminReviewTakedownIT*"` → `404`s (no mapping).
- [ ] **Step 3: Minimal implementation** — `AdminReviewController` (`@RequestMapping("/api/admin")`, package-private, depends only on `ReviewModeration`; the cursor parse copied from `VenueReadController.reviews`; exhaustive switch over `ModerationOutcome` → `204`/`204`/`404`); `AdminReviewsResponse` (`reviews[]` + `nextCursor`, `stayedIn` as `YYYY-MM`); `SecurityConfig` constants `ADMIN_VENUE_REVIEWS_PATH = "/api/admin/venues/*/reviews"`, `ADMIN_REVIEW_HIDE_PATH = "/api/admin/reviews/*/hide"`, `ADMIN_REVIEW_UNHIDE_PATH = "/api/admin/reviews/*/unhide"` + three `hasRole(ADMIN_ROLE)` matchers; the inert `ReviewModeration` stub; the three `DECLARED_REACHABLE` rows.
- [ ] **Step 4: Green** — the IT + `AdminSurfaceRoleGateTest` + `EndpointRoleGateCoverageTest` + `AdminAuditTrailIT` + `ErrorContractArchitectureTests` + the structural net → PASS.
- [ ] **Step 5: Generalization audit** — population: every `@WebMvcTest` slice that boots the full controller set (`grep -rln "WebSliceStubs" platform/src/test`) boots green with the new stub — run two (`VenueReviewsControllerTest`, `ReviewControllerTest`).
- [ ] **Step 6: Commit** — `Serve the admin review list and the hide/un-hide takedown under /api/admin (#814)`
- [ ] **Step 7: Update Execution status.**

## Phase 4 — the admin Reviews tab, the mocked journey, docs

**Files:** Create `admin-venues.service.ts` (+ spec), `admin-reviews.service.ts` (+ spec),
`admin-reviews.ts`, `admin-reviews.spec.ts`, `admin-reviews.a11y.spec.ts`,
`e2e/admin-reviews.e2e.ts` · Modify `admin-venue-photos.service.ts` (+ spec + page + spec),
`admin.model.ts`, `admin-console-tabs.ts` (+ spec), `app.routes.ts`,
`e2e/support/admin-console.mocks.ts`, `e2e/touch-targets-admin.e2e.ts`,
`RESPONSIBILITIES.md`, `CONTEXT.md`,
`CLAUDE.md`, `q1-admin-console-tab-ia.md`

- [ ] **Step 1: Failing tests** — `admin-reviews.spec.ts`: renders a venue's rows with the
  hidden chip on the hidden one; hide requires the confirmation and passes the typed reason
  to `hide(id, reason)`; does not carry a reason into the next hide; un-hide calls
  `unhide(id)` with no confirmation; after either the row re-renders from the server's
  answer (re-read, not a local flip) and focus lands on the row; failure parks focus on the
  notice; "Show more" appends the next page; ignores a stale list response; does not load
  when the session is unconfirmed. `admin-venues.service.spec.ts` inherits the photos
  service's venue-list case. `admin-console-tabs.spec.ts` keeps the subsequence pin.
  `e2e/admin-reviews.e2e.ts`: stateful mocks (`/api/admin/venues`,
  `/api/admin/venues/(\d+)/reviews`, `/api/admin/reviews/(\d+)/(hide|unhide)` mutating a
  local map; `/api/venues/7` and `/api/venues/7/reviews` derived from the same map so the
  public surfaces move) — the AC-11 journey with axe at list / confirm / notice, the
  signed-out visitor, the failure leg, computed CSS on the hidden chip.
- [ ] **Step 2: Red** — `npm test -- admin-reviews` → module not found; the e2e → tab missing.
- [ ] **Step 3: Minimal implementation** — FE-1..FE-7 per the Angular section.
- [ ] **Step 4: Green** — `npm test` (touched specs + the a11y suite), `npm run lint`, `npm run format:check`, `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts admin-reviews admin-console-tabs touch-targets-admin admin-venue-photos review-lifecycle` → PASS; `node scripts/check-touch-target.mjs --files …`, `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 5: Generalization audit** — population: every e2e helper that mocks the whole admin console on mount (`grep -rln "mockWholeAdminConsole\|/api/admin/venues" frontend/e2e`) carries the reviews read.
- [ ] **Step 6: Docs** — RESPONSIBILITIES §review (moderation state, the predicate landed in the two named `WHERE`s, the author's fence, the admin surface and why it is module-hosted, the `Shipped` line), CONTEXT.md, CLAUDE.md row, the tab-IA order.
- [ ] **Step 7: Commit** — `Add the admin Reviews tab: hide and un-hide with grounds, and cover the takedown end to end (#814)`
- [ ] **Step 8: Update Execution status**; merge `origin/main`; mark the PR ready for review → the gates (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 0 (the predicate) | every production SQL statement that touches the `review` table | `grep -rn "FROM review\b\|UPDATE review\b\|INTO review\b\|DELETE FROM review\b" platform/src/main` | 7, all in `JdbcReviews`: claim, update, delete, `findFor`, `totalsFor`, `existsFor`, `newestListedBefore` | predicate on the two **public** reads (`totalsFor`, `newestListedBefore`) only; the author's read-back (`findFor`, `existsFor`) and the writes address the row by `booking_id` and must keep seeing a hidden row — phase 2 relies on that |
| 2026-09-02 | phase 1 (the widened `Reviews` port) | every implementor of `Reviews` | `grep -rln "implements Reviews\b" platform/src` | 5: JdbcReviews.java, ListedReviewsServiceTest.java, ReviewEligibilityServiceTest.java, ReviewLifecycleServiceTest.java, ReviewModerationServiceTest.java | all five carry the four new methods in the same commit (the fakes throw `UnsupportedOperationException` where moderation is out of their use case) |
| 2026-09-02 | phase 2 (the `HIDDEN` verdict) | every site that branches on `ReviewState`, `ReviewPanel` or `AmendOutcome` (Java: exhaustive switches, found by the compiler) and every TS site narrowing `reviewPanel.kind` | `grep -rln "case ReviewPanel\.\|case AmendOutcome\.\|case NO_SUCH_STAY" platform/src/main`; `grep -rn "kind === '" frontend/src/app --include=*.ts` | Java: `ReviewLifecycleService`, `ReviewEligibilityService`, `ReviewController`, `BookingDetailView`; TS: `review-panel.ts` (`seedFor`, `own`, `deadline`), `booking-view.ts`'s refusal map | every Java arm added (the compiler refused the build until each was); in TS `own` gained `HIDDEN` (the spec caught the 0-star render), `seedFor`/`deadline` correctly exclude it, the refusal map gained `REVIEW_HIDDEN` |
| 2026-09-02 | phase 3 (a new port every web slice must find) | every `@WebMvcTest` slice that boots the full controller set through `WebSliceStubs` | `grep -rln "WebSliceStubs" platform/src/test` | 4 run in the phase (`ReviewControllerTest`, `VenueReviewsControllerTest`, `AdminSurfaceRoleGateTest`, `EndpointRoleGateCoverageTest`) of the slices found | all boot green with the inert `ReviewModeration` stub; CI runs the rest |
| 2026-09-02 | phase 4 (a new admin route every console sweep mounts) | every e2e helper that mocks the whole admin console on mount, and every spec that walks the console's routes | `grep -rln "mockWholeAdminConsole\|/api/admin/venues" frontend/e2e` | `support/admin-console.mocks.ts`, `touch-targets-admin.e2e.ts`, `admin-console-tabs.e2e.ts` (uses the lifecycle mock only — no admin reads), `admin-venue-photos.e2e.ts` (its own venue mock) | the console mock gained the reviews read; the touch sweep gained the Reviews row and its confirm state; the others need nothing |
| 2026-09-02 | CI red on `0922fbd` (F-4) | every spec that enumerates the console's tab labels or a tab's slot number | `grep -rn "'Privacy', 'Audit'\|'Photos', 'Privacy'\|slot [0-9]" frontend/e2e frontend/src --include=*.ts` | 1: `admin-privacy.e2e.ts` (the last-three-labels pin and its "slot 7" title) | updated to `Reviews, Privacy, Audit` / slot 8; the phase-4 audit had swept mocks and route walks, not label enumerations — this row is the missing mechanism |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2:** `gradle test --tests "*ReviewModerationFlowIT*"` → PASS (2, skipped 0 at phase 0; 4 at phase 1). Verified at phases 0–1.
- [x] **AC-3 / AC-4:** `gradle test --tests "*ReviewModerationServiceTest*" --tests "*ReviewModerationFlowIT*"` → PASS (4 + 4, skipped 0). Verified at phase 1.
- [x] **AC-5:** `gradle test --tests "*VenueRatingRecomputeIT*"` → PASS (6, skipped 0). Verified at phase 0.
- [x] **AC-6:** `gradle test --tests "*ReviewModerationFlowIT*"` → PASS (`adminListShowsEveryReviewMarked`). Verified at phase 1.
- [x] **AC-7 / AC-8:** `gradle test --tests "*AdminReviewTakedownIT*" --tests "*AdminSurfaceRoleGateTest*" --tests "*EndpointRoleGateCoverageTest*"` → PASS (5 + 3 + 1, skipped 0). Verified at phase 3.
- [x] **AC-9:** `gradle test --tests "*ReviewGateTest*" --tests "*ReviewLifecycleServiceTest*" --tests "*ReviewEligibilityServiceTest*" --tests "*ReviewControllerTest*" --tests "*ViewBookingServiceTest*"` → PASS (8 + 20 + 7 + 21 + 37). Verified at phase 2.
- [x] **AC-10:** `ng test --include=src/app/booking/review-panel.spec.ts` → PASS (27). Verified at phase 2.
- [x] **AC-11 / AC-12:** `playwright test -c playwright.a11y.config.ts admin-reviews admin-venue-photos admin-console-tabs touch-targets-admin admin-audit review-lifecycle venue-reviews admin-privacy` → PASS (39 + 8) and `npm test` → PASS (2423 across 216 files). Verified at phase 4 and the review-fix round; CI's full mocked suite (405) on the phase-4 head after F-4.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
