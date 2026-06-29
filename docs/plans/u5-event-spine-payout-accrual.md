# U5 — Event spine: BookingConfirmed → payout accrual — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox syntax.
> **Status: PLAN ONLY** (designed during U3; not yet implemented). Issue **#9**, blocked by #6 (U3, merged-quality).

> **⚠️ Drift recorded by U4 (#8, branch `claude/riviera-sdd-issue-8-szoljn`):** U4 landed first and
> changed two assumptions this plan makes — reconcile before implementing U5:
> 1. **U4 introduced the first cross-module event seam** (`payment` → `booking`:
>    `PaymentConfirmed`/`PaymentCanceled`) **and** — after the PR #53 review — converted it to an
>    **asynchronous `@ApplicationModuleListener`**, so **U4 already brought the Event Publication
>    Registry**: `V8__event_publication_registry.sql` (the shipped Modulith 2.1 **v2** Postgres schema:
>    `event_publication` + `event_publication_archive`), with
>    `spring.modulith.events.completion-mode=archive` and
>    `republish-outstanding-events-on-restart=true` in `application.properties`. **U5 therefore does
>    NOT add the registry — Phase 0 is already done.** U5's remaining migration (the payout ledger) is
>    **V9** (U4 took V7 = payment/webhook and V8 = registry). The `@ApplicationModuleListener` +
>    `Scenario`/`@EnableScenarios` test pattern is now established in U4 (`PaymentEventListener`,
>    `PaymentEventListenerIT`) — reuse it.
> 2. **The confirmation point moved.** In U3 the booking was confirmed inside
>    `CreateBookingService.create`; after U4 it is confirmed in
>    `booking.infrastructure.in.PaymentEventListener.on(PaymentConfirmed)` (and the synchronous stub
>    path still confirms in `CreateBookingService`). So U5's "publish `BookingConfirmed` on confirm"
>    must hook **wherever the booking actually transitions to CONFIRMED** — i.e. a single internal
>    confirm seam used by both paths — not only `CreateBookingService`. Plan Phase 1 should be
>    re-pointed accordingly.

**Goal:** On booking confirmation, `booking` publishes a `BookingConfirmed` domain event
(id-based payload); the `payout` module consumes it via `@ApplicationModuleListener` and accrues
**exactly one** ledger entry (`net = gross − commission`, integer minor units), idempotent under the
Event Publication Registry's at-least-once redelivery. Cross-module collaboration is **events only**.

**Architecture:** This is the first **asynchronous** seam in the codebase. `booking` does not call
`payout` — it announces a fact; `payout` reacts after commit, in its own transaction. The decoupling
is what keeps `payout` off `booking`'s critical path and lets a payout failure not roll back a
confirmed booking. Reliability comes from Spring Modulith's **Event Publication Registry** (already
on the classpath via `spring-modulith-starter-jdbc`), not a broker.

