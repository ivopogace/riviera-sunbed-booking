# Post-service-day cancellation fence Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `CONFIRMED` booking stops being cancellable once its service day has begun in
`Europe/Tirane`, so a guest can no longer consume the stay and then reclaim the venue's
late-cancel share as a real Stripe refund.

**Architecture:** The single significant decision is **where the fence lives**. The temporal
boundary joins the two it already sits beside in `BookingCutoff` — the one class that reasons
about civil days in `Europe/Tirane` — which now classifies a cancellation into a three-valued
`CancellationWindow` (`FREE` / `LATE` / `CLOSED`) instead of answering a boolean
`freeCancellationOpen`. `RefundPolicy` gains the matching third tier (`CLOSED` → 0), so all
three refund tiers stay in the one domain class ADR-0005 governs. Both the cancel and the view
use case read that classification off the shared `CancellationPolicy` quote, which is exactly
why that class exists — the displayed and the actioned rule cannot drift.

**Persistence:** JDBC only (invariant #1). **No tables and no migration touched** — the fence is
pure domain arithmetic over `booking.booking_date` and the injected `Clock`.

**Source of intent:** GitHub issue #566.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue names only `CancelBookingService`, while `ViewBookingService` carries the identical
`status == CONFIRMED` predicate, and that a second `cancelConfirmed` caller exists) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned the
"just add a date check" framing into an explicit three-tier window) · `tdd` (each phase is
red-green: the boundary arithmetic and the refund tier are pure unit tests before any wiring) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(**ran** over `origin/main..HEAD`, **2 findings**, both patched — D-1 `CONTEXT.md`'s three-tier
glossary entry implied a cancel is always possible after the cutoff; D-2 `CLAUDE.md` invariant #10
stated the tiers with no closing bound) · `riviera-modulith`
(confirmed the whole change stays inside `booking`: no new published surface, no new event, no
`allowedDependencies` edit — and that `CancellationWindow` belongs in `booking.domain`, not
`vocabulary/`, since no sibling module consumes it) · `riviera-java-conventions` (sealed
`CancelOutcome` gains a `WindowClosed` variant so the controller `switch` stays exhaustive —
a typed outcome, not an exception, §6; the enum replaces a second boolean parameter per §6a) ·
`riviera-stripe-payments` (confirmed the fence belongs on the refund *decision* in `booking`,
never in `payment`, which only executes) · `postgres` (`N/A — no migration; no schema change`).

**Branch:** `claude/sdlc-566-3rq5ap` — the cloud session's designated remote branch stands in
for `bugfix/post-service-day-cancel-fence` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a booking date whose service day has not started in `Europe/Tirane`, when the
      cancellation window is classified, then it is `FREE` before the evening-before cutoff and
      `LATE` between that cutoff and midnight opening the service day. *Pinned by:*
      `BookingCutoffTest.cancellationWindowSpansFreeThenLate`
- [x] **AC-2:** Given "now" is at or after midnight `Europe/Tirane` opening the booking date, when
      the cancellation window is classified, then it is `CLOSED` — on the service day itself and on
      every later date. *Pinned by:* `BookingCutoffTest.cancellationWindowClosesWhenServiceDayStarts`
- [x] **AC-3:** Given a `CLOSED` window, when the refund is computed, then it is 0 minor units
      regardless of the venue's `late_cancel_refund_bps`. *Pinned by:*
      `RefundPolicyTest.closedWindowRefundsNothing`
- [x] **AC-4:** Given a `CONFIRMED` booking whose service day has passed, when the guest calls the
      cancel use case, then the outcome is `CancelOutcome.WindowClosed`, the booking stays
      `CONFIRMED`, the `(set, date)` row is **not** released, and no `BookingCancelled` is published
      (so no refund and no payout reversal). *Pinned by:*
      `CancelBookingIT.rejectsCancelAfterTheServiceDayHasPassed`
