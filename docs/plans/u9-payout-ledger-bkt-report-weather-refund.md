# U9 — Payout ledger + weekly BKT report + admin weather refund — Implementation Plan

> Engine: `implement` + `tdd`. Steps use checkbox (`- [ ]`) tracking. Invariant numbers
> refer to `CLAUDE.md`.

**Goal:** Expose the per-venue payout ledger (entries + running net owed) and a persisted
weekly BKT batch report, and add an admin-triggered full-refund for a venue+date with reason
`WEATHER` — all money exact-integer minor units.

**Architecture:** The single most significant decision is that the **weather refund reuses the
existing U6 cancellation spine** rather than moving money directly in `payout`/`payment`: an
admin use case in `booking` force-cancels every `CONFIRMED` booking for a venue+date with a
**full** refund (regardless of cutoff) and reason `WEATHER`, and the existing async listeners do
the rest (`availability` frees the set — invariant #2; `BookingRefundListener` refunds via
`payment::api`; `BookingCancelledPayoutListener` reverses the accrual — invariant #9). The
ledger read and the **persisted `PayoutBatch`** (status `DRAFT/REPORTED/SETTLED`, keyed by
`venue + period_key`) are new internal surfaces in `payout`.

**Persistence:** JDBC only (invariant #1). New Flyway migrations: **V14** (`booking.cancel_reason`
+ `payout_ledger_entry.reason`), **V15** (`payout_ledger_entry.period_key` + new `payout_batch`
table). No JPA.

**Source of intent:** GitHub issue **#12** (`[U9]`); locked spine in
`docs/architecture/domain-model.md` §3.5 / §5 and `CLAUDE.md` invariants #5/#9/#10; ADR-0005
(proportional reversal). Grill reconciliation: issue #12 comment (2026-06-30).

**Skills consulted (Skill-routing gate):**
- `riviera-plan-doc` — this plan's structure + per-phase discipline.
- `riviera-modulith` — kept the weather refund in `booking` (reuses the spine, no new cross-module
  port); `PayoutBatch` aggregate + admin controller stay internal to `payout`; reason enum lives in
  `booking.api` (carried on `BookingCancelled`), consumed by `payout` (already depends on `booking::api`).
- `riviera-java-conventions` — records for the new value types/ids, typed-outcome use cases,
  package-private adapters, `JdbcClient` + text-block SQL, ISO-week computed in `Europe/Tirane`.
- `riviera-stripe-payments` — confirmed collect-only/no-Connect: the weather refund is a server-computed
  full refund through the existing idempotency-keyed `RefundPort`; the reversal mirrors it (ADR-0005);
  no new Stripe primitive.
- `postgres` — `TEXT`+`CHECK` reason/status/period_key (no native enum); `BIGINT` minor units;
  index the new FK/group columns; `payout_batch` `UNIQUE(venue_id, period_key)`; no `ON DELETE CASCADE`
  (ledger is append-only/auditable); `period_key` set by the app (timezone-aware ISO week is not IMMUTABLE,
  so not a generated column) and backfilled in the migration.
- `domain-modeling` — `RefundReason` / `Payout batch` vocabulary already in `CONTEXT.md`; no new ADR
  (the choices here are either already locked by ADR-0005/domain-model or low-cost/reversible).

**Branch:** `claude/riviera-sdd-issue-12-s0mvn5` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (ledger read):** Given a venue with one `ACCRUAL` (net 8500) and one later `REVERSAL`
  (net 4250) for it, when the ledger is read for that venue, then it returns both entries in order
  with a running/total **net owed of 4250** (minor units). *Pinned by:* `PayoutLedgerViewIT.runningNetOwed`
- [ ] **AC-2 (weekly report groups by venue/period):** Given accrual/reversal entries for two venues in
  ISO week `2026-W27` (Europe/Tirane), when a batch report is generated for that period, then exactly one
  `PayoutBatch` per venue exists with `total_net_minor = Σ(accrual.net) − Σ(reversal.net)` for that
  venue+period and status `DRAFT`. *Pinned by:* `PayoutBatchGenerationIT.groupsByVenueAndPeriod`
- [ ] **AC-3 (report idempotent + lifecycle):** Given a generated `DRAFT` batch, when generation runs
  again for the same period, then no duplicate batch is created and the total is refreshed; and when the
  admin marks it `REPORTED` then `SETTLED`, the status transitions are persisted and illegal transitions
  are rejected. *Pinned by:* `PayoutBatchGenerationIT.regenerateIsIdempotent`, `PayoutBatchLifecycleTest`
- [ ] **AC-4 (weather refund = full, all bookings, reason WEATHER):** Given two `CONFIRMED` bookings for
  venue V on date D (one before cutoff, one after), when the admin triggers a weather refund for `(V, D)`,
  then **both** transition to `CANCELLED` with `refund_minor = amount_minor` (full, ignoring cutoff) and
  `cancel_reason = WEATHER`, each set's `(set, D)` is freed, and one `BookingCancelled{reason=WEATHER}` is
  published per booking. *Pinned by:* `WeatherRefundServiceIT.fullRefundRegardlessOfCutoff`
- [ ] **AC-5 (weather reversal recorded with reason):** Given AC-4, when the payout listener processes each
  `BookingCancelled{reason=WEATHER}`, then a `REVERSAL` mirroring the full accrual is posted with
  `reason = WEATHER`. *Pinned by:* `PayoutReversalIT.weatherReversalCarriesWeatherReason`
- [ ] **AC-6 (tourist cancel keeps POLICY reason):** Given a tourist cancellation (U6), when it completes,
  then `booking.cancel_reason = POLICY` and any reversal's `reason = POLICY` — the new column does not change
  U6 behaviour. *Pinned by:* `CancelBookingServiceTest.recordsPolicyReason`
- [ ] **AC-7 (money exact-integer):** All accrual/reversal/batch arithmetic is in `long` minor units;
  `net = gross − commission` holds at the DB CHECK and in the domain; no float anywhere.
  *Pinned by:* `ReversalMathTest` (existing), `PayoutBatchTotalTest`, V14/V15 `*MigrationIT`
- [ ] **AC-8 (security):** Given an unauthenticated caller, when it hits any new admin endpoint
  (ledger read, batch generate/list/patch, weather-refund POST), then it is `401`; with the `OPERATOR`
  credential it is authorized. *Pinned by:* `AdminPayoutSecurityIT`, `WeatherRefundSecurityIT`
- [ ] **AC-9 (modularity holds):** `ApplicationModules.verify()` stays green after all changes.
  *Pinned by:* `ModularityTests.verifiesModularStructure`
- [ ] **AC-10 (CI green).**

## Non-goals

- **No Stripe Connect / automated transfer** — settlement stays manual BKT (invariant #8/#9; ADR-0002).
  `SETTLED` is an admin-set status, not a payout pipeline.
- **No weather-forecast automation** — the trigger is a manual admin action (invariant #10, design §13).
- **No new availability write path** — weather refund frees sets through the *existing*
  `AvailabilityClaim.release` already used by cancellation; no new claim/mark logic.
- **No venue-name enrichment in the report** — batches/ledger return `venueId`; adding a venue-name
  lookup would expand `venue::api` and is deferred (see Open questions).
- **No `CONFLICT` reason flow** — the enum/CHECK admits `CONFLICT` (closed value set, like `BookingStatus`)
  but only `POLICY` (tourist) and `WEATHER` (admin) are exercised in v1.
- **No `PARTIALLY_REFUNDED` interaction** — weather refund only acts on `CONFIRMED` bookings; already
  `CANCELLED`/refunded bookings are skipped (the guarded update is a no-op for them).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Weather refund double-refunds a booking already cancelled (or re-run by admin) | med | high | Reuse the **guarded** `cancelConfirmed` (`WHERE status='CONFIRMED'`, 0-row = no-op) per booking; refund itself is idempotency-keyed (invariant #8); reversal `UNIQUE(booking_id, REVERSAL)`. Test: re-run weather refund → no second refund/reversal | agent | open |
| R-2 | A set is sold to a walk-in after a weather refund frees it but beach is closed | low | med | Out of scope decision: freeing the set is correct per invariant #2 (the day is refunded; staff stop selling). Documented; no auto re-block in v1 | agent | open |
| R-3 | Period boundary wrong (week/zone) so an entry lands in the wrong batch | med | high | `period_key` = ISO week computed in `Europe/Tirane` from the entry's own `created_at` (invariant #6), set by the app at insert and backfilled in V15 with `to_char(created_at AT TIME ZONE 'Europe/Tirane', 'IYYY"-W"IW')`. Test boundary instants (Sun 23:59 vs Mon 00:00 Tirane) | agent | open |
| R-4 | Reversal posted in a later week than its accrual skews "owed" per period | low | med | **Intended**: a reversal reduces the week it is *created* in (what's owed *now*). Documented; net owed across all periods still equals Σnet | agent | open |
| R-5 | Batch total drifts from the ledger after late entries | med | med | Generation is idempotent upsert keyed `(venue_id, period_key)`; re-running recomputes the total from the ledger. Only `DRAFT` is recomputed; `REPORTED/SETTLED` are frozen (log a warning if stale) | agent | open |
| R-6 | Money rounding inconsistency between accrual and weather reversal | low | high | Full refund ⇒ `R = G` ⇒ `reversalOf` reverses the whole accrual exactly (`reversal_commission = floorDiv(C×G, G) = C`); covered by `ReversalMathTest` | agent | open |
| R-7 | New `/api/admin/**` paths accidentally public (first-match-wins in Spring Security) | med | high | Add explicit `hasRole(OPERATOR)` rules + CSRF-exempt token-less writes; `AdminPayoutSecurityIT` asserts 401 unauthenticated | agent | open |
| R-8 | `allowedDependencies`/boundary break introduced by new admin controller/ports | low | high | Keep everything internal to `payout`; weather refund stays in `booking`; `ModularityTests` run each phase | agent | open |

## Open questions / Assumptions

- **Assumption:** "Weekly" = ISO-8601 week (`IYYY-Www`) in `Europe/Tirane`, keyed off each entry's
  `created_at`. — *Owner:* agent · *Resolves by:* phase 3 (encoded in `PeriodKey`).
- **Assumption:** Admin endpoints reuse the existing `OPERATOR` role (no separate `ADMIN` yet),
  consistent with `SecurityConfig`'s placeholder posture. — *Owner:* agent · *Resolves by:* phase 1/2.
- **Open question:** Should the BKT report include venue **name/payout details** (currency, IBAN) for the
  human transfer? v1 returns `venueId` + net + currency only; enriching needs a `venue::api` addition.
  — *Owner:* ivopogace · *Resolves by:* follow-up issue if wanted (noted in non-goals).
- **Open question:** Should `SETTLED` be reversible / audited (who/when)? v1 stores status only.
  — *Owner:* ivopogace · *Resolves by:* follow-up if a real settlement audit is needed.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** only the **existing** cancellation
  release — the weather refund calls the same `AvailabilityClaim.release(setId, date)` that
  `CancelBookingService` already uses. **No new write path, no new claim logic.**
- **Uniqueness guarantee:** unchanged — `set_availability UNIQUE(set_id, booking_date)` (V4).
- **Concurrency strategy:** per-booking transition uses the existing guarded
  `cancelConfirmed` (`UPDATE … WHERE status='CONFIRMED' RETURNING`), so two concurrent weather refunds
  (or a weather refund racing a tourist cancel) on the same booking → exactly one wins, the other is a
  0-row no-op (no double release/refund). The release is idempotent (frees an already-free row harmlessly).
- **Pool rule (#3) / Cutoff rule (#4):** N/A to the refund direction — the cutoff is **deliberately
  ignored** for weather (full refund regardless, invariant #10). No new booking is created, so the pool
  rule is untouched.
- **Pinning test:** `WeatherRefundConcurrencyIT.concurrentWeatherRefundCancelsEachBookingOnce` — two
  concurrent weather refunds for the same `(venue, date)` cancel/refund/reverse each booking exactly once.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the cancellation lifecycle; weather refund is an admin cancellation with a forced full refund + reason |
| M-2 | `payout` | existing | `PayoutLedgerEntry`, **`PayoutBatch` (new)** | Owns the ledger + the BKT batch report (invariant #9) |
| M-3 | `availability` | existing | `SetAvailability` | Set freed via existing `AvailabilityClaim.release` (no change) |
| M-4 | `payment` | existing | `Payment` | Refund issued via existing `RefundPort` (no change) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port/type | Change | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | `RefundReason` enum (`POLICY`, `WEATHER`, `CONFLICT`) | **new** value type, carried on `BookingCancelled` | `payout` (reversal reason) |
| NI-2 | `booking.api` | `BookingCancelled` | **add** `RefundReason reason` field (id-based payload stays immutable) | `payout` |

> No new cross-module **port** is needed: weather refund reuses `availability::api` + `payment::api`
> exactly as U6 does; the ledger read + `PayoutBatch` are **internal** to `payout`
> (`application.in/out`, `infrastructure.in/out`) — not published.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload change | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` | + `RefundReason reason` (technical/immutable) | `payout` (reversal), `booking` (refund listener) | async `AFTER_COMMIT` | `PayoutWeatherReversalIT`, `BookingRefundListener*` |

**New internal surfaces in `payout`**

- `payout.application.in.ViewPayoutLedger` (port) → `JdbcPayoutLedger` query / new read adapter; returns
  ledger entries + net owed for a venue.
- `payout.application.in.GeneratePayoutReport` / `ViewPayoutBatches` (ports) → batch generation + read.
- `payout.application.out.PayoutBatches` (port) → `JdbcPayoutBatches` adapter.
- `payout.domain.PayoutBatch` (aggregate: lifecycle + total), `payout.domain.BatchStatus` enum,
  `payout.domain.PeriodKey` (ISO-week value object, `Europe/Tirane`).
- `payout.infrastructure.in.AdminPayoutController` (`@RestController`, operator-gated).

**New internal surfaces in `booking`**

- `booking.application.in.RefundForWeather` (port) → `WeatherRefundService` (`@Service`,
  `@Transactional`).
- `booking.application.out.Bookings`: add a read for the confirmed bookings to weather-refund (id +
  amount + currency + set + date) and extend `cancelConfirmed` to stamp the reason.
- `booking.infrastructure.in.AdminWeatherRefundController` (operator-gated POST).

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch (ADR-0002).
- **Confirmation trigger:** unchanged (webhook is source of truth). Weather refund acts only on
  already-`CONFIRMED` bookings.
- **Idempotency:** the weather refund reuses the existing idempotency-keyed `RefundPort.refund` (key
  derived from booking id) → re-running the admin action never double-refunds; reversal exactly-once via
  `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO NOTHING`.
- **Money:** integer minor units, EUR (invariant #5). Weather refund amount = `amount_minor` (full).
- **Refund policy applied (invariant #10):** weather = **full refund regardless of cutoff**, server-computed
  (the admin supplies only `(venueId, date)`; never an amount). Reversal mirrors it (full ⇒ whole accrual,
  ADR-0005).
- **Payout-ledger effect:** accrual unchanged; weather cancellation posts a full `REVERSAL` carrying
  `reason = WEATHER`. The BKT batch nets `Σaccrual.net − Σreversal.net` per venue+period.
- **Pinning tests:** `WeatherRefundServiceIT`, `PayoutWeatherReversalIT`, `PayoutBatchGenerationIT`,
  `ReversalMathTest` (existing), V14/V15 `*MigrationIT`.

## Angular — frontend surfaces touched

N/A — backend-only (`area:backend`, no UI in #12). No e2e (`playwright-cli`) — no user-facing frontend slice.

## FE↔BE contract

New backend endpoints (operator-gated; documented for the eventual admin UI, no client built now):

- `POST /api/venues/{venueId}/weather-refund?date=YYYY-MM-DD` → `200` summary `{ refundedCount, totalRefundedMinor, currency }`.
- `GET  /api/venues/{venueId}/payout-ledger` → `{ venueId, currency, netOwedMinor, entries:[{ type, bookingId, grossMinor, commissionMinor, netMinor, reason, createdAt }] }`.
- `GET  /api/admin/payout-batches?period=IYYY-Www` → `[{ id, venueId, periodKey, totalNetMinor, currency, status }]`.
- `POST /api/admin/payout-batches?period=IYYY-Www` → generate/refresh `DRAFT` batches for the period.
- `PATCH /api/admin/payout-batches/{id}` body `{ status: REPORTED|SETTLED }` → lifecycle transition.

Money on the wire = integer minor units + ISO currency; dates = ISO `LocalDate`; period = ISO week `IYYY-Www`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Cancellation reason through the spine (V14) | ✅ | b7ae0dd |
| 1 — Admin weather refund (booking) | ✅ | 5372a20 |
| 2 — Payout ledger read surface | ✅ | c0961ff |
| 3 — PayoutBatch + weekly BKT report (V15) | ✅ | 9e25c9d |
| Review-gate fixes (warn / PeriodKey / PATCH test) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Phase 0 — reason**
- `platform/src/main/resources/db/migration/V14__cancellation_reason.sql` — new
- `platform/src/main/java/ai/riviera/platform/booking/api/RefundReason.java` — new
- `platform/src/main/java/ai/riviera/platform/booking/api/BookingCancelled.java` — add `reason`
- `booking/.../out/CancelledBooking.java`, `out/Bookings.java`, `infrastructure/out/JdbcBookings.java` — stamp reason
- `booking/.../application/CancelBookingService.java` — publish `reason=POLICY`
- `payout/.../domain/PayoutLedgerEntry.java` (carry reason on reversal), `application/out/PayoutLedger.java`,
  `infrastructure/out/JdbcPayoutLedger.java`, `infrastructure/in/BookingCancelledPayoutListener.java`

**Phase 1 — weather refund**
- `booking/.../application/in/RefundForWeather.java`, `in/WeatherRefundOutcome.java` — new ports/outcome
- `booking/.../application/WeatherRefundService.java` — new
- `booking/.../application/out/Bookings.java` (+ `findConfirmedForWeatherRefund`), `JdbcBookings.java`
- `booking/.../infrastructure/in/AdminWeatherRefundController.java`, `WeatherRefundView.java` — new
- `platform/.../SecurityConfig.java` — gate + CSRF-exempt the new write

**Phase 2 — ledger read**
- `payout/.../application/in/ViewPayoutLedger.java`, `in/VenueLedger.java`, `in/LedgerEntryView.java` — new
- `payout/.../application/out/PayoutLedger.java` (+ `entriesForVenue`), `infrastructure/out/JdbcPayoutLedger.java`
- `payout/.../application/PayoutLedgerQueryService.java`, `infrastructure/in/AdminPayoutController.java` — new
- `SecurityConfig.java` — gate the ledger GET

**Phase 3 — batch/report**
- `platform/src/main/resources/db/migration/V15__payout_batch.sql` — new
- `payout/.../domain/PayoutBatch.java`, `domain/BatchStatus.java`, `domain/PeriodKey.java` — new
- `payout/.../application/in/GeneratePayoutReport.java`, `in/ViewPayoutBatches.java`, `in/BatchView.java`,
  `in/MarkBatchStatus.java` — new
- `payout/.../application/PayoutReportService.java` — new
- `payout/.../application/out/PayoutBatches.java`, `infrastructure/out/JdbcPayoutBatches.java` — new
- `payout/.../infrastructure/out/JdbcPayoutLedger.java` — set `period_key` on accrual/reversal insert
- `payout/.../infrastructure/in/AdminPayoutController.java` — batch endpoints
- `SecurityConfig.java` — gate `/api/admin/payout-batches**`

---

## Phase 0 — Cancellation reason through the spine

**Goal:** Add a persisted refund/cancel reason (`POLICY`/`WEATHER`/`CONFLICT`) carried on
`BookingCancelled` and stored on `booking` + the payout `REVERSAL`, with the existing tourist cancel
recording `POLICY`. Pure groundwork; no behaviour change for U6 beyond the recorded reason.

- [ ] **Step 1 (red):** `CancelBookingServiceTest.recordsPolicyReason` — assert the published
  `BookingCancelled.reason() == POLICY` and `cancelConfirmed` is called with `POLICY`.
- [ ] **Step 2:** run `./gradlew test --tests "*CancelBookingServiceTest*"` → FAIL (no `reason`).
- [ ] **Step 3 (green):**
  - `V14__cancellation_reason.sql`: `ALTER TABLE booking ADD COLUMN cancel_reason TEXT
    CONSTRAINT booking_cancel_reason_check CHECK (cancel_reason IS NULL OR cancel_reason IN
    ('POLICY','WEATHER','CONFLICT'))`; `ALTER TABLE payout_ledger_entry ADD COLUMN reason TEXT
    CONSTRAINT payout_reason_check CHECK (reason IS NULL OR reason IN ('POLICY','WEATHER','CONFLICT'))`
    (reason is set on `REVERSAL` rows; `NULL` on accrual).
  - `RefundReason` enum in `booking.api` (mirrors the CHECK token set, lockstep).
  - `BookingCancelled` gains `RefundReason reason`; `CancelledBooking` unchanged; `cancelConfirmed`
    gains a `RefundReason` param and writes `cancel_reason`; `CancelBookingService` passes `POLICY`.
  - `PayoutLedgerEntry.reversalOf(...)` gains a reason; `PayoutLedger.reverse`/`JdbcPayoutLedger`
    persist `reason`; `BookingCancelledPayoutListener` forwards `event.reason()`.
- [ ] **Step 4:** `./gradlew test --tests "*CancelBookingServiceTest*" --tests "*ReversalMathTest*"` → PASS.
- [ ] **Step 5 (regression):** `./gradlew test --tests "ai.riviera.platform.booking.*" --tests "ai.riviera.platform.payout.*"`.
- [ ] **Step 6:** add `V14MigrationIT`-style coverage in `PayoutMigrationIT`/a booking migration IT for the new columns/CHECK.
- [ ] **Step 7:** commit `[#12] Record refund reason (POLICY/WEATHER/CONFLICT) through the cancel spine (V14)`; update Execution status.

## Phase 1 — Admin weather refund (booking)

**Goal:** An operator-gated `POST /api/venues/{venueId}/weather-refund?date=` that force-cancels every
`CONFIRMED` booking for `(venue, date)` with a **full** refund and `reason=WEATHER`, reusing the spine.

- [ ] **Step 1 (red):** `WeatherRefundServiceIT.fullRefundRegardlessOfCutoff` — seed two confirmed
  bookings (before/after cutoff), trigger weather refund, assert both `CANCELLED`, `refund_minor =
  amount_minor`, `cancel_reason = WEATHER`, both sets freed, two `BookingCancelled{WEATHER}` published.
- [ ] **Step 2:** `./gradlew test --tests "*WeatherRefundServiceIT*"` → FAIL.
- [ ] **Step 3 (green):**
  - `Bookings.findConfirmedForWeatherRefund(VenueId, LocalDate)` → rows `(id, setId, bookingDate,
    amountMinor, currency)`; `JdbcBookings` SQL `WHERE venue_id=:v AND booking_date=:d AND status='CONFIRMED'`.
  - `WeatherRefundService` (`@Transactional`): for each, `cancelConfirmed(id, now, amountMinor /*full*/,
    WEATHER)`, `availability.release(setId, date)`, publish `BookingCancelled{…, refundMinor=amountMinor,
    reason=WEATHER}`; return `WeatherRefundOutcome{refundedCount, totalRefundedMinor, currency}`.
  - `RefundForWeather` port + `AdminWeatherRefundController` (date defaults to today Tirane? — **no**,
    weather refund targets a specific declared day; `date` is **required**).
  - `SecurityConfig`: `POST /api/venues/*/weather-refund` → `hasRole(OPERATOR)` (before public venue GET);
    add to CSRF-ignore list (token-less write).
- [ ] **Step 4:** `./gradlew test --tests "*WeatherRefundServiceIT*" --tests "*WeatherRefundSecurityIT*"` → PASS.
- [ ] **Step 5 (generalization):** confirm the per-booking guarded transition handles the
  re-run/idempotency case → add `WeatherRefundServiceIT.rerunRefundsNothingNew` and
  `WeatherRefundConcurrencyIT`.
- [ ] **Step 6:** `PayoutWeatherReversalIT.reversalCarriesWeatherReason` (cross-module via `@ApplicationModuleTest`/Scenario).
- [ ] **Step 7:** commit `[#12] Admin weather refund: full refund for venue+date, reason WEATHER`; update status.

## Phase 2 — Payout ledger read surface

**Goal:** Operator-gated `GET /api/venues/{venueId}/payout-ledger` returning entries + running net owed.

- [ ] **Step 1 (red):** `PayoutLedgerViewIT.runningNetOwed` — seed accrual(net 8500) + reversal(net 4250)
  for venue V; read ledger → entries in `created_at` order + `netOwedMinor == 4250`.
- [ ] **Step 2:** run it → FAIL.
- [ ] **Step 3 (green):** `PayoutLedger.entriesForVenue(VenueId)` (SQL ordered by `created_at, id`);
  `ViewPayoutLedger` port + `PayoutLedgerQueryService` computing `netOwed = Σ(ACCRUAL.net) −
  Σ(REVERSAL.net)`; `AdminPayoutController` GET → `VenueLedger` view; `SecurityConfig` gate the GET
  (`/api/venues/*/payout-ledger` `hasRole(OPERATOR)`, before public venue GET).
- [ ] **Step 4:** `./gradlew test --tests "*PayoutLedgerViewIT*" --tests "*AdminPayoutSecurityIT*"` → PASS.
- [ ] **Step 5 (regression):** `./gradlew test --tests "ai.riviera.platform.payout.*"`.
- [ ] **Step 6:** commit `[#12] Payout ledger read: per-venue entries + running net owed`; update status.

## Phase 3 — PayoutBatch + weekly BKT report

**Goal:** Persist `period_key` per entry and a `PayoutBatch` aggregate (`DRAFT/REPORTED/SETTLED`);
generate/list batches per ISO week and transition status.

- [ ] **Step 1 (red):** `PayoutBatchGenerationIT.groupsByVenueAndPeriod` — seed entries for two venues in
  `2026-W27`; generate → one `DRAFT` batch per venue with the correct `total_net_minor`.
  `PayoutBatchLifecycleTest` for legal/illegal transitions; `PeriodKeyTest` for the Tirane ISO-week boundary.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3 (green):**
  - `V15__payout_batch.sql`: `ALTER TABLE payout_ledger_entry ADD COLUMN period_key TEXT`; backfill
    `UPDATE … SET period_key = to_char(created_at AT TIME ZONE 'Europe/Tirane', 'IYYY"-W"IW')`; then
    `ALTER … SET NOT NULL`; index `(venue_id, period_key)`. New `payout_batch(id, venue_id, period_key,
    total_net_minor, currency, status TEXT CHECK IN ('DRAFT','REPORTED','SETTLED'), created_at,
    updated_at, UNIQUE(venue_id, period_key), FK venue_id)`.
  - `PeriodKey` value object (compute ISO week in `Europe/Tirane`); `JdbcPayoutLedger` sets `period_key`
    on accrual/reversal insert.
  - `PayoutBatch` aggregate + `BatchStatus`; `PayoutBatches` out-port + `JdbcPayoutBatches` (idempotent
    upsert on `(venue_id, period_key)` recomputing total **only when DRAFT**); `GeneratePayoutReport` /
    `ViewPayoutBatches` / `MarkBatchStatus` ports + `PayoutReportService`; `AdminPayoutController` batch
    endpoints; `SecurityConfig` gate `/api/admin/payout-batches**` (+ CSRF-exempt POST/PATCH).
- [ ] **Step 4:** `./gradlew test --tests "*PayoutBatch*" --tests "*PeriodKey*" --tests "*PayoutMigrationIT*"` → PASS.
- [ ] **Step 5 (regression):** `./gradlew test --tests "ai.riviera.platform.payout.*" --tests "*ModularityTests*"`.
- [ ] **Step 6:** commit `[#12] PayoutBatch aggregate + weekly BKT report (period_key, V15)`; update status.

---

## Review gate note (SDD)

Ran the SDD Review gate (`riviera-review-overlay` + `/code-review origin/main...HEAD`, 4 finder
angles). **No Blocker/correctness bugs.** Overlay items pass: JDBC-only, money in minor units,
Europe/Tirane time, invariant #2 (set freed on weather refund), #9 (idempotent ledger/batch), #10
(server-computed full refund), #11 (payout depends only on `booking::api`/`venue::api`; new controllers
internal), #12 (V14/V15 forward migrations, constraints tested). RV-PROC-1 satisfied — *Skills consulted*
covers every touched area.

**Findings resolved through the loop (re-entered at Implement, `tdd`, CI re-run):**
- *generate() missing stale-batch warning* (plan R-5) → `PayoutReportService.warnIfFrozenAndStale` warns
  when a frozen REPORTED/SETTLED batch diverges from the ledger; pinned by
  `PayoutBatchGenerationIT.lifecycleAdvancesAndFreezesReported` (log assertion).
- *PeriodKey accepted non-existent ISO weeks* → validation tightened to weeks 01–53; pinned by
  `PeriodKeyTest.rejectsNonExistentIsoWeeks`.
- *PATCH batch-status path untested for auth* → `AdminPayoutSecurityIT.batchStatusPatchRequiresOperator`.

**Accepted / deferred (documented):** negative per-period `total_net_minor` is intended (signed net,
R-4, nets exactly-once across periods); `currency` single-value is safe under invariant #5 (EUR-only
v1); `generate()` per-venue upsert loop is fine at v1 scale (5–15 venues); the `error()`-helper and
nullable-`toInstant` duplications follow the existing repo convention (repo-wide refactor out of scope);
`mark()` is a forward-only idempotent transition (no row lock needed in v1).

## Sonar gate note (SDD)

SonarCloud PR analysis on #70: **quality gate passed** — 89.2% new-code coverage (≥80%), 0 security
hotspots, 0% duplication. 4 new issues triaged:
- 3× **S1192** (duplicated string literals `"net_minor"`/`"currency"`/`"venue"`) → **fixed** by
  extracting `private static final` constants (`JdbcPayoutLedger`, `JdbcBookings`), matching
  `riviera-java-conventions` §6a. Pure refactor; existing ITs re-run green.
- 1× **S1075** (hardcoded URI on a `SecurityConfig` route-matcher constant) → **accepted**: Spring
  security matcher paths are route patterns, not externalizable config, and the entire existing
  `SecurityConfig` uses the same `private static final String` path constants. Known S1075 false
  positive for security matchers; consistent with the established convention.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-10 each verified by the named test at a recorded commit before the PR is called ready.
- [ ] Full suite green pre-merge: `./gradlew test`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No JPA introduced; `JdbcClient` + SQL only (invariant #1).
- [ ] Availability section honored — only the existing `release` path; concurrency test present (#2).
- [ ] Modulith boundaries: reason enum in `booking.api`; payout batch internal; `ModularityTests` green (#11).
- [ ] Payment/payout: full weather refund server-computed; idempotent; minor units; reversal exactly-once (#5/#8/#9/#10).
- [ ] Timezone: `period_key` + cutoff reasoning in `Europe/Tirane`, stored UTC (#6).
- [ ] Booking codes never logged (#7).
- [ ] Flyway V14/V15 present; CHECK/UNIQUE constraints tested (#12).
- [ ] Execution-status table matches reality; Open Questions empty or deferred with an issue #.
