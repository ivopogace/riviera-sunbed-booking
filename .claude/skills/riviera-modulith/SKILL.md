---
name: riviera-modulith
description: >-
  Spring Modulith structure authority for platform/: module layout, published surfaces
  (api/vocabulary/events/spi), allowedDependencies + verify(), port-vs-event. Load BEFORE
  creating or modifying any backend Java — "add a module", "expose this to another
  module", "where does this class go", "why does ModularityTests fail".
---

# Riviera Spring Modulith (hexagonal, JDBC-only)

Base package `ai.riviera.platform`; nine bounded-context modules — **venue, availability,
booking, payment, payout, customer, operator, notification, review** — plus two non-context
modules: **`shared`** (an OPEN Shared Kernel) and **`challenge`** (closed, full template,
ADR-0017). Spring Boot 4, Spring Modulith
2.1, Java 25, Gradle, Spring Data JDBC / `JdbcClient` only — no JPA.

**The root package is the composition root, and nothing may depend on it.**
`ai.riviera.platform` holds `PlatformApplication`, app-wide config, and the platform's own
adapters (controllers, the SSO/auth edge — no module listeners at the root, pinned by
`CompositionRootDisciplineTests`), so it depends on modules. Types that modules need go in
`shared`, never at the root: a package that is both depended-on and depending closes
cycles. If a module needs a type from the root, move the type to `shared`; don't weaken
`ModularityTests`. Keep `shared` tiny — no business logic, no module-owned state, no
dependency on a module that depends back.

Hands off: Java idioms → `riviera-java-conventions`; seam shape/depth → `codebase-design`;
SQL/schema/Flyway → `postgres`; payment/payout structure → `riviera-stripe-payments`.

**`ApplicationModules.of(PlatformApplication.class).verify()` is the definition of correct
structure.** It runs as `ai.riviera.platform.ModularityTests`; on failure, read the message
literally (it names the offending class and the broken rule) and fix the structure, not the test.

## Hard constraints

