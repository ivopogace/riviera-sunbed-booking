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

Base package is **`ai.riviera.platform`** (groupId `ai.riviera`, artifactId
`platform`). Each module lives at `ai.riviera.platform.<module>` with the hexagonal
layout in invariant #11.

| Module | Owns | Aggregate root(s) |
|---|---|---|
| `venue` | venue profiles, the beach map / layout, set positions, online-vs-walk-in pool assignment, pricing, booking mode (Instant / Request) | `Venue`, `BeachMap` |
| `availability` | the per-`(set, date)` source-of-truth state (free / booked-online / staff-marked); the only writer of that table | `SetAvailability` |
| `booking` | bookings, booking codes, lifecycle (pending-request/awaiting-payment/confirmed/cancelled/completed/no-show/declined/expired), request accept/decline + expiry sweep (#98), cancellation-policy enforcement | `Booking` |
| `payment` | Stripe collection, PaymentIntents, refunds, webhook handling | `Payment` |
| `payout` | the venue payout ledger (bookings − commission), manual BKT batch reporting | `PayoutLedgerEntry`, `PayoutBatch` |
| `customer` | light tourist identity / guest-checkout contact | `Customer` |
| `operator` | operator accounts and the operator↔venue ownership mapping (per-venue authorization, invariant #13) | `Operator` |

> **`operator` shipped** (#73 module + per-venue ownership, #74 per-operator DB-backed
> credentials): every venue-scoped application service checks `assertOwns` → `403`
> (pinned by `CrossVenueDenialIT`), and each operator authenticates with its own hashed
> credential. Remaining follow-up: retire the owns-all **bootstrap operator** and add
> creator-owns-on-create. See `riviera-modulith` + `RESPONSIBILITIES.md`.

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
11. **Spring Modulith boundaries are hexagonal and id-based.** Module layout is the
    **ADR-0007 graduated two-template shape** (as amended by issue #95): a full module is
    `ai.riviera.platform.<module>.{api?, spi?, vocabulary?, events?, application, domain,
    adapter/in, adapter/out}` — the published surfaces are top-level named interfaces,
    present only for the kinds the module actually publishes; a thin (serviceless) module
    is `{api, vocabulary?, adapter/out}` only. There is **no** `application/in`|`out`
    split and **no** `infrastructure/*` — direction lives at the adapter layer, and the
    shape is machine-locked by `PackageShapeArchitectureTests`. **The published surface is
    split by kind (issue #95): `api/` holds ports only** — "call-me" interfaces, plain and
    never sealed — **`vocabulary/` the published typed ids/value/outcome types, `events/`
    the published domain-event records**; placement is machine-locked by
    `PublishedSurfacePlacementArchitectureTests`, and `allowedDependencies` grants name
    the narrowest surfaces each consumer needs (a listener-only module depends on
    `<module>::events` + `::vocabulary`, never a command surface). Cross-module access is
    via the other module's `api/` port **or** a domain event — never by importing its
    `application.*`/`adapter.*`/`domain.*`. A cross-module *driven* port — one a module
    needs *another* module to *implement* (dependency inversion, used to keep the graph
    acyclic) — lives in a separate `spi/` named interface, and `<module>::spi` is granted
    only to the implementing module (a driven port implemented by the module's own
    adapters stays internal in `application/`). Event payloads carry **technical ids**
    (`BookingId`, `SetId`, `VenueId`), not mutable business fields or foreign aggregates.
    Details: `docs/adr/ADR-0007-package-structure.md` + `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations under
    `src/main/resources/db/migration`. No hand-run DDL, no ORM schema generation
    (there's no ORM). Every constraint that enforces an invariant (especially #2)
    is created and tested by a migration.
13. **Venue-scoped operations verify the actor owns the venue.** This is a
    multi-tenant marketplace: many independent operators each manage their own
    venue(s). Every operation on venue-owned data — a venue-scoped endpoint
    (`/api/venues/{venueId}/**`: beach-map edits, staff daily bookings, staff
    tap-to-mark, the payout ledger, weather refunds) or the service behind it —
    must verify the **authenticated operator owns the path `venueId`** and reject a
    mismatch with **`403`**. Authorization is **object-level, not role-level**: a
    shared role (e.g. `OPERATOR`) is necessary but **not** sufficient — owning the
    role does not authorize another operator's venue (OWASP API #1, Broken Object
    Level Authorization). The check lives in the **application service**, so no
    driving adapter can bypass it; the operator↔venue ownership mapping is owned by
    the `operator` module and consulted via its `api/` port (id-based, invariant
    #11). Platform-wide admin surfaces (`/api/admin/**`) are role-gated and exempt.
    Reviewed by `riviera-review-overlay` RV-BE-9.

## Provisional decisions

Still open (each a one-line change if reconsidered):

- **Venue payout currency:** EUR vs ALL, set per venue and converted outside the
  app at BKT payout time. (The **collection** currency is not provisional — it is
  EUR, fixed by invariant #5.)

Resolved, no longer provisional: base package `ai.riviera.platform` (shipped);
Flyway over Liquibase (shipped — the plain-SQL migrations under `db/migration`).

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
- **`riviera-java-conventions`** — the **backend Java language idioms** (Java 25,
  Spring Boot 4, Modulith): JDBC-only/no-JPA/no-Lombok, records for DTOs/value-objects/ids,
  constructor injection with package-private adapters, typed outcomes, sealed types &
  pattern matching. Load before writing/refactoring any Java; pairs with `codebase-design`
  (seam shape) and `postgres` (SQL). The numbered invariants stay canonical in this file.
- **`riviera-modulith`** — the **backend module STRUCTURE authority** (Spring Modulith,
  hexagonal): per-module package layout, the `api/` `@NamedInterface` published surface,
  `@ApplicationModule`/`allowedDependencies`, port-vs-event collaboration with id-based
  payloads, the `ApplicationModules.verify()` contract (`ModularityTests`), the Event
  Publication Registry, and `@ApplicationModuleTest`/`Scenario`/`Documenter`. Makes
  invariant #11 (and #1's JDBC-only) concrete. Load before creating/modifying any backend
  Java — which package a class belongs in is its call; pairs with `riviera-java-conventions`
  (idioms), `codebase-design` (seam depth), `postgres` (SQL).
- **`riviera-frontend`** — the **Angular frontend STRUCTURE authority** (the FE mirror of
  `riviera-modulith`): the `core/`/`shared/`/`pages/`/feature-folder taxonomy and one-way
  import rules, the flat lazy-route convention, interceptor/guard/auth placement, the
  DI-token adapter-swap pattern, environment rules, and the two-suite e2e placement. Load
  before creating or modifying any file under `frontend/` — which folder a file lands in
  is its call; pairs with `angular-developer` (how) and `playwright-cli` (e2e authoring).

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

**Frontend e2e skill:**

- **`playwright-cli`** (official `@playwright/cli`, installed via `playwright-cli install
  --skills` → `.claude/skills/playwright-cli/`) — the **Playwright e2e authority**: browser
  automation, best-practice spec authoring, request-mocking, and spec generation, driven from
  the `playwright-cli` binary. The SDLC routing gate makes it **mandatory for any user-facing
  frontend slice** — used to **author** best-practice e2e tests, and in the review gate to
  **judge** whether the tests written are accurate against it (review overlay item `RV-FE-E2E`).
  The project-specific facts the generic skill can't know — the two-suite split (CI-safe
  mocked-a11y vs local-only real-backend) and which suite a spec belongs in — live in the
  review overlay's `RV-FE-E2E` item, not in a separate skill.

- **`riviera-local-debug`** — the **build/test run recipes**: the cloud-session Gradle
  setup (system Gradle + JDK-25 toolchain; the wrapper cannot self-provision behind the
  repo-scoped proxy), the scoped-test discipline (never the bare `test` task in a cloud
  sandbox — it can OOM; CI owns the full suite), and the frontend commands. Load before
  the first `./gradlew`/`npm` invocation of a session.

## Agent skills (SDLC workflow)

This repo runs a software development life cycle loop. The **`riviera-sdlc`** skill is the
orchestrator — load it when starting or continuing feature work; it routes each
stage (refine → issue → plan → implement → CI → review → merge) to the right skill.

- **Issue tracker / triage labels / domain-doc layout:** see `docs/agents/`.
- **Domain glossary:** `CONTEXT.md`. **Decisions:** `docs/adr/`. **Roadmap:**
  `docs/architecture/improvement-plan.md` (tracked by epic #93).
- **Vendored craft skills** (Matt Pocock, MIT — `grilling`/`grill-me`, `to-issues`,
  `implement`, `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`,
  `triage`, `improve-codebase-architecture`) provide the generic engine; the
  `riviera-*` skills inject this project's invariants at the plan and review gates.
- **`postgres`** (PlanetScale database-skills, MIT, trimmed to the generic-Postgres
  subset) — table/schema/index design for Flyway migrations.
