---
name: riviera-modulith
description: >-
  The Spring Modulith STRUCTURE authority for riviera-sunbed-booking — module package layout, the
  published surfaces (api/vocabulary/events/spi), @ApplicationModule/allowedDependencies,
  port-vs-event collaboration, the ApplicationModules.verify() contract, the Event Publication
  Registry, and module-scoped tests. Load BEFORE creating or modifying ANY backend Java in
  platform/ — trigger on "add a module", "expose this to another module", "where does this class
  go", "why does ModularityTests fail", or any work in the venue / availability / booking /
  payment / payout / customer / operator modules. Concrete mechanics for invariants #11 and #1
  (canonical in CLAUDE.md). Pairs with riviera-java-conventions, codebase-design, and postgres.
---

# Riviera Spring Modulith (hexagonal, JDBC-only)

**Announce at start:** *"Loaded riviera-modulith — applying the project's module layout,
api/-named-interface boundaries, and the ApplicationModules.verify() contract."*

riviera-sunbed-booking is a Spring Modulith modular monolith: base package **`ai.riviera.platform`**,
seven bounded-context modules — **venue, availability, booking, payment, payout, customer,
operator** (table in `CLAUDE.md`) — on **Spring Boot 4, Spring Modulith 2.1, Java 25, Gradle,
Spring Data JDBC / `JdbcClient` only — no JPA**.

This skill owns the **structural mechanics** — it makes **invariant #11** (hexagonal, id-based
boundaries) and **invariant #1** (JDBC-only) concrete; the numbered invariants stay canonical in
`CLAUDE.md`. Hands off: **Java idioms** → `riviera-java-conventions`; **seam shape / depth** →
`codebase-design`; **SQL/schema/Flyway** → `postgres`; **payment/payout structure** →
`riviera-stripe-payments`.

The single most important rule: **`ApplicationModules.of(PlatformApplication.class).verify()` is
the definition of "correct structure," not intuition.** It already runs as
`ai.riviera.platform.ModularityTests`; on failure, read the message literally (it names the
offending class and the broken rule) and fix the **structure**, not the test.

## Hard constraints (do not violate)

