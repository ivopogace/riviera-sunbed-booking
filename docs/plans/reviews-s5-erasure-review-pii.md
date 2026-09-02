# Reviews slice 5 — erasure covers reviews: blank the display name, delete the comment

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** When a data subject is erased — self-service, admin-by-email, or the retention
sweep tombstoning a guest contact — every review reachable from their bookings loses its
display name and its comment in the same transaction; the star stays, the venue's stored
aggregate does not move, the review drops out of the public list (it no longer carries a
comment) and still renders coherently on the admin list and the author's own booking page;
a second erasure changes nothing.

**Architecture:** The reach is a **synchronous, dependency-inverted port chain with no new
grant**: `customer` declares `customer.spi.ReviewErasure` (the `GuestBookingHistory` shape —
"erase the reviews of these subjects"), `booking` implements it in `adapter/out` by resolving
the subjects' booking ids from its own table and handing them to a new `review.api` port,
`ReviewTombstones`, which `review`'s own JDBC adapter implements directly (the
`JdbcCustomerDirectory` precedent) as one idempotent `UPDATE`. `booking` already holds
`customer::spi` and `review::api`, `customer` stays at `allowedDependencies = {}` and `review`
stays a leaf (ADR-0015). Synchronous rather than an event because ADR-0010's scrub is one
transactional unit — a partial erasure must never commit — and the availability claim is the
precedent for a cross-module write that needs that. The review tombstone is `display_name =
NULL, comment = NULL`: the frontend already attributes a nameless review to "A guest" on both
surfaces that can still show it, so the neutral label costs no code and no English literal in
the database. No `ReviewsChanged`: stars and `hidden_at` are untouched, so the aggregate is
unchanged by construction.

