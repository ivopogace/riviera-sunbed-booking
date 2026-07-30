package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The bounds of the refund bulkhead, and the guard that a typo cannot quietly remove one (#404 AC-8).
 *
 * <p>Every rejected value here is one that would otherwise <strong>boot clean and report healthy</strong>
 * while dismantling the pool — which is the only reason a guard is worth writing. A non-positive
 * {@code queue-capacity} makes {@code ThreadPoolTaskExecutor.createQueue} return a
 * {@link java.util.concurrent.SynchronousQueue}, so every refund that cannot be handed straight to a
 * free worker is shed; an oversized one restores the unbounded queue this slice removes, with the shed
 * counter pinned at zero while the heap fills. A huge {@code pool-size} creates its threads lazily, so
 * it fails later as an {@code OutOfMemoryError} thrown from {@code execute()} — on the commit thread the
 * shed handler exists to keep exceptions off. And the drain window has a floor because it must cover one
 * gateway round-trip, and a ceiling because a drain outlasting the platform's SIGTERM grace gets the
 * process killed mid-close.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated} + {@code @Min}: Boot
 * validates {@code @ConfigurationProperties} only when a JSR-303 implementation is on the classpath and
 * #97 declined {@code spring-boot-starter-validation} in favour of explicit checks in records, so an
 * annotation would bind and validate nothing.
 */
class RefundExecutorPropertiesTest {

	private RefundExecutorProperties bind(Map<String, Object> props) {
		MockEnvironment env = new MockEnvironment();
		props.forEach(env::setProperty);
		Binder binder = new Binder(ConfigurationPropertySources.get(env));
		return binder.bind("riviera.booking.refund", RefundExecutorProperties.class)
				.orElseGet(() -> new RefundExecutorProperties(null, null, null));
	}

	@Test
	void defaultsReproduceTheShippedBounds() {
		RefundExecutorProperties props = bind(Map.of());

		assertEquals(RefundExecutorProperties.DEFAULT_POOL_SIZE, props.poolSize());
		assertEquals(RefundExecutorProperties.DEFAULT_QUEUE_CAPACITY, props.queueCapacity());
		assertEquals(RefundExecutorProperties.DEFAULT_SHUTDOWN_DRAIN, props.shutdownDrain());
	}

	@Test
	void theEnvironmentOverridesEveryBound() {
		RefundExecutorProperties props = bind(Map.of(
				"riviera.booking.refund.pool-size", "8",
				"riviera.booking.refund.queue-capacity", "1000",
				"riviera.booking.refund.shutdown-drain", "PT45S"));

		assertEquals(8, props.poolSize());
		assertEquals(1000, props.queueCapacity());
		assertEquals(Duration.ofSeconds(45), props.shutdownDrain());
	}

	@Test
	void rejectsANonPositivePoolSize() {
		IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(0, null, null));

		assertTrue(thrown.getMessage().contains("riviera.booking.refund.pool-size"),
				"the message must name the property an operator has to fix");
	}

	@Test
	void rejectsAnOversizedPoolSize() {
		assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(RefundExecutorProperties.MAX_POOL_SIZE + 1, null, null));
	}

	@Test
	void rejectsANonPositiveQueueCapacity() {
		IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(null, 0, null));

		assertTrue(thrown.getMessage().contains("SynchronousQueue"),
				"0 reads as 'unbounded' to a human and means 'capacity zero' to Spring — the message "
						+ "has to close that gap, because the value boots clean either way");
	}

	@Test
	void rejectsAnOversizedQueueCapacity() {
		assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(null, RefundExecutorProperties.MAX_QUEUE_CAPACITY + 1, null));
	}

	@Test
	void rejectsADrainShorterThanOneGatewayRoundTrip() {
		IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(null, null, Duration.ofMillis(500)));

		assertTrue(thrown.getMessage().contains("riviera.booking.refund.shutdown-drain"));
	}

	@Test
	void rejectsADrainThatWouldOutlastTheShutdownGrace() {
		assertThrows(IllegalArgumentException.class,
				() -> new RefundExecutorProperties(null, null,
						RefundExecutorProperties.MAX_SHUTDOWN_DRAIN.plusSeconds(1)));
	}
}