**Persistence:** JDBC only (invariant #1). New Flyway migrations: the `payout_ledger_entry` table
and the Modulith `event_publication` registry table.

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` (the
spine) + GitHub issue **#9**. Builds on U3 (#6).

**Skills consulted:** `riviera-modulith` (the event seam: `BookingConfirmed` in `booking.api`,
`@ApplicationModuleListener` in `payout.infrastructure.in`, id-based payload, registry, `verify()`),
`riviera-java-conventions` (records, package-private adapters, integer money math, typed ids),
`riviera-stripe-payments` (payout-ledger model: exactly-once accrual, EUR net + venue payout
currency, **no Connect**), `postgres` (the ledger table + the registry migration + the idempotency
constraint), `codebase-design` (the `venue.api` commission seam vs the payout port).

**Branch:** `feature/u5-event-spine` (off `main` after U3 merges).

---

## Issue-intake grill outcome (drift vs #9, recorded before planning)

- **#9 AC "availability transitions to BOOKED_ONLINE on the event" is superseded by U3.** U3's
  synchronous `AvailabilityClaim.claim(...)` already writes `BOOKED_ONLINE` at booking time (the row
  *is* the reservation, invariant #2). Re-marking it from an async listener would be redundant and
  racy. **U5 therefore does NOT add an availability listener**; the event's availability-transition
  role only becomes real at **U4**, when async Stripe introduces a held→confirmed gap. → Recommend
  updating #9's wording. (See Open questions.)
- **Net therefore narrows U5 to:** publish `BookingConfirmed` + accrue payout. That is still the full
  "events only, exactly-once" lesson; it just doesn't double-write availability.

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a booking is confirmed, when the create transaction commits, then a
  `BookingConfirmed` is published carrying **ids + immutable value only** (`BookingId, VenueId, SetId,
  LocalDate, long amountMinor, String currency`) — no aggregates, no mutable fields. *Pinned by:*
  `BookingEventIT.publishesBookingConfirmed` (`AssertablePublishedEvents`).
- [ ] **AC-2:** Given a `BookingConfirmed`, when the `payout` listener runs, then exactly one
  `ACCRUAL` ledger entry exists for that booking with `net = gross − commission`. *Pinned by:*
  `PayoutAccrualIT.accruesOnceOnConfirmation`.
- [ ] **AC-3:** Given the same `BookingConfirmed` is delivered twice (registry redelivery / crash
  recovery), then still exactly one `ACCRUAL` entry exists (no double-accrual, invariant #9).
  *Pinned by:* `PayoutAccrualIT.redeliveryIsIdempotent`.
- [ ] **AC-4:** `net`/`commission` are exact integer minor units; `commission = floor(gross × bps ÷
  10000)` with the bps read from the **venue**; `net = gross − commission`. *Pinned by:*
  `CommissionMathTest`.
- [ ] **AC-5:** No cross-module internal imports — `payout` depends only on `booking::api` (the event)
  and `venue::api` (commission); `ApplicationModules.verify()` passes. *Pinned by:* `ModularityTests`.
- [ ] **AC-6:** The async flow completes end-to-end against real Postgres (event persisted by the
  registry, listener accrues, publication marked complete). *Pinned by:* `PayoutSpineScenarioIT`
  (`Scenario` DSL + `@EnableScenarios`).
- [ ] **AC-7:** CI green; `ModularityTests` + `JdbcOnlyArchitectureTests` still pass.

## Non-goals

- **Availability listener / re-marking** — already done by the U3 claim (see grill outcome).
- **Reversal on cancellation/refund** — U6 (`BookingCancelled` → reverse the accrual) / U10.
- **The held→confirmed availability state** and webhook-driven confirmation — U4.
- **Weekly BKT batch report** and the payout admin views — U9.
- **`BookingCancelled`, notifications/email** — later slices.
- Payout currency conversion (EUR→ALL) — out-of-app at BKT time (provisional).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Double-accrual on registry redelivery / crash recovery | med | high | `UNIQUE(booking_id, entry_type)` + accrue via `INSERT … ON CONFLICT DO NOTHING`; idempotency IT (AC-3) | tbd | open |
| R-2 | Event carries a mutable/foreign field → coupling + stale data | low | med | Payload is ids + immutable booking facts (gross amount fixed at confirmation); commission re-loaded from `venue::api` (it's mutable config) | tbd | open |
| R-3 | Listener failure silently loses the accrual | low | high | Registry persists the publication; incomplete ones re-submit on restart (at-least-once). Listener idempotent so re-run is safe | tbd | open |
| R-4 | `event_publication` table grows unbounded | med | low | `spring.modulith.events.completion-mode = ARCHIVE` (or `DELETE`); migration creates the table (no auto-DDL) | tbd | open |
| R-5 | Money rounding wrong (float / wrong direction) | low | high | Integer-only `floorDiv(gross*bps, 10000)`; rounding direction written down + tested (AC-4) | tbd | open |
| R-6 | `payout` reaches into `booking`/`venue` internals | low | med | Only `booking::api` (event) + `venue::api` (commission); `ModularityTests` gate | tbd | open |

## Open questions / Assumptions

- **Assumption:** `BookingConfirmed` carries `amountMinor`+`currency` as immutable value data (the
  gross is fixed at confirmation), so `payout` need not read it back; **commission rate is re-loaded
  from `venue::api`** (mutable venue config, not baked into the event). — *Owner:* tbd
- **Assumption:** Commission rounds **down** — `commission = floorDiv(gross × commissionBps, 10000)`,
  `net = gross − commission` (platform commission truncated to the cent; venue keeps the remainder).
  Written here because division happens (invariant #5). — *Owner:* tbd · *Confirm at plan-accept*
- **Assumption:** Ledger `net` is recorded in **EUR** (collection currency); the venue's payout
  currency/conversion is out-of-app (provisional). — *Owner:* tbd
- **Open question (drift):** #9's "availability transitions to BOOKED_ONLINE on the event" is
  superseded by U3's claim. Update the issue wording, or keep it and reframe as "no-op in U5,
  activates at U4." — *Owner:* tbd · *Resolves by:* issue update before implement

## Availability & concurrency (invariant #2)

- **Write paths to `availability` in scope:** **none.** U3's synchronous claim is the sole writer;
  U5 adds no availability write (see grill outcome). The exactly-once concern moves to the **payout
  ledger**: the unique `(booking_id, entry_type)` constraint + `INSERT … ON CONFLICT DO NOTHING` is
  the payout analogue of the availability double-booking guard.
- **Pinning test:** `PayoutAccrualIT.redeliveryIsIdempotent` — two deliveries ⇒ one ledger row.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | publishes `BookingConfirmed`; adds `api.BookingId` + the event record |
| M-2 | `payout` | **new** | `PayoutLedgerEntry` | consumes the event; owns the accrual ledger |
| M-3 | `venue` | existing | `Venue` | exposes commission rate via `api/` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port / type | Consumers |
|---|---|---|---|
| NI-1 | `booking.api` | `BookingId` (record) + `BookingConfirmed` (event record) | `payout` (listener) |
| NI-2 | `venue.api` | `VenueCatalog#commissionBps(VenueId)` → `OptionalInt` (**new**) | `payout` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ BookingId, VenueId, SetId, LocalDate, long amountMinor, String currency }` | `payout` (`@ApplicationModuleListener`) | async `AFTER_COMMIT`, own tx | `BookingEventIT`, `PayoutSpineScenarioIT` |

`payout`'s `package-info` (recommended deny-by-default): `allowedDependencies = { "booking::api",
"venue::api" }`.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only, no Connect. U5 records what the platform **owes** the venue per confirmed
  booking; settlement is the manual BKT batch (U9). No Stripe call here.
- **Accrual:** one `ACCRUAL` entry per booking, `net = gross − commission`, **exactly once**
  (idempotent on redelivery). Reversals are U6/U10.
- **Idempotency:** `UNIQUE(booking_id, entry_type)` + `INSERT … ON CONFLICT DO NOTHING`; the listener
  is safe to re-run under registry redelivery.
- **Money:** integer minor units, EUR; `commission = floorDiv(gross × bps, 10000)`.
- **Pinning tests:** `PayoutAccrualIT`, `CommissionMathTest`, `PayoutSpineScenarioIT`.

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no API shape change` (no new REST endpoint; payout views are U9).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Registry migration + completion-mode config | | |
| 1 — `booking.api`: BookingId + BookingConfirmed; publish on confirm | | |
| 2 — `venue.api`: commissionBps(VenueId) | | |
| 3 — `payout`: ledger table + aggregate + accrual port/adapter | | |
| 4 — `payout`: @ApplicationModuleListener + idempotency + Scenario IT | | |
| 5 — verify + PR + review gate | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- ~~`V6__event_publication.sql` — Modulith registry table~~ **DONE in U4 (`V8__event_publication_registry.sql`); not part of U5.**
- `resources/db/migration/V9__payout_ledger.sql` — `payout_ledger_entry` + `UNIQUE(booking_id, entry_type)`. (V7=payment, V8=registry are taken by U4.)
- `booking/api/{BookingId,BookingConfirmed}.java` + `booking/api/package-info.java` (`@NamedInterface("api")`).
- `booking/application/CreateBookingService.java` — inject `ApplicationEventPublisher`; publish after `confirm`.
- `venue/api/VenueCatalog.java` (+`commissionBps`) · `venue/infrastructure/out/JdbcVenueCatalog.java`.
- `payout/api/` (if a query port is later needed — not in U5), `payout/domain/PayoutLedgerEntry.java`,
  `payout/domain/EntryType.java`, `payout/application/out/PayoutLedger.java` (accrual port),
  `payout/application/Commission.java` (the math), `payout/infrastructure/out/JdbcPayoutLedger.java`,
  `payout/infrastructure/in/BookingConfirmedPayoutListener.java`, `payout/package-info.java`.
