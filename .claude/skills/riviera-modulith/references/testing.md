# Testing (Modulith)

DB-touching tests: `@SpringBootTest` + `@Import(TestcontainersConfiguration.class)` +
`@EnabledIfDockerAvailable`. Dependency: `spring-modulith-starter-test`.

## Structural test

```java
class ModularityTests {
    static final ApplicationModules modules = ApplicationModules.of(PlatformApplication.class);

    @Test
    void verifiesModularStructure() {
        modules.verify();   // cycles, internal access, disallowed dependencies
    }
}
```

No Spring context, no DB. Never weaken it. Debug the arrangement with
`modules.forEach(System.out::println)`. `PackageShapeArchitectureTests` adds the hexagon's
dependency direction on top; don't add jMolecules.

## `@ApplicationModuleTest`

Bootstraps only the module the test sits in (place the class in the module package). Use for
module-internal wiring; the highest-stakes DB invariants get full `@SpringBootTest` ITs
(`ConcurrentReservationIT` for #2).

```java
package ai.riviera.platform.booking;

@ApplicationModuleTest                  // + Testcontainers annotations if it needs the DB
class BookingModuleTests {
    @Autowired CreateBooking createBooking;
    @MockitoBean CheckoutPort checkout;            // @MockitoBean, NOT @MockBean
}
```

Modes: `STANDALONE | DIRECT_DEPENDENCIES | ALL_DEPENDENCIES` — prefer the narrowest; needing
`ALL_DEPENDENCIES` signals excess coupling.

## Published events

Async path: inject `AssertablePublishedEvents` and match on the typed id
(`assertThat(events).contains(BookingConfirmed.class).matching(BookingConfirmed::bookingId, expectedId)`),
or the `Scenario` DSL:

```java
@Test
void confirmingBookingAccruesPayout(Scenario scenario) {
    scenario.stimulate(() -> confirmBooking.confirm(command()))
        .andWaitForEventOfType(BookingConfirmed.class)
        .matchingMappedValue(BookingConfirmed::venueId, expectedVenueId)
        .toArriveAndVerify(ev -> assertThat(ledger.entriesFor(ev.venueId())).hasSize(1));
}
```

If a wait hangs, the class may need `@SpringBootTest` + `@EnableScenarios`; bound waits with
`andWaitAtMost(Duration)`.

Synchronous `@EventListener` seam (`payment` → `booking`): plain-Spring
`@RecordApplicationEvents` + `ApplicationEvents` (`StripeWebhookIT`); to prove the listener's
effect, publish the event directly and assert the DB transition (`PaymentEventListenerIT`).

`Documenter` (`new Documenter(modules).writeDocumentation()`) renders the arrangement to
`build/` when a review wants the picture.
