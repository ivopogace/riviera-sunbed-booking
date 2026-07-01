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
   never a reach into its `application.*` / `adapter.*` / `domain`.** The only packages
   another module may import are the module's `@NamedInterface` packages: `api` (inbound ports
   others call) and, when present, `spi` (driven ports another module implements — see
   *`api` vs `spi`* below).
4. **`ModularityTests.verifiesModularStructure()` stays green** after any structural change. A
   failure is the design being wrong, not the test.

## Module layout — two templates by weight (ADR-0007)

Each module is a direct sub-package of `ai.riviera.platform`. There is **no single fixed shape** — a
module's structure tracks its weight. The **published surface is split by kind** (ADR-0007 Amendment 1,
issue #95) into up to four top-level named interfaces: **`api/`** (`@NamedInterface("api")` — ports
only), **`vocabulary/`** (published typed ids / value / outcome types), **`events/`** (published
domain-event records), and **`spi/`** (cross-module driven ports). All stay **top-level and exposed** —
never nested under `application`, which would hide them from Modulith — and each is present **only if
the module publishes that kind**.

> **Landed (ADR-0007 + Amendment 1).** All modules use this shape; it is machine-locked by
> `PackageShapeArchitectureTests` (the package sets) and `PublishedSurfacePlacementArchitectureTests`
> (which kind of type may live in which published surface). Write new modules directly in it.

The asymmetry this enforces is **inside vs outside**, not left vs right. Cockburn: *"The asymmetry to
exploit is not that between left and right sides of the application but between inside and outside...
code pertaining to the inside part should not leak into the outside part."* `domain` + `application`
are the inside; `adapter/in` + `adapter/out` are the outside. Driving adapters (`@RestController`,
`@ApplicationModuleListener`) stay thin so the inside never knows whether a real HTTP client, an
`@ApplicationModuleTest`, or a future caller is on the other side.

**Assignment rule (mechanical): a module is THIN iff it has no application service** — its `api/` port
is implemented directly by a JDBC adapter. Otherwise it is FULL. Today: `customer` = thin;
`booking`/`venue`/`payment`/`payout`/`availability`/`operator` = full. `availability` is "small but
full" because it owns a published command port with real concurrency semantics — small LOC does not
make a module thin; **having no service** does.

### Thin template — serviceless modules (today: only `customer`)
```
ai.riviera.platform.<module>/
├── package-info.java          # @ApplicationModule(allowedDependencies = {...})
├── api/                       # @NamedInterface("api") — the published port(s), interfaces only
├── vocabulary/                # @NamedInterface("vocabulary") — the published typed ids + value records
└── adapter/out/               # the JDBC adapter implementing the api port DIRECTLY (package-private)
```
No `application/`, no `domain/` — a single adapter is a *hypothetical* seam (`codebase-design`), so
don't invent an empty layer for it. If the module grows a real service, it **graduates** to the full
template (a visible, reviewable refactor — a feature, not a cost). *(Open detail: `customer`'s adapter
bucket is `adapter/out/` to keep the adapter vocabulary uniform and the ArchUnit allowed-set clean;
`internal/` is the Modulith-idiomatic alternative — settle this once.)*

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
All four published surfaces are **optional**: `payout` (pure event subscriber) has none; `booking`
has `events/` + `vocabulary/` but **no `api/` at all** (it publishes no ports); only `venue` has
`spi` today. **Don't force an empty surface** onto a module that doesn't publish that kind.

How this maps to real code:

