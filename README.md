# Riviera Sunbed Booking

Pre-book a specific sunbed **set** (2 loungers + umbrella, full day) at an
Albanian-riviera beach venue — pick the exact spot from a visual beach map and pay
in-app. A two-sided marketplace: tourists are demand, venues are supply, the
platform takes a commission per booking and pays venues out manually.

> **Status: in active development.** The full stack is built and deployed — the
> Spring Boot backend (`platform/`, nine Modulith modules) and the Angular
> frontend (`frontend/`), served same-origin by the backend since #110 (Spring bundles
> the SPA into its image) at [riviera-sunbed-booking.onrender.com](https://riviera-sunbed-booking.onrender.com).
> Both Liquid Glass restyle epics are complete — tourist (#133) and operator console
> (#141) — as are customer accounts (sign-in, SSO, GDPR erasure) and tourist reviews
> (#810). In flight: the design-token colour audit, the real transactional mailer
> (#367), and the Stripe → Paysera payment migration (#284, ADR-0009). Per-slice
> history lives on the closed issues and PRs; what's next lives in the issue
> tracker. If you're here to contribute, start with
> [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand the product & business | [`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`](docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md) |
| See the architecture at a glance | [`docs/architecture/domain-model.md`](docs/architecture/domain-model.md) — bounded contexts, aggregates, flows, state machines (rendered diagrams) |
| Know the rules you can't break | [`CLAUDE.md`](CLAUDE.md) — conventions + the 13 invariants (canonical) |
| Look up a domain term | [`CONTEXT.md`](CONTEXT.md) — the glossary; per-module contracts are [`RESPONSIBILITIES.md`](RESPONSIBILITIES.md) |
| Know why something is the way it is | [`docs/adr/`](docs/adr/) — the architecture decision records |
| Contribute | [`CONTRIBUTING.md`](CONTRIBUTING.md) — how we work, branching, the invariants in human terms |

## Tech stack (locked)

- **Frontend:** Angular 22 (mobile-friendly responsive web), Tailwind 4, signals,
  standalone components; Vitest unit tests, Playwright e2e
- **Backend:** Spring Boot 4 REST API on Java 25, **Spring Modulith** with hexagonal
  (ports/adapters) modules — no Lombok
- **Persistence:** PostgreSQL via **Spring Data JDBC / `JdbcTemplate` only — no
  JPA/Hibernate** (this is the project's defining backend decision)
- **Payments:** Stripe, collection-only, behind a payment-gateway interface
- **Migrations:** Flyway (versioned forward SQL)
- **Build:** Gradle wrapper (`./gradlew`) for the backend; npm scripts for Angular

## Build & run

Requires **JDK 25**, **Node 26** (see [`.nvmrc`](.nvmrc)), and **Docker** (for the
backend Testcontainers integration tests — they skip cleanly without a daemon).

```bash
# Backend (Spring Boot, port 8080) — from platform/
./gradlew build                     # compile + full test suite + JaCoCo
./gradlew bootRun                   # run the API

# Frontend (Angular, port 4200) — from frontend/
npm ci
npm start                           # dev server
npm run lint                        # ESLint (type-aware presets)
npm run format:check                # Prettier over src + e2e
npm test                            # unit tests (Vitest, jsdom)
npm run test:e2e:a11y               # Playwright — the CI-safe mocked suite (frontend/e2e/)
npm run test:e2e                    # Playwright — the local-only REAL-backend suite
```

CI (`.github/workflows/`) runs the same backend build/test, the frontend
lint/format/test/build + the mocked e2e suite, the `scripts/check-*.mjs` hygiene
checks, CodeQL, and a SonarCloud scan on every PR. The Sonar merge bar is stricter
than the default gate: **0 new issues, 0 duplicated blocks, ≥80% new-code coverage**.

## The system in one picture

Nine Spring-Modulith bounded contexts collaborate via **domain events** (state
changes, id-based payloads) and **`api/` ports** (queries):

`venue` · `availability` · `booking` · `payment` · `payout` · `customer` ·
`operator` · `review` · `notification`

…plus three non-context modules: `shared`, a Shared Kernel of edge/technical types, and the
closed ADR-0017 mechanisms `challenge` (proof of work) and `audit` (the admin audit trail).

The spine flow: reserving a set **claims it synchronously** through `availability`'s
`AvailabilityClaim` port (an atomic per-`(set, date)` claim — `availability` has no
event listener, so the source of truth is written inside the reservation
transaction). Payment then drives the rest: `PaymentConfirmed →` `booking` confirms
`→ BookingConfirmed →` `payout` accrues a ledger entry **and** `notification` mails
the code. On `BookingCancelled →` `payout` reverses the entry, `notification` mails
the cancellation, and `booking`'s own listener drives the refund per policy; the set
is released through the same claim port. The full picture — aggregates, sequence
flows, and state machines — is in
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
7. **Venue-scoped operations verify the actor owns the venue** — object-level, in
   the application service. The `OPERATOR` role is necessary, never sufficient.

## v1 scope

Tourist web app (browse by beach + date, venue pages, visual beach map, exact-set
selection, in-app payment, booking code + email, view/cancel, guest checkout or a
customer account with SSO) and a venue tool (onboarding, beach-map layout,
Instant/Request booking modes, daily bookings, tap-to-mark, payout view). Stripe
collection + manual weekly BKT payouts. Phase-1 beaches only: Palasë, Drymades,
Dhërmi. Full breakdown in the design spec, §10.

## License

Proprietary — **copyright © 2026 Ivo Pogace, all rights reserved**. See
[`LICENSE`](LICENSE). The repository is readable for evaluation and review; it
grants no right to use, copy, modify, or deploy the code. Third-party dependencies
keep their own licenses.