- `application.properties` — `spring.modulith.events.completion-mode=ARCHIVE`.

---

## Phase 0 — Registry migration + completion mode — ✅ ALREADY DONE IN U4

**Done by U4** (PR #53): `V8__event_publication_registry.sql` (Modulith v2 Postgres schema —
`event_publication` + `event_publication_archive`), `completion-mode=archive` +
`republish-outstanding-events-on-restart=true`, and `EventRegistryMigrationIT`. **U5 skips this
phase** — the registry is on the classpath and migrated. Original U5 text retained below for context.

**Files (historical):** `V6__event_publication.sql`, `application.properties`; Test `EventRegistryMigrationIT`.

- [ ] **Step 1: failing test** — IT asserts the `event_publication` table exists (Testcontainers).
- [ ] **Step 3: migration** — create the Modulith JDBC registry table (columns per
  `spring-modulith-starter-jdbc` for Postgres: `id UUID`, `listener_id`, `event_type`,
  `serialized_event`, `publication_date`, `completion_date`). Set
  `spring.modulith.events.completion-mode=ARCHIVE`.
- [ ] **Step 6: commit** `[U5] Flyway: event publication registry (#9)`.

> Note: confirm the exact registry DDL against the Modulith 2.1 JDBC schema (it ships a reference
> schema per database) rather than hand-rolling columns.

