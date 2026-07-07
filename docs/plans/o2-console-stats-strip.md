# O2 — Operator console stats strip Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Load `riviera-local-debug` before the first
> `gradle`/`npm` of the session (cloud proxy + scoped-test recipe).

**Goal:** Render the operator console's four glass stat tiles — Free today `{free}/{total}`,
Booked online, Walk-ins marked, and Online takings today (`{gross}` gross + `{net}` net after
`{pct}` commission) — live for the operator's venue for today (Europe/Tirane), by adding the one
missing server-side read: a venue-scoped, owner-asserted **daily online-takings + commission**
aggregate. The three occupancy counts stay client-derived from existing reads.

**Architecture:** The single significant decision is the **read seam**. No existing module can
cleanly own a four-value occupancy+money aggregate (`venue` Not-My-Job rejects "is a set free on a
date" and commission; `availability` rejects pricing/commission; `payout` works in ids+money with
no occupancy Need-To-Know), so the occupancy+money composition is a **presentation** concern that
stays in the frontend strip. Only the money value is genuinely new server-side: **`booking`
exposes per-`(venue, date)` gross confirmed-online takings via its first `api/` port; `payout`
owns the read that applies commission** (rate from `venue`, arithmetic reused from the ledger's
`floorDiv` formula) and serves it owner-asserted at `GET /api/venues/{venueId}/takings`.
`payout→booking::api` is a forward edge (payout already depends on `booking::events`), so no cycle.

