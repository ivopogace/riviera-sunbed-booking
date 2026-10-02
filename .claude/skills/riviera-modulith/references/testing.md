# Testing (Modulith)

DB-touching tests carry `@Import(TestcontainersConfiguration.class)` + `@EnabledIfDockerAvailable`.
**A module-internal IT is an `@ApplicationModuleTest`** (below). `@SpringBootTest` is for what one
module cannot show: a flow that must cross a real port of another module (`ReviewSubmitFlowIT`), the
`web` chain (security, CSRF, role gates), whole-context wiring (`SharedTaskExecutorUndecoratedIT`) and
the highest-stakes invariants (`ConcurrentReservationIT` for #2). ITs sharing a cached context share
its container's database, so a literal a `UNIQUE` column holds (a refund id, a `BookingRef(99xx)`)
is a key across those classes: keep it class-unique. A one-class run misses the collision; run the
module's DB-backed ITs together.

## Structural tests

`ModularityTests` (`verify()`: cycles, internal access, disallowed dependencies) runs with no
Spring context and no DB; never weaken it. `PackageShapeArchitectureTests` adds the hexagon's
dependency direction, root types only in a registered shared module, `@NamedInterface` on every
published surface and an explicit `allowedDependencies` on every module; don't add jMolecules (package-name rules do it without annotations).

## `@ApplicationModuleTest`

Bootstraps the module the test sits in plus the root package's beans and the registered `shared`
module (place the class in the module package). The root holds only configuration, so STANDALONE (the
default) needs no root stub: mock exactly the other modules' ports the bootstrapped beans inject, with
`@MockitoBean`, never `@MockBean` (`PayoutModuleTest`; `riviera-local-debug` § *Blast radius*). Mock
rather than widen the mode, as the Modulith reference advises; needing `DIRECT_DEPENDENCIES` or
`ALL_DEPENDENCIES`, or a long mock list, signals coupling an event could replace. It enables the
`Scenario` DSL without `@EnableScenarios`.

## Published events

An async listener's effect: the `Scenario` DSL, `scenario.publish(...)` then wait for the DB
transition, bounded with `andWaitAtMost(Duration)`: under `@ApplicationModuleTest` for one module's
listener (`PayoutModuleTest`), under `@SpringBootTest` + `@EnableScenarios` when the flow crosses
modules (`PaymentEventListenerIT`). A publication alone: `@RecordApplicationEvents` +
`ApplicationEvents` (`StripeWebhookIT`).
