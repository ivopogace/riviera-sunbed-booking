# Declaring boundaries — `@ApplicationModule`, grants, and `api` vs `spi`

Everything here is enforced by `ApplicationModules.verify()` (`ai.riviera.platform.ModularityTests`).

## Declaring a module

Each module declares a display name and an explicit `allowedDependencies` list (true of
all nine domain modules and of the three non-context ones; keep it that way):

```java
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    allowedDependencies = { "booking::api", "booking::events", "booking::vocabulary",
        "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.payout;
```

and each module exposes its published surfaces (`api/`, and `spi/` where present):

```java
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.booking.api;
```

## The least-privilege grant matrix

Grants name the narrowest named interfaces the consumer's bytecode actually needs:

- A **port caller** lists `<provider>::api` + `::vocabulary` (the types the port speaks).
- A **listener-only consumer** lists `<provider>::events` + `::vocabulary` — never a
  command surface.
- The **implementing** module of a driven port lists `<provider>::spi` (plus
  `<provider>::api` if it also calls it); a module that only calls the provider lists
  `<provider>::api` only — never `::spi`.

`allowedDependencies` must list every module the code legitimately uses or `verify()`
fails — when adding a genuinely new, non-cyclic dependency, add it to the list in the same
change and run `ModularityTests`. A failure is the design being wrong (an unintended
coupling), not the test being fussy; never widen the list to silence it without
understanding the new edge. A new module declares its list from creation — deny-by-default.

## `api` vs `spi`: inbound ports vs cross-module driven ports

A module's `api/` (`@NamedInterface("api")`) is its inbound / driving surface — interfaces
other modules call (`VenueCatalog`, `AvailabilityClaim`). Call direction == dependency
direction. This is the default.

A module's driven / outbound port normally stays internal in `application/` (alongside its
service), implemented by the module's own `adapter/out` — not published. Promote a driven
port to a published named interface only when its adapter must live in another module (a
cross-module dependency inversion, done to keep the graph acyclic). Then put it in `spi`
(`<module>.spi`, `@NamedInterface("spi")`), never in `api/`:

- `api/` answers *"what others call me to do"* (inbound / driving).
- `spi/` answers *"what I need another module to implement for me"* (driven / inverted).

**Worked example — the `venue ↔ availability` live-map read.** `venue` needs "which of
these sets are taken on date D?" but must not depend on `availability` (that would cycle —
`availability` already depends on `venue::api` for the claim's pool check). So `venue`
declares the driven port `SetAvailabilityLookup` in `venue.spi`; `availability` implements
it (its grants include `venue::spi`, plus `venue::api`/`venue::vocabulary` for the ports and
ids it uses); `venue`'s `JdbcVenueCatalog` calls it. The compile-time edge stays
`availability → venue` (acyclic); the runtime call goes `venue → availability`. `booking`,
which only calls venue, is granted `venue::api` only. `SetId` and the other shared
vocabulary live in `venue.vocabulary`; only the driven port lives in `spi/`.

**Decision rule.** Inbound port (others call) → `api`. Driven port implemented in-module →
`application/` (internal). Driven port implemented by another module → `spi`. An
"implement-me" interface in `api/` is what `riviera-review-overlay` RV-BE-3b flags.
