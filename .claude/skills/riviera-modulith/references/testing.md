# Testing (Modulith)

DB-touching tests: `@SpringBootTest` + `@Import(TestcontainersConfiguration.class)` +
`@EnabledIfDockerAvailable`.

## Structural tests

`ModularityTests` (`verify()`: cycles, internal access, disallowed dependencies) runs with no
Spring context and no DB; never weaken it. `PackageShapeArchitectureTests` adds the hexagon's
dependency direction on top; don't add jMolecules.

## `@ApplicationModuleTest`

Bootstraps the module the test sits in plus the root package's beans (place the class in the
module package), so every module port the root edge injects needs a `@MockitoBean`
(`PayoutModuleTest`; `riviera-local-debug` § *Blast radius*). Use for module-internal wiring;
the highest-stakes DB invariants get full `@SpringBootTest` ITs (`ConcurrentReservationIT` for
#2). `@MockitoBean`, never `@MockBean`. Prefer the narrowest bootstrap mode; needing
`ALL_DEPENDENCIES` signals excess coupling.

## Published events

An async listener's effect: the `Scenario` DSL under `@SpringBootTest` + `@EnableScenarios`,
`scenario.publish(...)` then wait for the DB transition, bounded with `andWaitAtMost(Duration)`
(`PaymentEventListenerIT`). A publication alone: `@RecordApplicationEvents` +
`ApplicationEvents` (`StripeWebhookIT`).
