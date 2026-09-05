# Guest-cancel admission read from `BookingTransition` — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** No layer re-derives which statuses a guest cancel admits: `ViewBookingService`'s
`cancellable` and `CancelBookingService`'s `NotCancellable` fence both read
`BookingTransition.CANCEL_BY_GUEST.admits(status)`, the adapter keeps binding the same row, and a
status-exhaustive unit test on each of the two services fails if its answer drifts from the table.

**Architecture:** The table already exists (`booking/domain/BookingTransition`) and the adapter
already binds it; this slice replaces the two inline `== CONFIRMED` re-derivations with a read of the
`CANCEL_BY_GUEST` row — no new type, no new seam, no general-sounding predicate on `BookingStatus`.
The cancel service keeps its `{NO_SHOW, COMPLETED} → WindowClosed` split ahead of the admission
check, because that split chooses the *message* for a spent day and says nothing about who may
cancel; the view keeps `&& quote.cancellationOpen()`, because the window half is
`CancellationPolicy`'s rule. Agreement is pinned from both ends: `BookingTransitionTest` holds the
row to the literal `{CONFIRMED}`, and the two new `@EnumSource(BookingStatus)` tests hold each
service's answer, status by status, to the same literal — so a service that stops reading the table
and drifts fails its own test, and a table edit fails `BookingTransitionTest` and
`JdbcBookingTransitionTableIT`.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched; the guarded
`UPDATE … WHERE status = ANY (:admitted)` in `JdbcBookings` is unchanged.

**Source of intent:** GitHub issue #926 (D2 of `docs/research/2026-09-04-where-the-business-rules-live.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the issue is a day old
and the code matches it line for line: view `:93`, service `:77–82`, adapter already bound; only
Dependabot PRs open, no Flyway number in play; `CancelBookingService` has no unit test today, only
`CancelBookingIT`, so the "test fails if the three disagree" AC needs a new test class) ·
`riviera-plan-doc` (this template — forced the statement of *how* agreement is pinned, since
reading the table is by-construction and a test cannot observe it directly) · `tdd` (each phase
opens with an assertion-red status-exhaustive test at the port) · `riviera-review-overlay` (review
gate — due at ready-for-review) · `riviera-docs-freshness` (due at close-out: `RESPONSIBILITIES.md`
§booking's "each takes its admitted statuses from its own row" sentence widens to the two services;
the research note's D2 gains a dated resolution line) · `riviera-modulith` (ADR-0018 §1: a lifecycle
rule with three callers earns the shared statement, which already exists in `domain/`; both services
are inside `booking`, so no published surface or grant changes) · `riviera-java-conventions` (§6c/§6d
on every touched Javadoc — the `CancelBookingService` block carries a garbled sentence that goes with
the edit; one-line inline comments at most) · `codebase-design` (no new seam: the rule rides the
existing `ViewBooking` and `CancelBooking` ports, and the table is the one interface all three
readers cross) · `domain-modeling` (`CONTEXT.md` already distinguishes *cancel* from *withdraw* and
names the cancellation window; vocabulary unchanged, no ADR — reversible and unsurprising) ·
`grilling` (interrogated the ticket against the code; outcome under Open questions) ·
`riviera-local-debug` (toolchain registration, the unshallow, scoped test recipes).

**Branch:** `claude/sdlc-926-7py1lb` — the session's designated remote branch stands in for
`feature/guest-cancel-admission` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a booking in any of the nine statuses whose cancellation window is open, when
  it is viewed by code, then `cancellable` is `true` for `CONFIRMED` and `false` for every other
  status. *Seam:* `booking.application.view.ViewBooking#byCode` · *Pinned by:*
  `ViewBookingServiceTest.onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen`
- [x] **AC-2:** Given a `NO_SHOW` or `COMPLETED` booking, when the guest cancels, then the outcome is
  `WindowClosed`, no refund is quoted, nothing transitions, no set is released and no event is
  published. *Seam:* `booking.application.cancel.CancelBooking#cancel` · *Pinned by:*
  `CancelBookingServiceTest.aSpentDayAnswersWindowClosedWhicheverTerminalStatusItCarries`
- [x] **AC-3:** Given a booking in any status other than `CONFIRMED`, `NO_SHOW` or `COMPLETED`, when
  the guest cancels, then the outcome is `NotCancellable` carrying that status, nothing transitions
  and nothing is published. *Seam:* `CancelBooking#cancel` · *Pinned by:*
  `CancelBookingServiceTest.everyOtherStatusIsNotCancellable`