## Phase 1 — Publish `BookingConfirmed`

**Files:** `booking/api/{BookingId,BookingConfirmed,package-info}.java`, `CreateBookingService`;
Test `BookingEventIT`.

- [ ] **Step 1: failing test** `BookingEventIT.publishesBookingConfirmed` — confirming a booking
  publishes one `BookingConfirmed` whose `bookingId`/`setId`/`amountMinor` match.
- [ ] **Step 3: implement**

```java
// booking.api  (@NamedInterface("api"))
public record BookingId(long value) {}

public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
                               LocalDate bookingDate, long amountMinor, String currency) {}
```
```java
// CreateBookingService.create(...), after bookings.confirm(inserted.id(), now):
publisher.publishEvent(new BookingConfirmed(new BookingId(inserted.id()), set.venueId(),
        set.setId(), command.bookingDate(), set.price().minorUnits(), set.price().currency()));
```
- [ ] **Step 4:** `ModularityTests` still green (new `booking.api` types). **Step 6** commit.

## Phase 2 — `venue.api` commission lookup

- [ ] `VenueCatalog#commissionBps(VenueId) → OptionalInt`; `JdbcVenueCatalog` reads `commission_bps`.
- [ ] Test: seeded Miramar returns `1500`. Commit `[U5] venue.api: commissionBps (#9)`.

## Phase 3 — payout ledger (table + aggregate + accrual port)

**Files:** `V9__payout_ledger.sql`, `payout/domain/{PayoutLedgerEntry,EntryType}.java`,
`payout/application/out/PayoutLedger.java`, `payout/application/Commission.java`,
`payout/infrastructure/out/JdbcPayoutLedger.java`; Tests `CommissionMathTest`, `PayoutLedgerIT`.

