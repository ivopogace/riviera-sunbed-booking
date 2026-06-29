# Testing & documentation (Modulith)

Spring Modulith adds three things over plain Spring Boot tests: the structural contract,
module-scoped bootstrap, and an async-event DSL. Our DB-touching tests run on **Testcontainers
Postgres** (`@SpringBootTest` + `@Import(TestcontainersConfiguration.class)` +
`@EnabledIfDockerAvailable`); the structural test needs neither Spring nor Docker.

Dependency (already present): `testImplementation "org.springframework.modulith:spring-modulith-starter-test"`,
versions via the `spring-modulith-bom`.

## The structural test (the contract — already exists)

`ai.riviera.platform.ModularityTests` is the one test that defines "correct structure." Keep it
green; never weaken it to make a change pass.

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

`@ApplicationModuleTest` bootstraps only the module the test sits in (place the class in the module
package), so a failure points at one module instead of the whole app. Use it for module-internal
wiring; for the highest-stakes DB invariants we still use full `@SpringBootTest` Testcontainers ITs
(e.g. `ConcurrentReservationIT` proving invariant #2 against real Postgres).

```java
package ai.riviera.platform.booking;   // test sits in the module package

@ApplicationModuleTest                  // add @Import(TestcontainersConfiguration.class) + @EnabledIfDockerAvailable if it needs the DB
class BookingModuleTests {
    @Autowired CreateBooking createBooking;        // an inbound port of this module
    @MockitoBean CheckoutPort checkout;            // stub an api/ collaborator — note @MockitoBean, NOT @MockBean
}
```

Bootstrap modes: `@ApplicationModuleTest(mode = STANDALONE | DIRECT_DEPENDENCIES | ALL_DEPENDENCIES)`.
Prefer the narrowest that works — needing `ALL_DEPENDENCIES` signals excess coupling (prefer events).
Per project convention (`riviera-java-conventions` §9) don't mock what you can test for real cheaply;
reserve doubles for true seams.

## Verifying published events (U5+)

Inject `PublishedEvents` / `AssertablePublishedEvents` and match on the **typed id** the payload
carries (which is all it should carry):

```java
@Test
void publishesBookingConfirmed(AssertablePublishedEvents events) {
    var outcome = createBooking.create(command());
    assertThat(events)
        .contains(BookingConfirmed.class)
        .matching(BookingConfirmed::bookingId, expectedId);
}
```

### Synchronous events — plain Spring `@RecordApplicationEvents` (the U4 variant)

`PublishedEvents`/`Scenario` are Spring Modulith helpers oriented at the **async** registry path. For
a **synchronous `@EventListener`** seam (U4's `payment` → `booking`), the event is published on the
test thread inside the request, so plain-Spring `@RecordApplicationEvents` + `ApplicationEvents` is the
simplest assertion — no Modulith wiring needed. This is what `StripeWebhookIT` does:

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

To prove the listener's **effect** end-to-end (not just that the event fired), publish the event
directly and assert the DB transition — see `PaymentEventListenerIT` (`publisher.publishEvent(new
PaymentConfirmed(...))` → booking row `CONFIRMED`; `PaymentCanceled` → `CANCELLED` + claim released).

## Scenario DSL (async flows — the event spine)

`Scenario` is a fluent stimulus → async-outcome DSL; inject it as a test-method parameter. Ideal for
asserting the U5 spine (confirm → availability marked / payout accrued).

```java
@Test
void confirmingBookingMarksAvailability(Scenario scenario) {
    scenario.stimulate(() -> createBooking.create(command()))
        .andWaitForEventOfType(BookingConfirmed.class)
        .matchingMappedValue(BookingConfirmed::setId, expectedSetId)
        .toArriveAndVerify(ev -> assertThat(ev.bookingDate()).isEqualTo(date));
}
```

**Known footgun:** the `andWaitForEventOfType(...)` form may need the class to carry `@SpringBootTest`
**and** `@EnableScenarios` for event-completion wiring (`@EnableScenarios` is easy to miss). If a wait
hangs, add it; bound waits with `andWaitAtMost(Duration)`.

## Documentation generation (optional, useful at review)

`Documenter` renders the module arrangement (PlantUML, the per-module canvas, the event catalog) to
`build/`. Run from a test to make boundary drift visible in review:

```java
@Test
void writeDocumentation() {
    new Documenter(ApplicationModules.of(PlatformApplication.class))
        .writeDocumentation()
        .writeIndividualModulesAsPlantUml();
}
```

## Optional: enforce hexagonal layering

Modulith integrates with jMolecules ArchUnit rules to enforce inbound/outbound/domain layering (not
just module boundaries). Adopt once package layering is stable:

```java
var hexagonal = JMoleculesArchitectureRules.ensureHexagonal(VerificationDepth.STRICT);
ApplicationModules.of(PlatformApplication.class)
    .verify(VerificationOptions.defaults().withAdditionalVerifications(hexagonal));
```
