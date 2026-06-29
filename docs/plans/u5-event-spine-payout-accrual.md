# U5 — Event spine: BookingConfirmed → payout accrual — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox syntax.
> **Status: IN PROGRESS** — drift reconciled against current `main` (U4/#8 merged: `c8e0b3a`) at the
> Issue-intake grill gate, 2026-06-29. Issue **#9**. Branch `claude/event-spine-booking-payout-a30v12`.

> **⚠️ Drift recorded by U4 (#8) — RECONCILED 2026-06-29 at the Issue-intake grill gate.** U4 landed
> first and changed assumptions this plan made; each is now folded into the design below:
> 1. **The Event Publication Registry already exists** — U4 shipped it as
>    `V8__event_publication_registry.sql` (Modulith 2.1 **v2** Postgres schema:
>    `event_publication` + `event_publication_archive`) with
>    `spring.modulith.events.completion-mode=archive` and
>    `republish-outstanding-events-on-restart=true` in `application.properties`. **U5 does NOT add
>    the registry — Phase 0 is already done.** U5's only new migration (the payout ledger) is **V9**
>    (V7 = payment/webhook, V8 = registry are taken). The `@ApplicationModuleListener` +
>    `Scenario`/`@EnableScenarios` pattern is established in U4 (`PaymentEventListener`,
>    `PaymentEventListenerIT`) — reuse it verbatim.
> 2. **There are now TWO confirm sites, so publishing from `CreateBookingService` alone is wrong.**
>    The stub path confirms in `CreateBookingService.create` (`bookings.confirm`); the real-Stripe
>    path confirms in `booking.infrastructure.in.PaymentEventListener.on(PaymentConfirmed)`
>    (`bookings.confirmFromPayment`). **Resolution:** introduce a single internal confirm seam —
>    `booking.application.in.ConfirmBooking` (port) + package-private `ConfirmBookingService` — that
>    **both** paths call; it performs the DB transition and publishes `BookingConfirmed`. Because the
>    webhook path holds only a `bookingId`, the confirm `UPDATE` is changed to `RETURNING` the event
>    facts (venue/set/date/amount/currency) so the payload is built atomically with the transition —
>    no second read, no race. (See **Phase 1**, re-pointed.)
> 3. **`venue.api.VenueCatalog` already exists** (U3/#44) as a real port with
>    `findVenueMap`/`poolOf`/`setBookingInfo`. The plan's "new `VenueCatalog`" (NI-2) is stale — U5
>    adds a **method** `commissionBps(VenueId)` to the existing interface, not a new interface. The
>    `commission_bps` column already exists on `venue` (V2, `CHECK BETWEEN 0 AND 10000`).
> 4. **`payout/package-info.java` already exists** with `allowedDependencies = {}`. U5 widens it to
>    `{ "booking::api", "venue::api" }` (deny-by-default tightening per `riviera-modulith`).
> 5. **Cross-module physical FKs are house style** (`booking.venue_id REFERENCES venue(id)`, etc.) —
>    the modulith boundary is enforced in Java, not by avoiding FKs. So `payout_ledger_entry` FKs
>    `booking_id → booking(id)` and `venue_id → venue(id)`, with **no `ON DELETE CASCADE`** (the
>    ledger is append-only/auditable, invariant #9; reversals are rows, not deletes).

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

**Skills consulted:** `riviera-modulith` (the event seam: `BookingConfirmed` in `booking.api`, the
single `ConfirmBooking` confirm port, `@ApplicationModuleListener` in `payout.infrastructure.in`,
id-based payload, registry reuse, `verify()`/`allowedDependencies`), `riviera-java-conventions`
(records, package-private adapters, typed-outcome `Optional<ConfirmedBooking>`, integer money math,
typed ids), `riviera-stripe-payments` (payout-ledger model: exactly-once accrual, EUR net + venue
payout currency, **no Connect**), `postgres` (the V9 ledger table — cross-module FKs no-cascade, the
`UNIQUE(booking_id, entry_type)` idempotency constraint + leftmost-prefix index reasoning),
`riviera-plan-doc` (this doc), `tdd` (red→green per behaviour).

**Branch:** `claude/event-spine-booking-payout-a30v12` (off `main` @ `c8e0b3a`).

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
### Resolved

- **(drift) #9's "availability transitions to BOOKED_ONLINE on the event"** — RESOLVED: the issue
  body was updated 2026-06-29 with the reconciliation (the U3 claim already marks the set; U5 adds no
  availability listener). No further issue edit needed.
- **(drift) single confirm seam vs two confirm sites** — RESOLVED at the grill gate: `ConfirmBooking`
  port + `ConfirmBookingService` publishes from one place both paths call (Phase 1). The confirm
  `UPDATE` `RETURNING`s the payload so the webhook path builds the full event atomically.
- **(drift) `venue.api`/`payout` already scaffolded** — RESOLVED: add a `commissionBps` *method* to the
  existing `VenueCatalog`; widen the existing `payout` `allowedDependencies`. Not new files/interfaces.

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
| NI-1 | `booking.api` | `BookingId` (record) + `BookingConfirmed` (event record) — **new** `api/` package | `payout` (listener) |
| NI-2 | `venue.api` | `VenueCatalog#commissionBps(VenueId)` → `OptionalInt` — **method added to the existing port** | `payout` |
| NI-3 | `booking.application.in` | `ConfirmBooking` — **internal** confirm seam (NOT cross-module `api/`), impl `ConfirmBookingService` publishes `BookingConfirmed` | `CreateBookingService` (stub path) + `PaymentEventListener` (Stripe path) |

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
| 0 — Registry migration + completion-mode config | ✅ done in U4 (V8) | — |
| 1 — `booking.api` event + single `ConfirmBooking` seam; publish on confirm | ✅ | _pending commit_ |
| 2 — `venue.api`: commissionBps(VenueId) | ✅ | _pending commit_ |
| 3 — `payout`: ledger table (V9) + domain + accrual port/adapter | ✅ | _pending commit_ |
| 4 — `payout`: @ApplicationModuleListener + idempotency + Scenario IT | | |
| 5 — verify + review gate | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- ~~`V6__event_publication.sql` — Modulith registry table~~ **DONE in U4 (`V8__event_publication_registry.sql`); not part of U5.**
- ~~`application.properties` completion-mode~~ **DONE in U4 (`completion-mode=archive`); not part of U5.**
- `resources/db/migration/V9__payout_ledger.sql` — `payout_ledger_entry` + cross-module FKs (no cascade)
  + `UNIQUE(booking_id, entry_type)` + `venue_id` index.
- `booking/api/{BookingId,BookingConfirmed,package-info}.java` (`@NamedInterface("api")`).
- `booking/application/in/ConfirmBooking.java` (port) + `booking/application/ConfirmBookingService.java`
  (package-private impl, injects `Bookings` + `ApplicationEventPublisher`, publishes the event).
- `booking/application/out/{Bookings,ConfirmedBooking}.java` — `confirm`/`confirmFromPayment` return the
  confirmed booking's event facts (RETURNING); new `ConfirmedBooking` record.
- `booking/infrastructure/out/JdbcBookings.java` — confirm SQL gains `RETURNING …`.
- `booking/application/CreateBookingService.java` — call `ConfirmBooking.confirm` (stub path) instead of
  `bookings.confirm`.
- `booking/infrastructure/in/PaymentEventListener.java` — call `ConfirmBooking.confirmFromPayment`
  (Stripe path) instead of `bookings.confirmFromPayment`; keep `Bookings` for the cancel path.
- `venue/api/VenueCatalog.java` (+`commissionBps`) · `venue/infrastructure/out/JdbcVenueCatalog.java`.
- `payout/domain/{PayoutLedgerEntry,EntryType}.java` (the `accrual(...)` factory holds the commission math),
  `payout/application/out/PayoutLedger.java` (accrual port), `payout/infrastructure/out/JdbcPayoutLedger.java`,
  `payout/infrastructure/in/BookingConfirmedPayoutListener.java`, `payout/package-info.java` (widen deps).

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

## Phase 1 — Publish `BookingConfirmed` from a single confirm seam (re-pointed for U4)

**Files:** `booking/api/{BookingId,BookingConfirmed,package-info}.java`,
`booking/application/in/ConfirmBooking.java`, `booking/application/ConfirmBookingService.java`,
`booking/application/out/{Bookings,ConfirmedBooking}.java`, `JdbcBookings`, `CreateBookingService`,
`PaymentEventListener`; Tests `BookingEventIT`, plus the existing `JdbcBookingsTransitionIT` /
`PaymentEventListenerIT` adjusted for the new return types.

The seam, not the call site: both confirm paths route through `ConfirmBooking`, which transitions and
publishes. The confirm `UPDATE` `RETURNING`s the event facts so the webhook path (which has only a
`bookingId`) gets a full, atomic payload.

```java
// booking.api  (@NamedInterface("api"))
public record BookingId(long value) {}
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
                               LocalDate bookingDate, long amountMinor, String currency) {}

// booking.application.in (internal inbound port — NOT cross-module api/)
public interface ConfirmBooking {
    void confirm(long bookingId, Instant at);            // strict stub path; throws if not transitioned
    boolean confirmFromPayment(long bookingId, Instant at); // idempotent webhook path; true iff transitioned
}

// booking.application.out — confirm methods now yield the event facts
ConfirmedBooking confirm(long bookingId, Instant at);                 // throws if 0 rows (strict)
Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant at); // empty = idempotent no-op
record ConfirmedBooking(long id, VenueId venueId, SetId setId, LocalDate bookingDate,
                        long amountMinor, String currency) {}

// booking.application.ConfirmBookingService (package-private), publish() shared by both paths:
events.publishEvent(new BookingConfirmed(new BookingId(c.id()), c.venueId(), c.setId(),
        c.bookingDate(), c.amountMinor(), c.currency()));
```
- [ ] **Step 1: failing test** `BookingEventIT.publishesBookingConfirmed` (`@ApplicationModuleTest` +
  `AssertablePublishedEvents`) — confirming a booking publishes exactly one `BookingConfirmed` whose
  `bookingId`/`venueId`/`setId`/`amountMinor`/`currency` match the booking.
- [ ] **Step 3: implement** the event records, the `ConfirmBooking` seam, the `RETURNING` SQL; re-point
  `CreateBookingService` (stub path) and `PaymentEventListener` (Stripe path) through it.
- [ ] **Step 4:** `ModularityTests` green (new `booking.api` types); `PaymentEventListenerIT` /
  `JdbcBookingsTransitionIT` green with the new return types. **Step 6** commit.

## Phase 2 — `venue.api` commission lookup

- [ ] `VenueCatalog#commissionBps(VenueId) → OptionalInt`; `JdbcVenueCatalog` reads `commission_bps`.
- [ ] Test: seeded Miramar returns `1500`. Commit `[U5] venue.api: commissionBps (#9)`.

## Phase 3 — payout ledger (table + aggregate + accrual port)

**Files:** `V9__payout_ledger.sql`, `payout/domain/{PayoutLedgerEntry,EntryType}.java`,
`payout/application/out/PayoutLedger.java`, `payout/infrastructure/out/JdbcPayoutLedger.java`;
Tests `CommissionMathTest`, `PayoutLedgerIT`.

```sql
-- V9: append-only, auditable (invariant #9). Idempotency = UNIQUE(booking_id, entry_type).
-- Cross-module FKs match house style (booking.venue_id REFERENCES venue(id)); NO cascade — a
-- ledger entry is permanent audit (reversals are rows, U6), so a booking/venue can't be hard-deleted
-- out from under it.
CREATE TABLE payout_ledger_entry (
    id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id         BIGINT      NOT NULL REFERENCES venue (id),
    booking_id       BIGINT      NOT NULL REFERENCES booking (id),
    entry_type       TEXT        NOT NULL,                  -- ACCRUAL | REVERSAL (REVERSAL in U6)
    gross_minor      BIGINT      NOT NULL,
    commission_minor BIGINT      NOT NULL,
    net_minor        BIGINT      NOT NULL,
    currency         TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payout_entry_type_check CHECK (entry_type IN ('ACCRUAL', 'REVERSAL')),
    CONSTRAINT payout_amounts_check    CHECK (gross_minor >= 0 AND commission_minor >= 0 AND net_minor >= 0),
    CONSTRAINT payout_net_check        CHECK (net_minor = gross_minor - commission_minor),
    CONSTRAINT payout_once_per_booking UNIQUE (booking_id, entry_type)   -- exactly-once accrual
);
-- booking_id FK lookups ride the UNIQUE(booking_id, entry_type) index's leftmost prefix; only
-- venue_id needs its own index (the per-venue BKT batch query, U9).
CREATE INDEX payout_ledger_venue_idx ON payout_ledger_entry (venue_id);
```
```java
// payout.domain.PayoutLedgerEntry.accrual(...) — integer-only, rounding written down (invariant #5)
long commission = Math.floorDiv(grossMinor * commissionBps, 10_000L);  // truncated DOWN
// net = grossMinor - commission  (venue keeps the sub-cent remainder)
```
- [ ] `CommissionMathTest` (pure, no Spring): gross 4500, bps 1500 → commission 675, net 3825;
  boundary/zero (bps 0 → commission 0; bps 10000 → net 0); rounding-down case.
- [ ] `PayoutLedgerIT`: `accrue` inserts one row; a second `accrue` for the same `(booking_id, ACCRUAL)`
  is a no-op (ON CONFLICT DO NOTHING). Commit `[U5] payout: ledger table + accrual port (#9)`.

## Phase 4 — the listener (idempotent accrual) + Scenario IT

**Files:** `payout/infrastructure/in/BookingConfirmedPayoutListener.java`, `payout/package-info.java`;
Tests `PayoutAccrualIT`, `PayoutSpineScenarioIT`.

```java
// payout.infrastructure.in
@Component
class BookingConfirmedPayoutListener {
    private final PayoutLedger ledger;     // payout's own out-port
    private final VenueCatalog venues;     // venue::api for the (mutable) commission rate

    @ApplicationModuleListener
    void on(BookingConfirmed e) {
        int bps = venues.commissionBps(e.venueId())
            .orElseThrow(() -> new IllegalStateException("no commission rate for venue " + e.venueId().value()));
        ledger.accrue(PayoutLedgerEntry.accrual(
            e.venueId(), e.bookingId().value(), e.amountMinor(), bps, e.currency())); // ON CONFLICT DO NOTHING
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
