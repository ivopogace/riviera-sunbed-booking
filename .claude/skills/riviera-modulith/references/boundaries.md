# Declaring boundaries — `@ApplicationModule`, grants, `api` vs `spi`

Enforced by `ApplicationModules.verify()` (`ModularityTests`). Every module's
`package-info.java` declares an explicit `allowedDependencies` list (deny-by-default); read a
sibling's for the shape. Grants name the narrowest interfaces the bytecode uses: a port caller
`<provider>::api` + `::vocabulary`; a listener-only consumer `::events` + `::vocabulary`; the
implementor of a driven port `<provider>::spi` (plus `::api` if it also calls it). A `verify()`
failure means the design has an unintended edge — never widen the list without understanding
it.

**api vs spi.** `api/` = inbound, "what others call me to do" (call direction == dependency
direction; the default). A driven port normally stays internal in `application/`,
implemented by the module's own `adapter/out`. Only when its adapter must live in another
module (a dependency inversion to keep the graph acyclic) is it published, in `spi/`, never
`api/`.

**Worked example.** `venue` needs "which sets are taken on date D?" but cannot depend on
`availability` (which already depends on `venue::api`). So `venue` declares
`SetAvailabilityLookup` in `venue.spi`; `availability` implements it (granted `venue::spi` +
`venue::api` + `venue::vocabulary`); `venue`'s `JdbcVenueCatalog` calls it. Compile-time edge
`availability → venue`, runtime call `venue → availability`. `payout`, which only calls
venue, gets `venue::api` + `::vocabulary`.