**Persistence:** JDBC only (invariant #1). No migration: three statements over existing
columns and indexes — `UPDATE review … WHERE booking_id IN (…)` (served by
`review_once_per_booking`), `SELECT id FROM booking WHERE customer_id IN (…)`
(`booking_customer_id_idx`) and `… WHERE account_id = ?` (`booking_account_id_idx`, partial).
The two guest/account tombstones gain `RETURNING id` so the erasure knows which subjects it
scrubbed.

**Source of intent:** issue #815 (epic #810, user story 25; ADR-0010 extended to the review
PII slice 2 introduced).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
`customer` cannot call `review` either (both are leaves), so the only module that can both
resolve a subject's bookings and reach `review::api` is `booking`, which already holds both
grants; that the account and guest paths need the *ids* the tombstones scrubbed, which the
store port currently reduces to a boolean / a count; that a tombstoned guest's email is a
placeholder, so a repeat admin-by-email erasure cannot re-reach reviews on guest bookings —
the same scoped non-goal ADR-0010 already records; and that the hidden review must be
tombstoned too) · `riviera-plan-doc` (this template — forced decisions D-1..D-6 to be
written down before phase 0, and the outcome rule D-4) · `tdd` (each phase is one seam:
the review port, the customer→booking→review chain, the sweep) · `riviera-review-overlay`
(review gate — **ran** at ready-for-review with `code-review:code-review` at high effort: five
reviewers + the overlay walk, one finding (F-1, a Javadoc overclaim), fixed) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD` after phase 3's docs sweep, 9
findings: 6 patched — the runbook's sweep log line and its idempotence property, `EraseOutcome`'s
Javadoc (a reviews-only scrub is `ERASED`), `customer.api`'s package inventory, the scheduler's
"every scrub" Javadoc, and a self-contradicting CONTEXT.md sentence; 3 ADR flags handled as
amendment notes in the ADR's own style, listed under Open questions for the maintainer to veto:
ADR-0012's "erasure touches only `customer`-owned rows", ADR-0015's port count ("*Amended by
#815:* a fourth port"), and the superseded-in-part pointer on ADR-0010's "one adapter" bullet) · `postgres` (no new
column — a marker nothing reads is a column nothing needs; `UPDATE … RETURNING id` to hand
ids back from the tombstone; the `IN (:list)` reads sit on the two existing FK indexes)
· `riviera-modulith` (the port is `spi` on the consumer, `api` on the provider, per the
api-vs-spi decision rule; no grant changes; `ModularityTests` is the gate) ·
`riviera-java-conventions` (`Optional`/`List` from the store instead of boolean/int,
records, one-line comments, the erasure log carries counts and ids only) ·
`codebase-design` (deepened the two existing tombstone methods to return what they
scrubbed instead of adding sibling id reads; the `review` side is the adapter implementing
the port directly — a service would be a pass-through that fails the deletion test) ·
`domain-modeling` (CONTEXT.md gains **Review tombstone**; no ADR — an amendment note on
ADR-0010, whose "erasure is single-module" consequence this slice changes) ·
`riviera-frontend` (no code change under `frontend/src`; three doc comments on the wire
types are corrected, nothing else) · `riviera-local-debug` (scoped classes; one IT class
at a time).

**Branch:** `claude/sdlc-815-4abhmv` — the session's designated remote branch stands in for
`feature/reviews-s5-erasure-review-pii` (`riviera-sdlc` remote addendum).

---

## Decisions the grill settled

- **D-1 — the reach path.** `customer.spi.ReviewErasure` (driven, inverted) ← implemented
  by `booking/adapter/out/BookingReviewErasure` → calls `review.api.ReviewTombstones` ←
  implemented by `review/adapter/out/JdbcReviewTombstones`. `booking` resolves subject →
  bookings (its table); `review` resolves bookings → reviews (its table); `customer` never
  learns a booking id. Rejected: an erasure *event* (`review` could not act on it — it
  cannot resolve a customer to bookings — so `booking` would still be the listener, now
  asynchronously and outside the erasure transaction, against ADR-0010's one-unit rule);
  `review` implementing a `customer.spi` port itself (re-adds an outbound edge to the leaf).
- **D-2 — the tombstone shape.** `display_name = NULL`, `comment = NULL`; `stars`,
  `hidden_at`, `created_at`, `updated_at` untouched (`updated_at` means "the author
  edited"). The neutral label is the presentation layer's existing "A guest" fallback on the
  admin list and the venue page, and the booking page simply shows no name. Rejected: a
  stored `'ERASED'` literal (a tourist-visible field, unlike `customer.full_name`); an
  `erased_at` marker column (nothing would read it — the runbook's re-erase-on-restore
  replays the erasure, it does not consult a marker).
- **D-3 — no `ReviewsChanged`.** The aggregate reads `stars` under `hidden_at IS NULL`;
  neither column changes, so `venue`'s stored rating cannot be stale. Pinned, not assumed.
- **D-4 — the outcome rule.** `eraseAccount` answers `ERASED` when *any* of the account
  row, a guest row, or a review row changed, `ALREADY_ERASED` when none did; `eraseByEmail`
  keeps `NOT_FOUND` for "no live subject" (a placeholder email matches nothing, so its
  reviews are not re-reached — the existing scoped non-goal). The sweep's return value stays
  "contacts tombstoned"; reviews are logged as a second count.
- **D-5 — the store port returns what it scrubbed.** `eraseAccountByEmail` →
  `Optional<CustomerAccountId>`, `eraseGuestByEmail` → `List<CustomerId>` (`RETURNING id`),
  so the service can hand the subjects on without a second read.
- **D-6 — a tombstoned review is not frozen.** The booking code stays valid and the window
  is the window: if the subject writes again inside it, that is their own fresh act. No new
  `ReviewGate` verdict.

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue with two commented, named reviews and one star-only named review
  (one of the commented ones hidden), when `ReviewTombstones.tombstone` is called with all
  three bookings, then it answers `3`, every row reads `display_name IS NULL AND comment IS
  NULL` with its stars and `hidden_at` intact, and a second call answers `0`. *Seam:*
  `review.api.ReviewTombstones` · *Pinned by:* `ReviewTombstoneFlowIT.tombstoneBlanksNameAndCommentOnceAndKeepsTheStars`
- [x] **AC-2:** Given a venue at `RatingSummary(45, 2)` whose two reviews are commented, when
  both are tombstoned, then the aggregate still reads `RatingSummary(45, 2)`, the public list
  is empty, the admin page lists both with `displayName` and `comment` `null`, and the
  author's panel is `ReviewPanel.AlreadyReviewed` carrying a nameless, commentless
  `OwnReview` (the slot stays taken — D-6). *Seam:* `ReviewTombstones` + `VenueRatingSummary` + `ListedReviews` +
  `ReviewModeration#pageFor` + `ReviewEligibility` · *Pinned by:*
  `ReviewTombstoneFlowIT.aTombstonedReviewLeavesTheListAndStaysInTheScore`
- [x] **AC-3:** Given a venue's stored rating columns recomputed from its reviews, when those
  reviews are tombstoned, then no `ReviewsChanged` is published and the stored columns are
  unchanged. *Seam:* `ReviewTombstones` + the `venue` row · *Pinned by:*
  `ReviewTombstoneFlowIT.tombstoningPublishesNothingAndLeavesTheStoredRating`
- [x] **AC-4:** Given a customer account with one account-linked booking and one guest-contact
  booking sharing its email, each reviewed with a name and a comment, when
  `AccountErasure.eraseAccount` runs, then both reviews are tombstoned, both stars remain,
  the venue aggregate is unchanged, and the retained booking/payment/payout rows are
  untouched. *Seam:* `customer.api.AccountErasure` · *Pinned by:*
  `AccountErasureIT.eraseAccountTombstonesTheSubjectsReviews`