- **No JPA, ever** (invariant #1): persistence is `JdbcClient` + explicit text-block SQL by
  default (`references/persistence-jdbc.md`) — enforced by `JdbcOnlyArchitectureTests`.
- **Cross-module references by typed id, never object** (invariant #11) — a `Booking` holds
  a `SetId`, not a `Set`; same for event payloads. Ids live in the owner's `vocabulary/`
  (e.g. `venue.vocabulary.SetId`).
- **Cross-module collaboration only via the provider's `@NamedInterface` packages**
  (`api`/`vocabulary`/`events`/`spi`), never its `application.*`/`adapter.*`/`domain` —
  enforced by `ModularityTests`.
- **The package shape is machine-locked** — `PackageShapeArchitectureTests` (the package
  sets) + `PublishedSurfacePlacementArchitectureTests` (kind-per-surface).

## Module layout — two templates by weight (ADR-0007)

Each module is a direct sub-package of `ai.riviera.platform`; structure tracks weight. The
asymmetry the templates enforce is inside vs outside: `domain` + `application` are the
inside, `adapter/in` + `adapter/out` the outside. Driving adapters stay thin so the inside
never knows whether a real HTTP client, an `@ApplicationModuleTest`, or a future caller is
on the other side.

**Assignment rule: a module is THIN iff it has no application service** — its `api/` port
is implemented directly by a JDBC adapter. Otherwise it is FULL. Today all nine
bounded-context modules are full, and so is the non-context `challenge` (it has an
application service) — which has no `domain/` package, because it owns table-backed state
rather than an aggregate. The thin template is the documented shape for a future
serviceless module. Small LOC does not make a module thin (`availability` is small but
full); having no service does.

**`challenge` uses the full template** minus `domain/`, with `allowedDependencies = {}` — a
mechanism that knew a domain type would be a bounded context in disguise. **`shared` fits
neither template:** `@ApplicationModule(type = OPEN)`, a handful of flat
classes at the module root, no published surface (OPEN means consumers reference its types
directly), no `application`/`domain`/`adapter`. `PackageShapeArchitectureTests` skips
types at a module root. Don't copy the shape for a context, and don't grow `shared` into one.

### Thin template — serviceless modules
```
ai.riviera.platform.<module>/
├── package-info.java          # @ApplicationModule(allowedDependencies = {...})
├── api/                       # @NamedInterface("api") — the published port(s), interfaces only
├── vocabulary/                # @NamedInterface("vocabulary") — the published typed ids + value records
└── adapter/out/               # the JDBC adapter implementing the api port DIRECTLY (package-private)
```
No `application/`, no `domain/` — a single adapter is a hypothetical seam
(`codebase-design`); don't invent an empty layer. If the module grows a real service, it
graduates to the full template — a visible, reviewable refactor.

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
│   └── <use-case>/            # OPTIONAL sub-grouping by use-case — booking ONLY
├── domain/                    # INTERNAL: enums, value objects, aggregates, policies (framework-light)
└── adapter/
    ├── in/                    # driving adapters: @RestController, @ApplicationModuleListener (+ request/response DTOs)
    └── out/                   # driven adapters: JdbcClient repos / port impls (package-private)
```
All four published surfaces are optional; the current inventory is each module's
`package-info.java` (+ the CLAUDE.md module table). Don't force an empty surface onto a
module. Published surfaces stay top-level — nesting under `application` hides them from
Modulith. Notes the trees can't carry:

- The repository port stays an interface in `application/`, implemented by `adapter/out`
  (the inversion enables fakes in tests; it doesn't need an `in`/`out` package to prove it).
  A port graduates to `api/` only when another module must call it; to `spi/` only for a
  cross-module inversion. Both a `@RestController` and an `@ApplicationModuleListener` are
  driving adapters → `adapter/in`; if a technology axis is ever needed it's a sub-package
  (`adapter/in/rest`) — the primary split stays direction.
- **Name ports by purpose, never technology** — `CheckoutPort`, not `StripePort`;
  `AvailabilityClaim`, not `JdbcAvailabilityTable`.
- `booking` is the one module sliced by use-case: `application/reserve/`, `/request/`,
  `/cancel/`, `/checkin/`, `/refund/`, `/view/`, with the outbound `Bookings` port at
  `application/` root and `domain/` flat and shared. No other module is sliced.
- `@SpringBootApplication` (`PlatformApplication`) and app-wide config (`SecurityConfig`,
  `WebCorsConfig`, `TimeConfig`) stay in the root package; the root is not a module.
- A port is a purposeful conversation, not one-interface-per-use-case; favor two to four
  ports per module. Tempted by a fifth narrow port? Ask whether it's the same conversation
  as an existing one.

## The published surface, split by kind

Up to four top-level named interfaces, each holding one kind only, pinned by
`PublishedSurfacePlacementArchitectureTests` (which also checks every cross-module
transactional event listener's parameter lives in its owner's `events` surface — both the
`@ApplicationModuleListener` composite and the `@Async` + `@TransactionalEventListener`
expansion a listener needs to name its own executor):

- **`api/`** — ports only, plain interfaces others call (`venue.api.VenueCatalog`,
  `payment.api.CheckoutPort`). A wide port splits by consumer role: don't pile
  sibling-facing methods onto `VenueCatalog`; add to `SetBookingFacts`/`VenueRates`. A
  further tourist read on `VenueCatalog` is legitimate — the rule (`VenueApiRoleSplitTests`)
  asserts dependency direction, not a method-list freeze.
- **`vocabulary/`** — typed ids, value records, enums, sealed outcomes, exceptions
  (`venue.vocabulary.SetId`, `payment.vocabulary.Money`, `RefundResult`).
- **`events/`** — domain-event records only, id-based payloads (`booking.events.BookingConfirmed`).
- **`spi/`** — cross-module driven ports (next section).

Grants are least-privilege: a port caller lists `<provider>::api` + `::vocabulary`; a
listener-only consumer lists `<provider>::events` + `::vocabulary` — never a command
surface. Mechanics: `references/boundaries.md`. A moved/renamed published event needs a
Flyway `event_type` rewrite (`references/events.md`).

## `api` vs `spi` — the decision rule

Who implements the interface? Others **call** it → `api/` (the default). The module's
**own** `adapter/out` implements it → internal port in `application/`, unpublished.
**Another module** implements it (a cross-module dependency inversion to keep the graph
acyclic) → `spi/`, never `api/` — an "implement-me" interface in `api/` is what RV-BE-3b
flags. Worked example: `references/boundaries.md`.

## `api/` port vs domain event

- **Inbound `api/` port (synchronous)** when the caller needs an answer now — a query or a
  command whose result it must act on transactionally. `booking` calls
  `availability.api.AvailabilityClaim.claim(...)` and branches on the `ClaimOutcome` in the
  same transaction (invariant #2; documented on `AvailabilityClaim`).
- **Domain event (async, decoupled)** when the module just announces a fact — the
  write-side spine is CLAUDE.md's event inventory. No `availability` listener exists — the
  claim/release is the synchronous port. Sync-vs-async listener choice + the registry:
  `references/events.md`.

A module needing many synchronous beans from another is a coupling smell — prefer an event.

## The `operator` module (per-venue authorization)

Every venue-scoped application service consults `operator`'s ownership check
(`VenueOwnership.assertOwns` → `403` on mismatch, pinned by `CrossVenueDenialIT`) so no
driving adapter can bypass it — invariant #13. New venue-scoped command/query: grant
`operator::api` + `::vocabulary` and put the ownership check in the service, not the
controller. Platform-wide admin (`/api/admin/**`) stays role-gated. The module's contract:
`RESPONSIBILITIES.md` §`operator`.

## Verification

`./gradlew test --tests "*ModularityTests*"` — code and the other harnesses: `references/testing.md`.

## Checklist before finishing a backend structural change

- [ ] New class is in the right package (`api/`/`spi/`/`vocabulary/`/`events/` published;
      `application/` = service + its ports; `domain/` internal; `adapter/in`+`adapter/out`
      adapters, package-private). Thin module = `api/` + `vocabulary/` + `adapter/out/` only.
      No `.in`/`.out` at the application layer.
- [ ] A published type is in the surface for its kind: port → `api/`/`spi/` (plain
      interface); typed id / value record / sealed outcome / exception → `vocabulary/`; event
      record → `events/`. `PublishedSurfacePlacementArchitectureTests` passes.
- [ ] Cross-module use goes through the provider's published surfaces — no import of
      another module's `application.*`/`adapter.*`/`domain`.
- [ ] A cross-module driven port (implemented by another module) lives in `<module>.spi`,
      not `api/`; `<module>::spi` is granted only to the implementor.
- [ ] Aggregates and event payloads reference other aggregates by typed id, not by object.
- [ ] No JPA types introduced; persistence is `JdbcClient` + SQL (or a justified aggregate).
- [ ] `allowedDependencies` updated to the narrowest named interfaces if a genuinely new,
      non-cyclic dependency was added.
- [ ] A moved/renamed published event ships a Flyway `event_type` rewrite for the Event
      Publication Registry (see `V18__event_publication_event_type_moves.sql`).
- [ ] `ModularityTests.verifiesModularStructure()` passes.

## References

- `references/boundaries.md` — `@ApplicationModule`/grant mechanics, the least-privilege
  matrix, the `api`-vs-`spi` treatment + the `venue ↔ availability` worked example.
- `references/persistence-jdbc.md` — before `adapter/out`/repository/aggregate/migration
  work; the `JdbcClient` default + the Spring Data JDBC aggregate rules.
- `references/events.md` — before adding a cross-module event: sync vs async listeners,
  the Event Publication Registry, the event-move Flyway rewrite.
- `references/testing.md` — `@ApplicationModuleTest`, the `Scenario` DSL,
  `PublishedEvents`, `Documenter`, and the `ModularityTests` code.
