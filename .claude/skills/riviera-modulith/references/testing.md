# Testing & documentation (Modulith)

Spring Modulith adds three things over plain Spring Boot tests: the structural contract,
module-scoped bootstrap, and an async-event DSL. DB-touching tests run on Testcontainers
Postgres (`@SpringBootTest` + `@Import(TestcontainersConfiguration.class)` +
`@EnabledIfDockerAvailable`); the structural test needs neither Spring nor Docker.
Dependency (present): `testImplementation "org.springframework.modulith:spring-modulith-starter-test"`.

## The structural test (the contract)

`ai.riviera.platform.ModularityTests` defines "correct structure." Keep it green; never
weaken it to make a change pass. Pure structural analysis — no Spring context, no DB. When
it fails, read the message literally and fix the structure, not the test.

```java
class ModularityTests {
    static final ApplicationModules modules = ApplicationModules.of(PlatformApplication.class);

    @Test
    void verifiesModularStructure() {
        modules.verify();   // throws on cycles, internal access, or disallowed dependencies
    }
}
```

Debug the detected arrangement with `modules.forEach(System.out::println)`. Run it alone:
`./gradlew test --tests "*ModularityTests*"`.

## Module-scoped integration tests (`@ApplicationModuleTest`)

`@ApplicationModuleTest` bootstraps only the module the test sits in (place the class in
the module package). Use it for module-internal wiring; for the highest-stakes DB
invariants use full `@SpringBootTest` Testcontainers ITs (`ConcurrentReservationIT` proving
invariant #2 against real Postgres).

```java
package ai.riviera.platform.booking;   // test sits in the module package

@ApplicationModuleTest                  // add @Import(TestcontainersConfiguration.class) + @EnabledIfDockerAvailable if it needs the DB
class BookingModuleTests {
    @Autowired CreateBooking createBooking;        // an inbound port of this module
    @MockitoBean CheckoutPort checkout;            // stub an api/ collaborator — @MockitoBean, NOT @MockBean
}
```

Bootstrap modes: `@ApplicationModuleTest(mode = STANDALONE | DIRECT_DEPENDENCIES |
ALL_DEPENDENCIES)`. Prefer the narrowest that works — needing `ALL_DEPENDENCIES` signals
excess coupling. Don't mock what you can test for real cheaply (`riviera-java-conventions` §9).

## Verifying published events

Inject `PublishedEvents` / `AssertablePublishedEvents` and match on the typed id:

```java
@Test
void publishesBookingConfirmed(AssertablePublishedEvents events) {
    var outcome = createBooking.create(command());
    assertThat(events)
        .contains(BookingConfirmed.class)
        .matching(BookingConfirmed::bookingId, expectedId);
}
```

### Synchronous events — plain Spring `@RecordApplicationEvents`

`PublishedEvents`/`Scenario` target the async registry path. For a synchronous
`@EventListener` seam (`payment` → `booking`), the event is published on the test thread
inside the request, so plain-Spring `@RecordApplicationEvents` + `ApplicationEvents` is the
simplest assertion (`StripeWebhookIT`):

```java
@SpringBootTest
@AutoConfigureMockMvc
@RecordApplicationEvents
class StripeWebhookIT {
    @Autowired ApplicationEvents events;

    @Test
    void verifiedSucceededPublishesConfirmation() throws Exception {
        // ... POST a signed payment_intent.succeeded ...
        assertEquals(1, events.stream(PaymentConfirmed.class)
                .filter(e -> e.bookingRef().equals(new BookingRef(7001L))).count());
    }
}
```

To prove the listener's effect end-to-end, publish the event directly and assert the DB
transition — `PaymentEventListenerIT` (`publisher.publishEvent(new PaymentConfirmed(...))`
→ booking row `CONFIRMED`; `PaymentCanceled` → `CANCELLED` + claim released).

## Scenario DSL (async flows — the event spine)

`Scenario` is a fluent stimulus → async-outcome DSL; inject it as a test-method parameter.

```java
@Test
void confirmingBookingAccruesPayout(Scenario scenario) {
    scenario.stimulate(() -> confirmBooking.confirm(command()))
        .andWaitForEventOfType(BookingConfirmed.class)
        .matchingMappedValue(BookingConfirmed::venueId, expectedVenueId)
        .toArriveAndVerify(ev -> assertThat(ledger.entriesFor(ev.venueId())).hasSize(1));
}
```

Footgun: `andWaitForEventOfType(...)` may need the class to carry `@SpringBootTest` and
`@EnableScenarios` for event-completion wiring. If a wait hangs, add it; bound waits with
`andWaitAtMost(Duration)`.

## Documentation generation (optional, useful at review)

`Documenter` renders the module arrangement (PlantUML, the per-module canvas, the event
catalog) to `build/`:

```java
@Test
void writeDocumentation() {
    new Documenter(ApplicationModules.of(PlatformApplication.class))
        .writeDocumentation()
        .writeIndividualModulesAsPlantUml();
}
```

## Hexagonal layering is already enforced

`PackageShapeArchitectureTests` (Assertion 4) enforces the hexagon's dependency direction
on top of `ModularityTests`' module boundaries; no jMolecules adoption needed.