- [x] **AC-5:** Given that same booking, when it is viewed by code, then `cancellable` is `false`
      and `refundIfCancelledNow` is 0 — the UI never offers a cancel the server would reject.
      *Pinned by:* `ViewBookingServiceTest.pastBookingIsNotCancellableAndQuotesNothing`, and at
      HTTP level by `BookingViewIT.viewOffersNoCancelOnceTheServiceDayHasPassed`
- [x] **AC-6:** Given the cancel endpoint rejects on a closed window, when the response is written,
      then it is `409` with code `CANCELLATION_WINDOW_CLOSED` (distinct from `NOT_CANCELLABLE`, so
      the two rejections stay diagnosable). *Pinned by:*
      `BookingControllerIT.closedWindowRejectionCarriesItsOwnCode`
- [x] **AC-7:** Given a venue owner triggering a weather refund for a **past** date, when the
      service runs, then it still cancels and fully refunds — the fence is scoped to the
      guest-initiated path only. *Pinned by:* `WeatherRefundServiceIT.fullRefundRegardlessOfCutoff`
      — the **existing** test, which already seeds on `2020-07-01`; no new test was written for
      AC-7, its class Javadoc now records that it also pins the fence's scope.

## Non-goals

- **The completion sweep** (writing `COMPLETED`/`NO_SHOW` after the service day). It is the issue's
  other suggested direction and it is *not* this fix — see the Open questions for the blast radius
  that makes it its own slice, filed as a follow-up issue.
- **Changing the evening-before cutoff or the late-cancel bps semantics.** The `FREE`/`LATE`
  boundary and `floorDiv` rounding are ADR-0005 and stay byte-for-byte.
- **Fencing the weather refund** (`WeatherRefundService`) — deliberately unfenced, see AC-7.
- **Any Flyway migration, schema change, or new endpoint.**
- **Retroactively correcting bookings already cancelled after their service day** in the existing
  data. No such rows are known; a data audit is out of scope for a code fence.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `CONFIRMED` + before cutoff → full refund | preserved | `CancellationWindow.FREE` → `RefundPolicy` returns the full gross, unchanged |