- **No JPA, ever** (invariant #1): persistence is `JdbcClient` + explicit text-block SQL by default
  (`references/persistence-jdbc.md`) — enforced by `JdbcOnlyArchitectureTests`.
- **Cross-module references by typed id, never object** (invariant #11) — a `Booking` holds a
  `SetId`, not a `Set`; same for event payloads. Ids live in the owner's `vocabulary/`
  (e.g. `venue.vocabulary.SetId`).
- **Cross-module collaboration only via the provider's `@NamedInterface` packages**
  (`api`/`vocabulary`/`events`/`spi`), never its `application.*`/`adapter.*`/`domain` — enforced by
  `ModularityTests` (`verify()`).
- **The package shape is machine-locked** — `PackageShapeArchitectureTests` (the package sets) +
  `PublishedSurfacePlacementArchitectureTests` (kind-per-surface): build failures, not judgment calls.

## Module layout — two templates by weight (ADR-0007, landed — case history)

Each module is a direct sub-package of `ai.riviera.platform`; there is **no single fixed shape** —
structure tracks weight. The asymmetry the templates enforce is **inside vs outside**: `domain` +
`application` are the inside, `adapter/in` + `adapter/out` the outside. Driving adapters stay thin
so the inside never knows whether a real HTTP client, an `@ApplicationModuleTest`, or a future
caller is on the other side.

**Assignment rule (mechanical): a module is THIN iff it has no application service** — its `api/`
port is implemented directly by a JDBC adapter. Otherwise it is FULL. Today: `customer` = thin;
`booking`/`venue`/`payment`/`payout`/`availability`/`operator` = full. `availability` is "small but
full" — it owns a published command port with real concurrency semantics; small LOC does not make a
module thin, **having no service** does.

### Thin template — serviceless modules (today: only `customer`)
```
ai.riviera.platform.<module>/
├── package-info.java          # @ApplicationModule(allowedDependencies = {...})
├── api/                       # @NamedInterface("api") — the published port(s), interfaces only
├── vocabulary/                # @NamedInterface("vocabulary") — the published typed ids + value records
└── adapter/out/               # the JDBC adapter implementing the api port DIRECTLY (package-private)
```
No `application/`, no `domain/` — a single adapter is a *hypothetical* seam (`codebase-design`);
don't invent an empty layer for it. If the module grows a real service, it **graduates** to the
full template — a visible, reviewable refactor, a feature not a cost. The `adapter/out/`-vs-
`internal/` bucket question is open — settle once (case history).

### Full template — everything else
```
ai.riviera.platform.<module>/
├── package-info.java          # @ApplicationModule(allowedDependencies = {...})
├── api/                       # @NamedInterface("api") — ONLY if a sibling calls a port here; PORTS ONLY
│   └── package-info.java      #   inbound "call-me" interfaces (plain, never sealed)
├── vocabulary/                # @NamedInterface("vocabulary") — ONLY if the module publishes ids/values
│   └── package-info.java      #   typed ids, value records, enums, sealed outcome types, exceptions
├── events/                    # @NamedInterface("events") — ONLY if the module publishes domain events
│   └── package-info.java      #   published event RECORDS only (id-based payloads)
├── spi/                       # @NamedInterface("spi") — ONLY if this module owns a cross-module inversion
│   └── package-info.java      #   driven ports another module IMPLEMENTS for this one
├── application/               # services (package-private @Service/@Transactional) + their driving/driven
│   │                          #   PORT interfaces, TOGETHER — no in/out sub-split (direction lives in adapter/)
│   └── <use-case>/            # OPTIONAL sub-grouping by use-case — booking ONLY (reserve/cancel/refund/view)
├── domain/                    # INTERNAL: enums, value objects, aggregates, policies (framework-light)
└── adapter/
    ├── in/                    # driving adapters: @RestController, @ApplicationModuleListener (+ request/response DTOs)
    └── out/                   # driven adapters: JdbcClient repos / port impls (package-private)
```
All four published surfaces are **optional** — `payout` (pure event subscriber) has none; `booking`
has `events/` + `vocabulary/` but **no `api/` at all**; only `venue` has `spi` today. Don't force
an empty surface onto a module. Published surfaces stay **top-level and exposed** — nesting under
`application` would hide them from Modulith. Notes the trees can't carry:

- The repository port stays an interface in `application/`, implemented by `adapter/out` — the
  inversion is real (it enables fakes in tests); it just doesn't need an `in`/`out` package to
  prove it. A port graduates to `api/` only when another module must call it; to `spi/` only for a
  cross-module inversion. Both a `@RestController` and an `@ApplicationModuleListener` are
  *driving* adapters → both `adapter/in`; if a technology axis is ever needed it's a *sub*-package
  (`adapter/in/rest`) — the primary split stays **direction**.
- **Name ports by purpose, never technology** — `CheckoutPort`, not `StripePort`;
  `AvailabilityClaim`, not `JdbcAvailabilityTable`. The name must survive swapping the adapter.
- `booking` is the **one** module sliced by use-case (8 services): `application/reserve/`,
  `/cancel/`, `/refund/`, `/view/`, with the outbound `Bookings` port shared at `application/` root
  and `domain/` flat and shared. **No other module is sliced** — none has the mass.
- Keep `@SpringBootApplication` (`PlatformApplication`) and app-wide config (`SecurityConfig`,
  `WebCorsConfig`, `TimeConfig`) in the root package only; the root is not a module.

> **A port is a purposeful conversation, not one-interface-per-use-case.** Cockburn: *"A port
> identifies a purposeful conversation,"* favoring *"a small number, two, three or four ports."*
> Tempted by a fifth narrow port? Ask whether it's the same conversation as an existing one.

## The published surface, split by kind (#95)

Up to four top-level named interfaces — each present only if the module publishes that kind, each
holding **one kind only**, pinned by `PublishedSurfacePlacementArchitectureTests` (which also checks
every cross-module `@ApplicationModuleListener` parameter lives in its owner's `events` surface):

- **`api/`** — **ports only**, plain interfaces others call (`venue.api.VenueCatalog`,
  `payment.api.CheckoutPort`). A wide port **splits by consumer role** (#94 — case history): don't
  pile methods onto `VenueCatalog`; add to `SetBookingFacts`/`VenueRates` (`VenueApiRoleSplitTests`).
- **`vocabulary/`** — typed ids, value records, enums, sealed outcomes, exceptions
  (`venue.vocabulary.SetId`, `payment.vocabulary.Money`, `RefundResult`).
- **`events/`** — domain-event **records** only, id-based payloads (`booking.events.BookingConfirmed`).
- **`spi/`** — cross-module **driven** ports (next section).

Grants are **least-privilege** (#95): a port caller lists `<provider>::api` + `::vocabulary` (the
types the port speaks); a listener-only consumer lists `<provider>::events` + `::vocabulary` —
never a command surface. Full grant + `allowedDependencies` mechanics: `references/boundaries.md`.
A moved/renamed published event needs a Flyway `event_type` rewrite (`references/events.md`).

## `api` vs `spi` — the decision rule

Who implements the interface? Others **call** it → `api/` (inbound — the default; reach for it
first). The module's **own** `adapter/out` implements it → internal port in `application/`,
unpublished. **Another module** implements it (a cross-module dependency inversion to keep the
graph acyclic) → `spi/`, **never** `api/` — an "implement-me" interface in `api/` is exactly the
smell `riviera-review-overlay` RV-BE-3b flags. Full treatment + the #44 `venue ↔ availability`
worked example: `references/boundaries.md`.

## Choosing between an `api/` port and a domain event

- **Inbound `api/` port (synchronous)** when the caller needs an answer *now* — a query or a
  command whose result it must act on transactionally. U3: `booking` calls
  `availability.api.AvailabilityClaim.claim(...)` and branches on the `ClaimOutcome` in the same
  transaction.
- **Domain event (async, decoupled)** when the module just announces a fact — the write-side
  spine: **U5 `BookingConfirmed`** → `availability` marks the set `BOOKED_ONLINE` *and* `payout`
  accrues a ledger entry, as two independent listeners. Events break would-be cycles. Sync-vs-async
  listener choice + the registry: `references/events.md`.

A module needing many synchronous beans from another is a coupling smell — prefer an event. The
claim is a deliberate synchronous exception (the caller must know the outcome to proceed —
invariant #2), documented on `AvailabilityClaim`.

## The `operator` module (per-venue authorization)

**Shipped** (#73 module + ownership, #74 per-operator credentials). It owns operator accounts and
the **operator↔venue ownership mapping**, publishing `operator::api` (the `VenueOwnership` query
port) + `operator::vocabulary`. Every venue-scoped **application service** consults it
(`assertOwns` → `403` on mismatch, pinned by `CrossVenueDenialIT`) so no driving adapter can bypass
the check — invariant #13. Platform-wide admin (`/api/admin/**`) stays role-gated. New venue-scoped
command/query: grant `operator::api` + `::vocabulary` and put the ownership check in the service,
not the controller. Remaining follow-up: retire the owns-all bootstrap operator +
creator-owns-on-create (see `CLAUDE.md`).

## Verification

Run targeted: `./gradlew test --tests "*ModularityTests*"` — code: `references/testing.md`.

## Quick checklist before finishing a backend structural change

- [ ] New class is in the right package (`api/`/`spi/`/`vocabulary/`/`events/` published;
      `application/` = service + its ports; `domain/` internal; `adapter/in`+`adapter/out` adapters,
      package-private). Thin module (no service) = `api/` + `vocabulary/` + `adapter/out/` only.
      No `.in`/`.out` at the application layer (ADR-0007).
- [ ] A published type is in the surface for its **kind** (issue #95): port → `api/`/`spi/` (plain
      interface); typed id / value record / sealed outcome / exception → `vocabulary/`; event record
      → `events/`. `PublishedSurfacePlacementArchitectureTests` passes.
- [ ] Cross-module use goes through the provider's published surfaces (`::api` port, `::events`
      record, `::vocabulary` types) — no import of another module's `application.*`/`adapter.*`/`domain`.
- [ ] A cross-module **driven** port (implemented by *another* module) lives in `<module>.spi`
      (`@NamedInterface("spi")`), **not** `api/`; `<module>::spi` is granted only to the implementor.
- [ ] Aggregates and event payloads reference other aggregates by **typed id**, not by object.
- [ ] No JPA types introduced; persistence is `JdbcClient` + SQL (or a justified aggregate).
- [ ] `allowedDependencies` updated to the **narrowest** named interfaces if a genuinely new,
      non-cyclic dependency was added (if the module declares them).
- [ ] A moved/renamed **published event** ships a Flyway `event_type` rewrite for the Event
      Publication Registry (see `V18__event_publication_event_type_moves.sql`).
- [ ] `ModularityTests.verifiesModularStructure()` passes (`./gradlew test --tests "*ModularityTests*"`).

## References — read before non-trivial work

- **`references/boundaries.md`** — `@ApplicationModule`/grant mechanics, the least-privilege
  matrix, the full `api`-vs-`spi` treatment + the #44 worked example.
- **`references/persistence-jdbc.md`** — before `adapter/out`/repository/aggregate/migration work;
  the `JdbcClient` default + the canonical Spring Data JDBC aggregate rules.
- **`references/events.md`** — before adding a cross-module event: sync vs async listeners, the
  Event Publication Registry, the event-move Flyway rewrite.
- **`references/testing.md`** — module tests: `@ApplicationModuleTest`, the `Scenario` DSL,
  `PublishedEvents`, `Documenter`, and the `ModularityTests` code.
- **`references/case-history.md`** — why ADR-0007 / #95 / #94 / #44 landed as they did + open TODOs.

## Integration

- **`CLAUDE.md`** — invariants #11 (boundaries) and #1 (JDBC-only) this skill makes concrete.
- **`riviera-java-conventions`** — Java idioms behind the structure (records, sealed outcomes,
  package-private adapters, JdbcClient-vs-aggregate). **`codebase-design`** — whether a seam is real.
  **`postgres`** — the SQL/schema. **`riviera-stripe-payments`** — payment/payout module structure.
- **`riviera-sdlc`** — loads this at the Skill-routing gate for any backend create/modify;
  **`riviera-review-overlay`** — RV-BE checks boundaries on the diff; RV-PROC-1 checks this skill is
  in the plan's *Skills consulted* line when backend structure changed.
