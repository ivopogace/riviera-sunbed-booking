# Venue visibility derived from operator ACTIVE status — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A venue is visible to tourists iff its owning operator is `ACTIVE` — the tourist
list omits hidden venues, the detail/map read answers 404, and both booking paths (Instant
and Request) refuse a hidden venue's set by id — while every booking sold while the venue
was visible keeps resolving, cancelling, and checking in unchanged (#693, epic #573 scope B).

**Architecture:** `operator` publishes a new role-split api port (`VenueVisibility`, per the
#94 role-split rule — not more methods on `VenueOwnership`) that answers "does this venue
have an ACTIVE owner?", fail-closed for unowned venues. The catalogue fence lives *behind*
the unchanged `VenueCatalog` interface (inside `JdbcVenueCatalog`, which consults the port —
precedent: `JdbcAvailabilityClaim` already injects `venue.api.SetBookingFacts`); the booking
fence lives in `ReserveSetService` only. **Deliberately NOT in `SetBookingFacts`:** that
port has six consumers including sold-booking paths (`CancellationPolicy` `orElseThrow`s on
it, `MyBookingsService`, both notification facts services, the availability claim) — fencing
it would strand exactly the sold bookings the issue protects.

**Persistence:** JDBC only (invariant #1). **No schema change, no migration** — visibility
is derived at read time from existing `operator_venue` + `operator.status`; no new index
(`operator_venue` is PK'd on `venue_id` and indexed on `operator_id`; `operator` is tiny).
Flyway tip stays V42.

**Source of intent:** GitHub issue #693 (parent epic #573, scope B); intake decisions folded
into the issue 2026-08-17.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught #692's
un-ticked epic-#573 boxes, fixed; surfaced the check-in-under-suspension nuance: provable
only at the application seam because suspension already revokes sessions) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger on the photo-console
repoint and the SetBookingFacts consumer sweep) · `tdd` (each phase red-green at the
narrowest seam) · `riviera-review-overlay` (review gate — due at ready-for-review, Phase 6; findings land in
the register below) · `riviera-docs-freshness` (runs over `origin/main..HEAD` at Phase 6 —
the §`operator` "four things"→five counting fix is pre-planned there) ·
`riviera-modulith` (the role-split port decision; adapter-consumes-port precedent;
least-privilege grants already in place — no `allowedDependencies` change) ·
`codebase-design` (fence placed behind the `VenueCatalog` interface, un-bypassable by any
driving adapter; rejected the `SetBookingFacts` fence via the consumer enumeration) ·
`postgres` (visibility as `EXISTS`/`IN` join over `operator_venue ⋈ operator`, statuses as
`TEXT + CHECK`; confirmed no new index warranted) · `riviera-java-conventions` (loaded at
Phase 1 — records for the port surface, package-private adapters, text-block SQL, typed
outcomes) · `riviera-frontend` (loaded at Phase 5 — admin service stays in `admin/`, shared
types via `shared/venue-views.ts`, mocked-suite e2e placement) · `angular-developer` +
angular-cli MCP (loaded at Phase 5 — signals for the not-found state, v22 control flow,
a11y on the new empty-state) · `riviera-tailwind` (loaded at Phase 5 — not-found state
styled with existing Tailwind utility patterns, no new SCSS) · `playwright-cli` (loaded at
Phase 5 — mocked-suite specs for the hidden-venue 404 and the repointed admin console).

**Branch:** designated cloud-session branch `claude/sdlc-693-salq7e` stands in for
`feature/operator-active-venue-visibility` (riviera-sdlc remote-session addendum).

---

## Acceptance criteria (testable)

Written at the application boundary; HTTP-level assertions ride existing adapter tests where
they exist.

- [ ] **AC-1:** Given a venue whose owning operator is `PENDING`, when `VenueCatalog.listVenues`
  runs, then the venue is absent; when the operator is approved (`ACTIVE`), the venue appears
  with no operator action in between. *Pinned by:* `VenueCatalogVisibilityIT.listOmitsPendingOwnedVenueUntilApproved`
- [ ] **AC-2:** Given a hidden venue (owner not `ACTIVE`), when `VenueCatalog.findVenueMap`
  runs for it, then the result is empty (HTTP 404 via the existing controller mapping).
  *Pinned by:* `VenueCatalogVisibilityIT.mapReadIsEmptyForHiddenVenue`
- [ ] **AC-3:** Given a hidden venue's set id, when a booking is attempted on the Instant path
  and on the Request path, then both are refused as `Rejected(NO_SUCH_SET)` before any
  availability claim. *Pinned by:* `ReserveSetServiceTest.instantReserveRefusedForHiddenVenue`,
  `ReserveSetServiceTest.requestReserveRefusedForHiddenVenue`
- [ ] **AC-4:** Given an `ACTIVE` operator with a listed venue, when the operator is suspended,
  then the venue leaves both reads; when reinstated, it returns. *Pinned by:*
  `VenueCatalogVisibilityIT.suspendHidesReinstateRestores`
- [ ] **AC-5:** Given a booking made while the venue was visible, when the owning operator is
  suspended, then the booking still resolves by code, can still be cancelled (with its refund
  decision computed), and can still be checked in. *Pinned by:*
  `HiddenVenueSoldBookingRegressionIT.soldBookingSurvivesOwnerSuspension`
- [ ] **AC-6:** Given an operator is approved, when the approval mail is composed, then it
  states the venues-are-now-live-for-tourists news in copy that also holds for an operator
  owning no venue yet. *Pinned by:* the operator-approved leg of the existing mail tests
  (`SmtpMailer`/`MockMailer` copy assertions, exact class located in Phase 4)
- [ ] **AC-7:** Given a venue whose owner is not `ACTIVE`, when the admin photo-moderation
  console loads its venue picker, then that venue is listed (source: `GET /api/admin/venues`,
  not the public catalogue). *Pinned by:* `admin-venue-photos.service.spec.ts` (asserts the
  admin endpoint + mapping) and the mocked-suite e2e for the console
- [ ] **AC-8:** `ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests` stay green; the only cross-module edges in play
  are `venue → operator::api` and `booking → operator::api`, both already granted. *Pinned by:*
  the structural net run at each phase end.

## Non-goals

- No visibility column, no admin visibility control, no operator publish action (decided in
  epic #573 — derivation only).
- The anonymous per-venue photo read (`GET /api/venues/{id}/photos/{hash}`) stays unfenced —
  **accepted second-order leak** (issue #693 intake): its content-hash URLs only leak via
  reads this slice fences.
- No fence on any sold-booking path: code-gated view, cancel, refund, check-in, no-show sweep,
  request accept/decline/expiry, confirmation mail, `MyBookingsService` — all untouched.
- No fence on `SetBookingFacts` or any other venue api port besides `VenueCatalog`.
- PENDING operators still cannot sign in — that is #694 (blocked by this slice).
- No change to commission surfaces (#692, merged) or to the payout/refund flows.
- No repricing/backfill of ownership rows; V29's backfill already covered legacy venues.

## Behavior-parity ledger (photo-console venue-list source replacement)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Venue picker lists every venue from `GET /api/venues` (public catalogue) | changed | Lists every venue from `GET /api/admin/venues` — now includes hidden venues (the point of AC-7); superset of the old list |
| Anonymous read — worked without the admin session cookie being checked server-side | changed | Admin-authenticated read; the page already sits behind the admin route/session, so no user-visible change |
| Picker fields used: `id`, `name` (from `VenueSummary`) | preserved | Mapped from the admin response (`venueId`, `name`); service maps to the same `ModerationVenue` shape the component consumes |
| Failure → service propagates, component shows its existing error state | preserved | Same observable contract; only the URL + mapping change |
| Class doc claims "the catalogue is complete … nothing is hidden from a moderator" | dropped (reason) | The claim goes false with this slice; doc rewritten to name the admin list as the complete source |
| Commission figures not fetched by the console | changed (accepted) | The admin list response carries `commissionBps`; the same `ADMIN` role already reads it on that endpoint — no new exposure; the console ignores the field |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Fence leaks into a sold-booking path (the `SetBookingFacts` trap) and strands a guest | med | high | Fence only `VenueCatalog` impl + `ReserveSetService`; AC-5 regression IT covers resolve-by-code, cancel, check-in under a suspended owner | session | open |
| R-2 | Existing tests/fixtures create venues without ownership rows → fail-closed hides them and tests fail obscurely | med | med | Phase 2 sweeps fixtures of every touched test for ownership rows (mechanism: creates a `venue` row without a matching `operator_venue` row); add rows or assert hidden deliberately | session | open |
| R-3 | Non-enumeration regression: a distinguishable refusal would let a tourist probe hidden venues | low | med | Reuse `NO_SUCH_SET` (wire-identical 404 "No such set."); detail read reuses the existing empty→404 mapping — hidden ≡ absent everywhere | session | open |
| R-4 | `visibleAmong` with an empty candidate collection generates invalid `IN ()` SQL | med | low | Guard: empty in → empty set out, no query; unit-tested | session | open |
| R-5 | Admin console repoint breaks on response-shape mismatch or double-fetch | low | med | FE unit spec pins URL + mapping; mocked e2e drives the picker | session | open |
| R-6 | Docs go stale outside the diff (operator's "four things", the FE service doc's completeness claim) | high | low | Phase 6 pre-plans both edits; `riviera-docs-freshness` sweep at close-out | session | open |
| R-7 | Approval-mail copy asserts venue names it can't have (zero-venue operator) | low | low | Copy is generic ("your venues… any venue you create"); AC-6 asserts it renders without venue data | session | open |

## Open questions / Assumptions

- **Assumption:** the reserve-path refusal reuses `BookingOutcome.Rejected.NO_SUCH_SET`
  (no new enum constant): hidden must be indistinguishable from absent (R-3), and the
  controller's exhaustive switch stays untouched. — *Owner:* session · *Resolves by:* Phase 3
  (confirmed in review if contested)
- **Assumption:** unowned venue ⇒ hidden (fail-closed) is safe in prod because V29 backfilled
  every legacy venue (incl. seeded Miramar) to the bootstrap `ACTIVE` operator and
  creator-owns-on-create writes the mapping transactionally since. — *Owner:* session ·
  *Resolves by:* Phase 2 fixture sweep (R-2)
- **Assumption:** the venue-map page gets a distinct "venue not available" state (404 vs
  generic failure) — the current status-blind `failed` state offers a retry that can never
  succeed for a hidden venue. Small, user-observable, in-scope for a demoable slice. —
  *Owner:* session · *Resolves by:* Phase 5

## Availability & concurrency (invariant #2)

The slice touches `booking`'s reserve path but **adds no write path and changes no claim
semantics**; the fence is a read-only guard evaluated before the claim.

- **Write paths to `availability(set_id, booking_date)`:** unchanged inventory (online
  booking claim, staff tap-to-mark, cancellation release, request decline/expiry/withdraw
  release, weather refund release). This slice adds none and removes none.
- **Uniqueness guarantee:** unchanged — the `availability` unique constraint per
  `(set_id, booking_date)`.
- **Concurrency strategy:** unchanged — `ReserveSetService` still delegates to
  `availability`'s atomic claim; the visibility guard runs *before* `availability.claim(...)`
  inside the same `@Transactional` method, so a refused attempt claims nothing and there is
  nothing to release. A suspension racing a booking is benign either way: the fence reads
  committed operator status; a booking that slips through in the race is a booking made while
  the venue was (transactionally) still visible — exactly the "already sold" contract.
- **Pool rule (invariant #3):** unchanged, still enforced in `ReserveSetService` after the
  visibility guard.
- **Cutoff rule (invariant #4):** unchanged (`BookingCutoff`), still enforced after the
  visibility guard.
- **Pinning test:** existing `ConcurrentReservationIT` stays green (no claim change);
  `ReserveSetServiceTest.*RefusedForHiddenVenue` prove the guard rejects before any claim
  (the fake claim port records zero invocations).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | — (ownership mapping + lifecycle) | It owns operator status and the operator↔venue mapping; "which venues have an ACTIVE owner" is its fact to answer (its documented question set grows from four to five) |
| M-2 | `venue` | existing | `Venue`, `BeachMap` | The tourist catalogue is its read surface; it applies the visibility answer to its own reads |
| M-3 | `booking` | existing | `Booking` | The reserve decision is its orchestration; it consults the answer, never reads operator/venue tables |
| M-4 | `notification` | existing | — | Owns the mail copy in its adapters; trigger + link stay at the platform edge |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | **new** `VenueVisibility` — `boolean isVisible(VenueRef)`, `Set<VenueRef> visibleAmong(Collection<VenueRef>)` | `operator.vocabulary.VenueRef` | `venue` (catalogue fence), `booking` (reserve fence) |
| NI-2 | `venue.api` | `VenueCatalog` (unchanged interface; implementation becomes visibility-aware; javadoc amended) | existing | module's own REST adapter |
| NI-3 | `venue.api` | `SetBookingFacts` — **explicitly NOT fenced** (sold-booking consumers) | existing | unchanged |

Port doc pins the platform rule in one place: *visible ⇔ owning operator is `ACTIVE`;
a venue with no ownership row is not visible (fail-closed).* Grants: `venue` and `booking`
already list `operator::api` + `operator::vocabulary` — **no `allowedDependencies` change**.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none touched | | | | | The five-event inventory is unchanged; visibility is a synchronous query (the caller needs the answer now — same rationale as the availability claim) |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Answer "does venue X have an ACTIVE owner?" (fail-closed) | `operator` | Its Job: the ownership mapping + lifecycle state; venue's Not-My-Job: "deciding which venues an operator owns… → `operator`". Not on anyone else's claim |
| Omit hidden venues from list; empty map read for hidden | `venue` | Its Job: the tourist catalogue reads; it *renders* operator's answer (same shape as the S9 `/mine` precedent: ask `operator::api`, never join operator tables in venue SQL) |
| Refuse reserve (Instant + Request) for a hidden venue's set | `booking` | Its Job: orchestrate the reserve flow; consults `operator::api` (grant exists — staff view/weather refund already use it); venue facts stay a `venue::api` consultation |
| Approval-mail copy reword | `notification` (adapters) | Its Job: delivery + the message bodies for facts in hand; the *trigger* and sign-in link stay at the platform edge (`OperatorApprovalMail`) per its Not-My-Job |
| Admin console venue-list source | frontend `admin/` | FE-only repoint to the existing admin endpoint; no backend change |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves in this slice; the reserve fence rejects
before any PaymentIntent is created; cancel/refund paths are deliberately untouched (AC-5
proves the refund decision still computes for a sold booking at a hidden venue).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-venue-photos.service.ts` | existing | injectable service | Promise-based (unchanged) | — |
| FE-2 | `admin/admin-venue-photos.ts` | existing | standalone component | signals (unchanged) | — |
| FE-3 | `venue/venue-map.ts` + `.html` | existing | standalone component | new `notFound` signal alongside `failed` | — |

**Standards:** standalone components, signals, `@if`/`@for` — all already in place; the
change adds one signal + one template branch + a service URL/mapping swap. No new SCSS
(`riviera-tailwind`); a11y assertions on the new not-found state.

## FE↔BE contract

**No wire-shape change.** `GET /api/admin/venues` (existing, admin-authenticated) replaces
`GET /api/venues` as the console's venue-list source — same server contract as today, new
consumer. The venue detail read's 404 already exists; the FE starts distinguishing it from
other failures client-side.

## Execution status

**Stage pointer:** implement (Phase 2)

**Next action:** venue catalogue fence — RED `VenueCatalogVisibilityIT`, then `JdbcVenueCatalog` consults `VenueVisibility`; fixture sweep (R-2).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | `bedc7a7`; draft PR #696 |
| 1 — `operator.api.VenueVisibility` port + JDBC impl | ✅ | "Publish operator VenueVisibility api port" — `OperatorVenueVisibilityIT` 6/6, structural net green |
| 2 — `venue` catalogue fence (list + detail) | | |
| 3 — `booking` reserve fence + sold-booking regression | | |
| 4 — approval-mail reword | | |
| 5 — FE: admin console repoint + venue-map not-found + e2e | | |
| 6 — docs freshness + self-review + gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `docs/plans/operator-active-venue-visibility.md` — this plan
- `platform/src/main/java/ai/riviera/platform/operator/api/VenueVisibility.java` — new port
- `platform/src/main/java/ai/riviera/platform/operator/application/Operators.java` — driven-port methods for the visibility queries
- `platform/src/main/java/ai/riviera/platform/operator/application/OperatorService.java` — port implementation wiring (or sibling service class, per module's existing wiring)
- `platform/src/main/java/ai/riviera/platform/operator/adapter/out/JdbcOperators.java` — the two SQL queries
- `platform/src/test/java/ai/riviera/platform/operator/**` — port/adapter tests (statuses × unowned × empty-in guard)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — visibility-aware list + detail
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueCatalog.java` — javadoc amendment (hidden venues absent)
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — javadoc note: deliberately unfenced
- `platform/src/test/java/ai/riviera/platform/venue/**` — `VenueCatalogVisibilityIT` + fixture sweep fallout
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — the reserve guard
- `platform/src/test/java/ai/riviera/platform/booking/**` — reserve refusal tests + `HiddenVenueSoldBookingRegressionIT`
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — approval-mail copy
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/MockMailer.java` — mirrored copy
- `platform/src/test/java/ai/riviera/platform/notification/**` — copy assertions (exact class per Phase 4)
- `frontend/src/app/admin/admin-venue-photos.service.ts` — repoint + doc rewrite
- `frontend/src/app/admin/admin-venue-photos.service.spec.ts` — pins admin endpoint + mapping
- `frontend/src/app/venue/venue-map.ts` · `.html` — `notFound` state
- `frontend/src/app/venue/venue-map.spec.ts` — not-found state spec
- `frontend/e2e/**` — mocked-suite specs: hidden-venue 404 state; admin console picker
- `RESPONSIBILITIES.md` — §`operator` four→five questions + new port; §`venue` catalogue contract line
- `docs/plans/operator-active-venue-visibility.md` — execution-status updates throughout

(Exact test-file names/paths firm up per phase; the guard
`node scripts/check-plan-file-structure.mjs --diff origin/main` reconciles this section
with the diff before every push.)

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/operator-active-venue-visibility.md`

- [ ] Commit the plan doc; push `-u origin claude/sdlc-693-salq7e`; open the **draft PR**
  referencing #693 (CI fires on `pull_request` only — the draft is the CI vehicle).
- [ ] Update Execution status in the same commit window.

## Phase 1 — `operator.api.VenueVisibility` (TDD)

**Files:** Create `operator/api/VenueVisibility.java` · Modify `application/Operators.java`,
`application/OperatorService.java` (or the module's wiring class), `adapter/out/JdbcOperators.java` ·
Test `operator/**`

- [ ] **Red:** adapter/module test — venues owned by `ACTIVE` are visible; `PENDING`/
  `SUSPENDED`/`REJECTED`-owned and unowned venues are not; `visibleAmong([])` → empty set,
  no SQL. Run scoped: `./gradlew test --tests "*Visibility*"` → FAIL.
- [ ] **Green:** port + `Operators` methods + `JdbcOperators` SQL
  (`EXISTS(SELECT 1 FROM operator_venue ov JOIN operator o ON o.id = ov.operator_id AND o.status = 'ACTIVE' WHERE ov.venue_id = :venue)`;
  batch form via `IN (:ids)` with the empty guard). Javadoc pins the platform rule +
  fail-closed semantics.
- [ ] Structural net: `./gradlew test --tests "*ModularityTests*" --tests "*PackageShape*" --tests "*PublishedSurfacePlacement*"` → green.
- [ ] Commit `(#693)`; update Execution status.

## Phase 2 — `venue` catalogue fence (TDD)

**Files:** Modify `venue/adapter/out/JdbcVenueCatalog.java`, `venue/api/VenueCatalog.java`
(javadoc), `venue/api/SetBookingFacts.java` (javadoc) · Test `venue/**`

- [ ] **Red:** `VenueCatalogVisibilityIT` — AC-1 (PENDING→approve), AC-2 (hidden map read
  empty), AC-4 (suspend/reinstate). Scoped run → FAIL.
- [ ] **Green:** `JdbcVenueCatalog` consults `VenueVisibility` — detail: guard before/after
  the row read; list: `visibleAmong` over the summary candidates, filter before the
  follow-on queries.
- [ ] **Fixture sweep (R-2):** enumerate by mechanism — every test whose fixture inserts a
  `venue` row (`git grep -l "INSERT INTO venue" platform/src/test` + the shared fixture
  helpers) — and give each an ownership row or an explicit hidden-venue assertion. Record in
  the Generalization-audit log.
- [ ] Structural net + venue-scoped tests green; commit; update Execution status.

## Phase 3 — `booking` reserve fence + sold-booking regression (TDD)

**Files:** Modify `booking/application/reserve/ReserveSetService.java` · Test `booking/**`

- [ ] **Red:** `ReserveSetServiceTest` fakes `VenueVisibility` → hidden ⇒
  `Rejected(NO_SUCH_SET)` on Instant and Request, claim port never invoked (AC-3). And
  `HiddenVenueSoldBookingRegressionIT` (AC-5): book while visible → suspend owner → resolve
  by code + cancel (refund decision computes) + check-in still work. → FAIL.
- [ ] **Green:** inject `VenueVisibility`; guard after the `setBookingInfo` resolve, before
  pool/cutoff/claim.
- [ ] Structural net + booking-scoped tests green; commit; update Execution status.

## Phase 4 — approval-mail reword

**Files:** Modify `notification/adapter/out/SmtpMailer.java`, `MockMailer.java` · Test the
module's existing mail-copy tests

- [ ] **Red first** on the copy assertions (AC-6): news = account approved **and** venues now
  live for tourists; copy generic enough for a zero-venue operator; sign-in link retained.
- [ ] Green; scoped notification tests; commit; update Execution status.

## Phase 5 — frontend (load `riviera-frontend`, `angular-developer` + MCP, `riviera-tailwind`, `playwright-cli` first)

**Files:** Modify `admin/admin-venue-photos.service.ts` (+ doc), `venue/venue-map.ts`/`.html` ·
Test `admin-venue-photos.service.spec.ts`, `venue-map.spec.ts`, mocked e2e suite

- [ ] Repoint the console venue list at `GET /api/admin/venues`; map to the picker shape;
  rewrite the class doc (parity ledger rows); unit spec pins URL + mapping (AC-7).
- [ ] `venue-map`: `notFound` signal — 404 renders "venue not available" + back-home (no
  retry); other errors keep the retry panel. Unit + a11y assertions.
- [ ] Mocked-suite e2e: hidden-venue 404 flow; admin console picker on the admin endpoint.
  (Suite placement is RV-FE-E2E's call — mocked suite, both.)
- [ ] `npm run lint && npm run format:check && npm test && npm run test:e2e:a11y` scoped as
  feasible; commit; update Execution status.

## Phase 6 — docs + gates

- [ ] `RESPONSIBILITIES.md`: §`operator` "four things" → five (+ the new port and its
  fail-closed rule); §`venue` catalogue line (tourist reads exclude venues without an
  `ACTIVE` owner).
- [ ] `riviera-docs-freshness` sweep over `origin/main..HEAD`; fix what it flags.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] Merge latest `origin/main`; mark PR ready for review; run the Review gate
  (`/code-review` ladder + `riviera-review-overlay`) and the Sonar gate per
  `references/pr-gates.md`; findings re-enter at Implement.
- [ ] Self-review checklist; finalize Execution status (`merged via PR #NN`) in the PR's
  last commit; merge; close-out (epic #573 tick, issue close).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-8:** each verified by its pinned test at the recorded commit (filled at
  Phase 6).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section holds: no claim change; guard precedes claim; `ConcurrentReservationIT` green (invariant #2).
- [ ] Pool + cutoff rules untouched and still ordered after the guard (invariants #3, #4).
- [ ] **Modulith** section holds; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** N/A holds — no money path touched (invariants #5, #8, #9).
- [ ] Refund policy untouched server-side; AC-5 proves it still computes (invariant #10).
- [ ] Timezone: no new time arithmetic beyond existing cutoff use (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change — no Flyway migration needed (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register closed; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`).
- [ ] **The review gate ran in full** per the invocation ladder + overlay.