- **The published surfaces (`api/`, `vocabulary/`, `events/`, `spi/`) are the only thing other modules
  may import — and each holds one kind.** `api/` holds the published **ports** (`venue.api.VenueCatalog`,
  `availability.api.AvailabilityClaim`, `customer.api.CustomerDirectory`, `payment.api.CheckoutPort`);
  `vocabulary/` the **typed ids** (`venue.vocabulary.SetId`), **value records**
  (`payment.vocabulary.Money`) and **sealed outcome hierarchies** (`payment.vocabulary.RefundResult`);
  `events/` the **published event records** (`booking.events.BookingConfirmed`).
  `PublishedSurfacePlacementArchitectureTests` enforces the placement. **Name ports by purpose, never
  technology** — the weather-system lesson (*"architect the system's interfaces by purpose rather than
  by technology"*). `CheckoutPort`, not `StripePort`; `AvailabilityClaim`, not `JdbcAvailabilityTable`.
  The technology is the adapter's concern in `adapter/out`; the port name must survive swapping it.
- **`application/` holds the services AND their ports together** — the internal driving/use-case ports
  (e.g. `CreateBooking`, implemented by package-private `CreateBookingService`) and the outbound driven
  ports (e.g. `Bookings`, `BookingCodeGenerator`). **No `in`/`out` sub-split:** once the *adapter* layer
  carries direction (`adapter/in` vs `adapter/out`), the port interfaces don't need to. The repository
  port stays an interface in `application/`, implemented by `adapter/out` — the inversion is real (it
  enables fakes in tests); it just doesn't need its own package to prove it. A port graduates to `api/`
  only when another module must call it; to `spi/` only for a cross-module inversion.
- **`domain/` is internal** — enums/value objects/aggregates/policies (`booking.domain.BookingStatus`,
  `RefundPolicy`). For `booking`, keep `domain/` **flat and shared** across the use-case slices.
- **`adapter/in` / `adapter/out` are internal adapters** — controllers + listeners (driving) and
  `JdbcClient` repositories + gateways (driven), all package-private (`JdbcVenueCatalog`, `JdbcBookings`,
  `BookingController`, `PaymentEventListener`). Direction is a **package fact** here — the enforceable
  hexagon boundary and the driving/driven distinction made visible. Both a `@RestController` and an
  `@ApplicationModuleListener` are *driving* adapters and both live in `adapter/in` (they'd wrongly
  split under a technology spelling). If you ever need the technology axis, it's a *sub*-package
  (`adapter/in/rest`, `adapter/in/event`); the primary split stays **direction**.

Keep `@SpringBootApplication` (`PlatformApplication`) in the root package only; never put shared domain
types there. App-wide config (`SecurityConfig`, `WebCorsConfig`, `TimeConfig`) also lives in the root
and is not a module.

> **`booking` is the one module sliced by use-case.** It has 8 services — past a readable flat
> `application/`. Group them: `application/reserve/` (reserve + confirm + claim/release),
> `application/cancel/` (cancel + policy + cutoff), `application/refund/` (weather refund + abandoned
> sweep), `application/view/` (read side). The outbound `Bookings` port stays at `application/` root,
> shared by the slices. **No other module is sliced** — none has the mass. Structure tracks weight.

> **A port is a purposeful conversation, not one-interface-per-use-case.** Cockburn's 2005
> ports-and-adapters article: *"A port identifies a purposeful conversation"* and favors *"a small
> number, two, three or four ports."* A module's `api/` exposes a *few* intent-named ports
> (`AvailabilityClaim`, `VenueCatalog`, `CheckoutPort`), not one per method. Tempted by a fifth narrow
> port? Ask whether it's the same conversation as an existing one.

## Declaring boundaries

Each module declares a display name **and an explicit `allowedDependencies` deny-list** —
this is **already true of every module in `main`** (`booking`, `availability`, `payout`,
`venue`, `payment`, `customer` all set it), not a future tightening. Keep it that way:

```java
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    allowedDependencies = { "booking::events", "booking::vocabulary", "venue::api", "venue::vocabulary",
        "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.payout;
```

Grants name the **narrowest named interfaces** the consumer's bytecode actually needs (issue #95's
least-privilege matrix): a port caller lists `<provider>::api` + `::vocabulary` (the types the port
speaks); a listener-only consumer lists `<provider>::events` + `::vocabulary` — never a command
surface (`payout` above is the canonical example).

and each module exposes its `api/` (and `spi/` where present):

```java
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
```

**`allowedDependencies` must list every module the code legitimately uses or `verify()`
fails** — so when you add a genuinely new, non-cyclic dependency, add it to the list in the
same change and run `ModularityTests` immediately. A failure is the design being wrong (an
unintended coupling), not the test being fussy. **Never** widen the list to silence a
`verify()` failure without understanding the new edge.

> **New module (e.g. `operator`, see below) must declare its deny-list from creation** —
> don't ship a module with no `allowedDependencies` and "tighten later." Deny-by-default is
> the standard here.

## `api` vs `spi`: inbound ports vs cross-module driven ports

A module's `api/` (`@NamedInterface("api")`) is its **inbound / driving** surface — interfaces
other modules **call** (`VenueCatalog`, `AvailabilityClaim`). The caller depends on the provider;
call direction == dependency direction. **This is the default — reach for it first.**

A module's **driven / outbound** port normally stays **internal** in `application/` (alongside its
service), implemented by the module's *own* `adapter/out` adapter — it is *not* published. Promote a driven port to
a published named interface **only** when its adapter must live in **another module** — i.e. a
cross-module **dependency inversion**, done to keep the graph acyclic. When you do, put it in a
dedicated **`spi`** named interface (`<module>.spi`, `@NamedInterface("spi")`), **never** in `api/`:

- `api/` answers *"what others call me to do"* (inbound / driving).
- `spi/` answers *"what I need another module to implement for me"* (driven / inverted).

**Grant the named interfaces per least privilege:** the **implementing** module lists
`<provider>::spi` (plus `<provider>::api` if it also calls it); a module that only *calls* the
provider lists `<provider>::api` only — never `::spi`.