- [x] **AC-4:** Given a `CONFIRMED` booking inside its cancellation window, when the guest cancels,
  then the outcome is `Cancelled`, the set is released and `BookingCancelled` is published with the
  quoted refund. *Seam:* `CancelBooking#cancel` · *Pinned by:*
  `CancelBookingServiceTest.aConfirmedBookingInsideTheWindowIsCancelled`
- [x] **AC-5:** Given the change, when `BookingTransitionTest` and the structural net run, then they
  are green — the `CANCEL_BY_GUEST` row still admits exactly `{CONFIRMED}` and no package shape
  moved. *Seam:* `BookingTransition.CANCEL_BY_GUEST.admittedFrom()` and `ApplicationModules.verify()`
  · *Pinned by:* `BookingTransitionTest.onlyTheWeatherRefundActsOnANoShow`, `ModularityTests`

## Non-goals

- **A general predicate on `BookingStatus`** (`isCancellable()`, `isTerminal()`): the issue and
  `BookingStatus.canStillBeHonoured()`'s Javadoc both name that as a trap.
- **Deriving the `{NO_SHOW, COMPLETED}` message split from the table** (e.g. "the successors of
  `CONFIRMED` other than `CANCELLED`"): the split is about copy, not admission, and a derivation would
  read more general than the rule.
- **Touching the adapter binding, `JdbcBookingTransitionTableIT`, or the weather-refund path**: the
  enforcing statement is already bound and out of scope.
- **D1, D3–D5 of the research note**: separate issues.
- Any frontend change: the wire shape of `BookingDetailView` and the cancel error codes are unchanged.

## Behavior-parity ledger (retirement / replacement slices only)

The inline `== CONFIRMED` statements are replaced by a table read; their observable behaviours:

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| view: `cancellable` true only for `CONFIRMED` with the window open | preserved | `CANCEL_BY_GUEST.admits(status) && quote.cancellationOpen()`; AC-1 |
| view: `withdrawable` stays its own `PENDING_REQUEST` predicate | preserved | untouched line; `pendingRequestIsWithdrawableButNotCancellable` |
| cancel: `NO_SHOW` / `COMPLETED` → `WindowClosed` before any quote | preserved | the split stays ahead of the admission check; AC-2 |
| cancel: other non-`CONFIRMED` → `NotCancellable(status)` | preserved | `!CANCEL_BY_GUEST.admits(status)`; AC-3 |
| cancel: `CONFIRMED` past the window → `WindowClosed` | preserved | untouched `quote.cancellationOpen()` fence; `CancelBookingIT.rejectsCancelAfterTheServiceDayHasPassed` |
| cancel: lost race → `NotCancellable(CANCELLED)` | preserved | untouched; `CancelBookingIT.cancellingTwiceIsNotCancellableTheSecondTime` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The refactor widens the guest cancel (e.g. `NO_SHOW` slips through to the quote) because the message split and the admission check are reordered | low | high | the split stays first; AC-2 pins that no quote, transition, release or event happens for either status; `CancelBookingIT.noShowAnswersWindowClosedLikeAnUnsweptSpentDay` end to end | agent | closed — `CancelBookingServiceTest.aSpentDayAnswersWindowClosedWhicheverTerminalStatusItCarries` verifies no quote, transition, release or event for either status; `CancelBookingIT` (7 tests, 0 skipped, Docker) green |
| R-2 | The two new status-exhaustive tests are tautological — expected values computed from the table the code reads | med | med | the expected side is the literal `CONFIRMED` (`@EnumSource` `names`/`mode`), never `CANCEL_BY_GUEST.admits`; the table itself is held to the same literal by `BookingTransitionTest` | agent | closed — both tests use `@EnumSource` `names`/`mode` literals; neither imports `BookingTransition` |
| R-3 | `ViewBookingServiceTest`'s fixture cannot build every status (`CANCELLED` consults `RefundStatusLookup`, `AWAITING_PAYMENT` the credentials port, `COMPLETED` the review panel) | med | low | `givenBooking` leaves `refundMinor` null and `acceptedAt` null, so neither lazy read fires; Mockito answers an empty `Optional` and a null panel, which `nameSuggestionFor` tolerates — verified by the red run | agent | closed — all nine statuses ran green in phase 0 (46 tests, 0 failures) |
| R-4 | Module boundary (#11): a `domain/` import from `application/` is fine, but the new test must not import another module's `application.*` | low | med | the new test mocks `availability.api.AvailabilityClaim` and `Bookings` (same module); the structural net after phase 1 | agent | closed — the net's 23 tests green locally after phase 1 |
| R-5 | Touched Javadoc trips `check-inline-comments.mjs` (the `CancelBookingService` block is re-read whole under §6c) | med | low | `node scripts/check-inline-comments.mjs --diff origin/main` before each push | agent | closed — guard exit 0 on both phases; the `issue #11` provenance tell in the touched `CancelBookingService` block was dropped |

## Open questions / Assumptions

None open.

### Resolved

- **Grill outcome (drift check):** none. The issue's three line references resolve to the current
  code; commit `170da8a` (adapter binding) and `31427ae` (table) are on `main`; no open PR touches
  `booking/application/cancel`, `booking/application/view` or `BookingTransition`. — settled at plan
  time.
- **Assumption:** the cancel service's `NotCancellable` check reads `!CANCEL_BY_GUEST.admits(status)`
  rather than `status != CONFIRMED` even though today they are the same set — that is the point of
  the slice. — settled at plan time.
- **Assumption:** the message split stays a literal `NO_SHOW || COMPLETED` (Non-goals). — settled at
  plan time.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged — this slice touches only the
  two advisory checks that precede `Bookings#cancelConfirmed`; the release
  (`AvailabilityClaim#release`) still fires only on a real transition.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` — untouched.
- **Concurrency strategy:** the guarded `UPDATE … WHERE status = ANY (:admitted) RETURNING` in
  `JdbcBookings` — untouched; a lost cancel race is still a 0-row no-op answering `NotCancellable`.
- **Pool rule (invariant #3):** not in scope (no reserve path touched).
- **Cutoff rule (invariant #4):** the cancellation window (`CancellationPolicy` /
  `BookingCutoff.cancellationWindow`) stays the view's and the service's second condition — untouched.
- **Pinning test:** `CancelBookingIT.cancellingTwiceIsNotCancellableTheSecondTime` (exactly-once
  release + event); `ConcurrentReservationIT` (unchanged) for the claim side.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `booking` (unchanged SQL) | owns the lifecycle and its table (`RESPONSIBILITIES.md` §booking: "the lifecycle is stated once and enforced in SQL") |

**Cross-module named interfaces (`api/` ports)**

N/A — no port changes; both readers are `booking`-internal services behind `booking`-internal ports.

**Domain events (id-based payloads, invariant #11)**

N/A — `BookingCancelled` is published exactly as before.

### Module ownership (§4a)

All in `booking`, no boundary change: the guest-cancel admission is a lifecycle rule
(ADR-0018 §1) already held by `booking/domain/BookingTransition`; the slice moves no behaviour
between modules, it removes two restatements inside the owner.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope; the refund figure is still the quote's, issued after commit by the
unchanged listener.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `PR — draft open, merging latest main, then ready-for-review`

**Next action:** merge latest `origin/main`, mark the PR ready for review, run the review gate (`references/pr-gates.md` §1).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the view reads `CANCEL_BY_GUEST` | ✅ | c37f3b64 |
| 1 — the cancel service reads `CANCEL_BY_GUEST`; docs | ✅ | the phase-1 commit (SHA below at close-out) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/guest-cancel-admission.md` — this plan
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — `cancellable` reads `CANCEL_BY_GUEST.admits`
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — the `NotCancellable` fence reads `CANCEL_BY_GUEST.admits`; Javadoc re-read whole
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingTransition.java` — Javadoc names the two service readers beside the adapter binding
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancelBookingServiceTest.java` — AC-2, AC-3, AC-4 (new)
- `RESPONSIBILITIES.md` — §booking: the two services read the same row the adapter binds
- `docs/research/2026-09-04-where-the-business-rules-live.md` — D2 gains a dated resolution line

---

## Phase 0 — the view reads `CANCEL_BY_GUEST`

**Files:** Modify `ViewBookingService.java`, `ViewBookingServiceTest.java`

- [x] **Step 1: Write the failing test** — `onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen`,
  `@ParameterizedTest @EnumSource(BookingStatus.class)`: `givenBooking(status)` (FREE window) →
  `cancellable` equals `status == BookingStatus.CONFIRMED`. The literal `CONFIRMED` is the
  independent expected value; nothing reads the table in the test.

```java
@ParameterizedTest
@EnumSource(BookingStatus.class)
void onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen(BookingStatus status) {
	givenBooking(status);

	BookingDetail detail = service.byCode(CODE).orElseThrow();

	assertThat(detail.cancellable()).isEqualTo(status == BookingStatus.CONFIRMED);
}
```

- [x] **Step 2: Run it, verify it fails** — the test passes against the inline statement today
  (both say `CONFIRMED`), so the red is a *pinning* red: temporarily widen nothing — instead verify
  the test would catch drift by reading it against `BookingTransition` in step 3. `gradle
  --no-daemon --console=plain test --tests "*ViewBookingServiceTest*"` → PASS is expected here; the
  red the phase proves is R-3 (the fixture builds every status).
- [x] **Step 3: Minimal implementation** — `boolean cancellable =
  BookingTransition.CANCEL_BY_GUEST.admits(b.status()) && quote.cancellationOpen();`
- [x] **Step 4: Run it, verify it passes** — same command → PASS (9 parameterised + existing).
- [x] **Step 5: Generalization-audit pass** — population: every production statement comparing a
  `BookingStatus` to `CONFIRMED` on a guest-cancel path (log below).
- [x] **Step 6: Commit** — `Read the guest-cancel admission from BookingTransition in the booking view (#926)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — the cancel service reads `CANCEL_BY_GUEST`; docs

**Files:** Create `CancelBookingServiceTest.java` · Modify `CancelBookingService.java`,
`BookingTransition.java`, `RESPONSIBILITIES.md`, the research note

- [x] **Step 1: Write the failing tests** — the three ACs above in a Mockito unit test mirroring
  `ViewBookingServiceTest`'s shape: `Bookings`, `CancellationPolicy`, `AvailabilityClaim`,
  `ApplicationEventPublisher` mocked; a fixed `Clock`.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests
  "*CancelBookingServiceTest*"` → compile-red until the class exists, then green against the current
  statements (same pinning red as phase 0).
- [x] **Step 3: Minimal implementation** — `if (!BookingTransition.CANCEL_BY_GUEST.admits(booking.status()))
  return new CancelOutcome.NotCancellable(booking.status());` behind the unchanged spent-day split;
  Javadoc block re-read whole (§6c), the garbled "nothing writes COMPLETED, so a A booking" sentence
  rewritten as contract.
- [x] **Step 4: Run it, verify it passes** — `--tests "*CancelBookingServiceTest*" --tests
  "*ViewBookingServiceTest*" --tests "*BookingTransitionTest*"`, then `--tests "*CancelBookingIT*"`
  (Docker present), then the structural net.
- [x] **Step 5: Docs** — `RESPONSIBILITIES.md` §booking; the research note's D2; `BookingTransition`
  Javadoc; `node scripts/check-inline-comments.mjs --diff origin/main`;
  `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [x] **Step 6: Commit** — `Read the guest-cancel admission from BookingTransition in the cancel service (#926)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | plan (intake grill) | every production statement that compares a `BookingStatus` against `CONFIRMED` / `NO_SHOW` / `COMPLETED` in Java | `grep -rn --include=*.java -E 'BookingStatus\.(CONFIRMED\|NO_SHOW\|COMPLETED)' platform/src/main/java/ai/riviera/platform/booking/application` | `ViewBookingService:86` (`mayDiscloseMailStatus`), `:93` (`cancellable`), `CancelBookingService:77` (spent-day split), `:80` (`NotCancellable` fence), `RespondToRequestService:145` and `CreateBookingService:141` (a status *written into* an outcome, not compared) | fix the two guest-cancel sites (`:93`, `:80`); the mail-status gate is a different rule (post-payment disclosure), the split is the message choice, and the two literals are outcomes, not admissions |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*ViewBookingServiceTest*"` → 46 tests, 0 failures. Verified at commit `c37f3b64`.
- [x] **AC-2, AC-3, AC-4:** Run `gradle test --tests "*CancelBookingServiceTest*"` → 9 tests, 0 failures; `--tests "*CancelBookingIT*"` → 7 tests, 0 skipped. Verified locally at the phase-1 tree (SHA recorded at close-out).
- [x] **AC-5:** Run `gradle test --tests "*BookingTransitionTest*"` + the structural net → 6 + 23 tests, 0 failures. Verified locally at the phase-1 tree (SHA recorded at close-out).

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
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