```sql
-- V7: append-only, auditable (invariant #9). Idempotency = UNIQUE(booking_id, entry_type).
CREATE TABLE payout_ledger_entry (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id      BIGINT      NOT NULL,
    booking_id    BIGINT      NOT NULL,
    entry_type    TEXT        NOT NULL,                  -- ACCRUAL | REVERSAL (REVERSAL in U6)
    gross_minor   BIGINT      NOT NULL,
    commission_minor BIGINT   NOT NULL,
    net_minor     BIGINT      NOT NULL,
    currency      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payout_entry_type_check CHECK (entry_type IN ('ACCRUAL', 'REVERSAL')),
    CONSTRAINT payout_amounts_check    CHECK (gross_minor >= 0 AND commission_minor >= 0 AND net_minor >= 0),
    CONSTRAINT payout_once_per_booking UNIQUE (booking_id, entry_type)   -- exactly-once accrual
);
CREATE INDEX payout_ledger_venue_idx ON payout_ledger_entry (venue_id);
```
```java
// payout.application.Commission — integer-only, rounding written down (invariant #5)
static long commissionMinor(long grossMinor, int commissionBps) {
    return Math.floorDiv(grossMinor * commissionBps, 10_000L);   // truncated down
}
// net = grossMinor - commissionMinor(grossMinor, bps)
```
- [ ] `CommissionMathTest`: e.g. gross 4500, bps 1500 → commission 675, net 3825; boundary/zero cases.
- [ ] Commit `[U5] payout: ledger table + commission math (#9)`.

## Phase 4 — the listener (idempotent accrual) + Scenario IT

**Files:** `payout/infrastructure/in/BookingConfirmedPayoutListener.java`, `payout/package-info.java`;
Tests `PayoutAccrualIT`, `PayoutSpineScenarioIT`.

```java
// payout.infrastructure.in
@Component
class BookingConfirmedPayoutListener {
    private final PayoutLedger ledger;     // payout's own port
    private final VenueCatalog venues;     // venue::api for commission

    @ApplicationModuleListener
    void on(BookingConfirmed e) {
        int bps = venues.commissionBps(e.venueId()).orElseThrow();
        ledger.accrueOnce(e.bookingId(), e.venueId(), e.amountMinor(), bps, e.currency()); // ON CONFLICT DO NOTHING
    }
}
```
- [ ] `PayoutAccrualIT`: confirm a booking → exactly one ACCRUAL with correct net (AC-2); deliver the
  event twice → still one row (AC-3).
- [ ] `PayoutSpineScenarioIT` (`Scenario` + `@EnableScenarios`, `@SpringBootTest`, Testcontainers):
  `stimulate(confirm)` → `andWaitForStateChange(() -> ledger.countFor(bookingId))` → `== 1`.
- [ ] Commit `[U5] payout: BookingConfirmed listener + idempotent accrual (#9)`.

## Phase 5 — verify + PR + review gate

- [ ] `./gradlew test` (incl. `ModularityTests`, `JdbcOnlyArchitectureTests`) green.
- [ ] Update issue #9 wording re: availability (drift). Open PR into `main` referencing #9.
- [ ] **Review gate:** `/code-review origin/main...HEAD` + `riviera-review-overlay` (RV-BE-1 N/A
  availability; focus RV-BE payout exactly-once, RV-PROC-1 skills line incl. `riviera-modulith`).
- [ ] Merge only when CI green + review resolved + ACs verified.

---

## Self-review checklist (before merge)

- [ ] `BookingConfirmed` payload is ids + immutable value only (invariant #11).
- [ ] Accrual exactly-once: `UNIQUE(booking_id, entry_type)` + `ON CONFLICT`; redelivery IT passes (#9).
- [ ] Money integer minor units; commission rounding direction tested (#5).
- [ ] `payout` imports only `booking::api` + `venue::api`; `ModularityTests` green (#11).
- [ ] Registry table via Flyway; completion-mode set (no unbounded growth, #12).
- [ ] No availability re-marking (drift reconciled); no Stripe/Connect (#8).
- [ ] Execution status current; Open Questions resolved or deferred with an issue ref.