**Worked example — the `venue ↔ availability` live-map read (issue #44).** `venue` needs "which of
these sets are taken on date D?" but must not depend on `availability` (that would cycle —
`availability` already depends on `venue::api` for the claim's pool check). So `venue` declares the
driven port `SetAvailabilityLookup` in **`venue.spi`**; `availability` **implements** it (its
`allowedDependencies` are `{ "venue::api", "venue::spi" }` — `api` for `SetId`, `spi` for the port);
`venue`'s `JdbcVenueCatalog` calls it. The compile-time edge stays `availability → venue`
(acyclic); the runtime call goes `venue → availability`. `booking`, which only *calls* venue, is
granted `venue::api` only — never `venue::spi`. (`SetId` and the other shared vocabulary live in
`venue.vocabulary` since issue #95; only the *driven port* lives in `spi/`.)

**Decision rule.** Inbound port (others call) → `api`. Driven port implemented in-module →
`application/` (internal, unpublished). Driven port implemented by **another** module → `spi`. If
you're tempted to put an "implement-me" interface in `api/`, that is exactly the smell this rule
fixes — `riviera-review-overlay` (RV-BE-3b) flags it at the review gate.

## The published-surface split (landed, issue #95): ports vs vocabulary vs events

`api/` started as "the published surface" and was accumulating **three different kinds of thing**:
(1) **ports** ("call-me" interfaces), (2) **published vocabulary** (typed ids, value records —
`SetId`, `Money`), and (3) **published domain events** (`BookingConfirmed`). Issue #95 split them
into the distinct named interfaces described in the layout above, and both halves of the drift-fix
are now **build failures**, not review judgment calls:

- **A wide port splits by consumer role** (issue #94): `VenueCatalog` (tourist reads),
  `SetBookingFacts` (`setBookingInfo`/`poolOf`), `VenueRates`
  (`commissionBps`/`lateCancelRefundBps`) — pinned by `VenueApiRoleSplitTests`. **Do not** pile new
  methods onto `VenueCatalog`; add to the role-named interface instead.
- **Kinds live in their surface** (issue #95): ports in `api/`/`spi/` (plain interfaces only),
  ids/values/sealed outcomes in `vocabulary/`, event records in `events/` — pinned by
  `PublishedSurfacePlacementArchitectureTests` (which also checks every cross-module
  `@ApplicationModuleListener` parameter resides in its owner's `events` surface).
  `riviera-review-overlay` RV-BE-3c verifies the rule stays green and judges the cases the
  convention can't (e.g. whether a new type is genuinely vocabulary).

When adding to a published surface, grant consumers the narrower named interfaces (least privilege)
and keep `ModularityTests` green. A moved **event class changes its persisted FQCN** in the Event
Publication Registry (`event_publication[_archive].event_type`) — ship a Flyway rewrite like
`V18__event_publication_event_type_moves.sql` with any future event move.

## The `operator` module (per-venue authorization)

Multi-operator launch requires per-venue ownership: every venue-scoped operation must verify the
**authenticated operator owns the path `venueId`** (today the code authorizes on a single shared
`OPERATOR` role with **no** ownership check — the launch blocker). This ownership concept needs a
home, and it is **not** `venue` (layout/pricing/pools) and **not** `customer` (tourist
guest-checkout). Introduce a dedicated **`operator`** (or `identity`) module:

- Owns operator accounts and the **operator↔venue ownership mapping**.
- Publishes a minimal `operator::api` query port — e.g. `OwnsVenue(operatorId, venueId) → boolean`
  or `ownedVenues(operatorId) → Set<VenueId>` (id-based, invariant #11).
- The ownership check is enforced in the **application service** of each venue-scoped command/query
  (so no adapter can bypass it), returning `403` on mismatch — **not** in the controller alone.
  Platform-wide admin (`/api/admin/**`) stays role-gated.
- Declares its `allowedDependencies` from creation; venue-scoped modules that consult it add
  `operator::api` to their deny-list.
- Optional defence-in-depth: PostgreSQL Row-Level Security keyed on the operator's venue set.

`riviera-review-overlay` gains a Blocker bank item for any venue-scoped surface whose `venueId`
isn't checked against the operator's owned venues.

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

- **`references/persistence-jdbc.md`** — before touching `adapter/out`, a repository, an
  aggregate, or a migration. **`JdbcClient` + explicit SQL is the default here**; a Spring Data JDBC
  aggregate is the *exception* (only when a row cluster is one consistency unit). The JPA
  anti-patterns to refuse. (Pairs with `riviera-java-conventions` §1/§1a and `postgres`.)
- **`references/events.md`** — before adding a cross-module event (U5+). `@ApplicationModuleListener`,
  id-only payloads in `api/`, the Event Publication Registry on `spring-modulith-starter-jdbc`.
- **`references/testing.md`** — before writing module tests. `@ApplicationModuleTest`, the `Scenario`
  DSL, `PublishedEvents`/`AssertablePublishedEvents`, and `Documenter`, alongside our Testcontainers
  IT style.

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

## Integration

- **`CLAUDE.md`** — invariants #11 (boundaries) and #1 (JDBC-only) this skill makes concrete.
- **`riviera-java-conventions`** — Java idioms behind the structure (records, sealed outcomes,
  package-private adapters, JdbcClient-vs-aggregate). **`codebase-design`** — whether a seam is real.
  **`postgres`** — the SQL/schema. **`riviera-stripe-payments`** — payment/payout module structure.
- **`riviera-sdlc`** — loads this at the Skill-routing gate for any backend create/modify;
  **`riviera-review-overlay`** — RV-BE checks boundaries on the diff; RV-PROC-1 checks this skill is
  in the plan's *Skills consulted* line when backend structure changed.
