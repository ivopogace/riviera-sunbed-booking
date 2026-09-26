---
name: riviera-modulith
description: >-
  Spring Modulith structure authority for platform/: module layout, published surfaces
  (api/vocabulary/events/spi), allowedDependencies + verify(), port-vs-event. Load BEFORE
  creating or modifying any backend Java — "add a module", "expose this to another
  module", "where does this class go", "why does ModularityTests fail".
---

# Riviera Spring Modulith

Module census and collaboration inventory: `CLAUDE.md`.

**The root package is the composition root; nothing depends on it.** It holds
`PlatformApplication`, app-wide config (`SecurityConfig`, `WebCorsConfig`, `TimeConfig`) and
the platform's own adapters (controllers, the SSO/auth edge; no module listeners — pinned by
`CompositionRootDisciplineTests`). A type modules need goes in `shared`, never at the root.
Keep `shared` tiny: no business logic, no module-owned state. Moving a bean between the root
and a module can break every `@ApplicationModuleTest` (`riviera-local-debug` § *Blast radius*).

**`ApplicationModules.of(PlatformApplication.class).verify()` defines correct structure**
(`ModularityTests`). On failure, read the message literally and fix the structure, not the test.

Hands off: Java idioms → `riviera-java-conventions`; seams → `codebase-design`; SQL/Flyway →
`postgres`; payment structure → `riviera-stripe-payments`.

## Hard constraints

- **Typed ids across modules** (#11), living in the owner's `vocabulary/`.
- **Cross-module use only via `@NamedInterface` packages** (`api`/`vocabulary`/`events`/`spi`),
  never `application.*`/`adapter.*`/`domain`; `ModularityTests`.
- **Package shape is machine-locked**: `PackageShapeArchitectureTests` +
  `PublishedSurfacePlacementArchitectureTests`.
- **Rules (ADR-0018 §1):** a **choice** (window, tier, bound, rate, rounding), a
  **calculation** (money, rating) or a **lifecycle** (what may follow what) is a rule;
  anything else is procedure and stays in the service. A rule with one caller stays inline;
  two callers that must agree earn a named holder. Name it narrowly
  (`BookingStatus.canStillBeHonoured()`), never more generally than it is.
- **`domain/` is framework-free**: a pure rule goes there; one needing a `Clock`, a port or
  config goes in `application/` as a named, unit-tested holder (`BookingCutoff`,
  `CancellationPolicy`, `RequestWindows`). A set invariant belongs in a DB constraint.
  `DomainPurityArchitectureTests`: a `domain/` class may import the JDK and any module's
  `vocabulary/`/`domain/`, nothing else. A Java mirror of a DB *bound or vocabulary*
  (`Stars` ↔ `review_stars_check`) is fine if its Javadoc names the twin.

## Module layout (ADR-0007)

**THIN iff no application service** (the `api/` port is implemented directly by a JDBC
adapter); otherwise FULL. All nine domain modules, the `itinerary` read model and `challenge` are
full; `audit` is thin plus a driving `adapter/in` (its admin controller). `challenge` is full minus
`domain/`.
`shared` is neither: `@ApplicationModule(type = OPEN)`, flat classes at the module root, no
published surface, no layers.

Thin:
```
<module>/
├── package-info.java          # @ApplicationModule(allowedDependencies = {...})
├── api/                       # @NamedInterface("api") — ports, interfaces only
├── vocabulary/                # @NamedInterface("vocabulary") — typed ids + value records
└── adapter/out/               # package-private JDBC adapter implementing the api port
```
No empty `application/`/`domain/`; growing a service graduates it to full.

Full:
```
<module>/
├── package-info.java
├── api/                       # ONLY if a sibling calls a port here; plain interfaces, never sealed
├── vocabulary/                # ONLY if it publishes ids/values/enums/sealed outcomes/exceptions
├── events/                    # ONLY if it publishes events; RECORDS only, id-based
├── spi/                       # ONLY if it owns a cross-module inversion (driven ports others implement)
├── application/               # package-private @Service/@Transactional + their port interfaces, no in/out split
│   └── <use-case>/            #   booking ONLY (reserve/request/cancel/checkin/refund/view/remodel)
├── domain/                    # framework-free rules, value objects, enums
└── adapter/
    ├── in/                    # @RestController, @ApplicationModuleListener, DTOs
    └── out/                   # package-private JdbcClient adapters / port impls
```
Published surfaces stay top-level (each `package-info.java` has `@NamedInterface`). The
repository port is an interface in `application/`, implemented by `adapter/out`; it moves to
`api/` only when another module calls it, to `spi/` only for a cross-module inversion. Name
ports by purpose (`CheckoutPort`, not `StripePort`). Ports split by consumer role or
conversation, not by count or table (`RESPONSIBILITIES.md` §`review`: one port per consumer
role). A new port needs a new consumer conversation; a new family of methods for an existing
conversation joins that conversation's port.

## Published surface by kind

Pinned by `PublishedSurfacePlacementArchitectureTests` (which also requires a cross-module
listener's parameter to live in its owner's `events` surface):

- `api/` — ports only. A wide port splits by consumer role: sibling-facing methods go on
  `SetBookingFacts`/`VenueRates`, not `VenueCatalog` (a further tourist read on `VenueCatalog`
  is fine; `VenueApiRoleSplitTests` asserts direction, not a method list).
- `vocabulary/` — ids, value records, enums, sealed outcomes, exceptions.
- `events/` — event records only.
- `spi/` — cross-module driven ports.

Grants are least-privilege: a caller lists `<provider>::api` + `::vocabulary`; a listener-only
consumer lists `::events` + `::vocabulary`. Mechanics: `references/boundaries.md`. A moved or
renamed event needs a Flyway `event_type` rewrite (`references/events.md`).

## api vs spi; port vs event

Others **call** it → `api/`. The module's own adapter implements it → internal in
`application/`. **Another module** implements it → `spi/` (RV-BE-3b flags an implement-me
interface in `api/`).

Synchronous `api/` port when the caller needs an answer now (`booking` branches on
`AvailabilityClaim.claim(...)`'s `ClaimOutcome` in the same transaction). Event when the module
just announces a fact; `availability` has no listener. Needing many synchronous beans from
another module is a coupling smell — prefer an event.

## `operator` (per-venue authorization, #13)

Every venue-scoped application service calls `VenueOwnership.assertOwns` (→ `403`, pinned by
`CrossVenueDenialIT`). A new venue-scoped command/query: grant `operator::api` +
`::vocabulary`; the check goes in the service, not the controller. `/api/admin/**` is role-gated.

## The structural net

Run the six-test command in `CLAUDE.md` § *Commands* after any structure change
(`riviera-local-debug` has the cloud form). Membership: a test whose one rule holds the whole
tree to the same standard keyed on package, kind or imports alone, names no target, runs
without a Spring context, fails on a violation. Five members follow from the rule; the sixth,
`RetiredSetExclusionArchitectureTests`, names its table and is admitted by decision (ADR-0019)
because any new JDBC adapter can break it. Target-naming fitness functions
(`CompositionRootDisciplineTests`, `ErrorContractArchitectureTests`,
`ResponsibilitiesArchitectureTests`, `*AuthPlacementTests`, `VenueApiRoleSplitTests`) are not
members; work on what they name puts them due. ADR-0017's "structural nets" and the three-test
command in `docs/agents/gradle-proxy-trust.md` are not this net.

References: `references/boundaries.md` (grants, api vs spi worked example),
`references/persistence-jdbc.md`, `references/events.md`, `references/testing.md`.