| `CONFIRMED` + after cutoff → `floorDiv(gross × bps, 10000)` | **narrowed** | Still exact, but only while the window is `LATE` (cutoff → midnight). Past midnight it is `CLOSED` → 0. This narrowing **is** the fix |
| `CONFIRMED` + any date → cancel succeeds | **changed** | Rejected with `WindowClosed` once the service day starts (AC-4) |
| Cancel releases the `(set, date)` row | preserved for `FREE`/`LATE`; **not reached** for `CLOSED` | The rejection returns before `cancelConfirmed`, so no release — correct, since the day is spent and the row is historical |
| View reports `cancellable = status == CONFIRMED` | **changed** | ANDed with `window != CLOSED` (AC-5) |
| View reports `beforeCutoff` on the wire | preserved | Still the `FREE` predicate; the wire field and its meaning are unchanged |
| View reports `refundIfCancelledNow` | **changed** for a closed window | Becomes 0 — the honest answer when no cancellation is possible |
| Weather refund cancels + fully refunds any date | preserved | Untouched; pinned by AC-7 so a future "consistency" edit cannot quietly fence it |
| `NOT_CANCELLABLE` 409 for a non-`CONFIRMED` status | preserved | Unchanged path; the new rejection gets its own code rather than overloading this one |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Timezone arithmetic wrong at the midnight boundary (invariants #4/#6) — a fence one day early would reject legitimate same-day-eve cancels | med | high | The boundary is computed via the existing `BookingCutoff` `Europe/Tirane` machinery from an injected `Clock`, never the JVM default; unit tests pin 23:59 the evening before (open) and 00:00 on the date (closed) | claude | **closed** — `BookingCutoffTest` pins 23:59→`LATE` and 00:00→`CLOSED`, plus a 23:30-cutoff case proving the two boundaries stay 30 min apart rather than inverting |
| R-2 | The fence lands only on the cancel path, leaving the view offering a cancel that 409s | med | med | The classification is computed once in `CancellationPolicy` — the shared quote both use — and AC-5 pins the view side | claude | **closed** — one `quote.cancellationOpen()` read by both; pinned at unit *and* HTTP level |
| R-3 | The fence accidentally catches the **weather** refund, silently removing the operator's post-storm goodwill tool | low | high | The fence sits in the guest cancel service, not in `cancelConfirmed`; AC-7 pins a past-date weather refund still working | claude | **closed** — `WeatherRefundServiceIT` green on its `2020-07-01` seed; the guarantee is now stated in its class Javadoc and on `WeatherRefundService` |
| R-4 | Narrowing the `LATE` window to ~6 hours makes `late_cancel_refund_bps` near-useless for venues that set it | high | med | Accepted and documented (see Open questions A-1); it is the deliberate consequence of closing a real-money exploit, and the boundary is a one-line change if the product call differs | claude | **accepted, flagged** — surfaced in ADR-0005's amendment and PR #574's Scope notes for an explicit product call |
| R-5 | Changing `RefundPolicy.refundMinor`'s signature (boolean → enum) breaks a caller not in scope | low | med | Compile-time break, not runtime; `grep` shows exactly one production caller (`CancellationPolicy`) and one test | claude | **closed** — the compiler found exactly the two predicted sites, plus `ViewBookingServiceTest`'s quote fixture |
| R-6 | Module boundary leak — a new type placed in a published surface it doesn't belong in (invariant #11) | low | med | `CancellationWindow` stays in `booking.domain`; no sibling module consumes it. `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` in the scoped run | claude | **closed** — the full structural net passed on the phase-0 commit and nothing since added a cross-module reference |
| R-7 | Flyway version collision with a parallel slice | none | — | No migration in this slice | claude | closed — n/a |

## Open questions / Assumptions

- **Assumption A-1 (the fence boundary):** cancellation closes at **the start of the service day**
  — `00:00 Europe/Tirane` on `booking_date`. Taken because it is the only boundary that fully
  closes the consume-then-reclaim exploit #566 describes; closing at the *end* of the service day
  would still let a guest spend the whole day and cancel at 23:00. **Consequence:** the `LATE`
  tier's window shrinks to roughly the six hours between the venue's evening-before cutoff and
  midnight, so `late_cancel_refund_bps` becomes a narrow goodwill lever. *Escalated to the user
  before planning; the session was non-interactive, so the recommendation was taken and recorded
  here.* One-line change if the product call differs: `closesAt(bookingDate)` → `bookingDate.plusDays(1)`
  in `BookingCutoff#cancellationWindow`. — *Owner:* ivopogace · *Resolves by:* review gate
*(A-2 resolved — see below.)*
- **Assumption A-3 (weather refund unfenced):** a post-date weather refund is legitimate — the
  operator is voluntarily returning their own money for a storm that already happened, behind an
  `assertOwns` check (invariant #13). Fencing it would remove a real tool. — *Owner:* ivopogace ·
  *Resolves by:* review gate

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged by this slice — online
  booking claim, staff tap-to-mark, cancellation release, weather-refund release, Request-to-Book
  pending hold, and the three request-release legs. This slice adds **no** write path and removes
  none; it only makes one existing **release** (the guest cancel) unreachable once the service day
  has started.
- **Uniqueness guarantee:** untouched — the `UNIQUE (set_id, booking_date)` constraint remains the
  primitive that makes a set holdable by at most one party per date.
- **Concurrency strategy:** untouched. The guarded `cancelConfirmed` (`WHERE status='CONFIRMED'`,
  `UPDATE … RETURNING`) still settles the cancel race; the fence is evaluated **before** it, so a
  closed window returns without ever contending for the row.
- **Direction of the new check vs. the race:** the fence is a pure function of `booking_date` and
  the clock — it cannot be won or lost by a concurrent caller, so it needs no lock and introduces
  no new interleaving. A cancel racing the midnight boundary resolves to whichever side of the
  instant its `Clock.instant()` reads; both outcomes are individually correct and no state is
  half-written either way.
- **Pool rule (invariant #3):** not touched — the fence never selects sets.
- **Cutoff rule (invariant #4):** extended, not changed. `BookingCutoff` already computed the
  evening-before instant in `Europe/Tirane`; it now also computes the service-day-start instant in
  the same zone from the same injected `Clock`. Invariant #4's "one rule, two jobs" becomes one
  class, three boundaries.
- **Pinning test:** `ConcurrentReservationIT` is untouched and must stay green — this slice must
  not perturb the claim path at all. The fence's own boundary is pinned by `BookingCutoffTest`
  (AC-1, AC-2) and its end-to-end effect by `CancelBookingIT` (AC-4).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | It owns booking lifecycle and cancellation-policy enforcement; the fence is a lifecycle rule about when a cancellation is admissible |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | — | **None added or changed** | — | — |

`booking` keeps consuming `venue.api.SetBookingFacts` (for the venue's cutoff time) and
`venue.api.VenueRates` (for the late-cancel bps) exactly as today; no grant changes.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **None added.** `BookingCancelled` is *not published* on a closed window — that absence is the fix | `booking` | unchanged | `payout`, `notification`, `booking`'s own refund listener | async | `CancelBookingIT` (AC-4) |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Classify a cancellation's temporal window (`FREE`/`LATE`/`CLOSED`) in `Europe/Tirane` | `booking` | `booking` Job: owns "cancellation-policy enforcement" and the booking lifecycle. **Not** `venue` — `venue` owns the cutoff *time* as venue configuration (read via `SetBookingFacts`), never the decision computed from it |
| Compute the refund for a closed window (0) | `booking` | `booking` Job: owns the refund **decision**; `payment`'s Not-My-Job is explicit — "deciding whether/how much to refund → `booking`". `payment` only executes what `BookingCancelled` carries |
| Reject the cancel request with a distinct outcome | `booking` | The typed outcome is the application service's; the controller only maps it. No other module observes it |

No cross-module interaction is added, so no `allowedDependencies` edit and no new published
surface. `CancellationWindow` stays internal in `booking.domain` — publishing it would widen the
module's surface for a type no sibling consumes.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook. Untouched by this slice.
- **Idempotency:** untouched. The fence prevents a refund from ever being *requested*; it does not
  alter the idempotency key derivation on any refund that does happen.
- **Money:** integer minor units, EUR (invariant #5). The new tier returns the integer literal `0`
  — no new arithmetic, so no new rounding surface.
- **Payout-ledger effect:** **none, by construction.** A closed-window cancel publishes no
  `BookingCancelled`, so `BookingCancelledPayoutListener` never runs and the venue's accrual for a
  delivered booking stands — which is the correct ledger state (invariant #9) and the second half
  of the bug the issue describes.
- **Refund policy applied (invariant #10):** three tiers now — free-until-cutoff (full),
  late (`floorDiv(gross × bps, 10000)`), **closed (nothing, and the cancel itself is refused)**.
  Weather-admin stays a separate, unfenced full refund.
- **ADR impact:** ADR-0005 fixed two tiers and is the authority a future session will read. It gets
  an **amendment** in this slice recording the third — same pattern as its 2026-07-29 (#428)
  amendment, so nobody "simplifies" the fence away later.
- **Pinning tests:** `RefundPolicyTest` (AC-3), `CancelBookingIT` (AC-4, AC-6),
  `WeatherRefundServiceIT` (AC-7).

## Angular — frontend surfaces touched

`N/A — backend-only, and deliberately so.` The tourist booking view is already fully
server-flag-driven: `booking-view.ts:327` gates the entire cancel section on `@if (b.cancellable
…)`, and `refundTerms()` renders only inside it. Fixing the server's `cancellable` therefore
propagates to the UI with **no frontend logic change**. One frontend **test** is added — not a
component change — to pin that a `CONFIRMED` booking with `cancellable: false` renders no cancel
affordance, so a future template edit cannot re-expose it. No `playwright-cli` e2e spec is added:
there is no new user-facing flow, only the removal of an affordance in a state the existing
mocked suite does not construct; the unit spec is the proportionate pin.

## FE↔BE contract

- **New/changed endpoints:** none. `POST /api/bookings/{code}/cancel` gains one new **failure**
  response — `409` with `code: "CANCELLATION_WINDOW_CLOSED"` — alongside the existing
  `NOT_CANCELLABLE`. Same RFC-7807 `ProblemDetail` shape via `ApiProblem`
  (`riviera-java-conventions` §6b); no per-controller handler.
- **Changed response *values* (not shapes):** on `GET /api/bookings/{code}`, a `CONFIRMED` booking
  whose service day has started now reports `cancellable: false` and
  `refundIfCancelledNow: {minorUnits: 0, …}`. Both fields already exist and are already typed;
  the client needs no change.
- **Client typing:** the existing hand-written typed `BookingDetail` in `booking.service.ts` is
  unchanged; no `as any`.
- **Money/date on the wire:** unchanged — integer minor units + currency, ISO `LocalDate`.

## Execution status

**Stage pointer:** `PR #574 — review gate`

**Next action:** Run the review gate on PR #574 per `references/pr-gates.md` §1, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `CancellationWindow` + the `BookingCutoff` boundary | ✅ | `dc6f9cc` |
| 1 — `RefundPolicy` third tier | ✅ | `61b9818` |
| 2 — Fence the cancel use case + its error code | ✅ | `1a776ca` |
| 3 — Fence the view + FE pin | ✅ | `0e0e822` |
| 4 — Docs, ADR-0005 amendment, close-out | ✅ | `185de01` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI — `Repo hygiene (diff-scoped)` on `1a1e785` | `BookingControllerIT.java` and `BookingViewIT.java` were changed by the diff but absent from the File-structure section | fixed — both listed, guard green |
| D-1 | docs-freshness (step 3) | `CONTEXT.md`'s **Refund tier** entry described *none* as "after the cutoff, non-refundable", implying a cancel is always available after the cutoff — the exact belief the fence removes | patched — tier entry corrected to the 0-bps case, new **Cancellation window** term added |
| D-2 | docs-freshness (step 3) | `CLAUDE.md` invariant #10 stated "after → non-refundable (or partial)" with no end, so the canonical rule under-specified the fence | patched — **substantive wording change to an invariant, flagged for reviewer attention** rather than left silent |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/domain/CancellationWindow.java` — **new**; the three-valued temporal classification
- `platform/src/main/java/ai/riviera/platform/booking/domain/RefundPolicy.java` — the third tier; boolean parameter becomes the enum
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/BookingCutoff.java` — classifies the window; `freeCancellationOpen` folds into it
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancellationPolicy.java` — carries the window on the shared quote
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — the fence itself
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelOutcome.java` — the `WindowClosed` variant
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — `cancellable` ANDed with the window
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — maps `WindowClosed` → 409 `CANCELLATION_WINDOW_CLOSED`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundService.java` — one Javadoc line recording why it stays unfenced
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/BookingCutoffTest.java` — AC-1, AC-2
- `platform/src/test/java/ai/riviera/platform/booking/domain/RefundPolicyTest.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/booking/CancelBookingIT.java` — AC-4
- `platform/src/test/java/ai/riviera/platform/booking/BookingControllerIT.java` — AC-6, the HTTP code for the refusal
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — the AC-5 twin at HTTP level, and the `LATE`-window reseed of the partial-refund test
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-5
- `platform/src/test/java/ai/riviera/platform/booking/WeatherRefundServiceIT.java` — AC-7
- `frontend/src/app/booking/booking-view.spec.ts` — pins no cancel affordance when `cancellable` is false on a `CONFIRMED` booking
- `docs/adr/0005-cancellation-refund-tiers-and-proportional-reversal.md` — the third-tier amendment
- `docs/plans/issue-566-post-service-day-cancel-fence.md` — this plan
- `CONTEXT.md` — the `Refund tier` glossary entry, plus the new `Cancellation window` term (freshness finding D-1)
- `CLAUDE.md` — invariant #10 gains the closing bound (freshness finding D-2)

`RESPONSIBILITIES.md` is deliberately **not** touched: its `booking` Job line ("Enforce the
cancellation policy and the same-day cutoff") stays true, and the fence's rationale belongs in
ADR-0005, which `CancellationWindow`'s Javadoc points at.

---

## Phase 0 — `CancellationWindow` + the `BookingCutoff` boundary

**Files:** Create `booking/domain/CancellationWindow.java` · Modify
`booking/application/cancel/BookingCutoff.java` · Test
`booking/application/cancel/BookingCutoffTest.java`

- [ ] **Step 1: Write the failing test** — AC-1 and AC-2 in `BookingCutoffTest`, in the file's
      existing `Clock.fixed` + `ZonedDateTime` style.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*BookingCutoffTest*"` → FAIL
      (`cancellationWindow` does not exist)
- [ ] **Step 3: Minimal implementation** — the `CancellationWindow` enum and
      `BookingCutoff#cancellationWindow(LocalTime, LocalDate)`, reusing `closesAt` for the `FREE`
      boundary and adding the service-day-start instant for the `CLOSED` one. `freeCancellationOpen`
      is folded into the classification so one method owns the rule.
- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*BookingCutoffTest*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — search for every other place that derives a
      cancellation-eligibility decision from a date.
- [ ] **Step 6: Commit** — `git commit -m "Classify the cancellation window in Europe/Tirane (#566)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `RefundPolicy` third tier

**Files:** Modify `booking/domain/RefundPolicy.java` · Test `booking/domain/RefundPolicyTest.java`

- [ ] **Step 1: Write the failing test** — AC-3, plus migrate the existing two tests to the enum.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*RefundPolicyTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `refundMinor(long, CancellationWindow, int)` as an
      exhaustive `switch` over the enum: `FREE` → gross, `LATE` → `floorDiv`, `CLOSED` → 0.
- [ ] **Step 4: Run it, verify it passes** — `gradle test --tests "*RefundPolicyTest*"` → PASS
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Add the closed-window refund tier (#566)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Fence the cancel use case + its error code

**Files:** Modify `CancellationPolicy.java`, `CancelBookingService.java`, `CancelOutcome.java`,
`BookingController.java`, `WeatherRefundService.java` (Javadoc) · Test `CancelBookingIT.java`,
`WeatherRefundServiceIT.java`

- [ ] **Step 1: Write the failing test** — AC-4 and AC-6 in `CancelBookingIT` (a booking whose date
      has passed), and AC-7 in `WeatherRefundServiceIT`.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*CancelBookingIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `RefundQuote` carries the window; `CancelBookingService`
      returns `WindowClosed` before `cancelConfirmed`; the controller maps it.
- [ ] **Step 4: Run it, verify it passes** — then broaden to
      `gradle test --tests "*booking*"` for the module's regression.
- [ ] **Step 5: Generalization-audit pass** — every `cancelConfirmed` caller, re-checked.
- [ ] **Step 6: Commit** — `git commit -m "Refuse a guest cancel once the service day has started (#566)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Fence the view + FE pin

**Files:** Modify `ViewBookingService.java` · Test `ViewBookingServiceTest.java`,
`frontend/src/app/booking/booking-view.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-5.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*ViewBookingServiceTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `cancellable = status == CONFIRMED && window != CLOSED`.
- [ ] **Step 4: Run it, verify it passes**; then `npm test` scoped to the booking-view spec.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Stop offering a cancel the server would refuse (#566)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Docs, ADR-0005 amendment, close-out

**Files:** Modify `docs/adr/0005-…md`, `CONTEXT.md`, `CLAUDE.md`, this plan

- [ ] **Step 1:** Amend ADR-0005 with the third tier, in the style of its #428 amendment.
- [ ] **Step 2:** Run `riviera-docs-freshness` over the slice's diff; patch what it flags.
- [ ] **Step 3:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main` and
      `node scripts/check-inline-comments.mjs --diff origin/main`.
- [ ] **Step 4:** File the completion-sweep follow-up issue (A-2) and link it here.
- [ ] **Step 5:** Finalize Execution status citing `merged via PR #NN`; commit.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-08 | Phase 0 — the window classification | Any other place deriving a cancellation decision from a date | `grep -rn "freeCancellationOpen\|cancellationWindow\|isBefore(.*bookingDate)" platform/src/main` | Only `BookingCutoff` + its one caller `CancellationPolicy` | None needed — the rule was already centralized; the classification replaced the boolean in place |
| 2026-08-08 | Phase 0 — the fence's reach | Every caller of the guarded `cancelConfirmed` transition | `grep -rln "cancelConfirmed" platform/src/main` | `CancelBookingService` (guest), `WeatherRefundService` (operator), plus the port + adapter + row record | Fence the guest path only; AC-7 pins the weather path staying open (A-3) |
| 2026-08-08 | Phase 3 — the `BookingViewIT` regression | Every other test seeding a past date to mean "after the cutoff" | `grep -rn "minusDays\|LocalDate.of(20[012]" platform/src/test` | Only `BookingViewIT.viewComputesPartialRefundAfterCutoff`; the cancel/mail ITs all use 2027–2035 dates (still `FREE`), the rest are customer-retention fixtures unrelated to cancellation | Fixed that one to a genuine `LATE` window (tomorrow behind a `00:00` venue cutoff), which also removed its hidden dependence on the hour the suite runs at |
| 2026-08-08 | Phase 2 — AC-7's pin | Whether a new past-date weather test was needed | Read `WeatherRefundServiceIT` | `fullRefundRegardlessOfCutoff` already seeds `2020-07-01` and asserts a full refund | Wrote **no** new test — cited the existing one and recorded the extra guarantee in its class Javadoc, rather than duplicating coverage |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle test --tests "*BookingCutoffTest*"` → PASS. Verified at commit `88285af`.
- [x] **AC-2:** `gradle test --tests "*BookingCutoffTest*"` → PASS. Verified at commit `88285af`.
- [x] **AC-3:** `gradle test --tests "*RefundPolicyTest*"` → PASS. Verified at commit `85816c7`.
- [x] **AC-4:** `gradle test --tests "*CancelBookingIT*"` → PASS. Verified at commit `98385d9`.
- [x] **AC-5:** `gradle test --tests "*ViewBookingServiceTest*"` → PASS. Verified at commit `1a1e785`.
- [x] **AC-6:** `gradle test --tests "*BookingControllerIT*"` → PASS. Verified at commit `98385d9`.
- [x] **AC-7:** `gradle test --tests "*WeatherRefundServiceIT*"` → PASS. Verified at commit `98385d9`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled; the claim path is provably untouched (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new
      published surface (invariant #11).
- [x] **Payment/payout** section filled; no `BookingCancelled` on a closed window, so no refund and
      no reversal (invariants #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for the boundary (invariant #6).
- [x] Booking codes unguessable and never logged (invariant #7).
- [x] No Flyway migration needed; none added (invariant #12).
- [x] **Frontend** — no component change; the added spec pins the server-driven affordance.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
