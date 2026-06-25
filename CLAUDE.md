# Riviera Sunbed Booking — Project Conventions

This is the always-on conventions file for the riviera-sunbed-booking project. It
is the **canonical source** for the bounded-context list and the cross-cutting
invariants that the project skills (`riviera-plan-doc`, `riviera-review-overlay`,
`riviera-stripe-payments`) reference by number. When a skill says "invariant #2,"
it means the numbered list in this file.

Keep this file short and stable. Detailed, situational guidance lives in the
skills under `.claude/skills/`, not here.

## What this is

A two-sided marketplace web app: tourists pre-book a sunbed **set** (2 loungers +
umbrella, full day) at an Albanian-riviera venue, pick the exact spot from a
visual beach map, and pay in-app; the platform takes a commission per booking and
pays venues out manually. Full design: `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`.

## Tech stack (locked)

- **Frontend:** Angular (mobile-friendly responsive web). Native apps deferred.
- **Backend:** Spring Boot REST API, organized as a **Spring Modulith** with
  hexagonal (ports/adapters) modules.
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only**.
- **Payments:** Stripe (collection only), behind a payment-gateway interface.
- **Schema migrations:** Flyway (versioned forward migrations).
- **Build:** Gradle (wrapper, `./gradlew`) for the backend; npm scripts for the
  Angular app. (The skills' `./gradlew` / `npm` commands assume this.)

## Bounded contexts (Spring Modulith modules)

Base package is **`app.riviera`** (provisional — see "Provisional decisions"). Each
module lives at `app.riviera.<module>` with the hexagonal layout in invariant #11.

| Module | Owns | Aggregate root(s) |
|---|---|---|
| `venue` | venue profiles, the beach map / layout, set positions, online-vs-walk-in pool assignment, pricing, booking mode (Instant / Request) | `Venue`, `BeachMap` |
| `availability` | the per-`(set, date)` source-of-truth state (free / booked-online / staff-marked); the only writer of that table | `SetAvailability` |
| `booking` | bookings, booking codes, lifecycle (confirmed/cancelled/completed/no-show), cancellation-policy enforcement | `Booking` |
| `payment` | Stripe collection, PaymentIntents, refunds, webhook handling | `Payment` |
| `payout` | the venue payout ledger (bookings − commission), manual BKT batch reporting | `PayoutLedgerEntry`, `PayoutBatch` |
| `customer` | light tourist identity / guest-checkout contact | `Customer` |

Cross-module collaboration is **events for state changes, `api/` ports for
queries** (invariant #11). The spine flow: `BookingConfirmed` → `availability`
marks the set taken + `payout` accrues a ledger entry; `BookingCancelled` →
`availability` frees the set + `payment` refunds per policy.

## Cross-cutting invariants

These are the rules every plan, every implementation, and every review checks.
The skills reference them by number.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` must never be
   on the classpath. No `@Entity`, `@OneToMany`, `@ManyToOne`, `mappedBy`,
   `EntityManager`. Use Spring Data JDBC aggregates and/or `JdbcTemplate` with
   explicit SQL. This is the project's defining backend decision.
2. **Availability is the single source of truth, per `(set, date)`.** Every
   channel — an online booking and a staff tap-to-mark walk-in — writes the same
   `availability(set_id, booking_date)` row. A set is held by **at most one party
   per date**. This is enforced in the database (unique constraint) AND in the
   reservation transaction (explicit row lock: `SELECT … FOR UPDATE`, or an
   atomic `INSERT … ON CONFLICT DO NOTHING` claim). The entire business depends on
   never double-selling a set; this is the #1 correctness invariant.
3. **Online and walk-in pools are separate.** Each set carries a pool flag. An
   online booking can only ever target an **online-pool** set. This is collision-
   prevention Layer 1 — it keeps the two channels from drawing on the same
   physical sets in real time.
4. **No same-day booking (v1).** Bookings for a given day close the **evening
   before** (default 18:00 `Europe/Tirane`, configurable). This is collision-
   prevention Layer 2 and also the cancellation cutoff — one rule, two jobs.
5. **Money is integer minor units, never floating point.** Store amounts as
   `long`/`int` minor units (cents) with an explicit ISO currency code. Commission
   and payout arithmetic is exact-integer; rounding rules are written down where
   any division happens. v1 collection currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** A "booking date" is a
   `LocalDate` in `Europe/Tirane`; the cutoff in #4 is computed in that zone.
   Never rely on the JVM default timezone. Persist timestamps as UTC.
7. **Booking codes are unguessable bearer credentials.** Staff verify a booking by
   its code on arrival, so a code must carry enough entropy to be unguessable
   (e.g. ≥ 8 random base32 chars), never sequential, and be treated like a secret
   in logs.
8. **Stripe webhooks are the source of truth for payment state — not the client.**
   Never confirm a booking from a client-side "payment succeeded" redirect. The
   `payment` module reconciles state from **signature-verified** Stripe webhooks,
   uses **idempotency keys** on charge/refund creation, and is collection-only
   (no Stripe Connect — see `riviera-stripe-payments`).
9. **The payout ledger is auditable and idempotent.** A booking contributes to a
   venue's payout **exactly once**; refunds reverse it. Payout = Σ(booking amounts
   for the venue in the period) − commission (commission rate stored per venue).
   Payouts are settled manually via BKT; the ledger is the record of what is owed.
10. **Cancellation/refund policy is enforced server-side.** Free cancellation until
    the #4 cutoff → full refund; after → non-refundable (or partial); weather
    exception → **manual admin-triggered** full refund (v1, no forecast
    automation). Refund decisions and amounts are computed on the server, then
    actioned via Stripe.
11. **Spring Modulith boundaries are hexagonal and id-based.** Module layout:
    `app.riviera.<module>.{api, application.in, application.out, domain,
    infrastructure.in, infrastructure.out}`. Cross-module access is via the other
    module's `api/` port **or** a domain event — never by importing its
    `application.*`/`infrastructure.*`/`domain.*`. Event payloads carry **technical
    ids** (`BookingId`, `SetId`, `VenueId`), not mutable business fields or foreign
    aggregates.
12. **Schema changes go through Flyway.** Versioned forward migrations under
    `src/main/resources/db/migration`. No hand-run DDL, no ORM schema generation
    (there's no ORM). Every constraint that enforces an invariant (especially #2)
    is created and tested by a migration.

## Provisional decisions (confirm at scaffolding)

These are sensible defaults chosen so work can proceed; revisit when the repo is
scaffolded. Each is a one-line change if reconsidered.

- **Base package:** `app.riviera`. (Alternatives: `eu.riviera`, a personal
  reverse-domain. Trivial find-replace before first commit of code.)
- **Venue payout currency:** EUR vs ALL, set per venue and converted outside the
  app at BKT payout time. (The **collection** currency is not provisional — it is
  EUR, fixed by invariant #5.)
- **Migration tool:** Flyway (vs Liquibase). Flyway chosen for plain-SQL fit with
  the JDBC-only stack.

## Project skills (`.claude/skills/`)

These are repo-scoped — they load when working in this repository.

- **`riviera-plan-doc`** — pairs with `superpowers:writing-plans` /
  `executing-plans`. Adds the riviera plan-doc template (acceptance criteria, risk
  register, the module/event/availability sections) and per-phase discipline.
- **`riviera-review-overlay`** — pairs with `pre-implementation-review-interview` /
  `peer-change-review-interview`. Adds riviera-specific review bank items (the
  invariants above, as checkable gates).
- **`riviera-stripe-payments`** — the locked payment model (collect-only, no
  Connect, manual BKT payout, German entity) plus Stripe integration conventions.
  Load it for any work in the `payment` or `payout` module.

**Angular skills** (official, from `angular/skills`, installed in-repo via
`skills add` so clones and cloud agents get them; manifest in `skills-lock.json`):

- **`angular-new-app`** — use to **scaffold the Angular frontend** (the first FE
  phase): `npx ng new` with the right flags + `--ai-config`, Tailwind via
  `ng add`, and the CLI generators.
- **`angular-developer`** — the Angular **component/service/architecture authority**
  (signals, `resource`, forms, DI, routing, SSR, a11y, styling, testing; 37 files,
  detail under its `references/`). The riviera frontend review bank (`RV-FE-*`)
  checks the project-critical subset and defers to this skill for full standards.
  (A copy also exists in the global skills for other projects; in this repo the
  in-repo copy is authoritative.)

A `riviera-local-debug` skill (how to run the stack locally) is **deliberately
deferred** until the apps are scaffolded — there is nothing to run yet.