- [x] **AC-5:** Given a guest with no account whose booking is reviewed, when
  `AccountErasure.eraseByEmail` runs with that email, then the review is tombstoned. *Seam:*
  `customer.api.AccountErasure` · *Pinned by:* `AccountErasureIT.adminEraseByEmailTombstonesTheGuestsReviews`
- [x] **AC-6:** Given an already-erased account whose account-linked booking gained a named
  review afterwards, when `eraseAccount` runs again, then the review is tombstoned and the
  outcome is `ERASED`; when it runs a third time, then nothing changes and the outcome is
  `ALREADY_ERASED`; the service asks the review port once per subject kind per call, never
  for an empty guest list. *Seam:* `AccountErasure` over a fake `ReviewErasure` ·
  *Pinned by:* `AccountErasureServiceTest.eraseAccountReachesReviewsOfBothSubjectsAndIsIdempotent`,
  `AccountErasureServiceTest.eraseByEmailReachesTheGuestsAndTheAccountsReviews`,
  `AccountErasureIT.eraseAccountTombstonesTheSubjectsReviews` (its second erasure: `ALREADY_ERASED`, the review stays tombstoned)
- [x] **AC-7:** Given the retention sweep scrubs two expired guests and retains one, when it
  runs, then `ReviewErasure.eraseForGuests` is called once with exactly the two scrubbed ids,
  and not at all when nothing was scrubbed. *Seam:* `customer.application.ExpireGuestContacts`
  over a fake `ReviewErasure` · *Pinned by:*
  `ExpireGuestContactsServiceTest.sweepTombstonesTheScrubbedGuestsReviewsInOneCall`,
  `ExpireGuestContactsServiceTest.sweepWithNothingScrubbedNeverReachesReviews`
- [x] **AC-8:** Given an expired guest whose booking is reviewed with a name and comment, when
  the sweep runs, then the review is tombstoned, its star and the venue aggregate are
  unchanged, and the financial rows are untouched. *Seam:* `ExpireGuestContacts` · *Pinned
  by:* `GuestContactRetentionIT.scrubsTheExpiredGuestsReviewsToo`
- [x] **AC-9:** Given the module graph after this slice, when `ApplicationModules.verify()`
  and the package-shape / published-surface tests run, then they pass with no
  `allowedDependencies` change on any module. *Seam:* the module structure · *Pinned by:*
  `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`
- [x] **AC-10:** Given the admin list and the venue page receive a review with `displayName`
  `null`, when they render, then the name reads "A guest" — the already-shipped pins, cited
  not re-written. *Seam:* the two components' inputs · *Pinned by:*
  `admin-reviews.spec.ts` ("A guest" on the nameless row), `venue-reviews.spec.ts`
  ("attributes a review without a display name to \"A guest\"")

## Non-goals

- **Freezing a tombstoned review** for its author (D-6) or hiding it — the star stays in
  circulation on purpose.
- **A review-side marker** (`erased_at` on `review`) or an in-DB erasure register — ADR-0010
  already deferred the register; nothing here reads a marker.
- **Re-reaching reviews on guest bookings after the guest is tombstoned** by email — the
  placeholder email is unreachable by design; the account path (by id) still reaches
  account-linked bookings on every call.
- **Any frontend behaviour change** — both surfaces already render a nameless review;
  only three doc comments on the wire types change.
- **Hard-deleting review rows** — the star is the venue's earned score (issue text), and a
  delete would free the one-per-booking slot for a resubmit.
