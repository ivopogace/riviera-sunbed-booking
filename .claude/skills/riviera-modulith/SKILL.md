---
name: riviera-modulith
description: >-
  The Spring Modulith STRUCTURE authority for riviera-sunbed-booking — module package layout,
  @ApplicationModule / @NamedInterface boundaries, the api/ published surface, cross-module
  collaboration (api/ ports vs domain events with id-based payloads), the
  ApplicationModules.verify() contract, the Event Publication Registry, and module-scoped tests
  (@ApplicationModuleTest / Scenario / Documenter). Load it BEFORE creating or modifying ANY
  backend Java in platform/ — a new module, an api/ port, an application service, a domain event,
  a JDBC adapter, a controller, or anything that moves a class between packages. Trigger it even
  when the user does not say "Modulith": "add a module", "expose this to another module", "wire an
  event between X and Y", "where does this class go", "why does ModularityTests fail", or any work
  in the venue / availability / booking / payment / payout / customer modules. It encodes invariant
  #11 (and #1's JDBC-only) as concrete mechanics; it does NOT restate the numbered invariants
  (those are canonical in CLAUDE.md). Pairs with riviera-java-conventions (Java idioms),
  codebase-design (seam shape), and postgres (SQL).
---

# Riviera Spring Modulith (hexagonal, JDBC-only)

**Announce at start:** *"Loaded riviera-modulith — applying the project's module layout,
api/-named-interface boundaries, and the ApplicationModules.verify() contract."*

riviera-sunbed-booking is a Spring Modulith modular monolith. Base package
**`ai.riviera.platform`**; six bounded-context modules — **venue, availability, booking, payment,
payout, customer** (see the table in `CLAUDE.md`). Stack: **Spring Boot 4, Spring Modulith 2.1,
Java 25, Gradle**, **Spring Data JDBC / `JdbcClient` only — no JPA**.

This skill owns the **structural mechanics**. It does not repeat the numbered invariants
(canonical in `CLAUDE.md`); it makes **invariant #11** (Modulith boundaries are hexagonal and
id-based) and **invariant #1** (JDBC-only) concrete, and hands off:
- **Java language idioms** (records, sealed types, constructor injection, typed outcomes, the
  JdbcClient-vs-aggregate decision) → **`riviera-java-conventions`**.
- **Seam shape / depth** (is this port a real seam or a hypothetical one?) → **`codebase-design`**.
- **SQL / schema / Flyway** → **`postgres`**. **Payment/payout structure** → **`riviera-stripe-payments`**.

The single most important rule: **`ApplicationModules.of(PlatformApplication.class).verify()` is the
definition of "correct structure," not intuition.** It already runs as
`ai.riviera.platform.ModularityTests` and must stay green.

## Hard constraints (do not violate)

1. **No JPA, ever** (invariant #1). No `jakarta.persistence.*` (`@Entity`, that package's `@Table`/
   `@Id`), `JpaRepository`, `@OneToMany`/`@ManyToOne`, Hibernate, or `spring-boot-starter-data-jpa`.
   Persistence is **`JdbcClient` + explicit text-block SQL** by default (see
   `references/persistence-jdbc.md`). `JdbcOnlyArchitectureTests` enforces this.
