# Booking QR + operator scan-to-complete check-in — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest's booking renders as a QR code; the venue operator scans (or types) it on the
service date and the booking transitions `CONFIRMED → COMPLETED` exactly once — a second scan is
refused with a distinct "already checked in" answer.

**Architecture:** The check-in is a new terminal-transition leg in `booking`, built on the house
guarded `UPDATE … WHERE status = 'CONFIRMED' … RETURNING` idiom (the row lock, not the predicate,
makes concurrent scans yield exactly one transition — same doctrine as `RequestReleaseService`).
The two `CONFIRMED`-filtered reads whose meaning changes (arrivals list, daily takings) widen in
the same slice; cancel and weather-refund guards deliberately stay `CONFIRMED`-only. No event is
published (mirrors withdraw #123: nothing accrues, nothing refunds, no mail decided). On the
frontend, QR rendering is a pure client-side component (`qrcode` lib); QR *scanning* is an
external-ish browser capability (camera) behind the established DI-token adapter-swap pattern so
e2e uses a deterministic fake.

**Persistence:** JDBC only (invariant #1). One migration: `V40__booking_completed_at.sql`
(nullable `completed_at TIMESTAMPTZ` on `booking` — the transition timestamp, mirroring
`confirmed_at`/`cancelled_at`/`accepted_at`). The status CHECK already admits `COMPLETED` (V37).

**Source of intent:** issue #583 (sub-issue of #575; decisions recorded there 2026-08-09).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the ask
extends #575, split into #583/#584 with maintainer decisions) · `riviera-plan-doc` (this template —
forced the read-widening audit and the parity ledger N/A check) · `tdd` (each phase red-green at the
service/adapter seam) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (due at merge close-out over this slice's range) · `riviera-modulith`
(check-in is a new `application/checkin/` use-case slice in `booking`; port stays internal — only
this module's REST adapter calls it, so NOT `api/`; no new published surface, no
`allowedDependencies` change) · `riviera-java-conventions` (sealed `CheckInResult` outcome — a lost
scan race is expected flow, not an exception; package-private service; text-block SQL; §6b
ProblemDetail codes) · `postgres` (V40: `TIMESTAMPTZ` never `TIMESTAMP`; no index — code lookups ride
the existing `booking_code_uniq`) · `codebase-design` (one deep `CheckInBooking` port: one method,
sealed result; classification hidden inside) · `domain-modeling` (canonical term **Check-in**;
CONTEXT.md entry at close-out; no ADR — reversible, unsurprising) · `riviera-frontend` (QR component
in `booking/`, scanner token + adapters in `operator/`, factory in `app.config.ts` per the
Stripe-gateway precedent; no new cross-feature edge) · `angular-developer` + angular-cli MCP +
`riviera-tailwind` + `playwright-cli` (loaded at the implement phases they route — FE components,
styling, e2e authoring).

**Branch:** `claude/booking-qr-code-scanning-fgawh6` (the session's designated remote branch,
standing in for `feature/booking-checkin-qr` per the riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a booking `CONFIRMED` for today (Europe/Tirane) at venue V, when V's operator
  submits its code to check-in, then the outcome is `CheckedIn(setId, bookingDate)`, the booking is
  `COMPLETED` with `completed_at` stamped. *Pinned by:* `CheckInFlowIT.checksInConfirmedBookingOnServiceDate`
- [ ] **AC-2:** Given a booking already `COMPLETED`, when checked in again, then the outcome is
  `AlreadyCheckedIn` (HTTP `409`, code `ALREADY_CHECKED_IN`) and nothing changes. *Pinned by:*
  `CheckInFlowIT.secondCheckInIsRefusedDistinctly`
- [ ] **AC-3:** Given two concurrent check-ins of the same code, when both submit, then exactly one
  observes `CheckedIn` and the other `AlreadyCheckedIn`. *Pinned by:*
  `CheckInConcurrencyIT.concurrentScansYieldExactlyOneTransition`
- [ ] **AC-4:** Given a booking `CONFIRMED` for a date other than today, when checked in, then the
  outcome is `WrongServiceDate(bookingDate)` (HTTP `409`, code `WRONG_SERVICE_DATE`, detail naming
  the date, never the code) and status stays `CONFIRMED`. *Pinned by:*
  `CheckInFlowIT.wrongDayScanIsRefusedNamingTheDate`
- [ ] **AC-5:** Given an unknown code, or a code belonging to a different venue, when checked in,
  then the outcome is `NotFound` (HTTP `404`, code `BOOKING_NOT_FOUND`) — indistinguishable between
  the two cases (non-enumerating). *Pinned by:* `CheckInFlowIT.foreignVenueCodeReadsAsNotFound`
- [ ] **AC-6:** Given an operator who does not own the path venue, when they check in any code, then
  `403 NOT_VENUE_OWNER` before any existence check. *Pinned by:* `CrossVenueDenialIT` (extended)
- [ ] **AC-7:** Given a day with one `CONFIRMED` and one `COMPLETED` booking, when the arrivals list
  and daily takings are read, then both bookings are listed (the completed one flagged
  `checkedIn`) and takings equal the sum of both. *Pinned by:*
  `CheckInFlowIT.arrivalsAndTakingsCountCheckedInBookings`
- [ ] **AC-8:** Given a `COMPLETED` booking, when a guest cancel or a weather refund targets it,
  then cancel answers not-cancellable and the weather refund skips it (guards stay
  `CONFIRMED`-only). *Pinned by:* `CheckInFlowIT.completedBookingIsNeitherCancellableNorWeatherRefundable`
- [ ] **AC-9:** Given a confirmed booking on the tourist surfaces (confirmation page, code-gated
  view, My bookings), when rendered, then a scannable QR encoding the absolute `/booking/{code}` URL
  is shown with an accessible label. *Pinned by:* `booking-qr.spec.ts` + `booking-flow.e2e.ts` (QR
  present + axe)
- [ ] **AC-10:** Given the operator Daily view with the fake scanner armed, when a QR (URL or bare
  code) is scanned or a code typed, then the check-in outcome is announced and the arrivals row
  shows checked-in; a second scan announces already-checked-in. *Pinned by:*
  `operator-daily.e2e.ts` (extended)

## Non-goals

- The `NO_SHOW` sweep — that is #584, blocked by this slice.
- Any `BookingCompleted` domain event, mail, or payout effect (accrual rode `BookingConfirmed`).
- Reopening cancellation/weather-refund policy for completed stays (invariant #10; ADR-0005).
- Changing the guest-facing booking endpoints or the code-in-URL contract (ADR-0006).
- Un-completing / correcting a mistaken scan (operator support path; new issue if it ever matters).
- Native `BarcodeDetector` usage — one deterministic decoder (`jsqr`) behind the token for v1.

## Behavior-parity ledger

N/A — new behavior, replaces nothing. The arrivals list and takings reads change *meaning*
deliberately (widened to include `COMPLETED`); AC-7 pins the no-regression half.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Concurrent scans of one code double-complete | med | high | guarded `UPDATE … RETURNING`; race classified by post-update re-read; `CheckInConcurrencyIT` | this slice | open |
| R-2 | Widening misses a `status='CONFIRMED'` read → console shows wrong money/rows | med | high | audit found exactly 4 predicates; 2 widen (arrivals, takings), 2 stay narrow deliberately (cancel guard, weather refund) — AC-7/AC-8 pin both directions | this slice | open |
| R-3 | Wrong-day logic drifts from `Europe/Tirane` (invariant #6) | low | med | service compares `LocalDate.ofInstant(clock.instant(), TIRANE)` — same idiom as `StaffBookingController`; fixed-`Clock` tests either side of midnight | this slice | open |
| R-4 | Check-in endpoint leaks the code (invariant #7) into logs/problem bodies | low | high | outcomes carry `BookingId`/set/date only; ProblemDetail details name the date, never the code; endpoint IT asserts body contains no code | this slice | open |
| R-5 | Venue-mismatch answer enumerates foreign codes | low | med | one `NotFound` for unknown *and* foreign-venue codes (AC-5); ownership 403 fires before any lookup (AC-6) | this slice | open |
| R-6 | Camera/QR decode flaky or unavailable in CI | high (CI) | med | camera never runs in CI: `QrScanner` DI token + `FakeQrScanner` armed by `window.__RIVIERA_FAKE_QR__` (Stripe-gateway precedent); manual code entry is the always-available fallback | this slice | open |
| R-7 | `V40` collides with a parallel slice | low | med | verified free on `main` (top is V39) and no open PR claims it (all open PRs are dependabot); renumber rule: whoever merges second | this slice | open |
| R-8 | New FE deps (`qrcode`, `jsqr`) bloat the tourist bundle | med | low | both lazy: QR component dynamic-imports `qrcode`; `jsqr` is imported only by the operator tab's scanner adapter (lazy route) | this slice | open |
| R-9 | Error contract drift (per-controller handler temptation) | low | med | typed-outcome `switch` + `ApiProblem` in the controller; no `@ExceptionHandler` (§6b, `ErrorContractArchitectureTests`) | this slice | open |

## Open questions / Assumptions

- **Assumption:** operator devices grant `getUserMedia`; where denied, manual entry is the flow —
  no camera-permission UX beyond the browser prompt in v1. — *Owner:* maintainer · *Resolves by:*
  accepted at plan (recorded in #583).
- **Assumption:** My-bookings renders the QR inline per `CONFIRMED` booking card (component reuse);
  non-confirmed cards show status only. — *Owner:* this slice · *Resolves by:* phase 4.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none in this slice. Check-in does not
  claim or release — the set stays consumed for its service date; `COMPLETED` only records that the
  stay was delivered. The availability row is untouched (verified: the transition touches only
  `booking.status`/`completed_at`).
- **Uniqueness guarantee:** unchanged (`availability` unique row per `(set, date)`).
- **Concurrency strategy (for the booking-row transition, the analogous risk here):** guarded
  `UPDATE booking SET status='COMPLETED' … WHERE code=… AND venue_id=… AND status='CONFIRMED' AND
  booking_date=… RETURNING` — whichever scan reaches the row first commits; the loser matches 0
  rows and is classified by a re-read against committed state. Same row-lock doctrine as
  `RequestReleaseService` (its class Javadoc is the canonical statement).
- **Pool rule (invariant #3):** untouched — bookings only ever exist for online-pool sets.
- **Cutoff rule (invariant #4):** untouched — check-in happens on the service day, after all of
  #4's fences; the cancel window is already `CLOSED` from 00:00 on the date (#566), consistent with
  AC-8.
- **Pinning test:** `CheckInConcurrencyIT.concurrentScansYieldExactlyOneTransition` — two threads,
  real Postgres, exactly one `CheckedIn`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | owns booking codes + the lifecycle incl. `completed` (RESPONSIBILITIES §booking Job line) |
| M-2 | `operator` | existing (consulted, unchanged) | `Operator` | owns the operator↔venue mapping; consulted via `operator::api` `VenueOwnership#assertOwns` (invariant #13) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` (existing, unchanged) | `VenueOwnership#assertOwns` | `OperatorId`, `VenueRef` | `booking` (already granted) |

No new published surface: `CheckInBooking` is an internal inbound port in
`booking/application/checkin/` — its only caller is this module's own REST adapter, exactly the
`ListDailyBookings` precedent. `allowedDependencies` unchanged.

**Domain events** — none published or subscribed. Deliberate (the withdraw precedent, #123):
nothing accrues, nothing refunds, and a "you were checked in" mail is a product decision nobody
made. `events/package-info.java` stays at five events.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The `CONFIRMED → COMPLETED` check-in transition + its rules (service-date-only, single-use) | `booking` | `booking` Job: "Own bookings, booking codes, and the lifecycle (confirmed / cancelled / completed / no-show)"; not `venue` (lifecycle is not its job) and not `availability` (no `(set,date)` state changes) |
| Authorizing which operator may check in at a venue | `operator` (consulted) | `booking` Not-My-Job: "Authorizing which operator may view staff bookings → `operator`"; check lives in `booking`'s application service via `operator::api` (invariant #13) |
| Arrivals list + takings semantics (now incl. `COMPLETED`) | `booking` | same reads it already owns (`ListDailyBookings`, `booking.api.DailyTakings`); consumers (`payout` console read, FE) see identical shapes plus one flag |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. The payout accrual rode `BookingConfirmed` at confirmation; check-in changes
current status only, which `payout` never reads. Refund policy is untouched: a `COMPLETED` booking
is outside the cancel window by construction (window closed at 00:00 on the service date) and the
`cancelConfirmed` / weather-refund guards stay `CONFIRMED`-only (AC-8).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-qr.ts` | new | standalone component (renders QR for a code via lazy `qrcode` import) | `input()` signals + async render effect | — |
| FE-2 | `booking/booking-confirmation.ts/.html` | existing | adds `<riv-booking-qr>` to the code card | unchanged | — |
| FE-3 | `booking/booking-view.ts/.html` | existing | adds QR for `CONFIRMED` bookings | unchanged | — |
| FE-4 | `booking/my-bookings.ts/.html` | existing | QR per `CONFIRMED` card | unchanged | — |
| FE-5 | `operator/qr-scanner.ts` (+ `camera-qr-scanner.ts`, `fake-qr-scanner.ts`) | new | abstract DI token + real (getUserMedia + lazy `jsqr` loop) and fake adapters | scan results as a callback/stream into the tab | — |
| FE-6 | `operator/scan-input.ts` | new | pure parse: bare code or `/booking/{code}` URL → normalized code (reuses Find-a-booking normalization rules) | — | — |
| FE-7 | `operator/daily-view-tab.ts/.html` | existing | check-in panel in the Arrivals card: scan button + manual entry + outcome notice; `checkedIn` chip per row | signals | template-driven input |
| FE-8 | `operator/operator-console.service.ts` + `.model.ts` | existing | `checkIn(venueId, code)` POST; `ConsoleDailyBooking` gains `checkedIn`; typed check-in outcome union | — | — |
| FE-9 | `app.config.ts` | existing | scanner token factory (`window.__RIVIERA_FAKE_QR__` ⇒ fake) — Stripe-gateway precedent | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`; Tailwind
per `riviera-tailwind`; a11y — QR gets an `img`/canvas with meaningful `aria-label`, scanner panel
keyboard-operable, outcomes announced (`role="status"`). No new cross-feature import (all new FE
files live inside their feature; `shared/booking-status.ts` already carries `COMPLETED` copy).

## FE↔BE contract

- **New endpoint:** `POST /api/venues/{venueId}/bookings/{code}/check-in` (operator-gated,
  `hasRole(OPERATOR)` in `SecurityConfig`; code-in-path per ADR-0006's standing convention).
  - `200` → `{ "setId": number, "bookingDate": "YYYY-MM-DD" }`
  - `409` `code=ALREADY_CHECKED_IN` · `409` `code=WRONG_SERVICE_DATE` (detail names the booking's
    date; a `bookingDate` extension property carries it machine-readably) · `404`
    `code=BOOKING_NOT_FOUND` · `403` `code=NOT_VENUE_OWNER` — all RFC-7807 via `ApiProblem`, never
    echoing the code.
- **Changed view:** `GET /api/venues/{venueId}/bookings` rows gain `"checkedIn": boolean`
  (additive; FE `ConsoleDailyBooking` extends in the same slice).
- **Client typing:** hand-written typed service (`operator-console.service.ts`), no `as any`.
- **Dates on the wire:** ISO `LocalDate` (booking date), as everywhere.

## Execution status

**Stage pointer:** plan committed — next stage: implement (phase 0)

**Next action:** open the draft PR (CI vehicle), then phase 0 red test (`V40` + `Bookings` port).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V40 + guarded transition in `Bookings`/`JdbcBookings` (+ concurrency IT) | | |
| 1 — `CheckInBooking` port + `CheckInService` + endpoint + SecurityConfig + error contract | | |
| 2 — widen arrivals + takings reads (`checkedIn` flag; `IN (CONFIRMED, COMPLETED)`) | | |
| 3 — FE tourist QR (component + 3 surfaces) | | |
| 4 — FE operator scanner (token/adapters, tab UI, service) | | |
| 5 — e2e (mocked suite) + a11y | | |
| 6 — docs close-out (CONTEXT.md, RESPONSIBILITIES.md, BookingStatus Javadoc, plan final state) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/booking-checkin-qr.md` — this plan
- `platform/src/main/resources/db/migration/V40__booking_completed_at.sql` — nullable `completed_at TIMESTAMPTZ`
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — `completeConfirmed`, `findCheckInFacts`; arrivals read renamed/widened
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInBooking.java` — internal inbound port
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInResult.java` — sealed outcome
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInService.java` — the transition service (assertOwns first)
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CheckInFacts.java` — classification row (status + date)
- `platform/src/main/java/ai/riviera/platform/booking/application/checkin/CompletedCheckIn.java` — RETURNING row (id, setId, date)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/DailyBooking.java` — gains `checkedIn`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ListDailyBookings.java` — contract Javadoc widened
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — the new SQL + widened arrivals read
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcDailyTakings.java` — `status IN (CONFIRMED, COMPLETED)`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/StaffBookingController.java` — the check-in POST
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/CheckInView.java` — success JSON view
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/DailyBookingView.java` — gains `checkedIn`
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingStatus.java` — Javadoc: `COMPLETED` now written by check-in
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — `BOOKING_CHECK_IN_PATH` matcher
- `platform/src/test/java/ai/riviera/platform/booking/CheckInFlowIT.java` — the flow ACs (1,2,4,5,7,8)
- `platform/src/test/java/ai/riviera/platform/booking/CheckInConcurrencyIT.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — AC-6 row for check-in
- `frontend/package.json` · `frontend/package-lock.json` — `qrcode`, `jsqr` (+ `@types/qrcode`)
- `frontend/src/app/booking/booking-qr.ts` · `booking-qr.spec.ts` — QR component + spec
- `frontend/src/app/booking/booking-confirmation.ts|.html` — QR on the code card
- `frontend/src/app/booking/booking-view.ts|.html` — QR for confirmed bookings
- `frontend/src/app/booking/my-bookings.ts|.html` — QR per confirmed card
- `frontend/src/app/operator/qr-scanner.ts` · `camera-qr-scanner.ts` · `fake-qr-scanner.ts` — token + adapters
- `frontend/src/app/operator/scan-input.ts` · `scan-input.spec.ts` — URL/code parse
- `frontend/src/app/operator/daily-view-tab.ts|.html` · `daily-view-tab.spec.ts` — check-in UI + chip
- `frontend/src/app/operator/operator-console.service.ts` · `operator-console.service.spec.ts` — `checkIn`
- `frontend/src/app/operator/operator-console.model.ts` — `checkedIn` + outcome types
- `frontend/src/app/app.config.ts` — scanner factory
- `frontend/e2e/booking-flow.e2e.ts` — tourist QR assertions
- `frontend/e2e/operator-daily.e2e.ts` — check-in flow (fake scanner) + axe
- `CONTEXT.md` — **Check-in** term
- `RESPONSIBILITIES.md` — §`booking`: the check-in leg
- `CLAUDE.md` — booking-module row mention (docs-freshness sweep decides exact wording)

---

## Phase 0 — V40 + the guarded transition (`Bookings` port + `JdbcBookings`)

**Files:** Create `V40__booking_completed_at.sql`, `CheckInFacts.java`, `CompletedCheckIn.java`,
`CheckInConcurrencyIT.java` · Modify `Bookings.java`, `JdbcBookings.java`

- [ ] **Step 1: Write the failing test** — `CheckInConcurrencyIT`: seed a `CONFIRMED` booking for
  today; two threads call `bookings.completeConfirmed(code, venueId, today, now)`; assert exactly
  one non-empty `Optional`, final status `COMPLETED`, `completed_at` set once.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*CheckInConcurrencyIT*"` → FAIL (no such methods).
- [ ] **Step 3: Minimal implementation** — migration:

```sql
-- V40__booking_completed_at.sql
-- Check-in (#583): when the stay was delivered — stamped by the CONFIRMED -> COMPLETED transition.
ALTER TABLE booking ADD COLUMN completed_at TIMESTAMPTZ;
```

  `Bookings` port additions (signatures):

```java
Optional<CompletedCheckIn> completeConfirmed(String code, VenueId venueId, LocalDate serviceDate, Instant completedAt);
Optional<CheckInFacts> findCheckInFacts(String code, VenueId venueId);
```

  `JdbcBookings` — the guarded transition (house idiom):

```sql
UPDATE booking
SET status = :completed, completed_at = :at
WHERE code = :code AND venue_id = :venue AND status = :confirmed AND booking_date = :date
RETURNING id, set_id, booking_date
```

  and the classification read: `SELECT status, booking_date FROM booking WHERE code = :code AND venue_id = :venue`.
- [ ] **Step 4: Run it, verify it passes**, then module regression `./gradlew test --tests "ai.riviera.platform.booking.*"`.
- [ ] **Step 5: Generalization-audit pass** — N/A unless a bug surfaces.
- [ ] **Step 6: Commit** — `Add the guarded check-in transition (#583)`
- [ ] **Step 7: Update Execution status** (same commit window). Open the **draft PR** now (CI vehicle).

## Phase 1 — `CheckInService` + endpoint + error contract

**Files:** Create `CheckInBooking.java`, `CheckInResult.java`, `CheckInService.java`,
`CheckInView.java`, `CheckInFlowIT.java` · Modify `StaffBookingController.java`,
`SecurityConfig.java`, `CrossVenueDenialIT.java`

- [ ] **Step 1: Failing tests** — `CheckInFlowIT` (ACs 1, 2, 4, 5) + `CrossVenueDenialIT` check-in row (AC-6).
- [ ] **Step 2:** scoped run → FAIL.
- [ ] **Step 3: Implementation** — sealed outcome + service:

```java
public sealed interface CheckInResult {
	record CheckedIn(SetId setId, LocalDate bookingDate) implements CheckInResult {}
	record AlreadyCheckedIn(LocalDate bookingDate) implements CheckInResult {}
	record WrongServiceDate(LocalDate bookingDate) implements CheckInResult {}
	record NotFound() implements CheckInResult {}
}
```

  Service order: `ownership.assertOwns` → guarded `completeConfirmed` (today in `Europe/Tirane`
  from the injected `Clock`) → on empty, classify via `findCheckInFacts` against committed state
  (none → `NotFound`; `COMPLETED` → `AlreadyCheckedIn`; `CONFIRMED` + other date →
  `WrongServiceDate`; anything else → `NotFound`). `@Transactional` on the write; the classification
  re-read runs after the update in the same transaction (the update's 0-row case holds no lock).
  Controller: `POST /{venueId}/bookings/{code}/check-in` → exhaustive `switch` mapping to
  `CheckInView` / `ApiProblem` (`ALREADY_CHECKED_IN` 409, `WRONG_SERVICE_DATE` 409 + `bookingDate`
  extension, `BOOKING_NOT_FOUND` 404). SecurityConfig: `POST /api/venues/*/bookings/*/check-in → OPERATOR`.
- [ ] **Step 4:** scoped pass + `--tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*ErrorContractArchitectureTests*"`.
- [ ] **Step 5: Generalization audit** — does any other operator command classify-after-guarded-update? (decline/expire return boolean; no action expected — record.)
- [ ] **Step 6–7: Commit** — `Check a guest in by booking code (#583)` + status update.

## Phase 2 — widen the arrivals + takings reads

**Files:** Modify `DailyBooking.java`, `ListDailyBookings.java`, `JdbcBookings.java`,
`JdbcDailyTakings.java`, `DailyBookingView.java`, `StaffBookingController.java`, `CheckInFlowIT.java`

- [ ] **Step 1: Failing test** — AC-7 in `CheckInFlowIT`: one CONFIRMED + one COMPLETED booking →
  arrivals returns both (`checkedIn` true on the completed row), takings = sum of both. AC-8 test
  beside it: cancel → not-cancellable; weather refund refunds only the CONFIRMED one.
- [ ] **Step 2:** scoped run → FAIL.
- [ ] **Step 3:** arrivals SQL `status IN (:confirmed, :completed)` + `status` selected →
  `DailyBooking(setId, code, checkedIn)`; takings SQL `status IN (:confirmed, :completed)`;
  `DailyBookingView(setId, code, checkedIn)`.
- [ ] **Step 4:** booking-package regression + `payout` module tests (console takings consumer).
- [ ] **Step 5:** Generalization audit — re-grep `status = :confirmed` / `CONFIRMED.name()`; confirm the remaining narrow reads are the two deliberate ones.
- [ ] **Step 6–7: Commit** — `Count checked-in bookings in arrivals and takings (#583)` + status.

## Phase 3 — FE tourist QR

**Files:** Create `booking-qr.ts`, `booking-qr.spec.ts` · Modify `booking-confirmation.ts|.html`,
`booking-view.ts|.html`, `my-bookings.ts|.html`, `package.json`, `package-lock.json`

- [ ] Load `angular-developer` + angular-cli MCP `get_best_practices` + `riviera-tailwind` before authoring.
- [ ] **Step 1: Failing spec** — `booking-qr.spec.ts`: renders an `<img>` whose `src` is a data URL
  and `alt`/`aria-label` names the booking; encodes `location.origin + '/booking/' + code`.
- [ ] **Step 3:** `qrcode` lazy import (`await import('qrcode')` → `toDataURL`), signal `input.required<string>()` for the code.
- [ ] **Step 4:** `npm test` scoped; `npm run lint`.
- [ ] **Step 6–7: Commit** — `Show the booking as a QR code (#583)` + status.

## Phase 4 — FE operator scanner + check-in UI

**Files:** Create `qr-scanner.ts`, `camera-qr-scanner.ts`, `fake-qr-scanner.ts`, `scan-input.ts`,
`scan-input.spec.ts` · Modify `daily-view-tab.ts|.html`, `daily-view-tab.spec.ts`,
`operator-console.service.ts` + spec, `operator-console.model.ts`, `app.config.ts`

- [ ] **Step 1: Failing specs** — `scan-input.spec.ts` (URL + bare-code + noise normalization);
  service spec for `checkIn` (POST shape, typed outcomes incl. 409 codes); tab spec: outcome notice
  + `checkedIn` chip + refresh after success.
- [ ] **Step 3:** abstract `QrScanner { start(onCode): Promise<void>; stop(): void }`; camera adapter
  (getUserMedia + rAF loop over a canvas + lazy `jsqr`); fake adapter reading
  `window.__RIVIERA_FAKE_QR__` codes; factory in `app.config.ts`. Manual entry submits through the
  same normalized path.
- [ ] **Step 4:** scoped Vitest + lint.
- [ ] **Step 6–7: Commit** — `Scan a booking QR to check the guest in (#583)` + status.

## Phase 5 — e2e (mocked suite)

**Files:** Modify `frontend/e2e/booking-flow.e2e.ts`, `frontend/e2e/operator-daily.e2e.ts`

- [ ] Load `playwright-cli`; suite placement is the CI-safe mocked suite (RV-FE-E2E: user-facing
  flow, API mocked via `page.route`).
- [ ] Tourist: after mocked confirmation, the QR img is visible with its label (+ axe via
  `expectNoSeriousAxeViolations`).
- [ ] Operator: arm `window.__RIVIERA_FAKE_QR__`, mock the check-in POST (200 then 409
  `ALREADY_CHECKED_IN`), assert row chip + both outcome notices; keyboard path through manual entry.
- [ ] **Commit** — `Cover QR check-in end to end (#583)` + status.

## Phase 6 — docs close-out

- [ ] `CONTEXT.md`: **Check-in** — staff recording, by scanning/typing the booking code on the
  service date, that the guest arrived; transitions the booking to `Completed`.
- [ ] `RESPONSIBILITIES.md` §`booking`: the check-in leg (guarded transition; reads widened; no event — withdraw's precedent).
- [ ] `BookingStatus` Javadoc: `COMPLETED` written by check-in (#583); `NO_SHOW` still pending #584.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` + finalize Execution status
  (`merged via PR #NN` form), risk rows closed, Open Questions resolved.
- [ ] **Commit** — `Record the check-in vocabulary and close out the plan (#583)`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..8:** `./gradlew test --tests "*CheckInFlowIT*" --tests "*CheckInConcurrencyIT*" --tests "*CrossVenueDenialIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-9..10:** `npm test` + `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** N/A holds — no money path touched (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side, unchanged (invariant #10).
- [ ] Timezone correct: UTC stored (`completed_at`), `Europe/Tirane` for the service-date rule (invariant #6).
- [ ] Booking codes unguessable and never logged/echoed (invariant #7).
- [ ] Flyway V40 present; CHECK already admits `COMPLETED` (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register closed; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`).
- [ ] **The review gate ran in full** (invocation ladder + `riviera-review-overlay`).