- Operator replies, review nudges, and every other #810 out-of-scope item.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behaviour, replaces nothing. The two store methods that change shape
(`eraseAccountByEmail`, `eraseGuestByEmail`) keep their scrub semantics exactly; only the
return type widens from "did it / how many" to "which".

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The review step commits while the contact scrub rolls back (or vice versa) — a half-erasure | low | high | the review reach is a synchronous port call inside the existing `@Transactional` erasure / sweep; all three adapters share the one `DataSource`, so one transaction; `AccountErasureIT` asserts the review and the contact together | agent | closed — `AccountErasureIT`/`GuestContactRetentionIT` assert the review and the contact in one transaction; no listener, no second transaction |
| R-2 | `ModularityTests` cycle or grant failure from the new ports | low | med | `customer` declares `spi` (already granted to `booking`); `review` adds an `api` port (already granted to `booking`); no module's list changes — the structural net runs in phase 1 | agent | closed — structural net green at phases 0, 1 and the review; no grant changed |
| R-3 | The aggregate or the stored venue rating drifts after a tombstone | low | high | D-3: no column the aggregate reads changes; AC-3 pins the stored columns and the absence of `ReviewsChanged` | agent | closed — `ReviewTombstoneFlowIT.tombstoningPublishesNothingAndLeavesTheStoredRating` |
| R-4 | A subject's reviews are missed: the account path forgets guest bookings sharing the email, or the sweep forgets the reviews of a guest it scrubbed | med | high | the service reaches reviews through *both* subject kinds on `eraseAccount` (account id + the guest ids the tombstone returned) and through both on `eraseByEmail`; the sweep hands the exact scrubbed id list on; AC-4/5/7/8 | agent | closed — AC-4/5/7/8 pinned; both subject kinds reached on `eraseAccount` and `eraseByEmail` |
| R-5 | An empty `IN (…)` list is invalid SQL (the `JdbcGuestBookingHistory` lesson) | med | low | every adapter short-circuits an empty collection before binding; the service never calls with an empty guest list (AC-6/7) | agent | closed — both adapters short-circuit an empty collection; the service never calls with an empty list (unit-pinned) |
| R-6 | Log forging / PII in the erasure log | low | med | the added fields are counts and technical ids only (`riviera-java-conventions` §10) | agent | closed — the log lines carry counts and ids only (reviewers #1/#2 confirmed) |
| R-7 | The sweep's review `UPDATE` runs on the unbounded client | low | low | deliberate — it is a scrub write inside the sweep transaction, the `JdbcAccountErasure` rationale ("a half-applied batch is worth less than a slow one"); the sweep's *entry reads* stay bounded; `ScheduledWorkArchitectureTest` counts `@Scheduled` methods, of which this adds none | agent | closed — deliberate; `ScheduledWorkArchitectureTest` counts `@Scheduled` methods (none added) |
| R-8 | Docs that count or enumerate go stale (three `api` ports; "erasure is a single-module operation"; the runbook table; "null only for pre-slice-2") | high | low | phase 3 sweeps each; `riviera-docs-freshness` runs over the range | agent | closed — `riviera-docs-freshness` ran (9 findings, all handled) |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

None open.

### Resolved

- **Assumption:** the neutral label stays the frontend's existing "A guest" (D-2) rather
  than a stored literal. — *Resolved:* held through the review gate; the maintainer can still
  overrule by follow-up, but the PR shipped it (PR #899).
- **Assumption:** the sweep's return value keeps meaning "contacts tombstoned"; reviews are a
  second logged count. — *Resolved:* phase 2 (`ExpireGuestContactsServiceTest`, the runbook's log
  line updated).
- **Assumption (docs-freshness flags):** the three ADR passages (ADR-0012's "only `customer`-owned
  rows", ADR-0015's port count, ADR-0010's "one adapter" bullet) carry amendment notes rather than
  rewrites. — *Resolved:* shipped as amendment notes in PR #899; none changes a decision.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Nothing here reads or writes
`availability(set_id, booking_date)`, the beach map, or any booking state; `booking`'s only
part is a read of its own `customer_id` / `account_id` columns to resolve booking ids.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing | `Customer`, `CustomerAccount` | owns erasure and the retention sweep — the two flows gain the review step and the subject ids they hand on |
| M-2 | `booking` | existing | `Booking` | sole owner of the `booking` table, so subject → booking ids is its fact; already implements `customer.spi` and calls `review.api` |
| M-3 | `review` | existing (leaf) | `Review` | mutates only its own table; the tombstone is one statement in its adapter |

**Cross-module named interfaces (`api/` + `spi/` ports)**

| # | Module.surface | Port | Public types | Consumers / implementor |
|---|---|---|---|---|
| NI-1 | `customer.spi` | `ReviewErasure#eraseForGuests(Collection<CustomerId>)`, `#eraseForAccount(CustomerAccountId)` → `int` | `CustomerId`, `CustomerAccountId` | called by `customer`'s two services; **implemented by `booking`** (`adapter/out/BookingReviewErasure`) |
| NI-2 | `review.api` | `ReviewTombstones#tombstone(Collection<BookingRef>)` → `int` | `BookingRef` | called by `booking`'s adapter; implemented by `review/adapter/out/JdbcReviewTombstones` |

Grants: unchanged. `booking` already lists `customer::spi`, `customer::vocabulary`,
`review::api`, `review::vocabulary`; `customer` stays `{}`; `review` stays `{ "shared" }`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none added; `ReviewsChanged` deliberately **not** published (D-3) | | | | | `ReviewTombstoneFlowIT.tombstoningPublishesNothingAndLeavesTheStoredRating` |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| deciding *that* a subject's reviews are erased, and when (erasure request, retention expiry) | `customer` | `customer` Job: "own right-to-erasure … own the retention policy"; `review` Not-My-Job: "the guest's identity → `customer`" |
| resolving a data subject (guest id / account id) to booking ids | `booking` | sole owner/reader of the `booking` table (its Job); `customer` Not-My-Job: "Bookings → `booking`"; the `GuestBookingHistory` precedent — a fact answered through `customer.spi` |
| blanking `display_name` / `comment` on review rows | `review` | `review` Job: "own everything about … the review record"; the issue: "`review` mutates only its own table"; `booking` never writes `review` |
| the neutral label on a nameless review | frontend (`admin/admin-reviews.ts`, `venue/venue-reviews.ts`) | already shipped ("A guest"); `review` Not-My-Job: "Displaying a rating … → the frontend" |
| the venue's stored rating | `venue` | unchanged — nothing it reads moves (D-3); it stays its table's only writer |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The financial rows stay untouched, as every erasure IT asserts
(invariant #9).

## Angular — frontend surfaces touched

N/A — backend-only in behaviour. Three TS doc comments (`shared/venue-views.ts`,
`admin/admin.model.ts`, `booking/booking.model.ts`) that say a null `displayName` means only
"written before display names were required" gain "or erased"; no component, template, or
spec changes.

## FE↔BE contract

N/A — no contract change. `displayName: string | null` and `comment: string | null` were
already the wire types on every surface; a tombstoned review is one more row shaped that way.

## Execution status

**Stage pointer:** `DONE` — merged via PR #899 (review gate ran, Sonar gate cleared, CI green).

**Next action:** none — the slice is closed out; epic #810's last slice. Post-merge GitHub edits only
(issue #815 closed by the PR, the epic's sub-issue summary reads 5/5).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `review.api.ReviewTombstones` + `JdbcReviewTombstones` | ✅ | phase-0 commit |
| 1 — `customer.spi.ReviewErasure`, `booking`'s adapter, the erasure services reach | ✅ | phase-1 commit |
| 2 — the retention sweep reaches reviews | ✅ | phase-2 commit |
| 3 — docs, merge `origin/main`, ready for review, the gates | ✅ | merged via PR #899 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-2 | sonar | SonarCloud on PR #899: analysis present (315 new lines), 0 new issues, 0 security hotspots, 0 duplicated blocks, 96.1% new-code coverage — nothing to clear | closed |
| F-1 | review (`code-review:code-review`, high, 5 reviewers + overlay; reviewer #5, scored 50) | `ReviewErasure.eraseForAccount` Javadoc said the account's reviews are reached "on every erasure, tombstoned or not" — true of the self-service by-id path only; the admin by-email path cannot resolve a tombstoned account (placeholder email), the D-4 non-goal | fixed-in-the review-fix commit: the Javadoc names the asymmetry; ADR-0010's amendment paragraph says *self-service* / *admin-by-email* explicitly |

---

## File structure

- `docs/plans/reviews-s5-erasure-review-pii.md` — this plan
- `platform/src/main/java/ai/riviera/platform/review/api/ReviewTombstones.java` — new `api` port
- `platform/src/main/java/ai/riviera/platform/review/api/package-info.java` — the port inventory (four ports)
- `platform/src/main/java/ai/riviera/platform/review/adapter/out/JdbcReviewTombstones.java` — new: the one `UPDATE`
- `platform/src/main/java/ai/riviera/platform/review/package-info.java` — surface inventory
- `platform/src/main/java/ai/riviera/platform/review/vocabulary/OwnReview.java` · `ListedReview.java` — the null-name Javadoc
- `platform/src/main/java/ai/riviera/platform/review/application/ModeratedReview.java` — the null-name Javadoc
- `platform/src/main/java/ai/riviera/platform/customer/spi/ReviewErasure.java` — new `spi` port
- `platform/src/main/java/ai/riviera/platform/customer/spi/package-info.java` — the inventory (two ports)
- `platform/src/main/java/ai/riviera/platform/customer/package-info.java` — the `spi` sentence
- `platform/src/main/java/ai/riviera/platform/customer/api/AccountErasure.java` — the contract names the review step
- `platform/src/main/java/ai/riviera/platform/customer/application/AccountErasureStore.java` — D-5 return types
- `platform/src/main/java/ai/riviera/platform/customer/application/AccountErasureService.java` — the review step, D-4
- `platform/src/main/java/ai/riviera/platform/customer/application/ExpireGuestContacts.java` — the contract names the review step
- `platform/src/main/java/ai/riviera/platform/customer/application/ExpireGuestContactsService.java` — the review step
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcAccountErasure.java` — `RETURNING id` on both by-email tombstones
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/BookingReviewErasure.java` — new: the `customer.spi.ReviewErasure` adapter
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — the `customer::spi` comment names both ports
- `platform/src/test/java/ai/riviera/platform/review/ReviewTombstoneFlowIT.java` — new
- `platform/src/test/java/ai/riviera/platform/ReviewFixtures.java` — a `review(...)` read-back helper if needed
- `platform/src/test/java/ai/riviera/platform/customer/AccountErasureIT.java` — AC-4/5/6
- `platform/src/test/java/ai/riviera/platform/customer/GuestContactRetentionIT.java` — AC-8
- `platform/src/test/java/ai/riviera/platform/customer/application/AccountErasureServiceTest.java` — AC-6; the fake follows D-5
- `platform/src/test/java/ai/riviera/platform/customer/application/ExpireGuestContactsServiceTest.java` — AC-7; the fake follows D-5
- `frontend/src/app/shared/venue-views.ts` · `frontend/src/app/admin/admin.model.ts` · `frontend/src/app/booking/booking.model.ts` — the null-name doc comments
- `RESPONSIBILITIES.md` — §customer (Job + Not-My-Job + Shipped), §booking (the second `customer.spi` fact it answers), §review (the tombstone, the fourth `api` port, what a null name means, Shipped)
- `CONTEXT.md` — **Review tombstone**
- `CLAUDE.md` — the `customer` and `review` rows
- `docs/adr/ADR-0010-erasure-pseudonymize-in-place.md` — amendment note: erasure now reaches `review` through an inverted port
- `docs/runbooks/data-erasure.md` — the what-erasure-touches table gains the review row
- `docs/adr/ADR-0012-email-suppression-hashed-key.md` · `docs/adr/ADR-0015-review-leaf-module.md` — amendment notes from the docs-freshness run (erasure now reaches `review`; a fourth `api` port)
- `platform/src/main/java/ai/riviera/platform/customer/vocabulary/EraseOutcome.java` · `customer/api/package-info.java` · `customer/adapter/in/GuestContactRetentionScheduler.java` — Javadoc patched by the docs-freshness run (a reviews-only scrub is `ERASED`; the inventory names the review reach; "every scrub" now covers the review tombstone)

---

## Phase 0 — `review.api.ReviewTombstones` + `JdbcReviewTombstones`

**Files:** Create `ReviewTombstones.java`, `JdbcReviewTombstones.java`,
`ReviewTombstoneFlowIT.java` · Modify `review/api/package-info.java`,
`review/package-info.java`, the three null-name Javadocs

- [x] **Step 1: Write the failing tests** — `ReviewTombstoneFlowIT` (the
  `ReviewModerationFlowIT` cast: `@EnabledIfDockerAvailable`, `@Import(TestcontainersConfiguration.class)`,
  `@SpringBootTest`, `ReviewFixtures`): AC-1 (three rows incl. a hidden one → `3`, then `0`,
  stars and `hidden_at` intact), AC-2 (aggregate unchanged, `ListedReviews` page empty, the
  admin page shows both nameless/commentless, `ReviewEligibility.panelFor` carries a nameless
  `OwnReview`), AC-3 (`ApplicationModuleTest`-free: assert the venue's `rating_tenths` /
  `reviews_count` after a recompute are unchanged after the tombstone, and that the
  `event_publication` table gained no `ReviewsChanged` row for the venue).

```java
public interface ReviewTombstones {
	/** Blank the display name and delete the comment of every review of these bookings; returns how many rows changed. */
	int tombstone(Collection<BookingRef> bookings);
}
```

- [x] **Step 2: Run, verify red** — `gradle --no-daemon --console=plain test --tests "*ReviewTombstoneFlowIT*"` → compile failure on the missing port (the honest red for a new seam) — observed; then one red on fixture timing: a 2026-07-01 check-in is past the 60-day window today, so the panel read `Frozen` (carrying the nameless review) — the test now checks that stay in an hour ago
- [x] **Step 3: Minimal implementation** — `JdbcReviewTombstones` (`@Repository`, package-private, empty-collection short-circuit, `UPDATE review SET display_name = NULL, comment = NULL WHERE booking_id IN (:bookings) AND (display_name IS NOT NULL OR comment IS NOT NULL)` → rows affected); the `api` inventory.
- [x] **Step 4: Run, verify green** — the IT + `ReviewListingFlowIT` + `ReviewModerationFlowIT` → PASS
- [x] **Step 5: Generalization audit** — population: every production SQL statement that touches `review` (`grep -rn "FROM review\b\|UPDATE review\b\|INTO review\b\|DELETE FROM review\b" platform/src/main`) → is any *other* statement a PII write that erasure must also cover? (claim/update write the author's own new data — not erasure's).
- [x] **Step 6: Commit** — `Blank a review's display name and comment through the review module's tombstone port (#815)`
- [x] **Step 7: Update Execution status.**

## Phase 1 — `customer.spi.ReviewErasure`, `booking`'s adapter, the erasure service reach

**Files:** Create `ReviewErasure.java`, `BookingReviewErasure.java` · Modify
`AccountErasureStore.java`, `AccountErasureService.java`, `JdbcAccountErasure.java`,
`AccountErasure.java`, `customer/spi/package-info.java`, `customer/package-info.java`,
`booking/package-info.java` · Test `AccountErasureServiceTest.java`, `AccountErasureIT.java`

- [x] **Step 1: Failing tests** — `AccountErasureServiceTest` gains a `FakeReviewErasure`
  (records each call's ids; answers a configurable count) and the two AC-6 tests; the
  `FakeErasureStore` follows D-5. `AccountErasureIT` gains AC-4 and AC-5 and extends
  `eraseAccountIsIdempotent` with a review that stays tombstoned.

```java
public interface ReviewErasure {
	int eraseForGuests(Collection<CustomerId> guests);
	int eraseForAccount(CustomerAccountId account);
}
```

- [x] **Step 2: Run, verify red** — `--tests "*AccountErasureServiceTest*"` → compile failure on the missing port, then assertions.
- [x] **Step 3: Minimal implementation** — the port; `BookingReviewErasure` (`@Repository`, package-private, `JdbcClient` + `ReviewTombstones`; `SELECT id FROM booking WHERE customer_id IN (:guests)` / `WHERE account_id = :account`; empty guard); `JdbcAccountErasure` returns ids (`RETURNING id`); the service: `eraseAccount` → account by id, guests by email, then `eraseForAccount(accountId) + eraseForGuests(guests)` (skipping an empty list), outcome per D-4; `eraseByEmail` → account by email (`Optional` id), guests by email, the same two reaches; the log lines gain `scrubbedReviews=`.
- [x] **Step 4: Green** — the unit test + `AccountErasureIT` → PASS; then the structural net (`ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `JdbcOnlyArchitectureTests`).
- [x] **Step 5: Generalization audit** — population: every implementor of `AccountErasureStore` (`grep -rln "implements AccountErasureStore" platform/src`) follows D-5; every consumer of `eraseGuestByEmail` / `eraseAccountByEmail` (`grep -rn "eraseGuestByEmail\|eraseAccountByEmail" platform/src`).
- [x] **Step 6: Commit** — `Reach a data subject's reviews from erasure through booking's inverted customer.spi port (#815)`
- [x] **Step 7: Update Execution status.**

## Phase 2 — the retention sweep reaches reviews

**Files:** Modify `ExpireGuestContactsService.java`, `ExpireGuestContacts.java` · Test
`ExpireGuestContactsServiceTest.java`, `GuestContactRetentionIT.java`

- [x] **Step 1: Failing tests** — AC-7's two unit tests (the `FakeReviewErasure` shared shape); AC-8's IT (an aged guest with a reviewed 2015 booking → sweep → the review is nameless and commentless, the star and the aggregate unchanged, the financial rows untouched).
- [x] **Step 2: Red** — `--tests "*ExpireGuestContactsServiceTest*"` → compile failure on the new constructor arg, then assertions.
- [x] **Step 3: Minimal implementation** — collect the scrubbed ids; one `eraseForGuests` call when non-empty; the log line carries both counts.
- [x] **Step 4: Green** — the unit test + `GuestContactRetentionIT` + `GuestContactRetentionSchedulerConfigTest` → PASS.
- [x] **Step 5: Generalization audit** — population: every caller of `ExpireGuestContacts#sweep` and every reader of its return value (`grep -rn "\.sweep()" platform/src`) — the meaning "contacts tombstoned" holds.
- [x] **Step 6: Commit** — `Tombstone the reviews of every guest contact the retention sweep expires (#815)`
- [x] **Step 7: Update Execution status.**

## Phase 3 — docs, merge `origin/main`, ready for review, the gates

**Files:** `RESPONSIBILITIES.md`, `CONTEXT.md`, `CLAUDE.md`, ADR-0010, the runbook, the three
TS doc comments

- [x] **Step 1:** RESPONSIBILITIES §customer (Job: erasure and the sweep reach the reviews through `customer.spi.ReviewErasure`; Not-My-Job: resolving my subjects to bookings → `booking`, blanking a review → `review`; Shipped), §booking (the second `customer.spi` fact-and-act it answers), §review (the tombstone; **four** `api` ports; a null `display_name` now means "never given or erased"; Shipped).
- [x] **Step 2:** CONTEXT.md **Review tombstone**; CLAUDE.md `customer` + `review` rows; ADR-0010 amendment note (status line + a dated paragraph: the scrub reaches `review` through an inverted port, still one transaction, still no FK relaxation); runbook table row `review.display_name` / `comment` → `NULL` / `NULL` ("a review is attached to a booking; the star stays in the aggregate").
- [x] **Step 3:** the three TS doc comments; `npm run lint`, `npm run format:check` (comment-only, but the guard runs).
- [x] **Step 4:** `riviera-docs-freshness` over `origin/main...HEAD`; `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [x] **Step 5: Commit** — `Record that erasure now reaches review PII: responsibilities, glossary, ADR-0010 amendment, runbook (#815)`
- [x] **Step 6:** merge `origin/main`; mark the PR ready for review → the gates (`references/pr-gates.md`); update Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | phase 3 (`riviera-docs-freshness`, counting sweep) | every sentence counting the `api`/`spi` ports or enumerating what erasure touches | pass 3 of the audit: `grep -rniE '\b(three\|3\|two\|2\|one\|1) (\`?api\`?\|\`?spi\`?\|driven\|driving\|published\|cross-module)( \|-)?ports?\b\|…' <substrate + platform/src + frontend/src>` (the full three-pass command set is in the PR's review note) | 9 findings (6 stated facts, 3 ADR consequences); kept as true: `booking.api`'s "three ports", `venue.spi`'s "third", `notification`'s "three ports", `ScheduledQueryTimeoutIT`'s "two entry reads" | patched / amended as recorded in *Skills consulted* |
| 2026-09-02 | phase 2 (the sweep's return value) | every caller of `ExpireGuestContacts#sweep` and every reader of its count | `grep -rn "\.sweep()" platform/src --include=*.java` (filtered to the customer port; the `booking` hits are the no-show / request sweeps) | 1 production caller, `GuestContactRetentionScheduler`, which logs the count; `GuestContactRetentionIT` and the unit spec assert it | the meaning "contacts tombstoned" holds; reviews ride as a second logged count (D-4) |
| 2026-09-02 | phase 1 (the widened `AccountErasureStore` port, D-5) | every implementor of `AccountErasureStore` and every caller of the two by-email scrubs | `grep -rln "implements AccountErasureStore" platform/src`; `grep -rn "eraseGuestByEmail\|eraseAccountByEmail" platform/src` | 3 implementors (`JdbcAccountErasure` + the two test fakes); callers: `AccountErasureService` only | all three follow the new return types in this commit; the sweep's fake keeps throwing for the two it never exercises |
| 2026-09-02 | phase 1 (a `//` block the guard now sees) | every multi-line `//` block in a file this slice touches | `node scripts/check-inline-comments.mjs --files <touched>` | 1: the grant rationale in `booking/package-info.java` (pre-existing, flagged once touched) | moved into the package Javadoc, which is exempt and where a grant's why belongs |
| 2026-09-02 | phase 0 (a second writer of review PII) | every production SQL statement that touches the `review` table | `grep -rn "FROM review\b\|UPDATE review\b\|INTO review\b\|DELETE FROM review\b" platform/src/main` | 10 in `JdbcReviews` + the new `JdbcReviewTombstones` (+ V47's backfill) | the only PII writes besides the tombstone are the author's own claim/update — new data the subject supplies, not erasure's to cover; no other statement needs the tombstone's shape |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2 / AC-3:** `gradle test --tests "*ReviewTombstoneFlowIT*"` → PASS (3, skipped 0). Verified at phase 0.
- [x] **AC-4 / AC-5:** `gradle test --tests "*AccountErasureIT*"` → PASS (7, skipped 0). Verified at phase 1.
- [x] **AC-6:** `gradle test --tests "*AccountErasureServiceTest*"` → PASS (8). Verified at phase 1.
- [x] **AC-7:** `gradle test --tests "*ExpireGuestContactsServiceTest*"` → PASS (9). Verified at phase 2.
- [x] **AC-8:** `gradle test --tests "*GuestContactRetentionIT*"` → PASS (6, skipped 0). Verified at phase 2.
- [x] **AC-9:** the structural net → PASS (`ModularityTests` 1, `PackageShapeArchitectureTests` 4, `PublishedSurfacePlacementArchitectureTests` 11, `JdbcOnlyArchitectureTests` 2). Verified at phases 0 and 1.
- [x] **AC-10:** `ng test --include=src/app/admin/admin-reviews.spec.ts --include=src/app/venue/venue-reviews.spec.ts` → PASS (21). Verified at phase 3.

If any AC isn't verified by a passing test, write the test or admit it's not done.

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
