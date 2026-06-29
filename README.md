# Riviera Sunbed Booking

Pre-book a specific sunbed **set** (2 loungers + umbrella, full day) at an
Albanian-riviera beach venue — pick the exact spot from a visual beach map and pay
in-app. A two-sided marketplace: tourists are demand, venues are supply, the
platform takes a commission per booking and pays venues out manually.

> **Status: in active development.** The Spring Boot backend (`platform/`) and the
> Angular frontend (`frontend/`) are scaffolded and building. Implemented so far:
> the venue beach-map (U1), the availability claim (U2), and the create-booking
> Instant flow with payment stubbed (U3); the event spine + payout accrual (U4/U5)
> are designed but not yet built. Per-slice status lives in [`docs/plans/`](docs/plans/).
> If you're here to contribute, start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand the product & business | [`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`](docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md) |
| See the architecture at a glance | [`docs/architecture/domain-model.md`](docs/architecture/domain-model.md) — bounded contexts, aggregates, flows, state machines (rendered diagrams) |
| Know the rules you can't break | [`CLAUDE.md`](CLAUDE.md) — conventions + the 12 invariants (canonical) |
| Contribute | [`CONTRIBUTING.md`](CONTRIBUTING.md) — how we work, branching, the invariants in human terms |

## Tech stack (locked)

- **Frontend:** Angular (mobile-friendly responsive web)
- **Backend:** Spring Boot REST API, **Spring Modulith** with hexagonal
  (ports/adapters) modules
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only — no
  JPA/Hibernate** (this is the project's defining backend decision)
- **Payments:** Stripe, collection-only, behind a payment-gateway interface
- **Migrations:** Flyway (versioned forward SQL)
- **Build:** Gradle wrapper (`./gradlew`) for the backend; npm scripts for Angular

## Build & run

Requires **JDK 25**, **Node 26** (see [`.nvmrc`](.nvmrc)), and **Docker** (for the
backend Testcontainers integration tests).

```bash
# Backend (Spring Boot, port 8080)
cd platform && ./gradlew build      # compile + test
./gradlew bootRun                   # run the API

# Frontend (Angular, port 4200)
cd frontend && npm ci
npm start                           # dev server
npm test                            # unit tests (Vitest)
npm run test:e2e                    # Playwright a11y e2e
```

CI (`.github/workflows/`) runs the same backend build/test, the frontend
lint/test/build + e2e, CodeQL, and a SonarCloud scan on every PR.

## The system in one picture

Six Spring-Modulith bounded contexts collaborate via **events** (state changes) and
**`api/` ports** (queries):

`venue` · `availability` · `booking` · `payment` · `payout` · `customer`

The spine flow: `PaymentSucceeded → BookingConfirmed →` the `availability` module
marks the set taken **and** `payout` accrues a ledger entry. On `BookingCancelled →`
availability frees the set **and** payment refunds per policy. The full picture —
aggregates, sequence flows, and state machines — is in
[`docs/architecture/domain-model.md`](docs/architecture/domain-model.md).

## The non-negotiables (short version)

Full list and rationale in [`CLAUDE.md`](CLAUDE.md); the ones that bite hardest:

1. **JDBC only — never JPA.** No `spring-boot-starter-data-jpa`, no `@Entity`.
2. **Availability is the single source of truth per `(set, date)`** — a set is held
   by at most one party per date, enforced by a DB unique constraint *and* a row
   lock / `INSERT … ON CONFLICT`. This is the #1 correctness rule; double-selling a
   set is the bug that kills the business.
3. **Money is integer minor units (cents) + currency** — never floating point.
   v1 collection currency is EUR.
4. **Stripe webhooks are the source of truth for payment** — never confirm a
   booking from a client redirect. No Stripe Connect; payouts are manual via BKT.
5. **Times stored as UTC `Instant`, reasoned about in `Europe/Tirane`.**
6. **Cross-module access only via `api/` ports or domain events** — never import
   another module's internals.

## v1 scope

Tourist web app (browse by beach + date, venue pages, visual beach map, exact-set
selection, in-app payment, booking code + email, view/cancel) and a venue tool
(onboarding, beach-map layout, Instant/Request booking modes, daily bookings,
tap-to-mark, payout view). Stripe collection + manual weekly BKT payouts. Phase-1
beaches only: Palasë, Drymades, Dhërmi. Full breakdown in the design spec, §10.