**Persistence:** JDBC only (invariant #1). **No schema change** — the gross is a
`COALESCE(SUM(amount_minor),0)` aggregate over the existing `booking` table, served by the
existing `booking_venue_id_idx`. No Flyway migration (next free version, if ever needed, is
**V22** — verified V1–V21 present, unclaimed by any open PR).

**Source of intent:** GitHub issue **#171** (O2), parent epic **#141**; design
`docs/design/riviera-operator-console-v2.dc.html` (stats strip lines 62–78) + intake note
`docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted** (Skill-routing gate output):
- `riviera-sdlc` — routed the stage; intake-grill gate run against current code.
- `riviera-plan-doc` — this doc's discipline (testable ACs at the hexagon, risk/open-question registers).
- `riviera-modulith` — `booking` gains its **first `api/` port**; `payout→booking::api` is acyclic; `Commission` helper in `payout/domain`; only `booking::api` added to `payout.allowedDependencies`.
- `riviera-stripe-payments` — commission stays server-side; the takings figure is **indicative per service-date**, explicitly NOT the ISO-week ledger accrual and never writes/reconciles the ledger; no Connect, no charge/refund.
- `riviera-java-conventions` — records/typed ids, text-block `SUM` SQL with named params, package-private JDBC adapter, `floorDiv`, RFC-7807 `ProblemDetail` error contract (`NOT_VENUE_OWNER` via `ApiErrorHandler`), named status constant.
- `postgres` — the gross is a SQL aggregate (not a Java row-sum); reuses `booking_venue_id_idx`; money as `BIGINT` minor units; no migration/index added.
- `riviera-frontend` — strip lives in the `operator/` feature; `operator/` may not import `venue/`/`staff/`, so count-source calls live in `operator-console.service.ts`; `MoneyView` promoted to `shared/`.
- `angular-developer` + angular-cli MCP `get_best_practices` (v22) — signals, `input()`/`computed()`, `@Service`, native control flow, `NgOptimizedImage` N/A, AA/axe mandatory.
- `playwright-cli` — extend the CI-safe mocked `operator-console.e2e.ts` + `expectNoSeriousAxeViolations`.

**Branch:** `claude/next-sdlc-issue-pt57da` — the session's designated remote branch **stands in
for** `feature/o2-console-stats-strip` (cloud-session addendum); sits at `origin/main` (0/0).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (gross, at the port):** Given venue V with three `CONFIRMED` online bookings for
  date D (amount_minor 4000, 4000, 3000, currency EUR) plus decoy rows (an `AWAITING_PAYMENT`
  booking for V/D, a `CONFIRMED` booking for V on D−1, and a `CONFIRMED` booking for another
  venue on D), when `DailyTakings.grossOnlineTakings(V, D)` is called, then it returns
  `OnlineTakings(11000, "EUR")`. *Pinned by:* `JdbcBookingsDailyTakingsIT.sumsOnlyConfirmedOnlineForVenueAndDate`
- [ ] **AC-2 (commission applied once, server-side):** Given `grossMinor = 11000` and the venue's
  `commissionBps = 1500`, when the takings read computes, then `commissionMinor = 1650` and
  `netMinor = 9350` (`floorDiv(11000*1500, 10000)`). *Pinned by:* `CommissionTest.splitsWithFloorDiv`
  and `DailyTakingsServiceTest.appliesVenueCommissionOnceOnAggregate`
- [ ] **AC-3 (owner-asserted / BOLA, invariant #13):** Given operator A who does not own venue V,
  when `GET /api/venues/{V}/takings` is called as A, then `403` with `code = NOT_VENUE_OWNER`; and
  when called by V's owner B, then `200`. *Pinned by:* `CrossVenueDenialIT.takingsReadByNonOwnerIs403`
  and the extended `CrossVenueDenialIT.ownerReadsAreNotForbidden`
- [ ] **AC-4 (empty day):** Given venue V with no `CONFIRMED` bookings for D, when the takings read
  runs, then it returns gross 0 / commission 0 / net 0 / currency `EUR` and the endpoint responds
  `200` (no error). *Pinned by:* `DailyTakingsServiceTest.emptyDayYieldsZerosInEur` (+ IT coverage)
- [ ] **AC-5 ("today" in Europe/Tirane, invariant #6):** Given no `date` query param, when
  `GET /api/venues/{V}/takings` is called, then the date used is `LocalDate.now(Europe/Tirane)`
  (not the JVM/browser default). *Pinned by:* `VenueTakingsControllerTest.defaultsToTiraneToday`
  (fixed `Clock`)
- [ ] **AC-6 (strip renders live values, a11y):** Given the console mounted for venue 1 with the
  stats endpoints mocked, when it loads, then the four tiles show `free/total`, booked-online,
  walk-ins-marked, and `{gross}` with a "`{net}` after `{pct}` commission" sub-label, on every tab,
  and the surface passes axe. *Pinned by:* `operator-console.e2e.ts` (extended),
  `console-stats-strip.spec.ts`, `console-stats-strip.contrast.spec.ts`
- [ ] **AC-7 (money contract, invariant #5):** Given the takings endpoint, when it responds, then
  gross and net are integer minor units + ISO currency (`{minorUnits, currency}`), and the FE
  renders them via `formatMoney` with **no** division or commission arithmetic client-side.
  *Pinned by:* `console-stats-strip.spec.ts` (asserts `formatMoney` output, no local math)

## Non-goals

- No new backend read for the three occupancy counts — they stay client-derived from the existing
  venue-map (`GET /api/venues/{id}?date=`) and staff-bookings (`GET /api/venues/{id}/bookings?date=`)
  reads, exactly as `staff-daily` does today (issue #171 / epic note: "counts are client-derivable today").
- No change to the payout ledger, its schema, `BookingConfirmed`, or accrual/reversal — the takings
  figure is read-only and independent of the ISO-week ledger.
- No change to walk-in marking, pool assignment, pricing, commission-rate editing, or refund policy.
- Not the Payouts tab (O7 / #173), Requests badge behavior (#170, already shipped), or multi-venue
  venue-picker (console is single-venue by `:venueId`, decided in O1).
- No per-booking commission reconciliation — the daily figure rounds **once** on the aggregate and
  is not expected to equal the sum of per-booking ledger commissions.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A cross-venue read leaks another operator's takings (BOLA, invariant #13) | med | high | `assertOwns(operator, VenueRef)` as the **first** statement of `DailyTakingsService`, not the controller; `CrossVenueDenialIT.takingsReadByNonOwnerIs403` pins 403 `NOT_VENUE_OWNER` | agent | open |
| R-2 | `booking` gaining its first `api/` port trips `PackageShape`/`PublishedSurfacePlacement`/`ModularityTests` | med | med | Add `booking/api/package-info.java` `@NamedInterface("api")`, ports-only; value type in `booking/vocabulary`; add `booking::api` to `payout.allowedDependencies`; run the structural net (`*ModularityTests* *PackageShapeArchitectureTests* *PublishedSurfacePlacementArchitectureTests*`) | agent | open |
| R-3 | Takings figure mistaken for the authoritative payout (it is per-service-date, indicative; ledger accrues by ISO-week of confirmation) | med | med | Plan + code comment state it explicitly; label copy is "takings today", never "owed"; O7 owns the ledger/statement | agent | open |
| R-4 | Money rounding: aggregate `floorDiv` ≠ Σ per-booking `floorDiv` | low | low | Documented and intended (indicative figure, not the ledger); one shared `Commission.split` keeps the *formula* identical | agent | open |
| R-5 | Mixed-currency SUM would be meaningless | low | med | v1 collection currency is EUR (invariant #5, fixed); empty/`MAX(amount_currency)` falls back to `EUR`; note the single-currency assumption in `OnlineTakings` | agent | open |
| R-6 | `operator/` cross-feature import of `venue/`/`staff/` for count sources (FE boundary) | med | med | Count-source HTTP calls live in `operator-console.service.ts` (established duplication pattern, as `pendingRequestCount`); `MoneyView` promoted to `shared/` | agent | open |
| R-7 | Booked-online count (`bookings().length`) diverges from map TAKEN∖online classification | low | low | Same derivation `staff-daily` already ships (invariants #2/#3 keep them consistent); reuse its logic shape | agent | open |

## Open questions / Assumptions

- **Resolved (maintainer, 2026-07-07):** "Online takings · today" counts bookings **by service
  date** (`booking_date = today`, Europe/Tirane), consistent with the other three today-tiles;
  it is an indicative operational figure and does **not** reconcile to the payout ledger.
- **Resolved (maintainer, 2026-07-07):** backend shape = **Option A** — one new takings read only;
  the three counts stay client-derived. (Rationale: no module cleanly owns a four-value
  occupancy+money aggregate; composition is a presentation concern.)
- **Assumption:** "Free today `{free}/{total}`" counts **all** sets (both pools), matching
  `staff-daily`'s `totalCount`/`freeCount`. — *Owner:* agent · *Resolves by:* Phase 2 (flag at review if the design intends online-pool-only).
- **Assumption:** "Booked online" = confirmed online bookings for the date (`/bookings` row count);
  "Walk-ins marked" = `taken − bookedOnline` where `taken = total − free`. — *Owner:* agent · *Resolves by:* Phase 2.
- **Assumption:** exposing the venue's own `commissionBps` to its owning operator (for the "after
  X% commission" label) is not a leak — the operator sets it in the venue editor. Net is
  server-computed; only the rate (for the label) crosses. — *Owner:* agent · *Resolves by:* Phase 1 review.

## Availability & concurrency (invariant #2)

**N/A — read-only; adds no write path to `availability(set_id, booking_date)`.** The new backend
read sums `booking` rows (`status = CONFIRMED`) and touches `set_availability` only indirectly and
read-only via the existing `findVenueMap` (client-side, for counts). It takes no row locks, issues
no `INSERT … ON CONFLICT`, and mutates nothing, so invariants #2/#3/#4 are not in play. The tile
values are a snapshot; no reservation semantics.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns bookings + their amounts; gross = Σ of its own `amount_minor` for confirmed online bookings — a read over its own data (not commission) |
| M-2 | `payout` | existing | `PayoutLedgerEntry` | Owns "Σ booking amounts − commission"; applies the venue's commission rate; hosts the owner-asserted takings read + endpoint |
| M-3 | `venue` | existing (unchanged) | `Venue` | Supplies `commissionBps` via the already-granted `VenueRates` port |
| M-4 | `operator` | existing (unchanged) | `Operator` | `VenueOwnership.assertOwns` for the invariant-#13 check |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` (**new package**) | `DailyTakings#grossOnlineTakings(VenueId, LocalDate)` | `booking.vocabulary.OnlineTakings(long grossMinor, String currency)` | `payout` |
| NI-2 | `venue.api` (existing) | `VenueRates#commissionBps(VenueId)` | `OptionalInt` | `payout` (already used) |
| NI-3 | `operator.api` (existing) | `VenueOwnership#assertOwns(OperatorId, VenueRef)` | `operator.vocabulary.*` | `payout` (already used) |

- `payout.allowedDependencies` += **`booking::api`** (only addition; `booking::vocabulary`,
  `venue::api/vocabulary`, `operator::api/vocabulary` already granted).
- `booking.api` is a **query** port (synchronous, caller needs the answer now) — correct per the
  api-vs-event rule; it is *inbound* (others call it), so `api/` not `spi/`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | N/A — this slice publishes/consumes no events (a synchronous query, not a state change) |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Sum gross confirmed **online** takings for `(venue, date)` | `booking` | `booking` Job: owns bookings + amounts; gross is Σ its own `amount_minor`. **Not** commission (booking Not-My-Job: "Computing the payout or commission → `payout`") — it returns raw gross only |
| Apply the venue commission → commission + net | `payout` | `payout` Job: "Σ booking amounts − commission". Reuses `Commission.split` (`floorDiv`). `venue` Not-My-Job: "the payout math or commission arithmetic → `payout`"; `booking` Not-My-Job likewise |
| Store/supply the commission **rate** | `venue` | `venue` Job: stores the commission *rate*; supplies it via `VenueRates` (payout applies it) |
| Assert the actor owns the venue (403) | `operator` (mapping) + `payout` (call site) | invariant #13: the check runs in `payout`'s **application service** via `operator.api.VenueOwnership`; `operator` owns the mapping, not the request path |
| Occupancy counts (free/total, booked-online, walk-ins) | availability/venue read side (client-derived) | Kept off the backend this slice; composed in the FE strip from existing reads (presentation concern) |

`riviera-review-overlay` RV-BE-11 re-checks this table against the diff.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; unchanged. No charge, no refund, no
  PaymentIntent, no webhook in scope.
- **Confirmation trigger:** N/A — read-only; consumes no payment events.
- **Idempotency:** N/A — no state mutation.
- **Money:** integer minor units, **EUR** (collection currency, invariant #5). Gross =
  `COALESCE(SUM(amount_minor),0)`; commission = `floorDiv(gross * commissionBps, 10000)`; net =
  `gross − commission`, **rounded once on the daily aggregate**.
- **Payout-ledger effect:** **none.** This figure is a per-service-date **indicative** read; the
  ledger accrues per booking by ISO-week of confirmation and is untouched. Documented in code + R-3.
- **Refund policy applied:** N/A.
- **Pinning tests:** `CommissionTest`, `DailyTakingsServiceTest`, `JdbcBookingsDailyTakingsIT`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/console-stats-strip.ts` (+`.html`) | new | standalone component (`input()` `venueId`) | Signals + `computed()`; loads via effect once `venueId` present | none |
| FE-2 | `operator/operator-console.html` | modify (mount FE-1 between `</header>` and `<nav class="oc-tabs">`) | template | — | — |
| FE-3 | `operator/operator-console.service.ts` | modify | `@Service` | adds `dailyTakings(venueId,date)`, `venueDayCounts(venueId,date)` (map+bookings) | — |
| FE-4 | `operator/operator-console.model.ts` | new | types | `TakingsView`, `DayCounts`, `ConsoleStats` | — |
| FE-5 | `shared/money.ts` + `shared/money.model.ts` | modify | promote `MoneyView` from `venue/venue.model.ts` to `shared/` (fix the one-way import) | — | — |
| FE-6 | `operator/console-stats-strip.spec.ts` / `.contrast.spec.ts` | new | Vitest specs | — | — |

**Standards:** standalone (no explicit `standalone:true`/`OnPush`), `inject()`, `input()`/`computed()`,
native `@if`/`@for`, `class`/`style` bindings (no `ngClass`/`ngStyle`), tiles surfaced with the
`appCardGlass` directive (no new palette literals — `--riv-*` tokens; console is porcelain-pinned),
money via `shared/money.ts` `formatMoney`. AA/axe mandatory (tiles are text-on-glass → contrast spec).

## FE↔BE contract

- **New endpoint:** `GET /api/venues/{venueId}/takings?date=YYYY-MM-DD` (date optional → today
  Europe/Tirane). Responses:
  - `200` → `{ "gross": {"minorUnits": <long>, "currency": "EUR"}, "net": {"minorUnits": <long>, "currency": "EUR"}, "commissionBps": <int>, "date": "YYYY-MM-DD" }`
  - `403` → RFC-7807 `ProblemDetail`, `code = NOT_VENUE_OWNER` (via `ApiErrorHandler`)
  - `400` → `ProblemDetail` on an unparseable `date`
- **Reused reads (no contract change):** `GET /api/venues/{venueId}?date=` (map → free/total),
  `GET /api/venues/{venueId}/bookings?date=` (booked-online count).
- **Client typing:** `OperatorConsoleService.dailyTakings(): Observable<TakingsView>`; `MoneyView`
  = `{minorUnits: number; currency: string}` in `shared/`; no `as any`.
- **Money/date on the wire:** amounts integer minor units + ISO currency; `date` as ISO `LocalDate`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — booking: gross-online-takings `api/` port + SUM query | | |
| 1 — payout: `Commission` + takings service + owner-asserted endpoint | | |
| 2 — FE: stats-strip component + service + MoneyView→shared | | |
| 3 — FE e2e (mocked) + a11y/contrast | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase's code.

---

## File structure

**Backend (`platform/`)**
- `booking/api/DailyTakings.java` — **new** `api/` port (interface): `OnlineTakings grossOnlineTakings(VenueId, LocalDate)`.
- `booking/api/package-info.java` — **new**, `@NamedInterface("api")`.
- `booking/vocabulary/OnlineTakings.java` — **new** value record `(long grossMinor, String currency)`.
- `booking/application/Bookings.java` — add `grossConfirmedOnline(VenueId, LocalDate): OnlineTakings` (outbound port method).
- `booking/adapter/out/JdbcBookings.java` — add the `COALESCE(SUM(amount_minor),0)` text-block query; a package-private `DailyTakings` adapter (or existing façade) implements `booking.api.DailyTakings`.
- `payout/domain/Commission.java` — **new**: `CommissionSplit split(long grossMinor, int commissionBps)` (`floorDiv`, `BPS_DENOMINATOR`), extracted from `PayoutLedgerEntry`.
- `payout/domain/PayoutLedgerEntry.java` — refactor `accrual()`/`reversalOf()` to call `Commission.split` (no behavior change).
- `payout/application/ViewDailyTakings.java` — **new** inbound port: `DailyTakingsView forVenueOn(OperatorId, VenueId, LocalDate)`.
- `payout/application/DailyTakingsView.java` — **new** view record `(long grossMinor, long commissionMinor, long netMinor, int commissionBps, String currency, LocalDate date)`.
- `payout/application/DailyTakingsService.java` — **new** `@Service`: `assertOwns` → `booking.api.DailyTakings` → `venue.api.VenueRates` → `Commission.split`.
- `payout/adapter/in/VenueTakingsController.java` — **new** `@GetMapping("/{venueId}/takings")`; `CurrentOperator.require`; maps to `TakingsResponse`.
- `payout/adapter/in/TakingsResponse.java` — **new** wire record `(MoneyView gross, MoneyView net, int commissionBps, LocalDate date)` + `MoneyView(long minorUnits, String currency)`.
- `payout/package-info.java` — add `"booking::api"` to `allowedDependencies`.

**Frontend (`frontend/src/app/`)**
- `shared/money.model.ts` (+ `money.ts`) — house `MoneyView` in `shared/`; update `venue/`, `staff/` imports.
- `operator/operator-console.model.ts` — **new** (`TakingsView`, `DayCounts`, `ConsoleStats`).
- `operator/operator-console.service.ts` — add `dailyTakings`, `venueDayCounts`.
- `operator/console-stats-strip.ts` / `.html` — **new** component.
- `operator/operator-console.html` — mount the strip between header and tab nav.
- `operator/console-stats-strip.spec.ts` / `.contrast.spec.ts` — **new** specs.
- `frontend/e2e/operator-console.e2e.ts` — extend `mockConsole` with `/takings`, `/bookings`, `/venues/1?date` and tile assertions.

---

## Phase 0 — `booking`: gross-online-takings `api/` port + SUM query

**Files:** Create `booking/api/DailyTakings.java`, `booking/api/package-info.java`,
`booking/vocabulary/OnlineTakings.java` · Modify `booking/application/Bookings.java`,
`booking/adapter/out/JdbcBookings.java` · Test `JdbcBookingsDailyTakingsIT`

- [ ] **Step 1: Write the failing test** — `JdbcBookingsDailyTakingsIT` (Testcontainers,
  `@EnabledIfDockerAvailable`): seed the AC-1 fixture, assert `grossOnlineTakings(V, D)` →
  `OnlineTakings(11000, "EUR")`, and the empty day → `OnlineTakings(0, "EUR")`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcBookingsDailyTakingsIT*"` → FAIL (no method).
- [ ] **Step 3: Minimal implementation** — text-block SQL
  `SELECT COALESCE(SUM(amount_minor),0) AS gross_minor, COALESCE(MAX(amount_currency), :fallbackCcy) AS currency FROM booking WHERE venue_id = :venue AND booking_date = :date AND status = :confirmed`
  (`:confirmed = BookingStatus.CONFIRMED.name()`, `:fallbackCcy = "EUR"`); map to `OnlineTakings`;
  add `booking/api/DailyTakings` port + `@NamedInterface("api")` package-info; wire a package-private adapter.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*JdbcBookingsDailyTakingsIT*"` → PASS.
- [ ] **Step 4b: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS (new `api/` package accepted).
- [ ] **Step 5: Generalization-audit pass** — search other per-`(venue,date)` reads; decision recorded below.
- [ ] **Step 6: Commit** — `git commit -m "Add booking gross-online-takings api port (#171)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — `payout`: `Commission` + owner-asserted takings read + endpoint

**Files:** Create `payout/domain/Commission.java`, `payout/application/ViewDailyTakings.java`,
`DailyTakingsView.java`, `DailyTakingsService.java`, `payout/adapter/in/VenueTakingsController.java`,
`TakingsResponse.java` · Modify `payout/domain/PayoutLedgerEntry.java`, `payout/package-info.java` ·
Test `CommissionTest`, `DailyTakingsServiceTest`, `VenueTakingsControllerTest`, extend `CrossVenueDenialIT`

- [ ] **Step 1: Write the failing tests** — `CommissionTest.splitsWithFloorDiv` (11000/1500 → 1650/9350);
  `DailyTakingsServiceTest` with fake `DailyTakings`/`VenueRates`/`VenueOwnership`
  (`appliesVenueCommissionOnceOnAggregate`, `emptyDayYieldsZerosInEur`, `nonOwnerThrowsNotVenueOwner`);
  `VenueTakingsControllerTest.defaultsToTiraneToday` (fixed `Clock`); add
  `CrossVenueDenialIT.takingsReadByNonOwnerIs403` + `/takings` in `ownerReadsAreNotForbidden`.
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*CommissionTest*" --tests "*DailyTakingsServiceTest*" --tests "*VenueTakingsControllerTest*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — extract `Commission.split` and refactor
  `PayoutLedgerEntry.accrual()/reversalOf()` to it (behavior unchanged); `DailyTakingsService`:
  `assertOwns(operator, new VenueRef(venueId.value()))` **first**, then `booking.api.DailyTakings`
  → `VenueRates.commissionBps` (default 0 if absent) → `Commission.split`; controller maps to
  `TakingsResponse` (`MoneyView` per gross/net), date param defaulting to today Europe/Tirane;
  add `"booking::api"` to `payout.allowedDependencies`.
- [ ] **Step 4: Run them, verify they pass** — the four test classes → PASS.
- [ ] **Step 4b: Structural + regression net** — `./gradlew test --tests "*ModularityTests*" --tests "*CrossVenueDenialIT*" --tests "*PayoutLedger*"` → PASS (accrual unchanged, ledger green).
- [ ] **Step 5: Generalization-audit pass** — confirm `PayoutLedgerEntry` is the only other commission-math site; both now route through `Commission.split`.
- [ ] **Step 6: Commit** — `git commit -m "Add owner-asserted daily takings read + endpoint (#171)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — FE: stats-strip component + service + `MoneyView`→`shared`

**Files:** Modify `shared/money.ts`(+`money.model.ts`), `venue/`/`staff/` imports,
`operator/operator-console.service.ts`, `operator/operator-console.html` · Create
`operator/operator-console.model.ts`, `operator/console-stats-strip.ts`(+`.html`), `.spec.ts`, `.contrast.spec.ts`

- [ ] **Step 1: Write the failing spec** — `console-stats-strip.spec.ts`: given a stubbed service
  returning counts + `TakingsView`, the four tiles render `free/total`, booked-online, walk-ins,
  and `formatMoney(gross)` + "`formatMoney(net)` after 15% commission"; empty-day → zeros; assert
  **no** commission/division math in the component. `console-stats-strip.contrast.spec.ts`:
  composite the tile glass over the porcelain worst-case stops (`src/testing/contrast.ts`) → AA.
- [ ] **Step 2: Run, verify fail** — `npm test -- console-stats-strip` → FAIL.
- [ ] **Step 3: Minimal implementation** — promote `MoneyView` to `shared/`; add
  `OperatorConsoleService.dailyTakings` (`GET …/takings`) + `venueDayCounts` (`GET …?date=` map +
  `GET …/bookings?date=`, derive free/total/booked/walk-ins); build the strip (signals, `input()`
  `venueId`, `appCardGlass` tiles) and mount it between `</header>` and `<nav class="oc-tabs">`.
- [ ] **Step 4: Run, verify pass** — `npm test -- console-stats-strip` and `npm run lint` → PASS.
- [ ] **Step 5: Generalization-audit pass** — check other features importing `MoneyView` from `venue/`; repoint all to `shared/`.
- [ ] **Step 6: Commit** — `git commit -m "Add operator console stats strip component (#171)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — FE e2e (mocked) + a11y

**Files:** Modify `frontend/e2e/operator-console.e2e.ts`

- [ ] **Step 1: Write the failing e2e** — extend `mockConsole` with stateful routes for
  `/api/venues/1/takings`, `/api/venues/1/bookings`, and `/api/venues/1?date=`; assert the four
  tiles render expected text after sign-in and persist across a tab switch; run
  `expectNoSeriousAxeViolations` after `getAnimations().finished`.
- [ ] **Step 2: Run, verify fail** — `npm run test:e2e:a11y -- operator-console` → FAIL (tiles absent).
- [ ] **Step 3: Implementation** — none beyond Phase 2; adjust selectors/mocks to green.
- [ ] **Step 4: Run, verify pass** — `npm run test:e2e:a11y -- operator-console` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "Cover console stats strip with mocked e2e + axe (#171)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*JdbcBookingsDailyTakingsIT*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*CommissionTest*" --tests "*DailyTakingsServiceTest*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "*CrossVenueDenialIT*"` → PASS (403 non-owner, 200 owner).
- [ ] **AC-4:** `DailyTakingsServiceTest.emptyDayYieldsZerosInEur` → PASS.
- [ ] **AC-5:** `VenueTakingsControllerTest.defaultsToTiraneToday` → PASS.
- [ ] **AC-6:** `npm run test:e2e:a11y -- operator-console` + `npm test -- console-stats-strip` → PASS.
- [ ] **AC-7:** `console-stats-strip.spec.ts` asserts `formatMoney` output, no local math → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases (`OnlineTakings`, `DailyTakingsView`, `TakingsResponse`, `MoneyView`).
- [ ] **No JPA** introduced (invariant #1) — `JdbcClient`/text-block SQL only.
- [ ] Availability section justified N/A (read-only); no write path added (invariant #2).
- [ ] **Modulith** section filled; `booking::api` is the only new grant; no cross-module `application.*`/`adapter.*` import; `ModularityTests` + placement tests green (invariant #11).
- [ ] **Payment/payout** section filled; money in minor units EUR; ledger untouched; figure documented as indicative (invariants #5, #9).
- [ ] Per-venue authorization in the **application service**, non-owner → 403 pinned (invariant #13).
- [ ] Timezone: "today" in `Europe/Tirane` (invariant #6).
- [ ] No Flyway migration needed (read-only); confirmed no new index required (reuses `booking_venue_id_idx`) (invariant #12 n/a).
- [ ] **Frontend** standards met; `MoneyView` in `shared/`; no cross-feature import; no `as any`.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty or deferred with an issue #.
