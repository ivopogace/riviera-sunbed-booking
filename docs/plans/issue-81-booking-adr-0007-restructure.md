# Restructure `booking` to the ADR-0007 layout (sliced) Implementation Plan

> **Right-sized doc.** This is a **pure move-class refactor** (package/import renames,
> no behavior change) — the **final** step of the ADR-0007 restructure series (#76 customer,
> #77 availability, #78 payout, #79 venue, #80 payment; this is **09/10** of #72). Per
> `riviera-sdlc` Rule 6 this class of change normally skips the plan doc; it is written for a
> durable record because `booking` is the **spine orchestrator** — the biggest module (61
> files, ~2.4k LOC, an 8-service reserve→pay→confirm saga touching invariants #2/#4/#5/#7/#8)
> and the **only module sliced by use-case** (ADR-0007 sub-decision 3). Sections that cannot
> bite on a mechanical move are `N/A` with a reason. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move `booking` into the ADR-0007 full-template shape with `application/` **sliced by
use-case** (`reserve/`, `cancel/`, `refund/`, `view/`) and `domain/` kept **flat**, with zero
behavior change, proven by the safety net (`ModularityTests`, `JdbcOnlyArchitectureTests`, the
full `booking` suite incl. the reserve/confirm/cancel/refund/webhook ITs) staying green.

**Architecture:** ADR-0007 exploits the inside/outside asymmetry — `application` + `domain` are
the inside; `adapter/in` (driving: the three controllers, the scheduler, and **both** event
listeners — `PaymentEventListener`, `BookingRefundListener` — all *driving* adapters) and
`adapter/out` (driven: `JdbcBookings`, `SecureRandomBookingCodeGenerator`) are the outside.
The two sub-decisions specific to `booking`:
- **Fold `application/in` + `application/out` → `application/`** (sub-decision 2), then **slice
  by use-case cohesion** (sub-decision 3): `reserve/` (create + reserve + confirm + claim/release),
  `cancel/` (cancel + policy + cutoff), `refund/` (weather refund + abandoned sweep), `view/`
  (read side). The shared outbound port `Bookings` and `BookingCodeGenerator` stay at
  `application/` **root**. `domain/` (`BookingStatus`, `RefundPolicy`) stays **flat** — shared
  across slices, not sliced.
- **`infrastructure/{in,out}` → `adapter/{in,out}`** (sub-decision 1, by direction).

`booking` owns **no cross-module inversion** — no `spi/`. `api/` (`BookingId`, `RefundReason`,
`BookingConfirmed`, `BookingCancelled`) stays top-level `@NamedInterface`, consumed by `payout`
and `payment`. `allowedDependencies` is **untouched** — the real declared set is
`{ venue::api, availability::api, payment::api, customer::api, operator::api }` (the issue AC listed
four, but #73's BOLA fix added the `operator::api` edge for the per-venue-ownership check on the
staff daily view + weather refund; **drift caught at the intake grill — left intact, five deps**).

> **Slicing is Modulith/ArchUnit-invisible.** `ModularityTests` + the ADR-0007 package-shape
> rule enforce the *top-level* set `{api, spi, application, domain, adapter}` and the
> `@NamedInterface` boundaries — **not** sub-packages inside `application/`. So the
> `reserve/cancel/refund/view` split is a pure cohesion/import concern that cannot break a
> boundary; the risk surface is compile-only (stale/missing imports), fully caught by the build.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — `JdbcBookings`
moved package only (`infrastructure/out` → `adapter/out`), SQL unchanged.

**Source of intent:** GitHub issue #81 (part of #72, item 09/10 — the last module).

**Skills consulted:** `riviera-modulith` (re-read the two-template + the **`booking`-slicing
note** + `api`-vs-`spi`; confirmed the fold `application/{in,out}` → `application/`, the
use-case slices with `Bookings`/`BookingCodeGenerator` at root, `domain/` flat,
`infrastructure/{in,out}` → `adapter/{in,out}`, both event listeners are *driving* → `adapter/in`,
`api/` kept top-level `@NamedInterface`, no `spi/`, `allowedDependencies` untouched, allowed
top-level set ⊆ `{api, application, domain, adapter}`); `riviera-java-conventions` (verified the
move preserves the Java idioms — JDBC-only/no-JPA, records for DTOs/value-objects, package-private
services/adapters kept package-private, no Lombok; the only dropped imports are redundant
same-package ones and the added imports are the newly-cross-slice ones); `riviera-stripe-payments`
(confirmed the booking↔payment seam is untouched — `PaymentEventListener` consumes
`payment.api` events and is a driving adapter → `adapter/in`; `CheckoutPort` still called from
`reserve/`; invariant #8 confirm-from-webhook path byte-for-byte unchanged). No `postgres` (no
SQL/schema change), no frontend skills (backend-only).

**Branch:** `claude/riviera-sdlc-issue-81-doodw1` (designated branch for this task).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given `booking` in the ADR-0007 sliced layout, when `ModularityTests` runs, then
  `ApplicationModules.verify()` passes (no cycle, no illegal internal access,
  `allowedDependencies = { venue::api, availability::api, payment::api, customer::api, operator::api }`
  still resolves). *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [ ] **AC-2:** Given the moved JDBC repository + code generator, when `JdbcOnlyArchitectureTests`
  runs, then no JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [ ] **AC-3:** Given the moved/sliced services, controllers, listeners and adapters, when the
  `booking` suite runs, then **all `booking` tests are green, unchanged** — the full
  reserve→pay→confirm and cancel/refund suites. *Pinned by:* `BookingServiceIT`,
  `BookingControllerIT`, `BookingEventIT`, `BookingViewIT`, `CancelBookingIT`,
  `ConcurrentReservationIT`, `CreateBookingPaymentFailureIT`, `CreateBookingStripeProfileIT`,
  `AbandonedBookingSweepIT`, `WeatherRefundServiceIT`, `WeatherRefundSecurityIT`,
  `StaffBookingControllerIT`, `PaymentEventListenerIT`, `BookingRefundListenerTest`,
  `JdbcBookingsTransitionIT`, `SecureRandomBookingCodeGeneratorTest`, `CreateBookingServiceTest`,
  `BookingCutoffTest`, `RefundPolicyTest`, `BookingMigrationIT`.
- [ ] **AC-4:** Given the final package tree, when inspected, then the shape is
  `api/` + `application/{reserve,cancel,refund,view}/` (+ `Bookings`/`BookingCodeGenerator` at
  root) + `domain/` (flat) + `adapter/in` + `adapter/out` (no `spi/`, no lingering
  `infrastructure/`, no `application/in`, no `application/out`); `api/` is top-level
  `@NamedInterface`; and `allowedDependencies` is unchanged. *Pinned by:* `ModularityTests` +
  package-tree/`git diff` inspection.
- [ ] **AC-5:** Slicing is package moves only — no service logic changed (every moved
  `src/main` class is a git rename; the content diff is package/import/javadoc only, plus the two
  `cancel/` collaborators' visibility widened to `public` for cross-slice access — a modifier change,
  not a logic change; see the Visibility accommodation note).

## Non-goals

- No behavior change, no logic change, no SQL change.
- **No api-split** — the `api/` events/ids are not decomposed here.
- No new `spi/` — `booking` owns no cross-module inversion.
- No widening/narrowing of `allowedDependencies`.
- `domain/` stays **flat** — not sliced (shared `BookingStatus`/`RefundPolicy`).
- Not touching sibling modules (this is the last of the series; #10 is the shape ArchUnit rule, a
  follow-up issue).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stale import/package decl left behind → compile break | med | med | Post-move grep proves zero remaining `booking.application.in`/`booking.application.out`/`booking.infrastructure` refs; full compile + tests green | claude | |
| R-2 | A newly cross-slice reference (was same-package, now not) left un-imported → compile break | med | med | Compile is the net; iterate on compiler errors until green; the 4 co-located package-private tests move with their target class | claude | |
| R-3 | Behavior drift hidden by the move (esp. reserve/confirm #2/#8, cancel/refund #5/#10) | low | high | Pure rename only; the reserve/confirm/cancel/refund/webhook ITs run for real (Testcontainers) and stay green | claude | |
| R-4 | A slice misplaces a class so a responsibility looks relocated (RV-BE-11) | low | med | Placement follows ADR-0007's explicit `booking` target tree; the 6 issue-unlisted files placed by primary-consumer slice (see Resolved) — no logic crosses a module boundary | claude | |
| R-5 | Accidental edit to `allowedDependencies` | low | med | AC-4: `git diff` on `booking/package-info.java` shows only javadoc changed | claude | |

## Open questions / Assumptions

_None open._

### Resolved (issue-intake grill — drift the issue map didn't spell out)

The issue says *"match class names to what's actually in the module … the list above is the map,
not the literal filenames."* Six real files aren't explicitly placed by the issue's slice lists;
placed here by **primary-consumer cohesion** (sub-package placement is Modulith/ArchUnit-invisible,
so this is a readability call, not a correctness one):

- **`PaymentDeclinedException`** (currently `application/`) → **`reserve/`** — thrown by
  `CreateBookingService` on the `PaymentOutcome.Failed` compensation branch.
- **`BookingConfirmation`, `BookingOutcome`** (currently `application/in`) → **`reserve/`** — the
  create use-case's result value + sealed outcome (`CreateBooking(+Command,+Outcome)` in the ADR).
- **`ConfirmedBooking`** (currently `application/out`) → **`reserve/`** — the `Bookings.confirm`/
  `confirmFromPayment` RETURNING record; confirm is the reserve slice.
- **`CancelledBooking`** (currently `application/out`) → **`cancel/`** — the `Bookings.cancelConfirmed`
  RETURNING record; primary consumer is `CancelBookingService` (also read cross-slice by
  `WeatherRefundService` in `refund/` — a normal in-module import).
- **`BookingRecord`** (currently `application/out`) → **`view/`** — the `Bookings.findByCode` read
  DTO; primary consumer is `ViewBookingService` (also read by `CancelBookingService`).
- **`AbandonedPaymentProperties` + `BookingSchedulingConfig`** (currently `infrastructure/` **root**)
  → **`adapter/in/`**. ADR-0007 removes the `infrastructure/` bucket entirely (allowed top-level set
  is `{api, spi, application, domain, adapter}`); both are **driving-side** scheduling config —
  `BookingSchedulingConfig` (`@Configuration @EnableScheduling`, profile-gated) enables and
  `AbandonedPaymentProperties` (`@ConfigurationProperties`) is injected by `AbandonedBookingScheduler`,
  which lives in `adapter/in`. Placing the config beside the scheduler it drives is the natural
  hexagonal home — the same precedent #80 set (`StripeConfig`/`StripeProperties` → `adapter/out`
  beside the gateway they configure; here the config is driving-side, so `adapter/in`).

**Visibility accommodation (slicing side-effect, caught by CI compile — not a logic change).** Two
`cancel/` collaborators are consumed across slices and were `package-private` (fine while
`application/` was flat): `BookingCutoff` (the invariant #4 cutoff — `ReserveSetService` in
`reserve/` calls `isBookable`, and `CreateBookingServiceTest` constructs it) and `CancellationPolicy`
(the invariant #10 refund quote — `ViewBookingService` in `view/` calls `quote`, returning the nested
`RefundQuote`). Slicing splits consumer and collaborator into different sub-packages, so these two
types + the exact cross-slice members (`BookingCutoff` class/ctor/`isBookable`; `CancellationPolicy`
class/`quote`/`RefundQuote`) are widened to `public`. This is a **visibility change, not a logic
change** — the method bodies are byte-identical — and stays **module-internal**: `application` is not
a `@NamedInterface`, so Modulith still forbids any other module importing them (invariant #11,
`ModularityTests` green). `freeCancellationOpen` stays package-private (only used within `cancel/`).
This is the inherent cost of use-case slicing with shared collaborators; the ADR placed both in
`cancel/` knowing `reserve`/`view` consume them.

The `Bookings` outbound **port** and `BookingCodeGenerator` stay at **`application/` root** (shared
by all slices) exactly as the issue and ADR specify; `Bookings` legitimately imports its RETURNING
records from the slice sub-packages (root → own sub-packages is fine).

## Availability & concurrency (invariant #2)

`N/A for logic — package move only.` `booking` is the *caller* of the availability claim
(`availability.api.AvailabilityClaim`, synchronous in-transaction claim in `ReserveSetService`) and
the release path (`ClaimReleaseService`); both move package (`application/` → `application/reserve/`)
with **no change to the claim/release calls, the transaction boundary, or ordering**. The
single-source-of-truth write still lives in `availability`. `ConcurrentReservationIT` re-proves the
race safety for real (AC-3).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns bookings, codes, lifecycle, cancellation policy; the move only re-packages its own classes and slices `application/` |

**Cross-module named interfaces (`api/` ports)**

| # | Interface | Kind | Declared in | Consumed by | Moved? |
|---|---|---|---|---|---|
| I-1 | `BookingId`, `RefundReason` (ids/vocabulary) | `api` | `booking.api` | `payout`/`payment` | **No** — unchanged |
| I-2 | `BookingConfirmed`, `BookingCancelled` (events) | `api` (published events) | `booking.api` | `availability`/`payout`/`payment` listeners | **No** — unchanged |

`booking` **calls** `venue::api`, `availability::api`, `payment::api`, `customer::api`,
`operator::api` (its `allowedDependencies`) — all still by their `api/` ports, from the sliced
`application/` packages.
No `spi/` — `booking` owns no dependency inversion. The move folds/renames/slices only the module's
*internal* packages.

**Domain events (id-based payloads, invariant #11)**

`booking` publishes `BookingConfirmed`/`BookingCancelled` from `api/` — **unchanged**; no event
type, id-based payload, or wiring is touched. `PaymentEventListener`/`BookingRefundListener`
(consumers of `payment.api` events) move package only (`infrastructure/in` → `adapter/in`).

### Module-ownership table (§4a)

All changed classes stay in `booking`; no cross-module interaction added, removed, or moved. No
policy/decision/calculation crosses a module boundary — `CancellationPolicy`, `BookingCutoff`,
`RefundPolicy` all stay in `booking` (cancel slice / flat domain). `allowedDependencies` unchanged.

## Payment & payout (invariants #5, #8, #9, #10)

- **#5 Money:** integer-minor-unit amounts flow through the moved records (`ConfirmedBooking`,
  `CancelledBooking`, `BookingRecord`, `RefundableBooking`) — no arithmetic touched, records moved
  package only.
- **#8 Webhook as source of truth:** the confirm-from-webhook path (`PaymentEventListener` →
  `ConfirmBooking`/`Bookings.confirmFromPayment`) moves package only; the idempotent 0-row-safe
  transition is byte-for-byte unchanged. `PaymentEventListenerIT` re-proves it (AC-3, R-3).
- **#9/#10 Refund/payout:** `CancellationPolicy` (server-side refund computation) and
  `WeatherRefundService` move package only; refund amounts stay server-computed. `payout` is a
  separate module, not touched.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint path, method, or DTO shape changed — the three controllers
(`BookingController`, `StaffBookingController`, `AdminWeatherRefundController`) and their request/
response DTOs move package only; `@RequestMapping` paths and request handling are unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + slice + import rewrite + safety-net verify | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## Phase 0 — Move + slice + import rewrite + safety-net verify

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior to drive
test-first; the pre-existing `booking` suite is the safety net):