2. **Cross-module references are by typed id, never by object** (invariant #11). A `Booking` holds a
   `SetId`/`VenueId`/`CustomerId`, not a `Set`/`Customer`. Same for event payloads. The typed ids
   live in the owning module's `api/` (e.g. `venue.api.SetId`, `customer.api.CustomerId`).
3. **Cross-module collaboration goes through the other module's `api/` port OR a domain event —
   never a reach into its `application.*` / `infrastructure.*` / `domain`.** The only package another
   module may import is the `@NamedInterface("api")` package.
4. **`ModularityTests.verifiesModularStructure()` stays green** after any structural change. A
   failure is the design being wrong, not the test.

## Module layout (our hexagon)

Each module is a direct sub-package of `ai.riviera.platform`. Use this shape — it matches the
existing `venue`, `availability`, `booking`, `customer`, `payment` modules. The **published surface
is the `api/` package**, exposed as `@NamedInterface("api")`.

The asymmetry this layout enforces is **inside vs outside**, not left vs right. Cockburn's framing:
*"The asymmetry to exploit is not that between left and right sides of the application but between
inside and outside... code pertaining to the inside part should not leak into the outside part."*
`domain` + `application` are the inside; `infrastructure.in/out` are the outside adapters. The whole
point of keeping driving adapters (`@RestController`) thin is that the inside must not know whether a
real HTTP client, an `@ApplicationModuleTest`, or a future app-to-app caller is on the other side.

```
ai.riviera.platform.<module>/
├── package-info.java                 # @ApplicationModule(displayName = "...")
├── api/                              # @NamedInterface("api") — THE published surface:
│   ├── package-info.java             #   query/command ports (interfaces) + typed ids
│   │                                 #   + DTO/value records + published domain-event records
├── application/
│   ├── in/                           # INTERNAL driving (use-case) ports + command/result types,
│   │                                 #   when NOT published cross-module (e.g. booking.application.in.CreateBooking)
│   ├── <Service>.java                #   application services implementing a port (package-private, @Service/@Transactional)
│   └── out/                          # outbound (driven) ports the domain needs (e.g. booking.application.out.Bookings)
├── domain/                          # INTERNAL: enums, value objects, aggregates (framework-light)
└── infrastructure/
    ├── in/                           # driving adapters: @RestController, future @ApplicationModuleListener
    └── out/                          # driven adapters: JdbcClient repos / port impls (package-private @Repository/@Component)
```

Why this shape (and how it maps to real code):

- **`api/` is the module's public API and the only thing other modules may import.** It holds the
  published **ports** (`venue.api.VenueCatalog`, `availability.api.AvailabilityClaim`,
  `customer.api.CustomerDirectory`, `payment.api.CheckoutPort`), the **typed ids**
  (`venue.api.SetId`/`VenueId`), the **DTO/value records** (`venue.api.SetBookingInfo`,
  `payment.api.Money`), and **published event records** (U5: `booking.api.BookingConfirmed`).
  Mark it `@NamedInterface("api")` via its own `package-info.java`. Other modules reference it as
  `<module>::api`. **Name ports by purpose, never by technology** — the weather-system lesson from
  Cockburn's article (*"architect the system's interfaces by purpose rather than by technology"*).
  `CheckoutPort`, not `StripePort`; `AvailabilityClaim`, not `JdbcAvailabilityTable`. The technology
  is the *adapter's* concern in `infrastructure/out`; the port name must survive swapping it.
- **`application/in` is for INTERNAL driving ports** — a use-case interface the module's own web
  adapter calls but that no *other* module needs (e.g. `booking.application.in.CreateBooking`,
  implemented by package-private `booking.application.CreateBookingService`). Keep it here, NOT in
  `api/`, precisely because it is not cross-module surface. Promote a port to `api/` only when
  another module must call it.
- **`application/out` holds outbound (driven) ports** the orchestration needs
  (`booking.application.out.Bookings`, `BookingCodeGenerator`). Internal to the module.
- **`domain` is internal.** Enums/value objects/aggregates (`booking.domain.BookingStatus`).
- **`infrastructure/in` / `infrastructure/out` are internal adapters** — controllers and
  `JdbcClient` repositories, package-private (`JdbcVenueCatalog`, `JdbcBookings`,
  `BookingController`).

Keep `@SpringBootApplication` (`PlatformApplication`) in the root package only; never put shared
domain types there. App-wide config (`SecurityConfig`, `WebCorsConfig`, `TimeConfig`) also lives in
the root and is not a module.

> **Single-adapter modules may collapse the layers.** `venue`/`availability`/`customer` implement
> their `api/` port *directly* with a `JdbcClient` adapter in `infrastructure/out` — no
> `application` layer — because a single implementation is a *hypothetical* seam (`codebase-design`).
> `booking` keeps the full hexagon because it genuinely **orchestrates** four modules. Use the full
> layout when there is real orchestration; collapse it when the module is a thin query/command
> adapter. Don't add an empty `application` layer for its own sake.

> **A port is a purposeful conversation, not one-interface-per-use-case.** Cockburn's 2005
> ports-and-adapters article: *"A port identifies a purposeful conversation"* and favors *"a small
> number, two, three or four ports."* Mirror that here — a module's `api/` exposes a *few* intent-named
> ports (`AvailabilityClaim`, `VenueCatalog`, `CheckoutPort`), not one port per method. If you're
> tempted to add a fifth narrow port, ask whether it's the same conversation as an existing one.

## Declaring boundaries

Today each module declares only a display name:

```java
@org.springframework.modulith.ApplicationModule(displayName = "Booking")
package ai.riviera.platform.booking;
```

and exposes its `api/`:

```java
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
```

**Recommended tightening (deny-by-default):** for a new module, list its `allowedDependencies`
explicitly so an accidental new coupling fails `verify()` loudly. List each as `<module>::api`:

```java
@org.springframework.modulith.ApplicationModule(
    displayName = "Booking",
    allowedDependencies = { "venue::api", "availability::api", "customer::api", "payment::api" }
)
package ai.riviera.platform.booking;
```

If you add `allowedDependencies`, it must list **every** module the code legitimately uses or
`verify()` fails — run `ModularityTests` immediately after. (Existing modules don't set this yet;
adding it is a safe, encouraged follow-up, not a requirement for an unrelated change.)

## Choosing between an `api/` port and a domain event

- **Inbound `api/` port (synchronous)** when the caller needs an answer *now* — a query or a command
  whose result it must act on transactionally. This is what U3 does: `booking` calls
  `availability.api.AvailabilityClaim.claim(...)` and branches on the `ClaimOutcome` in the same
  transaction. Depend on `<module>::api`, inject the port interface.
- **Domain event (async, decoupled)** when the module just announces a fact and doesn't care who
  reacts. This is the spine for write-side fan-out: **U5 `BookingConfirmed`** → `availability` marks
  the set `BOOKED_ONLINE` *and* `payout` accrues a ledger entry, as two independent listeners.
  `BookingCancelled` → `availability` frees the set + `payment` refunds. Events break would-be
  cycles. See `references/events.md`.

A module needing many synchronous beans from another is a coupling smell — prefer an event. The
claim is a deliberate synchronous exception (the caller must know the outcome to proceed — invariant
#2), documented on `AvailabilityClaim`.

## The verification test (already present, always green)

`ai.riviera.platform.ModularityTests` IS the contract — pure structural analysis, no Spring context,
no DB, so it runs without Docker:

```java
class ModularityTests {
    static final ApplicationModules modules = ApplicationModules.of(PlatformApplication.class);

    @Test
    void verifiesModularStructure() {
        modules.verify();   // rejects cycles, internal access, disallowed dependencies
    }
}
```

When it fails, read the message literally — it names the offending class and the broken rule — and
fix the **structure**, not the test. To debug the detected arrangement:
`modules.forEach(System.out::println)`. Run targeted: `./gradlew test --tests "*ModularityTests*"`.

## Reference files — read before non-trivial work

- **`references/persistence-jdbc.md`** — before touching `infrastructure/out`, a repository, an
  aggregate, or a migration. **`JdbcClient` + explicit SQL is the default here**; a Spring Data JDBC
  aggregate is the *exception* (only when a row cluster is one consistency unit). The JPA
  anti-patterns to refuse. (Pairs with `riviera-java-conventions` §1/§1a and `postgres`.)
- **`references/events.md`** — before adding a cross-module event (U5+). `@ApplicationModuleListener`,
  id-only payloads in `api/`, the Event Publication Registry on `spring-modulith-starter-jdbc`.
- **`references/testing.md`** — before writing module tests. `@ApplicationModuleTest`, the `Scenario`
  DSL, `PublishedEvents`/`AssertablePublishedEvents`, and `Documenter`, alongside our Testcontainers
  IT style.

## Quick checklist before finishing a backend structural change

- [ ] New class is in the right package (`api/` published; `application.in/out` ports; `domain`
      internal; `infrastructure.in/out` adapters, package-private).
- [ ] Cross-module use goes through `<module>::api` (port or published event record) — no import of
      another module's `application.*`/`infrastructure.*`/`domain`.
- [ ] Aggregates and event payloads reference other aggregates by **typed id**, not by object.
- [ ] No JPA types introduced; persistence is `JdbcClient` + SQL (or a justified aggregate).
- [ ] `allowedDependencies` updated if a genuinely new, non-cyclic dependency was added (if the
      module declares them).
- [ ] `ModularityTests.verifiesModularStructure()` passes (`./gradlew test --tests "*ModularityTests*"`).

## Integration

- **`CLAUDE.md`** — invariants #11 (boundaries) and #1 (JDBC-only) this skill makes concrete.
- **`riviera-java-conventions`** — Java idioms behind the structure (records, sealed outcomes,
  package-private adapters, JdbcClient-vs-aggregate). **`codebase-design`** — whether a seam is real.
  **`postgres`** — the SQL/schema. **`riviera-stripe-payments`** — payment/payout module structure.
- **`riviera-sdd`** — loads this at the Skill-routing gate for any backend create/modify;
  **`riviera-review-overlay`** — RV-BE checks boundaries on the diff; RV-PROC-1 checks this skill is
  in the plan's *Skills consulted* line when backend structure changed.
