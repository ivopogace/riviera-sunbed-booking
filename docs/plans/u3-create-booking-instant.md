# U3 — Create Booking (Instant) End-to-End, Payment Stubbed — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` (installed), task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tourist selects an available **online** set for a date and creates a booking
via the **Instant-Book** path — the `booking` module claims `(set, date)` (U2), creates a
booking, a **stub** payment gateway succeeds, the booking becomes `CONFIRMED` with an
unguessable booking code, and the Angular app shows a confirmation with that code. Real
Stripe is U4.

**Architecture:** New `booking` module is the **orchestrator** — it is the only place the
full hexagon (`application.in`/`application.out`) is warranted, because creating a booking
coordinates four other modules through their `api/` ports only (invariant #11):
`venue.api` (set price/pool/cutoff), `availability.api` (the atomic claim — the
double-booking guard, invariant #2), `customer.api` (guest find-or-create), `payment.api`
(the stub checkout). The whole create flow runs in **one Spring transaction** so a failure
after the claim rolls the claim back too; the stub payment is in-process, so this is safe
for U3 (U4 splits confirmation onto the verified webhook).

**Persistence:** JDBC only (invariant #1). New Flyway migration **V5** creates `customer`
and `booking`. The availability table (V4) is unchanged — the claim already writes it.

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
(§Instant Book, §collision Layer 2) + GitHub issue **#6**.

**Skills consulted:** `postgres` (BIGINT-identity PKs; `(set_id, booking_date)` is an
**index not a UNIQUE** on `booking` — uniqueness belongs to `availability`, invariant #2;
`CHECK`+`TEXT` status over enum), `codebase-design` (kept the full hexagon for `booking`
the orchestrator; collapsed hypothetical seams elsewhere; `setBookingInfo` extends the
existing deep `VenueCatalog` rather than a new port), `domain-modeling` (glossary terms
`AWAITING_PAYMENT`/`CONFIRMED`, `GuestContact`), `riviera-java-conventions` (records for
ids/DTOs, sealed `BookingOutcome` + exhaustive switch, `Clock` injection, `SecureRandom`
base32 code, package-private adapters), `riviera-stripe-payments` (two-port split: inbound
`CheckoutPort` in `payment.api`, outbound `PaymentGateway` in `payment.application.out`
with a `StubPaymentGateway` U4 swaps for Stripe — no Connect), `angular-developer` +
angular-cli MCP `get_best_practices` (v22 signals, Signal Forms, modal focus management,
`@if`/`@for`, no `as any`).

**Branch:** `claude/riviera-sdd-u3-issues-i011pw` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a free **online** set and a bookable date, when `POST /api/bookings`
  with valid guest contact, then `201` with `status=CONFIRMED` and a booking code, and a
  `booking` row exists as `CONFIRMED`. *Pinned by:* `BookingControllerIT.createsConfirmedBooking`
- [ ] **AC-2:** Given a set already held for that date, when a second `POST /api/bookings`,
  then `409` (`SET_TAKEN`) and **no** new `booking` row. *Pinned by:* `BookingControllerIT.takenSetReturns409`
- [ ] **AC-3:** Given two concurrent `POST`s for the same `(set, date)`, then exactly one
  `201 CONFIRMED` and the other `409`, with exactly one `availability` row and one
  `CONFIRMED` booking. *Pinned by:* `ConcurrentReservationIT.exactlyOneWins`
- [ ] **AC-4:** Given a **walk-in-pool** set, when `POST /api/bookings`, then `422`
  (`SET_NOT_BOOKABLE_ONLINE`) and no booking (invariant #3). *Pinned by:* `BookingControllerIT.walkInPoolReturns422`
- [ ] **AC-5:** Given a date whose evening-before cutoff (`18:00 Europe/Tirane`) has passed
  (incl. today/past dates), when `POST /api/bookings`, then `422` (`BOOKING_CLOSED`) and no
  booking (invariant #4). *Pinned by:* `BookingCutoffTest.rejectsPastCutoff` + `BookingControllerIT.afterCutoffReturns422`
- [ ] **AC-6:** Generated booking codes are ≥ 8 chars from an unambiguous base32 alphabet,
  non-sequential, and unique. *Pinned by:* `BookingCodeGeneratorTest.entropyAndCharset`
- [ ] **AC-7:** The booking code is never written to logs in clear. *Pinned by:* `CreateBookingServiceTest.codeNeverLogged`
- [ ] **AC-8:** Booking amount equals the set price in integer minor units + currency (no
  float anywhere). *Pinned by:* `BookingControllerIT.createsConfirmedBooking` (asserts `amount.minorUnits`)
- [ ] **AC-9:** Payment flows through the `payment.api` `CheckoutPort` (stub behind the
  outbound `PaymentGateway`) — no Stripe types on the classpath. *Pinned by:* `JdbcOnlyArchitectureTests` (no Stripe) + `PaymentServiceTest`
- [ ] **AC-10:** A guest is found-or-created by email; a repeat email reuses the same
  `customer` id (contact refreshed). *Pinned by:* `CustomerDirectoryIT.findOrCreateByEmail`
- [ ] **AC-11:** `ApplicationModules.verify()` passes — `booking` reaches other modules only
  via their `api/` ports. *Pinned by:* `ModularityTests`
- [ ] **AC-12:** Frontend: selecting a free online set, completing the guest form, and
  submitting shows a confirmation screen with the code + set/date/price summary. *Pinned by:*
  `booking-flow.a11y.spec.ts` + `booking.service.spec.ts` + Playwright `booking-flow.e2e`
- [ ] **AC-13:** The booking dialog and confirmation pass axe (jsdom) and the real-render
  `@axe-core/playwright` audit (keyboard set-picker, modal focus, contrast). *Pinned by:*
  `booking-dialog.a11y.spec.ts`, `booking-confirmation.a11y.spec.ts`, `booking-flow.e2e` axe steps
- [ ] **AC-14:** Backend + frontend CI green. *Pinned by:* CI run on the PR.

## Non-goals

- Real Stripe / PaymentIntents / webhooks — **U4**. The stub always succeeds synchronously.
- `BookingConfirmed` domain event + availability/payout fan-out — **U5** (U3 uses the
  synchronous claim port; no event yet).
- View/cancel booking, `GET /api/bookings/{code}`, refunds — **U6**.
- Wiring the U1 beach-map *render* to the live, per-date availability table (it still reads
  `seed_availability`) — a separate follow-up; out of scope here (see Open questions).
- Linking the availability row to the booking (`held_by_booking_id`) — deferred to U6
  (cancel needs it; U3 does not).
- Tourist accounts / auth — guest checkout only.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two clients reserve the same `(set, date)` concurrently | med | high | `UNIQUE(set_id, booking_date)` on `availability` (V4) + atomic `INSERT … ON CONFLICT DO NOTHING` claim; the whole create runs in one tx so a lost race aborts cleanly; `ConcurrentReservationIT` proves exactly-one | claude | open |
| R-2 | Claim commits but booking insert fails → orphan `BOOKED_ONLINE` row with no booking | low | high | Claim (REQUIRED) **joins** `BookingService`'s transaction; any later failure rolls the claim back. Stub payment is in-process (no external call in the tx). U4 redesigns this onto the webhook. | claude | open |
| R-3 | `POST /api/bookings` blocked by Spring Security (401) / CSRF (403) | high | high | `SecurityConfig`: `permitAll` POST `/api/bookings` (public guest checkout) + scope-ignore CSRF for that matcher (stateless, token-less, no session) | claude | open |
| R-4 | Cutoff computed in JVM default zone → wrong day boundary | med | high | Compute last-bookable instant as `(date−1)@venueCutoff` in `Europe/Tirane`; inject `Clock` (UTC); never `LocalDateTime.now()` (invariants #4, #6) | claude | open |
| R-5 | Booking code guessable / logged | low | high | `SecureRandom` + 10-char unambiguous base32 (50 bits); `UNIQUE(code)` + regenerate on conflict; never log the code (invariant #7) | claude | open |
| R-6 | Money as float / BigDecimal-euro | low | high | `long` minor units + ISO currency end-to-end; `amount_minor BIGINT`; FE renders from minor units (invariant #5) | claude | open |
| R-7 | `booking` leaks into another module's internals | low | med | Only `api/` ports consumed; `ModularityTests` gate | claude | open |
| R-8 | Playwright a11y e2e flaky / needs a live backend | med | med | Mock `/api/venues/1` + `/api/bookings` via `page.route`; run against `ng serve`; use pre-installed Chromium (`/opt/pw-browsers/chromium`) | claude | open |

## Open questions / Assumptions

- **Assumption:** Confirmation is rendered from the `POST` response held in a
  `BookingService` signal and a `/booking/confirmation` route; no `GET /api/bookings/{code}`
  in U3 (that endpoint is U6). A hard reload of the confirmation route shows a "start over"
  message. — *Owner:* claude · *Resolves by:* phase 6
- **Assumption:** Booking total = the single set's price (one set = 2 loungers + umbrella,
  full day). No fees/multi-set in U3. — *Owner:* claude · *Resolves by:* phase 4
- **Resolved (deferred):** The U1 map renders `seed_availability`, not the live table, so a set
  booked in U3 won't grey out on the map for the chosen date. Does not block U3 ACs (booking is
  server-authoritative; a contested set returns `409`). Tracked as follow-up issue **#44**.

### Resolved
- **Cutoff scope** → *Full evening-before cutoff* enforced in U3 (user decision, grill gate).
- **a11y scope** → *Add `@axe-core/playwright`* real-render audit now (user decision).
- **Customer identity** → *Email + name + phone* guest checkout (user decision).

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** the **online booking
  claim** only (via `availability.api.AvailabilityClaim#claim`). No new write path; U3 is a
  consumer of the U2 seam.
- **Uniqueness guarantee:** `CONSTRAINT set_availability_uniq UNIQUE (set_id, booking_date)`
  (V4) — a set is holdable by at most one party per date.
- **Concurrency strategy:** the existing atomic `INSERT … ON CONFLICT (set_id, booking_date)
  DO NOTHING`; rows-affected decides the winner (`1`→`CLAIMED`, `0`→`ALREADY_TAKEN`). A
  second, still-uncommitted inserter blocks on the index until the first tx resolves, then
  sees the conflict — no `SELECT … FOR UPDATE` needed.
- **Pool rule (invariant #3):** the claim rejects non-`ONLINE` sets (`NOT_ONLINE_POOL`); the
  service also reads `pool` via `venue.api` before claiming and maps walk-in → `422`.
- **Cutoff rule (invariant #4):** bookable iff `now < (bookingDate − 1 day) @ venue.bookingCutoff`
  in `Europe/Tirane`. Computed server-side from an injected UTC `Clock`. Past/same-day dates
  fail this naturally. → `422 BOOKING_CLOSED`.
- **Pinning test:** `ConcurrentReservationIT.exactlyOneWins` — two concurrent creates of the
  same `(set, date)` ⇒ one `201 CONFIRMED`, one `409`, one availability row, one booking.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | **new** | `Booking` | bookings, codes, lifecycle, the Instant create orchestration |
| M-2 | `customer` | **new** | `Customer` | guest-checkout contact identity |
| M-3 | `payment` | **new (stub)** | — | the payment-gateway seam (stub now, Stripe in U4) |
| M-4 | `venue` | existing | `Venue` | adds `setBookingInfo` to its read port |
| M-5 | `availability` | existing | `SetAvailability` | consumed read-only via its claim port |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port / method | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `AvailabilityClaim#claim(SetId, LocalDate)` (existing) | `ClaimOutcome` | `booking` |
| NI-2 | `venue.api` | `VenueCatalog#setBookingInfo(SetId)` (**new**) | `SetBookingInfo`(`SetId, VenueId, String pool, MoneyView price, LocalTime bookingCutoff`) | `booking` |
| NI-3 | `customer.api` | `CustomerDirectory#findOrCreate(GuestContact)` (**new**) | `CustomerId`, `GuestContact`(`email, fullName, phone`) | `booking` |
| NI-4 | `payment.api` | `CheckoutPort#pay(BookingRef, Money)` (**new**) | `PaymentOutcome` (sealed), `Money`(`minor, currency`), `BookingRef`(`long`) | `booking` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| — | none in U3 | — | — | — | — | `BookingConfirmed` is **U5**; U3 uses the synchronous claim port (allowed per `AvailabilityClaim` javadoc) |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only, **no Connect**. U3 uses a **stub** behind the outbound
  `PaymentGateway` port (`payment.application.out`); `payment.api.CheckoutPort` is the
  inbound seam `booking` calls. U4 swaps `StubPaymentGateway` → Stripe and moves
  confirmation onto the verified webhook.
- **Confirmation trigger:** U3 stub returns `SUCCEEDED` synchronously → booking `CONFIRMED`
  in the same tx. (U4: signature-verified webhook, never the client redirect.)
- **Idempotency:** N/A for the in-process stub; the *interface* shape (`pay(BookingRef,
  Money)`) leaves room for U4's idempotency key.
- **Money:** integer minor units, EUR (`Money(long minor, String currency)`).
- **Payout-ledger effect:** **none in U3** — accrual is U5 (`payout` consumes
  `BookingConfirmed`). Noted so it isn't forgotten.
- **Refund policy:** N/A — no cancellation in U3 (U6).
- **Pinning tests:** `PaymentServiceTest.stubSucceeds`, `JdbcOnlyArchitectureTests` (no
  Stripe/JPA on classpath).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking.service.ts` | new | root `@Service` | `lastConfirmation` signal | — |
| FE-2 | `booking/booking-dialog.ts` | new | standalone component (modal) | signals | **Signal Forms** (email/name/phone/date) |
| FE-3 | `booking/booking-confirmation.ts` | new | standalone component + route | reads `lastConfirmation` | — |
| FE-4 | `venue/venue-map.*` | modify | standalone component | adds set-select `output()` / open-dialog | — |
| FE-5 | `booking/booking.model.ts` | new | typed DTOs | — | — |

**Standards:** standalone (no `standalone:true`), `inject()`, `@if`/`@for`, `input()`/
`output()`, no `ngClass`/`ngStyle` (class/style bindings), no explicit `OnPush`, money from
minor units, `@Service` for the singleton service. Modal: `role="dialog"` + `aria-modal`,
focus trap, focus returns to the invoking tile on close (a11y).

## FE↔BE contract

- **New endpoint:** `POST /api/bookings`
  - Request: `{ "setId": number, "bookingDate": "YYYY-MM-DD",
    "contact": { "email": string, "fullName": string, "phone": string } }`
  - `201`: `{ "code": string, "status": "CONFIRMED", "venueId": number, "venueName": string,
    "setId": number, "rowLabel": string, "positionNo": number, "bookingDate": "YYYY-MM-DD",
    "amount": { "minorUnits": number, "currency": string } }`
  - `409 {"error":"SET_TAKEN"}` · `422 {"error":"SET_NOT_BOOKABLE_ONLINE"|"BOOKING_CLOSED"}`
    · `404 {"error":"NO_SUCH_SET"}` · `400` validation.
- **Client typing:** hand-written typed `BookingService` mirroring the DTOs; no `as any`.
- **Money/date on the wire:** amounts as integer minor units + currency; `bookingDate` as
  ISO `LocalDate`.

## Review gate outcome (SDD)

Ran `riviera-review-overlay` + `/code-review origin/main...HEAD` (3 parallel finder passes:
backend correctness, riviera invariants, frontend+contract). **No Blockers, no Majors** —
all 12 invariant gates PASS (RV-BE-1 availability proven by `ConcurrentReservationIT`;
RV-CT-3 payment confirmation server-side via the stub, U4-swap-ready; JDBC-only; Modulith
boundaries clean; money minor units; Europe/Tirane cutoff; unguessable, never-logged code).

Findings fixed:
- **Booking-code retry was non-functional inside `@Transactional`** (a thrown unique violation
  aborts the Postgres tx) → switched `insertAwaitingPayment` to `INSERT … ON CONFLICT (code)
  DO NOTHING RETURNING id` (`OptionalLong`); retry now recovers without poisoning the tx, and
  FK/CHECK errors propagate instead of being masked. Pinned by `CreateBookingServiceTest.regeneratesCodeOnCollisionAndConfirms`.
- **`confirm()` ignored rows-affected** → now asserts exactly one `AWAITING_PAYMENT` row updated
  (guards a silent false-confirm once U4 confirms via webhook).
- **FE default date used `toISOString()` (UTC)** → off-by-one near midnight vs Europe/Tirane;
  now formats from local date parts.
- **Dead router `state` handoff** in `onBooked` → removed (confirmation reads the service signal).
- Plan drift: AC-7 test name + `booking/api/BookingId` note corrected.

Deferred (non-blocking): `BookingCutoff` DST-gap edge for a non-default cutoff time set inside
the spring-forward hour (default 18:00 is safe); the U1 map renders seed availability, not the
live per-date table — tracked as a follow-up issue. Both degrade safely (server-side `409`).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V5 migration (customer + booking) | ✅ | |
| 1 — customer module | ✅ | |
| 2 — venue.api setBookingInfo | ✅ | |
| 3 — payment stub gateway | ✅ | |
| 4 — booking core + orchestration | ✅ | |
| 5 — booking REST + security | ✅ | |
| 6 — frontend booking flow | ✅ | |
| 7 — @axe-core/playwright a11y e2e | ✅ | |
| 8 — verify + PR + review gate | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**
- (`booking/api/BookingId` deferred to U5 — no cross-module consumer in U3; the public
  seam is the `application.in.CreateBooking` driving port, used intra-module by the controller)
- `booking/application/CreateBookingService.java` — orchestration (cutoff→claim→customer→pay→confirm)
- `booking/application/BookingOutcome.java` — sealed result (`Confirmed`/`SetTaken`/`NotOnlinePool`/`NoSuchSet`/`BookingClosed`)
- `booking/application/CreateBookingCommand.java` — record (setId, date, GuestContact)
- `booking/application/out/Bookings.java` — persistence port
- `booking/application/out/BookingCodeGenerator.java` — code port (`String next()`)
- `booking/domain/BookingStatus.java` — enum
- `booking/infrastructure/out/JdbcBookings.java` — JDBC adapter
- `booking/infrastructure/out/SecureRandomBookingCodeGenerator.java`
- `booking/infrastructure/in/BookingController.java` — `POST /api/bookings`
- `booking/infrastructure/in/CreateBookingRequest.java` / `BookingConfirmationView.java` — wire DTOs
- `customer/api/{CustomerId,GuestContact,CustomerDirectory}.java`
- `customer/infrastructure/out/JdbcCustomerDirectory.java`
- `payment/api/{CheckoutPort,Money,PaymentOutcome,BookingRef}.java`
- `payment/application/PaymentService.java` (implements `CheckoutPort`)
- `payment/application/out/PaymentGateway.java`
- `payment/infrastructure/out/StubPaymentGateway.java`
- `venue/api/{VenueCatalog (+setBookingInfo), SetBookingInfo}.java` — extend
- `venue/infrastructure/out/JdbcVenueCatalog.java` — implement `setBookingInfo`
- `SecurityConfig.java` — permit POST `/api/bookings` + CSRF ignore
- `resources/db/migration/V5__booking_and_customer.sql`
- `*/package-info.java` updates for new `api` named interfaces

**Frontend (`frontend/src/app/booking/`)** + `venue/venue-map.*` + routes + Playwright config.

---

## Phase 0 — V5 migration (customer + booking)

**Files:** Create `V5__booking_and_customer.sql` · Test `booking/BookingMigrationIT.java`

- [ ] **Step 1: failing test** — `BookingMigrationIT` (Testcontainers): asserts `booking`
  and `customer` exist; `UNIQUE(code)`; `status` CHECK rejects a bogus status; a duplicate
  `(set_id, booking_date)` in `booking` is **allowed** (uniqueness is availability's job);
  duplicate `customer.email` rejected.
- [ ] **Step 2: run** `./gradlew test --tests "*BookingMigrationIT*"` → FAIL (no tables).
- [ ] **Step 3: migration**

```sql
-- V5 (issue #6): customer (guest checkout) + booking. Uniqueness of (set,date) is the
-- availability table's job (invariant #2) — booking only indexes it. Money is BIGINT minor
-- units (invariant #5). Code is the unguessable bearer credential (invariant #7), UNIQUE.
CREATE TABLE customer (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      TEXT        NOT NULL,
    full_name  TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_email_uniq UNIQUE (email)        -- stored lower-cased; guest key
);

CREATE TABLE booking (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            TEXT        NOT NULL,
    venue_id        BIGINT      NOT NULL REFERENCES venue (id),
    set_id          BIGINT      NOT NULL REFERENCES set_position (id),
    customer_id     BIGINT      NOT NULL REFERENCES customer (id),
    booking_date    DATE        NOT NULL,                -- LocalDate Europe/Tirane (#6)
    amount_minor    BIGINT      NOT NULL,                -- minor units (#5)
    amount_currency TEXT        NOT NULL,                -- ISO 4217
    status          TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    CONSTRAINT booking_code_uniq    UNIQUE (code),
    CONSTRAINT booking_status_check CHECK (status IN
        ('AWAITING_PAYMENT','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
    CONSTRAINT booking_amount_check CHECK (amount_minor >= 0)
);
-- Index FKs / lookup paths (postgres skill: PG does not auto-index FKs). NOT unique on
-- (set_id, booking_date) — historical rows across cancellations are expected.
CREATE INDEX booking_set_date_idx   ON booking (set_id, booking_date);
CREATE INDEX booking_customer_id_idx ON booking (customer_id);
CREATE INDEX booking_venue_id_idx    ON booking (venue_id);
```

- [ ] **Step 4: run** → PASS.
- [ ] **Step 5: generalization audit** — n/a (first booking migration).
- [ ] **Step 6: commit** `[U3] V5 migration: customer + booking tables (#6)`
- [ ] **Step 7: update execution status.**

---

## Phase 1 — customer module

**Files:** `customer/api/{CustomerId,GuestContact,CustomerDirectory}.java`,
`customer/infrastructure/out/JdbcCustomerDirectory.java`, update `customer/package-info.java`;
Test `customer/CustomerDirectoryIT.java`.

- [ ] **Step 1: failing test** `CustomerDirectoryIT.findOrCreateByEmail` — first call creates
  and returns an id; second call with the **same email** (different name/phone) returns the
  **same id** and refreshes name/phone. (Testcontainers.)
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implement**

```java
// customer/api
public record CustomerId(long value) {}
public record GuestContact(String email, String fullName, String phone) {}
public interface CustomerDirectory { CustomerId findOrCreate(GuestContact contact); }
```
```java
// customer/infrastructure/out — package-private adapter, JdbcClient, lower-cased email key
@Repository
class JdbcCustomerDirectory implements CustomerDirectory {
  private final JdbcClient jdbc;
  JdbcCustomerDirectory(JdbcClient jdbc) { this.jdbc = jdbc; }
  @Override public CustomerId findOrCreate(GuestContact c) {
    long id = jdbc.sql("""
        INSERT INTO customer (email, full_name, phone)
        VALUES (:email, :name, :phone)
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone, updated_at = NOW()
        RETURNING id
        """)
      .param("email", c.email().trim().toLowerCase())
      .param("name", c.fullName()).param("phone", c.phone())
      .query(Long.class).single();
    return new CustomerId(id);
  }
}
```
- [ ] **Step 4: run** → PASS. Regression: `./gradlew test --tests "*customer*"`.
- [ ] **Step 6: commit** `[U3] customer module: guest find-or-create (#6)` · **Step 7** status.

---

## Phase 2 — venue.api `setBookingInfo`

**Files:** modify `venue/api/VenueCatalog.java`, add `venue/api/SetBookingInfo.java`,
implement in `JdbcVenueCatalog`; Test `venue/SetBookingInfoIT.java`.

- [ ] **Step 1: failing test** — `setBookingInfo(setId)` for a seeded ONLINE set returns
  venueId, `"ONLINE"`, price (minor units), cutoff `18:00`; empty for an unknown set.
- [ ] **Step 3: implement**

```java
public record SetBookingInfo(SetId setId, VenueId venueId, String pool,
        MoneyView price, java.time.LocalTime bookingCutoff) {}
// VenueCatalog: Optional<SetBookingInfo> setBookingInfo(SetId setId);
```
```java
@Override public Optional<SetBookingInfo> setBookingInfo(SetId setId) {
  return jdbc.sql("""
      SELECT sp.id AS set_id, sp.venue_id, sp.pool, sp.price_minor, sp.price_currency,
             v.booking_cutoff
      FROM set_position sp JOIN venue v ON v.id = sp.venue_id
      WHERE sp.id = :id
      """)
    .param("id", setId.value())
    .query((rs, n) -> new SetBookingInfo(new SetId(rs.getLong("set_id")),
        new VenueId(rs.getLong("venue_id")), rs.getString("pool"),
        new MoneyView(rs.getLong("price_minor"), rs.getString("price_currency")),
        rs.getObject("booking_cutoff", java.time.LocalTime.class)))
    .optional();
}
```
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U3] venue.api: setBookingInfo (#6)` · **Step 7**.

---

## Phase 3 — payment stub gateway

**Files:** `payment/api/{CheckoutPort,Money,PaymentOutcome,BookingRef}.java`,
`payment/application/PaymentService.java`, `payment/application/out/PaymentGateway.java`,
`payment/infrastructure/out/StubPaymentGateway.java`, update `payment/package-info.java`;
Test `payment/PaymentServiceTest.java`.

- [ ] **Step 1: failing test** `PaymentServiceTest.stubSucceeds` — `pay(ref, money)` returns
  `Succeeded`.
- [ ] **Step 3: implement** — inbound/outbound split per `riviera-stripe-payments`:

```java
// payment/api
public record Money(long minor, String currency) {}
public record BookingRef(long value) {}
public sealed interface PaymentOutcome permits PaymentOutcome.Succeeded, PaymentOutcome.Failed {
  record Succeeded(String reference) implements PaymentOutcome {}
  record Failed(String reason) implements PaymentOutcome {}
}
public interface CheckoutPort { PaymentOutcome pay(BookingRef booking, Money amount); }
// payment/application/out
public interface PaymentGateway { PaymentOutcome charge(BookingRef booking, Money amount); }
// payment/application — delegates inbound→outbound (the swap point for U4)
@Service class PaymentService implements CheckoutPort {
  private final PaymentGateway gateway;
  PaymentService(PaymentGateway gateway) { this.gateway = gateway; }
  @Override public PaymentOutcome pay(BookingRef b, Money a) { return gateway.charge(b, a); }
}
// payment/infrastructure/out — U4 replaces this with Stripe
@Component class StubPaymentGateway implements PaymentGateway {
  @Override public PaymentOutcome charge(BookingRef b, Money a) {
    return new PaymentOutcome.Succeeded("stub-" + b.value());
  }
}
```
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U3] payment: stub gateway behind CheckoutPort (#6)` · **Step 7**.

---

## Phase 4 — booking core + orchestration

**Files:** `booking/api/BookingId.java`, `booking/domain/BookingStatus.java`,
`booking/application/{BookingService,BookingOutcome,CreateBookingCommand}.java`,
`booking/application/out/{Bookings,BookingCodeGenerator}.java`,
`booking/infrastructure/out/{JdbcBookings,SecureRandomBookingCodeGenerator}.java`;
Tests `BookingCodeGeneratorTest`, `BookingCutoffTest`, `BookingServiceTest` (fakes),
`BookingServiceLoggingTest`, `BookingServiceIT` (real DB happy path).

- [ ] **Step 1: failing tests** — code entropy/charset (AC-6); cutoff math (AC-5);
  service branches with fake ports: taken→`SetTaken`, walk-in→`NotOnlinePool`,
  past-cutoff→`BookingClosed`, success→`Confirmed` (AC-1/4/5); code-never-logged (AC-7).
- [ ] **Step 3: implement** — key pieces:

```java
// application/out
public interface Bookings { long insertAwaitingPayment(NewBooking b);
  void confirm(long bookingId, String code, java.time.Instant at); }
public interface BookingCodeGenerator { String next(); }
// sealed outcome → controller maps to HTTP
public sealed interface BookingOutcome {
  record Confirmed(BookingConfirmation c) implements BookingOutcome {}
  enum Rejection implements BookingOutcome { SET_TAKEN, NOT_ONLINE_POOL, NO_SUCH_SET, BOOKING_CLOSED }
}
```
```java
// SecureRandom base32 (Crockford-ish, no I/L/O/U), 10 chars ≈ 50 bits
class SecureRandomBookingCodeGenerator implements BookingCodeGenerator {
  private static final char[] ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789".toCharArray();
  private static final int LENGTH = 10;
  private final java.security.SecureRandom rnd = new java.security.SecureRandom();
  @Override public String next() {
    var sb = new StringBuilder(LENGTH);
    for (int i = 0; i < LENGTH; i++) sb.append(ALPHABET[rnd.nextInt(ALPHABET.length)]);
    return sb.toString();
  }
}
```
```java
// BookingService.create — one transaction; claim joins it (REQUIRED)
@Transactional
public BookingOutcome create(CreateBookingCommand cmd) {
  var info = venueCatalog.setBookingInfo(cmd.setId());
  if (info.isEmpty()) return BookingOutcome.Rejection.NO_SUCH_SET;
  var set = info.get();
  if (!ONLINE_POOL.equals(set.pool())) return BookingOutcome.Rejection.NOT_ONLINE_POOL;
  if (!cutoff.isBookable(set.bookingCutoff(), cmd.bookingDate())) // Clock + Europe/Tirane
      return BookingOutcome.Rejection.BOOKING_CLOSED;
  var customerId = customers.findOrCreate(cmd.contact());
  var claim = availability.claim(cmd.setId(), cmd.bookingDate());
  switch (claim) {
    case ALREADY_TAKEN -> { return BookingOutcome.Rejection.SET_TAKEN; }
    case NOT_ONLINE_POOL -> { return BookingOutcome.Rejection.NOT_ONLINE_POOL; }
    case NO_SUCH_SET -> { return BookingOutcome.Rejection.NO_SUCH_SET; }
    case CLAIMED -> { /* proceed */ }
  }
  long id = bookings.insertAwaitingPayment(new NewBooking(set, customerId, cmd.bookingDate()));
  var pay = checkout.pay(new BookingRef(id), new Money(set.price().minorUnits(), set.price().currency()));
  if (pay instanceof PaymentOutcome.Failed) throw new PaymentDeclinedException(); // rolls back tx + claim
  String code = uniqueCode();        // regenerate on UNIQUE(code) conflict
  bookings.confirm(id, code, clock.instant());
  log.info("confirmed booking {} for set {} date {}", id, set.setId().value(), cmd.bookingDate()); // no code
  return new BookingOutcome.Confirmed(new BookingConfirmation(code, set, cmd.bookingDate(), venueName));
}
```
- [ ] **Step 4: run** unit tests → PASS; `BookingServiceIT` (real DB) → PASS.
- [ ] **Step 5: generalization audit** — search other availability write paths (only the
  claim today); record decision.
- [ ] **Step 6** commit `[U3] booking core: orchestration + code generation (#6)` · **Step 7**.

---

## Phase 5 — booking REST + security

**Files:** `booking/infrastructure/in/{BookingController,CreateBookingRequest,BookingConfirmationView}.java`,
modify `SecurityConfig.java`; Tests `BookingControllerIT`, `ConcurrentReservationIT`.

- [ ] **Step 1: failing tests** — `BookingControllerIT`: 201 happy path (AC-1/8), 409 taken
  (AC-2), 422 walk-in (AC-4), 422 after-cutoff (AC-5), 404 unknown set, 400 invalid body;
  `ConcurrentReservationIT.exactlyOneWins` (AC-3).
- [ ] **Step 3: implement** — controller maps `BookingOutcome` via exhaustive `switch`:

```java
@PostMapping ResponseEntity<?> create(@RequestBody @Valid CreateBookingRequest req) {
  var outcome = service.create(req.toCommand());
  return switch (outcome) {
    case BookingOutcome.Confirmed c -> ResponseEntity.status(201).body(BookingConfirmationView.of(c));
    case BookingOutcome.Rejection r -> switch (r) {
      case SET_TAKEN -> error(409, "SET_TAKEN");
      case NOT_ONLINE_POOL -> error(422, "SET_NOT_BOOKABLE_ONLINE");
      case BOOKING_CLOSED -> error(422, "BOOKING_CLOSED");
      case NO_SUCH_SET -> error(404, "NO_SUCH_SET");
    };
  };
}
```
```java
// SecurityConfig: public guest checkout — permit + scoped CSRF ignore (stateless, no session)
.csrf(csrf -> csrf.ignoringRequestMatchers(mvc.pattern(HttpMethod.POST, "/api/bookings")))
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/actuator/health/**").permitAll()
    .requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
    .requestMatchers(HttpMethod.POST, "/api/bookings").permitAll()
    .anyRequest().authenticated())
```
- [ ] **Step 4: run** → PASS. Regression: `./gradlew test --tests "*booking*"` then full suite
  pre-merge. Verify `WebCorsConfig` allows POST (adjust if needed).
- [ ] **Step 6** commit `[U3] booking REST + public-checkout security (#6)` · **Step 7**.

---

## Phase 6 — frontend booking flow

**Files:** `booking/{booking.model.ts,booking.service.ts,booking-dialog.ts,booking-confirmation.ts}`,
modify `venue/venue-map.{ts,html,scss}`, `app.routes.ts`; specs `booking.service.spec.ts`,
`booking-dialog.a11y.spec.ts`, `booking-confirmation.a11y.spec.ts`, `venue-map` select spec.

- [ ] **Step 1: failing specs** — service POST happy + error mapping; dialog renders Signal
  Form + passes axe; confirmation shows code/summary + passes axe; map exposes selectable
  free-online tiles via keyboard.
- [ ] **Step 3: implement**
  - `BookingService`: `createBooking(req)` → `POST`; `lastConfirmation` signal set on success;
    typed errors (`SET_TAKEN`/`BOOKING_CLOSED`/…). No `as any`.
  - `venue-map`: free **ONLINE** tiles become `<button>`s (keyboard-focusable, accessible
    name already exists) emitting a `select(set)`; walk-in/taken non-interactive.
  - `BookingDialog`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`; focus trap;
    focus returns to the originating tile on close. Signal Form: email (email validator),
    fullName (required), phone (required), date (>= tomorrow default). Submit → service →
    on success navigate to confirmation; on 409/422 show inline error.
  - `BookingConfirmation` + route `/booking/confirmation`: reads `lastConfirmation`; if
    absent, "start over" link to home.
- [ ] **Step 4: run** `npm run test:a11y` and unit specs → PASS; `ng build` clean.
- [ ] **Step 6** commit `[U3] frontend: booking dialog + confirmation (#6)` · **Step 7**.

---

## Phase 7 — `@axe-core/playwright` a11y e2e

**Files:** `frontend/package.json` (+`@playwright/test`, `@axe-core/playwright`),
`frontend/playwright.config.ts`, `frontend/e2e/booking-flow.e2e.ts`; CI workflow step.

- [ ] **Step 1: failing e2e** — `booking-flow.e2e`: mock `GET /api/venues/1` + `POST
  /api/bookings` via `page.route`; drive map → keyboard-select a free online set → modal
  (assert focus trapped) → fill form → submit → confirmation shows code. Run
  `AxeBuilder` at map, modal-open, and confirmation; assert **0** serious/critical.
- [ ] **Step 3: implement** — `playwright.config.ts` with `webServer: ng serve`,
  `use.channel`/`executablePath: '/opt/pw-browsers/chromium'` (env-provided Chromium; do
  **not** run `playwright install`). Add `test:e2e` script.
- [ ] **Step 4: run** `npm run test:e2e` → PASS.
- [ ] **Step 5** — wire a CI job step (mirror the existing FE a11y job) to run `test:e2e`.
- [ ] **Step 6** commit `[U3] a11y: @axe-core/playwright booking-flow audit (#6)` · **Step 7**.

---

## Phase 8 — verify + PR + review gate

- [ ] Full backend `./gradlew test` + `ModularityTests` + `JdbcOnlyArchitectureTests` green.
- [ ] Full frontend `npm test` + `test:a11y` + `test:e2e` + `ng build` green.
- [ ] Open the follow-up issue for the map→live-availability render gap; link it.
- [ ] Push; open PR into `main` referencing #6.
- [ ] **Review gate:** `/code-review origin/main...HEAD` + `riviera-review-overlay`
  (RV-BE-*/RV-FE-*/RV-CT-*, availability & payment blockers). Resolve/defer findings.
- [ ] Merge only when CI green + review findings resolved + ACs verified.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-11 backend — `./gradlew test` green at `<sha>`.
- [ ] AC-12/AC-13 frontend — `npm run test:a11y` + `test:e2e` green at `<sha>`.
- [ ] AC-14 — CI green on the PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] **No JPA** introduced; no `@Entity`; `JdbcOnlyArchitectureTests` green (invariant #1).
- [ ] **Availability** section honored; `ConcurrentReservationIT` proves exactly-one (#2).
- [ ] Pool + cutoff rules enforced (invariants #3, #4).
- [ ] **Modulith** boundaries clean; only `api/` ports crossed; `ModularityTests` green (#11).
- [ ] **Payment** stub behind `CheckoutPort`/`PaymentGateway`; no Stripe yet; money minor units (#5, #8-ready).
- [ ] Timezone: UTC `Clock`, `Europe/Tirane` cutoff (invariant #6).
- [ ] Booking codes unguessable + never logged (invariant #7).
- [ ] Flyway V5 present; constraints tested (invariant #12).
- [ ] **Frontend** standards met; no `as any`; modal focus management; axe (jsdom + Playwright) green.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