- [ ] `git mv` the classes into `application/{reserve,cancel,refund,view}/` (+ `Bookings`,
  `BookingCodeGenerator` at `application/` root) and `adapter/{in,out}`; move the 4 package-private
  co-located tests with their target class; delete empty `application/{in,out}` and
  `infrastructure/{,in,out}`.
- [ ] Rewrite package declarations + FQN imports across main + test trees; add the newly
  cross-slice imports; drop now-redundant same-package imports. Verify zero remaining
  `booking.application.in`/`booking.application.out`/`booking.infrastructure` references.
- [ ] Update `package-info.java` javadoc (layout only; `allowedDependencies` untouched).
- [ ] Run the safety net: `./gradlew test --tests "*ModularityTests*"
  --tests "*JdbcOnlyArchitectureTests*"` → PASS; `./gradlew test --tests
  "ai.riviera.platform.booking.*"` → PASS.
- [ ] Commit + push to `claude/riviera-sdlc-issue-81-doodw1`.

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*ModularityTests*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*JdbcOnlyArchitectureTests*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "ai.riviera.platform.booking.*"` → PASS.
- [ ] **AC-4:** shape is `api/ application/{reserve,cancel,refund,view} domain/ adapter/{in,out}`
  (no `spi/`, no `infrastructure/`, no `application/in`, no `application/out`); `git diff` shows
  `allowedDependencies` unchanged.
- [ ] **AC-5:** every moved `src/main` class is a git rename (content diff = package/import/javadoc).

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] Type & signature consistency (pure rename — signatures unchanged).
- [ ] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [ ] **Availability** claim/release calls + transaction boundary unchanged (invariant #2) —
  `ConcurrentReservationIT` green.
- [ ] Pool + cutoff rules untouched (invariants #3, #4) — `BookingCutoffTest` green.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*`/`domain` imports;
  `api` kept top-level `@NamedInterface`; no `spi/` invented; `allowedDependencies` unchanged
  (invariant #11) — `ModularityTests` green.
- [ ] **Money/webhook** logic unchanged (invariants #5, #8); refund policy unchanged (#10); payout
  untouched (#9).
- [ ] Timezone handling unchanged (invariant #6) — `BookingCutoff` moved package only. Booking-code
  generation unchanged (invariant #7) — `SecureRandomBookingCodeGeneratorTest` green.
- [ ] No schema change → no Flyway migration needed (invariant #12).
- [ ] **Frontend** N/A (backend-only).
- [ ] Execution-status table matches reality.
- [ ] Risk register has no stale rows; Open Questions empty.

> Remaining loop stages (post-plan): open PR → CI gate → Review gate
> (`riviera-review-overlay` RV-BE-12 package shape; RV-BE-11 no responsibility relocated;
> RV-BE-3b confirms no `spi/` mis-placement) → Sonar gate → merge. **Completes the module
> migration** (#72 09/10); #10 (the package-shape ArchUnit rule) is the follow-up.
